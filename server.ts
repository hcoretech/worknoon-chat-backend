import dotenv from 'dotenv';
dotenv.config();

import express = require('express');
import http = require('http');
import { Server } from 'socket.io';
import { initChatSocket } from './sockets/chat';

// imports from your local db.ts file
import { connectDB, getDB } from './database/db';



const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(express.json());


initChatSocket(io);



app.get('/', (req: express.Request, res: express.Response) => {
  res.status(200).send('welcome to worknoon-chat-backend.');
});
app.get('/api/test-db', async (req: express.Request, res: express.Response): Promise<any> => {
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
});


const startServer = async () => {
  try {
    // connect to database first
    await connectDB();

    const PORT = process.env.PORT || 5000;
    httpServer.listen(PORT, () => {
      console.log(`🚀 Express server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to bootstrap application lifecycle:", error);
    process.exit(1);
  }
};

startServer();
