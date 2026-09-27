import { createServer, type RequestListener } from 'node:http';
import type { Socket } from 'node:net';
import { Server } from 'socket.io';

export function createTestServer(listener?: RequestListener) {
  const http = createServer(listener);
  const io = new Server(http);
  const connections = new Set<Socket>();
  let closing = false;
  http.on('connection', (socket) => {
    if (closing) {
      socket.destroy();
      return;
    }
    connections.add(socket);
    socket.once('close', () => connections.delete(socket));
  });
  return {
    http,
    io,
    async close() {
      closing = true;
      const closed = io.close();
      // Tests are finished. Node 24 otherwise waits for incomplete HTTP requests,
      // and browser preconnects or upgrades can outlive Socket.IO's own clients.
      for (const socket of connections) socket.destroy();
      await closed;
    },
  };
}
