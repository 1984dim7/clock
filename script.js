const canvas = document.getElementById('clockCanvas');
const ctx = canvas.getContext('2d');
const oscilloscopeCanvas = document.getElementById('oscilloscopeCanvas');
const oscCtx = oscilloscopeCanvas.getContext('2d');

// DOM Elements
const digitalClockDiv = document.getElementById('digitalClock');
const frequencyDiv = document.getElementById('frequencyDisplay');
const soundToggleButton = document.getElementById('soundToggleButton');
const speedSlider = document.getElementById('speedSlider');
const syncButton = document.getElementById('syncButton');
const waveButtons = document.querySelectorAll('.wave-btn');
const hourVolumeSlider = document.getElementById('hourVolume');
const minuteVolumeSlider = document.getElementById('minuteVolume');
const secondVolumeSlider = document.getElementById('secondVolume');

// --- State Management ---
let isSoundOn = false;
let audioContext;
const oscillators = {}; // Stores { oscillator, gainNode } for each hand
let displayedFrequencies = { hour: 0, minute: 0, second: 0 };
let mainGainNode;
let currentWaveform = 'sine';
let analyser; // For oscilloscope

// --- Time Management ---
let virtualTime = new Date();
let lastTimestamp = 0;
let timeMultiplier = 1;

// --- Sound Engine ---
const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const baseFreq = 440; // A4

function getFrequency(note, octave) {
    const noteIndex = notes.indexOf(note);
    const halfStepsFromA4 = (noteIndex - 9) + (octave - 4) * 12;
    return baseFreq * Math.pow(2, halfStepsFromA4 / 12);
}

function setupSound() {
    if (audioContext) return;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    mainGainNode = audioContext.createGain();
    mainGainNode.gain.setValueAtTime(0, audioContext.currentTime); // Start with 0 gain
    
    // Setup Analyser for Oscilloscope
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048; // Fast Fourier Transform size
    const bufferLength = analyser.frequencyBinCount; // Number of data points
    analyser.dataArray = new Uint8Array(bufferLength); // Array to hold waveform data

    mainGainNode.connect(analyser); // Connect master gain to analyser
    analyser.connect(audioContext.destination); // Connect analyser to speakers

    ['hour', 'minute', 'second'].forEach(key => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.type = currentWaveform;
        
        // Set initial gain from sliders
        if (key === 'hour') gainNode.gain.setValueAtTime(parseFloat(hourVolumeSlider.value), audioContext.currentTime);
        if (key === 'minute') gainNode.gain.setValueAtTime(parseFloat(minuteVolumeSlider.value), audioContext.currentTime);
        if (key === 'second') gainNode.gain.setValueAtTime(parseFloat(secondVolumeSlider.value), audioContext.currentTime);
        
        oscillator.connect(gainNode);
        gainNode.connect(mainGainNode); // Connect individual gain to master gain
        oscillator.start();
        oscillators[key] = { oscillator, gainNode };
    });
}

function updateSound() {
    if (!audioContext) {
        // If sound not yet setup but should be on, call setup
        if (isSoundOn) setupSound(); 
        else return; // If not setup and not on, do nothing
    }

    // Main gain controlled by isSoundOn state
    const targetMainGain = isSoundOn ? 1.0 : 0;
    mainGainNode.gain.linearRampToValueAtTime(targetMainGain, audioContext.currentTime + 0.2);

    const h = virtualTime.getHours();
    const m = virtualTime.getMinutes();
    const s = virtualTime.getSeconds();
    const ms = virtualTime.getMilliseconds();
    
    const C_FREQS = {
        '3': getFrequency('C', 3), // Base for hour
        '4': getFrequency('C', 4), // Base for minute
        '3_sec': getFrequency('C', 3)  // Base for second (CHANGED to C3)
    };

    // --- Continuous frequency for ALL hands ---
    const hourValue = (h % 12 + m / 60 + s / 3600 + ms / 3600000);
    const hourNoteValue = (hourValue / 12) * 12;
    const hourFreq = C_FREQS['3'] * Math.pow(2, hourNoteValue / 12);
    
    const minuteValue = (m + s / 60 + ms / 60000);
    const minuteNoteValue = (minuteValue / 60) * 12;
    const minuteFreq = C_FREQS['4'] * Math.pow(2, minuteNoteValue / 12);

    const secondValue = (s + ms / 1000);
    const secondNoteValue = (secondValue / 60) * 12;
    const secondFreq = C_FREQS['3_sec'] * Math.pow(2, secondNoteValue / 12); // Use C3 for second

    const rampTime = audioContext.currentTime + 0.05;

    // Only update oscillator frequencies if oscillators are created
    if (oscillators.hour) {
        oscillators.hour.oscillator.frequency.linearRampToValueAtTime(hourFreq, rampTime);
        oscillators.minute.oscillator.frequency.linearRampToValueAtTime(minuteFreq, rampTime);
        oscillators.second.oscillator.frequency.linearRampToValueAtTime(secondFreq, rampTime);

        // Update individual gain from sliders
        oscillators.hour.gainNode.gain.linearRampToValueAtTime(parseFloat(hourVolumeSlider.value), rampTime);
        oscillators.minute.gainNode.gain.linearRampToValueAtTime(parseFloat(minuteVolumeSlider.value), rampTime);
        oscillators.second.gainNode.gain.linearRampToValueAtTime(parseFloat(secondVolumeSlider.value), rampTime);
    }

    displayedFrequencies = { hour: hourFreq, minute: minuteFreq, second: secondFreq };
}

// --- Drawing Clock Engine ---
function drawClock() {
    const radius = canvas.width / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(radius, radius);

    // Draw Clock Face
    const grad = ctx.createRadialGradient(0, 0, radius * 0.8, 0, 0, radius);
    grad.addColorStop(0, '#e1f5fe');
    grad.addColorStop(1, '#b3e5fc');
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.98, 0, 2 * Math.PI);
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 5;
    ctx.shadowOffsetY = 5;
    ctx.fill();

    // Draw Clock Border
    const borderGrad = ctx.createLinearGradient(-radius, -radius, radius, radius);
    borderGrad.addColorStop(0, '#ffffff');
    borderGrad.addColorStop(1, '#e0e0e0');
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.98, 0, 2 * Math.PI);
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = radius * 0.04;
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(radius, radius);

    // Draw Note Names
    ctx.font = radius * 0.12 + "px 'Varela Round', sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillStyle = '#003366';
    for(let i = 0; i < 12; i++){
        let angle = i * Math.PI / 6;
        let x = radius * 0.8 * Math.sin(angle);
        let y = -radius * 0.8 * Math.cos(angle);
        ctx.fillText(notes[i], x, y);
    }
    
    // Time Calculation
    const h = virtualTime.getHours();
    const m = virtualTime.getMinutes();
    const s = virtualTime.getSeconds();
    const ms = virtualTime.getMilliseconds();
    
    const hourAngle = ((h % 12 + m / 60 + s / 3600 + ms / 3600000) / 12) * 2 * Math.PI;
    const minuteAngle = ((m + s / 60 + ms / 60000) / 60) * 2 * Math.PI;
    const secondAngle = ((s + ms / 1000) / 60) * 2 * Math.PI;

    drawHand(hourAngle, radius * 0.5, radius * 0.07, '#333');
    drawHand(minuteAngle, radius * 0.75, radius * 0.05, '#333');
    drawHand(secondAngle, radius * 0.85, radius * 0.02, '#e63946');

    // Draw Center Point
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.05, 0, 2 * Math.PI);
    ctx.fillStyle = '#555';
    ctx.fill();
    ctx.restore();
    
    updateDigitalClock(h, m, s);
    updateFrequencyDisplay();
}

function drawHand(angle, length, width, color) {
    ctx.save();
    ctx.rotate(angle - Math.PI/2);
    ctx.beginPath();
    ctx.moveTo(-length * 0.1, 0);
    ctx.lineTo(length, 0);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.stroke();
    ctx.restore();
}

function updateDigitalClock(h, m, s) {
    const pad = (num) => String(num).padStart(2, '0');
    digitalClockDiv.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function updateFrequencyDisplay() {
    const format = (freq) => freq.toFixed(2).padStart(7, ' ');
    frequencyDiv.innerHTML = `H:${format(displayedFrequencies.hour)} Hz | M:${format(displayedFrequencies.minute)} Hz | S:${format(displayedFrequencies.second)} Hz`;
}

// --- Oscilloscope Drawing ---
function drawOscilloscope() {
    if (!analyser || !isSoundOn) {
        oscCtx.clearRect(0, 0, oscilloscopeCanvas.width, oscilloscopeCanvas.height);
        // Draw a subtle background for the oscilloscope even when off
        oscCtx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        oscCtx.fillRect(0, 0, oscilloscopeCanvas.width, oscilloscopeCanvas.height);
        return;
    }

    analyser.getByteTimeDomainData(analyser.dataArray); // Get waveform data
    
    oscCtx.clearRect(0, 0, oscilloscopeCanvas.width, oscilloscopeCanvas.height);
    oscCtx.fillStyle = 'rgba(0, 0, 0, 0.4)'; // Oscilloscope background
    oscCtx.fillRect(0, 0, oscilloscopeCanvas.width, oscilloscopeCanvas.height);
    
    oscCtx.lineWidth = 2;
    oscCtx.strokeStyle = 'lime'; // Bright green for the waveform
    oscCtx.beginPath();

    const sliceWidth = oscilloscopeCanvas.width * 1.0 / analyser.dataArray.length;
    let x = 0;

    for (let i = 0; i < analyser.dataArray.length; i++) {
        const v = analyser.dataArray[i] / 128.0; // Data is 0-255, convert to 0-2
        const y = v * oscilloscopeCanvas.height / 2;

        if (i === 0) {
            oscCtx.moveTo(x, y);
        } else {
            oscCtx.lineTo(x, y);
        }
        x += sliceWidth;
    }
    oscCtx.lineTo(oscilloscopeCanvas.width, oscilloscopeCanvas.height / 2); // Ensure line reaches end
    oscCtx.stroke();
}


// --- Main Loop ---
function gameLoop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    
    const elapsed = (timestamp - lastTimestamp) * timeMultiplier;
    virtualTime.setMilliseconds(virtualTime.getMilliseconds() + elapsed);
    lastTimestamp = timestamp;

    drawClock();
    updateSound(); 
    drawOscilloscope(); // Draw oscilloscope in every frame

    requestAnimationFrame(gameLoop);
}

// --- Event Listeners ---
soundToggleButton.addEventListener('click', () => {
    // Only setup sound context if it hasn't been done (first click)
    if (!audioContext) setupSound();

    isSoundOn = !isSoundOn;
    // mainGainNode gain is now controlled in updateSound based on isSoundOn
    
    if (isSoundOn) {
        soundToggleButton.classList.remove('off');
        soundToggleButton.classList.add('on');
    } else {
        soundToggleButton.classList.remove('on');
        soundToggleButton.classList.add('off');
    }
});

speedSlider.addEventListener('input', (e) => {
    const sliderValue = parseFloat(e.target.value);
    // Adjust timeMultiplier for better control at low speeds
    if (sliderValue <= 10) { // 0 to 1x speed mapped to slider 0-10
        timeMultiplier = sliderValue / 10;
    } else { // 1x to 100x speed mapped to slider 10-100
        timeMultiplier = 1 + (sliderValue - 10) * (99 / 90);
    }
    if (timeMultiplier < 0.001) timeMultiplier = 0; 
});

syncButton.addEventListener('click', () => {
    virtualTime = new Date();
    timeMultiplier = 1;
    speedSlider.value = 10; // Corresponds to 1x speed
    lastTimestamp = 0; 
});

waveButtons.forEach(button => {
    button.addEventListener('click', () => {
        waveButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        currentWaveform = button.dataset.wave;
        if (audioContext) {
            Object.values(oscillators).forEach(({ oscillator }) => {
                oscillator.type = currentWaveform;
            });
        }
    });
});

hourVolumeSlider.addEventListener('input', (e) => {
    if (oscillators.hour && audioContext) {
        oscillators.hour.gainNode.gain.setValueAtTime(parseFloat(e.target.value), audioContext.currentTime);
    }
});
minuteVolumeSlider.addEventListener('input', (e) => {
    if (oscillators.minute && audioContext) {
        oscillators.minute.gainNode.gain.setValueAtTime(parseFloat(e.target.value), audioContext.currentTime);
    }
});
secondVolumeSlider.addEventListener('input', (e) => {
    if (oscillators.second && audioContext) {
        oscillators.second.gainNode.gain.setValueAtTime(parseFloat(e.target.value), audioContext.currentTime);
    }
});


// --- Initial Setup ---
soundToggleButton.classList.add('off'); 
document.querySelector('.wave-btn[data-wave="sine"]').classList.add('active'); // Set sine as default active
speedSlider.value = 10; // Initial speed set to 1x
requestAnimationFrame(gameLoop);
