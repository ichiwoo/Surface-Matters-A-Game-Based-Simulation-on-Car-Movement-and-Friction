// main.js - Pixel-style physics car sim
// Ready to paste. No external libs.

'use strict';

/* ---------- CONFIG ---------- */
const PIXELS_PER_M = 3;           // 3 px per meter => track 300m -> 900 px
const TRACK_M = 300;
const CANVAS_W = 900, CANVAS_H = 240;

const m = 1000;                   // car mass (kg)
const g = 9.81;                   // gravity
const DRIVE_FORCE = 4000;         // N when accelerating
const BRAKE_FORCE = 8000;         // braking force
const MAX_SPEED = 50;             // m/s
const DT_MAX = 0.05;

const segments = [
  {name:'ICE',  start:0,   end:100, mu:0.05, slopeDeg: 0},
  {name:'SAND', start:100, end:200, mu:0.30, slopeDeg: 1.5},
  {name:'WOOD', start:200, end:300, mu:0.15, slopeDeg:-0.8}
];

/* ---------- DOM ---------- */
const menuScreen = document.getElementById('menuScreen');
const instrScreen = document.getElementById('instructionsScreen');
const simScreen = document.getElementById('simScreen');
const resultsScreen = document.getElementById('resultsScreen');

const startBtn = document.getElementById('startBtn');
const instrBtn = document.getElementById('instrBtn');
const exitBtn = document.getElementById('exitBtn');
const backFromInstr = document.getElementById('backFromInstr');
const toMenuBtn = document.getElementById('toMenuBtn');
const backToMenu = document.getElementById('backToMenu');
const restartFromResults = document.getElementById('restartFromResults');

const accelBtn = document.getElementById('accelBtn');
const brakeBtn = document.getElementById('brakeBtn');
const pauseBtn = document.getElementById('pauseBtn');
const restartBtn = document.getElementById('restartBtn');

const surfaceLabel = document.getElementById('surfaceLabel');
const speedVal = document.getElementById('speedVal');
const posVal = document.getElementById('posVal');
const accVal = document.getElementById('accVal');
const muVal = document.getElementById('muVal');
const slopeVal = document.getElementById('slopeVal');

const progressBar = document.getElementById('progressBar');

const finalDistance = document.getElementById('finalDistance');
const finalSpeed = document.getElementById('finalSpeed');
const totalTime = document.getElementById('totalTime');
const worstSurface = document.getElementById('worstSurface');

const gameCanvas = document.getElementById('gameCanvas');
const ctx = gameCanvas.getContext('2d', {alpha:false});
const resultsGraph = document.getElementById('resultsGraph');
const gctx = resultsGraph.getContext('2d', {alpha:false});

/* ---------- STATE ---------- */
let state = {
  x: 0,            // meters
  v: 0,            // m/s
  a: 0,            // m/s^2
  time: 0,         // seconds
  running: false,
  paused: false,
  accelerating: false,
  braking: false,
  finished: false,
  samples: []      // store {t,x,v} for graph
};

let segmentStats = {};
segments.forEach(s => segmentStats[s.name] = {time:0, distance:0, slowdown:0});

/* ---------- UTIL ---------- */
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function degToRad(d){ return d * Math.PI/180; }
function getSegmentAtPosition(x){
  const xm = clamp(x,0,TRACK_M-1e-6);
  for(const s of segments) if(xm >= s.start && xm < s.end) return s;
  return segments[segments.length-1];
}

/* ---------- PIXEL CAR SPRITE (drawn on small canvas then scaled) ---------- */
const spriteW = 16, spriteH = 8;
const spriteScale = 3; // scale up for pixel look

function createCarSprite(){
  const oc = document.createElement('canvas');
  oc.width = spriteW;
  oc.height = spriteH;
  const octx = oc.getContext('2d');
  octx.imageSmoothingEnabled = false;

  // background transparent
  // draw body
  octx.fillStyle = '#b52d2d'; // red-ish body
  octx.fillRect(2,2,12,4);
  octx.fillStyle = '#6b1b1b';
  octx.fillRect(2,5,4,2);
  octx.fillRect(10,5,4,2);
  // windows
  octx.fillStyle = '#9fe6ff';
  octx.fillRect(4,2,4,2);
  octx.fillRect(8,2,4,2);
  // wheels
  octx.fillStyle = '#111';
  octx.fillRect(3,6,3,2);
  octx.fillRect(10,6,3,2);

  return oc;
}
const carSprite = createCarSprite();

/* ---------- DRAWING / RENDER ---------- */
function render(){
  ctx.imageSmoothingEnabled = false;
  // clear
  ctx.fillStyle = '#87c8ff';
  ctx.fillRect(0,0,CANVAS_W,CANVAS_H);

  // draw sky ground line
  ctx.fillStyle = '#0b1722';
  ctx.fillRect(0, CANVAS_H - 48, CANVAS_W, 48);

  // draw segments as color bands and slight wave for slope
  for(const s of segments){
    const sx = Math.round(s.start * PIXELS_PER_M);
    const ex = Math.round(s.end * PIXELS_PER_M);
    let color;
    if(s.name === 'ICE') color = '#c8f0ff';
    else if(s.name === 'SAND') color = '#e0b27a';
    else color = '#9b6b3f';
    ctx.fillStyle = color;
    ctx.fillRect(sx, CANVAS_H - 48, ex - sx, 48);

    // small label
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.font = '10px monospace';
    ctx.fillText(s.name, sx + 8, CANVAS_H - 18);
  }

  // draw ticks every 50 m
  ctx.fillStyle = '#001318';
  ctx.font = '10px monospace';
  for(let m50=0;m50<=300;m50+=50){
    const px = Math.round(m50 * PIXELS_PER_M);
    ctx.fillRect(px, CANVAS_H - 48 - 6, 2, 6);
    ctx.fillText(m50 + 'm', px+2, CANVAS_H - 50);
  }

  // draw car (centered vertically on road)
  const carXpx = clamp(Math.round(state.x * PIXELS_PER_M), 0, CANVAS_W - spriteW * spriteScale);
  const carYpx = CANVAS_H - 48 - (spriteH * spriteScale) - 6;
  ctx.drawImage(carSprite, 0,0, spriteW, spriteH, carXpx, carYpx, spriteW * spriteScale, spriteH * spriteScale);

  // small speed bubble
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(carXpx, carYpx - 22, 72, 18);
  ctx.fillStyle = '#e6eef6';
  ctx.font = '10px monospace';
  ctx.fillText(`v ${state.v.toFixed(1)} m/s`, carXpx + 6, carYpx - 8);
}

/* ---------- PHYSICS ---------- */
function updatePhysics(dt){
  if(state.finished || state.paused) return;
  // cap dt
  dt = Math.min(dt, DT_MAX);

  const seg = getSegmentAtPosition(state.x);
  const theta = degToRad(seg.slopeDeg);
  const mu = seg.mu;

  // Forces
  const Fdrive = state.accelerating ? DRIVE_FORCE : 0;
  let Fbrake = 0;
  if(state.braking) {
    // braking opposes direction of motion. If stopped, braking applies to prevent forward push.
    Fbrake = - Math.sign(state.v || 1) * BRAKE_FORCE;
  }

  // friction opposes motion (kinetic) - magnitude
  const FfrictionMag = mu * m * g * Math.cos(theta);
  const Ffriction = - Math.sign(state.v || 1) * FfrictionMag;

  // gravity along slope: positive forward when downhill
  const Fgravity = m * g * Math.sin(-theta); // choose sign so downhill gives + forward push

  // net force = drive + brake + friction + gravity
  const Fnet = Fdrive + Fbrake + Ffriction + Fgravity;

  // acceleration
  const a = Fnet / m;

  // integrate
  state.v += a * dt;
  // clamp small velocities
  if(Math.abs(state.v) < 0.01) state.v = 0;
  state.v = clamp(state.v, 0, MAX_SPEED); // no reverse in this sim
  state.x += state.v * dt;
  state.time += dt;
  state.a = a;

  // collect stats per segment
  const ss = segmentStats[seg.name];
  ss.time += dt;
  ss.distance += state.v * dt;
  if(a < -0.05) ss.slowdown += Math.abs(a) * dt;

  // sample for graph
  state.samples.push({t: state.time, x: state.x, v: state.v});

  // check finish
  if(state.x >= TRACK_M){
    state.finished = true;
    state.running = false;
    showResults();
  }
}

/* ---------- UI / LOOP ---------- */
let lastTime = performance.now();
function loop(now){
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  if(state.running && !state.paused) updatePhysics(dt);
  render();
  updateHUD();
  requestAnimationFrame(loop);
}

function updateHUD(){
  const seg = getSegmentAtPosition(state.x);
  surfaceLabel.textContent = `Surface: ${seg.name}`;
  speedVal.textContent = state.v.toFixed(2);
  posVal.textContent = state.x.toFixed(2);
  accVal.textContent = state.a.toFixed(2);
  muVal.textContent = seg.mu.toFixed(2);
  slopeVal.textContent = seg.slopeDeg.toFixed(1);
  progressBar.value = clamp(state.x,0,TRACK_M);
}

/* ---------- RESULTS ---------- */
function showResults(){
  // compute worst surface by slowdown
  let worst = null;
  let worstVal = -1;
  for(const k of Object.keys(segmentStats)){
    if(segmentStats[k].slowdown > worstVal){
      worstVal = segmentStats[k].slowdown;
      worst = k;
    }
  }

  finalDistance.textContent = clamp(state.x,0,TRACK_M).toFixed(2);
  finalSpeed.textContent = state.v.toFixed(2);
  totalTime.textContent = state.time.toFixed(2);
  worstSurface.textContent = worst || '-';

  // draw simple speed vs position graph
  drawResultsGraph();

  // show results screen
  simScreen.classList.add('hidden');
  resultsScreen.classList.remove('hidden');
}

/* draw graph: speed vs position */
function drawResultsGraph(){
  // clear
  gctx.fillStyle = '#081018';
  gctx.fillRect(0,0, resultsGraph.width, resultsGraph.height);

  if(state.samples.length < 2) return;
  // find bounds
  const xs = state.samples.map(s => s.x);
  const vs = state.samples.map(s => s.v);
  const xmax = Math.max(...xs, TRACK_M);
  const vmax = Math.max(...vs, 1);

  // margins
  const mleft = 40, mtop = 12, mright = 12, mbottom = 30;
  const w = resultsGraph.width - mleft - mright;
  const h = resultsGraph.height - mtop - mbottom;

  // axes
  gctx.strokeStyle = '#ffffff';
  gctx.lineWidth = 1;
  gctx.beginPath();
  gctx.moveTo(mleft, mtop);
  gctx.lineTo(mleft, mtop + h);
  gctx.lineTo(mleft + w, mtop + h);
  gctx.stroke();

  // plot
  gctx.beginPath();
  const scaleX = w / xmax;
  const scaleY = h / vmax;
  for(let i=0;i<state.samples.length;i++){
    const s = state.samples[i];
    const px = mleft + s.x * scaleX;
    const py = mtop + h - (s.v * scaleY);
    if(i===0) gctx.moveTo(px,py); else gctx.lineTo(px,py);
  }
  gctx.strokeStyle = '#ffd67a';
  gctx.lineWidth = 2;
  gctx.stroke();

  // labels
  gctx.fillStyle = '#dcecff';
  gctx.font = '12px monospace';
  gctx.fillText('Speed vs Position', mleft, 12);
  gctx.font = '10px monospace';
  gctx.fillText('0 m', mleft, mtop + h + 18);
  gctx.fillText(`${Math.round(xmax)} m`, mleft + w - 30, mtop + h + 18);
  gctx.fillText(`${Math.round(vmax)} m/s`, 6, mtop + 10);
}

/* ---------- CONTROL HANDLERS ---------- */
function startSimulation(){
  // reset
  state.x = 0; state.v = 0; state.a = 0; state.time = 0;
  state.running = true; state.paused = false; state.finished = false;
  state.accelerating = false; state.braking = false;
  state.samples = [];
  // reset stats
  for(const k of Object.keys(segmentStats)) segmentStats[k] = {time:0, distance:0, slowdown:0};
  // switch screens
  menuScreen.classList.add('hidden');
  instrScreen.classList.add('hidden');
  resultsScreen.classList.add('hidden');
  simScreen.classList.remove('hidden');
}

function togglePause(){
  state.paused = !state.paused;
  pauseBtn.textContent = state.paused ? 'Resume' : 'Pause';
}

function restartSimulation(){
  startSimulation();
}

function exitToMenu(){
  // show menu screen
  simScreen.classList.add('hidden');
  instrScreen.classList.add('hidden');
  resultsScreen.classList.add('hidden');
  menuScreen.classList.remove('hidden');
}

/* ---------- Input binding ---------- */
window.addEventListener('keydown', (e)=>{
  if(e.key === 'ArrowUp') state.accelerating = true;
  if(e.key === 'ArrowDown') state.braking = true;
  if(e.key === ' ') { e.preventDefault(); togglePause(); }
  if(e.key === 'r' || e.key === 'R') restartSimulation();
});
window.addEventListener('keyup', (e)=>{
  if(e.key === 'ArrowUp') state.accelerating = false;
  if(e.key === 'ArrowDown') state.braking = false;
});

/* Buttons */
startBtn.addEventListener('click', ()=> { startSimulation(); });
instrBtn.addEventListener('click', ()=> { menuScreen.classList.add('hidden'); instrScreen.classList.remove('hidden'); });
exitBtn.addEventListener('click', ()=> { window.close ? window.close() : alert('Close the tab to exit.'); });
backFromInstr.addEventListener('click', ()=> { instrScreen.classList.add('hidden'); menuScreen.classList.remove('hidden'); });

accelBtn.addEventListener('mousedown', ()=> state.accelerating = true);
accelBtn.addEventListener('mouseup', ()=> state.accelerating = false);
brakeBtn.addEventListener('mousedown', ()=> state.braking = true);
brakeBtn.addEventListener('mouseup', ()=> state.braking = false);

pauseBtn.addEventListener('click', togglePause);
restartBtn.addEventListener('click', restartSimulation);
toMenuBtn.addEventListener('click', exitToMenu);

backToMenu.addEventListener('click', exitToMenu);
restartFromResults.addEventListener('click', ()=> { restartSimulation(); resultsScreen.classList.add('hidden'); simScreen.classList.remove('hidden'); });

/* ---------- Start loop ---------- */
requestAnimationFrame(loop);

/* ---------- Initial render ---------- */
render();
updateHUD();
