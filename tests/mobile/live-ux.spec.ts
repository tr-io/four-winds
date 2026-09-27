import { expect } from '@playwright/test';
import { test, setup, inViewport } from '../fixtures/table';

test('touch activity, ledger, and discard queue leave the hand usable', async ({
  page,
  tableServer,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const g = await setup(page, tableServer, 'complete');
  g.turn = 1;
  tableServer.service.broadcast();
  const activity = page.getByRole('button', { name: 'Recent activity', exact: true });
  await activity.tap();
  await expect(page.locator('#recent-events')).toBeVisible();
  await inViewport(page, '#recent-events');
  await page.getByRole('button', { name: 'Close recent activity' }).tap();
  const ledger = page.getByRole('button', { name: 'Discard ledger', exact: true });
  await ledger.tap();
  await expect(page.locator('#discard-ledger')).toBeVisible();
  await ledger.tap();
  await expect(page.locator('#discard-ledger')).toBeHidden();
  await expect(page.locator('.discard-button')).toHaveCount(0);
  await page.getByRole('button', { name: 'Queue discards', exact: true }).tap();
  const tile = page.locator('.hand-tiles .tile').first();
  const id = Number(await tile.getAttribute('data-tile'));
  await tile.tap();
  await expect(page.locator('.queue-toggle .tool-count')).toHaveText('1');
  await expect(tile).toHaveAttribute('data-queue-order', '1');
  await page.locator('.queued-tile').tap();
  await expect(page.locator('.queue-toggle .tool-count')).toHaveText('0');
  await tile.tap();
  await page.getByRole('button', { name: 'Selecting discards · Done' }).tap();
  tableServer.service.broadcast();
  await expect(page.locator('.queued-tile')).toHaveCount(1);
  g.turn = 0;
  g.decision++;
  tableServer.service.broadcast();
  await expect.poll(() => g.players[0].discards.length).toBe(1);
  expect(g.players[0].discards[0].tile).toBe(id);
  await expect(page.locator('.queued-tile')).toHaveCount(0);
  await expect(page.locator('.hand-tiles')).toHaveCount(1);
});
