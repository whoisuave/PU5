/*
 * PU5 (BlackJack Pick-Up 5) rules engine — All Saints Rules.
 *
 * Pure game logic with no DOM access, so it runs in the browser (as the
 * global `PU5`) and in Node (via require) for tests.
 *
 * Every house rule that has more than one sensible reading lives in
 * DEFAULT_CONFIG so new rules can be switched on without touching the engine.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PU5 = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SUITS = ['S', 'H', 'D', 'C'];
  const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const SUIT_NAME = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
  const RANK_LABEL = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

  const ACE = 1, TWO = 2, SEVEN = 7, EIGHT = 8, JACK = 11, QUEEN = 12, KING = 13;
  const POWER_RANKS = [ACE, TWO, SEVEN, EIGHT, JACK, QUEEN, KING];

  const DEFAULT_CONFIG = {
    numDecks: 1,
    handSize: 7,
    // Allow a run to repeat the same rank (e.g. 4♠ 4♥) as well as step ±1.
    sameRankRuns: false,
    // An Ace may end any run ("Ace can be put down at any time").
    aceEndsAnyRun: true,
    // You can't go out on a red Jack.
    noFinishOnRedJack: true,
    // Cards picked up when you can't cover your own Queen.
    queenPenalty: 1,
    // All Saints II: while the deck is in play, a pick-up card followed by an
    // in-order run cancels it, e.g. (red J, 10), (2, 3), (black J, Q, cover).
    // Off = standard All Saints: only a red Jack cancels, so a response run
    // must end on a 2, black Jack or red Jack.
    comboCancel: false,
  };

  const isRed = (c) => c.suit === 'H' || c.suit === 'D';
  const isRedJack = (c) => c.rank === JACK && isRed(c);
  const isBlackJack = (c) => c.rank === JACK && !isRed(c);
  const isPickupCard = (c) => c.rank === TWO || isBlackJack(c);
  const isPowerCard = (c) => POWER_RANKS.includes(c.rank);

  function cardLabel(c) {
    return (RANK_LABEL[c.rank] || String(c.rank)) + SUIT_SYMBOL[c.suit];
  }

  function blackJackPenalty(config) {
    return config.numDecks > 1 ? config.handSize : 5;
  }

  function pickupValue(c, config) {
    if (c.rank === TWO) return 2;
    if (isBlackJack(c)) return blackJackPenalty(config);
    return 0;
  }

  // Seeded RNG (mulberry32) so games and tests can be reproduced.
  function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function buildDeck(numDecks) {
    const cards = [];
    for (let d = 0; d < numDecks; d++) {
      for (const suit of SUITS) {
        for (let rank = 1; rank <= 13; rank++) {
          cards.push({ id: `${rank}${suit}${d}`, rank, suit });
        }
      }
    }
    return cards;
  }

  /*
   * players: [{ name, isHuman }] in clockwise seating order.
   * options.dealer: seat index of the dealer (random if omitted).
   */
  function createGame(players, config = {}, options = {}) {
    const cfg = Object.assign({}, DEFAULT_CONFIG, config);
    const rng = options.rng || makeRng(options.seed ?? Date.now());
    const n = players.length;
    if (n < 2) throw new Error('PU5 needs at least 2 players');
    if (n * cfg.handSize >= cfg.numDecks * 52) throw new Error('Not enough cards for that many players');

    const state = {
      config: cfg,
      rng,
      players: players.map((p, i) => ({ id: i, name: p.name, isHuman: !!p.isHuman, hand: [] })),
      drawPile: shuffle(buildDeck(cfg.numDecks), rng),
      discard: [],
      activeSuit: null,
      direction: 1, // 1 = clockwise, -1 = anticlockwise
      dealer: options.dealer ?? Math.floor(rng() * n),
      current: 0,
      pending: 0, // cards stacked "in play"
      winner: null,
      log: [],
    };

    for (let r = 0; r < cfg.handSize; r++) {
      for (let k = 1; k <= n; k++) {
        state.players[(state.dealer + k) % n].hand.push(state.drawPile.pop());
      }
    }

    // The dealer can't start on a power card: bury it at random and flip again.
    let start = state.drawPile.pop();
    while (isPowerCard(start)) {
      const pos = Math.floor(rng() * (state.drawPile.length + 1));
      state.drawPile.splice(pos, 0, start);
      start = state.drawPile.pop();
    }
    state.discard.push(start);
    state.activeSuit = start.suit;
    state.current = (state.dealer + 1) % n; // left of the dealer starts
    log(state, `${state.players[state.dealer].name} deals. Starting card: ${cardLabel(start)}.`);
    log(state, `${state.players[state.current].name} goes first.`);
    return state;
  }

  function log(state, msg) {
    state.log.push(msg);
  }

  // "Kofi plays" vs "You play".
  function act(player, third, second) {
    return `${player.name} ${player.name === 'You' ? second : third}`;
  }

  const topCard = (state) => state.discard[state.discard.length - 1];

  function nextSeat(state, from, steps = 1) {
    const n = state.players.length;
    return (((from + state.direction * steps) % n) + n) % n;
  }

  // Does this card legally start a play on the current pile?
  function canStart(state, card) {
    const top = topCard(state);
    const matches = card.suit === state.activeSuit || card.rank === top.rank;
    if (state.pending > 0) {
      // Deck is hot: only stack another pick-up or cancel with a red Jack.
      return (isPickupCard(card) || isRedJack(card)) && matches;
    }
    return card.rank === ACE || matches;
  }

  // Can `next` follow `prev` within one turn's run?
  function canFollow(config, prev, next, isLast) {
    if (prev.rank === QUEEN) return next.suit === prev.suit || next.rank === QUEEN;
    const diff = Math.abs(next.rank - prev.rank);
    if (diff === 1) return true;
    if (diff === 0 && config.sameRankRuns) return true;
    if (next.rank === ACE && isLast && config.aceEndsAnyRun) return true;
    return false;
  }

  /*
   * Validate a run of cards (in play order) for the current player.
   * Returns { ok: true } or { ok: false, reason }.
   */
  function validatePlay(state, seat, cards) {
    if (state.winner !== null) return fail('The game is over.');
    if (seat !== state.current) return fail("It's not your turn.");
    if (!cards.length) return fail('Pick at least one card.');
    const hand = state.players[seat].hand;
    const ids = new Set();
    for (const c of cards) {
      if (ids.has(c.id)) return fail('A card was selected twice.');
      ids.add(c.id);
      if (!hand.some((h) => h.id === c.id)) return fail(`${cardLabel(c)} isn't in your hand.`);
    }
    if (!canStart(state, cards[0])) {
      if (state.pending > 0) {
        return fail(`The deck is in play (${state.pending}). Stack a 2 or black Jack, cancel with a red Jack, or pick up.`);
      }
      if (cards[0].rank === QUEEN) return fail('A Queen must go on her own suit or another Queen.');
      return fail(`${cardLabel(cards[0])} doesn't match the suit or number on the pile.`);
    }
    for (let i = 1; i < cards.length; i++) {
      if (!canFollow(state.config, cards[i - 1], cards[i], i === cards.length - 1)) {
        if (cards[i - 1].rank === QUEEN) {
          return fail(`Your ${cardLabel(cards[i - 1])} must be covered by the same suit or another Queen.`);
        }
        return fail(`${cardLabel(cards[i])} can't follow ${cardLabel(cards[i - 1])}: runs must go up or down in order.`);
      }
    }
    const last = cards[cards.length - 1];
    return checkEnding(state, cards, hand.length);
  }

  // Rules about how a run may end, shared by validatePlay and legalPlays.
  function checkEnding(state, cards, handLength) {
    const last = cards[cards.length - 1];
    if (state.pending > 0 && !state.config.comboCancel && !isPickupCard(last) && !isRedJack(last)) {
      return fail('Only a red Jack cancels in this mode: end your run on a 2, black Jack or red Jack, or pick up.');
    }
    if (state.config.noFinishOnRedJack && cards.length === handLength && isRedJack(last)) {
      return fail("You can't finish on a red Jack.");
    }
    return { ok: true };
  }

  function fail(reason) {
    return { ok: false, reason };
  }

  /*
   * Play a run. `chosenSuit` is required when the run ends on an Ace.
   * Mutates state and returns { ok, reason? }.
   */
  function playCards(state, seat, cardIds, chosenSuit) {
    const hand = state.players[seat].hand;
    const cards = cardIds.map((id) => hand.find((c) => c.id === id) || { id, rank: 0, suit: '?' });
    const check = validatePlay(state, seat, cards);
    if (!check.ok) return check;
    const last = cards[cards.length - 1];
    if (last.rank === ACE && !SUITS.includes(chosenSuit)) return fail('Choose a suit for your Ace.');

    const player = state.players[seat];
    player.hand = hand.filter((c) => !cardIds.includes(c.id));
    state.discard.push(...cards);
    log(state, `${act(player, 'plays', 'play')} ${cards.map(cardLabel).join(' ')}.`);

    const wasInPlay = state.pending > 0;
    state.activeSuit = last.rank === ACE ? chosenSuit : last.suit;
    if (last.rank === ACE) log(state, `${act(player, 'changes', 'change')} the suit to ${SUIT_NAME[chosenSuit]} ${SUIT_SYMBOL[chosenSuit]}.`);

    if (player.hand.length === 0 && last.rank !== QUEEN) {
      state.winner = seat;
      log(state, `${act(player, 'is', 'are')} out of cards and ${player.name === 'You' ? 'win' : 'wins'}! 🎉`);
      return { ok: true };
    }

    let skip = 1;
    if (isPickupCard(last)) {
      state.pending += pickupValue(last, state.config);
      log(state, `In play! Next player picks up ${state.pending} unless they stack or cancel.`);
    } else if (wasInPlay) {
      state.pending = 0;
      log(state, isRedJack(last) ? 'Red Jack cancels the pick-up.' : 'Combo! The pick-up is cancelled.');
    }

    switch (last.rank) {
      case SEVEN:
        rotateHands(state);
        log(state, 'Seven! Everyone passes their hand anticlockwise.');
        break;
      case EIGHT:
        skip = 2;
        log(state, `Eight! ${act(state.players[nextSeat(state, seat)], 'is', 'are')} skipped.`);
        break;
      case KING:
        state.direction *= -1;
        log(state, `King! Play is now ${state.direction === 1 ? 'clockwise' : 'anticlockwise'}.`);
        break;
      case QUEEN: {
        const got = drawCards(state, seat, state.config.queenPenalty);
        log(state, `${player.name} couldn't cover ${player.name === 'You' ? 'your' : 'their'} Queen and ${player.name === 'You' ? 'pick' : 'picks'} up ${got}.`);
        break;
      }
    }

    state.current = nextSeat(state, seat, skip);
    return { ok: true };
  }

  // Each player passes their hand to the next seat anticlockwise.
  function rotateHands(state) {
    const n = state.players.length;
    const hands = state.players.map((p) => p.hand);
    for (let i = 0; i < n; i++) {
      state.players[(i - 1 + n) % n].hand = hands[i];
    }
  }

  // Keep the top card; shuffle the rest of the play pile into the pickup deck.
  function reshuffle(state) {
    if (state.discard.length <= 1) return false;
    const top = state.discard.pop();
    state.drawPile = shuffle(state.discard.concat(state.drawPile), state.rng);
    state.discard = [top];
    log(state, `${state.players[state.dealer].name} (dealer) reshuffles the play pile into the pickup deck.`);
    return true;
  }

  function drawCards(state, seat, count) {
    let got = 0;
    for (let i = 0; i < count; i++) {
      if (!state.drawPile.length && !reshuffle(state)) break;
      state.players[seat].hand.push(state.drawPile.pop());
      got++;
    }
    return got;
  }

  /*
   * The current player passes: picks up the in-play stack if the deck is hot,
   * otherwise picks up one card and loses the turn.
   */
  function pickUp(state, seat) {
    if (state.winner !== null) return fail('The game is over.');
    if (seat !== state.current) return fail("It's not your turn.");
    const player = state.players[seat];
    if (state.pending > 0) {
      const got = drawCards(state, seat, state.pending);
      log(state, `${act(player, 'picks', 'pick')} up ${got}.`);
      state.pending = 0;
    } else {
      const got = drawCards(state, seat, 1);
      log(state, got ? `${act(player, 'picks', 'pick')} up a card and ${player.name === 'You' ? 'skip' : 'skips'}.` : `${player.name} can't pick up (deck empty).`);
    }
    state.current = nextSeat(state, seat);
    return { ok: true };
  }

  /*
   * Every legal run for a seat (capped). Used by the CPU and for hints.
   */
  function legalPlays(state, seat, limit = 4000) {
    const hand = state.players[seat].hand;
    const results = [];
    const cfg = state.config;

    function finish(run) {
      if (checkEnding(state, run, hand.length).ok) results.push(run.slice());
    }

    function extend(run, used) {
      if (results.length >= limit) return;
      finish(run);
      const prev = run[run.length - 1];
      for (const c of hand) {
        if (used.has(c.id)) continue;
        // Ace-as-wildcard only applies when it is the final card.
        const asLast = canFollow(cfg, prev, c, true);
        const asMiddle = canFollow(cfg, prev, c, false);
        if (!asLast) continue;
        run.push(c);
        used.add(c.id);
        if (asMiddle) extend(run, used);
        else finish(run);
        run.pop();
        used.delete(c.id);
      }
    }

    for (const c of hand) {
      if (canStart(state, c)) extend([c], new Set([c.id]));
    }
    return results;
  }

  return {
    SUITS, SUIT_SYMBOL, SUIT_NAME, DEFAULT_CONFIG,
    ACE, TWO, SEVEN, EIGHT, JACK, QUEEN, KING,
    isRed, isRedJack, isBlackJack, isPickupCard, isPowerCard,
    cardLabel, pickupValue, blackJackPenalty,
    makeRng, shuffle, buildDeck,
    createGame, topCard, nextSeat, canStart, canFollow,
    validatePlay, playCards, pickUp, legalPlays, reshuffle, rotateHands,
  };
});
