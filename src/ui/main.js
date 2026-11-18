// ブラウザUI（依存なし）
import { POKEDEX } from '../data/pokedex.js';
import { SAMPLE_TEAMS, TOURNAMENT_PARTIES } from '../data/teams.js';
import { TYPES, TYPE_NAMES, TYPE_COLORS } from '../data/types.js';
import { RULE_NAME, RULE_NOTES } from '../data/rules.js';
import { recommend, isUsable, usableSets, TIER_LABEL, TIER_ORDER, memberOf, DEX } from '../engine/recommend.js';
import { STAT_KEYS } from '../engine/model.js';
import { DEX_NO } from '../data/dexno.js';
import { resolveMove } from '../engine/model.js';
import { adjustmentNotes, gamePlan } from '../engine/analysis.js';
import { drawTeamImage, saveCanvas } from './image.js';

const MAX_LOCK = 3;
const state = {
  query: '',
  type: '',
  tier: '',
  locked: [], // { name, setIndex|null }
  includeMinor: false,
  allowLati: true,
  results: null,
  active: 0,
  busy: false,
};

const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const h = (tag, attrs = {}, html = '') => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  if (html) el.innerHTML = html;
  return el;
};
const typeBadge = (t) => `<span class="type" style="--c:${TYPE_COLORS[t]}">${TYPE_NAMES[t]}</span>`;
const tierBadge = (tier) => `<span class="tier tier-${tier.replace('+', 'p')}" title="${tier.startsWith('P') ? '考察本の重要度' : '環境ランク（2025/05〜2026/08）'}">${TIER_LABEL[tier]}</span>`;
const pct = (x) => `${(x * 100).toFixed(x >= 0.1 ? 0 : 1)}%`;
// ドット絵：PokeAPI が GitHub で公開しているエメラルド版スプライトを表示時に読み込む（リポジトリには含めない）
const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-iii/emerald/';
const sprite = (name, cls = '') => (DEX_NO[name]
  ? `<img class="sprite ${cls}" src="${SPRITE_BASE}${DEX_NO[name]}.png" alt="" width="64" height="64" loading="lazy" decoding="async" onerror="this.remove()">`
  : '');
const kata = (s) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

const USABLE = POKEDEX.filter(isUsable).sort((a, b) => (b.usage2026 ?? 0) - (a.usage2026 ?? 0) || TIER_ORDER.indexOf(a.meta) - TIER_ORDER.indexOf(b.meta) || a.name.localeCompare(b.name, 'ja'));

function render() {
  app.innerHTML = '';
  app.append(renderPicker(), renderLocked(), renderResults());
}

// ---- ポケモン選択 ----
function renderPicker() {
  const sec = h('section', { class: 'card' });
  sec.append(h('h2', {}, '1. 好きなポケモンを選ぶ <small>（最大3体まで固定できます）</small>'));
  const controls = h('div', { class: 'controls' });
  const search = h('input', { type: 'search', placeholder: '名前で検索（ひらがな可）', value: state.query, 'aria-label': 'ポケモン名で検索' });
  search.addEventListener('input', () => { state.query = search.value; updateGrid(); });
  const typeSel = h('select', { 'aria-label': 'タイプで絞り込み' }, `<option value="">すべてのタイプ</option>${TYPES.map((t) => `<option value="${t}" ${state.type === t ? 'selected' : ''}>${TYPE_NAMES[t]}</option>`).join('')}`);
  typeSel.addEventListener('change', () => { state.type = typeSel.value; updateGrid(); });
  const tierSel = h('select', { 'aria-label': 'ランクで絞り込み' }, `<option value="">すべてのランク</option>${TIER_ORDER.map((t) => `<option value="${t}" ${state.tier === t ? 'selected' : ''}>${t.startsWith('P') ? `考察本の重要度 ${TIER_LABEL[t]}` : `環境ランク ${TIER_LABEL[t]}`}</option>`).join('')}`);
  tierSel.addEventListener('change', () => { state.tier = tierSel.value; updateGrid(); });
  controls.append(search, typeSel, tierSel);
  const legend = h('p', { class: 'legend muted small' }, 'バッジの見方：S+〜D＝2025〜26年の大会の使用率・勝率によるランク／☆☆☆・☆☆・☆＝ランク外のポケモンの考察本での重要度（☆が多いほど重要）');
  const grid = h('div', { class: 'grid' });
  sec.append(controls, legend, grid);
  function updateGrid() {
    const q = kata(state.query.trim());
    const list = USABLE.filter((m) => (!q || m.name.includes(q)) && (!state.type || m.types.includes(state.type)) && (!state.tier || m.meta === state.tier));
    grid.innerHTML = '';
    for (const m of list) {
      const on = state.locked.some((l) => l.name === m.name);
      const b = h('button', { class: `mon ${on ? 'on' : ''}`, type: 'button', title: `${m.name}（${m.base.join('-')}）`, 'aria-pressed': on ? 'true' : 'false' },
        `${sprite(m.name, 'sm')}<span class="mon-text"><span class="mon-name">${esc(m.name)}</span><span class="mon-meta">${m.types.map(typeBadge).join('')}${tierBadge(m.meta)}</span></span>`);
      b.addEventListener('click', () => toggleLock(m.name));
      grid.append(b);
    }
    if (!list.length) grid.innerHTML = '<p class="muted">該当するポケモンがいません</p>';
  }
  updateGrid();
  return sec;
}

function toggleLock(name) {
  const i = state.locked.findIndex((l) => l.name === name);
  if (i >= 0) state.locked.splice(i, 1);
  else if (state.locked.length < MAX_LOCK) state.locked.push({ name, setIndex: null });
  else return flash(`固定できるのは${MAX_LOCK}体までです`);
  render();
}

function flash(msg) {
  const t = h('div', { class: 'toast', role: 'status' }, esc(msg));
  document.body.append(t);
  setTimeout(() => t.remove(), 2200);
}

const setSummary = (s) => `${s.label}：${s.moves.join('・')}${s.item ? ` ＠${s.item}` : ''}`;

// ---- 選択中のポケモンと型 ----
function renderLocked() {
  const sec = h('section', { class: 'card' });
  sec.append(h('h2', {}, '2. 型と条件を決めて提案'));
  if (!state.locked.length) {
    sec.append(h('p', { class: 'muted' }, '上の一覧からポケモンを選んでください。'));
  }
  for (const l of state.locked) {
    const mon = DEX.get(l.name);
    const row = h('div', { class: 'locked' });
    const head = h('div', { class: 'locked-head' }, `${sprite(mon.name, 'sm')}<strong>${esc(mon.name)}</strong> ${mon.types.map(typeBadge).join('')} ${tierBadge(mon.meta)}
      <span class="muted small">${mon.usage2026 ? `2026年大会の使用率 ${pct(mon.usage2026)} ／ ` : ''}${mon.rank2026 ? `勝率 ${mon.rank2026.win}% ／ ` : ''}種族値 ${mon.base.join('-')} ／ 特性 ${esc(mon.abilities.join('・'))}${mon.spread ? ` ／ 代表的な配分 ${esc(mon.spread)}` : ''}</span>`);
    const rm = h('button', { class: 'ghost', type: 'button', 'aria-label': `${mon.name}を外す` }, '外す');
    rm.addEventListener('click', () => toggleLock(mon.name));
    head.append(rm);
    const sel = h('select', { class: 'set-select', 'aria-label': `${mon.name}の型` });
    sel.innerHTML = `<option value="">型はおまかせ（パーティに合わせて選ぶ）</option>${usableSets(mon).map((i) => `<option value="${i}" ${l.setIndex === i ? 'selected' : ''}>${esc(setSummary(mon.sets[i]))}</option>`).join('')}`;
    sel.addEventListener('change', () => { l.setIndex = sel.value === '' ? null : Number(sel.value); });
    row.append(head, sel);
    sec.append(row);
  }
  const opts = h('div', { class: 'opts' });
  const minor = h('label', {}, `<input type="checkbox" ${state.includeMinor ? 'checked' : ''}> マイナーなポケモン（考察本の重要度☆）も候補に入れる`);
  minor.querySelector('input').addEventListener('change', (e) => { state.includeMinor = e.target.checked; });
  const lati = h('label', {}, `<input type="checkbox" ${state.allowLati ? '' : 'checked'}> ラティアス・ラティオス禁止ルール`);
  lati.querySelector('input').addEventListener('change', (e) => { state.allowLati = !e.target.checked; });
  opts.append(minor, lati);
  const go = h('button', { class: 'primary', type: 'button', disabled: !state.locked.length || state.busy }, state.busy ? '計算中…' : 'パーティを提案する');
  go.addEventListener('click', run);
  sec.append(opts, go);
  const rules = h('details', { class: 'rules' }, `<summary>${esc(RULE_NAME)} のルール</summary><ul>${RULE_NOTES.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`);
  sec.append(rules);
  return sec;
}

function run() {
  if (!state.allowLati && state.locked.some((l) => l.name === 'ラティオス' || l.name === 'ラティアス')) {
    return flash('ラティ禁止ルールではラティアス・ラティオスを固定できません');
  }
  state.busy = true;
  render();
  setTimeout(() => {
    try {
      state.results = recommend({ locked: state.locked.map((l) => ({ ...l })), includeMinor: state.includeMinor, allowLati: state.allowLati });
      state.active = 0;
    } finally {
      state.busy = false;
      render();
      document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 30);
}

// 1枠だけ入れ替え：他の5体を型ごと固定して再計算
function replaceMember(pi, mi) {
  const team = state.results[pi];
  const others = team.members.filter((_, i) => i !== mi).map((d) => ({ name: d.member.name, setIndex: d.member.setIndex }));
  const removed = team.members[mi].member.name;
  const exclude = new Set([removed]);
  state.busy = true;
  render();
  setTimeout(() => {
    try {
      const [next] = recommend({ locked: others, count: 1, includeMinor: state.includeMinor, allowLati: state.allowLati, exclude });
      if (next) {
        // 元の並び順を保つ
        const added = next.members.find((d) => !others.some((o) => o.name === d.member.name));
        const order = team.members.map((d, i) => (i === mi ? added.member.name : d.member.name));
        next.members.sort((a, b) => order.indexOf(a.member.name) - order.indexOf(b.member.name));
        const lockedNames = new Set(state.locked.map((l) => l.name));
        for (const d of next.members) if (!lockedNames.has(d.member.name)) d.reasons = d.reasons.filter((r) => r !== '選択したポケモン');
        state.results[pi] = next;
        flash(`${removed} → ${added.member.name} に入れ替えました`);
      } else flash('入れ替え候補が見つかりませんでした');
    } finally {
      state.busy = false;
      render();
    }
  }, 30);
}

// ---- 結果 ----
function renderResults() {
  const sec = h('section', { class: 'card', id: 'results' });
  if (!state.results) return h('div');
  sec.append(h('h2', {}, '3. 提案パーティ'));
  if (!state.results.length) {
    sec.append(h('p', {}, '条件に合うパーティが見つかりませんでした。'));
    return sec;
  }
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  state.results.forEach((r, i) => {
    const t = h('button', { type: 'button', role: 'tab', class: i === state.active ? 'on' : '', 'aria-selected': i === state.active ? 'true' : 'false' },
      `提案${i + 1}<span class="tab-sub">${r.members.map((d) => esc(d.member.name)).join('・')}</span>`);
    t.addEventListener('click', () => { state.active = i; render(); });
    tabs.append(t);
  });
  sec.append(tabs);
  const r = state.results[state.active];
  sec.append(renderTeam(r, state.active));
  return sec;
}

function statLine(m) {
  const ev = m.evs.map((v, i) => (v ? `${STAT_KEYS[i]}${v}` : '')).filter(Boolean).join(' ');
  return `<div class="stats"><span>実数値 ${m.stats.join('-')}</span><span>努力値 ${ev || '—'}${m.evsEstimated ? '（目安）' : ''}</span></div>`;
}

function renderTeam(r, pi) {
  const wrap = h('div', { class: 'team' });
  const bar = h('div', { class: 'team-bar' });
  const save = h('button', { class: 'ghost', type: 'button' }, '画像で保存');
  save.addEventListener('click', () => saveImage(r, pi, save));
  bar.append(save);
  wrap.append(bar);
  const members = h('div', { class: 'members' });
  r.members.forEach((d, mi) => {
    const m = d.member;
    const locked = state.locked.some((l) => l.name === m.name);
    const card = h('article', { class: `member ${locked ? 'is-locked' : ''}` });
    card.innerHTML = `
      <header>${sprite(m.name)}<strong class="name">${esc(m.name)}</strong>${m.types.map(typeBadge).join('')}${tierBadge(m.mon.meta)}</header>
      <div class="kv"><span>持ち物</span><b>${esc(m.item || '自由')}</b></div>
      <div class="kv"><span>特性</span><b>${esc(m.ability)}</b><span>性格</span><b>${esc(m.nature)}</b></div>
      ${statLine(m)}
      <ul class="moves">${m.set.moves.map((mv) => { const x = resolveMove(mv); return `<li style="--c:${TYPE_COLORS[x.type]}">${esc(mv)}</li>`; }).join('')}</ul>
      <div class="roles">${d.roles.map((x) => `<span>${esc(x)}</span>`).join('')}</div>
      <ul class="reasons">${d.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      ${adjustmentHtml(m)}
      <p class="src">型：${esc(m.set.label)}（出典：${esc([m.set.source, ...(m.set.alsoIn ?? [])].join('／'))}）${m.set.note ? `<br>${esc(m.set.note)}` : ''}</p>`;
    if (!locked) {
      const btn = h('button', { class: 'ghost small', type: 'button', disabled: state.busy }, 'この枠を入れ替え');
      btn.addEventListener('click', () => replaceMember(pi, mi));
      card.append(btn);
    }
    members.append(card);
  });
  wrap.append(members);

  const grid2 = h('div', { class: 'analysis' });
  grid2.append(renderPlan(r), renderSelection(r), renderWarnings(r), renderTypes(r), renderThreats(r), renderSamples(r), renderExport(r));
  wrap.append(grid2);
  return wrap;
}

// 調整の目安（素早さライン・耐久・火力）
function adjustmentHtml(m) {
  const n = adjustmentNotes(m);
  const list = (title, items) => (items.length ? `<p class="adj-h">${title}</p><ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
  return `<details class="adj"><summary>調整の目安${m.evsEstimated ? '（努力値は推定）' : ''}</summary>
    <p class="adj-h">素早さ</p><p>${esc(n.speed)}</p>
    ${list('耐久（使用率の高い相手の一番痛い技）', n.bulk)}
    ${list('火力（使用率の高い相手への一番通る技）', n.power)}
    <p class="muted small">Lv50・乱数85〜100%・急所や積み・持ち物の回復なしで計算。相手は各ポケモンの代表的な型です。</p></details>`;
}

function renderPlan(r) {
  const plan = gamePlan(r);
  const el = h('div', { class: 'panel wide plan' });
  el.innerHTML = `<h3>戦い方</h3>
    <p class="adj-h">勝ち筋</p><ul>${plan.concept.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <p class="adj-h">基本の選出と先発</p>
    <p>先発 <b>${esc(plan.lead.name)}</b>（${esc(plan.lead.why)}）、後ろに ${plan.lead.back.map(esc).join('・')}</p>
    <p class="adj-h">各ポケモンの動かし方</p>
    <dl class="per">${plan.perMember.map((p) => `<dt>${esc(p.name)}</dt><dd>${p.lines.map(esc).join('<br>')}</dd>`).join('')}</dl>
    <p class="adj-h">相手のポケモン別（使用率の高い順）</p>
    <ul class="vs">${plan.vs.map((v) => `<li><b>${esc(v.name)}</b> → ${esc(v.best)}で対応（${esc(v.tone)}）</li>`).join('')}</ul>
    ${plan.weak.length ? `<p class="adj-h">苦手な相手</p><ul>${plan.weak.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${plan.notes.length ? `<p class="adj-h">ルール上の注意</p><ul>${plan.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <p class="muted small">役割・技構成と対面評価から自動で作った目安です。</p>`;
  return el;
}

async function saveImage(r, pi, btn) {
  btn.disabled = true;
  btn.textContent = '作成中…';
  try {
    const canvas = await drawTeamImage(r, {
      title: `提案${pi + 1}：${r.members.map((d) => d.member.name).join('・')}`,
      subtitle: `${RULE_NAME}　固定：${state.locked.map((l) => l.name).join('・') || 'なし'}`,
      spriteUrl: (n) => (DEX_NO[n] ? `${SPRITE_BASE}${DEX_NO[n]}.png` : null),
      selections: r.selections.slice(0, 2),
    });
    await saveCanvas(canvas, `party-${r.members.map((d) => d.member.name).join('_')}.png`);
    flash('画像を保存しました');
  } catch (e) {
    flash('画像の作成に失敗しました');
  } finally {
    btn.disabled = false;
    btn.textContent = '画像で保存';
  }
}

function renderSelection(r) {
  return h('div', { class: 'panel' }, `<h3>おすすめ選出（6→3）</h3>
    <ol>${r.selections.map((s) => `<li>${s.map(esc).join(' ＋ ')}</li>`).join('')}</ol>
    <p class="muted small">選んだポケモンを含む3体のうち、仮想敵への対応範囲が広い組み合わせです。相手の6体を見て調整してください。</p>`);
}

function renderWarnings(r) {
  const items = r.warnings.length ? r.warnings.map((w) => `<li>${esc(w)}</li>`).join('') : '<li class="ok">大きな穴は見つかりませんでした</li>';
  return h('div', { class: 'panel' }, `<h3>チェック</h3><ul class="warn">${items}</ul>`);
}

function renderTypes(r) {
  const rows = TYPES.map((t) => {
    const { weak, resist } = r.typeProfile[t];
    const cls = weak >= 3 ? 'bad' : weak - resist >= 2 ? 'warn' : '';
    return `<tr class="${cls}"><th>${typeBadge(t)}</th><td>${'●'.repeat(weak) || '—'}</td><td>${'○'.repeat(resist) || '—'}</td></tr>`;
  }).join('');
  return h('div', { class: 'panel' }, `<h3>タイプ相性（受ける側）</h3>
    <table class="types"><thead><tr><th>技のタイプ</th><th>弱点</th><th>半減・無効</th></tr></thead><tbody>${rows}</tbody></table>`);
}

function scoreCell(v) {
  const cls = v > 0.5 ? 'g2' : v > 0.15 ? 'g1' : v > -0.15 ? 'n' : v > -0.5 ? 'r1' : 'r2';
  return `<td class="${cls}" title="${v.toFixed(2)}">${v > 0.5 ? '◎' : v > 0.15 ? '○' : v > -0.15 ? '△' : v > -0.5 ? '▲' : '×'}</td>`;
}

function renderThreats(r) {
  const top = r.threats.slice(0, 30);
  const head = r.members.map((d) => `<th class="vert">${esc(d.member.name)}</th>`).join('');
  const body = top.map((t) => `<tr><th>${esc(t.name)} ${tierBadge(t.tier)}</th>${t.scores.map(scoreCell).join('')}</tr>`).join('');
  return h('div', { class: 'panel wide' }, `<h3>仮想敵との対面（使用率の高い順）</h3>
    <div class="scroll"><table class="threats"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>
    <p class="muted small">◎有利 ○やや有利 △五分 ▲やや不利 ×不利。各ポケモンの代表的な型同士で、簡易ダメージ計算・素早さ・状態異常技・大爆発による1:1交換などから見積もった目安です。</p>`);
}

function renderSamples(r) {
  const el = h('div', { class: 'panel' }, '<h3>似ている構築</h3>');
  const names = new Set(r.members.map((d) => d.member.name));
  const hits = (list) => list.filter((n) => names.has(n)).length;
  const examples = SAMPLE_TEAMS.map((t) => ({ t, hit: hits(t.members.map((m) => m.name)) }))
    .filter((x) => x.hit >= 3).sort((a, b) => b.hit - a.hit || b.t.year - a.t.year).slice(0, 5);
  const parties = TOURNAMENT_PARTIES.map((p) => ({ p, hit: hits(p.mons) }))
    .filter((x) => x.hit >= 4).sort((a, b) => b.hit - a.hit || (a.p.place ?? 99) - (b.p.place ?? 99)).slice(0, 6);
  if (!examples.length && !parties.length) {
    el.append(h('p', { class: 'muted small' }, '3体以上共通する構築例・4体以上共通する大会パーティはありません。'));
    return el;
  }
  if (examples.length) {
    const ul = h('ul', { class: 'samples' });
    for (const { t, hit } of examples) {
      ul.append(h('li', {}, `<details><summary>${esc(t.title)}（${t.year}）<span class="muted small"> 共通${hit}体・${esc(t.source)}</span></summary>
        <ul>${t.members.map((m) => `<li class="${names.has(m.name) ? 'hit' : ''}"><b>${esc(m.name)}</b> ＠${esc(m.item)}${m.nature ? ` ／ ${esc(m.nature)}` : ''}${m.moves.length ? ` ／ ${esc(m.moves.join('・'))}` : ''}</li>`).join('')}</ul></details>`));
    }
    el.append(h('p', { class: 'small sub-h' }, '構築例（考察本・ブログ記事）'), ul);
  }
  if (parties.length) {
    const ul = h('ul', { class: 'samples parties' });
    for (const { p, hit } of parties) {
      ul.append(h('li', {}, `<span class="muted small">${esc(p.event)}${p.place ? ` ${p.place}位` : ''}${p.player ? `（${esc(p.player)}）` : ''}・共通${hit}体</span><br>${p.mons.map((n) => (names.has(n) ? `<b>${esc(n)}</b>` : esc(n))).join(' ')}`));
    }
    el.append(h('p', { class: 'small sub-h' }, '大会で使われたパーティ'), ul);
  }
  return el;
}

function exportText(r) {
  return r.members.map(({ member: m }) => {
    const ev = m.evs.map((v, i) => (v ? `${STAT_KEYS[i]}${v}` : '')).filter(Boolean).join(' ');
    return [`${m.name} @ ${m.item || '（自由）'}`, `特性: ${m.ability} ／ 性格: ${m.nature}`, `努力値: ${ev}${m.evsEstimated ? '（目安）' : ''} ／ 実数値: ${m.stats.join('-')}`, ...m.set.moves.map((x) => `- ${x}`)].join('\n');
  }).join('\n\n');
}

function renderExport(r) {
  const el = h('div', { class: 'panel wide' }, '<h3>テキストで書き出し</h3>');
  const ta = h('textarea', { readonly: true, rows: 10, 'aria-label': 'パーティのテキスト' });
  ta.value = exportText(r);
  const btn = h('button', { class: 'ghost', type: 'button' }, 'コピー');
  btn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(ta.value); flash('コピーしました'); } catch { ta.select(); flash('選択しました。Ctrl+C でコピーしてください'); }
  });
  el.append(ta, btn);
  return el;
}

// 初期表示でエンジンのキャッシュを温めておく（最初の提案を速くする）
setTimeout(() => { try { memberOf('カビゴン', 0); } catch { /* noop */ } }, 0);
render();
