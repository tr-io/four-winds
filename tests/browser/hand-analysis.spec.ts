import { expect } from '@playwright/test';
import { test, setup } from '../fixtures/table';

test('winning routes run in a local worker without an analysis command', async ({
  page,
  tableServer,
}) => {
  const sent: string[] = [];
  page.on('websocket', (socket) =>
    socket.on('framesent', (frame) => sent.push(String(frame.payload))),
  );
  await setup(page, tableServer, 'complete');
  await page.getByRole('button', { name: 'Inspect your hand' }).click();
  const worker = page.waitForEvent('worker');
  await page.getByRole('tab', { name: 'Winning routes', exact: true }).click();
  expect((await worker).url()).toContain('analysis-worker');
  await expect(page.locator('.winning-route').first()).toBeVisible();
  expect(sent.some((frame) => frame.includes('analyze-hand'))).toBe(false);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.locator('#action-dock')).toBeVisible();
});

test('a slow or unavailable analysis never traps the dialog or blocks play', async ({
  page,
  tableServer,
}) => {
  await page.route('**/assets/analysis-worker-*.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: 'self.onmessage = () => {};' }),
  );
  await setup(page, tableServer, 'complete');
  await page.getByRole('button', { name: 'Inspect your hand' }).click();
  await page.getByRole('tab', { name: 'Winning routes', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Reading the hand' })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.locator('dialog')).not.toBeVisible();
  await page.unroute('**/assets/analysis-worker-*.js');
  await page.getByRole('button', { name: 'Inspect your hand' }).click();
  await page.getByRole('tab', { name: 'Winning routes', exact: true }).click();
  await expect(page.locator('.winning-route').first()).toBeVisible();
});

test('failed worker analysis offers a working retry without an uncaught page error', async ({
  page,
  tableServer,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/assets/analysis-worker-*.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: 'self.onmessage = () => { throw new Error("Fixture worker failure"); };',
    }),
  );
  await setup(page, tableServer, 'complete');
  await page.getByRole('button', { name: 'Inspect your hand' }).click();
  await page.getByRole('tab', { name: 'Winning routes', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Hand analysis is unavailable' }),
  ).toBeVisible();
  await page.unroute('**/assets/analysis-worker-*.js');
  await page.getByRole('button', { name: 'Retry hand analysis' }).click();
  await expect(page.locator('.winning-route').first()).toBeVisible();
  expect(errors).toEqual([]);
});
