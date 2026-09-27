# Rules implementation and online adaptations

See [the short research note](rules-research.md) for the dated source baselines and comparison. This appendix records the implementation choices in more detail.

### MCR details

Every hand advances the dealer, including a dealer win; four rounds normally make sixteen hands. Each opponent pays eight base points. On a discard win, the discarder also pays the hand's fan total; on self-draw, everyone also pays that total. Flowers add one point each after the eight-fan threshold is satisfied. Previous discards do not create Riichi-style furiten. Seven pairs, thirteen orphans and knitted structures need their own shape checks. [Green Book, §§3.4.8, 3.6.6, 3.7–3.9](https://mahjong-europe.org/portal/images/docs/mcr_EN.pdf).

The table shows a private qualification breakdown when your MCR hand has a complete shape. For example, the reported hand `11p 789p 222s`, with exposed `111z` and `567m`, has five qualifying fan on an ordinary self-draw when East is both the seat and round wind (two + two + one). Four flowers add four points only after qualification, so this hand cannot win under the eight-fan preset. Other seat/round winds can reduce the qualifying value. A house minimum of zero allows basic completed hands; it does not change the official preset. The fixture is covered at the scoring, legal-action, and browser layers.

### EMA details that affect implementation

Use 2025's mangan rounding up and two fu for a double-wind pair. Riichi is allowed with one live tile remaining. Dealer wins and dealer tenpai draws repeat; exhaustive draws exchange 3,000 points between tenpai and noten players. Kan replacements preserve fourteen dead-wall tiles; a fourth kan continues play, a fifth is forbidden. There are no abortive draws or nagashi mangan. Multiple/counting yakuman are disabled. Renhou is five han without combining other yaku or dora. [EMA §§3.3–4.2](https://mahjong-europe.org/portal/images/docs/Riichi-rules-2025-EN.pdf).

The June 2026 annotations clarify that declared concealed kongs count for dragon/wind liability and that players may borrow points for riichi. Bankruptcy therefore does not end an EMA game. [Official annotations, §§3.3.7 and 4.1.4](https://mahjong-europe.org/portal/images/docs/EMA-Riichi-Rules-2025-Official-Annotations.pdf).

### Singapore default details

Bonus tiles are exposed and replaced from the wall's opposite end. Animals are cat, mouse, rooster and centipede. Each animal and own numbered flower/season scores one fan; each completed bonus set adds one. Cat–mouse, rooster–centipede and own flower–season marriages pay two points per opponent, or four during the initial deal. Completed bonus sets pay four; open/added kongs pay two.

For `u = 2^min(fan, cap)`, discard payments are `2u/u/u`; self-draw payments are `2u/2u/2u`. Thirteen Wonders receives self-draw payments even on a discard. Complete dragon/wind triplets and eight flowers can win without a complete conventional hand; a seven-flower holder steals the eighth. The source rotates the banker after **any win**, or after a drawn hand containing a kong. Otherwise the banker repeats. Seven pairs is an optional variation. [Chosen Singapore source](https://singaporemahjong.com/rules/).

## Explicit online adaptations and interpretations

- **Claim arbitration is the user's requested rule:** collect valid claims during the room's claim window, choose the highest configured action priority, then the earliest valid claim received by the server within that priority. Client timestamps never decide a winner. A lower-priority click cannot preempt a higher-priority response before the window closes.
- This produces one winner. It replaces MCR/Singapore seat-order ties and EMA multiple ron. EMA 2025 also lets an earlier distinct chi beat a later pon; Four Winds instead applies the room's configured priority first. These are deliberate differences, not claims about the source rules.
- The server makes wall handling, legal declarations, replacement draws and score settlement automatic. Physical table etiquette and tournament referee penalties are outside the online interface.
- For Singapore, distinct bonus events are cumulative and each pays once. The source does not explicitly settle overlap between a marriage and a completed set. Its concealed-kong payment is unspecified; Four Winds' default is zero. Its malformed little-winds description is interpreted as three wind sets plus the **fourth wind pair**. These decisions identify **Four Winds Singapore v1** precisely.
- Room edits are house rules. Fake-chip conversion is a separate display ledger for in-game points; neither ledger represents money. No payments, cash-out or real-money wagers are part of Four Winds.

## Scoring libraries

The implementation can reuse the MIT-licensed [Kobalab majiang-core](https://github.com/kobalab/majiang-core) for Riichi shape/scoring operations and Apache-2.0-licensed [masaue/jan-js-lib](https://github.com/masaue/jan-js-lib) for MCR scoring. Their defaults are not the presets: the server must supply the researched rules, maintain legal game state, map tiles correctly, and test representative scores and exclusions. Licenses were checked in the published packages and their source repositories. This note does not claim either package independently implements Four Winds' multiplayer rules.

## Implemented online profile

The server implements a complete match loop for all three presets: dealing, draw/discard turns, exposed/concealed/added kongs, replacement draws, legal claim prompts, win settlement, drawn hands, dealer progression, and match completion. Scoring is applied only after a legal winning shape is established. The MCR adapter adds flowers after qualification and carries patches for a suit-sensitive closed-wait check and order-independent terminal-chow scoring. Both scorers have an explicit seven-pairs switch for house rules.

Riichi includes furiten (own discards, temporary, and riichi), closed-hand riichi, declaration deposits, ippatsu interruption, dora/ura/kan indicators, dead-wall replenishment, robbing added kongs and the orphan exception for concealed kongs, Renhou, responsibility payments, exhaustive-draw payments, honba, and EMA placement points. Its default gives all meld calls equal priority, consistent with the current EMA first-call treatment; win claims still override melds, and same-priority wins use the requested single-winner receipt-order adaptation. No red tiles, abortive draws, nagashi mangan, multiple yakuman, or counted yakuman are enabled.

Singapore implements the chosen source's bonus tiles, replacements, marriages and completed-set payments, own-flower and animal tai, open/added-kong payments, special dragon/wind hands, eight flowers and seven-flower stealing, fifteen-tile reserve, missed-win/pung restrictions, last-discard restrictions, listed scoring patterns, and responsibility cases for exposed value sets, exposed flushes, and fresh late discards. On the last usable tile, the player can win, declare an allowed kong, or end the drawn hand; there is no discard claim after it. Seven pairs is a selectable house extension, worth two tai in this profile.

Other explicit digital choices:

- Players keep their UI positions while seat winds rotate; physical tournament seat swaps and referee penalties are not modeled.
- Each hand uses a newly shuffled wall. Production uses cryptographic randomness; deterministic seeds are reserved for tests.
- Human turns have a configurable deadline. Timeout takes a legal win or discards the drawn tile; after a chow/pung it chooses an allowed discard. Silent claim windows pass. Next-hand readiness has a 60-second fallback.
- Presets keep their researched scoring. House bonuses add fan/tai before their threshold and cap; Riichi house bonuses add flat points per paying opponent after official scoring, without creating a yaku. A global multiplier scales all point transfers, including instant bonuses and riichi deposits.
- Turning off point tracking stops its cumulative ledger. Hand qualification and settlement still run, and optional fake chips use those settlements. With point tracking off, Riichi's placement standings are tied because no cumulative point score is retained.

These implementation details define Four Winds' online presets. The automated fixtures exercise representative scores and exclusions, including two reproduced upstream defects; they do not constitute exhaustive independent certification of every fan/yaku interaction.
