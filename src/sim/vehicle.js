// 차량 거동 모델.
// 자전거(bicycle) 기구학에 간단한 종방향 동역학을 얹은 형태로,
// 기능시험 속도대(0~40km/h)에서 실제 차의 느낌 - 크리프 주행, 경사로 밀림,
// 조향 응답 - 을 재현하는 데 초점을 맞췄다.

import { clamp, approach } from '../gfx/math.js';
import { groundHeight } from './course.js';

const G = 9.81;

// 제1종 보통면허 기능시험 차량 = 1톤 화물차(현대 포터 II · 기아 봉고 III 급).
// 시험차량 기준은 전장 465cm 이상 · 전폭 169cm 이상이며, 여기서는 장축 모델
// (전장 5.11m · 전폭 1.74m · 전고 1.97m · 축거 2.64m) 제원을 따랐다.
// 2024년 7월부터 이들 차종에 자동변속기 모델이 추가되어 1종보통 오토 시험이 가능하다.
export const SPEC = {
  mass: 1900,          // kg (공차)
  wheelbase: 2.64,     // m
  frontOverhang: 1.05, // 캡오버형이라 앞 오버행이 짧다
  rearOverhang: 1.42,
  length: 5.11,
  width: 1.74,
  height: 1.97,
  trackHalf: 0.735,    // 윤거 약 1.47m
  wheelRadius: 0.34,
  maxSteer: 0.63,      // rad (약 36도) · 최소회전반경 약 5.1m

  // 조향계. 핸들을 돌린 각도와 앞바퀴가 꺾이는 각도의 비가 조향비다.
  // 앞바퀴 최대 36도 × 조향비 18 = 한쪽으로 648도, 락투락 약 3.6 회전으로
  // 1톤 화물차 실차와 같다. 승용차(2.5~3 회전)보다 많이 돌려야 한다.
  steerRatio: 18,
  // 사람이 핸들을 돌릴 수 있는 속도의 상한(rad/s). 약 550도/초로,
  // 두 손으로 부지런히 돌리면 락투락을 2.4초에 감는 정도다.
  handRate: 9.6,
  driveForce: 6400,    // N
  power: 60000,        // W
  brakeForce: 13500,   // N
  parkingBrakeForce: 7600,
  creepSpeed: 1.45,    // m/s (약 5.2km/h)
  creepForce: 1600,
  maxSpeedD: 22,       // m/s
  maxSpeedR: 4.0,      // m/s
  rollingResist: 300,
  dragCoef: 0.62,
};

export const GEARS = ['P', 'R', 'N', 'D'];

export class Vehicle {
  constructor() {
    this.reset(-7, 0, 0);
  }

  reset(x, z, heading) {
    this.x = x;
    this.z = z;
    this.y = groundHeight(x, z);
    this.heading = heading;      // rad, forward = (cos h, 0, sin h)
    this.speed = 0;              // m/s (+ 전진, - 후진)
    this.steer = 0;              // rad (+ 우측)
    this.steerInput = 0;         // -1..1
    this.throttle = 0;
    this.brake = 0;
    this.gear = 'P';
    this.engineOn = false;
    this.parkingBrake = true;
    this.seatbelt = false;
    this.rpm = 0;
    this.odometer = 0;
    this.startFails = 0;         // 시동 걸기 실패 횟수(3회 이상이면 실격)
    this.lateralJerk = 0;
    this.longAccel = 0;
    this.pitch = 0;
    this.roll = 0;
    this.bodyBounce = 0;
    this._prevSpeed = 0;
    this._prevSteer = 0;
    this._bounceV = 0;
  }

  get speedKmh() { return Math.abs(this.speed) * 3.6; }

  // 핸들이 돌아간 각도(rad, + 가 우측). 앞바퀴 각도 × 조향비.
  get handAngle() { return this.steer * SPEC.steerRatio; }
  // 핸들 회전수(중립 기준). 락투락 3.6 회전이므로 한쪽으로 최대 1.8.
  get handTurns() { return this.handAngle / (Math.PI * 2); }

  // 진행 방향 단위 벡터(월드 XZ)
  forward() { return [Math.cos(this.heading), Math.sin(this.heading)]; }

  // 차체 기준 위치를 월드 좌표로 변환. lx: 앞(+), lz: 오른쪽(+)
  toWorld(lx, lz) {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    // 로컬 +X → (c, s), 로컬 +Z(오른쪽) → (-s, c) 가 되도록 한다.
    return [this.x + lx * c - lz * s, this.z + lx * s + lz * c];
  }

  // 네 바퀴의 접지점(검지선 접촉 판정용)
  wheelPoints() {
    const fx = SPEC.wheelbase / 2;
    const t = SPEC.trackHalf + 0.10;
    return [
      this.toWorld(fx, -t), this.toWorld(fx, t),
      this.toWorld(-fx, -t), this.toWorld(-fx, t),
    ];
  }

  // 차체 네 모서리(충돌·시야 판정용)
  bodyCorners() {
    const f = SPEC.wheelbase / 2 + SPEC.frontOverhang;
    const r = SPEC.wheelbase / 2 + SPEC.rearOverhang;
    const w = SPEC.width / 2;
    return [this.toWorld(f, -w), this.toWorld(f, w), this.toWorld(-r, w), this.toWorld(-r, -w)];
  }

  // 노면 경사(진행 방향 성분). 오르막이면 양수.
  gradeAlongHeading() {
    const d = 0.6;
    const [cx, cz] = this.forward();
    const h1 = groundHeight(this.x + cx * d, this.z + cz * d);
    const h0 = groundHeight(this.x - cx * d, this.z - cz * d);
    return (h1 - h0) / (2 * d);
  }

  step(dt, input) {
    const s = SPEC;

    // ---- 입력 처리 --------------------------------------------------------
    this.throttle = clamp(input.throttle, 0, 1);
    this.brake = clamp(input.brake, 0, 1);
    this.steerInput = clamp(input.steer, -1, 1);

    // 조향. 한계는 앞바퀴가 아니라 "손"에 있다. 핸들을 돌릴 수 있는 최고
    // 속도(handRate)를 조향비로 나눠 앞바퀴 각속도 상한으로 쓴다. 속도가
    // 붙으면 노면 반력이 커져 조금 느려진다.
    const handRate = s.handRate / (1 + Math.abs(this.speed) * 0.05);
    const roadRate = handRate / s.steerRatio;
    const targetSteer = this.steerInput * s.maxSteer;
    if (Math.abs(this.steerInput) < 0.02) {
      // 손을 놓으면 셀프 얼라이닝 토크로 되돌아온다. 복원력은 속도에 비례해서,
      // 서 있을 때는 타이어가 노면에 붙잡혀 거의 제자리에 머문다 — 실제로도
      // 정차 중에는 핸들을 손으로 풀어 줘야 한다.
      const back = 0.10 + Math.abs(this.speed) * 0.15;
      this.steer = approach(this.steer, 0, Math.min(back, roadRate) * dt);
    } else {
      this.steer = approach(this.steer, targetSteer, roadRate * dt);
    }

    // ---- 종방향 힘 --------------------------------------------------------
    let force = 0;
    const dir = this.gear === 'R' ? -1 : 1;
    const driving = this.engineOn && (this.gear === 'D' || this.gear === 'R');
    const maxSpeed = this.gear === 'R' ? s.maxSpeedR : s.maxSpeedD;

    if (driving) {
      if (this.throttle > 0.01) {
        const v = Math.max(Math.abs(this.speed), 1.2);
        const f = Math.min(s.driveForce, s.power / v);
        force += dir * f * this.throttle;
      } else if (this.brake < 0.02) {
        // 크리프 주행: 브레이크를 떼면 저속으로 스스로 굴러간다.
        const cs = this.gear === 'R' ? s.creepSpeed * 0.6 : s.creepSpeed;
        if (this.speed * dir < cs) force += dir * s.creepForce;
      }
      if (Math.abs(this.speed) > maxSpeed) force -= dir * s.driveForce;
    }

    // 제동
    const brakeF = this.brake * s.brakeForce + (this.parkingBrake ? s.parkingBrakeForce : 0);
    // 주행저항
    const resist = s.rollingResist + s.dragCoef * this.speed * this.speed;
    if (Math.abs(this.speed) > 0.02) {
      force -= Math.sign(this.speed) * (brakeF + resist);
    }

    // 경사(중력 성분)
    const grade = this.gradeAlongHeading();
    force -= s.mass * G * grade;

    let accel = force / s.mass;

    // 정지 마찰: 아주 느릴 때는 제동력/주차브레이크가 차를 붙잡는다.
    if (Math.abs(this.speed) < 0.25 && Math.abs(this.speed + accel * dt) < 0.25) {
      const hold = brakeF + s.rollingResist * 1.6;
      const need = Math.abs(s.mass * G * grade) + (driving && this.throttle > 0.01 ? s.driveForce * this.throttle : 0);
      if (hold > need) {
        this.speed = 0;
        accel = 0;
      }
    }

    const newSpeed = this.speed + accel * dt;
    // 브레이크만으로는 역방향으로 밀지 않는다(경사로는 위에서 중력으로 처리됨).
    if (this.brake > 0.02 && Math.sign(newSpeed) !== Math.sign(this.speed) && Math.abs(grade) < 0.01) {
      this.speed = 0;
    } else {
      this.speed = newSpeed;
    }
    if (this.gear === 'P' || this.gear === 'N' || !this.engineOn) {
      if (this.gear === 'P') {
        // P단은 파킹 폴이 물려 차가 굴러가지 않는다.
        this.speed *= Math.max(0, 1 - dt * 14);
        if (Math.abs(this.speed) < 0.06) this.speed = 0;
      }
    }

    this.longAccel = accel;

    // ---- 위치 갱신 --------------------------------------------------------
    if (Math.abs(this.speed) > 1e-4) {
      const yawRate = (this.speed / s.wheelbase) * Math.tan(this.steer);
      this.heading += yawRate * dt;
      const [cx, cz] = this.forward();
      this.x += cx * this.speed * dt;
      this.z += cz * this.speed * dt;
      this.odometer += Math.abs(this.speed) * dt;
      this.lateralJerk = Math.abs(yawRate * this.speed);
    } else {
      this.lateralJerk = 0;
    }

    // ---- 차체 자세 --------------------------------------------------------
    this.y = groundHeight(this.x, this.z);
    const targetPitch = Math.atan(grade);   // 오르막에서 차 앞이 들린다
    this.pitch = approach(this.pitch, targetPitch + clamp(-this.longAccel * 0.012, -0.05, 0.05), dt * 3.5);
    this.roll = approach(this.roll, clamp(-this.lateralJerk * 0.012, -0.06, 0.06), dt * 3.5);

    // 노면 진동(속도에 비례한 미세한 상하 흔들림)
    this._bounceV += (Math.random() - 0.5) * Math.abs(this.speed) * dt * 0.9;
    this._bounceV -= this.bodyBounce * dt * 34;
    this._bounceV *= Math.max(0, 1 - dt * 6);
    this.bodyBounce = clamp(this.bodyBounce + this._bounceV * dt, -0.03, 0.03);

    // ---- 엔진 회전수 ------------------------------------------------------
    if (this.engineOn) {
      const v = Math.abs(this.speed);
      const targetRpm = 720 + v * 132 + this.throttle * 1500 * (1 - Math.min(1, v / 14));
      this.rpm = approach(this.rpm, Math.min(5200, targetRpm), dt * 2600);
    } else {
      this.rpm = approach(this.rpm, 0, dt * 1800);
    }

    this._prevSpeed = this.speed;
    this._prevSteer = this.steer;
  }

  // 시동 시도. 조건을 만족하지 못하면 사유를 돌려준다.
  tryStart() {
    // 이미 걸려 있는데 또 누른 것은 시도로 세지 않는다.
    if (this.engineOn) return { ok: false, reason: '이미 시동이 걸려 있습니다.' };
    if (this.gear !== 'P' && this.gear !== 'N') {
      this.startFails += 1;
      return { ok: false, reason: '기어를 P 또는 N에 놓아야 시동이 걸립니다.' };
    }
    if (this.brake < 0.4) {
      this.startFails += 1;
      return { ok: false, reason: '브레이크를 밟은 상태에서 시동을 걸어야 합니다.' };
    }
    this.engineOn = true;
    this.rpm = 900;
    return { ok: true };
  }

  stopEngine() {
    this.engineOn = false;
  }

  // 변속 시도.
  shift(gear) {
    if (!GEARS.includes(gear)) return { ok: false, reason: '잘못된 변속 위치입니다.' };
    if (gear === this.gear) return { ok: false, reason: null };
    if (!this.engineOn && gear !== 'P') return { ok: false, reason: '시동이 꺼져 있습니다.' };
    if (Math.abs(this.speed) > 0.6 && (gear === 'P' || gear === 'R')) {
      return { ok: false, reason: '차가 멈춘 뒤에 변속해야 합니다.' };
    }
    if (this.brake < 0.3 && (gear === 'R' || gear === 'D' || gear === 'P')) {
      return { ok: false, reason: '브레이크를 밟고 변속하십시오.' };
    }
    this.gear = gear;
    return { ok: true };
  }
}
