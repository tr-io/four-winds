import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

/** Aggregate operational numbers only; never log credentials, names, chat, or hands. */
export function startMetrics(sample: () => Record<string, number>) {
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  let previous = performance.eventLoopUtilization();
  const timer = setInterval(() => {
    const current = performance.eventLoopUtilization();
    const utilization = performance.eventLoopUtilization(current, previous).utilization;
    previous = current;
    console.log(
      JSON.stringify({
        type: 'server-metrics',
        at: new Date().toISOString(),
        eventLoopUtilization: utilization,
        eventLoopP99Ms: delay.percentile(99) / 1e6,
        eventLoopMaxMs: delay.max / 1e6,
        rssMiB: process.memoryUsage().rss / 1048576,
        ...sample(),
      }),
    );
    delay.reset();
  }, 60000);
  timer.unref();
  return () => {
    clearInterval(timer);
    delay.disable();
  };
}
