import { expect } from '@playwright/test';
import { newPlayer, startGame } from '../../server/engine';
import { PRESETS } from '../../shared/rules';
import { test, setup } from '../fixtures/table';

test('other players’ paused tables stay out of this browser’s saved tables', async ({
  page,
  tableServer,
}) => {
  await page.goto(tableServer.url);
  await expect(page.locator('#connection-text')).toHaveText('Connected');
  for (let i = 0; i < 4; i++) {
    const rules = { ...structuredClone(PRESETS.mcr), turnSeconds: 120 };
    const players = Array.from({ length: 4 }, (_, seat) =>
      newPlayer(
        { id: `saved-${i}-${seat}`, name: `Player ${seat}`, avatar: 'jade', hands: 0, wins: 0 },
        rules,
        seat > 0,
      ),
    );
    players[0].connected = false;
    const code = `SAVED${i}`;
    tableServer.service.rooms.set(code, {
      code,
      lobby: 'FOURWN',
      host: players[0].profile.id,
      name: `Practice ${i}`,
      rules,
      players,
      game: startGame(rules, players, 2048),
      createdAt: Date.now(),
    });
  }
  tableServer.service.broadcast();
  await expect(page.locator('#live-room-list .room-row')).toHaveCount(0);
  await expect(page.locator('#lobby-presence')).toContainText('0 live');
  await expect(page.locator('.saved-tables')).toHaveCount(0);
  const room = tableServer.service.rooms.get('SAVED0')!;
  const hand = [...room.players[0].hand];
  room.players[0].connected = true;
  tableServer.service.broadcast();
  await expect(page.locator('#live-room-list .room-row')).toHaveCount(1);
  room.players[0].connected = false;
  tableServer.service.broadcast();
  await expect(page.locator('#live-room-list .room-row')).toHaveCount(0);
  await expect(page.locator('.saved-tables')).toHaveCount(0);
  expect(room.players[0].hand).toEqual(hand);
});

test('saved tables belong to the browser and player, survive reload, and can be removed', async ({
  page,
  browser,
  context,
  tableServer,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const g = await setup(page, tableServer, 'complete');
  for (let i = 1; i < 4; i++) g.players[i].bot = true;
  const player = g.players[0].profile.id;
  const hand = [...g.players[0].hand];
  tableServer.service.broadcast();
  await page.getByRole('button', { name: 'Leave table', exact: true }).click();
  await page.getByRole('button', { name: 'Save and leave' }).click();
  await expect(page.locator('.saved-tables summary')).toHaveText('Saved tables · 1');
  const key = `four-winds-saved-tables:${player}`;
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), key))
    .toContain('TEST01');
  await page.reload();
  await page.locator('.saved-tables summary').click();
  await expect(page.locator('.saved-tables .room-row')).toHaveCount(1);

  const token = await page.evaluate(() => localStorage.getItem('four-winds-token'));
  const other = await browser.newContext();
  try {
    const stranger = await other.newPage();
    await stranger.goto(tableServer.url);
    await expect(stranger.locator('#connection-text')).toHaveText('Connected');
    await expect(stranger.locator('.saved-tables')).toHaveCount(0);
    // Even carrying the same credential into another browser must not copy bookmarks.
    await stranger.evaluate((token) => {
      sessionStorage.clear();
      localStorage.setItem('four-winds-token', token!);
    }, token);
    await stranger.reload();
    await expect(stranger.locator('#profile-name')).toHaveText('Akira');
    await expect(stranger.locator('.saved-tables')).toHaveCount(0);
    await stranger.locator('.profile-button').click();
    await stranger.getByRole('button', { name: 'Saved tables', exact: true }).click();
    await expect(stranger.getByRole('button', { name: 'Resume', exact: true })).toHaveCount(0);
  } finally {
    await other.close();
  }

  const guest = await context.newPage();
  await guest.goto(`${tableServer.url}/?guest=1`);
  await expect(guest.locator('#connection-text')).toHaveText('Connected');
  await expect(guest.locator('.saved-tables')).toHaveCount(0);
  await guest.close();

  await page.getByRole('button', { name: 'Join The Jade Room', exact: true }).click();
  await expect(page.locator('.game-window')).toBeVisible();
  expect(g.players[0].hand).toEqual(hand);
  await page.getByRole('button', { name: 'Leave table', exact: true }).click();
  await page.getByRole('button', { name: 'Leave without saving', exact: true }).click();
  await expect(page.locator('.saved-tables summary')).toHaveText('Saved tables · 1');
  await page.locator('.profile-button').click();
  await page.getByRole('button', { name: 'Saved tables', exact: true }).click();
  await page.getByRole('button', { name: 'Remove bookmark', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.locator('.saved-tables')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#connection-text')).toHaveText('Connected');
  await expect(page.locator('.saved-tables')).toHaveCount(0);
});

test('clearing bookmarks in another tab updates this browser without restoring them from the server', async ({
  page,
  context,
  tableServer,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const g = await setup(page, tableServer, 'complete');
  for (let i = 1; i < 4; i++) g.players[i].bot = true;
  tableServer.service.broadcast();
  await page.getByRole('button', { name: 'Leave table', exact: true }).click();
  await page.getByRole('button', { name: 'Save and leave' }).click();
  await expect(page.locator('.saved-tables')).toHaveCount(1);
  const second = await context.newPage();
  await second.goto(tableServer.url);
  await expect(second.locator('.saved-tables')).toHaveCount(1);
  const owner = [...tableServer.service.sessions.values()][0].profile.id;
  await second.evaluate(
    (player) => localStorage.removeItem(`four-winds-saved-tables:${player}`),
    owner,
  );
  await expect(page.locator('.saved-tables')).toHaveCount(0);
  tableServer.service.broadcast();
  await expect(page.locator('.saved-tables')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#connection-text')).toHaveText('Connected');
  await expect(page.locator('.saved-tables')).toHaveCount(0);
});

test('a storage failure keeps the player at their table and explains why saving failed', async ({
  page,
  tableServer,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page, tableServer, 'complete');
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('four-winds-saved-tables:'))
        throw new DOMException('Full', 'QuotaExceededError');
      setItem.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Leave table', exact: true }).click();
  await page.getByRole('button', { name: 'Save and leave' }).click();
  await expect(page.locator('#toasts')).toContainText('This browser could not save your bookmarks');
  await expect(page.locator('.game-window')).toBeVisible();
  await expect(page.locator('dialog')).toBeVisible();
  expect([...tableServer.service.sessions.values()][0].room).toBe('TEST01');
});
