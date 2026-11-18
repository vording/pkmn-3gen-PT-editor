import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { ABILITIES } from '../data/abilities.js';
import { TYPE_NAMES, TYPE_COLORS } from '../data/types.js';
import { NATURES, STAT_NAMES, STAT_KEYS } from '../engine/stats.js';
import { Battle, STATUS_NAMES } from '../engine/battle.js';
import { chooseAction } from '../engine/ai.js';

const app = document.getElementById('app');
const EVS = { hp: 84, atk: 84, def: 84, spa: 84, spd: 84, spe: 84 };
const WEATHER_LABEL = { rain: '🌧 雨', sun: '☀ 日差し', sand: '🌪 砂嵐', hail: '🌨 あられ' };
const STATUS_COLOR = { brn: '#e2632b', par: '#c9a400', psn: '#9b45a8', tox: '#6e2a7a', slp: '#7f8c8d', frz: '#4fb6d6' };

const state = {
  team: [], // { species, nature, moves }
  battle: null,
  busy: false,
  fast: false,
  log: [],
};

const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) el.append(c instanceof Node ? c : String(c));
  return el;
};

const typeBadge = (t) => h('span', { class: 'type', style: `background:${TYPE_COLORS[t]}` }, TYPE_NAMES[t]);
const statusBadge = (s) => (s ? h('span', { class: 'status', style: `background:${STATUS_COLOR[s]}` }, STATUS_NAMES[s]) : null);

function token(speciesId, size = '') {
  const sp = SPECIES[speciesId];
  const [a, b = a] = sp.types.map((t) => TYPE_COLORS[t]);
  return h('div', { class: `token ${size}`, style: `background:linear-gradient(135deg, ${a} 50%, ${b} 50%)` },
    h('span', {}, sp.name[0]));
}

const moveLabel = (id) => {
  const m = MOVES[id];
  return `${m.name}（${TYPE_NAMES[m.type]}・威力${m.power || '-'}・命中${m.accuracy ?? '-'}）`;
};

// ───────── 編成画面 ─────────

function addMember(id) {
  if (state.team.length >= 6 || state.team.some((m) => m.species === id)) return;
  state.team.push({ species: id, nature: 'neutral', moves: SPECIES[id].learnset.slice(0, 4) });
  renderBuilder();
}

function randomTeam(n, exclude = []) {
  const pool = Object.keys(SPECIES).filter((id) => !exclude.includes(id));
  const natureIds = Object.keys(NATURES);
  const team = [];
  while (team.length < n && pool.length) {
    const id = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    team.push({ species: id, nature: natureIds[Math.floor(Math.random() * natureIds.length)], moves: SPECIES[id].learnset.slice(0, 4) });
  }
  return team;
}

function renderBuilder() {
  const natureOptions = Object.entries(NATURES).filter(([id]) => !id.startsWith('neutral-'));
  const dex = h('div', { class: 'dex' }, Object.values(SPECIES).map((sp) => {
    const picked = state.team.some((m) => m.species === sp.id);
    const bst = STAT_KEYS.reduce((s, k) => s + sp.base[k], 0);
    return h('button', { class: `dex-card ${picked ? 'picked' : ''}`, onclick: () => addMember(sp.id), disabled: picked || state.team.length >= 6 },
      token(sp.id, 'sm'),
      h('div', { class: 'dex-info' },
        h('strong', {}, sp.name),
        h('div', {}, sp.types.map(typeBadge)),
        h('small', { title: ABILITIES[sp.ability].desc }, `${ABILITIES[sp.ability].name} ・ 合計${bst}`)));
  }));

  const team = h('div', { class: 'team' }, state.team.length === 0
    ? h('p', { class: 'hint' }, '左の図鑑からモンスターを選んでください（1〜6体）。')
    : state.team.map((member, i) => {
      const sp = SPECIES[member.species];
      return h('div', { class: 'member' },
        h('div', { class: 'member-head' },
          token(sp.id, 'sm'),
          h('div', {}, h('strong', {}, sp.name), ' ', sp.types.map(typeBadge),
            h('div', { class: 'stats' }, STAT_KEYS.map((k) => `${STAT_NAMES[k]}${sp.base[k]}`).join(' / '))),
          h('button', { class: 'remove', onclick: () => { state.team.splice(i, 1); renderBuilder(); } }, '外す')),
        h('label', {}, '性格 ',
          h('select', { onchange: (e) => { member.nature = e.target.value; } },
            natureOptions.map(([id, n]) => h('option', { value: id, selected: id === member.nature }, n.name)))),
        h('div', { class: 'moves-edit' }, member.moves.map((mid, j) =>
          h('select', { onchange: (e) => { member.moves[j] = e.target.value; } },
            sp.learnset.map((id) => h('option', { value: id, selected: id === mid, disabled: id !== mid && member.moves.includes(id) }, moveLabel(id)))))));
    }));

  app.replaceChildren(h('section', { class: 'builder' },
    h('div', { class: 'panel' }, h('h2', {}, '図鑑'), dex),
    h('div', { class: 'panel' },
      h('h2', {}, `あなたのチーム（${state.team.length}/6）`),
      team,
      h('div', { class: 'actions' },
        h('button', { onclick: () => { state.team = randomTeam(3); renderBuilder(); } }, 'おまかせ3体'),
        h('button', { class: 'primary', disabled: state.team.length === 0, onclick: startBattle }, 'バトル開始！')),
      h('p', { class: 'hint' }, `Lv50・個体値31・努力値は全能力84。相手は同じ数のモンスターをランダムで選びます。`))));
}

// ───────── バトル画面 ─────────

function startBattle() {
  const mine = state.team.map((m) => ({ ...m, moves: [...m.moves], evs: EVS }));
  const foes = randomTeam(mine.length).map((m) => ({ ...m, evs: EVS }));
  state.battle = new Battle({ teams: [mine, foes], names: ['あなた', 'ライバル'], seed: Date.now() });
  state.log = [];
  state.busy = false;
  renderBattleScreen();
  play(state.battle.drainEvents());
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function play(events) {
  state.busy = true;
  renderControls();
  for (const e of events) {
    renderField(e.view);
    if (e.text) {
      state.log.push(e.text);
      renderLog();
      if (!state.fast) await sleep(e.text.startsWith('──') ? 250 : 520);
    }
  }
  state.busy = false;
  renderField(state.battle.snapshot());
  renderControls();
}

async function act(action) {
  const b = state.battle;
  if (state.busy) return;
  if (b.phase === 'move') {
    await play(b.playTurn([action, chooseAction(b, 1)]));
  } else if (b.phase === 'switch') {
    await play(b.replace(0, action.index));
  }
  if (b.phase === 'switch' && b.pendingSwitch[1]) {
    await play(b.replace(1, chooseAction(b, 1).index));
  }
}

function renderBattleScreen() {
  app.replaceChildren(h('section', { class: 'battle' },
    h('div', { class: 'field', id: 'field' }),
    h('div', { class: 'side-col' },
      h('div', { class: 'controls panel', id: 'controls' }),
      h('div', { class: 'log panel', id: 'log' }))));
}

function monPanel(view, sideIdx) {
  const side = view.sides[sideIdx];
  const mon = side.team[side.active];
  const pct = Math.max(0, mon.hp / mon.maxHp);
  const color = pct > 0.5 ? '#3cb371' : pct > 0.2 ? '#e1b12c' : '#e0453a';
  const stages = Object.entries(mon.stages).filter(([, v]) => v !== 0)
    .map(([k, v]) => h('span', { class: `stage ${v > 0 ? 'up' : 'down'}` }, `${STAT_NAMES[k]}${v > 0 ? '+' : ''}${v}`));
  return h('div', { class: `combatant ${sideIdx === 0 ? 'me' : 'foe'} ${mon.hp <= 0 ? 'fainted' : ''}` },
    h('div', { class: 'hud' },
      h('div', { class: 'hud-name' }, h('strong', {}, mon.name), h('span', {}, `Lv${mon.level}`)),
      h('div', {}, mon.types.map(typeBadge), statusBadge(mon.status)),
      h('div', { class: 'hpbar' }, h('div', { style: `width:${pct * 100}%;background:${color}` })),
      h('div', { class: 'hp-text' }, sideIdx === 0 ? `${mon.hp} / ${mon.maxHp}` : `${Math.ceil(pct * 100)}%`),
      h('div', { class: 'stages' }, stages),
      h('div', { class: 'party' }, side.team.map((m) => h('span', { class: `ball ${m.hp <= 0 ? 'out' : m.status ? 'sick' : ''}`, title: m.name })))),
    token(mon.speciesId, 'lg'));
}

function renderField(view) {
  const field = document.getElementById('field');
  if (!field) return;
  field.replaceChildren(
    h('div', { class: 'field-top' },
      h('span', {}, view.turn ? `ターン ${view.turn}` : 'バトル開始'),
      view.weather ? h('span', { class: 'weather' }, WEATHER_LABEL[view.weather]) : null),
    monPanel(view, 1),
    monPanel(view, 0));
}

function renderLog() {
  const log = document.getElementById('log');
  if (!log) return;
  log.replaceChildren(...state.log.map((t) => h('div', { class: t.startsWith('──') ? 'turn-line' : '' }, t)));
  log.scrollTop = log.scrollHeight;
}

function renderControls() {
  const el = document.getElementById('controls');
  if (!el) return;
  const b = state.battle;
  const fastToggle = h('label', { class: 'fast' },
    h('input', { type: 'checkbox', checked: state.fast, onchange: (e) => { state.fast = e.target.checked; } }), ' 早送り');

  if (b.phase === 'end') {
    const msg = b.winner === 0 ? '勝利！' : b.winner === 1 ? '敗北…' : '引き分け';
    el.replaceChildren(h('h2', {}, msg),
      h('div', { class: 'actions' },
        h('button', { class: 'primary', onclick: startBattle }, '同じチームで再戦'),
        h('button', { onclick: renderBuilder }, 'チーム編成へ')));
    return;
  }

  const legal = b.legalActions(0);
  const has = (type, index) => legal.some((a) => a.type === type && a.index === index);
  const me = b.active(0);
  const forced = b.phase === 'switch';

  const moveButtons = forced ? null : h('div', { class: 'move-grid' },
    legal.some((a) => a.type === 'move' && a.index === -1)
      ? h('button', { class: 'move', onclick: () => act({ type: 'move', index: -1 }), disabled: state.busy }, '捨て鉢の一撃')
      : me.moves.map((slot, i) => {
        const m = MOVES[slot.id];
        return h('button', {
          class: 'move', style: `--c:${TYPE_COLORS[m.type]}`, disabled: state.busy || !has('move', i),
          title: moveLabel(slot.id), onclick: () => act({ type: 'move', index: i }),
        }, h('strong', {}, m.name), h('small', {}, `${TYPE_NAMES[m.type]}　PP ${slot.pp}/${slot.maxPp}`));
      }));

  const switchButtons = h('div', { class: 'switch-grid' }, b.sides[0].team.map((m, i) =>
    h('button', { class: 'switch', disabled: state.busy || !has('switch', i), onclick: () => act({ type: 'switch', index: i }) },
      token(m.speciesId, 'xs'),
      h('span', {}, m.name, h('small', {}, ` ${m.hp}/${m.maxHp}`)),
      statusBadge(m.status))));

  el.replaceChildren(
    h('div', { class: 'controls-head' },
      h('h2', {}, state.busy ? '…' : forced ? '次に出すモンスターを選んでください' : `${me.name}は どうする？`),
      fastToggle),
    moveButtons,
    h('h3', {}, '交代'),
    switchButtons,
    h('div', { class: 'actions' }, h('button', { class: 'ghost', onclick: () => { if (!state.busy && confirm('降参しますか？')) renderBuilder(); } }, '降参する')));
}

renderBuilder();
