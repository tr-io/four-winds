// Isolated capacity harness. No fixture routes are mounted in the production server.
import { createServer } from 'node:http';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { Server } from 'socket.io';
import { GameService } from '../../server/service';
const http = createServer((_req, res) => {
  res.end('ok');
});
const io = new Server(http, { maxHttpBufferSize: 32 * 1024, serveClient: false });
const service = new GameService(io, process.env.LOAD_DATA_FILE ?? null);
const lag = monitorEventLoopDelay({ resolution: 10 });
lag.enable();
let cpu = process.cpuUsage(),
  elapsed = performance.now();
process.on('message', async (message) => {
  if (message === 'seed-history') {
    const count = Number(process.env.LOAD_HISTORY_HANDS ?? 0);
    for (const session of service.sessions.values())
      session.history = Array.from({ length: count }, (_, i) => ({
        id: `load-history-${i}`,
        room: session.room!,
        table: 'Capacity fixture',
        preset: 'mcr',
        at: Date.now(),
        handNumber: i + 1,
        players: ['A', 'B', 'C', 'D'],
        seat: 0,
        events: Array.from({ length: 150 }, (_, id) => ({
          id,
          at: Date.now(),
          type: 'discard' as const,
          text: 'Player discarded a tile during this completed hand.',
          seat: id % 4,
          tile: id % 136,
          handNumber: i + 1,
        })),
        result: {
          winner: null,
          from: null,
          reason: 'Exhaustive draw',
          deltas: [0, 0, 0, 0],
          hands: [[], [], [], []],
          repeat: false,
        },
      }));
    service.persist();
    process.send?.({ seeded: true });
  }
  if (message === 'reset') {
    lag.reset();
    service.metrics();
    cpu = process.cpuUsage();
    elapsed = performance.now();
    process.send?.({ reset: true });
  }
  if (message === 'report') {
    const used = process.cpuUsage(cpu);
    process.send?.({
      metrics: {
        ...service.metrics(),
        eventLoopP95Ms: lag.percentile(95) / 1e6,
        eventLoopP99Ms: lag.percentile(99) / 1e6,
        eventLoopMaxMs: lag.max / 1e6,
        serverRssMiB: process.memoryUsage().rss / 1048576,
        cpuCores: (used.user + used.system) / 1000 / (performance.now() - elapsed),
      },
    });
  }
  if (message === 'close') {
    await service.close();
    await io.close();
    process.exit(0);
  }
});
http.listen(0, '127.0.0.1', () =>
  process.send?.({ port: (http.address() as { port: number }).port }),
);
