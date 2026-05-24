import express = require('express');
const router = express.Router();
import { ObjectId } from 'mongodb';
import { getDB } from '../database/db';
import { IFileAttachment } from '../types/type';
import { uploadMiddleware } from '../middleware/upload';

const ensureCollectionsExist = async (db: any) => {
  try {
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map((c: any) => c.name);

    // 1. Initialize existing "chat" repository storage if missing
    if (!collectionNames.includes('chat')) {
      await db.createCollection('chat');
      console.log("🛠️ Database Auto-Heal: 'chat' collection was missing and has been generated.");
    }

    // 2. Initialize "conversations" room repository storage if missing
    if (!collectionNames.includes('conversations')) {
      await db.createCollection('conversations');
      console.log("create conversation collection if not already created.");
    }
  } catch (err) {
    console.error("Warning:", err);
  }
};


const verifyTokenInline = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Access denied: Authentication token is missing.' });
  }

  try {
    const jwt = require('jsonwebtoken');
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
    req.user = decoded; // Injects payload: { id, name, role }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Access denied: Session key has expired or is invalid.' });
  }
};


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

    // Check if an identical contextual chat room already exists
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

    // Setup active unread message tracker markers for both users
    const lastReadTracking = participantIds.map(id => ({
      userId: id,
      lastReadAt: new Date()
    }));

    const newConversationDoc = {
      participants: participantIds,
      contextType, // 'buyer-to-designer' | 'buyer-to-merchant' | 'buyer-to-agent'
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


router.get('/conversations/:conversationId/messages', verifyTokenInline, async (req: any, res: any): Promise<any> => {
  try {
    const { conversationId } = req.params;
    const db = getDB();


    await ensureCollectionsExist(db);

    // Pull directly from your existing 'chat' repository collection logs
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

    // Update conversation updatedAt tracker field
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
    return res.status(500).json({ success: false, error: err.message });
  }
});



export default router;
