import { expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { handshakeGuard } from '../server/security';
const request = (forwarded: string) =>
  ({
    headers: { 'x-forwarded-for': forwarded },
    socket: { remoteAddress: '172.20.0.2' },
  }) as unknown as IncomingMessage;
function allowed(guard: ReturnType<typeof handshakeGuard>, ip: string) {
  let ok = false;
  guard(request(ip), (_error, success) => {
    ok = success;
  });
  return ok;
}
it('lets 400 distinct players connect through the private proxy, with per-client limits', () => {
  const guard = handshakeGuard('', true);
  for (let i = 0; i < 400; i++)
    expect(allowed(guard, `10.1.${Math.floor(i / 250)}.${(i % 250) + 1}`)).toBe(true);
  for (let i = 0; i < 239; i++) expect(allowed(guard, '10.1.0.1')).toBe(true);
  expect(allowed(guard, '10.1.0.1')).toBe(false);
  // Spoofing a leftmost header cannot change the last-hop client address.
  expect(allowed(guard, '192.0.2.3, 10.1.0.1')).toBe(false);
});
it('ignores forwarding headers unless proxy trust is explicitly configured', () => {
  const guard = handshakeGuard('', false);
  for (let i = 0; i < 240; i++) expect(allowed(guard, `192.0.2.${i + 1}`)).toBe(true);
  expect(allowed(guard, '198.51.100.1')).toBe(false);
});
