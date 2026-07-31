// 터치 조작 (모바일).
//
// 배치는 실제 운전석을 화면에 펼쳐 놓은 형태다.
//   좌상단 변속 레버 · 상단 룸미러 · 좌우 사이드미러 · 우상단 코스도
//   우측 방향지시등/비상등 · 좌하단 스티어링 휠
//   하단 계기 버튼(안전벨트 · 시동 · 주차브레이크 · 하향등 · 상향등 · 와이퍼)
//   우하단 브레이크 · 가속 페달
//
// 물리 모델은 손대지 않는다. 여기서 하는 일은 손가락 움직임을 기존 입력값
// (steer -1..1, throttle 0..1, brake 0..1)과 키 동작으로 바꿔 주는 것뿐이다.
//
// 스티어링 휠은 실제로 "돌린다". 돌린 각도를 그대로 조향 입력으로 쓰기 때문에
// 락투락 3.6회전이라는 실차 조향비가 손끝에 그대로 남는다. 한 번에 다 못 돌리면
// 실차처럼 여러 번 나눠 감으면 된다.

import { SPEC } from '../sim/vehicle.js';

const TAU = Math.PI * 2;
// 한쪽 끝까지 감았을 때의 핸들 각도(rad). 앞바퀴 최대각 × 조향비.
const LOCK = SPEC.maxSteer * SPEC.steerRatio;

const GEARS = ['P', 'R', 'N', 'D'];

export class TouchControls {
  constructor(root, input, opts = {}) {
    this.input = input;
    this.onKey = opts.onKey || (() => {});
    this.el = root;
    this.wheelAngle = 0;
    this.dragging = null;
    this.enabled = false;
    this._build();
  }

  static shouldEnable() {
    return window.matchMedia('(pointer: coarse)').matches ||
      window.matchMedia('(max-width: 900px)').matches;
  }

  setEnabled(on) {
    this.enabled = on;
    this.el.classList.toggle('on', on);
    document.body.classList.toggle('touch-mode', on);
    if (!on) this.input.analog.steer = null;
  }

  // 룸미러 · 사이드미러 캔버스를 Mirrors 에 넘겨 준다
  mirrorCanvases() {
    return {
      room: this.el.querySelector('[data-mirror=room]'),
      left: this.el.querySelector('[data-mirror=left]'),
      right: this.el.querySelector('[data-mirror=right]'),
    };
  }

  // ---------------------------------------------------------------- 구성
  _build() {
    this.el.innerHTML = `
      <!-- 좌상단 변속 레버 -->
      <div class="tc-shift" data-role="shift">
        <div class="tc-shift-slot">
          <div class="tc-shift-knob" data-role="knob"></div>
        </div>
        <div class="tc-shift-labels">
          ${GEARS.map((g) => `<button data-key="${'1234'['PRND'.indexOf(g)]}" data-gear="${g}">${g}</button>`).join('')}
        </div>
      </div>

      <!-- 룸미러 -->
      <div class="tc-mirror room"><canvas data-mirror="room"></canvas></div>
      <!-- 사이드미러 -->
      <div class="tc-mirror side left"><canvas data-mirror="left"></canvas></div>
      <div class="tc-mirror side right"><canvas data-mirror="right"></canvas></div>

      <!-- 우상단 버튼 -->
      <div class="tc-topright">
        <button class="tc-round sm" data-key="c" title="시점 전환">◉</button>
        <button class="tc-round sm" data-role="more" title="더보기">≡</button>
      </div>

      <!-- 방향지시등 · 비상등 -->
      <div class="tc-signals">
        <button class="tc-round" data-key="q" data-tt="left">◀</button>
        <button class="tc-round hz" data-key="h" data-tt="hazard">△</button>
        <button class="tc-round" data-key="e" data-tt="right">▶</button>
      </div>

      <!-- 속도 -->
      <div class="tc-speed"><b data-role="kmh">0</b><span>km/h</span></div>

      <!-- 스티어링 휠 -->
      <div class="tc-wheel" data-role="wheel">
        <svg viewBox="-100 -100 200 200" data-role="wheelsvg">
          <circle class="rim-out" cx="0" cy="0" r="92"/>
          <circle class="rim" cx="0" cy="0" r="86"/>
          <g class="spokes">
            <path d="M-80 -4 h60 a10 10 0 0 1 0 24 h-60 a12 12 0 0 1 0 -24z"/>
            <path d="M20 -4 h60 a12 12 0 0 1 0 24 h-60 a10 10 0 0 1 0 -24z"/>
            <path d="M-11 14 h22 a11 11 0 0 1 0 62 h-22 a11 11 0 0 1 0 -62z"/>
          </g>
          <circle class="hub" cx="0" cy="0" r="30"/>
          <circle class="hub2" cx="0" cy="0" r="20"/>
          <rect class="mark" x="-5" y="-99" width="10" height="20" rx="3"/>
        </svg>
        <div class="tc-angle" data-role="angle">중립</div>
      </div>

      <!-- 하단 계기 버튼 -->
      <div class="tc-dashrow">
        <button class="tc-round dash" data-key="b" data-lit="belt"><span>⛊</span><i>안전벨트</i></button>
        <button class="tc-round dash start" data-key="enter" data-lit="engine"><span>ENGINE<br>START</span></button>
        <button class="tc-round dash" data-key="space" data-lit="pbrake"><span>ⓟ</span><i>주차</i></button>
        <button class="tc-round dash" data-key="x" data-lit="low"><span>≡D</span><i>전조등</i></button>
        <button class="tc-round dash" data-key="v" data-lit="high"><span>≣D</span><i>상향등</i></button>
        <button class="tc-round dash" data-key="z" data-lit="wiper"><span>⌒</span><i>와이퍼</i></button>
      </div>

      <!-- 페달 -->
      <div class="tc-pedals">
        <button class="tc-pedal brake" data-hold="down"><span>브레이크</span></button>
        <button class="tc-pedal gas" data-hold="up"><span>가속</span></button>
      </div>

      <!-- 시험관 안내 -->
      <div class="tc-say"><span data-role="say"></span><i data-role="say2"></i></div>

      <!-- 더보기 시트 -->
      <div class="tc-sheet" data-role="sheet">
        <div class="tc-sheet-inner">
          <div class="tc-sheet-head"><b>코스 진행 · 감점</b><button data-role="close">닫기</button></div>
          <div class="tc-info" data-role="info"></div>
          <div class="tc-sheet-head"><b>그 밖의 조작</b></div>
          <div class="tc-grid">
            <button data-key="tab">부품 살펴보기</button>
            <button data-key="p">일시정지</button>
            <button data-role="rain">☔ 빗방울</button>
            <button data-key="r" class="warn">처음부터</button>
          </div>
        </div>
      </div>`;

    const $ = (s) => this.el.querySelector(s);
    this.wheelEl = $('[data-role=wheel]');
    this.wheelSvg = $('[data-role=wheelsvg]');
    this.angleEl = $('[data-role=angle]');
    this.kmhEl = $('[data-role=kmh]');
    this.sayEl = $('[data-role=say]');
    this.say2El = $('[data-role=say2]');
    this.knob = $('[data-role=knob]');
    this.sheet = $('[data-role=sheet]');
    this.infoEl = $('[data-role=info]');

    $('[data-role=more]').addEventListener('click', () => this.sheet.classList.add('open'));
    $('[data-role=close]').addEventListener('click', () => this.sheet.classList.remove('open'));
    this.sheet.addEventListener('click', (e) => {
      if (e.target === this.sheet) this.sheet.classList.remove('open');
    });
    $('[data-role=rain]').addEventListener('click', () => {
      const b = document.querySelector('#btn-rain');
      if (b) b.click();
    });

    // 단발 버튼 — 키 입력을 흉내 낸다
    this.el.querySelectorAll('[data-key]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.classList.add('press');
        this.onKey(b.dataset.key);
      });
      const off = () => b.classList.remove('press');
      for (const t of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(t, off);
    });

    // 페달 — 누르고 있는 동안 유지. 키보드와 같은 경사로 차오르므로
    // 조작 감각이 키보드와 완전히 같다.
    this.el.querySelectorAll('[data-hold]').forEach((b) => {
      const key = b.dataset.hold;
      const down = (e) => {
        e.preventDefault();
        // 입력 반영을 먼저 한다. 포인터 캡처가 실패해 예외가 나면
        // 뒤 코드가 통째로 안 돌아 페달이 먹통이 된다.
        b.classList.add('press');
        this.input.keys.add(key);
        try { b.setPointerCapture(e.pointerId); } catch { /* 없어도 된다 */ }
      };
      const up = () => { b.classList.remove('press'); this.input.keys.delete(key); };
      b.addEventListener('pointerdown', down);
      for (const t of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(t, up);
    });

    this._bindWheel();
  }

  // ---------------------------------------------------------------- 핸들
  _bindWheel() {
    const el = this.wheelEl;
    let last = 0;
    const ang = (e) => {
      const r = el.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
    };

    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.dragging !== null) return;
      this.dragging = e.pointerId;
      el.classList.add('grab');
      last = ang(e);
      try { el.setPointerCapture(e.pointerId); } catch { /* 없어도 된다 */ }
    });

    el.addEventListener('pointermove', (e) => {
      if (this.dragging !== e.pointerId) return;
      // -π ~ π 를 넘어가도 이어지도록 증분으로 누적한다. 그래야 한 바퀴를 넘겨 감을 수 있다.
      const th = ang(e);
      let d = th - last;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      last = th;
      this.wheelAngle = clamp(this.wheelAngle + d, -LOCK, LOCK);
      this.input.analog.steer = clamp(this.wheelAngle / LOCK, -1, 1);
    });

    const release = (e) => {
      if (this.dragging !== e.pointerId) return;
      this.dragging = null;
      el.classList.remove('grab');
      // 손을 떼면 조향 입력을 놓는다. 이후 핸들이 돌아오는 속도는 차량 모델의
      // 셀프 얼라이닝이 정한다(정차 중에는 거의 돌아오지 않는다).
      this.input.analog.steer = null;
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  }

  // ---------------------------------------------------------------- 갱신
  update(vehicle, ui, exam) {
    if (!this.enabled) return;

    // 화면 핸들은 손가락이 아니라 실제 차의 핸들 각도를 따라 그린다.
    // 조향 속도 제한과 셀프 얼라이닝이 그대로 눈에 보인다.
    const hand = vehicle.handAngle;
    if (this.dragging === null) this.wheelAngle = hand;
    this.wheelSvg.style.transform = `rotate(${hand}rad)`;
    const deg = Math.round(-hand * 180 / Math.PI);
    this.angleEl.textContent = Math.abs(deg) < 3 ? '중립'
      : `${deg > 0 ? '좌' : '우'} ${Math.abs(deg)}°`;

    this.kmhEl.textContent = Math.round(vehicle.speedKmh);

    // 변속 레버 손잡이를 현재 단으로 옮긴다
    const gi = GEARS.indexOf(vehicle.gear);
    this.knob.style.transform = `translateY(${gi * 100}%)`;
    for (const b of this.el.querySelectorAll('[data-gear]')) {
      b.classList.toggle('lit', b.dataset.gear === vehicle.gear);
    }

    const lit = {
      left: ui.turnSignal === 'left', right: ui.turnSignal === 'right', hazard: ui.hazard,
      belt: vehicle.seatbelt, engine: vehicle.engineOn, pbrake: vehicle.parkingBrake,
      low: ui.headlight > 0, high: ui.highBeam, wiper: ui.wiper > 0,
    };
    for (const b of this.el.querySelectorAll('[data-tt]')) b.classList.toggle('lit', !!lit[b.dataset.tt]);
    for (const b of this.el.querySelectorAll('[data-lit]')) b.classList.toggle('lit', !!lit[b.dataset.lit]);

    // 시험관 안내를 화면 아래에 초록 글씨로. 지시와 상세를 두 줄로 나눈다.
    if (exam.instruction !== this._say1) { this._say1 = exam.instruction; this.sayEl.textContent = exam.instruction; }
    const d = exam.detail && exam.detail !== exam.instruction ? exam.detail : '';
    if (d !== this._say2) { this._say2 = d; this.say2El.textContent = d; }

    if (this.sheet.classList.contains('open')) this._info(exam);
  }

  _info(exam) {
    const st = exam.stageList.map((s) => `<div class="row ${s.state}">${s.name}</div>`).join('');
    const d = exam.deductions.length
      ? exam.deductions.map((x) => `<div class="row d">${x.label} <b>-${x.points}</b></div>`).join('')
      : '<div class="row">감점 없음</div>';
    this.infoEl.innerHTML = st + '<hr>' + d;
  }
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
