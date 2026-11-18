// パーティ提案エンジン
// 1) 環境上位のポケモン（重要度の高い型）を「仮想敵」として、各候補の対面有利度を事前計算
// 2) 仮想敵への回答の有無・タイプ相性の偏り・役割（積み対策など）・考察本の構築での同居実績で評価
// 3) ビームサーチで6体を組み、道具の重複を禁止したまま型を選ぶ
import { POKEDEX } from '../data/pokedex.js';
import { SAMPLE_TEAMS } from '../data/teams.js';
import { TYPES, TYPE_NAMES as TYPE_JP } from '../data/types.js';
import { BANNED, BANNED_ITEMS } from '../data/rules.js';
import { buildMember, roleLabels } from './model.js';
import { matchup, defensiveMultiplier } from './matchup.js';

export const TIER_LABEL = { S: '最上位', A: '重要度☆☆☆', B: '重要度☆☆', C: '重要度☆〜' };
const TIER_VALUE = { S: 1.0, A: 0.7, B: 0.4, C: 0.1 };
const THREAT_WEIGHT = { S: 4, A: 2, B: 0.6 };

export const DEX = new Map(POKEDEX.map((m) => [m.name, m]));

export function isUsable(mon) {
  return !mon.banned && !BANNED.has(mon.name) && mon.base && mon.sets.length > 0;
}

export function usableSets(mon) {
  return mon.sets
    .map((s, i) => [s, i])
    .filter(([s]) => !BANNED_ITEMS.has(s.item))
    .map(([, i]) => i);
}

// 考察本掲載構築での同居回数
const PAIR_COUNT = new Map();
for (const team of SAMPLE_TEAMS) {
  const names = team.members.map((m) => m.name);
  for (const a of names) for (const b of names) {
    if (a < b) PAIR_COUNT.set(`${a}|${b}`, (PAIR_COUNT.get(`${a}|${b}`) ?? 0) + 1);
  }
}
export function pairCount(a, b) {
  return PAIR_COUNT.get(a < b ? `${a}|${b}` : `${b}|${a}`) ?? 0;
}

let cache = null;
function context() {
  if (cache) return cache;
  const usable = POKEDEX.filter(isUsable);
  // 仮想敵：最上位は代表的な型を3つまで、☆☆☆は2つ、☆☆は1つ
  const threats = [];
  for (const mon of usable) {
    const w = THREAT_WEIGHT[mon.tier];
    if (!w) continue;
    const n = mon.tier === 'S' ? 3 : mon.tier === 'A' ? 2 : 1;
    const idx = usableSets(mon).slice(0, n);
    for (const i of idx) threats.push({ member: buildMember(mon, i), weight: w / idx.length, name: mon.name, tier: mon.tier });
  }
  cache = { usable, threats, members: new Map(), rows: new Map() };
  return cache;
}

export function getThreats() {
  return context().threats;
}

export function memberOf(name, setIndex) {
  const ctx = context();
  const key = `${name}#${setIndex}`;
  if (!ctx.members.has(key)) ctx.members.set(key, buildMember(DEX.get(name), setIndex));
  return ctx.members.get(key);
}

// 候補 × 仮想敵 の有利度
function rowOf(member) {
  const ctx = context();
  if (!ctx.rows.has(member.id)) {
    ctx.rows.set(member.id, Float32Array.from(ctx.threats, (t) => (t.name === member.name ? 0 : matchup(member, t.member))));
  }
  return ctx.rows.get(member.id);
}

function typeProfile(members) {
  const out = {};
  for (const t of TYPES) {
    let weak = 0;
    let resist = 0;
    for (const m of members) {
      const x = defensiveMultiplier(m, t);
      if (x >= 2) weak++;
      else if (x <= 0.5) resist++;
    }
    out[t] = { weak, resist };
  }
  return out;
}

const WEIGHTS = {
  coverage: 3.0,
  type: 1.0,
  roles: 1.0,
  tier: 0.8,
  synergy: 0.25,
};

// チームの評価値（部分チームでも計算可能）と内訳
export function scoreTeam(members, opts = {}) {
  const { threats } = context();
  const rows = members.map(rowOf);
  let coverage = 0;
  let totalW = 0;
  for (let t = 0; t < threats.length; t++) {
    const w = threats[t].weight;
    let best = -1;
    let second = -1;
    let losing = 0;
    for (const r of rows) {
      const v = r[t];
      if (v > best) { second = best; best = v; } else if (v > second) second = v;
      if (v < -0.4) losing++;
    }
    if (rows.length < 2) second = best;
    let s = 0.75 * best + 0.25 * second;
    if (best < 0) s += 0.6 * best; // 回答がいない仮想敵は重く見る
    if (losing >= 4) s -= 0.3;
    coverage += w * s;
    totalW += w;
  }
  coverage = (coverage / totalW) * 10;

  const prof = typeProfile(members);
  let type = 0;
  for (const t of TYPES) {
    const { weak, resist } = prof[t];
    if (weak >= 3) type -= (weak - 2) * 1.2;
    if (weak - resist >= 2) type -= 0.6;
  }

  let roles = 0;
  const has = (pred) => members.some(pred);
  if (members.length >= 4) {
    // 考察本：6体のうち誰か1体には『ほえる』などの積み・バトン対策を持たせたい
    if (!has((m) => m.tags.phaze || m.tags.encore || (m.tags.counter && m.tags.mirrorCoat))) roles -= 1.5;
    if (!has((m) => m.stats[0] * m.stats[4] >= 36000)) roles -= 1.0; // 特殊の数値受け
    if (!has((m) => m.stats[5] >= 140)) roles -= 0.5;
  }
  const sleepers = members.filter((m) => m.tags.sleep).length;
  if (sleepers >= 2) roles -= 0.6 * (sleepers - 1); // 眠り技はルール上1体しか通らない
  const explode = members.filter((m) => m.tags.explode).length;
  if (explode >= 4) roles -= 0.5;
  const choice = members.filter((m) => m.item === 'こだわりハチマキ').length;
  if (choice >= 2) roles -= 1.0; // 道具重複不可だが念のため

  let tier = 0;
  for (const m of members) tier += TIER_VALUE[m.mon.tier] ?? 0;

  let synergy = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) synergy += Math.min(2, pairCount(members[i].name, members[j].name));
  }

  let diversity = 0;
  if (opts.avoid) for (const m of members) if (opts.avoid.has(m.name)) diversity -= 2.5;

  const parts = {
    coverage: coverage * WEIGHTS.coverage,
    type: type * WEIGHTS.type,
    roles: roles * WEIGHTS.roles,
    tier: tier * WEIGHTS.tier,
    synergy: synergy * WEIGHTS.synergy,
    diversity,
  };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { total, parts };
}

function candidatePool(opts) {
  const { usable } = context();
  const pool = [];
  for (const mon of usable) {
    if (opts.exclude?.has(mon.name)) continue;
    if (mon.tier === 'C' && !opts.includeMinor) continue;
    if (!opts.allowLati && (mon.name === 'ラティオス' || mon.name === 'ラティアス')) continue;
    for (const i of usableSets(mon).slice(0, 4)) pool.push(memberOf(mon.name, i));
  }
  return pool;
}

// locked: [{ name, setIndex | null }]（setIndex=null は型も自動選択）
export function recommend({
  locked = [],
  count = 3,
  beamWidth = 40,
  includeMinor = false,
  allowLati = true,
  exclude = new Set(),
} = {}) {
  const opts = { includeMinor, allowLati, exclude };
  const pool = candidatePool(opts);
  const proposals = [];
  const avoid = new Set();
  for (let p = 0; p < count; p++) {
    const team = search(locked, pool, beamWidth, { avoid: p > 0 ? avoid : null });
    if (!team) break;
    const key = team.map((m) => m.id).sort().join(',');
    if (proposals.some((x) => x.key === key)) break;
    proposals.push({ key, members: team });
    for (const m of team) if (!locked.some((l) => l.name === m.name)) avoid.add(m.name);
  }
  return proposals.map((p) => describeTeam(p.members, locked));
}

function search(locked, pool, beamWidth, opts) {
  // 固定ポケモンの型の組み合わせを初期状態にする
  let beams = [[]];
  for (const l of locked) {
    const mon = DEX.get(l.name);
    const idx = l.setIndex == null ? usableSets(mon).slice(0, 6) : [l.setIndex];
    const next = [];
    for (const b of beams) {
      for (const i of idx) {
        const m = memberOf(l.name, i);
        if (m.item && b.some((x) => x.item === m.item)) continue;
        next.push([...b, m]);
      }
    }
    beams = next.length ? next : beams.map((b) => [...b, memberOf(l.name, idx[0])]);
  }
  beams = beams.map((b) => ({ team: b, score: scoreTeam(b, opts).total }));
  beams.sort((a, b) => b.score - a.score);
  beams = beams.slice(0, beamWidth);
  while (beams[0].team.length < 6) {
    const next = new Map();
    for (const { team } of beams) {
      const names = new Set(team.map((m) => m.name));
      const items = new Set(team.map((m) => m.item).filter(Boolean));
      for (const c of pool) {
        if (names.has(c.name) || (c.item && items.has(c.item))) continue;
        const t = [...team, c];
        const key = t.map((m) => m.id).sort().join(',');
        if (next.has(key)) continue;
        next.set(key, { team: t, score: scoreTeam(t, opts).total });
      }
    }
    if (next.size === 0) return null;
    // 同じ顔ぶれ（型違い）ばかりにならないよう、種族の組で重複を間引く
    const sorted = [...next.values()].sort((a, b) => b.score - a.score);
    const seen = new Map();
    beams = [];
    for (const s of sorted) {
      const k = s.team.map((m) => m.name).sort().join(',');
      const c = seen.get(k) ?? 0;
      if (c >= 2) continue;
      seen.set(k, c + 1);
      beams.push(s);
      if (beams.length >= beamWidth) break;
    }
  }
  return beams[0].team;
}

// 3体選出の候補（固定ポケモンを含む組で仮想敵への対応力が最も高いもの）
export function bestSelections(members, mustInclude = [], top = 3) {
  const out = [];
  for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) for (let k = j + 1; k < members.length; k++) {
    const trio = [members[i], members[j], members[k]];
    if (mustInclude.length && !mustInclude.some((n) => trio.some((m) => m.name === n))) continue;
    const s = scoreTeam(trio);
    out.push({ trio, score: s.parts.coverage + s.parts.type * 0.5 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, top);
}

function describeTeam(members, locked) {
  const { threats } = context();
  const rows = members.map(rowOf);
  const lockedNames = new Set(locked.map((l) => l.name));
  // 仮想敵（種族単位）ごとの最良回答
  const byName = new Map();
  threats.forEach((t, ti) => {
    const e = byName.get(t.name) ?? { name: t.name, tier: t.tier, weight: 0, scores: members.map(() => 0) };
    e.weight += t.weight;
    rows.forEach((r, mi) => { e.scores[mi] += r[ti] * t.weight; });
    byName.set(t.name, e);
  });
  const threatTable = [...byName.values()].map((e) => {
    const scores = e.scores.map((s) => s / e.weight);
    let bi = 0;
    scores.forEach((s, i) => { if (s > scores[bi]) bi = i; });
    return { name: e.name, tier: e.tier, weight: e.weight, scores, best: bi, bestScore: scores[bi] };
  }).sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name, 'ja'));

  const lockedMembers = members.filter((m) => lockedNames.has(m.name));
  const lockedWeak = new Set();
  for (const lm of lockedMembers) for (const t of TYPES) if (defensiveMultiplier(lm, t) >= 2) lockedWeak.add(t);

  const details = members.map((m, mi) => {
    const reasons = [];
    if (lockedNames.has(m.name)) reasons.push('選択したポケモン');
    const answers = threatTable.filter((t) => t.best === mi && t.bestScore > 0.15 && t.name !== m.name)
      .sort((a, b) => b.weight * b.bestScore - a.weight * a.bestScore).slice(0, 4).map((t) => t.name);
    if (answers.length) reasons.push(`${answers.join('・')}に対してチーム内で最も有利`);
    if (!lockedNames.has(m.name) && lockedMembers.length) {
      const covers = [...lockedWeak].filter((t) => defensiveMultiplier(m, t) <= 0.5);
      if (covers.length) reasons.push(`${lockedMembers.map((x) => x.name).join('・')}の弱点（${covers.map((t) => TYPE_JP[t]).join('・')}）を半減以下で受けられる`);
      const pc = lockedMembers.reduce((s, x) => s + pairCount(x.name, m.name), 0);
      if (pc > 0) reasons.push(`考察本の掲載構築で${lockedMembers.map((x) => x.name).join('・')}と${pc}回同居`);
    }
    return { member: m, roles: roleLabels(m), reasons };
  });

  const score = scoreTeam(members);
  const prof = typeProfile(members);
  const warnings = [];
  for (const t of TYPES) if (prof[t].weak >= 3) warnings.push(`${TYPE_JP[t]}タイプの技を弱点とするポケモンが${prof[t].weak}体`);
  for (const t of threatTable) if (t.bestScore < -0.1 && t.weight >= 1) warnings.push(`${t.name}に有利なポケモンがいない（${TIER_LABEL[t.tier]}）`);
  if (!members.some((m) => m.tags.phaze || m.tags.encore)) warnings.push('『ほえる』『ふきとばし』『アンコール』などの積み・バトン対策がない');
  if (members.filter((m) => m.tags.sleep).length >= 2) warnings.push('眠り技持ちが複数（ルール上、同時に2体以上は眠らせられない）');
  if (members.some((m) => m.ability === 'かげふみ')) warnings.push('相手も『かげふみ』を手持ちに入れている場合、ソーナンスは選出できない');

  const must = locked.map((l) => l.name);
  return {
    members: details,
    score,
    typeProfile: prof,
    threats: threatTable,
    warnings,
    selections: bestSelections(members, must).map((s) => s.trio.map((m) => m.name)),
    samples: SAMPLE_TEAMS.filter((t) => t.members.filter((x) => members.some((m) => m.name === x.name)).length >= 3)
      .map((t) => ({ no: t.no, title: t.title, year: t.year, overlap: t.members.filter((x) => members.some((m) => m.name === x.name)).map((x) => x.name) })),
  };
}

export { TYPE_JP };
