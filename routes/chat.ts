// 📁 File: routes/chat.ts
import express = require('express');
const router = express.Router();
import { ObjectId } from 'mongodb';
import { getDB } from '../database/db';
import { IFileAttachment } from '../types/type';
import { uploadMiddleware } from '../middleware/upload';
import jwt from 'jsonwebtoken';

/**
 * Validates database states and auto-heals essential tables if dropped.
 */
const ensureCollectionsExist = async (db: any) => {
  try {
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map((c: any) => c.name);

    if (!collectionNames.includes('chat')) {
      await db.createCollection('chat');
      console.log("🛠️ Database Auto-Heal: 'chat' collection was missing and has been generated.");
    }

    if (!collectionNames.includes('conversations')) {
      await db.createCollection('conversations');
      console.log("🛠️ Database Auto-Heal: 'conversations' collection was missing and has been generated.");
    }
  } catch (err) {
    console.error("Warning auto-healing collections:", err);
  }
};

/**
 * Inline Request Validation Interceptor
 * Authenticates incoming requests, decodes payloads safely, 
 * and maps identity fields to the downstream context pipeline.
 */
const verifyTokenInline = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Access denied: Authentication token is missing.' });
  }

  try {
    const parts = authHeader.split(' ');
    const token = parts[1];
    
    if (!token) {
      return res.status(401).json({ message: 'Access denied: Token string segment missing.' });
    }

    // 🚀 FIX: Fallback validation prevents crash if environment arrays load out of order
    const secretKey = (process.env.JWT_SECRET || 'fallback_dev_secret_key_change_me').trim();
    const decoded = jwt.verify(token, secretKey) as any;
    
    // 🚀 FIX: Polymorphic user ID lookup mapping prevents undefined assignment exceptions
    const resolvedUserId = decoded.id || decoded._id || decoded.userId;

    if (!resolvedUserId) {
      console.error("❌ Token signature match success, but context property mappings are empty.");
      return res.status(401).json({ message: 'Access denied: Token lacks structural context variables.' });
    }

    req.user = {
      id: resolvedUserId.toString(),
      name: decoded.name || decoded.fullName || 'Authenticated User',
      role: decoded.role || 'user'
    };
    
    next();
  } catch (err: any) {
    console.error("🚨 JWT Verification Exception on Express Backend:", err.message);
    return res.status(401).json({ message: 'Access denied: Session key has expired or is invalid.' });
  }
};

// 📡 SECURE CHANNELS AGGREGATION ROUTE
router.get('/channels', verifyTokenInline, async (req: any, res: any): Promise<any> => {
  try {
    const db = getDB();
    const userIdString = req.user?.id;
    
    if (!userIdString) {
      return res.status(401).json({ message: "Invalid token payload structure." });
    }

    const currentUserId = new ObjectId(userIdString);

    const conversations = await db.collection('conversations')
      .find({ participants: currentUserId })
      .sort({ updatedAt: -1 })
      .toArray();

    const formattedChannels = conversations.map(conv => {
      const partnerId = conv.participants.find((id: any) => id.toString() !== userIdString);

      return {
        _id: conv._id.toString(),
        type: conv.contextType || 'all',
        currentStatusState: 'active',
        initiator: { id: userIdString, name: req.user.name || 'Current User' },
        recipient: { id: partnerId ? partnerId.toString() : 'unknown', name: 'Chat Partner' },
        messages: [] 
      };
    });

    return res.status(200).json(formattedChannels);
  } catch (err: any) {
    console.error("🚨 Internal Channels Route Error Trace:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// 📁 POLYMORPHIC CONVERSATION ROOM CREATION ROUTE
router.post('/conversations', verifyTokenInline, async (req: any, res: any): Promise<any> => {
  try {
    const { targetRecipientId, contextType, contextRefId } = req.body;
    const db = getDB();
    const currentUserId = req.user.id;

    if (!targetRecipientId || !contextType) {
      return res.status(400).json({ message: 'Missing targetRecipientId or contextType input parameters.' });
    }

    await ensureCollectionsExist(db);
    const participantIds = [new ObjectId(currentUserId), new ObjectId(targetRecipientId)];

    let conversation = await db.collection('conversations').findOne({
      participants: { $all: participantIds },
      contextType,
      contextRefId: contextRefId || null
    });

    if (conversation) {
      return res.status(200).json({
        message: "Existing room context found.",
        conversation
      });
    }

    const lastReadTracking = participantIds.map(id => ({
      userId: id,
      lastReadAt: new Date()
    }));

    const newConversationDoc = {
      participants: participantIds,
      contextType, 
      contextRefId: contextRefId || null, 
      lastReadTracking,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection('conversations').insertOne(newConversationDoc);
    
    return res.status(201).json({
      message: "New polymorphic conversation container created successfully.",
      conversation: { _id: result.insertedId, ...newConversationDoc }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 📁 CONVERSATION HISTORY RETRIEVAL ROUTE
router.get('/conversations/:conversationId/messages', verifyTokenInline, async (req: any, res: any): Promise<any> => {
  try {
    const { conversationId } = req.params;
    const db = getDB();

    await ensureCollectionsExist(db);

    const messages = await db.collection('chat')
      .find({ conversationId: new ObjectId(conversationId) })
      .sort({ timestamp: 1 }) 
      .toArray();

    return res.status(200).json({
      success: true,
      count: messages.length,
      messages
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 📁 CHAT MESSAGE GENERATION ROUTE
router.post('/messages', verifyTokenInline, async (req: any, res: any): Promise<any> => {
  try {
    const { conversationId, text } = req.body;
    const db = getDB();
    const currentUserId = req.user.id;

    if (!conversationId || !text) {
      return res.status(400).json({ message: 'Missing conversationId or text parameter payloads.' });
    }

    await ensureCollectionsExist(db);

    const fallbackMessage = {
      conversationId: new ObjectId(conversationId),
      senderId: new ObjectId(currentUserId),
      senderName: req.user.name,
      senderRole: req.user.role,
      text: text.trim(),
      timestamp: new Date()
    };

    const result = await db.collection('chat').insertOne(fallbackMessage);

    await db.collection('conversations').updateOne(
      { _id: new ObjectId(conversationId) },
      { $set: { updatedAt: new Date() } }
    );

    return res.status(201).json({
      success: true,
      message: "Message successfully saved directly to chat collection.",
      data: { _id: result.insertedId, ...fallbackMessage }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 🚀 FIX: Completed the missing file attachment block below to prevent route syntax failures
router.post('/conversations/:conversationId/upload', verifyTokenInline, uploadMiddleware.single('file'), async (req: any, res: any): Promise<any> => {
  try {
    const { conversationId } = req.params;
    const db = getDB();
    const currentUserId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ message: 'Request pipeline file binary attachment absent.' });
    }

    const attachmentPayload: IFileAttachment = {
      url: `/uploads/${req.file.filename}`,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    };

    const multiMediaMessageDoc = {
      conversationId: new ObjectId(conversationId),
      senderId: new ObjectId(currentUserId),
      senderName: req.user.name,
      senderRole: req.user.role,
      text: req.body.text || `Shared an attachment file: ${req.file.originalname}`,
      fileAttachment: attachmentPayload,
      timestamp: new Date()
    };

    const result = await db.collection('chat').insertOne(multiMediaMessageDoc);

    await db.collection('conversations').updateOne(
      { _id: new ObjectId(conversationId) },
      { $set: { updatedAt: new Date() } }
    );

    return res.status(201).json({
      success: true,
      message: "Multi-media data logged safely to existing chat collection.",
      data: { _id: result.insertedId, ...multiMediaMessageDoc }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
// 📁 File: routes/auth.ts (or routes/chat.ts)
// Ensure your verifyTokenInline middleware is imported or available in this file

router.get('/directory', verifyTokenInline, async (req: any, res: any): Promise<any> => {
  try {
    const db = getDB();
    const currentUserId = req.user.id;

    // Fetch all users except the currently logged-in user
    const users = await db.collection('users')
      .find(
        { _id: { $ne: new ObjectId(currentUserId) } },
        { projection: { password: 0 } } // 🚀 SAFETY: Explicitly strip password hashes
      )
      .sort({ name: 1 })
      .toArray();

    // Map MongoDB _id object to standard id strings for frontend consistency
    const directory = users.map(u => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      role: u.role || 'customer'
    }));

    return res.status(200).json(directory);
  } catch (err: any) {
    console.error("🚨 Directory Retrieval Failure:", err.message);
    return res.status(500).json({ error: err.message });
  }
});


export default router;
