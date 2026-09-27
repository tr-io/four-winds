import { expect } from '@playwright/test';
import { newPlayer, startGame } from '../../server/engine';
import { PRESETS } from '../../shared/rules';
import { test } from '../fixtures/table';

test('empty lobbies have no default tables; offline games are saved and return to live when a human connects', async ({
  page,
  tableServer,
}) => {
  await page.goto(tableServer.url);
  await expect(page.locator('#connection-text')).toHaveText('Connected');
  await expect(page.locator('#live-room-list .room-row')).toHaveCount(0);
  await expect(page.locator('#live-room-list')).toContainText('No live tables');
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
  await expect(page.locator('#lobby-presence')).toContainText('0 live · 4 saved');
  await expect(page.locator('.saved-tables summary')).toContainText('Saved tables · 4');
  await expect(page.locator('.saved-tables .room-row').first()).toBeHidden();
  await page.locator('.saved-tables summary').click();
  await expect(page.locator('.saved-tables .room-row')).toHaveCount(4);
  await expect(page.locator('.saved-tables .room-row').first()).toContainText('0 online');
  const room = tableServer.service.rooms.get('SAVED0')!;
  const hand = [...room.players[0].hand];
  room.players[0].connected = true;
  tableServer.service.broadcast();
  await expect(page.locator('#live-room-list .room-row')).toHaveCount(1);
  await expect(page.locator('#live-room-list')).toContainText('1 online');
  await expect(page.locator('.saved-tables')).toHaveAttribute('open', '');
  await expect(page.locator('.saved-tables .room-row')).toHaveCount(3);
  room.players[0].connected = false;
  tableServer.service.broadcast();
  await expect(page.locator('#live-room-list .room-row')).toHaveCount(0);
  await expect(page.locator('.saved-tables .room-row')).toHaveCount(4);
  expect(room.players[0].hand).toEqual(hand);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Join Practice 1', exact: true }).click();
  await expect(page.locator('#room-title')).toHaveText('Practice 1');
  await expect(page.locator('.hand-tiles .tile')).toHaveCount(13);
});
