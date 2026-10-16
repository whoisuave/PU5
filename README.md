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
| **Red J** | Cancels a pick-up that's in play. It still has to match the pile. |
| **Q** | Only goes on her own suit or another Queen. She must be covered by her suit or another Queen. If you can't cover her, you pick up 1. |
| **K** | Reverses direction. Play starts clockwise. |

- **Matching:** the first card you play must match the suit (or the suit an Ace called) or the number/letter on the pile.
- **Runs:** after the first card, each card must match the card before it by suit or number, and go in order. That means either the same number in any suit, or the same suit one up or down. For example, 5♦ → 5♠ → 5♣ → 6♣ works, and so does 4♥ → 5♥ → 4♥ (with 2 decks) or 4♥ → 5♥ → 5♠ → 4♠. 8♥ → 9♣ doesn't: different suit and different number. A covering Queen is the one exception: anything of her suit, or another Queen.
- **In play:** after a 2 or black Jack, the deck is hot. The next player must either stack a 2 or black Jack (the total keeps growing, so 2 then black Jack means pick up 7), cancel with a red Jack, or pick up the whole stack. A response run must end on a 2, black Jack or red Jack.
- **Can't play:** pick up one card and lose your turn.
- **Last cards:** if the cards left in your hand after a play could all go down together on your next turn, you must call "Last cards!" (press the button before Play). That can be one card or several, e.g. 9♦ 9♣ 10♣. It doesn't have to match the pile yet, but it has to end on a plain card, since you can't go out on a power card. If you don't call, you pick up a penalty: 2 by default, and you can pick 1, 2 or 5 on the setup screen (`lastCardPenalty`). CPUs forget now and then too. A player who called shows a LAST CARDS tag until their next turn.
- **Power cards can't start or finish the game:** the dealt starting card is never a power card, and you can't go out on one (A, 2, 7, 8, J, Q, K). A power card in the middle of your last run is fine. The first card played after the deal can be a power card, e.g. on 3♣ you can play Q♣ then 4♣ (`noFinishOnPowerCard`).
- **Setup:** the dealer is random. The player to the dealer's left starts. If the starting card is a power card, it is buried at a random spot in the pickup deck and a new card is turned over.
- **Reshuffle:** when the pickup deck runs out, the dealer keeps the top card of the play pile and shuffles the rest back into the pickup deck.

### Rules modes

Pick the mode on the setup screen.

- **All Saints:** the standard rules. Only a red Jack cancels a pick-up that's in play.
- **All Saints II:** you can also cancel with a combo. Start with any pick-up power card (2, black Jack or red Jack) and carry on with a run in order. Examples: (red J, 10), (2, 3), (black J, Q, cover). The first card must still match the pile. This is `comboCancel` in `DEFAULT_CONFIG`.

### How some rules were read

These parts of the written rules could be read more than one way. Each one is a single setting in `DEFAULT_CONFIG` in `src/engine.js`, or a small code change.

- **Only the last card of a run takes effect.** For example, 8 → 7 → 8 skips one player, and in All Saints II, 2 → 3 cancels the pick-up.
- **Red Jack must still match the pile.** It isn't wild ("so long as… the syntax is correct").
- **An Ace can end any run.** For example, 5 → 6 → A (`aceEndsAnyRun`).
- **An uncovered Queen costs 1 card** (`queenPenalty`). Your turn then ends.
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
