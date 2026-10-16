/* Browser UI for PU5. Seat 0 is the human; the rest are CPUs. */
(function () {
  'use strict';
  const { SUIT_SYMBOL, SUIT_NAME } = PU5;
  const $ = (id) => document.getElementById(id);
  const HUMAN = 0;

  let state = null;
  let staged = []; // card ids in play order
  let cpuTimer = null;
  let cpuDelay = 850;
  let calledLastCard = false; // the "Last cards!" button is pressed
  let queenWarned = null; // staged run the player was warned about

  // ---------- rendering ----------

  function cardEl(card, extraClass = '') {
    const el = document.createElement('div');
    const label = PU5.cardLabel(card);
    const rank = label.slice(0, -1);
    el.className = `card ${PU5.isRed(card) ? 'red' : ''} ${PU5.isPowerCard(card) ? 'power' : ''} ${extraClass}`;
    el.innerHTML =
      `<span class="corner">${rank}<br>${SUIT_SYMBOL[card.suit]}</span>` +
      `<span class="pip">${['J', 'Q', 'K'].includes(rank) ? rank + SUIT_SYMBOL[card.suit] : SUIT_SYMBOL[card.suit]}</span>` +
      `<span class="corner br">${rank}<br>${SUIT_SYMBOL[card.suit]}</span>`;
    el.title = label;
    return el;
  }

  function render() {
    const me = state.players[HUMAN];
    const myTurn = state.current === HUMAN && state.winner === null;

    // Opponents
    const opp = $('opponents');
    opp.innerHTML = '';
    state.players.slice(1).forEach((p) => {
      const box = document.createElement('div');
      box.className = 'opponent' + (state.current === p.id && state.winner === null ? ' active' : '');
      const backs = Math.min(p.hand.length, 12);
      box.innerHTML =
        `<div class="name">${p.name}${p.id === state.dealer ? '<span class="tag">DEALER</span>' : ''}${p.calledLast ? '<span class="tag last">LAST CARDS</span>' : ''}</div>` +
        `<div class="mini-hand">${'<i></i>'.repeat(backs)}</div>` +
        `<div class="count">${p.hand.length} card${p.hand.length === 1 ? '' : 's'}</div>`;
      opp.appendChild(box);
    });

    // Piles
    $('drawCount').textContent = state.drawPile.length;
    const dt = $('discardTop');
    dt.innerHTML = '';
    dt.appendChild(cardEl(PU5.topCard(state)));
    const suitRed = state.activeSuit === 'H' || state.activeSuit === 'D';
    $('suitBadge').innerHTML = `Suit: <b style="color:${suitRed ? '#ff8a8a' : 'inherit'}">${SUIT_SYMBOL[state.activeSuit]} ${SUIT_NAME[state.activeSuit]}</b>`;
    $('dirBadge').textContent = state.direction === 1 ? '↻ Clockwise' : '↺ Anticlockwise';
    $('pendingBadge').classList.toggle('hidden', state.pending === 0);
    $('pendingBadge').textContent = `🔥 IN PLAY: ${state.pending}`;
    $('modeBadge').textContent = state.config.comboCancel ? 'All Saints II' : 'All Saints';

    // Me
    document.querySelector('.me').classList.toggle('active', myTurn);
    $('myName').textContent = `${me.name}${HUMAN === state.dealer ? ' (dealer)' : ''} — ${me.hand.length} card${me.hand.length === 1 ? '' : 's'}`;
    $('turnHint').textContent = state.winner !== null ? '' : myTurn ? 'Your turn' : `Waiting for ${state.players[state.current].name}…`;

    const stagedCards = staged.map((id) => me.hand.find((c) => c.id === id));
    const prev = stagedCards[stagedCards.length - 1];

    const stageEl = $('staging');
    stageEl.innerHTML = '';
    stagedCards.forEach((c, i) => {
      const el = cardEl(c);
      el.insertAdjacentHTML('beforeend', `<span class="order">${i + 1}</span>`);
      el.onclick = () => unstageFrom(i);
      stageEl.appendChild(el);
    });

    const hand = $('hand');
    hand.innerHTML = '';
    sortHand(me.hand).forEach((c) => {
      const isStaged = staged.includes(c.id);
      let playable = false;
      if (myTurn && !isStaged) {
        playable = prev ? PU5.canFollow(state.config, prev, c, true) : PU5.canStart(state, c);
      }
      const el = cardEl(c, (isStaged ? 'staged' : '') + (playable ? ' playable' : ''));
      if (myTurn && !isStaged) el.onclick = () => stage(c.id);
      hand.appendChild(el);
    });

    $('playBtn').disabled = !myTurn || staged.length === 0;
    $('clearBtn').disabled = staged.length === 0;
    $('hintBtn').disabled = !myTurn;
    $('lastCardBtn').disabled = !myTurn;
    $('pickupBtn').disabled = !myTurn;
    $('pickupBtn').textContent = state.pending > 0 ? `Pick up ${state.pending}` : 'Pick up';

    // Log
    const logEl = $('log');
    logEl.innerHTML = state.log.map((l) => `<li>${escapeHtml(l)}</li>`).join('');
    logEl.scrollTop = logEl.scrollHeight;
  }

  function sortHand(hand) {
    const order = { S: 0, H: 1, C: 2, D: 3 };
    return hand.slice().sort((a, b) => order[a.suit] - order[b.suit] || a.rank - b.rank);
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  }

  function say(msg) {
    $('message').textContent = msg || '';
  }

  // ---------- human actions ----------

  function stage(id) {
    staged.push(id);
    say('');
    render();
  }

  function unstageFrom(i) {
    staged = staged.slice(0, i);
    render();
  }

  function clearStage() {
    staged = [];
    render();
  }

  function humanPlay() {
    const me = state.players[HUMAN];
    const cards = staged.map((id) => me.hand.find((c) => c.id === id));
    const check = PU5.validatePlay(state, HUMAN, cards);
    if (!check.ok) return say(check.reason);
    const last = cards[cards.length - 1];
    const key = staged.join(',');
    if (last.rank === PU5.QUEEN && queenWarned !== key) {
      queenWarned = key;
      return say(`Your ${PU5.cardLabel(last)} isn't covered, so you'll pick up ${state.config.queenPenalty}. Press Play again to play it anyway.`);
    }
    if (last.rank === PU5.ACE) return openSuitPicker();
    commitPlay();
  }

  function commitPlay(suit) {
    const result = PU5.playCards(state, HUMAN, staged, suit, { calledLastCard });
    if (!result.ok) return say(result.reason);
    staged = [];
    setLastCall(false);
    const forgot = state.log.slice(-4).some((l) => l.startsWith(`${state.players[HUMAN].name} didn't call last cards`));
    say(forgot ? `You could go out next turn but didn't call last cards, so you picked up ${state.config.lastCardPenalty}.` : '');
    afterMove();
  }

  function setLastCall(on) {
    calledLastCard = on;
    $('lastCardBtn').setAttribute('aria-pressed', String(on));
    $('lastCardBtn').textContent = on ? 'Last cards! ✓' : 'Last cards!';
  }

  function humanPickup() {
    staged = [];
    setLastCall(false);
    PU5.pickUp(state, HUMAN);
    say('');
    afterMove();
  }

  function hint() {
    const move = PU5AI.chooseMove(state, HUMAN);
    if (move.type === 'pickup') {
      say(state.pending > 0 ? `Nothing to stack or cancel with. Pick up ${state.pending}.` : 'No good play. Pick up a card.');
      return;
    }
    staged = move.cardIds.slice();
    render();
    say('Suggested run staged. Press Play (or Clear).');
  }

  function openSuitPicker() {
    $('suitModal').classList.remove('hidden');
  }

  // ---------- turn flow ----------

  function afterMove() {
    render();
    if (state.winner !== null) return gameOver();
    scheduleCpu();
  }

  function scheduleCpu() {
    clearTimeout(cpuTimer);
    if (state.winner !== null || state.current === HUMAN) return;
    cpuTimer = setTimeout(cpuTurn, cpuDelay);
  }

  function cpuTurn() {
    const seat = state.current;
    const move = PU5AI.chooseMove(state, seat);
    const res = move.type === 'play' ? PU5.playCards(state, seat, move.cardIds, move.suit, move) : { ok: false };
    if (!res.ok) PU5.pickUp(state, seat);
    staged = staged.filter((id) => state.players[HUMAN].hand.some((c) => c.id === id)); // hands can move on a 7
    say(state.log[state.log.length - 1]);
    afterMove();
  }

  function gameOver() {
    const w = state.players[state.winner];
    say(w.id === HUMAN ? '🎉 You win! Press New game to play again.' : `${w.name} wins. Press New game to try again.`);
    render();
  }

  // ---------- setup ----------

  function startGame() {
    clearTimeout(cpuTimer);
    const cpus = Number($('cpuInput').value);
    const config = {
      numDecks: Number($('deckInput').value),
      handSize: Number($('handInput').value),
      comboCancel: $('modeInput').value === 'combo',
      lastCardPenalty: Number($('lastPenaltyInput').value),
    };
    cpuDelay = Number($('speedInput').value);
    const names = ['Kofi', 'Ama', 'Tunde', 'Zara', 'Malik', 'Nia'];
    const players = [{ name: $('nameInput').value.trim() || 'You', isHuman: true }];
    for (let i = 0; i < cpus; i++) players.push({ name: names[i] });
    try {
      state = PU5.createGame(players, config);
    } catch (e) {
      $('setupError').textContent = `${e.message}. Use fewer players, a smaller hand or 2 decks.`;
      return;
    }
    $('setupError').textContent = '';
    staged = [];
    setLastCall(false);
    $('setup').classList.add('hidden');
    $('table').classList.remove('hidden');
    say(state.current === HUMAN ? "You're left of the dealer — you start." : '');
    afterMove();
  }

  function showSetup() {
    clearTimeout(cpuTimer);
    $('table').classList.add('hidden');
    $('setup').classList.remove('hidden');
  }

  // ---------- wiring ----------

  $('startBtn').onclick = startGame;
  $('newGameBtn').onclick = showSetup;
  $('playBtn').onclick = humanPlay;
  $('clearBtn').onclick = clearStage;
  $('pickupBtn').onclick = humanPickup;
  $('drawPile').onclick = () => state && state.current === HUMAN && state.winner === null && humanPickup();
  $('hintBtn').onclick = hint;
  $('lastCardBtn').onclick = () => setLastCall(!calledLastCard);
  $('rulesBtn').onclick = () => $('rulesModal').classList.remove('hidden');
  $('rulesClose').onclick = () => $('rulesModal').classList.add('hidden');
  $('suitCancel').onclick = () => $('suitModal').classList.add('hidden');
  document.querySelectorAll('.suit-choices button').forEach((b) => {
    b.onclick = () => {
      $('suitModal').classList.add('hidden');
      commitPlay(b.dataset.suit);
    };
  });
})();
