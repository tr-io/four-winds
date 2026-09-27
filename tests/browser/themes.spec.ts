import { expect } from '@playwright/test';
import { applyAction, gameView } from '../../server/engine';
import { test, setup, order, inViewport } from '../fixtures/table';

for (const width of [1440, 390]) {
  test(`local themes preserve a normal turn and legal claims at ${width}px`, async ({
    page,
    tableServer,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const g = await setup(page, tableServer, 'claim');
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    applyAction(g, 3, g.decision, 'discard:3');
    tableServer.service.broadcast();
    const actions = gameView(g, 0).actions;
    const hand = await order(page);
    const decision = g.decision;
    const rules = structuredClone(g.rules);
    const canvas = await page.locator('#live-table canvas').elementHandle();
    await page.screenshot({ path: `test-results/jade-claim-${width}.png` });
    await page.getByRole('button', { name: 'Table settings', exact: true }).click();
    await page.getByRole('button', { name: /Porcelain Day/ }).click();
    await expect(page.getByRole('button', { name: /Porcelain Day/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.screenshot({ path: `test-results/theme-settings-${width}.png` });
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await expect(page.locator('#live-table')).toHaveAttribute('data-theme', 'porcelain-day');
    expect(await canvas!.evaluate((el) => el.isConnected)).toBe(true);
    expect(await order(page)).toEqual(hand);
    expect(g.decision).toBe(decision);
    expect(g.rules).toEqual(rules);
    expect(gameView(g, 0).actions).toEqual(actions);
    for (const action of actions) await inViewport(page, `[data-action="${action.id}"]`);
    await page.screenshot({ path: `test-results/porcelain-claim-${width}.png` });
    await page.locator('[data-action="pung"]').click();
    await expect(page.locator('.discard-button')).toBeVisible();
    await page.locator('.hand-tiles .tile.playable').first().click();
    const selected = await page.locator('.hand-tiles .selected').getAttribute('data-tile');
    await page.getByRole('button', { name: 'Table settings', exact: true }).click();
    await page.getByRole('button', { name: /Jade Night/ }).click();
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await expect(page.locator('.hand-tiles .selected')).toHaveAttribute('data-tile', selected!);
    await expect(page.locator('.discard-button')).toBeEnabled();
    await page.getByRole('button', { name: 'Table settings', exact: true }).click();
    await page.getByRole('button', { name: /Porcelain Day/ }).click();
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.reload();
    await expect(page.locator('#live-table')).toHaveAttribute('data-theme', 'porcelain-day');
    await inViewport(page, '.hand-tiles');
    await page.screenshot({ path: `test-results/porcelain-turn-${width}.png` });
    await page.locator('.hand-tiles .tile.playable').first().click();
    await page.locator('.discard-button').click();
    await expect.poll(() => g.players[0].discards.length).toBe(1);
    // A different player sharing browser storage starts with their own preference.
    const guest = await page.context().newPage();
    await guest.goto(`${tableServer.url}/?guest=1`);
    await expect(guest.locator('#connection-text')).toHaveText('Connected');
    await expect(guest.locator('body')).toHaveAttribute('data-table-theme', 'jade-night');
    await guest.close();
    expect(errors).toEqual([]);
  });
}

test('appearance settings are available before the first deal without applying host rules', async ({
  page,
  tableServer,
}) => {
  await setup(page, tableServer, 'waiting');
  const room = tableServer.service.rooms.get('TEST01')!;
  const rules = structuredClone(room.rules);
  await page.getByRole('button', { name: 'Table settings', exact: true }).click();
  await page.getByRole('button', { name: /Porcelain Day/ }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  expect(room.rules).toEqual(rules);
  expect(room.game).toBeNull();
  await expect(page.locator('#live-table')).toHaveAttribute('data-theme', 'porcelain-day');
});

test('the club keeps its night palette and fits a narrow viewport', async ({
  page,
  tableServer,
}) => {
  await page.goto(tableServer.url);
  await expect(page.locator('#connection-text')).toHaveText('Connected');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/jade-lobby-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/jade-lobby-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
