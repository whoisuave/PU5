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
  const s = table({ hands: [['4S', '5H', '4D', '9C', '6C'], ['4C'], ['4C1']], top: '4C2' });
  assert.equal(PU5.validatePlay(s, 0, ['4S', '5H', '4D'].map(c)).ok, true);
  assert.equal(PU5.validatePlay(s, 0, ['4S', '5H', '6C'].map(c)).ok, true);
  assert.equal(PU5.validatePlay(s, 0, ['4S', '9C'].map(c)).ok, false);
  s.config.sameRankRuns = false;
  assert.equal(PU5.validatePlay(s, 0, ['4S', '4D'].map(c)).ok, false);
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
  assert.equal(PU5.validatePlay(s, 0, ['5S', '6S', 'AH'].map(c)).ok, true);
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
  assert.equal(PU5.validatePlay(s, 1, ['2H', '3H', '2C'].map(c)).ok, true); // still ends hot
  assert.equal(PU5.validatePlay(s, 1, [c('JH')]).ok, true);
  assert.ok(PU5.legalPlays(s, 1).every((run) => ['2H', '2C', 'JH'].includes(run[run.length - 1].id)));
});

test('All Saints II: red J + 10 combo cancels', () => {
  const s = table({ hands: [['2H', '9D'], ['JH', '10S', '5D'], ['4H']], top: '5H', config: { comboCancel: true } });
  play(s, 0, ['2H']);
  assert.equal(play(s, 1, ['JH', '10S']).ok, true);
  assert.equal(s.pending, 0);
  assert.equal(s.activeSuit, 'S');
});

test('All Saints II: black J, Q, cover combo cancels', () => {
  const s = table({ hands: [['2S', '9D'], ['JS', 'QD', '4D', '8C'], ['4H']], top: '5S', config: { comboCancel: true } });
  play(s, 0, ['2S']);
  assert.equal(play(s, 1, ['JS', 'QD', '4D']).ok, true);
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
  play(s, 0, ['7S']);
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

test("can't finish on a red jack", () => {
  const s = table({ hands: [['JH'], ['4D'], ['4H']], top: '5H' });
  assert.equal(PU5.validatePlay(s, 0, [c('JH')]).ok, false);
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
