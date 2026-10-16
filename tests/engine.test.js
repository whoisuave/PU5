const test = require('node:test');
const assert = require('node:assert/strict');
const PU5 = require('../src/engine.js');
const AI = require('../src/ai.js');

const c = (label) => {
  const m = /^(A|J|Q|K|\d+)([SHDC])(\d?)$/.exec(label);
  const rank = { A: 1, J: 11, Q: 12, K: 13 }[m[1]] || Number(m[1]);
  return { id: label, rank, suit: m[2] };
};

// A 3-player table with fixed hands and pile; seat 0 to play.
function table({ hands, top, pending = 0, config = {}, deck = ['3C', '4C', '5C', '6C', '9C', '10C'] }) {
  const players = hands.map((_, i) => ({ name: `P${i}` }));
  const state = PU5.createGame(players, config, { seed: 1, dealer: hands.length - 1 });
  state.players.forEach((p, i) => (p.hand = hands[i].map(c)));
  state.discard = [c(top)];
  state.activeSuit = c(top).suit;
  state.drawPile = deck.map(c);
  state.pending = pending;
  state.current = 0;
  return state;
}

const play = (s, seat, labels, suit) => PU5.playCards(s, seat, labels, suit);

test('deal: hand sizes, left of dealer starts, never a power start card', () => {
  for (let seed = 1; seed < 200; seed++) {
    const s = PU5.createGame([{ name: 'a' }, { name: 'b' }, { name: 'c' }], {}, { seed });
    assert.ok(s.players.every((p) => p.hand.length === 7));
    assert.equal(s.current, (s.dealer + 1) % 3);
    assert.equal(PU5.isPowerCard(PU5.topCard(s)), false);
    assert.equal(s.drawPile.length + s.discard.length + 21, 52);
  }
});

test('must match suit or number', () => {
  const s = table({ hands: [['5H', '9S', '3D'], ['4C'], ['4C1']], top: '5S' });
  assert.equal(PU5.validatePlay(s, 0, [c('9S')]).ok, true);
  assert.equal(PU5.validatePlay(s, 0, [c('5H')]).ok, true);
  assert.equal(PU5.validatePlay(s, 0, [c('3D')]).ok, false);
});

test('runs go up/down in order and may change direction (4,5,4)', () => {
  const s = table({ hands: [['4S', '5S', '4S1', '9C', '6S', '4D'], ['4C'], ['4C1']], top: '4C2', config: { numDecks: 2 } });
  assert.equal(PU5.validatePlay(s, 0, ['4S', '5S', '4S1'].map(c)).ok, true);
  assert.equal(PU5.validatePlay(s, 0, ['4S', '5S', '6S'].map(c)).ok, true);
  assert.equal(PU5.validatePlay(s, 0, ['4S', '9C'].map(c)).ok, false);
  assert.equal(PU5.validatePlay(s, 0, ['4D', '5S'].map(c)).ok, false);
  s.config.sameRankRuns = false;
  assert.equal(PU5.validatePlay(s, 0, ['4S', '4D'].map(c)).ok, false);
});

test('each step must share suit or number with the card before it', () => {
  const s = table({ hands: [['8H', '9C', '9H', '9D', '10D', '7H'], ['4C'], ['4H']], top: '8D' });
  assert.equal(PU5.validatePlay(s, 0, ['8H', '9C'].map(c)).ok, false); // different suit and number
  assert.equal(PU5.validatePlay(s, 0, ['8H', '9H', '9C'].map(c)).ok, true);
  assert.equal(PU5.validatePlay(s, 0, ['8H', '9H', '9D', '10D'].map(c)).ok, true);
  assert.equal(PU5.validatePlay(s, 0, ['8H', '7H'].map(c)).ok, true);
});

test('same number in any suit continues a run (5♦ 5♠ 5♣ 6♣)', () => {
  const s = table({ hands: [['5S', '5C', '6C', '6H', '9D'], ['4C'], ['4C1']], top: '5D' });
  assert.equal(PU5.validatePlay(s, 0, ['5S', '5C', '6C'].map(c)).ok, true);
  assert.equal(PU5.validatePlay(s, 0, ['5S', '5C', '6C', '6H'].map(c)).ok, true);
  assert.equal(play(s, 0, ['5S', '5C', '6C', '6H']).ok, true);
  assert.equal(s.activeSuit, 'H');
});

test('ace can be played any time and changes the suit', () => {
  const s = table({ hands: [['AD', '9C'], ['4C'], ['4C1']], top: '5S' });
  assert.equal(play(s, 0, ['AD']).ok, false); // needs a suit
  assert.equal(play(s, 0, ['AD'], 'C').ok, true);
  assert.equal(s.activeSuit, 'C');
  assert.equal(s.current, 1);
});

test('ace can end any run', () => {
  const s = table({ hands: [['5S', '6S', 'AH', '9D'], ['4C'], ['4C1']], top: '5C' });
  assert.equal(PU5.validatePlay(s, 0, ['5S', '6S', 'AH'].map(c)).ok, true); // A ends any run
  assert.equal(PU5.validatePlay(s, 0, ['5S', 'AH', '9D'].map(c)).ok, false);
});

test('2 is pick up two; next player can pick up', () => {
  const s = table({ hands: [['2S', '9D'], ['4D', '5D'], ['4H']], top: '5S' });
  assert.equal(play(s, 0, ['2S']).ok, true);
  assert.equal(s.pending, 2);
  assert.equal(PU5.validatePlay(s, 1, [c('4D')]).ok, false);
  PU5.pickUp(s, 1);
  assert.equal(s.players[1].hand.length, 4);
  assert.equal(s.pending, 0);
  assert.equal(s.current, 2);
});

test('black jack on a 2 stacks to 7; red jack cancels', () => {
  const s = table({ hands: [['2S', '9D'], ['JS', '5D'], ['JH', 'JD', '4H']], top: '5S' });
  play(s, 0, ['2S']);
  assert.equal(play(s, 1, ['JS']).ok, true);
  assert.equal(s.pending, 7);
  assert.equal(play(s, 2, ['JH']).ok, true);
  assert.equal(s.pending, 0);
});

test('black jack is pick up hand-size with more than one deck', () => {
  const s = table({ hands: [['JC', '9D'], ['4D'], ['4H']], top: '5C', config: { numDecks: 2, handSize: 9 } });
  play(s, 0, ['JC']);
  assert.equal(s.pending, 9);
});

test('standard mode: only a red Jack cancels, so combos are rejected', () => {
  const s = table({ hands: [['2S', '9D'], ['JH', '10H', '2H', '3H', '2C'], ['4H']], top: '5S' });
  play(s, 0, ['2S']);
  s.discard.push(c('2D')); // so the red Jack matches by suit
  s.activeSuit = 'H';
  assert.equal(PU5.validatePlay(s, 1, ['2H', '3H'].map(c)).ok, false);
  assert.equal(PU5.validatePlay(s, 1, ['JH', '10H'].map(c)).ok, false);
  assert.equal(PU5.validatePlay(s, 1, ['2H', '3H', '2C'].map(c)).ok, false); // 3♥ → 2♣ shares nothing
  assert.equal(PU5.validatePlay(s, 1, ['2C', '2H'].map(c)).ok, true); // still ends hot
  assert.equal(PU5.validatePlay(s, 1, [c('JH')]).ok, true);
  assert.ok(PU5.legalPlays(s, 1).every((run) => ['2H', '2C', 'JH'].includes(run[run.length - 1].id)));
});

test('All Saints II: red J + 10 combo cancels', () => {
  const s = table({ hands: [['2H', '9D'], ['JH', '10H', '10S', '5D'], ['4H']], top: '5H', config: { comboCancel: true } });
  play(s, 0, ['2H']);
  assert.equal(PU5.validatePlay(s, 1, ['JH', '10S'].map(c)).ok, false);
  assert.equal(play(s, 1, ['JH', '10H', '10S']).ok, true);
  assert.equal(s.pending, 0);
  assert.equal(s.activeSuit, 'S');
});

test('All Saints II: black J, Q, cover combo cancels', () => {
  const s = table({ hands: [['2S', '9D'], ['JS', 'QS', '4S', '8C'], ['4H']], top: '5S', config: { comboCancel: true } });
  play(s, 0, ['2S']);
  assert.equal(play(s, 1, ['JS', 'QS', '4S']).ok, true);
  assert.equal(s.pending, 0);
  assert.equal(s.current, 2);
});

test('All Saints II: a pick-up card followed by a run card nullifies the stack', () => {
  const s = table({ hands: [['2S', '9D'], ['JS', '2H', '3H', '8C'], ['4H']], top: '5S', config: { comboCancel: true } });
  play(s, 0, ['2S']);
  assert.equal(play(s, 1, ['2H', '3H']).ok, true);
  assert.equal(s.pending, 0);
  assert.equal(s.current, 2);
});

test('8 skips the next player, K reverses', () => {
  const s = table({ hands: [['8S', '9D'], ['4D'], ['4H'], ['KD', '3C']], top: '5S' });
  play(s, 0, ['8S']);
  assert.equal(s.current, 2);
  s.current = 3;
  s.activeSuit = 'D';
  play(s, 3, ['KD']);
  assert.equal(s.direction, -1);
  assert.equal(s.current, 2);
});

test('7 passes hands anticlockwise', () => {
  const s = table({ hands: [['7S', '9D'], ['4D', '4S'], ['4H', '5H', '6H']], top: '5S' });
  PU5.playCards(s, 0, ['7S'], undefined, { calledLastCard: true });
  assert.deepEqual(s.players[0].hand.map((x) => x.id), ['4D', '4S']);
  assert.deepEqual(s.players[1].hand.map((x) => x.id), ['4H', '5H', '6H']);
  assert.deepEqual(s.players[2].hand.map((x) => x.id), ['9D']);
});

test('queen must be played on her suit or a queen, and covered', () => {
  const s = table({ hands: [['QD', 'QH', '3H', '9C'], ['4D'], ['4H']], top: '5S' });
  assert.equal(PU5.validatePlay(s, 0, [c('QD')]).ok, false);
  s.activeSuit = 'D';
  s.discard = [c('5D')];
  assert.equal(PU5.validatePlay(s, 0, ['QD', 'QH', '3H'].map(c)).ok, true);
  assert.equal(PU5.validatePlay(s, 0, ['QD', '9C'].map(c)).ok, false);
  // Uncovered queen: pick up a card.
  play(s, 0, ['QD']);
  assert.equal(s.players[0].hand.length, 4);
});

test("can't finish on a power card", () => {
  for (const last of ['JH', 'JS', 'AH', '2H', '7H', '8H', 'KH', 'QH']) {
    const s = table({ hands: [[last], ['4D'], ['4H']], top: '5H' });
    assert.equal(PU5.validatePlay(s, 0, [c(last)]).ok, false, last);
    assert.equal(PU5.legalPlays(s, 0).length, 0, last);
  }
  // A power card is fine mid-run as long as the run ends on a plain card.
  const s = table({ hands: [['8H', '9H'], ['4D'], ['4H']], top: '5H' });
  assert.equal(play(s, 0, ['8H', '9H']).ok, true);
  assert.equal(s.winner, 0);
});

test('the first card played on the dealt card can be a power card (3♣ then Q♣ 4♣)', () => {
  const s = table({ hands: [['QC', '4C', '9D'], ['4D'], ['4H']], top: '3C' });
  assert.equal(PU5.playCards(s, 0, ['QC', '4C'], undefined, { calledLastCard: true }).ok, true);
  assert.equal(PU5.topCard(s).id, '4C');
  assert.equal(s.players[0].hand.length, 1);
});

test('playing your last card wins', () => {
  const s = table({ hands: [['6S'], ['4D'], ['4H']], top: '5S' });
  play(s, 0, ['6S']);
  assert.equal(s.winner, 0);
});

test('reshuffle keeps the top card', () => {
  const s = table({ hands: [['9D'], ['4D'], ['4H']], top: '5S', deck: [] });
  s.discard = ['3S', '4S', '5S'].map(c);
  PU5.pickUp(s, 0);
  assert.equal(s.discard.length, 1);
  assert.equal(PU5.topCard(s).id, '5S');
  assert.equal(s.players[0].hand.length, 2);
});

test('legalPlays only returns valid runs and AI games finish', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const players = [0, 1, 2, 3].map((i) => ({ name: `CPU${i}` }));
    const s = PU5.createGame(players, { numDecks: seed % 2 ? 1 : 2, comboCancel: seed % 4 < 2 }, { seed });
    let turns = 0;
    while (s.winner === null && turns < 3000) {
      const seat = s.current;
      for (const run of PU5.legalPlays(s, seat, 200)) {
        assert.equal(PU5.validatePlay(s, seat, run).ok, true);
      }
      const move = AI.chooseMove(s, seat);
      const r = move.type === 'play' ? PU5.playCards(s, seat, move.cardIds, move.suit) : PU5.pickUp(s, seat);
      assert.equal(r.ok, true, r.reason);
      const total = s.players.reduce((n, p) => n + p.hand.length, 0) + s.drawPile.length + s.discard.length;
      assert.equal(total, s.config.numDecks * 52);
      turns++;
    }
    assert.notEqual(s.winner, null, `seed ${seed} did not finish`);
  }
});

test('last card: calling it is free, forgetting costs the penalty', () => {
  const s = table({ hands: [['5S', '6S', '9D'], ['4D'], ['4H']], top: '5H' });
  assert.equal(play(s, 0, ['5S', '6S'], undefined).ok, true);
  assert.equal(s.players[0].hand.length, 3); // 1 left + 2 penalty

  const t = table({ hands: [['5S', '6S', '9D'], ['4D'], ['4H']], top: '5H' });
  assert.equal(PU5.playCards(t, 0, ['5S', '6S'], undefined, { calledLastCard: true }).ok, true);
  assert.equal(t.players[0].hand.length, 1);

  const u = table({ hands: [['5S', '6S', '9D'], ['4D'], ['4H']], top: '5H', config: { lastCardPenalty: 5 } });
  u.drawPile = ['3C', '4C', '5C', '6C', '9C', '10C'].map(c);
  play(u, 0, ['5S', '6S']);
  assert.equal(u.players[0].hand.length, 6);
});

test('last cards: no call needed when going out or when the rest is no single run', () => {
  const s = table({ hands: [['5S', '6S'], ['4D'], ['4H']], top: '5H' });
  play(s, 0, ['5S', '6S']);
  assert.equal(s.winner, 0);
  const t = table({ hands: [['5S', '9D', '3C'], ['4D'], ['4H']], top: '5H' });
  play(t, 0, ['5S']);
  assert.equal(t.players[0].hand.length, 2);
});

test('last cards: any number of cards that could go out together needs a call', () => {
  const must = (labels) => PU5.mustCallLastCards(PU5.DEFAULT_CONFIG, labels.map(c));
  assert.equal(must(['9D']), true);
  assert.equal(must(['9D', '9C', '10C']), true);
  assert.equal(must(['10C', '9D', '9C', '8H']), false); // 8♥ can't sit next to a 9 of another suit
  assert.equal(must(['10C', '9D', '9C', '6S']), false); // 6♠ fits nowhere
  assert.equal(must(['10C', '9C', '9D', '10D']), true); // 10♣ 9♣ 9♦ 10♦
  assert.equal(must(['8H', '2C']), false); // no run
  assert.equal(must(['10C', '9D', '9C', '3H']), false);
  assert.equal(must(['QH', '5H']), true); // Q covered by 5♥
  assert.equal(must(['8C']), false); // can't go out on a power card
  assert.equal(must(['6S', '7S']), true); // 7 → 6 ends plain

  const s = table({ hands: [['5S', '9D', '9C', '10C'], ['4D'], ['4H']], top: '5H' });
  play(s, 0, ['5S']);
  assert.equal(s.players[0].hand.length, 5); // 3 left + 2 penalty
  const t = table({ hands: [['5S', '9D', '9C', '10C'], ['4D'], ['4H']], top: '5H' });
  PU5.playCards(t, 0, ['5S'], undefined, { calledLastCard: true });
  assert.equal(t.players[0].hand.length, 3);
  assert.equal(t.players[0].calledLast, true);
});
