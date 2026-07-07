// ===== ゲーム画面（Canvas）の準備 =====
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
console.log('main.js loaded');
const player = {
  x: 400,
  y: 300,
  radius: 15,
  speed: 4,
  angle: 0 // 自機が向いている角度（ラジアン）
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

// 後ろの強い敵ほど出現率が低くなるよう、等比数列で重みを付ける
const rarityRatio = 0.6; // 0～1の値。小さいほど強い敵が出にくい
const typeWeights = enemyTypeNames.map((_, i) => Math.pow(rarityRatio, i));
const totalWeight = typeWeights.reduce((a, b) => a + b, 0);

// 敵の初期生成より前に参照できるよう、ランクをここで宣言する
let rank = 1;
// getAllowedMaxTypeIndexByRankがゲーム開始前のウェーブ生成時にも参照するため、ここで宣言する
let weeklyQuotaAchievedEarly = false; // 週の途中でノルマを達成済みか

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

function setEnemyStats(e, typeIndex) {
  const idx = typeof typeIndex === 'number' ? typeIndex : chooseEnemyTypeIndex();
  e.type = idx + 1;
  e.text = enemyTypeNames[idx];
  e.font = '28px sans-serif';
  // 強い種類ほどHPを高くする
  e.hp = Math.ceil(1 + idx * 0.6 + Math.random() * 1.0); // 全体的なHPは低め
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
let startScreen = true;

// ===== 納期切れの爆発エフェクト =====
const explosionEffectDuration = 500; // フラッシュと揺れの継続時間（ミリ秒）
let explosionFlashTimer = 0;
let explosionShakeTimer = 0;

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
let dayNumber = 1; // 実際に稼働した日数（1始まり）
let weeklyKillQuota = 0; // 今週の撃破ノルマ
let weeklyScoreQuota = 0; // 今週のスコア獲得ノルマ
let weeklyKills = 0; // 今週の撃破数
let weeklyScoreGained = 0; // 今週のスコア獲得量（減点は含まない）
let weekendWorkChoice = false; // 「休日出勤しますか」の選択待ち
let restActivityChoice = false; // 「休日の過ごし方」3択の選択待ち
let restStudyPending = false; // 休日の「勉強」からスキル選択を開いた後の後続処理待ち
// ノルマ未達成時のペナルティ・達成時のボーナスの割合
const weeklyFailScorePenaltyRatio = 0.25; // Scoreの25%を失う
const weeklyFailSanPenaltyRatio = 0.35; // maxSanの35%ぶんSANを失う
const restEvaluationPenaltyRatio = 0.10; // 休日出勤を断った場合、さらにScoreの10%を失う

// ===== SAN（精神力）システム =====
const maxSan = 100;
let san = maxSan;

// SANが減少する量
const stunSanPenalty = 8;
const contactSanMultiplier = 4; // 接触時のSAN減少量 = 敵の種類 × この倍率

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

// SAN・寿命のいずれかが尽きたらゲームオーバーにする（二重にScore送信しないようgameOverで一度だけ発火）
function checkVitalsGameOver() {
  if (gameOver) return;
  if (san <= 0 || lifespan <= 0) {
    gameOver = true;
    sendScore(score);
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
}

// 週の途中でノルマを達成したかどうかをキル時にチェックする
function checkEarlyQuotaAchievement() {
  if (weeklyQuotaAchievedEarly) return;
  if (isWeekEndDay(currentDate)) return; // 最終日はresolveWeekEndで判定するため、ここでは扱わない
  if (weeklyKills >= weeklyKillQuota || weeklyScoreGained >= weeklyScoreQuota) {
    weeklyQuotaAchievedEarly = true;
    showMessage('今週のノルマ達成！残りは易しい仕事だけになります', 3500, '#69f0ae', '22px sans-serif');
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
// ミスなくほぼ完璧に立ち回った場合のみ最終ランクへ届く想定で、後半ほど必要スコアの伸びを急にしてある
const rankThresholds = [0, 30, 90, 200, 380, 650, 1050, 1650, 2550, 3900]; // 各ランクへの昇格に必要なスコア

// スキルレベルと経験値
let exp = 0;
const expPerLevel = 30; // 経験値30ごとにスキルレベルが上がる
let skillLevel = 0;

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
    bulletBounceCount: 0
  };
}
const specialSkillEffects = getDefaultSpecialSkillEffects();

const specialSkills = [
  { id: 'dual-shot', name: 'マルチタスク', description: 'レベルごとに同時発射する弾が1発増える' },
  { id: 'speed-up', name: '高速移動', description: '移動速度が1.5倍になる' },
  { id: 'fatigue-save', name: '省エネ射撃', description: '射撃による脳疲労を35%軽減する' },
  { id: 'rapid-fire', name: '高速連射', description: '発射間隔を25%短縮する' },
  { id: 'power-shot', name: '高威力弾', description: '弾のダメージが50%増える' },
  { id: 'triple-shot', name: '三方向射撃', description: '正面と左右20度へ3発同時に撃つ' },
  { id: 'chocolate-lover', name: 'チョコ好き', description: 'チョコレートの回復量が50%増える' },
  { id: 'deadline-master', name: '納期管理', description: '敵の納期が50%長くなる' },
  { id: 'mental-guard', name: 'メンタルガード', description: '受けるSANダメージを25%軽減する' },
  { id: 'high-speed-bullet', name: '処理速度', description: '弾の速度が40%上がる' },
  { id: 'short-sleeper', name: 'ショートスリーパー', description: 'stun時間を半分にする' },
  { id: 'through-power', name: 'スルー力', description: '受けるSANダメージ-15%。ただし気にしない分EXP獲得-10%' },
  { id: 'listening', name: '傾聴力', description: '人の話をよく聞き学びが早い。EXP獲得+15%' },
  { id: 'proactiveness', name: '主体性', description: '自分から動くので発射間隔-7%・移動速度+8%' },
  { id: 'problem-solving', name: '問題解決力', description: '攻撃力+20%' },
  { id: 'logical-thinking', name: '論理的思考力', description: '筋道立てて評価されやすい。攻撃力+10%・獲得スコア+10%' },
  { id: 'priority-judgement', name: '優先順位判断力', description: '重要な仕事から片付け、獲得スコア+20%' },
  { id: 'learning-power', name: '学習力', description: 'EXP獲得+30%' },
  { id: 'stress-tolerance', name: 'ストレス耐性', description: '受けるSANダメージ-20%' },
  { id: 'business-manner', name: 'ビジネスマナー', description: '印象が良く、敵接触時のスコア減点-30%' },
  { id: 'negotiation', name: '交渉力', description: '敵の納期+15%' },
  { id: 'self-centered', name: '自己中心性', description: '攻撃力+15%だが、敵の反感を買いSANダメージ+15%' },
  { id: 'negative-thinking', name: '否定的思考', description: '素直に喜べず、チョコレートの回復量-30%' },
  { id: 'passivity', name: '消極性', description: '動きが鈍くなり発射間隔+15%・移動速度-10%' },
  { id: 'default-mode-network', name: 'デフォルトモードネットワーク', description: 'ぼーっとしている間に回復、待機時の脳疲労回復+40%' },
  { id: 'five-w-one-h', name: '５W１H', description: '説明が明確で仕事がスムーズ。敵の納期+10%・EXP獲得+10%' },
  { id: 'rising-ambition', name: '上昇志向', description: 'EXP獲得+25%だが、頑張りすぎて射撃疲労+15%' },
  { id: 'optimistic', name: '楽観的', description: '受けるSANダメージ-15%' },
  { id: 'pessimistic', name: '悲観的', description: '受けるSANダメージ+20%だが、慎重な見積りで敵の納期+10%' },
  { id: 'chocolate-addiction', name: 'チョコレート依存症', description: 'チョコレートの回復量+80%だが、待機時の回復-20%' },
  { id: 'communication', name: 'コミュニケーション力', description: 'レベルごとに15%の確率で援護射撃が発生する' },
  { id: 'report-shortage', name: '報連相不足', description: '情報共有不足で敵の納期-15%' },
  { id: 'inattentive', name: '注意力散漫', description: 'レベルごとに20%の確率で弾がランダムにそれる' },
  { id: 'silo-tendency', name: '属人化傾向', description: '自分にしかできない仕事が集中し、敵の接近速度+15%' },
  { id: 'perfectionism', name: '完璧主義', description: '質は高いが時間がかかる。攻撃力+25%だが発射間隔+15%' },
  { id: 'network-specialist', name: 'ネットワークスペシャリスト', description: '弾が画面端でレベルごとに1回多く跳ね返る' }
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
    case 'listening': specialSkillEffects.expGainMultiplier *= 1.15; break;
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
    case 'business-manner': specialSkillEffects.contactScorePenaltyMultiplier *= 0.7; break;
    case 'negotiation': specialDeadlineMultiplier *= 1.15; break;
    case 'self-centered':
      specialSkillEffects.damageMultiplier *= 1.15;
      specialSkillEffects.sanDamageMultiplier *= 1.15;
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
    case 'communication': specialSkillEffects.supportFireChance += 0.15; break;
    case 'report-shortage': specialDeadlineMultiplier *= 0.85; break;
    case 'inattentive': specialSkillEffects.bulletScatterChance += 0.2; break;
    case 'silo-tendency': specialSkillEffects.enemyApproachSpeedMultiplier *= 1.15; break;
    case 'perfectionism':
      specialSkillEffects.damageMultiplier *= 1.25;
      specialSkillEffects.fireRateMultiplier *= 1.15;
      break;
    case 'network-specialist': specialSkillEffects.bulletBounceCount += 1; break;
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

function openSpecialSkillSelection(title) {
  // 取得済みスキルも候補に含め、再取得するとレベルアップできる
  const availableSkills = [...specialSkills];

  // Fisher-Yates法で候補をシャッフルし、先頭から3つ選ぶ
  for (let i = availableSkills.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availableSkills[i], availableSkills[j]] = [availableSkills[j], availableSkills[i]];
  }
  specialSkillChoices = availableSkills.slice(0, 3);
  specialSkillSelectionTitle = title;
  specialSkillSelectionActive = true;
}

function chooseSpecialSkill(choiceIndex) {
  const skill = specialSkillChoices[choiceIndex];
  if (!skill) return;

  const newSkillLevel = (specialSkillLevels.get(skill.id) || 0) + 1;
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
  const newLevel = Math.floor(exp / expPerLevel);
  if (newLevel !== skillLevel) {
    if (newLevel > skillLevel) {
      const specialSkillCount = Math.floor(newLevel / 5) - Math.floor(skillLevel / 5);
      // レベルが上がった場合はメッセージを表示する
      skillLevel = newLevel;
      showMessage('スキルレベルが上昇しました！', 6000, '#00ffff', '50px sans-serif');
      queueSpecialSkillSelections(specialSkillCount);
    } else {
      skillLevel = newLevel;
    }
  }
}

function checkRankUp() {
  // 一度の判定では1ランクだけ昇格させる
  if (rank < 10 && score >= rankThresholds[rank]) {
    rank++;
    return true;
  }
  return false;
}

function rankUpAtDayEnd() {
  const promoted = checkRankUp();
  if (promoted) {
    showMessage('昇進しました！ ' + rank + ' ' + rankNames[rank-1], 4500, '#ffeb3b', '32px sans-serif');
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
  const isWeekendWork = currentDate.getDay() === 0 || currentDate.getDay() === 6;
  currentDate.setDate(currentDate.getDate() + 1);
  fatigue = Math.max(0, fatigue - dayFatigueRecover);
  san = Math.min(maxSan, san + daySanRecover);
  dayStartTime = gameClockMs;
  lastHourTime = gameClockMs;
  currentHour = dayStartHour;
  stunned = false;
  dayNumber++;
  showMessage(`DAY ${dayNumber} 開始${isWeekendWork ? '（休日出勤）' : ''}`, 2200, '#90caf9', '26px sans-serif');
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
  showMessage(`DAY ${dayNumber} 開始（月曜日）`, 2200, '#90caf9', '26px sans-serif');
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
    if (gameOver) return;
    weekendWorkChoice = true;
  }
}

// 休日の過ごし方（1:アイテム購入 2:休息 3:勉強）を適用する
function applyRestActivity(choiceIndex) {
  if (choiceIndex === 1) {
    san = Math.min(maxSan, san + 15);
    fatigue = Math.max(0, fatigue - 20);
    showMessage('買い物でリフレッシュ！ SAN +15 / 脳疲労 -20', 2500, '#ffcc80');
  } else if (choiceIndex === 2) {
    fatigue = 0;
    san = Math.min(maxSan, san + 25);
    showMessage('しっかり休息した！ 脳疲労が全回復 / SAN +25', 2500, '#80deea');
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
  const skill = specialSkills[Math.floor(Math.random() * specialSkills.length)];
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
  if (gameOver) return;
  startDayTransition(jumpToNextMondayAndResetWeek);
}

// ===== 画面上に表示する一時メッセージ =====
const messages = [];
function showMessage(text, ttl = 2000, color = 'white', font = '20px sans-serif') {
  messages.push({ text, ttl, initialTtl: ttl, color, font });
}

function getAllowedMaxTypeIndexByRank() {
  // ランク1～10を敵番号0～9へ対応させる（低ランクでは弱い敵だけ出す）
  const maxIdx = Math.floor((rank / 10) * (enemyTypeNames.length - 1));
  let capped = Math.max(0, Math.min(enemyTypeNames.length - 1, maxIdx));
  // 週のノルマを早期達成した週は、残りの期間は易しい仕事のみにする
  if (weeklyQuotaAchievedEarly) capped = Math.min(capped, 1);
  return capped;
}

// 納期が0になった敵を爆発させ、接触時の3倍のSANダメージを与える
function explodeEnemy(enemyIndex) {
  const enemy = enemies[enemyIndex];
  if (!enemy) return;

  const skillMitigation = Math.max(0.5, 1 - skillLevel * 0.04);
  const explosionDamage = Math.ceil(
    (enemy.type || 1) * contactSanMultiplier * skillMitigation * 3 *
    specialSkillEffects.sanDamageMultiplier
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
// スタート画面：通常速度(1)か3倍速(2)でゲームを開始する
function startGame(timeScale, title) {
  gameTimeScale = timeScale;
  startScreen = false;
  gameClockMs = 0;
  lastUpdate = Date.now();
  lastHourTime = 0;
  dayStartTime = 0;
  dayNumber = 1;
  resetWeeklyQuotaForNewWeek();
  openSpecialSkillSelection(title);
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
  // 特殊スキル選択中は数字キー1～3だけを受け付ける
  if (specialSkillSelectionActive) {
    const choiceIndex = Number(event.key) - 1;
    if (choiceIndex >= 0 && choiceIndex < specialSkillChoices.length) {
      chooseSpecialSkill(choiceIndex);
    }
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
  // 休日の過ごし方（1:アイテム購入 2:休息 3:勉強）を選ぶ
  if (restActivityChoice) {
    const choiceIndex = Number(event.key);
    if (choiceIndex >= 1 && choiceIndex <= 3) {
      restActivityChoice = false;
      applyRestActivity(choiceIndex);
      // 「勉強」以外はその場でランダムイベント＋週明けへ進む（勉強はスキル選択完了後に進む）
      if (choiceIndex !== 3) {
        finishRestDayAndAdvanceToMonday();
      }
    }
    return;
  }
  // スタート画面では通常開始か3倍加速開始を選ぶ
  if (startScreen) {
    if (event.key === '1' || event.key === 'Enter') {
      startGame(1, '最初の特殊スキルを選択');
    } else if (event.key === '2') {
      startGame(3, '3倍加速モード：最初の特殊スキルを選択');
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

// ===== タッチ操作：画面左半分＝仮想移動スティック、右半分＝照準・攻撃 =====
// pointerIdごとに役割（'move' | 'aim'）と状態を保持する（複数指の同時操作に対応）
const activeTouchPointers = new Map();
const touchMoveVector = { x: 0, y: 0 }; // 左スティックの入力方向（-1〜1）
const touchStickMaxRadius = 70;

function handleTouchStart(event, point) {
  if (point.x < canvas.width / 2) {
    activeTouchPointers.set(event.pointerId, {
      role: 'move', originX: point.x, originY: point.y, stickX: point.x, stickY: point.y
    });
    touchMoveVector.x = 0;
    touchMoveVector.y = 0;
  } else {
    activeTouchPointers.set(event.pointerId, { role: 'aim' });
    mousePosition.x = point.x;
    mousePosition.y = point.y;
    mouseFireHeld = true;
  }
}

function handleTouchMove(event, point) {
  const info = activeTouchPointers.get(event.pointerId);
  if (!info) return;
  if (info.role === 'move') {
    let dx = point.x - info.originX;
    let dy = point.y - info.originY;
    const dist = Math.hypot(dx, dy);
    if (dist > touchStickMaxRadius) {
      dx = (dx / dist) * touchStickMaxRadius;
      dy = (dy / dist) * touchStickMaxRadius;
    }
    info.stickX = info.originX + dx;
    info.stickY = info.originY + dy;
    touchMoveVector.x = dx / touchStickMaxRadius;
    touchMoveVector.y = dy / touchStickMaxRadius;
  } else {
    mousePosition.x = point.x;
    mousePosition.y = point.y;
  }
}

function handleTouchEnd(event) {
  const info = activeTouchPointers.get(event.pointerId);
  activeTouchPointers.delete(event.pointerId);
  if (!info) return;
  if (info.role === 'move') {
    touchMoveVector.x = 0;
    touchMoveVector.y = 0;
  } else {
    const stillAiming = [...activeTouchPointers.values()].some(v => v.role === 'aim');
    if (!stillAiming) mouseFireHeld = false;
  }
}

canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'mouse') {
    updateMousePosition(event);
  } else {
    handleTouchMove(event, getCanvasPoint(event));
  }
});
canvas.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse') {
    if (event.button !== 0) return;
    updateMousePosition(event);
    mouseFireHeld = true;
    canvas.setPointerCapture(event.pointerId);
  } else {
    canvas.setPointerCapture(event.pointerId);
    handleTouchStart(event, getCanvasPoint(event));
  }
});
canvas.addEventListener('pointerup', (event) => {
  if (event.pointerType === 'mouse') {
    if (event.button === 0) mouseFireHeld = false;
  } else {
    handleTouchEnd(event);
  }
});
canvas.addEventListener('pointercancel', (event) => {
  if (event.pointerType === 'mouse') {
    mouseFireHeld = false;
  } else {
    handleTouchEnd(event);
  }
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

// ===== メニュー選択のタップ／クリック対応 =====
// draw()が毎フレーム、現在表示中のメニューに応じて再構築する
let uiButtons = [];
canvas.addEventListener('click', (event) => {
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
  const now = gameClockMs + ((Date.now() - lastUpdate) * gameTimeScale);
  const dt = (now - gameClockMs) / 1000;
    lastUpdate = Date.now();
  if (isPaused) {
    return;
  }
  gameClockMs = now;

  // 爆発後の短い時間、Canvas全体をランダムに揺らす
  explosionFlashTimer = Math.max(0, explosionFlashTimer - dt * 1000);
  explosionShakeTimer = Math.max(0, explosionShakeTimer - dt * 1000);
  if (explosionShakeTimer > 0) {
    const shakeX = (Math.random() - 0.5) * 16;
    const shakeY = (Math.random() - 0.5) * 16;
    canvas.style.transform = `translate(${shakeX}px, ${shakeY}px)`;
  } else {
    canvas.style.transform = '';
  }

  // スタート前とゲーム終了後は、敵や納期の更新を止める
  if (gameOver || gameClear || startScreen || specialSkillSelectionActive) return;

  // 一時メッセージの残り表示時間を減らし、期限切れなら削除する
  for (let mi = messages.length - 1; mi >= 0; mi--) {
    messages[mi].ttl -= dt * 1000;
    if (messages[mi].ttl <= 0) messages.splice(mi, 1);
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

  // 週末の休日出勤選択・休日の過ごし方選択中は、ゲームの進行を止める
  if (weekendWorkChoice || restActivityChoice) return;

  // ゲーム内時刻を進める
  if (now - lastHourTime >= hourMs) {
    const passed = Math.floor((now - lastHourTime) / hourMs);
    lastHourTime += passed * hourMs;
    currentHour += passed;
    // 終業時刻になったら一日を終了する
    if (currentHour >= dayEndHour) {
      if (isLastDayOfMonth(currentDate)) {
        gameClear = true;
        sendScore(score);
        return;
      }
      rankUpAtDayEnd();
      // 週の最終稼働日なら週次ノルマを判定し、それ以外は自動的に翌日へ進む
      if (isWeekEndDay(currentDate)) {
        resolveWeekEnd();
      } else {
        startDayTransition(autoAdvanceDay);
      }
      return;
    }
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
      if (gameOver) return;
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
    // プレイヤーが画面外へ出ないよう座標を制限する
    player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));

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

    // 攻撃モードに関係なく、自機は常にマウスカーソルの方向を向く
    player.angle = Math.atan2(
      mousePosition.y - player.y,
      mousePosition.x - player.x
    );

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
          specialSkillEffects.firingFatigueMultiplier;
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
              bounces: specialSkillEffects.bulletBounceCount
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
              bounces: specialSkillEffects.bulletBounceCount
            });
          }
          // 発射時に疲労を増やす。スキルレベルが高いほど消耗を軽減する
          fatigue += projectedFatigue;
          if (fatigue >= maxFatigue) {
            fatigue = maxFatigue;
            stunned = true;
            stunTimer = stunDuration * specialSkillEffects.stunDurationMultiplier;
            // 疲労が限界に達したら行動不能にし、SANも減らす
            const sanMultiplier = Math.max(0.5, 1 - skillLevel * 0.04);
            damageSan(Math.ceil(
              stunSanPenalty * sanMultiplier * specialSkillEffects.sanDamageMultiplier
            ));
          }
        }
      }
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
        bullets.splice(i, 1);
        if (en.hp <= 0) {
            // 強い敵ほど多くのスコアを獲得する
            const pts = Math.ceil(en.type * 3 * specialSkillEffects.scoreGainMultiplier);
            score += pts;
            // 敵の種類に応じて経験値を獲得する
            exp += en.type * 5 * specialSkillEffects.expGainMultiplier;
            updateSkillEffects();
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
  if (gameOver) return;

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
        specialSkillEffects.sanDamageMultiplier
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
        specialSkillEffects.sanDamageMultiplier
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
// ===== ゲーム画面の描画 =====
// 毎フレーム、現在のゲーム状態をCanvasへ描く
function draw() {
  // タップ可能な矩形を、今フレームの表示内容に合わせて作り直す
  uiButtons = [];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (startScreen) {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Survivors風ゲーム', canvas.width / 2, canvas.height / 2 - 40);
    ctx.font = '20px sans-serif';
    ctx.fillText('1 or Enter / タップ = 通常開始', canvas.width / 2, canvas.height / 2 + 18);
    ctx.fillText('2 or タップ = 3倍加速モード', canvas.width / 2, canvas.height / 2 + 48);
    ctx.fillText('P = 一時停止 / 再開', canvas.width / 2, canvas.height / 2 + 78);
    ctx.fillText('WASD/タッチ = 移動 / マウス・ドラッグ = 照準 / F = 自動攻撃切替', canvas.width / 2, canvas.height / 2 + 108);
    ctx.textAlign = 'left';
    const btnW = 400, btnH = 32;
    uiButtons.push({
      x: canvas.width / 2 - btnW / 2, y: canvas.height / 2 + 18 - 24, w: btnW, h: btnH,
      action: () => startGame(1, '最初の特殊スキルを選択')
    });
    uiButtons.push({
      x: canvas.width / 2 - btnW / 2, y: canvas.height / 2 + 48 - 24, w: btnW, h: btnH,
      action: () => startGame(3, '3倍加速モード：最初の特殊スキルを選択')
    });
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (invincible) {
    const blink = Math.floor(gameClockMs / 100) % 2 === 0;
    ctx.globalAlpha = blink ? 0.4 : 0.8;
  } else {
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // 自機の正面方向を水色の照準線で示す
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(
    player.x + Math.cos(player.angle) * (player.radius + 18),
    player.y + Math.sin(player.angle) * (player.radius + 18)
  );
  ctx.strokeStyle = '#4dd0e1';
  ctx.lineWidth = 3;
  ctx.stroke();

  // stun中は、自機の上で眠っている「💤 Zzz」を点滅・上下移動させる
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
      ctx.fillStyle = 'rgba(255, 204, 128, 0.3)';
      ctx.fill();
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

  // プレイヤーの下に疲労ゲージを描く
  const gaugeW = 80;
  const gaugeH = 8;
  const gx = player.x - gaugeW / 2;
  const gy = player.y + player.radius + 12;
  ctx.fillStyle = 'gray';
  ctx.fillRect(gx, gy, gaugeW, gaugeH);
  const frac = Math.max(0, Math.min(1, fatigue / maxFatigue));
  ctx.fillStyle = frac < 0.5 ? '#66bb6a' : (frac < 0.8 ? '#ffa726' : '#ef5350');
  ctx.fillRect(gx, gy, gaugeW * frac, gaugeH);
  ctx.fillStyle = 'white';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('脳疲労: ' + Math.floor(fatigue), player.x, gy + gaugeH + 12);
  ctx.textAlign = 'left';

  // 疲労ゲージの横にSANを表示する
  ctx.fillStyle = 'white';
  ctx.font = '12px sans-serif';
  ctx.fillText('SAN: ' + Math.floor(san), player.x + gaugeW + 40, gy + gaugeH + 12);

  // 画面右上、日付表示の下に寿命ゲージを表示する（じわじわとしか減らないので目立たせすぎない色にする）
  const lifespanFrac = Math.max(0, Math.min(1, lifespan / maxLifespan));
  const lifeGaugeW = 100, lifeGaugeH = 8, lifeGx = canvas.width - lifeGaugeW - 12, lifeGy = 34;
  ctx.fillStyle = 'gray';
  ctx.fillRect(lifeGx, lifeGy, lifeGaugeW, lifeGaugeH);
  ctx.fillStyle = lifespanFrac < 0.3 ? '#ef5350' : '#ba68c8';
  ctx.fillRect(lifeGx, lifeGy, lifeGaugeW * lifespanFrac, lifeGaugeH);
  ctx.fillStyle = 'white';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('寿命: ' + Math.ceil(lifespan), lifeGx + lifeGaugeW, lifeGy + lifeGaugeH + 14);
  ctx.textAlign = 'left';

  // 現在の攻撃モードと行動不能状態を表示する
  ctx.fillStyle = 'white';
  ctx.font = '14px sans-serif';
  ctx.fillText('攻撃モード: ' + (autoFireEnabled ? '自動' : '手動') + (stunned ? '（行動不能）' : ''), 12, 48);
  // 現在のスコアを表示する
  ctx.fillStyle = 'white';
  ctx.font = '20px sans-serif';
  ctx.fillText('Score: ' + score, 12, 24);
  // 現在のランク、スキルレベル、経験値を表示する
  ctx.font = '14px sans-serif';
  ctx.fillText('Rank: ' + rank + ' ' + rankNames[rank-1], 12, 72);
  ctx.fillText('Skill Lvl: ' + skillLevel + '  EXP: ' + exp, 12, 96);
  // 週間ノルマの進捗を表示する（早期達成なら色を変える）
  ctx.font = '13px sans-serif';
  ctx.fillStyle = weeklyQuotaAchievedEarly ? '#69f0ae' : '#b0bec5';
  ctx.fillText(
    `週ノルマ: 撃破 ${weeklyKills}/${weeklyKillQuota}  Score ${weeklyScoreGained}/${weeklyScoreQuota}` +
    (weeklyQuotaAchievedEarly ? '（達成！）' : ''),
    12, 118
  );
  // 一時メッセージを画面上部の中央に表示する
  if (messages.length > 0) {
    ctx.textAlign = 'center';
    let y = 140;
    for (const m of messages) {
      ctx.font = m.font || '20px sans-serif';
      // 残り時間に応じてメッセージを徐々に透明にする
      let alpha = 1;
      if (m.initialTtl && m.initialTtl > 0) alpha = Math.max(0, Math.min(1, m.ttl / m.initialTtl));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = m.color || 'white';
      ctx.fillText(m.text, canvas.width / 2, y);
      ctx.restore();
      y += 28;
    }
    ctx.textAlign = 'left';
  }
  // 画面右上に日付・時刻・曜日を表示する
  const yName = weekdayNames[currentDate.getDay()];
  const holidayFlag = isHoliday(currentDate) || yName === '土' || yName === '日';
  ctx.font = '16px sans-serif';
  ctx.fillStyle = holidayFlag ? '#ffeb3b' : 'white';
  const hourStr = String(currentHour).padStart(2,'0') + ':00';
  const dateStr = `DAY${dayNumber} ${currentDate.getFullYear()}/${String(currentDate.getMonth()+1).padStart(2,'0')}/${String(currentDate.getDate()).padStart(2,'0')} ${hourStr} (${yName})`;
  ctx.fillText(dateStr, canvas.width - 12 - ctx.measureText(dateStr).width, 24);
  // 全ての敵を描画する
  for (const en of enemies) {
    // 当たり判定の円を先に描き、敵の文字が常に手前になるようにする
    ctx.beginPath();
    ctx.arc(en.x, en.y, en.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(160, 160, 160, 0.28)';
    ctx.fill();

    ctx.font = en.font;
    ctx.fillStyle = en.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (en.text) {
      ctx.fillText(en.text, en.x, en.y);
      // 敵の名前の下に残りHP（残工数）を表示する
      const fm = (en.font || '').match(/(\d+)px/);
      const fSize = fm ? parseInt(fm[1], 10) : 28;
      ctx.font = '14px sans-serif';
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.fillText('残工数: ' + (en.hp || 0), en.x, en.y + fSize / 1.2);
      // 納期の残り秒数を表示し、5秒以下になったら赤色で警告する
      const deadlineSeconds = Math.max(0, en.deadlineMs / 1000);
      ctx.fillStyle = deadlineSeconds <= 5 ? '#ff5252' : '#ffeb3b';
      ctx.fillText(`納期: ${deadlineSeconds.toFixed(1)}秒`, en.x, en.y + fSize / 1.2 + 17);
      ctx.textAlign = 'left';
    }
  }
  ctx.textAlign = 'left';

  // タッチ操作中のみ、仮想移動スティックを描画する
  for (const info of activeTouchPointers.values()) {
    if (info.role !== 'move') continue;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.arc(info.originX, info.originY, touchStickMaxRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(info.stickX, info.stickY, touchStickMaxRadius * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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
  }

  if (gameClear) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#8df5c5';
    ctx.font = '52px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GAME CLEAR', canvas.width / 2, canvas.height / 2 - 28);
    ctx.font = '24px sans-serif';
    ctx.fillStyle = 'white';
    ctx.fillText('Final Score: ' + score, canvas.width / 2, canvas.height / 2 + 24);
    ctx.textAlign = 'left';
  }

  if (gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 20);
    ctx.font = '24px sans-serif';
    ctx.fillText('Final Score: ' + score, canvas.width / 2, canvas.height / 2 + 24);
    ctx.textAlign = 'left';
  }
  // 週間ノルマ未達成：休日出勤するかどうかの選択画面
  if (weekendWorkChoice && !gameOver && !gameClear) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ff8a65';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('今週のノルマを達成できませんでした…', canvas.width / 2, canvas.height / 2 - 60);
    ctx.fillText('土日祝日も働きますか？', canvas.width / 2, canvas.height / 2 - 24);
    ctx.font = '20px sans-serif';
    ctx.fillStyle = 'white';
    ctx.fillText('Y / タップ = 出勤する（土日ともに稼働）', canvas.width / 2, canvas.height / 2 + 16);
    ctx.fillText('N / タップ = 休む（評価がさらに下がる）', canvas.width / 2, canvas.height / 2 + 48);
    ctx.textAlign = 'left';
    const btnW = 420, btnH = 32;
    uiButtons.push({
      x: canvas.width / 2 - btnW / 2, y: canvas.height / 2 + 16 - 24, w: btnW, h: btnH,
      action: () => handleWeekendWorkChoice('work')
    });
    uiButtons.push({
      x: canvas.width / 2 - btnW / 2, y: canvas.height / 2 + 48 - 24, w: btnW, h: btnH,
      action: () => handleWeekendWorkChoice('rest')
    });
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
      ctx.fillText(line, canvas.width / 2, canvas.height / 2 - 60 - extraOffset + i * 34);
    });
    ctx.font = '20px sans-serif';
    const optionBaseY = canvas.height / 2 - 10 + extraOffset;
    const optionLabels = [
      '1 / タップ = アイテム購入 (SAN +15 / 脳疲労 -20)',
      '2 / タップ = 休息 (脳疲労が全回復 / SAN +25)',
      '3 / タップ = スキル選択・勉強 (特殊スキルを1つ選ぶ)'
    ];
    optionLabels.forEach((label, i) => {
      ctx.fillText(label, canvas.width / 2, optionBaseY + i * 32);
    });
    ctx.textAlign = 'left';
    const btnW = 460, btnH = 30;
    [1, 2, 3].forEach((choiceIndex, i) => {
      const y = optionBaseY + i * 32;
      uiButtons.push({
        x: canvas.width / 2 - btnW / 2, y: y - 22, w: btnW, h: btnH,
        action: () => {
          restActivityChoice = false;
          applyRestActivity(choiceIndex);
          if (choiceIndex !== 3) finishRestDayAndAdvanceToMonday();
        }
      });
    });
  }

  // 特殊スキルの3択画面。数字キー1～3で取得する
  if (specialSkillSelectionActive) {
    ctx.fillStyle = 'rgba(8, 10, 24, 0.9)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e1bee7';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(specialSkillSelectionTitle, canvas.width / 2, 70);

    specialSkillChoices.forEach((skill, index) => {
      const cardX = 90;
      const cardY = 115 + index * 125;
      const cardWidth = canvas.width - 180;
      const cardHeight = 95;
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
        cardY + 34
      );
      ctx.fillStyle = '#e0e0e0';
      ctx.font = '16px sans-serif';
      ctx.fillText(skill.description, cardX + 22, cardY + 68);

      uiButtons.push({ x: cardX, y: cardY, w: cardWidth, h: cardHeight, action: () => chooseSpecialSkill(index) });
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff59d';
    ctx.font = '18px sans-serif';
    ctx.fillText('数字キー 1～3 / タップで選択', canvas.width / 2, 530);
    ctx.textAlign = 'left';
  }

  // 爆発直後は画面全体へ白い半透明レイヤーを重ねてフラッシュさせる
  if (explosionFlashTimer > 0) {
    const flashAlpha = 0.75 * (explosionFlashTimer / explosionEffectDuration);
    ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
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
}
// ===== メインループ =====
// 状態更新と画面描画を、ブラウザの描画タイミングに合わせて繰り返す
function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}
gameLoop();
