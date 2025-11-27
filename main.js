// ===== GAME STATE =====
const state = {
    pos: 0,
    vel: 0,
    acc: 0,
    time: 0,
    trackLength: 750,
    paused: false,
    finished: false,
    history: [],
    maxSpeed: 0,
    cameraOffset: 0
};

const keys = { up: false, down: false };

// ===== PHYSICS CONSTANTS =====
const GRAVITY = 9.8;
const ENGINE_ACC = 6;
const BRAKE_ACC = -10;
const MAX_SPEED = 50;
const CAR_MASS = 1000; // kg

// ===== TERRAIN DEFINITIONS =====
const terrains = [
    {
        name: 'ICE',
        emoji: '🧊',
        start: 0,
        end: 250,
        baseMu: 0.15,
        color: '#a5f3fc',
        darkColor: '#06b6d4',
        slopes: [
            { start: 0, end: 80, angle: 0 },
            { start: 80, end: 120, angle: -3 },
            { start: 120, end: 180, angle: 2 },
            { start: 180, end: 250, angle: 5 }
        ]
    },
    {
        name: 'SAND',
        emoji: '🏖️',
        start: 250,
        end: 500,
        baseMu: 0.70,
        color: '#fde047',
        darkColor: '#eab308',
        slopes: [
            { start: 250, end: 320, angle: 0 },
            { start: 320, end: 380, angle: 4 },
            { start: 380, end: 440, angle: -2 },
            { start: 440, end: 500, angle: 2 }
        ]
    },
    {
        name: 'WOOD',
        emoji: '🪵',
        start: 500,
        end: 750,
        baseMu: 0.40,
        color: '#d97706',
        darkColor: '#92400e',
        slopes: [
            { start: 500, end: 580, angle: 0 },
            { start: 580, end: 640, angle: -4 },
            { start: 640, end: 690, angle: 6 },
            { start: 690, end: 750, angle: 1 }
        ]
    }
];

// ===== CANVAS & CONTEXT =====
const skyCanvas = document.getElementById('skyCanvas');
const skyCx = skyCanvas.getContext('2d');
const gameCanvas = document.getElementById('gameCanvas');
const gameCx = gameCanvas.getContext('2d');
const speedCanvas = document.getElementById('speedCanvas');
const speedCx = speedCanvas.getContext('2d');
const graphCanvas = document.getElementById('graphCanvas');
const graphCx = graphCanvas.getContext('2d');

// ===== CLOUD SYSTEM =====
const clouds = [];
for (let i = 0; i < 15; i++) {
    clouds.push({
        x: Math.random() * 2000,
        y: Math.random() * 300,
        scale: 0.5 + Math.random() * 1,
        speed: 0.1 + Math.random() * 0.3
    });
}

// ===== PARTICLE SYSTEM =====
const particles = [];

function createParticles(x, y, color, count = 5) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            life: 1.0,
            color: color,
            size: 2 + Math.random() * 4
        });
    }
}

// ===== RESIZE HANDLER =====
function resizeCanvas() {
    skyCanvas.width = window.innerWidth;
    skyCanvas.height = window.innerHeight;
    gameCanvas.width = window.innerWidth;
    gameCanvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ===== TERRAIN HELPERS =====
function getCurrentTerrain() {
    return terrains.find(t => state.pos >= t.start && state.pos < t.end) || terrains[terrains.length - 1];
}

function getCurrentSlope(terrain) {
    const slope = terrain.slopes.find(s => state.pos >= s.start && state.pos < s.end);
    return slope ? slope.angle : 0;
}

// ===== PHYSICS UPDATE =====
function updatePhysics(dt) {
    if (state.paused || state.finished) return;
    
    const terrain = getCurrentTerrain();
    const slopeAngle = getCurrentSlope(terrain);
    const mu = terrain.baseMu;
    
    // Calculate acceleration components
    let acc = 0;
    
    // Engine force
    if (keys.up) {
        acc += ENGINE_ACC;
    }
    
    // Brake force
    if (keys.down) {
        acc += BRAKE_ACC;
    }
    
    // Friction force (opposes motion)
    if (Math.abs(state.vel) > 0.01) {
        const frictionForce = mu * GRAVITY * Math.sign(state.vel);
        acc -= frictionForce;
    }
    
    // Gravity component on slope (negative angle = downhill helps, positive = uphill resists)
    const gravityComponent = GRAVITY * Math.sin((slopeAngle * Math.PI) / 180);
    acc -= gravityComponent;
    
    // Update velocity
    state.acc = acc;
    state.vel += acc * dt;
    
    // Clamp velocity
    if (state.vel < 0) state.vel = 0;
    if (state.vel > MAX_SPEED) state.vel = MAX_SPEED;
    
    // Track max speed
    if (state.vel > state.maxSpeed) state.maxSpeed = state.vel;
    
    // Update position
    state.pos += state.vel * dt;
    state.time += dt;
    
    // Create particles when moving
    if (state.vel > 1 && Math.random() < 0.3) {
        const carScreenX = gameCanvas.width / 2;
        const carScreenY = gameCanvas.height * 0.7;
        createParticles(carScreenX - 20, carScreenY + 15, terrain.color, 2);
    }
    
    // Check if finished
    if (state.pos >= state.trackLength) {
        state.pos = state.trackLength;
        state.vel = 0;
        state.finished = true;
        showResults();
    }
    
    // Record history for graphs
    if (state.history.length === 0 || state.time - state.history[state.history.length - 1].t > 0.2) {
        state.history.push({
            t: state.time,
            pos: state.pos,
            vel: state.vel,
            mu: mu,
            slope: slopeAngle
        });
    }
    
    // Update camera (smooth follow)
    const targetOffset = state.pos;
    state.cameraOffset += (targetOffset - state.cameraOffset) * 0.1;
    
    updateUI(terrain, mu, slopeAngle, gravityComponent);
}

// ===== UI UPDATE =====
function updateUI(terrain, mu, slopeAngle, gravityForce) {
    // Terrain name
    document.getElementById('terrainName').textContent = `${terrain.emoji} ${terrain.name}`;
    
    // Distance and progress
    document.getElementById('distanceValue').textContent = state.pos.toFixed(1) + ' m';
    document.getElementById('progressValue').textContent = ((state.pos / state.trackLength) * 100).toFixed(1) + '%';
    
    // Time
    document.getElementById('timeValue').textContent = state.time.toFixed(1) + ' s';
    
    // Physics data
    document.getElementById('speedMs').textContent = state.vel.toFixed(2) + ' m/s';
    document.getElementById('accelValue').textContent = state.acc.toFixed(2) + ' m/s²';
    document.getElementById('frictionValue').textContent = mu.toFixed(2);
    document.getElementById('slopeValue').textContent = slopeAngle.toFixed(1) + '°';
    document.getElementById('gravityValue').textContent = gravityForce.toFixed(2) + ' m/s²';
    
    // Speedometer digital display
    const speedKmh = state.vel * 3.6;
    document.getElementById('speedDigital').textContent = speedKmh.toFixed(0) + ' km/h';
    
    // Draw speedometer gauge
    drawSpeedometer(speedKmh);
    
    // Update live graph
    drawLiveGraph();
}

// ===== SPEEDOMETER DRAWING =====
function drawSpeedometer(speedKmh) {
    const cx = speedCanvas.width / 2;
    const cy = speedCanvas.height / 2;
    const radius = 80;
    
    speedCx.clearRect(0, 0, speedCanvas.width, speedCanvas.height);
    
    // Background circle
    speedCx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    speedCx.beginPath();
    speedCx.arc(cx, cy, radius + 10, 0, Math.PI * 2);
    speedCx.fill();
    
    // Outer ring
    speedCx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    speedCx.lineWidth = 8;
    speedCx.beginPath();
    speedCx.arc(cx, cy, radius, 0, Math.PI * 2);
    speedCx.stroke();
    
    // Speed arc (color-coded)
    const maxDisplaySpeed = 180; // km/h
    const angle = (speedKmh / maxDisplaySpeed) * Math.PI * 2;
    
    let color;
    if (speedKmh < 60) color = '#4ade80'; // Green
    else if (speedKmh < 120) color = '#f59e0b'; // Orange
    else color = '#ef4444'; // Red
    
    speedCx.strokeStyle = color;
    speedCx.lineWidth = 12;
    speedCx.beginPath();
    speedCx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + angle);
    speedCx.stroke();
    
    // Tick marks
    speedCx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    speedCx.lineWidth = 2;
    for (let i = 0; i <= 12; i++) {
        const tickAngle = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const innerRadius = radius - 15;
        const outerRadius = radius - 5;
        const x1 = cx + Math.cos(tickAngle) * innerRadius;
        const y1 = cy + Math.sin(tickAngle) * innerRadius;
        const x2 = cx + Math.cos(tickAngle) * outerRadius;
        const y2 = cy + Math.sin(tickAngle) * outerRadius;
        speedCx.beginPath();
        speedCx.moveTo(x1, y1);
        speedCx.lineTo(x2, y2);
        speedCx.stroke();
    }
    
    // Center dot
    speedCx.fillStyle = color;
    speedCx.beginPath();
    speedCx.arc(cx, cy, 8, 0, Math.PI * 2);
    speedCx.fill();
    
    // Needle
    const needleAngle = -Math.PI / 2 + angle;
    const needleLength = radius - 20;
    speedCx.strokeStyle = color;
    speedCx.lineWidth = 4;
    speedCx.beginPath();
    speedCx.moveTo(cx, cy);
    speedCx.lineTo(
        cx + Math.cos(needleAngle) * needleLength,
        cy + Math.sin(needleAngle) * needleLength
    );
    speedCx.stroke();
}

// ===== LIVE GRAPH =====
function drawLiveGraph() {
    const w = graphCanvas.width;
    const h = graphCanvas.height;
    
    graphCx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    graphCx.fillRect(0, 0, w, h);
    
    if (state.history.length < 2) return;
    
    const recentHistory = state.history.slice(-50);
    const maxV = Math.max(...recentHistory.map(p => p.vel), 10);
    const maxMu = 1.0;
    
    // Draw grid
    graphCx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    graphCx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = (i / 4) * h;
        graphCx.beginPath();
        graphCx.moveTo(0, y);
        graphCx.lineTo(w, y);
        graphCx.stroke();
    }
    
    // Draw speed line
    graphCx.strokeStyle = '#4ade80';
    graphCx.lineWidth = 2;
    graphCx.beginPath();
    recentHistory.forEach((p, i) => {
        const x = (i / (recentHistory.length - 1)) * w;
        const y = h - (p.vel / maxV) * h;
        if (i === 0) graphCx.moveTo(x, y);
        else graphCx.lineTo(x, y);
    });
    graphCx.stroke();
    
    // Draw friction line
    graphCx.strokeStyle = '#f59e0b';
    graphCx.lineWidth = 2;
    graphCx.beginPath();
    recentHistory.forEach((p, i) => {
        const x = (i / (recentHistory.length - 1)) * w;
        const y = h - (p.mu / maxMu) * h;
        if (i === 0) graphCx.moveTo(x, y);
        else graphCx.lineTo(x, y);
    });
    graphCx.stroke();
}

// ===== SKY RENDERING =====
function renderSky() {
    // Sky gradient
    const gradient = skyCx.createLinearGradient(0, 0, 0, skyCanvas.height);
    gradient.addColorStop(0, '#87CEEB');
    gradient.addColorStop(0.7, '#E0F6FF');
    gradient.addColorStop(1, '#B0E0E6');
    skyCx.fillStyle = gradient;
    skyCx.fillRect(0, 0, skyCanvas.width, skyCanvas.height);
    
    // Sun
    skyCx.fillStyle = '#FFD700';
    skyCx.shadowBlur = 30;
    skyCx.shadowColor = '#FFD700';
    skyCx.beginPath();
    skyCx.arc(skyCanvas.width * 0.8, skyCanvas.height * 0.2, 40, 0, Math.PI * 2);
    skyCx.fill();
    skyCx.shadowBlur = 0;
    
    // Clouds with parallax
    clouds.forEach(cloud => {
        cloud.x -= cloud.speed * (state.vel * 0.1);
        if (cloud.x < -200) cloud.x = skyCanvas.width + 200;
        
        drawCloud(cloud.x, cloud.y, cloud.scale);
    });
}

function drawCloud(x, y, scale) {
    skyCx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    skyCx.beginPath();
    skyCx.arc(x, y, 30 * scale, 0, Math.PI * 2);
    skyCx.arc(x + 25 * scale, y, 35 * scale, 0, Math.PI * 2);
    skyCx.arc(x + 50 * scale, y, 30 * scale, 0, Math.PI * 2);
    skyCx.arc(x + 25 * scale, y - 15 * scale, 25 * scale, 0, Math.PI * 2);
    skyCx.fill();
}

// ===== GAME RENDERING =====
function renderGame() {
    gameCx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
    
    const screenWidth = gameCanvas.width;
    const screenHeight = gameCanvas.height;
    const groundY = screenHeight * 0.7;
    const scale = screenWidth / 300; // Show 300m of track at once
    
    // Calculate visible range
    const visibleStart = Math.max(0, state.cameraOffset - 150);
    const visibleEnd = Math.min(state.trackLength, state.cameraOffset + 150);
    
    // Draw terrain segments
    terrains.forEach(terrain => {
        if (terrain.end < visibleStart || terrain.start > visibleEnd) return;
        
        terrain.slopes.forEach((slope, idx) => {
            const segmentStart = Math.max(slope.start, visibleStart);
            const segmentEnd = Math.min(slope.end, visibleEnd);
            
            if (segmentEnd <= segmentStart) return;
            
            const x1 = (segmentStart - state.cameraOffset + 150) * scale;
            const x2 = (segmentEnd - state.cameraOffset + 150) * scale;
            const segmentWidth = x2 - x1;
            
            // Calculate heights based on slope
            const slopeHeight = (segmentEnd - segmentStart) * Math.tan((slope.angle * Math.PI) / 180) * scale;
            
            // Draw terrain polygon
            gameCx.fillStyle = terrain.color;
            gameCx.beginPath();
            gameCx.moveTo(x1, groundY);
            gameCx.lineTo(x2, groundY - slopeHeight);
            gameCx.lineTo(x2, screenHeight);
            gameCx.lineTo(x1, screenHeight);
            gameCx.closePath();
            gameCx.fill();
            
            // Draw terrain border
            gameCx.strokeStyle = terrain.darkColor;
            gameCx.lineWidth = 3;
            gameCx.beginPath();
            gameCx.moveTo(x1, groundY);
            gameCx.lineTo(x2, groundY - slopeHeight);
            gameCx.stroke();
            
            // Draw terrain label at segment start
            if (slope === terrain.slopes[0]) {
                gameCx.fillStyle = '#000';
                gameCx.font = 'bold 20px Arial';
                gameCx.textAlign = 'center';
                gameCx.fillText(terrain.emoji + ' ' + terrain.name, x1 + 50, groundY - 40);
            }
        });
    });
    
    // Draw distance markers
    gameCx.fillStyle = '#fff';
    gameCx.font = '14px Arial';
    gameCx.textAlign = 'center';
    for (let i = Math.floor(visibleStart / 50) * 50; i <= visibleEnd; i += 50) {
        const x = (i - state.cameraOffset + 150) * scale;
        gameCx.fillText(i + 'm', x, groundY - 10);
        
        gameCx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        gameCx.lineWidth = 2;
        gameCx.beginPath();
        gameCx.moveTo(x, groundY);
        gameCx.lineTo(x, groundY + 10);
        gameCx.stroke();
    }
    
    // Draw car (always centered)
    const carX = screenWidth / 2;
    const currentTerrain = getCurrentTerrain();
    const currentSlope = getCurrentSlope(currentTerrain);
    const carY = groundY - 25;
    
    drawCar(carX, carY, currentSlope);
    
    // Update and draw particles
    particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
        p.vy += 0.2; // Gravity
        
        if (p.life <= 0) {
            particles.splice(i, 1);
            return;
        }
        
        gameCx.fillStyle = `rgba(255, 255, 255, ${p.life * 0.5})`;
        gameCx.beginPath();
        gameCx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        gameCx.fill();
    });
}

function drawCar(x, y, slopeAngle) {
    gameCx.save();
    gameCx.translate(x, y);
    gameCx.rotate((slopeAngle * Math.PI) / 180);
    
    // Car body
    gameCx.fillStyle = '#ef4444';
    gameCx.fillRect(-25, -12, 50, 24);
    
    // Car roof
    gameCx.fillStyle = '#dc2626';
    gameCx.fillRect(-15, -20, 30, 10);
    
    // Windows
    gameCx.fillStyle = '#3b82f6';
    gameCx.fillRect(-12, -18, 10, 6);
    gameCx.fillRect(2, -18, 10, 6);
    
    // Wheels
    gameCx.fillStyle = '#000';
    gameCx.beginPath();
    gameCx.arc(-15, 12, 6, 0, Math.PI * 2);
    gameCx.arc(15, 12, 6, 0, Math.PI * 2);
    gameCx.fill();
    
    // Speed lines
    if (state.vel > 2) {
        const lineCount = Math.min(5, Math.floor(state.vel / 3));
        gameCx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        gameCx.lineWidth = 2;
        for (let i = 0; i < lineCount; i++) {
            gameCx.beginPath();
            gameCx.moveTo(-30 - i * 10, -5);
            gameCx.lineTo(-40 - i * 10, -5);
            gameCx.moveTo(-30 - i * 10, 5);
            gameCx.lineTo(-40 - i * 10, 5);
            gameCx.stroke();
        }
    }
    
    gameCx.restore();
}

// ===== RESULTS SCREEN =====
function showResults() {
    const avgSpeed = state.trackLength / state.time;
    
    document.getElementById('finalDistance').textContent = state.pos.toFixed(1) + ' m';
    document.getElementById('finalTime').textContent = state.time.toFixed(2) + ' s';
    document.getElementById('avgSpeed').textContent = avgSpeed.toFixed(2) + ' m/s';
    document.getElementById('maxSpeed').textContent = state.maxSpeed.toFixed(2) + ' m/s';
    
    drawResultsGraph();
    
    document.getElementById('resultsScreen').classList.remove('hidden');
}

function drawResultsGraph() {
    const canvas = document.getElementById('resultsGraph');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, w, h);
    
    if (state.history.length < 2) return;
    
    const maxT = state.history[state.history.length - 1].t;
    const maxV = Math.max(...state.history.map(p => p.vel));
    const maxPos = state.trackLength;
    
    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
        const y = (i / 5) * h;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
    
    // Draw speed vs time
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 3;
    ctx.beginPath();
    state.history.forEach((p, i) => {
        const x = (p.t / maxT) * w;
        const y = h - (p.vel / maxV) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
    
    // Draw position vs time
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    state.history.forEach((p, i) => {
        const x = (p.t / maxT) * w;
        const y = h - (p.pos / maxPos) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Labels
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('Speed vs Time', 10, 25);
    ctx.fillStyle = '#4ade80';
    ctx.fillText(`Max Speed: ${maxV.toFixed(1)} m/s`, 10, 50);
    ctx.fillStyle = '#60a5fa';
    ctx.fillText('— Position', 10, 70);
    ctx.fillStyle = '#fff';
    ctx.font = '14px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`Total Time: ${maxT.toFixed(1)} s`, w - 10, 25);
}

// ===== CONTROLS =====
document.getElementById('accelerateBtn').addEventListener('click', () => {
    keys.up = !keys.up;
    document.getElementById('accelerateBtn').classList.toggle('active', keys.up);
});

document.getElementById('brakeBtn').addEventListener('click', () => {
    keys.down = !keys.down;
    document.getElementById('brakeBtn').classList.toggle('active', keys.down);
});

document.getElementById('pauseBtn').addEventListener('click', () => {
    state.paused = !state.paused;
    document.getElementById('pauseBtn').textContent = state.paused ? '▶️ RESUME (SPACE)' : '⏸️ PAUSE (SPACE)';
});

document.getElementById('resetBtn').addEventListener('click', resetSimulation);
document.getElementById('restartBtn').addEventListener('click', () => {
    document.getElementById('resultsScreen').classList.add('hidden');
    resetSimulation();
});

document.getElementById('toggleEducation').addEventListener('click', () => {
    const content = document.getElementById('educationContent');
    const btn = document.getElementById('toggleEducation');
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    btn.textContent = isHidden ? '📚 Hide Info' : '📚 Show Info';
});

function resetSimulation() {
    state.pos = 0;
    state.vel = 0;
    state.acc = 0;
    state.time = 0;
    state.paused = false;
    state.finished = false;
    state.history = [];
    state.maxSpeed = 0;
    state.cameraOffset = 0;
    keys.up = false;
    keys.down = false;
    particles.length = 0;
    document.getElementById('accelerateBtn').classList.remove('active');
    document.getElementById('brakeBtn').classList.remove('active');
    document.getElementById('pauseBtn').textContent = '⏸️ PAUSE (SPACE)';
}

// ===== KEYBOARD CONTROLS =====
window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
        keys.up = true;
        document.getElementById('accelerateBtn').classList.add('active');
    }
    if (e.key === 'ArrowDown') {
        keys.down = true;
        document.getElementById('brakeBtn').classList.add('active');
    }
    if (e.key === ' ') {
        e.preventDefault();
        document.getElementById('pauseBtn').click();
    }
    if (e.key === 'r' || e.key === 'R') {
        resetSimulation();
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp') {
        keys.up = false;
        document.getElementById('accelerateBtn').classList.remove('active');
    }
    if (e.key === 'ArrowDown') {
        keys.down = false;
        document.getElementById('brakeBtn').classList.remove('active');
    }
});

// ===== GAME LOOP =====
let lastTime = 0;
function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;
    
    if (!state.finished) {
        updatePhysics(dt);
    }
    
    renderSky();
    renderGame();
    // ===== MAIN MENU =====
    document.getElementById('startBtn').addEventListener('click', () => {
    document.getElementById('mainMenu').classList.add('hidden');
    resetSimulation();
    });
    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);