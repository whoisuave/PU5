# PU5 — BlackJack Pick-Up 5 (All Saints Rules)

A browser card game: you against 1–5 CPU players. The first player to run out of cards wins.

## Play

Open `index.html` in any browser. No install or server is needed.

- Tap cards in the order you want to play them. They appear in the staging row.
- Press **Play**. Tap a staged card to take it (and every card after it) back.
- Press **Pick up**, or tap the pickup deck, if you can't or don't want to play.
- **Hint** stages the move the CPU would make for you.
- Cards you can legally play next have a gold outline.

Run `npm run build` to make `dist/pu5.html`, a single file that holds the whole game, for sharing. `node scripts/build-single.js --artifact` writes the same game without the page wrapper, for hosts that add their own.

## Rules

| Card | Effect |
|---|---|
| **A** | Can be played at any time, including as the last card of any run. You pick the new suit. |
| **2** | The next player picks up 2. |
| **7** | Everyone passes their hand anticlockwise. |
| **8** | Skips the next player. |
| **Black J** | The next player picks up 5. With more than one deck, they pick up the starting hand size instead. |
| **Red J** | Cancels a pick-up that's in play. It still has to match the pile, and you can't go out on it. |
| **Q** | Only goes on her own suit or another Queen. She must be covered by her suit or another Queen. If you can't cover her, you pick up 1. |
| **K** | Reverses direction. Play starts clockwise. |

- **Matching:** the first card you play must match the suit (or the suit an Ace called) or the number/letter on the pile.
- **Runs:** after the first card, each card must go up or down by one from the card before it, e.g. 4 → 5 → 4 → 3. A covering Queen is the one exception.
- **In play:** after a 2 or black Jack, the deck is hot. The next player must either stack a 2 or black Jack (the total keeps growing, so 2 then black Jack means pick up 7), cancel with a red Jack, or pick up the whole stack. A response run that ends on a card that isn't a pick-up card (e.g. 2 → 3) also cancels the stack.
- **Can't play:** pick up one card and lose your turn.
- **Setup:** the dealer is random. The player to the dealer's left starts. If the starting card is a power card, it is buried at a random spot in the pickup deck and a new card is turned over.
- **Reshuffle:** when the pickup deck runs out, the dealer keeps the top card of the play pile and shuffles the rest back into the pickup deck.

### How some rules were read

These parts of the written rules could be read more than one way. Each one is a single setting in `DEFAULT_CONFIG` in `src/engine.js`, or a small code change.

- **Only the last card of a run takes effect.** For example, 8 → 7 → 8 skips one player, and 2 → 3 cancels the pick-up. This follows "play any pick up card then a card that can orderly be placed after it… the effects are nullified".
- **Red Jack must still match the pile.** It isn't wild ("so long as… the syntax is correct"), and you can't finish on it (`noFinishOnRedJack`).
- **Same number in a run is off by default.** You can turn on 4♠ 4♥ in the setup screen (`sameRankRuns`).
- **An Ace can end any run.** For example, 5 → 6 → A (`aceEndsAnyRun`).
- **An uncovered Queen costs 1 card** (`queenPenalty`). Your turn then ends, so you can never go out on a Queen.
- **With 2 players, K only flips direction.** It has no extra skip effect.

## Adding rules

All game logic lives in `src/engine.js`. It is pure JavaScript with no browser code:

- `canStart` decides what may start a play.
- `canFollow` decides what may follow within a run.
- `playCards` applies card effects (see the `switch (last.rank)` block).
- `pickUp` handles passing and picking up.

The CPU logic is in `src/ai.js`, and the UI is in `src/ui.js`.

```
npm test   # rules tests (Node 18+), including 40 full CPU-vs-CPU games
```
