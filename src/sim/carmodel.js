// 제1종 보통면허 기능시험 차량(1톤 화물차) 3D 모델.
// 차체 로컬 좌표는 +X 가 전방, +Y 가 위, +Z 가 차량 오른쪽이다.
// 캡오버 트럭이라 앞바퀴가 운전석 아래에 있고, 눈높이가 승용차보다 훨씬 높다.

import { M4 } from '../gfx/math.js';
import { Node, Mesh, box, cylinder, torus, shade } from '../gfx/mesh.js';
import { SPEC } from './vehicle.js';

const BODY = [222, 224, 228];        // 시험 차량은 대개 흰색
const BODY_DARK = shade(BODY, 0.70);
const GLASS = [58, 74, 88];
const TIRE = [30, 31, 34];
const RIM = [176, 180, 188];
const TRIM = [46, 48, 52];
const DECK = [118, 120, 126];        // 적재함

// 차체 기준 위치
const AXLE = SPEC.wheelbase / 2;                    // ±1.32
const NOSE = AXLE + SPEC.frontOverhang;             // 2.37
const TAIL = -(AXLE + SPEC.rearOverhang);           // -2.74
const W = SPEC.width / 2;                           // 0.87

// 운전석 눈 위치(로컬). 카메라와 실내 모델이 같은 값을 쓴다.
export const EYE = [0.85, 1.62, -0.44];

function wheel() {
  const m = new Mesh();
  const r = SPEC.wheelRadius;
  m.merge(cylinder(r, r, 0.20, TIRE, 14),
    M4.multiply(M4.translate(0, 0, -0.10), M4.rotX(-90 * Math.PI / 180)));
  m.merge(cylinder(r * 0.55, r * 0.55, 0.05, RIM, 12),
    M4.multiply(M4.translate(0, 0, 0.075), M4.rotX(-90 * Math.PI / 180)));
  for (let i = 0; i < 5; i++) {
    m.merge(box(r * 0.8, 0.03, 0.03, shade(RIM, 0.85)),
      M4.multiply(M4.translate(0, 0, 0.10), M4.rotZ((i / 5) * Math.PI * 2)));
  }
  return m;
}

export function buildCar() {
  const root = new Node('car');
  const body = new Node('body');
  root.add(body);

  const m = new Mesh();
  const P = (x, y, z) => [x, y, z];

  // ---- 프레임 / 하부
  m.merge(box(NOSE - TAIL - 0.1, 0.20, W * 2 - 0.30, BODY_DARK), M4.translate(-0.2, 0.52, 0));

  // ---- 캡(운전실). 캡오버형이라 앞유리가 앞바퀴 바로 위에서 시작한다.
  const CAB_F = NOSE;            // 2.37
  const CAB_R = 0.52;            // 캡 뒷면
  const CAB_TOP = SPEC.height;   // 1.97
  const CAB_BOT = 0.62;
  const BELT = 1.28;             // 벨트라인(창 아랫변)

  m.merge(box(CAB_F - CAB_R, BELT - CAB_BOT, W * 2, BODY),
    M4.translate((CAB_F + CAB_R) / 2, (BELT + CAB_BOT) / 2, 0));
  const WS_TOP = CAB_F - 0.26;
  for (const sgn of [-1, 1]) {
    m.addPoly([
      P(CAB_F, BELT, W * sgn), P(WS_TOP, CAB_TOP, W * sgn),
      P(CAB_R, CAB_TOP, W * sgn), P(CAB_R, BELT, W * sgn),
    ], shade(BODY, 0.95));
  }
  m.addPoly([P(WS_TOP, CAB_TOP, -W), P(WS_TOP, CAB_TOP, W),
    P(CAB_R, CAB_TOP, W), P(CAB_R, CAB_TOP, -W)], shade(BODY, 1.06));   // 지붕
  m.addPoly([P(CAB_F, BELT, -W), P(CAB_F, BELT, W),
    P(WS_TOP, CAB_TOP, W), P(WS_TOP, CAB_TOP, -W)], GLASS);             // 앞유리
  m.addPoly([P(CAB_R, BELT, -W), P(CAB_R, CAB_TOP, -W),
    P(CAB_R, CAB_TOP, W), P(CAB_R, BELT, W)], shade(BODY, 0.88));       // 캡 뒷면
  for (const sgn of [-1, 1]) {                                          // 도어 유리
    const z = (W + 0.008) * sgn;
    m.addPoly([P(CAB_F - 0.22, BELT + 0.04, z), P(WS_TOP - 0.10, CAB_TOP - 0.09, z),
      P(CAB_R + 0.12, CAB_TOP - 0.09, z), P(CAB_R + 0.12, BELT + 0.04, z)], GLASS);
  }
  m.merge(box(1.5, 0.05, W * 2 + 0.02, TRIM), M4.translate(1.45, BELT - 0.02, 0));

  // ---- 앞 범퍼 · 그릴
  m.merge(box(0.24, 0.36, W * 2 - 0.04, BODY), M4.translate(NOSE - 0.12, 0.72, 0));
  m.merge(box(0.20, 0.20, W * 2 - 0.10, TRIM), M4.translate(NOSE - 0.06, 0.48, 0));
  m.merge(box(0.06, 0.26, 1.10, [26, 27, 30]), M4.translate(NOSE - 0.005, 1.02, 0));

  // ---- 적재함
  const DK_F = 0.42, DK_R = TAIL, DK_Y = 0.92;
  m.merge(box(DK_F - DK_R, 0.10, W * 2, DECK), M4.translate((DK_F + DK_R) / 2, DK_Y, 0));
  for (const sgn of [-1, 1]) {
    m.merge(box(DK_F - DK_R, 0.42, 0.07, shade(DECK, 1.08)),
      M4.translate((DK_F + DK_R) / 2, DK_Y + 0.21, (W - 0.035) * sgn));
  }
  m.merge(box(0.07, 0.42, W * 2, shade(DECK, 0.92)), M4.translate(DK_R + 0.035, DK_Y + 0.21, 0));
  m.merge(box(0.07, 0.42, W * 2, shade(DECK, 1.0)), M4.translate(DK_F - 0.035, DK_Y + 0.21, 0));
  for (let i = 0; i < 5; i++) {
    m.merge(box(0.05, 0.02, W * 2 - 0.16, shade(DECK, 0.85)),
      M4.translate(DK_R + 0.4 + i * 0.62, DK_Y + 0.06, 0));
  }
  m.merge(box(0.14, 0.14, W * 2 - 0.2, TRIM), M4.translate(TAIL + 0.07, 0.42, 0));

  // ---- 사이드미러(트럭은 크고 앞쪽으로 나와 있다)
  for (const sgn of [-1, 1]) {
    m.merge(box(0.06, 0.06, 0.30, TRIM), M4.translate(CAB_F - 0.30, BELT + 0.34, (W + 0.16) * sgn));
    m.merge(box(0.09, 0.44, 0.16, BODY), M4.translate(CAB_F - 0.30, BELT + 0.24, (W + 0.30) * sgn));
    m.merge(box(0.03, 0.40, 0.13, GLASS), M4.translate(CAB_F - 0.35, BELT + 0.24, (W + 0.30) * sgn));
  }
  body.add(new Node('shell', m));

  // ---- 등화류(색이 바뀌므로 별도 노드)
  const lampQuad = (w, h, color) => new Mesh().addPoly(
    [[0, -h / 2, -w / 2], [0, -h / 2, w / 2], [0, h / 2, w / 2], [0, h / 2, -w / 2]],
    color, { unlit: true },
  );
  const mkLamp = (name, mesh, mtx) => {
    const n = new Node(name, mesh, mtx);
    body.add(n);
    return n;
  };
  const lights = {
    headL: mkLamp('headL', lampQuad(0.34, 0.20, [90, 92, 96]), M4.translate(NOSE + 0.005, 0.78, -0.56)),
    headR: mkLamp('headR', lampQuad(0.34, 0.20, [90, 92, 96]), M4.translate(NOSE + 0.005, 0.78, 0.56)),
    signalFL: mkLamp('sfl', lampQuad(0.16, 0.16, [90, 74, 40]), M4.translate(NOSE + 0.005, 0.78, -0.78)),
    signalFR: mkLamp('sfr', lampQuad(0.16, 0.16, [90, 74, 40]), M4.translate(NOSE + 0.005, 0.78, 0.78)),
    tailL: mkLamp('tailL', lampQuad(0.22, 0.34, [96, 34, 32]), M4.translate(TAIL - 0.005, 0.82, -0.62)),
    tailR: mkLamp('tailR', lampQuad(0.22, 0.34, [96, 34, 32]), M4.translate(TAIL - 0.005, 0.82, 0.62)),
    signalRL: mkLamp('srl', lampQuad(0.20, 0.14, [90, 74, 40]), M4.translate(TAIL - 0.005, 0.62, -0.62)),
    signalRR: mkLamp('srr', lampQuad(0.20, 0.14, [90, 74, 40]), M4.translate(TAIL - 0.005, 0.62, 0.62)),
    reverseL: mkLamp('rvl', lampQuad(0.16, 0.12, [110, 110, 114]), M4.translate(TAIL - 0.005, 0.50, -0.42)),
    reverseR: mkLamp('rvr', lampQuad(0.16, 0.12, [110, 110, 114]), M4.translate(TAIL - 0.005, 0.50, 0.42)),
  };

  // ---- 바퀴
  const wm = wheel();
  const wheels = {};
  const wheelPos = {
    fl: [AXLE, SPEC.wheelRadius, -SPEC.trackHalf],
    fr: [AXLE, SPEC.wheelRadius, SPEC.trackHalf],
    rl: [-AXLE, SPEC.wheelRadius, -SPEC.trackHalf],
    rr: [-AXLE, SPEC.wheelRadius, SPEC.trackHalf],
  };
  for (const k of Object.keys(wheelPos)) {
    wheels[k] = new Node(k);
    wheels[k].add(new Node('spin', wm));
    body.add(wheels[k]);
  }

  // ---- 지붕 위 시험차 표지
  const topSign = new Mesh();
  topSign.merge(box(0.30, 0.24, 1.0, [214, 216, 222]), M4.translate(1.30, CAB_TOP + 0.12, 0));
  topSign.merge(box(0.31, 0.04, 0.96, [200, 60, 50]), M4.translate(1.30, CAB_TOP + 0.12, 0));
  body.add(new Node('topSign', topSign));

  // ---- 운전석 실내(1인칭용)
  const cockpit = buildCockpit();
  body.add(cockpit.node);
  cockpit.node.visible = false;
  const shellNode = body.children[0];

  let spin = 0;
  return {
    root,
    lights,
    cockpit,
    setInterior(on) {
      cockpit.node.visible = on;
      shellNode.visible = !on;
      body.find('topSign').visible = !on;
      for (const k of Object.keys(wheelPos)) body.find(k).visible = !on;
      for (const n of Object.values(lights)) n.visible = !on;
    },

    update(v, ui, dt) {
      spin += (v.speed / SPEC.wheelRadius) * dt;

      root.matrix = M4.chain(
        M4.translate(v.x, v.y + v.bodyBounce, v.z),
        M4.rotY(-v.heading),
        M4.rotZ(v.pitch),
        M4.rotX(v.roll),
      );

      for (const k of Object.keys(wheelPos)) {
        const p = wheelPos[k];
        const steer = (k === 'fl' || k === 'fr') ? -v.steer : 0;
        wheels[k].matrix = M4.chain(M4.translate(p[0], p[1], p[2]), M4.rotY(steer));
        wheels[k].children[0].matrix = M4.rotZ(-spin);
      }

      const setColor = (node, color) => node.mesh.faces.forEach((f) => { f.color = color; });
      const blinkL = (ui.hazard || ui.turnSignal === 'left') && ui.blinkOn;
      const blinkR = (ui.hazard || ui.turnSignal === 'right') && ui.blinkOn;
      const amber = [255, 168, 40], amberOff = [92, 76, 42];
      setColor(lights.signalFL, blinkL ? amber : amberOff);
      setColor(lights.signalRL, blinkL ? amber : amberOff);
      setColor(lights.signalFR, blinkR ? amber : amberOff);
      setColor(lights.signalRR, blinkR ? amber : amberOff);

      const head = ui.headlight === 2 ? [252, 250, 236] : ui.headlight === 1 ? [180, 178, 168] : [92, 94, 98];
      setColor(lights.headL, head);
      setColor(lights.headR, head);

      const tail = v.brake > 0.05 ? [255, 60, 50] : (ui.headlight > 0 ? [190, 44, 40] : [96, 34, 32]);
      setColor(lights.tailL, tail);
      setColor(lights.tailR, tail);

      const rev = v.gear === 'R' ? [246, 248, 252] : [110, 110, 114];
      setColor(lights.reverseL, rev);
      setColor(lights.reverseR, rev);

      if (cockpit.node.visible) cockpit.update(v, ui, dt);
    },
  };
}

// 운전석에서 보이는 실내.
// 캡오버 트럭이라 보닛이 없고 앞유리 아랫변이 앞범퍼 바로 위에 있다.
// 눈높이(1.62m)가 승용차보다 높아 코스가 훨씬 잘 보인다.
function buildCockpit() {
  const node = new Node('cockpit');
  const m = new Mesh();
  const P = (x, y, z) => [x, y, z];

  // 눈높이 1.62m · 눈 위치 x=0.85 를 기준으로, 카울 너머 약 4.5m 앞부터
  // 노면이 보이도록 맞춘 값들. 캡오버 트럭이라 승용차보다 시야가 훨씬 넓다.
  const COWL = 2.05;        // 앞유리 아랫변(대시보드 앞끝)
  const COWL_Y = 1.32;
  const DASH_BACK = 1.40;   // 대시보드 뒤끝(운전자 쪽)
  const DASH_Y = 1.26;
  const ROOF_F = 1.98;      // 지붕 앞단
  const ROOF_Y = SPEC.height - 0.07;
  const Wi = SPEC.width / 2 - 0.06;

  // 대시보드 윗면과 앞면
  m.addPoly([P(DASH_BACK, DASH_Y, -Wi), P(COWL, COWL_Y, -Wi),
    P(COWL, COWL_Y, Wi), P(DASH_BACK, DASH_Y, Wi)], [62, 65, 72]);
  m.addPoly([P(DASH_BACK, DASH_Y, -Wi), P(DASH_BACK, DASH_Y, Wi),
    P(DASH_BACK, 0.72, Wi), P(DASH_BACK, 0.72, -Wi)], [46, 48, 54]);
  m.merge(box(0.62, 0.5, Wi * 2, [40, 42, 47]), M4.translate(1.72, 0.74, 0));

  // 계기판 후드
  m.merge(box(0.32, 0.14, 0.52, [30, 32, 36]), M4.translate(1.58, 1.33, -0.44));
  m.addPoly([P(1.44, 1.29, -0.70), P(1.72, 1.29, -0.70),
    P(1.72, 1.29, -0.18), P(1.44, 1.29, -0.18)], [18, 22, 28], { unlit: true });

  // 센터페시아
  m.merge(box(0.20, 0.32, 0.46, [50, 53, 59]), M4.translate(1.56, 1.06, 0.26));
  m.merge(box(0.02, 0.13, 0.34, [26, 34, 44]), M4.translate(1.45, 1.13, 0.26));

  // A필러 · 지붕 앞단 (트럭은 필러가 거의 수직이다)
  for (const sgn of [-1, 1]) {
    const zz = Wi * sgn;
    m.addPoly([P(COWL, COWL_Y, zz), P(ROOF_F, ROOF_Y, zz),
      P(ROOF_F, ROOF_Y, zz - 0.07 * sgn), P(COWL, COWL_Y, zz - 0.07 * sgn)], [92, 96, 104]);
  }
  m.merge(box(0.16, 0.06, Wi * 2, [82, 86, 94]), M4.translate(ROOF_F - 0.04, ROOF_Y, 0));
  m.merge(box(0.06, 0.10, 0.28, [36, 38, 42]), M4.translate(1.74, ROOF_Y - 0.15, 0.04));
  node.add(new Node('interior', m));

  // 스티어링 휠 (트럭은 승용차보다 크고 더 눕혀져 있다)
  const wheelNode = new Node('wheel');
  const wm = new Mesh();
  wm.merge(torus(0.215, 0.019, [28, 29, 33], 26, 6));
  for (const a of [180, 0, 270]) {
    wm.merge(box(0.185, 0.032, 0.028, [52, 54, 60]),
      M4.multiply(M4.rotZ(a * Math.PI / 180), M4.translate(0.10, 0, 0)));
  }
  wm.merge(cylinder(0.062, 0.058, 0.045, [46, 48, 54], 12),
    M4.multiply(M4.translate(0, 0, -0.022), M4.rotX(90 * Math.PI / 180)));
  wheelNode.add(new Node('rim', wm));

  const wheelMount = new Node('mount', null, M4.chain(
    M4.translate(1.44, 1.18, -0.44),
    M4.rotY(-Math.PI / 2),
    M4.rotX(-38 * Math.PI / 180),      // 트럭 특유의 눕힌 컬럼 각도
  ));
  wheelMount.add(wheelNode);
  node.add(wheelMount);

  const col = new Mesh();
  col.merge(cylinder(0.066, 0.058, 0.24, [36, 38, 43], 10), M4.rotX(-90 * Math.PI / 180));
  wheelMount.add(new Node('col', col, M4.translate(0, 0, -0.07)));

  const stalk = (dir) => {
    const s = new Mesh();
    s.merge(cylinder(0.013, 0.011, 0.145, [40, 42, 47], 8), M4.rotZ(dir * 90 * Math.PI / 180));
    s.merge(cylinder(0.017, 0.017, 0.04, [58, 61, 68], 8),
      M4.multiply(M4.translate(0.11 * dir, 0, 0), M4.rotZ(dir * 90 * Math.PI / 180)));
    return s;
  };
  const stalkL = new Node('stalkL');
  const stalkR = new Node('stalkR');
  stalkL.add(new Node('m', stalk(1)));
  stalkR.add(new Node('m', stalk(-1)));
  wheelMount.add(stalkL);
  wheelMount.add(stalkR);

  let sigAngle = 0, wipAngle = 0;
  return {
    node,
    update(v, ui, dt) {
      wheelNode.matrix = M4.rotZ(-v.steer * 7);
      const sigTarget = ui.turnSignal === 'left' ? 0.26 : ui.turnSignal === 'right' ? -0.26 : 0;
      sigAngle += (sigTarget - sigAngle) * Math.min(1, dt * 8);
      wipAngle += (((ui.wiper || 0) * -0.09) - wipAngle) * Math.min(1, dt * 8);
      stalkL.matrix = M4.multiply(M4.translate(-0.06, 0, -0.11), M4.rotZ(sigAngle));
      stalkR.matrix = M4.multiply(M4.translate(0.06, 0, -0.11), M4.rotZ(wipAngle));
    },
  };
}
