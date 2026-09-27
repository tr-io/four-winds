import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';

/** Browser origins are checked on every initial Socket.IO handshake. */
export function allowedOrigin(
  req: IncomingMessage,
  configured = process.env.ALLOWED_ORIGINS ?? '',
): boolean {
  const origin = req.headers.origin;
  // Non-browser clients (our tests, health monitors) have no ambient cookies;
  // they still need the unguessable per-session token to reconnect to a seat.
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) return false;
    const origins = configured
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (origins.length) return origins.includes(origin);
    return url.host === req.headers.host;
  } catch {
    return false;
  }
}
export function handshakeGuard(
  configured = process.env.ALLOWED_ORIGINS ?? '',
  trustProxy = process.env.TRUST_PROXY === '1',
) {
  const rates = new Map<string, { count: number; until: number }>();
  return (req: IncomingMessage, done: (err: string | null, success: boolean) => void) => {
    if (!allowedOrigin(req, configured)) {
      done('Origin is not permitted.', false);
      return;
    }
    const now = Date.now(),
      forwarded = req.headers['x-forwarded-for'],
      // Trust exactly the last hop, only behind the private Caddy service.
      address = typeof forwarded === 'string' ? forwarded.split(',').at(-1)!.trim() : '',
      ip = trustProxy && isIP(address) ? address : (req.socket.remoteAddress ?? 'unknown');
    if (rates.size >= 10000)
      for (const [key, value] of rates) if (value.until < now) rates.delete(key);
    const bucket = rates.get(ip);
    if (!bucket && rates.size >= 10000) {
      done('Connection capacity reached. Try again shortly.', false);
      return;
    }
    const next =
      !bucket || bucket.until < now
        ? { count: 1, until: now + 60000 }
        : { count: bucket.count + 1, until: bucket.until };
    rates.set(ip, next);
    done(next.count > 240 ? 'Too many connection attempts.' : null, next.count <= 240);
  };
}
