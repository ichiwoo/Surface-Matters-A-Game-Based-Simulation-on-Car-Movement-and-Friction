// ====================================================================
// ===== GAME STATE & CONSTANTS (Configurable) ========================
// ====================================================================
const state = {
    pos: 0,
    vel: 0,
    acc: 0,
    time: 0,
    trackLength: 750, // Calculated dynamically
    paused: false,
    finished: false,
    history: [],
    maxSpeed: 0,
    cameraOffset: 0
};

const keys = { up: false, down: false };

// PHYSICS CONSTANTS - Declared with 'let' for dynamic updating from the menu
let GRAVITY = 9.8;
let ENGINE_ACC = 6;
const BRAKE_ACC = -10;
let MAX_SPEED = 50;
let CAR_MASS = 1000; // kg

// Base Slope Profile (used for proportional scaling)
const BASE_SLOPES = {
    ICE: [
        { angle: 0, length: 50 }, { angle: -5, length: 50 }, { angle: -7, length: 50 },
        { angle: 3, length: 50 }, { angle: 8, length: 50 }
    ],
    SAND: [
        { angle: 4, length: 50 }, { angle: 9, length: 50 }, { angle: 0, length: 50 },
        { angle: -6, length: 50 }, { angle: 5, length: 50 }
    ],
    WOOD: [
        { angle: -3, length: 50 }, { angle: -8, length: 50 }, { angle: 6, length: 50 },
        { angle: 10, length: 50 }, { angle: 2, length: 50 }
    ]
};

// TERRAIN DEFINITIONS - Will be updated with calculated start/end points
let terrains = [
    { name: 'ICE', emoji: '🧊', length: 250, baseMu: 0.15, color: '#a5f3fc', darkColor: '#06b6d4', slopes: [] },
    { name: 'SAND', emoji: '🏖️', length: 250, baseMu: 0.70, color: '#fde047', darkColor: '#eab308', slopes: [] },
    { name: 'WOOD', emoji: '🪵', length: 250, baseMu: 0.40, color: '#d97706', darkColor: '#92400e', slopes: [] }
];

// ===== CANVAS & CONTEXT (Defensive lookup) =====
const skyCanvas = document.getElementById('skyCanvas');
const skyCx = skyCanvas ? skyCanvas.getContext('2d') : null;
const gameCanvas = document.getElementById('gameCanvas');
const gameCx = gameCanvas ? gameCanvas.getContext('2d') : null;
const speedCanvas = document.getElementById('speedCanvas');
const speedCx = speedCanvas ? speedCanvas.getContext('2d') : null;
const graphCanvas = document.getElementById('graphCanvas');
const graphCx = graphCanvas ? graphCanvas.getContext('2d') : null;
const gravityValueDisplay = document.getElementById('gravityValueDisplay');

if (!skyCx || !gameCx || !speedCx || !graphCx) {
    console.error("Critical Error: One or more canvas elements or their contexts were not found. Ensure all canvas IDs (skyCanvas, gameCanvas, speedCanvas, graphCanvas) are correct in index.html.");
}

// ===== CLOUD & PARTICLE SYSTEMS =====
const clouds = [];
for (let i = 0; i < 15; i++) {
    clouds.push({
        x: Math.random() * 2000,
        y: Math.random() * 300,
        scale: 0.5 + Math.random() * 1,
        speed: 0.1 + Math.random() * 0.3
    });
}
const particles = [];

function createParticles(x, y, color, count = 5) {
    if (!gameCx) return;
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

// ===== CANVAS & INPUT HELPERS =====
function resizeCanvas() {
    if (skyCanvas) skyCanvas.width = window.innerWidth;
    if (skyCanvas) skyCanvas.height = window.innerHeight;
    if (gameCanvas) gameCanvas.width = window.innerWidth;
    if (gameCanvas) gameCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);

/**
 * Reads and validates a numeric input field, clamping to a minimum value.
 */
function getValidatedInput(id, minVal, defaultVal) {
    const inputEl = document.getElementById(id);
    if (!inputEl) return defaultVal;

    let value = parseFloat(inputEl.value);

    if (isNaN(value) || value < minVal) {
        inputEl.value = minVal > 0 ? minVal.toFixed(2) : defaultVal.toFixed(2);
        return minVal > 0 ? minVal : defaultVal;
    }

    return value;
}

function updatePhysicsConstants() {
    GRAVITY = getValidatedInput('gravityValue', 0.1, 9.8);
    ENGINE_ACC = getValidatedInput('engineAccel', 1, 6);
    CAR_MASS = getValidatedInput('carMass', 500, 1000);
    MAX_SPEED = getValidatedInput('maxSpeed', 10, 50);
}

function updateTrackInputVisibility() {
    const equalToggle = document.getElementById('equalLengthToggle');
    if (!equalToggle) return;

    const isTotalLength = equalToggle.checked;
    
    // Defensive check for input containers
    const iceLengthDiv = document.getElementById('iceLength');
    const sandLengthDiv = document.getElementById('sandLength');
    const woodLengthDiv = document.getElementById('woodLength');
    const totalTrackDiv = document.getElementById('totalTrackLength'); // Assuming this is the input container's parent or the input itself

    if (iceLengthDiv) iceLengthDiv.style.display = isTotalLength ? 'none' : 'flex';
    if (sandLengthDiv) sandLengthDiv.style.display = isTotalLength ? 'none' : 'flex';
    if (woodLengthDiv) woodLengthDiv.style.display = isTotalLength ? 'none' : 'flex';

    // The totalTrackLength input is contained in a wrapper (e.g., div.input-group)
    if (totalTrackDiv && totalTrackDiv.parentElement) {
        totalTrackDiv.parentElement.style.display = isTotalLength ? 'flex' : 'none';
    }
}

function updateTerrainStructure() {
    const equalToggle = document.getElementById('equalLengthToggle');
    const isTotalLength = equalToggle ? equalToggle.checked : false; // Default to false if missing

    let lengthIce, lengthSand, lengthWood;
    const minSegmentLength = 50;

    if (isTotalLength) {
        const totalLength = getValidatedInput('totalTrackLength', 300, 750);
        const equalLength = Math.max(minSegmentLength, Math.floor(totalLength / 3));
        lengthIce = lengthSand = lengthWood = equalLength;
    } else {
        lengthIce = getValidatedInput('iceLengthInput', minSegmentLength, 250);
        lengthSand = getValidatedInput('sandLengthInput', minSegmentLength, 250);
        lengthWood = getValidatedInput('woodLengthInput', minSegmentLength, 250);
    }

    const newLengths = [
        { name: 'ICE', length: lengthIce },
        { name: 'SAND', length: lengthSand },
        { name: 'WOOD', length: lengthWood }
    ];

    let currentPos = 0;
    
    terrains = terrains.map((terrain, index) => {
        const newLength = newLengths[index].length;
        const baseSlopes = BASE_SLOPES[terrain.name];
        // 250 is the base length for all slope profiles
        const baseTotalLength = 250; 
        const scaleFactor = newLength / baseTotalLength;
        
        let segmentStart = currentPos;
        const newSlopes = [];

        // Scale and shift slopes proportionally
        let baseSlopeStart = 0;
        baseSlopes.forEach(baseSlope => {
            const baseLength = baseSlope.length; // 50m for each segment
            const newSlopeLength = baseLength * scaleFactor;

            newSlopes.push({
                start: segmentStart,
                end: segmentStart + newSlopeLength,
                angle: baseSlope.angle
            });
            segmentStart += newSlopeLength;
        });

        const newTerrain = {
            ...terrain,
            length: newLength,
            start: currentPos,
            end: currentPos + newLength,
            slopes: newSlopes
        };
        
        currentPos = newTerrain.end;
        return newTerrain;
    });

    state.trackLength = currentPos;
}

function applyPreset(presetName) {
    const presets = {
        'Earth': { gravity: 9.81, accel: 6, mass: 1000, maxSpeed: 50 },
        'Moon': { gravity: 1.62, accel: 8, mass: 800, maxSpeed: 60 },
        'Mars': { gravity: 3.71, accel: 5, mass: 1200, maxSpeed: 40 },
        'Performance': { gravity: 9.81, accel: 15, mass: 700, maxSpeed: 100 }
    };
    
    const preset = presets[presetName] || presets['Earth'];

    if (document.getElementById('gravityValue')) document.getElementById('gravityValue').value = preset.gravity.toFixed(2);
    if (document.getElementById('engineAccel')) document.getElementById('engineAccel').value = preset.accel.toFixed(2);
    if (document.getElementById('carMass')) document.getElementById('carMass').value = preset.mass.toFixed(0);
    if (document.getElementById('maxSpeed')) document.getElementById('maxSpeed').value = preset.maxSpeed.toFixed(0);
}

function getCurrentTerrain() {
    return terrains.find(t => state.pos >= t.start && state.pos < t.end) || terrains[terrains.length - 1];
}

function getCurrentSlope(terrain) {
    const slope = terrain.slopes.find(s => state.pos >= s.start && state.pos < s.end);
    return slope ? slope.angle : 0;
}

function getTerrainHeightAt(position) {
    if (position <= 0) return 0;

    let accumulatedHeight = 0;
    
    for (const terrain of terrains) {
        if (position < terrain.start) break;

        for (const slope of terrain.slopes) {
            
            if (position <= slope.start) {
                break; 
            } else if (position >= slope.end) {
                const segmentLength = slope.end - slope.start;
                accumulatedHeight += segmentLength * Math.tan((slope.angle * Math.PI) / 180);
            } else {
                const distanceInSlope = position - slope.start;
                accumulatedHeight += distanceInSlope * Math.tan((slope.angle * Math.PI) / 180);
                return accumulatedHeight;
            }
        }
    }
    
    return accumulatedHeight;
}

// ====================================================================
// ===== PHYSICS & UI UPDATE ==========================================
// ====================================================================

function updatePhysics(dt) {
    if (state.paused || state.finished) return;
    
    const terrain = getCurrentTerrain();
    const slopeAngle = getCurrentSlope(terrain);
    const mu = terrain.baseMu;
    
    let acc = 0;
    
    if (keys.up) {
        acc += ENGINE_ACC;
    }
    if (keys.down) {
        acc += BRAKE_ACC;
    }
    
    const angleRad = (slopeAngle * Math.PI) / 180;
    
    // Friction
    if (Math.abs(state.vel) > 0.01) {
        const frictionAcc = mu * GRAVITY * Math.cos(angleRad) * Math.sign(state.vel);
        acc -= frictionAcc;
    }
    
    // Gravity component on slope
    const gravityComponent = GRAVITY * Math.sin(angleRad);
    acc -= gravityComponent;
    
    state.acc = acc;
    state.vel += acc * dt;
    
    // Clamp velocity
    if (state.vel < 0) state.vel = 0;
    if (state.vel > MAX_SPEED) state.vel = MAX_SPEED;
    
    // Max Speed Tracking
    if (state.vel > state.maxSpeed) state.maxSpeed = state.vel;
    
    state.pos += state.vel * dt;
    state.time += dt;
    
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
    
    // Record history
    if (state.history.length === 0 || state.time - state.history[state.history.length - 1].t > 0.2) {
        state.history.push({
            t: state.time,
            pos: state.pos,
            vel: state.vel,
            mu: mu,
            slope: slopeAngle
        });
    }
    
    // Camera follow
    const targetOffset = state.pos;
    state.cameraOffset += (targetOffset - state.cameraOffset) * 0.1;
    
    updateUI(terrain, mu, slopeAngle, gravityComponent);
}

function updateUI(terrain, mu, slopeAngle, gravityForce) {
    if (document.getElementById('terrainName')) document.getElementById('terrainName').textContent = `${terrain.emoji} ${terrain.name}`;
    if (document.getElementById('distanceValue')) document.getElementById('distanceValue').textContent = state.pos.toFixed(1) + ' m';
    if (document.getElementById('progressValue')) document.getElementById('progressValue').textContent = ((state.pos / state.trackLength) * 100).toFixed(1) + '%';
    if (document.getElementById('timeValue')) document.getElementById('timeValue').textContent = state.time.toFixed(1) + ' s';
    if (document.getElementById('speedMs')) document.getElementById('speedMs').textContent = state.vel.toFixed(2) + ' m/s';
    if (document.getElementById('accelValue')) document.getElementById('accelValue').textContent = state.acc.toFixed(2) + ' m/s²';
    if (document.getElementById('frictionValue')) document.getElementById('frictionValue').textContent = mu.toFixed(2);
    if (document.getElementById('slopeValue')) document.getElementById('slopeValue').textContent = slopeAngle.toFixed(1) + '°';
    if (gravityValueDisplay) gravityValueDisplay.textContent = gravityForce.toFixed(2) + ' m/s²'; 
    
    const speedKmh = state.vel * 3.6;
    if (document.getElementById('speedDigital')) document.getElementById('speedDigital').textContent = speedKmh.toFixed(0) + ' km/h';
    
    drawSpeedometer(speedKmh);
    drawLiveGraph();
}

// ====================================================================
// ===== RENDERING FUNCTIONS (Fully Defined) ==========================
// ====================================================================

function drawSpeedometer(speedKmh) {
    if (!speedCx || !speedCanvas) return;
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

function drawLiveGraph() {
    if (!graphCx || !graphCanvas) return;

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

function renderSky() {
    if (!skyCx || !skyCanvas) return;
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
    if (!skyCx) return;
    skyCx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    skyCx.beginPath();
    skyCx.arc(x, y, 30 * scale, 0, Math.PI * 2);
    skyCx.arc(x + 25 * scale, y, 35 * scale, 0, Math.PI * 2);
    skyCx.arc(x + 50 * scale, y, 30 * scale, 0, Math.PI * 2);
    skyCx.arc(x + 25 * scale, y - 15 * scale, 25 * scale, 0, Math.PI * 2);
    skyCx.fill();
}

function renderGame() {
    if (!gameCx || !gameCanvas) return;

    gameCx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
    
    const screenWidth = gameCanvas.width;
    const screenHeight = gameCanvas.height;
    const groundY = screenHeight * 0.7;
    const scale = screenWidth / 300; // Show 300m of track at once
    
    // Calculate visible range
    const visibleStart = Math.max(0, state.cameraOffset - 150);
    const visibleEnd = Math.min(state.trackLength, state.cameraOffset + 150);
    
    // Draw terrain segments with smooth transitions
    terrains.forEach(terrain => {
        if (terrain.end < visibleStart || terrain.start > visibleEnd) return;
        
        let startX = Math.max(terrain.start, visibleStart);
        let endX = Math.min(terrain.end, visibleEnd);
        
        gameCx.fillStyle = terrain.color;
        gameCx.strokeStyle = terrain.darkColor;
        gameCx.lineWidth = 3;
        
        gameCx.beginPath();
        
        let startHeight = getTerrainHeightAt(startX);
        let startScreenX = (startX - state.cameraOffset + 150) * scale;
        
        gameCx.moveTo(startScreenX, screenHeight); // Bottom-left corner
        gameCx.lineTo(startScreenX, groundY - startHeight * scale); // Top-left corner (start of slope)

        // Draw smooth line through the segment using small steps (2m)
        const step = 2;
        for (let pos = startX; pos <= endX + step; pos += step) {
            const actualPos = Math.min(pos, endX);
            const height = getTerrainHeightAt(actualPos);
            const screenX = (actualPos - state.cameraOffset + 150) * scale;
            gameCx.lineTo(screenX, groundY - height * scale);
        }
        
        let endHeight = getTerrainHeightAt(endX);
        let endScreenX = (endX - state.cameraOffset + 150) * scale;
        
        gameCx.lineTo(endScreenX, groundY - endHeight * scale);
        gameCx.lineTo(endScreenX, screenHeight); // Bottom-right corner
        gameCx.closePath();
        
        gameCx.fill();
        
        // Redraw just the top border
        gameCx.beginPath();
        gameCx.moveTo(startScreenX, groundY - startHeight * scale);
        for (let pos = startX; pos <= endX + step; pos += step) {
            const actualPos = Math.min(pos, endX);
            const height = getTerrainHeightAt(actualPos);
            const screenX = (actualPos - state.cameraOffset + 150) * scale;
            gameCx.lineTo(screenX, groundY - height * scale);
        }
        gameCx.stroke();
        
        // Draw terrain label
        if (terrain.start >= visibleStart && terrain.start <= visibleEnd) {
            const labelX = (terrain.start - state.cameraOffset + 150) * scale;
            const labelHeight = getTerrainHeightAt(terrain.start);
            gameCx.fillStyle = '#000';
            gameCx.font = 'bold 20px Arial';
            gameCx.textAlign = 'center';
            gameCx.fillText(terrain.emoji + ' ' + terrain.name, labelX + 50, groundY - labelHeight * scale - 40);
        }
    });
    
    // Draw distance markers
    gameCx.fillStyle = '#fff';
    gameCx.font = '14px Arial';
    gameCx.textAlign = 'center';
    for (let i = Math.floor(visibleStart / 50) * 50; i <= visibleEnd; i += 50) {
        const x = (i - state.cameraOffset + 150) * scale;
        const currentHeight = getTerrainHeightAt(i);
        const y = groundY - currentHeight * scale;
        
        gameCx.fillText(i + 'm', x, y - 10);
        
        gameCx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        gameCx.lineWidth = 2;
        gameCx.beginPath();
        gameCx.moveTo(x, y);
        gameCx.lineTo(x, y + 10);
        gameCx.stroke();
    }
    
    // Draw car
    const carX = screenWidth / 2;
    const currentTerrain = getCurrentTerrain();
    const currentSlope = getCurrentSlope(currentTerrain);
    const terrainHeight = getTerrainHeightAt(state.pos);
    const carY = groundY - terrainHeight * scale - 25;

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
    if (!gameCx) return;
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

// ===== RESULTS & GRAPHS =====

function showResults() {
    const avgSpeed = state.time > 0 ? state.trackLength / state.time : 0;
    
    if (document.getElementById('finalDistance')) document.getElementById('finalDistance').textContent = state.pos.toFixed(1) + ' m';
    if (document.getElementById('finalTime')) document.getElementById('finalTime').textContent = state.time.toFixed(2) + ' s';
    if (document.getElementById('avgSpeed')) document.getElementById('avgSpeed').textContent = avgSpeed.toFixed(2) + ' m/s';
    if (document.getElementById('maxSpeed')) document.getElementById('maxSpeed').textContent = state.maxSpeed.toFixed(2) + ' m/s';
    
    drawResultsGraph();
    
    if (document.getElementById('resultsScreen')) document.getElementById('resultsScreen').classList.remove('hidden');
}

function drawResultsGraph() {
    if (!graphCx || !graphCanvas) return;
    const canvas = document.getElementById('resultsGraph');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, w, h);
    
    if (state.history.length < 2) return;
    
    const maxT = state.history[state.history.length - 1].t;
    const maxV = Math.max(...state.history.map(p => p.vel), MAX_SPEED * 1.05, 10); 
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
    
    // Draw speed vs time (Green)
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
    
    // Draw position vs time (Blue Dashed)
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
    
    // Add Axis Labels (Requested in previous step)
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial';
    
    // X-Axis Label (Time)
    ctx.textAlign = 'center';
    ctx.fillText('Time (s)', w / 2, h - 5);
    
    ctx.save();
    
    // Y-Axis Labels
    // Speed (Left Axis)
    ctx.textAlign = 'left';
    ctx.fillStyle = '#4ade80';
    ctx.fillText(`Speed (m/s)`, 5, 20);
    
    // Position (Right Axis)
    ctx.translate(w, 0);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#60a5fa';
    ctx.fillText(`Position (m)`, -5, 20);
    
    ctx.restore();
}

// ====================================================================
// ===== CONTROLS & INIT ==============================================
// ====================================================================

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
    
    if (document.getElementById('accelerateBtn')) document.getElementById('accelerateBtn').classList.remove('active');
    if (document.getElementById('brakeBtn')) document.getElementById('brakeBtn').classList.remove('active');
    if (document.getElementById('pauseBtn')) document.getElementById('pauseBtn').textContent = '⏸️ PAUSE (SPACE)';
}

function setupEventListeners() {
    // Basic Controls
    document.getElementById('accelerateBtn')?.addEventListener('click', () => {
        keys.up = !keys.up;
        document.getElementById('accelerateBtn').classList.toggle('active', keys.up);
    });

    document.getElementById('brakeBtn')?.addEventListener('click', () => {
        keys.down = !keys.down;
        document.getElementById('brakeBtn').classList.toggle('active', keys.down);
    });

    document.getElementById('pauseBtn')?.addEventListener('click', () => {
        state.paused = !state.paused;
        document.getElementById('pauseBtn').textContent = state.paused ? '▶️ RESUME (SPACE)' : '⏸️ PAUSE (SPACE)';
    });

    document.getElementById('resetBtn')?.addEventListener('click', resetSimulation);
    
    document.getElementById('restartBtn')?.addEventListener('click', () => {
        document.getElementById('resultsScreen')?.classList.add('hidden');
        resetSimulation();
    });

    // Back to Menu Button Logic (Requested in previous step)
    document.getElementById('backToMenuBtn')?.addEventListener('click', () => {
        document.getElementById('resultsScreen')?.classList.add('hidden');
        document.getElementById('mainMenu')?.classList.remove('hidden');
        resetSimulation();
    });

    document.getElementById('toggleEducation')?.addEventListener('click', () => {
        const content = document.getElementById('educationContent');
        const btn = document.getElementById('toggleEducation');
        if (content && btn) {
            const isHidden = content.style.display === 'none';
            content.style.display = isHidden ? 'block' : 'none';
            btn.textContent = isHidden ? '📚 Hide Info' : '📚 Show Info';
        }
    });

    // Menu Control
    document.getElementById('startBtn')?.addEventListener('click', () => {
        updatePhysicsConstants();
        updateTerrainStructure();
        document.getElementById('mainMenu')?.classList.add('hidden');
        resetSimulation();
    });

    // Track Configuration Toggle
    const equalToggle = document.getElementById('equalLengthToggle');
    equalToggle?.addEventListener('change', updateTrackInputVisibility);
    document.getElementById('totalTrackLength')?.addEventListener('change', () => {
        if (equalToggle && equalToggle.checked) {
            updateTerrainStructure();
        }
    });

    // Preset Buttons
    document.getElementById('presetEarth')?.addEventListener('click', () => applyPreset('Earth'));
    document.getElementById('presetMoon')?.addEventListener('click', () => applyPreset('Moon'));
    document.getElementById('presetMars')?.addEventListener('click', () => applyPreset('Mars'));
    document.getElementById('presetCustom')?.addEventListener('click', () => applyPreset('Performance'));
}

// ===== KEYBOARD CONTROLS =====
window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
        keys.up = true;
        document.getElementById('accelerateBtn')?.classList.add('active');
    }
    if (e.key === 'ArrowDown') {
        keys.down = true;
        document.getElementById('brakeBtn')?.classList.add('active');
    }
    if (e.key === ' ') {
        e.preventDefault();
        document.getElementById('pauseBtn')?.click();
    }
    if (e.key === 'r' || e.key === 'R') {
        resetSimulation();
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp') {
        keys.up = false;
        document.getElementById('accelerateBtn')?.classList.remove('active');
    }
    if (e.key === 'ArrowDown') {
        keys.down = false;
        document.getElementById('brakeBtn')?.classList.remove('active');
    }
});

// ===== GAME LOOP =====
let lastTime = 0;
function gameLoop(timestamp) {
    // Clamp delta time to prevent physics instability from large gaps
    const dt = Math.min((timestamp - lastTime) / 1000, 0.1); 
    lastTime = timestamp;
    
    if (!state.finished) {
        updatePhysics(dt);
    }
    
    renderSky();
    renderGame();

    requestAnimationFrame(gameLoop);
}

// Initialization on load
document.addEventListener('DOMContentLoaded', () => {
    // Initial setup of physics values in UI
    if (document.getElementById('gravityValue')) document.getElementById('gravityValue').value = GRAVITY.toFixed(2);
    if (document.getElementById('engineAccel')) document.getElementById('engineAccel').value = ENGINE_ACC.toFixed(2);
    if (document.getElementById('carMass')) document.getElementById('carMass').value = CAR_MASS.toFixed(0);
    if (document.getElementById('maxSpeed')) document.getElementById('maxSpeed').value = MAX_SPEED.toFixed(0);
    
    // Initial setup of track lengths (assuming default 250m inputs exist)
    if (document.getElementById('iceLengthInput')) document.getElementById('iceLengthInput').value = 250;
    if (document.getElementById('sandLengthInput')) document.getElementById('sandLengthInput').value = 250;
    if (document.getElementById('woodLengthInput')) document.getElementById('woodLengthInput').value = 250;

    updateTrackInputVisibility(); 
    updateTerrainStructure();
    resizeCanvas();
    setupEventListeners();
    
    requestAnimationFrame(gameLoop);
});