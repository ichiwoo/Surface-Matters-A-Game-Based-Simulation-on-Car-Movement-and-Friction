// === GAME STATE ===
const state = {
  screen: 'menu',
  paused: false,
  pos: 0,
  vel: 0,
  acc: 0,
  time: 0,
  trackLength: 300,
  history: [],
  surfaceStats: { ice: 0, sand: 0, wood: 0 }
};

const keys = { up: false, down: false };

// === SURFACES ===
const surfaces = [
  { name: 'ice', start: 0, end: 100, mu: 0.1, color: '#a5f3fc', emoji: '🧊' },
  { name: 'sand', start: 100, end: 200, mu: 0.8, color: '#fde047', emoji: '🏖️' },
  { name: 'wood', start: 200, end: 300, mu: 0.4, color: '#d97706', emoji: '🪵' }
];

const GRAVITY = 9.8;
const ENGINE_ACC = 5;
const BRAKE_ACC = -8;
const SLOPE = 0;

// === ELEMENTS ===
const screens = {
  menu: document.getElementById('menuScreen'),
  instr: document.getElementById('instructionsScreen'),
  sim: document.getElementById('simScreen'),
  results: document.getElementById('resultsScreen')
};

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const resultsCanvas = document.getElementById('resultsGraph');
const resultsCtx = resultsCanvas.getContext('2d');

// === SCREEN MANAGEMENT ===
function showScreen(name) {
  Object.keys(screens).forEach(k => screens[k].classList.add('hidden'));
  screens[name].classList.remove('hidden');
  state.screen = name;
}

// === MENU HANDLERS ===
document.getElementById('startBtn').onclick = () => {
  resetSimulation();
  showScreen('sim');
};
document.getElementById('instrBtn').onclick = () => showScreen('instr');
document.getElementById('backFromInstr').onclick = () => showScreen('menu');
document.getElementById('toMenuBtn').onclick = () => showScreen('menu');
document.getElementById('backToMenu').onclick = () => showScreen('menu');
document.getElementById('restartFromResults').onclick = () => {
  resetSimulation();
  showScreen('sim');
};

// === CONTROL HANDLERS ===
document.getElementById('accelBtn').onclick = () => keys.up = !keys.up;
document.getElementById('brakeBtn').onclick = () => keys.down = !keys.down;
document.getElementById('pauseBtn').onclick = togglePause;
document.getElementById('restartBtn').onclick = () => resetSimulation();

function togglePause() {
  state.paused = !state.paused;
  document.getElementById('pauseBtn').textContent = state.paused ? '▶ Resume' : '⏸ Pause';
}

// === KEYBOARD ===
window.addEventListener('keydown', e => {
  if (state.screen !== 'sim') return;
  if (e.key === 'ArrowUp') keys.up = true;
  if (e.key === 'ArrowDown') keys.down = true;
  if (e.key === ' ') { e.preventDefault(); togglePause(); }
  if (e.key === 'r' || e.key === 'R') resetSimulation();
});

window.addEventListener('keyup', e => {
  if (e.key === 'ArrowUp') keys.up = false;
  if (e.key === 'ArrowDown') keys.down = false;
});

// === SIMULATION RESET ===
function resetSimulation() {
  state.pos = 0;
  state.vel = 0;
  state.acc = 0;
  state.time = 0;
  state.paused = false;
  state.history = [];
  state.surfaceStats = { ice: 0, sand: 0, wood: 0 };
  keys.up = false;
  keys.down = false;
  document.getElementById('pauseBtn').textContent = '⏸ Pause';
  document.getElementById('progressBar').value = 0;
}

// === PHYSICS ===
function getCurrentSurface() {
  return surfaces.find(s => state.pos >= s.start && state.pos < s.end) || surfaces[surfaces.length - 1];
}

function updatePhysics(dt) {
  if (state.paused || state.pos >= state.trackLength) return;
  
  const surface = getCurrentSurface();
  const mu = surface.mu;
  
  // Track time on each surface
  state.surfaceStats[surface.name] += dt;
  
  // Calculate acceleration
  let acc = 0;
  if (keys.up) acc += ENGINE_ACC;
  if (keys.down) acc += BRAKE_ACC;
  
  // Friction force
  const frictionAcc = -mu * GRAVITY * Math.sign(state.vel);
  if (Math.abs(state.vel) > 0.01) {
    acc += frictionAcc;
  }
  
  // Gravity on slope
  acc += GRAVITY * Math.sin(SLOPE * Math.PI / 180);
  
  state.acc = acc;
  state.vel += acc * dt;
  
  // Prevent negative speed
  if (state.vel < 0) state.vel = 0;
  
  state.pos += state.vel * dt;
  state.time += dt;
  
  // Clamp position
  if (state.pos >= state.trackLength) {
    state.pos = state.trackLength;
    state.vel = 0;
    showResults();
  }
  
  // Record history
  if (state.history.length === 0 || state.time - state.history[state.history.length - 1].t > 0.1) {
    state.history.push({ t: state.time, pos: state.pos, vel: state.vel });
  }
  
  updateUI(surface, mu);
}

// === UI UPDATE ===
function updateUI(surface, mu) {
  document.getElementById('surfaceLabel').textContent = `${surface.emoji} ${surface.name.toUpperCase()}`;
  document.getElementById('speedVal').textContent = state.vel.toFixed(2);
  document.getElementById('posVal').textContent = state.pos.toFixed(2);
  document.getElementById('accVal').textContent = state.acc.toFixed(2);
  document.getElementById('muVal').textContent = mu.toFixed(2);
  document.getElementById('slopeVal').textContent = SLOPE.toFixed(1);
  document.getElementById('progressBar').value = state.pos;
}

// === RENDERING ===
function render() {
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw track surfaces
  const scale = canvas.width / state.trackLength;
  surfaces.forEach(s => {
    ctx.fillStyle = s.color;
    ctx.fillRect(s.start * scale, 0, (s.end - s.start) * scale, canvas.height);
    
    // Draw surface labels
    ctx.fillStyle = '#000';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(s.emoji + ' ' + s.name.toUpperCase(), (s.start + s.end) / 2 * scale, 30);
  });
  
  // Draw road markings
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(0, canvas.height / 2);
  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Draw car
  const carX = (state.pos / state.trackLength) * canvas.width;
  const carY = canvas.height / 2;
  const carW = 40;
  const carH = 24;
  
  // Car body
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(carX - carW/2, carY - carH/2, carW, carH);
  
  // Car windows
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(carX - carW/2 + 8, carY - carH/2 + 4, 12, 8);
  ctx.fillRect(carX - carW/2 + 24, carY - carH/2 + 4, 12, 8);
  
  // Wheels
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(carX - 12, carY + carH/2, 6, 0, Math.PI * 2);
  ctx.arc(carX + 12, carY + carH/2, 6, 0, Math.PI * 2);
  ctx.fill();
  
  // Speed indicator
  if (state.vel > 0) {
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.6 - i * 0.2})`;
      ctx.fillRect(carX - carW/2 - 15 - i * 8, carY - 5, 6, 2);
      ctx.fillRect(carX - carW/2 - 15 - i * 8, carY + 3, 6, 2);
    }
  }
  
  // Distance markers
  ctx.fillStyle = '#fff';
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  for (let i = 0; i <= 300; i += 50) {
    const x = (i / state.trackLength) * canvas.width;
    ctx.fillText(i + 'm', x, canvas.height - 10);
  }
}

// === RESULTS ===
function showResults() {
  document.getElementById('finalDistance').textContent = state.pos.toFixed(2);
  document.getElementById('finalSpeed').textContent = state.vel.toFixed(2);
  document.getElementById('totalTime').textContent = state.time.toFixed(2);
  
  // Find worst surface
  const worst = Object.entries(state.surfaceStats).reduce((a, b) => a[1] > b[1] ? a : b);
  document.getElementById('worstSurface').textContent = worst[0].toUpperCase() + ' (' + worst[1].toFixed(1) + 's)';
  
  drawGraph();
  showScreen('results');
}

function drawGraph() {
  const w = resultsCanvas.width;
  const h = resultsCanvas.height;
  
  resultsCtx.fillStyle = '#1e293b';
  resultsCtx.fillRect(0, 0, w, h);
  
  if (state.history.length < 2) return;
  
  const maxT = state.history[state.history.length - 1].t;
  const maxV = Math.max(...state.history.map(p => p.vel));
  
  // Draw grid
  resultsCtx.strokeStyle = '#374151';
  resultsCtx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = h - (i / 5) * h;
    resultsCtx.beginPath();
    resultsCtx.moveTo(0, y);
    resultsCtx.lineTo(w, y);
    resultsCtx.stroke();
  }
  
  // Draw speed line
  resultsCtx.strokeStyle = '#4ade80';
  resultsCtx.lineWidth = 3;
  resultsCtx.beginPath();
  
  state.history.forEach((p, i) => {
    const x = (p.t / maxT) * w;
    const y = h - (p.vel / maxV) * h;
    if (i === 0) resultsCtx.moveTo(x, y);
    else resultsCtx.lineTo(x, y);
  });
  
  resultsCtx.stroke();
  
  // Labels
  resultsCtx.fillStyle = '#fff';
  resultsCtx.font = 'bold 14px monospace';
  resultsCtx.fillText('Speed vs Time', 10, 20);
  resultsCtx.font = '12px monospace';
  resultsCtx.fillText(`Max: ${maxV.toFixed(1)} m/s`, 10, 40);
  resultsCtx.fillText(`Time: ${maxT.toFixed(1)} s`, w - 100, 20);
}

// === GAME LOOP ===
let lastTime = 0;
function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;
  
  if (state.screen === 'sim') {
    updatePhysics(dt);
    render();
  }
  
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
