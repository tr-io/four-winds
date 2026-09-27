# Social tables and interactive lessons

## Try it

- Open **How to play** and select Chinese MCR, Japanese Riichi, or Singapore. Tile families,
  terminology, sample hands, scoring explanations and claim outcomes change together.
- Use **Next**, **Back**, and **Replay** to follow a tile through a turn. Select or focus any
  example tile for its name and role. All controls work with Enter/Space and touch.
- In **Build a hand**, choose a numbered group, then select tiles. Select a grouped tile to
  return it. **Check my hand** checks shape and scoring; **Show an example** provides a valid
  arrangement. Each preset has its own hand. The context is a closed East-seat self-draw in
  the East round. Four sets plus a pair is one winning shape; special shapes have separate rules.
- Step through **Who gets the discard?** to compare a winning claim with melds and then see
  what happens when the winner passes. The examples use the live engine's legal action,
  priority and resolution functions in isolated games. They cannot mutate a live room.
- **Chat** opens table or lobby/session messages and emoji reactions. Channels retain the last
  100 messages on the server. Text is escaped, messages have a 300-character limit, reactions
  use a fixed list, and sends are limited per profile.
- Click or tap anywhere on a player's card (avatar, name, points, or seat wind) to inspect
  declared melds, bonus tiles, and numbered discards in play order. Called and Riichi discards
  have text labels. Keyboard users can focus the card and press Enter or Space.
- All four hands appear on the board after setup. Your row shows your own tile faces; opponents
  show backs. Use the larger rack below the board to select, arrange, and discard your tiles.
- **Queue discards** enters selection mode. Pick physical tiles in order, then click
  **Selecting discards** to arm the queue. Remove individual tiles or use **Clear** to cancel.
  Legal wins and kongs pause it; unavailable tiles are removed. An illegal first choice waits
  rather than skipping to a different tile. Queues clear on disconnect, reload or a new hand.
- **Table settings** contains themes, garden/rain/pond surroundings, ambient audio and volume,
  board rotation, and turn notifications. Ambient audio is synthesized locally. Tap the lotus
  to open its petals; the rain setting also drops water from the leaves. Reduced motion removes
  moving effects. Rotation and right-drag panning are local; opponent concealed faces are never
  created, even when completed-hand information is available in the result dialog.
- Notifications require browser permission and a browser that supports the Notification
  constructor. They are emitted only for new decisions while the page is hidden and do not work
  after the page is closed. Some mobile browsers only support service-worker notifications;
  that background delivery is outside this implementation.
- **Profile** offers DiceBear avatars, **Hand history**, and **Saved tables**. The latest 100
  completed hands retain all public events and each score transfer. Archive reads require the
  matching profile. Full historical logs from earlier builds cannot be reconstructed.
- **Save and leave** bookmarks a table. If the final human leaves, it pauses and reserves that
  player's seat. Resume restores its hand and shifts the deadline by the pause duration. If
  others remain or return, play continues with bots. Leaving without saving preserves any
  previously created bookmarks; remove them under Saved tables when no longer needed.

## Storage and privacy

Profiles use random bearer credentials, stored in localStorage for normal guests and
sessionStorage for isolated `?guest=1` tabs. The server stores credential hashes, profiles,
rooms, chat and hand history. Preferences use player-ID localStorage keys. Clearing the
credential loses access to that guest identity. No cookies are needed for profile identity.
Only public slot numbers, dice results and dealing seats describe the wall in client snapshots;
physical tile IDs and wall order remain on the server. Lesson endpoints operate on fixed,
validated examples and do not reveal live game state.

## Setup conventions

The [requested MCR guide](https://mahjongpros.com/blogs/mahjong-rules-and-scoring-tables/official-chinese-mcr-mahjong-rules)
specifies two throws of two dice, a wall selected by the first sum, and a stack break using
both sums. MCR uses 18 stacks per wall. Three four-tile packets per player are followed by
singles, giving East the top tiles of the first and third remaining stacks. Flowers are then
replaced from the opposite end in dealer order. The implementation represents the final
singles in draw order, with East receiving the first and fifth physical tiles.

The [EMA Riichi 2025 rules](https://mahjong-europe.org/portal/images/docs/Riichi-rules-2025-EN.pdf)
use one throw of two dice, 17 stacks per wall, and a fourteen-tile dead wall. The engine's
existing dead-wall replacement and replenishment rules remain in effect.

The [Singapore rules used by Four Winds](https://singaporemahjong.com/rules/) explicitly omit
physical setup etiquette. This implementation uses one two-dice break, clockwise wall
consumption, packets followed by singles, bonus replacements from the back, and the existing
fifteen-tile reserve. With 148 tiles, wall stack counts are 19/19/18/18; disabling bonus sets
adjusts those counts. This is a documented digital convention, not a claim of universal
Singapore physical setup rules.

Four Winds keeps its existing stable seat assignment and initial host-as-East convention;
physical wind drawing and player reseating are not simulated. Dealer rotation, scoring,
winning thresholds and configured claim arbitration are unchanged. New hands record setup
metadata; games saved by older builds use a sequential neutral wall until the next hand.

## Assets and attribution

Avatars are generated locally from DiceBear 9.4.2 packages. No avatar API request or user
uploaded image is used. Adventurer and Adventurer Neutral are by Lisa Wischofsky under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Bottts is by Pablo Stanley and is
free for personal and commercial use. The profile picker links DiceBear, the style pages,
and licenses. The garden interaction uses original CSS shapes; ambient sounds are synthesized.

## Verification

`tests/lessons.test.ts` checks legal/illegal groups and actual claim outcomes for each preset.
`tests/setup.test.ts` checks dice, packet order, tile conservation and view privacy across seeds.
`tests/wall-layout.test.ts` locks down sequential wall consumption and collision-free corners.
`tests/multiplayer.test.ts` covers social authorization, persistence and identity boundaries.
`tests/browser/learning.spec.ts` exercises all lessons at desktop and phone widths, including
keyboard tile selection. `tests/browser/social.spec.ts` covers chat, escaping, reactions, meld
inspection, queues, saved tables and local controls. Existing desktop/mobile suites cover
normal play, claims, reconnects, results and reduced-motion behavior.
