import { expect } from '@playwright/test';
import { test, setup } from '../fixtures/table';
test('table chat, reactions, public meld inspection and saved table resume', async ({
  page,
  tableServer,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const g = await setup(page, tableServer, 'complete');
  await page.getByRole('button', { name: 'Inspect Akira melds' }).click();
  await expect(page.locator('.player-meld-details section')).toHaveCount(3);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Open table chat' }).click();
  await page.getByLabel('Message', { exact: true }).fill('<img onerror=alert(1)>');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('#chat-messages')).toContainText('<img onerror=alert(1)>');
  await expect(page.locator('#chat-messages img')).toHaveCount(0);
  await page.waitForTimeout(750);
  await page.getByRole('button', { name: 'React 👏', exact: true }).click();
  await expect(page.locator('.reaction-bubble')).toContainText('👏');
  await page.getByRole('button', { name: 'Close chat' }).click();
  for (let i = 1; i < 4; i++) g.players[i].bot = true;
  const hand = [...g.players[0].hand];
  tableServer.service.broadcast();
  await page.getByRole('button', { name: 'Leave table', exact: true }).click();
  await expect(page.locator('dialog')).toContainText('last player');
  await page.getByRole('button', { name: 'Save and leave' }).click();
  await page.locator('.profile-button').click();
  await page.getByRole('button', { name: 'Saved tables', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.locator('.game-window')).toBeVisible();
  expect(g.players[0].hand).toEqual(hand);
  await expect(page.locator('dialog')).not.toBeVisible();
});
test('queue discards privately, cancel, and send once when the selected tile becomes legal', async ({
  page,
  tableServer,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const g = await setup(page, tableServer, 'complete');
  g.turn = 1;
  tableServer.service.broadcast();
  await page.getByRole('button', { name: 'Queue discards', exact: true }).click();
  const tile = page.locator('.hand-tiles [data-tile]').first();
  const id = Number(await tile.getAttribute('data-tile'));
  await tile.click();
  await expect(page.locator('.queued-tile')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('.queued-tile')).toHaveCount(0);
  await tile.click();
  await page.getByRole('button', { name: 'Selecting discards' }).click();
  expect(g.players[0].discards).toHaveLength(0);
  g.turn = 0;
  g.decision++;
  tableServer.service.broadcast();
  await expect.poll(() => g.players[0].discards.length).toBe(1);
  expect(g.players[0].discards[0].tile).toBe(id);
  tableServer.service.broadcast();
  await expect(page.locator('.queued-tile')).toHaveCount(0);
  expect(g.players[0].discards).toHaveLength(1);
});
test('local board and atmosphere controls persist without changing game state', async ({
  page,
  tableServer,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const g = await setup(page, tableServer, 'complete');
  const before = JSON.stringify(g.players.map((p) => p.hand));
  await page.getByRole('button', { name: 'Table settings', exact: true }).click();
  await page.getByLabel('Drag to rotate').check();
  await page.getByLabel('Surroundings').selectOption('pond');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  const canvas = page.locator('#live-table canvas');
  const rect = (await canvas.boundingBox())!;
  await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * 0.7, rect.y + rect.height * 0.65, { steps: 8 });
  await page.mouse.up();
  expect(JSON.stringify(g.players.map((p) => p.hand))).toBe(before);
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-environment', 'pond');
  await page.getByRole('button', { name: 'Table settings', exact: true }).click();
  await expect(page.getByLabel('Drag to rotate')).toBeChecked();
});

test('turn notifications are opt-in, background-only and deduplicated per decision', async ({
  page,
  tableServer,
}) => {
  await page.addInitScript(() => {
    const notifications: string[] = [];
    Object.defineProperty(window, 'Notification', {
      value: class {
        static permission = 'granted';
        static async requestPermission() {
          return 'granted';
        }
        onclick: (() => void) | null = null;
        constructor(title: string) {
          notifications.push(title);
        }
        close() {}
      },
    });
    Object.defineProperty(window, 'testNotifications', { value: notifications });
  });
  const g = await setup(page, tableServer, 'complete');
  const count = () =>
    page.evaluate(
      () => (window as unknown as { testNotifications: string[] }).testNotifications.length,
    );
  g.turn = 1;
  tableServer.service.broadcast();
  await page.getByRole('button', { name: 'Table settings', exact: true }).click();
  await page.getByLabel('Browser turn notifications').check();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  g.turn = 0;
  g.decision++;
  tableServer.service.broadcast();
  await expect(page.locator('.discard-button')).toBeVisible();
  expect(await count()).toBe(0);
  await page.evaluate(() =>
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }),
  );
  g.decision++;
  tableServer.service.broadcast();
  await expect.poll(count).toBe(1);
  tableServer.service.broadcast();
  await expect.poll(count).toBe(1);
});
