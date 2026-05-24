import express = require('express');
const router = express.Router();
import { getDB } from '../database/db';


router.get('/', async (req: express.Request, res: express.Response) => {
   res.status(200).send('welcome to worknoon-chat-backend.');
});
router.get('/test-db', async (req: express.Request, res: express.Response) => {
    try {
    //  get database connection first
    const db = getDB();
    
    const sampleChatMessage = {
      conversationId: "test_room_101",
      senderName: "Henry Anthony",
      text: "Testing connection to MongoDB Atlas cluster from /api/test-db endpoint.",
      timestamp: new Date()
    };

    const writeResult = await db.collection('chat').insertOne(sampleChatMessage);
    const readResult = await db.collection('chat').findOne({ _id: writeResult.insertedId });

    return res.status(200).json({
      success: true,
      targetCollection: "chat",
      databaseState: "CONNECTED_TO_ATLAS_CLUSTER",
      operationPayloads: {
        insertedDocumentId: writeResult.insertedId,
        verifiedReadFromChatCollection: readResult
      }
    });
  } catch (err: any) {
    return res.status(500).json({ 
      success: false, 
      message: "Database workflow processing failure.",
      error: err.message 
    });
  }
       
  })

export default router;
