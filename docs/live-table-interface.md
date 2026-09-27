# Live table interface

The live screen uses the authoritative `GameView`. Its public events supply Recent activity;
player discards supply the ledger. The screenshots used for layout direction supply no game data.

## Controls and status

- **Recent activity:** the latest discard keeps its tile face and player name through subsequent
  draws and calls. Last Turn shows the latest player event. Activate the heading to read the
  latest 12 public events. Close with the close button or Escape. The complete Game log remains
  in the toolbar.
- **Discard ledger:** closed when entering the table. Activate its labeled stack button to open
  or close it; its badge counts recorded discards, including called tiles. The panel groups
  counts by tile, gives the contributing seat winds, and marks called tiles now in exposed melds.
  Close also works with the close button or Escape. Hover and focus leave it closed. Only one
  activity/ledger panel opens at a time, and neither overlays the input rack.
- **Hand analysis:** declared meld count, suit composition, and current seat wind are read-only.
  **Inspect hand** retains the existing hand overview and Winning routes dialog.
- **Sort tiles:** restores suit/rank order in the existing local rack. It is a single action,
  so its icon shows sorting rather than suggesting a menu. New draws still sort automatically;
  drag and Alt+Left/Right still rearrange physical tile IDs locally.
- **Queue discards:** enter selection mode, select tiles in order, then press **Done queueing**.
  The count, numbered rack marks, and queue tray track the same private queue. Tap a tray tile
  to remove it or use Clear. Leaving selection mode arms the existing automatic discard behavior:
  only the first queued tile can play, when legal on your turn, once per decision; win and kong options
  pause it. Reconnection and hand changes retain their existing queue reset behavior. Entering
  queue mode clears a prior manual selection so the discard button cannot target an old tile.
- **Discard selected tile:** appears only during your discard turn. Select a playable rack tile
  to enable it; the helper names the selected tile. The existing decision ID and legal action
  are sent to the server, including riichi when declared. Claim, win, and readiness actions keep
  their existing handlers.

## Components

- `client/main.ts`: room shell, player cards, Recent activity, ledger, hand status, and actions.
- `client/social.ts`: queue presentation and focus retention around the existing queue logic.
- `client/live-table.css`: live layout, panels, control states, and responsive theme styles.
- `client/hand-rack.ts` and `client/table.ts`: existing interactive rack and Three.js scene,
  reused without duplicating the hand or exposing opponents’ private tiles.

The desktop dock shares a heading row to give the board more height. Compact screens reserve
space for the table tools; the game frame scrolls to additional controls and exposed tiles.
Very narrow phones use six rack columns to preserve 44-pixel tile targets. The two existing
appearance themes use their own surface, text, and accent variables.

## Verification

`tests/browser/live-ux.spec.ts` checks public data, explicit opening and closing, keyboard focus,
read-only analysis, real sorting/selection/discard, touch target sizes, panel/rack separation,
both themes, and all three rulesets. `tests/mobile/live-ux.spec.ts` checks activity and ledger
activation and the private queue through a real server discard on Android Chromium and iPhone
WebKit. Existing suites also cover all four board hands, claims, tooltips, multiplayer state,
reconnects, winning routes, readiness, and local appearance preferences.
