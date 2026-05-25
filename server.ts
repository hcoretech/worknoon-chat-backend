import dotenv from 'dotenv';
dotenv.config();

import express = require('express');
import http = require('http');
import { Server } from 'socket.io';
import { initChatSocket } from './sockets/chat';
import chatRoutes from './routes/chat';
import authRoutes from './routes/auth';
import path = require('path');
import cors from 'cors';
import { connectDB } from './database/db';

const app = express();

app.use(cors({
  origin: 'http://localhost:3000', 
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true 
}));

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));




app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
   origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }
});




initChatSocket(io);






const startServer = async () => {
  try {
    // connect to database first
    await connectDB();

    const PORT = process.env.PORT || 9000;
    httpServer.listen(PORT, () => {
      console.log(`🚀 Express server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error(":", error);
    process.exit(1);
  }
};

startServer();
