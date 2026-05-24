import dotenv from 'dotenv';
dotenv.config();

import express = require('express');
import http = require('http');
import { Server } from 'socket.io';
import { initChatSocket } from './sockets/chat';
import chatRoutes from './routes/chat';
import authRoutes from './routes/auth';

// imports from your local db.ts file
import { connectDB, getDB } from './database/db';



const app = express();
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(express.json());


initChatSocket(io);






const startServer = async () => {
  try {
    // connect to database first
    await connectDB();

    const PORT = process.env.PORT || 5000;
    httpServer.listen(PORT, () => {
      console.log(`🚀 Express server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error(":", error);
    process.exit(1);
  }
};

startServer();
