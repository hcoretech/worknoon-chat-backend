import { io } from 'socket.io-client';

console.log('📡 Attempting real-time socket connection targeting port 9000...');
const clientSocket = io('http://localhost:9000', {
  transports: ['websocket']
});

clientSocket.on('connect', () => {
  console.log(`✅ Linked successfully! Assigned Connection ID: ${clientSocket.id}`);
  
  // send a test message to the server immediately upon connection
  console.log('📤 Transmitting ping_test data packet...');
  clientSocket.emit('ping_test', { message: 'Checking baseline WebSocket loops.' });
});

clientSocket.on('pong_test', (payload: any) => {
  console.log('📥 Success: Data looped back from server cleanly!', payload);
  
  // Shut down connection threads gracefully
  clientSocket.disconnect();
  process.exit(0);
});

clientSocket.on('connect_error', (err) => {
  console.error('❌ Failed connecting to real-time engine:', err.message);
  process.exit(1);
});
