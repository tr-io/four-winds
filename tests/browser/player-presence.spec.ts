import { expect } from '@playwright/test';
import { test, setup } from '../fixtures/table';

test('presence stays at the bottom left of every card and explains both states', async ({
  page,
  tableServer,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const g = await setup(page, tableServer, 'complete');
  g.players[1].connected = false;
  tableServer.service.broadcast();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    for (const card of await page.locator('.player-badge').all()) {
      const dot = card.locator('.seat-online');
      const bounds = await dot.boundingBox();
      const parent = (await card.boundingBox())!;
      expect(bounds!.width).toBeGreaterThanOrEqual(14);
      expect(bounds!.height).toBeGreaterThanOrEqual(14);
      expect(bounds!.x - parent.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x - parent.x).toBeLessThanOrEqual(6);
      expect(parent.y + parent.height - bounds!.y - bounds!.height).toBeGreaterThanOrEqual(0);
      expect(parent.y + parent.height - bounds!.y - bounds!.height).toBeLessThanOrEqual(6);
    }
    const offline = page.getByRole('button', { name: 'Inspect Mei tiles' });
    await offline.locator('.seat-online').hover();
    await expect(offline.getByRole('tooltip')).toHaveText('Offline');
    const online = page.getByRole('button', { name: 'Inspect Akira tiles' });
    await online.locator('.seat-online').hover();
    await expect(online.getByRole('tooltip')).toHaveText('Online');
    await page.mouse.move(0, 0);
    await offline.focus();
    await expect(offline.getByRole('tooltip')).toHaveText('Offline');
    await page.screenshot({ path: `test-results/presence-${viewport.width}.png` });
    await page.keyboard.press('Enter');
    await expect(page.locator('dialog h2')).toHaveText('Mei');
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.locator('.profile-button').focus();
  }
  g.players[1].connected = true;
  g.players[2].bot = true;
  tableServer.service.broadcast();
  await page.getByRole('button', { name: 'Inspect Mei tiles' }).locator('.seat-online').hover();
  await expect(
    page.getByRole('button', { name: 'Inspect Mei tiles' }).getByRole('tooltip'),
  ).toHaveText('Online');
  await expect(
    page.getByRole('button', { name: 'Inspect Jun tiles' }).locator('.seat-online'),
  ).toHaveCount(0);
});
