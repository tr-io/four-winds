import { expect } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import { tableFieldOfView } from '../../client/table-camera';
import { seatPoint } from '../../client/table-layout';
import { test, setup, inViewport } from '../fixtures/table';

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 960, height: 540 },
  { width: 700, height: 720 },
  { width: 768, height: 600 },
  { width: 640, height: 360 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 320, height: 568 },
]) {
  test(`opponent hands and player cards stay unobstructed at ${viewport.width}×${viewport.height}`, async ({
    page,
    tableServer,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setup(page, tableServer, 'complete');
    // Browser zoom changes the CSS viewport after the table is already mounted.
    await page.setViewportSize(viewport);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const canvas = (await page.locator('#live-table canvas').boundingBox())!;
    const camera = new PerspectiveCamera(
      tableFieldOfView(canvas.width / canvas.height),
      canvas.width / canvas.height,
      0.1,
      100,
    );
    camera.position.set(0, 15, 12);
    camera.lookAt(0, 0, 0.7);
    camera.updateMatrixWorld();
    // Test every opponent tile, not just the center of a hand. These are public backs.
    for (const seat of [1, 2, 3]) {
      for (let i = 0; i < 13; i++) {
        const tile = seatPoint((i - 6) * 0.32, 5.46, seat);
        const point = new Vector3(tile.x, 0.178, tile.z).project(camera);
        const screen = {
          x: canvas.x + ((point.x + 1) * canvas.width) / 2,
          y: canvas.y + ((1 - point.y) * canvas.height) / 2,
        };
        expect(
          await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, screen),
          `seat ${seat}, tile ${i}`,
        ).toBe('CANVAS');
      }
    }
    await page.screenshot({ path: `test-results/table-layout-${viewport.width}.png` });
    const overlap = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.player-badge, .recent-actions')].map((el) =>
        el.getBoundingClientRect(),
      );
      return cards.some((a, i) =>
        cards
          .slice(i + 1)
          .some(
            (b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top,
          ),
      );
    });
    expect(overlap).toBe(false);
    await page.getByRole('button', { name: 'Show discarded tiles' }).click();
    await inViewport(page, '#discard-ledger');
    const group = page.locator('.discard-group').first();
    await group.scrollIntoViewIfNeeded();
    const ledger = (await page.locator('#discard-groups').boundingBox())!;
    const tile = (await group.locator('.tile').boundingBox())!;
    expect(tile.y).toBeGreaterThanOrEqual(ledger.y);
    expect(tile.y + tile.height).toBeLessThanOrEqual(ledger.y + ledger.height);
    await page.getByRole('button', { name: 'Close discarded tiles' }).click();
    await page.locator('.hand-tiles .tile').first().click();
    await expect(page.locator('.discard-button')).toBeEnabled();
    await page.locator('.discard-button').scrollIntoViewIfNeeded();
    await inViewport(page, '.discard-button');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('a focused tile keeps its name when the zoomed game scrolls', async ({
  page,
  tableServer,
}) => {
  await page.setViewportSize({ width: 960, height: 540 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page, tableServer, 'complete');
  const tile = page.locator('.hand-tiles .tile').first();
  await tile.focus();
  await page.locator('.game-window').evaluate((el) => {
    el.scrollTop -= 8;
  });
  await expect(page.getByRole('tooltip')).toHaveText((await tile.getAttribute('data-tile-name'))!);
  await inViewport(page, '#tile-tooltip');
});
