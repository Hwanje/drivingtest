// 기능시험 진행 · 채점 엔진.
//
// 실제 자동차운전면허 기능시험(도로교통공단)의 진행 순서를 따른다.
//   운전장치 조작 → 출발 → 직각주차 → 신호교차로 → 경사로
//   → 가속구간 → 돌발상황 → 철길건널목 → 종료
// 100점에서 시작해 감점하며 80점 이상이면 합격, 실격 사유 발생 시 즉시 불합격이다.
//
// ※ 연습용 프로그램이므로 채점 기준은 공개된 기준을 바탕으로 한 근사치이다.

import { insideCourse, nearCourseEdge, PARKING_BAY, RAMP, CL, HALF } from './course.js';

export const PASS_SCORE = 80;
export const TIME_LIMIT = 600;      // 전체 제한시간(초)

// 감점 항목 (코드: [명칭, 점수, 최대 적용 횟수])
export const DEDUCTIONS = {
  gearMiss:        ['기어 변속 조작 미숙', 5, 3],
  signalMiss:      ['방향지시등 미작동', 5, 6],
  brakeNotOff:     ['주차 브레이크 미해제 출발', 10, 1],
  roughStart:      ['급조작 · 급출발', 7, 3],
  overSpeed:       ['지시속도 위반 (과속)', 10, 3],
  accelSlow:       ['가속구간 지시속도 미달', 10, 1],
  rampNoStop:      ['경사로 정지구간 미정차', 10, 1],
  rampSlowStart:   ['경사로 30초 내 출발 실패', 10, 1],
  suddenMiss:      ['돌발상황 조치 미흡', 10, 1],
  parkTimeout:     ['직각주차 시간 초과', 10, 1],
  parkIncomplete:  ['직각주차 미완료', 10, 1],
  railNoStop:      ['철길건널목 일시정지 위반', 10, 1],
  vibration:       ['심한 진동', 5, 3],
  finishMiss:      ['종료 조작 미이행', 10, 1],
  seatbeltLate:    ['안전벨트 늦은 착용', 5, 1],
};

// 실격 사유
export const FAILS = {
  courseOut:    '검지선 접촉 · 코스 이탈',
  noSeatbelt:   '안전벨트 미착용 상태로 주행',
  signalRun:    '신호 위반 (적색신호 정지선 통과)',
  rampRoll:     '경사로에서 1m 이상 후방 밀림',
  noStart:      '출발 지시 후 30초 이내 미출발',
  timeout:      '시험시간 초과',
  lowScore:     '합격 기준(80점) 미달',
};

const STAGE_DEFS = [
  { id: 'controls', name: '운전장치 조작' },
  { id: 'start',    name: '출발' },
  { id: 'parking',  name: '직각주차' },
  { id: 'signal',   name: '신호교차로' },
  { id: 'ramp',     name: '경사로' },
  { id: 'accel',    name: '가속구간' },
  { id: 'sudden',   name: '돌발상황' },
  { id: 'railroad', name: '철길건널목' },
  { id: 'finish',   name: '종료' },
];

// 운전장치 조작 지시에 쓰이는 항목들
const CONTROL_TASKS = [
  {
    key: 'headlightOn', part: 'headlight', say: '전조등을 켜십시오.',
    done: (u) => u.headlight >= 1,
  },
  {
    key: 'headlightOff', part: 'headlight', say: '전조등을 끄십시오.',
    done: (u) => u.headlight === 0, follows: 'headlightOn',
  },
  {
    key: 'wiperOn', part: 'wiper', say: '와이퍼를 작동시키십시오.',
    done: (u) => u.wiper >= 1,
  },
  {
    key: 'wiperOff', part: 'wiper', say: '와이퍼를 정지시키십시오.',
    done: (u) => u.wiper === 0, follows: 'wiperOn',
  },
  {
    key: 'signalLeft', part: 'turnSignal', say: '좌측 방향지시등을 켜십시오.',
    done: (u) => u.turnSignal === 'left',
  },
  {
    key: 'signalRight', part: 'turnSignal', say: '우측 방향지시등을 켜십시오.',
    done: (u) => u.turnSignal === 'right',
  },
  {
    key: 'hazardOn', part: 'hazard', say: '비상점멸등을 켜십시오.',
    done: (u) => u.hazard,
  },
  {
    key: 'hazardOff', part: 'hazard', say: '비상점멸등을 끄십시오.',
    done: (u) => !u.hazard, follows: 'hazardOn',
  },
];

export class Exam {
  constructor(vehicle) {
    this.v = vehicle;
    this.reset();
  }

  reset() {
    this.phase = 'boarding';       // boarding → controls → driving → done
    this.stage = 'controls';
    this.score = 100;
    this.deductions = [];
    this.counts = {};
    this.failed = false;
    this.failReason = null;
    this.passed = false;
    this.elapsed = 0;
    this.events = [];              // UI가 소비하는 안내 메시지
    this.partRequest = null;
    this.instruction = '차량에 탑승했습니다. 안전벨트를 착용하십시오.';
    this.detail = '';
    this.stageState = {};
    this.completed = new Set();

    // 운전장치 조작 지시 목록 구성(무작위 3개 + 해제 지시)
    this.controlQueue = buildControlQueue();
    this.controlIndex = -1;

    // 신호등
    this.signalPhase = 'red';
    this.signalTimer = 7;

    // 진행 상태
    this.startTimer = 0;
    this.movedFromStart = false;
    this.suddenActive = false;
    this.suddenTimer = 0;
    this.suddenHandled = false;
    this.rampStopped = false;
    this.rampStopZ = 0;
    this.rampWaitTimer = 0;
    this.parkTimer = 0;
    this.parkPhase = 'approach';   // approach → parked → exit
    this.parkStillTimer = 0;
    this.railStopped = false;
    this.accelBest = 0;
    this.accelActive = false;
    this.finishStill = 0;
    this.finishChecked = false;
    this._prevThrottle = 0;
    this._prevGear = 'P';
    this._boardingStep = 0;
    this._crossedStopLine = false;
    this._parkSignalChecked = false;
    this._finishSignalChecked = false;
    this.controlDelay = 0;
    this.suddenHoldTimer = 0;
    this.nearLine = false;
    this.lineWarnTimer = 0;
  }

  // ---------------------------------------------------------------- 유틸

  say(text, tone = 'info') {
    this.events.push({ text, tone });
    this.instruction = text;
  }

  note(text, tone = 'info') {
    this.events.push({ text, tone });
  }

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

  completeStage(id, next) {
    if (this.completed.has(id)) return;
    this.completed.add(id);
    this.stage = next;
  }

  // ---------------------------------------------------------------- 갱신

  update(dt, ui) {
    if (this.phase === 'done') return;
    const v = this.v;
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

    this._prevThrottle = v.throttle;
    this._prevGear = v.gear;
  }

  updateTrafficLight(dt) {
    this.signalTimer -= dt;
    if (this.signalTimer > 0) return;
    if (this.signalPhase === 'green') { this.signalPhase = 'yellow'; this.signalTimer = 3; }
    else if (this.signalPhase === 'yellow') { this.signalPhase = 'red'; this.signalTimer = 11; }
    else { this.signalPhase = 'green'; this.signalTimer = 12; }
  }

  // 어느 단계에서나 항상 적용되는 검사
  checkAlways(dt, ui) {
    const v = this.v;

    // 검지선 접촉 / 코스 이탈
    // 선에 가까워지면 먼저 경고하고, 실제로 넘어가면 실격 처리한다.
    if (this.phase === 'driving') {
      let near = false;
      for (const [wx, wz] of v.wheelPoints()) {
        if (!insideCourse(wx, wz, 0.05)) { this.fail('courseOut'); return; }
        if (nearCourseEdge(wx, wz, 0.30)) near = true;
      }
      this.nearLine = near;
      if (near) {
        this.lineWarnTimer -= dt;
        if (this.lineWarnTimer <= 0) {
          this.lineWarnTimer = 3.0;
          this.note('검지선에 근접했습니다. 코스 안쪽으로 붙이십시오.', 'warn');
        }
      } else {
        this.lineWarnTimer = 0;
      }
      // 안전벨트
      if (!v.seatbelt && Math.abs(v.speed) > 0.5) {
        this.fail('noSeatbelt');
        return;
      }
      // 과속
      if (v.speedKmh > 32) this.deduct('overSpeed', `${Math.round(v.speedKmh)}km/h`);
      // 심한 진동 / 급조작
      if (v.lateralJerk > 5.2) this.deduct('vibration');
    }

    // 급출발 (정지 상태에서 갑작스러운 가속)
    if (Math.abs(v.speed) < 1.2 && this._prevThrottle < 0.2 && v.throttle > 0.85) {
      this.deduct('roughStart');
    }

    // 기어 변속 조작 미숙 (주행 중 무리한 변속 시도는 Vehicle이 막고, 여기선 N 방치를 본다)
    if (this._prevGear !== v.gear && v.gear === 'N' && Math.abs(v.speed) > 2) {
      this.deduct('gearMiss', '주행 중 N단');
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
    task.timer = (task.timer || 0) + dt;

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
      this.stage = 'start';
      this.completed.add('controls');
      this.startTimer = 0;
      this.say('출발하십시오. 좌측 방향지시등을 켜고 주차 브레이크를 해제한 뒤 출발합니다.');
      return;
    }
    this.say(task.say);
  }

  // ---- 주행 ---------------------------------------------------------------
  updateDriving(dt, ui) {
    switch (this.stage) {
      case 'start': this.stStart(dt, ui); break;
      case 'parking': this.stParking(dt, ui); break;
      case 'signal': this.stSignal(dt, ui); break;
      case 'ramp': this.stRamp(dt, ui); break;
      case 'accel': this.stAccel(dt, ui); break;
      case 'sudden': this.stSudden(dt, ui); break;
      case 'railroad': this.stRailroad(dt, ui); break;
      case 'finish': this.stFinish(dt, ui); break;
    }
  }

  // 출발
  stStart(dt, ui) {
    const v = this.v;
    this.startTimer += dt;
    this.detail = `출발까지 남은 시간 ${Math.max(0, 30 - this.startTimer).toFixed(0)}초 · 좌측 방향지시등 · 주차 브레이크 해제 · D단`;

    if (v.parkingBrake) this.showPart('parkingBrake', '주차 브레이크를 해제하십시오', 2, 1.0);
    else if (ui.turnSignal !== 'left' && Math.abs(v.speed) < 0.4) {
      this.showPart('turnSignal', '좌측 방향지시등을 켜고 출발하십시오', 2, 1.0);
    } else if (v.gear !== 'D' && Math.abs(v.speed) < 0.4) {
      this.showPart('gear', '기어를 D(주행)에 놓으십시오', 2, 1.0);
    }

    if (!this.movedFromStart && Math.abs(v.speed) > 0.6) {
      this.movedFromStart = true;
      if (ui.turnSignal !== 'left') this.deduct('signalMiss', '출발 시 좌측 미점등');
      if (v.parkingBrake) this.deduct('brakeNotOff');
      if (!v.seatbelt) this.fail('noSeatbelt');
    }
    if (this.startTimer > 30 && !this.movedFromStart) {
      this.fail('noStart');
      return;
    }
    if (v.x > 2) {
      this.completeStage('start', 'parking');
      this.say('전방 직각주차 구역에 주차하십시오. 우측 방향지시등을 켜십시오.');
      this.parkTimer = 0;
    }
  }

  // 직각주차
  stParking(dt, ui) {
    const v = this.v;
    const bay = PARKING_BAY;
    const inBay = v.wheelPoints().every(([x, z]) =>
      x > bay.x1 + 0.05 && x < bay.x2 - 0.05 && z > bay.z1 + 0.05 && z < bay.z2 - 0.05);

    if (this.parkPhase === 'approach') {
      this.parkTimer += dt;
      this.detail = `직각주차 · 경과 ${this.parkTimer.toFixed(0)}초 / 120초 · 후진(R)으로 주차구획에 진입`;
      if (v.x > 13 && v.x < 30 && ui.turnSignal !== 'right' && !this._parkSignalChecked && v.x > 16) {
        this._parkSignalChecked = true;
        this.deduct('signalMiss', '직각주차 진입 시 우측 미점등');
      }
      if (v.gear !== 'R' && v.x > 20 && Math.abs(v.speed) < 0.3) {
        this.showPart('gear', '기어를 R(후진)에 놓고 주차구획으로 후진하십시오', 2, 1.0);
      }
      if (this.parkTimer > 120) this.deduct('parkTimeout');

      if (inBay && Math.abs(v.speed) < 0.15) {
        this.parkStillTimer += dt;
        if (this.parkStillTimer > 1.0) {
          this.parkPhase = 'exit';
          this.note('주차 완료', 'ok');
          this.say('주차되었습니다. 전진하여 출차한 뒤 계속 진행하십시오.');
          this.showPart('gear', '기어를 D(주행)로 변속하고 출차하십시오', 3, 3);
        }
      } else {
        this.parkStillTimer = 0;
      }
      // 주차하지 않고 지나쳐 버린 경우
      if (v.x > 41.5) {
        this.deduct('parkIncomplete');
        this.completeStage('parking', 'signal');
        this.say('신호교차로입니다. 신호에 따라 좌회전하십시오.');
      }
    } else if (this.parkPhase === 'exit') {
      this.detail = '출차 후 신호교차로로 진행하십시오.';
      if (v.z < 1.4 && v.x > 24) {
        this.completeStage('parking', 'signal');
        this.say('신호교차로입니다. 신호를 확인하고 좌회전하십시오. 좌측 방향지시등을 켜십시오.');
      }
    }
  }

  // 신호교차로
  stSignal(dt, ui) {
    const v = this.v;
    const front = v.toWorld(2.14, 0);
    const STOP_X = 45.0;
    this.detail = `신호: ${{ red: '적색', yellow: '황색', green: '녹색' }[this.signalPhase]} · 정지선 준수 · 좌회전 방향지시등`;

    if (front[0] > 38 && front[0] < STOP_X && ui.turnSignal !== 'left') {
      this.showPart('turnSignal', '좌회전 · 좌측 방향지시등을 켜십시오', 2, 1.0);
    }

    // 정지선 통과 판정
    if (!this._crossedStopLine && front[0] >= STOP_X) {
      this._crossedStopLine = true;
      if (this.signalPhase === 'red') { this.fail('signalRun'); return; }
      if (this.signalPhase === 'yellow' && v.speedKmh < 12) { this.fail('signalRun'); return; }
      if (ui.turnSignal !== 'left') this.deduct('signalMiss', '좌회전 시 미점등');
    }
    if (v.z < -6) {
      this.completeStage('signal', 'ramp');
      this.say('경사로입니다. 정지구간에 일단 정지한 뒤 30초 이내에 출발하십시오.');
    }
  }

  // 경사로
  stRamp(dt, ui) {
    const v = this.v;
    const front = v.toWorld(1.31, 0);
    const fz = front[1];

    if (!this.rampStopped) {
      const dist = fz - RAMP.stopZ2;    // 진행 방향(-Z) 기준 남은 거리
      this.detail = dist > 0.2
        ? `경사로 · 정지구간까지 ${dist.toFixed(1)}m · 노란 표지 사이에 앞바퀴를 세우십시오`
        : `경사로 · 정지구간 안입니다. 정지하십시오`;
      if (fz <= RAMP.stopZ2 && fz >= RAMP.stopZ1 && Math.abs(v.speed) < 0.12) {
        this.rampStopped = true;
        this.rampStopZ = v.z;
        this.rampWaitTimer = 0;
        this.note('정지구간 정차 확인', 'ok');
        this.say('30초 이내에 출발하십시오. 뒤로 1미터 이상 밀리면 실격입니다.');
      } else if (fz < RAMP.stopZ1 - 0.4) {
        this.deduct('rampNoStop');
        this.rampStopped = true;
        this.rampStopZ = v.z;
        this.rampWaitTimer = -999;   // 이후 출발 지연 검사는 생략
      }
    } else if (this.rampWaitTimer > -900) {
      this.rampWaitTimer += dt;
      this.detail = `경사로 출발 · 남은 시간 ${Math.max(0, 30 - this.rampWaitTimer).toFixed(0)}초`;
      // 후방 밀림
      if (v.z - this.rampStopZ > 1.0) { this.fail('rampRoll'); return; }
      if (v.z - this.rampStopZ > 0.4) {
        this.detail = `뒤로 밀리고 있습니다! (${(v.z - this.rampStopZ).toFixed(2)}m)`;
        this.showPart('pedals', '브레이크를 밟고 다시 출발하십시오', 2, 0.8);
      }
      if (this.rampWaitTimer > 30) {
        this.deduct('rampSlowStart');
        this.rampWaitTimer = -999;
      }
      if (v.z < this.rampStopZ - 2.5) this.rampWaitTimer = -999;   // 정상 출발
    } else {
      this.detail = '경사로 내리막 · 속도를 줄여 안전하게 통과하십시오.';
    }

    if (v.z < -32.5) {
      this.completeStage('ramp', 'accel');
      this.say('좌회전 후 가속구간입니다. 20km/h 이상으로 통과하십시오.');
    }
  }

  // 가속구간
  stAccel(dt, ui) {
    const v = this.v;
    const x = v.x;
    if (v.z < -33.4 && x < 46 && x > 26) {
      this.accelActive = true;
      this.accelBest = Math.max(this.accelBest, v.speedKmh);
      this.detail = `가속구간 · 현재 ${v.speedKmh.toFixed(0)}km/h · 최고 ${this.accelBest.toFixed(0)}km/h (20km/h 이상 필요)`;
    } else if (x <= 26 && this.accelActive) {
      if (this.accelBest < 20) this.deduct('accelSlow', `최고 ${this.accelBest.toFixed(0)}km/h`);
      else this.note(`가속구간 통과 · 최고 ${this.accelBest.toFixed(0)}km/h`, 'ok');
      this.completeStage('accel', 'sudden');
      this.suddenActive = true;
      this.suddenTimer = 0;
      this.say('돌발! 즉시 정지하고 비상점멸등을 켜십시오.', 'alert');
      this.showPart('hazard', '돌발상황 · 비상점멸등을 켜십시오', 3, 4);
    } else {
      this.detail = '가속구간까지 진행하십시오.';
    }
  }

  // 돌발상황
  stSudden(dt, ui) {
    const v = this.v;
    if (!this.suddenHandled) {
      this.suddenTimer += dt;
      this.detail = `돌발상황 · ${this.suddenTimer.toFixed(1)}초 경과 (2초 이내 정지 + 비상점멸등)`;
      if (!ui.hazard) this.showPart('hazard', '비상점멸등을 켜십시오 (H 키)', 3, 1.0);
      const stopped = Math.abs(v.speed) < 0.3;
      if (stopped && ui.hazard) {
        this.suddenHandled = true;
        if (this.suddenTimer > 2.0) this.deduct('suddenMiss', `${this.suddenTimer.toFixed(1)}초 소요`);
        else this.note('돌발상황 조치 완료', 'ok');
        this.suddenHoldTimer = 0;
        this.say('비상점멸등을 끄고 다시 출발하십시오.');
      } else if (this.suddenTimer > 6) {
        this.suddenHandled = true;
        this.deduct('suddenMiss', '미조치');
        this.suddenHoldTimer = 0;
      }
    } else {
      this.detail = '비상점멸등을 해제하고 출발하십시오.';
      if (ui.hazard) this.showPart('hazard', '비상점멸등을 해제하십시오', 2, 1.0);
      if (!ui.hazard && v.x < 18) {
        this.suddenActive = false;
        this.completeStage('sudden', 'railroad');
        this.say('철길건널목입니다. 정지선 앞에서 반드시 일시정지하십시오.');
      }
    }
  }

  // 철길건널목
  stRailroad(dt, ui) {
    const v = this.v;
    const front = v.toWorld(2.14, 0);
    const fz = front[1];
    const STOP_Z = -23.2;

    if (!this.railStopped) {
      this.detail = '철길건널목 · 정지선 앞 일시정지';
      if (fz > STOP_Z - 3.0 && fz < STOP_Z && Math.abs(v.speed) < 0.15) {
        this.railStopped = true;
        this.note('일시정지 확인', 'ok');
        this.say('좌우를 확인하고 통과하십시오.');
      } else if (fz >= STOP_Z + 0.2) {
        this.railStopped = true;
        this.deduct('railNoStop');
      }
    } else {
      this.detail = '건널목을 통과한 뒤 우회전하여 종료 지점으로 향하십시오.';
    }
    if (v.z > -12) {
      this.completeStage('railroad', 'finish');
      this.say('우회전하여 종료 지점에 정차하십시오. 우측 방향지시등을 켜십시오.');
    }
  }

  // 종료
  stFinish(dt, ui) {
    const v = this.v;
    if (v.z > CL.legE - 3.5 && v.x < 13 && v.x > 6 && ui.turnSignal !== 'right' && !this._finishSignalChecked) {
      this._finishSignalChecked = true;
      this.deduct('signalMiss', '종료 지점 진입 시 우측 미점등');
    }

    const inZone = v.x < -1.6 && v.x > -6.6 &&
      v.z < CL.legE + HALF - 0.2 && v.z > CL.legE - HALF + 0.2;
    if (!this.finishChecked) {
      this.detail = inZone
        ? '정차 후 기어 P · 주차 브레이크 체결 · 시동 정지'
        : '노란선 사이의 종료 지점에 정차하십시오.';
      if (inZone && Math.abs(v.speed) < 0.1) {
        this.finishStill += dt;
        if (v.gear !== 'P') this.showPart('gear', '기어를 P(주차)에 놓으십시오', 3, 1.0);
        else if (!v.parkingBrake) this.showPart('parkingBrake', '주차 브레이크를 체결하십시오', 3, 1.0);
        else if (v.engineOn) this.showPart('ignition', '시동을 끄십시오', 3, 1.0);

        if (v.gear === 'P' && v.parkingBrake && !v.engineOn) {
          this.finishChecked = true;
          this.completeStage('finish', 'done');
          this.note('종료 조작 완료', 'ok');
          this.finish();
        } else if (this.finishStill > 25) {
          this.finishChecked = true;
          this.deduct('finishMiss');
          this.completeStage('finish', 'done');
          this.finish();
        }
      } else {
        this.finishStill = 0;
      }
      // 종료 지점을 지나쳐 코스 끝까지 간 경우
      if (v.x < -7.5) {
        this.deduct('finishMiss', '정차 위치 이탈');
        this.finishChecked = true;
        this.completeStage('finish', 'done');
        this.finish();
      }
    }
  }
}

function buildControlQueue() {
  // 점등 지시 3개를 무작위로 뽑고, 각각에 해제 지시가 있으면 뒤에 붙인다.
  const primary = CONTROL_TASKS.filter((t) => !t.follows);
  const picked = [];
  const pool = [...primary];
  for (let i = 0; i < 3 && pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  const queue = [];
  for (const t of picked) {
    queue.push({ ...t });
    const off = CONTROL_TASKS.find((o) => o.follows === t.key);
    if (off) queue.push({ ...off });
  }
  // 방향지시등은 켠 뒤 반드시 끄도록 마지막에 확인 지시를 넣는다.
  if (picked.some((t) => t.key.startsWith('signal'))) {
    queue.push({
      key: 'signalOff', part: 'turnSignal', say: '방향지시등을 해제하십시오.',
      done: (u) => u.turnSignal === null,
    });
  }
  return queue;
}
