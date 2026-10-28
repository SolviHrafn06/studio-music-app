// Background worker: pitch analysis for the graphical pitch editor, and WSOLA time-stretching
// (change length without changing pitch) so audio follows the song tempo.

function pitchTrack(x, sr) {
  const D = Math.max(1, Math.round(sr / 16000));
  const sr2 = sr / D;
  const n2 = Math.floor(x.length / D);
  const y = new Float32Array(n2);
  for (let i = 0; i < n2; i++) {
    let s = 0;
    for (let j = 0; j < D; j++) s += x[i * D + j];
    y[i] = s / D;
  }
  const fps = 100, hop = sr2 / fps, W = 512;
  const tmin = Math.floor(sr2 / 1100), tmax = Math.min(511, Math.floor(sr2 / 65));
  const frames = Math.floor(n2 / hop);
  const hz = new Float32Array(frames), rms = new Float32Array(frames);
  const d = new Float32Array(tmax + 1);
  for (let f = 0; f < frames; f++) {
    const s0 = Math.floor(f * hop - W / 2);
    if (s0 < 0 || s0 + W + tmax >= n2) continue;
    let e = 0;
    for (let i = 0; i < W; i++) e += y[s0 + i] * y[s0 + i];
    rms[f] = Math.sqrt(e / W);
    if (rms[f] < 0.006) continue;
    let run = 0;
    d[0] = 1;
    for (let tau = 1; tau <= tmax; tau++) {
      let s = 0;
      for (let i = 0; i < W; i++) { const v = y[s0 + i] - y[s0 + i + tau]; s += v * v; }
      run += s;
      d[tau] = run > 0 ? (s * tau) / run : 1;
    }
    let tau = -1;
    for (let t = tmin; t <= tmax; t++) {
      if (d[t] < 0.15) { while (t + 1 <= tmax && d[t + 1] < d[t]) t++; tau = t; break; }
    }
    if (tau < 0) continue;
    let bt = tau;
    if (tau > 1 && tau < tmax) {
      const a = d[tau - 1], b = d[tau], c = d[tau + 1], den = a + c - 2 * b;
      if (Math.abs(den) > 1e-9) bt = tau + (0.5 * (a - c)) / den;
    }
    hz[f] = sr2 / bt;
  }
  // median-of-5 cleanup of octave jumps / single-frame glitches
  const out = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    if (!hz[f]) continue;
    const w = [];
    for (let k = -2; k <= 2; k++) if (hz[f + k]) w.push(hz[f + k]);
    w.sort((a, b) => a - b);
    const med = w[w.length >> 1];
    let v = hz[f];
    if (Math.abs(12 * Math.log2(v / med)) > 7) v = med;
    out[f] = v;
  }
  return { fps, hz: out, rms };
}

function wsola(chans, sr, ratio) {
  const x = chans.length > 1 ? chans[0].map((v, i) => (v + chans[1][i]) * 0.5) : chans[0];
  const W = Math.round(sr * 0.04), Hs = W >> 1, Ha = Hs / ratio, tol = W >> 2;
  const outLen = Math.ceil(x.length * ratio) + W;
  const win = new Float32Array(W);
  for (let i = 0; i < W; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W);
  const pos = [];
  let prevIn = 0;
  for (let k = 0; ; k++) {
    const outPos = k * Hs;
    if (outPos + W >= outLen) break;
    let inPos = Math.round(k * Ha);
    if (inPos + W + tol >= x.length) break;
    if (k > 0) {
      const nat = prevIn + Hs;
      let best = 0, bestC = -1e18;
      for (let dlt = -tol; dlt <= tol; dlt += 2) {
        const p = inPos + dlt;
        if (p < 0 || p + W >= x.length) continue;
        let c = 0;
        for (let i = 0; i < Hs; i += 2) c += x[nat + i] * x[p + i];
        if (c > bestC) { bestC = c; best = dlt; }
      }
      inPos += best;
    }
    pos.push([outPos, inPos]);
    prevIn = inPos;
  }
  const n = Math.ceil(x.length * ratio);
  return chans.map((src) => {
    const y = new Float32Array(outLen), norm = new Float32Array(outLen);
    for (const [o, ip] of pos) for (let i = 0; i < W; i++) { y[o + i] += src[ip + i] * win[i]; norm[o + i] += win[i]; }
    const res = new Float32Array(n);
    for (let i = 0; i < n; i++) res[i] = norm[i] > 1e-3 ? y[i] / norm[i] : 0;
    return res;
  });
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.cmd === 'pitch') {
    const r = pitchTrack(m.data, m.sr);
    self.postMessage({ id: m.id, ...r }, [r.hz.buffer, r.rms.buffer]);
  } else if (m.cmd === 'stretch') {
    const chans = wsola(m.chans, m.sr, m.ratio);
    self.postMessage({ id: m.id, chans }, chans.map((c) => c.buffer));
  }
};
