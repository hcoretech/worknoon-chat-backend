import { Server, Socket } from 'socket.io';


export const initChatSocket = (io: Server) => {
io.on('connection', (socket: Socket) => {
  console.log(` Simple Test Success: Client attached cleanly! Socket ID: ${socket.id}`);

  // 1. Listen for a basic payload ping frame from any connected user
  socket.on('ping_test', (data: { message: string }) => {
    console.log(`📥 Received ping_test from client [${socket.id}]:`, data.message);

    // 2. send  a response packet right back down to that specific user terminal
    socket.emit('pong_test', {
      reply: "Hello from the root workspace server! Real-time frame loopback operational.",
      timestamp: new Date().toISOString()
    });
  });

  // 3. Simple log on close
  socket.on('disconnect', () => {
    console.log(`🔌 Simple Test Success: Client detached safely. Socket ID: ${socket.id}`);
  });
})
};