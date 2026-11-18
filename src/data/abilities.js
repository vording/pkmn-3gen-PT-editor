// 特性（オリジナル名称・第三世代の挙動を参考にした効果）

export const ABILITIES = {
  blazeheart: { name: '炎心', desc: 'HPが1/3以下のとき、炎技の威力が1.5倍。' },
  tideheart: { name: '水心', desc: 'HPが1/3以下のとき、水技の威力が1.5倍。' },
  leafheart: { name: '樹心', desc: 'HPが1/3以下のとき、草技の威力が1.5倍。' },
  sharpgaze: { name: '鋭い眼光', desc: '場に出たとき、相手の攻撃を1段階下げる。' },
  hover: { name: '空中浮揚', desc: '地面技を受けない。' },
  grit: { name: '闘志', desc: '状態異常のとき攻撃が1.5倍。やけどでも攻撃が下がらない。' },
  rainbringer: { name: '雨招き', desc: '場に出たとき、天気を雨にする（ターン制限なし）。' },
  sunbringer: { name: '陽招き', desc: '場に出たとき、天気を日差しにする（ターン制限なし）。' },
  sandbringer: { name: '砂招き', desc: '場に出たとき、天気を砂嵐にする（ターン制限なし）。' },
  chargedbody: { name: '帯電体', desc: '接触技を受けると、30%の確率で相手をまひさせる。' },
  thickhide: { name: '脂肪の鎧', desc: '炎・氷技で受けるダメージが半分になる。' },
  acceleration: { name: '疾走本能', desc: '毎ターン終了時に素早さが1段階上がる。' },
};

export const PINCH_ABILITIES = {
  blazeheart: 'fire',
  tideheart: 'water',
  leafheart: 'grass',
};

export const WEATHER_ABILITIES = {
  rainbringer: 'rain',
  sunbringer: 'sun',
  sandbringer: 'sand',
};
