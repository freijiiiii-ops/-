'use strict';

// ===== 部位 =====
// 色はグラフの検証済みパレットの順番で固定（部位ごとに常に同じ色）
const PARTS = [
  { id: 'chest', name: '胸', icon: '🛡️', color: '#2a78d6', dark: '#3987e5', target: 10 },
  { id: 'back', name: '背中', icon: '🦅', color: '#eb6834', dark: '#d95926', target: 10 },
  { id: 'shoulder', name: '肩', icon: '🏔️', color: '#1baf7a', dark: '#199e70', target: 8 },
  { id: 'arm', name: '腕', icon: '💪', color: '#eda100', dark: '#c98500', target: 8 },
  { id: 'leg', name: '脚', icon: '🦵', color: '#e87ba4', dark: '#d55181', target: 10 },
  { id: 'abs', name: '腹・体幹', icon: '🔥', color: '#008300', dark: '#008300', target: 6 },
];
const OTHER_PART = { id: 'other', name: 'その他', icon: '⭐', color: '#4a3aa7', dark: '#9085e9', target: 0 };
const PART_BY_ID = Object.fromEntries([...PARTS, OTHER_PART].map((p) => [p.id, p]));

// ===== 種目ライブラリ =====
// anim: 棒人間アニメーションの定義（角度は度。0=右, 90=下, -90=上）
//   anchor: 固定する関節, at: その座標, a/b: 2つの姿勢, hold: 持つ道具, props: 器具, hl: 強調する体の部分
const BENCH_FLAT = [{ t: 'rect', p: [52, 100, 86, 6] }, { t: 'line', p: [62, 106, 62, 150], w: 4 }, { t: 'line', p: [128, 106, 128, 150], w: 4 }];

const EXERCISES = [
  // ---- 胸 ----
  {
    name: 'ベンチプレス', part: 'chest', muscles: '大胸筋・三角筋前部・上腕三頭筋', reps: '8〜12回 × 3セット',
    tips: ['肩甲骨を寄せて胸を張る', 'バーは胸の下あたりに下ろす', '足でしっかり床を踏ん張る'],
    anim: { anchor: 'hip', at: [125, 93], hold: 'barbell', hl: ['torso', 'arm'], props: BENCH_FLAT,
      a: { torso: 180, upper: -90, fore: -90, thigh: 40, shin: 92 },
      b: { upper: 70, fore: -100 } },
  },
  {
    name: 'インクラインダンベルプレス', part: 'chest', muscles: '大胸筋上部・三角筋前部', reps: '8〜12回 × 3セット',
    tips: ['ベンチの角度は30〜45度', 'ダンベルは胸の横までゆっくり下ろす', '押し上げたとき肘を伸ばしきらない'],
    anim: { anchor: 'hip', at: [118, 118], hold: 'dumbbell', hl: ['torso', 'arm'],
      props: [{ t: 'line', p: [113, 123, 81, 85], w: 6 }, { t: 'line', p: [100, 123, 140, 123], w: 6 }, { t: 'line', p: [120, 123, 120, 150], w: 4 }],
      a: { torso: -130, upper: -95, fore: -90, thigh: 0, shin: 90 },
      b: { upper: 65, fore: -105 } },
  },
  {
    name: '腕立て伏せ', part: 'chest', muscles: '大胸筋・上腕三頭筋・体幹', reps: '10〜20回 × 3セット',
    tips: ['頭からかかとまで一直線', '胸が床すれすれまで下げる', 'きつい人は膝をついてもOK'],
    anim: { anchor: 'ankle', at: [40, 146], hl: ['torso', 'arm'],
      a: { torso: -22, upper: 90, fore: 90, thigh: 158, shin: 158 },
      b: { torso: -8, upper: 169, fore: 41, thigh: 172, shin: 172 } },
  },
  {
    name: 'ディップス', part: 'chest', muscles: '大胸筋下部・上腕三頭筋', reps: '8〜15回 × 3セット',
    tips: ['少し前傾すると胸に効く', '肩をすくめないように', '肘が90度くらいまで下げる'],
    anim: { anchor: 'wrist', at: [100, 78], hl: ['torso', 'arm'],
      props: [{ t: 'line', p: [84, 81, 118, 81], w: 5 }, { t: 'line', p: [112, 81, 112, 150], w: 4 }],
      a: { torso: -88, upper: 90, fore: 90, thigh: 95, shin: 140 },
      b: { torso: -75, upper: 150, fore: 60, thigh: 100, shin: 145 } },
  },
  {
    name: 'チェストプレス（マシン）', part: 'chest', muscles: '大胸筋・三角筋前部', reps: '10〜15回 × 3セット',
    tips: ['グリップは胸の高さに合わせる', '背中をシートにつけたまま押す', '戻すときもゆっくり'],
    anim: { anchor: 'hip', at: [80, 118], hold: 'handle', hl: ['torso', 'arm'],
      props: [{ t: 'line', p: [58, 122, 104, 122], w: 6 }, { t: 'line', p: [64, 122, 68, 64], w: 6 }, { t: 'line', p: [80, 122, 80, 150], w: 4 }],
      a: { torso: -95, upper: 160, fore: 0, thigh: 0, shin: 90 },
      b: { upper: 5, fore: 0 } },
  },

  // ---- 背中 ----
  {
    name: 'デッドリフト', part: 'back', muscles: '脊柱起立筋・広背筋・お尻・もも裏', reps: '5〜8回 × 3セット',
    tips: ['背中を丸めない（胸を張る）', 'バーはすねの近くを通す', 'お尻を後ろに引くイメージ'],
    anim: { anchor: 'ankle', at: [100, 148], hold: 'barbell', hl: ['torso', 'leg'],
      a: { torso: -25, neck: -35, upper: 95, fore: 90, thigh: 25, shin: 100 },
      b: { torso: -90, neck: -90, upper: 90, fore: 90, thigh: 90, shin: 90 } },
  },
  {
    name: 'チンニング（懸垂）', part: 'back', muscles: '広背筋・大円筋・上腕二頭筋', reps: 'できる回数 × 3セット',
    tips: ['胸をバーに近づけるように引く', '反動を使わない', '下ろすときもゆっくり'],
    anim: { anchor: 'wrist', at: [100, 26], noFloor: true, hl: ['torso', 'arm'],
      props: [{ t: 'line', p: [60, 26, 140, 26], w: 4 }],
      a: { torso: -90, upper: -90, fore: -90, thigh: 100, shin: 170 },
      b: { torso: -80, upper: 60, fore: -110, thigh: 105, shin: 160 } },
  },
  {
    name: 'ラットプルダウン', part: 'back', muscles: '広背筋・大円筋', reps: '10〜12回 × 3セット',
    tips: ['バーは胸の上部に引く', '肘を下に引くイメージ', '体を後ろに倒しすぎない'],
    anim: { anchor: 'hip', at: [95, 115], hold: 'handle', cable: [97, 0], hl: ['torso', 'arm'],
      props: [{ t: 'line', p: [72, 120, 112, 120], w: 6 }, { t: 'line', p: [92, 120, 92, 150], w: 4 }, { t: 'rect', p: [116, 102, 20, 6] }],
      a: { torso: -95, upper: -80, fore: -85, thigh: 0, shin: 90 },
      b: { upper: 100, fore: -70 } },
  },
  {
    name: 'ベントオーバーロウ', part: 'back', muscles: '広背筋・僧帽筋・菱形筋', reps: '8〜12回 × 3セット',
    tips: ['上体は45度くらい前傾', 'バーをおへそに向かって引く', '背中を丸めない'],
    anim: { anchor: 'ankle', at: [100, 148], hold: 'barbell', hl: ['torso', 'arm'],
      a: { torso: -30, neck: -20, upper: 90, fore: 90, thigh: 70, shin: 100 },
      b: { upper: 165, fore: 90 } },
  },
  {
    name: 'シーテッドロウ', part: 'back', muscles: '広背筋・僧帽筋・菱形筋', reps: '10〜12回 × 3セット',
    tips: ['胸を張って肩甲骨を寄せる', '肘を体の後ろまで引く', '上体を反動で動かさない'],
    anim: { anchor: 'hip', at: [70, 128], hold: 'handle', cable: [192, 112], hl: ['torso', 'arm'],
      props: [{ t: 'rect', p: [44, 132, 52, 6] }, { t: 'line', p: [70, 138, 70, 150], w: 4 }, { t: 'line', p: [133, 122, 133, 150], w: 5 }],
      a: { torso: -65, upper: 5, fore: 0, thigh: -5, shin: 30 },
      b: { torso: -95, upper: 160, fore: 5 } },
  },

  // ---- 肩 ----
  {
    name: 'ショルダープレス', part: 'shoulder', muscles: '三角筋前部・中部・上腕三頭筋', reps: '8〜12回 × 3セット',
    tips: ['腰を反りすぎない', 'ダンベルは耳の横から真上へ', '肘は少し前に出す'],
    anim: { anchor: 'hip', at: [100, 118], hold: 'dumbbell', hl: ['arm'],
      props: [{ t: 'line', p: [80, 122, 120, 122], w: 6 }, { t: 'line', p: [92, 122, 92, 74], w: 6 }, { t: 'line', p: [100, 122, 100, 150], w: 4 }],
      a: { torso: -90, upper: 100, fore: -90, thigh: 0, shin: 90 },
      b: { upper: -88, fore: -90 } },
  },
  {
    name: 'サイドレイズ', part: 'shoulder', muscles: '三角筋中部', reps: '12〜15回 × 3セット',
    tips: ['肩の高さまで横に上げる', '軽めの重さで丁寧に', '肩をすくめない'],
    anim: { view: 'front', anchor: 'hip', at: [100, 90], hold: 'dumbbell', hl: ['arm'],
      a: { upper: 82, fore: 86, thigh: 92, shin: 90 },
      b: { upper: 8, fore: 2 } },
  },
  {
    name: 'フロントレイズ', part: 'shoulder', muscles: '三角筋前部', reps: '12〜15回 × 3セット',
    tips: ['腕を前に肩の高さまで', '体を反らして反動をつけない', 'ゆっくり下ろす'],
    anim: { anchor: 'ankle', at: [100, 150], hold: 'dumbbell', hl: ['arm'],
      a: { torso: -90, upper: 85, fore: 85, thigh: 90, shin: 90 },
      b: { upper: -5, fore: -5 } },
  },
  {
    name: 'アップライトロウ', part: 'shoulder', muscles: '三角筋中部・僧帽筋', reps: '10〜12回 × 3セット',
    tips: ['肘を先行させて引き上げる', 'バーは体の近くを通す', '胸の高さまででOK'],
    anim: { anchor: 'ankle', at: [100, 150], hold: 'barbell', hl: ['arm'],
      a: { torso: -90, upper: 92, fore: 88, thigh: 90, shin: 90 },
      b: { upper: -170, fore: 20 } },
  },

  // ---- 腕 ----
  {
    name: 'ダンベルカール', part: 'arm', muscles: '上腕二頭筋', reps: '10〜12回 × 3セット',
    tips: ['肘の位置を固定する', '反動を使わない', '下ろすときもゆっくり効かせる'],
    anim: { anchor: 'ankle', at: [100, 150], hold: 'dumbbell', hl: ['arm'],
      a: { torso: -90, upper: 92, fore: 88, thigh: 90, shin: 90 },
      b: { upper: 88, fore: -75 } },
  },
  {
    name: 'ハンマーカール', part: 'arm', muscles: '上腕筋・腕橈骨筋・上腕二頭筋', reps: '10〜12回 × 3セット',
    tips: ['手のひらを内側に向けたまま', '肘を体の横に固定', '肩が前に出ないように'],
    anim: { anchor: 'ankle', at: [100, 150], hold: 'dumbbell', hl: ['arm'], period: 3200,
      a: { torso: -90, upper: 92, fore: 88, thigh: 90, shin: 90 },
      b: { upper: 86, fore: -70 } },
  },
  {
    name: 'トライセプスエクステンション', part: 'arm', muscles: '上腕三頭筋', reps: '10〜12回 × 3セット',
    tips: ['肘を耳の横で固定', '頭の後ろまで下ろす', '肘を開かない'],
    anim: { anchor: 'ankle', at: [100, 150], hold: 'dumbbell', hl: ['arm'],
      a: { torso: -90, upper: -100, fore: -95, thigh: 90, shin: 90 },
      b: { upper: -105, fore: 105 } },
  },
  {
    name: 'ケーブルプッシュダウン', part: 'arm', muscles: '上腕三頭筋', reps: '12〜15回 × 3セット',
    tips: ['肘を脇腹に固定', '下まで押し切って1秒止める', '上体を前に倒しすぎない'],
    anim: { anchor: 'ankle', at: [100, 150], hold: 'handle', cable: [124, 0], hl: ['arm'],
      a: { torso: -85, upper: 100, fore: -25, thigh: 90, shin: 90 },
      b: { upper: 100, fore: 85 } },
  },
  {
    name: 'キックバック', part: 'arm', muscles: '上腕三頭筋', reps: '12〜15回 × 3セット',
    tips: ['上腕を床と平行に固定', '肘から先だけ後ろへ伸ばす', '伸ばしきって1秒キープ'],
    anim: { anchor: 'ankle', at: [100, 148], hold: 'dumbbell', hl: ['arm'],
      a: { torso: -25, neck: -15, upper: 165, fore: 90, thigh: 75, shin: 100 },
      b: { fore: 170 } },
  },

  // ---- 脚 ----
  {
    name: 'スクワット', part: 'leg', muscles: '大腿四頭筋・お尻・もも裏', reps: '8〜12回 × 3セット',
    tips: ['膝とつま先を同じ向きに', '太ももが床と平行まで下げる', 'かかとに体重をのせる'],
    anim: { anchor: 'ankle', at: [100, 148], hold: 'barbell', hl: ['leg'],
      a: { torso: -90, neck: -90, upper: 160, fore: -50, thigh: 90, shin: 90 },
      b: { torso: -55, neck: -60, upper: 175, fore: -30, thigh: 10, shin: 112 } },
  },
  {
    name: 'ランジ', part: 'leg', muscles: '大腿四頭筋・お尻', reps: '左右10回 × 3セット',
    tips: ['上体はまっすぐ', '後ろの膝を床すれすれまで', '前の膝がつま先より出すぎない'],
    anim: { anchor: 'ankle', at: [130, 148], hold: 'dumbbell', hl: ['leg'],
      a: { torso: -90, upper: 90, fore: 90, thigh: 80, shin: 92, thigh2: 110, shin2: 105 },
      b: { thigh: 5, shin: 95, thigh2: 100, shin2: 170 } },
  },
  {
    name: 'レッグプレス', part: 'leg', muscles: '大腿四頭筋・お尻', reps: '10〜15回 × 3セット',
    tips: ['膝を伸ばしきらない', '腰がシートから浮かない深さで', '足裏全体で押す'],
    anim: { anchor: 'hip', at: [62, 112], hold: 'handle', hl: ['leg'], attach: 'sled',
      props: [{ t: 'line', p: [62, 118, 22, 86], w: 6 }, { t: 'line', p: [50, 118, 80, 118], w: 6 }, { t: 'line', p: [62, 118, 62, 150], w: 4 }, { t: 'line', p: [100, 140, 170, 90], w: 3 }],
      a: { torso: -140, upper: 40, fore: 0, thigh: -45, shin: 30 },
      b: { thigh: -20, shin: -10 } },
  },
  {
    name: 'レッグカール', part: 'leg', muscles: 'もも裏（ハムストリングス）', reps: '10〜15回 × 3セット',
    tips: ['腰を浮かせない', 'かかとをお尻に近づける', 'ゆっくり戻す'],
    anim: { anchor: 'hip', at: [105, 95], hl: ['leg'], attach: 'pad',
      props: [{ t: 'rect', p: [38, 101, 112, 6] }, { t: 'line', p: [48, 107, 48, 150], w: 4 }, { t: 'line', p: [140, 107, 140, 150], w: 4 }],
      a: { torso: 180, upper: 115, fore: 90, thigh: 0, shin: 0 },
      b: { shin: -100 } },
  },
  {
    name: 'カーフレイズ', part: 'leg', muscles: 'ふくらはぎ', reps: '15〜20回 × 3セット',
    tips: ['かかとをできるだけ高く', '上で1秒止める', '膝は軽く伸ばしたまま'],
    anim: { anchor: 'ankle', hold: 'dumbbell', hl: ['leg'], period: 2400,
      a: { at: [100, 150], torso: -90, upper: 90, fore: 90, thigh: 90, shin: 90, foot: 0 },
      b: { at: [100, 141], foot: 55 } },
  },

  // ---- 腹・体幹 ----
  {
    name: 'クランチ', part: 'abs', muscles: '腹直筋', reps: '15〜20回 × 3セット',
    tips: ['おへそをのぞき込むように', '腰は床につけたまま', '首だけで起きない'],
    anim: { anchor: 'hip', at: [100, 140], hl: ['torso'], period: 2600,
      a: { torso: 180, upper: 10, fore: 0, thigh: -50, shin: 55 },
      b: { torso: -150, upper: -5, fore: -5 } },
  },
  {
    name: 'プランク', part: 'abs', muscles: '腹横筋・体幹全体', reps: '30〜60秒 × 3セット',
    tips: ['頭からかかとまで一直線', 'お尻を上げすぎない・下げすぎない', '呼吸を止めない'],
    anim: { anchor: 'ankle', at: [40, 146], hl: ['torso'], period: 4000, static: true,
      a: { torso: -12.5, upper: 90, fore: 0, thigh: 167.5, shin: 167.5 },
      b: { torso: -11.5, thigh: 168.5, shin: 168.5 } },
  },
  {
    name: 'レッグレイズ', part: 'abs', muscles: '腹直筋下部・腸腰筋', reps: '10〜15回 × 3セット',
    tips: ['腰が反らないように', '足は床につく手前で止める', 'ゆっくり下ろす'],
    anim: { anchor: 'hip', at: [105, 141], hl: ['torso', 'leg'],
      a: { torso: 180, upper: 0, fore: 0, thigh: -5, shin: -5 },
      b: { thigh: -85, shin: -80 } },
  },
  {
    name: 'アブローラー', part: 'abs', muscles: '腹直筋・体幹全体', reps: '8〜12回 × 3セット',
    tips: ['膝をついた状態から始める', '腰を反らさず背中は丸め気味', '戻せる範囲まで転がす'],
    anim: { anchor: 'knee', at: [60, 145], hold: 'roller', hl: ['torso'],
      a: { torso: -30, upper: 82, fore: 82, thigh: 100, shin: 180 },
      b: { torso: -8, upper: 15, fore: 15, thigh: 155 } },
  },
];
const EX_BY_NAME = Object.fromEntries(EXERCISES.map((e) => [e.name, e]));

// ===== 活動（METs：運動の強さ。安静時=1） =====
const ACTIVITIES = [
  { id: 'walk', name: 'ウォーキング', mets: 3.5 },
  { id: 'fastwalk', name: '早歩き', mets: 4.3 },
  { id: 'jog', name: 'ジョギング', mets: 7.0 },
  { id: 'run', name: 'ランニング', mets: 9.0 },
  { id: 'bike', name: 'サイクリング', mets: 6.8 },
  { id: 'commute', name: '自転車（通勤・買い物）', mets: 4.0 },
  { id: 'swim', name: '水泳', mets: 6.0 },
  { id: 'stairs', name: '階段の上り下り', mets: 4.0 },
  { id: 'yoga', name: 'ヨガ', mets: 2.5 },
  { id: 'stretch', name: 'ストレッチ', mets: 2.3 },
  { id: 'dance', name: 'ダンス', mets: 5.0 },
  { id: 'ball', name: '球技（サッカー・バスケ等）', mets: 7.0 },
  { id: 'rope', name: '縄跳び', mets: 11.0 },
  { id: 'clean', name: '家事（掃除など）', mets: 3.3 },
  { id: 'stand', name: '立ち仕事', mets: 2.5 },
  { id: 'labor', name: '力仕事', mets: 5.0 },
];
const ACTIVITY_BY_ID = Object.fromEntries(ACTIVITIES.map((a) => [a.id, a]));
const STRENGTH_METS = 5.0; // 筋トレ（ウエイトトレーニング）

// ===== ほめ言葉 =====
const PRAISE = {
  set: [
    'ナイスセット！🔥', 'いいぞ！その調子！💪', 'その1セットで確実に強くなった！', '筋肉が喜んでる！🎉',
    '最高の追い込み！', '強い！強すぎる！', '今のフォーム、かっこよかった！✨', '一歩ずつ理想の体へ！',
    'そのがんばり、未来の自分が感謝してるよ！', '天才的なセット！', 'まだいける！いや、もう十分えらい！',
    'あなたの努力、ちゃんと見てるよ👀', '今日いちばん輝いてる！', 'さすがすぎる！🌟',
  ],
  first: [
    '今日もトレーニング開始！来ただけで100点💯', 'やる気スイッチON！今日のあなたは最強！',
    'トレーニングを始めた時点で勝ち確！🏆', '今日も体を動かすあなた、本当に尊敬！',
  ],
  exerciseDone: [
    '{name} 全セット完了！おつかれさま！🏆', '{name} やりきった！すばらしすぎる！',
    '{name} 完走！その粘り強さが最強の武器！', '{name} クリア！次もこの勢いで！🔥',
  ],
  pr: [
    '自己ベスト更新！！あなたは天才！', '新記録！！昨日の自分を超えた！', 'PR更新！！努力が数字になったね！',
  ],
  firstTime: ['初めての種目に挑戦！チャレンジ精神がえらい！', '新しい種目デビュー！かっこいい！'],
  memo: [
    '記録できてえらい！📝', '自分の体と向き合えてて素晴らしい！', 'こまめな記録、ほんとにえらい！',
    'その積み重ねが結果につながる！', '記録上手！プロのアスリートみたい！',
  ],
  sleepGood: ['しっかり眠れてえらい！筋肉は寝ている間に育つよ😴', '睡眠ばっちり！回復力アップ！'],
  sleepShort: ['睡眠ちょっと少なめ。今日は無理せずいこう！それでも記録してえらい！'],
  profile: ['プロフィール登録ありがとう！これで計算もバッチリ！'],
};

function pickPraise(kind, vars = {}) {
  const list = PRAISE[kind] || PRAISE.set;
  const msg = list[Math.floor(Math.random() * list.length)];
  return msg.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}
