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
const maxEnemies = 3;
const spawnInterval = 3200; // 敵を生成する間隔（ミリ秒）
const enemyCollisionRadius = 32;
const minDeadlineMs = 5000; // 納期の最短時間（5秒）
const maxDeadlineMs = 30000; // 納期の最長時間（30秒）
let specialDeadlineMultiplier = 1;
let lastSpawn = 0;

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

// ゲーム開始時の敵を2体生成する
for (let i = 0; i < 2; i++) spawnEnemy();
// ===== 弾・スコア・ゲーム状態 =====
// プレイヤーが発射した弾を保存する配列
const bullets = [];
const baseFireRate = 350; // 基本の発射間隔（従来の半分、ミリ秒）
let lastFire = 0;
let score = 0;
let gameOver = false;
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
const hourMs = 20000; // 現実の20秒をゲーム内の1時間として扱う
const dayStartHour = 9;
const dayEndHour = 18;
let dayStartTime = Date.now();
let lastHourTime = dayStartTime;
let currentHour = dayStartHour;
let dayEnded = false;
let noonChoice = false; // 12時の選択待ちかどうか
let noonContinueMode = false; // trueの間は、指定時刻まで敵が停止する
let noonModeEndTime = 0;
// 一日の終了時に「続ける」を選んだ場合の回復量
const dayFatigueRecover = 30;
const daySanRecover = 10;
// 昼に「継続」を選んだ場合の消耗量
const noonFatigueIncreasePerSec = 4; // 継続中の1秒あたりの疲労増加量
const noonSanDrainPerSec = 2;

// ===== SAN（精神力）システム =====
const maxSan = 100;
let san = maxSan;

// SANが減少する量
const stunSanPenalty = 8;
const contactSanMultiplier = 4; // 接触時のSAN減少量 = 敵の種類 × この倍率

// ===== カレンダーと祝日 =====
let currentDate = new Date();
const weekdayNames = ['日','月','火','水','木','金','土'];
// 日付が毎年変わらない祝日を「月-日」で登録する
const holidayMMDD = new Set(['01-01','02-11','04-29','05-03','05-04','05-05','11-03','11-23']);
function isHoliday(d) {
  const mm = String(d.getMonth() + 1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return holidayMMDD.has(`${mm}-${dd}`);
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
const rankThresholds = [0, 10, 30, 60, 100, 150, 210, 280, 360, 450]; // 各ランクへの昇格に必要なスコア

// スキルレベルと経験値
let exp = 0;
const expPerLevel = 30; // 経験値30ごとにスキルレベルが上がる
let skillLevel = 0;

// 時刻によって敵を加速させる倍率
const speedDayIncreaseFactor = 0.6; // 終業時には最大60%速くなる

// ===== 特殊スキルシステム =====
const specialSkillEffects = {
  multiTaskLevel: 0,
  tripleShotLevel: 0,
  moveSpeedMultiplier: 1,
  firingFatigueMultiplier: 1,
  fireRateMultiplier: 1,
  damageMultiplier: 1,
  chocolateRecoveryMultiplier: 1,
  sanDamageMultiplier: 1,
  bulletSpeedMultiplier: 1,
  stunDurationMultiplier: 1
};

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
  { id: 'short-sleeper', name: 'ショートスリーパー', description: 'stun時間を半分にする' }
];

// スキルIDと取得レベルを対応させて保存する
const specialSkillLevels = new Map();
let specialSkillChoices = [];
let specialSkillSelectionActive = false;
let specialSkillSelectionTitle = '';
let pendingSpecialSkillSelections = 0;

function applySpecialSkill(skillId) {
  switch (skillId) {
    case 'dual-shot': specialSkillEffects.multiTaskLevel++; break;
    case 'speed-up': specialSkillEffects.moveSpeedMultiplier *= 1.5; break;
    case 'fatigue-save': specialSkillEffects.firingFatigueMultiplier *= 0.65; break;
    case 'rapid-fire': specialSkillEffects.fireRateMultiplier *= 0.75; break;
    case 'power-shot': specialSkillEffects.damageMultiplier *= 1.5; break;
    case 'triple-shot': specialSkillEffects.tripleShotLevel++; break;
    case 'chocolate-lover': specialSkillEffects.chocolateRecoveryMultiplier *= 1.5; break;
    case 'deadline-master':
      specialDeadlineMultiplier *= 1.5;
      enemies.forEach(enemy => { enemy.deadlineMs *= 1.5; });
      break;
    case 'mental-guard': specialSkillEffects.sanDamageMultiplier *= 0.75; break;
    case 'high-speed-bullet': specialSkillEffects.bulletSpeedMultiplier *= 1.4; break;
    case 'short-sleeper': specialSkillEffects.stunDurationMultiplier *= 0.5; break;
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
  applySpecialSkill(skill.id);
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
    // 一日の終了時に選択するまで、昇格メッセージを表示し続ける
    persistentPromotion = {
      text: '昇進しました！ ' + rank + ' ' + rankNames[rank-1],
      color: '#ffeb3b',
      font: '32px sans-serif'
    };
  }
}

// ===== 画面上に表示する一時メッセージ =====
const messages = [];
function showMessage(text, ttl = 2000, color = 'white', font = '20px sans-serif') {
  messages.push({ text, ttl, initialTtl: ttl, color, font });
}
// 一日の終了時に回答するまで表示する昇格メッセージ
let persistentPromotion = null;

function getAllowedMaxTypeIndexByRank() {
  // ランク1～10を敵番号0～9へ対応させる（低ランクでは弱い敵だけ出す）
  const maxIdx = Math.floor((rank / 10) * (enemyTypeNames.length - 1));
  return Math.max(0, Math.min(enemyTypeNames.length - 1, maxIdx));
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

  san = Math.max(0, san - explosionDamage);
  enemies.splice(enemyIndex, 1);
  explosionFlashTimer = explosionEffectDuration;
  explosionShakeTimer = explosionEffectDuration;
  showMessage(`納期経過！ SAN -${explosionDamage}`, 1200, '#ff5252', '28px sans-serif');

  if (san <= 0) {
    gameOver = true;
    sendScore(score);
  } else {
    spawnEnemy();
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

  // 昼の選択画面を表示している場合
  if (noonChoice) {
    // Rキーで休憩、Cキーで継続する
    if (event.key === 'r') {
      // 休憩：疲労とSANを約30%回復し、13時まで進める
      fatigue = Math.max(0, fatigue - Math.floor(maxFatigue * 0.3));
      san = Math.min(maxSan, san + Math.floor(maxSan * 0.3));
      currentHour = 13;
      lastHourTime = Date.now();
      noonChoice = false;
    } else if (event.key === 'c') {
      // 継続：敵は1時間停止するが、脳疲労が増えてSANが減り続ける
      noonChoice = false;
      noonContinueMode = true;
      noonModeEndTime = Date.now() + hourMs;
      lastHourTime = Date.now();
    }
    return;
  }
  // 一日が終了している場合は、翌日へ進むか終了するかを処理する
  if (dayEnded) {
    if (event.key === 'y') {
      // 継続：少し回復して翌日を開始する
      // カレンダーの日付を1日進める
      currentDate.setDate(currentDate.getDate() + 1);
      fatigue = Math.max(0, fatigue - dayFatigueRecover);
      san = Math.min(maxSan, san + daySanRecover);
      dayEnded = false;
      dayStartTime = Date.now();
      lastHourTime = Date.now();
      currentHour = dayStartHour;
      lastUpdate = Date.now();
      stunned = false;
      // 翌日へ進むときに昇格メッセージを消す
      persistentPromotion = null;
    } else if (event.key === 'n') {
      gameOver = true;
      sendScore(score);
    }
    return;
  }
  // スタート画面ではEnterキーでゲームを開始する
  if (startScreen) {
    if (event.key === 'Enter') {
      startScreen = false;
      lastUpdate = Date.now();
      lastHourTime = Date.now();
      openSpecialSkillSelection('最初の特殊スキルを選択');
    }
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

// ===== マウスによる照準と攻撃 =====
// ブラウザ上のマウス座標をCanvas内部の座標へ変換する
function updateMousePosition(event) {
  const rect = canvas.getBoundingClientRect();
  mousePosition.x = (event.clientX - rect.left) * (canvas.width / rect.width);
  mousePosition.y = (event.clientY - rect.top) * (canvas.height / rect.height);
  player.angle = Math.atan2(
    mousePosition.y - player.y,
    mousePosition.x - player.x
  );
}

canvas.addEventListener('pointermove', updateMousePosition);
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  updateMousePosition(event);
  mouseFireHeld = true;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointerup', (event) => {
  if (event.button === 0) mouseFireHeld = false;
});
canvas.addEventListener('pointercancel', () => {
  mouseFireHeld = false;
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

// ===== ゲーム状態の更新 =====
// 毎フレーム、移動・攻撃・時刻・衝突などを計算する
function update() {
  const now = Date.now();
  const dt = (now - lastUpdate) / 1000;
  lastUpdate = now;

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
  if (gameOver || startScreen || specialSkillSelectionActive) return;

  // 一時メッセージの残り表示時間を減らし、期限切れなら削除する
  for (let mi = messages.length - 1; mi >= 0; mi--) {
    messages[mi].ttl -= dt * 1000;
    if (messages[mi].ttl <= 0) messages.splice(mi, 1);
  }
  // 一日の終了画面以外では昇格メッセージを消す
  if (!dayEnded) persistentPromotion = null;

  // 昼または一日の終了時の選択中は、ゲームの進行を止める
  if (noonChoice || dayEnded) return;

  // ゲーム内時刻を進める
  // 昼に「継続」を選んだ時間を処理する
  if (noonContinueMode) {
    // 継続中は脳疲労を増やし、SANを少しずつ減らす
    fatigue += noonFatigueIncreasePerSec * dt;
    if (autoFireEnabled) {
      san -= noonSanDrainPerSec * dt;
    }
    if (san <= 0) { san = 0; gameOver = true; sendScore(score); return; }
    if (now >= noonModeEndTime) {
      noonContinueMode = false;
      // 継続時間が終わったら13時へ進める
      currentHour = 13;
      lastHourTime = now;
    }
  }

  // 選択画面や昼の継続中でなければ、通常どおり時刻を進める
  if (!dayEnded && !noonChoice && !noonContinueMode) {
    if (now - lastHourTime >= hourMs) {
      const passed = Math.floor((now - lastHourTime) / hourMs);
      lastHourTime += passed * hourMs;
      const prevHour = currentHour;
      currentHour += passed;
      // 12時になったら昼の選択画面を開く
      if (prevHour < 12 && currentHour >= 12) {
        currentHour = 12;
        noonChoice = true;
        return;
      }
      // 終業時刻になったら一日を終了する
      if (currentHour >= dayEndHour) {
        dayEnded = true;
        rankUpAtDayEnd();
        return;
      }
    }
  }

  // 上限数に達していなければ、一定間隔で敵を生成する
  if (now - lastSpawn >= spawnInterval && enemies.length < maxEnemies) {
    spawnEnemy();
    lastSpawn = now;
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
      fatigue = Math.max(0, fatigue - idleRecoveryPerSec * dt);
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
            const bulletAngle = shotAngle + offsetDegrees * Math.PI / 180;
            bullets.push({
              x: player.x + Math.cos(bulletAngle) * player.radius,
              y: player.y + Math.sin(bulletAngle) * player.radius,
              vx: Math.cos(bulletAngle) * speed,
              vy: Math.sin(bulletAngle) * speed,
              radius: 4,
              damage
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
            san -= Math.ceil(
              stunSanPenalty * sanMultiplier * specialSkillEffects.sanDamageMultiplier
            );
            if (san <= 0) {
              san = 0;
              gameOver = true;
              sendScore(score);
            }
          }
        }
      }
    }
  }

  // 敵をプレイヤーへ向けて移動する。当たり判定の半径は固定
  for (const e of enemies) {
    if (!noonContinueMode) {
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      // 時刻が遅くなるほど敵の移動速度を上げる
      const dayProgress = Math.max(0, Math.min(1, (currentHour - dayStartHour) / (dayEndHour - dayStartHour)));
      const timeSpeedMultiplier = 1 + dayProgress * speedDayIncreaseFactor;
      e.x += (dx / dist) * (e.speed * timeSpeedMultiplier);
      e.y += (dy / dist) * (e.speed * timeSpeedMultiplier);
    }
  }

  // ===== 弾の移動と敵への命中判定 =====
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx;
    b.y += b.vy;
    // 画面外へ出た弾を配列から削除する
    if (b.x < -10 || b.x > canvas.width + 10 || b.y < -10 || b.y > canvas.height + 10) {
      bullets.splice(i, 1);
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
        bullets.splice(i, 1);
        if (en.hp <= 0) {
            // 強い敵ほど多くのスコアを獲得する
            const pts = Math.ceil(en.type * 3);
            score += pts;
            // 敵の種類に応じて経験値を獲得する
            exp += en.type * 5;
            updateSkillEffects();
          enemies.splice(j, 1);
          spawnEnemy();
        }
        break;
      }
    }
  }

  // 疲労値が0～最大値の範囲を超えないようにする
  fatigue = Math.max(0, Math.min(maxFatigue, fatigue));
  // ===== 敵とプレイヤーの接触判定 =====
  for (let j = enemies.length - 1; j >= 0; j--) {
    const en = enemies[j];
    const ed = Math.hypot(en.x - player.x, en.y - player.y);
    if (ed <= en.radius + player.radius) {
      if (!invincible) {
        // 接触した敵の種類に応じてSANを減らす
        updateSkillEffects();
        const sanMultiplier = Math.max(0.5, 1 - skillLevel * 0.04);
        if (!en.touching) {
          // 接触した瞬間：SANダメージを与え、無敵時間を開始する
          const sdamage = Math.ceil(
            (en.type || 1) * contactSanMultiplier * sanMultiplier *
            specialSkillEffects.sanDamageMultiplier
          );
          san -= sdamage;
          en.touching = true;
          invincible = true;
          invincibleTimer = invincibleDuration;
          // 最初の接触時、敵にも弾1発相当のダメージを与える
          const contactConditionRatio = 1 - Math.max(0, Math.min(1, fatigue / maxFatigue));
          const contactDamage = Math.max(1, Math.round(baseBulletDamage * contactConditionRatio * (1 + skillLevel * 0.08)));
          en.hp = (en.hp || 1) - contactDamage;
          if (en.hp <= 0) {
            // 接触で倒した場合も、弾で倒した場合と同じ報酬を与える
            const pts = Math.ceil(en.type * 3);
            score += pts;
            exp += en.type * 5;
            updateSkillEffects();
            enemies.splice(j, 1);
            spawnEnemy();
          }
        } else {
          // 接触し続けている間は、少しずつSANを減らす
          const sustainedDrain = Math.max(
            1,
            (en.type || 1) * contactSanMultiplier * sanMultiplier * 0.18 * dt *
            specialSkillEffects.sanDamageMultiplier
          );
          san -= sustainedDrain;
        }
        // 敵との接触によるスコア減点
        const penalty = Math.ceil((en.type || 1) * 2);
        score = Math.max(0, score - penalty);
        // 残りHPが0以下になった敵だけを削除する
        if (en.hp <= 0) {
          enemies.splice(j, 1);
          spawnEnemy();
        }
        if (san <= 0) {
          san = 0;
          gameOver = true;
          sendScore(score);
          break;
        }
      }
    } else {
      en.touching = false;
    }
  }
  // 疲労値の制限と各種当たり判定は上の処理で完了
}
// ===== ゲーム画面の描画 =====
// 毎フレーム、現在のゲーム状態をCanvasへ描く
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (startScreen) {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Survivors風ゲーム', canvas.width / 2, canvas.height / 2 - 40);
    ctx.font = '20px sans-serif';
    ctx.fillText('Enterキーでスタート', canvas.width / 2, canvas.height / 2 + 20);
    ctx.fillText('WASDで移動、マウスで照準、左クリックで攻撃', canvas.width / 2, canvas.height / 2 + 60);
    ctx.fillText('Fキーで手動攻撃／自動攻撃を切り替え', canvas.width / 2, canvas.height / 2 + 90);
    ctx.textAlign = 'left';
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (invincible) {
    const blink = Math.floor(Date.now() / 100) % 2 === 0;
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
  if (stunned && Math.floor(Date.now() / 300) % 2 === 0) {
    const sleepFloatY = Math.sin(Date.now() / 180) * 4;
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
  // JavaScriptが動いていることを確認するためのデバッグ表示
  ctx.font = '12px monospace';
  ctx.fillStyle = 'white';
  ctx.fillText('JS OK', 12, 120);
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
  const dateStr = `${currentDate.getFullYear()}/${String(currentDate.getMonth()+1).padStart(2,'0')}/${String(currentDate.getDate()).padStart(2,'0')} ${hourStr} (${yName})`;
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
  // 12時の選択待ちなら、休憩・継続の選択画面を表示する
  if (noonChoice && !gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('12:00 休憩しますか？', canvas.width / 2, canvas.height / 2 - 40);
    ctx.font = '20px sans-serif';
    ctx.fillText('R = 休憩 (13:00 へ移動, 脳疲労/SAN 約30%回復)', canvas.width / 2, canvas.height / 2 + 8);
    ctx.fillText('C = 継続 (敵停止、脳疲労は増加、SANは減少)', canvas.width / 2, canvas.height / 2 + 40);
    ctx.textAlign = 'left';
  }
  // 一日が終了したら、翌日へ進むか終了するかの選択画面を表示する
  if (dayEnded && !gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    // 昇格した場合は、選択画面に大きな昇格メッセージを表示する
    if (persistentPromotion) {
      ctx.font = persistentPromotion.font || '64px sans-serif';
      ctx.fillStyle = persistentPromotion.color || '#ffeb3b';
      ctx.fillText(persistentPromotion.text, canvas.width / 2, canvas.height / 2 - 100);
      ctx.font = '28px sans-serif';
    }
    ctx.fillText('一日が終了しました', canvas.width / 2, canvas.height / 2 - 40);
    ctx.font = '20px sans-serif';
    ctx.fillText('続けますか？ Y = 続ける / N = 終了', canvas.width / 2, canvas.height / 2 + 8);
    ctx.textAlign = 'left';
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
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff59d';
    ctx.font = '18px sans-serif';
    ctx.fillText('数字キー 1～3 で選択', canvas.width / 2, 530);
    ctx.textAlign = 'left';
  }

  // 爆発直後は画面全体へ白い半透明レイヤーを重ねてフラッシュさせる
  if (explosionFlashTimer > 0) {
    const flashAlpha = 0.75 * (explosionFlashTimer / explosionEffectDuration);
    ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
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
