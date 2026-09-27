import { it, expect } from 'vitest';
import { io as connect } from 'socket.io-client';
import { GameService } from '../server/service';
import { createTestServer } from './fixtures/http-server';
import { PRESETS } from '../shared/rules';
it('old route requests cannot start expensive work on the authoritative server', async () => {
  const server = createTestServer();
  const service = new GameService(server.io, null);
  await new Promise<void>((r) => server.http.listen(0, '127.0.0.1', r));
  const socket = connect(`http://127.0.0.1:${(server.http.address() as { port: number }).port}`, {
    transports: ['websocket'],
  });
  try {
    await new Promise<void>((resolve) => socket.once('state', () => resolve()));
    const command = (type: string, data?: unknown) =>
      socket.timeout(5000).emitWithAck('command', { id: crypto.randomUUID(), type, data });
    await command('create', { name: 'Routes', rules: PRESETS.mcr, bots: true });
    const start = performance.now();
    const results = await Promise.all(Array.from({ length: 8 }, () => command('analyze-hand')));
    expect(performance.now() - start).toBeLessThan(250);
    expect(results.every((r) => !r.ok && /refresh/i.test(r.error))).toBe(true);
  } finally {
    socket.disconnect();
    await service.close();
    await server.close();
  }
});
