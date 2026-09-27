import express from 'express';
import helmet from 'helmet';
import { handshakeGuard } from './security';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { Server } from 'socket.io';
import { GameService } from './service';
const app = express();
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.get('/api/health', (_req, res) => res.json({ ok: true, game: 'Four Winds' }));
app.use(express.static(resolve('dist')));
app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
const http = createServer(app);
const io = new Server(http, {
  maxHttpBufferSize: 32 * 1024,
  serveClient: false,
  allowRequest: handshakeGuard(),
});
const service = new GameService(io, resolve(process.env.DATA_FILE ?? 'data/four-winds.json'));
const port = Number(process.env.PORT ?? 3001);
http.listen(port, '0.0.0.0', () => console.log(`Four Winds server · http://localhost:${port}`));
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    service.close();
    io.close();
    http.close(() => process.exit(0));
  });
