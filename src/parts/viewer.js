// 화면 구석의 부품 3D 뷰어.
// 시험 진행 중 조작이 필요한 순간(방향지시등, 와이퍼, 기어, 시동 …)마다
// 해당 기능을 실제로 수행하는 자동차 부품을 띄워 보여준다.

import { Renderer3D } from '../gfx/renderer.js';
import { M4, V3 } from '../gfx/math.js';
import { createParts } from './carparts.js';

const TONE_CLASS = {
  green: 'tone-green',
  red: 'tone-red',
  amber: 'tone-amber',
  off: 'tone-off',
};

export class PartViewer {
  constructor(root) {
    this.el = root;
    this.canvas = root.querySelector('canvas');
    this.titleEl = root.querySelector('[data-role=title]');
    this.subEl = root.querySelector('[data-role=subtitle]');
    this.statusEl = root.querySelector('[data-role=status]');
    this.reasonEl = root.querySelector('[data-role=reason]');

    this.renderer = new Renderer3D(this.canvas);
    this.renderer.ambient = 0.54;
    this.renderer.diffuse = 0.60;

    this.parts = createParts();
    this.order = Object.keys(this.parts);

    this.current = null;      // 현재 표시 중인 부품 id
    this.reason = '';
    this.hold = 0;            // 남은 표시 시간(초)
    this.priority = -1;
    this.pinned = null;       // 사용자가 직접 고정한 부품
    this.spin = 0;
    this.visible = false;
    this.introT = 0;
  }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.renderer.resize(Math.max(80, r.width), Math.max(60, r.height));
  }

  // 부품 표시 요청.
  //  priority: 큰 값이 우선. 시험관 지시(3) > 감점 경고(2) > 사용자 조작(1)
  request(id, { reason = '', hold = 3.2, priority = 1 } = {}) {
    if (!this.parts[id]) return;
    if (this.pinned) return;
    if (id === this.current) {
      this.hold = Math.max(this.hold, hold);
      this.priority = Math.max(this.priority, priority);
      if (reason) this.reason = reason;
      return;
    }
    if (priority < this.priority && this.hold > 0) return;
    this.current = id;
    this.reason = reason;
    this.hold = hold;
    this.priority = priority;
    this.introT = 0;
  }

  // 사용자가 부품을 직접 넘겨 보는 기능(Tab 키).
  cycle(dir = 1) {
    const i = this.pinned ? this.order.indexOf(this.pinned) : this.order.indexOf(this.current);
    const next = this.order[(i + dir + this.order.length) % this.order.length];
    this.pinned = next;
    this.current = next;
    this.reason = '부품 살펴보기 (Tab: 다음, Esc: 해제)';
    this.introT = 0;
  }

  unpin() {
    this.pinned = null;
    this.hold = 0.6;
    this.priority = -1;
  }

  update(state, dt) {
    if (!this.pinned) {
      this.hold -= dt;
      if (this.hold <= 0) {
        this.priority = -1;
        // 표시할 것이 없으면 조향 상태를 보여 준다(항상 비어 있지 않도록).
        if (this.hold < -0.4) this.current = state.engineOn ? 'steering' : 'ignition';
      }
    }
    this.introT = Math.min(1, this.introT + dt * 3);
    this.spin += dt;

    const part = this.parts[this.current];
    if (!part) { this.setVisible(false); return; }
    this.setVisible(true);
    part.update(state, dt);

    if (this.titleEl.textContent !== part.title) {
      this.titleEl.textContent = part.title;
      this.subEl.textContent = part.subtitle;
    }
    const st = part.status ? part.status(state) : null;
    if (st) {
      this.statusEl.textContent = st.text;
      this.statusEl.className = 'part-status ' + (TONE_CLASS[st.tone] || 'tone-off');
    }
    this.reasonEl.textContent = this.reason || '';
    this.reasonEl.style.display = this.reason ? '' : 'none';
  }

  setVisible(v) {
    if (this.visible === v) return;
    this.visible = v;
    this.el.classList.toggle('off', !v);
  }

  render() {
    const part = this.parts[this.current];
    if (!part) return;
    const ctx = this.renderer.ctx;
    const w = this.renderer.width, h = this.renderer.height;

    ctx.save();
    const g = ctx.createRadialGradient(w * 0.5, h * 0.42, 4, w * 0.5, h * 0.5, w * 0.75);
    g.addColorStop(0, '#2b3340');
    g.addColorStop(1, '#12151c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // 완만한 좌우 스윙 + 등장 시 살짝 당겨지는 연출
    const cam = part.camera;
    const swing = Math.sin(this.spin * 0.45) * 0.22;
    const zoom = 1 + (1 - this.introT) * 0.35;
    const eye = M4.xformPoint(M4.rotY(swing), V3.scale(cam.eye, zoom));
    this.renderer.render(part.root, {
      eye: [eye[0] + cam.target[0], eye[1], eye[2] + cam.target[2]],
      target: cam.target,
      fov: cam.fov,
      near: 0.02,
    });
  }
}
