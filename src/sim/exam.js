// 기능시험 진행 · 채점 엔진 (제1종 보통면허 · 자동변속기)
//
// 진행 순서는 부산북부운전면허시험장 「제1·2종 보통기능시험 진행도」를 따랐다.
//
//   운전장치조작 ▶ 출발 ▶ 경사로 ▶ 신호교차로(좌회전) ▶ 직각주차
//   ▶ 신호교차로(좌회전) ▶ 가속구간(기어변속) ▶ 종료
//
// 차로준수와 돌발 급정지는 특정 구간이 아니라 전 구간에 걸쳐 적용된다.
// 돌발은 시험관이 임의의 지점에서 지시하므로, 이 프로그램도 매 시험마다
// 다른 지점에서 지시한다.
//
// 단계 전환은 "본선 경로를 얼마나 진행했는가(progress, m)"로만 판단한다.
// 좌표 한 개로 판단하면 단계가 늦게 시작될 때 완료 조건이 이미 참이라 통째로
// 건너뛰거나, 조건을 만족시킬 기회를 놓쳐 영영 끝나지 않는 문제가 생긴다.
// 진행도는 줄어들지 않으므로 순서가 뒤바뀌거나 되돌아가는 일이 없다.
//
// 합격기준과 실격기준은 도로교통법 시행규칙 [별표 24] "기능시험 채점기준·합격기준"
// 의 제1종 보통면허 기준을 따랐다.
//   합격: 100점 만점에 80점 이상
//   실격: (1) 특별한 사유 없이 출발선에서 30초 이내 출발하지 못한 때
//         (2) 시험 코스를 어느 하나라도 이행하지 아니한 때
//         (3) 특별한 사유 없이 교차로 내에서 30초 이상 정차한 때
//         (4) 안전사고를 일으키거나 단 1회라도 차로를 벗어난 때
//         (5) 경사로 정지구간 이행 후 30초를 초과하여 통과하지 못한 때, 또는
//             경사로 정지구간에서 후진하여 앞범퍼가 경사로 사면을 벗어난 때
//         (6) 시험이 시작될 때부터 종료될 때까지 좌석안전띠를 착용하지 않은 경우
//
// ※ 개별 감점 항목의 배점은 공개된 자료를 바탕으로 재구성한 근사치이다.
// ※ 진행도의 "가속구간(기어변속)"은 수동변속기 기준 항목이다. 자동변속기는
//    기어변속 없이 20km/h 이상으로 통과하면 된다.

import {
  insideCourse, nearCourseEdge, crossedCenterLine, routeProgress,
  BAYS, RAMP, POINT, CL, HALF, EDGE,
} from './course.js';
import { SPEC } from './vehicle.js';

export const PASS_SCORE = 80;
export const TIME_LIMIT = 900;      // 전체 제한시간(초)

// 차체 기준 위치
const NOSE = SPEC.wheelbase / 2 + SPEC.frontOverhang;   // 앞범퍼
const FRONT_AXLE = SPEC.wheelbase / 2;                  // 앞바퀴 축

// 감점 항목 (코드: [명칭, 점수, 최대 적용 횟수])
export const DEDUCTIONS = {
  gearMiss:      ['기어 변속 조작 미숙', 5, 3],
  signalMiss:    ['방향지시등 미작동', 5, 6],
  brakeNotOff:   ['주차 브레이크 미해제 출발', 10, 1],
  roughStart:    ['급조작 · 급출발', 7, 3],
  overSpeed:     ['지시속도 위반 (과속)', 10, 3],
  accelSlow:     ['가속구간 지시속도 미달', 10, 1],
  centerLine:    ['중앙선 침범', 10, 3],
  rampNoStop:    ['경사로 정지구간 미정차', 10, 1],
  suddenMiss:    ['돌발 급정지 조치 미흡', 10, 1],
  parkTimeout:   ['직각주차 시간 초과', 10, 1],
  vibration:     ['심한 진동', 5, 3],
  finishMiss:    ['종료 조작 미이행', 10, 1],
};

// 실격 사유 (별표 24)
export const FAILS = {
  noStart:      '특별한 사유 없이 출발선에서 30초 이내 출발하지 못한 때',
  courseSkip:   '시험 코스를 이행하지 아니한 때',
  crossIdle:    '특별한 사유 없이 교차로 내에서 30초 이상 정차한 때',
  laneOut:      '안전사고를 일으키거나 단 1회라도 차로를 벗어난 때',
  rampSlow:     '경사로 정지구간 이행 후 30초를 초과하여 통과하지 못한 때',
  rampRoll:     '경사로 정지구간에서 후진하여 앞범퍼가 경사로 사면을 벗어난 때',
  noSeatbelt:   '시험 시작부터 종료까지 좌석안전띠를 착용하지 않은 때',
  signalRun:    '신호 위반 (적색신호에 정지선 통과)',
  timeout:      '시험시간 초과',
  lowScore:     '합격 기준(80점) 미달',
};

// 주행 단계. until 은 "이 진행거리(m)를 넘으면 단계가 끝난다".
// 본선 전체 길이는 378m 이다.
//   s=  0       출발 지점
//   s= 16       경사로 오르막 시작 · s=24~26 정지구간 · s=46 내리막 끝
//   s= 73.8     신호교차로 #1 (좌회전)
//   s= 95.5~159.5  직각주차 전면 통로
//   s=177.3     신호교차로 #2 (좌회전)
//   s=195~225   가속구간
//   s=378       종료 지점
const STAGES = [
  { id: 'start',   name: '출발',               until: 14 },
  { id: 'ramp',    name: '경사로',             until: 58 },
  { id: 'signal1', name: '신호교차로 (좌회전)', until: 92 },
  { id: 'parking', name: '직각주차',           until: 164 },
  { id: 'signal2', name: '신호교차로 (좌회전)', until: 187 },
  { id: 'accel',   name: '가속구간',           until: 242 },
  { id: 'finish',  name: '종료',               until: Infinity },
];

const STAGE_DEFS = [{ id: 'controls', name: '운전장치 조작' }, ...STAGES];

// 방향지시등을 켜야 하는 지점(진행거리 기준).
// at 을 지나는 순간의 상태를 본다. from 부터 안내가 뜬다.
const SIGNAL_POINTS = [
  { id: 'start',   side: 'left',  from: 0,   at: 8,   why: '출발' },
  { id: 'cross1',  side: 'left',  from: 52,  at: 71,  why: '신호교차로 좌회전' },
  { id: 'parkIn',  side: 'left',  from: 84,  at: 96,  why: '직각주차 진입' },
  { id: 'parkOut', side: 'right', from: 146, at: 157, why: '본선 복귀' },
  { id: 'cross2',  side: 'left',  from: 160, at: 175, why: '신호교차로 좌회전' },
  { id: 'corner3', side: 'left',  from: 248, at: 264, why: '좌회전' },
  { id: 'corner4', side: 'left',  from: 350, at: 368, why: '좌회전' },
  { id: 'finish',  side: 'right', from: 370, at: 376, why: '종료 지점 정차' },
];

// 돌발 급정지를 지시할 수 있는 지점(진행거리). 직각주차 구간과 교차로,
// 경사로 정지구간은 빼고 직선 주행 중에만 나오도록 골랐다.
const SUDDEN_POINTS = [52, 205, 233, 297, 342];

// 운전장치 조작 지시
const CONTROL_TASKS = [
  { key: 'headlightOn', part: 'headlight', say: '전조등을 켜십시오.', done: (u) => u.headlight >= 1 },
  { key: 'headlightOff', part: 'headlight', say: '전조등을 끄십시오.', done: (u) => u.headlight === 0, follows: 'headlightOn' },
  { key: 'wiperOn', part: 'wiper', say: '와이퍼를 작동시키십시오.', done: (u) => u.wiper >= 1 },
  { key: 'wiperOff', part: 'wiper', say: '와이퍼를 정지시키십시오.', done: (u) => u.wiper === 0, follows: 'wiperOn' },
  { key: 'signalLeft', part: 'turnSignal', say: '좌측 방향지시등을 켜십시오.', done: (u) => u.turnSignal === 'left' },
  { key: 'signalRight', part: 'turnSignal', say: '우측 방향지시등을 켜십시오.', done: (u) => u.turnSignal === 'right' },
  { key: 'hazardOn', part: 'hazard', say: '비상점멸등을 켜십시오.', done: (u) => u.hazard },
  { key: 'hazardOff', part: 'hazard', say: '비상점멸등을 끄십시오.', done: (u) => !u.hazard, follows: 'hazardOn' },
];

export class Exam {
  constructor(vehicle) {
    this.v = vehicle;
    this.reset();
  }

  reset() {
    this.phase = 'boarding';       // boarding → controls → driving → done
    this.stageIndex = -1;          // STAGES 의 인덱스
    this.stage = 'controls';
    this.progress = 0;             // 본선 진행거리(m)
    this.score = 100;
    this.deductions = [];
    this.counts = {};
    this.failed = false;
    this.failReason = null;
    this.passed = false;
    this.elapsed = 0;
    this.events = [];
    this.partRequest = null;
    this.instruction = '차량에 탑승했습니다. 안전벨트를 착용하십시오.';
    this.detail = '';
    this.completed = new Set();

    this.controlQueue = buildControlQueue();
    this.controlIndex = -1;
    this.controlDelay = 0;

    this.signalPhase = 'red';
    this.signalTimer = 8;
    this.signalDone = new Set();   // 이미 판정한 방향지시등 지점

    // 주차구획은 시험마다 P1 · P2 · P3 중 하나가 배정된다
    this.bay = BAYS[Math.floor(Math.random() * BAYS.length)];

    this.startTimer = 0;
    this.movedFromStart = false;
    this.crossIdleTimer = 0;
    this.parkTimer = 0;
    this.parked = false;
    this.parkStillTimer = 0;
    this.rampStopped = false;
    this.rampWaitTimer = 0;
    this.rampCleared = false;
    this.accelBest = 0;
    this.finishStill = 0;
    this.finishDone = false;
    this.nearLine = false;
    this.lineWarnTimer = 0;

    // 돌발 급정지 — 전 구간 중 한 지점에서 지시한다
    this.suddenAt = SUDDEN_POINTS[Math.floor(Math.random() * SUDDEN_POINTS.length)];
    this.suddenActive = false;
    this.suddenTimer = 0;
    this.suddenHandled = false;
    this.suddenDone = false;

    this._prevThrottle = 0;
    this._prevGear = 'P';
    this._boardingStep = 0;
    this._passedStop1 = false;
    this._passedStop2 = false;
  }

  // ---------------------------------------------------------------- 유틸

  say(text, tone = 'info') {
    this.events.push({ text, tone });
    this.instruction = text;
  }

  note(text, tone = 'info') { this.events.push({ text, tone }); }

  showPart(id, reason, priority = 3, hold = 4) {
    this.partRequest = { id, reason, priority, hold };
  }

  deduct(code, extra = '') {
    const def = DEDUCTIONS[code];
    if (!def) return;
    const [label, points, maxCount] = def;
    const n = this.counts[code] || 0;
    if (n >= maxCount) return;
    this.counts[code] = n + 1;
    this.score -= points;
    this.deductions.push({ code, label, points, at: this.elapsed, extra });
    this.note(`감점 -${points}점 · ${label}${extra ? ' (' + extra + ')' : ''}`, 'deduct');
  }

  fail(code) {
    if (this.failed || this.phase === 'done') return;
    this.failed = true;
    this.failReason = FAILS[code] || code;
    this.phase = 'done';
    this.passed = false;
    this.say(`실격입니다. ${this.failReason}`, 'fail');
  }

  finish() {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.passed = this.score >= PASS_SCORE;
    if (!this.passed) {
      this.failed = true;
      this.failReason = FAILS.lowScore;
      this.say(`불합격입니다. 최종 ${this.score}점 (합격 기준 ${PASS_SCORE}점)`, 'fail');
    } else {
      this.say(`합격입니다. 최종 ${this.score}점. 수고하셨습니다.`, 'pass');
    }
  }

  get stageList() {
    return STAGE_DEFS.map((s) => ({
      ...s,
      state: this.completed.has(s.id) ? 'done' : (s.id === this.stage ? 'active' : 'todo'),
    }));
  }

  // ---------------------------------------------------------------- 갱신

  update(dt, ui) {
    if (this.phase === 'done') return;
    this.partRequest = null;
    this.elapsed += dt;
    this.updateTrafficLight(dt);

    if (this.phase !== 'boarding' && this.elapsed > TIME_LIMIT) {
      this.fail('timeout');
      return;
    }

    this.checkAlways(dt, ui);
    if (this.failed) return;

    switch (this.phase) {
      case 'boarding': this.updateBoarding(dt, ui); break;
      case 'controls': this.updateControls(dt, ui); break;
      case 'driving': this.updateDriving(dt, ui); break;
    }

    this._prevThrottle = this.v.throttle;
    this._prevGear = this.v.gear;
  }

  updateTrafficLight(dt) {
    this.signalTimer -= dt;
    if (this.signalTimer > 0) return;
    if (this.signalPhase === 'green') { this.signalPhase = 'yellow'; this.signalTimer = 3; }
    else if (this.signalPhase === 'yellow') { this.signalPhase = 'red'; this.signalTimer = 12; }
    else { this.signalPhase = 'green'; this.signalTimer = 14; }
  }

  // 어느 단계에서나 항상 적용되는 검사 (차로준수 · 돌발 급정지 포함)
  checkAlways(dt, ui) {
    const v = this.v;
    const rough = Math.abs(v.speed) < 1.2 && this._prevThrottle < 0.2 && v.throttle > 0.85;
    if (this.phase !== 'driving') {
      if (rough) this.deduct('roughStart');
      return;
    }

    // (4) 단 1회라도 차로를 벗어난 때 → 실격
    let near = false;
    for (const [wx, wz] of v.wheelPoints()) {
      if (!insideCourse(wx, wz, 0.05)) { this.fail('laneOut'); return; }
      if (nearCourseEdge(wx, wz, 0.35)) near = true;
    }
    this.nearLine = near;
    if (near) {
      this.lineWarnTimer -= dt;
      if (this.lineWarnTimer <= 0) {
        this.lineWarnTimer = 3.0;
        this.note('연석에 근접했습니다. 차로 안쪽으로 붙이십시오.', 'warn');
      }
    } else {
      this.lineWarnTimer = 0;
    }

    // (6) 좌석안전띠 미착용
    if (!v.seatbelt && Math.abs(v.speed) > 0.5) { this.fail('noSeatbelt'); return; }

    // (3) 교차로 내 30초 이상 정차
    let inCross = false;
    for (const c of [POINT.cross1, POINT.cross2]) {
      if (Math.abs(v.x - c.x) < HALF && Math.abs(v.z - c.z) < HALF) inCross = true;
    }
    if (inCross && Math.abs(v.speed) < 0.2) {
      this.crossIdleTimer += dt;
      if (this.crossIdleTimer > 30) { this.fail('crossIdle'); return; }
    } else if (!inCross) {
      this.crossIdleTimer = 0;
    }

    // 차로준수 — 중앙선 침범
    if (this.stage !== 'parking' && crossedCenterLine(v.x, v.z)) this.deduct('centerLine');

    if (v.speedKmh > 32) this.deduct('overSpeed', `${Math.round(v.speedKmh)}km/h`);
    if (v.lateralJerk > 5.2) this.deduct('vibration');
    if (rough) this.deduct('roughStart');
    if (this._prevGear !== v.gear && v.gear === 'N' && Math.abs(v.speed) > 2) {
      this.deduct('gearMiss', '주행 중 N단');
    }

    this.updateSudden(dt, ui);
  }

  // ---- 돌발 급정지 (전 구간) ----------------------------------------------
  updateSudden(dt, ui) {
    const v = this.v;
    if (this.suddenDone) return;

    if (!this.suddenActive) {
      // 지정된 지점을 지나고, 실제로 주행 중일 때 지시한다
      if (this.progress < this.suddenAt) return;
      if (this.stage === 'parking' || v.speedKmh < 6) return;
      this.suddenActive = true;
      this.suddenTimer = 0;
      this.say('돌발! 즉시 정지하고 비상점멸등을 켜십시오.', 'alert');
      this.showPart('hazard', '돌발 급정지 · 비상점멸등을 켜십시오', 3, 4);
      return;
    }

    if (!this.suddenHandled) {
      this.suddenTimer += dt;
      this.detail = `돌발 급정지 · ${this.suddenTimer.toFixed(1)}초 경과 (2초 이내 정지 + 비상점멸등)`;
      if (!ui.hazard) this.showPart('hazard', '비상점멸등을 켜십시오 (H 키)', 3, 1.0);
      if (Math.abs(v.speed) < 0.3 && ui.hazard) {
        this.suddenHandled = true;
        if (this.suddenTimer > 2.0) this.deduct('suddenMiss', `${this.suddenTimer.toFixed(1)}초 소요`);
        else this.note('돌발 급정지 조치 완료', 'ok');
        this.say('비상점멸등을 끄고 다시 출발하십시오.');
      } else if (this.suddenTimer > 6) {
        this.suddenHandled = true;
        this.deduct('suddenMiss', '2초 이내 정지 실패');
      }
    } else if (ui.hazard) {
      this.showPart('hazard', '비상점멸등을 해제하십시오', 2, 1.0);
    } else {
      this.suddenActive = false;
      this.suddenDone = true;
    }
  }

  // ---- 탑승 및 시동 -------------------------------------------------------
  updateBoarding(dt, ui) {
    const v = this.v;
    if (this._boardingStep === 0) {
      this.detail = '안전벨트를 착용하십시오. (B 키)';
      this.showPart('seatbelt', '시험관 지시 · 안전벨트 착용', 3, 1.2);
      if (v.seatbelt) {
        this._boardingStep = 1;
        this.say('브레이크를 밟고 시동을 거십시오.');
      }
    } else if (this._boardingStep === 1) {
      this.detail = '브레이크(↓ 또는 S)를 밟은 상태에서 시동 버튼을 누르십시오. (Enter 키)';
      this.showPart('ignition', '시험관 지시 · 시동', 3, 1.2);
      if (v.engineOn) {
        this._boardingStep = 2;
        this.phase = 'controls';
        this.say('지금부터 운전장치 조작 능력을 평가합니다.');
        this.controlIndex = -1;
        this.controlDelay = 1.4;
      }
    }
  }

  // ---- 운전장치 조작 ------------------------------------------------------
  updateControls(dt, ui) {
    if (this.controlDelay > 0) {
      this.controlDelay -= dt;
      if (this.controlDelay <= 0) this.nextControlTask();
      return;
    }
    const task = this.controlQueue[this.controlIndex];
    if (!task) return;
    this.showPart(task.part, '시험관 지시 · ' + task.say, 3, 1.2);
    this.detail = `${this.controlIndex + 1} / ${this.controlQueue.length} · 지시된 장치를 조작하십시오.`;
    if (task.done(ui)) {
      this.note('조작 확인', 'ok');
      this.controlDelay = 1.1;
    }
  }

  nextControlTask() {
    this.controlIndex += 1;
    const task = this.controlQueue[this.controlIndex];
    if (!task) {
      this.phase = 'driving';
      this.stageIndex = 0;
      this.stage = STAGES[0].id;
      this.completed.add('controls');
      this.startTimer = 0;
      this.say('출발하십시오. 좌측 방향지시등을 켜고 주차 브레이크를 해제한 뒤 출발합니다.');
      return;
    }
    this.say(task.say);
  }

  // ---- 주행 ---------------------------------------------------------------

  updateDriving(dt, ui) {
    const v = this.v;
    this.progress = routeProgress(v.x, v.z, this.progress);

    this.checkSignalPoints(ui);

    const stage = STAGES[this.stageIndex];
    if (!stage) return;

    switch (stage.id) {
      case 'start': this.stStart(dt, ui); break;
      case 'ramp': this.stRamp(dt, ui); break;
      case 'signal1': this.stSignal(dt, ui, 1); break;
      case 'parking': this.stParking(dt, ui); break;
      case 'signal2': this.stSignal(dt, ui, 2); break;
      case 'accel': this.stAccel(dt, ui); break;
      case 'finish': this.stFinish(dt, ui); break;
    }
    if (this.failed || this.phase === 'done') return;

    // 진행거리가 이 단계의 끝을 넘으면 마무리하고 다음 단계로 넘어간다.
    // 단계는 반드시 순서대로 하나씩만 진행된다.
    if (this.progress >= stage.until) this.advanceStage(ui);
  }

  advanceStage(ui) {
    const stage = STAGES[this.stageIndex];
    // 이 단계에서 하지 못한 것을 마지막으로 정산한다
    switch (stage.id) {
      case 'ramp':
        if (!this.rampStopped) this.deduct('rampNoStop');
        break;
      case 'parking':
        if (!this.parked) { this.fail('courseSkip'); return; }
        break;
      case 'accel':
        if (this.accelBest < 20) this.deduct('accelSlow', `최고 ${this.accelBest.toFixed(0)}km/h`);
        else this.note(`가속구간 통과 · 최고 ${this.accelBest.toFixed(0)}km/h`, 'ok');
        break;
    }
    this.completed.add(stage.id);
    this.stageIndex += 1;
    const next = STAGES[this.stageIndex];
    this.stage = next ? next.id : 'done';
    if (next) this.onStageEnter(next, ui);
  }

  onStageEnter(stage, ui) {
    switch (stage.id) {
      case 'ramp':
        this.say('경사로입니다. 정지구간에 일단 정지한 뒤 30초 이내에 출발하십시오.');
        break;
      case 'signal1':
        this.say('신호교차로입니다. 신호를 확인하고 정지선을 지킨 뒤 좌회전하십시오.');
        break;
      case 'parking':
        this.say(`직각주차 구역입니다. ${this.bay.name} 구획에 후진으로 주차하십시오.`);
        this.parkTimer = 0;
        break;
      case 'signal2':
        this.say('두 번째 신호교차로입니다. 신호를 확인하고 좌회전하십시오.');
        break;
      case 'accel':
        this.say('가속구간입니다. 20km/h 이상으로 통과하십시오.');
        break;
      case 'finish':
        this.say('좌회전하여 종료 지점에 정차하십시오.');
        break;
    }
  }

  // 방향지시등 지점 판정 (진행거리 기준)
  checkSignalPoints(ui) {
    for (const p of SIGNAL_POINTS) {
      if (this.signalDone.has(p.id)) continue;
      if (this.progress < p.from) continue;
      if (this.progress < p.at) {
        // 안내 구간: 아직 켜지 않았으면 부품을 띄워 준다
        if (ui.turnSignal !== p.side) {
          this.showPart('turnSignal',
            `${p.why} · ${p.side === 'left' ? '좌측' : '우측'} 방향지시등을 켜십시오`, 2, 1.0);
        }
        continue;
      }
      this.signalDone.add(p.id);
      if (ui.turnSignal !== p.side) {
        this.deduct('signalMiss', `${p.why} 시 ${p.side === 'left' ? '좌측' : '우측'} 미점등`);
      }
    }
  }

  // 출발 (진행 방향 +Z)
  stStart(dt, ui) {
    const v = this.v;
    this.startTimer += dt;
    this.detail = `출발까지 ${Math.max(0, 30 - this.startTimer).toFixed(0)}초 · 좌측 방향지시등 · 주차 브레이크 해제 · D단`;

    if (v.parkingBrake) this.showPart('parkingBrake', '주차 브레이크를 해제하십시오', 2, 1.0);
    else if (v.gear !== 'D' && Math.abs(v.speed) < 0.4) {
      this.showPart('gear', '기어를 D(주행)에 놓으십시오', 2, 1.0);
    }

    if (!this.movedFromStart && Math.abs(v.speed) > 0.6) {
      this.movedFromStart = true;
      if (v.parkingBrake) this.deduct('brakeNotOff');
      if (!v.seatbelt) this.fail('noSeatbelt');
    }
    if (this.startTimer > 30 && !this.movedFromStart) this.fail('noStart');
  }

  // 경사로 (서측 변, 진행 방향 +Z)
  stRamp(dt, ui) {
    const v = this.v;
    const axleZ = v.toWorld(FRONT_AXLE, 0)[1];
    const noseZ = v.toWorld(NOSE, 0)[1];

    if (!this.rampStopped) {
      const dist = RAMP.stopZ1 - axleZ;
      this.detail = dist > 0.2
        ? `경사로 · 정지구간까지 ${dist.toFixed(1)}m · 노란 표지 사이에 앞바퀴를 세우십시오`
        : '경사로 · 정지구간 안입니다. 정지하십시오';
      if (axleZ >= RAMP.stopZ1 && axleZ <= RAMP.stopZ2 && Math.abs(v.speed) < 0.12) {
        this.rampStopped = true;
        this.rampWaitTimer = 0;
        this.note('정지구간 정차 확인', 'ok');
        this.say('30초 이내에 출발하십시오. 뒤로 밀려 앞범퍼가 사면을 벗어나면 실격입니다.');
      }
    } else if (!this.rampCleared) {
      this.rampWaitTimer += dt;
      this.detail = `경사로 출발 · 남은 시간 ${Math.max(0, 30 - this.rampWaitTimer).toFixed(0)}초`;
      // (5) 앞범퍼가 경사로 사면을 벗어난 때 → 실격
      if (noseZ < RAMP.upStart) { this.fail('rampRoll'); return; }
      if (noseZ < RAMP.upStart + 2.0) {
        this.detail = `뒤로 밀리고 있습니다! 앞범퍼가 사면 끝까지 ${(noseZ - RAMP.upStart).toFixed(1)}m`;
        this.showPart('pedals', '브레이크를 밟고 다시 출발하십시오', 2, 0.8);
      }
      // (5) 정지구간 이행 후 30초 초과 → 실격
      if (this.rampWaitTimer > 30) { this.fail('rampSlow'); return; }
      if (axleZ > RAMP.stopZ2 + 2.5) {
        this.rampCleared = true;
        this.note('경사로 출발 완료', 'ok');
      }
    } else {
      this.detail = '경사로 내리막 · 속도를 줄여 안전하게 통과하십시오.';
    }
  }

  // 신호교차로. 1번은 남행(정지선 z), 2번은 동행(정지선 x)이며 둘 다 좌회전이다.
  stSignal(dt, ui, which) {
    const v = this.v;
    const names = { red: '적색', yellow: '황색', green: '녹색' };
    const front = v.toWorld(NOSE, 0);
    const crossed = which === 1 ? '_passedStop1' : '_passedStop2';
    const dist = which === 1
      ? POINT.cross1.stopZ - front[1]
      : POINT.cross2.stopX - front[0];

    this.detail = dist > 0.3
      ? `신호: ${names[this.signalPhase]} · 정지선까지 ${dist.toFixed(1)}m · 좌회전`
      : `신호: ${names[this.signalPhase]} · 교차로 통과 중 · 좌회전`;

    if (!this[crossed] && dist <= 0) {
      this[crossed] = true;
      if (this.signalPhase === 'red') { this.fail('signalRun'); return; }
      if (this.signalPhase === 'yellow' && v.speedKmh < 12) { this.fail('signalRun'); return; }
      this.note('신호 준수 확인', 'ok');
    }
  }

  // 직각주차 — 배정된 구획(P1 · P2 · P3)에 후진으로 진입한다.
  stParking(dt, ui) {
    const v = this.v;
    const bay = this.bay;
    this.parkTimer += dt;

    if (this.parked) {
      this.detail = '출차 후 두 번째 신호교차로로 진행하십시오.';
      return;
    }

    const inBay = v.wheelPoints().every(([x, z]) =>
      x > bay.x1 + 0.05 && x < bay.x2 - 0.05 && z > bay.z1 + 0.05 && z < bay.z2 - 0.05);
    const left = Math.max(0, 120 - this.parkTimer);
    this.detail = `직각주차 ${bay.name} · 남은 시간 ${left.toFixed(0)}초 · 후진(R)으로 주차구획에 진입`;

    if (v.gear !== 'R' && v.z < CL.south - HALF && Math.abs(v.speed) < 0.3 && !inBay) {
      this.showPart('gear', `기어를 R(후진)에 놓고 ${bay.name} 구획으로 후진하십시오`, 2, 1.0);
    }
    if (this.parkTimer > 120) this.deduct('parkTimeout');

    if (inBay && Math.abs(v.speed) < 0.15) {
      this.parkStillTimer += dt;
      if (this.parkStillTimer > 1.0) {
        this.parked = true;
        this.note(`${bay.name} 주차 완료`, 'ok');
        this.say('주차되었습니다. 전진하여 출차한 뒤 계속 진행하십시오.');
        this.showPart('gear', '기어를 D(주행)로 변속하고 출차하십시오', 3, 3);
      }
    } else {
      this.parkStillTimer = 0;
    }
  }

  // 가속구간 (동측 변, 진행 방향 -Z).
  // 진행도에는 "가속구간(기어변속)"으로 되어 있으나 기어변속은 수동변속기 기준
  // 항목이므로, 자동변속기인 이 차량은 20km/h 이상 통과만 확인한다.
  stAccel(dt, ui) {
    const v = this.v;
    const inZone = v.z <= POINT.accelZ1 && v.z >= POINT.accelZ2 &&
      Math.abs(v.x - CL.east) < HALF + 1;
    if (inZone) {
      this.accelBest = Math.max(this.accelBest, v.speedKmh);
      this.detail = `가속구간 · 현재 ${v.speedKmh.toFixed(0)}km/h · 최고 ${this.accelBest.toFixed(0)}km/h (20km/h 이상 필요)`;
    } else if (v.z > POINT.accelZ1) {
      this.detail = `가속구간까지 ${(v.z - POINT.accelZ1).toFixed(0)}m · 20km/h 이상으로 통과하십시오`;
    } else {
      this.detail = '가속구간 통과';
    }
  }

  // 종료 — 좌측 상단, 출발 지점 옆 칸에 정차한다.
  stFinish(dt, ui) {
    const v = this.v;
    if (this.finishDone) return;

    const inZone = v.z < POINT.finishZ2 && v.z > POINT.finishZ1 &&
      v.x < CL.west - 0.2 && v.x > CL.west - EDGE + 0.2;
    this.detail = inZone
      ? '정차 후 기어 P · 주차 브레이크 체결 · 시동 정지'
      : '노란선 사이의 종료 지점에 정차하십시오.';

    if (inZone && Math.abs(v.speed) < 0.1) {
      this.finishStill += dt;
      if (v.gear !== 'P') this.showPart('gear', '기어를 P(주차)에 놓으십시오', 3, 1.0);
      else if (!v.parkingBrake) this.showPart('parkingBrake', '주차 브레이크를 체결하십시오', 3, 1.0);
      else if (v.engineOn) this.showPart('ignition', '시동을 끄십시오', 3, 1.0);

      if (v.gear === 'P' && v.parkingBrake && !v.engineOn) {
        this.finishDone = true;
        this.completed.add('finish');
        this.note('종료 조작 완료', 'ok');
        this.finish();
      } else if (this.finishStill > 30) {
        this.finishDone = true;
        this.deduct('finishMiss');
        this.completed.add('finish');
        this.finish();
      }
    } else {
      this.finishStill = 0;
    }
    // 종료 지점을 지나쳐 버린 경우.
    // 마지막 좌회전을 마치고 서측 변으로 내려온 뒤에만 본다. 종료 단계는
    // 동측 변을 달리는 동안 시작되므로, 위치만 보면 진입하자마자 걸린다.
    if (this.progress > 372 && Math.abs(v.x - CL.west) < HALF + 1 && v.z > POINT.finishZ2 + 4) {
      this.finishDone = true;
      this.deduct('finishMiss', '정차 위치 이탈');
      this.completed.add('finish');
      this.finish();
    }
  }
}

function buildControlQueue() {
  // 점등 지시 3개를 무작위로 뽑고, 각각에 해제 지시가 있으면 뒤에 붙인다.
  const pool = CONTROL_TASKS.filter((t) => !t.follows);
  const picked = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  const queue = [];
  for (const t of picked) {
    queue.push({ ...t });
    const off = CONTROL_TASKS.find((o) => o.follows === t.key);
    if (off) queue.push({ ...off });
  }
  if (picked.some((t) => t.key.startsWith('signal'))) {
    queue.push({
      key: 'signalOff', part: 'turnSignal', say: '방향지시등을 해제하십시오.',
      done: (u) => u.turnSignal === null,
    });
  }
  return queue;
}
