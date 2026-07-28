// 계기판 · 미니맵 · 전면 유리 효과(와이퍼/빗방울) 렌더링.

import { RECTS, ROUTE, BAYS, RAMP, CL, ROAD, HALF } from '../sim/course.js';

const MAP_BOUNDS = { x1: -16, x2: 116, z1: -9, z2: 103 };

export class Hud {
  constructor(els) {
    this.els = els;
    this.dash = els.dash.getContext('2d');
    this.map = els.minimap.getContext('2d');
    this.overlay = els.overlay.getContext('2d');
    this.wiperPhase = 0;
    this.wiperActive = false;
    this.drops = [];
    this.rain = false;
    this._dpr = 1;
    this._lastWiperCycle = 0;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._dpr = dpr;
    for (const [canvas, ctx] of [[this.els.dash, this.dash], [this.els.minimap, this.map]]) {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const o = this.els.overlay;
    const r = o.parentElement.getBoundingClientRect();
    o.width = Math.round(r.width * dpr);
    o.height = Math.round(r.height * dpr);
    o.style.width = r.width + 'px';
    o.style.height = r.height + 'px';
    this.overlay.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.overlayW = r.width;
    this.overlayH = r.height;
  }

  // ------------------------------------------------------------ 계기판
  drawDash(v, ui) {
    const ctx = this.dash;
    const w = this.els.dash.getBoundingClientRect().width;
    const h = this.els.dash.getBoundingClientRect().height;
    ctx.clearRect(0, 0, w, h);
    if (w < 40 || h < 30) return;

    const cx = h * 0.52, cy = h * 0.52, r = h * 0.40;
    // 다이얼 배경
    ctx.beginPath();
    ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,13,19,0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const A0 = Math.PI * 0.75, A1 = Math.PI * 2.25;
    const MAXV = 60;   // 기능시험 속도대
    // 눈금
    ctx.lineWidth = 2;
    for (let s = 0; s <= MAXV; s += 10) {
      const a = A0 + (A1 - A0) * (s / MAXV);
      const big = s % 20 === 0;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r - (big ? 11 : 7)), cy + Math.sin(a) * (r - (big ? 11 : 7)));
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.strokeStyle = s >= 40 ? 'rgba(255,120,110,0.85)' : 'rgba(220,228,240,0.7)';
      ctx.stroke();
      if (big) {
        ctx.fillStyle = 'rgba(200,210,225,0.75)';
        ctx.font = `${Math.round(h * 0.10)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(s), cx + Math.cos(a) * (r - 22), cy + Math.sin(a) * (r - 22));
      }
    }
    // 20km/h 기준선(가속구간)
    const a20 = A0 + (A1 - A0) * (20 / MAXV);
    ctx.beginPath();
    ctx.arc(cx, cy, r - 3, a20 - 0.02, a20 + 0.02);
    ctx.strokeStyle = '#6cd0ff';
    ctx.lineWidth = 5;
    ctx.stroke();

    // 바늘
    const spd = Math.min(MAXV, v.speedKmh);
    const a = A0 + (A1 - A0) * (spd / MAXV);
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(a) * 8, cy - Math.sin(a) * 8);
    ctx.lineTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6));
    ctx.strokeStyle = '#ff6b5e';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#e8ecf2';
    ctx.fill();

    // 디지털 속도 (숫자 + 단위를 같은 줄에 둔다)
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f2f5fa';
    ctx.font = `700 ${Math.round(h * 0.34)}px system-ui, sans-serif`;
    const spdText = String(Math.round(v.speedKmh));
    ctx.fillText(spdText, h * 1.05, h * 0.62);
    const spdW = ctx.measureText(spdText).width;
    ctx.fillStyle = 'rgba(190,200,215,0.8)';
    ctx.font = `${Math.round(h * 0.13)}px system-ui, sans-serif`;
    ctx.fillText('km/h', h * 1.05 + spdW + 6, h * 0.62);

    // RPM 바
    const bx = h * 1.05, by = h * 0.78, bw = w - bx - 12, bh = h * 0.10;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(bx, by, bw, bh);
    const rp = Math.min(1, v.rpm / 6000);
    const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    grad.addColorStop(0, '#5ad48a');
    grad.addColorStop(0.7, '#e8c65a');
    grad.addColorStop(1, '#e8695a');
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, bw * rp, bh);
    ctx.fillStyle = 'rgba(180,190,205,0.7)';
    ctx.font = `${Math.round(h * 0.10)}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(v.rpm)} rpm`, w - 12, by + bh + h * 0.13);

    // 기어 표시
    const gears = ['P', 'R', 'N', 'D'];
    ctx.textAlign = 'center';
    ctx.font = `700 ${Math.round(h * 0.16)}px system-ui, sans-serif`;
    gears.forEach((g, i) => {
      const gx = w - 20 - (3 - i) * (h * 0.19);
      ctx.fillStyle = v.gear === g
        ? (g === 'R' ? '#ff7a6a' : g === 'D' ? '#6ce8a0' : '#f0f3f8')
        : 'rgba(150,158,172,0.35)';
      ctx.fillText(g, gx, h * 0.26);
    });
  }

  // ------------------------------------------------------------ 경고등
  updateTelltales(v, ui, exam) {
    const set = (name, on, cls) => {
      const el = this.els.tell[name];
      if (!el) return;
      el.classList.toggle('on', !!on);
      if (cls) el.classList.toggle(cls, !!on);
    };
    set('seatbelt', !v.seatbelt);
    set('brake', v.parkingBrake);
    set('engine', !v.engineOn);
    set('left', (ui.turnSignal === 'left' || ui.hazard) && ui.blinkOn);
    set('right', (ui.turnSignal === 'right' || ui.hazard) && ui.blinkOn);
    set('hazard', ui.hazard && ui.blinkOn);
    set('head', ui.headlight > 0);
    // 돌발 경고등 — 실차의 차내 빨간 신호등
    set('sudden', exam && exam.suddenLamp);
    set('wiper', ui.wiper > 0);
  }

  // ------------------------------------------------------------ 미니맵
  drawMinimap(v, exam) {
    const ctx = this.map;
    const el = this.els.minimap.getBoundingClientRect();
    const w = el.width, h = el.height;
    ctx.clearRect(0, 0, w, h);

    const B = MAP_BOUNDS;
    const sx = w / (B.x2 - B.x1), sy = h / (B.z2 - B.z1);
    const s = Math.min(sx, sy);
    const ox = (w - (B.x2 - B.x1) * s) / 2 - B.x1 * s;
    const oy = (h - (B.z2 - B.z1) * s) / 2 - B.z1 * s;
    const X = (x) => ox + x * s;
    const Z = (z) => oy + z * s;

    ctx.fillStyle = 'rgba(10,14,20,0.72)';
    ctx.fillRect(0, 0, w, h);

    // 코스 면
    ctx.fillStyle = 'rgba(126,138,158,0.30)';
    ctx.strokeStyle = 'rgba(226,232,242,0.55)';
    ctx.lineWidth = 1;
    for (const r of RECTS) {
      ctx.fillRect(X(r.x1), Z(r.z1), (r.x2 - r.x1) * s, (r.z2 - r.z1) * s);
    }
    for (const r of RECTS) {
      ctx.strokeRect(X(r.x1), Z(r.z1), (r.x2 - r.x1) * s, (r.z2 - r.z1) * s);
    }

    // 주차 구획(배정된 곳만 진하게) · 경사로 정지구간 강조
    const assigned = (exam && exam.bay) || BAYS[1];
    for (const b of BAYS) {
      ctx.strokeStyle = b.id === assigned.id ? '#e2b33c' : 'rgba(226,179,60,0.35)';
      ctx.lineWidth = b.id === assigned.id ? 1.8 : 1;
      ctx.strokeRect(X(b.x1), Z(b.z1), (b.x2 - b.x1) * s, (b.z2 - b.z1) * s);
    }
    ctx.strokeStyle = '#e2b33c';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(X(CL.west - HALF), Z(RAMP.stopZ1), ROAD * s, (RAMP.stopZ2 - RAMP.stopZ1) * s);

    // 주행 경로
    ctx.beginPath();
    ROUTE.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))));
    ctx.strokeStyle = 'rgba(108,208,255,0.75)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 차량
    const c = Math.cos(v.heading), sn = Math.sin(v.heading);
    ctx.save();
    ctx.translate(X(v.x), Z(v.z));
    ctx.rotate(Math.atan2(sn, c));
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(-6, 5);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-6, -5);
    ctx.closePath();
    ctx.fillStyle = exam.failed ? '#ff6b5e' : '#6ce8a0';
    ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------------ 전면 유리 효과
  setRain(on) {
    this.rain = on;
    if (!on) this.drops.length = 0;
  }

  drawOverlay(v, ui, firstPerson, dt) {
    const ctx = this.overlay;
    const w = this.overlayW, h = this.overlayH;
    ctx.clearRect(0, 0, w, h);
    if (!firstPerson) { this.wiperActive = false; return; }

    // 빗방울 생성
    if (this.rain) {
      const n = Math.min(4, Math.floor(dt * 34) + (Math.random() < dt * 30 ? 1 : 0));
      for (let i = 0; i < n; i++) {
        if (this.drops.length > 460) break;
        this.drops.push({
          x: Math.random() * w,
          y: Math.random() * h * 0.82,
          r: 1.2 + Math.random() * 2.6,
          a: 0.25 + Math.random() * 0.4,
        });
      }
    }

    // 와이퍼 위상 진행
    const speedByLevel = [0, 0, 1.35, 2.1];
    let sweeping = false;
    if (ui.wiper === 1) {
      // 간헐: 3.4초마다 한 번 왕복
      this._lastWiperCycle += dt;
      if (this.wiperPhase > 0 && this.wiperPhase < 1) sweeping = true;
      else if (this._lastWiperCycle > 3.4) { this.wiperPhase = 0.0001; this._lastWiperCycle = 0; sweeping = true; }
      if (sweeping) this.wiperPhase += dt * 1.1;
      if (this.wiperPhase >= 1) this.wiperPhase = 0;
    } else if (ui.wiper >= 2) {
      this.wiperPhase = (this.wiperPhase + dt * speedByLevel[ui.wiper]) % 1;
      sweeping = true;
    } else {
      this.wiperPhase = 0;
    }
    this.wiperActive = sweeping;

    // 물방울 그리기
    if (this.drops.length) {
      ctx.save();
      for (const d of this.drops) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,226,246,${d.a * 0.5})`;
        ctx.fill();
      }
      ctx.restore();
    }

    if (ui.wiper > 0) {
      // 두 개의 블레이드가 좌우로 쓸고 지나간다.
      const t = this.wiperPhase;
      const sweep = t < 0.5 ? t * 2 : (1 - t) * 2;     // 0 → 1 → 0
      const pivots = [
        { x: w * 0.30, base: -20, span: 118 },
        { x: w * 0.72, base: -14, span: 112 },
      ];
      const len = h * 0.86;
      for (const p of pivots) {
        const ang = (p.base - p.span * sweep) * Math.PI / 180;
        const px = p.x, py = h + 12;
        // 지나간 자리의 물방울 제거
        if (this.drops.length) {
          this.drops = this.drops.filter((d) => {
            const dx = d.x - px, dy = d.y - py;
            const da = Math.atan2(dy, dx);
            const dd = Math.hypot(dx, dy);
            return !(dd < len && Math.abs(normalizeAngle(da - ang)) < 0.14);
          });
        }
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang);
        ctx.fillStyle = 'rgba(18,20,24,0.82)';
        ctx.fillRect(0, -4, len, 7);
        ctx.fillStyle = 'rgba(60,64,72,0.9)';
        ctx.fillRect(0, -2, len * 0.22, 4);
        ctx.restore();
      }
    }

    // 야간이 아니어도 시야 가장자리를 약간 어둡게 해 실차 시야감을 준다.
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
