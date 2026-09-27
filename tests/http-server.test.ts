import { once } from 'node:events';
import { connect } from 'node:net';
import { expect, test } from 'vitest';
import { createTestServer } from './fixtures/http-server';

test('browser fixture shutdown closes an unfinished HTTP request', async () => {
  const server = createTestServer();
  await new Promise<void>((resolve) => server.http.listen(0, '127.0.0.1', resolve));
  const accepted = once(server.http, 'connection');
  const client = connect((server.http.address() as { port: number }).port, '127.0.0.1');
  client.on('error', () => {}); // The fixture deliberately terminates the connection.
  const [socket] = await accepted;
  const received = once(socket, 'data');
  client.write('GET / HTTP/1.1\r\nHost: localhost\r\n');
  await received;
  const closing = server.close().then(() => 'closed');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      closing,
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve('still open'), 1000);
      }),
    ]);
    expect(result).toBe('closed');
    expect(server.http.listening).toBe(false);
  } finally {
    clearTimeout(timer);
    client.destroy();
    await closing;
  }
});
