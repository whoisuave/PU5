/*
 * Simple CPU opponent for PU5. Picks the best-scoring legal run, or picks up.
 */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./engine.js') : root.PU5);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PU5AI = api;
})(typeof self !== 'undefined' ? self : this, function (PU5) {
  'use strict';

  const CPU_FORGET_LAST_CARD = 0.15;

  function favouriteSuit(hand) {
    const counts = { S: 0, H: 0, D: 0, C: 0 };
    for (const c of hand) if (c.rank !== PU5.ACE) counts[c.suit]++;
    return PU5.SUITS.reduce((best, s) => (counts[s] > counts[best] ? s : best), 'S');
  }

  function scoreRun(state, seat, run) {
    const hand = state.players[seat].hand;
    const last = run[run.length - 1];
    const remaining = hand.length - run.length;
    let score = run.length * 10;

    if (remaining === 0 && last.rank !== PU5.QUEEN) return 1e6; // going out wins
    if (last.rank === PU5.QUEEN) score -= 25; // uncovered queen costs a card
    // Hold Aces and red Jacks back unless they make a long run.
    for (const c of run) {
      if (c.rank === PU5.ACE && run.length === 1) score -= 6;
      if (PU5.isRedJack(c) && state.pending === 0) score -= 4;
    }
    const next = state.players[PU5.nextSeat(state, seat)];
    if (PU5.isPickupCard(last)) score += next.hand.length <= 3 ? 12 : 6;
    if (last.rank === PU5.EIGHT && next.hand.length <= 3) score += 8;
    if (last.rank === PU5.SEVEN) {
      // Hands move anticlockwise: we receive the hand of the seat clockwise of us.
      const n = state.players.length;
      const incoming = state.players[(seat + 1) % n].hand.length;
      score += (remaining - incoming) * 4;
    }
    return score;
  }

  /* Returns { type: 'play', cardIds, suit } or { type: 'pickup' }. */
  function chooseMove(state, seat) {
    const plays = PU5.legalPlays(state, seat);
    if (!plays.length) return { type: 'pickup' };
    let best = null;
    let bestScore = -Infinity;
    for (const run of plays) {
      const s = scoreRun(state, seat, run) + state.rng() * 2;
      if (s > bestScore) {
        bestScore = s;
        best = run;
      }
    }
    // A lone Ace/queen with nothing better isn't worth it when the deck isn't hot.
    if (bestScore < 0 && state.pending === 0) return { type: 'pickup' };
    const remainingHand = state.players[seat].hand.filter((c) => !best.includes(c));
    return {
      type: 'play',
      cardIds: best.map((c) => c.id),
      suit: favouriteSuit(remainingHand.length ? remainingHand : best),
      // CPUs occasionally forget to call last cards, like people do.
      calledLastCard: PU5.mustCallLastCards(state.config, remainingHand) && state.rng() > CPU_FORGET_LAST_CARD,
    };
  }

  return { chooseMove, scoreRun, favouriteSuit };
});
