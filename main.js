// ===== ゲーム画面（Canvas）の準備 =====
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
// SAN低下時の画面歪みエフェクト用に、完成した1フレームを一時的に複製しておくためのオフスクリーンCanvas
const distortionCanvas = document.createElement('canvas');
distortionCanvas.width = canvas.width;
distortionCanvas.height = canvas.height;
const distortionCtx = distortionCanvas.getContext('2d');

// 力尽きた演出（寿命切れ／SAN切れ）中、自機の姿を専用の画像に切り替えるために使う
function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}
const deadIconImages = {
  male: loadImage('images/self/dead/01_dead.png'),
  female: loadImage('images/self/dead/02_dead.png')
};
const san0IconImages = {
  male: loadImage('images/self/SAN0/01_SAN0.png'),
  female: loadImage('images/self/SAN0/02_SAN0.png')
};

console.log('main.js loaded');

// ===== 周回プレイの引き継ぎ（夢の記憶ポイント・役職・Score） =====
// 「夢の記憶ポイント」は、アドベンチャーパートの進行度に応じてブラウザに永続化され、
// 次回以降のタイトル画面で初期パラメータの強化に使える（Scoreからの変換ではない）。
// これとは別に、役職（ランク）・役職スキル・Score自体は、エンディング・ゲームオーバーを問わず
// 「・・・という夢をみました」を選んだ時点の状態がそのまま次回プレイの開始値として引き継がれる
const dreamMemoryStorageKey = 'vamSurvLike_dreamMemory_v1';
// 夢の記憶ポイントは、アドベンチャーパートの進行に応じて貯まる（Scoreとは無関係）
const dreamMemoryPointsForAdv1Or2 = 1; // 第1回・第2回のアドベンチャーパートを終えるごとに獲得
const dreamMemoryPointsForAdv3NormalEnd = 5; // 第3回を経てノーマルエンドに至った場合に獲得
const dreamMemoryUpgradeMaxLevel = 5;
const dreamMemoryUpgradeDefs = [
  {
    id: 'partnerAutoParry', label: '同僚のオートパリィレベル',
    describeLevel: (lv) => `同僚が被弾しそうな時にパリィする確率が${30 + lv * 14}%になる（未強化時は30%）`,
    preview: '同僚の弾よけ確率が上がる'
  },
  {
    id: 'dreamCatcher', label: 'DreamCatcher',
    describeLevel: () => '自機・同僚のSAN上限が25になる（ラスボスに遭遇しやすくなる）',
    preview: 'SAN上限を下げてラスボス出現',
    maxLevel: 1,
    costOverride: 1
  },
  {
    id: 'invincibleTest', label: '無敵（テスト用）',
    describeLevel: () => '自分・同僚ともSAN・寿命が0にならず、脳疲労も常に0のまま、攻撃力が50倍になる（テスト用）',
    preview: 'SAN・寿命固定＋攻撃力50倍',
    maxLevel: 1,
    costOverride: 1
  },
  {
    id: 'betaMode', label: 'β版設定',
    describeLevel: () => '「無敵（テスト用）」と全く同じ効果（SAN・寿命が0にならず、脳疲労も常に0のまま、攻撃力が50倍）に加えて、' +
      '中ボス・ラスボス戦（イベント戦は除く）では1発ごとに相手の耐久力の最大値の20%ぶんダメージを与え、最低5発で撃破できる',
    preview: '無敵効果＋ボスを最速5発で撃破',
    maxLevel: 1,
    costOverride: 1
  },
  {
    id: 'unbreakableBond', label: '固い絆',
    describeLevel: () => '同僚との関係性が一切低下しなくなる（上昇する効果はこれまで通り発生する）',
    preview: '同僚との関係性が下がらなくなる',
    maxLevel: 1,
    costOverride: 0
  },
  {
    id: 'selfSacrifice', label: '自己犠牲',
    describeLevel: () => '戦闘中、十字型のボタンから発動できる特殊行動。発動すると自分の寿命が半分になる代わりに、' +
      '同僚の寿命が100まで回復する（1周回につき1回のみ使用可）',
    preview: '自分の寿命半分で同僚の寿命全回復',
    maxLevel: 1
  },
  {
    id: 'devotion', label: '献身',
    describeLevel: () => '戦闘中、十字型のボタンから発動できる特殊行動。発動すると自分のSANが半分になる代わりに、' +
      '同僚のSANが100まで回復する（1周回につき1回のみ使用可）',
    preview: '自分のSAN半分で同僚のSAN全回復',
    maxLevel: 1
  },
  {
    id: 'eternalLifePlayer', label: '永遠の命（自分）',
    describeLevel: () => '自分の寿命が0にならなくなる',
    preview: '自分の寿命が0にならなくなる',
    maxLevel: 1,
    costOverride: 0
  },
  {
    id: 'eternalLifePartner', label: '永遠の命（同僚）',
    describeLevel: () => '同僚の寿命が0にならなくなる',
    preview: '同僚の寿命が0にならなくなる',
    maxLevel: 1,
    costOverride: 0
  },
  {
    id: 'hopePlayer', label: '希望（自分）',
    describeLevel: () => '自分のSAN値が0にならなくなる',
    preview: '自分のSANが0にならなくなる',
    maxLevel: 1,
    costOverride: 0
  },
  {
    id: 'hopePartner', label: '希望（同僚）',
    describeLevel: () => '同僚のSAN値が0にならなくなる',
    preview: '同僚のSANが0にならなくなる',
    maxLevel: 1,
    costOverride: 0
  },
  {
    id: 'awakening', label: '目覚め',
    describeLevel: () => '第3回のアドベンチャーパートで、これまでの選択・関係性によらず必ず夢ルートに入る（真エンドの条件を満たしていると判定される）',
    preview: '第3回で必ず夢ルートに入る',
    maxLevel: 1,
    costOverride: 0
  }
];
// 現在のレベルから次のレベルへ上げるのに必要な夢の記憶ポイント数（レベルが上がるごとに1ずつ増える。Lv0→1は1、Lv1→2は2…）
function dreamMemoryUpgradeCost(currentLevel) {
  return currentLevel + 1;
}

// ===== エンディングリスト（タイトル画面から確認できる、到達済みエンディングの一覧） =====
const endingListDefs = [
  { id: 'true1', icon: '👁️', label: '目覚めエンド', hint: '？？？を撃破し、同僚が生存している状態で終える（事実上のTRUE END）' },
  { id: 'true2', icon: '🖤', label: '再び悪夢エンド', hint: '？？？を撃破するが、同僚を失っている' },
  { id: 'normal1', icon: '🌤️', label: 'END（良好）', hint: '同僚との関係性が良好な状態で一区切りをつける' },
  { id: 'normal2', icon: '🏁', label: 'END（普通）', hint: '同僚との関係性が普通の状態で一区切りをつける' },
  { id: 'normal3', icon: '🌧️', label: 'END（悪い）', hint: '同僚との関係性が悪い状態で一区切りをつける' },
  { id: 'bad-san', icon: '🌀', label: 'END（心）', hint: 'SANが0になる' },
  { id: 'bad-lifespan', icon: '⚰️', label: 'END（寿命）', hint: '寿命が0になる' },
  { id: 'bad-partner-shot', icon: '💔', label: 'END（同僚）', hint: '同僚の誤射でとどめを刺される' },
  { id: 'bad-lonely', icon: '🗂️', label: 'END（孤独）', hint: '同僚がいないまま、第3回のアドベンチャーパートに入るべき日を迎える' }
];

function loadDreamMemorySave() {
  const fallbackUpgrades = {};
  dreamMemoryUpgradeDefs.forEach(def => { fallbackUpgrades[def.id] = 0; });
  const fallbackEndingsCleared = {};
  endingListDefs.forEach(def => { fallbackEndingsCleared[def.id] = false; });
  const fallback = {
    points: 0, upgrades: fallbackUpgrades, lastRun: null,
    trueEndCleared: false, endingsCleared: fallbackEndingsCleared,
    carriedRank: 1, carriedRankSkillIds: [], carriedScore: 0,
    specialSkillPreLevels: {}
  };
  try {
    const raw = localStorage.getItem(dreamMemoryStorageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const rawUpgrades = parsed.upgrades || {};
    const upgrades = {};
    dreamMemoryUpgradeDefs.forEach(def => {
      const maxLevel = def.maxLevel || dreamMemoryUpgradeMaxLevel;
      upgrades[def.id] = Math.max(0, Math.min(maxLevel, Math.floor(rawUpgrades[def.id]) || 0));
    });
    // 前回プレイした自機の性別・同僚アイコン・信頼関係・最期の原因（同じ自機と同僚で再開した時の再会シーンに使う）
    const rawLastRun = parsed.lastRun;
    const lastRun = rawLastRun ? {
      playerGender: rawLastRun.playerGender || null,
      partnerIcon: rawLastRun.partnerIcon || null,
      relationship: Math.max(0, Math.min(100, Math.floor(rawLastRun.relationship) || 0)),
      endingType: rawLastRun.endingType || null
    } : null;
    const rawEndingsCleared = parsed.endingsCleared || {};
    const endingsCleared = {};
    endingListDefs.forEach(def => { endingsCleared[def.id] = !!rawEndingsCleared[def.id]; });
    // 特殊スキルの事前強化（夢の記憶ポイントで購入した分）。specialSkills配列はこの時点ではまだ定義されていないため、
    // ここでは大まかな型チェックのみ行い、実際の上限（maxLevel）でのクランプはapplyDreamMemoryUpgradesForNewGame側で行う
    const rawSpecialSkillPreLevels = parsed.specialSkillPreLevels || {};
    const specialSkillPreLevels = {};
    Object.keys(rawSpecialSkillPreLevels).forEach(id => {
      const lv = Math.floor(rawSpecialSkillPreLevels[id]);
      if (Number.isFinite(lv) && lv > 0) specialSkillPreLevels[id] = lv;
    });
    return {
      points: Math.max(0, Math.floor(parsed.points) || 0),
      upgrades,
      lastRun,
      trueEndCleared: !!parsed.trueEndCleared,
      endingsCleared,
      // 周回プレイの引き継ぎ：役職（ランク）・役職スキル・Scoreは、前回終了時点の状態をそのまま次回開始時に復元する
      carriedRank: Math.max(1, Math.floor(parsed.carriedRank) || 1),
      carriedRankSkillIds: Array.isArray(parsed.carriedRankSkillIds) ? parsed.carriedRankSkillIds.filter(id => typeof id === 'string') : [],
      carriedScore: Math.max(0, Math.floor(parsed.carriedScore) || 0),
      specialSkillPreLevels
    };
  } catch (e) {
    return fallback;
  }
}
function saveDreamMemorySave() {
  try {
    localStorage.setItem(dreamMemoryStorageKey, JSON.stringify(dreamMemorySave));
  } catch (e) {
    // localStorageが使えない環境（プライベートブラウズ等）では、保存できなくても致命的ではないため無視する
  }
}
let dreamMemorySave = loadDreamMemorySave();

// 「無敵（テスト用）」「β版設定」は共に、SAN・寿命が0にならず脳疲労も常に0のまま、攻撃力が50倍になる免疫効果を持つ。
// どちらか一方でも購入済みならこの効果が働く
function isTestInvincibleUpgradeActive() {
  return dreamMemorySave.upgrades.invincibleTest >= 1 || dreamMemorySave.upgrades.betaMode >= 1;
}
// 「β版設定」限定の追加効果：中ボス・ラスボス戦（ノーマルルート終了時の負けイベント戦闘は発射口が
// 破壊不能のため対象外）で、1発ごとに相手の耐久力の最大値の20%ぶんダメージを与える
// （＝耐久力がどれだけ高くても、最低5発で撃破できる）
const betaModeBossDamageRatio = 0.2;
function isBetaModeBossDamageActive() {
  return dreamMemorySave.upgrades.betaMode >= 1;
}

// 周回プレイの引き継ぎ：エンディング・ゲームオーバーを問わず、今回終了時点の役職（ランク）・役職スキル・Scoreを
// 次回開始時にそのまま復元できるよう保存しておく（applyDreamMemoryUpgradesForNewGameで復元する）
function saveCarriedProgressionForNextRun() {
  dreamMemorySave.carriedRank = rank;
  dreamMemorySave.carriedRankSkillIds = Array.from(rankSkillLevels);
  dreamMemorySave.carriedScore = score;
}

// 夢の記憶ポイントを消費して、指定した強化を1レベル上げる
function getDreamMemoryUpgradeDef(id) {
  return dreamMemoryUpgradeDefs.find(def => def.id === id);
}
// 項目ごとに上限レベルを変えられるようにする（未指定なら共通の上限を使う）
function getDreamMemoryUpgradeMaxLevel(def) {
  return def.maxLevel || dreamMemoryUpgradeMaxLevel;
}
// 項目ごとに固定価格を設定できるようにする（未指定ならレベルに応じた通常の価格を使う）
function getDreamMemoryUpgradeCost(def, level) {
  return def.costOverride !== undefined ? def.costOverride : dreamMemoryUpgradeCost(level);
}

function purchaseDreamMemoryUpgrade(id) {
  const def = getDreamMemoryUpgradeDef(id);
  if (!def) return;
  const level = dreamMemorySave.upgrades[id];
  if (level >= getDreamMemoryUpgradeMaxLevel(def)) return;
  const cost = getDreamMemoryUpgradeCost(def, level);
  if (dreamMemorySave.points < cost) return;
  dreamMemorySave.points -= cost;
  dreamMemorySave.upgrades[id] = level + 1;
  saveDreamMemorySave();
}

// 「1つ戻す」：指定した強化を1レベル下げ、そのレベルに費やしたポイントを払い戻す
function revertDreamMemoryUpgrade(id) {
  const def = getDreamMemoryUpgradeDef(id);
  if (!def) return;
  const level = dreamMemorySave.upgrades[id];
  if (level <= 0) return;
  const refund = getDreamMemoryUpgradeCost(def, level - 1);
  dreamMemorySave.points += refund;
  dreamMemorySave.upgrades[id] = level - 1;
  saveDreamMemorySave();
}

// 「思い直す」：これまで各強化に費やしたポイントを全額払い戻し、レベルを0に戻す
function respecDreamMemoryUpgrades() {
  let refund = 0;
  dreamMemoryUpgradeDefs.forEach(def => {
    const level = dreamMemorySave.upgrades[def.id];
    for (let lv = 0; lv < level; lv++) {
      refund += getDreamMemoryUpgradeCost(def, lv);
    }
    dreamMemorySave.upgrades[def.id] = 0;
  });
  if (refund <= 0) return;
  dreamMemorySave.points += refund;
  saveDreamMemorySave();
}

const player = {
  x: 400,
  y: 300,
  radius: 15,
  speed: 6, // 初期速度（以前の設定の150%）
  angle: 0 // 自分が向いている角度（ラジアン）
};
// 画面外のランダムな位置を決め、座標を { x, y } で返す
function spawnEnemyOffscreen() {
  const margin = 80;
  const side = Math.floor(Math.random() * 4);
  let x, y;
  if (side === 0) { // 左側
    x = -margin;
    y = Math.random() * canvas.height;
  } else if (side === 1) { // 右側
    x = canvas.width + margin;
    y = Math.random() * canvas.height;
  } else if (side === 2) { // 上側
    x = Math.random() * canvas.width;
    y = -margin;
  } else { // 下側
    x = Math.random() * canvas.width;
    y = canvas.height + margin;
  }
  return { x, y };
}

// ===== 敵の種類と能力値 =====
// 敵の名前を弱い順から強い順に並べる
const enemyTypeNames = [
  '問合せ対応',
  '軽微な修正依頼',
  '改善要望',
  '仕様変更対応',
  '不具合修正',
  '障害対応',
  'データ不整合対応',
  'リリーストラブル対応',
  'インシデント対応',
  'サービス停止・重大障害対応'
];

// 敵の見た目（仮のプレースホルダー：著作権フリーの絵文字アイコンを種類ごとに割り当てる）
const enemyTypeIcons = ['📞', '🛠️', '📝', '📐', '🐛', '🚨', '🗄️', '💥', '🔥', '☠️'];

// 後ろの強い敵ほど出現率が低くなるよう、等比数列で重みを付ける
const rarityRatio = 0.6; // 0～1の値。小さいほど強い敵が出にくい

// 第2回のアドベンチャーパート以降は、この比率が徐々に上がっていき、強い敵ほど出やすく（弱い敵ほど出にくく）なる
const enemyBiasRampDays = 15; // この日数をかけて、比率がenemyBiasMaxRatioまで徐々に上がっていく
const enemyBiasMaxRatio = 1.5; // 1を超えると、後ろの（強い）敵の方がむしろ出現率が高くなる
let adv2CompletedAtDay = null; // 第2回のアドベンチャーパートを終えた時点の日数（このタイミングからバイアスをかけ始める）

function getEnemyTypeEffectiveRatio() {
  if (adv2CompletedAtDay === null) return rarityRatio;
  const daysSince = Math.max(0, dayNumber - adv2CompletedAtDay);
  const progress = Math.min(1, daysSince / enemyBiasRampDays);
  return rarityRatio + (enemyBiasMaxRatio - rarityRatio) * progress;
}

// 敵の初期生成より前に参照できるよう、ランクをここで宣言する
let rank = 1;
// getAllowedMaxTypeIndexByRankがゲーム開始前のウェーブ生成時にも参照するため、ここで宣言する
let weeklyQuotaAchievedEarly = false; // 週の途中でノルマを達成済みか
// setEnemyStatsが敵の強さを日数に応じて調整する際に参照するため、ここで宣言する
let dayNumber = 1; // 実際に稼働した日数（1始まり）

function chooseEnemyTypeIndex() {
  // 現在のランクに応じて、出現可能な敵の上限を決める
  const maxIdx = getAllowedMaxTypeIndexByRank();
  // 出現可能な敵だけに絞って重み（第2回のアドベンチャーパート以降は徐々に強い敵寄りに偏る）の合計を計算する
  const effectiveRatio = getEnemyTypeEffectiveRatio();
  const truncated = [];
  for (let i = 0; i <= maxIdx; i++) truncated.push(Math.pow(effectiveRatio, i));
  const sum = truncated.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < truncated.length; i++) {
    r -= truncated[i];
    if (r <= 0) return i;
  }
  return truncated.length - 1;
}

// 日数が経つごとに敵がどんどん強くなるようにする倍率（残り工数＝HPと、SAN攻撃力の両方に掛ける）
const enemyDifficultyGrowthPerDay = 0.045;
const enemyHpMultiplier = 2.2; // 敵の基本HPの倍率（全体的に弱めに調整）
function getEnemyDifficultyMultiplier() {
  return 1 + (dayNumber - 1) * enemyDifficultyGrowthPerDay;
}

function setEnemyStats(e, typeIndex) {
  const idx = typeof typeIndex === 'number' ? typeIndex : chooseEnemyTypeIndex();
  e.type = idx + 1;
  e.text = enemyTypeNames[idx];
  e.icon = enemyTypeIcons[idx];
  e.font = '28px sans-serif';
  // 強い種類ほどHPを高くする。さらに日数が経つほど全体的にHPが増えていく
  e.hp = Math.ceil((1 + idx * 0.6 + Math.random() * 1.0) *
    getEnemyDifficultyMultiplier() * enemyHpMultiplier);
  // 強い種類ほど、平均移動速度は遅くする
  e.speed = Math.max(0.08, 0.95 - idx * 0.06 + (Math.random() - 0.5) * 0.08);
  // 敵の種類に応じて色を変える
  const hue = Math.max(0, 10 - idx) * 12; // 強い敵ほど赤に近づく
  e.color = `hsl(${hue},80%,50%)`;
}

// ===== 敵の生成と管理 =====
const enemies = [];
// 小型敵（mini）はウェーブ制の対象外なので、通常のウェーブ全滅判定では除外して数える
function countActiveWorkEnemies() {
  return enemies.reduce((sum, en) => sum + (en.mini ? 0 : 1), 0);
}
const maxEnemies = 3; // 1ウェーブで同時に出現する敵（仕事）の数
const waveCooldownDelayMs = 900; // ウェーブを全滅させてから次のウェーブが出るまでの間
const enemyCollisionRadius = 32;
const minDeadlineMs = 5000; // 納期の最短時間（5秒）
const maxDeadlineMs = 30000; // 納期の最長時間（30秒）
let specialDeadlineMultiplier = 1;
let waveCooldownMs = 0; // 次のウェーブ出現までの残り時間

// 第2回のアドベンチャーパートを終えてから第3回に入るまでの間だけ出現する、小型の敵
const miniEnemyMaxConcurrent = 3;
const miniEnemySizeRatio = 0.6; // 通常の敵の60%のサイズ
const miniEnemySpeedMultiplier = 1.5; // 移動速度は通常の1.5倍
const miniEnemySpawnIntervalAvgMs = 6000; // 現実の時間で平均6秒に1件、ランダムなタイミングで出現する
const miniEnemySpawnIntervalMinMs = 1200;
let miniEnemySpawnTimerMs = 0;
function getRandomMiniEnemySpawnIntervalMs() {
  return Math.max(miniEnemySpawnIntervalMinMs, -Math.log(1 - Math.random()) * miniEnemySpawnIntervalAvgMs);
}

function spawnEnemy(typeIndex, isMini = false) {
  const radius = isMini ? enemyCollisionRadius * miniEnemySizeRatio : enemyCollisionRadius;
  // 既存の敵やプレイヤーと重ならない位置を探す
  let attempts = 0;
  let p;
  do {
    p = spawnEnemyOffscreen();
    attempts++;
    // 画面端の同じ位置に固まらないよう、少しだけランダムにずらす
    p.x += (Math.random() - 0.5) * 40;
    p.y += (Math.random() - 0.5) * 40;
    const tooClose = enemies.some(en => Math.hypot(en.x - p.x, en.y - p.y) < (en.radius + radius + 20)) || Math.hypot(player.x - p.x, player.y - p.y) < 150;
    if (!tooClose) break;
  } while (attempts < 18);
  const e = { x: p.x, y: p.y, radius, mini: isMini };
  setEnemyStats(e, typeIndex);
  if (isMini) e.speed *= miniEnemySpeedMultiplier;
  e.touched = false;
  // 敵ごとに5～30秒のランダムな納期を設定する
  e.deadlineMs = (
    minDeadlineMs + Math.random() * (maxDeadlineMs - minDeadlineMs)
  ) * specialDeadlineMultiplier;
  enemies.push(e);
  return e;
}

// 現在の仕事（敵）を全て片付けるまで、次のウェーブは出現しない
function spawnWave(count = maxEnemies) {
  for (let i = 0; i < count; i++) spawnEnemy();
}

// 第2回のアドベンチャーパートを終えた後、第3回に入るまでの間だけ、小型の敵を並行して出現させ続ける
function updateMiniEnemySpawning(dt) {
  if (adventureRunCount !== 2) return;
  miniEnemySpawnTimerMs -= dt * 1000;
  const currentMiniCount = enemies.reduce((sum, en) => sum + (en.mini ? 1 : 0), 0);
  let spawnGuard = 0;
  let remaining = miniEnemyMaxConcurrent - currentMiniCount;
  while (miniEnemySpawnTimerMs <= 0 && remaining > 0 && spawnGuard < miniEnemyMaxConcurrent) {
    spawnEnemy(undefined, true);
    miniEnemySpawnTimerMs += getRandomMiniEnemySpawnIntervalMs();
    remaining--;
    spawnGuard++;
  }
}

// ゲーム開始時の最初のウェーブを生成する
spawnWave();
// ===== 弾・スコア・ゲーム状態 =====
// プレイヤーが発射した弾を保存する配列
const bullets = [];
// 自機の弾は、発射地点からこの距離だけ進むと消滅する（パリィされた弾は対象外）
const playerBulletMaxDistance = 320;

// ===== 敵に弾が命中した瞬間の弾けるようなヒットエフェクト =====
const hitSparks = [];
const hitSparkDurationMs = 220;
function spawnHitSpark(x, y, big = false) {
  hitSparks.push({
    x, y,
    timer: hitSparkDurationMs,
    big,
    // 放射状に飛び散る線の角度をあらかじめランダムに決めておく
    rays: Array.from({ length: big ? 8 : 5 }, () => Math.random() * Math.PI * 2)
  });
}

// ===== 役職スキル「AIエージェント」で弾が反射した瞬間の専用エフェクト =====
const synergyBeams = [];
const synergyBeamDurationMs = 350;
function spawnSynergyBeam(x1, y1, x2, y2) {
  synergyBeams.push({ x1, y1, x2, y2, timer: synergyBeamDurationMs });
}

// ===== 同僚弾を弾き返した瞬間の「カキーン」エフェクト =====
const deflectEffects = [];
const deflectEffectDurationMs = 300;
function spawnDeflectEffect(x, y, isAuto = false) {
  deflectEffects.push({ x, y, timer: deflectEffectDurationMs, isAuto });
}

// ===== パリィを振った瞬間の、剣で切ったような扇状のワイプエフェクト =====
// 振った本人（自機 or 同僚）の向きを中心に270度の範囲を、素早く弧が伸びてからフェードアウトする
let slashEffect = null; // { x, y, angle, radius, timer }
const slashEffectDurationMs = 260;
const slashEffectRangeRad = (270 * Math.PI) / 180;
function spawnSlashEffect(x, y, angle, entityRadius) {
  slashEffect = { x, y, angle, radius: entityRadius, timer: slashEffectDurationMs };
}
const baseFireRate = 175; // 基本の発射間隔（ミリ秒。以前の設定からさらに半分に短縮）
let lastFire = 0;
let score = 0;
let gameOver = false;
let gameClear = false;
// 起動時はまずモード選択（startScreen）を表示し、その後 'gender' → 'partner-icon' → null（完了、ゲーム開始）と進む
let startScreen = true;
let setupStep = null;
let dreamMemoryShopActive = false; // タイトル画面から開く、夢の記憶ポイントでの強化画面
let specialSkillPreShopActive = false; // 強化画面から開く、特殊スキルの事前強化専用ページ
let endingListActive = false; // タイトル画面から開く、到達済みエンディング一覧画面
let controllerHelpActive = false; // タイトル画面から開く、ゲームコントローラーの操作説明画面
let titleResetConfirmActive = false; // タイトル画面左上の「リセット」ボタンを押した後の確認ダイアログ表示中かどうか
// 目覚めエンド（真エンド・同僚生存）到達後、通常のタイトルへ戻す代わりに表示する専用のタイトル画面
let trueEndTitleScreenActive = false;
let trueEndEndingListActive = false; // 専用タイトル画面から開く、専用デザインのエンディングリスト画面

// 目覚めエンド専用タイトル画面の「就活を始める」：周回には入らず、ホワイトアウト→中央に一枚画像を表示→
// クリックでフェードアウトしてゲームを終了する（ブラウザを閉じる）専用の演出
let jobHuntEndSequence = null; // null、または { phase: 'whiteout' | 'image' | 'fadeOut', phaseTimerMs }
const jobHuntEndWhiteoutDurationMs = 1800;
const jobHuntEndFadeOutDurationMs = 1800;

function startJobHuntEndSequence() {
  trueEndTitleScreenActive = false;
  jobHuntEndSequence = { phase: 'whiteout', phaseTimerMs: 0 };
}

// タイトル画面の「リセット」：夢の記憶ポイント・引き継ぎ役職／Score・エンディング記録など、
// 永続化されている状態をすべて消し、まっさらな状態からやり直す
function resetAllProgressAndReload() {
  try {
    localStorage.removeItem(dreamMemoryStorageKey);
  } catch (e) {
    // localStorageが使えない環境では、消去できなくても致命的ではないため無視する
  }
  location.reload();
}

// デバッグ用「Waking Nightmare」ボタン：ランダムな自機・同僚が関係性100の状態で
// いずれかのノーマルエンドを経た直後、という状態を疑似的に作り出す。
// 通常のノーマルエンド到達時と異なり、エンディングリストへの記録（クリア済扱い）は一切行わない
function triggerWakingNightmareDebug() {
  const genderId = genderChoices[Math.floor(Math.random() * genderChoices.length)].id;
  const partnerIcon = partnerIconChoices[Math.floor(Math.random() * partnerIconChoices.length)];
  dreamMemorySave.lastRun = {
    playerGender: genderId,
    partnerIcon: partnerIcon,
    relationship: 100,
    endingType: 'normal1',
    viaAdv3NormalEnd: true
  };
  saveDreamMemorySave();
  // 即座に切り替えず、タイトル画面を暗転（フェードアウト）させてから画面遷移する
  startSetupFadeOut(() => location.reload());
}

// ===== アイコン選択後のひとことメッセージ演出（表示→フェードアウトして次の画面へ） =====
const playerIconGreetingLines = [
  '今日も一つずつ覚えていこう！',
  '焦らず、素直に聞いていこう！',
  '今日も前向きに一歩進もう！',
  '確認しながら丁寧にやろう！',
  '元気に挨拶して、学んでいこう！'
];
// 同僚アイコンの性別に応じて、口調の異なる「はじめまして」を含む挨拶からランダムで選ぶ
const partnerIconGreetingLinesFemale = [
  'はじめまして。一緒に頑張りましょうね！',
  'はじめまして！どうぞよろしくお願いします！',
  'はじめまして。精一杯がんばりますね！'
];
const partnerIconGreetingLinesMale = [
  'はじめまして。よろしく頼む、一緒に頑張ろう！',
  'はじめまして！気合入れていくから、よろしくね！',
  'はじめまして。全力でサポートするよ！'
];
const iconGreetingHoldMs = 1400; // 全文表示後、フェードアウトを始めるまで待つ時間
const iconGreetingFadeMs = 500; // フェードアウトにかける時間
const iconGreetingFadeInMs = 500; // フェードインにかける時間
// 読み上げのテンポに近づけた、セリフを1文字ずつ表示する間隔（ミリ秒）
const typewriterCharIntervalMs = 90;
// 経過時間から、何文字目まで表示すべきかを返す（textの全長を超えない）
function getTypewriterRevealedCount(elapsedMs, text) {
  return Math.max(0, Math.min(text.length, Math.floor(elapsedMs / typewriterCharIntervalMs)));
}

let iconGreetingPhase = null; // null / 'fadein' / 'hold' / 'fadeout'
let iconGreetingTimer = 0; // 'fadein'中は経過時間、'hold'/'fadeout'中は残り時間として使う
let iconGreetingIcon = '';
let iconGreetingImage = null; // 画像（同僚アイコンなど）を表示する場合はImage要素を入れる
let iconGreetingText = '';
let iconGreetingOnComplete = null;

// アイコンの下にひとことをフェードインで表示し、全文表示後少し経ったらフェードアウトしてonCompleteへ進む
// iconImageを渡した場合は絵文字の代わりに画像を表示する
function startIconGreeting(icon, text, onComplete, iconImage = null) {
  iconGreetingIcon = icon;
  iconGreetingImage = iconImage;
  iconGreetingText = text;
  iconGreetingPhase = text.length > 0 ? 'fadein' : 'hold';
  iconGreetingTimer = text.length > 0 ? 0 : iconGreetingHoldMs;
  iconGreetingOnComplete = onComplete;
}

// ===== セットアップ画面（性別・同僚選択）の切り替え演出 =====
// 選択直後、画面を暗転させてから次のページ（ひとことメッセージなど）へ進む
let setupFadePhase = null; // null / 'out'
let setupFadeTimer = 0;
const setupFadeDurationMs = 350;
let setupFadeOnComplete = null;

function startSetupFadeOut(onComplete) {
  setupFadePhase = 'out';
  setupFadeTimer = setupFadeDurationMs;
  setupFadeOnComplete = onComplete;
}

// ===== エンディング =====
// 'normal1' | 'normal2' | 'normal3' | 'true1' | 'true2' | 'bad-san' | 'bad-lifespan' | 'bad-partner-shot' のいずれか。
// gameOver / gameClear になる瞬間に確定する（true1＝夢ルートでラスボスを撃破し同僚が生存、が事実上のTRUE END）
let endingType = null;

// ===== 納期切れの爆発エフェクト =====
const explosionEffectDuration = 500; // フラッシュと揺れの継続時間（ミリ秒）
const friendlyFireHitEffectDuration = 300;
let explosionFlashTimer = 0;
let explosionShakeTimer = 0;
let friendlyFireHitFlashTimer = 0;

// ===== 脳疲労システム =====
let maxFatigue = 100;
let fatigue = 0; // 0が元気な状態、maxFatigueが疲労の限界

// 時間帯が進むほど、回復してもここより下がらなくなる「脳疲労の下限」。
// 通常プレイなら夕方(終業時刻)には脳疲労が70～100前後を保つよう、この下限を利用してなかなか回復しきらないようにする。
const fatigueFloorAtDayEnd = 50; // 終業時刻(夕方)には、回復してもここより下がらない
const fatigueFloorAtOvertimeEnd = 70; // 残業の限界時刻まで残業した場合の下限
function getFatigueRecoveryFloor() {
  const visualHour = getVisualGameHour();
  if (visualHour > dayEndHour) {
    const overtimeProgress = Math.max(0, Math.min(1,
      (visualHour - dayEndHour) / (maxOvertimeHour - dayEndHour)));
    return fatigueFloorAtDayEnd + overtimeProgress * (fatigueFloorAtOvertimeEnd - fatigueFloorAtDayEnd);
  }
  const dayProgress = Math.max(0, Math.min(1, (visualHour - dayStartHour) / (dayEndHour - dayStartHour)));
  return dayProgress * fatigueFloorAtDayEnd;
}

// 脳疲労を増やし、上限に達したらstun（行動不能）を発生させる共通処理
function applyFatigueGain(amount) {
  if (amount <= 0) return;
  fatigue = Math.min(maxFatigue, fatigue + amount);
  if (fatigue >= maxFatigue) {
    fatigue = maxFatigue;
    // 既にstun中、またはコーヒーのstun回避が発動中なら、上限到達の処理（ペナルティ含む）を再度行わない
    if (stunned || coffeeStunImmunityTimerMs > 0) return;
    // コーヒーの「stun回避」が残っていれば、行動不能にせず通常通り動けるようにする（その日のうち1杯につき1回）
    if (coffeeStunImmunityCharges > 0) {
      coffeeStunImmunityCharges--;
      coffeeStunImmunityTimerMs = stunDuration * specialSkillEffects.stunDurationMultiplier;
      showMessage('コーヒーの効果でstunを回避した！', 2200, '#a1887f');
    } else {
      stunned = true;
      stunTimer = stunDuration * specialSkillEffects.stunDurationMultiplier;
      if (partner.active) showRandomPartnerSpeechBubbleIfFriendly(partnerStunWorryLines, '#90caf9', partnerStunWorryStressedLines);
    }
    // 疲労が限界に達したら行動不能にし、SANも減らす
    const sanMultiplier = Math.max(0.5, 1 - skillLevel * 0.04);
    damageSan(Math.ceil(
      stunSanPenalty * sanMultiplier * specialSkillEffects.sanDamageMultiplier
    ));
    const stunLifespanPenalty = stunLifespanPenaltyMin + Math.floor(
      Math.random() * (stunLifespanPenaltyMax - stunLifespanPenaltyMin + 1)
    );
    lifespan = Math.max(0, lifespan - stunLifespanPenalty);
    checkVitalsGameOver();
  }
}

// 現在、ゲーム内1時間あたりどれだけ脳疲労が蓄積するか（残業中かどうか・オート連射中かどうかで変わる）
function getPassiveFatigueRatePerHour(isAutoFiring) {
  const base = currentHour >= dayEndHour ? fatigueOvertimeBaseRatePerHour : fatiguePassiveBaseRatePerHour;
  return base + (isAutoFiring ? fatigueAutoFireBonusRatePerHour : 0);
}

// 発射とは無関係に、時間経過だけで脳疲労が緩やかに蓄積する（毎フレーム呼び出す）。
// 同僚は常に自律攻撃し続けているとみなし、オート連射中と同じ扱いにする
function updatePassiveFatigueGain(dt) {
  const isAutoFiring = autoFireEnabled || fullAutoModeEnabled;
  const energyDrinkMultiplier = energyDrinkBuffTimerMs > 0 ? energyDrinkFatigueGainMultiplier : 1;
  const ratePerHour = getPassiveFatigueRatePerHour(isAutoFiring) *
    specialSkillEffects.firingFatigueMultiplier * energyDrinkMultiplier;
  // ratePerHourは「ゲーム内1時間あたり」の蓄積量。ゲーム内1時間＝現実hourMs（5000）msなので、
  // dt（現実の経過秒数）に応じた分だけ蓄積させるには、3600ではなくhourMs / 1000で割る
  const realSecondsPerGameHour = hourMs / 1000;
  applyFatigueGain((ratePerHour / realSecondsPerGameHour) * dt);
  if (partner.active) {
    const partnerRatePerHour = getPassiveFatigueRatePerHour(true);
    partner.fatigue = Math.min(maxFatigue, partner.fatigue + (partnerRatePerHour / realSecondsPerGameHour) * dt);
  }
}

let stunned = false;
const stunDuration = 2200; // 疲労が100になったときの行動不能時間（ミリ秒）
let stunTimer = 0;
let invincible = false;
const invincibleDuration = 1200; // 敵との接触後に無敵になる時間（ミリ秒）
let invincibleTimer = 0;

// ===== 残機システム：自機・同僚ともSAN値または寿命が0になっても、残機がある間は復活する =====
const maxExtraLives = 3; // 自機・同僚それぞれの残機
let playerLivesRemaining = maxExtraLives;
let partnerLivesRemaining = maxExtraLives;
const reviveStunDurationMs = 5000; // 気絶して復活を待つ時間
const revivePostGlowDurationMs = 3000; // 復活直後、輝いてダメージを受けなくなる時間
const reviveSanRatio = 0.5; // 復活時のSAN・寿命は、それぞれの最大値のこの割合
const reviveLifespanRatio = 0.5;
let playerReviveTimerMs = 0; // >0の間、自機は気絶して復活を待っている（移動・攻撃できない）

// HUDの残機表示用の色（残機が0の間は赤く点滅させる）
function getLivesCounterColor(livesRemaining) {
  if (livesRemaining > 0) return '#ffe082';
  return Math.floor(gameClockMs / 300) % 2 === 0 ? '#ff1744' : '#4a0000';
}
let lastUpdate = Date.now();
let gameClockMs = 0;
let gameTimeScale = 1;
let threeXModeEnabled = false; // タイトル画面の「3倍加速モード」トグルのON/OFF状態
let isPaused = false;
let wakeUpConfirmActive = false; // 「目を覚ます」の誤タップ防止確認ダイアログ

// 手動攻撃と自動攻撃の状態
let autoFireEnabled = false;
let mouseFireHeld = false;
const mousePosition = { x: player.x + 100, y: player.y };

// ===== 完全オートモード（移動・照準・攻撃をすべて自動化する） =====
let fullAutoModeEnabled = false;
let fullAutoQuizChoiceIndex = null; // クイズの選択肢をランダムに1つ選び、同じ問題の間は選び直さない

// ===== 脳疲労システム =====
// 発射そのものでは変動せず、時間経過にともなって緩やかに蓄積する。回復はコーヒー・栄養ドリンク・
// 食事・Stunによってのみ発生し、自動では回復しない
const fatiguePassiveBaseRatePerHour = 6; // 通常時、ゲーム内1時間あたりの脳疲労蓄積量（10分に1）
const fatigueOvertimeBaseRatePerHour = 9; // 残業中（終業時刻以降）は、ゲーム内1時間あたりこの量に変わる
const fatigueAutoFireBonusRatePerHour = 12; // オート連射中は、上記に加えてゲーム内1時間あたりこの量が上乗せされる（5分に1）
const fatigueParryGain = 1; // パリィが成功するたびに増える脳疲労
const stunRecoveryPerSec = 18; // 行動不能中は脳疲労を回復する（自動回復が起きる唯一のケース）
const fireRateMultiplier = 1.5; // 疲労が多いほど発射間隔を延ばす倍率
// 朝から夜にかけて時間が経つほど、同僚の自律攻撃の間隔が伸びる（パフォーマンス低下の表現。脳疲労の値自体には影響しない）
const timeOfDayFatigueMultiplierMax = 1.8; // 終業時刻ごろに到達する最大倍率
let baseBulletDamage = 20; // 疲労がないときの基本攻撃力（以前の設定の10倍）

// ===== 回復アイテム（チョコレート） =====
const chocolateLifetimeMs = 10000; // 出現してから消えるまでの時間（10秒）
const chocolateBlinkMs = 3000; // 消える3秒前から点滅する
const chocolateRecoveryRatio = 0.3; // 最大値の30%ぶん脳疲労を減らす
const chocolateSanRecovery = 8; // 少しSANも回復する
const chocolateRadius = 22;
const chocolateFallGravityPerSec2 = 540; // 落下中、1秒あたりに増える落下速度（従来の60%）
// 一日のうち何個目に食べたかで寿命への影響が変わる（食べ過ぎるとマイナスになっていく）。翌日はまた1個目から
const chocolateLifespanEffectByCount = [2, 1, 0, -2, -5];
let chocolate = null;
let chocolateSpawnTimerMs = getRandomChocolateSpawnDelay();
let chocolateDailyCount = 0; // 本日すでに食べた個数。日付が変わるとリセットする

// 本日何個目に食べたか（1始まり）に応じた寿命への影響量を返す
function getChocolateLifespanEffect(countToday) {
  const index = Math.min(countToday, chocolateLifespanEffectByCount.length) - 1;
  return chocolateLifespanEffectByCount[index];
}

// 次のチョコレートは8～15秒後に出現する
function getRandomChocolateSpawnDelay() {
  return 8000 + Math.random() * 7000;
}

// マップ上部から落ちてきて、窓の範囲を避けた床の上に着地する
function spawnChocolate() {
  const target = getNonOverlappingEventPosition(chocolateRadius);
  chocolate = {
    x: target.x,
    y: -chocolateRadius - 20,
    targetY: target.y,
    radius: chocolateRadius,
    fallSpeed: 0,
    landed: false,
    remainingMs: chocolateLifetimeMs
  };
}

// クリック／タップ、または完全オートモードで取得された時に呼ばれる
function consumeChocolate() {
  const recoveryAmount = Math.ceil(
    maxFatigue * chocolateRecoveryRatio * specialSkillEffects.chocolateRecoveryMultiplier
  );
  const reducedFatigue = Math.min(fatigue, recoveryAmount);
  fatigue -= reducedFatigue;
  san = Math.min(maxSan, san + chocolateSanRecovery);
  chocolateDailyCount++;
  const lifespanEffect = getChocolateLifespanEffect(chocolateDailyCount);
  lifespan = Math.max(0, Math.min(maxLifespan, lifespan + lifespanEffect));
  showMessage(
    `チョコレート取得！ 脳疲労 -${Math.ceil(reducedFatigue)} / SAN +${chocolateSanRecovery} / 寿命 ${lifespanEffect >= 0 ? '+' : ''}${lifespanEffect}` +
    `（本日${chocolateDailyCount}個目）`,
    1800, '#ffcc80'
  );
  checkVitalsGameOver();
  chocolate = null;
  chocolateSpawnTimerMs = getRandomChocolateSpawnDelay();
}

// ===== コーヒー・栄養ドリンクの自動配置位置（コーヒーメーカー・冷蔵庫自体は表示しない） =====
// 画面下部の固定位置に、それぞれコーヒー・栄養ドリンクを生成し続ける
const coffeeMakerPosition = { x: 90, y: 520 };
const fridgePosition = { x: 710, y: 520 };
const coffeeItemSpawnPosition = { x: coffeeMakerPosition.x, y: coffeeMakerPosition.y };
const energyDrinkItemSpawnPosition = { x: fridgePosition.x, y: fridgePosition.y };
const stationRespawnDelayMs = 3000; // 取得後、この位置にまた出現するまでの時間
// コーヒー・栄養ドリンクは固定位置に「落下演出なし・即着地」で出現するため、
// 同僚が既にその場で待機していたりフルオートモード中だったりすると、出現した瞬間に取得されてしまう不具合があった。
// 出現直後のこの猶予時間の間は、クリック・同僚の自動摂取・フルオートモードいずれでも取得できないようにする
const stationItemPickupGraceMs = 500;

// ===== 回復アイテム（栄養ドリンク） =====
// チョコレートより効果は強いが出現頻度は低い上位互換の回復アイテム。時間経過では消えない
const energyDrinkRadius = 22;
const energyDrinkSanRecovery = 20; // SAN値を20回復する
const energyDrinkFatigueReduction = 50; // 脳疲労を50下げる
const energyDrinkLifespanCost = 5; // その代わり寿命を5消費する
const energyDrinkBuffDurationMs = 15000; // この間、脳疲労が蓄積しにくくなる
const energyDrinkFatigueGainMultiplier = 0.5; // 上記の間、脳疲労の蓄積速度をこの倍率に抑える
const energyDrinkMoveSpeedBuffMultiplier = 1.5; // 効果中の移動速度倍率
const energyDrinkFireRateBuffMultiplier = 0.5; // 効果中の発射間隔倍率（半分＝連射速度アップ）
const energyDrinkCrashDurationMs = 10000; // 効果が切れた後、反動状態が続く時間
const energyDrinkCrashMoveSpeedMultiplier = 0.7; // 反動中の移動速度倍率
const energyDrinkCrashFireRateMultiplier = 1.2; // 反動中の発射間隔倍率
const energyDrinkSecondDrinkLifespanCost = 10; // 一日で2本目以降を飲むと、通常効果に加えてさらに寿命を消費する
let energyDrink = null;
let energyDrinkSpawnTimerMs = getRandomEnergyDrinkSpawnDelay();
let energyDrinkBuffTimerMs = 0; // 残り時間。0より大きい間は脳疲労が蓄積しにくく、移動・発射が強化される
let energyDrinkCrashTimerMs = 0; // 効果が切れた直後の反動（移動・発射が鈍る）の残り時間
let energyDrinkDailyCount = 0; // 本日すでに飲んだ本数。日付が変わるとリセットする

// 栄養ドリンクによる移動速度の倍率（効果中は速く、切れた直後は反動で遅くなる）
function getEnergyDrinkMoveSpeedMultiplier() {
  if (energyDrinkBuffTimerMs > 0) return energyDrinkMoveSpeedBuffMultiplier;
  if (energyDrinkCrashTimerMs > 0) return energyDrinkCrashMoveSpeedMultiplier;
  return 1;
}

// 栄養ドリンクによる発射間隔の倍率（効果中は短く、切れた直後は反動で長くなる）
function getEnergyDrinkFireRateMultiplier() {
  if (energyDrinkBuffTimerMs > 0) return energyDrinkFireRateBuffMultiplier;
  if (energyDrinkCrashTimerMs > 0) return energyDrinkCrashFireRateMultiplier;
  return 1;
}

// 冷蔵庫から取られたら、この時間だけ経つとまた隣に補充される
function getRandomEnergyDrinkSpawnDelay() {
  return stationRespawnDelayMs;
}

// 冷蔵庫のすぐ隣に生成する（固定位置。落下演出はなく、すぐ着地済みの状態になる。
// ただし取得できるようになるまでには、下記の出現猶予（stationItemPickupGraceMs）が必要）
function spawnEnergyDrink() {
  energyDrink = {
    x: energyDrinkItemSpawnPosition.x,
    y: energyDrinkItemSpawnPosition.y,
    targetY: energyDrinkItemSpawnPosition.y,
    radius: energyDrinkRadius,
    fallSpeed: 0,
    landed: true,
    graceMs: stationItemPickupGraceMs
  };
}

// クリック／タップ、または完全オートモードで取得された時に呼ばれる
function consumeEnergyDrink() {
  energyDrinkDailyCount++;
  const isSecondOrLater = energyDrinkDailyCount >= 2;
  const isCrossDrink = coffeeBuffTimerMs > 0;
  const totalLifespanCost = energyDrinkLifespanCost +
    (isSecondOrLater ? energyDrinkSecondDrinkLifespanCost : 0) +
    (isCrossDrink ? coffeeCrossDrinkLifespanCost : 0);
  const reducedFatigue = Math.min(fatigue, energyDrinkFatigueReduction);
  fatigue -= reducedFatigue;
  san = Math.min(maxSan, san + energyDrinkSanRecovery);
  lifespan = Math.max(0, lifespan - totalLifespanCost);
  energyDrinkBuffTimerMs = energyDrinkBuffDurationMs;
  energyDrinkCrashTimerMs = 0; // 反動状態が残っていても、新たに飲めば打ち消してすぐ強化状態に入る
  if (currentHour >= dayEndHour) eveningDrinkRecoveryPenalty = true;
  showMessage(
    `栄養ドリンク取得！ 脳疲労 -${Math.ceil(reducedFatigue)} / SAN +${energyDrinkSanRecovery} / 寿命 -${totalLifespanCost}` +
    (isSecondOrLater ? '（本日2本目以降…）' : '') + (isCrossDrink ? '（コーヒーとの飲み合わせ…）' : ''),
    1800, '#80deea'
  );
  checkVitalsGameOver();
  energyDrink = null;
  energyDrinkSpawnTimerMs = getRandomEnergyDrinkSpawnDelay();
}

// ===== 回復アイテム（コーヒー） =====
// 栄養ドリンクよりマイルドな強化アイテム。効果切れの反動はない。時間経過では消えない
const coffeeRadius = 22;
const coffeeSanRecovery = 10; // SAN値を10回復する
const coffeeLifespanCost = 2; // その代わり寿命を2消費する
const coffeeBuffDurationMs = energyDrinkBuffDurationMs; // 持続時間は栄養ドリンクと同じ長さ
const coffeeMoveSpeedBuffMultiplier = 1.2; // 効果中の移動速度倍率
const coffeeFireRateBuffMultiplier = 1 / 1.2; // 効果中の発射間隔倍率（連射速度120%）
const coffeeCrossDrinkLifespanCost = 5; // 栄養ドリンクの効果中にコーヒーを飲む（またはその逆）と、追加で寿命を消費する
let coffee = null;
let coffeeSpawnTimerMs = getRandomCoffeeSpawnDelay();
let coffeeBuffTimerMs = 0; // 残り時間。0より大きい間は移動・発射が強化される（効果切れによる反動はない）
let coffeeDailyCount = 0; // 本日すでに飲んだコーヒーの本数。日付が変わるとリセットする
let coffeeStunImmunityCharges = 0; // コーヒー1杯につき1回分。脳疲労が100になってもstunを回避できる（その日のうちのみ）
let coffeeStunImmunityTimerMs = 0; // stunを回避している間、通常通り行動できる残り時間

// コーヒーによる移動速度の倍率
function getCoffeeMoveSpeedMultiplier() {
  return coffeeBuffTimerMs > 0 ? coffeeMoveSpeedBuffMultiplier : 1;
}

// コーヒーによる発射間隔の倍率
function getCoffeeFireRateMultiplier() {
  return coffeeBuffTimerMs > 0 ? coffeeFireRateBuffMultiplier : 1;
}

// コーヒーメーカーから取られたら、この時間だけ経つとまた隣に補充される
function getRandomCoffeeSpawnDelay() {
  return stationRespawnDelayMs;
}

// コーヒーメーカーのすぐ隣に生成する（固定位置。落下演出はなく、すぐ着地済みの状態になる。
// ただし取得できるようになるまでには、下記の出現猶予（stationItemPickupGraceMs）が必要）
function spawnCoffee() {
  coffee = {
    x: coffeeItemSpawnPosition.x,
    y: coffeeItemSpawnPosition.y,
    targetY: coffeeItemSpawnPosition.y,
    radius: coffeeRadius,
    fallSpeed: 0,
    landed: true,
    graceMs: stationItemPickupGraceMs
  };
}

// クリック／タップ、または完全オートモードで取得された時に呼ばれる
function consumeCoffee() {
  coffeeDailyCount++;
  coffeeStunImmunityCharges++;
  const isCrossDrink = energyDrinkBuffTimerMs > 0;
  const totalLifespanCost = coffeeLifespanCost + (isCrossDrink ? coffeeCrossDrinkLifespanCost : 0);
  san = Math.min(maxSan, san + coffeeSanRecovery);
  lifespan = Math.max(0, lifespan - totalLifespanCost);
  coffeeBuffTimerMs = coffeeBuffDurationMs;
  if (currentHour >= dayEndHour) eveningDrinkRecoveryPenalty = true;
  showMessage(
    `コーヒー取得！ SAN +${coffeeSanRecovery} / 寿命 -${totalLifespanCost}` +
    (isCrossDrink ? '（栄養ドリンクとの飲み合わせ…）' : ''),
    1800, '#a1887f'
  );
  checkVitalsGameOver();
  coffee = null;
  coffeeSpawnTimerMs = getRandomCoffeeSpawnDelay();
}

// ===== コーヒー・栄養ドリンクを夕方以降に飲んだ場合のペナルティ =====
// その日の終業時（自然回復）のSAN・脳疲労回復量が半分になる
let eveningDrinkRecoveryPenalty = false;

// ===== レアアイテム（ファイヤーウォール・仮称） =====
// 取得すると、自機・同僚それぞれに「お互いの誤射を防ぐバリア」が張られる（重ね掛け可能）
const heartWallLifetimeMs = 10000; // 出現してから消えるまでの時間（10秒）
const heartWallBlinkMs = 3000; // 消える3秒前から点滅する
const heartWallRadius = 22;
const heartWallBarrierCharges = 3; // 1個取得するごとに、お互いの誤射を防げる回数
let heartWall = null;
let heartWallSpawnTimerMs = getRandomHeartWallSpawnDelay();
let playerBarrierCharges = 0; // 残っている間は同僚の誤射を防ぐ

// チョコレート・栄養ドリンクの約20%の頻度でしか出現しない、希少アイテム
function getRandomHeartWallSpawnDelay() {
  return (8000 + Math.random() * 7000) / 0.2;
}

// マップ上部から落ちてきて、窓の範囲を避けた床の上に着地する
function spawnHeartWall() {
  const target = getNonOverlappingEventPosition(heartWallRadius);
  heartWall = {
    x: target.x,
    y: -heartWallRadius - 20,
    targetY: target.y,
    radius: heartWallRadius,
    fallSpeed: 0,
    landed: false,
    remainingMs: heartWallLifetimeMs
  };
}

// クリック／タップ、または完全オートモードで取得された時に呼ばれる
function consumeHeartWall() {
  playerBarrierCharges += heartWallBarrierCharges;
  if (partner.active) partner.barrierCharges += heartWallBarrierCharges;
  showMessage(
    `ファイヤーウォールを手に入れた！ 誤射・敵の接触ダメージを${heartWallBarrierCharges}回まで防ぐバリアを展開`,
    2200, '#b39ddb'
  );
  heartWall = null;
  heartWallSpawnTimerMs = getRandomHeartWallSpawnDelay();
}

// ===== ゲーム内の時刻・一日進行システム =====
const hourMs = 5000; // 現実の5秒をゲーム内の1時間として扱う
const dayStartHour = 8; // 8時始業（以前の9時から1時間繰り上げ、その分だけ稼働時間が延びる）
const dayEndHour = 18;
// 定時報告が残っている場合、終業時刻を過ぎても最大この時刻まで残業として居残れる
const maxOvertimeHour = 24;
// 残業中、ゲーム内1時間あたり減少するSAN（10分ごとに1ずつ、なめらかにではなく段階的に減る）。
// 24時になっても戦闘（中ボスなど）が続いている場合も、同じペースで段階的に減り続ける
const overtimeSanDrainPerHour = 6;
const overtimeLifespanDrainPerSec = 0.6; // 残業中、1秒あたり減少する寿命
const partnerOvertimeDrainRatio = 1.5; // 残業中の同僚のSAN・寿命減少は、自機の減少値のこの倍率
let overtimeSanDrainAccumMs = 0; // 自機のSAN段階的減少の蓄積タイマー（ゲーム内ミリ秒）
let partnerOvertimeSanDrainAccumMs = 0; // 同僚分
const overtimeFailureVitalRatio = 1 / 3; // 24時になっても片付けられなかった場合、SAN・寿命をこの割合まで減らす
let dayStartTime = Date.now();
let lastHourTime = dayStartTime;
let currentHour = dayStartHour;
// 一日の終了時に「続ける」を選んだ場合の回復量
const dayFatigueRecover = 30;
const daySanRecover = 10;

// ===== 一日の終わりの画面演出（フェードアウト→残敵の再配置→フェードイン） =====
let dayTransitionPhase = null; // null / 'out' / 'in'
let dayTransitionTimer = 0;
const dayTransitionDurationMs = 650; // フェードアウト・フェードインそれぞれの長さ
let dayTransitionAdvanceFn = null; // 画面が暗転しきった瞬間に実行する、実際の日付更新処理
// 完全オートモード中、「DAY〇〇」のクリック待ち画面で経過した時間（この時間が経つと自動でクリックした扱いにする）
let dayTransitionWaitingTimerMs = 0;
const dayTransitionAutoAdvanceMs = 3000;

// ===== DAYカウンターと週次ノルマシステム =====
// dayNumber変数は、敵の強さ調整に使うためファイル前半で宣言済み
let weeklyKillQuota = 0; // 今週の撃破ノルマ
let weeklyScoreQuota = 0; // 今週のスコア獲得ノルマ
let weeklyKills = 0; // 今週の撃破数
let weeklyScoreGained = 0; // 今週のスコア獲得量（減点は含まない）
let weekendWorkChoice = false; // 「休日出勤しますか」の選択待ち
let weekendWorkQuotaChoice = false; // 休日出勤中にノルマ達成し、「家に帰りますか」の選択待ち
let fixedEnemyOvertimeChoiceActive = false; // 18時に固定敵が残っている時の「残業しますか？」の選択待ち
let fixedEnemyOvertimeConfirmed = false; // その日、「残業する」を選んだ後は、以降の時報で再度尋ねない
const weekendWorkSanDrainPerSec = 0.5; // 休日出勤中、1秒あたり緩やかに減少するSAN
const weekendWorkLifespanDrainPerSec = 0.15; // 休日出勤中、1秒あたり緩やかに減少する寿命
// ノルマ未達成時のペナルティ・達成時のボーナスの割合
const weeklyFailScorePenaltyRatio = 0.25; // Scoreの25%を失う
const weeklyFailSanPenaltyRatio = 0.35; // maxSanの35%ぶんSANを失う
const restEvaluationPenaltyRatio = 0.10; // 休日出勤を断った場合、さらにScoreの10%を失う

// 背景画像の窓（オフィスの窓ガラス部分）の下端のY座標。
// 自機・同僚はこの窓の範囲には入れず、アイテムやクイズの選択肢もここより上には出現させない。
const windowZoneBottomY = 235;
// 窓の下端付近は圧迫感があるため、アイテム等の出現はさらに少し余裕を持たせた位置から
const eventSpawnMinY = windowZoneBottomY + 40;

// 自機・同僚などのキャラクターが画面外・窓の中へ出ないよう座標を制限する
function clampToPlayableFloor(entity) {
  entity.x = Math.max(entity.radius, Math.min(canvas.width - entity.radius, entity.x));
  entity.y = Math.max(Math.max(entity.radius, windowZoneBottomY), Math.min(canvas.height - entity.radius, entity.y));
}

// 新しい日が始まるタイミングで、自機・同僚の位置を画面中央付近に戻す
function resetPlayerAndPartnerPositionForNewDay() {
  player.x = canvas.width / 2;
  player.y = canvas.height / 2;
  clampToPlayableFloor(player);
  partner.x = player.x + partnerFollowOffsetX;
  partner.y = player.y + partnerFollowOffsetY;
  partner.vx = 0;
  partner.vy = 0;
  clampToPlayableFloor(partner);
}

// ===== 時刻イベント（定時報告・昼食・クイズ） =====
// 完全オートモード等のON/OFFトグルボタン（画面左下）が置かれている範囲。アイテム等はここには出現させない
const toggleButtonExclusionZone = { x: 12, y: 278, w: 170, h: 26 * 3 + 6 * 2 };
function isPointNearRect(point, rect, padding = 0) {
  return point.x >= rect.x - padding && point.x <= rect.x + rect.w + padding &&
    point.y >= rect.y - padding && point.y <= rect.y + rect.h + padding;
}
function getRandomEventPosition(radius = 24) {
  const margin = radius + 24;
  let position;
  let attempts = 0;
  do {
    position = {
      x: margin + Math.random() * (canvas.width - margin * 2),
      // 窓の範囲を避け、プレイ領域の中央より下へ配置する
      y: eventSpawnMinY + Math.random() * (canvas.height - eventSpawnMinY - margin)
    };
    attempts++;
  } while (attempts < 20 && isPointNearRect(position, toggleButtonExclusionZone, radius));
  return position;
}

// 既に置かれている他のアイテム（チョコレート・栄養ドリンク・コーヒー・ファイヤーウォール）と
// 重ならない出現位置を探す。20回試しても見つからなければ最後の候補をそのまま使う
function getNonOverlappingEventPosition(radius, minGap = 70) {
  let position;
  let attempts = 0;
  do {
    position = getRandomEventPosition(radius);
    attempts++;
  } while (attempts < 20 && [chocolate, energyDrink, coffee, heartWall].some(item =>
    item && Math.hypot(item.x - position.x, (item.targetY ?? item.y) - position.y) < minGap
  ));
  return position;
}

// --- 定時報告：3日ごとの16時に現れる、移動しない高耐久ターゲット ---
const scheduledReportIntervalDays = 3;
const scheduledReportHour = 16;
const scheduledReportBaseHp = 45; // 倒しやすいよう引き下げ
const scheduledReportRadius = 38;
let scheduledReport = null;

function spawnScheduledReport() {
  if (scheduledReport || dayNumber % scheduledReportIntervalDays !== 0) return;
  const position = getRandomEventPosition(scheduledReportRadius);
  const collisionSafeMargin = scheduledReportRadius + player.radius * 2 + 2;
  position.x = Math.max(collisionSafeMargin, Math.min(canvas.width - collisionSafeMargin, position.x));
  position.y = Math.max(collisionSafeMargin, Math.min(canvas.height - collisionSafeMargin, position.y));
  const maxHp = Math.ceil(scheduledReportBaseHp * getEnemyDifficultyMultiplier());
  scheduledReport = { ...position, radius: scheduledReportRadius, hp: maxHp, maxHp };
  showMessage('16時：定時報告が発生！', 3500, '#ffca28', '23px sans-serif');
}

function defeatScheduledReport() {
  if (!scheduledReport) return;
  const reward = Math.ceil(35 * specialSkillEffects.scoreGainMultiplier);
  score += reward;
  weeklyScoreGained += reward;
  scheduledReport = null;
  checkEarlyQuotaAchievement();
  showMessage(`定時報告を完了！ Score +${reward}`, 2500, '#69f0ae', '24px sans-serif');
  // 残業中に片付けた場合は、待たずにその場で退勤する
  if (currentHour >= dayEndHour && dayTransitionPhase === null) {
    endWorkday();
  }
}

function failScheduledReport() {
  if (!scheduledReport) return;
  scheduledReport = null;
  score = Math.floor(score / 2);
  san = Math.floor(san * overtimeFailureVitalRatio);
  lifespan = Math.floor(lifespan * overtimeFailureVitalRatio);
  showMessage('24時：ついに定時報告を完了できなかった… Scoreが半分、SAN・寿命が1/3に激減',
    4500, '#ff1744', '23px sans-serif');
  checkVitalsGameOver();
}

// 定時報告は接触ダメージを持たないが、自分も同僚も通り抜けられない。
function pushEntityOutsideScheduledReport(entity) {
  if (!scheduledReport || !entity) return;
  let dx = entity.x - scheduledReport.x;
  let dy = entity.y - scheduledReport.y;
  let distance = Math.hypot(dx, dy);
  const minimumDistance = entity.radius + scheduledReport.radius + 1;
  if (distance >= minimumDistance) return;
  if (distance === 0) {
    dx = 1;
    dy = 0;
    distance = 1;
  }
  entity.x = scheduledReport.x + (dx / distance) * minimumDistance;
  entity.y = scheduledReport.y + (dy / distance) * minimumDistance;
  clampToPlayableFloor(entity);
}

// ===== 固定敵（IT用語モチーフの特殊な出現敵） =====
// 現実の経過時間で平均30秒に1件ほど、ランダムなタイミングでマップ上に出現する、移動しない特殊な敵。
// ゲーム内時間（時刻・日数）の進行状況やラスボス・中ボスの有無に関わらず出現し続け、最大5体まで同時に存在できる
// （ただし第1回のアドベンチャーパートに入るまでは、頻度・同時数ともかなり控えめにする）。
// 名称はIT・セキュリティ用語から取り、現実の攻撃内容にちなんだ攻撃パターン・被弾時の悪影響を持つ。
const fixedEnemyMaxConcurrentDefault = 5;
// 第1回のアドベンチャーパートに入るまでの間は、固定敵の出現をかなり控えめにする
const fixedEnemyMaxConcurrentEarly = 2;
function getFixedEnemyMaxConcurrent() {
  return adventureRunCount === 0 ? fixedEnemyMaxConcurrentEarly : fixedEnemyMaxConcurrentDefault;
}
const fixedEnemyDurabilityMultiplier = 3; // 耐久力（HP）を全体的に3倍にする
const fixedEnemySpawnIntervalAvgMs = 30000; // 現実の時間で平均30秒に1件（指数分布でかなりばらつかせる）
// 第1回のアドベンチャーパートに入るまでの間は、平均間隔をこの倍率まで伸ばし、出現頻度をかなり下げる
const fixedEnemySpawnIntervalEarlyMultiplier = 3;
const fixedEnemySpawnIntervalMinMs = 500; // 連続発生時でも、これより短い間隔にはしない
function getRandomFixedEnemySpawnIntervalMs() {
  // 指数分布：平均が上の定数になるようにしつつ、運が悪いと連続発生し得るほどのばらつきを持たせる
  const avgMs = adventureRunCount === 0
    ? fixedEnemySpawnIntervalAvgMs * fixedEnemySpawnIntervalEarlyMultiplier
    : fixedEnemySpawnIntervalAvgMs;
  return Math.max(fixedEnemySpawnIntervalMinMs, -Math.log(1 - Math.random()) * avgMs);
}
const fixedEnemyBulletSpeed = 5;
const fixedEnemyBulletRadius = 6;
const decoyBaseSanDamage = 8; // 「おとり」系（フィッシング等）に触れた時の共通の基礎ダメージ
const decoyBaseFatigueDamage = 10;
const decoyRadius = 18;
const disguiseBaseSanDamage = 6; // なりすまし・中間者攻撃系が同僚に命中した時の共通の基礎ダメージ
const disguiseBaseRelationshipDamage = 6;

// 攻撃名・現実の用語内容・ゲーム内の攻撃パターン/効果を対応させた定義一覧
const fixedEnemyDefs = [
  {
    id: 'dos', name: 'DoS攻撃', icon: '💥', hpBase: 34, radius: 28,
    info: 'サーバーやネットワークに大量のリクエストを送り、サービスを停止・遅延させる攻撃。',
    attackType: 'burst', intervalMs: 2600, burstCount: 3, spreadRad: 0.3, bulletSan: 5, bulletLifespan: 1,
    effect: { id: 'fireRateDebuff', magnitude: 1500 }
  },
  {
    id: 'ddos', name: 'DDoS攻撃', icon: '🌐', hpBase: 46, radius: 30,
    info: '複数の端末、特にボットネットを使って行う大規模なDoS攻撃。',
    attackType: 'burst', intervalMs: 3400, burstCount: 5, spreadRad: 0.5, bulletSan: 4, bulletLifespan: 1,
    spawnsMinionOnAttack: true, minionMax: 3,
    effect: { id: 'moveSpeedDebuff', magnitude: 1800 }
  },
  {
    id: 'xss', name: 'XSS', icon: '🧬', hpBase: 32, radius: 27,
    info: 'Webサイトに悪意あるスクリプトを埋め込み、利用者のブラウザ上で実行させる攻撃。',
    attackType: 'burst', intervalMs: 2200, burstCount: 1, spreadRad: 0.1, bulletSan: 6, bulletLifespan: 1,
    effect: { id: 'controlsReverse', magnitude: 2500 }
  },
  {
    id: 'sql-injection', name: 'SQLインジェクション', icon: '🗄️', hpBase: 34, radius: 28,
    info: '入力欄などから不正なSQL文を送り、データベースを不正操作する攻撃。',
    attackType: 'pulse', intervalMs: 1000,
    effect: { id: 'scoreDrain', magnitude: 3 }
  },
  {
    id: 'csrf', name: 'CSRF', icon: '🎭', hpBase: 30, radius: 27,
    info: 'ログイン中の利用者に意図しない操作をさせる攻撃。',
    attackType: 'burst', intervalMs: 2000, burstCount: 1, spreadRad: 0.05, bulletSan: 5, bulletLifespan: 1,
    effect: { id: 'fireLock', magnitude: 1200 }
  },
  {
    id: 'phishing', name: 'フィッシング', icon: '🎣', hpBase: 30, radius: 27,
    info: '本物に見せかけたメールやサイトで、ID・パスワード・カード情報などを盗む攻撃。',
    attackType: 'decoy', intervalMs: 6000, decoyIcon: '🎣',
    effect: { id: 'fatigueDamage', magnitude: 20 }
  },
  {
    id: 'malware', name: 'マルウェア感染', icon: '🦠', hpBase: 34, radius: 28,
    info: 'ウイルス、ワーム、トロイの木馬などの悪意あるソフトを端末に感染させる攻撃。',
    attackType: 'burst', intervalMs: 2600, burstCount: 1, spreadRad: 0.2, bulletSan: 5, bulletLifespan: 1,
    effect: { id: 'infect', magnitude: 4000 }
  },
  {
    id: 'ransomware', name: 'ランサムウェア', icon: '🔒', hpBase: 42, radius: 30,
    info: 'ファイルやシステムを暗号化し、復旧と引き換えに金銭を要求する攻撃。',
    attackType: 'pulse', intervalMs: 5000,
    effect: { id: 'scoreDrain', magnitude: 18 }
  },
  {
    id: 'bruteforce', name: 'ブルートフォース攻撃', icon: '🔨', hpBase: 26, radius: 26,
    info: 'パスワードを総当たりで試してログインを突破しようとする攻撃。',
    attackType: 'burst', intervalMs: 900, burstCount: 1, spreadRad: 0.05, bulletSan: 4, bulletLifespan: 1
  },
  {
    id: 'dictionary-attack', name: '辞書攻撃', icon: '📖', hpBase: 26, radius: 26,
    info: 'よく使われる単語や流出済みパスワードリストを使ってログインを試す攻撃。',
    attackType: 'burst', intervalMs: 1400, burstCount: 1, pattern: [-0.35, 0, 0.35], bulletSan: 5, bulletLifespan: 1
  },
  {
    id: 'password-list-attack', name: 'パスワードリスト攻撃', icon: '📋', hpBase: 28, radius: 26,
    info: '他サービスから漏えいしたID・パスワードの組み合わせを使い回してログインを試す攻撃。',
    attackType: 'burst', intervalMs: 1500, burstCount: 1, spreadRad: 0.05, predictive: true, bulletSan: 6, bulletLifespan: 1
  },
  {
    id: 'man-in-the-middle', name: '中間者攻撃', icon: '🕵️', hpBase: 34, radius: 28,
    info: '通信の間に割り込み、盗聴・改ざん・なりすましを行う攻撃。',
    attackType: 'disguise', intervalMs: 3400
  },
  {
    id: 'sniffing', name: '盗聴・スニッフィング', icon: '👂', hpBase: 30, radius: 27,
    info: 'ネットワーク上の通信内容を傍受する攻撃。暗号化されていない通信が狙われやすい。',
    attackType: 'pulse', intervalMs: 4000, range: 220,
    effect: { id: 'visionObscure', magnitude: 3000 }
  },
  {
    id: 'dns-spoofing', name: 'DNSスプーフィング', icon: '🧭', hpBase: 30, radius: 27,
    info: '正規サイトにアクセスしたつもりの利用者を偽サイトへ誘導する攻撃。',
    attackType: 'decoy', intervalMs: 7000, decoyIcon: '🧭',
    effect: { id: 'sanDamage', magnitude: 6 }
  },
  {
    id: 'zero-day', name: 'ゼロデイ攻撃', icon: '⚡', hpBase: 48, radius: 30,
    info: 'まだ修正パッチが出ていない脆弱性を悪用する攻撃。防御が難しい。',
    attackType: 'burst', intervalMs: 3000, burstCount: 2, spreadRad: 0.2, bulletSan: 10, bulletLifespan: 3,
    instantFirstAttack: true
  },
  {
    id: 'privilege-escalation', name: '権限昇格', icon: '👑', hpBase: 55, radius: 32,
    info: '低い権限で侵入したあと、管理者権限などより強い権限を不正に取得する攻撃。',
    attackType: 'burst', intervalMs: 3000, burstCount: 2, spreadRad: 0.3, bulletSan: 5, bulletLifespan: 1,
    escalate: true
  },
  {
    id: 'backdoor', name: 'バックドア設置', icon: '🚪', hpBase: 22, radius: 25,
    info: '侵入後、再び入り込めるように秘密の侵入口を作る行為。',
    attackType: 'burst', intervalMs: 5000, burstCount: 1, spreadRad: 0.1, bulletSan: 5, bulletLifespan: 1,
    persistAfterDefeat: true
  },
  {
    id: 'supply-chain', name: 'サプライチェーン攻撃', icon: '📦', hpBase: 34, radius: 28,
    info: '取引先、委託先、ソフトウェア更新経路などを悪用して本命の組織を攻撃する手法。',
    attackType: 'decoy', intervalMs: 6500, decoyIcon: '📦',
    effect: { id: 'infect', magnitude: 3000 }
  },
  {
    id: 'targeted-attack', name: '標的型攻撃', icon: '🎯', hpBase: 36, radius: 28,
    info: '特定の企業・組織・個人を狙い、メールや脆弱性を使って継続的に侵入を試みる攻撃。',
    attackType: 'burst', intervalMs: 2000, burstCount: 2, spreadRad: 0.1, bulletSan: 6, bulletLifespan: 2,
    effect: { id: 'fireRateDebuff', magnitude: 1000 }
  },
  {
    id: 'social-engineering', name: 'ソーシャルエンジニアリング', icon: '🗣️', hpBase: 28, radius: 27,
    info: '人の心理や油断を利用して、パスワードや機密情報を聞き出す手口。',
    attackType: 'decoy', intervalMs: 5500, decoyIcon: '🗣️',
    effect: { id: 'relationshipDamage', magnitude: 6 }
  },
  {
    id: 'impersonation', name: 'なりすまし', icon: '🥷', hpBase: 34, radius: 28,
    info: '他人や正規サービスを装って、信頼を悪用する攻撃。メール送信者やログイン情報の偽装など。',
    attackType: 'disguise', intervalMs: 3200
  },
  {
    id: 'email-spoofing', name: 'メールスプーフィング', icon: '📧', hpBase: 28, radius: 26,
    info: '送信元を偽装したメールを送り、フィッシングやマルウェア感染に誘導する攻撃。',
    attackType: 'decoy', intervalMs: 5000, decoyIcon: '📧',
    effect: { id: 'sanDamage', magnitude: 5 }
  },
  {
    id: 'clickjacking', name: 'クリックジャッキング', icon: '🖱️', hpBase: 28, radius: 26,
    info: '利用者が見えているボタンとは別の操作をクリックさせる攻撃。',
    attackType: 'decoy', intervalMs: 4500, decoyIcon: '🖱️',
    effect: { id: 'fireLock', magnitude: 1500 }
  },
  {
    id: 'directory-traversal', name: 'ディレクトリトラバーサル', icon: '📁', hpBase: 30, radius: 27,
    info: 'Webサーバー上の本来アクセスできないファイルを不正に参照しようとする攻撃。',
    attackType: 'burst', intervalMs: 1800, burstCount: 1, spreadRad: 0.1, bulletSan: 6, bulletLifespan: 1,
    spawnFromEdge: true
  },
  {
    id: 'remote-code-execution', name: 'リモートコード実行', icon: '💻', hpBase: 36, radius: 28,
    info: '脆弱性を悪用して、遠隔からサーバーや端末上で不正なプログラムを実行する攻撃。',
    attackType: 'burst', intervalMs: 2400, burstCount: 1, spreadRad: 0.1, bulletSan: 6, bulletLifespan: 2,
    effect: { id: 'hijackMove', magnitude: 1800 }
  },
  {
    id: 'session-hijacking', name: 'セッションハイジャック', icon: '🪪', hpBase: 32, radius: 27,
    info: 'ログイン状態を示すセッション情報を盗み、本人になりすまして操作する攻撃。',
    attackType: 'burst', intervalMs: 2600, burstCount: 1, spreadRad: 0.1, bulletSan: 5, bulletLifespan: 1,
    effect: { id: 'partnerHijack', magnitude: 2500 }
  },
  {
    id: 'keylogger', name: 'キーロガー', icon: '⌨️', hpBase: 24, radius: 25,
    info: 'キーボード入力を記録し、パスワードや機密情報を盗むマルウェアや仕組み。',
    attackType: 'burst', intervalMs: 1600, burstCount: 1, spreadRad: 0.15, bulletSan: 4, bulletLifespan: 1,
    dodgeChance: 0.35
  },
  {
    id: 'botnet', name: 'ボットネット', icon: '🤖', hpBase: 50, radius: 32,
    info: 'マルウェアに感染した多数の端末を遠隔操作し、DDoSや迷惑メール送信などに悪用する仕組み。',
    attackType: 'minion', intervalMs: 4200, minionMax: 5
  },
  {
    id: 'watering-hole', name: '水飲み場攻撃', icon: '🚰', hpBase: 30, radius: 27,
    info: '標的がよく訪れるWebサイトを改ざんし、アクセスした標的を感染させる攻撃。',
    attackType: 'decoy', intervalMs: 6000, decoyIcon: '🚰',
    effect: { id: 'infect', magnitude: 2500 }
  },
  {
    id: 'insider-threat', name: '内部不正', icon: '🐍', hpBase: 34, radius: 28,
    info: '社員・委託先など内部関係者が、情報の持ち出し・改ざん・破壊などを行う行為。',
    attackType: 'pulse', intervalMs: 4500,
    effect: { id: 'partnerHijack', magnitude: 3000 }
  }
];

let fixedEnemies = []; // 現在アクティブな固定敵（最大fixedEnemyMaxConcurrent体）
// ここではadventureRunCount（この後で宣言される）にまだアクセスできないため、初期値は控えめ倍率を使わない素の間隔で計算する
let fixedEnemySpawnTimerMs = Math.max(fixedEnemySpawnIntervalMinMs, -Math.log(1 - Math.random()) * fixedEnemySpawnIntervalAvgMs); // 次の出現までの残り時間（現実のミリ秒）
let fixedEnemyLastRealMs = null; // 実時間の経過を測るための直前のDate.now()
const pendingFixedEnemyBackdoors = []; // バックドア設置：撃破後もしばらく残る、不意打ち予約リスト

// 被弾時の効果に使う、状態異常タイマー（0より大きい間だけ効果が続く）
let fixedEnemyControlsReversedTimerMs = 0; // 移動キーが反転する（XSS）
let fixedEnemyMoveHijackTimerMs = 0; // 移動が乗っ取られ、ランダムな方向へ動かされる（リモートコード実行）
let fixedEnemyMoveHijackAngle = 0;
let fixedEnemyMoveSpeedDebuffTimerMs = 0; // 移動速度が低下する（DDoS）
let fixedEnemyFireRateDebuffTimerMs = 0; // 発射間隔が延びる（DoS・標的型攻撃）
let fixedEnemyFireLockTimerMs = 0; // 一時的に攻撃できなくなる（CSRF・クリックジャッキング）
let fixedEnemyRecoveryDisabledTimerMs = 0; // 待機時の脳疲労回復が無効になる（マルウェア感染・サプライチェーン攻撃・水飲み場攻撃）
let fixedEnemyInfectedTickTimerMs = 0; // 感染中、継続的にSANが少しずつ削れていく
let fixedEnemyVisionObscuredTimerMs = 0; // HUDの一部（アイテム等）が見えづらくなる（盗聴・スニッフィング）

// 固定敵を撃破した時、その用語の現実の説明文を窓の上あたりにフェードイン→一定時間表示→フェードアウトさせる
const fixedEnemyDefeatInfoFadeInMs = 500;
const fixedEnemyDefeatInfoHoldMs = 3000;
const fixedEnemyDefeatInfoFadeOutMs = 500;
let fixedEnemyDefeatInfoDisplay = null; // null、または { name, info, elapsedMs }

function getFixedEnemyDefeatInfoAlpha() {
  const d = fixedEnemyDefeatInfoDisplay;
  if (!d) return 0;
  if (d.elapsedMs < fixedEnemyDefeatInfoFadeInMs) return d.elapsedMs / fixedEnemyDefeatInfoFadeInMs;
  const holdEnd = fixedEnemyDefeatInfoFadeInMs + fixedEnemyDefeatInfoHoldMs;
  if (d.elapsedMs < holdEnd) return 1;
  const fadeOutElapsed = d.elapsedMs - holdEnd;
  return Math.max(0, 1 - fadeOutElapsed / fixedEnemyDefeatInfoFadeOutMs);
}

function getFixedEnemyMoveSpeedMultiplier() {
  return fixedEnemyMoveSpeedDebuffTimerMs > 0 ? 0.6 : 1;
}
function getFixedEnemyFireRateMultiplier() {
  return fixedEnemyFireRateDebuffTimerMs > 0 ? 1.7 : 1;
}

// 固定敵1体ぶんの被弾効果を、対象に応じて適用する共通処理
function applyFixedEnemyEffect(effect, target = 'player') {
  if (!effect) return;
  switch (effect.id) {
    case 'sanDamage':
      damageSan(effect.magnitude);
      break;
    case 'fatigueDamage':
      fatigue = Math.min(maxFatigue, fatigue + effect.magnitude);
      break;
    case 'scoreDrain':
      score = Math.max(0, score - effect.magnitude);
      break;
    case 'relationshipDamage':
      adjustPartnerRelationship(-effect.magnitude);
      break;
    case 'fireRateDebuff':
      fixedEnemyFireRateDebuffTimerMs = Math.max(fixedEnemyFireRateDebuffTimerMs, effect.magnitude);
      break;
    case 'moveSpeedDebuff':
      fixedEnemyMoveSpeedDebuffTimerMs = Math.max(fixedEnemyMoveSpeedDebuffTimerMs, effect.magnitude);
      break;
    case 'controlsReverse':
      fixedEnemyControlsReversedTimerMs = Math.max(fixedEnemyControlsReversedTimerMs, effect.magnitude);
      break;
    case 'hijackMove':
      fixedEnemyMoveHijackTimerMs = Math.max(fixedEnemyMoveHijackTimerMs, effect.magnitude);
      fixedEnemyMoveHijackAngle = Math.random() * Math.PI * 2;
      break;
    case 'fireLock':
      fixedEnemyFireLockTimerMs = Math.max(fixedEnemyFireLockTimerMs, effect.magnitude);
      break;
    case 'recoveryDisable':
      fixedEnemyRecoveryDisabledTimerMs = Math.max(fixedEnemyRecoveryDisabledTimerMs, effect.magnitude);
      break;
    case 'infect':
      fixedEnemyRecoveryDisabledTimerMs = Math.max(fixedEnemyRecoveryDisabledTimerMs, effect.magnitude);
      fixedEnemyInfectedTickTimerMs = Math.max(fixedEnemyInfectedTickTimerMs, effect.magnitude);
      break;
    case 'visionObscure':
      fixedEnemyVisionObscuredTimerMs = Math.max(fixedEnemyVisionObscuredTimerMs, effect.magnitude);
      break;
    case 'partnerHijack':
      if (partner.active) partner.hijackedTimerMs = Math.max(partner.hijackedTimerMs || 0, effect.magnitude);
      break;
  }
}

function spawnFixedEnemy() {
  if (fixedEnemies.length >= getFixedEnemyMaxConcurrent()) return;
  const def = fixedEnemyDefs[Math.floor(Math.random() * fixedEnemyDefs.length)];
  const radius = def.radius;
  let position;
  if (def.spawnFromEdge) {
    // ディレクトリトラバーサル：通常の出現範囲外、画面の隅寄りから出現する
    const margin = radius + 20;
    const corners = [
      { x: margin, y: eventSpawnMinY + margin },
      { x: canvas.width - margin, y: eventSpawnMinY + margin },
      { x: margin, y: canvas.height - margin },
      { x: canvas.width - margin, y: canvas.height - margin }
    ];
    position = corners[Math.floor(Math.random() * corners.length)];
  } else {
    // 既に出ている他の固定敵と重ならない位置を探す（20回試して見つからなければ最後の候補をそのまま使う）
    let attempts = 0;
    do {
      position = getRandomEventPosition(radius);
      attempts++;
    } while (attempts < 20 && fixedEnemies.some(fx =>
      Math.hypot(fx.x - position.x, fx.y - position.y) < fx.radius + radius + 40));
  }
  const collisionSafeMargin = radius + player.radius * 2 + 2;
  position.x = Math.max(collisionSafeMargin, Math.min(canvas.width - collisionSafeMargin, position.x));
  position.y = Math.max(collisionSafeMargin, Math.min(canvas.height - collisionSafeMargin, position.y));
  const maxHp = Math.ceil(def.hpBase * fixedEnemyDurabilityMultiplier * getEnemyDifficultyMultiplier());
  const fx = {
    def, x: position.x, y: position.y, radius,
    hp: maxHp, maxHp,
    timerMs: def.instantFirstAttack ? 250 : def.intervalMs,
    ageMs: 0,
    minionsSpawned: 0,
    decoy: null,
    decoyTimerMs: def.attackType === 'decoy' ? def.intervalMs : 0,
    patternIndex: 0
  };
  fixedEnemies.push(fx);
  showMessage(`${def.icon} ${def.name} が発生！`, 3000, '#ff8a80', '22px sans-serif');
}

// 脅威（固定敵）を排除しないまま日をまたぐと、残っている数だけScoreが目減りする（1体につき×0.8）
const fixedEnemyCarryOverScorePenaltyMultiplier = 0.8;
function clearFixedEnemiesAtDayEnd() {
  if (fixedEnemies.length === 0) return;
  const names = [...new Set(fixedEnemies.map(fx => fx.def.name))].join('・');
  const beforeScore = score;
  score = Math.floor(score * Math.pow(fixedEnemyCarryOverScorePenaltyMultiplier, fixedEnemies.length));
  const scoreLost = beforeScore - score;
  showMessage(`${names} を見逃してしまった… Score -${scoreLost}`, 2400, '#ff8a80');
  fixedEnemies = [];
}

// 固定敵は接触ダメージを持たないが、自分も同僚も通り抜けられない
function pushEntityOutsideFixedEnemy(entity) {
  if (!entity) return;
  for (const fx of fixedEnemies) {
    let dx = entity.x - fx.x;
    let dy = entity.y - fx.y;
    let distance = Math.hypot(dx, dy);
    const minimumDistance = entity.radius + fx.radius + 1;
    if (distance >= minimumDistance) continue;
    if (distance === 0) {
      dx = 1;
      dy = 0;
      distance = 1;
    }
    entity.x = fx.x + (dx / distance) * minimumDistance;
    entity.y = fx.y + (dy / distance) * minimumDistance;
    clampToPlayableFloor(entity);
  }
}

function defeatFixedEnemy(fx) {
  const index = fixedEnemies.indexOf(fx);
  if (index === -1) return;
  const def = fx.def;
  const reward = Math.ceil(28 * specialSkillEffects.scoreGainMultiplier * getEnemyDifficultyMultiplier());
  score += reward;
  weeklyScoreGained += reward;
  checkEarlyQuotaAchievement();
  showMessage(`${def.name} を撃退！ Score +${reward}`, 2500, '#69f0ae', '23px sans-serif');
  fixedEnemyDefeatInfoDisplay = { name: def.name, info: def.info, elapsedMs: 0 };
  recordFixedEnemyDefeatForStats(def.name);
  if (def.persistAfterDefeat) {
    // バックドア設置：撃破後もしばらくすると同じ場所から不意打ちの一発が飛んでくる
    const shots = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < shots; i++) {
      pendingFixedEnemyBackdoors.push({
        remainingMs: 4000 + Math.random() * 8000 + i * 5000,
        x: fx.x, y: fx.y
      });
    }
  }
  fixedEnemies.splice(index, 1);
}

function spawnFixedEnemyBullet(fromX, fromY, angle, def) {
  bullets.push({
    x: fromX, y: fromY,
    vx: Math.cos(angle) * fixedEnemyBulletSpeed,
    vy: Math.sin(angle) * fixedEnemyBulletSpeed,
    radius: fixedEnemyBulletRadius, damage: 1, bounces: 0,
    owner: 'fixedEnemy', fixedEnemyDefId: def.id
  });
}

function performFixedEnemyAttack(fx) {
  const def = fx.def;
  if (def.attackType === 'burst') {
    let count = def.burstCount;
    let intervalMs = def.intervalMs;
    if (def.escalate) {
      const ageSec = fx.ageMs / 1000;
      count += Math.floor(ageSec / 6);
      intervalMs = Math.max(1000, intervalMs - ageSec * 30);
    }
    const baseAngle = Math.atan2(player.y - fx.y, player.x - fx.x);
    for (let i = 0; i < count; i++) {
      let angle;
      if (def.predictive) {
        const leadX = player.x + (player.lastMoveDx || 0) * 14;
        const leadY = player.y + (player.lastMoveDy || 0) * 14;
        angle = Math.atan2(leadY - fx.y, leadX - fx.x);
      } else if (def.pattern) {
        angle = baseAngle + def.pattern[fx.patternIndex % def.pattern.length];
        fx.patternIndex++;
      } else {
        angle = baseAngle + (Math.random() - 0.5) * (def.spreadRad || 0.2);
      }
      spawnFixedEnemyBullet(fx.x, fx.y, angle, def);
    }
    fx.timerMs = intervalMs;
    if (def.spawnsMinionOnAttack && fx.minionsSpawned < (def.minionMax || 3)) {
      spawnEnemy(0);
      fx.minionsSpawned++;
    }
  } else if (def.attackType === 'minion') {
    if (fx.minionsSpawned < (def.minionMax || 5)) {
      spawnEnemy(0);
      fx.minionsSpawned++;
    }
    fx.timerMs = def.intervalMs;
  } else if (def.attackType === 'pulse') {
    if (!def.range || Math.hypot(player.x - fx.x, player.y - fx.y) <= def.range) {
      applyFixedEnemyEffect(def.effect, 'player');
    }
    fx.timerMs = def.intervalMs;
  } else if (def.attackType === 'disguise') {
    if (partner.active) {
      const angle = Math.atan2(partner.y - fx.y, partner.x - fx.x);
      bullets.push({
        x: fx.x, y: fx.y,
        vx: Math.cos(angle) * fixedEnemyBulletSpeed,
        vy: Math.sin(angle) * fixedEnemyBulletSpeed,
        radius: fixedEnemyBulletRadius, damage: 1, bounces: 0,
        owner: 'fixedEnemyDisguise', fixedEnemyDefId: def.id
      });
    }
    fx.timerMs = def.intervalMs;
  }
}

function updateFixedEnemyDecoy(fx, dt) {
  const def = fx.def;
  if (def.attackType !== 'decoy') return;
  if (!fx.decoy) {
    fx.decoyTimerMs -= dt * 1000;
    if (fx.decoyTimerMs <= 0) {
      const angle = Math.random() * Math.PI * 2;
      const dist = fx.radius + 60 + Math.random() * 40;
      const dp = {
        x: Math.max(30, Math.min(canvas.width - 30, fx.x + Math.cos(angle) * dist)),
        y: Math.max(eventSpawnMinY, Math.min(canvas.height - 30, fx.y + Math.sin(angle) * dist))
      };
      fx.decoy = { x: dp.x, y: dp.y, radius: decoyRadius };
    }
  } else if (Math.hypot(player.x - fx.decoy.x, player.y - fx.decoy.y) <= player.radius + fx.decoy.radius) {
    damageSan(decoyBaseSanDamage);
    fatigue = Math.min(maxFatigue, fatigue + decoyBaseFatigueDamage);
    applyFixedEnemyEffect(def.effect, 'player');
    showMessage(`${def.name} の罠だった…`, 1800, '#ff8a80');
    fx.decoy = null;
    fx.decoyTimerMs = def.intervalMs;
  }
}

function updateFixedEnemy(dt) {
  const dtMs = dt * 1000;
  // 状態異常タイマーは、固定敵が存在しない間も減っていく（プレイヤーへの影響を継続させるため）
  fixedEnemyControlsReversedTimerMs = Math.max(0, fixedEnemyControlsReversedTimerMs - dtMs);
  fixedEnemyMoveHijackTimerMs = Math.max(0, fixedEnemyMoveHijackTimerMs - dtMs);
  fixedEnemyMoveSpeedDebuffTimerMs = Math.max(0, fixedEnemyMoveSpeedDebuffTimerMs - dtMs);
  fixedEnemyFireRateDebuffTimerMs = Math.max(0, fixedEnemyFireRateDebuffTimerMs - dtMs);
  fixedEnemyFireLockTimerMs = Math.max(0, fixedEnemyFireLockTimerMs - dtMs);
  fixedEnemyVisionObscuredTimerMs = Math.max(0, fixedEnemyVisionObscuredTimerMs - dtMs);
  if (fixedEnemyRecoveryDisabledTimerMs > 0) {
    fixedEnemyRecoveryDisabledTimerMs = Math.max(0, fixedEnemyRecoveryDisabledTimerMs - dtMs);
  }
  if (fixedEnemyInfectedTickTimerMs > 0) {
    fixedEnemyInfectedTickTimerMs = Math.max(0, fixedEnemyInfectedTickTimerMs - dtMs);
    damageSan(0.6 * dt);
  }
  if (partner.active && partner.hijackedTimerMs > 0) {
    partner.hijackedTimerMs = Math.max(0, partner.hijackedTimerMs - dtMs);
  }

  // 固定敵撃破後の説明文表示（フェードイン→表示→フェードアウト）を進める
  if (fixedEnemyDefeatInfoDisplay) {
    fixedEnemyDefeatInfoDisplay.elapsedMs += dtMs;
    if (fixedEnemyDefeatInfoDisplay.elapsedMs >=
        fixedEnemyDefeatInfoFadeInMs + fixedEnemyDefeatInfoHoldMs + fixedEnemyDefeatInfoFadeOutMs) {
      fixedEnemyDefeatInfoDisplay = null;
    }
  }

  // バックドア設置：撃破後に予約された不意打ちを処理する
  for (let i = pendingFixedEnemyBackdoors.length - 1; i >= 0; i--) {
    const b = pendingFixedEnemyBackdoors[i];
    b.remainingMs -= dtMs;
    if (b.remainingMs <= 0) {
      const angle = Math.atan2(player.y - b.y, player.x - b.x);
      spawnFixedEnemyBullet(b.x, b.y, angle, { id: 'backdoor' });
      pendingFixedEnemyBackdoors.splice(i, 1);
    }
  }

  // 固定敵の出現判定は、ゲーム内時間の進行状況（ラスボス・中ボスによる時間停止を含む）に関わらず、
  // 現実の経過時間（Date.now()）で行う。平均30秒に1件、指数分布で大きくばらつかせ、連続発生もあり得るようにする
  const nowReal = Date.now();
  const realDtMs = fixedEnemyLastRealMs !== null ? Math.max(0, nowReal - fixedEnemyLastRealMs) : 0;
  fixedEnemyLastRealMs = nowReal;
  if (!setupStep && !startScreen && !gameOver && !gameClear) {
    fixedEnemySpawnTimerMs -= realDtMs;
    let spawnGuard = 0; // 万一の無限ループを避ける安全弁
    const currentFixedEnemyMax = getFixedEnemyMaxConcurrent();
    while (fixedEnemySpawnTimerMs <= 0 && fixedEnemies.length < currentFixedEnemyMax && spawnGuard < currentFixedEnemyMax) {
      spawnFixedEnemy();
      fixedEnemySpawnTimerMs += getRandomFixedEnemySpawnIntervalMs();
      spawnGuard++;
    }
  }

  for (const fx of fixedEnemies) {
    fx.ageMs += dtMs;
    fx.timerMs -= dtMs;
    if (fx.timerMs <= 0) {
      performFixedEnemyAttack(fx);
    }
    updateFixedEnemyDecoy(fx, dt);
  }
}

// --- 昼食：12時に順番付きで出現する食べ物 ---
const lunchWarningHour = 11;
const lunchHour = 12;
const lunchFoodCount = 4;
const lunchSpawnIntervalMs = 550;
const lunchExpirationHour = 15;
const lunchExpirationDurationMs = 1800;
const lunchFoodRadius = 20;
const lunchFoodIcons = ['🍙', '🥪', '🍎', '🥗', '🍜', '🍌', '🍱', '🥛'];
const lunchIncompleteLifespanPenalty = 5;
const lunchPartnerShareRatio = 0.3; // 昼食の回復効果のうち同僚にも分け与える割合
let lunchState = null;

function startLunchEvent() {
  const choices = [...lunchFoodIcons].sort(() => Math.random() - 0.5).slice(0, lunchFoodCount);
  lunchState = {
    sequence: choices,
    items: [],
    nextSpawnIndex: 0,
    spawnTimerMs: 0,
    collectedCount: 0,
    orderMistake: false,
    expirationStartedAtMs: null
  };
  showMessage('12時：昼食！ 出た順番どおりに食べよう', 3200, '#ffcc80', '23px sans-serif');
}

function collectLunchItem(itemIndex) {
  if (!lunchState) return;
  const item = lunchState.items[itemIndex];
  if (!item) return;
  if (item.sequenceIndex !== lunchState.collectedCount) lunchState.orderMistake = true;
  lunchState.items.splice(itemIndex, 1);
  lunchState.collectedCount++;

  // 一品ごとの小回復
  san = Math.min(maxSan, san + 2);
  lifespan = Math.min(maxLifespan, lifespan + 0.5);
  fatigue = Math.max(0, fatigue - 3);
  partner.san = Math.min(maxSan, partner.san + 2 * lunchPartnerShareRatio);
  partner.lifespan = Math.min(maxLifespan, partner.lifespan + 0.5 * lunchPartnerShareRatio);
  partner.fatigue = Math.max(0, partner.fatigue - 3 * lunchPartnerShareRatio);

  if (lunchState.collectedCount >= lunchFoodCount) {
    const bonusMultiplier = lunchState.orderMistake ? 0.5 : 1;
    san = Math.min(maxSan, san + 10 * bonusMultiplier);
    lifespan = Math.min(maxLifespan, lifespan + 4 * bonusMultiplier);
    fatigue = Math.max(0, fatigue - 15 * bonusMultiplier);
    partner.san = Math.min(maxSan, partner.san + 10 * bonusMultiplier * lunchPartnerShareRatio);
    partner.lifespan = Math.min(maxLifespan, partner.lifespan + 4 * bonusMultiplier * lunchPartnerShareRatio);
    partner.fatigue = Math.max(0, partner.fatigue - 15 * bonusMultiplier * lunchPartnerShareRatio);
    showMessage(
      lunchState.orderMistake ? '昼食完了。' : '昼食を順番どおり完食！ フルボーナス',
      3000,
      lunchState.orderMistake ? '#ffb74d' : '#69f0ae',
      '22px sans-serif'
    );
    lunchState = null;
  }
}

function beginLunchExpiration() {
  if (!lunchState || lunchState.expirationStartedAtMs !== null) return;
  lunchState.expirationStartedAtMs = gameClockMs;
  showMessage('15時：昼食がまもなく片付けられます', 1800, '#ffab91', '21px sans-serif');
}

function finishLunchAtDayEnd() {
  if (!lunchState) return;
  if (lunchState.collectedCount <= lunchFoodCount / 2) {
    lifespan = Math.max(0, lifespan - lunchIncompleteLifespanPenalty);
    showMessage(`ちゃんと食事を取れなかった… 寿命 -${lunchIncompleteLifespanPenalty}`, 3500, '#ef9a9a', '22px sans-serif');
    checkVitalsGameOver();
  }
  lunchState = null;
}

// --- クイズ：平日の10時・15時に抽選し、週2回まで発生 ---
const quizHours = [10, 15];
const quizChancePerOpportunity = 0.3; // 従来比150%
const maxWeeklyQuizCount = 2;
const quizAnswerLockDurationMs = 1500; // 出現直後に誤って踏んで回答してしまわないための猶予時間
const quizTimeLimitMs = 20000; // 出現から回答しないまま消えるまでの実時間（3倍加速の影響を受けない。従来の倍にしてある）
let weeklyQuizCount = 0;
let quizState = null;
let quizAnswerUnlockAt = 0; // この時刻（Date.now()基準）を過ぎるまで選択肢に触れても回答にならない
let quizExpireAt = 0; // この時刻（Date.now()基準）を過ぎたら、未回答のままクイズを消す
const quizQuestions = [
  { category: 'it', text: 'CPUの役割として最も適切なものはどれか。',
    choices: ['演算処理や各装置の制御を行う', 'データを長期間保存する', 'プリンタへ印刷する'], correct: 0 },
  { category: 'it', text: 'RAMの特徴として最も適切なものはどれか。',
    choices: ['電源を切っても内容を保持する', '電源を切ると内容が消える', 'データを圧縮して保存する'], correct: 1 },
  { category: 'it', text: 'OSの役割として最も適切なものはどれか。',
    choices: ['Webページを表示する', 'ハードウェアやソフトウェアを管理する', 'データベースを作成する'], correct: 1 },
  { category: 'it', text: 'SSDの特徴として適切なものはどれか。',
    choices: ['磁気ディスクを回転させて記録する', '光ディスクに記録する装置である', '半導体メモリを利用して記録する'], correct: 2 },
  { category: 'it', text: 'LANの説明として適切なものはどれか。',
    choices: ['世界中を結ぶ通信網である', '限られた範囲で利用する通信網である', '人工衛星だけを利用する通信網である'], correct: 1 },
  { category: 'it', text: 'IPアドレスの役割として適切なものはどれか。',
    choices: ['ネットワーク上の機器を識別する', '利用者の権限を管理する', 'データを暗号化する'], correct: 0 },
  { category: 'it', text: 'SQLの用途として最も適切なものはどれか。',
    choices: ['データベースを検索・更新する', 'Webページを装飾する', 'ネットワークを監視する'], correct: 0 },
  { category: 'it', text: 'データベースの主な目的はどれか。',
    choices: ['データを効率よく管理する', 'CPUの性能を向上させる', '通信速度を高速化する'], correct: 0 },
  { category: 'it', text: 'ファイアウォールの役割として適切なものはどれか。',
    choices: ['保存データを自動で圧縮する', '不正な通信を制御する', 'ウイルスを自動で削除する'], correct: 1 },
  { category: 'it', text: 'ウイルス対策ソフトの役割はどれか。',
    choices: ['コンピュータウイルスを検出・駆除する', '通信を暗号化する', '利用者認証を管理する'], correct: 0 },
  { category: 'it', text: 'フィッシング詐欺の説明として適切なものはどれか。',
    choices: ['通信を大量に送りサービスを停止させる', '偽サイトで認証情報を盗む', 'ファイルを暗号化し身代金を要求する'], correct: 1 },
  { category: 'it', text: 'ランサムウェアの特徴として適切なものはどれか。',
    choices: ['不正アクセスを監視するソフトである', 'ファイルを暗号化し金銭を要求する', '通信を高速化するソフトである'], correct: 1 },
  { category: 'it', text: 'バックアップを行う目的として適切なのはどれか。',
    choices: ['障害時にデータを復元するため', 'CPUの処理速度を向上させるため', 'ネットワーク負荷を軽減するため'], correct: 0 },
  { category: 'it', text: '機密性を表す内容として適切なものはどれか。',
    choices: ['情報が改ざんされていないこと', '必要なとき利用できること', '許可された人だけが利用できること'], correct: 2 },
  { category: 'it', text: '完全性を表す内容として適切なものはどれか。',
    choices: ['情報が正確で改ざんされていないこと', '必要なとき利用できること', '誰でも閲覧できること'], correct: 0 },
  { category: 'it', text: '可用性を表す内容として適切なものはどれか。',
    choices: ['情報を暗号化していること', '必要なとき利用できること', '利用者を限定していること'], correct: 1 },
  { category: 'it', text: 'IoTの説明として最も適切なものはどれか。',
    choices: ['様々な機器をネットワークへ接続する', '人工知能だけで業務を行う', '仮想化技術のみを利用する'], correct: 0 },
  { category: 'it', text: 'AIの活用例として適切なものはどれか。',
    choices: ['HDDの容量を増やす', '画像から人物を識別する', '通信ケーブルを接続する'], correct: 1 },
  { category: 'it', text: 'クラウドサービスの特徴として適切なのはどれか。',
    choices: ['必ず自社運用より安価になる', 'インターネットなしでも利用できる', '必要に応じて利用資源を増減しやすい'], correct: 2 },
  { category: 'it', text: 'SaaSの説明として適切なものはどれか。',
    choices: ['ソフトウェアをサービスとして利用する形態', 'サーバだけを提供する形態', 'ネットワーク機器を貸し出す形態'], correct: 0 },
  { category: 'it', text: 'PDCAの「C」が表す内容はどれか。',
    choices: ['実行する', '評価・確認する', '改善する'], correct: 1 },
  { category: 'it', text: 'プロジェクト管理で重要な要素はどれか。',
    choices: ['気温を管理すること', '画面の明るさを管理すること', '納期や進捗を管理すること'], correct: 2 },
  { category: 'it', text: '著作権法で保護される対象はどれか。',
    choices: ['数学の定理', '自作したプログラム', '元素記号'], correct: 1 },
  { category: 'it', text: '個人情報に該当するものはどれか。',
    choices: ['氏名と生年月日の組合せ', '商品の価格一覧', '今日の最高気温'], correct: 0 },
  { category: 'it', text: 'DXの目的として適切なものはどれか。',
    choices: ['紙の書類を増やすこと', '業務をデジタル技術で変革すること', 'コンピュータを大型化すること'], correct: 1 },
  { category: 'it', text: 'QRコードの特徴として適切なものはどれか。',
    choices: ['一次元バーコードの一種である', '数値しか記録できない', '二次元コードで多くの情報を格納できる'], correct: 2 },
  { category: 'it', text: 'ブラウザの役割として適切なものはどれか。',
    choices: ['Webページを閲覧するためのソフトウェア', 'データベースを管理するソフトウェア', 'ウイルスを駆除するソフトウェア'], correct: 0 },
  { category: 'it', text: 'VPNを利用する主な目的はどれか。',
    choices: ['安全な通信経路を確保する', 'CPU性能を向上させる', 'ディスク容量を増やす'], correct: 0 },
  { category: 'it', text: 'ルータの役割として適切なものはどれか。',
    choices: ['文書を印刷する', '異なるネットワーク同士を接続する', 'データを圧縮する'], correct: 1 },
  { category: 'it', text: 'HTMLの主な用途として適切なものはどれか。',
    choices: ['データベースを操作する', '表計算を行う', 'Webページの構造を記述する'], correct: 2 }
];

function startQuizEvent() {
  if (quizState || weeklyQuizCount >= maxWeeklyQuizCount) return;
  const source = quizQuestions[Math.floor(Math.random() * quizQuestions.length)];
  // 正解位置が固定化しないよう選択肢を並べ替える
  // （sort(() => Math.random() - 0.5)は要素数が少ないと偏りが出やすいため、Fisher-YatesのshuffleArrayを使う）
  const shuffled = shuffleArray(
    source.choices.map((text, index) => ({ text, correct: index === source.correct }))
  );
  quizState = {
    category: source.category,
    text: source.text,
    choices: shuffled.map(choice => choice.text),
    correctIndex: shuffled.findIndex(choice => choice.correct)
  };
  weeklyQuizCount++;
  quizAnswerUnlockAt = Date.now() + quizAnswerLockDurationMs;
  quizExpireAt = Date.now() + quizTimeLimitMs;
  showMessage('突発クイズ！ ①②③のボタンをタップして回答', 2800, '#90caf9', '22px sans-serif');
}

function answerQuiz(answerIndex) {
  if (!quizState) return;
  if (Date.now() < quizAnswerUnlockAt) return;
  const correct = answerIndex === quizState.correctIndex;
  if (correct) {
    if (partner.active) {
      adjustPartnerRelationship(5);
      showMessage('クイズ正解！ IT知識が増加し、同僚の好感度が上がりました', 2200, '#69f0ae', '22px sans-serif');
      showRandomPartnerSpeechBubbleIfFriendly(partnerQuizCorrectLines, '#69f0ae', partnerQuizCorrectStressedLines);
    } else {
      showMessage('ITの知識が身に付いた！', 2200, '#69f0ae', '22px sans-serif');
    }
  } else {
    adjustPartnerRelationship(-1);
    showMessage('クイズ不正解…', 2200, '#ef9a9a', '22px sans-serif');
    if (partner.active) showRandomPartnerSpeechBubble(partnerQuizWrongLines, '#ffb74d', partnerQuizWrongStressedLines);
  }
  quizState = null;
}

function processTimedHourEvents(previousHour, newHour) {
  const lastEventHour = Math.min(newHour, dayEndHour);
  for (let hour = previousHour + 1; hour <= lastEventHour; hour++) {
    if (hour === lunchWarningHour) {
      showMessage('もうすぐ12時。', 3000, '#ffe082', '21px sans-serif');
    }
    if (hour === lunchHour) startLunchEvent();
    if (hour === lunchExpirationHour) beginLunchExpiration();
    if (hour === scheduledReportHour) spawnScheduledReport();
    // DAY7ごとの18時に「大規模プロジェクト」（中ボス）が発生する
    if (hour === dayEndHour && dayNumber % 7 === 0 && !midBossEvent) startMidBossEvent();
    const weekday = currentDate.getDay();
    const isWeekday = weekday >= 1 && weekday <= 5 && !isHoliday(currentDate);
    // ボス系の敵（ラスボス・「大規模プロジェクト」）との戦闘中はクイズを出さない
    if (isWeekday && quizHours.includes(hour) && weeklyQuizCount < maxWeeklyQuizCount && !quizState &&
        !bossEvent && !midBossEvent && Math.random() < quizChancePerOpportunity) {
      startQuizEvent();
    }
  }
}

function resolveTimedSystemsAtDayEnd() {
  failScheduledReport();
  finishLunchAtDayEnd();
  quizState = null;
  clearFixedEnemiesAtDayEnd();
  // 「残業しますか？」の確認は、次の日にまた最初から問い直す
  fixedEnemyOvertimeChoiceActive = false;
  fixedEnemyOvertimeConfirmed = false;
}

// endWorkdayは複数の経路（終業時刻の通常判定・定時報告解決・大規模プロジェクト撃破・
// 固定敵の残業確認など）から呼ばれ得るため、同じ日について二重に実行されないよう防ぐ
let lastEndWorkdayForDay = -1;

// 一日の終了処理（終業時刻・残業の限界時刻・定時報告を残業中に片付けた場合のいずれからも呼ばれる）
function endWorkday() {
  if (lastEndWorkdayForDay === dayNumber) return;
  lastEndWorkdayForDay = dayNumber;
  resolveTimedSystemsAtDayEnd();
  if (gameOver || deathSequence) return;
  // 一日の終わりに、同僚との関係性が少し回復する
  if (partner.active) adjustPartnerRelationship(partnerRelationshipDailyRecovery);
  // ランクはScoreに応じて毎フレーム自動更新されるため、ここでの判定は不要
  if (isLastDayOfMonth(currentDate)) {
    gameClear = true;
    endingType = getNormalEndingByRelationship();
    sendScore(score);
    return;
  }
  // アドベンチャーパートは週末ではなく、実際に一日を戦い切った日数（カフェイン摂取で倒れてスキップした
  // 日は含まない）が一定数に達するたびに、その日の終業時に発生する
  daysFoughtSinceLastAdventure++;
  if (daysFoughtSinceLastAdventure >= adventurePartDayInterval) {
    daysFoughtSinceLastAdventure = 0;
    adventureCheckpointCount++;

    if (!hasEverReachedNormalEnd()) {
      // 一度もノーマルエンドを経ていない場合：アドベンチャーパート（会話）は一切発生させず、
      // 第3回目に相当するタイミングでイベント戦（ノーマルルート負けイベント戦闘）に直行する。
      // ここでの関係性がそのまま「前回プレイの関係性」として次の周回に引き継がれ、
      // 次の周回からは通常どおりアドベンチャーパートに入り、夢ルートへ入れる可能性も生まれる
      if (partner.active && adventureCheckpointCount >= adventureCheckpointCountForAdv3) {
        startNormalEndBattleSequence();
        return;
      }
      if (!partner.active && adventureCheckpointCount >= adventureCheckpointCountForAdv3) {
        gameOver = true;
        endingType = 'bad-lonely';
        sendScore(score);
        return;
      }
      // まだ規定回数に達していなければ、アドベンチャーパートを挟まずそのまま翌日へ進む
    } else if (partner.active) {
      // アドベンチャーパートに入る前に、一度画面を暗転させ、これまでの統計情報を確認してから切り替える
      startSetupFadeOut(() => {
        showAdventureStatsSummary(() => {
          startPartnerAdventure(() => {
            if (adventureRunCount === 3 && dreamRouteCompleted) {
              // 夢ルートを完走した場合：翌日の通常業務には入らず、「24:00」を経て特別なラスボス戦へ直行する
              startDreamBossIntroSequence();
            } else if (adventureRunCount === 3 && !dreamRouteCompleted) {
              startNormalEndBattleSequence();
            } else {
              startDayTransition(autoAdvanceDay);
            }
          });
        });
      });
      return;
    } else {
      // 同僚がいない（未選択・離脱済み）場合は、アドベンチャーパートを挟まずそのまま翌日へ進む。
      // ただし、第3回目のアドベンチャーパートに入るべきタイミングを同僚不在のまま迎えた場合は、孤独ENDへ至る
      if (adventureCheckpointCount >= adventureCheckpointCountForAdv3) {
        gameOver = true;
        endingType = 'bad-lonely';
        sendScore(score);
        return;
      }
    }
  }
  // 週の最終稼働日なら週次ノルマを判定し、それ以外は自動的に翌日へ進む
  if (isWeekEndDay(currentDate)) {
    resolveWeekEnd();
  } else {
    startDayTransition(autoAdvanceDay);
  }
}
// ===== SAN（精神力）システム =====
// 「DreamCatcher」を購入していると、SAN上限は25に固定される（ラスボスに遭遇しやすくするため）
let maxSan = dreamMemorySave.upgrades.dreamCatcher >= 1 ? 25 : 100;
let san = maxSan;

// SANが減少する量
const stunSanPenalty = 8;
const stunLifespanPenaltyMin = 2;
const stunLifespanPenaltyMax = 3;
const stunReleaseSanRecovery = 6; // stunが解けた瞬間に少し回復するSAN（その代わり寿命を消費する）
const stunReleaseLifespanCost = 2;
const contactSanMultiplier = 3; // 接触時のSAN減少量 = 敵の種類 × この倍率
const playerFriendlyFireSanDamage = 2; // 同僚弾を自分が受けた際のダメージ
const playerFriendlyFireLifespanDamage = 2;
const partnerFriendlyFireSanDamage = 5; // 自分の弾を同僚が受けた際のダメージ
const partnerFriendlyFireLifespanDamage = 2;
const friendlyFireInvincibleDuration = 900;
let friendlyFireInvincibleTimer = 0;

// ===== 寿命（健康）システム =====
// SANダメージの蓄積や、脳疲労・SANの悪い状態が長く続くことで少しずつ削れていく。
// 0になったらSANとは別にゲームオーバーになる（＝一時的にSANを回復させても、慢性的な消耗の蓄積だけは元に戻らない）
let maxLifespan = 100;
let lifespan = maxLifespan;
const sanDamageToLifespanRatio = 0.15; // SANダメージを受けるたびに、その15%ぶん寿命も削れる
const highFatigueThresholdRatio = 0.8; // 脳疲労がこの割合を超えている状態を「高疲労」とみなす
const highFatigueGraceMs = 4000; // 高疲労がこの時間続くまでは寿命が減らない
const highFatigueLifespanPerSec = 1.5; // 猶予後、1秒あたりに減る寿命
const lowSanThresholdRatio = 0.2; // SANがこの割合を下回っている状態を「危険域」とみなす
const lowSanGraceMs = 4000; // 危険域がこの時間続くまでは寿命が減らない
const lowSanLifespanPerSec = 1.5;
let highFatigueTimerMs = 0; // 高疲労状態が続いている時間
let lowSanTimerMs = 0; // 低SAN状態が続いている時間

// SANへダメージを与える共通処理。寿命への影響とゲームオーバー判定もまとめて行う
function damageSan(amount) {
  if (amount <= 0 || gameOver) return;
  san = Math.max(0, san - amount);
  lifespan = Math.max(0, lifespan - amount * sanDamageToLifespanRatio);
  checkVitalsGameOver();
}

// SANが低い間、画面全体にかける歪みの強さ（文字が読める程度に抑える）
const sanDistortionThreshold = 30;
const sanLowDistortionAmplitude = 2;

// ===== 力尽きた瞬間の演出（BADENDへ移る前の一時停止） =====
// イベント戦で同僚が力尽きる時（freeze→shake→partnerVanish→fadeOut）と同じ流れを、自機にも適用する。
// 通常のゲーム画面（背景・敵・同僚など）を静止させたまま表示し、専用の姿（SAN切れ／寿命切れ）に切り替わって
// 点滅しながら消えていき、その後画面全体が黒くフェードアウトしてからBADENDへ進む
let deathSequence = null; // null、または { visualType, phase, phaseTimerMs, deathEndingType }
const deathSequenceFreezeDurationMs = 900; // 力尽きた瞬間、まず短く静止する時間
const deathSequenceShakeDurationMs = 2200; // 振動・明滅しながら画面が暗くなっていく時間
const deathSequenceVanishDurationMs = 1800; // 専用の姿に切り替わり、点滅しながら消えきるまでの時間
const deathSequenceVanishBlinkIntervalMs = 150; // 点滅の間隔
const deathSequenceFadeOutDurationMs = 1200; // 完全に消えた後、画面全体が黒くフェードアウトしきるまでの時間

function startDeathSequence(visualType, deathEndingType) {
  if (gameOver || deathSequence) return;
  deathSequence = { visualType, phase: 'freeze', phaseTimerMs: 0, deathEndingType };
}

// SAN・寿命のいずれかが尽きたら演出を経てゲームオーバーにする（二重発火防止にgameOver/deathSequenceで一度だけ発火）
// どちらが尽きたかで演出とバッドエンドの種類を分ける
function checkVitalsGameOver(deathEndingType = null) {
  if (gameOver || deathSequence || playerReviveTimerMs > 0) return;
  // ノーマルルート終了時の負けイベント戦闘・同僚消滅演出中：自機は何度でもSAN1・寿命1で復活する。
  // このシーケンス自体のタイマーで同僚消滅→フェードアウトへ進むため、自機の生死では進行しない
  if (normalEndSequence && (normalEndSequence.phase === 'battle' ||
      normalEndSequence.phase === 'partnerLossSlowmo' || normalEndSequence.phase === 'partnerVanish')) {
    san = Math.max(san, 1);
    lifespan = Math.max(lifespan, 1);
    return;
  }
  // 「無敵（テスト用）」「β版設定」：SAN・寿命が0にならないようにする
  if (isTestInvincibleUpgradeActive()) {
    san = Math.max(san, 1);
    lifespan = Math.max(lifespan, 1);
    return;
  }
  if (san <= 0) {
    // 「希望（自分）」：SANが0にならなくなる
    if (dreamMemorySave.upgrades.hopePlayer >= 1) {
      san = 1;
      return;
    }
    // 残機システム：残機がある間は、力尽きる代わりに気絶して復活を待つ
    if (playerLivesRemaining > 0) {
      playerLivesRemaining--;
      startPlayerRevival();
      return;
    }
    startDeathSequence('san', deathEndingType || 'bad-san');
  } else if (lifespan <= 0) {
    // 「永遠の命（自分）」：寿命が0にならなくなる
    if (dreamMemorySave.upgrades.eternalLifePlayer >= 1) {
      lifespan = 1;
      return;
    }
    // 残機システム：残機がある間は、力尽きる代わりに気絶して復活を待つ
    if (playerLivesRemaining > 0) {
      playerLivesRemaining--;
      startPlayerRevival();
      return;
    }
    startDeathSequence('lifespan', deathEndingType || 'bad-lifespan');
  }
}

// 残機システム：気絶状態を開始する（移動・攻撃不可、点滅・頭上に星が舞う演出）。
// reviveStunDurationMs後、自動的に復活してSAN・寿命がそれぞれ最大値の50%に戻り、その後しばらく無敵になる
function startPlayerRevival() {
  playerReviveTimerMs = reviveStunDurationMs;
}

// ===== 「自己犠牲」「献身」：夢の記憶ポイントで習得する、戦闘中に発動できる特殊行動 =====
// どちらも1周回につき1回だけ使用でき、beginGameplayで新しい周回のたびにリセットされる
let selfSacrificeUsedThisRun = false;
let devotionUsedThisRun = false;

// 「自己犠牲」：自分の寿命が半分になる代わりに、同僚の寿命が100まで回復する
function useSelfSacrificeSkill() {
  if (selfSacrificeUsedThisRun || dreamMemorySave.upgrades.selfSacrifice < 1 || !partner.active) return;
  selfSacrificeUsedThisRun = true;
  lifespan = Math.max(0, Math.floor(lifespan / 2));
  partner.lifespan = Math.min(maxLifespan, 100);
  showMessage('「自己犠牲」発動！ 自分の寿命が半分に、同僚の寿命が回復した', 3000, '#ef9a9a', '22px sans-serif');
  checkVitalsGameOver();
}

// 「献身」：自分のSANが半分になる代わりに、同僚のSANが100まで回復する
function useDevotionSkill() {
  if (devotionUsedThisRun || dreamMemorySave.upgrades.devotion < 1 || !partner.active) return;
  devotionUsedThisRun = true;
  san = Math.max(0, Math.floor(san / 2));
  partner.san = Math.min(maxSan, 100);
  showMessage('「献身」発動！ 自分のSANが半分に、同僚のSANが回復した', 3000, '#90caf9', '22px sans-serif');
  checkVitalsGameOver();
}

// ===== 自機の性別選択（imagesフォルダの画像を使用） =====
// ここで選んだ画像を、そのまま自機のアイコンとしても使用する
const genderChoices = [
  { id: 'male', label: '男性', src: 'images/self/icon_01.png' },
  { id: 'female', label: '女性', src: 'images/self/icon_02.png' }
];
const genderImageElements = {};
genderChoices.forEach(choice => {
  const img = new Image();
  img.src = choice.src;
  genderImageElements[choice.id] = img;
});
let selectedGender = null;
let selectedPlayerIcon = null; // 性別選択で選んだ画像（genderChoicesのid）をそのまま自機アイコンとして使う

// ===== 同僚のアイコン選択（imagesフォルダの画像を使用） =====
const partnerIconChoices = [
  'char_07', 'char_06', 'char_08', 'char_09', 'char_10', 'char_12'
];
const partnerIconImageElements = {};
partnerIconChoices.forEach(id => {
  const img = new Image();
  img.src = `images/partner/${id}.png`;
  partnerIconImageElements[id] = img;
});
let selectedPartnerIcon = partnerIconChoices[0]; // nullの場合は「同僚なし」

// 同僚アイコンごとの性別（一人称・三人称の言い回しの出し分けに使う）
const partnerGenderById = {
  char_07: 'male', char_06: 'female', char_08: 'male',
  char_09: 'female', char_10: 'male', char_12: 'female'
};

// ===== 前回と同じ自機・同僚で始めた時の再会シーン =====
// 前回の周回の信頼関係（と、その終わり方）に応じて、DAY1が始まる前に短い会話を挟む
// 前世（前回の周回）での好感度に応じて、あいさつの後に見せる一言と地の文を変える。
// 好感度「良好」＝tier 1・2、「普通」＝tier 3、「悪い」＝tier 4・5 として文面を共有する
// （tier自体はアイコン演出の輝き／暗転の強さの区分としては引き続き5段階のまま使う）
// 配置換え当日、あいさつの前に共通で挟む地の文（主人公だけが前回の記憶を持っている、という導入）
const reunionSceneIntroLines = [
  '？？？は配置換えで、新しい部署に来た。',
  '紹介された隣席の同僚は、初対面のはずだった。',
  'けれど？？？だけは覚えている。',
  'この同僚と同じオフィスで働き、最後に窓の外から迫る黒い影に襲われたことを。',
  '同僚が倒れ、自分も抵抗むなしく床に崩れたことを。',
  '同僚は何も覚えていない。',
  'だから？？？は、ただ静かに名刺を差し出す。'
];
// 各段階の「line」は、地の文（reunionSceneIntroLines）を全て表示し終えた後に見せる自機のセリフ。
// 「paragraph」は、そのセリフの後に続けて1行ずつ表示する締めの地の文（tierごとに内容が異なる）
const reunionSceneTiers = {
  1: { // とても良い関係（関係性80〜100）＝前世での好感度：良好
    line: '「はじめまして」',
    paragraph: [
      '口にした瞬間、胸が痛んだ。',
      '同僚をまた失う未来だけは、もう繰り返したくない。'
    ]
  },
  2: { // 良い関係（関係性60〜79）＝前世での好感度：良好
    line: '「はじめまして」',
    paragraph: [
      '口にした瞬間、胸が痛んだ。',
      '同僚をまた失う未来だけは、もう繰り返したくない。'
    ]
  },
  3: { // 普通の関係（関係性40〜59）＝前世での好感度：普通
    line: '「はじめまして」',
    paragraph: [
      'と笑った。けれど{player}は知っている。',
      '同僚と{player}は、あの黒い夜を共有している。'
    ]
  },
  4: { // 悪い関係（関係性0〜39）＝前世での好感度：悪い
    line: '「はじめまして」',
    paragraph: [
      'と言う声が少し濁った。',
      '最後までわかり合えなかった君と、また隣になるなんて。'
    ]
  },
  5: { // とても悪い関係（関係性20以下、かつ前回同僚の攻撃でENDになった場合）＝前世での好感度：悪い
    line: '「はじめまして」',
    paragraph: [
      'と言う声が少し濁った。',
      '最後までわかり合えなかった同僚と、また隣になるなんて。'
    ]
  }
};

function getPlayerPronoun(gender) {
  return gender === 'female' ? '私' : '僕';
}
function getPartnerPronoun(partnerIcon) {
  return partnerGenderById[partnerIcon] === 'female' ? '彼女' : '彼';
}
function fillReunionTemplate(text, playerPronoun, partnerPronoun) {
  return text.split('{player}').join(playerPronoun).split('{partner}').join(partnerPronoun);
}

// 前回の信頼関係・終わり方から、再会シーンの段階（1〜5）を決める
function getReunionSceneTier(lastRun) {
  if (lastRun.relationship <= 20 && lastRun.endingType === 'bad-partner-shot') return 5;
  if (lastRun.relationship >= 80) return 1;
  if (lastRun.relationship >= 60) return 2;
  if (lastRun.relationship >= 40) return 3;
  return 4;
}

// 段階ごとに、同僚アイコンの演出方向（輝く／変化なし／暗く沈む）と強さを決める
const reunionSceneToneByTier = {
  1: { direction: 'bright', intensity: 1 },
  2: { direction: 'bright', intensity: 0.55 },
  3: { direction: 'none', intensity: 0 },
  4: { direction: 'dark', intensity: 0.6 },
  5: { direction: 'dark', intensity: 1 }
};

// 前回、第3回アドベンチャーパートを経てノーマルエンドに至っており、かつ前回と全く同じ
// 自機・同僚の組み合わせで始めた場合だけ、再会シーンを表示する
function shouldShowReunionScene() {
  const lastRun = dreamMemorySave.lastRun;
  return !!(lastRun && lastRun.viaAdv3NormalEnd && lastRun.partnerIcon && selectedPartnerIcon &&
    lastRun.playerGender === selectedGender && lastRun.partnerIcon === selectedPartnerIcon);
}

let reunionSceneActive = false;
// 'dim'（同僚アイコンが関係性に応じて輝く／暗く沈む演出）→ 'intro'（地の文を1行ずつ表示）
// → 'line'（自機のセリフ）→ 'paragraph'（締めの地の文を1行ずつ表示）の順に進む
let reunionScenePhase = null;
const reunionSceneDimDurationMs = 2000; // アイコンの演出（輝き／暗転）がかかりきるまでの時間
let reunionSceneDimTimer = 0;
let reunionSceneToneDirection = 'none'; // 'bright' / 'none' / 'dark'
let reunionSceneToneIntensity = 0;
let reunionSceneTierLine = ''; // tierごとの自機のセリフ（'line'フェーズで表示）
let reunionSceneTierParagraph = []; // tierごとの締めの地の文（'paragraph'フェーズで1行ずつ表示）
let reunionSceneIntroIndex = 0; // 'intro'フェーズ中、reunionSceneIntroLinesの何行目を表示しているか
let reunionSceneParagraphIndex = 0; // 'paragraph'フェーズ中、reunionSceneTierParagraphの何行目を表示しているか
// 現在画面に表示している1行分のテキストと、その何文字目まで表示し終えたか（タイプライター演出）
let reunionSceneCurrentText = '';
let reunionSceneCurrentRevealedCount = 0;
let reunionSceneCurrentTypeTimerMs = 0;
let reunionSceneOnComplete = null;

// 自機が女性の場合、セリフの語尾を「だよな」→「だよね」「だな」→「だね」に和らげる
function applyFemaleLineTone(text, gender) {
  if (gender !== 'female') return text;
  return text.replace(/だよな/g, 'だよね').replace(/だな/g, 'だね');
}

// 'intro'/'line'/'paragraph'フェーズで、次に表示する1行を画面にセットし、タイプライター表示をやり直す
function setReunionSceneCurrentLine(text) {
  reunionSceneCurrentText = text;
  reunionSceneCurrentRevealedCount = 0;
  reunionSceneCurrentTypeTimerMs = 0;
}

function openReunionScene(onComplete) {
  const tier = getReunionSceneTier(dreamMemorySave.lastRun);
  const data = reunionSceneTiers[tier];
  const tone = reunionSceneToneByTier[tier];
  reunionSceneToneDirection = tone.direction;
  reunionSceneToneIntensity = tone.intensity;
  const playerPronoun = getPlayerPronoun(selectedGender);
  const partnerPronoun = getPartnerPronoun(selectedPartnerIcon);
  reunionSceneTierLine = applyFemaleLineTone(
    fillReunionTemplate(data.line, playerPronoun, partnerPronoun),
    selectedGender
  );
  reunionSceneTierParagraph = data.paragraph.map(t => fillReunionTemplate(t, playerPronoun, partnerPronoun));
  reunionSceneIntroIndex = 0;
  reunionSceneParagraphIndex = 0;
  setReunionSceneCurrentLine('');
  reunionSceneActive = true;
  reunionScenePhase = 'dim';
  reunionSceneDimTimer = reunionSceneDimDurationMs;
  reunionSceneOnComplete = onComplete;
}

// 暗転中はクリックを無視する。タイプ中なら先に全文表示するだけにとどめ、
// 表示しきっている時だけ次の行（intro→line→paragraphの順）へ進める
function advanceReunionScene() {
  if (reunionScenePhase === 'dim') return;
  if (reunionSceneCurrentRevealedCount < reunionSceneCurrentText.length) {
    reunionSceneCurrentRevealedCount = reunionSceneCurrentText.length;
    return;
  }
  if (reunionScenePhase === 'intro') {
    reunionSceneIntroIndex++;
    if (reunionSceneIntroIndex < reunionSceneIntroLines.length) {
      setReunionSceneCurrentLine(reunionSceneIntroLines[reunionSceneIntroIndex]);
    } else {
      reunionScenePhase = 'line';
      setReunionSceneCurrentLine(reunionSceneTierLine);
    }
    return;
  }
  if (reunionScenePhase === 'line') {
    reunionScenePhase = 'paragraph';
    reunionSceneParagraphIndex = 0;
    setReunionSceneCurrentLine(reunionSceneTierParagraph[0] || '');
    return;
  }
  if (reunionScenePhase === 'paragraph') {
    reunionSceneParagraphIndex++;
    if (reunionSceneParagraphIndex < reunionSceneTierParagraph.length) {
      setReunionSceneCurrentLine(reunionSceneTierParagraph[reunionSceneParagraphIndex]);
      return;
    }
    closeReunionScene();
  }
}

function closeReunionScene() {
  reunionSceneActive = false;
  reunionScenePhase = null;
  const onComplete = reunionSceneOnComplete;
  reunionSceneOnComplete = null;
  if (onComplete) onComplete();
}

// 同僚選択後のひとことメッセージが終わったら、再会シーンを挟むかどうかを判定してから実際にゲームを始める
function startGameAfterGreeting() {
  if (shouldShowReunionScene()) {
    openReunionScene(() => beginGameplay());
  } else {
    beginGameplay();
  }
}

// タイトル画面の「夢と同じ設定で進める」：性別・同僚選択画面を省略し、
// 前回と同じ自機・同僚を自動で選んだ状態のまま、同僚の挨拶へ直接つなげる
function startWithLastRunSettings() {
  const lastRun = dreamMemorySave.lastRun;
  if (!lastRun || !lastRun.partnerIcon) return;
  gameTimeScale = threeXModeEnabled ? 3 : 1;
  startScreen = false;
  setupStep = null;
  selectedGender = lastRun.playerGender;
  selectedPlayerIcon = lastRun.playerGender;
  selectedPartnerIcon = lastRun.partnerIcon;
  const greetingLines = partnerGenderById[lastRun.partnerIcon] === 'female'
    ? partnerIconGreetingLinesFemale
    : partnerIconGreetingLinesMale;
  const line = greetingLines[Math.floor(Math.random() * greetingLines.length)];
  startIconGreeting(lastRun.partnerIcon, line, () => { startGameAfterGreeting(); },
    partnerIconImageElements[lastRun.partnerIcon]);
}

// ===== 同僚 =====
const partnerMoveSpeed = 3.2;
const partnerFollowSpeedMultiplier = 0.45;
// 同僚の速度が目標速度へ近づく割合（1フレームあたり）。小さいほど慣性が強く、滑るような動きになる
const partnerVelocitySmoothing = 0.12;
const partnerWanderChance = 0.8;
const partnerChocolateSeekFatigueRatio = 0.6; // 脳疲労がこの割合を超えたら、チョコレートを優先して取りに行く
const partnerFollowOffsetX = -95;
const partnerFollowOffsetY = 65;
const partnerBaseFireRate = 700; // 自律攻撃の間隔（ミリ秒）
const partnerContactSanMultiplier = 3; // 接触時のSANダメージ = 敵の種類 × この倍率（プレイヤーよりやや軽め）
const partnerInvincibleDuration = 1200;
const partnerLossSanPenalty = 20; // 同僚が力尽きたとき、プレイヤーが受けるSANダメージ
const partnerRelationshipMax = 100;
let partnerRelationshipInitial = 50;
const partnerRelationshipSafeFireThreshold = 50;
const partnerRelationshipDamagePerHit = 15;
const partnerRelationshipRetaliationThreshold = 40;
const partnerRelationshipDailyRecovery = 5; // 一日が終了するたびに回復する関係性の量

// 自分の役職ランクに応じて、同僚も強化される（ランクが上がるごとの効果を積み上げていく）
// ランク2: 弾発射速度×1.2、発射間隔×0.8 / ランク3: 移動速度1.5倍、さらに弾発射速度×1.2、発射間隔×0.8 /
// ランク4: 弾発射速度×1.2、発射間隔×0.8 / ランク5: マルチタスクAと同様の攻撃（追加の1発） / ランク6: 弾発射速度×1.5、発射間隔×0.8
function getPartnerRankFireSpeedMultiplier(currentRank) {
  let m = 1;
  if (currentRank >= 2) m *= 1.2;
  if (currentRank >= 3) m *= 1.2;
  if (currentRank >= 4) m *= 1.2;
  if (currentRank >= 6) m *= 1.5;
  return m;
}
function getPartnerRankFireIntervalMultiplier(currentRank) {
  let m = 1;
  if (currentRank >= 2) m *= 0.8;
  if (currentRank >= 3) m *= 0.8;
  if (currentRank >= 4) m *= 0.8;
  if (currentRank >= 6) m *= 0.8;
  return m;
}
function getPartnerRankMoveSpeedMultiplier(currentRank) {
  return currentRank >= 3 ? 1.5 : 1;
}
function isPartnerRankMultiShotActive(currentRank) {
  return currentRank >= 5;
}

// ===== 同僚の吹き出し（一言セリフ） =====
let partnerSpeechBubble = null; // { text, color, timer }
const partnerSpeechBubbleDurationMs = 2600;
function showPartnerSpeechBubble(text, color = '#fff3e0') {
  partnerSpeechBubble = { text, color, timer: partnerSpeechBubbleDurationMs };
}
// 同僚のSANが半分を切っている間は、余裕のない言い回しのレパートリーに差し替える
function isPartnerStressed() {
  return partner.san / maxSan < 0.5;
}
function showRandomPartnerSpeechBubble(lines, color, stressedLines = null) {
  const pool = (stressedLines && isPartnerStressed()) ? stressedLines : lines;
  showPartnerSpeechBubble(pool[Math.floor(Math.random() * pool.length)], color);
}

// 関係性が0〜20（同僚が敵対的になっている状態）の間は、謝罪や好意的な発言は表示しない
function showRandomPartnerSpeechBubbleIfFriendly(lines, color, stressedLines = null) {
  if (partner.relationship <= 20) return;
  showRandomPartnerSpeechBubble(lines, color, stressedLines);
}

// ===== 攻撃をサボっていると同僚の好感度が下がる仕組み =====
const partnerNeglectThresholdMs = 5000; // これだけ攻撃しないと苦言を呈し始める
const partnerNeglectIntervalMs = 2000; // 苦言を呈したあとも、さらにこの間隔で好感度が下がり続ける
const partnerNeglectRelationshipPenalty = 1;
let partnerNeglectTimerMs = 0; // 攻撃せず苦言状態が続いている時間
const partnerNeglectLines = [
  '仕事してください！',
  'ちょっと、手が止まってますよ！',
  'サボらないでくださいよ…！',
  '私だけに任せないでください！',
  'こっちは押されてます、早く！'
];
const partnerNeglectStressedLines = [
  '早くしてください！もう限界です！',
  'いい加減にしてください、本当に！',
  '手伝ってくれないと無理です！',
  '一人じゃもう無理なんです、お願いします！',
  'こっちはもう、余裕ないんです！！'
];

// ===== 全く攻撃せず長時間経過すると、同僚が叱咤しながら自機を攻撃してくる仕組み =====
const partnerScoldAttackThresholdMs = 15000; // これだけ一切攻撃しないと叱咤攻撃が発生する
const partnerScoldAttackIntervalMs = 4000; // 発生後、まだ攻撃していなければこの間隔で繰り返す
let partnerScoldAttackTimerMs = 0;
const partnerScoldAttackLines = [
  'いい加減にしてください！目、覚まさせますよ！',
  'ちゃんと働いてください！これでも喰らえ！',
  'サボってる暇はないんです！しっかりしてください！'
];

// ===== 関係性が0の間、定期的に怒りのコメントを表示する仕組み =====
const partnerRelationshipZeroCommentIntervalMs = 6000;
let partnerRelationshipZeroCommentTimerMs = 0;
const partnerRelationshipZeroLines = [
  'もう許せない！',
  'いなくなって下さい！',
  '近づかないで下さい！！'
];

// ===== 同僚が当てた敵を自機が倒すと、お礼を言ってくれる仕組み =====
const partnerThanksRelationshipChance = 0.3; // お礼と共に好感度が+1する確率
const partnerThanksLines = [
  'ありがとうございます！',
  '助かりました！',
  'ナイスです！',
  'さすがです！',
  '頼りにしてます！'
];
const partnerThanksStressedLines = [
  '……助かりました、本当に',
  'はぁ…なんとかなりましたね',
  'ギリギリでした…ありがとうございます',
  '正直、限界でした…感謝します',
  'よかった…もう駄目かと思いました'
];

// ===== クイズの正解・不正解に対する同僚のコメント =====
// TODO: 将来的には選択した同僚アイコンごとの「性格」設定によって、レパートリーを出し分ける
const partnerQuizWrongLines = [
  'ドンマイです！次いきましょう！',
  'え、そこ間違えちゃいますか…',
  '大丈夫、次は分かりますよ！',
  'ちょっと恥ずかしいですね、それ',
  '練習あるのみです！',
  'まあ、そういう日もあります'
];
const partnerQuizWrongStressedLines = [
  'もう、今はそれどころじゃないです…',
  'それ、今聞かないでください…',
  'ちょっと、集中できてないんです…',
  'すみません、頭が回らなくて…',
  '正直、今は無理です…'
];
const partnerQuizCorrectLines = [
  'さすがです！',
  'やっぱり凄いですね！',
  'まあ、これくらい常識ですよね',
  'よくできました！',
  'その調子です！',
  'いや、それくらい自分でも分かってましたよ'
];
const partnerQuizCorrectStressedLines = [
  'よかった…少しは気が楽になりました',
  'はぁ…なんとか当たりましたね',
  '今は、それだけで救われます…',
  'ほっとしました…'
];
// クイズに答えないまま選択肢が消えた時のコメント（軽くネガティブな反応）
const partnerQuizTimeoutLines = [
  'あれ、答えないんですか…',
  'せっかく出したのに、スルーですか',
  '……無視されました？',
  '時間切れです。もったいないですね',
  'あら、興味なかったですか'
];

// ===== 同僚が自機弾をパリィした時のコメント =====
const partnerParryLines = [
  'パリィ！',
  '効かないよ！',
  '危ないところでした！',
  '今のは弾かせてもらいます！',
  'よっと……セーフです！',
  '油断しないでくださいね！',
  'そんな攻撃、通じません！'
];

// ===== 同僚への誤射・同僚からの誤射に対するコメント =====
const partnerHitByPlayerLines = [
  'いたっ！',
  '何するんですか！',
  'ちょっと、危ないですよ！',
  'もう、狙ってやってません…？',
  '痛いです…気をつけてください！'
];
const partnerHitByPlayerStressedLines = [
  'いい加減にしてください！！',
  '今それどころじゃないんですって！',
  '本当にやめてください…！',
  'もう限界なんです、勘弁してください！'
];
const partnerHitPlayerLines = [
  'ごめんなさい！',
  '邪魔しないでください！',
  '私は悪くないです！',
  'わっ、すみません！',
  '当たるところにいるのが悪いんです！'
];
const partnerHitPlayerStressedLines = [
  'ご、ごめんなさい…余裕なくて…',
  'すみません…！ちゃんと狙えなくて…',
  '今、手元が狂ってて…すみません',
  'ごめんなさい、余裕がないんです…'
];

// ===== 自機がstunしたときの同僚のコメント =====
const partnerStunWorryLines = [
  '大丈夫ですか！？',
  'しっかりしてください…！',
  'ちょっと、寝てる場合じゃないですよ！',
  '無理しないでくださいね…',
  '大丈夫ですか、しんどそうですけど…'
];
const partnerStunWorryStressedLines = [
  'ちょっと、本当にまずいですよ！？',
  'しっかりしてください、お願いします！！',
  'こっちも余裕ないのに…！大丈夫ですか！？',
  '倒れないでください…お願いします！'
];

// ===== SAN・寿命の状態を反映した、同僚のランダムな一言 =====
const partnerStatusCommentIntervalMs = 20000; // これくらいの間隔でコメントするか判定する
const partnerStatusCommentChance = 0.4; // 判定時にコメントする確率
let partnerStatusCommentTimerMs = 0;

const partnerStatusSanLowLines = [
  'かなり疲れた顔してますよ…大丈夫ですか？',
  'メンタル、削れてきてませんか…？',
  '無理しすぎじゃないですか…心配です',
  '顔色悪いですよ、休めるときに休んでくださいね',
  'メンタル、もちますか…？',
  'ちょっと様子がおかしいですよ…'
];
const partnerStatusSanMidLines = [
  'まあまあ調子は良さそうですね',
  '悪くない感じですね、この調子で',
  'ぼちぼち頑張りましょう',
  'まだ余裕はありそうですね',
  '普通にやれてると思いますよ'
];
const partnerStatusSanHighLines = [
  '今日は調子良さそうですね！',
  'メンタル絶好調じゃないですか！',
  'いい顔してますね、その調子です！',
  '余裕そうで何よりです',
  '今なら何でもできそうですね！'
];
const partnerStatusLifespanLowLines = [
  '……最近、根詰めすぎじゃないですか？',
  '体、大丈夫ですか…本当に心配です',
  'そろそろ休んだほうがいいと思います…',
  '無理は禁物ですよ、本当に…',
  'このままだと倒れちゃいますよ…？',
  '少しでいいので、休んでください…'
];
const partnerStatusLifespanMidLines = [
  '無理しすぎない程度に頑張りましょう',
  'ぼちぼち、健康にも気をつけてくださいね',
  'まだ大丈夫そうですけど、油断は禁物ですよ',
  '適度に休憩も挟みましょうね'
];
const partnerStatusLifespanHighLines = [
  '元気そうで安心しました！',
  '体調は良さそうですね！',
  'その元気、見習いたいです',
  '絶好調ですね、羨ましいです！'
];

// SAN・寿命どちらかの状態を反映した一言をランダムに表示する
function triggerPartnerStatusComment() {
  if (!partner.active) return;
  if (Math.random() < 0.5) {
    const ratio = san / maxSan;
    const isPositive = ratio > 0.7;
    const pool = ratio <= 0.3 ? partnerStatusSanLowLines
      : ratio <= 0.7 ? partnerStatusSanMidLines
      : partnerStatusSanHighLines;
    // 好調さを称える発言（Highの発言）だけは、関係性が低い間は表示しない
    if (isPositive) {
      showRandomPartnerSpeechBubbleIfFriendly(pool, '#ce93d8');
    } else {
      showRandomPartnerSpeechBubble(pool, '#ce93d8');
    }
  } else {
    const ratio = lifespan / maxLifespan;
    const isPositive = ratio > 0.7;
    const pool = ratio <= 0.3 ? partnerStatusLifespanLowLines
      : ratio <= 0.7 ? partnerStatusLifespanMidLines
      : partnerStatusLifespanHighLines;
    if (isPositive) {
      showRandomPartnerSpeechBubbleIfFriendly(pool, '#80cbc4');
    } else {
      showRandomPartnerSpeechBubble(pool, '#80cbc4');
    }
  }
}

const partner = {
  active: false, // 「同僚なし」を選んだ場合や、力尽きた後はfalseのまま
  x: 0, y: 0, angle: 0,
  vx: 0, vy: 0, // 慣性のある滑らかな移動のための現在速度
  radius: 13,
  icon: '',
  fatigue: 0,
  san: maxSan,
  lifespan: maxLifespan,
  invincible: false,
  invincibleTimer: 0,
  wandering: false,
  wanderTimer: 0,
  wanderTarget: { x: 0, y: 0 },
  fireTimer: 0,
  highFatigueTimerMs: 0,
  lowSanTimerMs: 0,
  fatigueResting: false, // 脳疲労が100に達し、50まで下がるまで攻撃を控えている状態
  friendlyFireInvincibleTimer: 0,
  barrierCharges: 0, // 「ファイヤーウォール」の効果。残っている間は自機の誤射を防ぐ
  hijackedTimerMs: 0, // セッションハイジャック・内部不正：残っている間は攻撃をやめる
  chocolateDailyCount: 0, // 本日すでに食べたチョコレートの個数。日付が変わるとリセットする
  relationship: partnerRelationshipInitial, // 非表示。0～100で、低いほど自分へ反撃しやすい
  // 賢さ（0〜1、初期はランダム）：高いほど的が正確で、疲労時に無駄撃ちを避けやすい
  intelligence: 0.5,
  // 性格・向こう見ずさ（0〜1、初期はランダム）：高いほど疲労していても構わず撃ちたがる
  recklessness: 0.5,
  reviveTimerMs: 0 // >0の間、気絶して復活を待っている（移動・攻撃できない）
};
// 同僚が離脱した原因（'san' / 'lifespan' / null）。休日に会いに行った時の対応を分けるために使う
let partnerLossReason = null;
let partnerLifespanAtLoss = 0; // 離脱した瞬間の寿命（SANが原因の離脱で復帰する際に使う）
const partnerRevivalChance = 0.5; // SANが原因で離脱した同僚が、休日に会いに行って復帰する確率
const partnerRevivalSan = 50; // 復帰時のSAN
const partnerRevivalLifespanRatio = 0.5; // 復帰時の寿命は、離脱時の寿命のこの割合
const partnerLossGriefSanRatio = 0.5; // 寿命が尽きて離脱した同僚に会いに行った時、自機のSANをこの割合まで減らす

// ゲーム開始時に同僚の状態を初期化する
function initPartner() {
  partner.active = selectedPartnerIcon !== null;
  partner.icon = selectedPartnerIcon || '';
  partner.x = player.x + partnerFollowOffsetX;
  partner.y = player.y + partnerFollowOffsetY;
  partner.angle = 0;
  partner.vx = 0;
  partner.vy = 0;
  partner.fatigue = 0;
  partner.san = maxSan;
  partner.lifespan = maxLifespan;
  partner.invincible = false;
  partner.invincibleTimer = 0;
  partner.wandering = false;
  partner.wanderTimer = 1800 + Math.random() * 2200;
  partner.fireTimer = partnerBaseFireRate;
  partner.highFatigueTimerMs = 0;
  partner.lowSanTimerMs = 0;
  partner.fatigueResting = false;
  partner.friendlyFireInvincibleTimer = 0;
  partner.barrierCharges = 0;
  partner.chocolateDailyCount = 0;
  partner.relationship = partnerRelationshipInitial;
  partner.intelligence = Math.random();
  partner.recklessness = Math.random();
  partner.reviveTimerMs = 0;
}

// 同僚のSANにダメージを与える（プレイヤーのdamageSanとは独立。同僚の生死のみに影響する）
function damagePartnerSan(amount) {
  if (amount <= 0 || !partner.active) return;
  partner.san = Math.max(0, partner.san - amount * specialSkillEffects.partnerSanDamageMultiplier);
}
// 特殊スキル「激励A」「激励B」共通：発動できるのはゲーム内3時間に1回まで
const encourageCooldownHours = 3;
const encourageAFatigueReductionByLevel = { 1: 10, 2: 15, 3: 25 };
const encourageBRecoveryByLevel = { 1: 5, 2: 10, 3: 20 };
let encourageANextAvailableAtMs = 0; // gameClockMs基準。この時刻を過ぎるまで再発動しない
let encourageBNextAvailableAtMs = 0;

// 味方の弾はSANと寿命を直接削る。連続被弾は専用の短い無敵時間で抑える。
// isHostileAction: 叱咤攻撃など、同僚がわざと自機を狙った場合はtrue。
// この場合は謝罪ではなく怒りの発言なので、関係性が低くても常に表示する
function damagePlayerByFriendlyFire(lines = partnerHitPlayerLines, stressedLines = partnerHitPlayerStressedLines, color = '#ffab91', isHostileAction = false) {
  if (friendlyFireInvincibleTimer > 0) return false;
  if (playerBarrierCharges > 0) {
    playerBarrierCharges--;
    friendlyFireInvincibleTimer = friendlyFireInvincibleDuration;
    return false;
  }
  // 特殊スキル「激励A」：同僚からの被弾で脳疲労が減少する（ゲーム内3時間に1回まで）
  const encourageALevel = specialSkillLevels.get('encourage-a') || 0;
  const encourageAReady = encourageALevel > 0 && gameClockMs >= encourageANextAvailableAtMs;
  if (encourageAReady) {
    encourageANextAvailableAtMs = gameClockMs + encourageCooldownHours * hourMs;
    fatigue = Math.max(0, fatigue - encourageAFatigueReductionByLevel[encourageALevel]);
  }
  // Lv3ではさらに、この被弾によるSAN低下がなくなる
  if (!(encourageAReady && encourageALevel >= 3)) {
    san = Math.max(0, san - playerFriendlyFireSanDamage *
      specialSkillEffects.sanDamageMultiplier * specialSkillEffects.friendlyFireDamageMultiplier);
  }
  lifespan = Math.max(0, lifespan - playerFriendlyFireLifespanDamage * specialSkillEffects.friendlyFireDamageMultiplier);
  friendlyFireInvincibleTimer = friendlyFireInvincibleDuration;
  friendlyFireHitFlashTimer = friendlyFireHitEffectDuration;
  explosionShakeTimer = Math.max(explosionShakeTimer, friendlyFireHitEffectDuration);
  checkVitalsGameOver('bad-partner-shot');
  if (isHostileAction) {
    showRandomPartnerSpeechBubble(lines, color, stressedLines);
  } else {
    showRandomPartnerSpeechBubbleIfFriendly(lines, color, stressedLines);
  }
  return true;
}

function damagePartnerByFriendlyFire() {
  if (!partner.active || partner.friendlyFireInvincibleTimer > 0) return false;
  if (partner.barrierCharges > 0) {
    partner.barrierCharges--;
    partner.friendlyFireInvincibleTimer = friendlyFireInvincibleDuration;
    return false;
  }
  // 特殊スキル「激励B」：自機からの被弾で同僚のSAN・寿命が回復し、脳疲労が0になる（ゲーム内3時間に1回まで）
  const encourageBLevel = specialSkillLevels.get('encourage-b') || 0;
  const encourageBReady = encourageBLevel > 0 && gameClockMs >= encourageBNextAvailableAtMs;
  if (encourageBReady) {
    encourageBNextAvailableAtMs = gameClockMs + encourageCooldownHours * hourMs;
    const recovery = encourageBRecoveryByLevel[encourageBLevel];
    partner.san = Math.min(maxSan, partner.san + recovery);
    partner.lifespan = Math.min(maxLifespan, partner.lifespan + recovery);
    partner.fatigue = 0;
  }
  // Lv3ではさらに、この被弾によるSAN低下がなくなる
  if (!(encourageBReady && encourageBLevel >= 3)) {
    partner.san = Math.max(0, partner.san - partnerFriendlyFireSanDamage *
      specialSkillEffects.partnerSanDamageMultiplier * specialSkillEffects.friendlyFireDamageMultiplier);
  }
  partner.lifespan = Math.max(0, partner.lifespan - partnerFriendlyFireLifespanDamage * specialSkillEffects.friendlyFireDamageMultiplier);
  partner.friendlyFireInvincibleTimer = friendlyFireInvincibleDuration;
  if (encourageBReady) {
    showRandomPartnerSpeechBubble(['頑張ります！！！'], '#69f0ae');
  } else {
    showRandomPartnerSpeechBubble(partnerHitByPlayerLines, '#ff8a65', partnerHitByPlayerStressedLines);
  }
  adjustPartnerRelationship(-partnerRelationshipDamagePerHit);
  return true;
}

// 週末の特殊イベント（後日実装予定）から、同僚の賢さ・性格を恒久的に変化させるためのフック
function adjustPartnerTraits(intelligenceDelta, recklessnessDelta) {
  partner.intelligence = Math.max(0, Math.min(1, partner.intelligence + intelligenceDelta));
  partner.recklessness = Math.max(0, Math.min(1, partner.recklessness + recklessnessDelta));
}

// 自分が持つ特殊スキルに応じて、同僚の実効的な賢さを求める（基礎値はintelligenceのまま変えない）
function getPartnerEffectiveIntelligence() {
  const bonus = (specialSkillLevels.get('learning-power') || 0) * 0.05;
  return Math.max(0, Math.min(1, partner.intelligence + bonus));
}

// 自分が持つ特殊スキルに応じて、同僚の実効的な性格（向こう見ずさ）を求める
function getPartnerEffectiveRecklessness() {
  return Math.max(0, Math.min(1, partner.recklessness));
}

// 発射時点の自分位置が、同僚弾の進行方向上にあるかを調べる。
// 発射後に自分から弾道へ入った場合は対象外なので、関係良好でも被弾し得る。
function wouldPartnerShotHitCurrentPlayer(angle, bulletRadius = 4) {
  const dx = player.x - partner.x;
  const dy = player.y - partner.y;
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  const forwardDistance = dx * directionX + dy * directionY;
  if (forwardDistance <= 0) return false;
  const perpendicularDistance = Math.abs(dx * directionY - dy * directionX);
  return perpendicularDistance <= player.radius + bulletRadius + 4;
}

// 発射時点の同僚位置が、自機弾の進行方向上にあるかを調べる（自動攻撃モードの誤射回避に使う）
function wouldPlayerShotHitPartner(angle, bulletRadius = 4, extraMargin = 0) {
  if (!partner.active) return false;
  const dx = partner.x - player.x;
  const dy = partner.y - player.y;
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  const forwardDistance = dx * directionX + dy * directionY;
  if (forwardDistance <= 0) return false;
  const perpendicularDistance = Math.abs(dx * directionY - dy * directionX);
  return perpendicularDistance <= partner.radius + bulletRadius + 4 + extraMargin;
}

// 同僚の追従・ランダム移動・自律攻撃・被弾・寿命減少・退場判定をまとめて処理する
function updatePartner(dt) {
  if (!partner.active) return;

  if (partner.reviveTimerMs > 0) {
    // 残機を使って気絶し、復活を待っている間：移動・攻撃できない
    partner.reviveTimerMs -= dt * 1000;
    if (partner.reviveTimerMs <= 0) {
      partner.reviveTimerMs = 0;
      partner.san = maxSan * reviveSanRatio;
      partner.lifespan = maxLifespan * reviveLifespanRatio;
      partner.invincible = true;
      partner.invincibleTimer = revivePostGlowDurationMs;
      partner.friendlyFireInvincibleTimer = revivePostGlowDurationMs;
      showMessage(`同僚が復活！（残機 ×${partnerLivesRemaining}）`, 2600, '#69f0ae', '24px sans-serif');
    }
    return;
  }

  partner.friendlyFireInvincibleTimer = Math.max(0,
    partner.friendlyFireInvincibleTimer - dt * 1000);

  // 追従する時間を減らし、画面内を広く自発的に徘徊する。
  partner.wanderTimer -= dt * 1000;
  if (partner.wanderTimer <= 0) {
    partner.wandering = Math.random() < partnerWanderChance;
    if (partner.wandering) {
      partner.wanderTarget = getRandomEventPosition(partner.radius);
    }
    partner.wanderTimer = 1800 + Math.random() * 2600;
  }
  // 固定敵が出現している間は、追従・徘徊・回復アイテム取得よりも最優先でそこへ向かう
  const nearestFixedEnemyForPartner = fixedEnemies.length > 0
    ? fixedEnemies.reduce((closest, fx) => {
      const d = Math.hypot(fx.x - partner.x, fx.y - partner.y);
      return (!closest || d < closest.d) ? { fx, d } : closest;
    }, null).fx
    : null;
  // 脳疲労が60%を超えていて、着地済みの回復アイテムがあれば、追従・徘徊よりも優先して取りに行く
  // （栄養ドリンクとチョコレートが両方あれば、効果の大きい栄養ドリンクを優先する）
  // 出現直後の猶予時間が残っている間は、同僚がその場で待機していても取得対象にしない
  // （固定位置に落下演出なしで出現する栄養ドリンクは、猶予がないと出現と同時に取得されてしまう）
  // 栄養ドリンクは寿命を消費するため、飲むと寿命が尽きてしまう（残り寿命が消費量以下の）状況では取りに行かない
  const landedEnergyDrink = (energyDrink && energyDrink.landed && !(energyDrink.graceMs > 0) &&
    partner.lifespan > energyDrinkLifespanCost) ? energyDrink : null;
  const landedChocolate = (chocolate && chocolate.landed) ? chocolate : null;
  const partnerRecoveryTarget = landedEnergyDrink || landedChocolate;
  const partnerWantsRecoveryItem = !!partnerRecoveryTarget &&
    partner.fatigue >= maxFatigue * partnerChocolateSeekFatigueRatio;
  const followTarget = nearestFixedEnemyForPartner
    ? { x: nearestFixedEnemyForPartner.x, y: nearestFixedEnemyForPartner.y }
    : partnerWantsRecoveryItem
      ? { x: partnerRecoveryTarget.x, y: partnerRecoveryTarget.y }
      : partner.wandering
        ? partner.wanderTarget
        : { x: player.x + partnerFollowOffsetX, y: player.y + partnerFollowOffsetY };
  // 目標地点へ向かう「望ましい速度」を求め、実際の速度はそこへ少しずつ近づけることで
  // 急な方向転換・停止でも滑るような慣性のある動きになる
  const fdx = followTarget.x - partner.x;
  const fdy = followTarget.y - partner.y;
  const fdist = Math.hypot(fdx, fdy);
  const movementSpeed = partnerMoveSpeed * getPartnerRankMoveSpeedMultiplier(rank) *
    (nearestFixedEnemyForPartner || partnerWantsRecoveryItem || partner.wandering ? 1 : partnerFollowSpeedMultiplier);
  let desiredVx = 0;
  let desiredVy = 0;
  if (fdist > 2) {
    const speed = Math.min(fdist, movementSpeed);
    desiredVx = (fdx / fdist) * speed;
    desiredVy = (fdy / fdist) * speed;
  }
  partner.vx += (desiredVx - partner.vx) * partnerVelocitySmoothing;
  partner.vy += (desiredVy - partner.vy) * partnerVelocitySmoothing;
  partner.x += partner.vx;
  partner.y += partner.vy;
  if (Math.hypot(partner.vx, partner.vy) > 0.05) {
    partner.angle = Math.atan2(partner.vy, partner.vx);
  }
  clampToPlayableFloor(partner);
  pushEntityOutsideScheduledReport(partner);
  pushEntityOutsideFixedEnemy(partner);

  // 回復アイテムを取りに行っていた場合、たどり着いたら摂取して疲労・SAN・寿命に反映する
  if (partnerWantsRecoveryItem && partnerRecoveryTarget &&
      Math.hypot(partner.x - partnerRecoveryTarget.x, partner.y - partnerRecoveryTarget.y) <=
        partner.radius + partnerRecoveryTarget.radius) {
    if (partnerRecoveryTarget === energyDrink) {
      const reducedFatigue = Math.min(partner.fatigue, energyDrinkFatigueReduction);
      partner.fatigue -= reducedFatigue;
      partner.san = Math.min(maxSan, partner.san + energyDrinkSanRecovery);
      partner.lifespan = Math.max(0, partner.lifespan - energyDrinkLifespanCost);
      showMessage(
        `同僚が栄養ドリンクを飲んだ！ 脳疲労 -${Math.ceil(reducedFatigue)} / SAN +${energyDrinkSanRecovery} / 寿命 -${energyDrinkLifespanCost}`,
        1800, '#80deea'
      );
      energyDrink = null;
      energyDrinkSpawnTimerMs = getRandomEnergyDrinkSpawnDelay();
    } else {
      const recoveryAmount = Math.ceil(
        maxFatigue * chocolateRecoveryRatio * specialSkillEffects.chocolateRecoveryMultiplier
      );
      const reducedFatigue = Math.min(partner.fatigue, recoveryAmount);
      partner.fatigue -= reducedFatigue;
      partner.san = Math.min(maxSan, partner.san + chocolateSanRecovery);
      partner.chocolateDailyCount++;
      const partnerLifespanEffect = getChocolateLifespanEffect(partner.chocolateDailyCount);
      partner.lifespan = Math.max(0, Math.min(maxLifespan, partner.lifespan + partnerLifespanEffect));
      showMessage(
        `同僚がチョコレートを食べた！ 脳疲労 -${Math.ceil(reducedFatigue)} / SAN +${chocolateSanRecovery} / 寿命 ${partnerLifespanEffect >= 0 ? '+' : ''}${partnerLifespanEffect}` +
        `（本日${partner.chocolateDailyCount}個目）`,
        1800, '#ffcc80'
      );
      chocolate = null;
      chocolateSpawnTimerMs = getRandomChocolateSpawnDelay();
    }
  }

  // 脳疲労が100に達したら、50（または時間帯の下限、どちらか高い方）まで下がるまで攻撃を控えて休ませる。
  // 下限が50を超える時間帯でも、必ずいつかは休息を終えられるようにする
  if (partner.fatigue >= maxFatigue) {
    partner.fatigueResting = true;
  } else if (partner.fatigueResting &&
      partner.fatigue <= Math.max(maxFatigue * 0.5, getFatigueRecoveryFloor())) {
    partner.fatigueResting = false;
  }

  // 自律攻撃：最も近い敵へ向けて、既存の弾配列にそのまま追加する
  // 賢さ・性格・脳疲労に応じて、無駄撃ちを避けたり、狙いが不正確になったりする
  partner.fireTimer -= dt * 1000;
  // セッションハイジャック・内部不正：一定時間、同僚が乗っ取られて攻撃をやめる
  if (partner.fireTimer <= 0 && (enemies.length > 0 || scheduledReport || fixedEnemies.length > 0 || bossEvent) &&
      !partner.fatigueResting && (partner.hijackedTimerMs || 0) <= 0) {
    const intelligence = getPartnerEffectiveIntelligence();
    const recklessness = getPartnerEffectiveRecklessness();
    const fatigueRatio = partner.fatigue / maxFatigue;

    // 疲労が半分を超えたあたりから、賢く・慎重な性格ほど無駄撃ちを避けて様子を見る
    const holdFireChance = Math.max(0, fatigueRatio - 0.5) * 2 * (intelligence * 0.7 + (1 - recklessness) * 0.3);
    if (Math.random() < holdFireChance) {
      partner.fireTimer = 200; // 少し待って再度チャンスを窺う（このターンは撃たない）
    } else {
      const nearestEnemy = enemies.length > 0
        ? enemies.reduce((closest, candidate) => {
          const d = Math.hypot(candidate.x - partner.x, candidate.y - partner.y);
          return (!closest || d < closest.d) ? { en: candidate, d } : closest;
        }, null).en
        : null;
      // 関係性が閾値以下になると、悪化度に応じた確率で敵ではなく自分を狙う。
      // 関係性が0まで落ちきった場合は、敵よりも自機を狙う頻度の方が高くなる
      const relationshipHostility = Math.max(0,
        (partnerRelationshipRetaliationThreshold - partner.relationship) /
        partnerRelationshipRetaliationThreshold);
      const retaliationChance = partner.relationship <= 0
        ? 0.7
        : partner.relationship <= partnerRelationshipRetaliationThreshold
          ? 0.2 + relationshipHostility * 0.3
          : 0;
      const retaliating = Math.random() < retaliationChance;
      // ラスボスの出現中は、生きている発射口も通常の敵と同様に狙う対象にする
      const nearestBossHoleForPartner = findNearestLivingBossHole(partner.x, partner.y);
      // 固定敵が出ている間は最優先で狙い、次に定時報告・ラスボスの発射口、それ以外は通常の仕事を狙う
      const target = retaliating ? player :
        (nearestFixedEnemyForPartner || scheduledReport || nearestBossHoleForPartner || nearestEnemy);
      // 万一、条件を満たした瞬間に狙う対象が1つも無ければ（発射口を全滅させた直後など）今回は撃たない
      if (!target) {
        partner.fireTimer = 200;
      } else {
      // 賢さが高く、疲労が少なく、慎重な性格ほど命中精度（狙いの正確さ）が上がる
      const accuracy = Math.max(0.15, Math.min(1,
        0.35 + intelligence * 0.5 - fatigueRatio * 0.25 - recklessness * 0.1
      ));
      const scatterDegrees = (1 - accuracy) * 35 * (Math.random() - 0.5) * 2;
      const angle = Math.atan2(target.y - partner.y, target.x - partner.x) +
        scatterDegrees * Math.PI / 180;
      // 役職ランクに応じて、同僚の弾速も上がっていく
      const bulletSpeed = 6 * getPartnerRankFireSpeedMultiplier(rank);
      // 「無敵（テスト用）」「β版設定」：同僚の攻撃力も自機と同様に50倍になる
      const partnerInvincibleDamageMultiplier = isTestInvincibleUpgradeActive() ? 50 : 1;
      const damage = Math.max(1, Math.round(
        baseBulletDamage * specialSkillEffects.partnerDamageMultiplier * (1 + skillLevel * 0.08) *
        partnerInvincibleDamageMultiplier
      ));
      // 関係性が50以上なら、現在の自分位置へ通る弾道は撃たずに見送る。
      const shouldAvoidShot = partner.relationship >= partnerRelationshipSafeFireThreshold &&
        wouldPartnerShotHitCurrentPlayer(angle);
      if (shouldAvoidShot) {
        partner.fireTimer = 200;
      } else {
        // 第4段階「承認欲求」：狙って撃っただけで（当たらなくても）耐久力が少し回復してしまう
        checkApprovalSeekingFireHeal(partner.x, partner.y, angle);
        // 役職ランク5以降：自機の「マルチタスクA」と同様に、正面から±20度以内のランダムな方向へ追加の1発を撃つ
        const partnerShotAngles = [angle];
        if (isPartnerRankMultiShotActive(rank)) {
          partnerShotAngles.push(angle + (Math.random() * 2 - 1) * 20 * Math.PI / 180);
        }
        for (const shotAngle of partnerShotAngles) {
          bullets.push({
            x: partner.x + Math.cos(shotAngle) * partner.radius,
            y: partner.y + Math.sin(shotAngle) * partner.radius,
            vx: Math.cos(shotAngle) * bulletSpeed,
            vy: Math.sin(shotAngle) * bulletSpeed,
            radius: 4,
            damage,
            bounces: 0,
            owner: 'partner'
          });
        }
        // 夜間は疲労そのものではなく発砲間隔を伸ばし、攻撃頻度を落とすことでパフォーマンス低下を表現する。
        // 役職ランクに応じて、発射間隔も短くなっていく
        partner.fireTimer = partnerBaseFireRate * getTimeOfDayFatigueMultiplier() *
          getPartnerRankFireIntervalMultiplier(rank);
      }
      }
    }
  }

  // 無敵時間の減少
  if (partner.invincible) {
    partner.invincibleTimer -= dt * 1000;
    if (partner.invincibleTimer <= 0) partner.invincible = false;
  }

  // 敵との接触判定（プレイヤーの接触判定の簡易版）
  if (!partner.invincible) {
    for (const en of enemies) {
      const d = Math.hypot(en.x - partner.x, en.y - partner.y);
      if (d <= en.radius + partner.radius) {
        // 「ファイヤーウォール」が残っていれば、SANダメージを無効化する
        if (partner.barrierCharges > 0) {
          partner.barrierCharges--;
        } else {
          damagePartnerSan(Math.ceil((en.type || 1) * partnerContactSanMultiplier * getEnemyDifficultyMultiplier()));
        }
        partner.invincible = true;
        partner.invincibleTimer = partnerInvincibleDuration;
        break;
      }
    }
  }

  // 高疲労・低SANが続くと、プレイヤーと同様に寿命が少しずつ削れる
  if (partner.fatigue >= maxFatigue * highFatigueThresholdRatio) {
    partner.highFatigueTimerMs += dt * 1000;
    if (partner.highFatigueTimerMs > highFatigueGraceMs) {
      partner.lifespan = Math.max(0, partner.lifespan -
        highFatigueLifespanPerSec * dt * specialSkillEffects.partnerLifespanDrainMultiplier);
    }
  } else {
    partner.highFatigueTimerMs = 0;
  }
  if (partner.san <= maxSan * lowSanThresholdRatio) {
    partner.lowSanTimerMs += dt * 1000;
    if (partner.lowSanTimerMs > lowSanGraceMs) {
      partner.lifespan = Math.max(0, partner.lifespan -
        lowSanLifespanPerSec * dt * specialSkillEffects.partnerLifespanDrainMultiplier);
    }
  } else {
    partner.lowSanTimerMs = 0;
  }

  // 「無敵（テスト用）」「β版設定」：同僚にも同様の効果を適用する（SAN・寿命が0にならず、脳疲労も常に0のまま）。
  // ただし、ノーマルルート終了時の負けイベント戦闘中はこの無敵を無効化する
  const normalEndBattleActive = normalEndSequence && normalEndSequence.phase === 'battle';
  if (isTestInvincibleUpgradeActive() && !normalEndBattleActive) {
    partner.san = Math.max(partner.san, 1);
    partner.lifespan = Math.max(partner.lifespan, 1);
    partner.fatigue = 0;
    return;
  }
  // 「永遠の命（同僚）」「希望（同僚）」：同僚のSAN・寿命がそれぞれ0にならないようにする
  // （ノーマルルート終了時の負けイベント戦闘中は、これらの効果も無効化する）
  if (!normalEndBattleActive) {
    if (dreamMemorySave.upgrades.eternalLifePartner >= 1) partner.lifespan = Math.max(partner.lifespan, 1);
    if (dreamMemorySave.upgrades.hopePartner >= 1) partner.san = Math.max(partner.san, 1);
  }

  // 退場判定：SANか寿命が尽きたら以後登場しなくなり、プレイヤーにもSANダメージが入る。
  // ただし、ノーマルルート終了時の負けイベント戦闘中を除き、残機が残っていれば離脱の代わりに気絶して復活を待つ
  if (partner.san <= 0 || partner.lifespan <= 0) {
    if (!normalEndBattleActive && partnerLivesRemaining > 0) {
      partnerLivesRemaining--;
      partner.reviveTimerMs = reviveStunDurationMs;
      return;
    }
    partner.active = false;
    partnerLossReason = partner.lifespan <= 0 ? 'lifespan' : 'san';
    partnerLifespanAtLoss = partner.lifespan;
    if (normalEndBattleActive) {
      // ノーマルルート終了時の負けイベント戦闘：通常の離脱メッセージ・SANダメージの代わりに、
      // 全体が減速→静止→同僚が消える演出（partnerLossSlowmo）へ移行する
      normalEndSequence.partnerLost = true;
      normalEndSequence.phase = 'partnerLossSlowmo';
      normalEndSequence.phaseTimerMs = 0;
    } else {
      showMessage('同僚が力尽きてしまった…', 4000, '#ef9a9a', '24px sans-serif');
      damageSan(partnerLossSanPenalty);
    }
  }
}

// ===== カレンダーと祝日 =====
function getRandomGameStartDate() {
  const year = 3000 + Math.floor(Math.random() * 1000);
  const month = Math.floor(Math.random() * 12);
  return new Date(year, month, 1);
}

function getLastDayOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function isLastDayOfMonth(date) {
  return date.getDate() === getLastDayOfMonth(date);
}

let currentDate = getRandomGameStartDate();
const weekdayNames = ['日','月','火','水','木','金','土'];
// 日付が毎年変わらない祝日を「月-日」で登録する
const holidayMMDD = new Set(['01-01','02-11','04-29','05-03','05-04','05-05','11-03','11-23']);
function isHoliday(d) {
  const mm = String(d.getMonth() + 1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return holidayMMDD.has(`${mm}-${dd}`);
}

// 初日が土日祝日だった場合は、次の稼働日（平日）まで進める
while (currentDate.getDay() === 0 || currentDate.getDay() === 6 || isHoliday(currentDate)) {
  currentDate.setDate(currentDate.getDate() + 1);
}

// その週の最終稼働日（金曜、金曜が祝日ならその前日）かどうかを判定する
function isWeekEndDay(date) {
  const dow = date.getDay();
  if (dow === 5) return !isHoliday(date);
  if (dow === 4) {
    const friday = new Date(date);
    friday.setDate(friday.getDate() + 1);
    return isHoliday(friday);
  }
  return false;
}

// 指定日より後の直近の月曜日を返す（土日祝日をまとめて飛ばすために使う）
function nextMonday(date) {
  const d = new Date(date);
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() !== 1);
  return d;
}

let weeklyQuotaEaseMultiplier = 1;

// ランクに応じて今週のノルマを再設定する
// 集中して手を止めずにプレイしてようやく届く程度の、ぎりぎり達成できる水準にしてある
function resetWeeklyQuotaForNewWeek() {
  weeklyKillQuota = Math.round((20 + (rank - 1) * 7) * weeklyQuotaEaseMultiplier);
  weeklyScoreQuota = Math.round((80 + (rank - 1) * 30) * weeklyQuotaEaseMultiplier);
  weeklyKills = 0;
  weeklyScoreGained = 0;
  weeklyQuotaAchievedEarly = false;
  weeklyQuizCount = 0;
}

// 週の途中でノルマを達成したかどうかをキル時にチェックする
function checkEarlyQuotaAchievement() {
  if (weeklyQuotaAchievedEarly) return;
  if (isWeekEndDay(currentDate)) return; // 最終日はresolveWeekEndで判定するため、ここでは扱わない
  if (weeklyKills >= weeklyKillQuota || weeklyScoreGained >= weeklyScoreQuota) {
    weeklyQuotaAchievedEarly = true;
    showMessage('今週のノルマ達成！', 3500, '#69f0ae', '22px sans-serif');
    // 休日出勤中にノルマを達成したら、そのまま帰るかどうかを選ばせる
    const isWeekendWorkDay = currentDate.getDay() === 0 || currentDate.getDay() === 6;
    if (isWeekendWorkDay) {
      weekendWorkQuotaChoice = true;
    }
  }
}

// 休日出勤を切り上げて、翌週の平日の流れへ戻る
function goHomeFromWeekendWork() {
  showMessage('今日はここまで。切り上げて帰宅した。', 2500, '#90caf9', '22px sans-serif');
  startDayTransition(jumpToNextMondayAndResetWeek);
}

// 休日出勤中にノルマを達成した際の「家に帰りますか」選択を処理する
function handleWeekendWorkQuotaChoice(goHome) {
  weekendWorkQuotaChoice = false;
  if (goHome) {
    goHomeFromWeekendWork();
  }
}

// 18時に固定敵（脅威）が残っている時の「残業しますか？」の回答。
// はい：24時まで残業して片付ける（すべて排除できたらその場で自動的に一日を終了する）
// いいえ：その場で一日を終了する（残った固定敵は、日をまたぐ際にScoreが目減りするペナルティの対象になる）
function handleFixedEnemyOvertimeChoice(workOvertime) {
  fixedEnemyOvertimeChoiceActive = false;
  if (workOvertime) {
    fixedEnemyOvertimeConfirmed = true;
    showMessage(`${dayEndHour}時：まだ脅威が残っている… 残業して片付けることにした（${maxOvertimeHour}時まで）`,
      3800, '#ff8a65', '22px sans-serif');
  } else {
    endWorkday();
  }
}

function sendScore(finalScore) {
  // 最終スコアをJavaサーバーへ送る（必要に応じてURLを変更する）
  fetch('http://localhost:8080/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ score: finalScore })
  }).then(res => {
    console.log('Score sent, status=', res.status);
  }).catch(err => {
    console.error('Failed to send score', err);
  });
}
// ===== ランク・スキル・経験値システム =====
// 「昇進」という選択イベントは廃止し、Scoreに応じて役職名・役職スキルが自動的・段階的に身につく
const rankNames = [
  '新人',
  'PG',
  'SE',
  '上級SE / サブリーダー',
  'PL / プロジェクトリーダー',
  'PM / プロジェクトマネージャー',
  'CTO'
];
// rank変数は、敵生成時に使うためファイル前半で宣言済み
// ミスなくほぼ完璧に立ち回った場合のみ最終ランクへ届く想定で、最終ランクだけ必要スコアを大きく跳ね上げてある
// 役職・役職スキルは周回プレイを通じて引き継がれ、Scoreも周回間で累積していくため、
// 1プレイ内だけで上がっていた頃より必要スコアを大きく引き上げ、昇進しにくく調整してある
const rankThresholds = [0, 240, 800, 2000, 4000, 7200, 12800]; // 各ランクへの昇格に必要な累積Score

// スキルレベルと経験値
// レベルが上がるほど必要経験値が増えていく（後半ほどレベルが上がりにくくなるようにするため）
let exp = 0;
const baseExpPerLevel = 20; // 最初のレベルアップに必要な経験値（序盤が上がりやすいよう引き下げ）
const expPerLevelGrowth = 6; // レベルが1上がるごとに、次のレベルアップに必要な経験値が増える量
let skillLevel = 0;

// 指定レベルに到達するまでの累積必要経験値（レベルが上がるほど1レベルあたりの必要量が増える等差数列の和）
function expThresholdForLevel(level) {
  if (level <= 0) return 0;
  return baseExpPerLevel * level + expPerLevelGrowth * level * (level - 1) / 2;
}

// 時刻によって敵を加速させる倍率
const speedDayIncreaseFactor = 0.45; // 終業時には最大45%速くなる

// ===== 特殊スキルシステム =====
// スキル効果は「レベルマップから毎回再計算」できるよう、初期値を関数で持つ
function getDefaultSpecialSkillEffects() {
  return {
    multiTaskLevel: 0,
    tripleShotLevel: 0,
    moveSpeedMultiplier: 1,
    firingFatigueMultiplier: 1,
    fireRateMultiplier: 1,
    damageMultiplier: 1,
    chocolateRecoveryMultiplier: 1,
    sanDamageMultiplier: 1,
    bulletSpeedMultiplier: 1,
    stunDurationMultiplier: 1,
    expGainMultiplier: 1,
    scoreGainMultiplier: 1,
    idleRecoveryMultiplier: 1,
    contactScorePenaltyMultiplier: 1,
    autoParryChance: 0,
    bulletScatterChance: 0,
    enemyApproachSpeedMultiplier: 1,
    bulletBounceCount: 0,
    partnerDamageMultiplier: 1,
    partnerSanDamageMultiplier: 1,
    partnerLifespanDrainMultiplier: 1,
    friendlyFireDamageMultiplier: 1,
    teamworkParryChance: 0,
    mealOrderVisible: false,
    // コミュニケーション能力：同僚の弾をパリィした時／同僚が自機の弾をパリィした時に、レベルごとに追加で上がる関係性の量
    communicationParryRelationshipBonus: 0,
    // 継続力：自機の弾の飛距離の倍率（レベルごとに1.2倍）
    bulletDistanceMultiplier: 1,
    // マルチタスクB：正面から90度ずつ回転させた計4方向へ同時発射する
    quadShotActive: false
  };
}
const specialSkillEffects = getDefaultSpecialSkillEffects();

const specialSkills = [
  { id: 'dual-shot', name: 'マルチタスクA', description: 'レベルごとに同時発射する弾が1発増える。追加の弾は正面から±20度以内のランダムな方向へ飛ぶ', maxLevel: 1 },
  {
    id: 'dual-shot-b', name: 'マルチタスクB',
    description: '正面と、そこから90度ずつ回転させた計4方向に同時発射する（各弾の飛距離は単発時の80%）。マルチタスクAとは同時に習得できない',
    maxLevel: 1
  },
  { id: 'speed-up', name: 'フットワーク', description: '移動速度が上がる（Lv1:1.1倍 → Lv5:2.0倍）', maxLevel: 5 },
  { id: 'fatigue-save', name: '脳疲労耐性', description: '時間経過による脳疲労の蓄積を軽減する（Lv1:-35% → Lv5:-50%）', maxLevel: 5 },
  { id: 'rapid-fire', name: '処理速度A', description: '発射間隔を短縮する（Lv1:当初の75% → Lv5:当初の30%）', maxLevel: 5 },
  { id: 'high-speed-bullet', name: '処理速度B', description: '弾の速度を上げる（Lv1:当初の140% → Lv5:当初の300%）', maxLevel: 5 },
  { id: 'short-sleeper', name: 'パワーナップ', description: '行動不能（stun）時間を半分にする', maxLevel: 1 },
  { id: 'learning-power', name: '理解力', description: 'EXP獲得量を上げる（Lv1:当初の130% → Lv5:当初の200%）', maxLevel: 5 },
  { id: 'business-manner', name: 'ビジネスマナー', description: '印象が良く、敵接触時のスコア減点を軽減（Lv1:-30% → Lv5:-50%）。同僚の寿命減少-10%', maxLevel: 5 },
  { id: 'communication', name: 'コミュニケーション能力', description: '同僚の弾をパリィした時、または同僚が自機の弾をパリィした時、関係性がレベルごとにさらに+2上がる', maxLevel: 5 },
  {
    id: 'network-specialist', name: 'ネットワークスペシャリスト',
    description: '弾が画面端でレベルごとに1回多く跳ね返る。画面端で反射した自弾（1回目以降すべて）は、自機がパリィ（オートパリィ含む）で打ち直せ、同僚が自動でパリィする確率も2倍になる',
    maxLevel: 3
  },
  { id: 'teamwork', name: 'チームワーク', description: '自分と同僚、お互いの弾が着弾しそうな時（敵からの弾を除く）、お互いパリィが発動しやすくなる（Lv5で発動率80%）', maxLevel: 5 },
  { id: 'meal-foresight', name: '食通', description: '昼食に登場する料理に、出現する順番の番号が表示されるようになる（習得は1回のみ）', maxLevel: 1 },
  { id: 'auto-parry', name: 'オートパリィ', description: '敵（ラスボス・中ボス・固定敵）からの弾を被弾しそうな時、レベルごとに10%の確率で自動的にパリィする（Lv5で50%）', maxLevel: 5 },
  { id: 'persistence', name: '継続力', description: '自機の弾の飛距離が、レベルごとに1.4倍になる（Lv1:1.4倍 → Lv5:約5.38倍）', maxLevel: 5 },
  {
    id: 'encourage-a', name: '激励A',
    description: '同僚からの弾を被弾すると脳疲労が減少する（ゲーム内3時間に1回まで。Lv1:-10 → Lv2:-15 → Lv3:-25、Lv3ではさらに被弾してもSAN値が低下しなくなる）',
    maxLevel: 3
  },
  {
    id: 'encourage-b', name: '激励B',
    description: '自機からの弾を同僚が被弾すると、同僚のSAN・寿命が回復し脳疲労が0になる（ゲーム内3時間に1回まで。Lv1:+5 → Lv2:+10 → Lv3:+20、Lv3ではさらに被弾してもSAN値が低下しなくなる）',
    maxLevel: 3
  }
];

// 同時に習得できない組み合わせ（片方を取ると、もう片方は未取得の状態に戻り、再度選択肢に表示されるようになる）
const mutuallyExclusiveSkillIds = {
  'dual-shot': 'dual-shot-b',
  'dual-shot-b': 'dual-shot'
};

// スキルIDと取得レベルを対応させて保存する（これが唯一の正となる状態）
const specialSkillLevels = new Map();
let specialSkillChoices = [];
let specialSkillSelectionActive = false;
let specialSkillSelectionTitle = '';
let pendingSpecialSkillSelections = 0;

// 1レベルぶんの効果を specialSkillEffects / specialDeadlineMultiplier に加える（副作用なしの純粋な差分適用）
// 現在の合計レベル（1〜5、または1固定）から、スキル1つぶんの効果を丸ごと計算して適用する。
// 「レベルごとに一定量を積み増す」のではなく、レベルに応じた表・線形補間で効果の大きさが決まる
function applySkillEffectForLevel(skillId, level) {
  switch (skillId) {
    case 'dual-shot':
      // マルチタスクA：追加弾のランダムな方向は発射処理側で決めるため、ここでは段数だけを反映する
      specialSkillEffects.multiTaskLevel = level;
      break;
    case 'dual-shot-b':
      // マルチタスクB：4方向同時発射の有効化（実際の発射方向・飛距離補正は発射処理側で行う）
      specialSkillEffects.quadShotActive = true;
      break;
    case 'speed-up': {
      // フットワーク：Lv1=1.1倍 → Lv5=2.0倍
      const table = [1.1, 1.2, 1.4, 1.5, 2.0];
      specialSkillEffects.moveSpeedMultiplier *= table[Math.min(level, table.length) - 1];
      break;
    }
    case 'fatigue-save': {
      // 脳疲労耐性：Lv1=-35% → Lv5=-50%（線形補間）
      const reduction = 0.35 + (0.50 - 0.35) * (Math.min(level, 5) - 1) / 4;
      specialSkillEffects.firingFatigueMultiplier *= (1 - reduction);
      break;
    }
    case 'rapid-fire': {
      // 処理速度A：発射間隔がLv1=当初の75% → Lv5=当初の30%（線形補間）
      const ratio = 0.75 + (0.30 - 0.75) * (Math.min(level, 5) - 1) / 4;
      specialSkillEffects.fireRateMultiplier *= ratio;
      break;
    }
    case 'high-speed-bullet': {
      // 処理速度B：弾速がLv1=当初の140% → Lv5=当初の300%（線形補間）
      const ratio = 1.4 + (3.0 - 1.4) * (Math.min(level, 5) - 1) / 4;
      specialSkillEffects.bulletSpeedMultiplier *= ratio;
      break;
    }
    case 'short-sleeper':
      // パワーナップ：maxLevel1、stun時間を半分にする
      specialSkillEffects.stunDurationMultiplier *= 0.5;
      break;
    case 'learning-power': {
      // 理解力：EXP獲得がLv1=当初の130% → Lv5=当初の200%（線形補間）
      const ratio = 1.3 + (2.0 - 1.3) * (Math.min(level, 5) - 1) / 4;
      specialSkillEffects.expGainMultiplier *= ratio;
      break;
    }
    case 'business-manner': {
      // ビジネスマナー：接触時のスコア減点がLv1=-30% → Lv5=-50%（線形補間）。同僚の寿命減少-10%は据え置き
      const reduction = 0.30 + (0.50 - 0.30) * (Math.min(level, 5) - 1) / 4;
      specialSkillEffects.contactScorePenaltyMultiplier *= (1 - reduction);
      specialSkillEffects.partnerLifespanDrainMultiplier *= 0.9;
      break;
    }
    case 'communication':
      // コミュニケーション能力：同僚の弾をパリィした時／同僚が自機の弾をパリィした時、関係性がレベルごとに+2多く上がる
      specialSkillEffects.communicationParryRelationshipBonus = 2 * level;
      break;
    case 'network-specialist':
      specialSkillEffects.bulletBounceCount = level;
      break;
    case 'teamwork':
      // チームワーク：自分と同僚同士の弾（誤射）が着弾しそうな時のパリィ発動率。Lv5で80%
      specialSkillEffects.teamworkParryChance = 0.16 * Math.min(level, 5);
      break;
    case 'meal-foresight':
      specialSkillEffects.mealOrderVisible = true;
      break;
    case 'auto-parry':
      // オートパリィ：敵（ラスボス・中ボス・固定敵）の弾に対する自動パリィ確率。Lv5で50%
      specialSkillEffects.autoParryChance = 0.10 * Math.min(level, 5);
      break;
    case 'persistence':
      // 継続力：自機の弾の飛距離が、レベルごとに1.4倍になる
      specialSkillEffects.bulletDistanceMultiplier = Math.pow(1.4, level);
      break;
  }
}

// specialSkillLevels（レベルマップ）を唯一の正として、効果をゼロから再計算する
// スキル忘却イベントや、スキル選択のたびに呼び出す
function recomputeSpecialSkillEffects() {
  Object.assign(specialSkillEffects, getDefaultSpecialSkillEffects());
  specialDeadlineMultiplier = 1;
  for (const [skillId, level] of specialSkillLevels.entries()) {
    applySkillEffectForLevel(skillId, level);
  }
  for (const id of rankSkillLevels) {
    applyRankSkillEffect(id);
  }
}

const specialSkillSelectionLockDurationMs = 1000; // 表示直後の連続タップ／クリックによる誤選択を防ぐ猶予時間
let specialSkillSelectionUnlockAt = 0; // この時刻（Date.now()基準）を過ぎるまで選択を受け付けない
const specialSkillMaxRerolls = 1; // 1回のプレイ（ゲーム開始～終了）を通して選び直せる合計回数。選択のたびに回復はしない
let specialSkillRerollsRemaining = specialSkillMaxRerolls;
// 完全オートモード中、選択画面が表示されてからこの時間クリックがなければ、ランダムに1つ選んだ扱いにする
const specialSkillSelectionAutoPickDelayMs = 3000;
let specialSkillSelectionAutoPickAt = 0;

// 取得済みスキルも候補に含め、再取得するとレベルアップできる（ただしmaxLevelに達したスキルは除外する）
function getAvailableSpecialSkillsPool() {
  return specialSkills.filter(skill =>
    !(skill.maxLevel && (specialSkillLevels.get(skill.id) || 0) >= skill.maxLevel));
}

// Fisher-Yates法で配列をシャッフルした新しい配列を返す（元の配列は変更しない）
function shuffleArray(array) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function openSpecialSkillSelection(title) {
  specialSkillChoices = shuffleArray(getAvailableSpecialSkillsPool()).slice(0, 3);
  specialSkillSelectionTitle = title;
  specialSkillSelectionActive = true;
  specialSkillSelectionUnlockAt = Date.now() + specialSkillSelectionLockDurationMs;
  specialSkillSelectionAutoPickAt = Date.now() + specialSkillSelectionAutoPickDelayMs;
  // リロール回数はゲーム全体を通しての合計なので、選択画面を開くたびには回復させない
}

// 表示中の3択を、残り回数の範囲内で選び直す（リロール）
function rerollSpecialSkillChoices() {
  if (Date.now() < specialSkillSelectionUnlockAt || specialSkillRerollsRemaining <= 0) return;
  specialSkillRerollsRemaining--;
  specialSkillChoices = shuffleArray(getAvailableSpecialSkillsPool()).slice(0, 3);
}

function chooseSpecialSkill(choiceIndex) {
  // 表示直後の連打・連続タップによる誤選択を防ぐため、猶予時間内の選択は無視する
  if (Date.now() < specialSkillSelectionUnlockAt) return;

  const skill = specialSkillChoices[choiceIndex];
  if (!skill) return;

  const newSkillLevel = skill.maxLevel
    ? Math.min(skill.maxLevel, (specialSkillLevels.get(skill.id) || 0) + 1)
    : (specialSkillLevels.get(skill.id) || 0) + 1;
  specialSkillLevels.set(skill.id, newSkillLevel);
  // 同時に習得できないスキル（マルチタスクA/B）：片方を取ったら、もう片方は未取得の状態に戻す
  const exclusiveWithId = mutuallyExclusiveSkillIds[skill.id];
  if (exclusiveWithId) specialSkillLevels.delete(exclusiveWithId);
  recomputeSpecialSkillEffects();
  recordSkillAcquiredForStats(`${skill.name} Lv.${newSkillLevel}`);
  showMessage(
    `特殊スキル「${skill.name}」Lv.${newSkillLevel}！`,
    2500,
    '#e1bee7',
    '26px sans-serif'
  );
  specialSkillSelectionActive = false;
  lastUpdate = Date.now();

  if (pendingSpecialSkillSelections > 0) {
    pendingSpecialSkillSelections--;
    openSpecialSkillSelection('レベルアップ：特殊スキルを選択');
    return;
  }
}

function queueSpecialSkillSelections(count) {
  if (count <= 0) return;
  pendingSpecialSkillSelections += count;
  if (!specialSkillSelectionActive) {
    pendingSpecialSkillSelections--;
    openSpecialSkillSelection('レベルアップ：特殊スキルを選択');
  }
}

// ===== 特殊スキルの事前強化（夢の記憶ポイントで、次の周回をレベルアップ済みの状態から始められる） =====
// タイトル画面の「夢の記憶ポイントで強化」から開ける専用ページで使う。
// 費用はdreamMemoryUpgradeDefsの通常強化と同じ計算式（dreamMemoryUpgradeCost）を共用する
function getSpecialSkillPreLevel(id) {
  return dreamMemorySave.specialSkillPreLevels[id] || 0;
}
function purchaseSpecialSkillPreLevel(id) {
  const skill = specialSkills.find(s => s.id === id);
  if (!skill) return;
  const level = getSpecialSkillPreLevel(id);
  if (level >= skill.maxLevel) return;
  const cost = dreamMemoryUpgradeCost(level);
  if (dreamMemorySave.points < cost) return;
  dreamMemorySave.points -= cost;
  dreamMemorySave.specialSkillPreLevels[id] = level + 1;
  // マルチタスクA/Bなど、同時に習得できない組み合わせ：片方を上げたら、もう片方の事前レベルは全額払い戻して0に戻す
  const exclusiveWithId = mutuallyExclusiveSkillIds[id];
  if (exclusiveWithId) {
    const otherLevel = getSpecialSkillPreLevel(exclusiveWithId);
    if (otherLevel > 0) {
      let refund = 0;
      for (let lv = 0; lv < otherLevel; lv++) refund += dreamMemoryUpgradeCost(lv);
      dreamMemorySave.points += refund;
      dreamMemorySave.specialSkillPreLevels[exclusiveWithId] = 0;
    }
  }
  saveDreamMemorySave();
}
// 「1つ戻す」：指定した特殊スキルの事前強化を1レベル下げ、そのレベルに費やしたポイントを払い戻す
function revertSpecialSkillPreLevel(id) {
  const level = getSpecialSkillPreLevel(id);
  if (level <= 0) return;
  dreamMemorySave.points += dreamMemoryUpgradeCost(level - 1);
  dreamMemorySave.specialSkillPreLevels[id] = level - 1;
  saveDreamMemorySave();
}
// 「思い直す」：特殊スキルの事前強化に費やしたポイントを全額払い戻し、レベルを0に戻す
function respecSpecialSkillPreLevels() {
  let refund = 0;
  specialSkills.forEach(skill => {
    const level = getSpecialSkillPreLevel(skill.id);
    for (let lv = 0; lv < level; lv++) refund += dreamMemoryUpgradeCost(lv);
    dreamMemorySave.specialSkillPreLevels[skill.id] = 0;
  });
  if (refund <= 0) return;
  dreamMemorySave.points += refund;
  saveDreamMemorySave();
}

function updateSkillEffects() {
  // 現在のexpが、次のレベルの必要経験値を超えている間、1レベルずつ上げていく
  // （必要経験値はexpThresholdForLevelにより後半ほど増えるため、レベルは徐々に上がりにくくなる）
  let newLevel = skillLevel;
  while (exp >= expThresholdForLevel(newLevel + 1)) {
    newLevel++;
  }
  if (newLevel > skillLevel) {
    const specialSkillMilestones = Math.floor(newLevel / 5) - Math.floor(skillLevel / 5);
    // 通常のレベルアップは表示せず、5レベルごとの特殊スキル習得のときだけ知らせる。
    // 一度に3つまで（1つ選ぶたびにまた3択が出る形で）選べるようにする
    skillLevel = newLevel;
    queueSpecialSkillSelections(specialSkillMilestones * 3);
  }
}

// ===== 役職スキル（Scoreに応じて自動的・段階的に身につく、開発手法の恒久効果） =====
// 「昇進」という選択イベントは廃止し、ランクが上がった瞬間、そのランクに紐づくスキルを自動ですべて習得する。
// 特殊スキルの「忘却」イベントの対象外にするため、specialSkillEffectsとは独立に管理する
const rankSkillDefs = [
  { rank: 1, id: 'structured-programming', name: '構造化プログラミング', description: '弾のダメージ+10%' },
  { rank: 2, id: 'oop', name: 'オブジェクト指向', description: 'EXP獲得+20%' },
  { rank: 3, id: 'ide', name: 'IDE', description: '発射間隔-15%' },
  { rank: 3, id: 'debugger', name: 'デバッガ', description: '被SANダメージ-15%' },
  { rank: 3, id: 'version-control', name: 'バージョン管理', description: '誤射（自分・同僚とも）のダメージ-20%' },
  { rank: 4, id: 'framework', name: 'フレームワーク', description: '移動速度+10%' },
  { rank: 4, id: 'library', name: 'ライブラリ', description: '弾のダメージ+15%' },
  { rank: 4, id: 'orm', name: 'O/Rマッパー', description: '獲得Score+15%' },
  { rank: 5, id: 'auto-test', name: '自動テスト', description: '被SANダメージ-20%' },
  { rank: 5, id: 'cicd', name: 'CI/CD', description: '発射間隔-20%' },
  { rank: 5, id: 'build-automation', name: 'ビルド自動化', description: '脳疲労の蓄積速度-20%' },
  {
    rank: 6, id: 'agile', name: 'アジャイル開発',
    description: '敵の納期+20%。また「大規模プロジェクト」は、7つのどこに当てても今対応すべき番号への命中として扱われる'
  },
  { rank: 6, id: 'devops', name: 'DevOps', description: '同僚の攻撃力+15%' },
  { rank: 6, id: 'cloud', name: 'クラウド', description: '最大SAN・最大寿命+10' },
  { rank: 6, id: 'container', name: 'コンテナ', description: '移動速度+15%' },
  { rank: 7, id: 'ai-code-completion', name: 'AIコード補完', description: '発射間隔-30%' },
  { rank: 7, id: 'generative-ai', name: '生成AI', description: '弾のダメージ+30%' },
  {
    rank: 7, id: 'ai-agent', name: 'AIエージェント',
    description: '1日10回まで、同僚への誤射が最寄りの敵への即死攻撃に変換される'
  }
];
const rankSkillLevels = new Set(); // 習得済みの役職スキルid
const synergyDailyLimit = 10;
let synergyUsesToday = 0; // 「AIエージェント」の本日の使用回数。日付が変わるとリセットする

// 現在のrankSkillLevelsをもとに、1つぶんの役職スキル効果をspecialSkillEffectsへ適用する
// （「クラウド」のmaxSan/maxLifespan+10だけは、再計算のたびに重複加算しないよう習得時に直接加算する）
function applyRankSkillEffect(id) {
  switch (id) {
    case 'structured-programming': specialSkillEffects.damageMultiplier *= 1.10; break;
    case 'oop': specialSkillEffects.expGainMultiplier *= 1.20; break;
    case 'ide': specialSkillEffects.fireRateMultiplier *= 0.85; break;
    case 'debugger': specialSkillEffects.sanDamageMultiplier *= 0.85; break;
    case 'version-control': specialSkillEffects.friendlyFireDamageMultiplier *= 0.80; break;
    case 'framework': specialSkillEffects.moveSpeedMultiplier *= 1.10; break;
    case 'library': specialSkillEffects.damageMultiplier *= 1.15; break;
    case 'orm': specialSkillEffects.scoreGainMultiplier *= 1.15; break;
    case 'auto-test': specialSkillEffects.sanDamageMultiplier *= 0.80; break;
    case 'cicd': specialSkillEffects.fireRateMultiplier *= 0.80; break;
    case 'build-automation': specialSkillEffects.firingFatigueMultiplier *= 0.80; break;
    case 'agile': specialDeadlineMultiplier *= 1.20; break;
    case 'devops': specialSkillEffects.partnerDamageMultiplier *= 1.15; break;
    case 'container': specialSkillEffects.moveSpeedMultiplier *= 1.15; break;
    case 'ai-code-completion': specialSkillEffects.fireRateMultiplier *= 0.70; break;
    case 'generative-ai': specialSkillEffects.damageMultiplier *= 1.30; break;
    // 'cloud'・'ai-agent' はここでは何もしない（習得時の直接加算・既存の専用ロジックで対応）
  }
}

// ランクが上がった瞬間、そのランクに紐づく役職スキルをすべて自動的に習得させる
function grantRankSkillsForRank(newRank) {
  recordPromotionForStats(`${newRank} ${rankNames[newRank - 1]}`);
  const skillsForRank = rankSkillDefs.filter(s => s.rank === newRank);
  if (skillsForRank.length === 0) return;
  skillsForRank.forEach(skill => {
    rankSkillLevels.add(skill.id);
    recordSkillAcquiredForStats(skill.name);
    if (skill.id === 'cloud') {
      // クラウド：器そのものが大きくなるイメージで、上限に直接+10する（一度だけ）
      maxSan += 10;
      maxLifespan += 10;
    }
  });
  recomputeSpecialSkillEffects();
  const skillNames = skillsForRank.map(s => s.name).join('・');
  showMessage(`昇進：${rank} ${rankNames[newRank - 1]}（${skillNames} を習得）`, 3400, '#ffd54f', '24px sans-serif');
}

// Scoreに応じて、ランクと役職スキルを継続的に（毎フレーム）自動更新する。
// 複数ランク分の条件を満たしていれば、飛び級で一気に昇格する
function checkAndApplyRankUp() {
  while (rank < rankNames.length && score >= rankThresholds[rank]) {
    rank++;
    grantRankSkillsForRank(rank);
  }
}

// 翌週の開始時（月曜日を迎えた瞬間）に、週次ノルマをリセットする
function startNewWeek() {
  resetWeeklyQuotaForNewWeek();
}

// ===== 日次進行・週次ノルマ判定・休日フロー =====

// 画面フェードアウト→残っている仕事（敵）の再配置→フェードインの演出を開始する。
// advanceFnは画面が暗転しきった瞬間に呼ばれ、実際の日付・カウンターの更新を行う
function startDayTransition(advanceFn) {
  dayTransitionPhase = 'out';
  dayTransitionTimer = dayTransitionDurationMs;
  dayTransitionAdvanceFn = advanceFn;
}

// 一日の終わりに、まだ片付いていない仕事（敵）を新しい位置へ配置し直す
function repositionRemainingEnemies() {
  for (const en of enemies) {
    let attempts = 0;
    let p;
    do {
      p = spawnEnemyOffscreen();
      attempts++;
      p.x += (Math.random() - 0.5) * 40;
      p.y += (Math.random() - 0.5) * 40;
      const tooClose = enemies.some(other => other !== en &&
        Math.hypot(other.x - p.x, other.y - p.y) < (other.radius + en.radius + 20)
      ) || Math.hypot(player.x - p.x, player.y - p.y) < 150;
      if (!tooClose) break;
    } while (attempts < 18);
    en.x = p.x;
    en.y = p.y;
    en.touching = false;
  }
}

// 通常の平日（または休日出勤中の土日）の終業処理。続行確認なしで自動的に翌日へ進む
// 一日の終わりの自然回復（脳疲労・SAN）を適用する。
// その日の夕方以降にコーヒー・栄養ドリンクを飲んでいた場合は、回復量が半分になる
function applyDayEndRecovery() {
  const recoveryRatio = eveningDrinkRecoveryPenalty ? 0.5 : 1;
  fatigue = Math.max(0, fatigue - dayFatigueRecover * recoveryRatio);
  san = Math.min(maxSan, san + daySanRecover * recoveryRatio);
  eveningDrinkRecoveryPenalty = false;
}

// 翌日が始まるタイミングで、前日から画面上に残っていた弾やアイテムを消す
function clearRemainingItemsAndBulletsForNewDay() {
  bullets.length = 0;
  chocolate = null;
  energyDrink = null;
  coffee = null;
  heartWall = null;
}

// ラスボス・中ボス・負けイベント戦闘などに突入する直前に呼び、画面上の弾・アイテム・
// 同僚の吹き出し（コメント）・一時メッセージ（文字表記）をいったんリセットしておく。
// 突入した瞬間に、直前までの表示物がそのまま持ち越されて画面がにぎやかになりすぎるのを防ぐ
function clearFieldBeforeEventBattle() {
  clearRemainingItemsAndBulletsForNewDay();
  messages.length = 0;
  partnerSpeechBubble = null;
}

function autoAdvanceDay() {
  clearRemainingItemsAndBulletsForNewDay();
  currentDate.setDate(currentDate.getDate() + 1);
  applyDayEndRecovery();
  resetPlayerAndPartnerPositionForNewDay();
  dayStartTime = gameClockMs;
  lastHourTime = gameClockMs;
  currentHour = dayStartHour;
  stunned = false;
  dayNumber++;
  synergyUsesToday = 0;
  energyDrinkDailyCount = 0;
  coffeeDailyCount = 0;
  coffeeStunImmunityCharges = 0;
  chocolateDailyCount = 0;
  if (partner.active) partner.chocolateDailyCount = 0;
  if (currentDate.getDay() === 1) {
    startNewWeek();
  }
  lastUpdate = Date.now();
}

// 週末（土日祝日）を飛ばして次の月曜から新しい週を始める
function jumpToNextMondayAndResetWeek() {
  clearRemainingItemsAndBulletsForNewDay();
  currentDate = nextMonday(currentDate);
  eveningDrinkRecoveryPenalty = false; // 休日を挟むため、このペナルティは持ち越さない
  resetPlayerAndPartnerPositionForNewDay();
  dayStartTime = gameClockMs;
  lastHourTime = gameClockMs;
  currentHour = dayStartHour;
  stunned = false;
  dayNumber++;
  synergyUsesToday = 0;
  energyDrinkDailyCount = 0;
  coffeeDailyCount = 0;
  coffeeStunImmunityCharges = 0;
  chocolateDailyCount = 0;
  if (partner.active) partner.chocolateDailyCount = 0;
  startNewWeek();
  lastUpdate = Date.now();
}

// 週の終わりを迎えたときに表示する、ノルマ達成時のフレーバーテキスト
const weekCompleteFlavorTexts = [
  '一週間が終わった！ようやく休日…',
  '長い一週間だった…やっと休日だ。',
  '今週も乗り切った！'
];

// 週の最終稼働日（金曜相当）の終業処理。ノルマ達成の可否で分岐する
function resolveWeekEnd() {
  const achieved = weeklyKills >= weeklyKillQuota || weeklyScoreGained >= weeklyScoreQuota;
  if (achieved) {
    const bonus = 10 + rank * 3;
    score += bonus;
    showMessage(`週間ノルマ達成！ Score +${bonus}`, 4000, '#69f0ae', '28px sans-serif');
    const flavor = weekCompleteFlavorTexts[Math.floor(Math.random() * weekCompleteFlavorTexts.length)];
    showMessage(flavor, 3000, '#ffe0b2', '22px sans-serif');
    applyRestActivity();
  } else {
    const scorePenalty = Math.ceil(score * weeklyFailScorePenaltyRatio);
    const sanPenalty = Math.ceil(maxSan * weeklyFailSanPenaltyRatio);
    score = Math.max(0, score - scorePenalty);
    damageSan(sanPenalty);
    showMessage(`週間ノルマ未達成… Score -${scorePenalty} / SAN -${sanPenalty}`, 4000, '#ff5252', '26px sans-serif');
    if (gameOver || deathSequence) return;
    weekendWorkChoice = true;
  }
}

// ===== 「同僚と遊ぶ」を選んだ時のアドベンチャーパート（簡易サウンドノベル） =====
// 現在進行中のシーン状態。null なら非表示
// lineFadePhase: 'in'（表示中のフェードイン中）→ null（安定表示）→（進める操作で）'out'（フェードアウト中）→次のブロックへ
let adventureState = null; // { scene, nodeId, onComplete, lineIndex, lineFadePhase, lineFadeTimerMs }
const adventureMinchoFont = '"Yu Mincho", "Hiragino Mincho ProN", "MS PMincho", serif';
const adventureLineFadeInDurationMs = 260;
const adventureLineFadeOutDurationMs = 200;

// 特定の特殊スキルを1レベル分だけ習得させる（アドベンチャーの選択肢報酬などに使う）
function grantSpecialSkillById(id) {
  const newLevel = (specialSkillLevels.get(id) || 0) + 1;
  specialSkillLevels.set(id, newLevel);
  recomputeSpecialSkillEffects();
}

function adjustPartnerRelationship(amount) {
  // 「固い絆」：関係性が低下するイベントを一切無効化する（上昇は今まで通り発生する）
  if (amount < 0 && dreamMemorySave.upgrades.unbreakableBond >= 1) return;
  partner.relationship = Math.max(0, Math.min(partnerRelationshipMax, partner.relationship + amount));
}

// 関係性の値を「良好／普通／悪い」の3段階に分類する（再会シーンの5段階のうち、tier1・2=良好／tier3=普通／tier4・5=悪い、と同じ閾値）
function getRelationshipCategory(relationship) {
  if (relationship >= 60) return 'good';
  if (relationship >= 40) return 'normal';
  return 'bad';
}

// アドベンチャーパートは週末ではなく、実際に一日を戦い切った日数（カフェイン摂取で倒れてスキップした日は含まない）が
// この日数に達するたびに、その日の終業時に発生する
const adventurePartDayInterval = 5;
let daysFoughtSinceLastAdventure = 0;
// 同僚が不在（未選択・離脱済み）の間や、一度もノーマルエンドを経ていない間は、
// 上の判定タイミングが来てもアドベンチャーパート（会話）には入らない。
// その代わり、この判定タイミングを迎えた回数（アドベンチャーパートが実際に発生したかどうかに関わらず数える）を数えておき、
// 第3回目のアドベンチャーパートに入るべきタイミングを迎えたら、同僚が不在なら孤独ENDへ、
// 同僚がいるが一度もノーマルエンドを経ていなければイベント戦（ノーマルルート負けイベント戦闘）へ至る
let adventureCheckpointCount = 0;
const adventureCheckpointCountForAdv3 = 3;

// ===== アドベンチャーパートの分岐状態（エンディング分岐は、好感度とアドベンチャーの選択肢だけで決まる） =====
let adventureRunCount = 0; // 「同僚と遊ぶ」を選んだ回数（ADV1・ADV2・ADV3・それ以降）
let adv1Choice = null; // ADV1で選んだ方 'A' | 'B'
let adv2Choice = null; // ADV2で選んだ方 'C' | 'D'（Aルート）または 'E' | 'F'（Bルート）
let relCategoryAtAdv1 = null; // ADV1突入時点の関係性カテゴリ
let relCategoryAtAdv2 = null; // ADV2突入時点の関係性カテゴリ
let relCategoryAtAdv3 = null; // ADV3突入時点の関係性カテゴリ
let dreamRouteCompleted = false; // ADV3で「夢の話をする」を選び、夢ルートを完走したか

function recordAdv1Choice(choice) { adv1Choice = choice; }
function recordAdv2Choice(choice) { adv2Choice = choice; }
function markDreamRouteCompleted() { dreamRouteCompleted = true; }

// ===== アドベンチャーパートに入る前に表示する「統計情報」画面の集計 =====
// 前回のアドベンチャーパートが終わってから（初回は初日から）、今回のアドベンチャーパートに入るまでの間に
// 起きたことを蓄積しておき、会話へ進む直前に一覧表示する。表示後、次の期間のために集計をリセットする
function createEmptyAdventureStatsTracker() {
  return {
    jobsDefeated: {}, // 撃破した「仕事」（通常の敵）の名前 → 件数
    fixedEnemiesDefeated: {}, // 撃退した固定敵（脅威）の名前 → 件数
    skillsAcquired: [], // 習得した特殊スキル・役職スキルの表示名（取得順）
    promotions: [] // 昇進した役職名（昇進順）
  };
}
let adventureStatsTracker = createEmptyAdventureStatsTracker();
function resetAdventureStatsTracker() {
  adventureStatsTracker = createEmptyAdventureStatsTracker();
}
function recordJobDefeatForStats(name) {
  if (!name) return;
  adventureStatsTracker.jobsDefeated[name] = (adventureStatsTracker.jobsDefeated[name] || 0) + 1;
}
function recordFixedEnemyDefeatForStats(name) {
  if (!name) return;
  adventureStatsTracker.fixedEnemiesDefeated[name] = (adventureStatsTracker.fixedEnemiesDefeated[name] || 0) + 1;
}
function recordSkillAcquiredForStats(label) {
  if (!label) return;
  adventureStatsTracker.skillsAcquired.push(label);
}
function recordPromotionForStats(rankName) {
  if (!rankName) return;
  adventureStatsTracker.promotions.push(rankName);
}

// アドベンチャーパートに入る直前に呼ぶ：これまでの集計を一覧表示し、
// 「会話に進む」が押されたら集計をリセットしてから実際にアドベンチャーパートを開始する
let adventureStatsSummaryActive = false;
let adventureStatsSummaryOnProceed = null;
function showAdventureStatsSummary(onProceed) {
  adventureStatsSummaryActive = true;
  adventureStatsSummaryOnProceed = onProceed;
}
function proceedFromAdventureStatsSummary() {
  if (!adventureStatsSummaryActive) return;
  adventureStatsSummaryActive = false;
  const onProceed = adventureStatsSummaryOnProceed;
  adventureStatsSummaryOnProceed = null;
  resetAdventureStatsTracker();
  if (onProceed) onProceed();
}

// 夢フラグ＝前世の関係性が良好・同じ組み合わせで2周目以降・ADV1〜3突入時すべて関係性良好、の全てを満たす場合のみ成立する
function isDreamFlagEligible() {
  const lastRun = dreamMemorySave.lastRun;
  const prelifeGood = !!(lastRun && getRelationshipCategory(lastRun.relationship) === 'good');
  return prelifeGood && shouldShowReunionScene() &&
    relCategoryAtAdv1 === 'good' && relCategoryAtAdv2 === 'good' && relCategoryAtAdv3 === 'good';
}

// 「通常2択」を選んだ後（またはADV4以降、選択肢なしで直接）現在の関係性で好感度ルート（⑨⑩⑪）へ振り分ける
function routeToRelationshipEnding() {
  const category = getRelationshipCategory(partner.relationship);
  const node = category === 'good' ? 'endGood' : category === 'normal' ? 'endNormal' : 'endBad';
  return { scene: 'endRoutes', node };
}

// 月末クリア時、TRUE END（ランク7の特殊選択）条件を満たさない場合の、関係性によるノーマルエンドの振り分け
function getNormalEndingByRelationship() {
  if (!partner.active) return 'normal2';
  const category = getRelationshipCategory(partner.relationship);
  return category === 'good' ? 'normal1' : category === 'normal' ? 'normal2' : 'normal3';
}

// これまでに一度でもノーマルエンド（normal1〜3のいずれか）に到達したことがあるかどうか
function hasEverReachedNormalEnd() {
  return !!(dreamMemorySave.endingsCleared.normal1 || dreamMemorySave.endingsCleared.normal2 ||
    dreamMemorySave.endingsCleared.normal3);
}

// シナリオデータ（partnerAdventureScenes）・言葉遣いの解決関数（resolveGenderedAdventureText）は
// adventureScenes.js に分離。index.html でこのファイルより先に読み込まれるグローバル変数として参照する。

// 「同僚と遊ぶ」アドベンチャーパートを開始する。終了後にonCompleteを呼んで元のゲームへ戻す。
// ADV1〜3は、これまでの選択（adv1Choice/adv2Choice）と、突入時点の関係性で入るシナリオが決まる。
// ADV4以降は選択肢を出さず、現在の関係性でそのまま好感度ルート（⑨⑩⑪）へ直行する
function startPartnerAdventure(onComplete) {
  // 既に別のアドベンチャーパートが進行中なら、二重に開始しない（安全のための保険）
  if (adventureState) return;
  adventureRunCount++;
  const completedRun = adventureRunCount;
  // 第1回・第2回のアドベンチャーパートを終えるごとに、夢の記憶ポイントが1貯まる
  // （第3回を経てノーマルエンドに至った場合の+5は、finishNormalEndSequence側で別途加算する）
  const wrappedOnComplete = () => {
    if (completedRun === 1 || completedRun === 2) {
      dreamMemorySave.points += dreamMemoryPointsForAdv1Or2;
      saveDreamMemorySave();
    }
    if (completedRun === 2) {
      // 第2回のアドベンチャーパートを終えて職場に戻った日から、強い敵寄りのバイアスをかけ始める
      adv2CompletedAtDay = dayNumber;
    }
    if (onComplete) onComplete();
  };
  const category = getRelationshipCategory(partner.relationship);
  let sceneKey, nodeId;
  if (adventureRunCount === 1) {
    relCategoryAtAdv1 = category;
    sceneKey = 'adv1';
  } else if (adventureRunCount === 2) {
    relCategoryAtAdv2 = category;
    sceneKey = adv1Choice === 'A' ? 'adv2A' : 'adv2B';
  } else if (adventureRunCount === 3) {
    relCategoryAtAdv3 = category;
    if (dreamMemorySave.upgrades.awakening >= 1) {
      // 「目覚め」：これまでの選択・関係性によらず、必ず夢ルートへ入る
      sceneKey = 'adv3Dream';
    } else if (adv1Choice === 'A' && adv2Choice === 'C') {
      sceneKey = isDreamFlagEligible() ? 'adv3Dream' : 'adv3AC';
    } else if (adv1Choice === 'A' && adv2Choice === 'D') {
      sceneKey = 'adv3AD';
    } else if (adv1Choice === 'B' && adv2Choice === 'E') {
      sceneKey = 'adv3BE';
    } else {
      sceneKey = 'adv3BF';
    }
  } else {
    // ADV4以降：選択肢なしの一本道。現在の関係性でルートを直接決める
    const routed = routeToRelationshipEnding();
    sceneKey = routed.scene;
    nodeId = routed.node;
  }
  const scene = partnerAdventureScenes[sceneKey];
  if (nodeId === undefined) nodeId = scene.start;
  // history：スレッド形式で表示する、これまでの同僚・自分のメッセージ履歴（性別に応じた言葉遣いに解決してから積む）
  const partnerGender = partnerGenderById[selectedPartnerIcon];
  adventureState = {
    scene, nodeId, onComplete: wrappedOnComplete, lineIndex: 0,
    lineFadePhase: 'in', lineFadeTimerMs: 0,
    history: [{ speaker: 'partner', text: resolveGenderedAdventureText(scene.nodes[nodeId].text, partnerGender) }]
  };
}

// choice.next を実際の遷移先 { scene, nodeId } に解決する。
// next は 文字列（同じシーン内のノードid）／関数（動的に上記のいずれかを返す）／{ scene, node } のいずれかを取り得る
function resolveAdventureNextTarget(nextValue) {
  const resolved = typeof nextValue === 'function' ? nextValue() : nextValue;
  if (!resolved) return null;
  if (typeof resolved === 'string') return { scene: adventureState.scene, nodeId: resolved };
  return { scene: partnerAdventureScenes[resolved.scene], nodeId: resolved.node };
}

// アドベンチャーパートの選択肢を選ぶ。次のノードがあれば進み、なければ終了してonCompleteへ
function chooseAdventureOption(choiceIndex) {
  if (!adventureState) return;
  const node = adventureState.scene.nodes[adventureState.nodeId];
  const choice = node.choices[choiceIndex];
  if (!choice) return;
  // 選んだ選択肢を、自分の発言（自機の性別に応じた言葉遣い）としてスレッドに積む
  adventureState.history.push({ speaker: 'player', text: resolveGenderedAdventureText(choice.label, selectedGender) });
  if (choice.effects) choice.effects();
  const target = choice.next ? resolveAdventureNextTarget(choice.next) : null;
  if (target) {
    adventureState.scene = target.scene;
    adventureState.nodeId = target.nodeId;
    adventureState.lineIndex = 0; // 新しいノードに入ったら、文単位の表示を最初からやり直す
    adventureState.lineFadePhase = 'in';
    adventureState.lineFadeTimerMs = 0;
    // 次のノードの本文を、同僚の発言（同僚の性別に応じた言葉遣い）としてスレッドに積む
    const partnerGender = partnerGenderById[selectedPartnerIcon];
    adventureState.history.push({
      speaker: 'partner',
      text: resolveGenderedAdventureText(target.scene.nodes[target.nodeId].text, partnerGender)
    });
  } else {
    const onComplete = adventureState.onComplete;
    adventureState = null;
    if (onComplete) onComplete();
  }
}

// 休日の過ごし方（アドベンチャーパートは週末ではなく、実際に働いた日数に応じてendWorkday側で発生する）
function applyRestActivity() {
  // 万一、既にアドベンチャーパート中／その暗転演出・統計情報画面中に二重に呼ばれても、二重に開始しないようにする
  if (adventureState || setupFadePhase || adventureStatsSummaryActive) return;
  if (partner.active) {
    // アドベンチャーパートはここでは発生させず、同僚と休日を過ごして関係性が少し良くなる、という扱いにする
    adjustPartnerRelationship(partnerRelationshipDailyRecovery);
    showAcknowledgementNotice('同僚と一緒に休日を過ごし、関係が少し良くなった。', '#ffcc80', '',
      () => finishRestDayAndAdvanceToMonday());
  } else if (partnerLossReason === 'lifespan') {
    // 寿命が尽きての離脱はもう戻らない。会いに行った虚しさで自機のSANが大きく削れる
    san = Math.max(0, Math.floor(san * partnerLossGriefSanRatio));
    checkVitalsGameOver();
    showAcknowledgementNotice(
      '同僚に会いに行った。……しかし、もうそこに同僚はいない。静かな部屋を前に、言葉を失う。 SANが半分になった',
      '#78909c', '',
      () => { if (!gameOver && !deathSequence) finishRestDayAndAdvanceToMonday(); }
    );
  } else if (partnerLossReason === 'san') {
    if (Math.random() < partnerRevivalChance) {
      partner.active = true;
      partner.san = partnerRevivalSan;
      partner.lifespan = Math.max(1, Math.floor(partnerLifespanAtLoss * partnerRevivalLifespanRatio));
      partner.fatigue = 0;
      partner.highFatigueTimerMs = 0;
      partner.lowSanTimerMs = 0;
      partner.fatigueResting = false;
      partner.friendlyFireInvincibleTimer = 0;
      partner.invincible = false;
      partner.invincibleTimer = 0;
      partner.wandering = false;
      partner.wanderTimer = 1800 + Math.random() * 2200;
      partner.fireTimer = partnerBaseFireRate;
      partner.relationship = partnerRelationshipInitial;
      partner.x = player.x + partnerFollowOffsetX;
      partner.y = player.y + partnerFollowOffsetY;
      partnerLossReason = null;
      showAcknowledgementNotice('同僚に会いに行くと、元気を取り戻して戻ってきてくれた！', '#69f0ae', '',
        () => finishRestDayAndAdvanceToMonday());
    } else {
      showAcknowledgementNotice('同僚に会いに行ったが、まだ本調子ではないようだ…', '#b0bec5', '',
        () => finishRestDayAndAdvanceToMonday());
    }
  } else {
    showAcknowledgementNotice('同僚と遊び、関係が少し良くなった。', '#ffcc80', '',
      () => finishRestDayAndAdvanceToMonday());
  }
}

// SAN増減・スキル習得・スキル忘却などのランダムイベントを1つ抽選して適用する
const restRandomEvents = [
  { text: '友人とカフェで気分転換。SAN +10', weight: 3, apply: () => { san = Math.min(maxSan, san + 10); } },
  { text: '前日の疲れが抜けず、少し憂うつ。SAN -8', weight: 2, apply: () => damageSan(8) },
  { text: '資格の勉強がはかどり、ふと閃きを得た！特殊スキルを1つ習得', weight: 2, apply: () => grantRandomSkillLevel() },
  { text: '燃え尽き気味で、覚えていたスキルを一つ忘れてしまった…', weight: 1, apply: () => forgetRandomSkill() },
  { text: '趣味に没頭してリフレッシュ。SAN +15', weight: 2, apply: () => { san = Math.min(maxSan, san + 15); } },
  { text: '休日出勤の夢を見てうなされた。SAN -12', weight: 1, apply: () => damageSan(12) },
  { text: 'ボーッとしていたら、あっという間に休日が終わった。', weight: 3, apply: () => {} }
];
function triggerRandomRestEvent() {
  const total = restRandomEvents.reduce((a, ev) => a + ev.weight, 0);
  let r = Math.random() * total;
  for (const ev of restRandomEvents) {
    r -= ev.weight;
    if (r <= 0) {
      ev.apply();
      showMessage(ev.text, 3000, '#ce93d8', '20px sans-serif');
      break;
    }
  }
}

function grantRandomSkillLevel() {
  const grantable = specialSkills.filter(s =>
    !(s.maxLevel && (specialSkillLevels.get(s.id) || 0) >= s.maxLevel));
  if (grantable.length === 0) return;
  const skill = grantable[Math.floor(Math.random() * grantable.length)];
  const newLevel = (specialSkillLevels.get(skill.id) || 0) + 1;
  specialSkillLevels.set(skill.id, newLevel);
  recomputeSpecialSkillEffects();
}

function forgetRandomSkill() {
  const learned = [...specialSkillLevels.entries()].filter(([, lvl]) => lvl > 0);
  if (learned.length === 0) return;
  const [id, lvl] = learned[Math.floor(Math.random() * learned.length)];
  if (lvl - 1 <= 0) {
    specialSkillLevels.delete(id);
  } else {
    specialSkillLevels.set(id, lvl - 1);
  }
  recomputeSpecialSkillEffects();
}

// 休日の過ごし方＋ランダムイベントの後、月曜まで日付を進めてゲームを再開する
function finishRestDayAndAdvanceToMonday() {
  triggerRandomRestEvent();
  if (gameOver || deathSequence) return;
  startDayTransition(jumpToNextMondayAndResetWeek);
}

// ===== 画面上に表示する一時メッセージ =====
const messages = [];
function showMessage(text, ttl = 2000, color = 'white', font = '20px sans-serif', options = {}) {
  messages.push({ text, ttl, initialTtl: ttl, color, font, ...options });
}

// 昇進や知識獲得など、確認するまでゲームを止める重要通知
let acknowledgementNotice = null;
const acknowledgementQueue = [];
function showAcknowledgementNotice(text, color = '#fff59d', detail = '', onAcknowledge = null) {
  const notice = { text, color, detail, onAcknowledge };
  if (acknowledgementNotice) acknowledgementQueue.push(notice);
  else acknowledgementNotice = notice;
  mouseFireHeld = false;
}

function resumeFromAcknowledgement() {
  const finished = acknowledgementNotice;
  acknowledgementNotice = acknowledgementQueue.shift() || null;
  lastUpdate = Date.now();
  if (finished && finished.onAcknowledge) finished.onAcknowledge();
}

function getAllowedMaxTypeIndexByRank() {
  // ランク1～7を敵番号0～9へ対応させる（低ランクでは弱い敵だけ出す）
  // ※ rankNames はこの関数より後で定義されるが、ゲーム開始時の最初のスポーンでも呼ばれるため定数7を直接使う
  const maxIdx = Math.floor((rank / 7) * (enemyTypeNames.length - 1));
  let capped = Math.max(0, Math.min(enemyTypeNames.length - 1, maxIdx));
  // 週のノルマを早期達成した週は、残りの期間は易しい仕事のみにする
  if (weeklyQuotaAchievedEarly) capped = Math.min(capped, 1);
  return capped;
}

// 納期が0になった敵を爆発させ、従来の半分（接触時の1.5倍）のSANダメージを与える
function explodeEnemy(enemyIndex) {
  const enemy = enemies[enemyIndex];
  if (!enemy) return;

  const skillMitigation = Math.max(0.5, 1 - skillLevel * 0.04);
  const explosionDamage = Math.ceil(
    (enemy.type || 1) * contactSanMultiplier * skillMitigation * 1.5 *
    specialSkillEffects.sanDamageMultiplier * getEnemyDifficultyMultiplier()
  );

  damageSan(explosionDamage);
  enemies.splice(enemyIndex, 1);
  explosionFlashTimer = explosionEffectDuration;
  explosionShakeTimer = explosionEffectDuration;
  showMessage(`納期経過！ SAN -${explosionDamage}`, 1200, '#ff5252', '28px sans-serif');

  if (!gameOver && countActiveWorkEnemies() === 0) {
    waveCooldownMs = waveCooldownDelayMs;
  }
}

// 弾を介さず、敵を即座に1体撃破する（「AIエージェント」など特殊な倒し方から使う共通処理）
function defeatEnemyInstantly(enemyIndex) {
  const en = enemies[enemyIndex];
  if (!en) return;
  const pts = Math.ceil(en.type * 3 * specialSkillEffects.scoreGainMultiplier);
  score += pts;
  exp += en.type * 5 * specialSkillEffects.expGainMultiplier;
  updateSkillEffects();
  spawnHitSpark(en.x, en.y, true);
  recordJobDefeatForStats(en.text);
  enemies.splice(enemyIndex, 1);
  weeklyKills++;
  weeklyScoreGained += pts;
  checkEarlyQuotaAchievement();
  if (countActiveWorkEnemies() === 0) waveCooldownMs = waveCooldownDelayMs;
}

// ===== 各種選択の実行処理（キーボード・タップ両方から呼ばれる） =====
// 自機の性別を選ぶ。選んだ画像をそのまま自機のアイコンとしても使い、
// ひとことメッセージのあと同僚のアイコン選択画面へ進む
function selectGender(genderId) {
  if (setupFadePhase) return;
  selectedGender = genderId;
  selectedPlayerIcon = genderId;
  startSetupFadeOut(() => {
    // 前回ノーマルエンドを迎えており、かつ前回と同じ自機を選んだ場合だけ、特別なあいさつ文にする
    const lastRun = dreamMemorySave.lastRun;
    const isRepeatingAfterNormalEnd = !!(lastRun && typeof lastRun.endingType === 'string' &&
      lastRun.endingType.startsWith('normal') && lastRun.playerGender === genderId);
    const line = isRepeatingAfterNormalEnd
      ? '…繰り返し、同じ夢を、見ている…？'
      : playerIconGreetingLines[Math.floor(Math.random() * playerIconGreetingLines.length)];
    startIconGreeting(genderId, line, () => { setupStep = 'partner-icon'; }, genderImageElements[genderId]);
  });
}

// 同僚のアイコンを選ぶ（nullなら「同僚なし」）。選択後、ひとことメッセージを挟んでゲームを開始する
function selectPartnerIcon(icon) {
  selectedPartnerIcon = icon;
  if (icon === null) {
    setupStep = null;
    startGameAfterGreeting();
    return;
  }
  const greetingLines = partnerGenderById[icon] === 'female'
    ? partnerIconGreetingLinesFemale
    : partnerIconGreetingLinesMale;
  const line = greetingLines[Math.floor(Math.random() * greetingLines.length)];
  startIconGreeting(icon, line, () => { setupStep = null; startGameAfterGreeting(); }, partnerIconImageElements[icon]);
}

// タイトル画面の「3倍加速モード」トグルの状態に応じて時間倍率を決め、自機の性別選択画面へ進む
function selectMode() {
  gameTimeScale = threeXModeEnabled ? 3 : 1;
  startScreen = false;
  setupStep = 'gender';
}

// 操作キャラ選択画面の「戻る」：タイトル画面に戻る
function backToTitleFromGenderSelect() {
  setupStep = null;
  startScreen = true;
}

// 同僚選択画面の「戻る」：操作キャラ選択画面に戻る
function backToGenderSelectFromPartnerSelect() {
  setupStep = 'gender';
}

// タイトル画面の「夢の記憶ポイントで強化」でレベルを購入・払い戻し（思い直す）した内容を、
// これから始まるゲームの初期値に反映する。これらの値はスクリプト読み込み時に一度だけ計算されるため、
// ゲーム開始直前に呼び直さないと、同じページを読み込んだままショップで変更した内容が実際のプレイに反映されないバグがあった
function applyDreamMemoryUpgradesForNewGame() {
  // 周回プレイの引き継ぎ：前回終了時のScoreをそのまま初期値にする
  score = dreamMemorySave.carriedScore || 0;
  maxFatigue = 100;
  baseBulletDamage = 20;
  maxSan = dreamMemorySave.upgrades.dreamCatcher >= 1 ? 25 : 100;
  maxLifespan = 100;
  // 周回プレイの引き継ぎ：前回終了時の役職（ランク）・役職スキルを復元する（「クラウド」のSAN・寿命上限+10も再適用する）
  rank = dreamMemorySave.carriedRank || 1;
  rankSkillLevels.clear();
  (dreamMemorySave.carriedRankSkillIds || []).forEach(id => {
    rankSkillLevels.add(id);
    if (id === 'cloud') {
      maxSan += 10;
      maxLifespan += 10;
    }
  });
  san = maxSan;
  lifespan = maxLifespan;
  skillLevel = 0;
  partnerRelationshipInitial = 50;
  weeklyQuotaEaseMultiplier = 1;
  partnerParryChance = Math.min(1, 0.3 + dreamMemorySave.upgrades.partnerAutoParry * 0.14);
  player.speed = 6; // 初期速度（以前の設定の150%）
  // 夢の記憶ポイントで事前に強化した特殊スキルを、DAY1から習得済みの状態で始める
  specialSkillLevels.clear();
  specialSkills.forEach(skill => {
    const preLevel = Math.min(getSpecialSkillPreLevel(skill.id), skill.maxLevel);
    if (preLevel > 0) specialSkillLevels.set(skill.id, preLevel);
  });
  recomputeSpecialSkillEffects();
}

// 性別・アイコンの選択が完了した時点で、実際にゲームを開始する
function beginGameplay() {
  applyDreamMemoryUpgradesForNewGame();
  gameClockMs = 0;
  lastUpdate = Date.now();
  lastHourTime = 0;
  dayStartTime = 0;
  dayNumber = 1;
  resetWeeklyQuotaForNewWeek();
  initPartner();
  // 「自己犠牲」「献身」は1周回につき1回だけ発動できる特殊行動なので、新しい周回の開始時にリセットする
  selfSacrificeUsedThisRun = false;
  devotionUsedThisRun = false;
  // 「激励A」「激励B」のクールダウンも、新しい周回の開始時にリセットする
  encourageANextAvailableAtMs = 0;
  encourageBNextAvailableAtMs = 0;
  // 残機・復活演出も、新しい周回の開始時にリセットする
  playerLivesRemaining = maxExtraLives;
  partnerLivesRemaining = maxExtraLives;
  playerReviveTimerMs = 0;
  // 前回と同じ自機・同僚で始めた場合、関係性は前回終了時の値+20から始まる
  // （分岐等に影響するのは100までだが、余裕を持たせて120まで許容する）
  if (shouldShowReunionScene()) {
    partner.relationship = Math.min(120, dreamMemorySave.lastRun.relationship + 20);
  }
  // 同僚の挨拶が終わった直後は、いきなり操作可能にせず、他の日と同様にまず「DAY 1」の
  // クリック待ち画面を表示してからゲームを始める（暗転からのフェードアウトは不要なので、直接waitingにする）
  dayTransitionPhase = 'waiting';
  dayTransitionWaitingTimerMs = 0;
}

// 週間ノルマ未達成時：休日出勤するか休むかを処理する
function handleWeekendWorkChoice(choice) {
  if (choice === 'work') {
    // 出勤：土日をまとめて通常の稼働日として続ける
    weekendWorkChoice = false;
    startDayTransition(autoAdvanceDay);
  } else if (choice === 'rest') {
    // 休む：評価がさらに下がり、休日の過ごし方を選ぶ
    weekendWorkChoice = false;
    const extraPenalty = Math.ceil(score * restEvaluationPenaltyRatio);
    score = Math.max(0, score - extraPenalty);
    showMessage(`評価ダウン… Score -${extraPenalty}`, 3000, '#ff8a65', '22px sans-serif');
    applyRestActivity();
  }
}

// ===== キーボード入力 =====
// 押されているキーを true / false で記録する
const keys = {};
document.addEventListener("keydown", (event) => {
  if (acknowledgementNotice) return;
  // 特殊スキル選択中は数字キー1～3だけを受け付ける
  if (specialSkillSelectionActive) {
    const choiceIndex = Number(event.key) - 1;
    if (choiceIndex >= 0 && choiceIndex < specialSkillChoices.length) {
      chooseSpecialSkill(choiceIndex);
    }
    return;
  }
  // アイコン選択後のひとことメッセージ演出中は、フェードして次へ進むまで入力を受け付けない
  if (iconGreetingPhase) return;
  // 前回と同じ自機・同僚で始めた時の再会シーン中は、クリック／タップでのみ進める
  if (reunionSceneActive) return;
  // 「同僚と遊ぶ」アドベンチャーパート中：本文がまだ続く間は数字キーでも次へ進め、
  // 最後のブロックまで進んだ後だけ、数字キーで選択肢を選べるようにする
  if (adventureState) {
    const node = adventureState.scene.nodes[adventureState.nodeId];
    const partnerGender = partnerGenderById[selectedPartnerIcon];
    const bodyText = resolveGenderedAdventureText(node.text, partnerGender);
    const lineBlocks = bodyText.split('\n');
    if ((adventureState.lineIndex || 0) < lineBlocks.length - 1) {
      // フェード中（表示しきる／消えきる前）の連打では進めず、安定表示中だけ次のブロックへのフェードアウトを始める
      if (!adventureState.lineFadePhase) {
        adventureState.lineFadePhase = 'out';
        adventureState.lineFadeTimerMs = 0;
      }
      return;
    }
    const idx = Number(event.key) - 1;
    if (idx >= 0 && idx < node.choices.length) chooseAdventureOption(idx);
    return;
  }
  // 起動時のセットアップ画面：まず自機の性別を選ぶ
  if (setupStep === 'gender') {
    const idx = Number(event.key) - 1;
    if (idx >= 0 && idx < genderChoices.length) selectGender(genderChoices[idx].id);
    return;
  }
  if (setupStep === 'partner-icon') {
    if (event.key === '0') {
      selectPartnerIcon(null);
      return;
    }
    const idx = Number(event.key) - 1;
    if (idx >= 0 && idx < partnerIconChoices.length) selectPartnerIcon(partnerIconChoices[idx]);
    return;
  }

  if (gameOver || gameClear) {
    return;
  }
  // 週間ノルマ未達成時：休日出勤するかどうかの選択
  if (weekendWorkChoice) {
    if (event.key === 'y') {
      handleWeekendWorkChoice('work');
    } else if (event.key === 'n') {
      handleWeekendWorkChoice('rest');
    }
    return;
  }
  // 休日出勤中にノルマを達成：家に帰るかどうかの選択
  if (weekendWorkQuotaChoice) {
    if (event.key === 'y') {
      handleWeekendWorkQuotaChoice(true);
    } else if (event.key === 'n') {
      handleWeekendWorkQuotaChoice(false);
    }
    return;
  }
  // 18時に固定敵（脅威）が残っている：残業するかどうかの選択
  if (fixedEnemyOvertimeChoiceActive) {
    if (event.key === 'y') {
      handleFixedEnemyOvertimeChoice(true);
    } else if (event.key === 'n') {
      handleFixedEnemyOvertimeChoice(false);
    }
    return;
  }
  // 休日出勤中（土日）は、Hキーでいつでも切り上げて帰宅できる
  if ((currentDate.getDay() === 0 || currentDate.getDay() === 6) &&
      dayTransitionPhase === null && event.key.toLowerCase() === 'h') {
    goHomeFromWeekendWork();
    return;
  }
  // スタート画面では、1 / Enterキーで開始する（夢の記憶ポイントの強化画面・リセット確認中は無効）
  if (startScreen && !dreamMemoryShopActive && !specialSkillPreShopActive && !titleResetConfirmActive) {
    if (event.key === '1' || event.key === 'Enter') {
      selectMode();
    }
    return;
  }
  if (dreamMemoryShopActive && event.key === 'Escape') {
    dreamMemoryShopActive = false;
    return;
  }
  if (specialSkillPreShopActive && event.key === 'Escape') {
    specialSkillPreShopActive = false;
    return;
  }

  if (gameOver || gameClear) {
    return;
  }

  if (event.key === 'p') {
    if (wakeUpConfirmActive) return; // 確認ダイアログ表示中はPキーでの再開を無視する
    isPaused = !isPaused;
      lastUpdate = Date.now();
    return;
  }
  // Fキーで自動攻撃のON/OFFを切り替える
  if (event.key === 'f') {
    autoFireEnabled = !autoFireEnabled;
  }
  // スペースキーで、タイミングよく振るとパリィ（同僚弾のはじき返し）を試みる（キーリピートでの連発は防ぐ）
  if (event.key === ' ' && !event.repeat) {
    event.preventDefault();
    attemptDeflectPartnerBullet();
  }
  keys[event.key] = true;
});
document.addEventListener("keyup", (event) => {
  keys[event.key] = false;
});

// ===== マウス／タッチによる移動・照準・攻撃 =====
// ブラウザ上の座標をCanvas内部の座標へ変換する
function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height)
  };
}

// マウス操作時：ポインタ位置がそのまま照準方向になる（PCでの挙動は変更しない）
function updateMousePosition(event) {
  const p = getCanvasPoint(event);
  mousePosition.x = p.x;
  mousePosition.y = p.y;
  player.angle = Math.atan2(
    mousePosition.y - player.y,
    mousePosition.x - player.x
  );
}

// タッチでの移動・攻撃は画面外の専用コントロール（#moveJoystick / #btnMobileFire）が担当するため、
// キャンバス上のポインタ操作はマウスのときだけ従来通り扱う（タップはメニュー用のclickイベントで別途処理する）
const touchMoveVector = { x: 0, y: 0 }; // ジョイスティックの入力方向・強さ（-1〜1）

canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'mouse') updateMousePosition(event);
});
// マウスの左ボタンを押した地点がアイテムの上なら、発射は行わずその場でアイテムだけを取得する
// （setPointerCaptureより前に判定するため、この場合はboolean変数でclickイベント側に伝える）
let itemConsumedByPointerDown = false;
canvas.addEventListener('pointerdown', (event) => {
  if (event.pointerType !== 'mouse' || event.button !== 0) return;
  updateMousePosition(event);
  if (isInCoreGameplayForClickActions() && tryCollectItemAtPoint(getCanvasPoint(event))) {
    itemConsumedByPointerDown = true;
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  mouseFireHeld = true;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointerup', (event) => {
  if (event.pointerType === 'mouse' && event.button === 0) mouseFireHeld = false;
});
canvas.addEventListener('pointercancel', (event) => {
  if (event.pointerType === 'mouse') mouseFireHeld = false;
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

// ===== 画面外の移動ジョイスティック（#moveJoystick、アナログ入力） =====
// 指が土台の中心からどれだけ・どの方向に離れているかで touchMoveVector（-1〜1）を求める。
// 感度は高めにしてあり、moveJoystickSensitivityRadiusぶん動かしただけで最大速度に達する
// （ノブ自体の見た目上の可動範囲はmoveJoystickVisualMaxOffsetまでで、それより指が離れても追従は頭打ちになる）
const moveJoystickEl = document.getElementById('moveJoystick');
const moveJoystickKnobEl = document.getElementById('moveJoystickKnob');
const moveJoystickSensitivityRadius = 26;
const moveJoystickVisualMaxOffset = 45;
let moveJoystickPointerId = null;

function updateJoystickKnobPosition(offsetX, offsetY) {
  moveJoystickKnobEl.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
}

function resetJoystick() {
  touchMoveVector.x = 0;
  touchMoveVector.y = 0;
  updateJoystickKnobPosition(0, 0);
}

function handleJoystickMove(event) {
  const rect = moveJoystickEl.getBoundingClientRect();
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const magnitude = Math.min(1, dist / moveJoystickSensitivityRadius);
  touchMoveVector.x = magnitude > 0 ? Math.cos(angle) * magnitude : 0;
  touchMoveVector.y = magnitude > 0 ? Math.sin(angle) * magnitude : 0;
  const visualDist = Math.min(moveJoystickVisualMaxOffset, dist);
  updateJoystickKnobPosition(Math.cos(angle) * visualDist, Math.sin(angle) * visualDist);
}

moveJoystickEl.addEventListener('pointerdown', (event) => {
  moveJoystickPointerId = event.pointerId;
  moveJoystickEl.setPointerCapture(event.pointerId);
  handleJoystickMove(event);
  event.preventDefault();
});
moveJoystickEl.addEventListener('pointermove', (event) => {
  if (event.pointerId !== moveJoystickPointerId) return;
  handleJoystickMove(event);
  event.preventDefault();
});
const releaseJoystick = (event) => {
  if (event.pointerId !== moveJoystickPointerId) return;
  moveJoystickPointerId = null;
  resetJoystick();
};
moveJoystickEl.addEventListener('pointerup', releaseJoystick);
moveJoystickEl.addEventListener('pointercancel', releaseJoystick);

// ===== ゲームコントローラー対応（Gamepad API） =====
// 左スティック＝移動（オンスクリーンのジョイスティックを操作していない間だけ反映）、右スティック＝照準、
// R2/RTまたはAボタン＝連射、Bボタン＝パリィ（押した瞬間のみ）、Startボタン＝ポーズ（押した瞬間のみ）
const gamepadStickDeadzone = 0.2;
let gamepadFireHeld = false;
let gamepadAimActive = false; // 右スティックが一定以上倒れている間、trueになる
let gamepadAimAngle = 0;
let gamepadParryHeldLastFrame = false;
let gamepadPauseHeldLastFrame = false;

function pollGamepadInput() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = pads && pads[0];
  gamepadAimActive = false;
  gamepadFireHeld = false;
  if (!pad) return;

  // 左スティック：オンスクリーンのジョイスティックを操作していない間だけ、移動に反映する
  if (moveJoystickPointerId === null) {
    const lx = pad.axes[0] || 0;
    const ly = pad.axes[1] || 0;
    if (Math.hypot(lx, ly) > gamepadStickDeadzone) {
      touchMoveVector.x = lx;
      touchMoveVector.y = ly;
    } else {
      touchMoveVector.x = 0;
      touchMoveVector.y = 0;
    }
  }

  // 右スティック：一定以上倒れている間だけ、その方向を照準にする
  const rx = pad.axes[2] || 0;
  const ry = pad.axes[3] || 0;
  if (Math.hypot(rx, ry) > gamepadStickDeadzone) {
    gamepadAimActive = true;
    gamepadAimAngle = Math.atan2(ry, rx);
  }

  // 発射（R2/RT、またはAボタン。押している間ずっと連射する）
  gamepadFireHeld = !!(pad.buttons[7] && pad.buttons[7].pressed) || !!(pad.buttons[0] && pad.buttons[0].pressed);

  if (!gameOver && !gameClear) {
    // パリィ（Bボタン）：押した瞬間だけ発動する（押しっぱなしでの連発は防ぐ）
    const parryPressed = !!(pad.buttons[1] && pad.buttons[1].pressed);
    if (parryPressed && !gamepadParryHeldLastFrame) attemptDeflectPartnerBullet();
    gamepadParryHeldLastFrame = parryPressed;

    // ポーズ（Startボタン）：押した瞬間だけ切り替える
    const pausePressed = !!(pad.buttons[9] && pad.buttons[9].pressed);
    if (pausePressed && !gamepadPauseHeldLastFrame && !wakeUpConfirmActive) {
      isPaused = !isPaused;
      lastUpdate = Date.now();
    }
    gamepadPauseHeldLastFrame = pausePressed;
  }
}

// ===== 画面外の攻撃ボタン（#btnMobileFire） =====
// 押している間だけ連射する、単純なボタン（向きはスマホ用の自動照準設定で決まる）
const mobileFireEl = document.getElementById('btnMobileFire');
mobileFireEl.addEventListener('pointerdown', (event) => {
  mouseFireHeld = true;
  event.preventDefault();
});
function releaseMobileFireButton() {
  mouseFireHeld = false;
}
mobileFireEl.addEventListener('pointerup', releaseMobileFireButton);
mobileFireEl.addEventListener('pointercancel', releaseMobileFireButton);
mobileFireEl.addEventListener('pointerleave', releaseMobileFireButton);

// ===== 画面外のパリィボタン（#btnMobileParry、連射ボタンの上に配置） =====
// 押すたびにパリィ（同僚弾のはじき返し）を試みる。Spaceキーと同じ処理を呼ぶ
const mobileParryEl = document.getElementById('btnMobileParry');
mobileParryEl.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  attemptDeflectPartnerBullet();
});

// ===== スマホ用：自動で最寄りの敵の方に向く設定（タイトル画面のボタンで切り替え、端末に保存する） =====
const mobileAutoAimStorageKey = 'vamSurvLike_mobileAutoAim_v1';
let mobileAutoAimEnabled = (() => {
  try {
    return localStorage.getItem(mobileAutoAimStorageKey) === '1';
  } catch (e) {
    return false;
  }
})();
function setMobileAutoAimEnabled(enabled) {
  mobileAutoAimEnabled = enabled;
  try {
    localStorage.setItem(mobileAutoAimStorageKey, enabled ? '1' : '0');
  } catch (e) {
    // localStorageが使えない環境では、切り替えのみ有効にして保存は諦める
  }
}
// 自機から最も近い敵を返す（いなければnull）
function findNearestEnemyTo(x, y) {
  return enemies.reduce((closest, candidate) => {
    const d = Math.hypot(candidate.x - x, candidate.y - y);
    return (!closest || d < closest.d) ? { en: candidate, d } : closest;
  }, null);
}
function findNearestEnemyToPlayer() {
  return findNearestEnemyTo(player.x, player.y);
}

// パリィで弾いた弾を、指定した地点から見て最も近い敵へ向け直し、ダメージを2倍にする共通処理
const playerBaseBulletSpeed = 6; // 自機の弾発射速度の基本値（処理速度Bの効果は別途bulletSpeedMultiplierで乗算する）
const parryBulletSpeedMultiplier = 3; // パリィ（オートパリィ含む）した弾は、元の速度に関係なく自機の弾発射速度の300%に固定する
function performBulletParry(bullet, fromX, fromY, actorAngle, isAuto = false) {
  // 援護弾は、通常のパリィ（打ち返し）ではなく専用の救済処理へ振り分ける
  if (bullet.owner === 'support') {
    triggerSupportBulletRescue(bullet);
    return;
  }
  // 自機の弾発射速度（処理速度Bの効果を含む）を基準に、パリィした弾の速度を固定する
  const speed = playerBaseBulletSpeed * specialSkillEffects.bulletSpeedMultiplier * parryBulletSpeedMultiplier;
  let angle;
  if (bullet.stage3Reflected) {
    // 第3段階「確証バイアス」に跳ね返された弾は、再度パリィしてもランダムな方向へ飛ぶ
    angle = Math.random() * Math.PI * 2;
  } else if (bullet.sourceHole && !bullet.sourceHole.destroyed &&
      (bullet.sourceHoleKind === 'midBoss' ? midBossEvent : bossEvent)) {
    // ラスボス・中ボス弾は、それを撃った発射口へ打ち返す
    const holePos = bullet.sourceHoleKind === 'midBoss'
      ? getMidBossHoleAbsolutePosition(bullet.sourceHole)
      : getBossHoleAbsolutePosition(bullet.sourceHole);
    angle = Math.atan2(holePos.y - bullet.y, holePos.x - bullet.x);
  } else if ((bullet.owner === 'fixedEnemy' || bullet.owner === 'fixedEnemyDisguise') && fixedEnemies.length > 0) {
    // 固定敵の弾は、最も近い固定敵本体へ打ち返す
    const nearestFixedEnemy = fixedEnemies.reduce((closest, fx) => {
      const d = Math.hypot(fx.x - bullet.x, fx.y - bullet.y);
      return (!closest || d < closest.d) ? { fx, d } : closest;
    }, null).fx;
    angle = Math.atan2(nearestFixedEnemy.y - bullet.y, nearestFixedEnemy.x - bullet.x);
  } else {
    const nearest = findNearestEnemyTo(fromX, fromY);
    if (nearest) {
      angle = Math.atan2(nearest.en.y - bullet.y, nearest.en.x - bullet.x);
    } else if (bullet.owner === 'player' && bullet.bouncesUsed >= 1 && (bossEvent || midBossEvent)) {
      // ネットワークスペシャリスト：通常の敵がいない場合、ラスボス・中ボスのランダムな発射口へ向かう
      const holes = (bossEvent ? bossEvent.holes : midBossEvent.holes).filter(h => !h.destroyed);
      if (holes.length > 0) {
        const hole = holes[Math.floor(Math.random() * holes.length)];
        const pos = bossEvent ? getBossHoleAbsolutePosition(hole) : getMidBossHoleAbsolutePosition(hole);
        angle = Math.atan2(pos.y - bullet.y, pos.x - bullet.x);
      } else {
        angle = actorAngle;
      }
    } else {
      angle = actorAngle;
    }
  }
  // 同僚が撃った弾をパリィではじき返した時は、信頼関係が2上がる（手動・オートパリィとも共通）。
  // 「コミュニケーション能力」：レベルごとに、この上昇量へさらに+2を上乗せする
  if (bullet.owner === 'partner') {
    adjustPartnerRelationship(2 + specialSkillEffects.communicationParryRelationshipBonus);
  } else if (bullet.owner === 'player' && fromX === partner.x && fromY === partner.y) {
    // 「コミュニケーション能力」：同僚が自機の弾をパリィした時も、レベルごとに関係性が+2上がる
    if (specialSkillEffects.communicationParryRelationshipBonus > 0) {
      adjustPartnerRelationship(specialSkillEffects.communicationParryRelationshipBonus);
    }
  }
  bullet.vx = Math.cos(angle) * speed;
  bullet.vy = Math.sin(angle) * speed;
  // 同僚・自機どちらにも当たり判定を持たせず素通りさせ、敵にだけ通常の2倍のダメージを与える
  bullet.owner = 'deflected';
  bullet.damage = Math.max(1, Math.round((bullet.damage || 1) * deflectDamageMultiplier));
  spawnDeflectEffect(bullet.x, bullet.y, isAuto);
}

// ===== ラスボス（自機・同僚のSANが同時に20を切ると出現する、名状しがたい巨大な敵） =====
// 通常の敵は出現を止め、発射口だけが弱点になる特別な戦闘に切り替わる（通常弾・パリィで打ち返した弾のどちらも有効打）
const bossImage = loadImage('images/dreamcatcher/last_boss_normal.png');
// 「目覚め」で夢ルートに入り、ADV3を完走した直後に突入する特別なラスボス戦専用の見た目
const dreamBossImage = loadImage('images/dreamcatcher/last_boss.png');
let dreamBossActive = false; // この特別なラスボス戦が進行中かどうか（画像・背景・出現物の出し分けに使う）
const bossSanTriggerThreshold = 20;
const bossWidthRatio = 0.7; // 画面幅に対するラスボスの幅の割合
const bossHeight = 210; // ラスボスが窓を覆う高さ
const bossDescendDurationSec = 4.5; // 降りてくるのにかかる時間
const bossFireIntervalMs = 1300;
const bossBulletSpeed = 4.2;
const bossBulletDamageSan = 12;
const bossBulletDamageLifespan = 3;
// 第5段階「劣等感」：発射口が1つ減るたび、残った発射口がこれらの倍率ぶん強化される
// （耐久力は全回復した上でさらに1.5倍、攻撃速度・攻撃力はそれぞれ1.29倍になる）
const bossInferiorityDurabilityMultiplier = 1.5;
const bossInferiorityPowerMultiplier = 1.29;
// 6段階、各段階ごとに性質の異なる発射口を持つ（耐久力は以前の設定の約30%に調整済み）
const bossStageDefs = [
  {
    stage: 1, name: '視野狭窄', nameEn: 'Tunnel Vision',
    holeCount: 4, hitsPerHole: 25, layout: 'fixed', revive: true
  },
  {
    stage: 2, name: 'シャドウ', nameEn: 'Shadow',
    holeCount: 2, hitsPerHole: 40, layout: 'wander-slow', disguise: true
  },
  {
    stage: 3, name: '確証バイアス', nameEn: 'Confirmation Bias',
    holeCount: 3, hitsPerHole: 20, layout: 'fixed', parryOnly: true
  },
  {
    stage: 4, name: '承認欲求', nameEn: 'Need for Approval',
    holeCount: 1, hitsPerHole: 50, layout: 'wander-fast', regen: true, burstDirections: 5, approvalSeeking: true
  },
  {
    stage: 5, name: '劣等感', nameEn: 'Inferiority Feelings',
    holeCount: 10, hitsPerHole: 1, layout: 'wander-fast', inferiority: true
  },
  {
    stage: 6, name: '内的葛藤', nameEn: 'Internal Conflict',
    holeCount: 3, hitsPerHole: 20, layout: 'internal-conflict', selfConflict: true
  },
  {
    stage: 7, name: '就職活動', nameEn: 'Job-Seeking Activities',
    holeCount: 5, hitsPerHole: 25, layout: 'sequential', sequential: true,
    phases: [
      {
        name: '自己整理',
        info: 'まずは転職の目的をはっきりさせる。「なぜ転職したいのか」「何を変えたいのか」「何は譲れないのか」を整理する。現職の不満の洗い出し、転職理由の整理、希望条件の優先順位づけ、強み・経験・スキルの棚卸。'
      },
      {
        name: '情報収集',
        info: '自分の希望と市場の現実を照らし合わせる。求人を見るだけでなく、業界・職種・年収相場・必要スキル・企業文化を調べる。求人サイトや転職エージェントの確認、企業研究、職種研究、経験者へのヒアリング、市場価値の確認。'
      },
      {
        name: '応募準備',
        info: '自分の経験を、企業に伝わる形に整える段階。ここでは「何をしてきたか」ではなく、「何を任せられる人か」が伝わるようにする。履歴書・職務経歴書の作成、ポートフォリオ準備、自己PR作成、転職理由・志望動機・面接回答の整理。'
      },
      {
        name: '応募・選考',
        info: '実際に応募し、面接や選考を受ける段階。企業に選ばれるだけでなく、自分も企業を見極める意識が必要。求人応募、面接対策、面接後の振り返り、条件確認、複数社の比較、必要に応じた条件交渉。'
      },
      {
        name: '意思決定・移行',
        info: '内定を受けるか決め、入社までを進める段階。転職の成功は内定ではなく、新しい環境で無理なく力を出せることまでを含む。内定承諾の判断、退職交渉、引き継ぎ、入社準備、生活リズムや学習計画の調整。'
      }
    ]
  }
];
const bossHoleRadius = 16;
const bossHoleFlashDurationMs = 220; // 命中した瞬間、穴を光らせて着弾を示す時間
// 段階2・3・4・5のランダム配置の間隔と、動き回る穴の移動先を変える間隔
const bossHoleMinSpacing = 0.16; // 相対座標（0〜1）での最低距離
const bossHoleWanderIntervalMinMs = 900;
const bossHoleWanderIntervalMaxMs = 1600;
const bossHoleWanderEaseFactor = 2.2; // 第5段階（劣等感）：素早く動き回る
const bossHoleWanderEaseFactorSlow = 0.5; // 第2段階（シャドウ）：ゆっくり動き回る
// 第4段階（承認欲求）：他の段階より、場所を切り替える頻度・動く速さを緩やかにする
const bossApprovalWanderIntervalMinMs = 1800;
const bossApprovalWanderIntervalMaxMs = 2800;
const bossHoleWanderEaseFactorMedium = 1.0;
// 段階に応じた、動き回る穴の移動先を変える間隔（[最小, 最大]）を返す
function getBossHoleWanderIntervalMs(stage) {
  return stage === 4
    ? [bossApprovalWanderIntervalMinMs, bossApprovalWanderIntervalMaxMs]
    : [bossHoleWanderIntervalMinMs, bossHoleWanderIntervalMaxMs];
}
// 第4段階（承認欲求）：被弾していない間、耐久力が少しずつ回復する
const bossRegenGraceMs = 1500;
const bossRegenPerSec = 3;
// 第1段階（視野狭窄）：個別に破壊しても、この時間が経つと体力半分の状態で復活する（全て同時に破壊しないと突破できない）
const bossReviveDelayMs = 4000;
// 救済措置：1つの穴につき10回復活したら、以降は復活せずそのまま倒したものとして扱う
const bossHoleMaxRevives = 10;
// 段階ごとに、窓の下のガラス面へうっすらと表示する解説文（[見出し, 説明1, 説明2]）。無い段階は表示しない
const bossStageGlassTexts = {
  1: { title: '視野狭窄', lines: ['全体が見えず、一部だけに意識が固定される。', '全体をバランスよく攻撃する必要がある。'] },
  2: { title: 'シャドウ', lines: ['自分が認めたくない内面の暗い部分。', 'だが、それは強さなのでは。'] },
  3: { title: '確証バイアス', lines: ['自分の考えに合う情報ばかり集め、反証を軽視する傾向。', 'パリィによる反撃のみ有効。'] },
  4: {
    title: '承認欲求',
    lines: [
      '他人から認められることで、自分の価値を確かめようとする性質。',
      '人から注目され、返される言葉に喜びを感じる。',
      'たとえそれが、本質的な理解ではなく、表面的な反応にすぎなくても。'
    ]
  },
  5: {
    title: '劣等感',
    lines: [
      '自分は他人より劣っているという感覚にとらわれ、自分の価値を低く見積もってしまう性質。',
      '人と比べるたびに不足ばかりが目につき、相手の優れている部分を、自分の欠落の証のように感じる。',
      '劣等感に囚われる限り、人は自分自身の価値を正しく見つめることができない。'
    ]
  },
  6: {
    title: '内的葛藤',
    lines: [
      '自分の中にある複数の声が互いに譲らず、心の内側で争い続けてしまう性質。',
      '本当は進みたいのに怖れてしまい、変わりたいのに今の自分を手放せない。',
      '自己葛藤に囚われる限り、人は戦うべき相手を見失い、自分自身を削り続けてしまう。'
    ]
  },
  7: {
    title: '就職活動',
    lines: ['正しく進めなければ、人は仕事を探すのではなく、自分が社会に許される理由を探し続けてしまう。']
  }
};
// 第6段階（内的葛藤）：3つの自機アイコンが、互いに赤い球を撃ち合い体力を削り合う
const bossInternalConflictDamagePerHit = 1; // 赤い球1発ぶんのダメージ量
const bossInternalConflictFireIntervalMs = 1400; // お互いを攻撃する間隔の基準値
const bossInternalConflictBulletSpeed = 5; // 赤い球の弾速
const bossInternalConflictBulletRadius = 7;
const bossInternalConflictLastStandDelayMs = 3000; // 最後の1人になってから爆発して消滅するまでの時間
// 第4段階（承認欲求）：狙われただけで（当たらなくても）耐久力が少し回復してしまう。
// パリィで打ち返した弾を当ててしまった場合は、さらに大きく回復する
const bossApprovalFireHealAmount = 2;
const bossApprovalParryHealAmount = 8;
const bossApprovalHealFlashDurationMs = 300;
// 承認欲求は他の段階より防御力が弱く、通常弾1発あたりのダメージが大きい（通常は1発=1ダメージ相当）
const bossApprovalDamageMultiplier = 3;
// 発射地点・角度から伸ばした直線が、指定した発射口の近くを通るかどうかを判定する
// （実際に命中するかどうかは問わない。「狙われた」というだけで承認欲求は満たされてしまう）
function isAngleAimedAtBossHole(fromX, fromY, angle, hole) {
  const pos = getBossHoleAbsolutePosition(hole);
  const dx = pos.x - fromX, dy = pos.y - fromY;
  const dist = Math.hypot(dx, dy);
  if (dist <= 1) return true;
  const targetAngle = Math.atan2(dy, dx);
  let diff = Math.abs(angle - targetAngle) % (Math.PI * 2);
  if (diff > Math.PI) diff = Math.PI * 2 - diff;
  const tolerance = Math.atan2(bossHoleRadius + 6, dist);
  return diff <= tolerance;
}
// 第4段階「承認欲求」の間、自機・同僚が発射する（当たるかどうかに関わらず）たびに呼び出す。
// 発射口を狙って撃っただけで、少しだけ耐久力が回復してしまう
function checkApprovalSeekingFireHeal(fromX, fromY, angle) {
  if (!bossEvent || bossEvent.stage !== 4) return;
  for (const hole of bossEvent.holes) {
    if (hole.destroyed || !hole.approvalSeeking) continue;
    if (isAngleAimedAtBossHole(fromX, fromY, angle, hole)) {
      hole.hitsTaken = Math.max(0, hole.hitsTaken - bossApprovalFireHealAmount);
      hole.approvalHealFlashMs = bossApprovalHealFlashDurationMs;
    }
  }
}

// 本体が上下左右にゆっくり動き回る範囲と、目標地点を変える間隔
const bossMoveRangeX = 50;
const bossMoveRangeY = 26;
const bossMoveEaseFactor = 1.2;
// 本体（画像）に自機・同僚が接触した時のダメージ
const bossContactSanDamage = 20;
const bossContactLifespanDamage = 6;
let bossEventOnCooldown = false; // 一度発生したら、両者のSANが閾値を上回るまで再発生しない
let bossEvent = null; // null、または { phase, stage, holes, totalHitsLanded, descendProgress, fireTimerMs, savedEnemies, offsetX, offsetY, moveTargetX, moveTargetY, moveTimerMs }
const bossEncounterAvoidSanRecovery = 20; // 「現実から目をそらす」を選んだ時、自分・同僚それぞれが回復するSAN
let bossEncounterChoiceActive = false; // 「名状しがたきものの気配がする…」の最初の選択肢を表示中
let bossEncounterConfirmActive = false; // 「本当に現実を直視しますか？」の再確認を表示中

// 「現実から目をそらす」：自分・同僚ともSANを回復し、ラスボスの発生を見送る
// （この選択肢自体、同僚が離脱している間は発生しないため、常に同僚も在籍している前提でよい）
function chooseBossEncounterAvoid() {
  san = Math.min(maxSan, san + bossEncounterAvoidSanRecovery);
  partner.san = Math.min(maxSan, partner.san + bossEncounterAvoidSanRecovery);
  bossEncounterChoiceActive = false;
  bossEncounterConfirmActive = false;
  showMessage(`現実から目をそらした…… SAN +${bossEncounterAvoidSanRecovery}（自分・同僚とも）`, 3200, '#90caf9', '22px sans-serif');
}
// 「現実を直視する」：最終確認の選択肢を表示する
function chooseBossEncounterFace() {
  bossEncounterChoiceActive = false;
  bossEncounterConfirmActive = true;
}
// 最終確認で「はい」：ラスボスを実際に発生させる
function chooseBossEncounterConfirmYes() {
  bossEncounterConfirmActive = false;
  startBossEvent();
}

function getBossGeometry() {
  const width = canvas.width * bossWidthRatio;
  const offsetX = bossEvent ? bossEvent.offsetX : 0;
  const offsetY = (bossEvent && bossEvent.phase === 'active') ? bossEvent.offsetY : 0;
  const x = (canvas.width - width) / 2 + offsetX;
  const descendProgress = bossEvent ? bossEvent.descendProgress : 0;
  const topY = -bossHeight + bossHeight * descendProgress + offsetY;
  return { x, y: topY, width, height: bossHeight };
}

// 両者のSANが同時に閾値を切ったら、ラスボス出現を開始する（発生中・クールダウン中は何もしない）
function checkBossEventTrigger() {
  if (bossEvent || midBossEvent || !partner.active || bossEncounterChoiceActive || bossEncounterConfirmActive) return;
  const bothLow = san < bossSanTriggerThreshold && partner.san < bossSanTriggerThreshold;
  if (bothLow && !bossEventOnCooldown) {
    // ラスボスをいきなり出現させず、まず「気配」への向き合い方を選ばせる
    bossEncounterChoiceActive = true;
    bossEventOnCooldown = true;
  } else if (!bothLow) {
    bossEventOnCooldown = false;
  }
}

// 段階に応じた発射口を生成する（相対座標 relX/relY で持ち、ラスボス本体の動きに追従させる）
function generateBossHoles(stage) {
  const def = bossStageDefs[stage - 1];
  const holes = [];
  if (stage === 1) {
    // 第1段階「視野狭窄」：横一列に均等配置し、位置は変わらない。4つそれぞれが独自の体力を持つ
    for (let i = 0; i < def.holeCount; i++) {
      holes.push({
        relX: (i + 1) / (def.holeCount + 1), relY: 0.65,
        hitsTaken: 0, destroyed: false, flashTimerMs: 0, maxHits: def.hitsPerHole,
        // 発射口ごとにランダムな初期位相を持たせ、全ての穴が同時に発射しないようにする
        fireTimerMs: Math.random() * bossFireIntervalMs,
        revive: true, showHealthBar: true, reviveCount: 0
      });
    }
    return holes;
  }
  if (stage === 6) {
    // 第6段階「内的葛藤」：3つの自機アイコンが、ラスボスの範囲内を動き回りながら互いを狙い合う
    for (let i = 0; i < def.holeCount; i++) {
      let relX, relY, attempts = 0;
      do {
        relX = 0.2 + Math.random() * 0.6;
        relY = 0.3 + Math.random() * 0.5;
        attempts++;
      } while (attempts < 20 && holes.some(h => Math.hypot(h.relX - relX, h.relY - relY) < bossHoleMinSpacing));
      holes.push({
        relX, relY, hitsTaken: 0, destroyed: false, flashTimerMs: 0, maxHits: def.hitsPerHole,
        fireTimerMs: Math.random() * bossInternalConflictFireIntervalMs,
        wanderTargetRelX: relX, wanderTargetRelY: relY,
        wanderTimerMs: bossHoleWanderIntervalMinMs + Math.random() * (bossHoleWanderIntervalMaxMs - bossHoleWanderIntervalMinMs),
        selfConflict: true
      });
    }
    return holes;
  }
  if (stage === 7) {
    // 第7段階「就職活動」：中ボスと同じく、5つのフェーズを①→⑤の順番でしか破壊できない。
    // 各フェーズの弾速・弾数・広がり方は、この段階に入るたびにランダムに設定し直す
    for (let i = 0; i < def.holeCount; i++) {
      const burstCount = 1 + Math.floor(Math.random() * 3);
      holes.push({
        relX: (i + 1) / (def.holeCount + 1), relY: 0.6,
        hitsTaken: 0, destroyed: false, flashTimerMs: 0, maxHits: def.hitsPerHole,
        fireTimerMs: Math.random() * bossFireIntervalMs,
        sequential: true,
        phaseIndex: i,
        bulletSpeed: 2.6 + Math.random() * 3.2,
        burstCount,
        spreadAngleDeg: burstCount > 1 ? 15 + Math.random() * 45 : 0,
        fireIntervalMs: 900 + Math.random() * 1000
      });
    }
    return holes;
  }
  // それ以外の段階は、ある程度の間隔を保ちつつランダムな位置に配置する
  // （'wander-slow'・'wander-fast'は後で動き回り、'fixed'はこの位置のまま固定される）
  for (let i = 0; i < def.holeCount; i++) {
    let relX, relY, attempts = 0;
    do {
      relX = 0.08 + Math.random() * 0.84;
      relY = 0.25 + Math.random() * 0.65;
      attempts++;
    } while (attempts < 20 && holes.some(h => Math.hypot(h.relX - relX, h.relY - relY) < bossHoleMinSpacing));
    const hole = {
      relX, relY, hitsTaken: 0, destroyed: false, flashTimerMs: 0, maxHits: def.hitsPerHole,
      fireTimerMs: Math.random() * bossFireIntervalMs
    };
    if (def.layout === 'wander-slow' || def.layout === 'wander-fast') {
      hole.wanderTargetRelX = relX;
      hole.wanderTargetRelY = relY;
      const [wanderMin, wanderMax] = getBossHoleWanderIntervalMs(stage);
      hole.wanderTimerMs = wanderMin + Math.random() * (wanderMax - wanderMin);
    }
    if (def.parryOnly) hole.parryOnly = true;
    if (def.regen) hole.regen = true;
    if (def.burstDirections) hole.burstDirections = def.burstDirections;
    if (def.approvalSeeking) hole.approvalSeeking = true;
    // 第5段階「劣等感」：発射口が1つ減るたび、残った発射口が強化されていく
    if (def.inferiority) {
      hole.inferiority = true;
      hole.attackSpeedMultiplier = 1;
      hole.damageMultiplier = 1;
    }
    // 第2段階「シャドウ」：1つは自機、もう1つは同僚を模した半透明アイコンにする
    if (def.disguise) hole.disguiseRole = i === 0 ? 'player' : 'partner';
    holes.push(hole);
  }
  return holes;
}

// 発射口の相対座標を、ラスボスの現在位置に基づく画面座標へ変換する
function getBossHoleAbsolutePosition(hole) {
  const geo = getBossGeometry();
  return { x: geo.x + geo.width * hole.relX, y: geo.y + geo.height * hole.relY };
}

// ラスボスが出現中、指定した位置から見て最も近い「生きている（破壊されていない）」発射口の座標を返す。
// 同僚の狙い先・自機のオート照準の両方から、通常の敵と同様のターゲットとして扱えるようにする
function findNearestLivingBossHole(fromX, fromY) {
  if (!bossEvent) return null;
  // 第7段階「就職活動」：まだ順番が来ていないフェーズは狙わせない
  if (bossEvent.stage === 7) {
    const currentHole = bossEvent.holes.find(h => !h.destroyed);
    return currentHole ? getBossHoleAbsolutePosition(currentHole) : null;
  }
  let nearest = null;
  let nearestD = Infinity;
  for (const hole of bossEvent.holes) {
    if (hole.destroyed) continue;
    const pos = getBossHoleAbsolutePosition(hole);
    const d = Math.hypot(pos.x - fromX, pos.y - fromY);
    if (d < nearestD) {
      nearestD = d;
      nearest = pos;
    }
  }
  return nearest;
}

function startBossEvent() {
  clearFieldBeforeEventBattle();
  bossEvent = {
    phase: 'descending',
    stage: 1,
    holes: generateBossHoles(1),
    totalHitsLanded: 0,
    descendProgress: 0,
    savedEnemies: enemies.slice(),
    offsetX: 0,
    offsetY: 0,
    moveTargetX: 0,
    moveTargetY: 0,
    moveTimerMs: 0
  };
  enemies.length = 0; // 通常の敵は一時的に退避させ、ラスボス戦の間は出現しない
  showMessage('……何かが、近寄ってくる気配がする。', 3400, '#ff1744', '26px sans-serif');
}

// ===== 「目覚め」で夢ルートに入り、ADV3を完走した直後の特別なラスボス戦 =====
// DAY〇〇の代わりに「24:00」を表示し、クリック待ちなしで自動的にフェードアウトしてから
// 特別なラスボス戦（SAN20以下で出会うものと実質同じだが、専用の見た目・背景で、通常敵/固定敵/クイズは出さない）へ入る
let dreamBossIntroSequence = null; // null、または { phase: 'clock' | 'fadeOut', phaseTimerMs }
const dreamBossIntroClockDurationMs = 3000;
const dreamBossIntroFadeOutDurationMs = 800;

function startDreamBossIntroSequence() {
  dreamBossIntroSequence = { phase: 'clock', phaseTimerMs: 0 };
}

function updateDreamBossIntroSequence(rawDt) {
  dreamBossIntroSequence.phaseTimerMs += rawDt * 1000;
  if (dreamBossIntroSequence.phase === 'clock' && dreamBossIntroSequence.phaseTimerMs >= dreamBossIntroClockDurationMs) {
    dreamBossIntroSequence.phase = 'fadeOut';
    dreamBossIntroSequence.phaseTimerMs = 0;
  } else if (dreamBossIntroSequence.phase === 'fadeOut' &&
      dreamBossIntroSequence.phaseTimerMs >= dreamBossIntroFadeOutDurationMs) {
    dreamBossIntroSequence = null;
    startDreamBossEvent();
  }
}

function drawDreamBossIntroSequence() {
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const alpha = dreamBossIntroSequence.phase === 'fadeOut'
    ? Math.max(0, 1 - dreamBossIntroSequence.phaseTimerMs / dreamBossIntroFadeOutDurationMs)
    : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'white';
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('24:00', canvas.width / 2, canvas.height / 2);
  ctx.restore();
  ctx.textAlign = 'left';
}

// 「24:00」のフェードアウトが終わった瞬間に呼ばれ、特別なラスボス戦を実際に開始する
function startDreamBossEvent() {
  clearFieldBeforeEventBattle();
  enemies.length = 0;
  fixedEnemies.length = 0;
  quizState = null;
  lunchState = null;
  scheduledReport = null;
  dreamBossActive = true;
  currentHour = maxOvertimeHour;
  lastHourTime = gameClockMs;
  bossEvent = {
    phase: 'descending',
    stage: 1,
    holes: generateBossHoles(1),
    totalHitsLanded: 0,
    descendProgress: 0,
    savedEnemies: [],
    offsetX: 0,
    offsetY: 0,
    moveTargetX: 0,
    moveTargetY: 0,
    moveTimerMs: 0
  };
  showMessage('……何かが、近寄ってくる気配がする。', 3400, '#ff1744', '26px sans-serif');
}

function updateBossEvent(dt) {
  if (bossEvent.phase === 'descending') {
    bossEvent.descendProgress = Math.min(1, bossEvent.descendProgress + dt / bossDescendDurationSec);
    // 降りてくる途中も、左右にゆっくり揺れながら近づいてくるようにする
    bossEvent.offsetX = Math.sin(gameClockMs / 900) * bossMoveRangeX * 0.5;
    if (bossEvent.descendProgress >= 1) {
      bossEvent.phase = 'active';
      showMessage('？？？が姿を現した！', 3600, '#ff1744', '24px sans-serif');
    }
    return;
  }

  // 本体が上下左右にゆっくり動き回る。一定時間ごとに新しい目標地点を選び、なめらかに近づく
  bossEvent.moveTimerMs -= dt * 1000;
  if (bossEvent.moveTimerMs <= 0) {
    bossEvent.moveTargetX = (Math.random() * 2 - 1) * bossMoveRangeX;
    bossEvent.moveTargetY = (Math.random() * 2 - 1) * bossMoveRangeY;
    bossEvent.moveTimerMs = 1500 + Math.random() * 1800;
  }
  const moveEase = Math.min(1, dt * bossMoveEaseFactor);
  bossEvent.offsetX += (bossEvent.moveTargetX - bossEvent.offsetX) * moveEase;
  bossEvent.offsetY += (bossEvent.moveTargetY - bossEvent.offsetY) * moveEase;

  checkBossContactDamage();

  // 発射口の点滅（被弾エフェクト）を減衰させ、段階に応じて穴自体を動かしたり回復させたりする
  for (const hole of bossEvent.holes) {
    if (hole.flashTimerMs > 0) hole.flashTimerMs = Math.max(0, hole.flashTimerMs - dt * 1000);
    if (hole.approvalHealFlashMs > 0) hole.approvalHealFlashMs = Math.max(0, hole.approvalHealFlashMs - dt * 1000);
    if (hole.destroyed) {
      // 第1段階「視野狭窄」：個別に破壊されても、一定時間後に体力半分の状態で復活する。
      // 救済措置：1つの穴につき10回復活したら、以降は復活せずそのまま倒したものとして扱う
      if (hole.revive && (hole.reviveCount || 0) < bossHoleMaxRevives) {
        hole.reviveTimerMs -= dt * 1000;
        if (hole.reviveTimerMs <= 0) {
          hole.destroyed = false;
          hole.hitsTaken = hole.maxHits / 2;
          hole.reviveCount = (hole.reviveCount || 0) + 1;
        }
      }
      continue;
    }
    if (hole.wanderTargetRelX !== undefined) {
      hole.wanderTimerMs -= dt * 1000;
      if (hole.wanderTimerMs <= 0) {
        // 第6段階「内的葛藤」：時々、お互いから離れるように次の目標地点を選ぶ
        const others = hole.selfConflict ? bossEvent.holes.filter(h => h !== hole && h.selfConflict && !h.destroyed) : [];
        if (others.length > 0 && Math.random() < 0.5) {
          const nearest = others.reduce((closest, h) => {
            const d = Math.hypot(h.relX - hole.relX, h.relY - hole.relY);
            return (!closest || d < closest.d) ? { h, d } : closest;
          }, null).h;
          const awayAngle = Math.atan2(hole.relY - nearest.relY, hole.relX - nearest.relX) + (Math.random() - 0.5) * 0.6;
          const awayDist = 0.35 + Math.random() * 0.3;
          hole.wanderTargetRelX = Math.min(0.92, Math.max(0.08, hole.relX + Math.cos(awayAngle) * awayDist));
          hole.wanderTargetRelY = Math.min(0.9, Math.max(0.25, hole.relY + Math.sin(awayAngle) * awayDist));
        } else {
          hole.wanderTargetRelX = 0.08 + Math.random() * 0.84;
          hole.wanderTargetRelY = 0.25 + Math.random() * 0.65;
        }
        const [wanderMin, wanderMax] = getBossHoleWanderIntervalMs(bossEvent.stage);
        hole.wanderTimerMs = wanderMin + Math.random() * (wanderMax - wanderMin);
      }
      // 第2段階「シャドウ」はゆっくり、第4段階「承認欲求」は緩やかに、第5段階「劣等感」・第6段階「内的葛藤」は素早く動き回る
      const easeFactor = bossEvent.stage === 2 ? bossHoleWanderEaseFactorSlow
        : bossEvent.stage === 4 ? bossHoleWanderEaseFactorMedium
        : bossHoleWanderEaseFactor;
      const wanderEase = Math.min(1, dt * easeFactor);
      hole.relX += (hole.wanderTargetRelX - hole.relX) * wanderEase;
      hole.relY += (hole.wanderTargetRelY - hole.relY) * wanderEase;
    }
    // 第4段階「承認欲求」：しばらく被弾していないと、耐久力が少しずつ回復する
    if (hole.regen) {
      hole.msSinceHit = (hole.msSinceHit || 0) + dt * 1000;
      if (hole.msSinceHit > bossRegenGraceMs && hole.hitsTaken > 0) {
        hole.hitsTaken = Math.max(0, hole.hitsTaken - bossRegenPerSec * dt);
      }
    }
    // 発射口ごとに独立したタイミングでランダムに発射する（全ての穴が同時に撃たないようにする）。
    // 第6段階「内的葛藤」は自機・同僚を攻撃せず、互いを攻撃し合う
    hole.fireTimerMs -= dt * 1000;
    if (hole.fireTimerMs <= 0) {
      if (hole.selfConflict) {
        performInternalConflictAttack(hole);
        hole.fireTimerMs = bossInternalConflictFireIntervalMs * (0.7 + Math.random() * 0.6);
      } else if (hole.sequential) {
        fireJobSeekingHoleBullet(hole);
        hole.fireTimerMs = hole.fireIntervalMs * (0.7 + Math.random() * 0.6);
      } else if (hole.indestructible) {
        fireIndestructibleBossBullet(hole);
        hole.fireTimerMs = normalEndFireIntervalMs * (0.6 + Math.random() * 0.6);
      } else {
        fireSingleBossHoleBullet(hole);
        // 第5段階「劣等感」：発射口が減るたびに強化された分、攻撃間隔を短くする（攻撃速度アップ）
        hole.fireTimerMs = bossFireIntervalMs * (0.6 + Math.random() * 0.8) / (hole.attackSpeedMultiplier || 1);
      }
    }
  }

  // 第6段階「内的葛藤」：最後の1人になったら、少し待ってから爆発して消滅し、次の段階へ進む
  if (bossEvent.stage === 6) {
    const aliveSelfConflict = bossEvent.holes.filter(h => h.selfConflict && !h.destroyed);
    if (aliveSelfConflict.length === 1) {
      if (bossEvent.internalConflictLastStandTimerMs === undefined) {
        bossEvent.internalConflictLastStandTimerMs = bossInternalConflictLastStandDelayMs;
        showMessage('最後の1人になった……', 2200, '#ff1744', '20px sans-serif');
      } else {
        bossEvent.internalConflictLastStandTimerMs -= dt * 1000;
        if (bossEvent.internalConflictLastStandTimerMs <= 0) {
          const last = aliveSelfConflict[0];
          const pos = getBossHoleAbsolutePosition(last);
          spawnHitSpark(pos.x, pos.y, true);
          explosionShakeTimer = Math.max(explosionShakeTimer, explosionEffectDuration);
          bossEvent.internalConflictLastStandTimerMs = undefined;
          finalizeBossHoleDestruction(last);
        }
      }
    } else {
      bossEvent.internalConflictLastStandTimerMs = undefined;
    }
  }
}

// 第6段階「内的葛藤」：ランダムに選んだ、生きている他の自機アイコンへ向けて赤い球を発射する（自機・同僚は対象にしない）
function performInternalConflictAttack(hole) {
  const others = bossEvent.holes.filter(h => h !== hole && h.selfConflict && !h.destroyed);
  if (others.length === 0) return;
  const target = others[Math.floor(Math.random() * others.length)];
  const pos = getBossHoleAbsolutePosition(hole);
  const targetPos = getBossHoleAbsolutePosition(target);
  const angle = Math.atan2(targetPos.y - pos.y, targetPos.x - pos.x);
  bullets.push({
    x: pos.x,
    y: pos.y,
    vx: Math.cos(angle) * bossInternalConflictBulletSpeed,
    vy: Math.sin(angle) * bossInternalConflictBulletSpeed,
    radius: bossInternalConflictBulletRadius,
    damage: bossInternalConflictDamagePerHit,
    bounces: 0,
    owner: 'selfConflict',
    selfConflictSource: hole
  });
}

// 第6段階「内的葛藤」：赤い球が、発射元以外の生きている自機アイコンに命中したかどうかを判定し、命中していれば処理する
function checkInternalConflictBulletHit(bullet) {
  if (!bossEvent) return false;
  const hitHole = bossEvent.holes.find(h => h.selfConflict && !h.destroyed && h !== bullet.selfConflictSource &&
    Math.hypot(bullet.x - getBossHoleAbsolutePosition(h).x, bullet.y - getBossHoleAbsolutePosition(h).y) <= bullet.radius + bossHoleRadius);
  if (!hitHole) return false;
  hitHole.hitsTaken += bullet.damage;
  hitHole.flashTimerMs = bossHoleFlashDurationMs;
  spawnHitSpark(bullet.x, bullet.y, false);
  if (hitHole.hitsTaken >= hitHole.maxHits) {
    finalizeBossHoleDestruction(hitHole);
  }
  return true;
}

// 第3段階「確証バイアス」：自機・同僚の通常弾を自動的にパリィし、ランダムな方向へ跳ね返す。
// 跳ね返った弾はそのまま敵の攻撃として扱われるが、こちらが改めてパリィで打ち返せば有効打になる
function autoParryByBossHole(bullet) {
  const speed = Math.hypot(bullet.vx, bullet.vy) || bossBulletSpeed;
  const angle = Math.random() * Math.PI * 2;
  bullet.vx = Math.cos(angle) * speed;
  bullet.vy = Math.sin(angle) * speed;
  bullet.owner = 'boss';
  bullet.sourceHole = undefined;
  bullet.stage3Reflected = true;
  spawnDeflectEffect(bullet.x, bullet.y);
}

// 発射口を破壊済みにし、段階の全ての穴が破壊されたら次の段階へ進める（最終段階なら撃破演出を開始する）。
// 通常の被弾だけでなく、第6段階「内的葛藤」の内輪もめによる破壊（自爆含む）からも呼ばれる共通処理
function finalizeBossHoleDestruction(hole) {
  hole.destroyed = true;
  // 救済措置：既に10回復活済みなら、以降は復活タイマーをセットしない（そのまま倒したものとして扱う）
  if (hole.revive && (hole.reviveCount || 0) < bossHoleMaxRevives) hole.reviveTimerMs = bossReviveDelayMs;
  // 第5段階「劣等感」：発射口が1つ減るたび、残った発射口は耐久力が全回復した上でさらに1.5倍になり、
  // 攻撃速度・攻撃力もそれぞれ1.29倍になる
  if (hole.inferiority) {
    bossEvent.holes.filter(h => h.inferiority && !h.destroyed).forEach(h => {
      h.maxHits *= bossInferiorityDurabilityMultiplier;
      h.hitsTaken = 0;
      h.attackSpeedMultiplier *= bossInferiorityPowerMultiplier;
      h.damageMultiplier *= bossInferiorityPowerMultiplier;
    });
  }
  if (!bossEvent.holes.every(h => h.destroyed)) return;
  if (bossEvent.stage < bossStageDefs.length) {
    bossEvent.stage++;
    bossEvent.holes = generateBossHoles(bossEvent.stage);
    const nextDef = bossStageDefs[bossEvent.stage - 1];
    showMessage(
      `突破した！ 次は「${nextDef.name} / ${nextDef.nameEn}」……${bossEvent.holes.length}個の発射口が現れた`,
      3200, '#ff1744', '22px sans-serif'
    );
  } else {
    startBossFinalSequence();
  }
}

// 発射口に命中した弾を処理する。破壊しきい値に達したら穴を破壊する
function registerBossHoleHit(hole, hitX, hitY) {
  // ノーマルルート終了時の負けイベント戦闘：発射口は決して破壊できない（当たった見た目だけ出す）
  if (hole.indestructible) {
    hole.flashTimerMs = bossHoleFlashDurationMs;
    spawnHitSpark(hitX, hitY, false);
    return;
  }
  // 第4段階「承認欲求」：他の段階より防御力が弱く大きなダメージが入り、
  // さらに、この着弾は「狙われただけで回復した分」も込みで耐久力を減らす
  const normalHitIncrement = hole.approvalSeeking ? bossApprovalDamageMultiplier + bossApprovalFireHealAmount : 1;
  // 「β版設定」：1発ごとに耐久力の最大値の20%ぶんダメージを与え、最低5発で撃破できるようにする
  const betaHitIncrement = isBetaModeBossDamageActive() ? hole.maxHits * betaModeBossDamageRatio : 0;
  hole.hitsTaken += Math.max(normalHitIncrement, betaHitIncrement);
  hole.msSinceHit = 0; // 承認欲求：被弾した瞬間、回復までの猶予をリセットする
  hole.flashTimerMs = bossHoleFlashDurationMs;
  bossEvent.totalHitsLanded++;
  spawnHitSpark(hitX, hitY, false);
  if (hole.hitsTaken < hole.maxHits) return;
  if (hole.sequential) {
    // 第7段階「就職活動」：中ボスと同じく、フェーズ完了時に説明文を表示する
    const phaseDef = bossStageDefs[bossEvent.stage - 1].phases[hole.phaseIndex];
    showMessage(`${hole.phaseIndex + 1}. ${phaseDef.name}完了！`, 2400, '#69f0ae', '22px sans-serif');
    fixedEnemyDefeatInfoDisplay = { name: `${hole.phaseIndex + 1}. ${phaseDef.name}`, info: phaseDef.info, elapsedMs: 0 };
  }
  finalizeBossHoleDestruction(hole);
}

// 自機の狙いが発射口に重なっているかを調べ、重なっていればその穴を返す
function findHitBossHole(x, y) {
  if (!bossEvent || bossEvent.phase !== 'active') return null;
  // 第7段階「就職活動」：中ボスと同じく、①→⑤の順番でしか破壊できない
  if (bossEvent.stage === 7) {
    const currentHole = bossEvent.holes.find(h => !h.destroyed);
    if (!currentHole) return null;
    const pos = getBossHoleAbsolutePosition(currentHole);
    return Math.hypot(x - pos.x, y - pos.y) <= bossHoleRadius + 6 ? currentHole : null;
  }
  for (const hole of bossEvent.holes) {
    if (hole.destroyed) continue;
    const pos = getBossHoleAbsolutePosition(hole);
    if (Math.hypot(x - pos.x, y - pos.y) <= bossHoleRadius + 6) return hole;
  }
  return null;
}

// ラスボスの本体（見た目の範囲）に自機・同僚が触れていたら、直接ダメージを与える
function checkBossContactDamage() {
  const geo = getBossGeometry();
  const overlaps = (entity) => (
    entity.x + entity.radius >= geo.x && entity.x - entity.radius <= geo.x + geo.width &&
    entity.y + entity.radius >= geo.y && entity.y - entity.radius <= geo.y + geo.height
  );

  if (!invincible && overlaps(player)) {
    if (playerBarrierCharges > 0) {
      playerBarrierCharges--;
    } else {
      san = Math.max(0, san - bossContactSanDamage * specialSkillEffects.sanDamageMultiplier);
      lifespan = Math.max(0, lifespan - bossContactLifespanDamage);
      checkVitalsGameOver();
    }
    invincible = true;
    invincibleTimer = invincibleDuration;
  }

  if (partner.active && partner.friendlyFireInvincibleTimer <= 0 && overlaps(partner)) {
    if (partner.barrierCharges > 0) {
      partner.barrierCharges--;
    } else {
      partner.san = Math.max(0, partner.san - bossContactSanDamage);
      partner.lifespan = Math.max(0, partner.lifespan - bossContactLifespanDamage);
    }
    partner.friendlyFireInvincibleTimer = friendlyFireInvincibleDuration;
  }
}

function pushBossHoleBullet(pos, angle, hole, speedMultiplier = 1) {
  bullets.push({
    x: pos.x,
    y: pos.y,
    vx: Math.cos(angle) * bossBulletSpeed * speedMultiplier,
    vy: Math.sin(angle) * bossBulletSpeed * speedMultiplier,
    radius: 7,
    // 第5段階「劣等感」：発射口が減るたびに強化された分、攻撃力の倍率をそのまま弾に乗せる
    damage: (hole && hole.damageMultiplier) || 1,
    bounces: 0,
    owner: 'boss',
    sourceHole: hole, // パリィで打ち返した時、この発射口へ向けて反射させるために覚えておく
    sourceHoleKind: 'boss'
  });
}

// 発射口1つぶんの弾を発射する（発射口ごとに独立したタイミングで呼ばれる）
function fireSingleBossHoleBullet(hole) {
  const pos = getBossHoleAbsolutePosition(hole);
  // 第4段階「承認欲求」：同時に5方向へ発射する
  if (hole.burstDirections) {
    const baseAngle = Math.random() * Math.PI * 2;
    for (let i = 0; i < hole.burstDirections; i++) {
      pushBossHoleBullet(pos, baseAngle + (Math.PI * 2 * i) / hole.burstDirections, hole);
    }
    return;
  }
  // 第2段階「シャドウ」：自機・同僚それぞれの戦い方を真似た攻撃をしてくる
  if (hole.disguiseRole === 'player') {
    // 自機の「マルチタスク」を真似て、わずかにずらした2発を素早く撃つ
    const baseAngle = Math.atan2(player.y - pos.y, player.x - pos.x);
    [-0.15, 0.15].forEach(offset => {
      pushBossHoleBullet(pos, baseAngle + offset, hole, 1.3);
    });
    return;
  }
  if (hole.disguiseRole === 'partner') {
    // 同僚のように、自機・同僚のどちらかをランダムに狙い、狙いにやや幅を持たせる
    const target = (partner.active && Math.random() < 0.5) ? partner : player;
    const angle = Math.atan2(target.y - pos.y, target.x - pos.x) + (Math.random() - 0.5) * 0.5;
    pushBossHoleBullet(pos, angle, hole);
    return;
  }
  // 穴ごとに、自機・同僚のどちらを狙うかをランダムに決める（同僚も直接狙われる）
  const target = (partner.active && Math.random() < 0.5) ? partner : player;
  const angle = Math.atan2(target.y - pos.y, target.x - pos.x) + (Math.random() - 0.5) * 0.35;
  pushBossHoleBullet(pos, angle, hole);
}

// 第7段階「就職活動」：フェーズごとに設定された弾速・弾数・広がり方で発射する
function fireJobSeekingHoleBullet(hole) {
  const pos = getBossHoleAbsolutePosition(hole);
  const target = (partner.active && Math.random() < 0.5) ? partner : player;
  const baseAngle = Math.atan2(target.y - pos.y, target.x - pos.x);
  const count = hole.burstCount;
  const speedMultiplier = hole.bulletSpeed / bossBulletSpeed;
  for (let i = 0; i < count; i++) {
    const offsetDeg = count === 1 ? 0 : (i - (count - 1) / 2) * (hole.spreadAngleDeg / (count - 1));
    pushBossHoleBullet(pos, baseAngle + offsetDeg * Math.PI / 180, hole, speedMultiplier);
  }
}

// 同僚と同じ誤射ダメージ量で、ラスボス弾による被弾を処理する（パリィ成功時はここに来ない）。
// damageMultiplierは、第5段階「劣等感」で強化された発射口の弾ほど大きくなる
function damagePlayerByBossBullet(damageMultiplier = 1) {
  if (friendlyFireInvincibleTimer > 0) return;
  if (playerBarrierCharges > 0) {
    playerBarrierCharges--;
    friendlyFireInvincibleTimer = friendlyFireInvincibleDuration;
    return;
  }
  san = Math.max(0, san - bossBulletDamageSan * damageMultiplier * specialSkillEffects.sanDamageMultiplier);
  lifespan = Math.max(0, lifespan - bossBulletDamageLifespan * damageMultiplier);
  friendlyFireInvincibleTimer = friendlyFireInvincibleDuration;
  friendlyFireHitFlashTimer = friendlyFireHitEffectDuration;
  explosionShakeTimer = Math.max(explosionShakeTimer, friendlyFireHitEffectDuration);
  checkVitalsGameOver();
}

// 同僚がラスボス弾のパリィに失敗した時の被弾処理
function damagePartnerByBossBullet(damageMultiplier = 1) {
  if (!partner.active || partner.friendlyFireInvincibleTimer > 0) return;
  if (partner.barrierCharges > 0) {
    partner.barrierCharges--;
    partner.friendlyFireInvincibleTimer = friendlyFireInvincibleDuration;
    return;
  }
  partner.san = Math.max(0, partner.san - bossBulletDamageSan * damageMultiplier);
  partner.lifespan = Math.max(0, partner.lifespan - bossBulletDamageLifespan * damageMultiplier);
  partner.friendlyFireInvincibleTimer = friendlyFireInvincibleDuration;
}

// 固定敵の弾を被弾した時の処理：基礎ダメージに加え、攻撃名ごとの特殊効果（fixedEnemyEffectDefs参照）も発生する
function damagePlayerByFixedEnemyBullet(bullet) {
  if (friendlyFireInvincibleTimer > 0) return;
  const def = fixedEnemyDefs.find(d => d.id === bullet.fixedEnemyDefId);
  if (playerBarrierCharges > 0) {
    playerBarrierCharges--;
    friendlyFireInvincibleTimer = friendlyFireInvincibleDuration;
    return;
  }
  const sanDmg = def ? def.bulletSan : 8; // バックドア設置の不意打ちなど、定義が見当たらない場合の既定値
  const lifespanDmg = def ? (def.bulletLifespan || 1) : 2;
  san = Math.max(0, san - sanDmg * specialSkillEffects.sanDamageMultiplier);
  lifespan = Math.max(0, lifespan - lifespanDmg);
  friendlyFireInvincibleTimer = friendlyFireInvincibleDuration;
  friendlyFireHitFlashTimer = friendlyFireHitEffectDuration;
  explosionShakeTimer = Math.max(explosionShakeTimer, friendlyFireHitEffectDuration);
  checkVitalsGameOver();
  if (gameOver || deathSequence) return;
  if (def) {
    if (def.effect) applyFixedEnemyEffect(def.effect, 'player');
    showMessage(`${def.name}の攻撃を受けた…`, 1500, '#ff8a80');
  }
}

// ===== ラスボス撃破後の演出（真エンドへ至る一連のカットシーン） =====
// 'retreat'：本体が振動・フェードアウトしながら退場する（同時に画面が不規則にフラッシュ）
// 'bgRestore'：暗く沈んでいたトーンが晴れ、いつもの背景に戻る
// 'whiteFade'：画面全体がゆっくり白くなる
// 'whiteWait'：白いまま少し待つ
// 'trueEnd'：真エンドの文章とENDを表示し、最後にタイトルへ戻る
const bossFinalFlashDurationMs = 2000; // フラッシュが不規則に入る時間（retreatの前半）
const bossFinalRetreatDurationMs = 9000; // 振動・フェードアウト・後退にかかる全体の時間
const bossFinalBgRestoreDurationMs = 1800;
const bossFinalWhiteFadeDurationMs = 1800;
const bossFinalWhiteWaitDurationMs = 3000;
// 真エンドの文章の表示タイミング（trueEndフェーズ開始からの経過ミリ秒とフェード時間）。
// ENDはここでは表示せず、最後のクリアメッセージ画面の下に改めてフェードイン表示する
const bossTrueEndCues = [
  { start: 0, fadeMs: 1500 }, // 1行目（撃破時の実時間帯によって変わる、目覚めの一文）
  { start: 4000, fadeMs: 1500 }, // 2行目
  { start: 9000, fadeMs: 1500 } // 3行目（少し時間を置いてから表示する）
];
const bossTrueEndReturnAtMs = 13500; // このタイミングで「real-world time」画面へ進む（同僚が生存していない場合はここでタイトルへ戻る）
const bossTrueEndLines = [
  '「…なんだか、長い夢を見ていた気がする。」',
  '…訓練期間が終わる前に、就職活動を始めないと。'
];
// ラスボス撃破時の「現実の時間帯」に応じて、目覚めの一文をランダムに選ぶ（同じ時間帯の中でも候補からランダム）
const wakeUpLinesByTimeBand = {
  lateNight: [ // 未明／夜明け前：3時〜5時ごろ
    'ふと目を覚ますと、窓の外はまだ墨を流したように暗かった。',
    'ふと目を覚ますと、部屋の隅に夜の気配が沈殿していた。',
    'ふと目を覚ますと、時計の針だけが、やけに大きな音を立てていた。',
    'ふと目を覚ますと、カーテンの向こうに夜明けの気配すらなかった。',
    'ふと目を覚ますと、世界から自分だけが取り残されたような静けさだった。'
  ],
  earlyMorning: [ // 早朝：5時〜7時ごろ
    'ふと目を覚ますと、カーテンの隙間から薄い朝の光が差し込んでいた。',
    'ふと目を覚ますと、空はまだ青白く、世界は目を覚ます途中だった。',
    'ふと目を覚ますと、遠くで鳥の声がしていた。',
    'ふと目を覚ますと、部屋の輪郭が朝の光に少しずつ戻っていた。',
    'ふと目を覚ますと、夜の残滓が、薄明かりの中で静かに溶けていた。'
  ],
  morning: [ // 朝：7時〜10時ごろ
    'ふと目を覚ますと、窓の外ではもう朝が始まっていた。',
    'ふと目を覚ますと、まぶしい光が部屋いっぱいに広がっていた。',
    'ふと目を覚ますと、どこかで車の走る音がして、現実が戻ってきていた。',
    'ふと目を覚ますと、朝日が何事もなかったように床を照らしていた。',
    'ふと目を覚ますと、昨夜の悪夢など知らない顔で、世界は動き出していた。'
  ],
  midday: [ // 昼前〜昼：10時〜14時ごろ
    'ふと目を覚ますと、部屋には昼の光が白々と満ちていた。',
    'ふと目を覚ますと、時計はもう昼近くを指していた。',
    'ふと目を覚ますと、窓の外の世界はすっかり日常の顔をしていた。',
    'ふと目を覚ますと、太陽は高く、夢の闇だけが自分の中に残っていた。',
    'ふと目を覚ますと、午前中はもう半分以上、どこかへ消えていた。'
  ],
  afternoon: [ // 午後：14時〜17時ごろ
    'ふと目を覚ますと、午後の光が鈍く部屋に差し込んでいた。',
    'ふと目を覚ますと、時計の針は信じがたい時刻を示していた。',
    'ふと目を覚ますと、昼下がりの静けさが部屋を満たしていた。',
    'ふと目を覚ますと、外の光はもう少し傾き始めていた。',
    'ふと目を覚ますと、眠りすぎた身体だけが、鉛のように重かった。'
  ],
  evening: [ // 夕方／薄暮：17時〜19時ごろ
    'ふと目を覚ますと、窓の外は夕暮れの色に染まっていた。',
    'ふと目を覚ますと、部屋の中は赤く、どこか知らない場所のようだった。',
    'ふと目を覚ますと、沈みかけた光がカーテンを淡く燃やしていた。',
    'ふと目を覚ますと、一日が終わろうとしていることだけがわかった。',
    'ふと目を覚ますと、夕闇が部屋の隅から静かに這い上がっていた。'
  ],
  night: [ // 夜：19時〜23時ごろ
    'ふと目を覚ますと、窓の外にはもう夜が降りていた。',
    'ふと目を覚ますと、部屋は暗く、街灯の光だけがぼんやり揺れていた。',
    'ふと目を覚ますと、テレビも音楽もなく、夜だけがそこにあった。',
    'ふと目を覚ますと、見慣れた部屋が知らない影をまとっていた。',
    'ふと目を覚ますと、現実に戻ったはずなのに、まだ夢の底にいるようだった。'
  ],
  deepNight: [ // 深夜：23時〜3時ごろ
    'ふと目を覚ますと、時計は深夜を少し回ったところだった。',
    'ふと目を覚ますと、部屋の闇は眠る前よりも濃くなっていた。',
    'ふと目を覚ますと、家じゅうが息を潜めているように静まり返っていた。',
    'ふと目を覚ますと、夢の続きを待つように、夜がまだそこにあった。',
    'ふと目を覚ますと、眠るには早すぎず、起きるには遅すぎる時刻だった。'
  ]
};
// 実時刻（0〜23）から時間帯を判定し、その中からランダムに1文を選ぶ
function pickWakeUpLineForHour(hour) {
  let band;
  if (hour >= 3 && hour < 5) band = wakeUpLinesByTimeBand.lateNight;
  else if (hour >= 5 && hour < 7) band = wakeUpLinesByTimeBand.earlyMorning;
  else if (hour >= 7 && hour < 10) band = wakeUpLinesByTimeBand.morning;
  else if (hour >= 10 && hour < 14) band = wakeUpLinesByTimeBand.midday;
  else if (hour >= 14 && hour < 17) band = wakeUpLinesByTimeBand.afternoon;
  else if (hour >= 17 && hour < 19) band = wakeUpLinesByTimeBand.evening;
  else if (hour >= 19 && hour < 23) band = wakeUpLinesByTimeBand.night;
  else band = wakeUpLinesByTimeBand.deepNight;
  return band[Math.floor(Math.random() * band.length)];
}
// 真エンド（同僚生存）限定：ENDの後、現実の日時を表示する画面 →（クリックで）クリアメッセージ画面 → タイトルへ
const bossClearMessageFadeMs = 1200;
const bossClearMessageLines = [
  'クリアおめでとうございます。'
  ];
// 同僚が生存していない場合の代替エンド（画面は黒くなり、1行だけ表示してENDへ）
const bossAltEndCues = [
  { start: 0, fadeMs: 1500 }, // 1行目
  { start: 2200, fadeMs: 800 } // END
];
const bossAltEndReturnAtMs = 5800; // このタイミングでタイトルへ戻る
let bossFinalSequence = null; // null、または { phase, phaseTimerMs, partnerAlive }

// ===== ノーマルルート終了時の「負けイベント」戦闘（第？？？？） =====
// ADV3をノーマルルート（夢ルートではない）で終えた場合、これが最終日となり、
// オフィスが静止→暗転→ラスボス（通常）降臨→必ず負ける特別な戦闘、を経てノーマルエンドへ至る
const normalEndBossImage = loadImage('images/dreamcatcher/last_boss_normal.png');
const normalEndFreezeDurationMs = 2500; // 自機・同僚が操作不可のまま静止している時間
const normalEndShakeDurationMs = 2200; // 振動・明滅しながら画面が暗転するまでの時間
const normalEndHoleCount = 7;
const normalEndBulletSpeed = 6.5; // 通常のラスボス弾より速い、高速弾
const normalEndFireIntervalMs = 700;
const normalEndPartnerAutoParryCap = 0.5; // 同僚のオートパリィ確率は、この戦闘中は最大でもこの値までしか出ない
const normalEndPartnerLoseDelayMinMs = 12000; // 同僚が力尽きるまでの時間（幅を持たせた保険。実際は被弾で先に力尽きることが多い）
const normalEndPartnerLoseDelayMaxMs = 18000;
// 同僚のSAN・寿命が0になることが確定した瞬間から、全体の進行速度を10%に落として3秒ほど間を置き、
// その後すべての動きを完全に止めて、同僚が点滅しながら消えていく演出を挟む
const normalEndPartnerLossSlowmoRatio = 0.1;
const normalEndPartnerLossSlowmoDurationMs = 3000;
const normalEndPartnerVanishDurationMs = 1800; // 同僚が点滅しながら消えきるまでの時間
const normalEndPartnerVanishBlinkIntervalMs = 150; // 点滅の間隔
const normalEndFadeOutDurationMs = 1200;
const normalEndScreenFadeOutDurationMs = 3000; // クリック後、文字も含め画面全体が黒くフェードアウトしてタイトルへ戻るまでの時間
const normalEndBgFadeInDurationMs = 2600; // 黒背景から、背景画像after_ENDがゆっくりフェードインしきるまでの時間
const normalEndBgDimOverlayAlpha = 0.35; // 背景画像を通常より少し暗めに見せておくオーバーレイの濃さ
const normalEndTextFadeDelayAfterBgMs = 3000; // 背景画像が表示しきってから、文字が現れ始めるまでの間
const normalEndTextFadeDelayMs = normalEndBgFadeInDurationMs + normalEndTextFadeDelayAfterBgMs; // 背景画像のフェードイン開始から、文字が現れ始めるまでの間
const normalEndTextFadeInDurationMs = 2600; // 文字がゆっくりフェードインしきるまでの時間
const normalEndTextFadeOutDurationMs = 2400; // クリック後、文字がゆっくりフェードアウトしきるまでの時間
let normalEndSequence = null; // null、または { phase, phaseTimerMs, battleTimerMs, partnerLoseAtMs, partnerLost }
// 「{partner}を助けないと…」画面表示直後、誤って（または残っていたクリックで）即座にタイトルへ
// 進んでしまわないよう、この時刻を過ぎるまではクリックしてもタイトルへは移行しない
const normalEndScreenClickLockDurationMs = 1000;
let normalEndScreenClickUnlockAt = 0;

// 「同僚と遊ぶ」ADV3をノーマルルートで終えた直後に呼ばれる。この日が最終日として扱われる
function startNormalEndBattleSequence() {
  clearFieldBeforeEventBattle();
  enemies.length = 0;
  fixedEnemies.length = 0;
  quizState = null;
  lunchState = null;
  scheduledReport = null;
  currentHour = maxOvertimeHour;
  lastHourTime = gameClockMs;
  player.x = canvas.width / 2 - 24;
  player.y = canvas.height / 2;
  if (partner.active) {
    partner.x = canvas.width / 2 + 24;
    partner.y = canvas.height / 2;
    partner.vx = 0;
    partner.vy = 0;
  }
  normalEndSequence = { phase: 'freeze', phaseTimerMs: 0, battleTimerMs: 0, partnerLoseAtMs: 0, partnerLost: false };
}

// freeze（静止）→shake（振動・暗転）の間だけ進める。descendへ移ったらラスボス（通常）を出現させる
function updateNormalEndSequence(rawDt) {
  normalEndSequence.phaseTimerMs += rawDt * 1000;
  if (normalEndSequence.phase === 'freeze' && normalEndSequence.phaseTimerMs >= normalEndFreezeDurationMs) {
    normalEndSequence.phase = 'shake';
    normalEndSequence.phaseTimerMs = 0;
  } else if (normalEndSequence.phase === 'shake' && normalEndSequence.phaseTimerMs >= normalEndShakeDurationMs) {
    normalEndSequence.phase = 'descend';
    normalEndSequence.phaseTimerMs = 0;
    // 同僚のオートパリィ確率をこの戦闘の間だけ制限する（このシーケンス後は必ずタイトルへ戻るため、以後に影響しない）
    partnerParryChance = Math.min(partnerParryChance, normalEndPartnerAutoParryCap);
    bossEvent = {
      phase: 'descending', stage: 0, holes: [], totalHitsLanded: 0, descendProgress: 0,
      savedEnemies: [], offsetX: 0, offsetY: 0, moveTargetX: 0, moveTargetY: 0, moveTimerMs: 0,
      useAltImage: true, nameOverride: '？？？？'
    };
  } else if (normalEndSequence.phase === 'partnerVanish' && normalEndSequence.phaseTimerMs >= normalEndPartnerVanishDurationMs) {
    // 同僚が完全に消えきったら、ラスボスを消してエンディング演出（黒背景フェード）へ進む
    bossEvent = null;
    normalEndSequence.phase = 'fadeOut';
    normalEndSequence.phaseTimerMs = 0;
  } else if (normalEndSequence.phase === 'fadeOut' && normalEndSequence.phaseTimerMs >= normalEndFadeOutDurationMs) {
    normalEndSequence.phase = 'endScreen';
    normalEndSequence.phaseTimerMs = 0;
    normalEndScreenClickUnlockAt = Date.now() + normalEndScreenClickLockDurationMs;
  } else if (normalEndSequence.phase === 'endScreenFadeOut' && normalEndSequence.phaseTimerMs >= normalEndScreenFadeOutDurationMs) {
    finishNormalEndSequence();
  }
}

// 7つの発射口が、ランダムに動き回りながら高速弾を放つ。決して破壊できない（負けイベント専用）
function generateIndestructibleBossHoles() {
  const holes = [];
  for (let i = 0; i < normalEndHoleCount; i++) {
    let relX, relY, attempts = 0;
    do {
      relX = 0.08 + Math.random() * 0.84;
      relY = 0.25 + Math.random() * 0.65;
      attempts++;
    } while (attempts < 20 && holes.some(h => Math.hypot(h.relX - relX, h.relY - relY) < bossHoleMinSpacing));
    holes.push({
      relX, relY, hitsTaken: 0, destroyed: false, flashTimerMs: 0, maxHits: 999999,
      fireTimerMs: Math.random() * normalEndFireIntervalMs,
      wanderTargetRelX: relX, wanderTargetRelY: relY,
      wanderTimerMs: bossHoleWanderIntervalMinMs + Math.random() * (bossHoleWanderIntervalMaxMs - bossHoleWanderIntervalMinMs),
      indestructible: true
    });
  }
  return holes;
}

// 破壊できない発射口からの発射（ランダムに自機・同僚のどちらかを高速弾で狙う）
function fireIndestructibleBossBullet(hole) {
  const pos = getBossHoleAbsolutePosition(hole);
  const target = (partner.active && Math.random() < 0.5) ? partner : player;
  const angle = Math.atan2(target.y - pos.y, target.x - pos.x) + (Math.random() - 0.5) * 0.3;
  pushBossHoleBullet(pos, angle, hole, normalEndBulletSpeed / bossBulletSpeed);
}

// ノーマルルート共通のエンディング（黒背景に「{partner}を助けないと…」がフェードイン→フェードアウト→タイトルへ）
function finishNormalEndSequence() {
  const endingId = getNormalEndingByRelationship();
  // 第3回アドベンチャーパートを経てノーマルエンドに至った場合は、夢の記憶ポイントが5貯まる
  dreamMemorySave.points += dreamMemoryPointsForAdv3NormalEnd;
  dreamMemorySave.endingsCleared[endingId] = true;
  dreamMemorySave.lastRun = selectedPartnerIcon ? {
    playerGender: selectedGender,
    partnerIcon: selectedPartnerIcon,
    relationship: partner.relationship,
    endingType: endingId,
    // 第3回アドベンチャーパートを経てノーマルエンドに至った場合だけ立てるフラグ（再会シーンの条件に使う）
    viaAdv3NormalEnd: true
  } : null;
  saveCarriedProgressionForNextRun();
  saveDreamMemorySave();
  location.reload();
}

// freeze（静止）・shake（振動・暗転）中の画面：オフィスの中央に自機・同僚が立ち尽くしている
function drawNormalEndFreezeScene() {
  drawBackground();
  const selfImg = genderImageElements[selectedPlayerIcon];
  if (selfImg && selfImg.complete && selfImg.naturalWidth > 0) {
    const selfImgSize = player.radius * 4.8;
    ctx.drawImage(selfImg, player.x - selfImgSize / 2, player.y - selfImgSize / 2, selfImgSize, selfImgSize);
  }
  if (partner.active) {
    const partnerImg = partnerIconImageElements[selectedPartnerIcon];
    if (partnerImg && partnerImg.complete && partnerImg.naturalWidth > 0) {
      const partnerImgSize = partner.radius * 4.8;
      ctx.drawImage(partnerImg, partner.x - partnerImgSize / 2, partner.y - partnerImgSize / 2, partnerImgSize, partnerImgSize);
    }
  }
  if (normalEndSequence.phase === 'shake') {
    const p = Math.min(1, normalEndSequence.phaseTimerMs / normalEndShakeDurationMs);
    const flashOn = Math.sin(gameClockMs / 40) > 0;
    ctx.fillStyle = flashOn ? `rgba(180, 0, 0, ${0.2 + p * 0.3})` : `rgba(0, 0, 0, ${0.15 + p * 0.3})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // 徐々に真っ黒へフェードアウトしていく
    ctx.fillStyle = `rgba(0, 0, 0, ${p})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = (Math.random() - 0.5) * 10 * p;
    const shakeY = (Math.random() - 0.5) * 10 * p;
    canvas.style.transform = `translate(${shakeX}px, ${shakeY}px)`;
  } else {
    canvas.style.transform = '';
  }
}

// partnerVanish（同僚消滅）中の画面：戦闘中と同じ暗い部屋・ラスボスを表示したまま全ての動きが完全に止まり、
// アイテム類は表示せず、同僚だけが点滅しながら消えていく
function drawNormalEndPartnerVanishScene() {
  canvas.style.transform = '';
  drawBackground();
  drawBossEvent();
  const selfImg = genderImageElements[selectedPlayerIcon];
  if (selfImg && selfImg.complete && selfImg.naturalWidth > 0) {
    const selfImgSize = player.radius * 4.8;
    ctx.drawImage(selfImg, player.x - selfImgSize / 2, player.y - selfImgSize / 2, selfImgSize, selfImgSize);
  }
  const progress = Math.min(1, normalEndSequence.phaseTimerMs / normalEndPartnerVanishDurationMs);
  // 一定間隔で点滅させながら、消えるまでの残り時間に応じて徐々に透明にしていく
  const blinkOn = Math.floor(normalEndSequence.phaseTimerMs / normalEndPartnerVanishBlinkIntervalMs) % 2 === 0;
  const partnerAlpha = blinkOn ? (1 - progress) : 0;
  if (partnerAlpha > 0) {
    const partnerImg = partnerIconImageElements[selectedPartnerIcon];
    if (partnerImg && partnerImg.complete && partnerImg.naturalWidth > 0) {
      ctx.save();
      ctx.globalAlpha = partnerAlpha;
      const partnerImgSize = partner.radius * 4.8;
      ctx.drawImage(partnerImg, partner.x - partnerImgSize / 2, partner.y - partnerImgSize / 2, partnerImgSize, partnerImgSize);
      ctx.restore();
    }
  }
}

// fadeOut（暗転を維持）・endScreen（背景画像＋テキストがフェードイン）・endScreenFadeOut（クリック後、全体が白へフェードイン）
function drawNormalEndEndingScreen() {
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (normalEndSequence.phase === 'endScreen' || normalEndSequence.phase === 'endScreenFadeOut') {
    const isFadingIn = normalEndSequence.phase === 'endScreen';
    // 背景画像は黒からゆっくりフェードインし、フェードインが終わっても暗めのオーバーレイを重ねたままにする
    const bgFadeInAlpha = isFadingIn ? Math.min(1, normalEndSequence.phaseTimerMs / normalEndBgFadeInDurationMs) : 1;
    // 文字は、背景画像after_ENDが表示しきってから3秒待ってから、改めてゆっくりフェードインする。
    // クリック後（endScreenFadeOut）は、画面が黒くなっていくのに合わせて、文字もゆっくりフェードアウトする
    const textElapsedMs = normalEndSequence.phaseTimerMs - normalEndTextFadeDelayMs;
    const contentAlpha = isFadingIn
      ? Math.max(0, Math.min(1, textElapsedMs / normalEndTextFadeInDurationMs))
      : Math.max(0, 1 - normalEndSequence.phaseTimerMs / normalEndTextFadeOutDurationMs);
    ctx.save();
    ctx.globalAlpha = bgFadeInAlpha;
    if (afterEndImage && afterEndImage.complete && afterEndImage.naturalWidth > 0) {
      ctx.drawImage(afterEndImage, 0, 0, canvas.width, canvas.height);
    }
    ctx.fillStyle = `rgba(0, 0, 0, ${normalEndBgDimOverlayAlpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    const pronoun = getPartnerPronoun(selectedPartnerIcon);
    ctx.save();
    ctx.globalAlpha = contentAlpha;
    ctx.fillStyle = 'white';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${pronoun}を助けないと…`, canvas.width / 2, canvas.height / 2);
    ctx.restore();
    ctx.textAlign = 'left';

    // クリック後：背景・文字を含む画面全体が、3秒かけて黒くフェードアウトしていく
    if (normalEndSequence.phase === 'endScreenFadeOut') {
      const blackAlpha = Math.min(1, normalEndSequence.phaseTimerMs / normalEndScreenFadeOutDurationMs);
      ctx.fillStyle = `rgba(0, 0, 0, ${blackAlpha})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }
}

function startBossFinalSequence() {
  // 「目覚め」経由の特別なラスボス戦はここで終了。以降は通常の撃破後演出（背景・画像とも）に戻す
  dreamBossActive = false;
  // ラスボスを退けた瞬間の同僚の生死で、この先のエンディングの分岐を決めておく
  // 目覚めの一文も、撃破した瞬間の実際の時間帯で1つに固定しておく（表示のたびに変わらないように）
  bossFinalSequence = {
    phase: 'retreat', phaseTimerMs: 0, partnerAlive: partner.active,
    wakeUpLine: pickWakeUpLineForHour(new Date().getHours())
  };
}

function updateBossFinalSequence(dt) {
  const seq = bossFinalSequence;
  seq.phaseTimerMs += dt * 1000;
  if (seq.phase === 'retreat' && seq.phaseTimerMs >= bossFinalRetreatDurationMs) {
    seq.phase = 'bgRestore';
    seq.phaseTimerMs = 0;
  } else if (seq.phase === 'bgRestore' && seq.phaseTimerMs >= bossFinalBgRestoreDurationMs) {
    seq.phase = 'whiteFade';
    seq.phaseTimerMs = 0;
  } else if (seq.phase === 'whiteFade' && seq.phaseTimerMs >= bossFinalWhiteFadeDurationMs) {
    seq.phase = 'whiteWait';
    seq.phaseTimerMs = 0;
  } else if (seq.phase === 'whiteWait' && seq.phaseTimerMs >= bossFinalWhiteWaitDurationMs) {
    seq.phase = 'trueEnd';
    seq.phaseTimerMs = 0;
  } else if (seq.phase === 'trueEnd') {
    const returnAtMs = seq.partnerAlive ? bossTrueEndReturnAtMs : bossAltEndReturnAtMs;
    if (seq.phaseTimerMs >= returnAtMs) {
      if (seq.partnerAlive) {
        // 真エンド（同僚生存）限定：ENDの後、現実の日時を表示する画面へ進む
        seq.phase = 'realWorldTime';
        seq.phaseTimerMs = 0;
      } else {
        finishBossTrueEnd();
      }
    }
  } else if (seq.phase === 'clearMessageFadeIn' && seq.phaseTimerMs >= bossClearMessageFadeMs) {
    seq.phase = 'clearMessageShown';
    seq.phaseTimerMs = 0;
  } else if (seq.phase === 'clearMessageFadeOut' && seq.phaseTimerMs >= bossClearMessageFadeMs) {
    finishBossTrueEnd();
  }
  // 'realWorldTime'・'clearMessageShown' はクリック待ちのため、ここでは時間経過だけでは進行しない
}

// 真エンドに到達したので、クリア済フラグと役職・Scoreの引き継ぎを保存してタイトルへ戻る
function finishBossTrueEnd() {
  dreamMemorySave.trueEndCleared = true;
  // 前世記憶ルート（夢ルート）を完走していたかどうかに関わらず、ラスボス撃破自体は真エンド1/2に到達する。
  // 夢ルートを踏んでいたかは、別途 dreamRouteCompleted で参照できる（演出の出し分け用）
  const bossEndingId = bossFinalSequence.partnerAlive ? 'true1' : 'true2';
  dreamMemorySave.endingsCleared[bossEndingId] = true;
  dreamMemorySave.lastRun = selectedPartnerIcon ? {
    playerGender: selectedGender,
    partnerIcon: selectedPartnerIcon,
    relationship: partner.relationship,
    endingType: bossEndingId
  } : null;
  saveCarriedProgressionForNextRun();
  saveDreamMemorySave();
  if (bossEndingId === 'true1') {
    // 目覚めエンド（真エンド・同僚生存）：通常のタイトルへ戻す代わりに、専用のタイトル画面を表示する
    bossFinalSequence = null;
    trueEndTitleScreenActive = true;
  } else {
    location.reload();
  }
}

// ===== 中ボス「大規模プロジェクト」（DAY7ごと・18時に出現する）=====
// ラスボスと似た動作（フェーズ・移動・退場演出）だが、通常攻撃でもフェーズを破壊できる
const midBossWidthRatio = 0.4; // 画面幅に対する矩形の幅の割合
const midBossHeight = 90;
const midBossDescendDurationSec = 2.5;
// 案件の進め方（企画～リリース）になぞらえた、7つのフェーズ。番号順にしか破壊できない
const midBossPhaseDefs = [
  { name: '企画', info: '解決したい課題、目的、費用対効果を考える。' },
  { name: '要件定義', info: '必要な機能、性能、利用者、業務ルールを決める。' },
  { name: '基本設計', info: '利用者から見える画面や機能、システム全体の構成を決める。' },
  { name: '詳細設計', info: 'プログラム単位の処理、データ項目、内部ロジックを細かく決める。' },
  { name: '開発', info: 'プログラムを実装する。' },
  { name: 'テスト', info: '不具合がないか、要件を満たしているか確認する。' },
  { name: 'リリース・運用保守', info: 'システムをリリースし、運用・保守を行う。' }
];
const midBossPhaseCount = midBossPhaseDefs.length;
const midBossPhaseNumberIcons = ['①', '②', '③', '④', '⑤', '⑥', '⑦'];
const midBossHoleRadius = 14;
const midBossHoleFlashDurationMs = 220;
// 発射口の配置は、重複しない均等なマス目（4列×2行のうち7マスを使用）を用意し、
// それをシャッフルしてから①～⑦の番号順に割り当てる（マスの位置自体は固定間隔なので重ならない）
const midBossHoleGridCols = 4;
const midBossHoleGridRows = 2;
const midBossPhaseTextFadeMs = 600; // フェーズ内容文のフェードイン・フェードアウトにかかる時間
const midBossFireIntervalMs = 1300;
const midBossBulletSpeed = 4.0;
const midBossBulletDamageSan = 8;
const midBossBulletDamageLifespan = 2;
const midBossHitsPerHoleBase = 30; // DAY7時点の耐久力（以前の設定の約30%）
const midBossScoreReward = 150; // 通常の敵より多めのスコア
const midBossRetreatDurationMs = 3000; // 振動・フェードアウトして消えるまでの時間
let midBossEvent = null; // null、または { phase, holes, currentPhaseIndex, hitsPerHole, descendProgress, fireTimerMs, roamX, roamY, moveTargetX, moveTargetY, moveTimerMs, retreatTimerMs, phaseTextAlpha, phaseTextFadingOut }

// DAY7=1倍、DAY14=2倍、DAY21=3倍、DAY28以降=5倍（暫定）
function getMidBossDurabilityMultiplier(day) {
  const cycle = Math.round(day / 7);
  if (cycle <= 1) return 1;
  if (cycle === 2) return 2;
  if (cycle === 3) return 3;
  return 5;
}

function getMidBossGeometry() {
  const width = canvas.width * midBossWidthRatio;
  // 出現しきってから退場するまでの間は、窓の範囲を動き回っている現在位置を使う
  if (midBossEvent && (midBossEvent.phase === 'active' || midBossEvent.phase === 'retreat')) {
    return { x: midBossEvent.roamX, y: midBossEvent.roamY, width, height: midBossHeight };
  }
  const x = (canvas.width - width) / 2;
  const descendProgress = midBossEvent ? midBossEvent.descendProgress : 0;
  const topY = -midBossHeight + midBossHeight * descendProgress;
  return { x, y: topY, width, height: midBossHeight };
}

// フェーズ（発射口）は、均等なマス目をシャッフルしてから番号順に割り当てた位置に固定配置する
// （重複せず、どのマスに何番が来るかは毎回ランダムになるが、出現後に位置が動くことはない）
function generateMidBossHoles() {
  const slots = [];
  for (let row = 0; row < midBossHoleGridRows; row++) {
    for (let col = 0; col < midBossHoleGridCols; col++) {
      slots.push({
        relX: 0.1 + (col + 0.5) / midBossHoleGridCols * 0.8,
        relY: 0.25 + (row + 0.5) / midBossHoleGridRows * 0.5
      });
    }
  }
  const shuffledSlots = shuffleArray(slots);
  const holes = [];
  for (let i = 0; i < midBossPhaseCount; i++) {
    const { relX, relY } = shuffledSlots[i];
    holes.push({
      phaseIndex: i, relX, relY,
      hitsTaken: 0, destroyed: false, flashTimerMs: 0,
      // 発射口ごとにランダムな初期位相を持たせ、全ての穴が同時に発射しないようにする
      fireTimerMs: Math.random() * midBossFireIntervalMs
    });
  }
  return holes;
}

function getMidBossHoleAbsolutePosition(hole) {
  const geo = getMidBossGeometry();
  return { x: geo.x + geo.width * hole.relX, y: geo.y + geo.height * hole.relY };
}

function startMidBossEvent() {
  clearFieldBeforeEventBattle();
  enemies.length = 0; // 中ボス戦の間、通常の敵は出現しない（固定敵は従来通り出現する）
  const width = canvas.width * midBossWidthRatio;
  const startX = (canvas.width - width) / 2;
  midBossEvent = {
    phase: 'descending',
    descendProgress: 0,
    holes: generateMidBossHoles(),
    currentPhaseIndex: 0,
    hitsPerHole: Math.round(midBossHitsPerHoleBase * getMidBossDurabilityMultiplier(dayNumber)),
    roamX: startX, roamY: 0, roamTargetX: startX, roamTargetY: 0, moveTimerMs: 0,
    retreatTimerMs: 0,
    phaseTextAlpha: 0,
    phaseTextFadingOut: false
  };
  showMessage('「大規模プロジェクト」が発生した！ 定時までに片付けられず、居残りが確定した……', 3800, '#ff8a65', '22px sans-serif');
}

function updateMidBossEvent(dt) {
  if (midBossEvent.phase === 'descending') {
    midBossEvent.descendProgress = Math.min(1, midBossEvent.descendProgress + dt / midBossDescendDurationSec);
    if (midBossEvent.descendProgress >= 1) {
      midBossEvent.phase = 'active';
      showMessage('「大規模プロジェクト」出現！ フェーズを番号順に破壊して片付けろ！', 3000, '#ff8a65', '22px sans-serif');
    }
    return;
  }
  if (midBossEvent.phase === 'retreat') {
    midBossEvent.retreatTimerMs += dt * 1000;
    if (midBossEvent.retreatTimerMs >= midBossRetreatDurationMs) {
      finishMidBossEvent();
    }
    return;
  }

  // 本体が窓の範囲を自由に動き回る（以前より少しゆっくり移動する）
  midBossEvent.moveTimerMs -= dt * 1000;
  if (midBossEvent.moveTimerMs <= 0) {
    const width = canvas.width * midBossWidthRatio;
    const minX = 10;
    const maxX = Math.max(minX, canvas.width - width - 10);
    const minY = 0;
    const maxY = Math.max(minY, windowZoneBottomY - midBossHeight);
    midBossEvent.roamTargetX = minX + Math.random() * (maxX - minX);
    midBossEvent.roamTargetY = minY + Math.random() * (maxY - minY);
    midBossEvent.moveTimerMs = 2200 + Math.random() * 2200;
  }
  const moveEase = Math.min(1, dt * bossMoveEaseFactor * 0.4); // 動き回る範囲が広い上に、以前よりゆっくり移動させる
  midBossEvent.roamX += (midBossEvent.roamTargetX - midBossEvent.roamX) * moveEase;
  midBossEvent.roamY += (midBossEvent.roamTargetY - midBossEvent.roamY) * moveEase;

  // フェーズ（発射口）ごとの点滅減衰・独立したタイミングでの発射（配置は固定なので徘徊はしない）
  for (const hole of midBossEvent.holes) {
    if (hole.flashTimerMs > 0) hole.flashTimerMs = Math.max(0, hole.flashTimerMs - dt * 1000);
    if (hole.destroyed) continue;

    // 発射口ごとに独立したタイミングでランダムに発射する（全ての穴が同時に撃たないようにする）
    hole.fireTimerMs -= dt * 1000;
    if (hole.fireTimerMs <= 0) {
      fireSingleMidBossHoleBullet(hole);
      hole.fireTimerMs = midBossFireIntervalMs * (0.6 + Math.random() * 0.8);
    }
  }

  // 現在対応中のフェーズの内容文を、フェードイン／フェードアウトさせながら表示する
  const phaseFadeStep = dt * 1000 / midBossPhaseTextFadeMs;
  if (midBossEvent.phaseTextFadingOut) {
    midBossEvent.phaseTextAlpha = Math.max(0, midBossEvent.phaseTextAlpha - phaseFadeStep);
    if (midBossEvent.phaseTextAlpha <= 0) midBossEvent.phaseTextFadingOut = false;
  } else {
    midBossEvent.phaseTextAlpha = Math.min(1, midBossEvent.phaseTextAlpha + phaseFadeStep);
  }
}

// 発射口1つぶんの弾を発射する（発射口ごとに独立したタイミングで呼ばれる）
function fireSingleMidBossHoleBullet(hole) {
  const pos = getMidBossHoleAbsolutePosition(hole);
  const target = (partner.active && Math.random() < 0.5) ? partner : player;
  const angle = Math.atan2(target.y - pos.y, target.x - pos.x) + (Math.random() - 0.5) * 0.3;
  bullets.push({
    x: pos.x, y: pos.y,
    vx: Math.cos(angle) * midBossBulletSpeed,
    vy: Math.sin(angle) * midBossBulletSpeed,
    radius: 6, damage: 1, bounces: 0, owner: 'midBoss',
    sourceHole: hole,
    sourceHoleKind: 'midBoss'
  });
}

// 番号順にしか破壊できないため、現在対応中のフェーズ以外は命中判定を持たない。
// ただし役職スキル「アジャイル開発」を習得していると、7つのどこに当てても
// 今対応すべき番号への命中として扱われる（柔軟に軌道修正できるイメージ）
function findHitMidBossHole(x, y) {
  if (!midBossEvent || midBossEvent.phase !== 'active') return null;
  const currentHole = midBossEvent.holes[midBossEvent.currentPhaseIndex];
  if (!currentHole || currentHole.destroyed) return null;
  if (rankSkillLevels.has('agile')) {
    for (const hole of midBossEvent.holes) {
      if (hole.destroyed) continue;
      const pos = getMidBossHoleAbsolutePosition(hole);
      if (Math.hypot(x - pos.x, y - pos.y) <= midBossHoleRadius + 6) return currentHole;
    }
    return null;
  }
  const pos = getMidBossHoleAbsolutePosition(currentHole);
  if (Math.hypot(x - pos.x, y - pos.y) <= midBossHoleRadius + 6) return currentHole;
  return null;
}

function registerMidBossHoleHit(hole, hitX, hitY) {
  // 「β版設定」：1発ごとに耐久力の最大値の20%ぶんダメージを与え、最低5発で撃破できるようにする
  const betaHitIncrement = isBetaModeBossDamageActive() ? midBossEvent.hitsPerHole * betaModeBossDamageRatio : 0;
  hole.hitsTaken += Math.max(1, betaHitIncrement);
  hole.flashTimerMs = midBossHoleFlashDurationMs;
  spawnHitSpark(hitX, hitY, hole.hitsTaken >= midBossEvent.hitsPerHole);
  if (hole.hitsTaken < midBossEvent.hitsPerHole) return;
  // フェーズ破壊：発射口自体が消滅し、内容文はフェードアウトさせてから次のフェーズへ進む
  hole.destroyed = true;
  const def = midBossPhaseDefs[hole.phaseIndex];
  showMessage(`${hole.phaseIndex + 1}. ${def.name}完了！`, 2400, '#69f0ae', '22px sans-serif');
  midBossEvent.phaseTextFadingOut = true;
  midBossEvent.currentPhaseIndex++;
  if (midBossEvent.currentPhaseIndex < midBossPhaseCount) return;
  score += midBossScoreReward;
  showMessage(`「大規模プロジェクト」を片付けた！ Score +${midBossScoreReward}`, 2800, '#69f0ae', '22px sans-serif');
  midBossEvent.phase = 'retreat';
  midBossEvent.retreatTimerMs = 0;
}

// 「大規模プロジェクト」を撃破し終えた後：24時を過ぎていれば、その場ですぐに一日を終了する
function finishMidBossEvent() {
  midBossEvent = null;
  if (currentHour >= dayEndHour && !gameOver && !deathSequence) {
    endWorkday();
  }
}

// ===== 援護弾（ボスが倒せない時の救済措置） =====
// 「大規模プロジェクト」・ラスボス戦（ノーマルルート終了時の負けイベント戦闘は除く）中、
// ゲーム内時間で3時間経過するごとに50%の確率で発生する。自機から最も遠い画面端から、
// 自機に向かってまっすぐ飛んでくる。パリィすると、今対応すべき部位へ飛び、一撃で破壊する。
// 何もされなければ、そのまま画面の反対側へ通り過ぎて消える
const supportBulletCheckIntervalMs = hourMs * 3; // ゲーム内3時間ごとに判定する
const supportBulletSpawnChance = 0.5;
const supportBulletSpeed = 1.6;
const supportBulletRadius = 16;
const supportBulletOffscreenMargin = 60; // これだけ画面の外へ出たら、通り過ぎたものとして消える
let supportBulletCheckAccumMs = 0;

// 援護弾を発生させられる状況（イベント戦は除く）かどうか
function isRescueEligibleBattleActive() {
  if (bossEvent && bossEvent.phase === 'active' && !(normalEndSequence && normalEndSequence.phase === 'battle')) return true;
  if (midBossEvent && midBossEvent.phase === 'active') return true;
  return false;
}

// 自機から最も遠い画面端を選び、そこから自機へ向けて援護弾を発生させる
function spawnSupportBullet() {
  const distTop = player.y, distBottom = canvas.height - player.y,
    distLeft = player.x, distRight = canvas.width - player.x;
  const maxDist = Math.max(distTop, distBottom, distLeft, distRight);
  let x, y;
  if (maxDist === distTop) { x = player.x; y = -30; }
  else if (maxDist === distBottom) { x = player.x; y = canvas.height + 30; }
  else if (maxDist === distLeft) { x = -30; y = player.y; }
  else { x = canvas.width + 30; y = player.y; }
  const angle = Math.atan2(player.y - y, player.x - x);
  bullets.push({
    x, y, vx: Math.cos(angle) * supportBulletSpeed, vy: Math.sin(angle) * supportBulletSpeed,
    radius: supportBulletRadius, owner: 'support', damage: 0,
    sourceContext: bossEvent ? 'boss' : 'midBoss'
  });
  showMessage('援護弾が飛んでくる！ パリィで迎え撃てるかもしれない', 3400, '#ce93d8', '20px sans-serif');
}

// 援護弾の発生判定・画面を通り過ぎて消える処理を行う
function updateSupportBulletSystem(dt) {
  if (!isRescueEligibleBattleActive()) {
    supportBulletCheckAccumMs = 0;
    // 戦闘が終わった・イベント戦に切り替わった場合は、飛来中の援護弾も消しておく
    for (let i = bullets.length - 1; i >= 0; i--) {
      if (bullets[i].owner === 'support') bullets.splice(i, 1);
    }
    return;
  }
  const existing = bullets.find(b => b.owner === 'support');
  if (existing) {
    // 何もされないまま画面の反対側まで通り過ぎたら、そのまま消える
    if (existing.x < -supportBulletOffscreenMargin || existing.x > canvas.width + supportBulletOffscreenMargin ||
        existing.y < -supportBulletOffscreenMargin || existing.y > canvas.height + supportBulletOffscreenMargin) {
      const idx = bullets.indexOf(existing);
      if (idx >= 0) bullets.splice(idx, 1);
    }
    return; // 飛来中は次の出現判定を行わない
  }
  supportBulletCheckAccumMs += dt * 1000;
  while (supportBulletCheckAccumMs >= supportBulletCheckIntervalMs) {
    supportBulletCheckAccumMs -= supportBulletCheckIntervalMs;
    if (Math.random() < supportBulletSpawnChance) {
      spawnSupportBullet();
      break;
    }
  }
}

// 現在パリィで狩れば一撃で破壊できる「今対応すべき部位」を返す（大規模プロジェクトは現在フェーズの発射口、
// ラスボスは就職活動段階なら先頭の未破壊発射口、それ以外は最も被弾が進んでいる発射口）
function getSupportBulletRescueTarget() {
  if (midBossEvent && midBossEvent.phase === 'active') {
    const hole = midBossEvent.holes[midBossEvent.currentPhaseIndex];
    if (hole && !hole.destroyed) {
      const pos = getMidBossHoleAbsolutePosition(hole);
      return { kind: 'midBoss', hole, x: pos.x, y: pos.y };
    }
    return null;
  }
  if (bossEvent && bossEvent.phase === 'active') {
    let hole = null;
    if (bossEvent.stage === 7) {
      hole = bossEvent.holes.find(h => !h.destroyed);
    } else {
      const alive = bossEvent.holes.filter(h => !h.destroyed && !h.indestructible);
      hole = alive.reduce((best, h) => (!best || h.hitsTaken > best.hitsTaken) ? h : best, null);
    }
    if (hole) {
      const pos = getBossHoleAbsolutePosition(hole);
      return { kind: 'boss', hole, x: pos.x, y: pos.y };
    }
  }
  return null;
}

// 援護弾をパリィした瞬間：雷のような一撃を今対応すべき部位へ飛ばし、一撃で破壊する
function triggerSupportBulletRescue(bullet) {
  const idx = bullets.indexOf(bullet);
  if (idx >= 0) bullets.splice(idx, 1);
  const target = getSupportBulletRescueTarget();
  if (!target) {
    showMessage('援護対象が見当たらない……', 2000, '#b39ddb');
    return;
  }
  spawnSynergyBeam(bullet.x, bullet.y, target.x, target.y);
  if (target.kind === 'midBoss') {
    target.hole.hitsTaken = midBossEvent.hitsPerHole;
    registerMidBossHoleHit(target.hole, target.x, target.y);
  } else {
    target.hole.hitsTaken = target.hole.maxHits;
    registerBossHoleHit(target.hole, target.x, target.y);
  }
  showMessage('援護が入り、業務が大幅に進んだ!', 2600, '#fff176', '22px sans-serif');
}

function damagePlayerByMidBossBullet() {
  if (friendlyFireInvincibleTimer > 0) return;
  if (playerBarrierCharges > 0) {
    playerBarrierCharges--;
    friendlyFireInvincibleTimer = friendlyFireInvincibleDuration;
    return;
  }
  san = Math.max(0, san - midBossBulletDamageSan * specialSkillEffects.sanDamageMultiplier);
  lifespan = Math.max(0, lifespan - midBossBulletDamageLifespan);
  friendlyFireInvincibleTimer = friendlyFireInvincibleDuration;
  friendlyFireHitFlashTimer = friendlyFireHitEffectDuration;
  explosionShakeTimer = Math.max(explosionShakeTimer, friendlyFireHitEffectDuration);
  checkVitalsGameOver();
}

function damagePartnerByMidBossBullet() {
  if (!partner.active || partner.friendlyFireInvincibleTimer > 0) return;
  if (partner.barrierCharges > 0) {
    partner.barrierCharges--;
    partner.friendlyFireInvincibleTimer = friendlyFireInvincibleDuration;
    return;
  }
  partner.san = Math.max(0, partner.san - midBossBulletDamageSan);
  partner.lifespan = Math.max(0, partner.lifespan - midBossBulletDamageLifespan);
  partner.friendlyFireInvincibleTimer = friendlyFireInvincibleDuration;
}

// ===== パリィ（バットのように、タイミングよく振ると同僚弾を最寄りの敵へ打ち返す） =====
const deflectRange = 90; // これより近くにある同僚弾だけをパリィできる（やや緩めの判定）
// 同僚が被弾しそうな時にパリィする確率。デフォルト30%で、夢の記憶ポイントの
// 「同僚のオートパリィレベル」で最大100%まで強化できる
let partnerParryChance = Math.min(1, 0.3 + dreamMemorySave.upgrades.partnerAutoParry * 0.14); // ゲーム開始時にapplyDreamMemoryUpgradesForNewGameで再計算
const deflectDamageMultiplier = 2; // パリィした弾は通常の2倍のダメージになる
// パリィによる直接攻撃：パリィの効果範囲に敵本体の判定範囲が重なっている場合、直接ダメージを与える
const parryDirectDamage = 2;
function damageEnemyDirectByParry(en) {
  updateSkillEffects();
  const damageBonus = 1 + skillLevel * 0.08;
  const actualDmg = Math.max(1, Math.round(parryDirectDamage * damageBonus));
  en.hp = (en.hp || 1) - actualDmg;
  spawnHitSpark(en.x, en.y, en.hp <= 0);
  if (en.hp > 0) return;
  const pts = Math.ceil(en.type * 3 * specialSkillEffects.scoreGainMultiplier);
  score += pts;
  exp += en.type * 5 * specialSkillEffects.expGainMultiplier;
  updateSkillEffects();
  if (en.hitByPartner && partner.active) {
    showRandomPartnerSpeechBubbleIfFriendly(partnerThanksLines, '#69f0ae', partnerThanksStressedLines);
    if (Math.random() < partnerThanksRelationshipChance) adjustPartnerRelationship(1);
  }
  recordJobDefeatForStats(en.text);
  const idx = enemies.indexOf(en);
  if (idx >= 0) enemies.splice(idx, 1);
  weeklyKills++;
  weeklyScoreGained += pts;
  checkEarlyQuotaAchievement();
  if (countActiveWorkEnemies() === 0) waveCooldownMs = waveCooldownDelayMs;
}
function attemptDeflectPartnerBullet() {
  if (stunned) return;
  spawnSlashEffect(player.x, player.y, player.angle, player.radius); // 命中の有無に関わらず、振った動作自体を見せる
  // 範囲内の条件を満たす弾は、まとめて同時にパリィする（1発だけに限らない）
  const targets = bullets.filter(b => {
    // ネットワークスペシャリスト：画面端で反射した自弾（1回目以降すべて）も、パリィで狩り直せる
    const isBouncedOwnBullet = b.owner === 'player' && b.bouncesUsed >= 1;
    if (b.owner !== 'partner' && b.owner !== 'boss' && b.owner !== 'midBoss' &&
        b.owner !== 'fixedEnemy' && b.owner !== 'fixedEnemyDisguise' && b.owner !== 'support' && !isBouncedOwnBullet) return false;
    const d = Math.hypot(b.x - player.x, b.y - player.y);
    return d <= deflectRange + b.radius;
  });
  // パリィの効果範囲に本体が重なっている敵は、弾の有無に関わらず直接攻撃の対象にする。
  // 同僚（partner）はenemies配列に含まれないため、直接攻撃の対象には含まれない（同僚弾のはじき返しのみ引き続き有効）
  const meleeTargets = enemies.filter(en => en !== partner && Math.hypot(en.x - player.x, en.y - player.y) <= deflectRange + en.radius);
  if (targets.length === 0 && meleeTargets.length === 0) return;

  // パリィ（弾のはじき返し、または直接攻撃）に成功した時だけ、脳疲労が1蓄積する
  applyFatigueGain(fatigueParryGain);
  for (const target of targets) {
    performBulletParry(target, player.x, player.y, player.angle);
  }
  meleeTargets.forEach(en => damageEnemyDirectByParry(en));
  const messageParts = [];
  if (targets.length > 0) messageParts.push(targets.length > 1 ? `弾${targets.length}発` : '弾');
  if (meleeTargets.length > 0) messageParts.push(meleeTargets.length > 1 ? `敵${meleeTargets.length}体` : '敵');
  showMessage(`パリィ成功！（${messageParts.join('・')}）`, 1400, '#fff176');
}
// スマホ用自動照準のターゲットを返す。定時報告が出ている間は、同僚の自律攻撃と同様にそちらを優先する
// allowPartner: 完全オート・自動攻撃モードではない（自分の意思で撃っている）時にtrue。
// この場合だけ、同僚も狙い先の候補に含める（同僚しか近くにいない場面などで、あえてその方向へ撃てるようにする）
function findAutoAimTarget(allowPartner = false) {
  if (scheduledReport) return { en: scheduledReport };
  if (fixedEnemies.length > 0) {
    const nearest = fixedEnemies.reduce((closest, fx) => {
      const d = Math.hypot(fx.x - player.x, fx.y - player.y);
      return (!closest || d < closest.d) ? { en: fx, d } : closest;
    }, null);
    return { en: nearest.en };
  }
  // ラスボスの出現中は、生きている発射口も通常の敵と同様にオート照準の対象にする
  const bossHolePos = findNearestLivingBossHole(player.x, player.y);
  if (bossHolePos) return { en: bossHolePos };
  const nearestEnemyTarget = findNearestEnemyToPlayer();
  if (!allowPartner || !partner.active) return nearestEnemyTarget;
  // オートでなく自分で操作して撃っている時は、同僚がいる方向にも狙いを向けられるようにする
  const partnerDist = Math.hypot(partner.x - player.x, partner.y - player.y);
  if (!nearestEnemyTarget ||
      partnerDist < Math.hypot(nearestEnemyTarget.en.x - player.x, nearestEnemyTarget.en.y - player.y)) {
    return { en: partner };
  }
  return nearestEnemyTarget;
}

// ===== 完全オートモードの移動AI =====
// 同僚弾の弾道上にいて、これから当たりそうな場合、弾道と垂直方向へ大きく避ける
// 同僚弾を確実に避けきれるよう、脅威となる弾すべてを合成して回避方向を決める
// （最も近い1発だけを見ると、それを避けた先で別の弾に当たってしまうことがあるため）
const fullAutoDodgeLookaheadDistance = 260; // 早めに反応できるよう、やや手前から警戒する
const fullAutoDodgeSideMargin = 40; // 弾道からこれだけ離れていれば無視する（余裕を持って避ける）
const fullAutoDodgeStuckThreshold = 0.15; // 複数弾の回避方向がほぼ打ち消し合ったとみなす閾値
let fullAutoDodgeEscapeDirection = null;
let fullAutoDodgeEscapeTimerMs = 0;

function computeFullAutoDodgeVector(dt) {
  let vx = 0, vy = 0;
  let hasThreat = false;
  for (const b of bullets) {
    if (b.owner !== 'partner' && b.owner !== 'boss' && b.owner !== 'midBoss' && b.owner !== 'fixedEnemy') continue;
    const speed = Math.hypot(b.vx, b.vy) || 1;
    const dirX = b.vx / speed;
    const dirY = b.vy / speed;
    const dx = player.x - b.x;
    const dy = player.y - b.y;
    const forward = dx * dirX + dy * dirY;
    if (forward <= 0 || forward > fullAutoDodgeLookaheadDistance) continue;
    const clearance = player.radius + (b.radius || 4) + fullAutoDodgeSideMargin;
    const perpendicular = dx * dirY - dy * dirX;
    if (Math.abs(perpendicular) > clearance) continue;
    hasThreat = true;
    // 弾道の真上に近く、かつ迫っている弾ほど、この弾からの回避方向を強く反映する
    const urgency = 1 - forward / fullAutoDodgeLookaheadDistance;
    const sign = perpendicular >= 0 ? 1 : -1;
    vx += -dirY * sign * urgency;
    vy += dirX * sign * urgency;
  }
  if (!hasThreat) {
    fullAutoDodgeEscapeTimerMs = 0;
    return null;
  }
  // 既にランダム方向への脱出中なら、時間が切れるまで同じ方向を保って振動を防ぐ
  if (fullAutoDodgeEscapeTimerMs > 0) {
    fullAutoDodgeEscapeTimerMs -= dt * 1000;
    return fullAutoDodgeEscapeDirection;
  }
  const len = Math.hypot(vx, vy);
  // 複数の弾から受ける回避方向がほぼ打ち消し合った場合、振動する代わりにランダムな方向へ逃げる
  if (len < fullAutoDodgeStuckThreshold) {
    const randomAngle = Math.random() * Math.PI * 2;
    fullAutoDodgeEscapeDirection = { x: Math.cos(randomAngle), y: Math.sin(randomAngle) };
    fullAutoDodgeEscapeTimerMs = fullAutoEscapeDurationMs;
    return fullAutoDodgeEscapeDirection;
  }
  return { x: vx / len, y: vy / len };
}

// 優先度2：近い敵から離れようとする反発ベクトルを返す（敵との接触を避けるため。かなり近づいてから反応する）
function computeFullAutoEnemyAvoidanceVector() {
  const avoidMargin = 24; // 敵の半径に加えて、これだけの余裕を保とうとする
  let vx = 0, vy = 0;
  for (const e of enemies) {
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const dist = Math.hypot(dx, dy);
    const threshold = player.radius + (e.radius || 0) + avoidMargin;
    if (dist > 0 && dist < threshold) {
      const strength = (threshold - dist) / threshold;
      vx += (dx / dist) * strength;
      vy += (dy / dist) * strength;
    }
  }
  return { x: vx, y: vy };
}

// 完全オートモード中の移動方向（-1〜1に正規化済み）を、優先度順に1つだけ選んで決める
// （複数の意図を混ぜず、優先度が高いものだけに従うことで振動を防ぐ）
// 優先度1: 同僚弾の回避 → 優先度2: 近い敵からの回避 → 優先度3: 同僚との距離を置く
// （チョコレート・栄養ドリンク・コーヒー・ファイヤーウォール・食事はいずれも、自機が実際にその場へ来ない限り
// 　取得されないため、完全オートモード中はクリック操作がない以上、これらを取得できない）
// 敵の反発がほぼ打ち消し合って板挟みになった時、振動せずランダムな方向へ抜け出すための状態
const fullAutoStuckVectorThreshold = 0.15; // 合成ベクトルの大きさがこれ未満なら「板挟み」とみなす
const fullAutoEscapeDurationMs = 500; // 一度ランダムな方向へ逃げ始めたら、この間は同じ方向を保つ
// 他に優先事項がない時、同僚とこれ以上近づかないようにする距離
const fullAutoPartnerKeepDistance = 130;
// 完全オートモードで発砲を控える際、射線ちょうどだけでなくこの余裕分だけ手前からも同僚を避ける
const fullAutoPartnerLineOfFireMargin = 30;
let fullAutoEscapeDirection = null;
let fullAutoEscapeTimerMs = 0;

function computeFullAutoMoveVector(dt) {
  // 優先度1：同僚弾の回避
  const dodge = computeFullAutoDodgeVector(dt);
  if (dodge) {
    fullAutoEscapeTimerMs = 0;
    return dodge;
  }

  // 優先度2：近い敵からの回避（敵がいなければ何もしない）
  const avoid = computeFullAutoEnemyAvoidanceVector();
  const avoidLen = Math.hypot(avoid.x, avoid.y);
  const hasNearbyThreat = avoidLen > 0;

  if (hasNearbyThreat) {
    // 既にランダム方向への脱出中なら、時間が切れるまでは同じ方向を保って振動を防ぐ
    if (fullAutoEscapeTimerMs > 0) {
      fullAutoEscapeTimerMs -= dt * 1000;
      return fullAutoEscapeDirection;
    }
    // 反発がほぼ打ち消し合い、どちらへ動いてもダメージを受けかねない板挟み状態になったら、
    // 振動する代わりにランダムな方向へ一定時間逃げて突破する
    if (avoidLen < fullAutoStuckVectorThreshold) {
      const randomAngle = Math.random() * Math.PI * 2;
      fullAutoEscapeDirection = { x: Math.cos(randomAngle), y: Math.sin(randomAngle) };
      fullAutoEscapeTimerMs = fullAutoEscapeDurationMs;
      return fullAutoEscapeDirection;
    }
    return { x: avoid.x / avoidLen, y: avoid.y / avoidLen };
  }
  fullAutoEscapeTimerMs = 0;

  // 優先度3：他に優先事項がなければ、同僚から距離を置く
  // （同僚弾を被弾しにくくし、自機の弾線上に同僚が入って誤射を防ぐ状況自体も減らす）
  if (partner.active) {
    const pdx = player.x - partner.x;
    const pdy = player.y - partner.y;
    const pdist = Math.hypot(pdx, pdy);
    if (pdist > 0 && pdist < fullAutoPartnerKeepDistance) {
      return { x: pdx / pdist, y: pdy / pdist };
    }
  }
  return { x: 0, y: 0 };
}

// タイトル・各種選択画面・演出中でない、実際にプレイ中の画面かどうか
// （アイテムのクリック取得・クリックによるオート攻撃切替を有効にする条件）
function isInCoreGameplayForClickActions() {
  return !startScreen && setupStep === null && !dreamMemoryShopActive &&
    !endingListActive && !specialSkillSelectionActive && !adventureState && !reunionSceneActive &&
    !bossFinalSequence && !normalEndSequence && !isPaused && !wakeUpConfirmActive &&
    !gameOver && !gameClear && dayTransitionPhase === null;
}

// クリック／タップした地点が、着地済みのアイテムの上であればそれを取得する（自機のみ。同僚は従来通り自動）
const itemClickHitTolerance = 6;
function tryCollectItemAtPoint(p) {
  if (chocolate && chocolate.landed &&
      Math.hypot(p.x - chocolate.x, p.y - chocolate.y) <= chocolate.radius + itemClickHitTolerance) {
    consumeChocolate();
    return true;
  }
  if (coffee && coffee.landed && !(coffee.graceMs > 0) &&
      Math.hypot(p.x - coffee.x, p.y - coffee.y) <= coffee.radius + itemClickHitTolerance) {
    consumeCoffee();
    return true;
  }
  if (energyDrink && energyDrink.landed && !(energyDrink.graceMs > 0) &&
      Math.hypot(p.x - energyDrink.x, p.y - energyDrink.y) <= energyDrink.radius + itemClickHitTolerance) {
    consumeEnergyDrink();
    return true;
  }
  if (heartWall && heartWall.landed &&
      Math.hypot(p.x - heartWall.x, p.y - heartWall.y) <= heartWall.radius + itemClickHitTolerance) {
    consumeHeartWall();
    return true;
  }
  if (lunchState) {
    for (let i = lunchState.items.length - 1; i >= 0; i--) {
      const item = lunchState.items[i];
      if (Math.hypot(p.x - item.x, p.y - item.y) <= item.radius + itemClickHitTolerance) {
        collectLunchItem(i);
        return true;
      }
    }
  }
  return false;
}

// ===== メニュー選択のタップ／クリック対応 =====
// draw()が毎フレーム、現在表示中のメニューに応じて再構築する
let uiButtons = [];
canvas.addEventListener('click', (event) => {
  if (acknowledgementNotice) {
    resumeFromAcknowledgement();
    return;
  }
  // 再会シーン中は、クリック／タップで暗転→セリフ→地の文の順に進める
  if (reunionSceneActive) {
    advanceReunionScene();
    return;
  }
  // 一日の終わりの演出で入力待ち中なら、どこをクリック／タップしても次の日へ進める
  // （ただし特殊スキルの選択画面が同時に開いている場合は、そちらの選択を優先する）
  if (dayTransitionPhase === 'waiting' && !specialSkillSelectionActive) {
    dayTransitionPhase = 'in';
    dayTransitionTimer = dayTransitionDurationMs;
    lastUpdate = Date.now();
    return;
  }
  // 真エンド（同僚生存）限定：現実の日時を表示する画面・クリアメッセージ画面は、クリックで次へ進む
  if (bossFinalSequence && bossFinalSequence.phase === 'realWorldTime') {
    bossFinalSequence.phase = 'clearMessageFadeIn';
    bossFinalSequence.phaseTimerMs = 0;
    return;
  }
  if (bossFinalSequence && bossFinalSequence.phase === 'clearMessageShown') {
    bossFinalSequence.phase = 'clearMessageFadeOut';
    bossFinalSequence.phaseTimerMs = 0;
    return;
  }
  // ノーマルルート終了時の負けイベント戦闘：エンディング文がフェードイン表示中にクリックすると、フェードアウトしてタイトルへ。
  // 画面が切り替わった直後の誤操作・残っていたクリックで即座にタイトルへ進まないよう、少しの間はクリックを無視する
  if (normalEndSequence && normalEndSequence.phase === 'endScreen') {
    if (Date.now() < normalEndScreenClickUnlockAt) return;
    normalEndSequence.phase = 'endScreenFadeOut';
    normalEndSequence.phaseTimerMs = 0;
    return;
  }
  // 「同僚と遊ぶ」アドベンチャーパート：本文がまだ続く間は、クリックで次のブロックへ進める
  // （最後のブロックまで進んだ後は、下の選択肢ボタンをそのままクリックさせる）
  if (adventureState) {
    const node = adventureState.scene.nodes[adventureState.nodeId];
    const partnerGender = partnerGenderById[selectedPartnerIcon];
    const bodyText = resolveGenderedAdventureText(node.text, partnerGender);
    const lineBlocks = bodyText.split('\n');
    if ((adventureState.lineIndex || 0) < lineBlocks.length - 1) {
      // フェード中（表示しきる／消えきる前）の連打では進めず、安定表示中だけ次のブロックへのフェードアウトを始める
      if (!adventureState.lineFadePhase) {
        adventureState.lineFadePhase = 'out';
        adventureState.lineFadeTimerMs = 0;
      }
      return;
    }
  }
  const p = getCanvasPoint(event);
  let clickedUiButton = false;
  for (const b of uiButtons) {
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
      b.action();
      clickedUiButton = true;
      break;
    }
  }
  if (clickedUiButton) return;

  // マウスでの通常攻撃（押している間発射）のpointerdownで、既にアイテムを取得済みならここでは何もしない
  // （同じ一回のクリックで、取得と発射／オート攻撃切替が二重に発生しないようにする）
  if (itemConsumedByPointerDown) {
    itemConsumedByPointerDown = false;
    return;
  }
  // ゲーム本編の画面（タイトル・各種選択画面・演出中でない）でのクリック／タップ：
  // アイテムに当たればそれを取得し、何もなければオート攻撃のON/OFFを切り替える
  if (isInCoreGameplayForClickActions()) {
    if (tryCollectItemAtPoint(p)) return;
    autoFireEnabled = !autoFireEnabled;
  }
});

// ===== 常時表示の操作ボタン（一時停止） =====
document.getElementById('btnPause').addEventListener('click', () => {
  if (wakeUpConfirmActive) return; // 確認ダイアログ表示中はボタンでの再開を無視する
  isPaused = !isPaused;
  lastUpdate = Date.now();
});

// ===== キャンバスをウィンドウに合わせて拡大縮小する（内部解像度は800x600のまま） =====
function fitCanvasToViewport() {
  const scale = Math.min(window.innerWidth / canvas.width, window.innerHeight / canvas.height);
  canvas.style.width = `${canvas.width * scale}px`;
  canvas.style.height = `${canvas.height * scale}px`;
}
window.addEventListener('resize', fitCanvasToViewport);
window.addEventListener('orientationchange', fitCanvasToViewport);
fitCanvasToViewport();

// ===== ゲーム状態の更新 =====
// 毎フレーム、移動・攻撃・時刻・衝突などを計算する
function update() {
  pollGamepadInput();
  if (acknowledgementNotice) {
    lastUpdate = Date.now();
    return;
  }
  // 目覚めエンド専用タイトル画面（とそのエンディングリスト）は静的な画面なので、他の一切を止める
  if (trueEndTitleScreenActive) {
    lastUpdate = Date.now();
    return;
  }
  const nowReal = Date.now();
  // rawDt：実際の経過時間（3倍加速モードの影響を受けない）。演出・カットシーン・UI画面の進行に使う
  const rawDt = (nowReal - lastUpdate) / 1000;
  // ノーマルルート終了時の負けイベント戦闘：同僚が消える直前のスローモーション演出中は、
  // 全体の進行速度（dt）を10%に落とす（3倍加速モード中でもさらにその10%になる）
  const effectiveTimeScale = (normalEndSequence && normalEndSequence.phase === 'partnerLossSlowmo')
    ? gameTimeScale * normalEndPartnerLossSlowmoRatio
    : gameTimeScale;
  const now = gameClockMs + ((nowReal - lastUpdate) * effectiveTimeScale);
  const dt = (now - gameClockMs) / 1000;
    lastUpdate = nowReal;
  if (isPaused || wakeUpConfirmActive) {
    return;
  }
  gameClockMs = now;

  // アドベンチャーパートに入る前の統計情報画面：「会話に進む」が押されるまで、他の一切を停止する
  if (adventureStatsSummaryActive) {
    return;
  }

  // セットアップ画面の切り替え演出：暗転しきったら次の画面へ進む（3倍加速の影響を受けない）
  if (setupFadePhase === 'out') {
    setupFadeTimer -= rawDt * 1000;
    if (setupFadeTimer <= 0) {
      setupFadePhase = null;
      const onComplete = setupFadeOnComplete;
      setupFadeOnComplete = null;
      if (onComplete) onComplete();
    }
    return;
  }

  // 「目覚め」で夢ルートに入った直後の「24:00」演出中は、他の一切を停止する（3倍加速の影響を受けない）
  if (dreamBossIntroSequence) {
    updateDreamBossIntroSequence(rawDt);
    return;
  }

  // 目覚めエンド専用タイトル画面の「就活を始める」を押した後：ホワイトアウト→画像表示→
  // （クリック後）フェードアウトを経てゲームを終了する演出中は、他の一切を停止する
  if (jobHuntEndSequence) {
    jobHuntEndSequence.phaseTimerMs += rawDt * 1000;
    if (jobHuntEndSequence.phase === 'whiteout' &&
        jobHuntEndSequence.phaseTimerMs >= jobHuntEndWhiteoutDurationMs) {
      jobHuntEndSequence.phase = 'image';
      jobHuntEndSequence.phaseTimerMs = 0;
    } else if (jobHuntEndSequence.phase === 'fadeOut' &&
        jobHuntEndSequence.phaseTimerMs >= jobHuntEndFadeOutDurationMs) {
      window.close();
    }
    return;
  }

  // 力尽きた演出中は、画面を停止したまま演出用のタイマーだけを進める（3倍加速の影響を受けない）
  if (deathSequence) {
    deathSequence.phaseTimerMs += rawDt * 1000;
    if (deathSequence.phase === 'freeze' && deathSequence.phaseTimerMs >= deathSequenceFreezeDurationMs) {
      deathSequence.phase = 'shake';
      deathSequence.phaseTimerMs = 0;
    } else if (deathSequence.phase === 'shake' && deathSequence.phaseTimerMs >= deathSequenceShakeDurationMs) {
      deathSequence.phase = 'vanish';
      deathSequence.phaseTimerMs = 0;
    } else if (deathSequence.phase === 'vanish' && deathSequence.phaseTimerMs >= deathSequenceVanishDurationMs) {
      deathSequence.phase = 'fadeOut';
      deathSequence.phaseTimerMs = 0;
    } else if (deathSequence.phase === 'fadeOut' && deathSequence.phaseTimerMs >= deathSequenceFadeOutDurationMs) {
      gameOver = true;
      endingType = deathSequence.deathEndingType;
      sendScore(score);
      deathSequence = null;
    }
    return;
  }

  // ラスボス撃破後の演出中は、この処理だけを進め、他の一切（自機・同僚・時間経過など）を停止する（3倍加速の影響を受けない）
  if (bossFinalSequence) {
    updateBossFinalSequence(rawDt);
    return;
  }

  // ノーマルルート終了時の「負けイベント」戦闘演出。
  // freeze/shake/partnerVanish/fadeOut/endScreen中は他の一切を停止する。descend/battle/partnerLossSlowmo中は、
  // ラスボス（通常）を降臨・行動させるため、この後の通常のbossEvent更新処理へそのまま進める
  // （partnerLossSlowmo中はdtが既に10%にスケールされているため、全体が10%速度で動き続ける）
  if (normalEndSequence && normalEndSequence.phase !== 'descend' && normalEndSequence.phase !== 'battle' &&
      normalEndSequence.phase !== 'partnerLossSlowmo') {
    updateNormalEndSequence(rawDt);
    return;
  }

  // アイコン選択後のひとことメッセージ演出：フェードイン→フェードアウト→次の画面へ（3倍加速の影響を受けない）
  if (iconGreetingPhase) {
    if (iconGreetingPhase === 'fadein') {
      iconGreetingTimer += rawDt * 1000;
      if (iconGreetingTimer >= iconGreetingFadeInMs) {
        iconGreetingPhase = 'hold';
        iconGreetingTimer = iconGreetingHoldMs;
      }
      return;
    }
    iconGreetingTimer -= rawDt * 1000;
    if (iconGreetingPhase === 'hold' && iconGreetingTimer <= 0) {
      iconGreetingPhase = 'fadeout';
      iconGreetingTimer = iconGreetingFadeMs;
    } else if (iconGreetingPhase === 'fadeout' && iconGreetingTimer <= 0) {
      iconGreetingPhase = null;
      const onComplete = iconGreetingOnComplete;
      iconGreetingOnComplete = null;
      if (onComplete) onComplete();
    }
    return;
  }

  // 前回と同じ自機・同僚で始めた時の再会シーン：アイコンが暗くなりきったら自動で地の文へ進む（3倍加速の影響を受けない）
  if (reunionSceneActive) {
    if (reunionScenePhase === 'dim') {
      reunionSceneDimTimer -= rawDt * 1000;
      if (reunionSceneDimTimer <= 0) {
        reunionSceneDimTimer = 0;
        reunionScenePhase = 'intro';
        reunionSceneIntroIndex = 0;
        setReunionSceneCurrentLine(reunionSceneIntroLines[0]);
      }
    } else if (reunionSceneCurrentRevealedCount < reunionSceneCurrentText.length) {
      reunionSceneCurrentTypeTimerMs += rawDt * 1000;
      reunionSceneCurrentRevealedCount = getTypewriterRevealedCount(reunionSceneCurrentTypeTimerMs, reunionSceneCurrentText);
    }
    return;
  }

  // 同僚の吹き出しの表示時間を減らす
  if (partnerSpeechBubble) {
    partnerSpeechBubble.timer -= dt * 1000;
    if (partnerSpeechBubble.timer <= 0) partnerSpeechBubble = null;
  }

  // 弾が敵に当たった瞬間のヒットエフェクトの表示時間を減らす
  for (let hi = hitSparks.length - 1; hi >= 0; hi--) {
    hitSparks[hi].timer -= dt * 1000;
    if (hitSparks[hi].timer <= 0) hitSparks.splice(hi, 1);
  }

  // 「AIエージェント」の反射エフェクトの表示時間を減らす
  for (let si = synergyBeams.length - 1; si >= 0; si--) {
    synergyBeams[si].timer -= dt * 1000;
    if (synergyBeams[si].timer <= 0) synergyBeams.splice(si, 1);
  }

  // 弾き返しエフェクトの表示時間を減らす
  for (let di = deflectEffects.length - 1; di >= 0; di--) {
    deflectEffects[di].timer -= dt * 1000;
    if (deflectEffects[di].timer <= 0) deflectEffects.splice(di, 1);
  }

  // 斬撃ワイプエフェクトの表示時間を減らす
  if (slashEffect) {
    slashEffect.timer -= dt * 1000;
    if (slashEffect.timer <= 0) slashEffect = null;
  }

  // 爆発後の短い時間、Canvas全体をランダムに揺らす
  explosionFlashTimer = Math.max(0, explosionFlashTimer - dt * 1000);
  friendlyFireHitFlashTimer = Math.max(0, friendlyFireHitFlashTimer - dt * 1000);
  explosionShakeTimer = Math.max(0, explosionShakeTimer - dt * 1000);
  if (explosionShakeTimer > 0) {
    const shakeX = (Math.random() - 0.5) * 16;
    const shakeY = (Math.random() - 0.5) * 16;
    canvas.style.transform = `translate(${shakeX}px, ${shakeY}px)`;
  } else {
    canvas.style.transform = '';
  }

  // スタート前とゲーム終了後は、敵や納期の更新を止める
  if (gameOver || gameClear || setupStep || startScreen || specialSkillSelectionActive) return;
  // 「同僚と遊ぶ」アドベンチャーパート中は、ゲームの進行を止める（文単位のフェードイン・アウトだけは進める）
  if (adventureState) {
    if (adventureState.lineFadePhase) {
      adventureState.lineFadeTimerMs += rawDt * 1000;
      if (adventureState.lineFadePhase === 'in' && adventureState.lineFadeTimerMs >= adventureLineFadeInDurationMs) {
        adventureState.lineFadePhase = null; // 安定表示状態（フェードなし）
      } else if (adventureState.lineFadePhase === 'out' && adventureState.lineFadeTimerMs >= adventureLineFadeOutDurationMs) {
        adventureState.lineIndex = (adventureState.lineIndex || 0) + 1;
        adventureState.lineFadePhase = 'in';
        adventureState.lineFadeTimerMs = 0;
      }
    }
    return;
  }

  // 脳疲労は発射とは無関係に、時間経過だけで緩やかに蓄積する
  updatePassiveFatigueGain(dt);
  if (gameOver || deathSequence) return;

  // 一時メッセージの残り表示時間を減らし、期限切れなら削除する
  // ただし「DAY～」演出中（暗転～クリック待ち）は、読み終える前に消えないよう時間を止める
  if (dayTransitionPhase !== 'out' && dayTransitionPhase !== 'waiting') {
    for (let mi = messages.length - 1; mi >= 0; mi--) {
      messages[mi].ttl -= dt * 1000;
      if (messages[mi].ttl <= 0) messages.splice(mi, 1);
    }
  }

  // 一日の終わりの画面演出中は、フェードの進行だけを行い、他の処理はすべて止める（3倍加速の影響を受けない）
  if (dayTransitionPhase) {
    if (dayTransitionPhase === 'waiting') {
      // クリック／タップされるまで、暗転したまま入力待ちにする。
      // ただし完全オートモード中は、3秒経過したら自動でクリックした扱いにして次へ進める
      if (fullAutoModeEnabled && !specialSkillSelectionActive) {
        dayTransitionWaitingTimerMs += rawDt * 1000;
        if (dayTransitionWaitingTimerMs >= dayTransitionAutoAdvanceMs) {
          dayTransitionPhase = 'in';
          dayTransitionTimer = dayTransitionDurationMs;
          lastUpdate = Date.now();
        }
      }
      return;
    }
    dayTransitionTimer -= rawDt * 1000;
    if (dayTransitionPhase === 'out' && dayTransitionTimer <= 0) {
      // 画面が暗転しきったら、残っている仕事（敵）を配置し直してから日付を進め、入力待ちにする
      repositionRemainingEnemies();
      const advanceFn = dayTransitionAdvanceFn;
      dayTransitionAdvanceFn = null;
      if (advanceFn) advanceFn();
      if (gameOver || gameClear) return;
      // 前日中に表示されていた一時メッセージ（イベント結果など）は、翌日の「DAY〇〇」画面には持ち越さず消す
      messages.length = 0;
      dayTransitionPhase = 'waiting';
      dayTransitionWaitingTimerMs = 0;
    } else if (dayTransitionPhase === 'in' && dayTransitionTimer <= 0) {
      dayTransitionPhase = null;
    }
    return;
  }

  // 週末の休日出勤選択・休日出勤中の帰宅確認中・固定敵の残業確認中は、ゲームの進行を止める
  if (weekendWorkChoice || weekendWorkQuotaChoice || fixedEnemyOvertimeChoiceActive) return;
  // 「名状しがたきものの気配」の選択肢・再確認の表示中は、ゲームの進行を止める
  if (bossEncounterChoiceActive || bossEncounterConfirmActive) return;

  // 休日出勤中（土曜・日曜に働いている間）は、SAN・寿命が緩やかに削れていく
  if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
    san = Math.max(0, san - weekendWorkSanDrainPerSec * dt);
    lifespan = Math.max(0, lifespan - weekendWorkLifespanDrainPerSec * dt);
    checkVitalsGameOver();
    if (gameOver || deathSequence) return;
  }

  // 固定敵（IT用語モチーフ）の進行を処理する。ラスボス・中ボスの有無や、ゲーム内時間の進行状況に関わらず並行して進む。
  // ただし「目覚め」経由の特別なラスボス戦では、固定敵は一切出現させない
  if (!dreamBossActive) {
    updateFixedEnemy(dt);
    if (gameOver || deathSequence) return;
  }

  // 残業を承諾して固定敵を片付けている間、すべて排除できたらその場で自動的に一日を終了する
  if (fixedEnemyOvertimeConfirmed && currentHour >= dayEndHour && fixedEnemies.length === 0) {
    fixedEnemyOvertimeConfirmed = false;
    endWorkday();
    return;
  }

  // ラスボスの発生判定・進行を処理する。発生中は時間経過・通常の敵の出現を止め、
  // ラスボスとだけ戦う特別な状況にする
  checkBossEventTrigger();
  if (bossEvent) {
    updateBossEvent(dt);
    if (gameOver || deathSequence) return;
    // ノーマルルート終了時の負けイベント戦闘：降りきったら開始し、時間経過で同僚を強制離脱させる
    if (normalEndSequence && normalEndSequence.phase === 'descend' && bossEvent.phase === 'active') {
      normalEndSequence.phase = 'battle';
      normalEndSequence.battleTimerMs = 0;
      normalEndSequence.partnerLoseAtMs = normalEndPartnerLoseDelayMinMs +
        Math.random() * (normalEndPartnerLoseDelayMaxMs - normalEndPartnerLoseDelayMinMs);
      bossEvent.holes = generateIndestructibleBossHoles();
    }
    if (normalEndSequence && normalEndSequence.phase === 'battle') {
      normalEndSequence.battleTimerMs += rawDt * 1000;
      if (partner.active && !normalEndSequence.partnerLost &&
          normalEndSequence.battleTimerMs >= normalEndSequence.partnerLoseAtMs) {
        partner.active = false;
        partnerLossReason = 'san';
        // 通常の離脱メッセージの代わりに、全体が減速→静止→同僚が消える演出（partnerLossSlowmo）へ移行する
        normalEndSequence.partnerLost = true;
        normalEndSequence.phase = 'partnerLossSlowmo';
        normalEndSequence.phaseTimerMs = 0;
      }
    } else if (normalEndSequence && normalEndSequence.phase === 'partnerLossSlowmo') {
      // 同僚のSAN・寿命が0になることが確定してから3秒間は、全体の進行速度が10%のまま経過する
      // （dt自体は既にupdate()側で10%にスケール済み。ここでは実時間で3秒measureする）
      normalEndSequence.phaseTimerMs += rawDt * 1000;
      if (normalEndSequence.phaseTimerMs >= normalEndPartnerLossSlowmoDurationMs) {
        normalEndSequence.phase = 'partnerVanish';
        normalEndSequence.phaseTimerMs = 0;
      }
    }
  } else {
  // 「大規模プロジェクト」（中ボス）の進行を処理する。通常の敵・時間経過は止めず並行して進む
  if (midBossEvent) {
    updateMidBossEvent(dt);
    if (gameOver || deathSequence) return;
  }

  // Scoreに応じて、ランク・役職スキルを継続的に自動更新する（週末の昇進判定は廃止）
  checkAndApplyRankUp();

  // ゲーム内時刻を進める
  if (now - lastHourTime >= hourMs) {
    const passed = Math.floor((now - lastHourTime) / hourMs);
    const previousHour = currentHour;
    lastHourTime += passed * hourMs;
    currentHour += passed;
    processTimedHourEvents(previousHour, currentHour);
    // 「大規模プロジェクト」や、ノーマルルート終了時の負けイベント戦闘中は、24時になっても時刻をそこで止める
    if ((midBossEvent || (normalEndSequence && normalEndSequence.phase === 'battle')) && currentHour >= maxOvertimeHour) {
      currentHour = maxOvertimeHour;
      lastHourTime = gameClockMs;
      return;
    }
    // 定時報告・「大規模プロジェクト」はないが、固定敵（脅威）が残っている場合は、残業するかどうかを一度だけ尋ねる
    if (currentHour >= dayEndHour && !scheduledReport && !midBossEvent &&
        fixedEnemies.length > 0 && !fixedEnemyOvertimeConfirmed && currentHour < maxOvertimeHour) {
      currentHour = dayEndHour;
      lastHourTime = gameClockMs;
      fixedEnemyOvertimeChoiceActive = true;
      return;
    }
    // 終業時刻になっても定時報告・「大規模プロジェクト」、または残業を承諾した固定敵が残っていれば、24時まで残業として居残る
    if (currentHour >= dayEndHour &&
        (scheduledReport || midBossEvent || (fixedEnemies.length > 0 && fixedEnemyOvertimeConfirmed)) &&
        currentHour < maxOvertimeHour) {
      if (previousHour < dayEndHour) {
        showMessage(`${dayEndHour}時：定時報告が終わらず残業に…（${maxOvertimeHour}時まで）`,
          3800, '#ff8a65', '22px sans-serif');
      }
      return;
    }
    // 終業時刻（または残業の限界時刻）になったら一日を終了する
    if (currentHour >= dayEndHour) {
      endWorkday();
      return;
    }
  }

  // 残業中（定時報告や「大規模プロジェクト」、または残業を承諾した固定敵が残ったまま終業時刻を過ぎている間）は、SANが段階的に削れていく。
  // 24時になっても「大規模プロジェクト」などの戦闘が続いていれば、同じペースでそのまま減り続ける
  if ((scheduledReport || midBossEvent || (fixedEnemies.length > 0 && fixedEnemyOvertimeConfirmed)) && currentHour >= dayEndHour) {
    const sanStepMs = (3600 / overtimeSanDrainPerHour) * 1000; // ゲーム内10分ごとに1減少
    overtimeSanDrainAccumMs += dt * 1000;
    while (overtimeSanDrainAccumMs >= sanStepMs) {
      overtimeSanDrainAccumMs -= sanStepMs;
      san = Math.max(0, san - 1);
    }
    lifespan = Math.max(0, lifespan - overtimeLifespanDrainPerSec * dt);
    if (partner.active) {
      const partnerSanStepMs = sanStepMs / partnerOvertimeDrainRatio;
      partnerOvertimeSanDrainAccumMs += dt * 1000;
      while (partnerOvertimeSanDrainAccumMs >= partnerSanStepMs) {
        partnerOvertimeSanDrainAccumMs -= partnerSanStepMs;
        partner.san = Math.max(0, partner.san - 1);
      }
      partner.lifespan = Math.max(0, partner.lifespan - overtimeLifespanDrainPerSec * partnerOvertimeDrainRatio * dt);
    }
    checkVitalsGameOver();
    if (gameOver || deathSequence) return;
  } else {
    overtimeSanDrainAccumMs = 0;
    partnerOvertimeSanDrainAccumMs = 0;
  }

  // 全滅したら少し間を置いて次のウェーブ（仕事）を出す。
  // 「大規模プロジェクト」が出ている間は、通常の敵は一切出現しない。定時報告が出ている間は、同時出現数を1体にする
  if (!midBossEvent && countActiveWorkEnemies() === 0) {
    if (waveCooldownMs > 0) {
      waveCooldownMs -= dt * 1000;
    } else {
      spawnWave(scheduledReport ? 1 : maxEnemies);
    }
  }
  // 第2回のアドベンチャーパートを終えた後だけ、通常のウェーブとは別に小型の敵も並行して出現させる
  if (!midBossEvent) {
    updateMiniEnemySpawning(dt);
  }
  }

  // 援護弾（ボスが倒せない時の救済措置）の発生判定・飛来を処理する
  updateSupportBulletSystem(dt);

  // 各敵の納期をカウントダウンし、0になった敵を爆発させる
  for (let i = enemies.length - 1; i >= 0; i--) {
    enemies[i].deadlineMs -= dt * 1000;
    if (enemies[i].deadlineMs <= 0) {
      explodeEnemy(i);
      if (gameOver || deathSequence) return;
    }
  }

  // チョコレートの出現待ち、取得判定、時間切れを処理する
  if (chocolate && !chocolate.landed) {
    // 画面上部から落下してくる演出。着地するまでは取得判定を行わない
    chocolate.fallSpeed += chocolateFallGravityPerSec2 * dt;
    chocolate.y += chocolate.fallSpeed * dt;
    if (chocolate.y >= chocolate.targetY) {
      chocolate.y = chocolate.targetY;
      chocolate.landed = true;
    }
  } else if (chocolate) {
    chocolate.remainingMs -= dt * 1000;
    // 完全オートモード中も、自機がその場まで移動したわけではないので自動取得はしない
    // （取得するにはクリック／タップが必要。取得されないまま時間切れになれば消える）
    if (chocolate.remainingMs <= 0) {
      chocolate = null;
      chocolateSpawnTimerMs = getRandomChocolateSpawnDelay();
    }
  } else {
    chocolateSpawnTimerMs -= dt * 1000;
    if (chocolateSpawnTimerMs <= 0) {
      spawnChocolate();
    }
  }

  // 栄養ドリンクの効果時間を減らす（残っている間は脳疲労が蓄積しにくく、移動・発射が強化される）。
  // 効果が切れた瞬間、10秒間の反動状態（移動・発射が鈍る）を開始する
  if (energyDrinkBuffTimerMs > 0) {
    energyDrinkBuffTimerMs = Math.max(0, energyDrinkBuffTimerMs - dt * 1000);
    if (energyDrinkBuffTimerMs <= 0) {
      energyDrinkCrashTimerMs = energyDrinkCrashDurationMs;
    }
  } else {
    energyDrinkCrashTimerMs = Math.max(0, energyDrinkCrashTimerMs - dt * 1000);
  }

  // 栄養ドリンクの出現待ち、取得判定、時間切れを処理する
  if (energyDrink && !energyDrink.landed) {
    // 画面上部から落下してくる演出。着地するまでは取得判定を行わない
    energyDrink.fallSpeed += chocolateFallGravityPerSec2 * dt;
    energyDrink.y += energyDrink.fallSpeed * dt;
    if (energyDrink.y >= energyDrink.targetY) {
      energyDrink.y = energyDrink.targetY;
      energyDrink.landed = true;
    }
  } else if (energyDrink) {
    // 出現直後の猶予時間を減らす（完全オートモード中も、自機が移動したわけではないので自動取得はしない）
    if (energyDrink.graceMs > 0) energyDrink.graceMs = Math.max(0, energyDrink.graceMs - dt * 1000);
  } else {
    energyDrinkSpawnTimerMs -= dt * 1000;
    if (energyDrinkSpawnTimerMs <= 0) {
      spawnEnergyDrink();
    }
  }

  // コーヒーの効果時間を減らす（効果切れによる反動はない）
  coffeeBuffTimerMs = Math.max(0, coffeeBuffTimerMs - dt * 1000);
  // コーヒーによるstun回避の残り時間を減らす
  coffeeStunImmunityTimerMs = Math.max(0, coffeeStunImmunityTimerMs - dt * 1000);

  // コーヒーの出現待ち、取得判定、時間切れを処理する
  if (coffee && !coffee.landed) {
    // 画面上部から落下してくる演出。着地するまでは取得判定を行わない
    coffee.fallSpeed += chocolateFallGravityPerSec2 * dt;
    coffee.y += coffee.fallSpeed * dt;
    if (coffee.y >= coffee.targetY) {
      coffee.y = coffee.targetY;
      coffee.landed = true;
    }
  } else if (coffee) {
    // 出現直後の猶予時間を減らす（完全オートモード中も、自機が移動したわけではないので自動取得はしない）
    if (coffee.graceMs > 0) coffee.graceMs = Math.max(0, coffee.graceMs - dt * 1000);
  } else {
    coffeeSpawnTimerMs -= dt * 1000;
    if (coffeeSpawnTimerMs <= 0) {
      spawnCoffee();
    }
  }

  // 「ファイヤーウォール」の出現待ち、取得判定、時間切れを処理する
  if (heartWall && !heartWall.landed) {
    // 画面上部から落下してくる演出。着地するまでは取得判定を行わない
    heartWall.fallSpeed += chocolateFallGravityPerSec2 * dt;
    heartWall.y += heartWall.fallSpeed * dt;
    if (heartWall.y >= heartWall.targetY) {
      heartWall.y = heartWall.targetY;
      heartWall.landed = true;
    }
  } else if (heartWall) {
    heartWall.remainingMs -= dt * 1000;
    // 完全オートモード中も、自機がその場まで移動したわけではないので自動取得はしない
    if (heartWall.remainingMs <= 0) {
      heartWall = null;
      heartWallSpawnTimerMs = getRandomHeartWallSpawnDelay();
    }
  } else {
    heartWallSpawnTimerMs -= dt * 1000;
    if (heartWallSpawnTimerMs <= 0) {
      spawnHeartWall();
    }
  }

  // 15時から点滅し、短い猶予の後に残った昼食を片付ける
  if (lunchState && lunchState.expirationStartedAtMs !== null &&
      gameClockMs - lunchState.expirationStartedAtMs >= lunchExpirationDurationMs) {
    finishLunchAtDayEnd();
  }

  // 昼食を一品ずつ出現させ、接触した料理を取得する
  if (lunchState) {
    lunchState.spawnTimerMs -= dt * 1000;
    if (lunchState.nextSpawnIndex < lunchFoodCount && lunchState.spawnTimerMs <= 0) {
      let position;
      let attempts = 0;
      do {
        position = getRandomEventPosition(lunchFoodRadius);
        attempts++;
      } while (attempts < 20 && lunchState.items.some(item =>
        Math.hypot(item.x - position.x, item.y - position.y) < 65));
      lunchState.items.push({
        ...position,
        radius: lunchFoodRadius,
        icon: lunchState.sequence[lunchState.nextSpawnIndex],
        sequenceIndex: lunchState.nextSpawnIndex
      });
      lunchState.nextSpawnIndex++;
      lunchState.spawnTimerMs = lunchSpawnIntervalMs;
    }
    // 完全オートモード中も、自機がその場まで移動したわけではないので自動取得はしない
    // （取得されないまま15時を過ぎれば、既存の時間切れ処理でまとめて片付けられる）
  }

  // 出現から実時間で一定時間、未回答のまま放置されたクイズは自動的に消える（3倍加速の影響を受けない）
  if (quizState && Date.now() >= quizExpireAt) {
    quizState = null;
    adjustPartnerRelationship(-2);
    showMessage('クイズは時間切れで消えてしまった…', 2200, '#ef9a9a', '22px sans-serif');
    if (partner.active) showRandomPartnerSpeechBubble(partnerQuizTimeoutLines, '#ffb74d');
  }

  // 完全オートモード中は、出現から少し待ってから①②③のいずれかをランダムに選んで自動回答する
  if (quizState && fullAutoModeEnabled && Date.now() >= quizAnswerUnlockAt) {
    if (fullAutoQuizChoiceIndex === null || fullAutoQuizChoiceIndex >= quizState.choices.length) {
      fullAutoQuizChoiceIndex = Math.floor(Math.random() * quizState.choices.length);
    }
    answerQuiz(fullAutoQuizChoiceIndex);
  } else if (!quizState) {
    fullAutoQuizChoiceIndex = null;
  }

  // 完全オートモード中、レベルアップの特殊スキル選択画面が出てから3秒クリックがなければ、
  // ランダムに1つ選んだ扱いにする
  if (specialSkillSelectionActive && fullAutoModeEnabled && Date.now() >= specialSkillSelectionAutoPickAt) {
    chooseSpecialSkill(Math.floor(Math.random() * specialSkillChoices.length));
  }

  if (playerReviveTimerMs > 0) {
    // 残機を使って気絶し、復活を待っている間：移動・攻撃できない
    playerReviveTimerMs -= dt * 1000;
    if (playerReviveTimerMs <= 0) {
      playerReviveTimerMs = 0;
      san = maxSan * reviveSanRatio;
      lifespan = maxLifespan * reviveLifespanRatio;
      invincible = true;
      invincibleTimer = revivePostGlowDurationMs;
      friendlyFireInvincibleTimer = revivePostGlowDurationMs;
      showMessage(`復活！（残機 ×${playerLivesRemaining}）`, 2600, '#ffd54f', '24px sans-serif');
    }
  } else if (stunned) {
    // 行動不能中は移動・攻撃できないが、疲労が回復する
    stunTimer -= dt * 1000;
    fatigue = Math.max(0, fatigue - stunRecoveryPerSec * dt);
    if (stunTimer <= 0) {
      stunned = false;
      // stunが解けた瞬間、少しSANが回復する代わりに寿命を消費する
      san = Math.min(maxSan, san + stunReleaseSanRecovery);
      lifespan = Math.max(0, lifespan - stunReleaseLifespanCost);
      showMessage(`SAN +${stunReleaseSanRecovery} / 寿命 -${stunReleaseLifespanCost}`, 1800, '#b3e5fc');
      checkVitalsGameOver();
      if (gameOver || deathSequence) return;
    }
  } else {
    // WASDキーによるプレイヤー移動
    let moving = false;
    const beforeMoveX = player.x, beforeMoveY = player.y;
    const currentMoveSpeed = player.speed * specialSkillEffects.moveSpeedMultiplier *
      getEnergyDrinkMoveSpeedMultiplier() * getCoffeeMoveSpeedMultiplier() * getFixedEnemyMoveSpeedMultiplier();
    if (fixedEnemyMoveHijackTimerMs > 0) {
      // リモートコード実行：一定時間、移動が乗っ取られランダムな方向へ動かされる
      player.x += Math.cos(fixedEnemyMoveHijackAngle) * currentMoveSpeed;
      player.y += Math.sin(fixedEnemyMoveHijackAngle) * currentMoveSpeed;
      moving = true;
    } else if (fullAutoModeEnabled) {
      // 完全オートモード中は、手動操作の代わりにAIが移動方向を決める
      const autoVec = computeFullAutoMoveVector(dt);
      if (autoVec.x !== 0 || autoVec.y !== 0) {
        player.x += autoVec.x * currentMoveSpeed;
        player.y += autoVec.y * currentMoveSpeed;
        moving = true;
      }
    } else {
      // XSS：一定時間、移動キーの上下左右が反転する
      const reverseSign = fixedEnemyControlsReversedTimerMs > 0 ? -1 : 1;
      if (keys["w"]) { player.y -= currentMoveSpeed * reverseSign; moving = true; }
      if (keys["s"]) { player.y += currentMoveSpeed * reverseSign; moving = true; }
      if (keys["a"]) { player.x -= currentMoveSpeed * reverseSign; moving = true; }
      if (keys["d"]) { player.x += currentMoveSpeed * reverseSign; moving = true; }
      // タッチの仮想移動スティックによるプレイヤー移動
      if (touchMoveVector.x !== 0 || touchMoveVector.y !== 0) {
        player.x += touchMoveVector.x * currentMoveSpeed * reverseSign;
        player.y += touchMoveVector.y * currentMoveSpeed * reverseSign;
        moving = true;
      }
    }
    // パスワードリスト攻撃：予測射撃に使う、直近の移動方向を記録する
    if (moving) {
      player.lastMoveDx = player.x - beforeMoveX;
      player.lastMoveDy = player.y - beforeMoveY;
    }
    // プレイヤーが画面外・窓の範囲へ出ないよう座標を制限する
    clampToPlayableFloor(player);
    pushEntityOutsideScheduledReport(player);
    pushEntityOutsideFixedEnemy(player);

    // 無敵時間を減らし、0になったら解除する
    if (invincible) {
      invincibleTimer -= dt * 1000;
      if (invincibleTimer <= 0) {
        invincible = false;
      }
    }

    updateSkillEffects();

    // 攻撃モードに関係なく、自分は常にマウスカーソルの方向を向く。
    // スマホ用の自動照準・完全オートモードが有効な間は、代わりに定時報告（出ていれば優先）か最も近い敵の方向を向く。
    // ただし、オート攻撃・完全オートモードでない（自分で操作して撃っている）場合は、同僚の方向も狙い先の候補に含める
    const allowPartnerAim = !autoFireEnabled && !fullAutoModeEnabled;
    const autoAimTarget = (mobileAutoAimEnabled || fullAutoModeEnabled) ? findAutoAimTarget(allowPartnerAim) : null;
    if (gamepadAimActive) {
      // ゲームコントローラー：右スティックを倒している間は、その方向を最優先で照準にする
      player.angle = gamepadAimAngle;
    } else if (autoAimTarget) {
      player.angle = Math.atan2(autoAimTarget.en.y - player.y, autoAimTarget.en.x - player.x);
    } else {
      player.angle = Math.atan2(
        mousePosition.y - player.y,
        mousePosition.x - player.x
      );
    }

    // 手動時は左クリック中だけ、自動時は常にカーソル方向へ攻撃する
    const fatigueRatio = Math.max(0, Math.min(1, fatigue / maxFatigue));
    const conditionRatio = 1 - fatigueRatio;
    const currentFireRate = baseFireRate * (1 + fatigueRatio * fireRateMultiplier) *
      specialSkillEffects.fireRateMultiplier * getEnergyDrinkFireRateMultiplier() *
      getCoffeeFireRateMultiplier() * getFixedEnemyFireRateMultiplier();
    const autoFiringActive = autoFireEnabled || fullAutoModeEnabled;
    // 自動攻撃モード・完全オートモードは、射線上に同僚がいる間は誤射を避けて撃たない。
    // 完全オートモードはさらに、射線のすぐ近くに同僚がいる場合も余裕を持って撃つのを控える
    const autoFireBlockedByPartner = autoFiringActive &&
      wouldPlayerShotHitPartner(player.angle, 4, fullAutoModeEnabled ? fullAutoPartnerLineOfFireMargin : 0);
    const wantsToFire = (autoFiringActive && !autoFireBlockedByPartner) || mouseFireHeld || gamepadFireHeld;
    // CSRF・クリックジャッキング：一定時間、意図しない操作をさせられて攻撃できなくなる
    if (wantsToFire && !stunned && fixedEnemyFireLockTimerMs <= 0) {
      if (now - lastFire >= currentFireRate) {
        updateSkillEffects();
        // 通常は脳疲労が上限に達すると撃てなくなるが、コーヒーのstun回避中は通常通り行動できる
        if (fatigue < maxFatigue || coffeeStunImmunityTimerMs > 0) {
          lastFire = now;
          const shotAngle = player.angle;
          // 第4段階「承認欲求」：狙って撃っただけで（当たらなくても）耐久力が少し回復してしまう
          checkApprovalSeekingFireHeal(player.x, player.y, shotAngle);

          const speed = playerBaseBulletSpeed * specialSkillEffects.bulletSpeedMultiplier;
          const damageBonus = 1 + skillLevel * 0.08;
          // 「無敵（テスト用）」「β版設定」：攻撃力が50倍になる
          const invincibleDamageMultiplier = isTestInvincibleUpgradeActive() ? 50 : 1;
          const damage = Math.max(1, Math.round(
            baseBulletDamage * conditionRatio * damageBonus * specialSkillEffects.damageMultiplier * invincibleDamageMultiplier
          ));

          // 「マルチタスクA」：レベルごとに追加の弾が1発増える。追加弾は正面から±20度以内のランダムな方向へ飛ぶ
          // 「マルチタスクB」：正面と、そこから90度ずつ回転させた計4方向に同時発射する（各弾の飛距離は単発時の80%）
          let shots;
          if (specialSkillEffects.quadShotActive) {
            shots = [0, 90, 180, 270].map(angleOffsetDeg => ({ angleOffsetDeg, distanceRatio: 0.8 }));
          } else {
            const multiTaskLevel = specialSkillEffects.multiTaskLevel;
            const multitaskRandomSpreadDegrees = 20;
            shots = [{ angleOffsetDeg: 0, distanceRatio: 1 }];
            for (let extraShot = 0; extraShot < multiTaskLevel; extraShot++) {
              shots.push({ angleOffsetDeg: (Math.random() * 2 - 1) * multitaskRandomSpreadDegrees, distanceRatio: 1 });
            }
          }

          for (const shot of shots) {
            const bulletAngle = shotAngle + shot.angleOffsetDeg * Math.PI / 180;
            bullets.push({
              x: player.x + Math.cos(bulletAngle) * player.radius,
              y: player.y + Math.sin(bulletAngle) * player.radius,
              vx: Math.cos(bulletAngle) * speed,
              vy: Math.sin(bulletAngle) * speed,
              radius: 4,
              damage,
              bounces: specialSkillEffects.bulletBounceCount,
              owner: 'player',
              distanceTraveled: 0,
              // 「継続力」：習得レベルに応じて、この弾自体の最大飛距離を伸ばす（マルチタスクBの弾はさらに80%になる）
              maxDistance: playerBulletMaxDistance * specialSkillEffects.bulletDistanceMultiplier * shot.distanceRatio
            });
          }
        }
      }
    }
  }

  // 同僚の追従・ランダム移動・自律攻撃・被弾・寿命処理
  updatePartner(dt);
  if (gameOver || deathSequence) return;
  friendlyFireInvincibleTimer = Math.max(0, friendlyFireInvincibleTimer - dt * 1000);

  // 敵がいるのに長時間攻撃していないと、同僚が苦言を呈しつつ好感度が下がっていく
  if (partner.active && enemies.length > 0 && (now - lastFire) >= partnerNeglectThresholdMs) {
    partnerNeglectTimerMs += dt * 1000;
    if (partnerNeglectTimerMs >= partnerNeglectIntervalMs) {
      partnerNeglectTimerMs = 0;
      adjustPartnerRelationship(-partnerNeglectRelationshipPenalty);
      showRandomPartnerSpeechBubble(partnerNeglectLines, '#ff8a65', partnerNeglectStressedLines);
    }
  } else {
    partnerNeglectTimerMs = 0;
  }

  // 全く弾を撃たずに一定時間が経過すると、同僚が叱咤しながら自機に攻撃してくる
  if (partner.active && (now - lastFire) >= partnerScoldAttackThresholdMs) {
    partnerScoldAttackTimerMs += dt * 1000;
    if (partnerScoldAttackTimerMs >= partnerScoldAttackIntervalMs) {
      partnerScoldAttackTimerMs = 0;
      damagePlayerByFriendlyFire(partnerScoldAttackLines, null, '#ff8a65', true);
    }
  } else {
    partnerScoldAttackTimerMs = 0;
  }

  // 関係性が0の間、定期的に怒りのコメントを表示する
  if (partner.active && partner.relationship <= 0) {
    partnerRelationshipZeroCommentTimerMs += dt * 1000;
    if (partnerRelationshipZeroCommentTimerMs >= partnerRelationshipZeroCommentIntervalMs) {
      partnerRelationshipZeroCommentTimerMs = 0;
      showRandomPartnerSpeechBubble(partnerRelationshipZeroLines, '#ff1744');
    }
  } else {
    partnerRelationshipZeroCommentTimerMs = 0;
  }

  // 時々ランダムで、SAN・寿命の状態を反映した一言を同僚が呟く
  partnerStatusCommentTimerMs += dt * 1000;
  if (partnerStatusCommentTimerMs >= partnerStatusCommentIntervalMs) {
    partnerStatusCommentTimerMs = 0;
    if (Math.random() < partnerStatusCommentChance) {
      triggerPartnerStatusComment();
    }
  }

  // 敵をプレイヤーへ向けて移動する。当たり判定の半径は固定
  for (const e of enemies) {
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    // 時刻が遅くなるほど敵の移動速度を上げる
    const dayProgress = Math.max(0, Math.min(1, (currentHour - dayStartHour) / (dayEndHour - dayStartHour)));
    const timeSpeedMultiplier = 1 + dayProgress * speedDayIncreaseFactor;
    const totalSpeed = e.speed * timeSpeedMultiplier * specialSkillEffects.enemyApproachSpeedMultiplier;
    e.x += (dx / dist) * totalSpeed;
    e.y += (dy / dist) * totalSpeed;
  }

  // ===== 弾の移動と敵への命中判定 =====
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx;
    b.y += b.vy;
    // 自機の弾は、発射地点からの累計移動距離が一定値（戦闘画面の横幅の60%。「継続力」習得時はさらに伸びる）に
    // 達すると消滅する。パリィされた弾は owner が 'deflected' に変わるため、この判定の対象外になる
    if (b.owner === 'player') {
      b.distanceTraveled = (b.distanceTraveled || 0) + Math.hypot(b.vx, b.vy);
      if (b.distanceTraveled >= (b.maxDistance || playerBulletMaxDistance)) {
        bullets.splice(i, 1);
        continue;
      }
    }
    // 画面端に達した弾は、跳ね返り回数が残っていれば反射し、なければ削除する
    // （援護弾は、画面端の外側からゆっくり飛来してくる演出のため、この判定の対象外にする）
    let removed = false;
    if (b.owner !== 'support') {
      if (b.x < 0 || b.x > canvas.width) {
        if (b.bounces > 0) {
          b.bounces--;
          b.bouncesUsed = (b.bouncesUsed || 0) + 1;
          b.vx *= -1;
          b.x = Math.max(0, Math.min(canvas.width, b.x));
        } else {
          bullets.splice(i, 1);
          removed = true;
        }
      }
      if (!removed && (b.y < 0 || b.y > canvas.height)) {
        if (b.bounces > 0) {
          b.bounces--;
          b.bouncesUsed = (b.bouncesUsed || 0) + 1;
          b.vy *= -1;
          b.y = Math.max(0, Math.min(canvas.height, b.y));
        } else {
          bullets.splice(i, 1);
          removed = true;
        }
      }
    }
    if (removed) continue;
    // 第6段階「内的葛藤」：自機アイコン同士が撃ち合う赤い球。命中したらそのアイコンにダメージを与えて消える
    if (b.owner === 'selfConflict') {
      if (checkInternalConflictBulletHit(b)) {
        bullets.splice(i, 1);
      }
      continue;
    }
    // 特殊スキル「オートパリィ」：ネットワークスペシャリストで画面端から反射した自弾も、
    // 近くまで来たら自動でパリィを試みる（1発につき1回だけ判定する）
    if (b.owner === 'player' && (b.bouncesUsed || 0) >= 1 && !b.autoParryChecked &&
        Math.hypot(b.x - player.x, b.y - player.y) <= deflectRange + b.radius) {
      b.autoParryChecked = true;
      if (Math.random() < specialSkillEffects.autoParryChance) {
        performBulletParry(b, player.x, player.y, player.angle, true);
        spawnSlashEffect(player.x, player.y, player.angle, player.radius);
        showMessage('オートパリィ発動！', 1400, '#fff176');
        continue;
      }
    }
    // 発射者と反対側の味方に当たった場合は、敵より先に誤射として処理する。
    if (b.owner === 'player' && partner.active &&
        Math.hypot(b.x - partner.x, b.y - partner.y) <= b.radius + partner.radius) {
      // 同僚も、被弾しそうな瞬間に一定確率でパリィし、自機と同じエフェクトで最寄りの敵へ打ち返す
      // 特殊スキル「チームワーク」：自分と同僚の誤射に限り、パリィ発動率がさらに高くなる
      // ネットワークスペシャリスト：画面端で反射した自弾（1回目以降すべて）は、同僚のパリィ発動率が2倍になる
      const partnerBulletParryChance = Math.max(partnerParryChance, specialSkillEffects.teamworkParryChance);
      const effectivePartnerParryChance = (b.bouncesUsed || 0) >= 1
        ? Math.min(1, partnerBulletParryChance * 2)
        : partnerBulletParryChance;
      if (Math.random() < effectivePartnerParryChance) {
        performBulletParry(b, partner.x, partner.y, partner.angle, true);
        spawnSlashEffect(partner.x, partner.y, partner.angle, partner.radius);
        showMessage('同僚がパリィ！', 1400, '#80deea');
        showRandomPartnerSpeechBubbleIfFriendly(partnerParryLines, '#80deea');
        continue;
      }
      // 役職スキル「AIエージェント」：1日10回まで、同僚への誤射を最寄りの敵への即死攻撃に変換する
      let synergyTriggered = false;
      if (rankSkillLevels.has('ai-agent') && synergyUsesToday < synergyDailyLimit && enemies.length > 0) {
        let nearestIndex = -1;
        let nearestDist = Infinity;
        enemies.forEach((candidate, idx) => {
          const dist = Math.hypot(candidate.x - partner.x, candidate.y - partner.y);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestIndex = idx;
          }
        });
        if (nearestIndex >= 0) {
          synergyUsesToday++;
          synergyTriggered = true;
          const targetEnemy = enemies[nearestIndex];
          spawnSynergyBeam(partner.x, partner.y, targetEnemy.x, targetEnemy.y);
          showMessage('AIエージェント発動！ 弾が最寄りの敵へ反射した', 1800, '#ffd54f');
          defeatEnemyInstantly(nearestIndex);
        }
      }
      if (!synergyTriggered) damagePartnerByFriendlyFire();
      bullets.splice(i, 1);
      continue;
    } else if (b.owner === 'partner' &&
        Math.hypot(b.x - player.x, b.y - player.y) <= b.radius + player.radius) {
      // 特殊スキル「チームワーク」：自分と同僚の誤射に限り、パリィ発動率が高くなる
      // （「オートパリィ」は敵からの弾に対してのみ発動するため、ここでは対象外）
      if (Math.random() < specialSkillEffects.teamworkParryChance) {
        performBulletParry(b, player.x, player.y, player.angle, true);
        spawnSlashEffect(player.x, player.y, player.angle, player.radius);
        showMessage('パリィ成功！', 1400, '#fff176');
        continue;
      }
      damagePlayerByFriendlyFire();
      bullets.splice(i, 1);
      if (gameOver || deathSequence) return;
      continue;
    } else if (b.owner === 'boss' && partner.active &&
        Math.hypot(b.x - partner.x, b.y - partner.y) <= b.radius + partner.radius) {
      // 同僚のオートパリィ（デフォルト30%、夢の記憶ポイントで最大100%まで強化可能）
      if (Math.random() < partnerParryChance) {
        performBulletParry(b, partner.x, partner.y, partner.angle, true);
        spawnSlashEffect(partner.x, partner.y, partner.angle, partner.radius);
        showMessage('同僚がパリィ！', 1400, '#80deea');
        showRandomPartnerSpeechBubbleIfFriendly(partnerParryLines, '#80deea');
        continue;
      }
      damagePartnerByBossBullet(b.damage || 1);
      bullets.splice(i, 1);
      continue;
    } else if (b.owner === 'boss' &&
        Math.hypot(b.x - player.x, b.y - player.y) <= b.radius + player.radius) {
      // 特殊スキル「オートパリィ」：ラスボス弾に対しても被弾しそうな瞬間に自動でパリィする
      if (Math.random() < specialSkillEffects.autoParryChance) {
        performBulletParry(b, player.x, player.y, player.angle, true);
        spawnSlashEffect(player.x, player.y, player.angle, player.radius);
        showMessage('オートパリィ発動！', 1400, '#fff176');
        continue;
      }
      damagePlayerByBossBullet(b.damage || 1);
      bullets.splice(i, 1);
      if (gameOver || deathSequence) return;
      continue;
    } else if (b.owner === 'support' &&
        Math.hypot(b.x - player.x, b.y - player.y) <= b.radius + player.radius) {
      // 援護弾：パリィできず被弾すると、通常のボス・中ボス弾と同様のダメージを受けて消える（救済の機会を逃した扱い）
      if (Math.random() < specialSkillEffects.autoParryChance) {
        performBulletParry(b, player.x, player.y, player.angle, true);
        spawnSlashEffect(player.x, player.y, player.angle, player.radius);
        showMessage('オートパリィ発動！', 1400, '#fff176');
        continue;
      }
      if (b.sourceContext === 'midBoss') {
        damagePlayerByMidBossBullet();
      } else {
        damagePlayerByBossBullet();
      }
      bullets.splice(i, 1);
      if (gameOver || deathSequence) return;
      continue;
    } else if (b.owner === 'midBoss' && partner.active &&
        Math.hypot(b.x - partner.x, b.y - partner.y) <= b.radius + partner.radius) {
      // 同僚のオートパリィ（「大規模プロジェクト」の弾に対しても同じ確率で発動する）
      if (Math.random() < partnerParryChance) {
        performBulletParry(b, partner.x, partner.y, partner.angle, true);
        spawnSlashEffect(partner.x, partner.y, partner.angle, partner.radius);
        showMessage('同僚がパリィ！', 1400, '#80deea');
        showRandomPartnerSpeechBubbleIfFriendly(partnerParryLines, '#80deea');
        continue;
      }
      damagePartnerByMidBossBullet();
      bullets.splice(i, 1);
      continue;
    } else if (b.owner === 'midBoss' &&
        Math.hypot(b.x - player.x, b.y - player.y) <= b.radius + player.radius) {
      // 特殊スキル「オートパリィ」：「大規模プロジェクト」の弾に対しても同様に自動でパリィする
      if (Math.random() < specialSkillEffects.autoParryChance) {
        performBulletParry(b, player.x, player.y, player.angle, true);
        spawnSlashEffect(player.x, player.y, player.angle, player.radius);
        showMessage('オートパリィ発動！', 1400, '#fff176');
        continue;
      }
      damagePlayerByMidBossBullet();
      bullets.splice(i, 1);
      if (gameOver || deathSequence) return;
      continue;
    } else if (b.owner === 'fixedEnemyDisguise' && partner.active &&
        Math.hypot(b.x - partner.x, b.y - partner.y) <= b.radius + partner.radius) {
      // なりすまし・中間者攻撃：自機の弾に見せかけて同僚を狙う。同僚のオートパリィも同確率で発動する
      if (Math.random() < partnerParryChance) {
        performBulletParry(b, partner.x, partner.y, partner.angle, true);
        spawnSlashEffect(partner.x, partner.y, partner.angle, partner.radius);
        showMessage('同僚がパリィ！', 1400, '#80deea');
        showRandomPartnerSpeechBubbleIfFriendly(partnerParryLines, '#80deea');
        continue;
      }
      // 同僚は自機からの誤射だと勘違いする（SAN・関係性が低下する既存の誤射処理を流用）
      damagePartnerByFriendlyFire();
      bullets.splice(i, 1);
      continue;
    } else if (b.owner === 'fixedEnemy' &&
        Math.hypot(b.x - player.x, b.y - player.y) <= b.radius + player.radius) {
      // 特殊スキル「オートパリィ」：固定敵の弾に対しても同様に自動でパリィする
      if (Math.random() < specialSkillEffects.autoParryChance) {
        performBulletParry(b, player.x, player.y, player.angle, true);
        spawnSlashEffect(player.x, player.y, player.angle, player.radius);
        showMessage('オートパリィ発動！', 1400, '#fff176');
        continue;
      }
      damagePlayerByFixedEnemyBullet(b);
      bullets.splice(i, 1);
      if (gameOver || deathSequence) return;
      continue;
    }
    // 固定敵への命中判定。自機・同僚の通常弾、パリィで打ち返した弾（'deflected'）が有効打になる
    if (fixedEnemies.length > 0 && (b.owner === 'player' || b.owner === 'deflected' || b.owner === 'partner')) {
      const hitFixedEnemy = fixedEnemies.find(fx =>
        Math.hypot(b.x - fx.x, b.y - fx.y) <= b.radius + fx.radius);
      if (hitFixedEnemy) {
        if (hitFixedEnemy.def.dodgeChance && Math.random() < hitFixedEnemy.def.dodgeChance) {
          // キーロガー：一定確率で攻撃を回避する
          showMessage('回避された！', 900, '#b0bec5');
          bullets.splice(i, 1);
          continue;
        }
        const damageBonus = 1 + skillLevel * 0.08;
        const actualDmg = Math.max(1, Math.round((b.damage || 1) * damageBonus));
        hitFixedEnemy.hp -= actualDmg;
        spawnHitSpark(b.x, b.y, hitFixedEnemy.hp <= 0);
        bullets.splice(i, 1);
        if (hitFixedEnemy.hp <= 0) defeatFixedEnemy(hitFixedEnemy);
        continue;
      }
    }
    // ラスボスへの命中判定。自機・同僚の通常弾、パリィで打ち返した弾（'deflected'）が発射口に当たると有効打になる。
    // 発射口以外に当たった弾はそのまま素通りする
    if (bossEvent && (b.owner === 'player' || b.owner === 'deflected' || b.owner === 'partner')) {
      const hitHole = findHitBossHole(b.x, b.y);
      if (hitHole) {
        if (hitHole.parryOnly && b.owner !== 'deflected') {
          // 第3段階「確証バイアス」：通常弾は完全にパリィされ、ランダムな方向へ跳ね返る。
          // 弾自体は消費せず、以後は敵の攻撃として扱う（打ち返せばダメージが通る）
          autoParryByBossHole(b);
          continue;
        }
        if (hitHole.approvalSeeking && b.owner === 'deflected') {
          // 第4段階「承認欲求」：パリィで打ち返した弾が命中すると、通常弾以上に大きく回復してしまう
          hitHole.hitsTaken = Math.max(0, hitHole.hitsTaken - bossApprovalParryHealAmount);
          hitHole.approvalHealFlashMs = bossApprovalHealFlashDurationMs;
          spawnHitSpark(b.x, b.y, false);
          bullets.splice(i, 1);
          continue;
        }
        registerBossHoleHit(hitHole, b.x, b.y);
        bullets.splice(i, 1);
        continue;
      }
    }
    // 「大規模プロジェクト」への命中判定。こちらは通常の攻撃（自機・同僚の弾）でも発射口を破壊できる
    if (midBossEvent && (b.owner === 'player' || b.owner === 'deflected' || b.owner === 'partner')) {
      const hitMidHole = findHitMidBossHole(b.x, b.y);
      if (hitMidHole) {
        registerMidBossHoleHit(hitMidHole, b.x, b.y);
        bullets.splice(i, 1);
        continue;
      }
    }
    // 固定ターゲット「定時報告」への命中判定
    if (scheduledReport &&
        Math.hypot(b.x - scheduledReport.x, b.y - scheduledReport.y) <= b.radius + scheduledReport.radius) {
      const damageBonus = 1 + skillLevel * 0.08;
      const actualDmg = Math.max(1, Math.round((b.damage || 1) * damageBonus));
      scheduledReport.hp -= actualDmg;
      bullets.splice(i, 1);
      if (scheduledReport.hp <= 0) defeatScheduledReport();
      continue;
    }

    // 弾と各敵の円形当たり判定が重なっているか調べる
    for (let j = enemies.length - 1; j >= 0; j--) {
      const en = enemies[j];
      const d = Math.hypot(b.x - en.x, b.y - en.y);
      if (d <= b.radius + en.radius) {
          const dmg = b.damage || 1;
          // スキルレベルに応じてダメージを増やす
          updateSkillEffects();
          const damageBonus = 1 + skillLevel * 0.08;
          const actualDmg = Math.max(1, Math.round(dmg * damageBonus));
          en.hp = (en.hp || 1) - actualDmg;
        if (b.owner === 'partner') en.hitByPartner = true;
        spawnHitSpark(b.x, b.y, en.hp <= 0);
        bullets.splice(i, 1);
        if (en.hp <= 0) {
            // 強い敵ほど多くのスコアを獲得する
            const pts = Math.ceil(en.type * 3 * specialSkillEffects.scoreGainMultiplier);
            score += pts;
            // 敵の種類に応じて経験値を獲得する
            exp += en.type * 5 * specialSkillEffects.expGainMultiplier;
            updateSkillEffects();
          // 同僚が当てていた敵に自機がとどめを刺すと、お礼を言ってくれる
          if (b.owner === 'player' && en.hitByPartner && partner.active) {
            showRandomPartnerSpeechBubbleIfFriendly(partnerThanksLines, '#69f0ae', partnerThanksStressedLines);
            if (Math.random() < partnerThanksRelationshipChance) {
              adjustPartnerRelationship(1);
            }
          }
          recordJobDefeatForStats(en.text);
          enemies.splice(j, 1);
          weeklyKills++;
          weeklyScoreGained += pts;
          checkEarlyQuotaAchievement();
          if (countActiveWorkEnemies() === 0) waveCooldownMs = waveCooldownDelayMs;
        }
        break;
      }
    }
  }

  // 疲労値が0～最大値の範囲を超えないようにする
  fatigue = Math.max(0, Math.min(maxFatigue, fatigue));
  // 「無敵（テスト用）」「β版設定」：脳疲労を常に0のままにする
  if (isTestInvincibleUpgradeActive()) fatigue = 0;

  // 脳疲労が高い状態・SANが低い状態が一定時間続くと、寿命が少しずつ削れていく
  if (fatigue >= maxFatigue * highFatigueThresholdRatio) {
    highFatigueTimerMs += dt * 1000;
    if (highFatigueTimerMs > highFatigueGraceMs) {
      lifespan = Math.max(0, lifespan - highFatigueLifespanPerSec * dt);
    }
  } else {
    highFatigueTimerMs = 0;
  }
  if (san <= maxSan * lowSanThresholdRatio) {
    lowSanTimerMs += dt * 1000;
    if (lowSanTimerMs > lowSanGraceMs) {
      lifespan = Math.max(0, lifespan - lowSanLifespanPerSec * dt);
    }
  } else {
    lowSanTimerMs = 0;
  }
  checkVitalsGameOver();
  if (gameOver || deathSequence) return;

  // ===== 敵とプレイヤーの接触判定 =====
  for (let j = enemies.length - 1; j >= 0; j--) {
    const en = enemies[j];
    const ed = Math.hypot(en.x - player.x, en.y - player.y);
    if (ed > en.radius + player.radius) {
      en.touching = false;
      en.barrierBlockedContact = false;
      continue;
    }
    if (invincible) continue;

    // 接触した敵の種類に応じてSANを減らす
    updateSkillEffects();
    const sanMultiplier = Math.max(0.5, 1 - skillLevel * 0.04);
    let defeated = false;
    if (!en.touching) {
      // 「ファイヤーウォール」が残っていれば、この接触の間ずっとSANダメージを無効化する
      // （「オートパリィ」は敵からの弾に対してのみ発動し、敵本体との接触は対象外）
      if (playerBarrierCharges > 0) {
        playerBarrierCharges--;
        en.barrierBlockedContact = true;
      } else {
        en.barrierBlockedContact = false;
        // 接触した瞬間：SANダメージを与え、無敵時間を開始する
        const sdamage = Math.ceil(
          (en.type || 1) * contactSanMultiplier * sanMultiplier *
          specialSkillEffects.sanDamageMultiplier * getEnemyDifficultyMultiplier()
        );
        damageSan(sdamage);
      }
      en.touching = true;
      invincible = true;
      invincibleTimer = invincibleDuration;
      // 最初の接触時、敵にも弾1発相当のダメージを与える
      const contactConditionRatio = 1 - Math.max(0, Math.min(1, fatigue / maxFatigue));
      const contactDamage = Math.max(1, Math.round(
        baseBulletDamage * contactConditionRatio * (1 + skillLevel * 0.08) *
        (isTestInvincibleUpgradeActive() ? 50 : 1)
      ));
      en.hp = (en.hp || 1) - contactDamage;
      if (en.hp <= 0) defeated = true;
    } else if (!en.barrierBlockedContact) {
      // 接触し続けている間は、少しずつSANを減らす（バリアが有効な接触では発生しない）
      const sustainedDrain = Math.max(
        1,
        (en.type || 1) * contactSanMultiplier * sanMultiplier * 0.18 * dt *
        specialSkillEffects.sanDamageMultiplier * getEnemyDifficultyMultiplier()
      );
      damageSan(sustainedDrain);
    }
    // 敵との接触によるスコア減点
    const penalty = Math.ceil((en.type || 1) * 2 * specialSkillEffects.contactScorePenaltyMultiplier);
    score = Math.max(0, score - penalty);
    if (defeated) {
      // 接触で倒した場合も、弾で倒した場合と同じ報酬を与える
      const pts = Math.ceil(en.type * 3 * specialSkillEffects.scoreGainMultiplier);
      score += pts;
      exp += en.type * 5 * specialSkillEffects.expGainMultiplier;
      updateSkillEffects();
      recordJobDefeatForStats(en.text);
      enemies.splice(j, 1);
      weeklyKills++;
      weeklyScoreGained += pts;
      checkEarlyQuotaAchievement();
      if (countActiveWorkEnemies() === 0) waveCooldownMs = waveCooldownDelayMs;
    }
    if (gameOver) break;
  }
  // 疲労値の制限と各種当たり判定は上の処理で完了
}
// タップ／クリックしやすいよう、枠付きで塗りつぶした矩形ボタンとしてラベルを描画し、
// 同じ矩形を uiButtons に登録する（マウスクリック・タップの両方で action が呼ばれる）
// 一時メッセージを画面上部の中央に表示する（通常表示時と、DAY演出中に上書き表示する時の両方から呼ばれる）
function drawPendingMessages() {
  if (messages.length === 0) return;
  let y = 242;
  for (const m of messages) {
    ctx.font = m.font || '20px sans-serif';
    // 残り時間に応じてメッセージを徐々に透明にする（DAY演出中は時間停止中のため常に不透明）
    let alpha = 1;
    if (m.initialTtl && m.initialTtl > 0) alpha = Math.max(0, Math.min(1, m.ttl / m.initialTtl));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = m.color || 'white';
    ctx.textAlign = m.textAlign || 'center';
    ctx.fillText(m.text, m.x ?? canvas.width / 2, m.y ?? y);
    ctx.restore();
    if (m.y === undefined) y += 28;
  }
  ctx.textAlign = 'left';
}

// 現在のctx.fontで指定幅に収まるよう、1文字ずつ計測しながら折り返す（日本語想定のため単語区切りなし）
function wrapTextToWidth(text, maxWidth) {
  const lines = [];
  let current = '';
  for (const ch of text) {
    const testLine = current + ch;
    if (current.length > 0 && ctx.measureText(testLine).width > maxWidth) {
      lines.push(current);
      current = ch;
    } else {
      current = testLine;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

function drawUiButton(x, y, w, h, label, action, options = {}) {
  ctx.save();
  ctx.fillStyle = options.fillStyle || 'rgba(103, 58, 183, 0.55)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = options.strokeStyle || '#ce93d8';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = options.textColor || 'white';
  ctx.font = options.font || 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.restore();
  uiButtons.push({ x, y, w, h, action });
}

// アドベンチャーパートに入る前の統計情報画面：見出し付きのリストを1つ描く共通処理。
// 行数が多い場合は途中で「……ほかN件」と省略し、次のセクションを描き始めるY座標を返す
const adventureStatsSectionMaxLines = 8;
function drawAdventureStatsSection(x, y, title, lines, accentColor) {
  ctx.textAlign = 'left';
  ctx.fillStyle = accentColor;
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(title, x, y);
  ctx.fillStyle = '#eceff1';
  ctx.font = '13px sans-serif';
  let ly = y + 22;
  if (lines.length === 0) {
    ctx.fillStyle = '#78909c';
    ctx.fillText('（なし）', x, ly);
    return ly + 26;
  }
  const shown = lines.slice(0, adventureStatsSectionMaxLines);
  shown.forEach(line => {
    ctx.fillText(line, x, ly);
    ly += 18;
  });
  if (lines.length > adventureStatsSectionMaxLines) {
    ctx.fillStyle = '#78909c';
    ctx.fillText(`……ほか${lines.length - adventureStatsSectionMaxLines}件`, x, ly);
    ly += 18;
  }
  return ly + 8;
}

// ゲーム終了画面（Game Over / Game Clear）共通の再挑戦・終了ボタン
function drawEndScreenButtons(baseY) {
  const btnW = 300, btnH = 48;
  const btnX = canvas.width / 2 - btnW / 2;
  drawUiButton(btnX, baseY, btnW, btnH, '...という夢？', () => {
    // 次に同じ自機・同僚で始めた時の再会シーンのため、今回の相手との関係を記録しておく
    dreamMemorySave.lastRun = selectedPartnerIcon ? {
      playerGender: selectedGender,
      partnerIcon: selectedPartnerIcon,
      relationship: partner.relationship,
      endingType: endingType,
      // 第3回アドベンチャーパートを経る前に、通常のラスボス遭遇イベントに負けた場合だけ立てるフラグ
      // （タイトル画面の背景切り替えに使う。ADV3経由のノーマルエンドはfinishNormalEndSequence側で判定する）
      lostToBossBeforeAdv3: !!bossEvent && adventureRunCount < 3
    } : null;
    // 到達したエンディングを、タイトル画面のエンディングリストに記録する
    if (endingType && dreamMemorySave.endingsCleared.hasOwnProperty(endingType)) {
      dreamMemorySave.endingsCleared[endingType] = true;
    }
    // クリア・ゲームオーバーを問わず、役職（ランク）・役職スキル・Scoreは次周へそのまま引き継ぐ
    saveCarriedProgressionForNextRun();
    saveDreamMemorySave();
    location.reload();
  });
  drawUiButton(btnX, baseY + 60, btnW, btnH, '終了する', () => { window.close(); },
    { fillStyle: 'rgba(84, 30, 30, 0.6)', strokeStyle: '#ef9a9a' });
  ctx.fillStyle = '#b0bec5';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('※ブラウザの設定によっては閉じられない場合があります（その場合はタブを閉じてください）', canvas.width / 2, baseY + 130);
  ctx.textAlign = 'left';
}

// ===== エンディング演出（一枚絵・説明文は仮のプレースホルダー。後で差し替え予定） =====
const endingConfig = {
  normal1: {
    icon: '🌤️',
    label: 'NORMAL END',
    labelColor: '#ffe082',
    bgColor: 'rgba(10, 20, 15, 0.88)',
    description: [
      '（仮）月末を迎え、良好な関係のまま、ひとまずの区切りがついた。',
      'これもまた、一つの生き方だった。'
    ]
  },
  normal2: {
    icon: '🏁',
    label: 'NORMAL END',
    labelColor: '#b0bec5',
    bgColor: 'rgba(10, 15, 20, 0.88)',
    description: [
      '（仮）月末を迎え、ひとまずの区切りがついた。',
      'これもまた、一つの生き方だった。'
    ]
  },
  normal3: {
    icon: '🌧️',
    label: 'NORMAL END',
    labelColor: '#90a4ae',
    bgColor: 'rgba(15, 12, 18, 0.88)',
    description: [
      '（仮）月末を迎え、ぎこちない関係のまま、ひとまずの区切りがついた。',
      'これもまた、一つの生き方だった。'
    ]
  },
  'bad-san': {
    icon: '🌀',
    label: 'END',
    labelColor: '#ce93d8',
    bgColor: 'rgba(30, 0, 40, 0.88)',
    description: [
      '積み重なったストレスで、心が壊れてしまった。',
    
    ]
  },
  'bad-lifespan': {
    icon: '⚰️',
    label: 'END',
    labelColor: '#90a4ae',
    bgColor: 'rgba(8, 8, 8, 0.92)',
    description: [
      '気づかぬうちに蓄積した消耗が、静かに寿命を削りきった。',
         ]
  },
  'bad-partner-shot': {
    icon: '💔',
    label: 'END',
    labelColor: '#ef9a9a',
    bgColor: 'rgba(35, 5, 12, 0.92)',
    description: [
      '同僚の一撃が、最後の引き金になってしまった。',
      'どこかで関係性を誤ってしまったのだろうか。'
    ]
  },
  'bad-lonely': {
    icon: '🗂️',
    label: 'END',
    labelColor: '#90a4ae',
    bgColor: 'rgba(10, 10, 10, 0.92)',
    description: [
      '（仮）誰かと言葉を交わすこともなく、ただひたすらに仕事をした。',
    ]
  }
};

function drawEndingScreen() {
  const cfg = endingConfig[endingType] || endingConfig.normal2;
  ctx.fillStyle = cfg.bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = 'center';
  ctx.font = '100px "Segoe UI Emoji", sans-serif';
  ctx.fillStyle = 'white';
  ctx.fillText(cfg.icon, canvas.width / 2, canvas.height / 2 - 140);

  ctx.font = 'bold 40px sans-serif';
  ctx.fillStyle = cfg.labelColor;
  ctx.fillText(cfg.label, canvas.width / 2, canvas.height / 2 - 50);

  ctx.font = '17px sans-serif';
  ctx.fillStyle = '#e0e0e0';
  cfg.description.forEach((line, i) => {
    ctx.fillText(line, canvas.width / 2, canvas.height / 2 - 14 + i * 24);
  });

  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = 'white';
  ctx.fillText(`Final Score: ${score}`, canvas.width / 2, canvas.height / 2 + 54);
  ctx.font = '15px sans-serif';
  ctx.fillStyle = '#ce93d8';
  ctx.fillText(`「・・・という夢をみました」を選ぶと、役職「${rankNames[rank - 1]}」・Score・役職スキルを次周に引き継げます`,
    canvas.width / 2, canvas.height / 2 + 76);
  ctx.font = 'bold 26px sans-serif';
  ctx.fillStyle = cfg.labelColor;
  ctx.fillText('E N D', canvas.width / 2, canvas.height / 2 + 104);

  ctx.textAlign = 'left';
  drawEndScreenButtons(canvas.height / 2 + 128);
}

// ===== 背景（imagesフォルダの時間帯画像） =====
// 画像の読み込みが済むまでの間だけ使う、簡単なグラデーションのフォールバック
const backgroundGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
backgroundGradient.addColorStop(0, '#12161f');
backgroundGradient.addColorStop(1, '#05060a');

// タイトルの取り消し線用の、常に同じ形になる擬似乱数（0〜1）。毎フレーム同じ値を返すので線の形が動かない
function titleGlitchPseudoRandom(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// タイトルの「ここで寝たらただのサラリーマン」＋サブタイトルを描画する共通処理。
// showClawMarks が true の間は、「サラリーマン」の部分を爪痕＋鉛筆の線で打ち消す（通常のタイトル画面・
// 目覚めエンド専用タイトル画面のどちらからも呼ばれる）
function drawGameTitleText(fontFamily, strokeColor, fillColor, subtitleText, showClawMarks) {
  const titleY = canvas.height / 2 - 154;
  ctx.save();
  ctx.font = `bold 38px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  ctx.lineWidth = 6;
  ctx.strokeStyle = strokeColor;
  ctx.strokeText('ここで寝たらただのサラリーマン', canvas.width / 2, titleY);
  ctx.fillStyle = fillColor;
  ctx.fillText('ここで寝たらただのサラリーマン', canvas.width / 2, titleY);
  ctx.restore();

  if (showClawMarks) {
    ctx.save();
    ctx.font = `bold 38px ${fontFamily}`;
    ctx.textAlign = 'left';
    const titlePrefix = 'ここで寝たらただの';
    const titleTarget = 'サラリーマン';
    const fullWidth = ctx.measureText(titlePrefix + titleTarget).width;
    const prefixWidth = ctx.measureText(titlePrefix).width;
    const targetWidth = ctx.measureText(titleTarget).width;
    const titleLeftX = canvas.width / 2 - fullWidth / 2;
    const targetLeftX = titleLeftX + prefixWidth;

    // 爪痕：暗い血のような色の斜めの傷を数本、それぞれジグザグに走らせ、中央が太く両端が細くなるようにする。
    // 1本おきに逆方向の傷を重ねて交差させ、文字がずたずたに引き裂かれたように見せる
    ctx.strokeStyle = 'rgba(28, 3, 3, 0.92)';
    ctx.lineCap = 'round';
    const clawCount = 5;
    for (let c = 0; c < clawCount; c++) {
      const crossing = c % 2 === 1;
      const startX = targetLeftX - 8 + (targetWidth + 16) / (clawCount + 1) * (c + 0.55);
      const startY = titleY - 26 + (titleGlitchPseudoRandom(c * 17 + 3) - 0.5) * 8;
      const baseAngleDeg = crossing ? -28 : 28;
      const angleDeg = baseAngleDeg + (titleGlitchPseudoRandom(c * 41 + 11) - 0.5) * 10;
      const angle = angleDeg * Math.PI / 180;
      const length = 34 + titleGlitchPseudoRandom(c * 29 + 5) * 10;
      const endX = startX + Math.cos(angle) * length;
      const endY = startY + Math.sin(angle) * length;
      const perpAngle = angle + Math.PI / 2;
      const segs = 6;
      let prevX = startX, prevY = startY;
      for (let s = 1; s <= segs; s++) {
        const t = s / segs;
        const jag = (titleGlitchPseudoRandom(c * 71 + s * 13) - 0.5) * 3;
        const px = startX + (endX - startX) * t + Math.cos(perpAngle) * jag;
        const py = startY + (endY - startY) * t + Math.sin(perpAngle) * jag;
        // 中央が太く、両端にいくほど細くなる（爪で引っかいた時の力の抜け方をイメージ）
        ctx.lineWidth = 1.5 + Math.sin(Math.PI * t) * 3.5;
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(px, py);
        ctx.stroke();
        prevX = px; prevY = py;
      }
    }

    // 鉛筆でぐしゃぐしゃと二重線を引いて打ち消したような、ほぼ水平のランダムな線も、爪痕と同じ色で重ねる
    const pencilLineCount = 2;
    for (let p = 0; p < pencilLineCount; p++) {
      const baseY = titleY - 12 + p * 9 + (titleGlitchPseudoRandom(p * 53 + 7) - 0.5) * 6;
      const angleDeg = (titleGlitchPseudoRandom(p * 61 + 19) - 0.5) * 8; // ほぼ水平
      const angle = angleDeg * Math.PI / 180;
      const startX = targetLeftX - 6 - titleGlitchPseudoRandom(p * 11 + 2) * 4;
      const length = targetWidth + 12 + titleGlitchPseudoRandom(p * 23 + 9) * 10;
      const endX = startX + Math.cos(angle) * length;
      const endY = baseY + Math.sin(angle) * length;
      const perpAngle = angle + Math.PI / 2;
      const segs = 10;
      let prevPX = startX, prevPY = baseY;
      ctx.lineWidth = 2;
      for (let s = 1; s <= segs; s++) {
        const t = s / segs;
        const jag = (titleGlitchPseudoRandom(p * 97 + s * 17 + 31) - 0.5) * 4;
        const px = startX + (endX - startX) * t + Math.cos(perpAngle) * jag;
        const py = baseY + (endY - baseY) * t + Math.sin(perpAngle) * jag;
        ctx.beginPath();
        ctx.moveTo(prevPX, prevPY);
        ctx.lineTo(px, py);
        ctx.stroke();
        prevPX = px; prevPY = py;
      }
    }
    ctx.restore();
  }

  ctx.save();
  ctx.font = `bold 24px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  ctx.lineWidth = 4;
  ctx.strokeStyle = strokeColor;
  ctx.strokeText(subtitleText, canvas.width / 2, canvas.height / 2 - 118);
  ctx.fillStyle = fillColor;
  ctx.fillText(subtitleText, canvas.width / 2, canvas.height / 2 - 118);
  ctx.restore();
  ctx.textAlign = 'left';
}

// 目覚めエンド（真エンド・同僚生存）到達後に表示する専用タイトル画面（暫定：白背景）。
// タイトル文字は通常タイトルと同じ書体で、常に爪痕＋鉛筆の線で打ち消した状態にする
const trueEndTitleMinchoFont = '"Yu Mincho", "Hiragino Mincho ProN", "MS PMincho", serif';
const trueEndTitleCursiveFont = '"Comic Sans MS", "Chalkboard SE", "Marker Felt", cursive, sans-serif';
const trueEndTitleButtonStyle = {
  fillStyle: 'rgba(0, 0, 0, 0.08)',
  strokeStyle: '#000000',
  textColor: '#000000',
  font: `bold 18px ${trueEndTitleMinchoFont}`
};

function drawTrueEndTitleScreen() {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawGameTitleText(trueEndTitleCursiveFont, '#ff8fab', '#fffaf0', 'Wakin’ UnDead', true);

  const btnW = 260, btnH = 46, btnGap = 16;
  const btnX = canvas.width / 2 - btnW / 2;
  const startY = canvas.height / 2 - 10;
  drawUiButton(btnX, startY, btnW, btnH, 'エンディングリスト',
    () => { trueEndEndingListActive = true; }, trueEndTitleButtonStyle);
  drawUiButton(btnX, startY + (btnH + btnGap), btnW, btnH, '就活を始める',
    () => { startJobHuntEndSequence(); }, trueEndTitleButtonStyle);
  drawUiButton(btnX, startY + (btnH + btnGap) * 2, btnW, btnH, '寝る',
    () => {
      // 同僚との関係値・前回誰を選んだかの情報だけをリセットする（役職・Score・記憶ポイントなどは残す）
      dreamMemorySave.lastRun = null;
      saveDreamMemorySave();
      location.reload();
    }, trueEndTitleButtonStyle);
}

// 目覚めエンド専用タイトル画面の「就活を始める」を押した後の演出。
// whiteout：タイトル画面が白へ消えていく／image：中央に一枚画像（暫定は矩形）を表示し、クリックを待つ／
// fadeOut：クリック後、画面全体が黒くフェードアウトしきったらゲームを終了する（updateBossEvent側でwindow.close()）
const jobHuntEndPlaceholderImageW = 360;
const jobHuntEndPlaceholderImageH = 220;
function drawJobHuntEndSequence() {
  const seq = jobHuntEndSequence;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (seq.phase === 'whiteout') {
    // 専用タイトル画面の文字を、白へ完全に消えきるまで薄れさせながら見せておく
    const p = Math.min(1, seq.phaseTimerMs / jobHuntEndWhiteoutDurationMs);
    ctx.save();
    ctx.globalAlpha = 1 - p;
    drawGameTitleText(trueEndTitleCursiveFont, '#ff8fab', '#fffaf0', 'Wakin’ UnDead', true);
    ctx.restore();
    return;
  }

  // 'image'・'fadeOut'共通：中央に一枚画像（後日差し替え予定。暫定的に矩形で表示）を表示する
  const imgX = canvas.width / 2 - jobHuntEndPlaceholderImageW / 2;
  const imgY = canvas.height / 2 - jobHuntEndPlaceholderImageH / 2;
  ctx.fillStyle = '#cfcfcf';
  ctx.fillRect(imgX, imgY, jobHuntEndPlaceholderImageW, jobHuntEndPlaceholderImageH);
  ctx.strokeStyle = '#888888';
  ctx.lineWidth = 2;
  ctx.strokeRect(imgX, imgY, jobHuntEndPlaceholderImageW, jobHuntEndPlaceholderImageH);
  ctx.fillStyle = '#888888';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('（差し替え予定の画像）', canvas.width / 2, imgY + jobHuntEndPlaceholderImageH + 28);
  ctx.textAlign = 'left';

  if (seq.phase === 'image') {
    // 画面のどこをクリックしても、フェードアウトへ進む
    uiButtons.push({
      x: 0, y: 0, w: canvas.width, h: canvas.height,
      action: () => { jobHuntEndSequence.phase = 'fadeOut'; jobHuntEndSequence.phaseTimerMs = 0; }
    });
  } else if (seq.phase === 'fadeOut') {
    const p = Math.min(1, seq.phaseTimerMs / jobHuntEndFadeOutDurationMs);
    ctx.fillStyle = `rgba(0, 0, 0, ${p})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

// 目覚めエンド専用タイトル画面から開く、専用デザイン（白背景・明朝体・黒枠半透明）のエンディングリスト
function drawTrueEndEndingListScreen() {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000000';
  ctx.font = `bold 24px ${trueEndTitleMinchoFont}`;
  ctx.fillText('エンディングリスト', canvas.width / 2, 34);
  ctx.textAlign = 'left';

  const cols = 2;
  const colGap = 16;
  const rowX = 40;
  const totalGridWidth = canvas.width - rowX * 2;
  const colWidth = (totalGridWidth - colGap * (cols - 1)) / cols;
  const rowHeight = 60;
  const rowGap = 8;
  const gridStartY = 56;
  const rows = Math.ceil(endingListDefs.length / cols);

  endingListDefs.forEach((def, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const colX = rowX + col * (colWidth + colGap);
    const rowY = gridStartY + row * (rowHeight + rowGap);
    const achieved = !!dreamMemorySave.endingsCleared[def.id];

    ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
    ctx.fillRect(colX, rowY, colWidth, rowHeight);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.strokeRect(colX, rowY, colWidth, rowHeight);

    ctx.font = `bold 26px ${trueEndTitleMinchoFont}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = achieved ? '#000000' : '#9e9e9e';
    ctx.fillText(achieved ? def.icon : '？', colX + 14, rowY + 40);

    ctx.font = `bold 15px ${trueEndTitleMinchoFont}`;
    ctx.fillStyle = achieved ? '#000000' : '#9e9e9e';
    ctx.fillText(achieved ? def.label : '？？？？？', colX + 56, rowY + 24);

    ctx.font = `13px ${trueEndTitleMinchoFont}`;
    ctx.fillStyle = achieved ? '#333333' : '#aaaaaa';
    const hintText = achieved ? def.hint : 'まだ到達していないエンディング';
    const hintLines = wrapTextToWidth(hintText, colWidth - 70).slice(0, 1);
    ctx.fillText(hintLines[0] || '', colX + 56, rowY + 44);
  });

  const gridBottom = gridStartY + rows * (rowHeight + rowGap) - rowGap;
  const backBtnW = 200, backBtnH = 32;
  ctx.textAlign = 'left';
  drawUiButton(canvas.width / 2 - backBtnW / 2, gridBottom + 12, backBtnW, backBtnH,
    '戻る', () => { trueEndEndingListActive = false; }, trueEndTitleButtonStyle);
}

// スタート画面～プレイ開始直前（モード選択・性別選択・同僚選択）で使う共通背景
const startScreenBackgroundImage = (() => {
  const img = new Image();
  img.src = 'images/background/start_01.png';
  return img;
})();
// 直前のプレイがノーマルエンドだった場合・第3回アドベンチャーパートを経る前に
// 通常のラスボス遭遇イベントに負けた場合だけ、タイトル画面の背景をこちらに差し替える
const afterNormalEndBackgroundImage = (() => {
  const img = new Image();
  img.src = 'images/background/after_normalEND.png';
  return img;
})();
// ノーマルエンド確定後の「{partner}を助けないと…」画面の背景に使う画像
const afterEndImage = (() => {
  const img = new Image();
  img.src = 'images/background/after_END.png';
  return img;
})();

// タイトル画面の背景を、直前のプレイ内容に応じて切り替えるべきかどうかを判定する
function shouldShowAfterNormalEndTitleBackground() {
  const lastRun = dreamMemorySave.lastRun;
  if (!lastRun) return false;
  if (typeof lastRun.endingType === 'string' && lastRun.endingType.startsWith('normal')) return true;
  return !!lastRun.lostToBossBeforeAdv3;
}

// モード選択・性別選択・同僚選択・アイコン挨拶・再会シーン・強化画面などの背景を描く（画像＋読みやすくする暗いオーバーレイ）。
// 条件を満たす場合は背景画像をafter_normalENDに差し替え、不規則な明滅・小さな振動を重ねる。
// allowAfterNormalEnd=falseを渡した画面（エンディングリストなど）は対象外にする
function drawSetupBackground(allowAfterNormalEnd = true) {
  const useAfterNormalEndBg = allowAfterNormalEnd && shouldShowAfterNormalEndTitleBackground();
  const bgImage = useAfterNormalEndBg ? afterNormalEndBackgroundImage : startScreenBackgroundImage;
  if (bgImage.complete && bgImage.naturalWidth > 0) {
    ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (useAfterNormalEndBg) {
    // 不規則にゆっくり明度が落ちて戻ったり、時々小さく画面が振動したりする、不穏な演出を重ねる
    const t = Date.now() / 1000;
    // 周期の異なる2つの波を掛け合わせ、周期的すぎない「不規則にゆっくり」な明滅にする
    const dim = Math.max(0, Math.sin(t * 0.11) * 0.5 + 0.5) * Math.max(0, Math.sin(t * 0.047 + 1.7) * 0.5 + 0.5);
    ctx.fillStyle = `rgba(0, 0, 0, ${dim * 0.22})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 数秒に一度、一瞬だけ明るくなるフラッシュ（暗滅とは別の周期でランダムに発生させる）
    const flashCycleMs = 6300;
    const flashCycleIndex = Math.floor(Date.now() / flashCycleMs);
    const flashCyclePos = Date.now() % flashCycleMs;
    const flashWindowMs = 220;
    const flashRoll = titleGlitchPseudoRandom(flashCycleIndex * 89 + 17);
    if (flashRoll < 0.35 && flashCyclePos < flashWindowMs) {
      // 立ち上がりは一瞬、消えるところは少しなだらかに
      const flashT = flashCyclePos / flashWindowMs;
      const flashAlpha = flashT < 0.2 ? flashT / 0.2 : 1 - (flashT - 0.2) / 0.8;
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, flashAlpha) * 0.35})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 数秒に一度、短い間だけ小さく振動する
    const shakeCycleMs = 4200;
    const cycleIndex = Math.floor(Date.now() / shakeCycleMs);
    const cyclePos = Date.now() % shakeCycleMs;
    const shakeWindowMs = 380;
    const shakeRoll = titleGlitchPseudoRandom(cycleIndex * 31 + 5);
    if (shakeRoll < 0.7 && cyclePos < shakeWindowMs) {
      const shakeProgress = 1 - cyclePos / shakeWindowMs;
      const mag = 7 * shakeProgress;
      const shakeX = (titleGlitchPseudoRandom(cycleIndex * 53 + Math.floor(cyclePos / 40)) - 0.5) * mag;
      const shakeY = (titleGlitchPseudoRandom(cycleIndex * 71 + Math.floor(cyclePos / 40)) - 0.5) * mag;
      canvas.style.transform = `translate(${shakeX}px, ${shakeY}px)`;
    } else {
      canvas.style.transform = '';
    }
  } else {
    canvas.style.transform = '';
  }
}

// after_normalEND使用時だけ、タイトル画面の主要ボタンにわずかな傾き・振動・フラッシュを重ねて描く。
// 通常時（start_01.png使用時）はdrawUiButtonをそのまま呼ぶだけで、見た目は変わらない。
// クリック判定（uiButtons）は元のx,y,w,hのまま登録されるため、傾き自体はごく小さく抑えてある
function drawTitleGlitchButton(x, y, w, h, label, action, options, seedBase) {
  if (!shouldShowAfterNormalEndTitleBackground()) {
    drawUiButton(x, y, w, h, label, action, options);
    return;
  }
  const t = Date.now();
  // 傾き：数秒に一度、ランダムなタイミングでわずかに傾いてから戻る
  const tiltCycleMs = 5000;
  const tiltCycleIndex = Math.floor(t / tiltCycleMs);
  const tiltCyclePos = t % tiltCycleMs;
  const tiltWindowMs = 500;
  const tiltRoll = titleGlitchPseudoRandom(seedBase * 13 + tiltCycleIndex * 7 + 1);
  let tiltDeg = 0;
  if (tiltRoll < 0.4 && tiltCyclePos < tiltWindowMs) {
    const progress = 1 - tiltCyclePos / tiltWindowMs;
    const maxTilt = (titleGlitchPseudoRandom(seedBase * 17 + tiltCycleIndex) - 0.5) * 12; // 最大でおよそ±6度
    tiltDeg = maxTilt * progress;
  }
  // 振動：ボタンごとに周期・タイミングをずらして小刻みに揺れる
  const shakeCycleMs = 4200;
  const shakeCycleIndex = Math.floor(t / shakeCycleMs);
  const shakeCyclePos = t % shakeCycleMs;
  const shakeWindowMs = 380;
  const shakeRoll = titleGlitchPseudoRandom(seedBase * 29 + shakeCycleIndex * 11 + 3);
  let shakeX = 0, shakeY = 0;
  if (shakeRoll < 0.6 && shakeCyclePos < shakeWindowMs) {
    const progress = 1 - shakeCyclePos / shakeWindowMs;
    const mag = 4 * progress;
    shakeX = (titleGlitchPseudoRandom(seedBase * 41 + Math.floor(shakeCyclePos / 40)) - 0.5) * mag;
    shakeY = (titleGlitchPseudoRandom(seedBase * 59 + Math.floor(shakeCyclePos / 40)) - 0.5) * mag;
  }

  ctx.save();
  ctx.translate(x + w / 2 + shakeX, y + h / 2 + shakeY);
  ctx.rotate(tiltDeg * Math.PI / 180);
  ctx.translate(-(x + w / 2), -(y + h / 2));
  drawUiButton(x, y, w, h, label, action, options);
  ctx.restore();

  // フラッシュ：数秒に一度、ボタンだけが一瞬明るく光る
  const flashCycleMs = 6300;
  const flashCycleIndex = Math.floor(t / flashCycleMs);
  const flashCyclePos = t % flashCycleMs;
  const flashWindowMs = 220;
  const flashRoll = titleGlitchPseudoRandom(seedBase * 71 + flashCycleIndex * 89 + 17);
  if (flashRoll < 0.3 && flashCyclePos < flashWindowMs) {
    const flashT = flashCyclePos / flashWindowMs;
    const flashAlpha = flashT < 0.2 ? flashT / 0.2 : 1 - (flashT - 0.2) / 0.8;
    ctx.save();
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, flashAlpha) * 0.4})`;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
}

// 朝・昼・夕方・夜の背景画像を読み込んでおく
const backgroundTimeImages = {
  morning: (() => { const img = new Image(); img.src = 'images/background/01_morning.png'; return img; })(),
  daytime: (() => { const img = new Image(); img.src = 'images/background/02_daytime.png'; return img; })(),
  earlynight: (() => { const img = new Image(); img.src = 'images/background/03_earlynight.png'; return img; })(),
  night: (() => { const img = new Image(); img.src = 'images/background/04_night.png'; return img; })()
};
// 前回ノーマルエンドを迎えた時と全く同じ自機・同僚で周回している間、時間帯に関係なく使う専用の背景
const backgroundDreamcatcherImage = (() => {
  const img = new Image();
  img.src = 'images/background/05_dreamcatcher.png';
  return img;
})();
// ゲーム内時刻と背景画像の対応（時刻の間はなだらかにクロスフェードする）
const backgroundTimeKeyframes = [
  { hour: dayStartHour, key: 'morning' },
  { hour: 12, key: 'daytime' },
  { hour: dayEndHour, key: 'earlynight' },
  { hour: 21, key: 'night' }
];

function drawBackground() {
  // タイトル（オープニング）画面の背景がafter_normalENDになっている周回、および「目覚め」経由の
  // 特別なラスボス戦の間は、戦闘画面も時間帯に応じた背景の代わりに、常にこの専用背景を使う
  if (dreamBossActive || shouldShowAfterNormalEndTitleBackground()) {
    if (backgroundDreamcatcherImage.complete && backgroundDreamcatcherImage.naturalWidth > 0) {
      ctx.drawImage(backgroundDreamcatcherImage, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = backgroundGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    // 背景を少し薄暗くして、敵・アイコン・文字などの前景を見やすくする
    ctx.fillStyle = 'rgba(6, 10, 18, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const visualHour = getVisualGameHour();
  const firstFrame = backgroundTimeKeyframes[0];
  const lastFrame = backgroundTimeKeyframes[backgroundTimeKeyframes.length - 1];
  const clampedHour = Math.max(firstFrame.hour, Math.min(lastFrame.hour, visualHour));

  let from = firstFrame;
  let to = lastFrame;
  for (let i = 0; i < backgroundTimeKeyframes.length - 1; i++) {
    if (clampedHour >= backgroundTimeKeyframes[i].hour && clampedHour <= backgroundTimeKeyframes[i + 1].hour) {
      from = backgroundTimeKeyframes[i];
      to = backgroundTimeKeyframes[i + 1];
      break;
    }
  }
  const span = to.hour - from.hour;
  const t = span > 0 ? (clampedHour - from.hour) / span : 0;
  const fromImg = backgroundTimeImages[from.key];
  const toImg = backgroundTimeImages[to.key];

  if (fromImg.complete && fromImg.naturalWidth > 0) {
    ctx.drawImage(fromImg, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = backgroundGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (t > 0 && toImg.complete && toImg.naturalWidth > 0) {
    ctx.save();
    ctx.globalAlpha = t;
    ctx.drawImage(toImg, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
  // 背景を少し薄暗くして、敵・アイコン・文字などの前景を見やすくする
  ctx.fillStyle = 'rgba(6, 10, 18, 0.3)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ラスボス出現中の画面演出（暗く赤みがかった夜のような雰囲気）と、仮の見た目を描く
// 撃破演出：本体はその場に留まったまま、画像の縁から中央に向かって消滅していく（0〜dissolveDurationMs）。
// 撃破演出：細かく振動しながら透明になり、ゆっくり画面外へ消えていく（bossDefeatExitDurationMsで完了）。
// 消え終わったら、その場に自機のアイコンが点滅しながらフェードインで現れ、点滅が止まって実体化した後、フェードアウトで消える
const bossDefeatExitDurationMs = 5000;
const bossDefeatIconFlickerMs = 900; // 点滅しながらフェードインする時間
const bossDefeatIconHoldMs = 1500; // 点滅が終わり、実体化した状態で留まる時間
const bossImageOverscanScale = 1.25; // 上端が画面内に見えないよう、画像全体を少し拡大して表示する
function drawBossEvent() {
  if (!bossEvent) return;
  const geo = getBossGeometry();

  // 撃破後の退場演出中：細かく振動しながら透明になり、ゆっくり画面上へ消えていく
  const retreating = bossFinalSequence && bossFinalSequence.phase === 'retreat';
  const retreatMs = retreating ? bossFinalSequence.phaseTimerMs : 0;
  const exitProgress = retreating ? Math.min(1, retreatMs / bossDefeatExitDurationMs) : 0;
  // 透明化は退場の進み具合の150%の速さで進める
  const exitFadeProgress = Math.min(1, exitProgress * 1.5);
  const bodyAlpha = 1 - exitFadeProgress;
  const exitOffsetY = -exitProgress * (bossHeight + 400);
  const exitShakeX = retreating ? Math.sin(gameClockMs / 17.5) * 5 * (1 - exitProgress * 0.3) : 0;

  // 画面全体を、赤黒く沈んだ夜のような色合いに染める
  ctx.save();
  const dusk = ctx.createLinearGradient(0, 0, 0, canvas.height);
  dusk.addColorStop(0, 'rgba(60, 0, 0, 0.55)');
  dusk.addColorStop(0.45, 'rgba(20, 0, 10, 0.35)');
  dusk.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
  ctx.fillStyle = dusk;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  // 通常のラスボス戦（ノーマルルート終了時の負けイベント戦闘・同僚消滅演出は除く）は、さらに画面全体を暗くする
  const isNormalEndBattleSequence = normalEndSequence && (normalEndSequence.phase === 'battle' ||
    normalEndSequence.phase === 'partnerLossSlowmo' || normalEndSequence.phase === 'partnerVanish');
  if (!isNormalEndBattleSequence) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 特定の段階限定：窓の下のガラス部分あたりに、うっすらと解説文を表示する（背景より前、ラスボスより後ろ）
  const stageGlassText = bossStageGlassTexts[bossEvent.stage];
  if (stageGlassText) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#cccccc';
    ctx.textAlign = 'center';
    const lineHeight = 18;
    const totalHeight = 26 + (stageGlassText.lines.length - 1) * lineHeight;
    const baseY = windowZoneBottomY - 6 - totalHeight;
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(stageGlassText.title, canvas.width / 2, baseY);
    ctx.font = '13px sans-serif';
    stageGlassText.lines.forEach((line, i) => {
      ctx.fillText(line, canvas.width / 2, baseY + 26 + i * lineHeight);
    });
    ctx.restore();
    ctx.textAlign = 'left';
  }

  if (bodyAlpha > 0) {
    // ラスボス本体：last_boss.png を、目・口のあたりが見えるように下寄りを切り出して表示する。
    // 撃破後は、細かく振動しながら透明になり、ゆっくり画面上へ動いていく
    ctx.save();
    ctx.globalAlpha = bodyAlpha;
    const bodyX = geo.x + exitShakeX;
    const bodyY = geo.y + exitOffsetY;
    // 背景の塗りつぶしは行わない：透明部分は、そのまま背景が透けて見えるようにする。
    // ノーマルルート終了時の負けイベント戦闘では、last_boss_normal.png を、
    // 「目覚め」経由の特別なラスボス戦では last_boss.png を代わりに使う
    const activeBossImage = dreamBossActive ? dreamBossImage : (bossEvent.useAltImage ? normalEndBossImage : bossImage);
    if (activeBossImage.complete && activeBossImage.naturalWidth > 0) {
      const scale = geo.width / activeBossImage.naturalWidth;
      const sourceHeight = Math.min(activeBossImage.naturalHeight, geo.height / scale);
      const sourceY = Math.max(0, activeBossImage.naturalHeight * 0.42);
      const clampedSourceHeight = Math.min(sourceHeight, activeBossImage.naturalHeight - sourceY);
      // 上端が画面内に見えないよう、下端（顔まわり）の位置は変えずに全体を少し拡大して表示する
      const baseDrawWidth = geo.width;
      const baseDrawHeight = clampedSourceHeight * scale;
      const drawWidth = baseDrawWidth * bossImageOverscanScale;
      const drawHeight = baseDrawHeight * bossImageOverscanScale;
      const drawX = bodyX + (baseDrawWidth - drawWidth) / 2;
      const drawY = bodyY + baseDrawHeight - drawHeight;
      ctx.drawImage(
        activeBossImage,
        0, sourceY, activeBossImage.naturalWidth, clampedSourceHeight,
        drawX, drawY, drawWidth, drawHeight
      );
    }

    if (!retreating) {
      // 発射口を描く：健在なら赤く脈打つ光（被弾直後は白く点滅）、破壊済みなら黒く焼け落ちた見た目にする。
      // 第2段階「シャドウ」は、赤い光の代わりに半透明の自機・同僚アイコンとして表示する
      for (const hole of bossEvent.holes) {
        const pos = getBossHoleAbsolutePosition(hole);
        const hx = pos.x;
        const hy = pos.y;
        if (hole.destroyed) {
          ctx.beginPath();
          ctx.fillStyle = 'rgba(15, 15, 15, 0.85)';
          ctx.arc(hx, hy, bossHoleRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(90, 90, 90, 0.6)';
          ctx.lineWidth = 2;
          ctx.stroke();
          // 第1段階「視野狭窄」：復活までの残り時間を表示する（10回復活済みなら、もう復活しない旨を表示する）
          if (hole.revive) {
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            if ((hole.reviveCount || 0) >= bossHoleMaxRevives) {
              ctx.fillStyle = '#69f0ae';
              ctx.fillText('撃破済み', hx, hy + 4);
            } else if (hole.reviveTimerMs > 0) {
              ctx.fillStyle = '#eeeeee';
              ctx.fillText((hole.reviveTimerMs / 1000).toFixed(1), hx, hy + 4);
            }
            ctx.textAlign = 'left';
          }
          continue;
        }
        if (hole.disguiseRole) {
          const iconImg = hole.disguiseRole === 'player'
            ? genderImageElements[selectedGender]
            : partnerIconImageElements[selectedPartnerIcon];
          // 自機・同僚それぞれの実際の表示サイズ（radius * 4.8）に合わせ、色彩は反転させる
          const iconRadius = hole.disguiseRole === 'player' ? player.radius : partner.radius;
          ctx.save();
          ctx.globalAlpha = 0.55;
          if (iconImg && iconImg.complete && iconImg.naturalWidth > 0) {
            const iconSize = iconRadius * 4.8;
            ctx.filter = 'invert(1)';
            ctx.drawImage(iconImg, hx - iconSize / 2, hy - iconSize / 2, iconSize, iconSize);
            ctx.filter = 'none';
          } else {
            ctx.beginPath();
            ctx.fillStyle = hole.disguiseRole === 'player' ? '#b22f1e' : '#7f343b';
            ctx.arc(hx, hy, iconRadius, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          if (hole.flashTimerMs > 0) {
            ctx.beginPath();
            ctx.fillStyle = `rgba(255, 255, 255, ${hole.flashTimerMs / bossHoleFlashDurationMs})`;
            ctx.arc(hx, hy, bossHoleRadius * 1.35, 0, Math.PI * 2);
            ctx.fill();
          }
          continue;
        }
        if (hole.selfConflict) {
          // 第6段階「内的葛藤」：3つの自機アイコン（シャドウと同じサイズ、色は通常のまま）が互いに動き回る
          const iconImg = genderImageElements[selectedGender];
          const iconSize = player.radius * 4.8;
          if (iconImg && iconImg.complete && iconImg.naturalWidth > 0) {
            ctx.drawImage(iconImg, hx - iconSize / 2, hy - iconSize / 2, iconSize, iconSize);
          } else {
            ctx.beginPath();
            ctx.fillStyle = '#4dd0e1';
            ctx.arc(hx, hy, player.radius, 0, Math.PI * 2);
            ctx.fill();
          }
          if (hole.flashTimerMs > 0) {
            ctx.beginPath();
            ctx.fillStyle = `rgba(255, 255, 255, ${hole.flashTimerMs / bossHoleFlashDurationMs})`;
            ctx.arc(hx, hy, bossHoleRadius * 1.35, 0, Math.PI * 2);
            ctx.fill();
          }
          continue;
        }
        if (hole.sequential) {
          // 第7段階「就職活動」：中ボスと同じく、番号順にしか破壊できない
          const numberIcon = midBossPhaseNumberIcons[hole.phaseIndex] || String(hole.phaseIndex + 1);
          const isCurrent = hole === bossEvent.holes.find(h => h.sequential && !h.destroyed);
          if (!isCurrent) {
            ctx.beginPath();
            ctx.fillStyle = 'rgba(120, 120, 120, 0.30)';
            ctx.arc(hx, hy, bossHoleRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(180, 180, 180, 0.5)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = 'rgba(230, 230, 230, 0.7)';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(numberIcon, hx, hy);
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'left';
            continue;
          }
          const seqPulse = 0.6 + 0.4 * Math.sin(gameClockMs / 220 + pos.x);
          const seqDamageRatio = hole.hitsTaken / hole.maxHits;
          ctx.beginPath();
          ctx.fillStyle = `rgba(255, ${Math.round(140 + seqDamageRatio * 60)}, 30, ${0.55 * seqPulse})`;
          ctx.shadowColor = '#ff8a65';
          ctx.shadowBlur = 14;
          ctx.arc(hx, hy, bossHoleRadius, 0, Math.PI * 2);
          ctx.fill();
          if (hole.flashTimerMs > 0) {
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.fillStyle = `rgba(255, 255, 255, ${hole.flashTimerMs / bossHoleFlashDurationMs})`;
            ctx.arc(hx, hy, bossHoleRadius * 1.35, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'white';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(numberIcon, hx, hy);
          ctx.textBaseline = 'alphabetic';
          ctx.textAlign = 'left';
          continue;
        }
        const pulse = 0.6 + 0.4 * Math.sin(gameClockMs / 220 + pos.x);
        const damageRatio = hole.hitsTaken / hole.maxHits;
        ctx.beginPath();
        ctx.fillStyle = hole.parryOnly
          ? `rgba(180, 30, 255, ${0.55 * pulse})`
          : `rgba(255, ${Math.round(30 + damageRatio * 140)}, 30, ${0.55 * pulse})`;
        ctx.shadowColor = hole.parryOnly ? '#b428ff' : '#ff1744';
        ctx.shadowBlur = 16;
        ctx.arc(hx, hy, bossHoleRadius, 0, Math.PI * 2);
        ctx.fill();
        // 命中した瞬間、穴を白く点滅させて着弾したことが分かるようにする
        if (hole.flashTimerMs > 0) {
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.fillStyle = `rgba(255, 255, 255, ${hole.flashTimerMs / bossHoleFlashDurationMs})`;
          ctx.arc(hx, hy, bossHoleRadius * 1.35, 0, Math.PI * 2);
          ctx.fill();
        }
        // 第4段階「承認欲求」：狙われて（または打ち返されて）回復した瞬間、緑色に点滅させる
        if (hole.approvalHealFlashMs > 0) {
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.fillStyle = `rgba(105, 240, 174, ${hole.approvalHealFlashMs / bossApprovalHealFlashDurationMs})`;
          ctx.arc(hx, hy, bossHoleRadius * 1.35, 0, Math.PI * 2);
          ctx.fill();
        }
        // 第1段階「視野狭窄」：発射口ごとに独自の体力バーを表示する
        if (hole.showHealthBar) {
          const barW = bossHoleRadius * 2, barH = 5;
          const barX = hx - barW / 2, barY = hy - bossHoleRadius - 14;
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.fillRect(barX, barY, barW, barH);
          ctx.fillStyle = '#ff1744';
          ctx.fillRect(barX, barY, barW * (1 - damageRatio), barH);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.lineWidth = 1;
          ctx.strokeRect(barX, barY, barW, barH);
        }
      }
    }
    ctx.restore();
  }

  // 退場演出の最初の2秒は、画面全体を不規則にフラッシュさせる
  if (retreating && retreatMs < bossFinalFlashDurationMs && Math.random() < 0.15) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + Math.random() * 0.5})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 本体が消え終わったら、その場に自機のアイコンが点滅しながらフェードインで現れ、
  // 点滅が終わって実体化した後、フェードアウトで消える
  if (retreating && retreatMs >= bossDefeatExitDurationMs) {
    const iconMs = retreatMs - bossDefeatExitDurationMs;
    const iconTotalBudgetMs = bossFinalRetreatDurationMs - bossDefeatExitDurationMs;
    const iconFadeOutMs = Math.max(200, iconTotalBudgetMs - bossDefeatIconFlickerMs - bossDefeatIconHoldMs);
    let iconAlpha = 0;
    if (iconMs < bossDefeatIconFlickerMs) {
      // 点滅しながらフェードインする
      const fadeInProgress = iconMs / bossDefeatIconFlickerMs;
      const flicker = Math.floor(iconMs / 70) % 2 === 0 ? 1 : 0.25;
      iconAlpha = fadeInProgress * flicker;
    } else if (iconMs < bossDefeatIconFlickerMs + bossDefeatIconHoldMs) {
      // 点滅が終わり、実体化した状態で留まる
      iconAlpha = 1;
    } else {
      const fadeOutT = iconMs - bossDefeatIconFlickerMs - bossDefeatIconHoldMs;
      iconAlpha = Math.max(0, 1 - fadeOutT / iconFadeOutMs);
    }
    if (iconAlpha > 0) {
      const playerIconImg = genderImageElements[selectedGender];
      const iconSize = 90;
      const iconX = geo.x + geo.width / 2;
      const iconY = geo.y + geo.height / 2;
      ctx.save();
      ctx.globalAlpha = iconAlpha;
      if (playerIconImg && playerIconImg.complete && playerIconImg.naturalWidth > 0) {
        ctx.drawImage(playerIconImg, iconX - iconSize / 2, iconY - iconSize / 2, iconSize, iconSize);
      }
      ctx.restore();
    }
  }

  // HPバー（降りきって本格的な戦闘が始まってから、撃破演出が始まるまで表示する）
  if (bossEvent.phase === 'active' && !bossFinalSequence) {
    const barW = canvas.width * 0.6;
    const barX = (canvas.width - barW) / 2;
    const barY = geo.y + geo.height + 60;
    // 現在の段階に残っている「これから必要な命中数」の合計から、その段階だけのHP比率を出す
    const stageMaxHits = bossEvent.holes.reduce((sum, h) => sum + h.maxHits, 0);
    const stageRemainingHits = bossEvent.holes.reduce((sum, h) => sum + Math.max(0, h.maxHits - h.hitsTaken), 0);
    const hpRatio = stageMaxHits > 0 ? Math.max(0, Math.min(1, stageRemainingHits / stageMaxHits)) : 0;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(barX, barY, barW, 16);
    ctx.fillStyle = '#ff1744';
    ctx.fillRect(barX, barY, barW * hpRatio, 16);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, barY, barW, 16);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    const destroyedHoles = bossEvent.holes.filter(h => h.destroyed).length;
    const headerText = bossEvent.nameOverride
      ? bossEvent.nameOverride
      : (() => {
        const stageDef = bossStageDefs[bossEvent.stage - 1];
        return `${stageDef.name} / ${stageDef.nameEn}（第${bossEvent.stage}段階：${destroyedHoles}／${bossEvent.holes.length} 破壊）`;
      })();
    ctx.fillText(headerText, canvas.width / 2, barY - 8);
    ctx.textAlign = 'left';
    ctx.restore();
  }
}

// ラスボス撃破後、本体の退場が終わってからタイトルへ戻るまでの一連の画面演出
function drawBossFinalTransition() {
  const seq = bossFinalSequence;
  drawBackground();

  if (seq.phase === 'bgRestore') {
    // 暗く沈んでいたトーンが晴れて、いつもの背景に戻っていく
    const p = Math.min(1, seq.phaseTimerMs / bossFinalBgRestoreDurationMs);
    ctx.fillStyle = `rgba(10, 0, 5, ${(1 - p) * 0.5})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }

  // whiteFade以降は、同僚が生存していれば画面が白く、生存していなければ画面が黒くなっていく
  const fadeAlpha = seq.phase === 'whiteFade'
    ? Math.min(1, seq.phaseTimerMs / bossFinalWhiteFadeDurationMs)
    : 1;
  ctx.fillStyle = seq.partnerAlive
    ? `rgba(255, 255, 255, ${fadeAlpha})`
    : `rgba(0, 0, 0, ${fadeAlpha})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (seq.phase === 'realWorldTime') {
    drawRealWorldTimeScreen();
    return;
  }
  if (seq.phase === 'clearMessageFadeIn' || seq.phase === 'clearMessageShown' || seq.phase === 'clearMessageFadeOut') {
    drawClearMessageScreen(seq);
    return;
  }
  if (seq.phase !== 'trueEnd') return;

  ctx.save();
  ctx.textAlign = 'center';
  if (seq.partnerAlive) {
    ctx.fillStyle = '#333333';
    ctx.font = '22px sans-serif';
    const allLines = [seq.wakeUpLine, ...bossTrueEndLines];
    allLines.forEach((line, i) => {
      const cue = bossTrueEndCues[i];
      const alpha = Math.max(0, Math.min(1, (seq.phaseTimerMs - cue.start) / cue.fadeMs));
      if (alpha <= 0) return;
      ctx.globalAlpha = alpha;
      ctx.fillText(line, canvas.width / 2, canvas.height / 2 - 60 + i * 70);
    });
  } else {
    // 同僚が生存していない場合の代替エンド：黒い画面に、同僚を案じる一言だけを表示する
    const pronoun = getPartnerPronoun(selectedPartnerIcon);
    const lineCue = bossAltEndCues[0];
    const lineAlpha = Math.max(0, Math.min(1, (seq.phaseTimerMs - lineCue.start) / lineCue.fadeMs));
    if (lineAlpha > 0) {
      ctx.globalAlpha = lineAlpha;
      ctx.fillStyle = '#eeeeee';
      ctx.font = '22px sans-serif';
      ctx.fillText(`・・・${pronoun}を助けないと。`, canvas.width / 2, canvas.height / 2);
    }
    const endCue = bossAltEndCues[1];
    const endAlpha = Math.max(0, Math.min(1, (seq.phaseTimerMs - endCue.start) / endCue.fadeMs));
    if (endAlpha > 0) {
      ctx.globalAlpha = endAlpha;
      ctx.font = 'bold 42px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('END', canvas.width / 2, canvas.height / 2 + 100);
    }
  }
  ctx.restore();
}

// 真エンド（同僚生存）限定：ENDの後、白い画面に現実の日時を表示する（クリックで次の画面へ）
function drawRealWorldTimeScreen() {
  const now = new Date();
  const yy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const wd = weekdayNames[now.getDay()];
  ctx.save();
  ctx.textAlign = 'right';
  ctx.fillStyle = '#666666';
  ctx.font = '14px sans-serif';
  ctx.fillText('real-world time', canvas.width - 16, 30);
  ctx.fillStyle = '#222222';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText(`${yy}/${mm}/${dd} ${hh}:${mi}:${ss} (${wd})`, canvas.width - 16, 58);
  ctx.textAlign = 'center';
  ctx.font = '15px sans-serif';
  ctx.fillStyle = '#888888';
  ctx.fillText('現実に戻る', canvas.width / 2, canvas.height - 40);
  ctx.restore();
}

// 真エンド（同僚生存）限定：最後のクリアメッセージ（フェードイン→表示→クリックでフェードアウト→タイトルへ）
function drawClearMessageScreen(seq) {
  let alpha = 1;
  if (seq.phase === 'clearMessageFadeIn') {
    alpha = Math.min(1, seq.phaseTimerMs / bossClearMessageFadeMs);
  } else if (seq.phase === 'clearMessageFadeOut') {
    alpha = Math.max(0, 1 - seq.phaseTimerMs / bossClearMessageFadeMs);
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#222222';
  ctx.font = 'bold 26px sans-serif';
  bossClearMessageLines.forEach((line, i) => {
    ctx.fillText(line, canvas.width / 2, canvas.height / 2 - 20 + i * 44);
  });
  ctx.restore();

  if (seq.phase === 'clearMessageShown') {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '15px sans-serif';
    ctx.fillStyle = '#888888';
    ctx.fillText('クリックしてタイトルへ', canvas.width / 2, canvas.height / 2 + 100);
    ctx.restore();
  }
}

// 中ボス「大規模プロジェクト」の見た目を描く（正式な画像を用意するまでの仮の矩形）
function drawMidBossEvent() {
  if (!midBossEvent) return;
  const geo = getMidBossGeometry();

  const retreating = midBossEvent.phase === 'retreat';
  const retreatProgress = retreating
    ? Math.min(1, midBossEvent.retreatTimerMs / midBossRetreatDurationMs)
    : 0;
  const retreatAlpha = 1 - retreatProgress;
  const retreatOffsetY = -retreatProgress * (midBossHeight + 200);
  const retreatShakeX = retreating ? Math.sin(gameClockMs / 35) * 8 * (1 - retreatProgress * 0.3) : 0;

  ctx.save();
  ctx.globalAlpha = retreatAlpha;
  const bodyX = geo.x + retreatShakeX;
  const bodyY = geo.y + retreatOffsetY;
  ctx.fillStyle = 'rgba(84, 60, 20, 0.92)';
  ctx.fillRect(bodyX, bodyY, geo.width, geo.height);
  ctx.strokeStyle = '#ffb74d';
  ctx.lineWidth = 3;
  ctx.strokeRect(bodyX, bodyY, geo.width, geo.height);
  ctx.fillStyle = '#ffe0b2';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('大規模プロジェクト', bodyX + geo.width / 2, bodyY + 22);
  ctx.textAlign = 'left';

  for (const hole of midBossEvent.holes) {
    const pos = getMidBossHoleAbsolutePosition(hole);
    const hx = pos.x + retreatShakeX;
    const hy = pos.y + retreatOffsetY;
    const numberIcon = midBossPhaseNumberIcons[hole.phaseIndex] || String(hole.phaseIndex + 1);
    if (hole.destroyed) {
      ctx.beginPath();
      ctx.fillStyle = 'rgba(15, 15, 15, 0.85)';
      ctx.arc(hx, hy, midBossHoleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(90, 90, 90, 0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
      continue;
    }
    const isCurrent = hole.phaseIndex === midBossEvent.currentPhaseIndex;
    if (!isCurrent) {
      // 自分の番がまだ来ていないフェーズは、破壊できないことが分かるよう暗く鍵をかけたように描く
      ctx.beginPath();
      ctx.fillStyle = 'rgba(120, 120, 120, 0.30)';
      ctx.arc(hx, hy, midBossHoleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(180, 180, 180, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(230, 230, 230, 0.7)';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(numberIcon, hx, hy);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      continue;
    }
    const pulse = 0.6 + 0.4 * Math.sin(gameClockMs / 220 + pos.x);
    const damageRatio = hole.hitsTaken / midBossEvent.hitsPerHole;
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, ${Math.round(140 + damageRatio * 60)}, 30, ${0.55 * pulse})`;
    ctx.shadowColor = '#ff8a65';
    ctx.shadowBlur = 14;
    ctx.arc(hx, hy, midBossHoleRadius, 0, Math.PI * 2);
    ctx.fill();
    if (hole.flashTimerMs > 0) {
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 255, 255, ${hole.flashTimerMs / midBossHoleFlashDurationMs})`;
      ctx.arc(hx, hy, midBossHoleRadius * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(numberIcon, hx, hy);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }
  ctx.restore();

  if (midBossEvent.phase === 'active') {
    const currentIndex = midBossEvent.currentPhaseIndex;
    ctx.save();
    ctx.fillStyle = 'white';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      `大規模プロジェクト：フェーズ ${Math.min(currentIndex + 1, midBossPhaseCount)}/${midBossPhaseCount}`,
      canvas.width / 2, geo.y + geo.height + 20
    );
    ctx.textAlign = 'left';
    ctx.restore();

    // 体力バー（現在対応中のフェーズの残り耐久力を表す）
    const currentHole = midBossEvent.holes[currentIndex];
    if (currentHole && !currentHole.destroyed) {
      const barW = canvas.width * 0.5;
      const barX = (canvas.width - barW) / 2;
      const barY = geo.y + geo.height + 28;
      const hpRatio = Math.max(0, Math.min(1, 1 - currentHole.hitsTaken / midBossEvent.hitsPerHole));
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(barX, barY, barW, 12);
      ctx.fillStyle = '#ffb74d';
      ctx.fillRect(barX, barY, barW * hpRatio, 12);
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.strokeRect(barX, barY, barW, 12);
      ctx.restore();
    }

    // 現在対応中のフェーズの内容文を、フェードイン・フェードアウトしながら表示する
    const phaseDef = midBossPhaseDefs[currentIndex];
    if (phaseDef && midBossEvent.phaseTextAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = midBossEvent.phaseTextAlpha;
      const panelW = 420, panelH = 62;
      const panelX = canvas.width / 2 - panelW / 2;
      const panelY = geo.y + geo.height + 48;
      ctx.fillStyle = 'rgba(40, 30, 10, 0.75)';
      ctx.fillRect(panelX, panelY, panelW, panelH);
      ctx.strokeStyle = '#ffb74d';
      ctx.lineWidth = 2;
      ctx.strokeRect(panelX, panelY, panelW, panelH);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe0b2';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(
        `${midBossPhaseNumberIcons[currentIndex] || currentIndex + 1} ${phaseDef.name}`,
        canvas.width / 2, panelY + 22
      );
      ctx.fillStyle = '#fff3e0';
      ctx.font = '13px sans-serif';
      ctx.fillText(phaseDef.info, canvas.width / 2, panelY + 44);
      ctx.textAlign = 'left';
      ctx.restore();
    }
  }
}

// 時刻の端数も使い、1時間ごとの段差ではなく滑らかに明暗を変える。
function getVisualGameHour() {
  const hourProgress = Math.max(0, Math.min(1, (gameClockMs - lastHourTime) / hourMs));
  return currentHour + hourProgress;
}

// 朝(dayStartHour)を1倍、終業時刻(dayEndHour)ごろをtimeOfDayFatigueMultiplierMax倍として、
// 夕方・夜になるほど脳疲労がたまりやすくなる倍率を返す（残業中はさらに少し伸びる）
function getTimeOfDayFatigueMultiplier() {
  const visualHour = getVisualGameHour();
  const progress = Math.max(0, Math.min(1.3, (visualHour - dayStartHour) / (dayEndHour - dayStartHour)));
  return 1 + progress * (timeOfDayFatigueMultiplierMax - 1);
}

// 2つの16進カラーを割合に応じて混ぜ、関係性の連続的な色変化に使う。
function mixHexColors(fromColor, toColor, ratio) {
  const t = Math.max(0, Math.min(1, ratio));
  const from = parseInt(fromColor.slice(1), 16);
  const to = parseInt(toColor.slice(1), 16);
  const fromRgb = [(from >> 16) & 255, (from >> 8) & 255, from & 255];
  const toRgb = [(to >> 16) & 255, (to >> 8) & 255, to & 255];
  const mixed = fromRgb.map((value, index) =>
    Math.round(value + (toRgb[index] - value) * t));
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

// mixHexColorsと同様の補間だが、任意の透過度（alpha）付きのrgba()文字列で返す
function mixHexColorsRgba(fromColor, toColor, ratio, alpha) {
  const t = Math.max(0, Math.min(1, ratio));
  const from = parseInt(fromColor.slice(1), 16);
  const to = parseInt(toColor.slice(1), 16);
  const fromRgb = [(from >> 16) & 255, (from >> 8) & 255, from & 255];
  const toRgb = [(to >> 16) & 255, (to >> 8) & 255, to & 255];
  const mixed = fromRgb.map((value, index) =>
    Math.round(value + (toRgb[index] - value) * t));
  return `rgba(${mixed[0]}, ${mixed[1]}, ${mixed[2]}, ${alpha})`;
}

// 自機・同僚の下に表示する、SAN・寿命・脳疲労の小さなステータスバー
function drawMiniStatBars(centerX, topY, stats) {
  const barWidth = 44, barHeight = 4, gap = 2;
  ctx.save();
  stats.forEach((stat, i) => {
    const y = topY + i * (barHeight + gap);
    const ratio = Math.max(0, Math.min(1, stat.value / stat.max));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(centerX - barWidth / 2, y, barWidth, barHeight);
    ctx.fillStyle = stat.color;
    ctx.fillRect(centerX - barWidth / 2, y, barWidth * ratio, barHeight);
  });
  ctx.restore();
}

// 「ファイヤーウォール」の効果が残っている間、対象の周りに点線の破魔円を表示し、残り回数をバッジで示す
function drawBarrierShield(x, y, radius, charges) {
  if (charges <= 0) return;
  const pulse = 0.5 + 0.5 * Math.sin(gameClockMs / 130);
  const shieldRadius = radius * 2.1 + pulse * 3;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, shieldRadius, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(179, 157, 219, ${0.55 + pulse * 0.25})`;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 6]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#e1bee7';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`×${charges}`, x, y - shieldRadius - 10);
  ctx.restore();
}

// 残機を使って気絶し、復活を待っている間、頭上でぐるぐる回る星（暫定の簡易エフェクト）を描く
function drawReviveStars(centerX, centerY, entityRadius) {
  const starCount = 3;
  const orbitRadiusX = entityRadius + 14;
  const orbitRadiusY = orbitRadiusX * 0.4;
  ctx.save();
  ctx.font = 'bold 16px "Segoe UI Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < starCount; i++) {
    const starAngle = gameClockMs / 250 + (i * Math.PI * 2 / starCount);
    const sx = centerX + Math.cos(starAngle) * orbitRadiusX;
    const sy = centerY + Math.sin(starAngle) * orbitRadiusY;
    ctx.fillText('⭐', sx, sy);
  }
  ctx.restore();
}

// 描き終えた1フレーム全体（文字・アイコン含む）を、横スライスごとに正弦波でずらして歪ませる。
// 文字が判読できる程度になるよう、amplitudeは小さめの値を渡すこと。
function applyScreenDistortion(amplitude) {
  if (amplitude <= 0) return;
  distortionCtx.clearRect(0, 0, distortionCanvas.width, distortionCanvas.height);
  distortionCtx.drawImage(canvas, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const sliceHeight = 4;
  for (let y = 0; y < canvas.height; y += sliceHeight) {
    const offsetX = Math.sin(y * 0.06 + gameClockMs / 220) * amplitude;
    ctx.drawImage(distortionCanvas, 0, y, canvas.width, sliceHeight, offsetX, y, canvas.width, sliceHeight);
  }
}

// ===== 寿命が50を切ってから0に近づくにつれて強くなる、画面端のひび割れ・暗転エフェクト =====
const lifespanCrackWarningThreshold = 50; // これ以下になると効果が始まる
// ひび割れの形はあらかじめ決めておき、寿命が減るにつれて本数・長さだけが伸びていくようにする
const lifespanCracks = (() => {
  const cracks = [];
  const count = 14;
  for (let i = 0; i < count; i++) {
    const edge = i % 4; // 0:上 1:右 2:下 3:左から伸びる
    let x, y, dirX, dirY;
    if (edge === 0) { x = Math.random() * canvas.width; y = 0; dirX = (Math.random() - 0.5) * 0.6; dirY = 1; }
    else if (edge === 1) { x = canvas.width; y = Math.random() * canvas.height; dirX = -1; dirY = (Math.random() - 0.5) * 0.6; }
    else if (edge === 2) { x = Math.random() * canvas.width; y = canvas.height; dirX = (Math.random() - 0.5) * 0.6; dirY = -1; }
    else { x = 0; y = Math.random() * canvas.height; dirX = 1; dirY = (Math.random() - 0.5) * 0.6; }
    // ガラスが割れたようなジグザグの折れ線を、あらかじめセグメント列として生成しておく
    const segments = [];
    let cx = x, cy = y;
    const segCount = 5 + Math.floor(Math.random() * 4);
    const segLength = 20 + Math.random() * 14;
    const baseAngle = Math.atan2(dirY, dirX);
    for (let s = 0; s < segCount; s++) {
      const angle = baseAngle + (Math.random() - 0.5) * 1.1;
      cx += Math.cos(angle) * segLength;
      cy += Math.sin(angle) * segLength;
      segments.push({ x: cx, y: cy });
    }
    cracks.push({ x, y, segments });
  }
  return cracks;
})();

function drawLifespanCrackEffect() {
  if (lifespan >= lifespanCrackWarningThreshold) return;
  const ratio = Math.max(0, Math.min(1, 1 - lifespan / lifespanCrackWarningThreshold));
  if (ratio <= 0) return;

  ctx.save();
  // 画面端からじわじわ暗くなっていくビネット
  const vignette = ctx.createRadialGradient(
    canvas.width / 2, canvas.height / 2, canvas.height * 0.25,
    canvas.width / 2, canvas.height / 2, canvas.height * 0.75
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, `rgba(0, 0, 0, ${ratio * 0.65})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 寿命が減るほど、ひびの本数が増え、既存のひびもさらに伸びていく
  const totalProgress = ratio * lifespanCracks.length;
  const visibleCount = Math.ceil(totalProgress);
  // 本物の画面割れに見えすぎないよう、約1秒周期で透過度をゆらす
  const crackPulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(gameClockMs * (2 * Math.PI / 1000)));
  ctx.strokeStyle = `rgba(15, 15, 20, ${(0.55 + ratio * 0.4) * crackPulse})`;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 3;
  for (let i = 0; i < visibleCount; i++) {
    const crack = lifespanCracks[i];
    const growth = Math.max(0, Math.min(1, totalProgress - i));
    const segCount = Math.max(1, Math.round(crack.segments.length * growth));
    ctx.beginPath();
    ctx.moveTo(crack.x, crack.y);
    for (let s = 0; s < segCount; s++) {
      ctx.lineTo(crack.segments[s].x, crack.segments[s].y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// 力尽きた演出中、通常のゲーム画面（frozenのまま描かれる背景・敵・同僚など）の上に重ねる効果。
// freeze：まだ何も起きない静かな静止／shake：振動・明滅しながら徐々に暗くなる／
// vanish：自機の姿（既に専用画像に差し替え済み）が点滅しながら消えていく間、画面はshake終了時の暗さを維持する／
// fadeOut：画面全体が黒くフェードアウトしきる
function drawDeathSequenceOverlay() {
  if (deathSequence.phase === 'freeze') {
    canvas.style.transform = '';
    return;
  }
  if (deathSequence.phase === 'shake') {
    const p = Math.min(1, deathSequence.phaseTimerMs / deathSequenceShakeDurationMs);
    const flashOn = Math.sin(gameClockMs / 40) > 0;
    ctx.fillStyle = flashOn ? `rgba(180, 0, 0, ${0.2 + p * 0.3})` : `rgba(0, 0, 0, ${0.15 + p * 0.3})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = (Math.random() - 0.5) * 10 * p;
    const shakeY = (Math.random() - 0.5) * 10 * p;
    canvas.style.transform = `translate(${shakeX}px, ${shakeY}px)`;
    return;
  }
  canvas.style.transform = '';
  if (deathSequence.phase === 'vanish') {
    // shake終了時点の暗さ（黒・赤の明滅が収まりきった後の状態）を維持しておく
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (deathSequence.phase === 'fadeOut') {
    const p = Math.min(1, deathSequence.phaseTimerMs / deathSequenceFadeOutDurationMs);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.45 + p * 0.55})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

// HUD用プロフィール区画。選択した絵文字を仮の顔イラストとして使う。
function drawHudProfilePanel(x, y, width, height, title, icon, accentColor, statLines, inactive = false, dangerLevel = 0, iconImage = null, portraitRadius = 23, rankBadge = null) {
  ctx.save();
  ctx.fillStyle = 'rgba(7, 12, 22, 0.34)';
  ctx.fillRect(x, y, width, height);

  const portraitCenterX = x + width / 2;
  const portraitCenterY = y + portraitRadius + 7;
  const clampedDangerLevel = Math.max(0, Math.min(1, dangerLevel));
  const portraitFrameColor = inactive
    ? '#757575'
    : mixHexColors(accentColor, '#ff2338', clampedDangerLevel);
  ctx.beginPath();
  ctx.arc(portraitCenterX, portraitCenterY, portraitRadius, 0, Math.PI * 2);
  ctx.fillStyle = inactive ? 'rgba(90, 90, 90, 0.4)' : 'rgba(255, 255, 255, 0.07)';
  ctx.fill();

  ctx.globalAlpha = inactive ? 0.45 : 1;
  if (iconImage && iconImage.complete && iconImage.naturalWidth > 0) {
    // 画像アイコンは円形にクリップして中央に収める
    ctx.save();
    ctx.beginPath();
    ctx.arc(portraitCenterX, portraitCenterY, portraitRadius, 0, Math.PI * 2);
    ctx.clip();
    const imgSize = portraitRadius * 2;
    ctx.drawImage(iconImage, portraitCenterX - imgSize / 2, portraitCenterY - imgSize / 2, imgSize, imgSize);
    ctx.restore();
  } else {
    ctx.font = '32px "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'white';
    ctx.fillText(icon || '—', portraitCenterX, portraitCenterY + 1);
  }
  ctx.globalAlpha = 1;

  ctx.beginPath();
  ctx.arc(portraitCenterX, portraitCenterY, portraitRadius, 0, Math.PI * 2);
  ctx.strokeStyle = portraitFrameColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // 役職ランクのバッジ：ポートレートの円の端にかかるように「LV 〇〇」を表示し、その下に少し小さく役職名を表示する
  if (rankBadge) {
    const badgeCenterX = portraitCenterX + portraitRadius * 0.72;
    const badgeCenterY = portraitCenterY + portraitRadius * 0.72;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lvText = `LV ${rankBadge.rank}`;
    ctx.font = 'bold 13px sans-serif';
    const lvTextWidth = ctx.measureText(lvText).width;
    const badgeW = lvTextWidth + 10;
    const badgeH = 16;
    ctx.fillStyle = 'rgba(20, 24, 32, 0.85)';
    ctx.strokeStyle = '#ffd54f';
    ctx.lineWidth = 1.5;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(badgeCenterX - badgeW / 2, badgeCenterY - badgeH / 2, badgeW, badgeH, 8);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(badgeCenterX - badgeW / 2, badgeCenterY - badgeH / 2, badgeW, badgeH);
      ctx.strokeRect(badgeCenterX - badgeW / 2, badgeCenterY - badgeH / 2, badgeW, badgeH);
    }
    ctx.fillStyle = '#ffd54f';
    ctx.fillText(lvText, badgeCenterX, badgeCenterY);
    ctx.font = 'bold 9px sans-serif';
    ctx.fillStyle = '#fff3c4';
    ctx.fillText(rankBadge.roleName, badgeCenterX, badgeCenterY + badgeH / 2 + 8);
    ctx.restore();
  }

  const titleY = portraitCenterY + portraitRadius + 8;
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = inactive ? '#9e9e9e' : accentColor;
  ctx.fillText(title, portraitCenterX, titleY);

  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  statLines.forEach((line, index) => {
    ctx.fillStyle = line.color || (inactive ? '#9e9e9e' : '#eceff1');
    ctx.fillText(line.text, x + 9, titleY + 19 + index * 14);
  });
  ctx.restore();
}

// ===== ポーズ画面：自分・同僚の状態、バフ・デバフ、習得済みスキルをまとめて表示する =====
function getPlayerActiveEffectsList() {
  const list = [];
  if (invincible) list.push(`無敵時間 ${(invincibleTimer / 1000).toFixed(1)}s`);
  if (stunned) list.push(`行動不能（stun） ${(stunTimer / 1000).toFixed(1)}s`);
  if (friendlyFireInvincibleTimer > 0) list.push(`誤射無敵 ${(friendlyFireInvincibleTimer / 1000).toFixed(1)}s`);
  if (playerBarrierCharges > 0) list.push(`ファイヤーウォール 残${playerBarrierCharges}回`);
  if (energyDrinkBuffTimerMs > 0) list.push(`栄養ドリンク効果 ${(energyDrinkBuffTimerMs / 1000).toFixed(1)}s`);
  if (coffeeBuffTimerMs > 0) list.push(`コーヒー効果 ${(coffeeBuffTimerMs / 1000).toFixed(1)}s`);
  if (coffeeStunImmunityTimerMs > 0) list.push(`stun回避中（コーヒー） ${(coffeeStunImmunityTimerMs / 1000).toFixed(1)}s`);
  if (fixedEnemyControlsReversedTimerMs > 0) list.push(`操作反転（XSS） ${(fixedEnemyControlsReversedTimerMs / 1000).toFixed(1)}s`);
  if (fixedEnemyMoveHijackTimerMs > 0) list.push(`移動乗っ取り ${(fixedEnemyMoveHijackTimerMs / 1000).toFixed(1)}s`);
  if (fixedEnemyMoveSpeedDebuffTimerMs > 0) list.push(`移動速度低下 ${(fixedEnemyMoveSpeedDebuffTimerMs / 1000).toFixed(1)}s`);
  if (fixedEnemyFireRateDebuffTimerMs > 0) list.push(`発射間隔増加 ${(fixedEnemyFireRateDebuffTimerMs / 1000).toFixed(1)}s`);
  if (fixedEnemyFireLockTimerMs > 0) list.push(`攻撃不能 ${(fixedEnemyFireLockTimerMs / 1000).toFixed(1)}s`);
  if (fixedEnemyRecoveryDisabledTimerMs > 0) list.push(`疲労回復停止 ${(fixedEnemyRecoveryDisabledTimerMs / 1000).toFixed(1)}s`);
  if (fixedEnemyVisionObscuredTimerMs > 0) list.push(`視界不良 ${(fixedEnemyVisionObscuredTimerMs / 1000).toFixed(1)}s`);
  if (dreamMemorySave.upgrades.invincibleTest >= 1) list.push('無敵（テスト用）常時有効');
  if (dreamMemorySave.upgrades.betaMode >= 1) list.push('β版設定 常時有効（中ボス・ラスボスに最低5発で撃破）');
  if (fullAutoModeEnabled) list.push('フルオートモード ON');
  else if (autoFireEnabled) list.push('自動攻撃モード ON');
  if (list.length === 0) list.push('（なし）');
  return list;
}

function getPartnerActiveEffectsList() {
  if (!partner.active) return ['（同僚は不在）'];
  const list = [];
  if (partner.friendlyFireInvincibleTimer > 0) list.push(`誤射無敵 ${(partner.friendlyFireInvincibleTimer / 1000).toFixed(1)}s`);
  if (partner.barrierCharges > 0) list.push(`ファイヤーウォール 残${partner.barrierCharges}回`);
  if (partner.hijackedTimerMs > 0) list.push(`行動乗っ取り ${(partner.hijackedTimerMs / 1000).toFixed(1)}s`);
  if (partner.fatigueResting) list.push('疲労のため攻撃を控えている');
  if (list.length === 0) list.push('（なし）');
  return list;
}

function getAcquiredSpecialSkillsList() {
  return specialSkills
    .filter(s => (specialSkillLevels.get(s.id) || 0) > 0)
    .map(s => `${s.name} Lv.${specialSkillLevels.get(s.id)}`);
}

function getAcquiredRankSkillsList() {
  return rankSkillDefs.filter(s => rankSkillLevels.has(s.id)).map(s => s.name);
}

// 行数が多くなっても縦にあふれないよう、指定した高さで折り返して次の列へ流し込む
function drawFlowList(x, y, colWidth, maxHeight, lines, lineHeight = 15) {
  const maxRows = Math.max(1, Math.floor(maxHeight / lineHeight));
  let col = 0, row = 0;
  lines.forEach(line => {
    if (row >= maxRows) { row = 0; col++; }
    ctx.fillText(line, x + col * colWidth, y + row * lineHeight);
    row++;
  });
}

// ===== ゲーム画面の描画 =====
// 毎フレーム、現在のゲーム状態をCanvasへ描く
function draw() {
  // タップ可能な矩形を、今フレームの表示内容に合わせて作り直す
  uiButtons = [];
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 「目覚め」で夢ルートに入った直後の「24:00」演出中は、専用の画面のみを表示する
  if (dreamBossIntroSequence) {
    drawDreamBossIntroSequence();
    return;
  }

  // 目覚めエンド（真エンド・同僚生存）到達後の専用タイトル画面（とそのエンディングリスト）
  if (trueEndTitleScreenActive) {
    if (trueEndEndingListActive) {
      drawTrueEndEndingListScreen();
    } else {
      drawTrueEndTitleScreen();
    }
    return;
  }

  // 「就活を始める」を押した後：ホワイトアウト→画像表示→フェードアウトでゲーム終了、の専用画面のみを表示する
  if (jobHuntEndSequence) {
    drawJobHuntEndSequence();
    return;
  }

  // ラスボス撃破演出：本体の退場（'retreat'）は通常の画面に重ねて描くが、
  // それ以降（背景復帰・白フェード・真エンド）は専用の画面に切り替える
  if (bossFinalSequence && bossFinalSequence.phase !== 'retreat') {
    drawBossFinalTransition();
    return;
  }

  // ノーマルルート終了時の負けイベント戦闘：静止→暗転までは専用の画面、降臨後の戦闘（partnerLossSlowmoを含む）は
  // 通常の描画に任せ、同僚が完全に消える演出（partnerVanish）は専用の画面に切り替える
  if (normalEndSequence && (normalEndSequence.phase === 'freeze' || normalEndSequence.phase === 'shake')) {
    drawNormalEndFreezeScene();
    return;
  }
  if (normalEndSequence && normalEndSequence.phase === 'partnerVanish') {
    drawNormalEndPartnerVanishScene();
    return;
  }
  if (normalEndSequence && (normalEndSequence.phase === 'fadeOut' || normalEndSequence.phase === 'endScreen' ||
      normalEndSequence.phase === 'endScreenFadeOut')) {
    drawNormalEndEndingScreen();
    return;
  }

  // アイコン選択直後のひとことメッセージ演出（フェードイン→フェードアウト）
  if (iconGreetingPhase) {
    drawSetupBackground();
    const alpha = iconGreetingPhase === 'fadein'
      ? Math.max(0, Math.min(1, iconGreetingTimer / iconGreetingFadeInMs))
      : iconGreetingPhase === 'fadeout'
        ? Math.max(0, Math.min(1, iconGreetingTimer / iconGreetingFadeMs))
        : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    if (iconGreetingImage && iconGreetingImage.complete && iconGreetingImage.naturalWidth > 0) {
      const imgSize = 160;
      ctx.drawImage(iconGreetingImage, canvas.width / 2 - imgSize / 2, canvas.height / 2 - 20 - imgSize / 2, imgSize, imgSize);
    } else {
      ctx.font = '96px "Segoe UI Emoji", sans-serif';
      ctx.fillStyle = 'white';
      ctx.fillText(iconGreetingIcon, canvas.width / 2, canvas.height / 2 - 20);
    }
    ctx.font = 'bold 26px sans-serif';
    ctx.fillStyle = '#ffe082';
    ctx.fillText(iconGreetingText, canvas.width / 2, canvas.height / 2 + 60);
    ctx.restore();
    ctx.textAlign = 'left';
    return;
  }

  // アドベンチャーパートに入る前に一度だけ表示する統計情報画面：前回のアドベンチャーパートが終わってから
  // （初回は初日から）今回に入るまでの、昇進・習得スキル・倒した脅威（固定敵）・倒した仕事を一覧表示する。
  // 「会話に進む」を押すとアドベンチャーパート本編（会話）が始まる
  if (adventureStatsSummaryActive) {
    drawSetupBackground();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const upcomingRunNumber = adventureRunCount + 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe082';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('統計情報', canvas.width / 2, 42);
    ctx.fillStyle = '#cfd8dc';
    ctx.font = '15px sans-serif';
    const periodLabel = upcomingRunNumber === 1
      ? '（初日から今回のアドベンチャーパートに入るまでの記録）'
      : `（前回のアドベンチャーパートから、第${upcomingRunNumber}回のアドベンチャーパートに入るまでの記録）`;
    ctx.fillText(periodLabel, canvas.width / 2, 66);
    ctx.textAlign = 'left';

    const colLeftX = 50, colRightX = 420;
    let leftY = 104, rightY = 104;

    leftY = drawAdventureStatsSection(colLeftX, leftY, '■ 昇進の状況',
      adventureStatsTracker.promotions, '#ffd54f') + 18;
    const fixedEnemyLines = Object.entries(adventureStatsTracker.fixedEnemiesDefeated)
      .map(([name, count]) => `${name} ×${count}`);
    drawAdventureStatsSection(colLeftX, leftY, '■ 倒した脅威（固定敵）', fixedEnemyLines, '#ff8a65');

    rightY = drawAdventureStatsSection(colRightX, rightY, '■ 習得したスキル',
      adventureStatsTracker.skillsAcquired, '#ce93d8') + 18;
    const jobEntries = Object.entries(adventureStatsTracker.jobsDefeated);
    const totalJobsDefeated = jobEntries.reduce((sum, [, count]) => sum + count, 0);
    const jobLines = jobEntries.map(([name, count]) => `${name} ×${count}`);
    drawAdventureStatsSection(colRightX, rightY, `■ 倒した仕事（合計 ${totalJobsDefeated} 件）`, jobLines, '#69f0ae');

    const btnW = 240, btnH = 50;
    drawUiButton(canvas.width / 2 - btnW / 2, canvas.height - 80, btnW, btnH,
      '会話に進む', proceedFromAdventureStatsSummary,
      { fillStyle: 'rgba(74, 20, 140, 0.6)', strokeStyle: '#ce93d8', font: 'bold 18px sans-serif' });
    return;
  }

  // 前回と同じ自機・同僚で始めた時、DAY1が始まる前に挟む短い再会シーン
  // （同僚アイコンが暗くなる演出 → 地の文（1行ずつ）→ 自機のセリフ → 締めの地の文（1行ずつ）、の順に進む）
  if (reunionSceneActive) {
    drawSetupBackground();
    const imgSize = 150;
    const imgX = canvas.width / 2 - imgSize / 2;
    const imgY = 60;
    const partnerImg = partnerIconImageElements[selectedPartnerIcon];
    if (partnerImg && partnerImg.complete && partnerImg.naturalWidth > 0) {
      ctx.drawImage(partnerImg, imgX, imgY, imgSize, imgSize);
    }
    // 'dim'の間は徐々に、'line'以降は演出がかかりきった状態を保つ
    const toneProgress = reunionScenePhase === 'dim'
      ? 1 - Math.max(0, reunionSceneDimTimer / reunionSceneDimDurationMs)
      : 1;
    if (reunionSceneToneDirection === 'bright') {
      // 関係性が良好なほど、アイコンの周りが輝くようなエフェクトにする
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const cx = imgX + imgSize / 2;
      const cy = imgY + imgSize / 2;
      const glowRadius = imgSize * 0.75;
      const glowAlpha = toneProgress * 0.9 * reunionSceneToneIntensity;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
      gradient.addColorStop(0, `rgba(255, 250, 210, ${glowAlpha})`);
      gradient.addColorStop(1, 'rgba(255, 250, 210, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (reunionSceneToneDirection === 'dark') {
      // 関係性が悪いほど、アイコンが暗く沈んだようなエフェクトにする
      ctx.fillStyle = `rgba(0, 0, 0, ${toneProgress * 0.45 * reunionSceneToneIntensity})`;
      ctx.fillRect(imgX, imgY, imgSize, imgSize);
    }

    ctx.textAlign = 'center';
    const currentDisplayText = reunionSceneCurrentText.slice(0, reunionSceneCurrentRevealedCount);
    if (reunionScenePhase === 'line') {
      // 自機のセリフだけは色を変えて強調する
      ctx.fillStyle = '#ffe082';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(currentDisplayText, canvas.width / 2, 270);
    } else if (reunionScenePhase === 'intro' || reunionScenePhase === 'paragraph') {
      // 地の文は1行だけを中央に表示し、クリックのたびに次の行へ切り替わる
      ctx.fillStyle = '#e0e0e0';
      ctx.font = '16px sans-serif';
      ctx.fillText(currentDisplayText, canvas.width / 2, 270);
    }

    if (reunionScenePhase === 'intro' || reunionScenePhase === 'line' || reunionScenePhase === 'paragraph') {
      ctx.fillStyle = '#cfd8dc';
      ctx.font = '14px sans-serif';
      ctx.fillText('クリック / タップで続ける', canvas.width / 2, canvas.height - 40);
    }
    ctx.textAlign = 'left';
    return;
  }

  if (setupStep === 'gender') {
    drawSetupBackground();
    drawUiButton(10, 10, 90, 32, '＜ 戻る', backToTitleFromGenderSelect,
      { fillStyle: 'rgba(60, 60, 60, 0.6)', strokeStyle: '#90a4ae', font: 'bold 15px sans-serif' });
    ctx.fillStyle = 'white';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('操作キャラを選んでください', canvas.width / 2, 110);
    ctx.textAlign = 'left';

    const cardW = 220, cardH = 260, gap = 40;
    const totalWidth = genderChoices.length * cardW + (genderChoices.length - 1) * gap;
    const startX = canvas.width / 2 - totalWidth / 2;
    const cardY = 170;
    const lastRunForSelect = dreamMemorySave.lastRun;
    genderChoices.forEach((choice, i) => {
      const cardX = startX + i * (cardW + gap);
      const isHovered = mousePosition.x >= cardX && mousePosition.x <= cardX + cardW &&
        mousePosition.y >= cardY && mousePosition.y <= cardY + cardH;
      const isLastPicked = !!(lastRunForSelect && lastRunForSelect.playerGender === choice.id);
      ctx.save();
      ctx.fillStyle = isHovered ? 'rgba(156, 107, 230, 0.55)' : 'rgba(103, 58, 183, 0.35)';
      ctx.fillRect(cardX, cardY, cardW, cardH);
      ctx.strokeStyle = isHovered ? '#f3e5f5' : '#ce93d8';
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.strokeRect(cardX, cardY, cardW, cardH);
      const img = genderImageElements[choice.id];
      if (img && img.complete && img.naturalWidth > 0) {
        const imgSize = 180;
        ctx.drawImage(img, cardX + (cardW - imgSize) / 2, cardY + 16, imgSize, imgSize);
      }
      ctx.fillStyle = 'white';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${i + 1}. ${choice.label}`, cardX + cardW / 2, cardY + cardH - 20);
      ctx.textAlign = 'left';
      ctx.restore();
      // 前回選んだキャラには、金色に淡く明滅する枠と「前回選択」の札を重ねて分かるようにする
      if (isLastPicked) {
        ctx.save();
        const glow = 8 + Math.sin(Date.now() / 220) * 4;
        ctx.shadowColor = '#ffd54f';
        ctx.shadowBlur = glow;
        ctx.strokeStyle = '#ffd54f';
        ctx.lineWidth = 3;
        ctx.strokeRect(cardX - 3, cardY - 3, cardW + 6, cardH + 6);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffd54f';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('前回選択', cardX + cardW / 2, cardY - 10);
        ctx.textAlign = 'left';
        ctx.restore();
      }
      uiButtons.push({ x: cardX, y: cardY, w: cardW, h: cardH, action: () => selectGender(choice.id) });
    });

    ctx.fillStyle = '#cfd8dc';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('数字キー 1〜2 / タップで選択', canvas.width / 2, cardY + cardH + 50);
    ctx.textAlign = 'left';

    // 前回プレイした自機・同僚の組み合わせが記録されている時だけ、選択を省略して進めるボタンを出す
    const hasLastRunCombo = !!(dreamMemorySave.lastRun && dreamMemorySave.lastRun.partnerIcon);
    if (hasLastRunCombo) {
      const resumeBtnW = 260, resumeBtnH = 40;
      drawUiButton(canvas.width / 2 - resumeBtnW / 2, cardY + cardH + 74, resumeBtnW, resumeBtnH,
        '夢と同じ設定で進める', startWithLastRunSettings,
        { fillStyle: 'rgba(20, 70, 90, 0.55)', strokeStyle: '#80deea', font: 'bold 15px sans-serif' });
    }
    return;
  }

  if (setupStep === 'partner-icon') {
    drawSetupBackground();
    drawUiButton(10, 10, 90, 32, '＜ 戻る', backToGenderSelectFromPartnerSelect,
      { fillStyle: 'rgba(60, 60, 60, 0.6)', strokeStyle: '#90a4ae', font: 'bold 15px sans-serif' });
    ctx.fillStyle = 'white';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('同僚を選んでください', canvas.width / 2, 90);
    ctx.textAlign = 'left';

    const cols = 6;
    const cellSize = 88, gap = 14;
    const rows = Math.ceil(partnerIconChoices.length / cols);
    const totalWidth = cols * cellSize + (cols - 1) * gap;
    const startX = canvas.width / 2 - totalWidth / 2;
    const startY = 140;
    const lastRunForPartnerSelect = dreamMemorySave.lastRun;
    partnerIconChoices.forEach((id, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cellX = startX + col * (cellSize + gap);
      const cellY = startY + row * (cellSize + gap);
      const isHovered = mousePosition.x >= cellX && mousePosition.x <= cellX + cellSize &&
        mousePosition.y >= cellY && mousePosition.y <= cellY + cellSize;
      const isLastPicked = !!(lastRunForPartnerSelect && lastRunForPartnerSelect.partnerIcon === id);
      ctx.save();
      ctx.fillStyle = isHovered ? 'rgba(156, 107, 230, 0.55)' : 'rgba(103, 58, 183, 0.35)';
      ctx.fillRect(cellX, cellY, cellSize, cellSize);
      const img = partnerIconImageElements[id];
      if (img && img.complete && img.naturalWidth > 0) {
        // 枠のサイズは変えず、画像だけ枠より一回り大きく中央に描画する
        const imgSize = cellSize + 8;
        const imgOffset = (cellSize - imgSize) / 2;
        ctx.drawImage(img, cellX + imgOffset, cellY + imgOffset, imgSize, imgSize);
      }
      // 枠は画像より後に描き直し、はみ出した部分の上からでも見えるようにする
      ctx.strokeStyle = isHovered ? '#f3e5f5' : '#ce93d8';
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.strokeRect(cellX, cellY, cellSize, cellSize);
      ctx.restore();
      // 前回選んだ同僚には、金色に淡く明滅する枠と星印を重ねて分かるようにする
      if (isLastPicked) {
        ctx.save();
        const glow = 6 + Math.sin(Date.now() / 220) * 3;
        ctx.shadowColor = '#ffd54f';
        ctx.shadowBlur = glow;
        ctx.strokeStyle = '#ffd54f';
        ctx.lineWidth = 3;
        ctx.strokeRect(cellX - 3, cellY - 3, cellSize + 6, cellSize + 6);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffd54f';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('★', cellX + cellSize / 2, cellY - 8);
        ctx.textAlign = 'left';
        ctx.restore();
      }
      uiButtons.push({ x: cellX, y: cellY, w: cellSize, h: cellSize, action: () => selectPartnerIcon(id) });
    });

    const gridBottom = startY + rows * (cellSize + gap) - gap;
    const noneBtnW = 260, noneBtnH = 50;
    drawUiButton(canvas.width / 2 - noneBtnW / 2, gridBottom + 30, noneBtnW, noneBtnH,
      '同僚なし (0)', () => selectPartnerIcon(null),
      { fillStyle: 'rgba(60, 60, 60, 0.6)', strokeStyle: '#90a4ae' });

    ctx.fillStyle = '#cfd8dc';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('タップで選択（キー1〜6でも選択可）　0キーで同僚なし',
      canvas.width / 2, gridBottom + 30 + noneBtnH + 30);
    ctx.textAlign = 'left';
    return;
  }

  if (dreamMemoryShopActive && !specialSkillPreShopActive) {
    drawSetupBackground();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd54f';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('夢の記憶ポイントで強化', canvas.width / 2, 34);
    ctx.fillStyle = '#e1bee7';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`保有ポイント: ${dreamMemorySave.points}`, canvas.width / 2, 56);
    ctx.textAlign = 'left';

    // これまで費やしたポイントを全額払い戻し、レベルを0に戻して振り分け直せるボタン
    drawUiButton(canvas.width - 138, 12, 126, 30, '思い直す', respecDreamMemoryUpgrades,
      { fillStyle: 'rgba(84, 30, 30, 0.55)', strokeStyle: '#ef9a9a', font: 'bold 13px sans-serif' });

    // デバッグ用：押すたびに保有ポイントを1増やす（テスト用のため恒久的な機能ではない）
    drawUiButton(canvas.width - 138 - 108, 12, 100, 30, 'ポイント付与',
      () => { dreamMemorySave.points += 1; saveDreamMemorySave(); },
      { fillStyle: 'rgba(20, 20, 60, 0.55)', strokeStyle: '#9fa8da', font: 'bold 13px sans-serif' });

    // 左上に、特殊スキル（マルチタスクAなど）を事前に強化できる専用ページへのボタンを配置する
    drawUiButton(12, 12, 150, 30, '特殊スキルの強化', () => { specialSkillPreShopActive = true; },
      { fillStyle: 'rgba(20, 90, 60, 0.55)', strokeStyle: '#80cbc4', font: 'bold 13px sans-serif' });

    // 項目数が多いため、2列に分けて見やすくする
    const cols = 2;
    const colGap = 16;
    const gridX = 40;
    const gridWidth = canvas.width - gridX * 2;
    const cellWidth = (gridWidth - colGap * (cols - 1)) / cols;
    const cellHeight = 76; // 説明文が2行になっても「強化」「1つ戻す」ボタンに被らないよう、縦に広めにとる
    const cellGap = 6;
    const gridStartY = 64;
    const rows = Math.ceil(dreamMemoryUpgradeDefs.length / cols);

    dreamMemoryUpgradeDefs.forEach((def, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const cellX = gridX + col * (cellWidth + colGap);
      const cellY = gridStartY + row * (cellHeight + cellGap);

      const level = dreamMemorySave.upgrades[def.id];
      const maxLevel = getDreamMemoryUpgradeMaxLevel(def);
      const maxed = level >= maxLevel;
      const cost = maxed ? null : getDreamMemoryUpgradeCost(def, level);
      const affordable = !maxed && dreamMemorySave.points >= cost;

      // レベルが上がるほど、MAX時の輝く色（金色）へ段階的に色を近づける
      // （MAXレベルが1のスキルは、購入した瞬間に1段階でMAXの色へ到達する）
      const levelRatio = level > 0 ? level / maxLevel : 0;
      const cellBorderColor = level > 0 ? mixHexColors('#ce93d8', '#ffd700', levelRatio) : '#616161';
      const cellBgColor = level > 0
        ? mixHexColorsRgba('#67328a', '#8a6a10', levelRatio, 0.30)
        : 'rgba(60, 60, 60, 0.35)';

      ctx.fillStyle = cellBgColor;
      ctx.fillRect(cellX, cellY, cellWidth, cellHeight);
      if (maxed) {
        // MAX達成：縁が輝き、光沢（上部のハイライト）が乗る
        ctx.save();
        ctx.shadowColor = '#ffe082';
        ctx.shadowBlur = 12;
        ctx.strokeStyle = cellBorderColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(cellX, cellY, cellWidth, cellHeight);
        ctx.restore();
        const gloss = ctx.createLinearGradient(cellX, cellY, cellX, cellY + cellHeight * 0.55);
        gloss.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
        gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gloss;
        ctx.fillRect(cellX, cellY, cellWidth, cellHeight * 0.55);
      } else {
        ctx.strokeStyle = cellBorderColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(cellX, cellY, cellWidth, cellHeight);
      }

      const btnW = 100, btnH = 22;
      const btnX = cellX + cellWidth - btnW - 10;
      const btnY = cellY + cellHeight - btnH - 6;
      const revertBtnW = 54;
      const revertBtnX = btnX - revertBtnW - 6;
      const textMaxWidth = cellWidth - 20;

      // 「1つ戻す」：このスキルを1レベル下げ、そのレベル分のポイントを払い戻す（レベル0の間は押せない）
      if (level > 0) {
        drawUiButton(revertBtnX, btnY, revertBtnW, btnH, '1つ戻す',
          () => revertDreamMemoryUpgrade(def.id),
          { fillStyle: 'rgba(84, 30, 30, 0.55)', strokeStyle: '#ef9a9a', font: 'bold 11px sans-serif' });
      }

      ctx.fillStyle = maxed ? '#ffe082' : 'white';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`${def.label}  Lv.${level}/${maxLevel}`, cellX + 10, cellY + 14);
      ctx.fillStyle = '#cfd8dc';
      ctx.font = '11px sans-serif';
      // 現在のレベルに応じた「今の効果」を表示する（MAX後も、その時点の効果をそのまま表示し続ける）。
      // 未強化の間は、詳細な数値の代わりに「何がどう強化されるか」の簡単な説明を表示する
      const descText = level > 0 ? def.describeLevel(level) : `未強化：${def.preview}`;
      const descLines = wrapTextToWidth(descText, textMaxWidth).slice(0, 2);
      descLines.forEach((line, i) => {
        ctx.fillText(line, cellX + 10, cellY + 27 + i * 12);
      });

      if (maxed) {
        ctx.fillStyle = 'rgba(60, 60, 60, 0.6)';
        ctx.fillRect(btnX, btnY, btnW, btnH);
        ctx.strokeStyle = '#757575';
        ctx.lineWidth = 2;
        ctx.strokeRect(btnX, btnY, btnW, btnH);
        ctx.fillStyle = '#9e9e9e';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('MAX', btnX + btnW / 2, btnY + btnH / 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      } else {
        drawUiButton(btnX, btnY, btnW, btnH, `強化 (${cost}P)`,
          () => purchaseDreamMemoryUpgrade(def.id),
          affordable
            ? { fillStyle: 'rgba(103, 58, 183, 0.7)', strokeStyle: '#ce93d8', font: 'bold 12px sans-serif' }
            : { fillStyle: 'rgba(60, 60, 60, 0.5)', strokeStyle: '#616161', textColor: '#9e9e9e', font: 'bold 12px sans-serif' });
      }
    });

    const gridBottom = gridStartY + rows * (cellHeight + cellGap) - cellGap;
    const backBtnW = 200, backBtnH = 28;
    drawUiButton(canvas.width / 2 - backBtnW / 2, gridBottom + 8, backBtnW, backBtnH,
      '強化終了', () => { dreamMemoryShopActive = false; },
      { fillStyle: 'rgba(60, 60, 60, 0.6)', strokeStyle: '#90a4ae' });
    return;
  }

  if (specialSkillPreShopActive) {
    drawSetupBackground();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#80cbc4';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('特殊スキルの強化', canvas.width / 2, 32);
    ctx.fillStyle = '#e1bee7';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`保有ポイント: ${dreamMemorySave.points}`, canvas.width / 2, 52);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#cfd8dc';
    ctx.fillText('ここで上げたレベルは、次回プレイのDAY1から習得済みの状態で始まります', canvas.width / 2, 70);
    ctx.textAlign = 'left';

    drawUiButton(canvas.width - 138, 10, 126, 28, '思い直す', respecSpecialSkillPreLevels,
      { fillStyle: 'rgba(84, 30, 30, 0.55)', strokeStyle: '#ef9a9a', font: 'bold 12px sans-serif' });

    const cols = 3;
    const colGap = 12;
    const gridX = 24;
    const gridWidth = canvas.width - gridX * 2;
    const cellWidth = (gridWidth - colGap * (cols - 1)) / cols;
    const cellHeight = 66;
    const cellGap = 6;
    const gridStartY = 84;
    const rows = Math.ceil(specialSkills.length / cols);

    specialSkills.forEach((skill, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const cellX = gridX + col * (cellWidth + colGap);
      const cellY = gridStartY + row * (cellHeight + cellGap);

      const level = getSpecialSkillPreLevel(skill.id);
      const maxed = level >= skill.maxLevel;
      const cost = maxed ? null : dreamMemoryUpgradeCost(level);
      const affordable = !maxed && dreamMemorySave.points >= cost;

      const levelRatio = level > 0 ? level / skill.maxLevel : 0;
      const cellBorderColor = level > 0 ? mixHexColors('#80cbc4', '#ffd700', levelRatio) : '#616161';
      const cellBgColor = level > 0
        ? mixHexColorsRgba('#1b5e50', '#8a6a10', levelRatio, 0.30)
        : 'rgba(60, 60, 60, 0.35)';

      ctx.fillStyle = cellBgColor;
      ctx.fillRect(cellX, cellY, cellWidth, cellHeight);
      ctx.strokeStyle = cellBorderColor;
      ctx.lineWidth = maxed ? 2 : 1;
      ctx.strokeRect(cellX, cellY, cellWidth, cellHeight);

      const btnW = 74, btnH = 20;
      const btnX = cellX + cellWidth - btnW - 8;
      const btnY = cellY + cellHeight - btnH - 5;
      const revertBtnW = 44;
      const revertBtnX = btnX - revertBtnW - 5;
      const textMaxWidth = cellWidth - 16;

      // 「戻す」：このスキルの事前強化を1レベル下げ、そのレベル分のポイントを払い戻す（レベル0の間は押せない）
      if (level > 0) {
        drawUiButton(revertBtnX, btnY, revertBtnW, btnH, '戻す',
          () => revertSpecialSkillPreLevel(skill.id),
          { fillStyle: 'rgba(84, 30, 30, 0.55)', strokeStyle: '#ef9a9a', font: 'bold 10px sans-serif' });
      }

      ctx.fillStyle = maxed ? '#ffe082' : 'white';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`${skill.name} Lv.${level}/${skill.maxLevel}`, cellX + 8, cellY + 13);
      ctx.fillStyle = '#cfd8dc';
      ctx.font = '10px sans-serif';
      const descLines = wrapTextToWidth(skill.description, textMaxWidth).slice(0, 3);
      descLines.forEach((line, i) => {
        ctx.fillText(line, cellX + 8, cellY + 25 + i * 11);
      });

      if (maxed) {
        ctx.fillStyle = 'rgba(60, 60, 60, 0.6)';
        ctx.fillRect(btnX, btnY, btnW, btnH);
        ctx.strokeStyle = '#757575';
        ctx.lineWidth = 1;
        ctx.strokeRect(btnX, btnY, btnW, btnH);
        ctx.fillStyle = '#9e9e9e';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('MAX', btnX + btnW / 2, btnY + btnH / 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      } else {
        drawUiButton(btnX, btnY, btnW, btnH, `強化(${cost}P)`,
          () => purchaseSpecialSkillPreLevel(skill.id),
          affordable
            ? { fillStyle: 'rgba(20, 120, 90, 0.7)', strokeStyle: '#80cbc4', font: 'bold 10px sans-serif' }
            : { fillStyle: 'rgba(60, 60, 60, 0.5)', strokeStyle: '#616161', textColor: '#9e9e9e', font: 'bold 10px sans-serif' });
      }
    });

    const specialSkillGridBottom = gridStartY + rows * (cellHeight + cellGap) - cellGap;
    const specialSkillBackBtnW = 200, specialSkillBackBtnH = 28;
    drawUiButton(canvas.width / 2 - specialSkillBackBtnW / 2, specialSkillGridBottom + 8, specialSkillBackBtnW, specialSkillBackBtnH,
      '戻る', () => { specialSkillPreShopActive = false; },
      { fillStyle: 'rgba(60, 60, 60, 0.6)', strokeStyle: '#90a4ae' });
    return;
  }

  if (endingListActive) {
    drawSetupBackground(false);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd54f';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('エンディングリスト', canvas.width / 2, 34);
    ctx.textAlign = 'left';

    // 画面下まではみ出して「戻る」ボタンが押せなくならないよう、2列で表示する
    const cols = 2;
    const colGap = 16;
    const rowX = 40;
    const totalGridWidth = canvas.width - rowX * 2;
    const colWidth = (totalGridWidth - colGap * (cols - 1)) / cols;
    const rowHeight = 60;
    const rowGap = 8;
    const gridStartY = 56;
    const rows = Math.ceil(endingListDefs.length / cols);

    endingListDefs.forEach((def, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const colX = rowX + col * (colWidth + colGap);
      const rowY = gridStartY + row * (rowHeight + rowGap);
      const achieved = !!dreamMemorySave.endingsCleared[def.id];

      ctx.fillStyle = achieved ? 'rgba(103, 58, 183, 0.30)' : 'rgba(40, 40, 40, 0.45)';
      ctx.fillRect(colX, rowY, colWidth, rowHeight);
      ctx.strokeStyle = achieved ? '#ce93d8' : '#616161';
      ctx.lineWidth = 1;
      ctx.strokeRect(colX, rowY, colWidth, rowHeight);

      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = achieved ? 'white' : '#616161';
      ctx.fillText(achieved ? def.icon : '？', colX + 14, rowY + 40);

      ctx.font = 'bold 15px sans-serif';
      ctx.fillStyle = achieved ? '#ffd54f' : '#9e9e9e';
      ctx.fillText(achieved ? def.label : '？？？？？', colX + 56, rowY + 24);

      ctx.font = '12px sans-serif';
      ctx.fillStyle = achieved ? '#cfd8dc' : '#757575';
      const hintText = achieved ? def.hint : 'まだ到達していないエンディング';
      const hintLines = wrapTextToWidth(hintText, colWidth - 70).slice(0, 1);
      ctx.fillText(hintLines[0] || '', colX + 56, rowY + 44);
    });

    const gridBottom = gridStartY + rows * (rowHeight + rowGap) - rowGap;
    const backBtnW = 200, backBtnH = 32;
    ctx.textAlign = 'left';
    drawUiButton(canvas.width / 2 - backBtnW / 2, gridBottom + 12, backBtnW, backBtnH,
      '戻る', () => { endingListActive = false; },
      { fillStyle: 'rgba(60, 60, 60, 0.6)', strokeStyle: '#90a4ae' });
    return;
  }

  if (controllerHelpActive) {
    drawSetupBackground(false);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd54f';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('🎮 コントローラーの操作方法', canvas.width / 2, 40);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#cfd8dc';
    ctx.fillText('（ブラウザでゲームパッドを認識させるため、接続後に一度何かボタンを押してください）', canvas.width / 2, 64);
    ctx.textAlign = 'left';

    const rowX = canvas.width / 2 - 220;
    const rowW = 440;
    const rowH = 46;
    const rowGap = 10;
    const gridStartY = 96;
    const controllerHelpRows = [
      { input: '左スティック', desc: '移動' },
      { input: '右スティック', desc: '照準（倒した方向を狙う）' },
      { input: 'R2 / RT または A ボタン', desc: '連射（押している間）' },
      { input: 'B ボタン', desc: 'パリィ（同僚弾をはじき返す）' },
      { input: 'Start ボタン', desc: '一時停止 / 再開' }
    ];
    controllerHelpRows.forEach((row, index) => {
      const rowY = gridStartY + index * (rowH + rowGap);
      ctx.fillStyle = 'rgba(40, 40, 40, 0.5)';
      ctx.fillRect(rowX, rowY, rowW, rowH);
      ctx.strokeStyle = '#616161';
      ctx.lineWidth = 1;
      ctx.strokeRect(rowX, rowY, rowW, rowH);
      ctx.font = 'bold 15px sans-serif';
      ctx.fillStyle = '#ffd54f';
      ctx.fillText(row.input, rowX + 14, rowY + 20);
      ctx.font = '13px sans-serif';
      ctx.fillStyle = '#eceff1';
      ctx.fillText(row.desc, rowX + 14, rowY + 38);
    });

    const gridBottom = gridStartY + controllerHelpRows.length * (rowH + rowGap) - rowGap;
    const backBtnW2 = 200, backBtnH2 = 32;
    drawUiButton(canvas.width / 2 - backBtnW2 / 2, gridBottom + 20, backBtnW2, backBtnH2,
      '戻る', () => { controllerHelpActive = false; },
      { fillStyle: 'rgba(60, 60, 60, 0.6)', strokeStyle: '#90a4ae' });
    return;
  }

  if (startScreen) {
    drawSetupBackground();
    // 左上に小さく、全ての引き継ぎ状態をリセットするボタンを配置する
    drawUiButton(10, 10, 74, 24, 'リセット', () => { titleResetConfirmActive = true; },
      { fillStyle: 'rgba(60, 20, 20, 0.55)', strokeStyle: '#ef9a9a', font: 'bold 12px sans-serif' });
    // 右上に小さく、デバッグ用の「Waking Nightmare」ボタンを配置する
    // （ランダムな自機・同僚・関係性100・ノーマルエンド直後、という状態を疑似的に作るだけで、エンディング記録には残さない）
    drawUiButton(canvas.width - 10 - 130, 10, 130, 24, 'Waking Nightmare', triggerWakingNightmareDebug,
      { fillStyle: 'rgba(20, 20, 60, 0.55)', strokeStyle: '#9fa8da', font: 'bold 11px sans-serif' });
    // 上部中央に小さく、ゲームコントローラーの操作説明を開くボタンを配置する
    drawUiButton(canvas.width / 2 - 95, 10, 190, 24, '🎮 コントローラー操作', () => { controllerHelpActive = true; },
      { fillStyle: 'rgba(40, 40, 40, 0.55)', strokeStyle: '#90a4ae', font: 'bold 12px sans-serif' });
    // after_normalEND使用時は、タイトル画面の文字をすべて明朝体系フォントにし、彩度・明度を少し落とした配色にする
    const useMinchoTitle = shouldShowAfterNormalEndTitleBackground();
    const titleFontFamily = useMinchoTitle
      ? '"Yu Mincho", "Hiragino Mincho ProN", "MS PMincho", serif'
      : '"Comic Sans MS", "Chalkboard SE", "Marker Felt", cursive, sans-serif';
    const uiFontFamily = useMinchoTitle
      ? '"Yu Mincho", "Hiragino Mincho ProN", "MS PMincho", serif'
      : 'sans-serif';
    const titleStrokeColor = useMinchoTitle ? '#a9828c' : '#ff8fab';
    const titleFillColor = useMinchoTitle ? '#d9d3c6' : '#fffaf0';
    // 二週目以降（過去にいずれかのエンディングに到達済み）：「サラリーマン」の部分を、
    // 爪で引っかいたような暗い傷跡＋鉛筆の線で打ち消す（固定表示。毎フレーム同じ形になる固定の乱数を使う）
    const hasPlayedBefore = Object.values(dreamMemorySave.endingsCleared).some(v => v);
    const subtitleText = useMinchoTitle ? 'Wakin’ UnDead' : 'Workin’ FunDead';
    drawGameTitleText(titleFontFamily, titleStrokeColor, titleFillColor, subtitleText, hasPlayedBefore);

    // 真エンド（ラスボス撃破）に到達済みなら、タイトルにその印を表示する
    if (dreamMemorySave.trueEndCleared) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = useMinchoTitle ? '#b8a06a' : '#ffd54f';
      ctx.font = `bold 16px ${uiFontFamily}`;
      ctx.fillText('クリア済', canvas.width / 2, canvas.height / 2 - 96);
      ctx.textAlign = 'left';
      ctx.restore();
    }

    // 開始する（左下）・強化（右下）は同サイズ、エンディングリストは中央下（操作説明と被らない位置）に配置する
    const cornerBtnW = 170, cornerBtnH = 54;
    const bottomMargin = 26;
    const bottomY = canvas.height - cornerBtnH - bottomMargin;
    drawTitleGlitchButton(20, bottomY, cornerBtnW, cornerBtnH, '開始する (1 / Enter)',
      () => selectMode(),
      { font: `bold 18px ${uiFontFamily}`, textColor: useMinchoTitle ? '#ded8cd' : 'white' }, 101);
    drawTitleGlitchButton(canvas.width - cornerBtnW - 20, bottomY, cornerBtnW, cornerBtnH,
      `強化 (P: ${dreamMemorySave.points})`, () => { dreamMemoryShopActive = true; },
      { fillStyle: 'rgba(74, 20, 140, 0.55)', strokeStyle: '#ce93d8', font: `bold 18px ${uiFontFamily}`, textColor: useMinchoTitle ? '#ded8cd' : 'white' }, 202);

    const endingListBtnW = 220, endingListBtnH = 40;
    drawTitleGlitchButton(canvas.width / 2 - endingListBtnW / 2, bottomY + (cornerBtnH - endingListBtnH) / 2,
      endingListBtnW, endingListBtnH,
      'エンディングリスト', () => { endingListActive = true; },
      { fillStyle: 'rgba(60, 60, 60, 0.55)', strokeStyle: '#ffd54f', font: `bold 14px ${uiFontFamily}`, textColor: useMinchoTitle ? '#ded8cd' : 'white' }, 303);

    const helpTextY = bottomY - 60;

    ctx.fillStyle = useMinchoTitle ? '#9aa39f' : '#cfd8dc';
    ctx.font = `16px ${uiFontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText('P = 一時停止 / 再開　F = 自動攻撃切替　Space = パリィ（同僚弾をはじき返す）', canvas.width / 2, helpTextY);
    ctx.fillText('WASD・十字ボタン = 移動　マウス・ドラッグ / 連射ボタン = 照準・攻撃', canvas.width / 2, helpTextY + 26);
    ctx.textAlign = 'left';

    // リセット確認ダイアログ：「やり直しますか？」→はい/いいえ
    // （背後にあるタイトル画面の各ボタンは、この画面が出ている間クリックできないようにする）
    if (titleResetConfirmActive) {
      uiButtons.length = 0;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('やり直しますか？', canvas.width / 2, canvas.height / 2 - 80);
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#ef9a9a';
      ctx.fillText('（引き継いだ役職・Score・夢の記憶ポイントなど、全ての記録が消えます）', canvas.width / 2, canvas.height / 2 - 48);
      ctx.textAlign = 'left';

      const confirmBtnW = 200, confirmBtnH = 48;
      const confirmBtnX = canvas.width / 2 - confirmBtnW / 2;
      drawUiButton(confirmBtnX, canvas.height / 2 - 4, confirmBtnW, confirmBtnH, 'はい',
        () => resetAllProgressAndReload(),
        { fillStyle: 'rgba(84, 30, 30, 0.7)', strokeStyle: '#ef9a9a' });
      drawUiButton(confirmBtnX, canvas.height / 2 + 56, confirmBtnW, confirmBtnH, 'いいえ',
        () => { titleResetConfirmActive = false; },
        { fillStyle: 'rgba(60, 60, 60, 0.6)', strokeStyle: '#90a4ae' });
    }

    // 「Waking Nightmare」などタイトル画面からの暗転演出：フェードアウトが終わるまでボタン操作を無効にする
    if (setupFadePhase === 'out') {
      uiButtons.length = 0;
      const fadeAlpha = 1 - Math.max(0, Math.min(1, setupFadeTimer / setupFadeDurationMs));
      ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    return;
  }

  drawBackground();
  drawBossEvent();
  drawMidBossEvent();
  // 敵・アイコン・自分/同僚などの前景要素に薄い影をつけ、背景から浮き上がって見やすくする
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  if (deathSequence && deathSequence.phase === 'vanish') {
    // 専用の姿（SAN切れ／寿命切れ）へ切り替わり、点滅しながら透明になっていく
    const vanishProgress = Math.min(1, deathSequence.phaseTimerMs / deathSequenceVanishDurationMs);
    const blinkOn = Math.floor(deathSequence.phaseTimerMs / deathSequenceVanishBlinkIntervalMs) % 2 === 0;
    ctx.globalAlpha = blinkOn ? (1 - vanishProgress) : 0;
  } else if (deathSequence && deathSequence.phase === 'fadeOut') {
    ctx.globalAlpha = 0;
  } else if (playerReviveTimerMs > 0) {
    // 残機を使って気絶し、復活を待っている間：半透明で点滅させる
    const blink = Math.floor(gameClockMs / 150) % 2 === 0;
    ctx.globalAlpha = blink ? 0.25 : 0.55;
  } else if (invincible) {
    const blink = Math.floor(gameClockMs / 100) % 2 === 0;
    ctx.globalAlpha = blink ? 0.4 : 0.8;
  } else {
    ctx.globalAlpha = 1;
  }
  // 栄養ドリンクの効果が有効な間は、自機の周りに淡い光るエフェクトを表示する
  if (energyDrinkBuffTimerMs > 0) {
    const pulse = 0.5 + 0.5 * Math.sin(gameClockMs / 150);
    const glowRadius = player.radius * 2.4 + pulse * 5;
    ctx.save();
    ctx.beginPath();
    ctx.arc(player.x, player.y, glowRadius, 0, Math.PI * 2);
    const glowGradient = ctx.createRadialGradient(
      player.x, player.y, player.radius * 0.4,
      player.x, player.y, glowRadius
    );
    glowGradient.addColorStop(0, 'rgba(128, 222, 234, 0.4)');
    glowGradient.addColorStop(1, 'rgba(128, 222, 234, 0)');
    ctx.fillStyle = glowGradient;
    ctx.fill();
    ctx.strokeStyle = `rgba(128, 222, 234, ${0.5 + pulse * 0.3})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius * 1.8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // コーヒーの効果が有効な間は、自機の周りに淡い光るエフェクトを表示する
  if (coffeeBuffTimerMs > 0) {
    const coffeePulse = 0.5 + 0.5 * Math.sin(gameClockMs / 150);
    const coffeeGlowRadius = player.radius * 2.2 + coffeePulse * 4;
    ctx.save();
    ctx.beginPath();
    ctx.arc(player.x, player.y, coffeeGlowRadius, 0, Math.PI * 2);
    const coffeeGlowGradient = ctx.createRadialGradient(
      player.x, player.y, player.radius * 0.4,
      player.x, player.y, coffeeGlowRadius
    );
    coffeeGlowGradient.addColorStop(0, 'rgba(161, 136, 127, 0.4)');
    coffeeGlowGradient.addColorStop(1, 'rgba(161, 136, 127, 0)');
    ctx.fillStyle = coffeeGlowGradient;
    ctx.fill();
    ctx.strokeStyle = `rgba(161, 136, 127, ${0.5 + coffeePulse * 0.3})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius * 1.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // 「ファイヤーウォール」の効果が残っている間、自機の周りにバリアを表示する
  drawBarrierShield(player.x, player.y, player.radius, playerBarrierCharges);
  // 自分のアイコン（性別選択で選んだimages/self内の画像を使用）。
  // ただし力尽きた演出の「vanish」「fadeOut」中は、SAN切れ／寿命切れ専用の姿に切り替える
  const selfImg = (deathSequence && (deathSequence.phase === 'vanish' || deathSequence.phase === 'fadeOut'))
    ? (deathSequence.visualType === 'lifespan' ? deadIconImages : san0IconImages)[selectedPlayerIcon]
    : genderImageElements[selectedPlayerIcon];
  if (selfImg && selfImg.complete && selfImg.naturalWidth > 0) {
    const selfImgSize = player.radius * 4.8;
    ctx.drawImage(selfImg, player.x - selfImgSize / 2, player.y - selfImgSize / 2, selfImgSize, selfImgSize);
  } else {
    ctx.font = '30px "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🧑', player.x, player.y);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
  ctx.globalAlpha = 1;
  // 自機の下にSAN・寿命・脳疲労の小さなバーを表示する
  drawMiniStatBars(player.x, player.y + (player.radius * 4.8) / 2 + 6, [
    { value: san, max: maxSan, color: '#ce93d8' },
    { value: lifespan, max: maxLifespan, color: '#80cbc4' },
    { value: fatigue, max: maxFatigue, color: '#ffb74d' }
  ]);
  // 自分の正面方向を、機体を中心とした円軌道上の照準点で示す
  const aimDotOrbitRadius = player.radius + 18;
  const aimDotX = player.x + Math.cos(player.angle) * aimDotOrbitRadius;
  const aimDotY = player.y + Math.sin(player.angle) * aimDotOrbitRadius;
  ctx.save();
  ctx.beginPath();
  ctx.arc(aimDotX, aimDotY, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#4dd0e1';
  ctx.shadowColor = '#80deea';
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.restore();

  // stun中は、自分の上で眠っている「💤 Zzz」を点滅・上下移動させる
  if (stunned && Math.floor(gameClockMs / 300) % 2 === 0) {
    const sleepFloatY = Math.sin(gameClockMs / 180) * 4;
    ctx.save();
    ctx.font = 'bold 22px "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#b3e5fc';
    ctx.shadowColor = '#0288d1';
    ctx.shadowBlur = 6;
    ctx.fillText('💤 Zzz', player.x, player.y - player.radius - 10 + sleepFloatY);
    ctx.restore();
  }

  // 残機を使って気絶し、復活を待っている間：頭上をぐるぐる回る星を表示する
  if (playerReviveTimerMs > 0) {
    drawReviveStars(player.x, player.y - player.radius - 16, player.radius);
  }

  // 同僚の描画（存在するときのみ。imagesフォルダの選択した画像を使用）
  if (partner.active) {
    ctx.save();
    if (partner.reviveTimerMs > 0) {
      // 残機を使って気絶し、復活を待っている間：半透明で点滅させる
      const blink = Math.floor(gameClockMs / 150) % 2 === 0;
      ctx.globalAlpha = blink ? 0.25 : 0.55;
    } else if (partner.invincible) {
      ctx.globalAlpha = Math.floor(gameClockMs / 100) % 2 === 0 ? 0.4 : 0.8;
    }
    const partnerImg = partnerIconImageElements[partner.icon];
    if (partnerImg && partnerImg.complete && partnerImg.naturalWidth > 0) {
      const imgSize = partner.radius * 4.8;
      ctx.drawImage(partnerImg, partner.x - imgSize / 2, partner.y - imgSize / 2, imgSize, imgSize);
    } else {
      ctx.font = '26px "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🧑', partner.x, partner.y);
    }
    ctx.restore();

    // 残機を使って気絶し、復活を待っている間：頭上をぐるぐる回る星を表示する
    if (partner.reviveTimerMs > 0) {
      drawReviveStars(partner.x, partner.y - partner.radius - 16, partner.radius);
    }

    // 「ファイヤーウォール」の効果が残っている間、同僚の周りにバリアを表示する
    drawBarrierShield(partner.x, partner.y, partner.radius, partner.barrierCharges);

    // 同僚の下にSAN・寿命・脳疲労の小さなバーを表示する
    drawMiniStatBars(partner.x, partner.y + (partner.radius * 4.8) / 2 + 6, [
      { value: partner.san, max: maxSan, color: '#ce93d8' },
      { value: partner.lifespan, max: maxLifespan, color: '#80cbc4' },
      { value: partner.fatigue, max: maxFatigue, color: '#ffb74d' }
    ]);

    // 同僚の吹き出し（一言セリフ）
    if (partnerSpeechBubble) {
      ctx.save();
      ctx.font = 'bold 14px sans-serif';
      const paddingX = 10, paddingY = 8;
      const textWidth = ctx.measureText(partnerSpeechBubble.text).width;
      const bubbleW = textWidth + paddingX * 2;
      const bubbleH = 16 + paddingY * 2;
      const bubbleX = partner.x - bubbleW / 2;
      const partnerImgSize = partner.radius * 4.8;
      const bubbleY = partner.y - partnerImgSize / 2 - bubbleH - 14;
      // 表示直後と消える直前だけフェードさせる
      ctx.globalAlpha = Math.max(0, Math.min(1,
        Math.min(partnerSpeechBubbleDurationMs - partnerSpeechBubble.timer, partnerSpeechBubble.timer) / 300));
      ctx.fillStyle = 'rgba(20, 24, 32, 0.9)';
      ctx.strokeStyle = partnerSpeechBubble.color;
      ctx.lineWidth = 2;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 8);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(bubbleX, bubbleY, bubbleW, bubbleH);
        ctx.strokeRect(bubbleX, bubbleY, bubbleW, bubbleH);
      }
      // 同僚を指す吹き出しの尻尾
      ctx.beginPath();
      ctx.moveTo(partner.x - 6, bubbleY + bubbleH);
      ctx.lineTo(partner.x + 6, bubbleY + bubbleH);
      ctx.lineTo(partner.x, bubbleY + bubbleH + 10);
      ctx.closePath();
      ctx.fillStyle = 'rgba(20, 24, 32, 0.9)';
      ctx.fill();

      ctx.fillStyle = partnerSpeechBubble.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(partnerSpeechBubble.text, partner.x, bubbleY + bubbleH / 2);
      ctx.restore();
    }
  }

  // プレイヤーが発射した弾を描く（弾き返した弾は金色に光らせて見分けられるようにする）
  for (const b of bullets) {
    if (b.owner === 'support') {
      // 援護弾：ひときわ目立つよう、大きく明るい紫の本体＋パルスする外周リングで描く
      const pulse = 0.5 + 0.5 * Math.sin(gameClockMs / 160);
      ctx.save();
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius + 8 + pulse * 6, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(225, 190, 231, ${0.5 + pulse * 0.4})`;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.fillStyle = '#f3e5f5';
      ctx.shadowColor = '#ce93d8';
      ctx.shadowBlur = 20 + pulse * 12;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // 弾の中心に「パリィ！」の文字を点滅させながら入れ、パリィで迎え撃てることをひと目で伝える
      if (Math.floor(gameClockMs / 200) % 2 === 0) {
        ctx.save();
        ctx.fillStyle = '#4a148c';
        ctx.font = `bold ${Math.round(b.radius * 0.6)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('パリィ！', b.x, b.y + 1);
        ctx.restore();
      }
      continue;
    }
    // 敵性体（ラスボス・中ボス・固定敵）からの弾は、自機・同僚の弾（白い円）と見分けやすいよう、
    // 赤みのあるオレンジ色の「ひし形」で描く（色だけでなく形も変えることで、ひと目で区別できるようにする）
    if (b.owner === 'boss' || b.owner === 'midBoss' || b.owner === 'fixedEnemy' || b.owner === 'fixedEnemyDisguise') {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ff6e40';
      ctx.shadowColor = '#ff6e40';
      ctx.shadowBlur = 8;
      ctx.fillRect(-b.radius, -b.radius, b.radius * 2, b.radius * 2);
      ctx.restore();
      continue;
    }
    ctx.save();
    if (b.owner === 'deflected') {
      ctx.fillStyle = '#ffd54f';
      ctx.shadowColor = '#fff176';
      ctx.shadowBlur = 10;
    } else if (b.owner === 'selfConflict') {
      // 第6段階「内的葛藤」：自機アイコン同士が撃ち合う赤い球
      ctx.fillStyle = '#ff1744';
      ctx.shadowColor = '#ff1744';
      ctx.shadowBlur = 10;
    } else {
      ctx.fillStyle = 'white';
    }
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 同僚弾を弾き返した瞬間の「カキーン」という弾ける星形エフェクトを描く
  for (const effect of deflectEffects) {
    const progress = 1 - effect.timer / deflectEffectDurationMs;
    const alpha = Math.max(0, 1 - progress);
    const radius = 10 + 22 * progress;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = effect.isAuto ? '#80deea' : '#fff176';
    ctx.lineWidth = 3;
    ctx.shadowColor = effect.isAuto ? '#4dd0e1' : '#ffd54f';
    ctx.shadowBlur = 10;
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i + Math.PI / 6;
      ctx.beginPath();
      ctx.moveTo(effect.x + Math.cos(angle) * radius * 0.4, effect.y + Math.sin(angle) * radius * 0.4);
      ctx.lineTo(effect.x + Math.cos(angle) * radius, effect.y + Math.sin(angle) * radius);
      ctx.stroke();
    }
    ctx.restore();
  }

  // パリィを振った瞬間、振った本人の向きを中心に270度の範囲を素早く斬るワイプエフェクトを描く
  if (slashEffect) {
    const progress = 1 - slashEffect.timer / slashEffectDurationMs;
    const sweepProgress = Math.min(1, progress / 0.6); // 最初の60%で弧が伸びきる
    const fadeAlpha = progress < 0.6 ? 1 : Math.max(0, 1 - (progress - 0.6) / 0.4); // 残りでフェードアウト
    const startAngle = slashEffect.angle - slashEffectRangeRad / 2;
    const sweepAngle = startAngle + slashEffectRangeRad * sweepProgress;
    const slashRadius = slashEffect.radius + 26;
    ctx.save();
    ctx.globalAlpha = fadeAlpha;
    ctx.strokeStyle = '#e0f7fa';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#80deea';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(slashEffect.x, slashEffect.y, slashRadius, startAngle, sweepAngle);
    ctx.stroke();
    // 内側にもう1本重ねて、刃が振り抜けたような太さの変化を出す
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(slashEffect.x, slashEffect.y, slashRadius, startAngle, sweepAngle);
    ctx.stroke();
    ctx.restore();
  }

  // 弾が敵に当たった瞬間、放射状に弾ける小さなヒットエフェクトを描く（撃破時は少し大きく）
  for (const spark of hitSparks) {
    const progress = 1 - spark.timer / hitSparkDurationMs;
    const alpha = Math.max(0, 1 - progress);
    const baseRadius = spark.big ? 10 : 6;
    const maxRadius = spark.big ? 26 : 16;
    const radius = baseRadius + (maxRadius - baseRadius) * progress;
    const rayLength = (spark.big ? 16 : 10) * progress;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = spark.big ? '#ffe082' : '#fff59d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = spark.big ? '#fff3e0' : '#ffffff';
    for (const angle of spark.rays) {
      const innerR = radius * 0.5;
      ctx.beginPath();
      ctx.moveTo(spark.x + Math.cos(angle) * innerR, spark.y + Math.sin(angle) * innerR);
      ctx.lineTo(
        spark.x + Math.cos(angle) * (innerR + rayLength),
        spark.y + Math.sin(angle) * (innerR + rayLength)
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  // 「AIエージェント」で弾が最寄りの敵へ反射した瞬間の稲妻状エフェクト
  for (const beam of synergyBeams) {
    const progress = 1 - beam.timer / synergyBeamDurationMs;
    const alpha = Math.max(0, 1 - progress);
    ctx.save();
    ctx.globalAlpha = alpha;
    // ジグザグの稲妻に見えるよう、中間点を少しランダムにずらして描く
    const midX = (beam.x1 + beam.x2) / 2 + (Math.sin(gameClockMs / 20 + beam.x1) * 12);
    const midY = (beam.y1 + beam.y2) / 2 + (Math.cos(gameClockMs / 20 + beam.y1) * 12);
    ctx.strokeStyle = '#ffd54f';
    ctx.lineWidth = 5;
    ctx.shadowColor = '#ffd54f';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(beam.x1, beam.y1);
    ctx.lineTo(midX, midY);
    ctx.lineTo(beam.x2, beam.y2);
    ctx.stroke();
    ctx.strokeStyle = '#fff9e6';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(beam.x1, beam.y1);
    ctx.lineTo(midX, midY);
    ctx.lineTo(beam.x2, beam.y2);
    ctx.stroke();
    ctx.restore();
  }

  // 回復アイテムを描く。消滅直前は一定間隔で表示を切り替えて点滅させる
  if (chocolate) {
    const shouldShowChocolate = chocolate.remainingMs > chocolateBlinkMs ||
      Math.floor(chocolate.remainingMs / 200) % 2 === 0;

    if (shouldShowChocolate) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(chocolate.x, chocolate.y, chocolate.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#2b2016';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 204, 128, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = '34px "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🍫', chocolate.x, chocolate.y);
      if (chocolate.landed) {
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#ffcc80';
        ctx.fillText(
          `${Math.max(0, chocolate.remainingMs / 1000).toFixed(1)}秒`,
          chocolate.x,
          chocolate.y + chocolate.radius + 12
        );
      }
      ctx.restore();
    }
  }

  // 栄養ドリンクを描く（時間経過では消えないため、点滅・残り時間表示はしない）
  if (energyDrink) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(energyDrink.x, energyDrink.y, energyDrink.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#16282b';
    ctx.fill();
    ctx.strokeStyle = 'rgba(128, 222, 234, 0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = '34px "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🧃', energyDrink.x, energyDrink.y);
    ctx.restore();
  }

  // コーヒーを描く（時間経過では消えないため、点滅・残り時間表示はしない）
  if (coffee) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(coffee.x, coffee.y, coffee.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#2b1e14';
    ctx.fill();
    ctx.strokeStyle = 'rgba(161, 136, 127, 0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = '32px "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('☕', coffee.x, coffee.y);
    ctx.restore();
  }

  // 「ファイヤーウォール」を描く。消滅直前は一定間隔で表示を切り替えて点滅させる
  if (heartWall) {
    const shouldShowHeartWall = heartWall.remainingMs > heartWallBlinkMs ||
      Math.floor(heartWall.remainingMs / 200) % 2 === 0;

    if (shouldShowHeartWall) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(heartWall.x, heartWall.y, heartWall.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#211a2e';
      ctx.fill();
      ctx.strokeStyle = 'rgba(179, 157, 219, 0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = '30px "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🛡️', heartWall.x, heartWall.y);
      if (heartWall.landed) {
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#b39ddb';
        ctx.fillText(
          `${Math.max(0, heartWall.remainingMs / 1000).toFixed(1)}秒`,
          heartWall.x,
          heartWall.y + heartWall.radius + 12
        );
      }
      ctx.restore();
    }
  }

  // 全ての敵を描画する
  for (const en of enemies) {
    // 当たり判定の円を先に描き、敵の文字が常に手前になるようにする
    ctx.beginPath();
    ctx.arc(en.x, en.y, en.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(160, 160, 160, 0.28)';
    ctx.fill();

    // 敵の見た目（仮のプレースホルダー：著作権フリーの絵文字アイコン）
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '30px "Segoe UI Emoji", sans-serif';
    ctx.fillText(en.icon || '❓', en.x, en.y - 14);

    ctx.font = en.font;
    ctx.fillStyle = en.color;
    if (en.text) {
      ctx.fillText(en.text, en.x, en.y + 14);
      // 敵の名前の下に残りHP（残工数）を表示する
      const fm = (en.font || '').match(/(\d+)px/);
      const fSize = fm ? parseInt(fm[1], 10) : 28;
      ctx.font = '14px sans-serif';
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.fillText('残工数: ' + (en.hp || 0), en.x, en.y + 14 + fSize / 1.2);
      // 納期の残り秒数を表示し、5秒以下になったら赤色で警告する
      const deadlineSeconds = Math.max(0, en.deadlineMs / 1000);
      ctx.fillStyle = deadlineSeconds <= 5 ? '#ff5252' : '#ffeb3b';
      ctx.fillText(`納期: ${deadlineSeconds.toFixed(1)}秒`, en.x, en.y + 14 + fSize / 1.2 + 17);
      ctx.textAlign = 'left';
    }
  }
  ctx.textAlign = 'left';

  // 定時報告（固定ターゲット）
  if (scheduledReport) {
    const reportHpRatio = Math.max(0, scheduledReport.hp / scheduledReport.maxHp);
    ctx.save();
    ctx.beginPath();
    ctx.arc(scheduledReport.x, scheduledReport.y, scheduledReport.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 193, 7, 0.22)';
    ctx.fill();
    ctx.strokeStyle = '#ffca28';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.font = '36px "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📊', scheduledReport.x, scheduledReport.y - 5);
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#fff59d';
    ctx.fillText('定時報告', scheduledReport.x, scheduledReport.y + 20);
    const barWidth = 82;
    ctx.fillStyle = '#424242';
    ctx.fillRect(scheduledReport.x - barWidth / 2, scheduledReport.y + 43, barWidth, 8);
    ctx.fillStyle = reportHpRatio < 0.3 ? '#ef5350' : '#ffca28';
    ctx.fillRect(scheduledReport.x - barWidth / 2, scheduledReport.y + 43, barWidth * reportHpRatio, 8);
    ctx.restore();
  }

  // 固定敵（IT用語モチーフ）
  for (const fx of fixedEnemies) {
    const fxHpRatio = Math.max(0, fx.hp / fx.maxHp);
    ctx.save();
    ctx.beginPath();
    ctx.arc(fx.x, fx.y, fx.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 82, 82, 0.22)';
    ctx.fill();
    ctx.strokeStyle = '#ff5252';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.font = '32px "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fx.def.icon, fx.x, fx.y - 5);
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#ffcdd2';
    ctx.fillText(fx.def.name, fx.x, fx.y + fx.radius + 14);
    const fxBarWidth = 74;
    ctx.fillStyle = '#424242';
    ctx.fillRect(fx.x - fxBarWidth / 2, fx.y + fx.radius + 22, fxBarWidth, 7);
    ctx.fillStyle = fxHpRatio < 0.3 ? '#ef5350' : '#ff8a65';
    ctx.fillRect(fx.x - fxBarWidth / 2, fx.y + fx.radius + 22, fxBarWidth * fxHpRatio, 7);
    ctx.restore();

    if (fx.decoy) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(fx.decoy.x, fx.decoy.y, fx.decoy.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 214, 0, 0.25)';
      ctx.fill();
      ctx.strokeStyle = '#ffd600';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = '22px "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fx.def.decoyIcon || '❓', fx.decoy.x, fx.decoy.y);
      ctx.restore();
    }
  }

  // 固定敵を撃破した直後、その用語の現実の説明文を窓の上あたりにフェードイン→表示→フェードアウトする
  if (fixedEnemyDefeatInfoDisplay) {
    const infoAlpha = getFixedEnemyDefeatInfoAlpha();
    if (infoAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = infoAlpha;
      // 自分・同僚のプロフィール枠（左上）と日付表示（右上）を避け、窓の中央〜右寄りに表示する
      const panelX = 320;
      const panelW = Math.min(450, canvas.width - panelX - 20);
      const panelCenterX = panelX + panelW / 2;
      ctx.font = '13px sans-serif';
      const infoLines = wrapTextToWidth(fixedEnemyDefeatInfoDisplay.info, panelW - 32);
      const panelH = 34 + infoLines.length * 18;
      const panelY = 40;
      ctx.fillStyle = 'rgba(20, 20, 30, 0.78)';
      ctx.fillRect(panelX, panelY, panelW, panelH);
      ctx.strokeStyle = '#ff8a80';
      ctx.lineWidth = 2;
      ctx.strokeRect(panelX, panelY, panelW, panelH);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffcdd2';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(fixedEnemyDefeatInfoDisplay.name, panelCenterX, panelY + 22);
      ctx.fillStyle = '#eeeeee';
      ctx.font = '13px sans-serif';
      infoLines.forEach((line, i) => {
        ctx.fillText(line, panelCenterX, panelY + 42 + i * 18);
      });
      ctx.textAlign = 'left';
      ctx.restore();
    }
  }

  // 昼食として出現中の食べ物
  const showLunchItems = lunchState && (lunchState.expirationStartedAtMs === null ||
    Math.floor((gameClockMs - lunchState.expirationStartedAtMs) / 140) % 2 === 0);
  if (showLunchItems) {
    for (const item of lunchState.items) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#2b2016';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 204, 128, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = '30px "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.icon, item.x, item.y);
      ctx.restore();

      // 特殊スキル「食通」習得済みなら、出現順の番号を見える化する
      if (specialSkillEffects.mealOrderVisible) {
        ctx.save();
        ctx.font = 'bold 14px sans-serif';
        ctx.fillStyle = '#fff59d';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(item.sequenceIndex + 1), item.x + item.radius - 4, item.y - item.radius + 4);
        ctx.restore();
      }
    }
  }

  // クイズの設問と、①②③のタップ回答ボタン
  if (quizState) {
    const quizAnswerLocked = Date.now() < quizAnswerUnlockAt;
    const numberGlyphs = ['①', '②', '③'];
    const panelX = 400, panelY = 45, panelW = 388;
    const choiceBtnH = 34, choiceBtnGap = 8;
    const questionFont = 'bold 14px sans-serif';
    const questionLineHeight = 18;
    ctx.font = questionFont;
    const questionLines = wrapTextToWidth(`QUIZ: ${quizState.text}`, panelW - 24);
    const questionBlockHeight = 14 + questionLines.length * questionLineHeight;
    const choiceAreaTop = panelY + questionBlockHeight + 10;
    const panelH = questionBlockHeight + 10 + quizState.choices.length * (choiceBtnH + choiceBtnGap);

    ctx.save();
    ctx.fillStyle = 'rgba(8, 18, 35, 0.86)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = '#64b5f6';
    ctx.strokeRect(panelX, panelY, panelW, panelH);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#bbdefb';
    ctx.font = questionFont;
    questionLines.forEach((line, i) => {
      ctx.fillText(line, panelX + 12, panelY + 22 + i * questionLineHeight);
    });
    ctx.restore();

    quizState.choices.forEach((choice, index) => {
      const by = choiceAreaTop + index * (choiceBtnH + choiceBtnGap);
      drawUiButton(panelX + 10, by, panelW - 20, choiceBtnH, `${numberGlyphs[index]} ${choice}`,
        () => answerQuiz(index),
        quizAnswerLocked
          ? { fillStyle: 'rgba(60, 60, 60, 0.5)', strokeStyle: '#78909c', font: 'bold 13px sans-serif', textColor: '#b0bec5' }
          : { fillStyle: 'rgba(66, 165, 245, 0.35)', strokeStyle: '#90caf9', font: 'bold 13px sans-serif', textColor: 'white' });
    });

    // 出現直後は少しの間、タップしても回答にならない旨を示す
    if (quizAnswerLocked) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#fff59d';
      ctx.fillText('まもなく回答できます…', panelX + panelW / 2, panelY + panelH + 16);
      ctx.textAlign = 'left';
      ctx.restore();
    }
  }

  // ここまでの前景要素の影を解除する（HUDパネル等には不要なため）
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // 左上に自分と同僚のプロフィールを同じ高さで並べる（アイコンは同僚と同じサイズで表示）。
  drawHudProfilePanel(12, 12, 145, 225, '自分', selectedPlayerIcon, '#4dd0e1', [
    { text: `SAN: ${Math.floor(san)} / ${maxSan}` },
    { text: `寿命: ${Math.ceil(lifespan)} / ${maxLifespan}` },
    { text: `脳疲労: ${Math.floor(fatigue)} / ${maxFatigue}` },
    { text: `Score: ${score}` },
    { text: `残機: ×${playerLivesRemaining}`, color: getLivesCounterColor(playerLivesRemaining) },
    { text: `Skill:${skillLevel}  EXP:${Math.floor(exp)}` }
  ], false, 0, genderImageElements[selectedPlayerIcon], 46, { rank, roleName: rankNames[rank - 1] });

  // 役職スキル「AIエージェント」やコーヒー・栄養ドリンクの効果が有効な間、プロフィール区画内に
  // 点滅する小さなアイコンで状態を示す（複数同時に有効な場合は縦に並べる）
  const activeBuffIcons = [];
  if (rankSkillLevels.has('ai-agent')) {
    const remainingSynergyUses = synergyDailyLimit - synergyUsesToday;
    activeBuffIcons.push({
      text: `🤖AIエージェント 残${Math.max(0, remainingSynergyUses)}`,
      color: remainingSynergyUses > 0 ? '#ffd54f' : '#757575'
    });
  }
  if (energyDrinkBuffTimerMs > 0) {
    activeBuffIcons.push({ text: '⚡栄養ドリンク効果中', color: '#80deea' });
  }
  if (coffeeBuffTimerMs > 0) {
    activeBuffIcons.push({ text: '☕コーヒー効果中', color: '#a1887f' });
  }
  if (activeBuffIcons.length > 0) {
    const buffBlinkOn = Math.floor(gameClockMs / 500) % 2 === 0;
    ctx.save();
    ctx.globalAlpha = buffBlinkOn ? 1 : 0.35;
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    activeBuffIcons.forEach((buff, index) => {
      ctx.fillStyle = buff.color;
      ctx.fillText(buff.text, 21, 222 + index * 16);
    });
    ctx.restore();
  }

  const partnerUnavailable = !partner.active;
  const partnerTitle = selectedPartnerIcon === null
    ? '同僚なし'
    : (partner.active ? '同僚' : '同僚離脱');
  drawHudProfilePanel(164, 12, 145, 218, partnerTitle,
    selectedPartnerIcon, '#80cbc4', partner.active ? [
      { text: `SAN: ${Math.floor(partner.san)} / ${maxSan}` },
      { text: `寿命: ${Math.ceil(partner.lifespan)} / ${maxLifespan}` },
      { text: `脳疲労: ${Math.floor(partner.fatigue)} / ${maxFatigue}` },
      { text: '状態: 行動中' },
      { text: `関係性: ${Math.floor(partner.relationship)} / ${partnerRelationshipMax}` },
      { text: `残機: ×${partnerLivesRemaining}`, color: getLivesCounterColor(partnerLivesRemaining) }
    ] : [
      { text: 'SAN: —' },
      { text: '寿命: —' },
      { text: '脳疲労: —' },
      { text: `状態: ${selectedPartnerIcon === null ? '不在' : '離脱'}` },
      { text: selectedPartnerIcon === null ? '関係性: —' : `関係性: ${Math.floor(partner.relationship)} / ${partnerRelationshipMax}` },
      { text: `残機: ×${partnerLivesRemaining}`, color: getLivesCounterColor(partnerLivesRemaining) }
    ], partnerUnavailable,
    (partnerRelationshipMax - partner.relationship) / partnerRelationshipMax,
    selectedPartnerIcon !== null ? partnerIconImageElements[selectedPartnerIcon] : null,
    46);

  // 共通の進行情報は、2つのプロフィール区画の下へまとめる（自分・同僚とも円形アイコン拡大に合わせて位置を下げる）。
  ctx.font = '13px sans-serif';
  ctx.fillStyle = weeklyQuotaAchievedEarly ? '#69f0ae' : '#b0bec5';
  ctx.fillText(
    `週ノルマ: 撃破 ${weeklyKills}/${weeklyKillQuota}  Score ${weeklyScoreGained}/${weeklyScoreQuota}` +
    (weeklyQuotaAchievedEarly ? '（達成！）' : ''),
    12, 250
  );
  ctx.fillStyle = 'white';
  ctx.fillText(
    '攻撃モード: ' + (fullAutoModeEnabled ? '完全オート' : (autoFireEnabled ? '自動' : '手動')) +
      (stunned ? '（行動不能）' : ''),
    12, 268
  );
  // 完全オートモード・3倍加速・スマホ用自動照準：左下に縦にコンパクトに並べる。
  // クイズや固定敵の説明パネル（窓付近・画面上部）とは被らない位置
  const toggleBtnW = 170, toggleBtnH = 26, toggleBtnGap = 6;
  const toggleBtnX = 12, toggleBtnStartY = 278;
  drawUiButton(toggleBtnX, toggleBtnStartY, toggleBtnW, toggleBtnH,
    `完全オートモード: ${fullAutoModeEnabled ? 'ON' : 'OFF'}`,
    () => { fullAutoModeEnabled = !fullAutoModeEnabled; },
    fullAutoModeEnabled
      ? { fillStyle: 'rgba(56, 142, 60, 0.6)', strokeStyle: '#a5d6a7', font: 'bold 12px sans-serif' }
      : { fillStyle: 'rgba(60, 60, 60, 0.55)', strokeStyle: '#90a4ae', font: 'bold 12px sans-serif' });
  drawUiButton(toggleBtnX, toggleBtnStartY + (toggleBtnH + toggleBtnGap), toggleBtnW, toggleBtnH,
    `3倍加速: ${gameTimeScale === 3 ? 'ON' : 'OFF'}`,
    () => { gameTimeScale = gameTimeScale === 3 ? 1 : 3; },
    gameTimeScale === 3
      ? { fillStyle: 'rgba(56, 142, 60, 0.6)', strokeStyle: '#a5d6a7', font: 'bold 12px sans-serif' }
      : { fillStyle: 'rgba(60, 60, 60, 0.55)', strokeStyle: '#90a4ae', font: 'bold 12px sans-serif' });
  drawUiButton(toggleBtnX, toggleBtnStartY + (toggleBtnH + toggleBtnGap) * 2, toggleBtnW, toggleBtnH,
    `スマホ用自動照準: ${mobileAutoAimEnabled ? 'ON' : 'OFF'}`,
    () => setMobileAutoAimEnabled(!mobileAutoAimEnabled),
    mobileAutoAimEnabled
      ? { fillStyle: 'rgba(56, 142, 60, 0.6)', strokeStyle: '#a5d6a7', font: 'bold 12px sans-serif' }
      : { fillStyle: 'rgba(60, 60, 60, 0.55)', strokeStyle: '#90a4ae', font: 'bold 12px sans-serif' });

  // 「自己犠牲」「献身」：習得済みかつ同僚が健在で、まだこの周回で使っていない時だけ、
  // 同僚のプロフィール区画（x:164, y:12, w:145, h:204）内の、ステータス文字の下・区画下端より上の
  // 余白部分に、十字型の小さなボタンを右寄せで縦に並べて表示する（1周回につき1回のみ発動可能）
  const partnerPanelX = 164, partnerPanelW = 145, partnerPanelBottom = 12 + 204;
  const oneTimeSkillBtnSize = 24, oneTimeSkillBtnGap = 6, oneTimeSkillBtnRightMargin = 10;
  const oneTimeSkillBtnX = partnerPanelX + partnerPanelW - oneTimeSkillBtnSize - oneTimeSkillBtnRightMargin;
  let oneTimeSkillBtnY = partnerPanelBottom - oneTimeSkillBtnSize - 8;
  if (dreamMemorySave.upgrades.devotion >= 1 && !devotionUsedThisRun && partner.active) {
    drawUiButton(oneTimeSkillBtnX, oneTimeSkillBtnY, oneTimeSkillBtnSize, oneTimeSkillBtnSize,
      '✝', useDevotionSkill,
      { fillStyle: 'rgba(20, 60, 140, 0.65)', strokeStyle: '#90caf9', font: 'bold 14px sans-serif' });
    oneTimeSkillBtnY -= oneTimeSkillBtnSize + oneTimeSkillBtnGap;
  }
  if (dreamMemorySave.upgrades.selfSacrifice >= 1 && !selfSacrificeUsedThisRun && partner.active) {
    drawUiButton(oneTimeSkillBtnX, oneTimeSkillBtnY, oneTimeSkillBtnSize, oneTimeSkillBtnSize,
      '✝', useSelfSacrificeSkill,
      { fillStyle: 'rgba(140, 20, 20, 0.65)', strokeStyle: '#ef9a9a', font: 'bold 14px sans-serif' });
  }

  // 一時メッセージを画面上部の中央に表示する
  drawPendingMessages();
  // 画面右上に日付・時刻・曜日を表示する
  const yName = weekdayNames[currentDate.getDay()];
  const holidayFlag = isHoliday(currentDate) || yName === '土' || yName === '日';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = holidayFlag ? '#ffeb3b' : 'white';
  const hourStr = String(currentHour).padStart(2,'0') + ':00';
  const dateStr = `DAY${dayNumber} ${currentDate.getFullYear()}/${String(currentDate.getMonth()+1).padStart(2,'0')}/${String(currentDate.getDate()).padStart(2,'0')} ${hourStr} (${yName})`;
  const dateStrWidth = ctx.measureText(dateStr).width;
  const dateStrX = canvas.width - 12 - dateStrWidth;
  ctx.fillText(dateStr, dateStrX, 28);


  // 「大規模プロジェクト」で24時のまま時刻が止まっている間、鉛筆で取り消し線を何本も引いたような見た目にする
  if (midBossEvent && currentHour >= maxOvertimeHour) {
    ctx.save();
    ctx.strokeStyle = 'rgba(40, 40, 40, 0.8)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const scribbleLineCount = 5;
    for (let i = 0; i < scribbleLineCount; i++) {
      const baseY = 12 + i * 5;
      ctx.beginPath();
      ctx.moveTo(dateStrX - 4, baseY + Math.sin(gameClockMs / 260 + i) * 2);
      const segs = 6;
      for (let s = 1; s <= segs; s++) {
        const sx = dateStrX - 4 + (dateStrWidth + 8) * (s / segs);
        const sy = baseY + (Math.random() - 0.5) * 4;
        ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // 休日出勤中（土日）のみ表示する、切り上げて帰宅するためのボタン
  if ((currentDate.getDay() === 0 || currentDate.getDay() === 6) &&
      !gameOver && !gameClear && !dayTransitionPhase && !weekendWorkChoice &&
      !weekendWorkQuotaChoice && !fixedEnemyOvertimeChoiceActive && !acknowledgementNotice) {
    drawUiButton(canvas.width - 160, 100, 148, 40, '帰宅する (H)', goHomeFromWeekendWork,
      { fillStyle: 'rgba(84, 60, 30, 0.65)', strokeStyle: '#ffb74d', font: 'bold 15px sans-serif' });
  }

  if (isPaused && !gameOver && !gameClear) {
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', canvas.width / 2, 26);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#cfd8dc';
    ctx.fillText('Pキーで再開', canvas.width / 2, 44);
    ctx.textAlign = 'left';

    const colLeftX = 26;
    const colRightX = canvas.width / 2 + 16;
    const colWidth = canvas.width / 2 - 42;

    // ----- 基本パラメータ -----
    let leftY = 70;
    ctx.fillStyle = '#4dd0e1';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('自分のパラメータ', colLeftX, leftY);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#eeeeee';
    leftY += 20;
    [
      `SAN: ${Math.floor(san)} / ${maxSan}`,
      `寿命: ${Math.ceil(lifespan)} / ${maxLifespan}`,
      `脳疲労: ${Math.floor(fatigue)} / ${maxFatigue}`,
      `Score: ${score}`,
      `Rank: ${rank} ${rankNames[rank - 1]}`,
      `Skill Lv: ${skillLevel}  EXP: ${Math.floor(exp)}`
    ].forEach(line => { ctx.fillText(line, colLeftX, leftY); leftY += 16; });

    let rightY = 70;
    ctx.fillStyle = '#ffab91';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('同僚のパラメータ', colRightX, rightY);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#eeeeee';
    rightY += 20;
    if (partner.active) {
      [
        `SAN: ${Math.floor(partner.san)} / ${maxSan}`,
        `寿命: ${Math.ceil(partner.lifespan)} / ${maxLifespan}`,
        `脳疲労: ${Math.floor(partner.fatigue)} / ${maxFatigue}`,
        `関係性: ${Math.floor(partner.relationship)} / ${partnerRelationshipMax}`
      ].forEach(line => { ctx.fillText(line, colRightX, rightY); rightY += 16; });
    } else {
      ctx.fillText('（同僚なし）', colRightX, rightY);
      rightY += 16;
    }

    // ----- バフ・デバフ -----
    leftY += 10;
    ctx.fillStyle = '#a5d6a7';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('自分のバフ・デバフ', colLeftX, leftY);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#dcedc8';
    leftY += 17;
    getPlayerActiveEffectsList().forEach(line => {
      wrapTextToWidth(line, colWidth).forEach(w => { ctx.fillText(w, colLeftX, leftY); leftY += 14; });
    });

    rightY += 10;
    ctx.fillStyle = '#a5d6a7';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('同僚のバフ・デバフ', colRightX, rightY);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#dcedc8';
    rightY += 17;
    getPartnerActiveEffectsList().forEach(line => {
      wrapTextToWidth(line, colWidth).forEach(w => { ctx.fillText(w, colRightX, rightY); rightY += 14; });
    });

    // ----- 習得済みスキル（自分側=特殊スキル、同僚側=役職スキル） -----
    const skillSectionY = Math.max(leftY, rightY) + 14;
    const skillSectionMaxHeight = canvas.height - skillSectionY - 60;
    ctx.fillStyle = '#ce93d8';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('習得済み特殊スキル', colLeftX, skillSectionY);
    ctx.fillText('習得済み役職スキル（開発手法）', colRightX, skillSectionY);

    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#e1bee7';
    const specialList = getAcquiredSpecialSkillsList();
    drawFlowList(colLeftX, skillSectionY + 17, 150, skillSectionMaxHeight,
      specialList.length > 0 ? specialList : ['（なし）']);

    ctx.fillStyle = '#ffe0b2';
    const rankList = getAcquiredRankSkillsList();
    drawFlowList(colRightX, skillSectionY + 17, 190, skillSectionMaxHeight,
      rankList.length > 0 ? rankList : ['（なし）']);

    ctx.textAlign = 'left';

    const wakeBtnW = 220, wakeBtnH = 40, btnGap = 16;
    const resumeBtnX = canvas.width / 2 - wakeBtnW - btnGap / 2;
    const wakeBtnX = canvas.width / 2 + btnGap / 2;
    drawUiButton(resumeBtnX, canvas.height - 48, wakeBtnW, wakeBtnH,
      'ポーズ解除', () => { isPaused = false; },
      { fillStyle: 'rgba(30, 60, 84, 0.6)', strokeStyle: '#80deea' });
    drawUiButton(wakeBtnX, canvas.height - 48, wakeBtnW, wakeBtnH,
      '目を覚ます', () => { wakeUpConfirmActive = true; },
      { fillStyle: 'rgba(84, 30, 30, 0.6)', strokeStyle: '#ef9a9a' });
  }

  // 「目を覚ます」の確認ダイアログ（誤タップでのリロードを防ぐ）
  if (wakeUpConfirmActive && !gameOver && !gameClear) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'white';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('目を覚ましてよいですか？', canvas.width / 2, canvas.height / 2 - 40);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#cfd8dc';
    ctx.fillText('（ゲームを終了し、タイトルからやり直します）', canvas.width / 2, canvas.height / 2 - 12);
    ctx.textAlign = 'left';

    const confirmBtnW = 160, confirmBtnH = 44, confirmGap = 20;
    drawUiButton(canvas.width / 2 - confirmBtnW - confirmGap / 2, canvas.height / 2 + 10, confirmBtnW, confirmBtnH,
      'はい', () => location.reload(),
      { fillStyle: 'rgba(84, 30, 30, 0.7)', strokeStyle: '#ef9a9a' });
    drawUiButton(canvas.width / 2 + confirmGap / 2, canvas.height / 2 + 10, confirmBtnW, confirmBtnH,
      'いいえ', () => { wakeUpConfirmActive = false; },
      { fillStyle: 'rgba(60, 60, 60, 0.7)', strokeStyle: '#90a4ae' });
  }

  if (gameClear || gameOver) {
    drawEndingScreen();
  }
  // 週間ノルマ未達成：休日出勤するかどうかの選択画面
  if (weekendWorkChoice && !gameOver && !gameClear) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ff8a65';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('今週のノルマを達成できませんでした…', canvas.width / 2, canvas.height / 2 - 80);
    ctx.fillText('土日祝日も働きますか？', canvas.width / 2, canvas.height / 2 - 44);
    ctx.textAlign = 'left';

    const btnW = 340, btnH = 50;
    const btnX = canvas.width / 2 - btnW / 2;
    drawUiButton(btnX, canvas.height / 2 - 4, btnW, btnH, '出勤する (Y)',
      () => handleWeekendWorkChoice('work'));
    drawUiButton(btnX, canvas.height / 2 + 54, btnW, btnH, '休む (N)',
      () => handleWeekendWorkChoice('rest'), { fillStyle: 'rgba(84, 60, 30, 0.6)', strokeStyle: '#ffb74d' });
  }
  // 休日出勤中にノルマ達成：家に帰るかどうかの選択画面
  if (weekendWorkQuotaChoice && !gameOver && !gameClear) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#69f0ae';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('今週のノルマを達成しました！', canvas.width / 2, canvas.height / 2 - 80);
    ctx.fillText('今日はもう家に帰りますか？', canvas.width / 2, canvas.height / 2 - 44);
    ctx.textAlign = 'left';

    const quotaBtnW = 340, quotaBtnH = 50;
    const quotaBtnX = canvas.width / 2 - quotaBtnW / 2;
    drawUiButton(quotaBtnX, canvas.height / 2 - 4, quotaBtnW, quotaBtnH, 'はい・帰宅する (Y)',
      () => handleWeekendWorkQuotaChoice(true));
    drawUiButton(quotaBtnX, canvas.height / 2 + 54, quotaBtnW, quotaBtnH, 'いいえ・続ける (N)',
      () => handleWeekendWorkQuotaChoice(false), { fillStyle: 'rgba(60, 60, 60, 0.6)', strokeStyle: '#90a4ae' });
  }
  // 18時に固定敵（脅威）が残っている：残業するかどうかの選択画面
  if (fixedEnemyOvertimeChoiceActive && !gameOver && !gameClear) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ff8a65';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('まだ脅威が残っている！', canvas.width / 2, canvas.height / 2 - 80);
    ctx.fillText('残業しますか？', canvas.width / 2, canvas.height / 2 - 44);
    ctx.textAlign = 'left';

    const fixedEnemyBtnW = 340, fixedEnemyBtnH = 50;
    const fixedEnemyBtnX = canvas.width / 2 - fixedEnemyBtnW / 2;
    drawUiButton(fixedEnemyBtnX, canvas.height / 2 - 4, fixedEnemyBtnW, fixedEnemyBtnH, 'はい (Y)',
      () => handleFixedEnemyOvertimeChoice(true));
    drawUiButton(fixedEnemyBtnX, canvas.height / 2 + 54, fixedEnemyBtnW, fixedEnemyBtnH, 'いいえ (N)',
      () => handleFixedEnemyOvertimeChoice(false), { fillStyle: 'rgba(60, 60, 60, 0.6)', strokeStyle: '#90a4ae' });
  }
  // ラスボス出現条件を満たした瞬間の選択肢：「名状しがたきものの気配がする……」
  if (bossEncounterChoiceActive && !gameOver && !gameClear) {
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ff8a80';
    ctx.font = '26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('……何か不吉で嫌な予感がする……', canvas.width / 2, canvas.height / 2 - 90);
    ctx.textAlign = 'left';

    const encBtnW = 460, encBtnH = 50;
    const encBtnX = canvas.width / 2 - encBtnW / 2;
    drawUiButton(encBtnX, canvas.height / 2 - 20, encBtnW, encBtnH,
      `① 現実から目をそらす（自分・同僚とも SAN +${bossEncounterAvoidSanRecovery}）`,
      chooseBossEncounterAvoid,
      { fillStyle: 'rgba(60, 60, 60, 0.6)', strokeStyle: '#90a4ae' });
    drawUiButton(encBtnX, canvas.height / 2 + 40, encBtnW, encBtnH,
      '② 現実を直視する', chooseBossEncounterFace,
      { fillStyle: 'rgba(84, 20, 20, 0.6)', strokeStyle: '#ff8a80' });
  }

  // ②を選んだ後の最終確認
  if (bossEncounterConfirmActive && !gameOver && !gameClear) {
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ff8a80';
    ctx.font = '26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('本当に現実を直視しますか？', canvas.width / 2, canvas.height / 2 - 60);
    ctx.textAlign = 'left';

    const confBtnW = 300, confBtnH = 50;
    const confBtnX = canvas.width / 2 - confBtnW / 2;
    drawUiButton(confBtnX, canvas.height / 2, confBtnW, confBtnH,
      'はい', chooseBossEncounterConfirmYes,
      { fillStyle: 'rgba(84, 20, 20, 0.7)', strokeStyle: '#ff8a80' });
    drawUiButton(confBtnX, canvas.height / 2 + 60, confBtnW, confBtnH,
      '現実逃避する', chooseBossEncounterAvoid,
      { fillStyle: 'rgba(60, 60, 60, 0.6)', strokeStyle: '#90a4ae' });
  }

  // 「同僚と遊ぶ」アドベンチャーパート：発言・地の文を「\n」区切りのブロック単位で、同じ場所にフェードイン→
  // 表示→（進める操作で）フェードアウトしながら次のブロックへ切り替える。最後まで進んだら選択肢を表示する
  if (adventureState && !gameOver && !gameClear) {
    const node = adventureState.scene.nodes[adventureState.nodeId];
    ctx.fillStyle = 'rgba(4, 6, 12, 0.92)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const partnerGender = partnerGenderById[selectedPartnerIcon];
    const bodyText = resolveGenderedAdventureText(node.text, partnerGender);
    const lineBlocks = bodyText.split('\n');
    const lineIndex = Math.min(adventureState.lineIndex || 0, lineBlocks.length - 1);
    const isLastBlock = lineIndex >= lineBlocks.length - 1;

    // フェードイン中は0→1、フェードアウト中は1→0、安定表示中（フェードなし）は常に1
    let lineAlpha = 1;
    if (adventureState.lineFadePhase === 'in') {
      lineAlpha = Math.max(0, Math.min(1, adventureState.lineFadeTimerMs / adventureLineFadeInDurationMs));
    } else if (adventureState.lineFadePhase === 'out') {
      lineAlpha = Math.max(0, 1 - adventureState.lineFadeTimerMs / adventureLineFadeOutDurationMs);
    }

    ctx.save();
    ctx.globalAlpha = lineAlpha;
    ctx.fillStyle = '#ffe0b2';
    ctx.font = `bold 21px ${adventureMinchoFont}`;
    ctx.textAlign = 'left';
    const textLines = wrapTextToWidth(lineBlocks[lineIndex], canvas.width - 160);
    textLines.forEach((line, i) => {
      ctx.fillText(line, 80, 240 + i * 30);
    });
    ctx.restore();

    if (!isLastBlock) {
      // まだ続きがある間は、選択肢の代わりにクリックを促す表示だけを出す
      ctx.fillStyle = '#cfd8dc';
      ctx.font = `14px ${adventureMinchoFont}`;
      ctx.textAlign = 'center';
      ctx.fillText('▼ クリック / タップで続ける', canvas.width / 2, 240 + textLines.length * 30 + 36);
      ctx.textAlign = 'left';
    } else {
      const btnW2 = 600, btnH2 = 52;
      const btnX2 = canvas.width / 2 - btnW2 / 2;
      const choicesStartY = 240 + textLines.length * 30 + 36;
      node.choices.forEach((choice, i) => {
        const choiceLabel = resolveGenderedAdventureText(choice.label, selectedGender);
        drawUiButton(btnX2, choicesStartY + i * 62, btnW2, btnH2, `${i + 1}. ${choiceLabel}`,
          () => chooseAdventureOption(i), { font: `bold 19px ${adventureMinchoFont}` });
      });

      ctx.fillStyle = '#cfd8dc';
      ctx.font = `14px ${adventureMinchoFont}`;
      ctx.textAlign = 'center';
      ctx.fillText('数字キー / タップで選択',
        canvas.width / 2, choicesStartY + node.choices.length * 62 + 20);
      ctx.textAlign = 'left';
    }
  }

  // 爆発直後は画面全体へ白い半透明レイヤーを重ねてフラッシュさせる
  if (explosionFlashTimer > 0) {
    const flashAlpha = 0.75 * (explosionFlashTimer / explosionEffectDuration);
    ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 同僚弾の被弾直後は赤いフラッシュを重ねる
  if (friendlyFireHitFlashTimer > 0) {
    const hitFlashAlpha = 0.45 * (friendlyFireHitFlashTimer / friendlyFireHitEffectDuration);
    ctx.fillStyle = `rgba(255, 60, 80, ${hitFlashAlpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 一日の終わりの演出：黒くフェードアウト→（この間に敵を再配置）→クリック/タップ待ち→フェードイン
  if (dayTransitionPhase) {
    let alpha;
    if (dayTransitionPhase === 'out') {
      const t = Math.max(0, Math.min(1, dayTransitionTimer / dayTransitionDurationMs));
      alpha = 1 - t;
    } else if (dayTransitionPhase === 'waiting') {
      alpha = 1;
    } else {
      const t = Math.max(0, Math.min(1, dayTransitionTimer / dayTransitionDurationMs));
      alpha = t;
    }
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (alpha > 0.6) {
      ctx.fillStyle = `rgba(255, 255, 255, ${dayTransitionPhase === 'waiting' ? 1 : (alpha - 0.6) / 0.4})`;
      ctx.font = '36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`DAY ${dayNumber}`, canvas.width / 2, canvas.height / 2);
      if (dayTransitionPhase === 'waiting') {
        ctx.font = '20px sans-serif';
        ctx.fillText('クリック / タップで次の日へ', canvas.width / 2, canvas.height / 2 + 40);
      }
      ctx.textAlign = 'left';
    }
  }

  // 重要通知は最前面に表示し、クリック／タップされるまでゲームを停止する。
  // 本文・詳細文とも、枠からはみ出さないよう幅に応じて折り返し、必要な行数ぶん枠の高さを広げる
  if (acknowledgementNotice) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const noticeW = 560;
    const noticePaddingX = 30;
    const noticeTextMaxWidth = noticeW - noticePaddingX * 2;
    const titleFont = 'bold 26px sans-serif';
    const titleLineHeight = 32;
    const detailFont = '15px sans-serif';
    const detailLineHeight = 20;
    const topPadding = 30;
    const gapAfterTitle = 12;
    const gapBeforePrompt = 22;
    const promptLineHeight = 20;
    const bottomPadding = 22;

    ctx.textAlign = 'center';
    ctx.font = titleFont;
    const titleLines = wrapTextToWidth(acknowledgementNotice.text, noticeTextMaxWidth);
    let detailLines = [];
    if (acknowledgementNotice.detail) {
      ctx.font = detailFont;
      detailLines = wrapTextToWidth(acknowledgementNotice.detail, noticeTextMaxWidth);
    }

    const noticeH = Math.max(210, topPadding + titleLines.length * titleLineHeight +
      (detailLines.length > 0 ? gapAfterTitle + detailLines.length * detailLineHeight : 0) +
      gapBeforePrompt + promptLineHeight + bottomPadding);
    const noticeX = canvas.width / 2 - noticeW / 2;
    const noticeY = Math.max(20, (canvas.height - noticeH) / 2);

    ctx.fillStyle = 'rgba(12, 20, 34, 0.96)';
    ctx.fillRect(noticeX, noticeY, noticeW, noticeH);
    ctx.strokeStyle = acknowledgementNotice.color;
    ctx.lineWidth = 3;
    ctx.strokeRect(noticeX, noticeY, noticeW, noticeH);

    ctx.textBaseline = 'top';
    let cursorY = noticeY + topPadding;
    ctx.fillStyle = acknowledgementNotice.color;
    ctx.font = titleFont;
    titleLines.forEach(line => {
      ctx.fillText(line, canvas.width / 2, cursorY);
      cursorY += titleLineHeight;
    });
    if (detailLines.length > 0) {
      cursorY += gapAfterTitle;
      ctx.fillStyle = '#eceff1';
      ctx.font = detailFont;
      detailLines.forEach(line => {
        ctx.fillText(line, canvas.width / 2, cursorY);
        cursorY += detailLineHeight;
      });
    }
    cursorY += gapBeforePrompt;
    ctx.fillStyle = '#fff59d';
    ctx.font = '16px sans-serif';
    ctx.fillText('クリック / タップで再開', canvas.width / 2, cursorY);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // 特殊スキルの3択画面。数字キー1～3で取得する
  // （日付が変わる演出の暗転と昇進が重なることがあるため、それらより前面に描画する）
  if (specialSkillSelectionActive) {
    const selectionLocked = Date.now() < specialSkillSelectionUnlockAt;

    ctx.fillStyle = 'rgba(8, 10, 24, 0.9)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e1bee7';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(specialSkillSelectionTitle, canvas.width / 2, 70);
    ctx.textAlign = 'left';

    // 表示された3択が気に入らない場合、残り回数の範囲でリロール（選び直し）できる
    const rerollBtnW = 190, rerollBtnH = 34;
    const rerollAvailable = !selectionLocked && specialSkillRerollsRemaining > 0;
    drawUiButton(canvas.width / 2 - rerollBtnW / 2, 82, rerollBtnW, rerollBtnH,
      `リロール（残${specialSkillRerollsRemaining}回）`,
      rerollAvailable ? rerollSpecialSkillChoices : () => {},
      rerollAvailable
        ? { fillStyle: 'rgba(103, 58, 183, 0.6)', strokeStyle: '#ce93d8', font: 'bold 14px sans-serif' }
        : { fillStyle: 'rgba(60, 60, 60, 0.5)', strokeStyle: '#616161', textColor: '#9e9e9e', font: 'bold 14px sans-serif' });

    ctx.save();
    if (selectionLocked) ctx.globalAlpha = 0.5; // 誤選択防止の猶予中は、選べないことが分かるよう薄く表示する
    const cardX = 90;
    const cardWidth = canvas.width - 180;
    const descFont = '16px sans-serif';
    const descLineHeight = 20;
    const cardTextTop = 34;
    const cardPaddingBottom = 20;
    const cardGap = 14;
    ctx.font = descFont;
    let cardY = 128;
    specialSkillChoices.forEach((skill, index) => {
      const descLines = wrapTextToWidth(skill.description, cardWidth - 44);
      const cardHeight = Math.max(95, cardTextTop + descLines.length * descLineHeight + cardPaddingBottom);
      const currentSkillLevel = specialSkillLevels.get(skill.id) || 0;

      ctx.fillStyle = 'rgba(103, 58, 183, 0.45)';
      ctx.fillRect(cardX, cardY, cardWidth, cardHeight);
      ctx.strokeStyle = '#ce93d8';
      ctx.lineWidth = 2;
      ctx.strokeRect(cardX, cardY, cardWidth, cardHeight);

      ctx.textAlign = 'left';
      ctx.fillStyle = 'white';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(
        `${index + 1}. ${skill.name}  Lv.${currentSkillLevel} → Lv.${currentSkillLevel + 1}`,
        cardX + 22,
        cardY + cardTextTop
      );
      ctx.fillStyle = '#e0e0e0';
      ctx.font = descFont;
      descLines.forEach((line, lineIndex) => {
        ctx.fillText(line, cardX + 22, cardY + cardTextTop + 26 + lineIndex * descLineHeight);
      });

      // 猶予中はタップ可能領域自体を登録しない（キーボードもchooseSpecialSkill側で無視される）
      if (!selectionLocked) {
        uiButtons.push({ x: cardX, y: cardY, w: cardWidth, h: cardHeight, action: () => chooseSpecialSkill(index) });
      }
      cardY += cardHeight + cardGap;
    });
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff59d';
    ctx.font = '18px sans-serif';
    ctx.fillText(
      selectionLocked ? '少々お待ちください…' : '数字キー 1～3 / タップで選択',
      canvas.width / 2, 530
    );
    ctx.textAlign = 'left';
  }

  // 通常時、SANが低いときは文字が読める程度の軽い歪みをかける
  if (!gameOver && !gameClear && san <= sanDistortionThreshold) {
    applyScreenDistortion(sanLowDistortionAmplitude);
  }
  // 寿命が50を切ってから0に近づくにつれて、画面端が暗くひび割れていく
  if (!gameOver && !gameClear) {
    drawLifespanCrackEffect();
  }
  // 盗聴・スニッフィング：一定時間、画面周辺が暗くぼやけて見えづらくなる
  if (!gameOver && !gameClear && fixedEnemyVisionObscuredTimerMs > 0) {
    ctx.save();
    const vignetteAlpha = Math.min(0.55, 0.2 + 0.35 * Math.min(1, fixedEnemyVisionObscuredTimerMs / 1500));
    const gradient = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, canvas.height * 0.2,
      canvas.width / 2, canvas.height / 2, canvas.height * 0.75
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, `rgba(0, 0, 0, ${vignetteAlpha})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // セットアップ画面の切り替え演出：選択直後、画面全体を暗転させて次のページへ切り替える
  if (setupFadePhase === 'out') {
    const fadeAlpha = 1 - Math.max(0, Math.min(1, setupFadeTimer / setupFadeDurationMs));
    ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 自機が力尽きた演出中：通常のゲーム画面の上に暗転・明滅・フェードアウトを重ね、
  // その間はどのボタンにも触れられないようにする
  if (deathSequence) {
    drawDeathSequenceOverlay();
    uiButtons.length = 0;
  }
}
// ===== メインループ =====
// 状態更新と画面描画を、ブラウザの描画タイミングに合わせて繰り返す
function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}
gameLoop();
