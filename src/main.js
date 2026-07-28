// 대한민국 운전면허 장내기능시험 연습 프로그램 - 진입점.

import { Renderer3D } from './gfx/renderer.js';
import { M4, wrapAngle, clamp, approach } from './gfx/math.js';
import { Node } from './gfx/mesh.js';
import { buildCourse, POINT } from './sim/course.js';
import { Vehicle } from './sim/vehicle.js';
import { buildCar, EYE } from './sim/carmodel.js';
import { Exam, PASS_SCORE, TIME_LIMIT } from './sim/exam.js';
import { PartViewer } from './parts/viewer.js';
import { Input } from './ui/input.js';
import { Sound } from './ui/audio.js';
import { Hud } from './ui/hud.js';

const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------- 초기화

const sceneCanvas = $('#scene');
const renderer = new Renderer3D(sceneCanvas);
renderer.fog = { color: [169, 198, 222], start: 45, end: 195 };

const world = new Node('world');
const course = buildCourse();
world.add(course.root);

const car = buildCar();
world.add(car.root);

const vehicle = new Vehicle();
const exam = new Exam(vehicle);
const input = new Input();
const sound = new Sound();

const viewer = new PartViewer($('#partbox'));
const hud = new Hud({
  dash: $('#dash'),
  minimap: $('#minimap'),
  overlay: $('#overlay'),
  tell: {
    seatbelt: $('#tt-seatbelt'), brake: $('#tt-brake'), engine: $('#tt-engine'),
    left: $('#tt-left'), right: $('#tt-right'), hazard: $('#tt-hazard'),
    head: $('#tt-head'), wiper: $('#tt-wiper'), sudden: $('#tt-sudden'),
  },
});

// 조작 상태(차량 물리와는 별개로 관리되는 등화 · 편의장치)
const ui = {
  turnSignal: null,       // 'left' | 'right' | null
  blinkOn: false,
  hazard: false,
  wiper: 0,               // 0 OFF, 1 INT, 2 LO, 3 HI
  headlight: 0,           // 0 OFF, 1 미등, 2 하향등
  highBeam: false,        // 상향등 (하향등 상태에서 레버를 앞으로 밀면 켜진다)
  ignitionPressed: false,
};

let blinkTimer = 0;
let signalStartHeading = 0;
let cameraMode = 'interior';   // interior | chase | top
let camEye = [-16, 4, 0];
let camTarget = [0, 1, 0];
let camUp = [0, 1, 0];
let gazeYaw = 0;             // 고개를 돌린 각도(코너 안쪽을 본다)
let paused = false;
let lastWiperSweep = 0;

// ---------------------------------------------------------------- 조작 바인딩

function toggleSignal(side) {
  ui.turnSignal = ui.turnSignal === side ? null : side;
  if (ui.turnSignal) {
    signalStartHeading = vehicle.heading;
    blinkTimer = 0;
    ui.blinkOn = true;
  }
  viewer.request('turnSignal', ui.turnSignal
    ? `${side === 'left' ? '좌측' : '우측'} 방향지시등 작동`
    : '방향지시등 해제', { priority: 1, hold: 2.6 });
  sound.ensure();
}

input.on('q', () => toggleSignal('left'));
input.on('e', () => toggleSignal('right'));

input.on('z', () => {
  ui.wiper = (ui.wiper + 1) % 4;
  viewer.request('wiper', `와이퍼 ${['정지', '간헐 INT', '저속 LO', '고속 HI'][ui.wiper]}`,
    { priority: 1, hold: 2.8 });
  sound.ensure();
  if (ui.wiper > 0) sound.wiperSwoosh();
});

input.on('x', () => {
  ui.headlight = (ui.headlight + 1) % 3;
  if (ui.headlight < 2) ui.highBeam = false;   // 하향등이 아니면 상향등은 꺼진다
  viewer.request('headlight', `전조등 ${['소등', '미등', '하향등'][ui.headlight]}`,
    { priority: 1, hold: 2.8 });
  sound.ensure();
});

// 상향등. 실차는 방향지시등 레버를 앞으로 밀어 전환하며,
// 하향등이 켜져 있을 때만 들어온다.
input.on('v', () => {
  if (ui.headlight < 2) {
    toast('하향등을 먼저 켜야 상향등으로 전환할 수 있습니다.');
    return;
  }
  ui.highBeam = !ui.highBeam;
  viewer.request('headlight', ui.highBeam ? '상향등 전환' : '하향등 복귀',
    { priority: 1, hold: 2.8 });
  sound.ensure();
});

input.on('h', () => {
  ui.hazard = !ui.hazard;
  if (ui.hazard) { blinkTimer = 0; ui.blinkOn = true; }
  viewer.request('hazard', ui.hazard ? '비상점멸등 작동' : '비상점멸등 해제',
    { priority: 1, hold: 2.8 });
  sound.ensure();
});

input.on('b', () => {
  vehicle.seatbelt = !vehicle.seatbelt;
  viewer.request('seatbelt', vehicle.seatbelt ? '안전벨트 착용' : '안전벨트 해제',
    { priority: 1, hold: 2.6 });
  sound.ensure();
});

input.on('space', () => {
  vehicle.parkingBrake = !vehicle.parkingBrake;
  viewer.request('parkingBrake', vehicle.parkingBrake ? '주차 브레이크 체결' : '주차 브레이크 해제',
    { priority: 1, hold: 2.6 });
  sound.ensure();
});

input.on('enter', () => {
  sound.ensure();
  ui.ignitionPressed = true;
  setTimeout(() => { ui.ignitionPressed = false; }, 260);
  if (vehicle.engineOn) {
    if (Math.abs(vehicle.speed) < 0.2) {
      vehicle.stopEngine();
      toast('시동을 껐습니다.', 'info');
    } else {
      toast('주행 중에는 시동을 끌 수 없습니다.', 'warn');
    }
  } else {
    const r = vehicle.tryStart();
    if (r.ok) { sound.blip(140, 0.5, 0.2, 'sawtooth'); toast('시동을 걸었습니다.', 'ok'); }
    else if (r.reason) { toast(r.reason, 'warn'); sound.warn(); }
  }
  viewer.request('ignition', vehicle.engineOn ? '엔진 시동 ON' : '엔진 시동 OFF',
    { priority: 1, hold: 2.6 });
});

for (const [key, gear] of [['1', 'P'], ['2', 'R'], ['3', 'N'], ['4', 'D']]) {
  input.on(key, () => {
    sound.ensure();
    const r = vehicle.shift(gear);
    if (r.ok) {
      viewer.request('gear', `${gear} 단으로 변속`, { priority: 1, hold: 2.6 });
      sound.blip(520, 0.06, 0.12, 'square');
    } else if (r.reason) {
      toast(r.reason, 'warn');
      sound.warn();
    }
  });
}

input.on('c', () => {
  cameraMode = cameraMode === 'interior' ? 'chase' : cameraMode === 'chase' ? 'top' : 'interior';
  car.setInterior(cameraMode === 'interior');
  $('#view-mode').textContent = { interior: '운전석 시점', chase: '후방 시점', top: '부감 시점' }[cameraMode];
});

input.on('tab', () => viewer.cycle(1));
input.on('escape', () => viewer.unpin());
input.on('r', () => restart());
input.on('p', () => { paused = !paused; $('#paused').classList.toggle('hidden', !paused); });

// 화면 버튼 → 키 입력
document.querySelectorAll('[data-key]').forEach((btn) => {
  btn.addEventListener('click', () => {
    input.trigger(btn.dataset.key);
    sound.ensure();
  });
});
// 주행 버튼(누르고 있는 동안 유지)
document.querySelectorAll('[data-hold]').forEach((btn) => {
  const key = btn.dataset.hold;
  const down = (e) => { e.preventDefault(); input.keys.add(key); sound.ensure(); };
  const up = () => input.keys.delete(key);
  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointerleave', up);
  btn.addEventListener('pointercancel', up);
});

$('#btn-rain').addEventListener('click', (e) => {
  hud.setRain(!hud.rain);
  e.currentTarget.classList.toggle('active', hud.rain);
  e.currentTarget.textContent = hud.rain ? '☔ 빗방울 ON' : '☔ 빗방울 OFF';
  if (hud.rain) toast('비가 내립니다. 와이퍼(Z)를 작동시키십시오.', 'info');
});
$('#btn-sound').addEventListener('click', (e) => {
  sound.ensure();
  const muted = sound.enabled;
  sound.setMuted(muted);
  e.currentTarget.classList.toggle('active', !muted);
  e.currentTarget.textContent = muted ? '🔇 소리 OFF' : '🔊 소리 ON';
});
$('#btn-voice').addEventListener('click', (e) => {
  sound.speechOn = !sound.speechOn;
  e.currentTarget.classList.toggle('active', sound.speechOn);
  e.currentTarget.textContent = sound.speechOn ? '🗣 음성 안내 ON' : '🗣 음성 안내 OFF';
});
$('#btn-restart').addEventListener('click', () => restart());
$('#result-restart').addEventListener('click', () => restart());
$('#btn-help').addEventListener('click', () => $('#help').classList.toggle('hidden'));
$('#help-close').addEventListener('click', () => $('#help').classList.add('hidden'));

// ---------------------------------------------------------------- 토스트

const toastBox = $('#toasts');
function toast(text, tone = 'info') {
  const el = document.createElement('div');
  el.className = 'toast ' + tone;
  el.textContent = text;
  toastBox.prepend(el);
  setTimeout(() => { el.classList.add('out'); }, 3200);
  setTimeout(() => el.remove(), 3900);
  while (toastBox.children.length > 5) toastBox.lastChild.remove();
}

// ---------------------------------------------------------------- 재시작

function restart() {
  // 출발 지점은 좌측 상단 두 칸 중 동쪽 칸. 남쪽(+Z)을 향한다.
  vehicle.reset(POINT.startX, POINT.startZ, Math.PI / 2);
  exam.reset();
  ui.turnSignal = null;
  ui.hazard = false;
  ui.wiper = 0;
  ui.headlight = 0;
  viewer.pinned = null;
  $('#result').classList.add('hidden');
  toastBox.innerHTML = '';
  toast('새 시험을 시작합니다.', 'ok');
}

// ---------------------------------------------------------------- 루프

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  requestAnimationFrame(frame);
  if (paused) return;

  input.update(dt);

  // ---- 방향지시등 점멸 ----
  const blinking = ui.hazard || ui.turnSignal;
  if (blinking) {
    blinkTimer += dt;
    if (blinkTimer >= 0.38) {
      blinkTimer = 0;
      ui.blinkOn = !ui.blinkOn;
      sound.tick(ui.blinkOn);
    }
  } else {
    ui.blinkOn = false;
  }
  // 회전이 끝나면 방향지시등 자동 소등(실차 동작)
  if (ui.turnSignal && !ui.hazard) {
    const turned = wrapAngle(vehicle.heading - signalStartHeading);
    const want = ui.turnSignal === 'left' ? -1 : 1;
    if (turned * want > 1.05 && Math.abs(vehicle.steer) < 0.06) {
      ui.turnSignal = null;
    }
  }

  // ---- 물리 ----
  if (exam.phase !== 'done') {
    vehicle.step(dt, { throttle: input.throttle, brake: input.brake, steer: input.steer });
  } else {
    vehicle.step(dt, { throttle: 0, brake: 1, steer: 0 });
  }

  // ---- 시험 진행 ----
  const before = { failed: exam.failed, phase: exam.phase };
  exam.update(dt, ui);
  for (const ev of exam.events) {
    toast(ev.text, ev.tone === 'deduct' ? 'warn' : ev.tone === 'fail' ? 'fail'
      : ev.tone === 'pass' ? 'ok' : ev.tone === 'ok' ? 'ok' : 'info');
    if (ev.tone === 'deduct') sound.warn();
    else if (ev.tone === 'fail') sound.fail();
    else if (ev.tone === 'pass') sound.chime();
    else if (ev.tone === 'ok') sound.ok();
    else sound.speak(ev.text);
    if (ev.tone === 'deduct' || ev.tone === 'fail') sound.speak(ev.text);
  }
  exam.events.length = 0;
  if (exam.partRequest) {
    const p = exam.partRequest;
    viewer.request(p.id, p.reason, { priority: p.priority, hold: p.hold });
  }
  if (!before.failed && exam.phase === 'done') showResult();

  // ---- 신호등(두 곳) · 돌발 표지판 ----
  for (const set of [course.lamps, course.lamps2]) {
    for (const [name, lamp] of Object.entries(set)) {
      const on = exam.signalPhase === name;
      lamp.node.mesh.faces.forEach((f) => { f.color = on ? lamp.on : lamp.off; f.unlit = on; });
    }
  }
  const suddenOn = exam.suddenLamp && Math.floor(exam.elapsed * 4) % 2 === 0;
  course.suddenFace.faces.forEach((f) => { f.color = suddenOn ? [235, 60, 48] : [70, 24, 22]; });

  // ---- 차량 · 부품 표시 ----
  car.update(vehicle, ui, dt);
  const partState = {
    turnSignal: ui.turnSignal, blinkOn: ui.blinkOn, hazard: ui.hazard,
    wiper: ui.wiper, headlight: ui.headlight, highBeam: ui.highBeam,
    ignitionPressed: ui.ignitionPressed,
    gear: vehicle.gear, parkingBrake: vehicle.parkingBrake, seatbelt: vehicle.seatbelt,
    engineOn: vehicle.engineOn, steerAngle: vehicle.steer, handAngle: vehicle.handAngle,
    throttle: vehicle.throttle, brake: vehicle.brake,
  };
  viewer.update(partState, dt);

  // ---- 카메라 ----
  updateCamera(dt);

  // ---- 그리기 ----
  drawSky();
  renderer.render(world, {
    eye: camEye,
    target: camTarget,
    up: cameraMode === 'top' ? [0, 0, -1] : (cameraMode === 'interior' ? camUp : [0, 1, 0]),
    // 운전석 시점의 시야각. 세로 52도는 이 화면 비율에서 가로 약 64도로,
    // 모니터를 보는 거리에서 사람이 실제로 보는 것과 비슷한 배율이 된다.
    // 넓게 잡으면 원근이 과장돼 거리감이 실제보다 멀게 느껴진다.
    fov: cameraMode === 'top' ? 46 : (cameraMode === 'interior' ? 52 : 62),
    near: 0.12,
  });

  hud.drawDash(vehicle, ui);
  hud.updateTelltales(vehicle, ui, exam);
  hud.drawMinimap(vehicle, exam);
  hud.drawOverlay(vehicle, ui, cameraMode === 'interior', dt);
  viewer.render();
  updatePanels();

  // ---- 소리 ----
  sound.updateEngine(vehicle.rpm, vehicle.speed, vehicle.throttle);
  if (hud.wiperActive) {
    const phase = hud.wiperPhase;
    if ((lastWiperSweep < 0.5 && phase >= 0.5) || (lastWiperSweep > phase)) sound.wiperSwoosh();
    lastWiperSweep = phase;
  }
}

function updateCamera(dt) {
  const v = vehicle;
  const carM = M4.chain(
    M4.translate(v.x, v.y + v.bodyBounce, v.z),
    M4.rotY(-v.heading),
    M4.rotZ(v.pitch),
    M4.rotX(v.roll),
  );
  if (cameraMode === 'interior') {
    // 1톤 화물차 운전자 눈높이(노면에서 1.62m). 캡오버형이라 시야가 승용차보다 높다.
    camEye = M4.xformPoint(carM, EYE);

    // 시선 — 사람은 정면을 멍하니 보는 게 아니라 "가려는 지점"을 본다.
    //
    // 주시점까지의 거리는 속도에 따라 달라진다. 서 있을 때는 코앞을,
    // 속도가 붙으면 멀리 본다. 그 지점을 내려다보는 각도가 곧 시선의
    // 내림각이 되므로, 천천히 갈수록 자연스럽게 노면 가까이를 보게 된다.
    const aim = 9 + Math.abs(v.speed) * 1.4;
    const drop = Math.atan2(EYE[1], aim);

    // 코너에서는 고개를 돌려 돌아 들어갈 쪽을 본다. 실제 운전자도
    // 핸들을 감기 전에 시선이 먼저 그쪽으로 간다.
    gazeYaw = approach(gazeYaw, clamp(v.steer * 0.5, -0.26, 0.26), dt * 2.4);

    const L = 16;
    camTarget = M4.xformPoint(carM, [
      EYE[0] + L * Math.cos(gazeYaw),
      EYE[1] - L * Math.tan(drop),
      EYE[2] + L * Math.sin(gazeYaw),
    ]);
    // 머리는 차체와 함께 기운다. 차가 롤하면 지평선도 같이 기울어야 한다.
    const upPt = M4.xformPoint(carM, [EYE[0], EYE[1] + 1, EYE[2]]);
    camUp = [upPt[0] - camEye[0], upPt[1] - camEye[1], upPt[2] - camEye[2]];
  } else if (cameraMode === 'chase') {
    const want = M4.xformPoint(M4.chain(M4.translate(v.x, v.y, v.z), M4.rotY(-v.heading)),
      [-9.2, 3.3, 0]);
    const k = Math.min(1, dt * 4.5);
    camEye = [
      camEye[0] + (want[0] - camEye[0]) * k,
      camEye[1] + (want[1] - camEye[1]) * k,
      camEye[2] + (want[2] - camEye[2]) * k,
    ];
    camTarget = M4.xformPoint(M4.chain(M4.translate(v.x, v.y, v.z), M4.rotY(-v.heading)),
      [5.0, 1.4, 0]);
  } else {
    camEye = [v.x, v.y + 38, v.z + 0.001];
    camTarget = [v.x, v.y, v.z];
  }
}

function drawSky() {
  const ctx = renderer.ctx;
  const w = renderer.width, h = renderer.height;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, hud.rain ? '#6d7885' : '#7fa8d4');
  g.addColorStop(0.55, hud.rain ? '#96a0aa' : '#a9c6de');
  g.addColorStop(1, hud.rain ? '#a6adb4' : '#c3d2dd');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// ---------------------------------------------------------------- 패널 갱신

const stageListEl = $('#stages');
const deductListEl = $('#deducts');
let lastStageSig = '';
let lastDeductCount = -1;

function updatePanels() {
  $('#score').textContent = String(Math.max(0, exam.score));
  $('#score').className = exam.score >= PASS_SCORE ? 'value pass' : 'value fail';
  const left = Math.max(0, TIME_LIMIT - exam.elapsed);
  $('#time').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  $('#instruction').textContent = exam.instruction;
  $('#detail').textContent = exam.detail;

  const sig = exam.stageList.map((s) => s.id + s.state).join('|');
  if (sig !== lastStageSig) {
    lastStageSig = sig;
    stageListEl.innerHTML = '';
    for (const s of exam.stageList) {
      const li = document.createElement('li');
      li.className = s.state;
      li.innerHTML = `<span class="mark"></span><span>${s.name}</span>`;
      stageListEl.appendChild(li);
    }
  }
  if (exam.deductions.length !== lastDeductCount) {
    lastDeductCount = exam.deductions.length;
    deductListEl.innerHTML = '';
    if (!exam.deductions.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = '감점 없음';
      deductListEl.appendChild(li);
    }
    for (const d of exam.deductions.slice().reverse()) {
      const li = document.createElement('li');
      li.innerHTML = `<span>${d.label}${d.extra ? ` <em>${d.extra}</em>` : ''}</span><b>-${d.points}</b>`;
      deductListEl.appendChild(li);
    }
  }
}

function showResult() {
  const box = $('#result');
  box.classList.remove('hidden');
  const pass = exam.passed;
  $('#result-title').textContent = pass ? '합격' : '불합격';
  $('#result-title').className = pass ? 'pass' : 'fail';
  $('#result-score').textContent = `${Math.max(0, exam.score)}점 / 100점 (합격 기준 ${PASS_SCORE}점)`;
  $('#result-reason').textContent = exam.failReason ? `사유: ${exam.failReason}` : '';
  const ul = $('#result-list');
  ul.innerHTML = '';
  if (!exam.deductions.length) {
    const li = document.createElement('li');
    li.textContent = '감점 항목이 없습니다.';
    ul.appendChild(li);
  }
  for (const d of exam.deductions) {
    const li = document.createElement('li');
    li.innerHTML = `<span>${d.label}${d.extra ? ` <em>${d.extra}</em>` : ''}</span><b>-${d.points}점</b>`;
    ul.appendChild(li);
  }
  $('#result-time').textContent = `소요 시간 ${Math.floor(exam.elapsed / 60)}분 ${Math.floor(exam.elapsed % 60)}초`;
}

// ---------------------------------------------------------------- 리사이즈

function resize() {
  const r = $('#viewport').getBoundingClientRect();
  renderer.resize(r.width, r.height);
  hud.resize();
  viewer.resize();
}
window.addEventListener('resize', resize);

car.setInterior(true);
resize();
restart();
requestAnimationFrame(frame);

// 디버깅 · 자동 주행 검증용 훅.
window.__sim = { vehicle, exam, ui, input, hud, viewer, car, course, toast };
