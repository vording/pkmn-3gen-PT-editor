// 独自ランクを計算して src/data/ownrank.js に書き出す: npm run rank
// 点数 = 対面性能 0.5 ＋ 環境での使われ方 0.35 ＋ 考察本の重要度 0.15 ＋ 勝率補正（stoic氏ランクに載っている場合のみ、最大±0.05）
import { writeFile } from 'node:fs/promises';
import { computeOwnScores, DEX } from '../src/engine/recommend.js';

const CUTS = [['S+', 3], ['S', 8], ['A', 18], ['B', 32], ['C', 50], ['D', 80]];

const rows = computeOwnScores().map((x) => {
  const win = DEX.get(x.name).rank2026?.win;
  const perf = win == null ? 0 : Math.max(-0.05, Math.min(0.05, (win - 50) / 200));
  const score = 0.5 * (x.power + 1) + 0.35 * x.use * 2 + 0.15 * x.book * 2 + perf;
  return { ...x, perf, score };
}).sort((a, b) => b.score - a.score);

const out = {};
rows.forEach((x, i) => {
  const pos = i + 1;
  const rank = (CUTS.find(([, n]) => pos <= n) ?? ['E'])[0];
  out[x.name] = {
    rank, pos, score: +x.score.toFixed(3),
    power: +x.power.toFixed(3), use: +x.use.toFixed(3), book: x.book, perf: +x.perf.toFixed(3),
  };
});

const body = `// 自動生成: npm run rank（tools/build-own-rank.mjs）
// このツール独自のランク。対面性能（仮想敵への平均有利度）・環境での使われ方（2026年大会の使用率と入賞率）・考察本の重要度・勝率補正から点数化し、順位で区切ったもの
// S+:1〜3位 S:4〜8位 A:9〜18位 B:19〜32位 C:33〜50位 D:51〜80位 E:それ以降（全${rows.length}種）
export const OWN_RANK = ${JSON.stringify(out, null, 0).replace(/},"/g, '},\n  "').replace(/^{/, '{\n  ').replace(/}$/, ',\n}')};
`;
await writeFile(new URL('../src/data/ownrank.js', import.meta.url), body);
console.log(rows.slice(0, 20).map((x, i) => `${i + 1}.${x.name}(${out[x.name].rank})`).join(' '));
