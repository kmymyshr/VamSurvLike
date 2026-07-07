const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
console.log('main.js loaded');
const player = {
  x: 400,
  y: 300,
  radius: 15,
  speed: 4
};
// spawn enemy offscreen (returns {x,y})
function spawnEnemyOffscreen() {
  const margin = 80;
  const side = Math.floor(Math.random() * 4);
  let x, y;
  if (side === 0) { // left
    x = -margin;
    y = Math.random() * canvas.height;
  } else if (side === 1) { // right
    x = canvas.width + margin;
    y = Math.random() * canvas.height;
  } else if (side === 2) { // top
    x = Math.random() * canvas.width;
    y = -margin;
  } else { // bottom
    x = Math.random() * canvas.width;
    y = canvas.height + margin;
  }
  return { x, y };
}

// enemy types ordered weak -> strong
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

// geometric weights: weight_i = ratio^(i-1)
const rarityRatio = 0.6; // geometric ratio (0<r<1) -> stronger ones rarer
const typeWeights = enemyTypeNames.map((_, i) => Math.pow(rarityRatio, i));
const totalWeight = typeWeights.reduce((a, b) => a + b, 0);

// prelim rank declaration to avoid TDZ when spawning early
let rank = 1;

function chooseEnemyTypeIndex() {
  // limit available types by rank
  const maxIdx = getAllowedMaxTypeIndexByRank();
  // compute truncated weights
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
  // hp scales with type (weaker=1.. stronger higher)
  e.hp = Math.ceil(1 + idx * 0.6 + Math.random() * 1.0); // lower HP overall
  // speed: stronger enemies move slower on average
  e.speed = Math.max(0.08, 0.95 - idx * 0.06 + (Math.random() - 0.5) * 0.08);
  // color gradation based on type
  const hue = Math.max(0, 10 - idx) * 12; // redder for stronger
  e.color = `hsl(${hue},80%,50%)`;
}

// multiple enemies
const enemies = [];
const maxEnemies = 3;
const spawnInterval = 3200; // ms (reduced frequency)
let lastSpawn = 0;

function spawnEnemy(typeIndex) {
  // try to spawn without overlapping existing enemies or player
  let attempts = 0;
  let p;
  do {
    p = spawnEnemyOffscreen();
    attempts++;
    // small random shift toward inside so they don't all stack exactly on edge
    p.x += (Math.random() - 0.5) * 40;
    p.y += (Math.random() - 0.5) * 40;
    // approximate enemy radius by measuring text width using a temporary dummy canvas
    let tempRadius = 20;
    if (enemyTypeNames[typeIndex] || enemyTypeNames[chooseEnemyTypeIndex()]) {
      ctx.font = '28px sans-serif';
      const text = enemyTypeNames[typeIndex] || '敵';
      const metrics = ctx.measureText(text);
      const textWidth = metrics.width || 0;
      tempRadius = Math.max(20, textWidth / 2 + 10);
    }
    const tooClose = enemies.some(en => Math.hypot(en.x - p.x, en.y - p.y) < (en.radius + tempRadius + 20)) || Math.hypot(player.x - p.x, player.y - p.y) < 150;
    if (!tooClose) break;
  } while (attempts < 18);
  const e = { x: p.x, y: p.y, radius: 20 };
  setEnemyStats(e, typeIndex);
  e.touched = false;
  enemies.push(e);
  return e;
}

// create initial enemies (start lighter)
for (let i = 0; i < 2; i++) spawnEnemy();
// bullets fired by player
const bullets = [];
const baseFireRate = 700; // base ms between shots
let lastFire = 0;
let score = 0;
let gameOver = false;
let startScreen = true;

// Brain fatigue system
const maxFatigue = 100;
let fatigue = maxFatigue;
let stunned = false;
const stunDuration = 3000; // ms stunned when fatigue hits 0
let stunTimer = 0;
let invincible = false;
const invincibleDuration = 1200; // ms after initial contact
let invincibleTimer = 0;
let lastUpdate = Date.now();

// auto-fire toggle
let autoFireEnabled = true;

// rates (per second or per shot)
const movingDrainPerSec = 6; // fatigue drain per second when moving
const firingDrainPerShot = 18; // fatigue drain per shot
const idleRecoveryPerSec = 12; // fatigue recovery per second when idle (50% faster)
const stunRecoveryPerSec = 12; // recovery per second while stunned
const fireRateMultiplier = 1.5; // additional multiplier when fatigue is 0 -> increases interval
const baseBulletDamage = 2; // damage at full fatigue

// Day / calendar system
const hourMs = 20000; // 20 seconds real = 1 hour in-game
const dayStartHour = 9;
const dayEndHour = 18;
let dayStartTime = Date.now();
let lastHourTime = dayStartTime;
let currentHour = dayStartHour;
let dayEnded = false;
let noonChoice = false; // whether waiting for noon choice at 12:00
let noonContinueMode = false; // if true, enemies stop until noonModeEndTime
let noonModeEndTime = 0;
// recovery amounts when player chooses to continue at day end
const dayFatigueRecover = 30;
const daySanRecover = 10;
// noon mode drains/recovery
const noonFatigueDrainPerSec = 4; // continuous drain when choosing 継続 at noon
const noonSanDrainPerSec = 2;

// SAN system
const maxSan = 100;
let san = maxSan;

// penalty amounts
const stunSanPenalty = 8;
const contactSanMultiplier = 4; // SAN loss = type * multiplier on contact

// calendar/date
let currentDate = new Date();
const weekdayNames = ['日','月','火','水','木','金','土'];
// simple fixed-date holidays (MM-DD)
const holidayMMDD = new Set(['01-01','02-11','04-29','05-03','05-04','05-05','11-03','11-23']);
function isHoliday(d) {
  const mm = String(d.getMonth() + 1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return holidayMMDD.has(`${mm}-${dd}`);
}

function sendScore(finalScore) {
  // send score to Java server (change URL if needed)
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
// Rank and Skill system
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
// rank already declared earlier
const rankThresholds = [0, 10, 30, 60, 100, 150, 210, 280, 360, 450]; // score required for each rank index (1-based)

// skill/exp
let exp = 0;
const expPerLevel = 30; // level up every 30 exp for faster early growth
let skillLevel = 0;

// enemy time-of-day speed scaling: how much faster enemies become by end of day
const speedDayIncreaseFactor = 0.6; // 0 = no change, 0.6 = up to +60% faster at day end

function updateSkillEffects() {
  const newLevel = Math.floor(exp / expPerLevel);
  if (newLevel !== skillLevel) {
    if (newLevel > skillLevel) {
      // leveled up
      skillLevel = newLevel;
      showMessage('スキルレベルが上昇しました！', 2200, '#00ffff', '100px sans-serif');
    } else {
      skillLevel = newLevel;
    }
  }
}

function checkRankUp() {
  // only allow a single-step promotion check (no multi-step)
  if (rank < 10 && score >= rankThresholds[rank]) {
    rank++;
    return true;
  }
  return false;
}

function rankUpAtDayEnd() {
  const promoted = checkRankUp();
  if (promoted) {
    // set persistent promotion message until player makes a day-end choice
    persistentPromotion = {
      text: '昇進しました！ ' + rank + ' ' + rankNames[rank-1],
      color: '#ffeb3b',
      font: '64px sans-serif'
    };
  }
}

// simple on-screen messages
const messages = [];
function showMessage(text, ttl = 2000, color = 'white', font = '20px sans-serif') {
  messages.push({ text, ttl, initialTtl: ttl, color, font });
}
// persistent promotion message shown until player responds at day end
let persistentPromotion = null;

function getAllowedMaxTypeIndexByRank() {
  // map rank 1..10 to type index 0..9 (weaker when rank is low)
  const maxIdx = Math.floor((rank / 10) * (enemyTypeNames.length - 1));
  return Math.max(0, Math.min(enemyTypeNames.length - 1, maxIdx));
}
const keys = {};
document.addEventListener("keydown", (event) => {
  // If waiting at noon choice
  if (noonChoice) {
    // 'r' = 休憩 (rest), 'c' = 継続 (continue)
    if (event.key === 'r') {
      // rest: recover ~30% and skip to 13:00
      fatigue = Math.min(maxFatigue, fatigue + Math.floor(maxFatigue * 0.3));
      san = Math.min(maxSan, san + Math.floor(maxSan * 0.3));
      currentHour = 13;
      lastHourTime = Date.now();
      noonChoice = false;
    } else if (event.key === 'c') {
      // continue: enemies stop for one hour, but continuous drains
      noonChoice = false;
      noonContinueMode = true;
      noonModeEndTime = Date.now() + hourMs;
      lastHourTime = Date.now();
    }
    return;
  }
  // If day ended, handle continue/quit
  if (dayEnded) {
    if (event.key === 'y') {
      // continue: recover a bit, restart day
      // advance date by one day
      currentDate.setDate(currentDate.getDate() + 1);
      fatigue = Math.min(maxFatigue, fatigue + dayFatigueRecover);
      san = Math.min(maxSan, san + daySanRecover);
      dayEnded = false;
      dayStartTime = Date.now();
      lastHourTime = Date.now();
      currentHour = dayStartHour;
      lastUpdate = Date.now();
      stunned = false;
      // clear any persistent promotion message when continuing to next day
      persistentPromotion = null;
    } else if (event.key === 'n') {
      gameOver = true;
      sendScore(score);
    }
    return;
  }
  // start screen: press Enter to begin
  if (startScreen) {
    if (event.key === 'Enter') {
      startScreen = false;
      lastUpdate = Date.now();
      lastHourTime = Date.now();
    }
    return;
  }
  // toggle auto-fire with 'f'
  if (event.key === 'f') {
    autoFireEnabled = !autoFireEnabled;
  }
  keys[event.key] = true;
});
document.addEventListener("keyup", (event) => {
  keys[event.key] = false;
});

function update() {
  if (gameOver) return;
  const now = Date.now();
  const dt = (now - lastUpdate) / 1000;
  lastUpdate = now;

  // update messages TTL
  for (let mi = messages.length - 1; mi >= 0; mi--) {
    messages[mi].ttl -= dt * 1000;
    if (messages[mi].ttl <= 0) messages.splice(mi, 1);
  }
  // clear persistent promotion when not in day-ended state
  if (!dayEnded) persistentPromotion = null;

  // if waiting at noon choice or day end choice, pause game updates until player chooses
  if (noonChoice || dayEnded) return;

  // hour tick: 1 minute real = 1 hour in-game
  // handle noon continue mode duration
  if (noonContinueMode) {
    // apply continuous drains
    fatigue -= noonFatigueDrainPerSec * dt;
    if (autoFireEnabled) {
      san -= noonSanDrainPerSec * dt;
    }
    if (san <= 0) { san = 0; gameOver = true; sendScore(score); return; }
    if (now >= noonModeEndTime) {
      noonContinueMode = false;
      // advance to 13:00
      currentHour = 13;
      lastHourTime = now;
    }
  }

  // regular hour progression (skip if waiting at noonChoice or dayEnded)
  if (!dayEnded && !noonChoice && !noonContinueMode) {
    if (now - lastHourTime >= hourMs) {
      const passed = Math.floor((now - lastHourTime) / hourMs);
      lastHourTime += passed * hourMs;
      const prevHour = currentHour;
      currentHour += passed;
      // if we just reached noon (12:00)
      if (prevHour < 12 && currentHour >= 12) {
        currentHour = 12;
        noonChoice = true;
        return;
      }
      // if end of day reached
      if (currentHour >= dayEndHour) {
        dayEnded = true;
        rankUpAtDayEnd();
        return;
      }
    }
  }

  // spawn new enemies periodically
  if (now - lastSpawn >= spawnInterval && enemies.length < maxEnemies) {
    spawnEnemy();
    lastSpawn = now;
  }

  if (stunned) {
    // stunned: can't move or fire, recover faster
    stunTimer -= dt * 1000;
    fatigue = Math.min(maxFatigue, fatigue + stunRecoveryPerSec * dt);
    if (stunTimer <= 0) {
      stunned = false;
    }
  } else {
    // movement (disabled when stunned)
    let moving = false;
    if (keys["w"]) { player.y -= player.speed; moving = true; }
    if (keys["s"]) { player.y += player.speed; moving = true; }
    if (keys["a"]) { player.x -= player.speed; moving = true; }
    if (keys["d"]) { player.x += player.speed; moving = true; }
    // keep player inside canvas
    player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));

    // update invincibility timer
    if (invincible) {
      invincibleTimer -= dt * 1000;
      if (invincibleTimer <= 0) {
        invincible = false;
      }
    }

    // fatigue changes: moving no longer drains, instead slightly recovers
    updateSkillEffects();
    if (moving) {
      fatigue = Math.min(maxFatigue, fatigue + (idleRecoveryPerSec * 0.35) * dt);
    } else {
      fatigue = Math.min(maxFatigue, fatigue + idleRecoveryPerSec * dt);
    }

    // auto-fire bullets toward nearest enemy (respect fatigue)
    const fatigueRatio = Math.max(0, Math.min(1, fatigue / maxFatigue));
    const currentFireRate = baseFireRate * (1 + (1 - fatigueRatio) * fireRateMultiplier);
    if (autoFireEnabled && !stunned && enemies.length > 0) {
      if (now - lastFire >= currentFireRate) {
        updateSkillEffects();
        const firingDrainMultiplier = Math.max(0.8, 1 - skillLevel * 0.05);
        const projectedDrain = firingDrainPerShot * firingDrainMultiplier;
        if (fatigue - projectedDrain > 0) {
          lastFire = now;
          // choose nearest enemy
          let nearest = enemies[0];
          let ndist = Math.hypot(nearest.x - player.x, nearest.y - player.y);
          for (const en of enemies) {
            const dtemp = Math.hypot(en.x - player.x, en.y - player.y);
            if (dtemp < ndist) { nearest = en; ndist = dtemp; }
          }
          const dirX = nearest.x - player.x;
          const dirY = nearest.y - player.y;
          const d = Math.hypot(dirX, dirY) || 1;
          const speed = 6;
          const damageBonus = 1 + skillLevel * 0.08;
          const damage = Math.max(1, Math.round(baseBulletDamage * fatigueRatio * damageBonus));
          bullets.push({
            x: player.x,
            y: player.y,
            vx: (dirX / d) * speed,
            vy: (dirY / d) * speed,
            radius: 4,
            damage
          });
          // firing drains fatigue with skill mitigation (further weakened)
          fatigue -= projectedDrain;
          if (fatigue <= 0) {
            fatigue = 0;
            stunned = true;
            stunTimer = stunDuration;
            // reduce SAN on stun (mitigated by skill)
            const sanMultiplier = Math.max(0.5, 1 - skillLevel * 0.04);
            san -= Math.ceil(stunSanPenalty * sanMultiplier);
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

  // move each enemy toward player and update their radii
  for (const e of enemies) {
    // update radius based on text
    ctx.font = e.font;
    const metrics = ctx.measureText(e.text || '');
    const textWidth = metrics.width || 0;
    const fontSizeMatch = (e.font || '').match(/(\d+)px/);
    const fontSize = fontSizeMatch ? parseInt(fontSizeMatch[1], 10) : 24;
    e.radius = Math.max(textWidth, fontSize) / 2;

    if (!noonContinueMode) {
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      // scale enemy speed by time of day: later hours -> faster enemies
      const dayProgress = Math.max(0, Math.min(1, (currentHour - dayStartHour) / (dayEndHour - dayStartHour)));
      const timeSpeedMultiplier = 1 + dayProgress * speedDayIncreaseFactor;
      e.x += (dx / dist) * (e.speed * timeSpeedMultiplier);
      e.y += (dy / dist) * (e.speed * timeSpeedMultiplier);
    }
  }

  // update bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx;
    b.y += b.vy;
    // remove off-screen bullets
    if (b.x < -10 || b.x > canvas.width + 10 || b.y < -10 || b.y > canvas.height + 10) {
      bullets.splice(i, 1);
      continue;
    }
    // check collision with enemies
    for (let j = enemies.length - 1; j >= 0; j--) {
      const en = enemies[j];
      const d = Math.hypot(b.x - en.x, b.y - en.y);
      if (d <= b.radius + en.radius) {
          const dmg = b.damage || 1;
          // damage bonus from skill
          updateSkillEffects();
          const damageBonus = 1 + skillLevel * 0.08;
          const actualDmg = Math.max(1, Math.round(dmg * damageBonus));
          en.hp = (en.hp || 1) - actualDmg;
        bullets.splice(i, 1);
        if (en.hp <= 0) {
            // award score based on enemy type (stronger -> more)
            const pts = Math.ceil(en.type * 3);
            score += pts;
            // award exp based on enemy type
            exp += en.type * 5;
            updateSkillEffects();
          enemies.splice(j, 1);
          spawnEnemy();
        }
        break;
      }
    }
  }

  // clamp fatigue
  fatigue = Math.max(0, Math.min(maxFatigue, fatigue));
  // check collisions between enemies and player
  for (let j = enemies.length - 1; j >= 0; j--) {
    const en = enemies[j];
    const ed = Math.hypot(en.x - player.x, en.y - player.y);
    if (ed <= en.radius + player.radius) {
      if (!invincible) {
        // reduce SAN based on enemy type
        updateSkillEffects();
        const sanMultiplier = Math.max(0.5, 1 - skillLevel * 0.04);
        if (!en.touching) {
          // initial contact: full SAN cost and invincibility start
          const sdamage = Math.ceil((en.type || 1) * contactSanMultiplier * sanMultiplier);
          san -= sdamage;
          en.touching = true;
          invincible = true;
          invincibleTimer = invincibleDuration;
          // apply equivalent of one bullet hit to the enemy on initial contact
          const contactFatigueRatio = Math.max(0, Math.min(1, fatigue / maxFatigue));
          const contactDamage = Math.max(1, Math.round(baseBulletDamage * contactFatigueRatio * (1 + skillLevel * 0.08)));
          en.hp = (en.hp || 1) - contactDamage;
          if (en.hp <= 0) {
            // kill processing same as bullet kill
            const pts = Math.ceil(en.type * 3);
            score += pts;
            exp += en.type * 5;
            updateSkillEffects();
            enemies.splice(j, 1);
            spawnEnemy();
          }
        } else {
          // sustained contact: slower continuous drain
          const sustainedDrain = Math.max(1, (en.type || 1) * contactSanMultiplier * sanMultiplier * 0.18 * dt);
          san -= sustainedDrain;
        }
        // score penalty when enemy touches player
        const penalty = Math.ceil((en.type || 1) * 2);
        score = Math.max(0, score - penalty);
        // only remove enemy if its remaining HP is zero or less
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
  // clamp fatigue already done above; enemy collisions handled during bullet update and move loops
}
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
    ctx.fillText('WASDで移動、自動攻撃はFでON/OFF', canvas.width / 2, canvas.height / 2 + 60);
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
  // draw bullets
  ctx.fillStyle = 'white';
  for (const b of bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  // draw fatigue gauge under player
  const gaugeW = 80;
  const gaugeH = 8;
  const gx = player.x - gaugeW / 2;
  const gy = player.y + player.radius + 12;
  ctx.fillStyle = 'gray';
  ctx.fillRect(gx, gy, gaugeW, gaugeH);
  const frac = Math.max(0, Math.min(1, fatigue / maxFatigue));
  ctx.fillStyle = frac > 0.5 ? '#66bb6a' : (frac > 0.2 ? '#ffa726' : '#ef5350');
  ctx.fillRect(gx, gy, gaugeW * frac, gaugeH);
  ctx.fillStyle = 'white';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('脳疲労: ' + Math.floor(fatigue), player.x, gy + gaugeH + 12);
  ctx.textAlign = 'left';

  // draw SAN next to fatigue
  ctx.fillStyle = 'white';
  ctx.font = '12px sans-serif';
  ctx.fillText('SAN: ' + Math.floor(san), player.x + gaugeW + 40, gy + gaugeH + 12);

  // auto-fire status
  ctx.fillStyle = 'white';
  ctx.font = '14px sans-serif';
  ctx.fillText('Auto-Fire: ' + (autoFireEnabled ? 'ON' : 'OFF') + (stunned ? ' (Stunned)' : ''), 12, 48);
  // draw score
  ctx.fillStyle = 'white';
  ctx.font = '20px sans-serif';
  ctx.fillText('Score: ' + score, 12, 24);
  // draw rank and skill
  ctx.font = '14px sans-serif';
  ctx.fillText('Rank: ' + rank + ' ' + rankNames[rank-1], 12, 72);
  ctx.fillText('Skill Lvl: ' + skillLevel + '  EXP: ' + exp, 12, 96);
  // quick on-canvas debug marker
  ctx.font = '12px monospace';
  ctx.fillStyle = 'white';
  ctx.fillText('JS OK', 12, 120);
  // draw messages (top-center)
  if (messages.length > 0) {
    ctx.textAlign = 'center';
    let y = 140;
    for (const m of messages) {
      ctx.font = m.font || '20px sans-serif';
      // fade alpha based on ttl
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
  // draw date and weekday (top-right)
  const yName = weekdayNames[currentDate.getDay()];
  const holidayFlag = isHoliday(currentDate) || yName === '土' || yName === '日';
  ctx.font = '16px sans-serif';
  ctx.fillStyle = holidayFlag ? '#ffeb3b' : 'white';
  const hourStr = String(currentHour).padStart(2,'0') + ':00';
  const dateStr = `${currentDate.getFullYear()}/${String(currentDate.getMonth()+1).padStart(2,'0')}/${String(currentDate.getDate()).padStart(2,'0')} ${hourStr} (${yName})`;
  ctx.fillText(dateStr, canvas.width - 12 - ctx.measureText(dateStr).width, 24);
  // draw all enemies
  for (const en of enemies) {
    ctx.font = en.font;
    ctx.fillStyle = en.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (en.text) {
      ctx.fillText(en.text, en.x, en.y);
      // draw 残工数 below text
      const fm = (en.font || '').match(/(\d+)px/);
      const fSize = fm ? parseInt(fm[1], 10) : 28;
      ctx.font = '14px sans-serif';
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.fillText('残工数: ' + (en.hp || 0), en.x, en.y + fSize / 1.2);
      ctx.textAlign = 'left';
    } else {
      ctx.beginPath();
      ctx.arc(en.x, en.y, en.radius, 0, Math.PI * 2);
      ctx.fill();
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
  // if waiting at noon (12:00), show rest/continue choice
  if (noonChoice && !gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('12:00 休憩しますか？', canvas.width / 2, canvas.height / 2 - 40);
    ctx.font = '20px sans-serif';
    ctx.fillText('R = 休憩 (13:00 へ移動, 脳疲労/SAN 約30%回復)', canvas.width / 2, canvas.height / 2 + 8);
    ctx.fillText('C = 継続 (敵停止、脳疲労/SAN が継続的に減少)', canvas.width / 2, canvas.height / 2 + 40);
    ctx.textAlign = 'left';
  }
  // if day ended, draw overlay with continue/quit choice
  if (dayEnded && !gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    // if there's a persistent promotion message, draw it prominently
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
}
function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}
gameLoop();
