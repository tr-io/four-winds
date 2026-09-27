import { expect } from '@playwright/test';
import { test, setup, order, inViewport } from '../fixtures/table';

test('live tools use public events, explicit toggles, and actual hand actions', async ({
  page,
  tableServer,
}) => {
  await page.setViewportSize({ width: 1586, height: 992 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const g = await setup(page, tableServer, 'complete');
  const ledger = page.getByRole('button', { name: 'Discard ledger', exact: true });
  await expect(page.locator('#discard-ledger')).toBeHidden();
  await ledger.hover();
  await ledger.focus();
  await expect(page.locator('#discard-ledger')).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(ledger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#discard-count')).toHaveText('7');
  await expect(page.locator('.discard-group[data-kind="27"]')).toContainText('1 called');
  await expect(page.locator('.discard-group[data-kind="27"]')).toContainText('North 1');
  await page.screenshot({ path: 'test-results/live-ux-desktop.png' });
  await page.locator('.hand-tiles .tile').first().focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#discard-ledger')).toBeHidden();
  await expect(ledger).toBeFocused();
  await page.getByRole('button', { name: 'Recent activity', exact: true }).click();
  await expect(page.locator('#recent-events')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close recent activity' })).toBeFocused();
  await expect(page.locator('#recent-event-list li')).toHaveCount(Math.min(12, g.events.length));
  await ledger.click();
  await expect(page.locator('#recent-events')).toBeHidden();
  await page.getByRole('button', { name: 'Close discard ledger' }).click();
  await expect(ledger).toBeFocused();
  await expect(
    page.getByRole('group', { name: 'Hand analysis', exact: true }).getByRole('button'),
  ).toHaveCount(0);
  await expect(page.locator('.hand-tiles')).toHaveCount(1);
  await expect(page.locator('.discard-button')).toBeDisabled();
  await expect(page.locator('#discard-help')).toContainText('Select a tile');
  const original = await order(page);
  await page.locator('.hand-tiles .tile').first().focus();
  await page.keyboard.press('Alt+ArrowRight');
  expect(await order(page)).not.toEqual(original);
  await page.getByRole('button', { name: 'Sort tiles by suit and rank' }).click();
  expect(await order(page)).toEqual(original);
  await page.locator('.hand-tiles .tile').first().click();
  await page.getByRole('button', { name: 'Queue discards', exact: true }).click();
  await expect(page.locator('.discard-button')).toBeDisabled();
  await page.getByRole('button', { name: 'Selecting discards · Done' }).click();
  const tile = page.locator('.hand-tiles .tile').first();
  const id = Number(await tile.getAttribute('data-tile'));
  await tile.click();
  await expect(tile).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.discard-button')).toBeEnabled();
  await expect(page.locator('#discard-help')).toContainText(
    (await tile.getAttribute('data-tile-name'))!,
  );
  await page.locator('.discard-button').click();
  await expect.poll(() => g.players[0].discards[0]?.tile).toBe(id);
  await expect(page.locator('.discard-button')).toHaveCount(0);
});

test('live tools and dock stay accessible across screen sizes and themes', async ({
  page,
  tableServer,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page, tableServer);
  await expect(page.locator('[data-effect="deal"]')).toHaveCount(0, { timeout: 6000 });
  for (const theme of ['jade-night', 'porcelain-day']) {
    await page.getByRole('button', { name: 'Table settings', exact: true }).click();
    await page.locator(`[data-theme-choice="${theme}"]`).click();
    await page.getByRole('button', { name: 'Close dialog' }).click();
    for (const viewport of [
      { width: 1586, height: 992 },
      { width: 1280, height: 720 },
      { width: 390, height: 844 },
      { width: 844, height: 390 },
      { width: 700, height: 400 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      await page.locator('.game-window').evaluate((el) => (el.scrollTop = 0));
      await page.screenshot({ path: `test-results/live-ux-${theme}-${viewport.width}.png` });
      const toolbar = (await page.locator('.game-toolbar').boundingBox())!;
      const board = (await page.locator('.board-area').boundingBox())!;
      expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(board.y + 1);
      for (const button of await page.locator('.game-toolbar button:visible').all()) {
        const rect = (await button.boundingBox())!;
        expect(rect.y + rect.height).toBeLessThanOrEqual(toolbar.y + toolbar.height);
      }
      await page.getByRole('button', { name: 'Discard ledger', exact: true }).click();
      await inViewport(page, '#discard-ledger');
      const panel = (await page.locator('#discard-ledger').boundingBox())!;
      const hand = (await page.locator('.hand-tiles').boundingBox())!;
      expect(panel.x + panel.width <= hand.x || panel.y + panel.height <= hand.y).toBe(true);
      await page.keyboard.press('Escape');
      for (const selector of [
        '.hand-tiles .tile',
        '.queue-toggle',
        '.discard-button',
        '.hand-controls button',
        '.activity-trigger',
        '.discard-trigger',
        '.lotus',
      ]) {
        for (const control of await page.locator(selector).all()) {
          const rect = (await control.boundingBox())!;
          expect(rect.width, selector).toBeGreaterThanOrEqual(44);
          expect(rect.height, selector).toBeGreaterThanOrEqual(44);
        }
      }
      await page.locator('.hand-tiles .tile').last().click();
      await expect(page.locator('.discard-button')).toBeEnabled();
      await page.locator('.discard-button').scrollIntoViewIfNeeded();
      await inViewport(page, '.discard-button');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  }
});

for (const preset of ['mcr', 'riichi', 'singapore'] as const) {
  test(`${preset} keeps selection and discard connected to the authoritative hand`, async ({
    page,
    tableServer,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const game = await setup(page, tableServer, 'rack', preset);
    await expect(page.locator('.discard-button')).toBeDisabled();
    const tile = page.locator('.hand-tiles .tile.playable').first();
    const id = Number(await tile.getAttribute('data-tile'));
    await tile.click();
    await expect(page.locator('.discard-button')).toBeEnabled();
    await page.locator('.discard-button').click();
    await expect.poll(() => game.players[0].discards[0]?.tile).toBe(id);
    expect(game.players[0].hand).not.toContain(id);
  });
}
