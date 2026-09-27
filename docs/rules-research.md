# Rules research: the three Four Winds presets

Researched **26 September 2026**, before implementing the engine. Presets identify a rules tradition; Four Winds makes the online adaptations below. Detailed mechanics and coverage are in [the implementation appendix](rules-implementation.md).

## Sources and versions

- **Chinese Official / MCR:** World Mahjong Organization, _Mahjong Competition Rules_, **July 2006 first edition**, the Green Book. This is the reference identified by the [EMA MCR page](https://mahjong-europe.org/portal/index.php?option=com_content&view=article&id=31&Itemid=167). [English rulebook](https://mahjong-europe.org/portal/images/docs/mcr_EN.pdf), particularly §§3.4–3.9.
- **Japanese Riichi:** [EMA Riichi Rules, August 2025 edition](https://mahjong-europe.org/portal/images/docs/Riichi-rules-2025-EN.pdf), effective **1 January 2026**, plus the [June 2026 official annotations](https://mahjong-europe.org/portal/images/docs/EMA-Riichi-Rules-2025-Official-Annotations.pdf). This supersedes the 2016 baseline; the effective date is confirmed on [EMA's rules page](https://mahjong-europe.org/portal/index.php?option=com_content&view=article&id=30&Itemid=166).
- **Singapore default:** **Four Winds Singapore v1**, based on [SingaporeMahjong.com's “Rules for Singapore Mahjong”](https://singaporemahjong.com/rules/), **accessed 26 September 2026**. This is an unversioned first-party description of that author's game, not a national standard. The dated profile fixes the defaults below.
- **Singapore comparison:** the [Singapore Polytechnic Graduates' Guild January 2024 rules](https://www.spgg.org.sg/web/content/114907/) use different banker continuations, payment tables, and liability thresholds. Their header and conclusion also carry different dates. Four Winds does not mix that club profile into its default.

## Important differences

| Aspect             | Chinese MCR                           | EMA Riichi                          | Singapore v1                                            |
| ------------------ | ------------------------------------- | ----------------------------------- | ------------------------------------------------------- |
| Tile set           | 144; eight flowers/seasons            | 136; no flowers or red fives        | 148; flowers, seasons, four animals                     |
| Minimum win        | Eight fan, excluding flowers          | One yaku; dora cannot qualify alone | One tai, capped at five by default                      |
| Scoring            | Add eligible patterns with exclusions | Han/fu, limits, dealer payments     | Tai doubles a base point unit                           |
| Special features   | 81 patterns; knitted hands            | Riichi, furiten, dora, honba        | Animal/flower bonuses and special wins                  |
| Reserve            | None                                  | Fourteen dead-wall tiles            | Fifteen tiles                                           |
| Dealer progression | Every hand                            | Repeat on dealer win/tenpai draw    | Rotate on any win or draw with a kong; otherwise repeat |

All three use four players, normal four-set-and-pair hands, pungs, kongs, and chows from the preceding player. Their special shapes and scoring restrictions differ. The table follows the source rulebooks above.

EMA's current baseline matters: **mangan rounding up is enabled**, a double-wind pair is **two fu**, and riichi is possible with **one live tile**. The June annotations allow borrowing for a riichi deposit and clarify liability involving concealed kongs. [EMA 2025](https://mahjong-europe.org/portal/images/docs/Riichi-rules-2025-EN.pdf), [annotations](https://mahjong-europe.org/portal/images/docs/EMA-Riichi-Rules-2025-Official-Annotations.pdf).

## The chosen Singapore defaults

Cat, rat, rooster, and centipede are bonus tiles. Bonuses reveal and replace from the opposite wall end. Every animal and each own numbered flower/season adds tai; completed bonus sets add another. Animal pairs and own flower pairs pay immediately, as do open/added kongs. Eight flowers and seven-flower stealing can win; complete dragon/wind sets are special hands. Seven pairs is off. For `u = 2^min(tai, 5)`, discard payments are `2u/u/u`; self-draw is `2u/2u/2u`. Thirteen Wonders uses self-draw payments even on a discard. [Singapore source](https://singaporemahjong.com/rules/).

The source leaves some details ambiguous. Four Winds makes distinct bonus events cumulative, gives concealed kongs no immediate payment, and reads the malformed little-winds description as three wind sets plus the fourth wind pair. These choices define **Singapore v1**; house edits create a different profile.

## Deliberate online adaptations

- The server chooses the highest configured claim priority, then the **earliest valid server-received click** at that priority. There is one winner. This replaces seat-order ties and EMA multiple ron. Riichi's default gives meld calls equal priority, following EMA's current first-call treatment; wins still precede melds.
- The server handles wall operations, legal declarations, replacements, timeouts, and settlements. Physical tournament seat swaps and referee penalties are not modeled.
- Points and optional fake chips are play ledgers, with no payments, real-money wagering, or cash-out.

See [the implementation appendix](rules-implementation.md) for scoring adapters, supported edge cases, explicit house-rule behavior, and verification limits.
