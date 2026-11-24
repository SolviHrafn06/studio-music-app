// Song Generator: builds a complete, arranged song (sections, drums, bass, chords, melody, FX, mix)
// from a genre + mood. Everything is ordinary Studio tracks/clips, so the result can be edited freely.

const GEN = {
  GENRES: {
    'Dubstep': { bpm: [150, 160], kit: 'Trap', form: 'edm', scale: 'Minor', swing: 0 },
    'Riddim / Brostep': { bpm: [145, 150], kit: 'Trap', form: 'edm', scale: 'Minor', swing: 0 },
    'Trap': { bpm: [136, 150], kit: 'Trap', form: 'trap', scale: 'Minor', swing: 0 },
    'House': { bpm: [122, 126], kit: 'House', form: 'house', scale: 'Minor', swing: 0.12 },
    'Drum & Bass': { bpm: [172, 176], kit: '909', form: 'edm', scale: 'Minor', swing: 0 },
    'Lo-fi': { bpm: [74, 88], kit: 'Lo-fi', form: 'lofi', scale: 'Major', swing: 0.35 },
    'Pop': { bpm: [100, 124], kit: 'Classic', form: 'pop', scale: 'Major', swing: 0 },
    'Synthwave': { bpm: [96, 112], kit: '909', form: 'pop', scale: 'Minor', swing: 0 },
  },
  MOODS: ['Auto', 'Dark', 'Hype', 'Happy', 'Chill', 'Epic'],
  LENGTHS: { 'Short (~1 min)': 0, 'Normal (~2 min)': 1, 'Long (~3 min)': 2 },
  KEYS: ['Auto', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
  last: { genre: 'Dubstep', mood: 'Auto', key: 'Auto', bpm: 0, length: 'Normal (~2 min)', vocals: true, seed: 0 },
};

const GEN_PATCH = (o) => P(o); // synth.js patch builder (P is reused as a variable name below)

// ---------- tiny seeded random ----------
function genRng(seed) {
  let a = seed >>> 0;
  const r = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  return r;
}

// ---------- song forms (sections with energy 0..3) ----------
function genForm(form, len, rnd) {
  const S = (name, bars, e, kind) => ({ name, bars, e, kind });
  let F;
  if (form === 'edm') {
    F = [S('Intro', 8, 1, 'intro'), S('Build', 8, 2, 'build'), S('Drop', 16, 3, 'drop'), S('Break', 8, 1, 'break'), S('Build 2', 8, 2, 'build'), S('Drop 2', 16, 3, 'drop'), S('Outro', 4, 1, 'outro')];
    if (len === 0) F = [S('Intro', 4, 1, 'intro'), S('Build', 8, 2, 'build'), S('Drop', 16, 3, 'drop'), S('Outro', 4, 1, 'outro')];
    if (len === 2) F.splice(6, 0, S('Break 2', 8, 1, 'break'), S('Build 3', 8, 2, 'build'), S('Drop 3', 16, 3, 'drop'));
  } else if (form === 'trap') {
    F = [S('Intro', 4, 1, 'intro'), S('Hook', 8, 3, 'drop'), S('Verse', 16, 2, 'verse'), S('Hook 2', 8, 3, 'drop'), S('Verse 2', 8, 2, 'verse'), S('Hook 3', 8, 3, 'drop'), S('Outro', 4, 1, 'outro')];
    if (len === 0) F = [S('Intro', 4, 1, 'intro'), S('Hook', 8, 3, 'drop'), S('Verse', 8, 2, 'verse'), S('Hook 2', 8, 3, 'drop'), S('Outro', 4, 1, 'outro')];
    if (len === 2) F.splice(6, 0, S('Bridge', 8, 1, 'break'), S('Hook 4', 8, 3, 'drop'));
  } else if (form === 'house') {
    F = [S('Intro', 8, 1, 'intro'), S('Groove', 16, 2, 'verse'), S('Break', 8, 1, 'break'), S('Build', 8, 2, 'build'), S('Drop', 16, 3, 'drop'), S('Outro', 8, 1, 'outro')];
    if (len === 0) F = [S('Intro', 4, 1, 'intro'), S('Groove', 8, 2, 'verse'), S('Build', 4, 2, 'build'), S('Drop', 16, 3, 'drop'), S('Outro', 4, 1, 'outro')];
    if (len === 2) F.splice(5, 0, S('Break 2', 8, 1, 'break'), S('Build 2', 8, 2, 'build'), S('Drop 2', 16, 3, 'drop'));
  } else if (form === 'lofi') {
    F = [S('Intro', 4, 0, 'intro'), S('A', 8, 1, 'verse'), S('B', 8, 2, 'chorus'), S('A2', 8, 1, 'verse'), S('B2', 8, 2, 'chorus'), S('Outro', 4, 0, 'outro')];
    if (len === 0) F = [S('Intro', 2, 0, 'intro'), S('A', 8, 1, 'verse'), S('B', 8, 2, 'chorus'), S('Outro', 4, 0, 'outro')];
    if (len === 2) F.splice(5, 0, S('A3', 8, 1, 'verse'), S('B3', 8, 2, 'chorus'));
  } else {
    F = [S('Intro', 4, 1, 'intro'), S('Verse', 8, 1, 'verse'), S('Pre-Chorus', 4, 2, 'build'), S('Chorus', 8, 3, 'chorus'), S('Verse 2', 8, 1, 'verse'), S('Pre-Chorus 2', 4, 2, 'build'), S('Chorus 2', 8, 3, 'chorus'), S('Bridge', 8, 1, 'break'), S('Final Chorus', 8, 3, 'chorus'), S('Outro', 4, 1, 'outro')];
    if (len === 0) F = [S('Intro', 4, 1, 'intro'), S('Verse', 8, 1, 'verse'), S('Pre-Chorus', 4, 2, 'build'), S('Chorus', 8, 3, 'chorus'), S('Outro', 4, 1, 'outro')];
    if (len === 2) F.splice(8, 0, S('Final Chorus', 8, 3, 'chorus'));
  }
  let bar = 0;
  for (const s of F) { s.bar = bar; bar += s.bars; }
  return F;
}

// ---------- harmony ----------
const GEN_PROGS = {
  Minor: [[0, 5, 2, 6], [0, 6, 5, 6], [0, 3, 6, 5], [0, 5, 3, 4], [5, 6, 0, 0], [0, 0, 5, 6], [0, 3, 0, 4], [0, 2, 5, 6]],
  Major: [[0, 4, 5, 3], [0, 5, 3, 4], [3, 4, 0, 5], [0, 3, 4, 3], [5, 3, 0, 4], [0, 2, 3, 4], [3, 0, 4, 5]],
};
function genHarmony(P, rnd) {
  const sc = SCALES[P.scale] || SCALES.Minor;
  const deg = (d, base) => base + 12 * Math.floor(d / 7) + sc[((d % 7) + 7) % 7];
  return {
    sc, deg,
    root: (d, oct) => deg(d, 12 * (oct + 1) + P.key),               // oct 1 = C1.. (MIDI 24 + key)
    chord: (d, top = 72, seventh = false) => {                        // close voicing below `top`
      const ns = [0, 2, 4].concat(seventh ? [6] : []).map((i) => deg(d + i, 48 + P.key));
      return ns.map((n) => { while (n > top) n -= 12; while (n < top - 14) n += 12; return n; }).sort((a, b) => a - b);
    },
    tones: (d) => [0, 2, 4].map((i) => ((sc[((d + i) % 7 + 7) % 7]) + P.key) % 12),
  };
}

// ---------- drum grooves ----------
function genGroove(genre, kind, e, rnd, v) {
  // returns {kind: '16-char string'} ; v = variation 0..3
  const H8 = 'x.x.x.x.x.x.x.x.', H16 = 'xoxoxoxoxoxoxoxo';
  const pick = (arr) => arr[v % arr.length];
  if (genre === 'Dubstep' || genre === 'Riddim / Brostep') {
    if (kind === 'drop') return { kick: pick(['x.........x..x..', 'x.....x...x.....', 'x..x......x.....', 'x.........x.x...']), snare: '........x.......', clap: '........x.......', hat: pick([H16, 'x.xox.xox.xox.xo', 'xoxoxoxoxoxo3x4x']) };
    if (kind === 'break' || kind === 'intro') return e === 0 ? { hat: H8 } : { kick: 'x.........x.....', hat: H8, rim: '....x.......x...' };
    return { kick: 'x.......x.......', hat: H8 };
  }
  if (genre === 'Trap') {
    const kicks = ['x......x..x.....', 'x.....x...x..x..', 'x..x......x.....', 'x......x.x......'];
    const hats = ['xxxxxxxxxxxxxxxx', 'x.x.x.x.x.x.3.x.', 'xxxx3xxxxxxx4.x.', 'x.xxx.x.x.x.x4x.', 'xxxxxxxx3.3.4444'];
    if (kind === 'drop' || kind === 'verse') return { kick: pick(kicks), '808': '', snare: '........x.......', clap: '........x.......', hat: hats[(v + (kind === 'drop' ? 1 : 0)) % hats.length], ohat: kind === 'drop' && v % 2 ? '..............x.' : '' };
    if (kind === 'break') return { hat: 'x...x...x...x...', snare: '........x.......' };
    return { hat: 'x.x.x.x.x.x.x.x.' };
  }
  if (genre === 'House') {
    if (e >= 2) return { kick: 'x...x...x...x...', clap: '....x.......x...', ohat: '..x...x...x...x.', hat: e === 3 ? H16 : '', shaker: e === 3 ? 'oxoxoxoxoxoxoxox' : '', perc: v % 2 ? '...x......x.....' : '' };
    if (kind === 'break') return { hat: '..x...x...x...x.', shaker: 'oxoxoxoxoxoxoxox' };
    return { kick: 'x...x...x...x...', hat: '..x...x...x...x.' };
  }
  if (genre === 'Drum & Bass') {
    if (kind === 'drop') return { kick: pick(['x.........x.....', 'x.x.......x.....', 'x.........x..x..', 'x.......x.x.....']), snare: '....x.......x...', hat: pick([H8, 'x.xxx.x.x.xxx.x.']), ohat: '..............x.', shaker: 'oooooooooooooooo' };
    if (kind === 'break' || kind === 'intro') return e === 0 ? {} : { hat: H8, rim: '....x.......x...' };
    return { kick: 'x.........x.....', snare: '....x.......x...', hat: H8 };
  }
  if (genre === 'Lo-fi') {
    if (e === 0) return { hat: 'x...x...x...x...', shaker: '' };
    return { kick: pick(['x......x..x.....', 'x.....x...x.....', 'x......x.xx.....']), snare: '....x.......x...', hat: e === 2 ? H8 : 'x.x.x.x.x.x.x.x.', rim: e === 2 && v % 2 ? '.......x........' : '' };
  }
  if (genre === 'Synthwave') {
    if (e >= 2) return { kick: 'x...x...x...x...', snare: '....x.......x...', clap: e === 3 ? '....x.......x...' : '', hat: H8, ohat: '..x...x...x...x.' };
    return { kick: 'x.......x.......', hat: H8 };
  }
  // Pop
  if (e >= 3) return { kick: pick(['x...x...x...x...', 'x..x..x.x...x...']), snare: '....x.......x...', clap: '....x.......x...', hat: H8, ohat: '..............x.' };
  if (e === 2) return { kick: 'x...x...x...x...', snare: '....x.......x...', hat: H8 };
  return { kick: 'x.......x.......', rim: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' };
}
const GEN_ROLLS = [{ snare: 'x...x...x...x...' }, { snare: 'x.x.x.x.x.x.x.x.' }, { snare: 'xxxxxxxxxxxxxxxx' }, { snare: '222233334444....' }];

// ---------- melody motif ----------
function genMotif(rnd, density) {
  // one bar rhythm: list of [step, len]
  const out = [];
  let s = 0;
  while (s < 16) {
    const r = rnd();
    const len = r < density * 0.5 ? 1 : r < density ? 2 : r < density + 0.25 ? 3 : 4;
    if (rnd.chance(0.78) || s === 0) out.push([s, Math.min(len, 16 - s)]);
    s += len;
  }
  return out;
}
function genMelodyPhrase(H, prog, motif, rnd, lo, hi, barsPerChord) {
  // 4-chord phrase -> notes; strong steps land on chord tones, weak steps move by step
  const notes = [];
  const scalePcs = H.sc.map((x) => (x + GEN.cur.key) % 12);
  const inScale = (n) => scalePcs.includes(((n % 12) + 12) % 12);
  const near = (n, set) => { let best = n, bd = 99; for (let m = n - 7; m <= n + 7; m++) if (set.includes(((m % 12) + 12) % 12) && m >= lo && m <= hi && Math.abs(m - n) < bd) { bd = Math.abs(m - n); best = m; } return best; };
  let prev = Math.round((lo + hi) / 2);
  const bars = prog.length * barsPerChord;
  for (let b = 0; b < bars; b++) {
    const d = prog[Math.floor(b / barsPerChord)];
    const tones = H.tones(d);
    const ending = b === bars - 1;
    const rh = ending && rnd.chance(0.6) ? [[0, 2], [2, 2], [4, 8]] : motif;
    for (const [s, len] of rh) {
      let n;
      if (s % 4 === 0 || ending) n = near(prev + rnd.pick([-2, 0, 2, 3, -3]), tones);
      else { n = prev + rnd.pick([-2, -1, 1, 2, 2, -2, 3]); while (!inScale(n)) n += 1; }
      n = Math.max(lo, Math.min(hi, n));
      notes.push({ p: n, s: b * 16 + s, d: len * 0.95, v: 0.75 + rnd() * 0.2 });
      prev = n;
    }
  }
  return notes;
}

// ---------- build the project ----------
function generateSong(opts) {
  const seed = opts.seed || (Math.random() * 1e9) >>> 0;
  const rnd = genRng(seed);
  const G = GEN.GENRES[opts.genre] || GEN.GENRES.Dubstep;
  const genre = opts.genre;
  let mood = opts.mood === 'Auto' ? rnd.pick(genre === 'Lo-fi' ? ['Chill', 'Happy', 'Dark'] : genre === 'Pop' ? ['Happy', 'Epic', 'Chill'] : ['Dark', 'Hype', 'Epic']) : opts.mood;
  const P = blankProject();
  P.scale = mood === 'Happy' ? 'Major' : mood === 'Dark' || mood === 'Hype' ? 'Minor' : mood === 'Chill' ? (rnd.chance(0.5) ? 'Major' : 'Minor') : G.scale;
  P.key = opts.key && opts.key !== 'Auto' ? GEN.KEYS.indexOf(opts.key) - 1 : rnd.int(0, 11);
  P.bpm = opts.bpm ? Math.round(opts.bpm) : rnd.int(G.bpm[0], G.bpm[1]);
  GEN.cur = P;
  const H = genHarmony(P, rnd);
  const form = genForm(G.form, GEN.LENGTHS[opts.length] ?? 1, rnd);
  const totalBars = form[form.length - 1].bar + form[form.length - 1].bars;
  P.markers = form.map((s) => ({ b: s.bar * 4, name: s.name }));
  P.loop = { on: false, start: 0, end: totalBars * 4 };
  const progA = rnd.pick(GEN_PROGS[P.scale]), progB = rnd.chance(0.5) ? progA : rnd.pick(GEN_PROGS[P.scale]);
  const progFor = (s) => (s.kind === 'verse' || s.kind === 'break' ? progB : progA);
  const ST = (bar) => bar * 4;
  const edm = ['Dubstep', 'Riddim / Brostep', 'Drum & Bass', 'House', 'Trap'].includes(genre);
  const clip = (tr, bar, bars, notes, name) => { if (notes.length) tr.clips.push({ id: uid(), start: ST(bar), length: bars * 4, notes, name }); };
  const synthTrack = (name, inst, vol, rev = 0.15) => { const t = makeTrack('synth', P); t.name = name; t.inst = inst; t.volume = vol; t.rev = rev; return t; };
  const custom = (name, over) => ({ kind: 'synth', name, patch: GEN_PATCH(over) });
  const tracks = [];

  // ===== DRUMS =====
  const dr = makeTrack('drums', P);
  dr.name = 'Drums'; dr.kit = G.kit; dr.channels = []; dr.patterns = []; dr.volume = 0.85; dr.swing = G.swing; dr.rev = 0.08;
  dr.fx.push(newFx('comp', { thr: -14, ratio: 3, att: 12, makeup: 2 }));
  const patIdx = new Map();
  const usePat = (name, map) => {
    const key = JSON.stringify(map);
    if (!patIdx.has(key)) { dr.patterns.push(drumLoopPattern(dr, { name, s: Object.fromEntries(Object.entries(map).filter(([, v]) => v)) })); patIdx.set(key, dr.patterns.length - 1); }
    return patIdx.get(key);
  };
  const dclip = (bar, p) => dr.clips.push({ id: uid(), start: ST(bar), length: 4, pattern: p, off: 0 });
  form.forEach((s, si) => {
    const next = form[si + 1];
    for (let i = 0; i < s.bars; i++) {
      const bar = s.bar + i, last = i === s.bars - 1;
      if (s.kind === 'build' && edm) {                               // snare roll that speeds up
        const q = Math.min(3, Math.floor((i / s.bars) * 4));
        const roll = Object.assign({}, GEN_ROLLS[q], q < 2 ? { hat: 'x.x.x.x.x.x.x.x.' } : {}, i === 0 ? { crash: 'x...............' } : {});
        dclip(bar, usePat('Build roll ' + (q + 1), roll));
        continue;
      }
      const g = Object.assign({}, genGroove(genre, s.kind, s.e, rnd, Math.floor(i / 2) % 4));
      if (i === 0 && s.e >= 2) g.crash = 'x...............';
      if (last && next && next.e > s.e && s.kind !== 'build') g.snare = (g.snare || '................').slice(0, 12) + 'x234'.replace('x', 'x');
      else if (i % 4 === 3 && s.e >= 2 && rnd.chance(0.5)) g.tom = '............x.x.';
      if (s.kind === 'outro' && i >= s.bars - 1) { g.kick = 'x...............'; g.crash = 'x...............'; delete g.hat; delete g.snare; delete g.clap; }
      if (Object.values(g).some(Boolean)) dclip(bar, usePat(s.name + ' ' + ((i % 4) + 1), g));
    }
  });
  if (dr.channels.find((c) => c.kind === 'hat')) dr.channels.find((c) => c.kind === 'hat').vol = 0.55;
  if (dr.channels.find((c) => c.kind === 'crash')) dr.channels.find((c) => c.kind === 'crash').vol = 0.6;
  tracks.push(dr);
  const sc = (thr = -28, ratio = 6) => newFx('scomp', { src: dr.id, thr, ratio, att: 2, rel: 140 });

  // ===== BASS =====
  const subT = synthTrack('Sub', custom('Sub', { osc: [{ wave: 'sine', level: 1 }], filter: { cutoff: 300, env: 0, key: 0 }, amp: { a: 0.004, d: 0.1, s: 1, r: 0.08 }, mono: true, glide: 0.04, gain: 1 }), 0.75, 0);
  subT.fx.push(newFx('eq', { lp: 160 }));
  if (edm) subT.fx.push(sc(-26, 3));
  let bassT;
  const bassStyle = genre === 'Dubstep' || genre === 'Riddim / Brostep' ? rnd.pick(['wah', 'wah', 'wobble', 'growl']) : genre;
  if (bassStyle === 'wah') {
    bassT = synthTrack('BWAHH Bass', custom('Bwahh Bass', { osc: [{ wave: 'sawtooth', voices: 3, spread: 18, level: 0.9 }, { on: true, wave: 'square', oct: -1, level: 0.55 }], fm: 0.18, filter: { cutoff: 140, res: 12, env: 4200, key: 0, drive: 2 }, fenv: { a: 0.08, d: 0.3, s: 0.18, r: 0.07 }, amp: { a: 0.003, d: 0.2, s: 0.95, r: 0.06 }, penv: { amt: -3, time: 0.05 }, mono: true, glide: 0.02, gain: 0.85 }), 0.75, 0.05);
    bassT.fx.push(newFx('sat', { mode: 'Tube', drive: 0.45, mix: 0.7, out: -3 }), newFx('eq', { hp: 85, m1f: 700, m1g: 2 }), sc());
  } else if (bassStyle === 'wobble') {
    bassT = synthTrack('Wobble Bass', presetInst('Wobble Bass'), 0.7, 0.05);
    bassT.fx.push(newFx('filter', { type: 'lowpass', cutoff: 1400, res: 8, lfo: rnd.pick(['1/8', '1/16', '1/8T']), lfoDepth: 0.9 }), newFx('sat', { mode: 'Hard clip', drive: 0.5, mix: 0.8, out: -6 }), newFx('eq', { hp: 90 }), sc());
  } else if (bassStyle === 'growl') {
    bassT = synthTrack('Growl Bass', presetInst('FM Growl'), 0.7, 0.05);
    bassT.fx.push(newFx('filter', { type: 'bandpass', cutoff: 900, res: 4, lfo: '1/16', lfoDepth: 0.6 }), newFx('amp', { model: 'Metal', gain: 0.5, bass: -4, mid: 4, treble: 2, master: 6 }), newFx('eq', { hp: 110 }), sc());
  } else if (genre === 'Trap') {
    bassT = synthTrack('808', presetInst('808 Slide'), 0.68, 0);
    bassT.fx.push(newFx('sat', { mode: 'Tube', drive: 0.35, mix: 0.5, out: -2 }));
  } else if (genre === 'House') {
    bassT = synthTrack('Bass', presetInst(rnd.pick(['Pluck Bass', 'Bass', 'FM Bass'])), 0.65, 0.05);
    bassT.fx.push(newFx('eq', { hp: 40 }), sc(-26, 4));
  } else if (genre === 'Drum & Bass') {
    bassT = synthTrack('Reese', presetInst('Reese Bass'), 0.6, 0.05);
    bassT.fx.push(newFx('chorus', { mix: 0.3, depth: 0.5 }), newFx('sat', { mode: 'Tube', drive: 0.4, mix: 0.6, out: -4 }), newFx('eq', { hp: 70 }), sc());
  } else if (genre === 'Lo-fi') {
    bassT = synthTrack('Bass', presetInst('Electric Bass'), 0.6, 0.05);
    bassT.fx.push(newFx('eq', { lp: 3000 }));
  } else {
    bassT = synthTrack('Bass', presetInst(genre === 'Synthwave' ? 'Bass' : rnd.pick(['Bass', 'Pluck Bass'])), 0.62, 0.05);
    bassT.fx.push(newFx('eq', { hp: 40 }));
  }
  // bass riff motifs
  const wahRiff = () => {        // "BWAHH bap BWAHH bap bap bap ..." style call & response, 2 bars
    const shapes = [
      [['L', 0, 3.5], ['S', 4], ['L', 6, 3.5], ['S', 10], ['S', 11], ['S', 12], ['L', 14, 2], ['B', 16], ['B', 19], ['B', 21], ['L', 28, 2], ['L', 30, 2]],
      [['L', 0, 2], ['L', 3, 2], ['S', 6], ['S', 7], ['L', 8, 4], ['S', 13], ['L', 14, 2], ['B', 16], ['L', 20, 3], ['S', 24], ['S', 26], ['L', 28, 4]],
      [['L', 0, 6], ['S', 8], ['S', 10], ['L', 12, 4], ['B', 16], ['B', 18], ['S', 22], ['L', 24, 3], ['S', 28], ['S', 29], ['S', 30], ['S', 31]],
    ];
    return rnd.pick(shapes);
  };
  const riffShape = wahRiff();
  const riffJumps = riffShape.map((e) => (e[0] === 'L' ? rnd.pick([0, 0, 3, 5, 7, -2, 12]) : 0));
  form.forEach((s) => {
    const prog = progFor(s);
    const bpc = s.bars >= 16 ? 2 : 1;          // bars per chord
    const sub = [], bass = [];
    for (let b = 0; b < s.bars; b++) {
      const d = prog[Math.floor(b / bpc) % prog.length];
      const r1 = H.root(d, 1), r2 = H.root(d, 2);   // ~E1-E2 and an octave up
      const o = b * 16;
      if (s.kind === 'intro' || s.kind === 'outro') { if (s.e >= 1 && !edm) bass.push({ p: r2, s: o, d: 15, v: 0.7 }); continue; }
      if (s.kind === 'build') { if (b >= s.bars - 1) continue; if (!edm) bass.push({ p: r2, s: o, d: 3.5, v: 0.75 }, { p: r2, s: o + 8, d: 3.5, v: 0.75 }); continue; }
      if (genre === 'Dubstep' || genre === 'Riddim / Brostep') {
        if (s.kind !== 'drop') { if (b % 2 === 0) sub.push({ p: r1, s: o, d: 31, v: 0.6 }); continue; }
        if (b % 2) continue;
        riffShape.forEach((e, k) => {
          const [t, st, len] = e;
          if (t === 'B') sub.push({ p: r1, s: o + st, d: 2.5, v: 0.95 });
          else bass.push({ p: r2 + riffJumps[k] * (t === 'L' ? 1 : 0), s: o + st, d: t === 'L' ? len : 1, v: t === 'L' ? 0.95 : 0.8 });
          if (t === 'L') sub.push({ p: r1, s: o + st, d: len, v: 0.9 });
        });
      } else if (genre === 'Trap') {
        // 808 follows the kick, with slides into the next note
        const kicks = [0, 7, 10].concat(rnd.chance(0.4) ? [13] : []);
        kicks.forEach((st, k) => bass.push({ p: k === kicks.length - 1 && rnd.chance(0.35) ? r1 + 12 : r1, s: o + st, d: (kicks[k + 1] ?? 16) - st + (rnd.chance(0.25) ? 1 : 0), v: 0.95 }));
      } else if (genre === 'House') {
        for (let q = 0; q < 4; q++) bass.push({ p: r2, s: o + q * 4 + 2, d: 1.5, v: 0.85 });
        if (s.e === 3) bass.push({ p: r2 + 12, s: o + 15, d: 0.8, v: 0.7 });
      } else if (genre === 'Drum & Bass') {
        if (b % bpc === 0) bass.push({ p: r2, s: o, d: bpc * 16 - 1, v: 0.9 });
        if (s.e === 3) sub.push({ p: r1, s: o, d: 6, v: 0.9 }, { p: r1, s: o + 10, d: 6, v: 0.9 });
      } else if (genre === 'Lo-fi') {
        bass.push({ p: r2, s: o, d: 5, v: 0.85 }, { p: r2 + (rnd.chance(0.5) ? 7 : 0), s: o + 8, d: 3, v: 0.75 });
        if (rnd.chance(0.4)) bass.push({ p: r2 + rnd.pick([-1, -2, 2]), s: o + 14, d: 1.5, v: 0.65 });
      } else if (genre === 'Synthwave') {
        for (let q = 0; q < 8; q++) bass.push({ p: r2 + (q % 2 ? 12 : 0), s: o + q * 2, d: 1.6, v: q % 2 ? 0.7 : 0.9 });
      } else {
        for (let q = 0; q < (s.e >= 3 ? 8 : 4); q++) bass.push({ p: r2, s: o + q * (s.e >= 3 ? 2 : 4), d: s.e >= 3 ? 1.6 : 3.5, v: 0.85 });
      }
    }
    clip(bassT, s.bar, s.bars, bass, s.name);
    clip(subT, s.bar, s.bars, sub, s.name);
  });
  tracks.push(bassT);
  if (subT.clips.length) tracks.push(subT);

  // ===== CHORDS =====
  const padInst = { Dubstep: 'Dream Pad', 'Riddim / Brostep': 'Dream Pad', Trap: 'Soft Pad', House: 'Warm Pad', 'Drum & Bass': 'Strings', 'Lo-fi': 'Warm Pad', Pop: 'Warm Pad', Synthwave: 'Warm Pad' }[genre];
  const keysInst = { Dubstep: null, 'Riddim / Brostep': null, Trap: rnd.pick(['Bell', 'Music Box', 'Grand Piano']), House: rnd.pick(['Organ', 'Grand Piano', 'Electric Piano']), 'Drum & Bass': 'Electric Piano', 'Lo-fi': rnd.pick(['Electric Piano', 'FM E-Piano', 'Grand Piano']), Pop: rnd.pick(['Grand Piano', 'Electric Piano']), Synthwave: 'Synth Brass' }[genre];
  const pad = synthTrack('Pad', presetInst(padInst), 0.42, 0.35);
  pad.fx.push(newFx('eq', { hp: 180 }), newFx('width', { width: 1.4 }));
  if (edm) pad.fx.push(sc(-32, 5));
  const keys = keysInst ? synthTrack(INSTRUMENTS[keysInst] ? keysInst : 'Keys', presetInst(keysInst), 0.5, 0.25) : null;
  if (keys) keys.fx.push(newFx('eq', { hp: 150 }));
  if (keys && genre === 'Lo-fi') keys.fx.push(newFx('crush', { bits: 12, down: 1, tone: 6000, mix: 0.35 }), newFx('chorus', { mix: 0.25, depth: 0.4 }));
  const padF = newFx('filter', { type: 'lowpass', cutoff: 20000, res: 2 });
  pad.fx.unshift(padF);
  form.forEach((s) => {
    const prog = progFor(s), bpc = s.bars >= 16 ? 2 : 1;
    const padN = [], keyN = [];
    for (let b = 0; b < s.bars; b += bpc) {
      const d = prog[Math.floor(b / bpc) % prog.length];
      const ch = H.chord(d, 72, genre === 'Lo-fi' || (genre === 'House' && rnd.chance(0.3)));
      const o = b * 16, L = bpc * 16;
      if (!(edm && s.kind === 'drop' && s.e === 3 && genre !== 'House') || genre === 'Drum & Bass') ch.forEach((p) => padN.push({ p, s: o, d: L - 0.2, v: 0.65 }));
      else if (genre !== 'Trap') ch.forEach((p) => padN.push({ p, s: o, d: L - 0.2, v: 0.45 }));
      if (!keys || s.kind === 'build' && edm) continue;
      if (genre === 'House' && s.e >= 2) for (let k = 0; k < bpc; k++) [2, 5, 8, 11, 14].forEach((st) => ch.forEach((p) => keyN.push({ p, s: o + k * 16 + st, d: 1, v: 0.75 })));
      else if (genre === 'Trap') { const arp = [ch[0], ch[1], ch[2], ch[0] + 12, ch[2], ch[1]]; for (let k = 0; k < L / 2; k++) keyN.push({ p: arp[k % arp.length] + 12, s: o + k * 2, d: 1.8, v: 0.6 }); }
      else if (genre === 'Lo-fi') ch.forEach((p, i) => keyN.push({ p, s: o + i * 0.25, d: L * 0.45, v: 0.6 }, { p, s: o + L / 2 + 1 + i * 0.25, d: L * 0.4, v: 0.5 }));
      else if (genre === 'Synthwave') ch.forEach((p) => keyN.push({ p, s: o, d: L - 0.5, v: 0.7 }));
      else if (s.e >= 2) for (let k = 0; k < L; k += 4) ch.forEach((p) => keyN.push({ p, s: o + k, d: 3.5, v: k % 8 ? 0.6 : 0.75 }));
      else ch.forEach((p) => keyN.push({ p, s: o, d: L - 0.5, v: 0.6 }));
    }
    if (!(s.kind === 'intro' && edm && s.e === 0)) clip(pad, s.bar, s.bars, padN, s.name);
    if (keys) clip(keys, s.bar, s.bars, keyN, s.name);
  });
  // build: open the pad filter
  const pl = [{ b: 0, v: 1 }];
  form.filter((s) => s.kind === 'build').forEach((s) => pl.push({ b: ST(s.bar), v: 0.35 }, { b: ST(s.bar + s.bars) - 0.1, v: 0.95 }, { b: ST(s.bar + s.bars), v: 1 }));
  if (pl.length > 1) pad.auto.push({ target: `fx:${padF.id}:cutoff`, pts: pl });
  tracks.push(pad);
  if (keys && keys.clips.length) tracks.push(keys);

  // ===== MELODY =====
  const leadInst = { Dubstep: 'Mono Lead', 'Riddim / Brostep': 'Mono Lead', Trap: rnd.pick(['Flute', 'Bell', 'Pluck']), House: rnd.pick(['Pluck', 'Bright Pluck']), 'Drum & Bass': rnd.pick(['Trance Lead', 'Pluck']), 'Lo-fi': rnd.pick(['Nylon Guitar', 'Flute', 'Kalimba']), Pop: rnd.pick(['Pluck', 'Super Saw', 'Electric Guitar']), Synthwave: rnd.pick(['Square Lead', 'Trance Lead']) }[genre];
  const lead = synthTrack('Lead', presetInst(leadInst), 0.45, 0.25);
  lead.fx.push(newFx('delay', { time: '1/8.', mix: 0.18, fb: 0.3 }), newFx('eq', { hp: 250 }));
  const motif = genMotif(rnd, genre === 'Lo-fi' ? 0.25 : genre === 'Trap' ? 0.55 : 0.45);
  const motif2 = genMotif(rnd, 0.4);
  const leadRange = INSTRUMENTS[leadInst] ? [62, 79] : [67, 84];
  form.forEach((s) => {
    const wants = genre === 'Dubstep' || genre === 'Riddim / Brostep' ? s.kind === 'break' : genre === 'Drum & Bass' ? s.kind === 'drop' || s.kind === 'break' : s.e >= 3 || (s.kind === 'verse' && genre === 'Lo-fi') || (s.kind === 'break' && genre !== 'House');
    if (!wants) return;
    const prog = progFor(s), bpc = s.bars >= 16 ? 2 : 1;
    const phraseBars = prog.length * bpc;
    const notes = [];
    const phrase = genMelodyPhrase(H, prog, s.e >= 3 ? motif : motif2, genRng(seed + (s.kind === 'break' ? 7 : 3)), leadRange[0], leadRange[1], bpc);
    for (let b = 0; b < s.bars; b += phraseBars) phrase.forEach((n) => { if (n.s + b * 16 < s.bars * 16) notes.push({ ...n, s: n.s + b * 16 }); });
    clip(lead, s.bar, s.bars, notes, s.name);
  });
  if (lead.clips.length) tracks.push(lead);

  // vocal-style chops (synth formant) on the drops/choruses, sparse
  if (opts.vocals) {
    const vox = synthTrack('Vox Chops', custom('Vox Chop', { osc: [{ wave: 'sawtooth', voices: 3, spread: 14 }], filter: { type: 'bandpass', cutoff: 1100, res: 3, env: 900, key: 0.6 }, fenv: { a: 0.005, d: 0.12, s: 0.3, r: 0.08 }, amp: { a: 0.005, d: 0.12, s: 0.5, r: 0.08 }, lfo: { rate: 6, depth: 0.08, target: 'pitch' }, gain: 2.2 }), 0.32, 0.35);
    vox.fx.push(newFx('doubler', { amount: 0.5 }), newFx('delay', { time: '1/8', mix: 0.25, fb: 0.3 }), newFx('eq', { hp: 300 }));
    const rh = rnd.pick([[0, 2, 3, 6, 8, 11, 12, 14], [0, 1, 2, 4, 7, 8, 10, 14], [0, 3, 6, 8, 10, 12, 13, 14]]);
    form.filter((s) => s.e >= 3).forEach((s) => {
      const notes = [];
      for (let b = 3; b < s.bars; b += 4) {
        const d = progFor(s)[Math.floor(b / (s.bars >= 16 ? 2 : 1)) % 4];
        const ch = H.chord(d, 84);
        rh.forEach((st, k) => notes.push({ p: ch[(k * 2) % 3] + (k === rh.length - 1 ? 12 : 0), s: b * 16 + st, d: 1, v: 0.8 }));
      }
      clip(vox, s.bar, s.bars, notes, 'Chops');
    });
    if (vox.clips.length) tracks.push(vox);
  }

  // ===== FX =====
  const builds = form.filter((s) => s.kind === 'build');
  if (builds.length) {
    const riser = synthTrack('Riser', custom('Saw Riser', { osc: [{ wave: 'sawtooth', voices: 5, spread: 30 }], noise: 0.45, filter: { cutoff: 500, res: 5, env: 11000, key: 0 }, fenv: { a: 6, d: 1, s: 1, r: 0.1 }, amp: { a: 2, d: 1, s: 1, r: 0.05 }, penv: { amt: -24, time: 7 }, gain: 0.8 }), 0.28, 0.4);
    riser.fx.push(newFx('eq', { hp: 200 }));
    for (const s of builds) {
      const secs = (s.bars * 4 * 60) / P.bpm;
      riser.clips.push({ id: uid(), start: ST(s.bar), length: s.bars * 4, notes: [{ p: P.key + 72, s: 0, d: s.bars * 16 - 1, v: 0.8 }], name: 'Riser' });
      riser.inst.patch.fenv.a = riser.inst.patch.penv.time = Math.max(1, secs - 0.3);
      riser.inst.patch.amp.a = Math.max(0.5, secs * 0.4);
    }
    tracks.push(riser);
  }
  const drops = form.filter((s, i) => s.e >= 3 && i > 0);
  if (drops.length && edm) {
    const imp = makeTrack('drums', P);
    imp.name = 'Impacts'; imp.kit = 'Trap'; imp.channels = []; imp.patterns = []; imp.volume = 0.7; imp.rev = 0.35;
    const ip = drumLoopPattern(imp, { name: 'Impact', s: { '808': 'x...............', crash: 'x...............', kick: 'x...............' } });
    imp.patterns.push(ip);
    drops.forEach((s) => imp.clips.push({ id: uid(), start: ST(s.bar), length: 4, pattern: 0, off: 0 }));
    tracks.push(imp);
    const sweep = synthTrack('Noise FX', presetInst('Noise Sweep'), 0.3, 0.45);
    drops.forEach((s) => s.bar > 0 && sweep.clips.push({ id: uid(), start: ST(s.bar - 1), length: 4, notes: [{ p: 72, s: 0, d: 15.5, v: 0.8 }], name: 'Swell' }));
    tracks.push(sweep);
  }

  // ===== MIX =====
  const gainBy = { Drums: 0.9, Impacts: 0.75 };
  for (const t of tracks) if (gainBy[t.name]) t.volume = gainBy[t.name];
  const master = genre === 'Lo-fi' ? [newFx('crush', { bits: 12, down: 2, tone: 7000, mix: 0.4 }), newFx('sat', { mode: 'Tape', drive: 0.3, mix: 0.5, out: -3 }), newFx('eq', { hp: 50, lp: 10000 }), newFx('limiter', { gain: 3, ceil: -1 })]
    : edm ? [newFx('eq', { hp: 26, lg: 1.5, hg: 2 }), newFx('comp', { thr: -14, ratio: 2, att: 30, rel: 150 }), newFx('limiter', { gain: 4, ceil: -0.8 })]
      : [newFx('eq', { hp: 30, lg: 1, hg: 1.5 }), newFx('comp', { thr: -16, ratio: 2, att: 25, rel: 120, makeup: 1 }), newFx('limiter', { gain: 3.5, ceil: -1 })];
  P.master = { fx: master, volume: 0.85, preset: 'None' };
  P.tracks = tracks;
  P.name = genSongName(rnd, genre, mood);
  P.generated = { genre, mood, seed, length: opts.length, vocals: !!opts.vocals };
  return P;
}

function genSongName(rnd, genre, mood) {
  const A = { Dark: ['Midnight', 'Shadow', 'Black', 'Toxic', 'Iron', 'Hollow'], Hype: ['Neon', 'Turbo', 'Riot', 'Voltage', 'Wild', 'Rage'], Happy: ['Golden', 'Sunny', 'Candy', 'Bright', 'Lucky', 'Summer'], Chill: ['Slow', 'Velvet', 'Rainy', 'Hazy', 'Quiet', 'Late'], Epic: ['Titan', 'Skyline', 'Storm', 'Rising', 'Empire', 'Phoenix'] }[mood] || ['Neon'];
  const B = ['Drive', 'Run', 'Nights', 'Signal', 'Pulse', 'Machine', 'Waves', 'City', 'Engine', 'Dreams', 'Fever', 'Circuit', 'Lights', 'Motion'];
  return rnd.pick(A) + ' ' + rnd.pick(B);
}

// ---------- dialog ----------
const Generator = {
  open() {
    const o = GEN.last;
    const sel = (opts, cur) => { const s = h('select'); for (const x of opts) s.append(h('option', { value: x }, x)); s.value = cur; return s; };
    const genre = sel(Object.keys(GEN.GENRES), o.genre), mood = sel(GEN.MOODS, o.mood), key = sel(GEN.KEYS, o.key), len = sel(Object.keys(GEN.LENGTHS), o.length);
    const bpm = h('input', { type: 'number', min: 60, max: 200, placeholder: 'Auto', value: o.bpm || '', style: 'width:100%' });
    const vox = h('input', { type: 'checkbox' });
    vox.checked = !!o.vocals;
    const genreHint = h('div', { class: 'hint2' });
    const showHint = () => { const G = GEN.GENRES[genre.value]; genreHint.textContent = `Tempo ${G.bpm[0]}-${G.bpm[1]} BPM · ${G.kit} drums`; };
    genre.onchange = showHint; showHint();
    const close = () => ov.remove();
    const go = async (reroll) => {
      Object.assign(GEN.last, { genre: genre.value, mood: mood.value, key: key.value, bpm: +bpm.value || 0, length: len.value, vocals: vox.checked });
      if (App.dirty && !(await confirmReplace())) return;
      close();
      await Generator.run(Object.assign({}, GEN.last, { seed: 0 }));
    };
    const ov = h('div', { class: 'modal-ov', onmousedown: (e) => { if (e.target === ov) close(); } },
      h('div', { class: 'modal gen-modal' },
        h('div', { class: 'modal-head' }, h('h3', {}, '✨ Generate a song'), h('button', { class: 'mini', onclick: close }, '✕')),
        h('div', { class: 'hint2' }, 'Studio writes a complete track for you: arrangement, drums, bass, chords, melody, effects and mix. Every part is normal tracks and clips, so you can change anything afterwards.'),
        h('label', { class: 'lab' }, 'Genre'), genre, genreHint,
        h('div', { class: 'gen-grid' },
          h('div', {}, h('label', { class: 'lab' }, 'Mood'), mood),
          h('div', {}, h('label', { class: 'lab' }, 'Key'), key),
          h('div', {}, h('label', { class: 'lab' }, 'Tempo (BPM)'), bpm),
          h('div', {}, h('label', { class: 'lab' }, 'Length'), len)),
        h('label', { class: 'row-flex', style: 'gap:6px;margin-top:6px' }, vox, 'Add vocal-style chops'),
        h('div', { class: 'row-flex', style: 'margin-top:12px' }, h('span', { class: 'spacer' }), h('button', { onclick: close }, 'Cancel'), h('button', { class: 'primary', onclick: () => go(false) }, '✨ Generate'))));
    document.body.append(ov);
  },
  async run(opts) {
    const busy = Busy.show('Writing your song...');
    try {
      await new Promise((r) => setTimeout(r, 30));
      const P = generateSong(opts);
      GEN.last.seed = P.generated.seed;
      busy.text('Loading sounds...');
      if (Engine.playing) App.stop();
      Buffers.clear();
      App.load(P);
      App.dirty = true;
      await Engine.ensureInstruments(App.project);
      await DrumCache.warm(App.project);
      Generator.bar(true);
      toast(`Generated "${P.name}" - ${P.generated.genre}, ${P.generated.mood}, ${P.bpm} BPM. Press Space to play.`, 5000);
      try { if (NL()) Neutralino.window.setTitle('Studio - ' + P.name); } catch (e) {}
    } catch (e) {
      console.error(e);
      toast('Could not generate a song: ' + e.message, 6000);
    } finally { busy.hide(); }
  },
  // small bar under the toolbar after generating: try another / tweak
  bar(show) {
    let el = $('#gen-bar');
    if (!show) { if (el) el.remove(); return; }
    if (!el) {
      el = h('div', { id: 'gen-bar' });
      document.body.append(el);
    }
    const g = App.project.generated;
    el.innerHTML = '';
    el.append(
      h('span', {}, `✨ Generated: ${g.genre} · ${g.mood} · ${App.project.bpm} BPM · song #${g.seed}`),
      h('button', { class: 'mini', onclick: async () => { if (App.dirty && !(await confirmReplace())) return; Generator.run(Object.assign({}, GEN.last, { seed: 0 })); } }, '🎲 Try another'),
      h('button', { class: 'mini', onclick: () => Generator.open() }, 'Change settings'),
      h('button', { class: 'mini', title: 'Hide', onclick: () => Generator.bar(false) }, '✕'));
  },
};

// "Replace the current song?" (unsaved changes)
function confirmReplace() {
  return new Promise((res) => {
    const done = (v) => { ov.remove(); res(v); };
    const ov = h('div', { class: 'modal-ov' }, h('div', { class: 'modal', style: 'width:400px' },
      h('h3', { style: 'margin:0 0 6px' }, 'Replace the current song?'),
      h('div', { class: 'hint2' }, 'Your current song has changes that are not saved. It stays in autosave, but you may want to save it first.'),
      h('div', { class: 'row-flex', style: 'margin-top:12px;gap:6px' },
        h('button', { onclick: async () => { await saveProject(); done(true); } }, 'Save first'),
        h('span', { class: 'spacer' }), h('button', { onclick: () => done(false) }, 'Cancel'), h('button', { class: 'primary', onclick: () => done(true) }, 'Replace'))));
    document.body.append(ov);
  });
}
