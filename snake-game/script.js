'use strict';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const bestScoreElement = document.getElementById('best-score');
const levelElement = document.getElementById('level');
const overlay = document.getElementById('game-overlay');
const overlayIcon = document.getElementById('overlay-icon');
const overlayKicker = document.getElementById('overlay-kicker');
const overlayTitle = document.getElementById('overlay-title');
const overlayMessage = document.getElementById('overlay-message');
const overlayButton = document.getElementById('overlay-button');
const pauseButton = document.getElementById('pause-button');
const restartButton = document.getElementById('restart-button');
const soundButton = document.getElementById('sound-button');

const GRID_SIZE = 24;
const CELL_SIZE = canvas.width / GRID_SIZE;
const INITIAL_LENGTH = 4;
const BASE_STEP_MS = 420;
const MIN_STEP_MS = 300;

const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

let snake = [];
let food = { x: 15, y: 10 };
let direction = DIRECTIONS.right;
let nextDirection = DIRECTIONS.right;
let score = 0;
let bestScore = readBestScore();
let level = 1;
let state = 'ready'; // ready | running | paused | over
let lastFrameTime = 0;
let stepTimer = 0;
let soundEnabled = true;
let audioContext = null;
let swipeStart = null;

function readBestScore() {
  try {
    return Number.parseInt(localStorage.getItem('neonSnakeBest') || '0', 10) || 0;
  } catch (error) {
    return 0;
  }
}

function saveBestScore() {
  try {
    localStorage.setItem('neonSnakeBest', String(bestScore));
  } catch (error) {
    // The game still works when browser storage is unavailable.
  }
}

function formatScore(value) {
  return String(value).padStart(3, '0');
}

function updateStats() {
  scoreElement.textContent = formatScore(score);
  bestScoreElement.textContent = formatScore(bestScore);
  levelElement.textContent = String(level).padStart(2, '0');
}

function resetGame() {
  const center = Math.floor(GRID_SIZE / 2);
  snake = Array.from({ length: INITIAL_LENGTH }, (_, index) => ({
    x: center - index,
    y: center
  }));
  direction = DIRECTIONS.right;
  nextDirection = DIRECTIONS.right;
  score = 0;
  level = 1;
  stepTimer = 0;
  food = createFood();
  updateStats();
  draw();
}

function createFood() {
  const emptyCells = [];
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      if (!snake.some((part) => part.x === x && part.y === y)) {
        emptyCells.push({ x, y });
      }
    }
  }
  if (emptyCells.length === 0) return null;
  return emptyCells[Math.floor(Math.random() * emptyCells.length)];
}

function currentStepDuration() {
  return Math.max(MIN_STEP_MS, BASE_STEP_MS - (level - 1) * 10);
}

function startGame() {
  if (state === 'ready' || state === 'over') resetGame();
  state = 'running';
  lastFrameTime = 0;
  stepTimer = 0;
  hideOverlay();
  pauseButton.textContent = 'Ⅱ';
  pauseButton.setAttribute('aria-label', 'Pause game');
  canvas.focus?.();
}

function pauseGame() {
  if (state === 'running') {
    state = 'paused';
    showOverlay({
      icon: 'Ⅱ', kicker: 'TAKE A BREATHER', title: 'Game paused.',
      message: 'Your snake is taking a break. Ready when you are.', button: 'RESUME GAME'
    });
    pauseButton.textContent = '▶';
    pauseButton.setAttribute('aria-label', 'Resume game');
  } else if (state === 'paused') {
    startGame();
  }
}

function endGame() {
  state = 'over';
  playTone(145, 0.22, 'sawtooth');
  showOverlay({
    icon: '💥', kicker: 'THAT WAS A CLOSE ONE', title: 'Game over.',
    message: `You scored ${score} point${score === 1 ? '' : 's'}. ${score >= bestScore && score > 0 ? 'New personal best — amazing!' : 'Ready for one more round?'}`,
    button: 'PLAY AGAIN'
  });
  pauseButton.textContent = 'Ⅱ';
  pauseButton.setAttribute('aria-label', 'Pause game');
}

function showOverlay(content) {
  overlayIcon.textContent = content.icon;
  overlayKicker.textContent = content.kicker;
  overlayTitle.textContent = content.title;
  overlayMessage.textContent = content.message;
  overlayButton.innerHTML = `${content.button} <span aria-hidden="true">↗</span>`;
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

function setDirection(name) {
  if (!DIRECTIONS[name] || state === 'over') return;
  if (state === 'ready') startGame();

  const candidate = DIRECTIONS[name];
  // Compare against the queued direction so two quick taps cannot reverse the snake.
  const current = nextDirection;
  const isReverse = candidate.x === -current.x && candidate.y === -current.y;
  if (!isReverse) nextDirection = candidate;
}

function step() {
  direction = nextDirection;
  const head = snake[0];
  const newHead = { x: head.x + direction.x, y: head.y + direction.y };
  const willEat = food !== null && newHead.x === food.x && newHead.y === food.y;

  const hitWall = newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE;
  const bodyToCheck = willEat ? snake : snake.slice(0, -1);
  const hitSelf = bodyToCheck.some((part) => part.x === newHead.x && part.y === newHead.y);

  if (hitWall || hitSelf) {
    endGame();
    return;
  }

  snake.unshift(newHead);
  if (willEat) {
    score += 1;
    const newLevel = Math.floor(score / 5) + 1;
    if (newLevel > level) {
      level = newLevel;
      playTone(680, 0.11, 'sine');
    } else {
      playTone(500, 0.08, 'sine');
    }
    if (score > bestScore) {
      bestScore = score;
      saveBestScore();
    }
    food = createFood();
    if (food === null) {
      state = 'over';
      showOverlay({ icon: '🏆', kicker: 'BOARD CLEARED', title: 'You did it!', message: 'You filled the entire board. That is a perfect run!', button: 'PLAY AGAIN' });
    }
    updateStats();
  } else {
    snake.pop();
  }
}

function roundedRect(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawBoard() {
  ctx.fillStyle = '#071523';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(116, 164, 174, 0.075)';
  ctx.lineWidth = 1;
  for (let i = 1; i < GRID_SIZE; i += 1) {
    const position = i * CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(position, 0);
    ctx.lineTo(position, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, position);
    ctx.lineTo(canvas.width, position);
    ctx.stroke();
  }
}

function drawFood(time = 0) {
  if (!food) return;
  const centerX = food.x * CELL_SIZE + CELL_SIZE / 2;
  const centerY = food.y * CELL_SIZE + CELL_SIZE / 2;
  const pulse = 1 + Math.sin(time / 180) * 0.09;
  const radius = CELL_SIZE * 0.27 * pulse;
  ctx.save();
  ctx.shadowColor = '#ffb86b';
  ctx.shadowBlur = 23;
  const gradient = ctx.createRadialGradient(centerX - 3, centerY - 4, 1, centerX, centerY, radius * 1.5);
  gradient.addColorStop(0, '#fff2c8');
  gradient.addColorStop(0.35, '#ffc879');
  gradient.addColorStop(1, '#ff8e55');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSnake() {
  snake.forEach((part, index) => {
    const inset = index === 0 ? 2.2 : 3.1;
    const x = part.x * CELL_SIZE + inset;
    const y = part.y * CELL_SIZE + inset;
    const size = CELL_SIZE - inset * 2;
    const alpha = Math.max(0.48, 1 - index / (snake.length * 1.7));
    const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
    if (index === 0) {
      gradient.addColorStop(0, '#d2ffad');
      gradient.addColorStop(1, '#72e7a1');
      ctx.shadowColor = 'rgba(167,255,131,.55)';
      ctx.shadowBlur = 17;
    } else {
      gradient.addColorStop(0, `rgba(122, 236, 158, ${alpha})`);
      gradient.addColorStop(1, `rgba(49, 178, 139, ${alpha})`);
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = gradient;
    roundedRect(x, y, size, size, index === 0 ? 7 : 5);
    ctx.fill();
    ctx.shadowBlur = 0;
  });
  drawEyes();
}

function drawEyes() {
  if (!snake.length) return;
  const head = snake[0];
  const centerX = head.x * CELL_SIZE + CELL_SIZE / 2;
  const centerY = head.y * CELL_SIZE + CELL_SIZE / 2;
  const forward = direction;
  const side = { x: -forward.y, y: forward.x };
  const eyeDistance = 5.2;
  const sideDistance = 5.1;
  ctx.fillStyle = '#09202a';
  for (const sign of [-1, 1]) {
    const eyeX = centerX + forward.x * eyeDistance + side.x * sideDistance * sign;
    const eyeY = centerY + forward.y * eyeDistance + side.y * sideDistance * sign;
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

function draw(time = 0) {
  drawBoard();
  drawFood(time);
  drawSnake();
}

function gameLoop(timestamp) {
  if (!lastFrameTime) lastFrameTime = timestamp;
  const delta = Math.min(timestamp - lastFrameTime, 80);
  lastFrameTime = timestamp;

  if (state === 'running') {
    stepTimer += delta;
    const stepDuration = currentStepDuration();
    while (stepTimer >= stepDuration && state === 'running') {
      stepTimer -= stepDuration;
      step();
    }
  }
  draw(timestamp);
  requestAnimationFrame(gameLoop);
}

function playTone(frequency, duration, type = 'sine') {
  if (!soundEnabled) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioContext) audioContext = new AudioContextClass();
    if (audioContext.state === 'suspended') audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    gain.gain.setValueAtTime(0.055, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch (error) {
    // Audio is optional; ignore browser audio restrictions.
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  soundButton.textContent = soundEnabled ? '🔊' : '🔇';
  soundButton.setAttribute('aria-label', soundEnabled ? 'Turn sound off' : 'Turn sound on');
  if (soundEnabled) playTone(520, 0.08);
}

function handleKeydown(event) {
  const key = event.key.toLowerCase();
  const controls = {
    arrowup: 'up', w: 'up',
    arrowdown: 'down', s: 'down',
    arrowleft: 'left', a: 'left',
    arrowright: 'right', d: 'right'
  };

  if (controls[key]) {
    event.preventDefault();
    setDirection(controls[key]);
  } else if (key === ' ' || key === 'spacebar') {
    event.preventDefault();
    if (state === 'running' || state === 'paused') pauseGame();
    else if (state === 'ready') startGame();
  } else if (key === 'enter' && (state === 'ready' || state === 'over')) {
    startGame();
  }
}

overlayButton.addEventListener('click', () => {
  if (state === 'paused') startGame();
  else startGame();
});
pauseButton.addEventListener('click', () => {
  if (state === 'ready' || state === 'over') return;
  pauseGame();
});
restartButton.addEventListener('click', () => {
  resetGame();
  startGame();
});
soundButton.addEventListener('click', toggleSound);
document.addEventListener('keydown', handleKeydown);

document.querySelectorAll('button[data-direction]').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.preventDefault();
    setDirection(button.dataset.direction);
  });
});

canvas.addEventListener('touchstart', (event) => {
  const touch = event.changedTouches[0];
  swipeStart = { x: touch.clientX, y: touch.clientY };
}, { passive: true });

canvas.addEventListener('touchend', (event) => {
  if (!swipeStart) return;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - swipeStart.x;
  const dy = touch.clientY - swipeStart.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) > 22) {
    if (Math.abs(dx) > Math.abs(dy)) setDirection(dx > 0 ? 'right' : 'left');
    else setDirection(dy > 0 ? 'down' : 'up');
  }
  swipeStart = null;
}, { passive: true });

resetGame();
showOverlay({
  icon: '🐍', kicker: 'READY PLAYER ONE?', title: 'Let’s play.',
  message: 'Use your arrow keys or WASD to move. Collect the glowing orbs!', button: 'START GAME'
});
requestAnimationFrame(gameLoop);
