
import express = require('express');
const router = express.Router();
import { ObjectId } from 'mongodb';
import { getDB } from '../database/db';
import { IFileAttachment } from '../types/type';
import { uploadMiddleware } from '../middleware/upload';
import jwt from 'jsonwebtoken';


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

  
    const secretKey = (process.env.JWT_SECRET || 'fallback_dev_secret_key_change_me').trim();
    const decoded = jwt.verify(token, secretKey) as any;
    

    const resolvedUserId = decoded.id || decoded._id || decoded.userId;

    if (!resolvedUserId) {
      console.error("❌ Token signature match success, but context property mappings are empty.");
      return res.status(401).json({ message: 'Access denied: Token lacks structural context variables.' });
    }

    req.user = {
      id: resolvedUserId.toString(),
      name: decoded.name || decoded.fullName || 'Authenticated User',
       role: (decoded.role || 'customer').toLowerCase().trim() 
    };
    
    next();
  } catch (err: any) {
    console.error("🚨 JWT Verification Exception on Express Backend:", err.message);
    return res.status(401).json({ message: 'Access denied: Session key has expired or is invalid.' });
  }
};


router.get('/channels', verifyTokenInline, async (req: any, res: any): Promise<any> => {
  try {
    const db = getDB();
    const userIdString = req.user?.id;
    
    if (!userIdString) {
      return res.status(401).json({ message: "Invalid token payload structure." });
    }

    const currentUserId = new ObjectId(userIdString);

    // 1. Join with the users collection to fetch the real partner name parameters
    const conversations = await db.collection('conversations').aggregate([
      { 
        $match: { participants: currentUserId } 
      },
      {
        $lookup: {
          from: 'users',
          localField: 'participants',
          foreignField: '_id',
          as: 'partnerDetails'
        }
      },
      { 
        $sort: { updatedAt: -1 } 
      }
    ]).toArray();

    const formattedChannels = await Promise.all(conversations.map(async (conv) => {
      // 🚀 FIXED: Strictly isolate the OTHER participant, ensuring your own account is NEVER selected
      const partnerDoc = conv.partnerDetails.find(
        (u: any) => u._id.toString() !== currentUserId.toString()
      );

      // Security Shield: If no other partner document exists, skip processing or fall back cleanly
      if (!partnerDoc) return null;

      const partnerIdStr = partnerDoc._id.toString();
      const partnerRealName = partnerDoc.fullName || partnerDoc.name || partnerDoc.email || 'Workspace Operator';
      const partnerRoleProfile = (partnerDoc.role || 'customer').toLowerCase();

      // Calculate active unread counters for this channel partition
      const unreadCount = await db.collection('chat').countDocuments({
        conversationId: conv._id,
        senderId: { $ne: currentUserId },
        isRead: { $ne: true }
      });

      // Pull last message text preview out of logs safely
      const lastMessageArr = await db.collection('chat')
        .find({ conversationId: conv._id })
        .sort({ timestamp: -1 })
        .limit(1)
        .toArray();

      // 🚀 FIXED: Clear custom layout placeholders to match clean enterprise aesthetics
      let lastMessageTextPreview = 'New conversation context created.';
      if (lastMessageArr.length > 0) {
        // Handle variations between text and messageBody keys securely
        lastMessageTextPreview = lastMessageArr[0].text || lastMessageArr[0].messageBody || 'Shared an asset attachment.';
      }

      return {
        _id: conv._id.toString(),
        type: partnerRoleProfile, 
        currentStatusState: 'active',
        unreadCount: unreadCount || 0,
        lastMessageText: lastMessageTextPreview,
        updatedAt: conv.updatedAt || conv.createdAt,
        initiator: { id: userIdString, name: req.user.name || 'Current User' },
        recipient: { 
          id: partnerIdStr, 
          name: partnerRealName 
        }
      };
    }));

    // Filter out any null elements resulting from missing partner validation gates
    const cleanedChannels = formattedChannels.filter(Boolean);

    return res.status(200).json(cleanedChannels);
  } catch (err: any) {
    console.error("🚨 Repaired Channels Aggregation Router Failed:", err.message);
    return res.status(500).json({ error: err.message });
  }
});



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


router.post('/messages', verifyTokenInline, async (req: any, res: any): Promise<any> => {
  try {
    const { conversationId, text, productId, orderId } = req.body;
    const db = getDB();
    const currentUserId = req.user.id;

    if (!conversationId || !text) {
      return res.status(400).json({ message: 'Missing core message payload.' });
    }

    const fallbackMessage = {
      conversationId: new ObjectId(conversationId),
      senderId: new ObjectId(currentUserId),
      senderName: req.user.name,
      senderRole: req.user.role,
      text: text.trim(),
      timestamp: new Date(),
      
 
        wooProductId: productId ? parseInt(productId, 10) : null,
        wooOrderId: orderId ? parseInt(orderId, 10) : null

    };

    const result = await db.collection('chat').insertOne(fallbackMessage);

    // Update conversation root metadata to match context triggers
    await db.collection('conversations').updateOne(
      { _id: new ObjectId(conversationId) },
      { 
        $set: { 
          updatedAt: new Date(),
          contextRefId: productId || orderId || null 
        } 
      }
    );

    return res.status(201).json({ success: true, data: { _id: result.insertedId, ...fallbackMessage } });
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
    return res.status(500).json({ error: err.message });
  }
});

router.get('/directory', verifyTokenInline, async (req: any, res: any): Promise<any> => {
  try {
    const db = getDB();
    const currentUserId = req.user.id;
    const currentUserRole = req.user.role?.toLowerCase();

    // Base filtration gate check parameter loop: exclude self instantly from results
    let query: any = { _id: { $ne: new ObjectId(currentUserId) } };

    // 🚀 FIXED RESOLUTION: If the user is NOT an admin, completely filter out all administrators from their view!
    if (currentUserRole !== 'admin') {
      query.role = { $ne: 'admin' };
    }

    const users = await db.collection('users')
      .find(query)
      .project({ password: 0 }) 
      .sort({ name: 1 })
      .toArray();

    const directory = users.map(u => ({
      id: u._id.toString(),
      name: u.name || u.fullName || 'Workspace Operator',
      email: u.email,
      role: u.role || 'customer'
    }));

    return res.status(200).json(directory);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/profile/me', verifyTokenInline, async (req: any, res: any): Promise<any> => {
  try {
    const db = getDB();
    const currentUserId = new ObjectId(req.user.id);

    // Fetch the logged-in user profile, excluding the password hash for safety
    const userProfile = await db.collection('users').findOne(
      { _id: currentUserId },
      { projection: { password: 0 } }
    );

    if (!userProfile) {
      return res.status(404).json({ success: false, message: "User account records missing." });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: userProfile._id.toString(),
        name: userProfile.name || userProfile.fullName,
        email: userProfile.email,
        role: userProfile.role
      }
    });
  } catch (err: any) {
    console.error("🚨 Profile fetch controller crashed:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});


export default router;
