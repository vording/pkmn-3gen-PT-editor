// オリジナルモンスター図鑑
// learnset の先頭4つがデフォルトの技構成

export const SPECIES = {
  hinokojika: {
    name: 'ヒノコジカ', types: ['fire'], ability: 'blazeheart',
    base: { hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100 },
    learnset: ['flameshot', 'scorchwave', 'crushfist', 'quickflash', 'sunrite', 'rush'],
  },
  mizuchidori: {
    name: 'ミズチドリ', types: ['water', 'flying'], ability: 'rainbringer',
    base: { hp: 80, atk: 70, def: 75, spa: 100, spd: 90, spe: 95 },
    learnset: ['torrent', 'vortexcannon', 'skydive', 'frostlance', 'galewing', 'rainprayer'],
  },
  morigame: {
    name: 'モリガメ', types: ['grass', 'ground'], ability: 'leafheart',
    base: { hp: 95, atk: 109, def: 105, spa: 75, spd: 85, spe: 56 },
    learnset: ['quake', 'leafdance', 'rockfall', 'sleepspores', 'vinedrain', 'guardstance'],
  },
  inazumarisu: {
    name: 'イナズマリス', types: ['electric'], ability: 'chargedbody',
    base: { hp: 60, atk: 65, def: 60, spa: 110, spd: 80, spe: 125 },
    learnset: ['voltstrike', 'staticnet', 'quickflash', 'mendlight', 'galewing', 'ambush'],
  },
  hyougarou: {
    name: 'ヒョウガロウ', types: ['ice', 'dark'], ability: 'sharpgaze',
    base: { hp: 80, atk: 110, def: 70, spa: 70, spd: 70, spe: 105 },
    learnset: ['frostlance', 'ambush', 'crushfist', 'quake', 'hailcall', 'rush'],
  },
  tekkenzaru: {
    name: 'テッケンザル', types: ['fighting'], ability: 'grit',
    base: { hp: 90, atk: 125, def: 80, spa: 50, spd: 70, spe: 85 },
    learnset: ['recklesskick', 'rockfall', 'ambush', 'warcry', 'crushfist', 'quickflash'],
  },
  dokuyaribachi: {
    name: 'ドクヤリバチ', types: ['bug', 'poison'], ability: 'acceleration',
    base: { hp: 65, atk: 100, def: 60, spa: 50, spd: 80, spe: 120 },
    learnset: ['venomfang', 'shellblade', 'skydive', 'warcry', 'toxicmist', 'galewing'],
  },
  sunamogura: {
    name: 'スナモグラ', types: ['ground', 'rock'], ability: 'sandbringer',
    base: { hp: 95, atk: 115, def: 120, spa: 45, spd: 60, spe: 50 },
    learnset: ['quake', 'rockfall', 'ironram', 'guardstance', 'crushfist', 'sandcall'],
  },
  yominotomoshibi: {
    name: 'ヨミノトモシビ', types: ['ghost', 'fire'], ability: 'sunbringer',
    base: { hp: 65, atk: 55, def: 75, spa: 115, spd: 100, spe: 95 },
    learnset: ['flameshot', 'mindwave', 'toxicmist', 'mendlight', 'umbralclaw', 'staticnet'],
  },
  sorahamidora: {
    name: 'ソラハミドラ', types: ['dragon', 'flying'], ability: 'sharpgaze',
    base: { hp: 95, atk: 120, def: 80, spa: 100, spd: 80, spe: 95 },
    learnset: ['wyrmdance', 'skydive', 'quake', 'wyrmbreath', 'flameshot', 'ironram'],
  },
  haganenomiko: {
    name: 'ハガネノミコ', types: ['steel', 'psychic'], ability: 'hover',
    base: { hp: 85, atk: 95, def: 120, spa: 95, spd: 100, spe: 60 },
    learnset: ['ironram', 'mindwave', 'focusmind', 'mendlight', 'quake', 'guardstance'],
  },
  nenrikifukurou: {
    name: 'ネンリキフクロウ', types: ['psychic', 'flying'], ability: 'sharpgaze',
    base: { hp: 85, atk: 60, def: 70, spa: 105, spd: 95, spe: 90 },
    learnset: ['mindwave', 'galewing', 'focusmind', 'staticnet', 'mendlight', 'ambush'],
  },
  ooyamaguma: {
    name: 'オオヤマグマ', types: ['normal'], ability: 'thickhide',
    base: { hp: 110, atk: 110, def: 80, spa: 50, spd: 80, spe: 60 },
    learnset: ['rush', 'crushfist', 'quake', 'warcry', 'quickflash', 'mendlight'],
  },
  koorazarashi: {
    name: 'コオラザラシ', types: ['water', 'ice'], ability: 'tideheart',
    base: { hp: 110, atk: 60, def: 90, spa: 95, spd: 90, spe: 55 },
    learnset: ['torrent', 'frostlance', 'mendlight', 'hailcall', 'vortexcannon', 'glare'],
  },
};

for (const [id, sp] of Object.entries(SPECIES)) sp.id = id;
