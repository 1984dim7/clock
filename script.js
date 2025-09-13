const canvas = document.getElementById('clockCanvas');
const ctx = canvas.getContext('2d');
const oscilloscopeCanvas = document.getElementById('oscilloscopeCanvas');
const oscCtx = oscilloscopeCanvas.getContext('2d');

// DOM Elements
const digitalClockDiv = document.getElementById('digitalClock');
const freqH_span = document.getElementById('freq-h');
const freqM_span = document.getElementById('freq-m');
const freqS_span = document.getElementById('freq-s');
const soundToggleButton = document.getElementById('soundToggleButton');
const speedSlider = document.getElementById('speedSlider');
const syncButton = document.getElementById('syncButton');
const waveButtons = document.querySelectorAll('.wave-btn');
const hourVolumeSlider = document.getElementById('hourVolume');
const minuteVolumeSlider = document.getElementById('minuteVolume');
const secondVolumeSlider = document.getElementById('secondVolume');
const hourOctaveInput = document.getElementById('hourOctave');
const minuteOctaveInput = document.getElementById('minuteOctave');
const secondOctaveInput = document.getElementById('secondOctave');
// NEW: Chord and Speed Display
const chordDisplayDiv = document.getElementById('chordDisplay');
const speedDisplaySpan = document.getElementById('speedDisplay');


// --- State Management ---
let isSoundOn = false;
let audioContext;
const oscillators = {};
let displayedFrequencies = { hour: 0, minute: 0, second: 0 };
let mainGainNode;
let currentWaveform = 'sine';
let analyser;

// --- Time Management ---
let virtualTime = new Date();
let lastTimestamp = 0;
let timeMultiplier = 1;

// --- Sound Engine ---
const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const baseFreq = 440; // A4

// NEW: Chord detection data and functions
const chordData = {
    'C,E,G': 'C Major', 'C,D#,G': 'C Minor',
    'C#,F,G#': 'C# Major', 'C#,E,G#': 'C# Minor',
    'D,F#,A': 'D Major', 'D,F,A': 'D Minor',
    'D#,G,A#': 'D# Major', 'D#,F#,A#': 'D# Minor',
    'E,G#,B': 'E Major', 'E,G,B': 'E Minor',
    'F,A,C': 'F Major', 'F,G#,C': 'F Minor',
    'F#,A#,C#': 'F# Major', 'F#,A,C#': 'F# Minor',
    'G,B,D': 'G Major', 'G,A#,D': 'G Minor',
    'G#,C,D#': 'G# Major', 'G#,B,D#': 'G# Minor',
    'A,C#,E': 'A Major', 'A,C,E': 'A Minor',
    'A#,D,F': 'A# Major', 'A#,C#,F': 'A# Minor',
    'B,D#,F#': 'B Major', 'B,D,F#': 'B Minor',
};
function getNoteFromFreq(freq) {
    if (freq === 0) return null;
    const midiNote = 69 + 12 * Math.log2(freq / 440);
    return notes[Math.round(midiNote) % 12];
}
function getChord() {
    const currentNotes = [
        getNoteFromFreq(displayedFrequencies.hour),
        getNoteFromFreq(displayedFrequencies.minute),
        getNoteFromFreq(displayedFrequencies.second)
    ].filter(Boolean); // nullを除外
    
    if (currentNotes.length < 3) return "...";
    
    const uniqueSortedNotes = [...new Set(currentNotes)].sort().join(',');
    
    return chordData[uniqueSortedNotes] || "...";
}


function getFrequency(note, octave) {
    const noteIndex = notes.indexOf(note);
    const halfStepsFromA4 = (noteIndex - 9) + (octave - 4) * 12;
    return baseFreq * Math.pow(2, halfStepsFromA4 / 12);
}

async function ensureAudioContext() {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            mainGainNode = audioContext.createGain();
            mainGainNode.gain.setValueAtTime(0, audioContext.currentTime);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            analyser.dataArray = new Uint8Array(analyser.frequencyBinCount);
            mainGainNode.connect(analyser);
            analyser.connect(audioContext.destination);
            ['hour', 'minute', 'second'].forEach(key => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                oscillator.type = currentWaveform;
                if (key === 'hour') gainNode.gain.setValueAtTime(parseFloat(hourVolumeSlider.value), audioContext.currentTime);
                if (key === 'minute') gainNode.gain.setValueAtTime(parseFloat(minuteVolumeSlider.value), audioContext.currentTime);
                if (key === 'second') gainNode.gain.setValueAtTime(parseFloat(secondVolumeSlider.value), audioContext.currentTime);
                oscillator.connect(gainNode);
                gainNode.connect(mainGainNode);
                oscillator.start();
                oscillators[key] = { oscillator, gainNode };
            });
        } catch (e) {
            console.error("Error creating AudioContext:", e);
        }
    }
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }
}

function updateSound() {
    if (!audioContext || audioContext.state === 'suspended') return;

    const targetMainGain = isSoundOn ? 1.0 : 0;
    mainGainNode.gain.linearRampToValueAtTime(targetMainGain, audioContext.currentTime + 0.2);

    const hourOctave = parseInt(hourOctaveInput.value) || 3;
    const minuteOctave = parseInt(minuteOctaveInput.value) || 4;
    const secondOctave = parseInt(secondOctaveInput.value) || 3;

    const hourBaseFreq = getFrequency('C', hourOctave);
    const minuteBaseFreq = getFrequency('C', minuteOctave);
    const secondBaseFreq = getFrequency('C', secondOctave);

    const h = virtualTime.getHours();
    const m = virtualTime.getMinutes();
    const s = virtualTime.getSeconds();
    const ms = virtualTime.getMilliseconds();
    
    const hourValue = (h % 12 + m / 60 + s / 3600 + ms / 3600000);
    const hourNoteValue = (hourValue / 12) * 12;
    const hourFreq = hourBaseFreq * Math.pow(2, hourNoteValue / 12);
    
    const minuteValue = (m + s / 60 + ms / 60000);
    const minuteNoteValue = (minuteValue / 60) * 12;
    const minuteFreq = minuteBaseFreq * Math.pow(2, minuteNoteValue / 12);

    const secondValue = (s + ms / 1000);
    const secondNoteValue = (secondValue / 60) * 12;
    const secondFreq = secondBaseFreq * Math.pow(2, secondNoteValue / 12);

    const rampTime = audioContext.currentTime + 0.05;
    if (oscillators.hour) {
        oscillators.hour.oscillator.frequency.linearRampToValueAtTime(hourFreq, rampTime);
        oscillators.minute.oscillator.frequency.linearRampToValueAtTime(minuteFreq, rampTime);
        oscillators.second.oscillator.frequency.linearRampToValueAtTime(secondFreq, rampTime);
        oscillators.hour.gainNode.gain.linearRampToValueAtTime(parseFloat(hourVolumeSlider.value), rampTime);
        oscillators.minute.gainNode.gain.linearRampToValueAtTime(parseFloat(minuteVolumeSlider.value), rampTime);
        oscillators.second.gainNode.gain.linearRampToValueAtTime(parseFloat(secondVolumeSlider.value), rampTime);
    }
    displayedFrequencies = { hour: hourFreq, minute: minuteFreq, second: secondFreq };
    
    // NEW: Update chord display
    if (chordDisplayDiv) {
        chordDisplayDiv.textContent = getChord();
    }
}

// --- Drawing Clock Engine ---
function drawClock() {
    const radius = canvas.width / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(radius, radius);
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
    const h = virtualTime.getHours();
    const m = virtualTime.getMinutes();
    const s = virtualTime.getSeconds();
    const ms = virtualTime.getMilliseconds();
    const hourAngle = ((h % 12 + m / 60 + s / 3600 + ms / 3600000) / 12) * 2 * Math.PI;
    const minuteAngle = ((m + s / 60 + ms / 60000) / 60) * 2 * Math.PI;
    const secondAngle = ((s + ms / 1000) / 60) * 2 * Math.PI;
    drawHand(hourAngle, radius * 0.5, radius * 0.07, '#757575');
    drawHand(minuteAngle, radius * 0.75, radius * 0.05, '#4285F4');
    drawHand(secondAngle, radius * 0.85, radius * 0.02, '#E63946');
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
    const format = (freq) => freq.toFixed(2).padStart(7, ' ') + ' Hz';
    if (freqH_span) freqH_span.textContent = format(displayedFrequencies.hour);
    if (freqM_span) freqM_span.textContent = format(displayedFrequencies.minute);
    if (freqS_span) freqS_span.textContent = format(displayedFrequencies.second);
}

function drawOscilloscope() {
    if (!analyser || !isSoundOn || (audioContext && audioContext.state === 'suspended')) {
        oscCtx.clearRect(0, 0, oscilloscopeCanvas.width, oscilloscopeCanvas.height);
        oscCtx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        oscCtx.fillRect(0, 0, oscilloscopeCanvas.width, oscilloscopeCanvas.height);
        return;
    }
    analyser.getByteTimeDomainData(analyser.dataArray);
    oscCtx.clearRect(0, 0, oscilloscopeCanvas.width, oscilloscopeCanvas.height);
    oscCtx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    oscCtx.fillRect(0, 0, oscilloscopeCanvas.width, oscilloscopeCanvas.height);
    oscCtx.lineWidth = 2;
    oscCtx.strokeStyle = 'lime';
    oscCtx.beginPath();
    const sliceWidth = oscilloscopeCanvas.width * 1.0 / analyser.dataArray.length;
    let x = 0;
    for (let i = 0; i < analyser.dataArray.length; i++) {
        const v = analyser.dataArray[i] / 128.0;
        const y = v * oscilloscopeCanvas.height / 2;
        if (i === 0) { oscCtx.moveTo(x, y); } else { oscCtx.lineTo(x, y); }
        x += sliceWidth;
    }
    oscCtx.lineTo(oscilloscopeCanvas.width, oscilloscopeCanvas.height / 2);
    oscCtx.stroke();
}

function gameLoop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const elapsed = (timestamp - lastTimestamp) * timeMultiplier;
    virtualTime.setMilliseconds(virtualTime.getMilliseconds() + elapsed);
    lastTimestamp = timestamp;
    drawClock();
    updateSound();
    drawOscilloscope();
    requestAnimationFrame(gameLoop);
}

// --- Event Listeners ---
soundToggleButton.addEventListener('click', async () => {
    await ensureAudioContext();
    isSoundOn = !isSoundOn;
    if (isSoundOn) {
        soundToggleButton.classList.remove('off'); soundToggleButton.classList.add('on');
        soundToggleButton.textContent = 'Mute';
    } else {
        soundToggleButton.classList.remove('on'); soundToggleButton.classList.add('off');
        soundToggleButton.textContent = 'Unmute';
    }
});

// UPDATED: Speed slider now handles rewind and updates display
speedSlider.addEventListener('input', (e) => {
    const sliderValue = parseFloat(e.target.value);
    
    if (sliderValue >= 0) {
        // Forward speed
        if (sliderValue <= 10) { timeMultiplier = sliderValue / 10; }
        else { timeMultiplier = 1 + (sliderValue - 10) * (99 / 90); }
    } else {
        // Rewind speed
        const absValue = Math.abs(sliderValue);
        if (absValue <= 10) { timeMultiplier = sliderValue / 10; }
        else { timeMultiplier = -(1 + (absValue - 10) * (99 / 90)); }
    }
    
    if (Math.abs(timeMultiplier) < 0.001 && sliderValue !== 0) timeMultiplier = 0;

    // Update display
    speedDisplaySpan.textContent = `x${timeMultiplier.toFixed(1)}`;
});


syncButton.addEventListener('click', () => {
    virtualTime = new Date();
    timeMultiplier = 1;
    speedSlider.value = 10;
    speedDisplaySpan.textContent = 'x1.0'; // NEW: Reset display
    lastTimestamp = 0;
});

waveButtons.forEach(button => {
    button.addEventListener('click', () => {
        waveButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        currentWaveform = button.dataset.wave;
        if (audioContext && oscillators.hour) {
            Object.values(oscillators).forEach(({ oscillator }) => { oscillator.type = currentWaveform; });
        }
    });
});

[hourVolumeSlider, minuteVolumeSlider, secondVolumeSlider].forEach(slider => {
    slider.addEventListener('input', (e) => {
        const hand = slider.id.replace('Volume', '');
        if (oscillators[hand] && audioContext && audioContext.state !== 'suspended') {
            oscillators[hand].gainNode.gain.setValueAtTime(parseFloat(e.target.value), audioContext.currentTime);
        }
    });
});

// --- Initial Setup ---
soundToggleButton.classList.add('off');
soundToggleButton.textContent = 'Unmute';
document.querySelector('.wave-btn[data-wave="sine"]').classList.add('active');
speedSlider.value = 10;
speedDisplaySpan.textContent = 'x1.0';
requestAnimationFrame(gameLoop);
