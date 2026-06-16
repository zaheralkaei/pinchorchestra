import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/vision_bundle.mjs";

// ---------- DOM ----------
const videoEl = document.getElementById("video");
const overlayEl = document.getElementById("overlay");
const octx = overlayEl.getContext("2d");

const startCamBtn = document.getElementById("startCamBtn");
const startAudioBtn = document.getElementById("startAudioBtn");

const camStatus = document.getElementById("camStatus");
const audioStatus = document.getElementById("audioStatus");

const instrumentEl = document.getElementById("instrument");

const beatsOnEl = document.getElementById("beatsOn");
const beatPatternEl = document.getElementById("beatPattern");
const tempoEl = document.getElementById("tempo");
const beatVolEl = document.getElementById("beatVol");
const instVolEl = document.getElementById("instVol");
const glideEl = document.getElementById("glide");
const reverbEl = document.getElementById("reverb");

const circleREl = document.getElementById("circleR");

const droneOnEl = document.getElementById("droneOn");
const droneModeEl = document.getElementById("droneMode");
const droneVolEl = document.getElementById("droneVol");

const mirrorEl = document.getElementById("mirror");
const handVizEl = document.getElementById("handViz"); // only cursor/points now
const pinchThEl = document.getElementById("pinchTh");
const smoothAEl = document.getElementById("smoothA");
const maxFpsEl = document.getElementById("maxFps");

const noteLabelLEl = document.getElementById("noteLabelL");
const noteLabelREl = document.getElementById("noteLabelR");
const playLabelLEl = document.getElementById("playLabelL");
const playLabelREl = document.getElementById("playLabelR");

const beatsLabelEl = document.getElementById("beatsLabel");
const droneLabelEl = document.getElementById("droneLabel");

const microResetBtn = document.getElementById("microResetBtn");
const microButtons = Array.from(document.querySelectorAll('.micro button[data-note]'));

// ---------- sizing ----------
let W = 0, H = 0;
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  W = overlayEl.clientWidth;
  H = overlayEl.clientHeight;
  overlayEl.width = Math.floor(W * dpr);
  overlayEl.height = Math.floor(H * dpr);
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resizeCanvas);

// ---------- helpers ----------
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx*dx + dy*dy; }
function dist(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return Math.hypot(dx, dy); }

function applyMirror() {
  videoEl.style.transform = (mirrorEl.value === "on") ? "scaleX(-1)" : "none";
}
mirrorEl.addEventListener("change", applyMirror);

function clearOverlay() { octx.clearRect(0, 0, W, H); }

function drawCursor(nx, ny, active, color) {
  const x = nx * W, y = ny * H;
  octx.save();
  octx.lineWidth = 2;
  octx.beginPath();
  octx.arc(x, y, 11, 0, Math.PI * 2);
  octx.strokeStyle = active ? color : "rgba(255,204,0,0.85)";
  octx.stroke();
  octx.restore();
}

function drawPoints(lms, active, color) {
  octx.save();
  for (let i = 0; i < lms.length; i++) {
    const p = lms[i];
    const x = p.x * W, y = p.y * H;
    octx.beginPath();
    octx.arc(x, y, i === 8 ? 6 : 3, 0, Math.PI * 2);
    octx.fillStyle = (i === 8)
      ? (active ? color : "rgba(255,204,0,0.85)")
      : "rgba(255,255,255,0.85)";
    octx.fill();
  }
  octx.restore();
}

function drawHUD(text) {
  octx.save();
  octx.font = "14px system-ui, sans-serif";
  octx.fillStyle = "rgba(0,0,0,0.45)";
  octx.fillRect(10, 10, Math.min(W - 20, 980), 56);
  octx.fillStyle = "rgba(255,255,255,0.92)";
  octx.fillText(text, 18, 34);
  octx.restore();
}

function mapPointerForMirror(p) {
  if (mirrorEl.value !== "on") return p;
  return { x: 1 - p.x, y: p.y, z: p.z };
}

// per-hand EMA smoothing
function smoothPointFactory() {
  let smoothed = null;
  return (p) => {
    const a = Number(smoothAEl.value);
    if (!smoothed || a <= 0) {
      smoothed = { x: p.x, y: p.y };
      return smoothed;
    }
    smoothed.x = a * smoothed.x + (1 - a) * p.x;
    smoothed.y = a * smoothed.y + (1 - a) * p.y;
    return smoothed;
  };
}

// ---------- microtuning (-50 cents) ----------
const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const pitchCents = new Array(12).fill(0); // 0 or -50

function pcIndexFromName(name) {
  const idx = NOTE_NAMES.indexOf(name);
  return idx >= 0 ? idx : 0;
}

function centsForMidi(midi) {
  const pc = ((midi % 12) + 12) % 12;
  return pitchCents[pc] || 0;
}

function applyCentsToFreq(freq, cents) {
  return freq * Math.pow(2, cents / 1200);
}

function midiToBaseFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function midiToFreqMicro(m) {
  const base = midiToBaseFreq(m);
  return applyCentsToFreq(base, centsForMidi(m));
}

function labelForPcName(name) {
  const idx = pcIndexFromName(name);
  const c = pitchCents[idx] || 0;
  return c === -50 ? `${name}↓` : name;
}

function midiNameMicro(m) {
  const pc = ((m % 12) + 12) % 12;
  const name = NOTE_NAMES[pc];
  const oct = Math.floor(m / 12) - 1;
  return `${labelForPcName(name)}${oct}`;
}

function syncMicroButtonsUI() {
  for (const btn of microButtons) {
    const n = btn.dataset.note;
    const idx = pcIndexFromName(n);
    btn.classList.toggle("active", pitchCents[idx] === -50);
  }
}

function toggleQuarterDown(noteName) {
  const idx = pcIndexFromName(noteName);
  pitchCents[idx] = (pitchCents[idx] === 0) ? -50 : 0;
  syncMicroButtonsUI();
}

for (const btn of microButtons) {
  btn.addEventListener("click", () => toggleQuarterDown(btn.dataset.note));
}

microResetBtn?.addEventListener("click", () => {
  for (let i = 0; i < pitchCents.length; i++) pitchCents[i] = 0;
  syncMicroButtonsUI();
});

syncMicroButtonsUI();

// ---------- Keyboard circles (2 octaves complete: C..C..C) ----------
const ROOT_MIDI = 60;      // fixed to C (C4 labels)
const OCTAVE_SHIFT = -12;  // global transpose (keeps your lower register)

// White offsets for two octaves inclusive (15 whites): C D E F G A B C D E F G A B C
const WHITE_GLOBAL_OFFSETS = [0,2,4,5,7,9,11,12,14,16,17,19,21,23,24];
// Black offsets across two octaves (10 blacks)
const BLACK_GLOBAL_OFFSETS = [1,3,6,8,10,13,15,18,20,22];

// For placing blacks between adjacent whites (index pairs in WHITE_GLOBAL_OFFSETS)
const BLACK_ANCHOR_PAIRS = [
  [0,1],  // C# between C-D
  [1,2],  // D# between D-E
  [3,4],  // F# between F-G
  [4,5],  // G# between G-A
  [5,6],  // A# between A-B
  [7,8],  // C# between C-D (2nd octave)
  [8,9],  // D# between D-E
  [10,11],// F# between F-G
  [11,12],// G# between G-A
  [12,13] // A# between A-B
];

function buildKeyboardCircles() {
  const margin = 70;
  const x0 = margin;
  const x1 = Math.max(margin + 10, W - margin);

  const yWhite = Math.round(H * 0.80);
  const yBlack = Math.round(H * 0.62);

  const whiteCount = WHITE_GLOBAL_OFFSETS.length; // 15
  const step = (whiteCount <= 1) ? 0 : (x1 - x0) / (whiteCount - 1);

  const circles = [];
  const whiteXs = [];

  // whites
  for (let i = 0; i < WHITE_GLOBAL_OFFSETS.length; i++) {
    const off = WHITE_GLOBAL_OFFSETS[i];
    const x = x0 + step * i;
    whiteXs.push(x);

    const midi = ROOT_MIDI + OCTAVE_SHIFT + off;
    const pc = ((midi % 12) + 12) % 12;

    circles.push({
      midi,
      label: labelForPcName(NOTE_NAMES[pc]),
      x, y: yWhite,
      kind: "white",
    });
  }

  // blacks (positioned between whites)
  for (let i = 0; i < BLACK_GLOBAL_OFFSETS.length; i++) {
    const off = BLACK_GLOBAL_OFFSETS[i];
    const [ia, ib] = BLACK_ANCHOR_PAIRS[i];

    const x = (whiteXs[ia] + whiteXs[ib]) / 2;
    const midi = ROOT_MIDI + OCTAVE_SHIFT + off;
    const pc = ((midi % 12) + 12) % 12;

    circles.push({
      midi,
      label: labelForPcName(NOTE_NAMES[pc]),
      x, y: yBlack,
      kind: "black",
    });
  }

  return circles;
}

function drawKeyboard(circles, playingMidis, hoverMidis) {
  const r = parseInt(circleREl.value, 10);

  const playingSet = new Set((playingMidis || []).filter(x => x != null));
  const hoverSet = new Set((hoverMidis || []).filter(x => x != null));

  const whites = circles.filter(c => c.kind === "white");
  const blacks = circles.filter(c => c.kind === "black");

  // guide lines
  octx.save();
  octx.lineWidth = 4;
  octx.strokeStyle = "rgba(255,255,255,0.18)";
  if (whites.length >= 2) {
    octx.beginPath();
    octx.moveTo(whites[0].x, whites[0].y);
    octx.lineTo(whites[whites.length - 1].x, whites[whites.length - 1].y);
    octx.stroke();
  }
  octx.lineWidth = 3;
  octx.strokeStyle = "rgba(255,255,255,0.10)";
  if (blacks.length >= 2) {
    octx.beginPath();
    octx.moveTo(blacks[0].x, blacks[0].y);
    octx.lineTo(blacks[blacks.length - 1].x, blacks[blacks.length - 1].y);
    octx.stroke();
  }
  octx.restore();

  const drawGroup = (group) => {
    for (const c of group) {
      const isPlaying = playingSet.has(c.midi);
      const isHover = hoverSet.has(c.midi);

      let fill, stroke, lw, rr;

      if (c.kind === "white") {
        rr = r;
        if (isPlaying) { fill = "rgba(0,229,255,0.55)"; stroke = "rgba(0,229,255,1)"; lw = 3; }
        else if (isHover) { fill = "rgba(255,204,0,0.28)"; stroke = "rgba(255,204,0,0.90)"; lw = 2; }
        else { fill = "rgba(255,255,255,0.14)"; stroke = "rgba(255,255,255,0.45)"; lw = 2; }
      } else {
        rr = Math.round(r * 0.88);
        if (isPlaying) { fill = "rgba(0,229,255,0.62)"; stroke = "rgba(0,229,255,1)"; lw = 3; }
        else if (isHover) { fill = "rgba(255,204,0,0.34)"; stroke = "rgba(255,204,0,0.95)"; lw = 2; }
        else { fill = "rgba(0,0,0,0.34)"; stroke = "rgba(255,255,255,0.35)"; lw = 2; }
      }

      octx.save();
      octx.beginPath();
      octx.arc(c.x, c.y, rr, 0, Math.PI * 2);
      octx.fillStyle = fill;
      octx.strokeStyle = stroke;
      octx.lineWidth = lw;
      octx.fill();
      octx.stroke();

      octx.font = "13px system-ui, sans-serif";
      octx.textAlign = "center";
      octx.fillStyle = "rgba(255,255,255,0.92)";
      octx.fillText(c.label, c.x, c.y + rr + 18);
      octx.restore();
    }
  };

  // draw whites then blacks
  drawGroup(whites);
  drawGroup(blacks);
}

function findTouchedCircle(px, py, circles) {
  const r = parseInt(circleREl.value, 10);
  let best = null;
  for (const c of circles) {
    const rr = (c.kind === "black") ? Math.round(r * 0.88) : r;
    const d2 = dist2(px, py, c.x, c.y);
    if (d2 <= rr * rr) {
      if (!best || d2 < best.d2) best = { c, d2 };
    }
  }
  return best ? best.c : null;
}

// ---------- Audio ----------
function makeImpulseResponse(ctx, seconds = 2.8, decay = 2.2) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return impulse;
}

const INSTRUMENTS = {
  warm_pad: { w1:"sawtooth", w2:"triangle", det1:-9, det2:+9, lpBase:650, lpRange:2400, attack:0.10, release:0.35, vib:0.0 },
  soft_keys:{ w1:"triangle", w2:"sine",    det1:-5, det2:+5, lpBase:850, lpRange:2000, attack:0.03, release:0.20, vib:0.0 },
  organ:    { w1:"square",  w2:"sine",    det1: 0, det2: 0, lpBase:3200,lpRange:1200, attack:0.01, release:0.10, vib:0.0 },
  flute:    { w1:"sine",    w2:"sine",    det1:-2, det2:+2, lpBase:1800,lpRange:1400, attack:0.04, release:0.18, vib:4.0 },
  pluck:    { w1:"triangle",w2:"square",  det1:-4, det2:+4, lpBase:1200,lpRange:1800, attack:0.005,release:0.12, vib:0.0 },
  bass:     { w1:"sawtooth",w2:"square",  det1:-7, det2:+7, lpBase:320, lpRange:900,  attack:0.01, release:0.18, vib:0.0 },
  synth:    { w1:"sawtooth",w2:"sawtooth",det1:-12,det2:+12,lpBase:900, lpRange:2600, attack:0.02, release:0.22, vib:0.0 },
};

class NoteVoice {
  constructor(ctx, outNode) {
    this.ctx = ctx;
    this.out = outNode;

    this.vca = ctx.createGain();
    this.vca.gain.value = 0.0001;

    this.o1 = ctx.createOscillator();
    this.o2 = ctx.createOscillator();

    this.f = ctx.createBiquadFilter();
    this.f.type = "lowpass";
    this.f.frequency.value = 1400;
    this.f.Q.value = 0.7;

    this.o1.connect(this.f);
    this.o2.connect(this.f);
    this.f.connect(this.vca);
    this.vca.connect(this.out);

    this.lfo = ctx.createOscillator();
    this.lfoGain = ctx.createGain();
    this.lfo.type = "sine";
    this.lfo.frequency.value = 5.2;
    this.lfoGain.gain.value = 0;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.o1.detune);
    this.lfoGain.connect(this.o2.detune);

    this.o1.start();
    this.o2.start();
    this.lfo.start();

    this.on = false;
    this.midi = null;

    this.params = INSTRUMENTS.warm_pad;
    this.applyInstrumentParams(this.params);
  }

  applyInstrumentParams(p) {
    this.params = p;
    this.o1.type = p.w1;
    this.o2.type = p.w2;
    this.o1.detune.value = p.det1;
    this.o2.detune.value = p.det2;
    this.lfoGain.gain.value = p.vib || 0;
  }

  setFreq(midi, glide) {
    const now = this.ctx.currentTime;
    const f = midiToFreqMicro(midi);
    this.o1.frequency.setTargetAtTime(f, now, glide);
    this.o2.frequency.setTargetAtTime(f, now, glide);
    this.midi = midi;
  }

  setBrightness(b01) {
    const now = this.ctx.currentTime;
    const p = this.params;
    const cutoff = p.lpBase + b01 * p.lpRange;
    this.f.frequency.setTargetAtTime(cutoff, now, 0.05);
  }

  gate(on, amp) {
    const now = this.ctx.currentTime;
    const p = this.params;
    this.vca.gain.cancelScheduledValues(now);
    if (on) {
      this.vca.gain.setTargetAtTime(Math.max(0.0001, amp), now, p.attack);
      this.on = true;
    } else {
      this.vca.gain.setTargetAtTime(0.0001, now, p.release);
      this.on = false;
    }
  }
}

class DroneVoice {
  constructor(ctx, outNode) {
    this.ctx = ctx;
    this.out = outNode;

    this.g = ctx.createGain();
    this.g.gain.value = 0.0001;

    this.o1 = ctx.createOscillator();
    this.o2 = ctx.createOscillator();
    this.o1.type = "sine";
    this.o2.type = "triangle";
    this.o1.detune.value = -4;
    this.o2.detune.value = +4;

    this.f = ctx.createBiquadFilter();
    this.f.type = "lowpass";
    this.f.frequency.value = 900;
    this.f.Q.value = 0.6;

    this.o1.connect(this.f);
    this.o2.connect(this.f);
    this.f.connect(this.g);
    this.g.connect(this.out);

    this.o1.start();
    this.o2.start();

    this.on = false;
  }

  setNotes(midi1, midi2, glide) {
    const now = this.ctx.currentTime;
    this.o1.frequency.setTargetAtTime(midiToFreqMicro(midi1), now, glide);
    this.o2.frequency.setTargetAtTime(midiToFreqMicro(midi2), now, glide);
  }

  setBrightness(b01) {
    const now = this.ctx.currentTime;
    const cutoff = 550 + b01 * 1600;
    this.f.frequency.setTargetAtTime(cutoff, now, 0.15);
  }

  setVolume(v) {
    const now = this.ctx.currentTime;
    this.g.gain.setTargetAtTime(Math.max(0.0001, v), now, 0.10);
  }

  gate(on) {
    const now = this.ctx.currentTime;
    this.g.gain.cancelScheduledValues(now);
    if (on) {
      this.g.gain.setTargetAtTime(Math.max(0.0001, Number(droneVolEl.value)), now, 0.20);
      this.on = true;
    } else {
      this.g.gain.setTargetAtTime(0.0001, now, 0.40);
      this.on = false;
    }
  }
}

// ---------- Beat patterns ----------
const BEAT_PATTERNS = {
  straight: {
    name: "Straight (4/4)",
    kick: [0, 8],
    snare: [4, 12],
    hat:  [0,2,4,6,8,10,12,14],
    hatAccent: [14],
    hatAmp: 0.03,
    hatAccentAmp: 0.06
  },
  house: {
    name: "House",
    kick: [0, 4, 8, 12],
    snare: [4, 12],
    hat: [2,6,10,14],
    hatAccent: [14],
    hatAmp: 0.03,
    hatAccentAmp: 0.06
  },
  techno: {
    name: "Techno",
    kick: [0, 4, 8, 12],
    snare: [8],
    hat: [1,3,5,7,9,11,13,15],
    hatAccent: [15],
    hatAmp: 0.028,
    hatAccentAmp: 0.055
  },
  break: {
    name: "Break",
    kick: [0, 7, 8, 11],
    snare: [4, 12],
    hat: [0,2,4,6,8,10,12,14],
    hatAccent: [6,14],
    hatAmp: 0.028,
    hatAccentAmp: 0.055
  },
  shuffle: {
    name: "Shuffle",
    kick: [0, 8],
    snare: [4, 12],
    hat: [0,3,4,7,8,11,12,15],
    hatAccent: [15],
    hatAmp: 0.028,
    hatAccentAmp: 0.055
  }
};

class BeatEngine {
  constructor(ctx, outNode) {
    this.ctx = ctx;
    this.out = outNode;

    this.isOn = true;
    this.tempo = 92;
    this.pattern = "straight";

    this.lookahead = 25;
    this.scheduleAhead = 0.12;
    this.nextNoteTime = 0;
    this.step = 0;
    this.timer = null;

    this.vol = ctx.createGain();
    this.vol.gain.value = Number(beatVolEl.value);
    this.vol.connect(this.out);

    beatVolEl.addEventListener("input", () => {
      if (this.vol) this.vol.gain.value = Number(beatVolEl.value);
    });
  }

  setOn(on) { this.isOn = !!on; }
  setTempo(bpm) { this.tempo = Math.max(40, Math.min(220, bpm|0)); }
  setPattern(name) { this.pattern = BEAT_PATTERNS[name] ? name : "straight"; }

  start() {
    if (this.timer) return;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.step = 0;
    this.timer = setInterval(() => this._tick(), this.lookahead);
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  _tick() {
    if (!this.isOn) return;
    const now = this.ctx.currentTime;
    while (this.nextNoteTime < now + this.scheduleAhead) {
      this._scheduleStep(this.step, this.nextNoteTime);
      this._advance();
    }
  }

  _advance() {
    const spb = 60.0 / this.tempo;
    const sp16 = spb / 4;
    this.nextNoteTime += sp16;
    this.step = (this.step + 1) % 16;
  }

  _scheduleStep(step, t) {
    const pat = BEAT_PATTERNS[this.pattern] || BEAT_PATTERNS.straight;

    if (pat.kick.includes(step)) this._kick(t);
    if (pat.snare.includes(step)) this._snare(t);

    if (pat.hat.includes(step)) {
      const isAccent = (pat.hatAccent || []).includes(step);
      this._hat(t, isAccent ? (pat.hatAccentAmp ?? 0.06) : (pat.hatAmp ?? 0.03));
    }
  }

  _kick(t) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(this.vol);
    o.start(t);
    o.stop(t + 0.2);
  }

  _snare(t) {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.25, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);

    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.8;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.20, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

    src.connect(bp).connect(g).connect(this.vol);
    src.start(t);
    src.stop(t + 0.22);
  }

  _hat(t, amp = 0.03) {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.08, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);

    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    hp.Q.value = 0.7;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);

    src.connect(hp).connect(g).connect(this.vol);
    src.start(t);
    src.stop(t + 0.08);
  }
}

class AudioEngine {
  constructor() {
    this.ctx = null;

    this.master = null;
    this.comp = null;

    this.rev = null;
    this.revWet = null;
    this.revDry = null;

    this.instBus = null;
    this.beatBus = null;

    this.voices = [];
    this.playing = [false, false];
    this.playingMidi = [null, null];

    this.drone = null;
    this.beats = null;
  }

  async start() {
    if (this.ctx) { await this.ctx.resume(); return; }

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -22;
    this.comp.knee.value = 26;
    this.comp.ratio.value = 7;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.15;

    this.rev = this.ctx.createConvolver();
    this.rev.buffer = makeImpulseResponse(this.ctx, 2.8, 2.3);

    this.revWet = this.ctx.createGain();
    this.revDry = this.ctx.createGain();
    this.revWet.gain.value = Number(reverbEl.value);
    this.revDry.gain.value = 1.0;

    reverbEl.addEventListener("input", () => {
      if (this.revWet) this.revWet.gain.value = Number(reverbEl.value);
    });

    this.instBus = this.ctx.createGain();
    this.instBus.gain.value = Number(instVolEl.value);
    instVolEl.addEventListener("input", () => {
      if (this.instBus) this.instBus.gain.value = Number(instVolEl.value);
    });

    this.beatBus = this.ctx.createGain();
    this.beatBus.gain.value = 1.0;

    const sum = this.ctx.createGain();
    this.instBus.connect(sum);
    this.beatBus.connect(sum);

    sum.connect(this.revDry);
    sum.connect(this.rev);
    this.rev.connect(this.revWet);

    const mix = this.ctx.createGain();
    this.revDry.connect(mix);
    this.revWet.connect(mix);

    mix.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(this.ctx.destination);

    this.voices = [new NoteVoice(this.ctx, this.instBus), new NoteVoice(this.ctx, this.instBus)];
    this.applyInstrument(instrumentEl.value);

    instrumentEl.addEventListener("change", () => this.applyInstrument(instrumentEl.value));

    this.drone = new DroneVoice(this.ctx, this.instBus);

    this.beats = new BeatEngine(this.ctx, this.beatBus);
    this.beats.setTempo(parseInt(tempoEl.value, 10));
    this.beats.setOn(beatsOnEl.value === "on");
    this.beats.setPattern(beatPatternEl.value);
    this.beats.start();

    beatsOnEl.addEventListener("change", () => {
      if (this.beats) this.beats.setOn(beatsOnEl.value === "on");
      updateBeatsLabel();
    });

    beatPatternEl.addEventListener("change", () => {
      if (this.beats) this.beats.setPattern(beatPatternEl.value);
      updateBeatsLabel();
    });

    tempoEl.addEventListener("input", () => {
      if (this.beats) this.beats.setTempo(parseInt(tempoEl.value, 10));
    });

    droneVolEl.addEventListener("input", () => {
      if (this.drone && this.drone.on) this.drone.setVolume(Number(droneVolEl.value));
    });
  }

  applyInstrument(name) {
    const p = INSTRUMENTS[name] || INSTRUMENTS.warm_pad;
    for (const v of this.voices) v.applyInstrumentParams(p);
  }

  async stop() {
    this.noteOff(0);
    this.noteOff(1);
    this.droneOff();

    if (this.beats) { this.beats.stop(); this.beats = null; }

    if (this.ctx) {
      try { await this.ctx.close(); } catch (_) {}
    }

    this.ctx = null;
    this.voices = [];
    this.playing = [false, false];
    this.playingMidi = [null, null];
    this.drone = null;
  }

  noteOn(handIdx, midi, brightness01) {
    if (!this.ctx || !this.voices[handIdx]) return;
    const glide = Number(glideEl.value);
    const amp = 0.10;
    const v = this.voices[handIdx];
    v.setFreq(midi, glide);
    v.setBrightness(brightness01);
    v.gate(true, amp);
    this.playing[handIdx] = true;
    this.playingMidi[handIdx] = midi;
  }

  noteUpdate(handIdx, midi, brightness01) {
    if (!this.ctx || !this.voices[handIdx]) return;
    const glide = Number(glideEl.value);
    const v = this.voices[handIdx];
    v.setFreq(midi, glide);
    v.setBrightness(brightness01);
    if (!this.playing[handIdx]) v.gate(true, 0.10);
    this.playing[handIdx] = true;
    this.playingMidi[handIdx] = midi;
  }

  noteOff(handIdx) {
    if (!this.ctx || !this.voices[handIdx]) return;
    this.voices[handIdx].gate(false, 0);
    this.playing[handIdx] = false;
    this.playingMidi[handIdx] = null;
  }

  droneOn(brightness01) {
    if (!this.ctx || !this.drone) return;

    const mode = droneModeEl.value;
    const glide = 0.10;

    const base = ROOT_MIDI + OCTAVE_SHIFT - 12; // drone below
    const fifth = base + 7;

    if (mode === "root5") this.drone.setNotes(base, fifth, glide);
    else this.drone.setNotes(base, base, glide);

    this.drone.setBrightness(brightness01);
    this.drone.gate(true);
  }

  droneOff() {
    if (!this.ctx || !this.drone) return;
    this.drone.gate(false);
  }
}

const audio = new AudioEngine();

// ---------- labels ----------
function updateBeatsLabel() {
  const on = (beatsOnEl.value === "on");
  const pat = BEAT_PATTERNS[beatPatternEl.value]?.name || "Straight (4/4)";
  beatsLabelEl.textContent = on ? `on · ${pat}` : "off";
}
function updateDroneLabel() {
  droneLabelEl.textContent = (droneOnEl.value === "on") ? droneModeEl.value : "off";
}
updateBeatsLabel();
updateDroneLabel();

beatsOnEl.addEventListener("change", updateBeatsLabel);
beatPatternEl.addEventListener("change", updateBeatsLabel);
droneOnEl.addEventListener("change", updateDroneLabel);
droneModeEl.addEventListener("change", updateDroneLabel);

// ---------- MediaPipe ----------
let handLandmarker = null;
let landmarkerReady = false;

const VERSION = "0.10.22-rc.20250304";
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODEL_PATH = "/static/models/hand_landmarker.task";

async function initLandmarker() {
  if (landmarkerReady) return;
  camStatus.textContent = "Loading hand model…";
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_PATH },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  landmarkerReady = true;
}

// ---------- camera ----------
let cameraStream = null;
let cameraStarted = false;
let loopRunning = false;

async function startCamera() {
  if (cameraStarted) return;

  startCamBtn.disabled = true;
  camStatus.textContent = "Webcam: requesting permission…";

  try {
    await initLandmarker();

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("getUserMedia not supported in this browser");
    }

    cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    videoEl.srcObject = cameraStream;
    await videoEl.play();

    cameraStarted = true;
    camStatus.textContent = "Webcam: running";
    startCamBtn.textContent = "Stop Camera";
    startCamBtn.disabled = false;

    applyMirror();
    if (!loopRunning) {
      loopRunning = true;
      requestAnimationFrame(loop);
    }
  } catch (e) {
    console.error("startCamera failed:", e);
    camStatus.textContent =
      `Webcam start failed: ${e?.name || "Error"} ${e?.message || ""}\n` +
      `Tip: run on HTTPS or localhost.\n` +
      `Model path: ${MODEL_PATH}`;
    startCamBtn.disabled = false;
  }
}

function stopCamera() {
  if (!cameraStarted) return;
  if (cameraStream) for (const t of cameraStream.getTracks()) t.stop();
  cameraStream = null;
  videoEl.srcObject = null;

  cameraStarted = false;
  camStatus.textContent = "Webcam: stopped";
  startCamBtn.textContent = "Start Camera";

  clearOverlay();
  if (audio.ctx) { audio.noteOff(0); audio.noteOff(1); }
  resetHandStates();
}

startCamBtn.addEventListener("click", async () => {
  if (cameraStarted) stopCamera();
  else await startCamera();
});

// ---------- audio Start/Stop toggle ----------
startAudioBtn.addEventListener("click", async () => {
  try {
    if (!audio.ctx) {
      startAudioBtn.disabled = true;
      audioStatus.textContent = "Audio: starting…";
      await audio.start();
      audioStatus.textContent = "Audio: running";
      startAudioBtn.textContent = "Stop Audio";
      startAudioBtn.disabled = false;
    } else {
      startAudioBtn.disabled = true;
      audioStatus.textContent = "Audio: stopping…";
      await audio.stop();
      audioStatus.textContent = "Audio: not started";
      startAudioBtn.textContent = "Start Audio";
      startAudioBtn.disabled = false;
    }
  } catch (e) {
    console.error(e);
    audioStatus.textContent = `Audio failed: ${e?.name || "Error"} ${e?.message || ""}`;
    startAudioBtn.disabled = false;
  }
});

// ---------- two-hand state ----------
const handState = {
  L: { smooth: smoothPointFactory(), stableMidi: null, stableCount: 0, hoverMidi: null, pinch: false },
  R: { smooth: smoothPointFactory(), stableMidi: null, stableCount: 0, hoverMidi: null, pinch: false },
};

function resetHandStates() {
  for (const k of ["L","R"]) {
    handState[k].stableMidi = null;
    handState[k].stableCount = 0;
    handState[k].hoverMidi = null;
    handState[k].pinch = false;
  }
  noteLabelLEl.textContent = "—";
  noteLabelREl.textContent = "—";
  playLabelLEl.textContent = "—";
  playLabelREl.textContent = "—";
}

// ---------- play loop ----------
let lastFrameTs = 0;

async function loop(ts) {
  requestAnimationFrame(loop);
  if (!cameraStarted || !landmarkerReady || !handLandmarker) return;

  const maxFps = parseInt(maxFpsEl.value, 10);
  const minDt = 1000 / Math.max(1, maxFps);
  if (ts - lastFrameTs < minDt) return;
  lastFrameTs = ts;

  let result;
  try {
    result = handLandmarker.detectForVideo(videoEl, ts);
  } catch (e) {
    console.warn("detectForVideo failed:", e);
    return;
  }

  clearOverlay();

  const circles = buildKeyboardCircles();

  const handsRaw = Array.isArray(result?.landmarks) ? result.landmarks : [];
  if (handsRaw.length === 0) {
    drawKeyboard(circles, [audio.playingMidi[0], audio.playingMidi[1]], [null, null]);

    if (audio.ctx && droneOnEl.value === "on") audio.droneOn(0.55);
    else if (audio.ctx) audio.droneOff();

    if (audio.ctx) { audio.noteOff(0); audio.noteOff(1); }
    resetHandStates();
    return;
  }

  const mappedHands = handsRaw.map(lms0 => {
    const lms = lms0.map(p => mapPointerForMirror(p));
    const cx = lms[0]?.x ?? lms[8]?.x ?? 0.5;
    return { lms, cx };
  }).sort((a, b) => a.cx - b.cx);

  const handL = mappedHands[0] || null;
  const handR = mappedHands[1] || null;

  function processHand(hand, stateKey, handColor) {
    const st = handState[stateKey];

    if (!hand) {
      st.hoverMidi = null;
      st.pinch = false;
      st.stableMidi = null;
      st.stableCount = 0;
      return { brightness01: 0.55 };
    }

    const lms = hand.lms;

    const pointerRaw = { x: lms[8].x, y: lms[8].y };
    const pointer = st.smooth(pointerRaw);

    const pinchTh = Number(pinchThEl.value);
    const pinch = dist(lms[4], lms[8]) < pinchTh;

    const brightness01 = 1 - clamp01(pointer.y);
    const px = pointer.x * W;
    const py = pointer.y * H;

    const touched = findTouchedCircle(px, py, circles);
    const hoverMidi = touched ? touched.midi : null;

    if (hoverMidi === st.stableMidi) st.stableCount++;
    else { st.stableMidi = hoverMidi; st.stableCount = 0; }
    const stableHoverMidi = (st.stableCount >= 1) ? st.stableMidi : null;

    st.hoverMidi = stableHoverMidi;
    st.pinch = pinch;

    const viz = handVizEl.value;
    if (viz === "cursor") drawCursor(pointer.x, pointer.y, pinch, handColor);
    else if (viz === "points") drawPoints(lms, pinch, handColor);

    return { brightness01 };
  }

  const infoL = processHand(handL, "L", "rgba(0,229,255,1)");
  const infoR = processHand(handR, "R", "rgba(255,120,220,1)");

  const droneBrightness = handL ? infoL.brightness01 : (handR ? infoR.brightness01 : 0.55);
  if (audio.ctx && droneOnEl.value === "on") audio.droneOn(droneBrightness);
  else if (audio.ctx) audio.droneOff();

  drawKeyboard(
    circles,
    [audio.playingMidi[0], audio.playingMidi[1]],
    [handState.L.hoverMidi, handState.R.hoverMidi]
  );

  drawHUD(
    `Pinch on circles to play | L: ${handState.L.hoverMidi != null ? midiNameMicro(handState.L.hoverMidi) : "—"} | ` +
    `R: ${handState.R.hoverMidi != null ? midiNameMicro(handState.R.hoverMidi) : "—"} | ` +
    `Beat: ${BEAT_PATTERNS[beatPatternEl.value]?.name || "Straight"}`
  );

  noteLabelLEl.textContent = handState.L.hoverMidi != null ? midiNameMicro(handState.L.hoverMidi) : "—";
  noteLabelREl.textContent = handState.R.hoverMidi != null ? midiNameMicro(handState.R.hoverMidi) : "—";

  function applyVoice(handKey, voiceIdx, brightness01) {
    const st = handState[handKey];
    const midi = st.hoverMidi;

    if (st.pinch && midi != null) {
      if (!audio.ctx) {
        audioStatus.textContent = "Audio: click Start Audio first";
        return;
      }

      if (!audio.playing[voiceIdx]) audio.noteOn(voiceIdx, midi, brightness01);
      else audio.noteUpdate(voiceIdx, midi, brightness01);
    } else {
      if (audio.ctx && audio.playing[voiceIdx]) audio.noteOff(voiceIdx);
    }
  }

  applyVoice("L", 0, infoL.brightness01);
  applyVoice("R", 1, infoR.brightness01);

  playLabelLEl.textContent = audio.playingMidi[0] != null ? midiNameMicro(audio.playingMidi[0]) : "—";
  playLabelREl.textContent = audio.playingMidi[1] != null ? midiNameMicro(audio.playingMidi[1]) : "—";
}

// ---------- init ----------
(function main() {
  resizeCanvas();
  camStatus.textContent = "Webcam: not started";
  audioStatus.textContent = "Audio: not started";
  startCamBtn.textContent = "Start Camera";
  startAudioBtn.textContent = "Start Audio";
  applyMirror();
  updateBeatsLabel();
  updateDroneLabel();
  resetHandStates();
})();
