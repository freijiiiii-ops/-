'use strict';

// 棒人間でトレーニングの動きを見せるアニメーション
const SEG = { torso: 48, neck: 14, upper: 24, fore: 22, thigh: 30, shin: 30, foot: 9 };
const FLOOR_Y = 150;
const DEMO_SECONDS = 15;

function dirOf(deg) {
  const r = (deg * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r)];
}
function step(p, deg, len) {
  const d = dirOf(deg);
  return [p[0] + d[0] * len, p[1] + d[1] * len];
}

function solveSide(P) {
  const hip = [0, 0];
  const s = step(hip, P.torso, SEG.torso);
  const pts = {
    hip, s,
    head: step(s, P.neck ?? P.torso, SEG.neck),
  };
  pts.e = step(s, P.upper, SEG.upper);
  pts.w = step(pts.e, P.fore, SEG.fore);
  pts.k = step(hip, P.thigh, SEG.thigh);
  pts.a = step(pts.k, P.shin, SEG.shin);
  pts.toe = step(pts.a, P.foot ?? P.shin - 90, SEG.foot);
  if (P.thigh2 != null) {
    pts.k2 = step(hip, P.thigh2, SEG.thigh);
    pts.a2 = step(pts.k2, P.shin2 ?? P.shin, SEG.shin);
    pts.toe2 = step(pts.a2, (P.shin2 ?? P.shin) - 90, SEG.foot);
  }
  return pts;
}

// 正面から見た姿勢（左右対称）
function solveFront(P) {
  const hip = [0, 0];
  const s = [0, -SEG.torso];
  const pts = { hip, s, head: [0, -SEG.torso - SEG.neck], front: true };
  const side = (sign) => {
    const sh = [13 * sign, -SEG.torso + 2];
    const m = (deg) => (sign > 0 ? deg : 180 - deg);
    const e = step(sh, m(P.upper), SEG.upper);
    const w = step(e, m(P.fore), SEG.fore);
    const hp = [7 * sign, 0];
    const k = step(hp, m(P.thigh), SEG.thigh);
    const a = step(k, m(P.shin), SEG.shin);
    return { sh, e, w, hp, k, a, toe: [a[0] + 6 * sign, a[1]] };
  };
  pts.R = side(1);
  pts.L = side(-1);
  pts.w = pts.R.w;
  pts.a = pts.R.a;
  return pts;
}

function translate(pts, dx, dy) {
  const mv = (p) => [p[0] + dx, p[1] + dy];
  const out = { front: pts.front };
  for (const [k, v] of Object.entries(pts)) {
    if (Array.isArray(v)) out[k] = mv(v);
    else if (v && typeof v === 'object') out[k] = Object.fromEntries(Object.entries(v).map(([kk, vv]) => [kk, mv(vv)]));
  }
  return out;
}

function lerpPose(A, B, t) {
  const out = {};
  for (const key of new Set([...Object.keys(A), ...Object.keys(B)])) {
    const a = A[key] ?? B[key];
    const b = B[key] ?? A[key];
    if (Array.isArray(a)) out[key] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    else out[key] = a + (b - a) * t;
  }
  return out;
}

function poseAt(anim, t) {
  const A = { at: anim.at, ...anim.a };
  const B = { ...A, ...anim.b };
  const P = lerpPose(A, B, t);
  const pts = anim.view === 'front' ? solveFront(P) : solveSide(P);
  const ref = pts[anim.anchor === 'ankle' ? 'a' : anim.anchor === 'wrist' ? 'w' : anim.anchor === 'knee' ? 'k' : 'hip'];
  return translate(pts, P.at[0] - ref[0], P.at[1] - ref[1]);
}

const f1 = (n) => n.toFixed(1);
const line = (p, q, cls) => `<line x1="${f1(p[0])}" y1="${f1(p[1])}" x2="${f1(q[0])}" y2="${f1(q[1])}" class="${cls}"/>`;
const poly = (ps, cls) => `<polyline points="${ps.map((p) => `${f1(p[0])},${f1(p[1])}`).join(' ')}" class="${cls}"/>`;

function holdSvg(kind, w) {
  const [x, y] = w;
  if (kind === 'barbell') return `<circle cx="${f1(x)}" cy="${f1(y)}" r="12" class="fig-plate"/><circle cx="${f1(x)}" cy="${f1(y)}" r="3" class="fig-hub"/>`;
  if (kind === 'dumbbell') return `<rect x="${f1(x - 7)}" y="${f1(y - 4)}" width="14" height="8" rx="3" class="fig-prop-fill"/>`;
  if (kind === 'handle') return `<line x1="${f1(x)}" y1="${f1(y - 7)}" x2="${f1(x)}" y2="${f1(y + 7)}" class="fig-prop" />`;
  if (kind === 'roller') return `<circle cx="${f1(x)}" cy="${f1(y)}" r="7" class="fig-plate"/>`;
  return '';
}

function figureSvg(anim, t) {
  const p = poseAt(anim, t);
  const hl = new Set(anim.hl || []);
  const c = (part) => (hl.has(part) ? 'fig-limb fig-hl' : 'fig-limb');
  let out = '';
  if (!anim.noFloor) out += `<line x1="0" y1="${FLOOR_Y + 3}" x2="200" y2="${FLOOR_Y + 3}" class="fig-floor"/>`;
  for (const pr of anim.props || []) {
    if (pr.t === 'line') out += `<line x1="${pr.p[0]}" y1="${pr.p[1]}" x2="${pr.p[2]}" y2="${pr.p[3]}" class="fig-prop" style="stroke-width:${pr.w || 4}"/>`;
    if (pr.t === 'rect') out += `<rect x="${pr.p[0]}" y="${pr.p[1]}" width="${pr.p[2]}" height="${pr.p[3]}" rx="2" class="fig-prop-fill"/>`;
  }
  if (anim.cable) out += line(anim.cable, p.w, 'fig-cable');

  if (p.front) {
    for (const s of [p.L, p.R]) {
      out += poly([s.hp, s.k, s.a, s.toe], c('leg'));
    }
    out += line(p.hip, p.s, c('torso'));
    out += line(p.L.sh, p.R.sh, c('torso'));
    out += line(p.L.hp, p.R.hp, c('torso'));
    for (const s of [p.L, p.R]) {
      out += poly([s.sh, s.e, s.w], c('arm'));
      out += holdSvg(anim.hold, s.w);
    }
  } else {
    if (p.k2) out += poly([p.hip, p.k2, p.a2, p.toe2], `${c('leg')} fig-back`);
    out += line(p.hip, p.s, c('torso'));
    out += poly([p.hip, p.k, p.a, p.toe], c('leg'));
    out += poly([p.s, p.e, p.w], c('arm'));
    out += holdSvg(anim.hold, p.w);
    if (anim.attach === 'pad') out += `<circle cx="${f1(p.a[0])}" cy="${f1(p.a[1])}" r="6" class="fig-prop-fill"/>`;
    if (anim.attach === 'sled') {
      const d = dirOf(-40);
      out += line([p.a[0] + 4 - d[1] * 18, p.a[1] + d[0] * 18], [p.a[0] + 4 + d[1] * 18, p.a[1] - d[0] * 18], 'fig-prop');
    }
  }
  out += `<circle cx="${f1(p.head[0])}" cy="${f1(p.head[1])}" r="9" class="fig-head"/>`;
  return out;
}

function staticFigure(ex, t = 1) {
  return `<svg viewBox="0 0 200 160" class="fig" aria-hidden="true">${figureSvg(ex.anim, t)}</svg>`;
}

const easeInOut = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

// 1回の動作: 上げる(40%) → 止める(10%) → 下ろす(40%) → 止める(10%)
function cyclePos(phase) {
  if (phase < 0.4) return easeInOut(phase / 0.4);
  if (phase < 0.5) return 1;
  if (phase < 0.9) return 1 - easeInOut((phase - 0.5) / 0.4);
  return 0;
}

class DemoPlayer {
  constructor(root, ex) {
    this.root = root;
    this.ex = ex;
    this.period = ex.anim.period || 3000;
    this.svg = root.querySelector('svg');
    this.bar = root.querySelector('.demo-progress span');
    this.count = root.querySelector('.demo-count');
    this.cue = root.querySelector('.demo-cue');
    this.btn = root.querySelector('.demo-play');
    this.raf = null;
    this.elapsed = 0;
    this.btn.addEventListener('click', () => (this.raf ? this.pause() : this.play()));
    this.draw(0);
  }

  play() {
    if (this.elapsed >= DEMO_SECONDS * 1000) this.elapsed = 0;
    this.last = performance.now();
    this.btn.textContent = '⏸ 一時停止';
    const tick = (now) => {
      this.elapsed += now - this.last;
      this.last = now;
      if (this.elapsed >= DEMO_SECONDS * 1000) {
        this.elapsed = DEMO_SECONDS * 1000;
        this.draw(this.elapsed);
        this.pause();
        this.btn.textContent = '↻ もう一度見る';
        return;
      }
      this.draw(this.elapsed);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  pause() {
    cancelAnimationFrame(this.raf);
    this.raf = null;
    this.btn.textContent = '▶ 再生';
  }

  draw(ms) {
    const phase = (ms % this.period) / this.period;
    const t = this.ex.anim.static ? 0.5 + 0.5 * Math.sin((ms / this.period) * Math.PI * 2) : cyclePos(phase);
    this.svg.innerHTML = figureSvg(this.ex.anim, t);
    this.bar.style.width = `${(ms / (DEMO_SECONDS * 1000)) * 100}%`;
    const tips = this.ex.tips;
    this.cue.textContent = `💡 ${tips[Math.min(tips.length - 1, Math.floor((ms / (DEMO_SECONDS * 1000)) * tips.length))]}`;
    if (this.ex.anim.static) {
      this.count.textContent = `キープ ${Math.floor(ms / 1000)}秒`;
    } else {
      const reps = Math.floor(ms / this.period) + (phase >= 0.5 ? 1 : 0);
      this.count.textContent = `${Math.min(reps, Math.round((DEMO_SECONDS * 1000) / this.period))}回`;
    }
  }

  destroy() {
    cancelAnimationFrame(this.raf);
  }
}
