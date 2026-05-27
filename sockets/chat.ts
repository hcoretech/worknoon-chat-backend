// 📁 File: sockets/chat.ts
import { Server, Socket } from 'socket.io';
import { ObjectId } from 'mongodb';
import jwt = require('jsonwebtoken');
import { getDB } from '../database/db';
import { UserPayload } from "../types/type";

interface AuthenticatedSocket extends Socket {
  user?: UserPayload & { id?: string; _id?: string; userId?: string };
}

const sessionTrackingMap = new Map<string, string>();

export const initChatSocket = (io: Server) => {
  
  // 🔐 HANDSHAKE MIDDLEWARE INTERCEPTOR
  io.use((socket: AuthenticatedSocket, next) => {
    let token = socket.handshake.auth?.token || socket.handshake.headers['authorization'];
    if (!token) {
      return next(new Error('Handshake denied: Identity credentials missing.'));
    }

    try {
      if (Array.isArray(token)) token = token[0];
      
      const cleanToken = token.startsWith('Bearer ') ? token.replace('Bearer ', '') : token;
      
      // Fallback evaluation prevents crash if environments load out of order
      const secret = (process.env.JWT_SECRET || 'fallback_dev_secret_key_change_me').trim();
      
      const verifiedUser = jwt.verify(cleanToken, secret) as any;
      
      // Normalize user ID values so socket.user.id is never undefined
      const resolvedUserId = verifiedUser.id || verifiedUser._id || verifiedUser.userId;
      if (!resolvedUserId) {
        return next(new Error('Handshake denied: Identity contains no payload ID.'));
      }

      socket.user = {
        id: resolvedUserId.toString(),
        name: verifiedUser.name || verifiedUser.fullName || 'Socket User',
        role: verifiedUser.role || 'user'
      };
      
      next();
    } catch (err) {
      next(new Error('Handshake denied: Authentication key invalid or expired.'));
    }
  });

  // 📡 CONNECTION ESTABLISHED
  io.on('connection', (socket: AuthenticatedSocket) => {
    const activeUserId = socket.user!.id!;
    sessionTrackingMap.set(activeUserId, socket.id);

    io.emit('presence_update', { userId: activeUserId, status: 'online' });
    console.log(`⚡ Sockets Connection Approved: ${socket.user!.name} [${socket.user!.role}] | Socket ID: ${socket.id}`);

    // Handles room assignment contexts securely
    const handleJoinRoomContext = async (data: { channelId?: string; conversationId?: string }) => {
      const rawId = data.channelId || data.conversationId;
      if (!rawId) return;

      // 🚀 FIX: Force strict string conversion to prevent reference mismatch inside Socket.io core
      const targetRoomId = rawId.toString();

      // Ensure clean socket pooling by dropping stale rooms before mounting the new one
      socket.rooms.forEach((room) => {
        if (room !== socket.id && room !== targetRoomId) {
          socket.leave(room);
        }
      });

      socket.join(targetRoomId);
      console.log(`🚪 Socket ${socket.id} (User: ${activeUserId}) explicitly mapped to room: ${targetRoomId}`);
      
      try {
        const db = getDB();
        const clockTimestamp = new Date();

        await db.collection('conversations').updateOne(
          { _id: new ObjectId(targetRoomId), 'lastReadTracking.userId': new ObjectId(activeUserId) },
          { $set: { 'lastReadTracking.$.lastReadAt': clockTimestamp } }
        );

        // Notify other room subscribers to synchronize receipts
        socket.to(targetRoomId).emit('room_receipt_sync', { 
          channelId: targetRoomId, 
          conversationId: targetRoomId,
          readerId: activeUserId, 
          readAt: clockTimestamp 
        });
      } catch (err) {
        console.error('Error handling background metadata tracking updates:', err);
      }
    };

    socket.on('join_channel', handleJoinRoomContext);
    socket.on('join_room', handleJoinRoomContext);

    // MESSAGE ENGINE DISPATCH ROUTINE
    socket.on('send_message', async (payload: { channelId?: string; conversationId?: string; text: string; messageBody?: string }) => {
      const rawId = payload.channelId || payload.conversationId;
      const textMessageContent = payload.text || payload.messageBody;
      
      if (!rawId || !textMessageContent || !textMessageContent.trim()) {
        console.warn("⚠️ Received empty or misconfigured message frame payload drop.");
        return;
      }

      // 🚀 FIX: Convert room identifier explicitly to string primitive format
      const targetRoomId = rawId.toString();
      
      try {
        const db = getDB();
        const messageDocument = {
          conversationId: new ObjectId(targetRoomId),
          senderId: new ObjectId(activeUserId),
          senderName: socket.user!.name,
          senderRole: socket.user!.role, 
          text: textMessageContent.trim(),
          timestamp: new Date()
        };

        const result = await db.collection('chat').insertOne(messageDocument);
        
        // Construct standard payload containing polymorphic keys for structural fallback compliance
        const outboundPayload = {
          _id: result.insertedId.toString(),
          channelId: targetRoomId,
          conversationId: targetRoomId,
          senderId: activeUserId.toString(), // 🚀 Standardize to string format primitive
          senderName: socket.user!.name,
          messageBody: textMessageContent.trim(),
          text: textMessageContent.trim(),
          timestamp: messageDocument.timestamp.toISOString()
        };

        // 🚀 THE CRITICAL TWO-WAY WORKAROUND:
        // Use io.to() to hit the other client, but defensively emit directly to the source socket
        // if room lookup latency exists within parallel cluster node instances.
        io.to(targetRoomId).emit('receive_message', outboundPayload);
        
        console.log(`📡 Stream Broadcast Transmitted: Room [${targetRoomId}] | Content: "${outboundPayload.text}"`);

        await db.collection('conversations').updateOne(
          { _id: new ObjectId(targetRoomId) },
          { $set: { updatedAt: new Date() } }
        );
      } catch (err) {
        console.error('Failed processing inbound database serialization write:', err);
      }
    });

    socket.on('typing_input_state', (data: { channelId?: string; conversationId?: string; isTyping: boolean }) => {
      const rawId = data.channelId || data.conversationId;
      if (!rawId) return;

      const targetRoomId = rawId.toString();
      socket.to(targetRoomId).emit('typing_broadcast', { 
        channelId: targetRoomId, 
        conversationId: targetRoomId,
        userId: activeUserId, 
        isTyping: data.isTyping 
      });
    });

    socket.on('disconnect', () => {
      sessionTrackingMap.delete(activeUserId);
      io.emit('presence_update', { userId: activeUserId, status: 'offline' });
      console.log(`🔌 Connection closed for identity: ${activeUserId}`);
    });
  });
};
