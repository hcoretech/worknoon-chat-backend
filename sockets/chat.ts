import { Server, Socket } from 'socket.io';
import { ObjectId } from 'mongodb';
import jwt = require('jsonwebtoken');
import { getDB } from '../database/db';
import { UserPayload } from  "../types/type";


interface AuthenticatedSocket extends Socket {
  user?: UserPayload;
}


const sessionTrackingMap = new Map<string, string>();

export const initChatSocket = (io: Server) => {
  

  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers['authorization'];
    if (!token) {
      return next(new Error('Handshake denied: Identity credentials missing.'));
    }

    try {

      const cleanToken = token.replace('Bearer ', '');
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error("Critical configuration fault: JWT_SECRET missing.");

   
      const verifiedUser = jwt.verify(cleanToken, secret) as UserPayload;
      socket.user = verifiedUser;
      next();
    } catch (err) {
      next(new Error('Handshake denied: Authentication key invalid or expired.'));
    }
  });


  io.on('connection', (socket: AuthenticatedSocket) => {
    const activeUserId = socket.user!.id;
    sessionTrackingMap.set(activeUserId, socket.id);


    io.emit('presence_update', { userId: activeUserId, status: 'online' });
    console.log(`⚡ Sockets Connection Approved: ${socket.user!.name} [${socket.user!.role}] | Socket ID: ${socket.id}`);

    // 1. Join Chat Room Container & Sync Read Receipts
    socket.on('join_room', async ({ conversationId }: { conversationId: string }) => {
      socket.join(conversationId);
      console.log(`🚪 Socket ${socket.id} joined room container context: ${conversationId}`);
      
      try {
        const db = getDB();
        const clockTimestamp = new Date();

      
        await db.collection('conversations').updateOne(
          { _id: new ObjectId(conversationId), 'lastReadTracking.userId': new ObjectId(activeUserId) },
          { $set: { 'lastReadTracking.$.lastReadAt': clockTimestamp } }
        );

     
        socket.to(conversationId).emit('room_receipt_sync', { 
          conversationId, 
          readerId: activeUserId, 
          readAt: clockTimestamp 
        });
      } catch (err) {
        console.error('Error handling background metadata tracking updates:', err);
      }
    });

   
    socket.on('send_message', async (payload: { conversationId: string; text: string }) => {
      const { conversationId, text } = payload;
      
      try {
        const db = getDB();
        const messageDocument = {
          conversationId: new ObjectId(conversationId),
          senderId: new ObjectId(activeUserId),
          senderName: socket.user!.name,
          senderRole: socket.user!.role, 
          text: text.trim(),
          timestamp: new Date()
        };

 
        await db.collection('chat').insertOne(messageDocument);
        
  
        io.to(conversationId).emit('receive_message', messageDocument);

     
        await db.collection('conversations').updateOne(
          { _id: new ObjectId(conversationId) },
          { $set: { updatedAt: new Date() } }
        );
      } catch (err) {
        console.error('Failed processing inbound database serialization write:', err);
      }
    });

   
    socket.on('typing_input_state', ({ conversationId, isTyping }: { conversationId: string; isTyping: boolean }) => {
      socket.to(conversationId).emit('typing_broadcast', { 
        conversationId, 
        userId: activeUserId, 
        isTyping 
      });
    });

 
    socket.on('disconnect', () => {
      sessionTrackingMap.delete(activeUserId);
      io.emit('presence_update', { userId: activeUserId, status: 'offline' });
      console.log(`🔌 Connection closed for identity: ${activeUserId}`);
    });
  });
};
