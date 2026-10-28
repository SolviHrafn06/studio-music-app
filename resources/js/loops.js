// Built-in loop library: drum grooves, chord progressions, bass lines and melodies that follow the song key.

const DRUM_LOOPS = [
  { name: 'Boom Bap', genre: 'Hip-Hop', kit: 'Classic', bpm: 90, s: { kick: 'x......x.x......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.xo' } },
  { name: 'Trap Bounce', genre: 'Trap', kit: 'Trap', bpm: 140, s: { kick: 'x......x..x.....', snare: '........x.......', hat: 'x.x.x.x.x3x.x.2x', ohat: '..............x.', '808': 'x.........x.....' } },
  { name: 'Trap Rolls', genre: 'Trap', kit: 'Trap', bpm: 145, s: { kick: 'x.....x.......x.', snare: '........x.......', hat: 'x2x.x.x3x.x.4.x.', '808': 'x.....x.......x.' } },
  { name: 'Four on the Floor', genre: 'House', kit: 'House', bpm: 124, s: { kick: 'x...x...x...x...', clap: '....x.......x...', ohat: '..x...x...x...x.', hat: 'oooooooooooooooo' } },
  { name: 'Deep House', genre: 'House', kit: 'House', bpm: 122, s: { kick: 'x...x...x...x...', rim: '...x.....x...x..', ohat: '..x...x...x...x.', shaker: 'xoxoxoxoxoxoxoxo' } },
  { name: 'Lo-fi Chill', genre: 'Lo-fi', kit: 'Lo-fi', bpm: 82, s: { kick: 'x.....x...x.....', snare: '....x.......x..o', hat: 'x.xox.xox.xox.xo' } },
  { name: 'Dembow', genre: 'Reggaeton', kit: '808', bpm: 95, s: { kick: 'x...x...x...x...', snare: '...x..x....x..x.', hat: 'x.x.x.x.x.x.x.x.' } },
  { name: 'Pop Rock', genre: 'Pop', kit: 'Classic', bpm: 118, s: { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', crash: 'x...............' } },
  { name: 'Synth Pop', genre: 'Pop', kit: '909', bpm: 112, s: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', clap: '....x.......x...' } },
  { name: 'Funk', genre: 'Funk', kit: 'Classic', bpm: 105, s: { kick: 'x..x..x...x.x...', snare: '....x..o.o..x..o', hat: 'xoxoxoxoxoxoxoxo' } },
  { name: 'Disco', genre: 'Disco', kit: '909', bpm: 120, s: { kick: 'x...x...x...x...', snare: '....x.......x...', ohat: '..x...x...x...x.', hat: 'o.o.o.o.o.o.o.o.' } },
  { name: 'Afrobeats', genre: 'Afro', kit: '808', bpm: 105, s: { kick: 'x..x..x...x..x..', rim: '..x..x....x..x..', shaker: 'xoxoxoxoxoxoxoxo', perc: '...x.......x....' } },
  { name: 'Drum & Bass', genre: 'DnB', kit: '909', bpm: 172, s: { kick: 'x.........x.....', snare: '....x..o....x...', hat: 'x.x.x.x.x.x.x.x.' } },
  { name: 'Drill', genre: 'Drill', kit: 'Trap', bpm: 142, s: { kick: 'x.....x.........', snare: '......x.......x.', hat: 'x..x..x.x..x..x.', '808': 'x.....x...x.....' } },
  { name: 'Rock Half-time', genre: 'Rock', kit: 'Classic', bpm: 80, s: { kick: 'x.x.......x.....', snare: '........x.......', ohat: 'x.x.x.x.x.x.x.x.' } },
];

const CHORD_LOOPS = [
  { name: 'Pop Anthem (I–V–vi–IV)', deg: [0, 4, 5, 3] },
  { name: 'Emotional (vi–IV–I–V)', deg: [5, 3, 0, 4] },
  { name: 'Doo-wop (I–vi–IV–V)', deg: [0, 5, 3, 4] },
  { name: 'Royal Road (IV–V–iii–vi)', deg: [3, 4, 2, 5] },
  { name: 'Jazz ii–V–I', deg: [1, 4, 0, 0], sev: true },
  { name: 'Lo-fi 7ths (ii–V–I–vi)', deg: [1, 4, 0, 5], sev: true },
  { name: 'Dark (i–VI–III–VII)', deg: [0, 5, 2, 6], minor: true },
  { name: 'Epic (i–VII–VI–VII)', deg: [0, 6, 5, 6], minor: true },
  { name: 'Andalusian (i–VII–VI–V)', deg: [0, 6, 5, 4], minor: true },
  { name: 'Trap Minor (i–iv–VI–V)', deg: [0, 3, 5, 4], minor: true },
];
const CHORD_STYLES = ['Sustained', 'Stabs', 'Arpeggio', 'Pulse'];
const BASS_STYLES = ['Roots', 'Eighths', 'Octaves', '808 Slides', 'Walking'];
const MELODY_IDEAS = [
  { name: 'Hook A', d: [4, 4, 5, 4, 2, 0, 1, 2], r: [2, 2, 2, 2, 2, 2, 2, 2] },
  { name: 'Hook B', d: [0, 2, 4, 7, 6, 4, 2, 4], r: [3, 1, 2, 2, 3, 1, 2, 2] },
  { name: 'Call & Response', d: [7, 6, 4, -9, 4, 5, 4, 2], r: [2, 2, 4, 8, 2, 2, 2, 2] },
  { name: 'Rising', d: [0, 1, 2, 4, 2, 4, 5, 7], r: [2, 2, 2, 2, 2, 2, 2, 2] },
  { name: 'Pentatonic Riff', d: [0, 2, 4, 2, 5, 4, 2, 0], r: [1, 1, 2, 1, 1, 2, 2, 6] },
];

function scaleList(P) {
  const s = SCALES[P.scale] || SCALES.Major;
  return s.length >= 7 ? s : SCALES[/Minor|Blues/.test(P.scale) ? 'Minor' : 'Major'];
}
function degPitch(P, d, base) {
  const sc = scaleList(P), len = sc.length;
  const o = Math.floor(d / len), i = ((d % len) + len) % len;
  return base + P.key + sc[i] + 12 * o;
}
function buildChord(P, d, sev, center) {
  const notes = [0, 2, 4].concat(sev ? [6] : []).map((k) => degPitch(P, d + k, 48));
  // voice near the center pitch
  return notes.map((p) => { while (p < center - 7) p += 12; while (p > center + 6) p -= 12; return p; }).sort((a, b) => a - b);
}

function makeChordLoop(P, item, style) {
  const notes = [];
  const center = 62;
  item.deg.forEach((d, bar) => {
    const ch = buildChord(P, d, item.sev, center);
    const b0 = bar * 16;
    if (style === 'Sustained') ch.forEach((p) => notes.push({ p, s: b0, d: 16, v: 0.7 }));
    else if (style === 'Stabs') [2, 6, 10, 14].forEach((s) => ch.forEach((p) => notes.push({ p, s: b0 + s, d: 1.5, v: 0.75 })));
    else if (style === 'Pulse') for (let s = 0; s < 16; s += 2) ch.forEach((p) => notes.push({ p, s: b0 + s, d: 1.6, v: s % 4 ? 0.6 : 0.8 }));
    else { const seq = [ch[0], ch[1], ch[2], ch[1] + 0, ch[0] + 12, ch[2], ch[1], ch[2]]; for (let k = 0; k < 8; k++) notes.push({ p: seq[k], s: b0 + k * 2, d: 2, v: 0.7 }); }
  });
  return { notes, length: item.deg.length * 4 };
}
function makeBassLoop(P, item, style) {
  const notes = [];
  item.deg.forEach((d, bar) => {
    let r = degPitch(P, d, 36);
    if (r > 47) r -= 12;
    const b0 = bar * 16;
    if (style === 'Roots') notes.push({ p: r, s: b0, d: 15, v: 0.9 });
    else if (style === 'Eighths') for (let s = 0; s < 16; s += 2) notes.push({ p: r, s: b0 + s, d: 1.8, v: s % 4 ? 0.7 : 0.9 });
    else if (style === 'Octaves') for (let s = 0; s < 16; s += 2) notes.push({ p: r + (s % 4 ? 12 : 0), s: b0 + s, d: 1.8, v: 0.85 });
    else if (style === '808 Slides') [[0, 6], [7, 3], [10, 6]].forEach(([s, dd]) => notes.push({ p: r, s: b0 + s, d: dd, v: 0.9 }));
    else { const nx = degPitch(P, item.deg[(bar + 1) % item.deg.length], 36); const w = [r, degPitch(P, d + 2, 36), degPitch(P, d + 4, 36), nx - 1]; w.forEach((p, k) => notes.push({ p: p > 50 ? p - 12 : p, s: b0 + k * 4, d: 3.8, v: 0.85 })); }
  });
  return { notes, length: item.deg.length * 4 };
}
function makeMelody(P, m) {
  const notes = [];
  let s = 0;
  for (let rep = 0; rep < 2; rep++) {
    m.d.forEach((d, i) => {
      const dd = rep && i === m.d.length - 1 ? d - 2 : d;
      notes.push({ p: degPitch(P, dd, 60), s, d: m.r[i] * 0.9, v: 0.75 });
      s += m.r[i];
    });
  }
  return { notes, length: Math.ceil(s / 16) * 4 };
}
function drumLoopPattern(tr, loop) {
  const pat = { name: loop.name, len: 16, steps: {} };
  for (const [kind, str] of Object.entries(loop.s)) {
    let ch = tr.channels.find((c) => c.kind === kind && !c.sample);
    if (!ch) {
      const k = DRUM_KIT.find((d) => d.id === kind);
      ch = { id: 'c' + Math.random().toString(36).slice(2, 8), kind, name: k ? k.name : kind, vol: 0.8, mute: false, sample: null, pitch: 0 };
      tr.channels.push(ch);
    }
    pat.steps[ch.id] = str.split('').map((c) => (c === 'x' ? 1 : c === 'o' ? 0.5 : /[234]/.test(c) ? +c : 0));
  }
  return pat;
}
