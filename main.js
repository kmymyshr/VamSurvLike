// ===== ゲーム画面（Canvas）の準備 =====
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
// SAN低下時の画面歪みエフェクト用に、完成した1フレームを一時的に複製しておくためのオフスクリーンCanvas
const distortionCanvas = document.createElement('canvas');
distortionCanvas.width = canvas.width;
distortionCanvas.height = canvas.height;
const distortionCtx = distortionCanvas.getContext('2d');
console.log('main.js loaded');
const player = {
  x: 400,
  y: 300,
  radius: 15,
  speed: 4,
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
  '問い合わせ対応',
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
const typeWeights = enemyTypeNames.map((_, i) => Math.pow(rarityRatio, i));
const totalWeight = typeWeights.reduce((a, b) => a + b, 0);

// 敵の初期生成より前に参照できるよう、ランクをここで宣言する
let rank = 1;
// getAllowedMaxTypeIndexByRankがゲーム開始前のウェーブ生成時にも参照するため、ここで宣言する
let weeklyQuotaAchievedEarly = false; // 週の途中でノルマを達成済みか
// setEnemyStatsが敵の強さを日数に応じて調整する際に参照するため、ここで宣言する
let dayNumber = 1; // 実際に稼働した日数（1始まり）

function chooseEnemyTypeIndex() {
  // 現在のランクに応じて、出現可能な敵の上限を決める
  const maxIdx = getAllowedMaxTypeIndexByRank();
  // 出現可能な敵だけに絞って重みの合計を計算する
  const truncated = typeWeights.slice(0, maxIdx + 1);
  const sum = truncated.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < truncated.length; i++) {
    r -= truncated[i];
    if (r <= 0) return i;
  }
  return truncated.length - 1;
}

// 日数が経つごとに敵がどんどん強くなるようにする倍率（残り工数＝HPと、SAN攻撃力の両方に掛ける）
const enemyDifficultyGrowthPerDay = 0.06;
const enemyHpMultiplier = 3; // 敵の基本HPを従来の約3倍にする
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
const maxEnemies = 3; // 1ウェーブで同時に出現する敵（仕事）の数
const waveCooldownDelayMs = 900; // ウェーブを全滅させてから次のウェーブが出るまでの間
const enemyCollisionRadius = 32;
const minDeadlineMs = 5000; // 納期の最短時間（5秒）
const maxDeadlineMs = 30000; // 納期の最長時間（30秒）
let specialDeadlineMultiplier = 1;
let waveCooldownMs = 0; // 次のウェーブ出現までの残り時間

function spawnEnemy(typeIndex) {
  // 既存の敵やプレイヤーと重ならない位置を探す
  let attempts = 0;
  let p;
  do {
    p = spawnEnemyOffscreen();
    attempts++;
    // 画面端の同じ位置に固まらないよう、少しだけランダムにずらす
    p.x += (Math.random() - 0.5) * 40;
    p.y += (Math.random() - 0.5) * 40;
    const tooClose = enemies.some(en => Math.hypot(en.x - p.x, en.y - p.y) < (en.radius + enemyCollisionRadius + 20)) || Math.hypot(player.x - p.x, player.y - p.y) < 150;
    if (!tooClose) break;
  } while (attempts < 18);
  const e = { x: p.x, y: p.y, radius: enemyCollisionRadius };
  setEnemyStats(e, typeIndex);
  e.touched = false;
  // 敵ごとに5～30秒のランダムな納期を設定する
  e.deadlineMs = (
    minDeadlineMs + Math.random() * (maxDeadlineMs - minDeadlineMs)
  ) * specialDeadlineMultiplier;
  enemies.push(e);
  return e;
}

// 現在の仕事（敵）を全て片付けるまで、次のウェーブは出現しない
function spawnWave() {
  for (let i = 0; i < maxEnemies; i++) spawnEnemy();
}

// ゲーム開始時の最初のウェーブを生成する
spawnWave();
// ===== 弾・スコア・ゲーム状態 =====
// プレイヤーが発射した弾を保存する配列
const bullets = [];
const baseFireRate = 350; // 基本の発射間隔（従来の半分、ミリ秒）
let lastFire = 0;
let score = 0;
let gameOver = false;
let gameClear = false;
let startScreen = false;
// 'gender' → 'partner-icon' → null（完了、startScreenへ）の順に進む起動時のセットアップ画面
let setupStep = 'gender';

// ===== アイコン選択後のひとことメッセージ演出（表示→フェードアウトして次の画面へ） =====
const playerIconGreetingLines = [
  'よし、今日も気合入れていくぞ！',
  '負けてられない、やってやるぞ！',
  '今日も一日、全力でいこう！'
];
const partnerIconGreetingLines = [
  'よろしくお願いします！一緒に頑張りましょう！',
  '私も負けていられません！全力で支えます！',
  '頼りにしてます。一緒に乗り越えましょう！'
];
const iconGreetingHoldMs = 1400; // ひとことを表示し続ける時間
const iconGreetingFadeMs = 500; // フェードアウトにかける時間
let iconGreetingPhase = null; // null / 'hold' / 'fadeout'
let iconGreetingTimer = 0;
let iconGreetingIcon = '';
let iconGreetingImage = null; // 画像（同僚アイコンなど）を表示する場合はImage要素を入れる
let iconGreetingText = '';
let iconGreetingOnComplete = null;

// アイコンの下にひとことを表示し、少し経ったらフェードアウトしてonCompleteへ進む
// iconImageを渡した場合は絵文字の代わりに画像を表示する
function startIconGreeting(icon, text, onComplete, iconImage = null) {
  iconGreetingIcon = icon;
  iconGreetingImage = iconImage;
  iconGreetingText = text;
  iconGreetingPhase = 'hold';
  iconGreetingTimer = iconGreetingHoldMs;
  iconGreetingOnComplete = onComplete;
}

// ===== エンディング =====
// 'true' | 'normal' | 'bad-san' | 'bad-lifespan' | 'bad-partner-shot' のいずれか。gameOver / gameClear になる瞬間に確定する
let endingType = null;
// 週末ごとの特殊イベントで正しい選択をし続けているか（詳細な内容は別途実装予定。誤った選択で false になる）
let allSpecialEventChoicesCorrect = true;
function recordSpecialEventChoiceResult(isCorrect) {
  if (!isCorrect) allSpecialEventChoicesCorrect = false;
}
// トゥルーエンドの条件：最終ランク（Rank10）に到達し、かつ週末の特殊イベントの選択をすべて正しく行っていること
function isTrueEndEligible() {
  return rank >= 10 && allSpecialEventChoicesCorrect && !partnerEverLost;
}

// ===== 納期切れの爆発エフェクト =====
const explosionEffectDuration = 500; // フラッシュと揺れの継続時間（ミリ秒）
const friendlyFireHitEffectDuration = 300;
let explosionFlashTimer = 0;
let explosionShakeTimer = 0;
let friendlyFireHitFlashTimer = 0;

// ===== 脳疲労システム =====
const maxFatigue = 100;
let fatigue = 0; // 0が元気な状態、100が疲労の限界
let stunned = false;
const stunDuration = 2200; // 疲労が100になったときの行動不能時間（ミリ秒）
let stunTimer = 0;
let invincible = false;
const invincibleDuration = 1200; // 敵との接触後に無敵になる時間（ミリ秒）
let invincibleTimer = 0;
let lastUpdate = Date.now();
let gameClockMs = 0;
let gameTimeScale = 1;
let isPaused = false;

// 手動攻撃と自動攻撃の状態
let autoFireEnabled = false;
let mouseFireHeld = false;
const mousePosition = { x: player.x + 100, y: player.y };

// 1秒ごと、または1発ごとに変化する疲労関連の値
const movingDrainPerSec = 6; // 移動時の1秒あたりの疲労量（現在は未使用）
const firingFatiguePerShot = 10; // 1発撃つごとに増える疲労量（stunになりにくいよう軽減）
const idleRecoveryPerSec = 12; // 待機時の1秒あたりの回復量
// 朝から夜にかけて時間が経つほど、脳疲労がたまりやすくなる（デフォルトのデバフ）
const timeOfDayFatigueMultiplierMax = 1.8; // 終業時刻ごろに到達する最大倍率（残業中はさらにやや伸びる）
const stunRecoveryPerSec = 18; // 行動不能中は通常より早く疲労を回復する
const fireRateMultiplier = 1.5; // 疲労が多いほど発射間隔を延ばす倍率
const baseBulletDamage = 2; // 疲労がないときの基本攻撃力

// ===== 回復アイテム（チョコレート） =====
const chocolateLifetimeMs = 10000; // 出現してから消えるまでの時間（10秒）
const chocolateBlinkMs = 3000; // 消える3秒前から点滅する
const chocolateRecoveryRatio = 0.3; // 最大値の30%ぶん脳疲労を減らす
const chocolateRadius = 22;
let chocolate = null;
let chocolateSpawnTimerMs = getRandomChocolateSpawnDelay();

// 次のチョコレートは8～15秒後に出現する
function getRandomChocolateSpawnDelay() {
  return 8000 + Math.random() * 7000;
}

function spawnChocolate() {
  const margin = chocolateRadius + 20;
  chocolate = {
    x: margin + Math.random() * (canvas.width - margin * 2),
    y: margin + Math.random() * (canvas.height - margin * 2),
    radius: chocolateRadius,
    remainingMs: chocolateLifetimeMs
  };
}

// ===== ゲーム内の時刻・一日進行システム =====
const hourMs = 5000; // 現実の5秒をゲーム内の1時間として扱う
const dayStartHour = 9;
const dayEndHour = 18;
// 定時報告が残っている場合、終業時刻を過ぎても最大この時刻まで残業として居残れる
const maxOvertimeHour = 24;
const overtimeSanDrainPerSec = 2; // 残業中、1秒あたり減少するSAN
const overtimeLifespanDrainPerSec = 0.6; // 残業中、1秒あたり減少する寿命
const partnerOvertimeDrainRatio = 1.5; // 残業中の同僚のSAN・寿命減少は、自機の減少値のこの倍率
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

// ===== DAYカウンターと週次ノルマシステム =====
// dayNumber変数は、敵の強さ調整に使うためファイル前半で宣言済み
let weeklyKillQuota = 0; // 今週の撃破ノルマ
let weeklyScoreQuota = 0; // 今週のスコア獲得ノルマ
let weeklyKills = 0; // 今週の撃破数
let weeklyScoreGained = 0; // 今週のスコア獲得量（減点は含まない）
let weekendWorkChoice = false; // 「休日出勤しますか」の選択待ち
let restActivityChoice = false; // 「休日の過ごし方」3択の選択待ち
let restStudyPending = false; // 休日の「勉強」からスキル選択を開いた後の後続処理待ち
let weekendWorkQuotaChoice = false; // 休日出勤中にノルマ達成し、「家に帰りますか」の選択待ち
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

// ===== 時刻イベント（定時報告・昼食・クイズ） =====
function getRandomEventPosition(radius = 24) {
  const margin = radius + 24;
  return {
    x: margin + Math.random() * (canvas.width - margin * 2),
    // 窓の範囲を避け、プレイ領域の中央より下へ配置する
    y: eventSpawnMinY + Math.random() * (canvas.height - eventSpawnMinY - margin)
  };
}

// --- 定時報告：3日ごとの16時に現れる、移動しない高耐久ターゲット ---
const scheduledReportIntervalDays = 3;
const scheduledReportHour = 16;
const scheduledReportBaseHp = 70;
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
  showMessage('16時：定時報告が発生！ 終業までに片付けよう', 3500, '#ffca28', '23px sans-serif');
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
      lunchState.orderMistake ? '昼食完了。順番違いでボーナス半減' : '昼食を順番どおり完食！ フルボーナス',
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
const quizChancePerOpportunity = 0.2;
const maxWeeklyQuizCount = 2;
const quizAnswerRadius = 23;
const quizAnswerLockDurationMs = 1500; // 出現直後に誤って踏んで回答してしまわないための猶予時間
let weeklyQuizCount = 0;
let quizState = null;
let quizAnswerUnlockAt = 0; // この時刻（Date.now()基準）を過ぎるまで選択肢に触れても回答にならない
let internalItKnowledge = 0;
let internalCommunicationSkill = 0;
const quizQuestions = [
  { category: 'it', text: 'HTTPSが主に保護するものは？', choices: ['通信内容', '画面サイズ', 'CPU温度'], correct: 0 },
  { category: 'it', text: 'バックアップの目的は？', choices: ['データ復旧', '回線高速化', '文字拡大'], correct: 0 },
  { category: 'it', text: '強いパスワードに適するものは？', choices: ['長く複雑', '誕生日', 'password'], correct: 0 },
  { category: 'communication', text: '認識違いを減らす行動は？', choices: ['復唱・確認', '推測で進行', '黙って保留'], correct: 0 },
  { category: 'communication', text: '問題報告で最初に伝えるものは？', choices: ['結論と影響', '雑談', '言い訳'], correct: 0 },
  { category: 'communication', text: '意見が対立したとき有効なのは？', choices: ['目的を確認', '無視する', '声量で勝つ'], correct: 0 }
];

function startQuizEvent() {
  if (quizState || weeklyQuizCount >= maxWeeklyQuizCount) return;
  const source = quizQuestions[Math.floor(Math.random() * quizQuestions.length)];
  // 正解位置が固定化しないよう選択肢を並べ替える
  const shuffled = source.choices.map((text, index) => ({ text, correct: index === source.correct }))
    .sort(() => Math.random() - 0.5);
  const answerTokens = [];
  shuffled.forEach((choice, index) => {
    let position;
    let attempts = 0;
    do {
      position = getRandomEventPosition(quizAnswerRadius);
      attempts++;
    } while (attempts < 20 && answerTokens.some(token =>
      Math.hypot(token.x - position.x, token.y - position.y) < 90));
    answerTokens.push({
      ...position,
      radius: quizAnswerRadius,
      number: index + 1,
      correct: choice.correct
    });
  });
  quizState = {
    category: source.category,
    text: source.text,
    choices: shuffled.map(choice => choice.text),
    answerTokens
  };
  weeklyQuizCount++;
  quizAnswerUnlockAt = Date.now() + quizAnswerLockDurationMs;
  showMessage('突発クイズ！ マップ上の番号を取って回答', 2800, '#90caf9', '22px sans-serif');
}

function answerQuiz(answerIndex) {
  if (!quizState) return;
  const answer = quizState.answerTokens[answerIndex];
  if (!answer) return;
  if (answer.correct) {
    if (quizState.category === 'it') internalItKnowledge++;
    else internalCommunicationSkill++;
    showAcknowledgementNotice('クイズ正解！ 新しい知識を得た', '#69f0ae',
      quizState.category === 'it' ? 'IT知識が上昇しました。' : 'コミュニケーション知識が上昇しました。');
    if (partner.active) showRandomPartnerSpeechBubble(partnerQuizCorrectLines, '#69f0ae', partnerQuizCorrectStressedLines);
  } else {
    showMessage('クイズ不正解…', 2200, '#ef9a9a', '22px sans-serif');
    if (partner.active) showRandomPartnerSpeechBubble(partnerQuizWrongLines, '#ffb74d', partnerQuizWrongStressedLines);
  }
  quizState = null;
}

function processTimedHourEvents(previousHour, newHour) {
  const lastEventHour = Math.min(newHour, dayEndHour);
  for (let hour = previousHour + 1; hour <= lastEventHour; hour++) {
    if (hour === lunchWarningHour) {
      showMessage('もうすぐ12時。昼食の順番を覚える準備をしよう', 3000, '#ffe082', '21px sans-serif');
    }
    if (hour === lunchHour) startLunchEvent();
    if (hour === lunchExpirationHour) beginLunchExpiration();
    if (hour === scheduledReportHour) spawnScheduledReport();
    const weekday = currentDate.getDay();
    const isWeekday = weekday >= 1 && weekday <= 5 && !isHoliday(currentDate);
    if (isWeekday && quizHours.includes(hour) && weeklyQuizCount < maxWeeklyQuizCount && !quizState &&
        Math.random() < quizChancePerOpportunity) {
      startQuizEvent();
    }
  }
}

function resolveTimedSystemsAtDayEnd() {
  failScheduledReport();
  finishLunchAtDayEnd();
  quizState = null;
}

// 一日の終了処理（終業時刻・残業の限界時刻・定時報告を残業中に片付けた場合のいずれからも呼ばれる）
function endWorkday() {
  resolveTimedSystemsAtDayEnd();
  if (gameOver || deathSequence) return;
  // 昇進判定は週末（および月末＝クリア判定の直前）にのみ行う
  if (isWeekEndDay(currentDate) || isLastDayOfMonth(currentDate)) {
    rankUpAtWeekEnd();
    if (acknowledgementNotice) return;
  }
  if (isLastDayOfMonth(currentDate)) {
    gameClear = true;
    endingType = isTrueEndEligible() ? 'true' : 'normal';
    sendScore(score);
    return;
  }
  // 週の最終稼働日なら週次ノルマを判定し、それ以外は自動的に翌日へ進む
  if (isWeekEndDay(currentDate)) {
    resolveWeekEnd();
  } else {
    startDayTransition(autoAdvanceDay);
  }
}
// ===== SAN（精神力）システム =====
const maxSan = 100;
let san = maxSan;

// SANが減少する量
const stunSanPenalty = 8;
const stunLifespanPenaltyMin = 2;
const stunLifespanPenaltyMax = 3;
const contactSanMultiplier = 4; // 接触時のSAN減少量 = 敵の種類 × この倍率
const playerFriendlyFireSanDamage = 2; // 同僚弾を自分が受けた際のダメージ
const playerFriendlyFireLifespanDamage = 2;
const partnerFriendlyFireSanDamage = 5; // 自分の弾を同僚が受けた際のダメージ
const partnerFriendlyFireLifespanDamage = 2;
const friendlyFireInvincibleDuration = 900;
let friendlyFireInvincibleTimer = 0;

// ===== 寿命（健康）システム =====
// SANダメージの蓄積や、脳疲労・SANの悪い状態が長く続くことで少しずつ削れていく。
// 0になったらSANとは別にゲームオーバーになる（＝一時的にSANを回復させても、慢性的な消耗の蓄積だけは元に戻らない）
const maxLifespan = 100;
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
// 'san'：画面・文字が歪みながらBADENDへ／'lifespan'：画面が停止し、徐々に白黒になってBADENDへ
let deathSequence = null; // { visualType, timer, duration, deathEndingType }
const sanDeathSequenceDurationMs = 1800;
const lifespanDeathSequenceDurationMs = 2200;
const sanDeathDistortionMinAmplitude = 3;
const sanDeathDistortionMaxAmplitude = 16;

function startDeathSequence(visualType, deathEndingType) {
  if (gameOver || deathSequence) return;
  deathSequence = {
    visualType,
    timer: 0,
    duration: visualType === 'lifespan' ? lifespanDeathSequenceDurationMs : sanDeathSequenceDurationMs,
    deathEndingType
  };
}

// SAN・寿命のいずれかが尽きたら演出を経てゲームオーバーにする（二重発火防止にgameOver/deathSequenceで一度だけ発火）
// どちらが尽きたかで演出とバッドエンドの種類を分ける
function checkVitalsGameOver(deathEndingType = null) {
  if (gameOver || deathSequence) return;
  if (san <= 0) {
    startDeathSequence('san', deathEndingType || 'bad-san');
  } else if (lifespan <= 0) {
    startDeathSequence('lifespan', deathEndingType || 'bad-lifespan');
  }
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
  'char_01', 'char_02', 'char_03', 'char_04', 'char_05', 'char_06',
  'char_07', 'char_08', 'char_09', 'char_10', 'char_11', 'char_12'
];
const partnerIconImageElements = {};
partnerIconChoices.forEach(id => {
  const img = new Image();
  img.src = `images/partner/${id}.png`;
  partnerIconImageElements[id] = img;
});
let selectedPartnerIcon = partnerIconChoices[0]; // nullの場合は「同僚なし」

// ===== 同僚 =====
const partnerMoveSpeed = 3.2;
const partnerFollowSpeedMultiplier = 0.45;
const partnerWanderChance = 0.8;
const partnerFollowOffsetX = -95;
const partnerFollowOffsetY = 65;
const partnerBaseFireRate = 700; // 自律攻撃の間隔（ミリ秒）
const partnerFiringFatiguePerShot = 8;
const partnerContactSanMultiplier = 3; // 接触時のSANダメージ = 敵の種類 × この倍率（プレイヤーよりやや軽め）
const partnerInvincibleDuration = 1200;
const partnerLossSanPenalty = 20; // 同僚が力尽きたとき、プレイヤーが受けるSANダメージ
const partnerRelationshipMax = 100;
const partnerRelationshipInitial = 50;
const partnerRelationshipSafeFireThreshold = 50;
const partnerRelationshipDamagePerHit = 15;
const partnerRelationshipRetaliationThreshold = 40;

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
  'SAN、削れてきてませんか…？',
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
    const pool = ratio <= 0.3 ? partnerStatusSanLowLines
      : ratio <= 0.7 ? partnerStatusSanMidLines
      : partnerStatusSanHighLines;
    showRandomPartnerSpeechBubble(pool, '#ce93d8');
  } else {
    const ratio = lifespan / maxLifespan;
    const pool = ratio <= 0.3 ? partnerStatusLifespanLowLines
      : ratio <= 0.7 ? partnerStatusLifespanMidLines
      : partnerStatusLifespanHighLines;
    showRandomPartnerSpeechBubble(pool, '#80cbc4');
  }
}

const partner = {
  active: false, // 「同僚なし」を選んだ場合や、力尽きた後はfalseのまま
  x: 0, y: 0, angle: 0,
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
  friendlyFireInvincibleTimer: 0,
  relationship: partnerRelationshipInitial, // 非表示。0～100で、低いほど自分へ反撃しやすい
  // 賢さ（0〜1、初期はランダム）：高いほど的が正確で、疲労時に無駄撃ちを避けやすい
  intelligence: 0.5,
  // 性格・向こう見ずさ（0〜1、初期はランダム）：高いほど疲労していても構わず撃ちたがる
  recklessness: 0.5
};
let partnerEverLost = false; // 一度でも力尽きたらtrue（トゥルーエンド条件に使う）
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
  partner.friendlyFireInvincibleTimer = 0;
  partner.relationship = partnerRelationshipInitial;
  partner.intelligence = Math.random();
  partner.recklessness = Math.random();
}

// 同僚のSANにダメージを与える（プレイヤーのdamageSanとは独立。同僚の生死のみに影響する）
function damagePartnerSan(amount) {
  if (amount <= 0 || !partner.active) return;
  partner.san = Math.max(0, partner.san - amount * specialSkillEffects.partnerSanDamageMultiplier);
}
// 味方の弾はSANと寿命を直接削る。連続被弾は専用の短い無敵時間で抑える。
function damagePlayerByFriendlyFire() {
  if (friendlyFireInvincibleTimer > 0) return false;
  san = Math.max(0, san - playerFriendlyFireSanDamage *
    specialSkillEffects.sanDamageMultiplier * specialSkillEffects.friendlyFireDamageMultiplier);
  lifespan = Math.max(0, lifespan - playerFriendlyFireLifespanDamage * specialSkillEffects.friendlyFireDamageMultiplier);
  friendlyFireInvincibleTimer = friendlyFireInvincibleDuration;
  friendlyFireHitFlashTimer = friendlyFireHitEffectDuration;
  explosionShakeTimer = Math.max(explosionShakeTimer, friendlyFireHitEffectDuration);
  checkVitalsGameOver('bad-partner-shot');
  showRandomPartnerSpeechBubble(partnerHitPlayerLines, '#ffab91', partnerHitPlayerStressedLines);
  return true;
}

function damagePartnerByFriendlyFire() {
  if (!partner.active || partner.friendlyFireInvincibleTimer > 0) return false;
  partner.san = Math.max(0, partner.san - partnerFriendlyFireSanDamage *
    specialSkillEffects.partnerSanDamageMultiplier * specialSkillEffects.friendlyFireDamageMultiplier);
  partner.lifespan = Math.max(0, partner.lifespan - partnerFriendlyFireLifespanDamage * specialSkillEffects.friendlyFireDamageMultiplier);
  partner.friendlyFireInvincibleTimer = friendlyFireInvincibleDuration;
  showRandomPartnerSpeechBubble(partnerHitByPlayerLines, '#ff8a65', partnerHitByPlayerStressedLines);
  partner.relationship = Math.max(0,
    partner.relationship - partnerRelationshipDamagePerHit);
  return true;
}

// 週末の特殊イベント（後日実装予定）から、同僚の賢さ・性格を恒久的に変化させるためのフック
function adjustPartnerTraits(intelligenceDelta, recklessnessDelta) {
  partner.intelligence = Math.max(0, Math.min(1, partner.intelligence + intelligenceDelta));
  partner.recklessness = Math.max(0, Math.min(1, partner.recklessness + recklessnessDelta));
}

// 自分が持つ特殊スキルに応じて、同僚の実効的な賢さを求める（基礎値はintelligenceのまま変えない）
function getPartnerEffectiveIntelligence() {
  let bonus = 0;
  bonus += (specialSkillLevels.get('learning-power') || 0) * 0.05;
  bonus += (specialSkillLevels.get('listening') || 0) * 0.04;
  bonus += (specialSkillLevels.get('logical-thinking') || 0) * 0.04;
  bonus -= (specialSkillLevels.get('self-centered') || 0) * 0.05;
  bonus -= (specialSkillLevels.get('inattentive') || 0) * 0.06;
  return Math.max(0, Math.min(1, partner.intelligence + bonus));
}

// 自分が持つ特殊スキルに応じて、同僚の実効的な性格（向こう見ずさ）を求める
function getPartnerEffectiveRecklessness() {
  let bonus = 0;
  bonus += (specialSkillLevels.get('proactiveness') || 0) * 0.05;
  bonus += (specialSkillLevels.get('rising-ambition') || 0) * 0.05;
  bonus -= (specialSkillLevels.get('stress-tolerance') || 0) * 0.05;
  bonus -= (specialSkillLevels.get('passivity') || 0) * 0.05;
  return Math.max(0, Math.min(1, partner.recklessness + bonus));
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

// 同僚の追従・ランダム移動・自律攻撃・被弾・寿命減少・退場判定をまとめて処理する
function updatePartner(dt) {
  if (!partner.active) return;

  partner.friendlyFireInvincibleTimer = Math.max(0,
    partner.friendlyFireInvincibleTimer - dt * 1000);

  // 疲労回復（プレイヤーの待機時回復と同じ割合を流用）
  partner.fatigue = Math.max(0, partner.fatigue - idleRecoveryPerSec * dt);

  // 追従する時間を減らし、画面内を広く自発的に徘徊する。
  partner.wanderTimer -= dt * 1000;
  if (partner.wanderTimer <= 0) {
    partner.wandering = Math.random() < partnerWanderChance;
    if (partner.wandering) {
      partner.wanderTarget = getRandomEventPosition(partner.radius);
    }
    partner.wanderTimer = 1800 + Math.random() * 2600;
  }
  const followTarget = partner.wandering
    ? partner.wanderTarget
    : { x: player.x + partnerFollowOffsetX, y: player.y + partnerFollowOffsetY };
  const fdx = followTarget.x - partner.x;
  const fdy = followTarget.y - partner.y;
  const fdist = Math.hypot(fdx, fdy);
  if (fdist > 2) {
    const movementSpeed = partnerMoveSpeed * (partner.wandering ? 1 : partnerFollowSpeedMultiplier);
    const step = Math.min(fdist, movementSpeed);
    partner.x += (fdx / fdist) * step;
    partner.y += (fdy / fdist) * step;
    partner.angle = Math.atan2(fdy, fdx);
  }
  clampToPlayableFloor(partner);
  pushEntityOutsideScheduledReport(partner);

  // 自律攻撃：最も近い敵へ向けて、既存の弾配列にそのまま追加する
  // 賢さ・性格・脳疲労に応じて、無駄撃ちを避けたり、狙いが不正確になったりする
  partner.fireTimer -= dt * 1000;
  if (partner.fireTimer <= 0 && (enemies.length > 0 || scheduledReport) && partner.fatigue < maxFatigue) {
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
      const relationshipHostility = Math.max(0,
        (partnerRelationshipRetaliationThreshold - partner.relationship) /
        partnerRelationshipRetaliationThreshold);
      const retaliationChance = partner.relationship <= partnerRelationshipRetaliationThreshold
        ? 0.2 + relationshipHostility * 0.3
        : 0;
      const retaliating = Math.random() < retaliationChance;
      // 定時報告が出ている間は、通常の仕事より優先して狙う。
      const target = retaliating ? player : (scheduledReport || nearestEnemy);
      // 賢さが高く、疲労が少なく、慎重な性格ほど命中精度（狙いの正確さ）が上がる
      const accuracy = Math.max(0.15, Math.min(1,
        0.35 + intelligence * 0.5 - fatigueRatio * 0.25 - recklessness * 0.1
      ));
      const scatterDegrees = (1 - accuracy) * 35 * (Math.random() - 0.5) * 2;
      const angle = Math.atan2(target.y - partner.y, target.x - partner.x) +
        scatterDegrees * Math.PI / 180;
      const bulletSpeed = 6;
      const damage = Math.max(1, Math.round(
        baseBulletDamage * specialSkillEffects.partnerDamageMultiplier * (1 + skillLevel * 0.08)
      ));
      // 関係性が50以上なら、現在の自分位置へ通る弾道は撃たずに見送る。
      const shouldAvoidShot = partner.relationship >= partnerRelationshipSafeFireThreshold &&
        wouldPartnerShotHitCurrentPlayer(angle);
      if (shouldAvoidShot) {
        partner.fireTimer = 200;
      } else {
        bullets.push({
          x: partner.x + Math.cos(angle) * partner.radius,
          y: partner.y + Math.sin(angle) * partner.radius,
          vx: Math.cos(angle) * bulletSpeed,
          vy: Math.sin(angle) * bulletSpeed,
          radius: 4,
          damage,
          bounces: 0,
          owner: 'partner'
        });
        partner.fatigue = Math.min(maxFatigue,
          partner.fatigue + partnerFiringFatiguePerShot * getTimeOfDayFatigueMultiplier());
        partner.fireTimer = partnerBaseFireRate;
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
        damagePartnerSan(Math.ceil((en.type || 1) * partnerContactSanMultiplier * getEnemyDifficultyMultiplier()));
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

  // 退場判定：SANか寿命が尽きたら以後登場しなくなり、プレイヤーにもSANダメージが入る
  if (partner.san <= 0 || partner.lifespan <= 0) {
    partner.active = false;
    partnerEverLost = true;
    partnerLossReason = partner.lifespan <= 0 ? 'lifespan' : 'san';
    partnerLifespanAtLoss = partner.lifespan;
    showMessage('同僚が力尽きてしまった…', 4000, '#ef9a9a', '24px sans-serif');
    damageSan(partnerLossSanPenalty);
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

// ランクに応じて今週のノルマを再設定する
// 集中して手を止めずにプレイしてようやく届く程度の、ぎりぎり達成できる水準にしてある
function resetWeeklyQuotaForNewWeek() {
  weeklyKillQuota = 20 + (rank - 1) * 7;
  weeklyScoreQuota = 80 + (rank - 1) * 30;
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
    showMessage('今週のノルマ達成！残りは易しい仕事だけになります', 3500, '#69f0ae', '22px sans-serif');
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
const rankNames = [
  '未経験 / 新人',
  'テスター / 開発補助',
  'PG',
  'SE',
  '上級SE',
  'サブリーダー',
  'PL / プロジェクトリーダー',
  'PM / プロジェクトマネージャー',
  'PMO / ITコンサル / アーキテクト',
  '部長 / 事業責任者 / CTO'
];
// rank変数は、敵生成時に使うためファイル前半で宣言済み
// ミスなくほぼ完璧に立ち回った場合のみ最終ランクへ届く想定で、最終ランクだけ必要スコアを大きく跳ね上げてある
// 昇進判定は週ごとに行い、条件を満たしていれば複数ランクの飛び級もあり得る（checkRankUp参照）
const rankThresholds = [0, 40, 120, 280, 550, 950, 1500, 2300, 3500, 6000]; // 各ランクへの昇格に必要なスコア

// スキルレベルと経験値
// レベルが上がるほど必要経験値が増えていく（後半ほどレベルが上がりにくくなるようにするため）
let exp = 0;
const baseExpPerLevel = 30; // 最初のレベルアップに必要な経験値
const expPerLevelGrowth = 6; // レベルが1上がるごとに、次のレベルアップに必要な経験値が増える量
let skillLevel = 0;

// 指定レベルに到達するまでの累積必要経験値（レベルが上がるほど1レベルあたりの必要量が増える等差数列の和）
function expThresholdForLevel(level) {
  if (level <= 0) return 0;
  return baseExpPerLevel * level + expPerLevelGrowth * level * (level - 1) / 2;
}

// 時刻によって敵を加速させる倍率
const speedDayIncreaseFactor = 0.6; // 終業時には最大60%速くなる

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
    supportFireChance: 0,
    bulletScatterChance: 0,
    enemyApproachSpeedMultiplier: 1,
    bulletBounceCount: 0,
    partnerDamageMultiplier: 1,
    partnerSanDamageMultiplier: 1,
    partnerLifespanDrainMultiplier: 1,
    friendlyFireDamageMultiplier: 1,
    mealOrderVisible: false
  };
}
const specialSkillEffects = getDefaultSpecialSkillEffects();

const specialSkills = [
  { id: 'dual-shot', name: 'マルチタスクA', description: 'レベルごとに同時発射する弾が1発増える' },
  { id: 'speed-up', name: '高速移動', description: '移動速度が1.5倍になる' },
  { id: 'fatigue-save', name: '省エネ射撃', description: '射撃による脳疲労を35%軽減する' },
  { id: 'rapid-fire', name: '高速連射', description: '発射間隔を25%短縮する' },
  { id: 'power-shot', name: '高威力弾', description: '弾のダメージが50%増える' },
  { id: 'triple-shot', name: 'マルチタスクB', description: '正面と左右20度へ3発同時に撃つ' },
  { id: 'chocolate-lover', name: 'チョコ好き', description: 'チョコレートの回復量が50%増える' },
  { id: 'deadline-master', name: '納期管理', description: '敵の納期が50%長くなる' },
  { id: 'mental-guard', name: 'メンタルガード', description: '受けるSANダメージを25%軽減する' },
  { id: 'high-speed-bullet', name: '処理速度', description: '弾の速度が40%上がる' },
  { id: 'short-sleeper', name: 'ショートスリーパー', description: 'stun時間を半分にする' },
  { id: 'through-power', name: 'スルー力', description: '受けるSANダメージ-15%。ただし気にしない分EXP獲得-10%' },
  { id: 'listening', name: '傾聴力', description: '人の話をよく聞き学びが早い。EXP獲得+15%。同僚の寿命減少-10%' },
  { id: 'proactiveness', name: '主体性', description: '自分から動くので発射間隔-7%・移動速度+8%' },
  { id: 'problem-solving', name: '問題解決力', description: '攻撃力+20%' },
  { id: 'logical-thinking', name: '論理的思考力', description: '筋道立てて評価されやすい。攻撃力+10%・獲得スコア+10%' },
  { id: 'priority-judgement', name: '優先順位判断力', description: '重要な仕事から片付け、獲得スコア+20%' },
  { id: 'learning-power', name: '学習力', description: 'EXP獲得+30%' },
  { id: 'stress-tolerance', name: 'ストレス耐性', description: '受けるSANダメージ-20%' },
  { id: 'business-manner', name: 'ビジネスマナー', description: '印象が良く、敵接触時のスコア減点-30%。同僚の寿命減少-10%' },
  { id: 'negotiation', name: '交渉力', description: '敵の納期+15%' },
  { id: 'self-centered', name: '自己中心性', description: '攻撃力+15%だが、敵の反感を買いSANダメージ+15%。同僚を気にかけず、同僚の被SANダメージ+20%' },
  { id: 'negative-thinking', name: '否定的思考', description: '素直に喜べず、チョコレートの回復量-30%' },
  { id: 'passivity', name: '消極性', description: '動きが鈍くなり発射間隔+15%・移動速度-10%' },
  { id: 'default-mode-network', name: 'デフォルトモードネットワーク', description: 'ぼーっとしている間に回復、待機時の脳疲労回復+40%' },
  { id: 'five-w-one-h', name: '５W１H', description: '説明が明確で仕事がスムーズ。敵の納期+10%・EXP獲得+10%' },
  { id: 'rising-ambition', name: '上昇志向', description: 'EXP獲得+25%だが、頑張りすぎて射撃疲労+15%' },
  { id: 'optimistic', name: '楽観的', description: '受けるSANダメージ-15%' },
  { id: 'pessimistic', name: '悲観的', description: '受けるSANダメージ+20%だが、慎重な見積りで敵の納期+10%' },
  { id: 'chocolate-addiction', name: 'チョコレート依存症', description: 'チョコレートの回復量+80%だが、待機時の回復-20%' },
  { id: 'communication', name: 'コミュニケーション力', description: 'レベルごとに15%の確率で援護射撃が発生する。同僚との意思疎通が良くなり、同僚の被SANダメージ-10%' },
  { id: 'report-shortage', name: '報連相不足', description: '情報共有不足で敵の納期-15%' },
  { id: 'inattentive', name: '注意力散漫', description: 'レベルごとに20%の確率で弾がランダムにそれる' },
  { id: 'silo-tendency', name: '属人化傾向', description: '自分にしかできない仕事が集中し、敵の接近速度+15%' },
  { id: 'perfectionism', name: '完璧主義', description: '質は高いが時間がかかる。攻撃力+25%だが発射間隔+15%' },
  { id: 'network-specialist', name: 'ネットワークスペシャリスト', description: '弾が画面端でレベルごとに1回多く跳ね返る' },
  { id: 'trust-relationship', name: '信頼関係', description: '同僚との信頼関係が深まり、同僚の攻撃力+20%・被SANダメージ-15%' },
  { id: 'teamwork', name: 'チームワーク', description: '自分と同僚の弾が互いに当たった時の被ダメージが50%軽減される' },
  { id: 'meal-foresight', name: '先読み力', description: '昼食に登場する料理に、出現する順番の番号が表示されるようになる（習得は1回のみ）', maxLevel: 1 }
];

// スキルIDと取得レベルを対応させて保存する（これが唯一の正となる状態）
const specialSkillLevels = new Map();
let specialSkillChoices = [];
let specialSkillSelectionActive = false;
let specialSkillSelectionTitle = '';
let pendingSpecialSkillSelections = 0;

// 1レベルぶんの効果を specialSkillEffects / specialDeadlineMultiplier に加える（副作用なしの純粋な差分適用）
function applySkillEffectDelta(skillId) {
  switch (skillId) {
    case 'dual-shot': specialSkillEffects.multiTaskLevel++; break;
    case 'speed-up': specialSkillEffects.moveSpeedMultiplier *= 1.5; break;
    case 'fatigue-save': specialSkillEffects.firingFatigueMultiplier *= 0.65; break;
    case 'rapid-fire': specialSkillEffects.fireRateMultiplier *= 0.75; break;
    case 'power-shot': specialSkillEffects.damageMultiplier *= 1.5; break;
    case 'triple-shot': specialSkillEffects.tripleShotLevel++; break;
    case 'chocolate-lover': specialSkillEffects.chocolateRecoveryMultiplier *= 1.5; break;
    case 'deadline-master': specialDeadlineMultiplier *= 1.5; break;
    case 'mental-guard': specialSkillEffects.sanDamageMultiplier *= 0.75; break;
    case 'high-speed-bullet': specialSkillEffects.bulletSpeedMultiplier *= 1.4; break;
    case 'short-sleeper': specialSkillEffects.stunDurationMultiplier *= 0.5; break;

    case 'through-power':
      specialSkillEffects.sanDamageMultiplier *= 0.85;
      specialSkillEffects.expGainMultiplier *= 0.9;
      break;
    case 'listening':
      specialSkillEffects.expGainMultiplier *= 1.15;
      specialSkillEffects.partnerLifespanDrainMultiplier *= 0.9;
      break;
    case 'proactiveness':
      specialSkillEffects.fireRateMultiplier *= 0.93;
      specialSkillEffects.moveSpeedMultiplier *= 1.08;
      break;
    case 'problem-solving': specialSkillEffects.damageMultiplier *= 1.2; break;
    case 'logical-thinking':
      specialSkillEffects.damageMultiplier *= 1.1;
      specialSkillEffects.scoreGainMultiplier *= 1.1;
      break;
    case 'priority-judgement': specialSkillEffects.scoreGainMultiplier *= 1.2; break;
    case 'learning-power': specialSkillEffects.expGainMultiplier *= 1.3; break;
    case 'stress-tolerance': specialSkillEffects.sanDamageMultiplier *= 0.8; break;
    case 'business-manner':
      specialSkillEffects.contactScorePenaltyMultiplier *= 0.7;
      specialSkillEffects.partnerLifespanDrainMultiplier *= 0.9;
      break;
    case 'negotiation': specialDeadlineMultiplier *= 1.15; break;
    case 'self-centered':
      specialSkillEffects.damageMultiplier *= 1.15;
      specialSkillEffects.sanDamageMultiplier *= 1.15;
      specialSkillEffects.partnerSanDamageMultiplier *= 1.2;
      break;
    case 'negative-thinking': specialSkillEffects.chocolateRecoveryMultiplier *= 0.7; break;
    case 'passivity':
      specialSkillEffects.fireRateMultiplier *= 1.15;
      specialSkillEffects.moveSpeedMultiplier *= 0.9;
      break;
    case 'default-mode-network': specialSkillEffects.idleRecoveryMultiplier *= 1.4; break;
    case 'five-w-one-h':
      specialDeadlineMultiplier *= 1.1;
      specialSkillEffects.expGainMultiplier *= 1.1;
      break;
    case 'rising-ambition':
      specialSkillEffects.expGainMultiplier *= 1.25;
      specialSkillEffects.firingFatigueMultiplier *= 1.15;
      break;
    case 'optimistic': specialSkillEffects.sanDamageMultiplier *= 0.85; break;
    case 'pessimistic':
      specialSkillEffects.sanDamageMultiplier *= 1.2;
      specialDeadlineMultiplier *= 1.1;
      break;
    case 'chocolate-addiction':
      specialSkillEffects.chocolateRecoveryMultiplier *= 1.8;
      specialSkillEffects.idleRecoveryMultiplier *= 0.8;
      break;
    case 'communication':
      specialSkillEffects.supportFireChance += 0.15;
      specialSkillEffects.partnerSanDamageMultiplier *= 0.9;
      break;
    case 'report-shortage': specialDeadlineMultiplier *= 0.85; break;
    case 'inattentive': specialSkillEffects.bulletScatterChance += 0.2; break;
    case 'silo-tendency': specialSkillEffects.enemyApproachSpeedMultiplier *= 1.15; break;
    case 'perfectionism':
      specialSkillEffects.damageMultiplier *= 1.25;
      specialSkillEffects.fireRateMultiplier *= 1.15;
      break;
    case 'network-specialist': specialSkillEffects.bulletBounceCount += 1; break;
    case 'trust-relationship':
      specialSkillEffects.partnerDamageMultiplier *= 1.2;
      specialSkillEffects.partnerSanDamageMultiplier *= 0.85;
      break;
    case 'teamwork': specialSkillEffects.friendlyFireDamageMultiplier *= 0.5; break;
    case 'meal-foresight': specialSkillEffects.mealOrderVisible = true; break;
  }
}

// specialSkillLevels（レベルマップ）を唯一の正として、効果をゼロから再計算する
// スキル忘却イベントなどで習得レベルが変わった際に呼び出す
function recomputeSpecialSkillEffects() {
  Object.assign(specialSkillEffects, getDefaultSpecialSkillEffects());
  specialDeadlineMultiplier = 1;
  for (const [skillId, level] of specialSkillLevels.entries()) {
    for (let i = 0; i < level; i++) applySkillEffectDelta(skillId);
  }
}

const specialSkillSelectionLockDurationMs = 1000; // 表示直後の連続タップ／クリックによる誤選択を防ぐ猶予時間
let specialSkillSelectionUnlockAt = 0; // この時刻（Date.now()基準）を過ぎるまで選択を受け付けない

function openSpecialSkillSelection(title) {
  // 取得済みスキルも候補に含め、再取得するとレベルアップできる（ただしmaxLevelに達したスキルは除外する）
  const availableSkills = specialSkills.filter(skill =>
    !(skill.maxLevel && (specialSkillLevels.get(skill.id) || 0) >= skill.maxLevel));

  // Fisher-Yates法で候補をシャッフルし、先頭から3つ選ぶ
  for (let i = availableSkills.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availableSkills[i], availableSkills[j]] = [availableSkills[j], availableSkills[i]];
  }
  specialSkillChoices = availableSkills.slice(0, 3);
  specialSkillSelectionTitle = title;
  specialSkillSelectionActive = true;
  specialSkillSelectionUnlockAt = Date.now() + specialSkillSelectionLockDurationMs;
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
  applySkillEffectDelta(skill.id);
  if (skill.id === 'deadline-master') {
    // 取得した瞬間、今抱えている仕事の納期にも即座に反映する
    enemies.forEach(enemy => { enemy.deadlineMs *= 1.5; });
  }
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

  // 休日の「勉強」から呼ばれていた場合、ここでランダムイベント＋週明けへの進行を続ける
  if (restStudyPending) {
    restStudyPending = false;
    finishRestDayAndAdvanceToMonday();
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

function updateSkillEffects() {
  // 現在のexpが、次のレベルの必要経験値を超えている間、1レベルずつ上げていく
  // （必要経験値はexpThresholdForLevelにより後半ほど増えるため、レベルは徐々に上がりにくくなる）
  let newLevel = skillLevel;
  while (exp >= expThresholdForLevel(newLevel + 1)) {
    newLevel++;
  }
  if (newLevel > skillLevel) {
    const specialSkillCount = Math.floor(newLevel / 5) - Math.floor(skillLevel / 5);
    // 通常のレベルアップは表示せず、5レベルごとの特殊スキル習得のときだけ知らせる
    skillLevel = newLevel;
    queueSpecialSkillSelections(specialSkillCount);
  }
}

// Scoreが複数ランク分の条件を満たしていれば、飛び級で一気に昇格させる
function checkRankUp() {
  let promotions = 0;
  while (rank < 10 && score >= rankThresholds[rank]) {
    rank++;
    promotions++;
  }
  return promotions;
}

// 週末（週の最終稼働日）にのみ呼び出す昇進判定
function rankUpAtWeekEnd() {
  const promotions = checkRankUp();
  if (promotions > 0) {
    const jumpNote = promotions > 1 ? `（${promotions}階級飛び級！）` : '';
    showAcknowledgementNotice('昇進しました！ ' + rank + ' ' + rankNames[rank-1] + jumpNote,
      '#ffeb3b', '新しい役職での一週間が始まります。');
  }
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
function autoAdvanceDay() {
  currentDate.setDate(currentDate.getDate() + 1);
  fatigue = Math.max(0, fatigue - dayFatigueRecover);
  san = Math.min(maxSan, san + daySanRecover);
  dayStartTime = gameClockMs;
  lastHourTime = gameClockMs;
  currentHour = dayStartHour;
  stunned = false;
  dayNumber++;
  if (currentDate.getDay() === 1) {
    resetWeeklyQuotaForNewWeek();
  }
  lastUpdate = Date.now();
}

// 週末（土日祝日）を飛ばして次の月曜から新しい週を始める
function jumpToNextMondayAndResetWeek() {
  currentDate = nextMonday(currentDate);
  dayStartTime = gameClockMs;
  lastHourTime = gameClockMs;
  currentHour = dayStartHour;
  stunned = false;
  dayNumber++;
  resetWeeklyQuotaForNewWeek();
  lastUpdate = Date.now();
}

// 週の終わりを迎えたときの、週末の過ごし方選択画面の見出し文。状況に応じて呼び分ける
let restActivityChoiceHeader = ['休日はどう過ごしますか？'];
const weekCompleteFlavorTexts = [
  '一週間が終わった！ようやく休日だ…',
  '長い一週間だった…やっと休日だ。',
  '今週も乗り切った！さて、休日は何をしよう。'
];

// 週末の過ごし方選択（休日の過ごし方3択）を開く
function openRestActivityChoice(headerLines) {
  restActivityChoiceHeader = headerLines;
  restActivityChoice = true;
}

// 週の最終稼働日（金曜相当）の終業処理。ノルマ達成の可否で分岐する
function resolveWeekEnd() {
  const achieved = weeklyKills >= weeklyKillQuota || weeklyScoreGained >= weeklyScoreQuota;
  if (achieved) {
    const bonus = 10 + rank * 3;
    score += bonus;
    showMessage(`週間ノルマ達成！ Score +${bonus}`, 4000, '#69f0ae', '28px sans-serif');
    const flavor = weekCompleteFlavorTexts[Math.floor(Math.random() * weekCompleteFlavorTexts.length)];
    openRestActivityChoice([flavor, '休日をどう過ごしますか？']);
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
let adventureState = null; // { scene, nodeId, onComplete }

// 特定の特殊スキルを1レベル分だけ習得させる（アドベンチャーの選択肢報酬などに使う）
function grantSpecialSkillById(id) {
  const newLevel = (specialSkillLevels.get(id) || 0) + 1;
  specialSkillLevels.set(id, newLevel);
  recomputeSpecialSkillEffects();
}

function adjustPartnerRelationship(amount) {
  partner.relationship = Math.max(0, Math.min(partnerRelationshipMax, partner.relationship + amount));
}

// シナリオデータ：シーンごとに開始ノードと、ノード間を選択肢でつなぐ分岐木を持つ
const partnerAdventureScenes = {
  cafe: {
    start: 'intro',
    nodes: {
      intro: {
        text: '休日、同僚を誘って近くのカフェへ入った。「今日は何を話そうか」と同僚が笑いかけてくる。',
        choices: [
          { label: '最近の仕事の悩みを相談する', next: 'consult',
            effects: () => adjustPartnerRelationship(15) },
          { label: '同僚の好きなことを聞いてみる', next: 'hobby',
            effects: () => { adjustPartnerRelationship(10); grantSpecialSkillById('listening'); } },
          { label: '特に話さず、黙って店内を眺める', next: 'silence',
            effects: () => {} }
        ]
      },
      consult: {
        text: '同僚は真剣に話を聞いてくれた。「一緒に頑張ろう」と力強く言ってくれる。',
        choices: [
          { label: 'ありがとう、と素直に伝える', next: null,
            effects: () => { adjustPartnerRelationship(10); specialSkillEffects.partnerDamageMultiplier *= 1.1; } },
          { label: '照れくさくて、つい話をそらす', next: null,
            effects: () => adjustPartnerRelationship(3) }
        ]
      },
      hobby: {
        text: '同僚は嬉しそうに趣味の話をしてくれた。意外な特技があるらしい。',
        choices: [
          { label: 'その特技を今度教えてもらう約束をする', next: null,
            effects: () => grantSpecialSkillById('learning-power') },
          { label: '自分の好きなことも話してみる', next: null,
            effects: () => adjustPartnerRelationship(8) }
        ]
      },
      silence: {
        text: '会話は弾まなかった。ふと隣を見ると、同僚は少し寂しそうな顔をしていた。',
        choices: [
          { label: '思い切って話しかけてみる', next: null,
            effects: () => adjustPartnerRelationship(5) },
          { label: 'そのまま静かに過ごす', next: null,
            effects: () => adjustPartnerRelationship(-5) }
        ]
      }
    }
  }
};

// 「同僚と遊ぶ」アドベンチャーパートを開始する。終了後にonCompleteを呼んで元のゲームへ戻す
function startPartnerAdventure(onComplete) {
  const sceneKeys = Object.keys(partnerAdventureScenes);
  const scene = partnerAdventureScenes[sceneKeys[Math.floor(Math.random() * sceneKeys.length)]];
  adventureState = { scene, nodeId: scene.start, onComplete };
}

// アドベンチャーパートの選択肢を選ぶ。次のノードがあれば進み、なければ終了してonCompleteへ
function chooseAdventureOption(choiceIndex) {
  if (!adventureState) return;
  const node = adventureState.scene.nodes[adventureState.nodeId];
  const choice = node.choices[choiceIndex];
  if (!choice) return;
  if (choice.effects) choice.effects();
  if (choice.next) {
    adventureState.nodeId = choice.next;
  } else {
    const onComplete = adventureState.onComplete;
    adventureState = null;
    if (onComplete) onComplete();
  }
}

// 休日の過ごし方（1:同僚と遊ぶ 2:休息 3:勉強）を適用する
function applyRestActivity(choiceIndex) {
  if (choiceIndex === 1) {
    if (partner.active) {
      // アドベンチャーパート自体がこの日の出来事なので、通常のランダムイベントは発生させず週明けへ進む
      startPartnerAdventure(() => startDayTransition(jumpToNextMondayAndResetWeek));
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
  } else if (choiceIndex === 2) {
    fatigue = 0;
    san = Math.min(maxSan, san + 25);
    showAcknowledgementNotice('しっかり休息した！ 脳疲労が全回復 / SAN +25', '#80deea', '',
      () => finishRestDayAndAdvanceToMonday());
  } else if (choiceIndex === 3) {
    restStudyPending = true;
    openSpecialSkillSelection('休日の勉強：特殊スキルを選択');
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
  { text: '何もせずボーッとしていたら、あっという間に休日が終わった。', weight: 3, apply: () => {} }
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
  // ランク1～10を敵番号0～9へ対応させる（低ランクでは弱い敵だけ出す）
  const maxIdx = Math.floor((rank / 10) * (enemyTypeNames.length - 1));
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

  if (!gameOver && enemies.length === 0) {
    waveCooldownMs = waveCooldownDelayMs;
  }
}

// ===== 各種選択の実行処理（キーボード・タップ両方から呼ばれる） =====
// 自機の性別を選ぶ。選んだ画像をそのまま自機のアイコンとしても使い、
// ひとことメッセージのあと同僚のアイコン選択画面へ進む
function selectGender(genderId) {
  selectedGender = genderId;
  selectedPlayerIcon = genderId;
  const line = playerIconGreetingLines[Math.floor(Math.random() * playerIconGreetingLines.length)];
  startIconGreeting(genderId, line, () => { setupStep = 'partner-icon'; }, genderImageElements[genderId]);
}

// 同僚のアイコンを選ぶ（nullなら「同僚なし」）。選択後、ひとことメッセージを挟んでスタート画面へ進む
function selectPartnerIcon(icon) {
  selectedPartnerIcon = icon;
  if (icon === null) {
    setupStep = null;
    startScreen = true;
    return;
  }
  const line = partnerIconGreetingLines[Math.floor(Math.random() * partnerIconGreetingLines.length)];
  startIconGreeting(icon, line, () => { setupStep = null; startScreen = true; }, partnerIconImageElements[icon]);
}

// スタート画面：通常速度(1)か3倍速(2)でゲームを開始する
function startGame(timeScale) {
  gameTimeScale = timeScale;
  startScreen = false;
  gameClockMs = 0;
  lastUpdate = Date.now();
  lastHourTime = 0;
  dayStartTime = 0;
  dayNumber = 1;
  resetWeeklyQuotaForNewWeek();
  initPartner();
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
    openRestActivityChoice(['休日はどう過ごしますか？']);
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
  // 「同僚と遊ぶ」アドベンチャーパート中は、数字キーで選択肢を選ぶ
  if (adventureState) {
    const idx = Number(event.key) - 1;
    const node = adventureState.scene.nodes[adventureState.nodeId];
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
  // 休日の過ごし方（1:同僚と遊ぶ 2:休息 3:勉強）を選ぶ
  if (restActivityChoice) {
    const choiceIndex = Number(event.key);
    if (choiceIndex >= 1 && choiceIndex <= 3) {
      restActivityChoice = false;
      // 「勉強」以外は結果メッセージを確認後にランダムイベント＋週明けへ進む（勉強はスキル選択完了後に進む）
      applyRestActivity(choiceIndex);
    }
    return;
  }
  // 休日出勤中（土日）は、Hキーでいつでも切り上げて帰宅できる
  if ((currentDate.getDay() === 0 || currentDate.getDay() === 6) &&
      dayTransitionPhase === null && event.key.toLowerCase() === 'h') {
    goHomeFromWeekendWork();
    return;
  }
  // スタート画面では通常開始か3倍加速開始を選ぶ
  if (startScreen) {
    if (event.key === '1' || event.key === 'Enter') {
      startGame(1);
    } else if (event.key === '2') {
      startGame(3);
    }
    return;
  }

  if (gameOver || gameClear) {
    return;
  }

  if (event.key === 'p') {
    isPaused = !isPaused;
      lastUpdate = Date.now();
    return;
  }
  // Fキーで自動攻撃のON/OFFを切り替える
  if (event.key === 'f') {
    autoFireEnabled = !autoFireEnabled;
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

// タッチでの移動・照準は画面外の専用スティック（#moveJoystick / #aimJoystick）が担当するため、
// キャンバス上のポインタ操作はマウスのときだけ従来通り扱う（タップはメニュー用のclickイベントで別途処理する）
const touchMoveVector = { x: 0, y: 0 }; // 画面外の移動スティックの入力方向（-1〜1）

canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'mouse') updateMousePosition(event);
});
canvas.addEventListener('pointerdown', (event) => {
  if (event.pointerType !== 'mouse' || event.button !== 0) return;
  updateMousePosition(event);
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

// ===== 画面外の移動スティック（#moveJoystick） =====
// プレイ画面（キャンバス）の外に固定表示し、ドラッグ量を touchMoveVector に反映する
const moveJoystickEl = document.getElementById('moveJoystick');
const moveJoystickKnobEl = document.getElementById('moveJoystickKnob');
const moveJoystickMaxRadius = 40; // CSS上のピクセル単位でのドラッグ可能半径
let moveJoystickPointerId = null;
let moveJoystickOrigin = { x: 0, y: 0 };

function setMoveJoystickVector(dx, dy) {
  const dist = Math.hypot(dx, dy);
  if (dist > moveJoystickMaxRadius) {
    dx = (dx / dist) * moveJoystickMaxRadius;
    dy = (dy / dist) * moveJoystickMaxRadius;
  }
  touchMoveVector.x = dx / moveJoystickMaxRadius;
  touchMoveVector.y = dy / moveJoystickMaxRadius;
  moveJoystickKnobEl.style.transform = `translate(${dx}px, ${dy}px)`;
}

moveJoystickEl.addEventListener('pointerdown', (event) => {
  moveJoystickPointerId = event.pointerId;
  moveJoystickOrigin = { x: event.clientX, y: event.clientY };
  moveJoystickEl.setPointerCapture(event.pointerId);
  event.preventDefault();
});
moveJoystickEl.addEventListener('pointermove', (event) => {
  if (event.pointerId !== moveJoystickPointerId) return;
  setMoveJoystickVector(event.clientX - moveJoystickOrigin.x, event.clientY - moveJoystickOrigin.y);
});
function releaseMoveJoystick(event) {
  if (event.pointerId !== moveJoystickPointerId) return;
  moveJoystickPointerId = null;
  touchMoveVector.x = 0;
  touchMoveVector.y = 0;
  moveJoystickKnobEl.style.transform = 'translate(0px, 0px)';
}
moveJoystickEl.addEventListener('pointerup', releaseMoveJoystick);
moveJoystickEl.addEventListener('pointercancel', releaseMoveJoystick);

// ===== 画面外の照準・攻撃スティック（#aimJoystick） =====
// 倒した方向へ自分の向きを変え、触れている間は自動的に攻撃し続ける
const aimJoystickEl = document.getElementById('aimJoystick');
const aimJoystickKnobEl = document.getElementById('aimJoystickKnob');
const aimJoystickMaxRadius = 40; // CSS上のピクセル単位でのドラッグ可能半径
const aimJoystickDeadZone = 6; // これより小さい動きは向きの変更に反映しない（微細なブレ対策）
let aimJoystickPointerId = null;
let aimJoystickOrigin = { x: 0, y: 0 };

function setAimJoystickVector(dx, dy) {
  const dist = Math.hypot(dx, dy);
  const clampedDist = Math.min(dist, aimJoystickMaxRadius);
  const nx = dist > 0 ? dx / dist : 0;
  const ny = dist > 0 ? dy / dist : 0;
  aimJoystickKnobEl.style.transform = `translate(${nx * clampedDist}px, ${ny * clampedDist}px)`;
  if (dist > aimJoystickDeadZone) {
    player.angle = Math.atan2(dy, dx);
  }
}

aimJoystickEl.addEventListener('pointerdown', (event) => {
  aimJoystickPointerId = event.pointerId;
  aimJoystickOrigin = { x: event.clientX, y: event.clientY };
  aimJoystickEl.setPointerCapture(event.pointerId);
  mouseFireHeld = true;
  event.preventDefault();
});
aimJoystickEl.addEventListener('pointermove', (event) => {
  if (event.pointerId !== aimJoystickPointerId) return;
  setAimJoystickVector(event.clientX - aimJoystickOrigin.x, event.clientY - aimJoystickOrigin.y);
});
function releaseAimJoystick(event) {
  if (event.pointerId !== aimJoystickPointerId) return;
  aimJoystickPointerId = null;
  mouseFireHeld = false;
  aimJoystickKnobEl.style.transform = 'translate(0px, 0px)';
}
aimJoystickEl.addEventListener('pointerup', releaseAimJoystick);
aimJoystickEl.addEventListener('pointercancel', releaseAimJoystick);

// ===== メニュー選択のタップ／クリック対応 =====
// draw()が毎フレーム、現在表示中のメニューに応じて再構築する
let uiButtons = [];
canvas.addEventListener('click', (event) => {
  if (acknowledgementNotice) {
    resumeFromAcknowledgement();
    return;
  }
  // 一日の終わりの演出で入力待ち中なら、どこをクリック／タップしても次の日へ進める
  if (dayTransitionPhase === 'waiting') {
    dayTransitionPhase = 'in';
    dayTransitionTimer = dayTransitionDurationMs;
    lastUpdate = Date.now();
    return;
  }
  const p = getCanvasPoint(event);
  for (const b of uiButtons) {
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
      b.action();
      break;
    }
  }
});

// ===== 常時表示の操作ボタン（自動/手動・一時停止） =====
document.getElementById('btnAutoFire').addEventListener('click', () => {
  autoFireEnabled = !autoFireEnabled;
});
document.getElementById('btnPause').addEventListener('click', () => {
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
  if (acknowledgementNotice) {
    lastUpdate = Date.now();
    return;
  }
  const now = gameClockMs + ((Date.now() - lastUpdate) * gameTimeScale);
  const dt = (now - gameClockMs) / 1000;
    lastUpdate = Date.now();
  if (isPaused) {
    return;
  }
  gameClockMs = now;

  // 力尽きた演出中は、画面を停止したまま演出用のタイマーだけを進める
  if (deathSequence) {
    deathSequence.timer += dt * 1000;
    if (deathSequence.timer >= deathSequence.duration) {
      gameOver = true;
      endingType = deathSequence.deathEndingType;
      sendScore(score);
      deathSequence = null;
    }
    return;
  }

  // アイコン選択後のひとことメッセージ演出：表示→フェードアウト→次の画面へ
  if (iconGreetingPhase) {
    iconGreetingTimer -= dt * 1000;
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

  // 同僚の吹き出しの表示時間を減らす
  if (partnerSpeechBubble) {
    partnerSpeechBubble.timer -= dt * 1000;
    if (partnerSpeechBubble.timer <= 0) partnerSpeechBubble = null;
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
  // 「同僚と遊ぶ」アドベンチャーパート中は、ゲームの進行を止める
  if (adventureState) return;

  // 一時メッセージの残り表示時間を減らし、期限切れなら削除する
  // ただし「DAY～」演出中（暗転～クリック待ち）は、読み終える前に消えないよう時間を止める
  if (dayTransitionPhase !== 'out' && dayTransitionPhase !== 'waiting') {
    for (let mi = messages.length - 1; mi >= 0; mi--) {
      messages[mi].ttl -= dt * 1000;
      if (messages[mi].ttl <= 0) messages.splice(mi, 1);
    }
  }

  // 一日の終わりの画面演出中は、フェードの進行だけを行い、他の処理はすべて止める
  if (dayTransitionPhase) {
    if (dayTransitionPhase === 'waiting') {
      // クリック／タップされるまで、暗転したまま入力待ちにする
      return;
    }
    dayTransitionTimer -= dt * 1000;
    if (dayTransitionPhase === 'out' && dayTransitionTimer <= 0) {
      // 画面が暗転しきったら、残っている仕事（敵）を配置し直してから日付を進め、入力待ちにする
      repositionRemainingEnemies();
      const advanceFn = dayTransitionAdvanceFn;
      dayTransitionAdvanceFn = null;
      if (advanceFn) advanceFn();
      if (gameOver || gameClear) return;
      dayTransitionPhase = 'waiting';
    } else if (dayTransitionPhase === 'in' && dayTransitionTimer <= 0) {
      dayTransitionPhase = null;
    }
    return;
  }

  // 週末の休日出勤選択・休日の過ごし方選択・休日出勤中の帰宅確認中は、ゲームの進行を止める
  if (weekendWorkChoice || restActivityChoice || weekendWorkQuotaChoice) return;

  // 休日出勤中（土曜・日曜に働いている間）は、SAN・寿命が緩やかに削れていく
  if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
    san = Math.max(0, san - weekendWorkSanDrainPerSec * dt);
    lifespan = Math.max(0, lifespan - weekendWorkLifespanDrainPerSec * dt);
    checkVitalsGameOver();
    if (gameOver || deathSequence) return;
  }

  // ゲーム内時刻を進める
  if (now - lastHourTime >= hourMs) {
    const passed = Math.floor((now - lastHourTime) / hourMs);
    const previousHour = currentHour;
    lastHourTime += passed * hourMs;
    currentHour += passed;
    processTimedHourEvents(previousHour, currentHour);
    // 終業時刻になっても定時報告が残っていれば、24時まで残業として居残る
    if (currentHour >= dayEndHour && scheduledReport && currentHour < maxOvertimeHour) {
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

  // 残業中（定時報告が終わらないまま終業時刻を過ぎている間）は、SAN・寿命が継続的に削れていく
  if (scheduledReport && currentHour >= dayEndHour) {
    san = Math.max(0, san - overtimeSanDrainPerSec * dt);
    lifespan = Math.max(0, lifespan - overtimeLifespanDrainPerSec * dt);
    if (partner.active) {
      partner.san = Math.max(0, partner.san - overtimeSanDrainPerSec * partnerOvertimeDrainRatio * dt);
      partner.lifespan = Math.max(0, partner.lifespan - overtimeLifespanDrainPerSec * partnerOvertimeDrainRatio * dt);
    }
    checkVitalsGameOver();
    if (gameOver || deathSequence) return;
  }

  // 全滅したら少し間を置いて次のウェーブ（仕事）を出す
  if (enemies.length === 0) {
    if (waveCooldownMs > 0) {
      waveCooldownMs -= dt * 1000;
    } else {
      spawnWave();
    }
  }

  // 各敵の納期をカウントダウンし、0になった敵を爆発させる
  for (let i = enemies.length - 1; i >= 0; i--) {
    enemies[i].deadlineMs -= dt * 1000;
    if (enemies[i].deadlineMs <= 0) {
      explodeEnemy(i);
      if (gameOver || deathSequence) return;
    }
  }

  // チョコレートの出現待ち、取得判定、時間切れを処理する
  if (chocolate) {
    chocolate.remainingMs -= dt * 1000;
    const distanceToChocolate = Math.hypot(
      player.x - chocolate.x,
      player.y - chocolate.y
    );

    if (distanceToChocolate <= player.radius + chocolate.radius) {
      const recoveryAmount = Math.ceil(
        maxFatigue * chocolateRecoveryRatio * specialSkillEffects.chocolateRecoveryMultiplier
      );
      const reducedFatigue = Math.min(fatigue, recoveryAmount);
      fatigue -= reducedFatigue;
      showMessage(`チョコレート取得！ 脳疲労 -${Math.ceil(reducedFatigue)}`, 1500, '#ffcc80');
      chocolate = null;
      chocolateSpawnTimerMs = getRandomChocolateSpawnDelay();
    } else if (chocolate.remainingMs <= 0) {
      chocolate = null;
      chocolateSpawnTimerMs = getRandomChocolateSpawnDelay();
    }
  } else {
    chocolateSpawnTimerMs -= dt * 1000;
    if (chocolateSpawnTimerMs <= 0) {
      spawnChocolate();
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
    for (let i = lunchState.items.length - 1; i >= 0; i--) {
      const item = lunchState.items[i];
      if (Math.hypot(player.x - item.x, player.y - item.y) <= player.radius + item.radius) {
        collectLunchItem(i);
        if (!lunchState) break;
      }
    }
  }

  // マップ上の番号アイコンへ触れるとクイズへ回答する（出現直後の誤回答を防ぐため、少しの間は反応しない）
  if (quizState && Date.now() >= quizAnswerUnlockAt) {
    for (let i = quizState.answerTokens.length - 1; i >= 0; i--) {
      const token = quizState.answerTokens[i];
      if (Math.hypot(player.x - token.x, player.y - token.y) <= player.radius + token.radius) {
        answerQuiz(i);
        break;
      }
    }
  }

  if (stunned) {
    // 行動不能中は移動・攻撃できないが、疲労が回復する
    stunTimer -= dt * 1000;
    fatigue = Math.max(0, fatigue - stunRecoveryPerSec * dt);
    if (stunTimer <= 0) {
      stunned = false;
    }
  } else {
    // WASDキーによるプレイヤー移動
    let moving = false;
    const currentMoveSpeed = player.speed * specialSkillEffects.moveSpeedMultiplier;
    if (keys["w"]) { player.y -= currentMoveSpeed; moving = true; }
    if (keys["s"]) { player.y += currentMoveSpeed; moving = true; }
    if (keys["a"]) { player.x -= currentMoveSpeed; moving = true; }
    if (keys["d"]) { player.x += currentMoveSpeed; moving = true; }
    // タッチの仮想移動スティックによるプレイヤー移動
    if (touchMoveVector.x !== 0 || touchMoveVector.y !== 0) {
      player.x += touchMoveVector.x * currentMoveSpeed;
      player.y += touchMoveVector.y * currentMoveSpeed;
      moving = true;
    }
    // プレイヤーが画面外・窓の範囲へ出ないよう座標を制限する
    clampToPlayableFloor(player);
    pushEntityOutsideScheduledReport(player);

    // 無敵時間を減らし、0になったら解除する
    if (invincible) {
      invincibleTimer -= dt * 1000;
      if (invincibleTimer <= 0) {
        invincible = false;
      }
    }

    // 疲労を回復する。移動中は待機中より回復量が少ない
    updateSkillEffects();
    if (moving) {
      fatigue = Math.max(0, fatigue - (idleRecoveryPerSec * 0.35) * dt);
    } else {
      fatigue = Math.max(0, fatigue - idleRecoveryPerSec * specialSkillEffects.idleRecoveryMultiplier * dt);
    }

    // 攻撃モードに関係なく、自分は常にマウスカーソルの方向を向く
    // （画面外の照準スティックを操作中は、そちらで設定した向きを優先する）
    if (aimJoystickPointerId === null) {
      player.angle = Math.atan2(
        mousePosition.y - player.y,
        mousePosition.x - player.x
      );
    }

    // 手動時は左クリック中だけ、自動時は常にカーソル方向へ攻撃する
    const fatigueRatio = Math.max(0, Math.min(1, fatigue / maxFatigue));
    const conditionRatio = 1 - fatigueRatio;
    const currentFireRate = baseFireRate * (1 + fatigueRatio * fireRateMultiplier) *
      specialSkillEffects.fireRateMultiplier;
    const wantsToFire = autoFireEnabled || mouseFireHeld;
    if (wantsToFire && !stunned) {
      if (now - lastFire >= currentFireRate) {
        updateSkillEffects();
        const firingDrainMultiplier = Math.max(0.8, 1 - skillLevel * 0.05);
        const projectedFatigue = firingFatiguePerShot * firingDrainMultiplier *
          specialSkillEffects.firingFatigueMultiplier * getTimeOfDayFatigueMultiplier();
        if (fatigue < maxFatigue) {
          lastFire = now;
          const shotAngle = player.angle;

          const speed = 6 * specialSkillEffects.bulletSpeedMultiplier;
          const damageBonus = 1 + skillLevel * 0.08;
          const damage = Math.max(1, Math.round(
            baseBulletDamage * conditionRatio * damageBonus * specialSkillEffects.damageMultiplier
          ));

          // マルチタスクと三方向射撃のレベルに応じて弾数と角度を増やす
          let shotOffsets = [0];
          const multiTaskLevel = specialSkillEffects.multiTaskLevel;
          const tripleShotLevel = specialSkillEffects.tripleShotLevel;
          const shotCount = 1 + multiTaskLevel + tripleShotLevel * 2;
          if (shotCount > 1) {
            // 初回のマルチタスクは2発が30度違う方向へ飛ぶ
            const totalSpreadDegrees = Math.max(
              multiTaskLevel * 30,
              tripleShotLevel * 40
            );
            const angleStep = totalSpreadDegrees / (shotCount - 1);
            shotOffsets = Array.from(
              { length: shotCount },
              (_, index) => -totalSpreadDegrees / 2 + angleStep * index
            );
          }

          for (const offsetDegrees of shotOffsets) {
            // 注意力散漫スキルの確率に応じて、弾がランダムな角度にそれる
            const scatterDegrees = Math.random() < specialSkillEffects.bulletScatterChance
              ? (Math.random() - 0.5) * 50
              : 0;
            const bulletAngle = shotAngle + (offsetDegrees + scatterDegrees) * Math.PI / 180;
            bullets.push({
              x: player.x + Math.cos(bulletAngle) * player.radius,
              y: player.y + Math.sin(bulletAngle) * player.radius,
              vx: Math.cos(bulletAngle) * speed,
              vy: Math.sin(bulletAngle) * speed,
              radius: 4,
              damage,
              bounces: specialSkillEffects.bulletBounceCount,
              owner: 'player'
            });
          }
          // コミュニケーション力：一定確率で、最寄りの敵へ援護射撃が飛ぶ
          if (enemies.length > 0 && Math.random() < specialSkillEffects.supportFireChance) {
            const nearestEnemy = enemies.reduce((closest, candidate) => {
              const d = Math.hypot(candidate.x - player.x, candidate.y - player.y);
              return (!closest || d < closest.d) ? { en: candidate, d } : closest;
            }, null).en;
            const supportAngle = Math.atan2(nearestEnemy.y - player.y, nearestEnemy.x - player.x);
            bullets.push({
              x: player.x + Math.cos(supportAngle) * player.radius,
              y: player.y + Math.sin(supportAngle) * player.radius,
              vx: Math.cos(supportAngle) * speed,
              vy: Math.sin(supportAngle) * speed,
              radius: 4,
              damage,
              bounces: specialSkillEffects.bulletBounceCount,
              owner: 'player'
            });
          }
          // 発射時に疲労を増やす。スキルレベルが高いほど消耗を軽減する
          // マルチタスクは処理する弾数に比例して脳疲労も増える。
          fatigue += projectedFatigue * shotCount;
          if (fatigue >= maxFatigue) {
            fatigue = maxFatigue;
            stunned = true;
            stunTimer = stunDuration * specialSkillEffects.stunDurationMultiplier;
            if (partner.active) showRandomPartnerSpeechBubble(partnerStunWorryLines, '#90caf9', partnerStunWorryStressedLines);
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
    // 画面端に達した弾は、跳ね返り回数が残っていれば反射し、なければ削除する
    let removed = false;
    if (b.x < 0 || b.x > canvas.width) {
      if (b.bounces > 0) {
        b.bounces--;
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
        b.vy *= -1;
        b.y = Math.max(0, Math.min(canvas.height, b.y));
      } else {
        bullets.splice(i, 1);
        removed = true;
      }
    }
    if (removed) continue;
    // 発射者と反対側の味方に当たった場合は、敵より先に誤射として処理する。
    if (b.owner === 'player' && partner.active &&
        Math.hypot(b.x - partner.x, b.y - partner.y) <= b.radius + partner.radius) {
      damagePartnerByFriendlyFire();
      bullets.splice(i, 1);
      continue;
    } else if (b.owner === 'partner' &&
        Math.hypot(b.x - player.x, b.y - player.y) <= b.radius + player.radius) {
      damagePlayerByFriendlyFire();
      bullets.splice(i, 1);
      if (gameOver || deathSequence) return;
      continue;
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
            showRandomPartnerSpeechBubble(partnerThanksLines, '#69f0ae', partnerThanksStressedLines);
            if (Math.random() < partnerThanksRelationshipChance) {
              adjustPartnerRelationship(1);
            }
          }
          enemies.splice(j, 1);
          weeklyKills++;
          weeklyScoreGained += pts;
          checkEarlyQuotaAchievement();
          if (enemies.length === 0) waveCooldownMs = waveCooldownDelayMs;
        }
        break;
      }
    }
  }

  // 疲労値が0～最大値の範囲を超えないようにする
  fatigue = Math.max(0, Math.min(maxFatigue, fatigue));

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
      continue;
    }
    if (invincible) continue;

    // 接触した敵の種類に応じてSANを減らす
    updateSkillEffects();
    const sanMultiplier = Math.max(0.5, 1 - skillLevel * 0.04);
    let defeated = false;
    if (!en.touching) {
      // 接触した瞬間：SANダメージを与え、無敵時間を開始する
      const sdamage = Math.ceil(
        (en.type || 1) * contactSanMultiplier * sanMultiplier *
        specialSkillEffects.sanDamageMultiplier * getEnemyDifficultyMultiplier()
      );
      damageSan(sdamage);
      en.touching = true;
      invincible = true;
      invincibleTimer = invincibleDuration;
      // 最初の接触時、敵にも弾1発相当のダメージを与える
      const contactConditionRatio = 1 - Math.max(0, Math.min(1, fatigue / maxFatigue));
      const contactDamage = Math.max(1, Math.round(baseBulletDamage * contactConditionRatio * (1 + skillLevel * 0.08)));
      en.hp = (en.hp || 1) - contactDamage;
      if (en.hp <= 0) defeated = true;
    } else {
      // 接触し続けている間は、少しずつSANを減らす
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
      enemies.splice(j, 1);
      weeklyKills++;
      weeklyScoreGained += pts;
      checkEarlyQuotaAchievement();
      if (enemies.length === 0) waveCooldownMs = waveCooldownDelayMs;
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

// ゲーム終了画面（Game Over / Game Clear）共通の再挑戦・終了ボタン
function drawEndScreenButtons(baseY) {
  const btnW = 300, btnH = 48;
  const btnX = canvas.width / 2 - btnW / 2;
  drawUiButton(btnX, baseY, btnW, btnH, '・・・という夢をみたんだ', () => location.reload());
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
  true: {
    icon: '🌟',
    label: 'TRUE END',
    labelColor: '#ffd54f',
    bgColor: 'rgba(40, 32, 4, 0.88)',
    description: [
      '（仮）あなたは仕事と人生の、真のバランスを見つけた。',
      '最後まで正しい選択を積み重ねた者だけが辿り着く、本当の終わり。'
    ]
  },
  normal: {
    icon: '🏁',
    label: 'NORMAL END',
    labelColor: '#b0bec5',
    bgColor: 'rgba(10, 15, 20, 0.88)',
    description: [
      '（仮）月末を迎え、ひとまずの区切りがついた。',
      'これもまた、一つの生き方だった。'
    ]
  },
  'bad-san': {
    icon: '🌀',
    label: 'BAD END',
    labelColor: '#ce93d8',
    bgColor: 'rgba(30, 0, 40, 0.88)',
    description: [
      '（仮）積み重なったストレスが、ついに心を壊してしまった。',
      'もう、まともに働くことはできない…。'
    ]
  },
  'bad-lifespan': {
    icon: '⚰️',
    label: 'BAD END',
    labelColor: '#90a4ae',
    bgColor: 'rgba(8, 8, 8, 0.92)',
    description: [
      '（仮）気づかぬうちに蓄積した消耗が、静かに寿命を削りきった。',
      '働きすぎは、命を削る。'
    ]
  },
  'bad-partner-shot': {
    icon: '💔',
    label: 'BAD END',
    labelColor: '#ef9a9a',
    bgColor: 'rgba(35, 5, 12, 0.92)',
    description: [
      '同僚の一撃が、最後の引き金になってしまった。',
      '関係性を、どこかで誤ってしまったのだろうか。'
    ]
  }
};

function drawEndingScreen() {
  const cfg = endingConfig[endingType] || endingConfig.normal;
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
  ctx.font = 'bold 26px sans-serif';
  ctx.fillStyle = cfg.labelColor;
  ctx.fillText('E N D', canvas.width / 2, canvas.height / 2 + 86);

  ctx.textAlign = 'left';
  drawEndScreenButtons(canvas.height / 2 + 108);
}

// ===== 背景（imagesフォルダの時間帯画像） =====
// 画像の読み込みが済むまでの間だけ使う、簡単なグラデーションのフォールバック
const backgroundGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
backgroundGradient.addColorStop(0, '#12161f');
backgroundGradient.addColorStop(1, '#05060a');

// 朝・昼・夕方・夜の背景画像を読み込んでおく
const backgroundTimeImages = {
  morning: (() => { const img = new Image(); img.src = 'images/background/01_morning.png'; return img; })(),
  daytime: (() => { const img = new Image(); img.src = 'images/background/02_daytime.png'; return img; })(),
  earlynight: (() => { const img = new Image(); img.src = 'images/background/03_earlynight.png'; return img; })(),
  night: (() => { const img = new Image(); img.src = 'images/background/04_night.png'; return img; })()
};
// ゲーム内時刻と背景画像の対応（時刻の間はなだらかにクロスフェードする）
const backgroundTimeKeyframes = [
  { hour: dayStartHour, key: 'morning' },
  { hour: 12, key: 'daytime' },
  { hour: dayEndHour, key: 'earlynight' },
  { hour: 21, key: 'night' }
];

function drawBackground() {
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

// HUD用プロフィール区画。選択した絵文字を仮の顔イラストとして使う。
function drawHudProfilePanel(x, y, width, height, title, icon, accentColor, statLines, inactive = false, dangerLevel = 0, iconImage = null, portraitRadius = 23) {
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

// ===== ゲーム画面の描画 =====
// 毎フレーム、現在のゲーム状態をCanvasへ描く
function draw() {
  // タップ可能な矩形を、今フレームの表示内容に合わせて作り直す
  uiButtons = [];
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // アイコン選択直後のひとことメッセージ演出（表示→フェードアウト）
  if (iconGreetingPhase) {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const alpha = iconGreetingPhase === 'fadeout'
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

  if (setupStep === 'gender') {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('自機の性別を選んでください', canvas.width / 2, 110);
    ctx.textAlign = 'left';

    const cardW = 220, cardH = 260, gap = 40;
    const totalWidth = genderChoices.length * cardW + (genderChoices.length - 1) * gap;
    const startX = canvas.width / 2 - totalWidth / 2;
    const cardY = 170;
    genderChoices.forEach((choice, i) => {
      const cardX = startX + i * (cardW + gap);
      ctx.save();
      ctx.fillStyle = 'rgba(103, 58, 183, 0.35)';
      ctx.fillRect(cardX, cardY, cardW, cardH);
      ctx.strokeStyle = '#ce93d8';
      ctx.lineWidth = 2;
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
      uiButtons.push({ x: cardX, y: cardY, w: cardW, h: cardH, action: () => selectGender(choice.id) });
    });

    ctx.fillStyle = '#cfd8dc';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('数字キー 1〜2 / タップで選択', canvas.width / 2, cardY + cardH + 50);
    ctx.textAlign = 'left';
    return;
  }

  if (setupStep === 'partner-icon') {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
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
    partnerIconChoices.forEach((id, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cellX = startX + col * (cellSize + gap);
      const cellY = startY + row * (cellSize + gap);
      ctx.save();
      ctx.fillStyle = 'rgba(103, 58, 183, 0.35)';
      ctx.fillRect(cellX, cellY, cellSize, cellSize);
      ctx.strokeStyle = '#ce93d8';
      ctx.lineWidth = 2;
      ctx.strokeRect(cellX, cellY, cellSize, cellSize);
      const img = partnerIconImageElements[id];
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, cellX + 4, cellY + 4, cellSize - 8, cellSize - 8);
      }
      ctx.restore();
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
    ctx.fillText('タップで選択（キー1〜9でも一部選択可）　0キーで同僚なし',
      canvas.width / 2, gridBottom + 30 + noneBtnH + 30);
    ctx.textAlign = 'left';
    return;
  }

  if (startScreen) {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Survivors風ゲーム', canvas.width / 2, canvas.height / 2 - 130);
    ctx.textAlign = 'left';

    const btnW = 340, btnH = 54;
    const btnX = canvas.width / 2 - btnW / 2;
    drawUiButton(btnX, canvas.height / 2 - 60, btnW, btnH, '通常開始 (1 / Enter)',
      () => startGame(1));
    drawUiButton(btnX, canvas.height / 2 + 4, btnW, btnH, '3倍加速モード (2)',
      () => startGame(3));

    ctx.fillStyle = '#cfd8dc';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('P = 一時停止 / 再開　F = 自動攻撃切替', canvas.width / 2, canvas.height / 2 + 92);
    ctx.fillText('WASD・左スティック = 移動　マウス・ドラッグ / 右スティック = 照準・攻撃', canvas.width / 2, canvas.height / 2 + 118);
    ctx.textAlign = 'left';
    return;
  }

  // 寿命が尽きた演出中は、画面全体を徐々に白黒にしていく
  if (deathSequence && deathSequence.visualType === 'lifespan') {
    const progress = Math.min(1, deathSequence.timer / deathSequence.duration);
    ctx.filter = `grayscale(${Math.round(progress * 100)}%)`;
  } else {
    ctx.filter = 'none';
  }

  drawBackground();
  // 敵・アイコン・自分/同僚などの前景要素に薄い影をつけ、背景から浮き上がって見やすくする
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  if (invincible) {
    const blink = Math.floor(gameClockMs / 100) % 2 === 0;
    ctx.globalAlpha = blink ? 0.4 : 0.8;
  } else {
    ctx.globalAlpha = 1;
  }
  // 自分のアイコン（性別選択で選んだimages/self内の画像を使用）
  const selfImg = genderImageElements[selectedPlayerIcon];
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

  // 同僚の描画（存在するときのみ。imagesフォルダの選択した画像を使用）
  if (partner.active) {
    ctx.save();
    if (partner.invincible) {
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

  // プレイヤーが発射した弾を描く
  ctx.fillStyle = 'white';
  for (const b of bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
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
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#ffcc80';
      ctx.fillText(
        `${Math.max(0, chocolate.remainingMs / 1000).toFixed(1)}秒`,
        chocolate.x,
        chocolate.y + chocolate.radius + 12
      );
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

      // 特殊スキル「先読み力」習得済みなら、出現順の番号を見える化する
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

  // クイズ回答用の番号アイコンと設問
  if (quizState) {
    const quizAnswerLocked = Date.now() < quizAnswerUnlockAt;
    const numberIcons = ['1️⃣', '2️⃣', '3️⃣'];
    for (const token of quizState.answerTokens) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(token.x, token.y, token.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(66, 165, 245, 0.3)';
      ctx.fill();
      ctx.strokeStyle = '#90caf9';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = '31px "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(numberIcons[token.number - 1], token.x, token.y);
      ctx.restore();

      // 出現直後は、点滅する矢印で選択肢の位置を知らせるだけにして誤って踏まないようにする
      if (quizAnswerLocked && Math.floor(Date.now() / 250) % 2 === 0) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.font = 'bold 26px sans-serif';
        ctx.fillStyle = '#fff59d';
        ctx.fillText('↓', token.x, token.y - token.radius - 10);
        ctx.restore();
      }
    }

    ctx.save();
    ctx.fillStyle = 'rgba(8, 18, 35, 0.86)';
    ctx.fillRect(400, 45, 388, 112);
    ctx.strokeStyle = '#64b5f6';
    ctx.strokeRect(400, 45, 388, 112);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#bbdefb';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`QUIZ: ${quizState.text}`, 412, 66);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'white';
    quizState.choices.forEach((choice, index) => {
      ctx.fillText(`${index + 1}. ${choice}`, 416, 88 + index * 22);
    });
    ctx.restore();
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
    { text: `Rank: ${rank} ${rankNames[rank - 1]}` },
    { text: `Skill:${skillLevel}  EXP:${Math.floor(exp)}` }
  ], false, 0, genderImageElements[selectedPlayerIcon], 46);

  const partnerUnavailable = !partner.active;
  const partnerTitle = selectedPartnerIcon === null
    ? '同僚なし'
    : (partner.active ? '同僚' : '同僚離脱');
  drawHudProfilePanel(164, 12, 145, 190, partnerTitle,
    selectedPartnerIcon, '#80cbc4', partner.active ? [
      { text: `SAN: ${Math.floor(partner.san)} / ${maxSan}` },
      { text: `寿命: ${Math.ceil(partner.lifespan)} / ${maxLifespan}` },
      { text: `脳疲労: ${Math.floor(partner.fatigue)} / ${maxFatigue}` },
      { text: '状態: 行動中' }
    ] : [
      { text: 'SAN: —' },
      { text: '寿命: —' },
      { text: '脳疲労: —' },
      { text: `状態: ${selectedPartnerIcon === null ? '不在' : '離脱'}` }
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
    '攻撃モード: ' + (autoFireEnabled ? '自動' : '手動') + (stunned ? '（行動不能）' : ''),
    12, 268
  );

  // 一時メッセージを画面上部の中央に表示する
  drawPendingMessages();
  // 画面右上に日付・時刻・曜日を表示する
  const yName = weekdayNames[currentDate.getDay()];
  const holidayFlag = isHoliday(currentDate) || yName === '土' || yName === '日';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = holidayFlag ? '#ffeb3b' : 'white';
  const hourStr = String(currentHour).padStart(2,'0') + ':00';
  const dateStr = `DAY${dayNumber} ${currentDate.getFullYear()}/${String(currentDate.getMonth()+1).padStart(2,'0')}/${String(currentDate.getDate()).padStart(2,'0')} ${hourStr} (${yName})`;
  ctx.fillText(dateStr, canvas.width - 12 - ctx.measureText(dateStr).width, 28);

  // 休日出勤中（土日）のみ表示する、切り上げて帰宅するためのボタン
  if ((currentDate.getDay() === 0 || currentDate.getDay() === 6) &&
      !gameOver && !gameClear && !dayTransitionPhase && !weekendWorkChoice &&
      !restActivityChoice && !weekendWorkQuotaChoice && !acknowledgementNotice) {
    drawUiButton(canvas.width - 160, 38, 148, 40, '帰宅する (H)', goHomeFromWeekendWork,
      { fillStyle: 'rgba(84, 60, 30, 0.65)', strokeStyle: '#ffb74d', font: 'bold 15px sans-serif' });
  }

  if (isPaused && !gameOver && !gameClear) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '52px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2 - 28);
    ctx.font = '20px sans-serif';
    ctx.fillText('Pキーで再開', canvas.width / 2, canvas.height / 2 + 18);
    ctx.textAlign = 'left';

    const wakeBtnW = 260, wakeBtnH = 48;
    drawUiButton(canvas.width / 2 - wakeBtnW / 2, canvas.height / 2 + 50, wakeBtnW, wakeBtnH,
      '目を覚ます', () => location.reload(),
      { fillStyle: 'rgba(84, 30, 30, 0.6)', strokeStyle: '#ef9a9a' });
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
  // 週末の過ごし方の選択画面（週間ノルマ達成後の休日、または休日出勤を断った場合）
  if (restActivityChoice && !gameOver && !gameClear) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '26px sans-serif';
    ctx.textAlign = 'center';
    const extraOffset = (restActivityChoiceHeader.length - 1) * 34;
    restActivityChoiceHeader.forEach((line, i) => {
      ctx.fillText(line, canvas.width / 2, canvas.height / 2 - 90 - extraOffset + i * 34);
    });
    ctx.textAlign = 'left';

    const btnW = 460, btnH = 44;
    const btnX = canvas.width / 2 - btnW / 2;
    const optionBaseY = canvas.height / 2 - 30 + extraOffset;
    const optionLabels = [
      '同僚と遊ぶ (アドベンチャーパートへ)',
      '休息 (脳疲労が全回復 / SAN +25)',
      'スキル選択・勉強 (特殊スキルを1つ選ぶ)'
    ];
    optionLabels.forEach((label, i) => {
      const choiceIndex = i + 1;
      drawUiButton(btnX, optionBaseY + i * 52, btnW, btnH, `${choiceIndex}. ${label}`, () => {
        restActivityChoice = false;
        applyRestActivity(choiceIndex);
      });
    });
  }

  // 「同僚と遊ぶ」アドベンチャーパート（簡易サウンドノベル）の画面
  if (adventureState && !gameOver && !gameClear) {
    const node = adventureState.scene.nodes[adventureState.nodeId];
    ctx.fillStyle = 'rgba(4, 6, 12, 0.92)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ffe0b2';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'left';
    const textLines = wrapTextToWidth(node.text, canvas.width - 160);
    textLines.forEach((line, i) => {
      ctx.fillText(line, 80, 140 + i * 30);
    });

    const btnW2 = 560, btnH2 = 50;
    const btnX2 = canvas.width / 2 - btnW2 / 2;
    const choicesStartY = 140 + textLines.length * 30 + 40;
    node.choices.forEach((choice, i) => {
      drawUiButton(btnX2, choicesStartY + i * 60, btnW2, btnH2, `${i + 1}. ${choice.label}`,
        () => chooseAdventureOption(i));
    });

    ctx.fillStyle = '#cfd8dc';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('数字キー / タップで選択', canvas.width / 2,
      choicesStartY + node.choices.length * 60 + 20);
    ctx.textAlign = 'left';
  }

  // 特殊スキルの3択画面。数字キー1～3で取得する
  if (specialSkillSelectionActive) {
    const selectionLocked = Date.now() < specialSkillSelectionUnlockAt;

    ctx.fillStyle = 'rgba(8, 10, 24, 0.9)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e1bee7';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(specialSkillSelectionTitle, canvas.width / 2, 70);

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
    let cardY = 115;
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
    // 暗転で隠れてしまった一時メッセージ（イベント結果など）を、タップされるまで読めるよう上から描き直す
    if (dayTransitionPhase === 'waiting') {
      drawPendingMessages();
    }
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
  if (acknowledgementNotice) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const noticeX = 130, noticeY = 175, noticeW = 540, noticeH = 210;
    ctx.fillStyle = 'rgba(12, 20, 34, 0.96)';
    ctx.fillRect(noticeX, noticeY, noticeW, noticeH);
    ctx.strokeStyle = acknowledgementNotice.color;
    ctx.lineWidth = 3;
    ctx.strokeRect(noticeX, noticeY, noticeW, noticeH);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = acknowledgementNotice.color;
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(acknowledgementNotice.text, canvas.width / 2, noticeY + 68);
    if (acknowledgementNotice.detail) {
      ctx.fillStyle = '#eceff1';
      ctx.font = '17px sans-serif';
      ctx.fillText(acknowledgementNotice.detail, canvas.width / 2, noticeY + 112);
    }
    ctx.fillStyle = '#fff59d';
    ctx.font = '16px sans-serif';
    ctx.fillText('クリック / タップで再開', canvas.width / 2, noticeY + 166);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  ctx.filter = 'none';

  // SANが尽きた演出中は、時間とともに画面全体（文字含む）の歪みを強めていく
  if (deathSequence && deathSequence.visualType === 'san') {
    const progress = Math.min(1, deathSequence.timer / deathSequence.duration);
    applyScreenDistortion(sanDeathDistortionMinAmplitude +
      progress * (sanDeathDistortionMaxAmplitude - sanDeathDistortionMinAmplitude));
  } else if (!deathSequence && !gameOver && !gameClear && san <= sanDistortionThreshold) {
    // 通常時、SANが低いときは文字が読める程度の軽い歪みをかける
    applyScreenDistortion(sanLowDistortionAmplitude);
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
