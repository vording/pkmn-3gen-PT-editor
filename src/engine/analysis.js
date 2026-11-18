// 提案パーティの「調整の目安」と「戦い方」を、計算とルールから文章にする
import { damageRolls, koChance, matchup } from './matchup.js';
import { SPREAD_PRESETS, withSpread, natureEffect } from './model.js';
import { getThreats, STRUCTURE_SLOTS } from './recommend.js';
import { findCombos, classifyArchetype, ARCHETYPES, antiComboTools } from '../data/strategy.js';

const EXPLOSION = new Set(['じばく', 'だいばくはつ']);

// 仮想敵を種族ごとに1つ（いちばん重い型）にまとめ、重い順に並べる
function mainThreats() {
  const byName = new Map();
  for (const t of getThreats()) {
    const cur = byName.get(t.name);
    if (!cur) byName.set(t.name, { name: t.name, member: t.member, weight: t.weight, total: t.weight });
    else cur.total += t.weight;
  }
  return [...byName.values()].sort((a, b) => b.total - a.total);
}

const short = (label) => label.replace(/[『』]/g, '').replace(/^型(\d)$/, '型$1').slice(0, 14);
const who = (t) => `${t.name}（${short(t.member.set.label)}）`;

// 確定数の表現（例：確定2発、乱数1発 31%）
export function koText(rolls, hp) {
  const min = rolls[0];
  const max = rolls[rolls.length - 1];
  if (max === 0) return '無効';
  for (let n = 1; n <= 4; n++) {
    const p = koChance(rolls, hp, n);
    if (p >= 0.999) return `確定${n}発`;
    if (p > 0.001) return `乱数${n}発（${Math.round(p * 100)}%）`;
  }
  return min * 5 >= hp ? '確定5発' : '5発以上';
}

function bestMove(att, def) {
  let best = null;
  for (const m of att.moves) {
    if (EXPLOSION.has(m.name)) continue;
    const rolls = damageRolls(att, def, m);
    if (!rolls) continue;
    const avg = rolls.reduce((a, b) => a + b, 0) / rolls.length;
    if (!best || avg > best.avg) best = { move: m, rolls, avg };
  }
  return best;
}

const pctRange = (rolls, hp) => {
  const lo = Math.floor((rolls[0] / hp) * 1000) / 10;
  const hi = Math.floor((rolls[rolls.length - 1] / hp) * 1000) / 10;
  return `${lo}〜${hi}%`;
};

// 1体ぶんの調整の目安：素早さライン・耐久・火力
export function adjustmentNotes(member) {
  const threats = mainThreats().filter((t) => t.name !== member.name);
  const notes = { speed: '', bulk: [], power: [] };

  // 素早さ：仮想敵の実数値と比べて、抜ける／抜けない境目を示す
  const s = member.stats[5];
  const speeds = [];
  const major = new Set(mainThreats().filter((t) => t.total >= 0.8).map((t) => t.name));
  for (const t of getThreats()) if (t.name !== member.name && major.has(t.name)) speeds.push({ name: t.name, s: t.member.stats[5], label: short(t.member.set.label) });
  const uniq = (arr) => [...new Map(arr.map((x) => [`${x.name}${x.s}`, x])).values()];
  const slower = uniq(speeds.filter((x) => x.s < s)).sort((a, b) => b.s - a.s).slice(0, 3);
  const same = uniq(speeds.filter((x) => x.s === s)).slice(0, 2);
  const faster = uniq(speeds.filter((x) => x.s > s)).sort((a, b) => a.s - b.s).slice(0, 2);
  const fmt = (x) => `${x.name}${x.label ? `・${x.label}` : ''}(${x.s})`;
  const parts = [];
  if (slower.length) parts.push(`${slower.map(fmt).join('、')}抜き`);
  if (same.length) parts.push(`${same.map(fmt).join('、')}と同速`);
  if (faster.length) parts.push(`${faster.map(fmt).join('、')}より遅い`);
  notes.speed = `S${s}：${parts.join('／') || '比較対象なし'}`;

  // 耐久：使用率の高い仮想敵の一番痛い技を何発耐えるか
  const hp = member.stats[0];
  for (const t of threats) {
    if (notes.bulk.length >= 4) break;
    const b = bestMove(t.member, member);
    if (!b || b.rolls[b.rolls.length - 1] < hp * 0.25) continue;
    notes.bulk.push(`${who(t)}の${b.move.name}：${pctRange(b.rolls, hp)}（${koText(b.rolls, hp)}）`);
  }

  // 火力：使用率の高い仮想敵に一番通る技
  for (const t of threats) {
    if (notes.power.length >= 4) break;
    const b = bestMove(member, t.member);
    if (!b || b.avg === 0) continue;
    const thp = t.member.stats[0];
    if (b.rolls[b.rolls.length - 1] < thp * 0.2) continue;
    const flail = b.move.name === 'きしかいせい' || b.move.name === 'じたばた';
    notes.power.push(`${who(t)}に${b.move.name}${flail ? '（最大威力）' : ''}：${pctRange(b.rolls, thp)}（${koText(b.rolls, thp)}）`);
  }
  return notes;
}

// ---- 戦い方 ----

function memberPlan(m) {
  const t = m.tags;
  const lines = [];
  const name = m.name;
  if (t.flail && t.sub) lines.push(`身代わりを連打してHPを減らし、${m.item === 'カムラのみ' ? 'カムラのみで素早さを上げてから' : ''}${m.set.moves.find((x) => x === 'きしかいせい' || x === 'じたばた')}で全抜きを狙う。電磁波などで起点を作ってから出すと決まりやすい`);
  else if (t.endeavor && t.sub) lines.push('身代わりでHPを削ってからがむしゃら＋先制攻撃で相手を倒す。耐久が高い相手の処理役');
  if (t.confuse && t.sub) lines.push('先手を取れる相手にいばる→身代わりで試行回数を稼ぐ。いばった相手の物理技は痛いので身代わりを残すことを優先');
  if (t.setupPhys || t.setupSpec) {
    const mv = m.set.moves.find((x) => ['つるぎのまい', 'りゅうのまい', 'めいそう', 'ビルドアップ', 'はらだいこ', 'ほたるび'].includes(x));
    lines.push(`有利対面や相手の交代読みで${mv}を積み、終盤の詰め役にする`);
  }
  if (t.curse) lines.push('のろいで物理耐久と攻撃を上げ、物理アタッカーに居座って詰める');
  if (t.metalSound) lines.push('きんぞくおんで相手の特防を下げ、特殊受け（カビゴンなど）を崩す');
  if (m.item === 'こだわりハチマキ') lines.push('有利対面・交代先に高火力を押し付けてサイクルを崩す。技が固定されるので交代読みに注意');
  if (t.counter && t.mirrorCoat) lines.push('相手の攻撃をカウンター／ミラーコートで返す。アンコール・みちづれで積みや居座りを止める');
  else if (t.counter) lines.push('物理アタッカー（メタグロスなど）の攻撃をカウンターで返して倒す');
  if (t.para) lines.push('でんじはを撒いて後続のエースの起点を作る');
  if (t.burn) lines.push('おにびで物理アタッカーを機能停止させる');
  if (t.sleep) lines.push('眠り技で1体を眠らせる（相手がすでに眠っているときは使えない）');
  if (t.toxic) lines.push('どくどくで受けポケモンにじわじわ負担をかける');
  if (t.phaze) lines.push(`${m.set.moves.find((x) => ['ほえる', 'ふきとばし', 'ほろびのうた', 'くろいきり'].includes(x))}で積み技やバトンタッチを流す`);
  if (t.encore && !t.counter) lines.push('アンコール・ちょうはつで補助技や積み技を縛る');
  if (t.screens) lines.push('壁を張って後続の積みや受け出しを助ける');
  if (t.spikes) lines.push('まきびしを撒いて交代のたびに削る（浮いている相手には無効）');
  if (t.baton) lines.push('身代わりや積んだ能力をバトンタッチで後続に渡す');
  if (t.explode) {
    const mv = m.set.moves.find((x) => ['だいばくはつ', 'じばく', 'みちづれ', 'おきみやげ'].includes(x));
    lines.push(`不利対面や終盤に${mv}で1:1交換を取る（引き分けになると使った側の負け）`);
  }
  if (t.recover && !t.sleep && lines.length < 2) lines.push('回復技を使いながら繰り返し受け出す');
  if (!lines.length) {
    const atk = m.moves.filter((x) => x.power > 0);
    lines.push(atk.length >= 3 ? '有利な相手に繰り出して攻撃技で削る' : `${name}の役割に合わせて受け出し・削りを担当`);
  }
  return lines.slice(0, 3);
}

// 先発向きの度合い
function leadScore(m) {
  let s = 0;
  if (m.tags.para || m.tags.screens || m.tags.spikes) s += 2;
  if (m.tags.explode) s += 1.5;
  if (m.tags.confuse && m.tags.sub) s += 1;
  if (m.tags.sleep) s += 1.5;
  if (m.tags.flail || m.tags.setupPhys || m.tags.setupSpec) s -= 1.5;
  if (m.name === 'ソーナンス') s -= 1;
  s += m.stats[5] / 200;
  return s;
}

export function gamePlan(result) {
  const members = result.members.map((d) => d.member);
  const names = new Set(members.map((m) => m.name));
  const has = (pred) => members.filter(pred);
  const isWall = (m) => m.stats[0] * m.stats[4] >= 36000 || m.stats[0] * m.stats[2] >= 30000;
  const aces = has((m) => m.tags.flail || m.tags.setupPhys || (m.tags.setupSpec && !isWall(m)) || (m.tags.confuse && m.tags.sub && m.stats[5] >= 120) || m.tags.endeavor);
  const paras = has((m) => m.tags.para);
  const traders = has((m) => m.tags.explode || m.tags.counter);
  const walls = has(isWall);
  const choice = has((m) => m.item === 'こだわりハチマキ');
  const list = (arr) => arr.map((m) => m.name).join('・');

  // 1) 勝ち筋
  const concept = [];
  if (['カビゴン', 'メタグロス', 'サンダー'].every((n) => names.has(n))) concept.push('カビゴン・メタグロス・サンダー（カビグロスサンダー）の対面性能でサイクルを回し、相手を削っていく');
  if (paras.length && aces.length) concept.push(`${list(paras)}のでんじはで相手の素早さを落とし、${list(aces)}の身代わり・積みから全抜きを狙う`);
  else if (aces.length) concept.push(`削れた終盤に${list(aces)}で詰める`);
  if (traders.length >= 2) concept.push(`${list(traders)}のカウンター・大爆発などで1:1交換を重ね、数的有利を作る`);
  if (walls.length >= 2 && !aces.length) concept.push(`${list(walls)}で受け回し、状態異常や定数ダメージで相手を削り切る`);
  if (choice.length) concept.push(`${list(choice)}のこだわりハチマキで受けに来た相手に負担をかける`);
  if (!concept.length) concept.push('有利な対面を作るように交代を繰り返し、削れた相手から倒していく');

  // 2) 先発
  const sel = result.selections[0] ?? members.slice(0, 3).map((m) => m.name);
  const selMembers = sel.map((n) => members.find((m) => m.name === n)).filter(Boolean);
  const lead = [...selMembers].sort((a, b) => leadScore(b) - leadScore(a))[0];
  const leadWhy = lead.tags.para ? 'でんじはで起点を作りやすい'
    : lead.tags.screens ? '壁で後続をサポートできる'
      : lead.tags.explode ? '不利でも大爆発・みちづれで交換に持ち込める'
        : lead.tags.confuse && lead.tags.sub ? '素早さを活かしていばみがで先手を取れる'
          : '先発で出てくる相手の多くと戦える';

  // 3) 相手のポケモン別の対応（使用率の高い順）
  const vs = result.threats.slice(0, 8).map((t) => {
    const best = result.members[t.best].member.name;
    const tone = t.bestScore > 0.5 ? '有利' : t.bestScore > 0.15 ? 'やや有利' : t.bestScore > -0.15 ? '五分' : '不利';
    return { name: t.name, best, tone, score: t.bestScore };
  });

  // 4) 苦手な相手
  const weak = result.threats.filter((t) => t.weight >= 0.8 && t.bestScore < 0.15 && !names.has(t.name)).slice(0, 4).map((t) => {
    const best = result.members[t.best].member;
    const tip = members.some((m) => m.tags.explode) ? `削ってから${members.filter((m) => m.tags.explode).map((m) => m.name)[0]}の大爆発・みちづれで交換を狙う` : '選出段階で警戒し、先に削っておく';
    return `${t.name}：${best.name}が一番まし（${t.bestScore > -0.15 ? '五分' : '不利'}）。${tip}`;
  });

  // 構築タイプ・コンボ・枠
  const archetype = classifyArchetype(members);
  const combos = findCombos(members);
  const slots = STRUCTURE_SLOTS.map((slot) => ({ label: slot.label, who: members.filter(slot.test).map((m) => m.name) }));

  // 身代わり展開・バトンへの対策
  const anti = members.map((m) => ({ name: m.name, tools: antiComboTools(m) })).filter((x) => x.tools.length);

  // 麻痺撒きの作戦（stoic氏「GBA麻痺撒き戦術まとめ」の4分類）
  const paraPlans = [];
  if (paras.length) {
    const subAces = members.filter((m) => m.tags.sub && (m.tags.flail || m.tags.endeavor || m.tags.confuse || m.tags.setupPhys || m.tags.setupSpec) && !paras.includes(m));
    const slowHitters = members.filter((m) => !paras.includes(m) && m.stats[5] < 110 && (m.item === 'こだわりハチマキ' || m.item === 'ふといホネ' || m.tags.setupPhys || m.stats[1] >= 170 || m.stats[3] >= 170));
    if (subAces.length) paraPlans.push(`身代わり連打の強化：麻痺で相手が痺れたターンに${list(subAces)}の身代わりが残り、積みや攻撃の猶予ができる（身代わり3回でようやく五分くらいなので過信しない）`);
    if (slowHitters.length) paraPlans.push(`鈍足アタッカーの補助：麻痺で素早さを1/4にして、${list(slowHitters)}が上から殴れるようにする（痺れに頼らない確実な作戦）`);
    if (names.has('カビゴン')) paraPlans.push('カビゴン同士の対決を有利に：相手カビゴンに麻痺を入れてから自分のカビゴンを出すと、長い殴り合い・積み合いで有利');
    if (walls.length) paraPlans.push(`受けの負担を減らす：麻痺した相手は動けないターンがあるので、${list(walls)}で受けきれる確率が上がる`);
  }

  const notes = [];
  if (names.has('ソーナンス')) notes.push('相手の6体にもソーナンス（かげふみ）がいると、お互いソーナンスを選出できない');
  if (members.filter((m) => m.tags.sleep).length) notes.push('相手がすでに眠っている（ねむるを含む）ときは眠り技を使えない');
  if (members.some((m) => m.tags.explode)) notes.push('大爆発・じばく・みちづれで引き分けになると、使った側の負けになる');

  return {
    concept,
    archetype: { name: archetype, text: ARCHETYPES[archetype] },
    combos: [...combos.trios, ...combos.pairs].map((c) => ({ name: c.name, text: c.text })),
    slots,
    anti,
    paraPlans,
    notes,
    lead: { name: lead.name, why: leadWhy, back: sel.filter((n) => n !== lead.name) },
    perMember: members.map((m) => ({ name: m.name, lines: memberPlan(m) })),
    vs,
    weak,
  };
}

// ---- ぶっぱ（252・252振り）にするならどれか ----
// 型の性格・技・持ち物はそのままで、4通りの252振りを仮想敵（使用率で重み付け）への平均有利度で比べる
export function recommendBuppa(member) {
  const threats = getThreats().filter((t) => t.name !== member.name);
  const totalW = threats.reduce((a, t) => a + t.weight, 0);
  const evalM = (m) => {
    const per = new Map();
    let sum = 0;
    for (const t of threats) {
      const v = matchup(m, t.member);
      sum += v * t.weight;
      const e = per.get(t.name) ?? { w: 0, s: 0 };
      e.w += t.weight; e.s += v * t.weight;
      per.set(t.name, e);
    }
    return { avg: sum / totalW, per };
  };
  const base = evalM(member);
  // 性格と噛み合う配分だけを候補にする（例：素早さ上昇の性格なら AS/CS）
  const nat = natureEffect(member.nature);
  let allowed = ['atkSpe', 'hpAtk', 'hpDef', 'hpSpd'];
  if (nat.up === 5) allowed = ['atkSpe'];
  else if (nat.up === 1 || nat.up === 3) allowed = ['atkSpe', 'hpAtk'];
  else if (nat.up === 2) allowed = ['hpDef'];
  else if (nat.up === 4) allowed = ['hpSpd'];
  if (nat.down === 5) allowed = allowed.filter((k) => k !== 'atkSpe');
  if (!allowed.length) allowed = ['hpAtk', 'hpDef', 'hpSpd'];
  let best = null;
  for (const p of SPREAD_PRESETS) {
    if (!p.evs || !allowed.includes(p.key)) continue;
    const m = withSpread(member, p.key);
    const r = evalM(m);
    if (!best || r.avg > best.avg) best = { key: p.key, member: m, ...r };
  }
  const reasons = [];
  // 素早さ：新たに抜ける相手
  const s0 = member.stats[5];
  const s1 = best.member.stats[5];
  const major = new Set([...base.per.entries()].filter(([, e]) => e.w >= 0.8).map(([n]) => n));
  const speedOf = new Map();
  for (const t of threats) if (major.has(t.name)) speedOf.set(t.name, Math.max(speedOf.get(t.name) ?? 0, t.member.stats[5]));
  if (s1 > s0) {
    const gained = [...speedOf].filter(([, s]) => s >= s0 && s < s1).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, s]) => `${n}(${s})`);
    reasons.push(gained.length ? `S${s0}→${s1}：${gained.join('・')}抜き` : `S${s0}→${s1}`);
  } else if (s1 < s0) {
    const lost = [...speedOf].filter(([, s]) => s >= s1 && s < s0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, s]) => `${n}(${s})`);
    reasons.push(`S${s0}→${s1}${lost.length ? `（${lost.join('・')}に抜かれる）` : ''}`);
  }
  // 有利度が上がる／下がる相手
  const diff = [...best.per.entries()].filter(([n]) => major.has(n)).map(([n, e]) => ({ n, d: (e.s - base.per.get(n).s) / e.w }));
  const up = diff.filter((x) => x.d > 0.1).sort((a, b) => b.d - a.d).slice(0, 4).map((x) => x.n);
  const down = diff.filter((x) => x.d < -0.1).sort((a, b) => a.d - b.d).slice(0, 3).map((x) => x.n);
  if (up.length) reasons.push(`有利になる相手：${up.join('・')}`);
  if (down.length) reasons.push(`不利になる相手：${down.join('・')}`);
  const same = best.member.evs.every((v, i) => v === member.evs[i]);
  return { key: best.key, member: best.member, delta: best.avg - base.avg, reasons, same };
}
