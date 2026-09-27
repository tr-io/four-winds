import { test as base, expect, type Page } from '@playwright/test';
import express from 'express';
import { resolve } from 'node:path';
import { createTestServer } from './http-server';
import { GameService } from '../../server/service';
import { applyAction, gameView, newPlayer, startGame } from '../../server/engine';
import { PRESETS } from '../../shared/rules';
import { makeWall } from '../../shared/tiles';
import type { Game } from '../../shared/types';

export const test = base.extend<{ tableServer: { service: GameService; url: string } }>({
  tableServer: async ({}, use) => {
    // Real production client + authoritative service; fixtures never enter the public app.
    const app = express();
    app.use(express.static(resolve('dist')));
    const { http, io, close } = createTestServer(app);
    const service = new GameService(io, null);
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
    try {
      await use({ service, url });
    } finally {
      service.close();
      await close();
    }
  },
});

export function tiles(text: string) {
  const copies = Array(34).fill(0);
  return [...text.matchAll(/([1-9]+)([mpsz])/g)].flatMap((match) =>
    [...match[1]].map((n) => {
      const kind = 'mpsz'.indexOf(match[2]) * 9 + Number(n) - 1;
      return kind * 4 + copies[kind]++;
    }),
  );
}
export async function setup(
  page: Page,
  server: { service: GameService; url: string },
  pattern = 'rack',
) {
  await page.goto(server.url);
  await expect(page.locator('#connection-text')).toHaveText('Connected');
  const session = [...server.service.sessions.values()][0];
  session.profile.name = 'Akira';
  const rules = { ...structuredClone(PRESETS.mcr), claimSeconds: 30, turnSeconds: 120 };
  const players = [
    session.profile,
    ...[1, 2, 3].map((i) => ({
      id: `fixture-${i}`,
      name: ['Akira', 'Mei', 'Jun', 'Sora'][i],
      avatar: 'jade',
      hands: 0,
      wins: 0,
    })),
  ].map((p) => newPlayer(p, rules));
  const game = startGame(rules, players, 2048);
  if (pattern !== 'rack' && pattern !== 'waiting') {
    for (const p of players) {
      p.hand = [];
      p.melds = [];
      p.bonuses = [];
      p.discards = [];
      p.drawn = null;
      p.hasDiscarded = true;
      p.hasDrawn = true;
    }
    const me = players[0];
    if (pattern === 'complete') {
      me.hand = tiles('11789p222s');
      me.drawn = me.hand.at(-1)!;
      me.drawSource = 'wall';
      me.melds = [
        { kind: 'pung', tiles: tiles('111z'), concealed: false, from: 3 },
        { kind: 'chow', tiles: [20, 24, 16], concealed: false, from: 3 },
      ];
      me.bonuses = [138, 139, 136, 137];
      players[1].discards = [12, 13, 14, 15, 120, 121].map((tile) => ({
        tile,
        claimed: false,
        riichi: false,
      }));
      players[3].discards = [{ tile: 108, claimed: true, riichi: false }];
    } else {
      me.hand = tiles('1112345678999m');
      players[3].hand = [3];
      players[3].drawn = 3;
      game.turn = 3;
      if (pattern === 'priority')
        players[1].hand = [5, 9, 13, 17, 21, 25, 29, 35, 40, 41, 42, 108, 109];
    }
    const used = new Set(
      players.flatMap((p) => [
        ...p.hand,
        ...p.bonuses,
        ...p.discards.map((d) => d.tile),
        ...p.melds.flatMap((m) => m.tiles),
      ]),
    );
    const pool = makeWall('mcr', 2048).filter((t) => t < 136 && !used.has(t));
    for (let seat = 1; seat < 4; seat++)
      while (players[seat].hand.length < (seat === game.turn ? 14 : 13))
        players[seat].hand.push(pool.shift()!);
    const dealt = new Set(
      players.flatMap((p) => [
        ...p.hand,
        ...p.bonuses,
        ...p.discards.map((d) => d.tile),
        ...p.melds.flatMap((m) => m.tiles),
      ]),
    );
    game.wall = makeWall('mcr', 2048).filter((t) => !dealt.has(t));
  }
  session.room = 'TEST01';
  server.service.rooms.set('TEST01', {
    lobby: 'FOURWN',
    code: 'TEST01',
    name: 'The Jade Room',
    host: session.profile.id,
    rules,
    players,
    game: pattern === 'waiting' ? null : game,
    createdAt: Date.now(),
  });
  server.service.broadcast();
  await expect(page.locator('.game-window')).toBeVisible();
  return game;
}
export async function order(page: Page) {
  return page
    .locator('.hand-tiles [data-tile]')
    .evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.tile)));
}
export async function inViewport(page: Page, selector: string) {
  const rect = await page.locator(selector).boundingBox();
  expect(rect).not.toBeNull();
  const size = page.viewportSize()!;
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.y).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(size.width + 1);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(size.height + 1);
}
