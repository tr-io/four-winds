import { expect } from '@playwright/test';
import { applyAction } from '../../server/engine';
import { test, setup, order, inViewport } from '../fixtures/table';

test('touch tooltips, scored routes, and a pinned compact discard ledger fit portrait and landscape', async ({
  page,
  tableServer,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const g = await setup(page, tableServer, 'complete');
  await page.locator('.hand-tiles .tile').first().tap();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.getByRole('button', { name: 'Inspect your hand' }).tap();
  await page.getByRole('tab', { name: 'Winning routes', exact: true }).tap();
  await expect(page.locator('.winning-route').first()).toBeVisible();
  await expect(page.locator('.winning-route header strong').first()).toContainText('points');
  await page.locator('.route-group .tile').first().tap();
  await expect(page.locator('dialog #tile-tooltip')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).tap();
  const trigger = page.getByRole('button', { name: 'Show discarded tiles' });
  await trigger.tap();
  await expect(trigger).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.hand-tiles .tile').first().tap();
  await expect(page.locator('#discard-ledger')).toBeVisible();
  tableServer.service.broadcast();
  await expect(trigger).toHaveAttribute('aria-pressed', 'true');
  await inViewport(page, '#discard-ledger');
  const a = (await page.locator('.last-discard').boundingBox())!,
    b = (await page.locator('.last-turn').boundingBox())!;
  expect(a.x).toBe(b.x);
  expect(a.y + a.height).toBeLessThanOrEqual(b.y);
  expect((await trigger.boundingBox())!.width).toBeLessThanOrEqual(46);
  await trigger.tap();
  await expect(page.locator('#discard-ledger')).toBeHidden();
  await page.setViewportSize({ width: 844, height: 390 });
  await trigger.tap();
  await inViewport(page, '#discard-ledger');
  await inViewport(page, '.hand-tiles');
  await inViewport(page, '#action-dock');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('complete winning hand, colored meld legend, readiness, and host advance work by touch', async ({
  page,
  tableServer,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const g = await setup(page, tableServer, 'complete');
  g.rules.minimum = 0;
  g.rules.advanceWhenReady = false;
  g.rules.nextHandSeconds = 120;
  g.players[0].melds[0].kind = 'kong';
  g.players[0].melds[0].tiles.push(111);
  g.players[1].bot = true;
  g.players[2].bot = true;
  tableServer.service.broadcast();
  await page.locator('[data-action="win"]').tap();
  await expect(page.locator('.complete-winning-hand')).toBeVisible();
  await expect(page.locator('.complete-winning-hand .tile')).toHaveCount(19);
  await expect(page.locator('.complete-winning-hand .meld-kong .tile')).toHaveCount(4);
  await expect(page.locator('.complete-winning-hand .meld-chow .tile')).toHaveCount(3);
  await expect(page.locator('.hand-legend')).toContainText('Kong / kan');
  await page.locator('.complete-winning-hand .meld-kong .tile').first().tap();
  await expect(page.getByRole('tooltip')).toHaveText('East');
  await expect(page.locator('#next-hand-panel')).toContainText('2/4 ready');
  await expect(page.locator('#next-hand-panel .next-hand-clock')).toContainText('Next hand in');
  await page.locator('#next-hand-panel [data-do="ready"]').tap();
  await expect(page.locator('#next-hand-panel')).toContainText('3/4 ready');
  await page.reload();
  await expect(page.locator('#next-hand-panel')).toContainText('3/4 ready');
  await page.locator('#next-hand-panel [data-do="force-next-hand"]').tap();
  await expect(page.locator('#modal')).toBeHidden();
  await expect.poll(() => g.handNumber).toBe(2);
  await inViewport(page, '.hand-tiles');
});

test('a new draw automatically sorts a manually arranged rack without submitting a move', async ({
  page,
  tableServer,
}) => {
  const g = await setup(page, tableServer, 'claim');
  const original = await order(page);
  // Keyboard sorting operates on the same rack order used by touch dragging.
  await page.locator('.hand-tiles .tile').first().focus();
  await page.keyboard.press('Alt+ArrowRight');
  expect(await order(page)).not.toEqual(original);
  const count = g.players[0].discards.length;
  applyAction(g, 3, g.decision, 'discard:3');
  tableServer.service.broadcast();
  await page.locator('[data-action="pass"]').tap();
  await expect.poll(() => g.turn).toBe(0);
  await expect.poll(() => order(page)).toEqual([...g.players[0].hand].sort((a, b) => a - b));
  expect(g.players[0].discards.length).toBe(count);
});

test('touch starts a table with a shuffle and deal without hiding the rack or actions', async ({
  page,
  tableServer,
}) => {
  await setup(page, tableServer, 'waiting');
  await page.getByRole('button', { name: 'Toggle game sounds' }).tap();
  await page.getByRole('button', { name: 'Start the game' }).tap();
  await expect(page.locator('[data-effect="deal"]')).toBeVisible();
  await expect(page.locator('.hand-tiles .tile')).toHaveCount(14);
  await inViewport(page, '.hand-tiles');
  await inViewport(page, '#action-dock');
  await page.locator('.hand-tiles .tile').first().tap();
  await expect(page.locator('.discard-button')).toBeEnabled();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await expect(page.locator('[data-effect="deal"]')).toHaveCount(0, { timeout: 4000 });
});
