// 시험 차량 3D 모델.
// 차체 로컬 좌표는 +X 가 전방, +Y 가 위, +Z 가 차량 오른쪽이다.

import { M4 } from '../gfx/math.js';
import { Node, Mesh, box, cylinder, torus, shade } from '../gfx/mesh.js';
import { SPEC } from './vehicle.js';

const BODY = [214, 216, 222];       // 시험 차량은 대개 흰색 계열
const BODY_DARK = shade(BODY, 0.72);
const GLASS = [58, 74, 88];
const TIRE = [30, 31, 34];
const RIM = [168, 172, 180];
const TRIM = [46, 48, 52];

function wheel() {
  const m = new Mesh();
  const r = SPEC.wheelRadius;
  // 축이 Z(차량 좌우) 방향이 되도록 원기둥을 눕힌다.
  m.merge(cylinder(r, r, 0.215, TIRE, 14), M4.multiply(M4.translate(0, 0, -0.1075), M4.rotX(-90 * Math.PI / 180)));
  m.merge(cylinder(r * 0.62, r * 0.62, 0.05, RIM, 12),
    M4.multiply(M4.translate(0, 0, 0.085), M4.rotX(-90 * Math.PI / 180)));
  // 휠 스포크(회전이 눈에 보이도록)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    m.merge(box(r * 0.9, 0.035, 0.03, shade(RIM, 0.85)),
      M4.multiply(M4.multiply(M4.translate(0, 0, 0.112), M4.rotZ(a)), M4.translate(0, 0, 0)));
  }
  return m;
}

export function buildCar() {
  const root = new Node('car');
  const body = new Node('body');
  root.add(body);

  const m = new Mesh();
  const F = 2.14, R = -2.19;          // 앞·뒤 끝
  const W = SPEC.width / 2;

  // ---- 하부 / 사이드실
  m.merge(box(4.20, 0.30, W * 2 - 0.06, BODY_DARK), M4.translate(-0.02, 0.44, 0));

  // ---- 메인 바디(옆면 실루엣을 살리기 위해 앞·중간·뒤를 나눠 만든다)
  m.merge(box(1.30, 0.42, W * 2, BODY), M4.translate(1.40, 0.80, 0));            // 보닛
  m.merge(box(2.10, 0.60, W * 2, BODY), M4.translate(0.05, 0.86, 0));            // 도어 구간
  m.merge(box(1.15, 0.46, W * 2, BODY), M4.translate(-1.62, 0.82, 0));           // 트렁크

  // 앞·뒤 범퍼
  m.merge(box(0.28, 0.46, W * 2 - 0.04, BODY), M4.translate(F - 0.14, 0.62, 0));
  m.merge(box(0.30, 0.48, W * 2 - 0.04, BODY), M4.translate(R + 0.15, 0.62, 0));
  m.merge(box(0.16, 0.16, W * 2 - 0.30, TRIM), M4.translate(F - 0.05, 0.46, 0));
  m.merge(box(0.16, 0.16, W * 2 - 0.30, TRIM), M4.translate(R + 0.06, 0.46, 0));

  // ---- 캐빈(앞유리·뒷유리 경사를 준 사다리꼴)
  const cw = W - 0.07;                 // 지붕 폭
  const y0 = 1.08, y1 = 1.50;          // 벨트라인 / 지붕
  const cabF = 0.86, cabR = -1.30;     // 벨트라인의 앞·뒤
  const roofF = 0.16, roofR = -1.06;   // 지붕의 앞·뒤
  const P = (x, y, z) => [x, y, z];
  for (const sgn of [-1, 1]) {
    m.addPoly([
      P(cabF, y0, cw * sgn), P(roofF, y1, cw * sgn),
      P(roofR, y1, cw * sgn), P(cabR, y0, cw * sgn),
    ], sgn > 0 ? shade(BODY, 0.94) : shade(BODY, 0.94));
  }
  // 지붕
  m.addPoly([P(roofF, y1, -cw), P(roofF, y1, cw), P(roofR, y1, cw), P(roofR, y1, -cw)], shade(BODY, 1.05));
  // 앞유리 / 뒷유리
  m.addPoly([P(cabF, y0, -cw), P(cabF, y0, cw), P(roofF, y1, cw), P(roofF, y1, -cw)], GLASS);
  m.addPoly([P(cabR, y0, -cw), P(roofR, y1, -cw), P(roofR, y1, cw), P(cabR, y0, cw)], GLASS);
  // 옆유리
  for (const sgn of [-1, 1]) {
    const z = cw * sgn + 0.008 * sgn;
    m.addPoly([
      P(cabF - 0.10, y0 + 0.03, z), P(roofF + 0.06, y1 - 0.05, z),
      P(roofR - 0.06, y1 - 0.05, z), P(cabR + 0.10, y0 + 0.03, z),
    ], GLASS);
  }
  // A/B/C 필러 느낌의 어두운 띠
  m.merge(box(4.0, 0.05, W * 2 + 0.02, TRIM), M4.translate(-0.2, y0 - 0.02, 0));

  // ---- 사이드미러
  for (const sgn of [-1, 1]) {
    m.merge(box(0.20, 0.11, 0.09, BODY), M4.translate(0.80, 1.02, (W + 0.09) * sgn));
    m.merge(box(0.03, 0.09, 0.07, GLASS), M4.translate(0.71, 1.02, (W + 0.09) * sgn));
  }

  // ---- 그릴 / 휠아치 그림자
  m.merge(box(0.06, 0.22, 1.05, [26, 27, 30]), M4.translate(F - 0.02, 0.70, 0));
  for (const x of [1.31, -1.31]) {
    for (const sgn of [-1, 1]) {
      m.merge(box(0.90, 0.30, 0.06, shade(TRIM, 0.9)), M4.translate(x, 0.44, (W - 0.02) * sgn));
    }
  }
  body.add(new Node('shell', m));

  // ---- 등화류(색이 바뀌므로 별도 노드로 둔다)
  const mkLamp = (name, mesh, mtx) => {
    const n = new Node(name, mesh, mtx);
    body.add(n);
    return n;
  };
  const lampQuad = (w, h, color) => new Mesh().addPoly(
    [[0, -h / 2, -w / 2], [0, -h / 2, w / 2], [0, h / 2, w / 2], [0, h / 2, -w / 2]],
    color, { unlit: true },
  );

  const lights = {
    headL: mkLamp('headL', lampQuad(0.42, 0.16, [90, 92, 96]), M4.translate(F + 0.005, 0.80, -0.60)),
    headR: mkLamp('headR', lampQuad(0.42, 0.16, [90, 92, 96]), M4.translate(F + 0.005, 0.80, 0.60)),
    signalFL: mkLamp('sfl', lampQuad(0.16, 0.12, [90, 74, 40]), M4.translate(F + 0.005, 0.66, -0.74)),
    signalFR: mkLamp('sfr', lampQuad(0.16, 0.12, [90, 74, 40]), M4.translate(F + 0.005, 0.66, 0.74)),
    tailL: mkLamp('tailL', lampQuad(0.34, 0.20, [96, 34, 32]), M4.translate(R - 0.005, 0.86, -0.62)),
    tailR: mkLamp('tailR', lampQuad(0.34, 0.20, [96, 34, 32]), M4.translate(R - 0.005, 0.86, 0.62)),
    signalRL: mkLamp('srl', lampQuad(0.14, 0.16, [90, 74, 40]), M4.translate(R - 0.005, 0.86, -0.80)),
    signalRR: mkLamp('srr', lampQuad(0.14, 0.16, [90, 74, 40]), M4.translate(R - 0.005, 0.86, 0.80)),
    reverseL: mkLamp('rvl', lampQuad(0.14, 0.14, [110, 110, 114]), M4.translate(R - 0.005, 0.68, -0.50)),
    reverseR: mkLamp('rvr', lampQuad(0.14, 0.14, [110, 110, 114]), M4.translate(R - 0.005, 0.68, 0.50)),
  };

  // ---- 바퀴
  const wm = wheel();
  const halfWB = SPEC.wheelbase / 2;
  const wheels = {
    fl: new Node('fl', null, M4.identity()),
    fr: new Node('fr', null, M4.identity()),
    rl: new Node('rl', null, M4.identity()),
    rr: new Node('rr', null, M4.identity()),
  };
  const wheelPos = {
    fl: [halfWB, SPEC.wheelRadius, -SPEC.trackHalf],
    fr: [halfWB, SPEC.wheelRadius, SPEC.trackHalf],
    rl: [-halfWB, SPEC.wheelRadius, -SPEC.trackHalf],
    rr: [-halfWB, SPEC.wheelRadius, SPEC.trackHalf],
  };
  for (const k of Object.keys(wheels)) {
    wheels[k].add(new Node('spin', wm));
    body.add(wheels[k]);
  }

  // ---- 시험용 표시(지붕 위 삼각 표지)
  const topSign = new Mesh();
  topSign.merge(box(0.34, 0.22, 0.86, [212, 214, 220]), M4.translate(-0.35, 1.61, 0));
  topSign.merge(box(0.35, 0.03, 0.82, [200, 60, 50]), M4.translate(-0.35, 1.61, 0));
  body.add(new Node('topSign', topSign));

  // ---- 운전석 시점용 실내(1인칭에서 shell 대신 표시한다)
  const cockpit = buildCockpit();
  body.add(cockpit.node);
  cockpit.node.visible = false;
  const shellNode = body.children[0];

  let spin = 0;
  return {
    root,
    lights,
    cockpit,
    // 시점에 따라 외장/실내를 전환한다.
    setInterior(on) {
      cockpit.node.visible = on;
      shellNode.visible = !on;
      body.find('topSign').visible = !on;
      for (const k of ['fl', 'fr', 'rl', 'rr']) body.find(k).visible = !on;
      for (const n of Object.values(lights)) n.visible = !on;
    },
    // v: Vehicle, ui: { turnSignal, blinkOn, hazard, headlight }
    update(v, ui, dt) {
      spin += (v.speed / SPEC.wheelRadius) * dt;

      // 월드 배치: 위치 → 요 → 피치/롤 → 서스펜션 흔들림
      root.matrix = M4.chain(
        M4.translate(v.x, v.y + v.bodyBounce, v.z),
        M4.rotY(-v.heading),
        M4.rotZ(v.pitch),
        M4.rotX(v.roll),
      );

      for (const k of Object.keys(wheels)) {
        const p = wheelPos[k];
        const steer = (k === 'fl' || k === 'fr') ? -v.steer : 0;
        wheels[k].matrix = M4.chain(M4.translate(p[0], p[1], p[2]), M4.rotY(steer));
        wheels[k].children[0].matrix = M4.rotZ(-spin);
      }

      const setColor = (node, color) => {
        node.mesh.faces.forEach((f) => { f.color = color; });
      };
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

      const braking = v.brake > 0.05;
      const tail = braking ? [255, 60, 50] : (ui.headlight > 0 ? [190, 44, 40] : [96, 34, 32]);
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
// 운전자 눈높이가 로컬 (-0.03, 1.28, -0.38) 이므로, 그보다 확실히 앞쪽(x > 0.4)에
// 있는 것만 만든다. 눈 옆이나 뒤를 지나는 형상은 화면 전체를 덮어 버린다.
function buildCockpit() {
  const node = new Node('cockpit');
  const W = SPEC.width / 2;
  const m = new Mesh();
  const P = (x, y, z) => [x, y, z];

  // 눈높이(1.32m)에서 보닛 너머 약 6~7m 앞부터 노면이 보이도록 잡은 값들.
  // 보닛을 높게 두면 실차보다 훨씬 넓은 사각이 생겨 코스가 보이지 않는다.
  const DASH_BACK = 0.42;   // 대시보드 뒤끝(운전자 쪽)
  const DASH_TOP = 0.99;
  const COWL = 1.06;        // 앞유리가 시작되는 카울 위치
  const COWL_TOP = 1.04;
  const HOOD_Y = 0.94;
  const HOOD_END = 1.98;

  // 대시보드 윗면(운전자 쪽에서 앞유리 쪽으로 살짝 올라간다)
  m.addPoly([
    P(DASH_BACK, DASH_TOP, -W), P(COWL, COWL_TOP, -W),
    P(COWL, COWL_TOP, W), P(DASH_BACK, DASH_TOP, W),
  ], [58, 61, 68]);
  // 대시보드 앞면(운전자를 마주보는 면)과 아랫부분
  m.addPoly([
    P(DASH_BACK, DASH_TOP, -W), P(DASH_BACK, DASH_TOP, W),
    P(DASH_BACK, 0.62, W), P(DASH_BACK, 0.62, -W),
  ], [44, 46, 52]);
  m.merge(box(0.64, 0.44, W * 2, [38, 40, 45]), M4.translate(0.74, 0.62, 0));

  // 계기판 후드(스티어링 휠 너머로 보이는 부분)
  m.merge(box(0.28, 0.13, 0.46, [30, 32, 36]), M4.translate(0.60, 1.01, -0.38));
  m.addPoly([
    P(0.50, 0.97, -0.60), P(0.74, 0.97, -0.60), P(0.74, 0.97, -0.16), P(0.50, 0.97, -0.16),
  ], [18, 22, 28], { unlit: true });

  // 센터페시아(오른쪽 아래)
  m.merge(box(0.16, 0.30, 0.42, [50, 53, 59]), M4.translate(0.62, 0.80, 0.30));
  m.merge(box(0.02, 0.13, 0.32, [26, 34, 44]), M4.translate(0.54, 0.90, 0.30));

  // 보닛(앞유리 너머로 내려다보이는 부분)
  m.addPoly([
    P(COWL, HOOD_Y, -W + 0.02), P(HOOD_END, HOOD_Y, -W + 0.10),
    P(HOOD_END, HOOD_Y, W - 0.10), P(COWL, HOOD_Y, W - 0.02),
  ], shade(BODY, 1.04));
  for (const sgn of [-1, 1]) {
    // 펜더 능선(차폭 감각을 주는 부분)
    m.addPoly([
      P(COWL, HOOD_Y, (W - 0.02) * sgn), P(HOOD_END, HOOD_Y, (W - 0.10) * sgn),
      P(HOOD_END, HOOD_Y + 0.05, (W - 0.10) * sgn), P(COWL, HOOD_Y + 0.05, (W - 0.02) * sgn),
    ], shade(BODY, 0.86));
  }

  // A필러 (좌우 시야 가장자리)
  for (const sgn of [-1, 1]) {
    const zz = (W - 0.02) * sgn;
    m.addPoly([
      P(COWL, COWL_TOP, zz), P(0.80, 1.44, zz),
      P(0.80, 1.44, zz - 0.075 * sgn), P(COWL, COWL_TOP, zz - 0.075 * sgn),
    ], [84, 88, 96]);
  }
  node.add(new Node('interior', m));

  // 스티어링 휠 (운전석은 차량 왼쪽 = 로컬 -Z)
  const wheelNode = new Node('wheel', null, M4.identity());
  const wm = new Mesh();
  wm.merge(torus(0.185, 0.017, [28, 29, 33], 26, 6));
  for (const a of [180, 0, 270]) {
    wm.merge(box(0.155, 0.030, 0.026, [52, 54, 60]),
      M4.multiply(M4.rotZ(a * Math.PI / 180), M4.translate(0.088, 0, 0)));
  }
  wm.merge(cylinder(0.056, 0.052, 0.04, [46, 48, 54], 12),
    M4.multiply(M4.translate(0, 0, -0.02), M4.rotX(90 * Math.PI / 180)));
  wheelNode.add(new Node('rim', wm));

  // 컬럼 각도만큼 기울인 마운트. 자식들의 로컬 -Z 가 운전자 쪽을 향한다.
  const wheelMount = new Node('mount', null, M4.chain(
    M4.translate(0.64, 0.93, -0.38),
    M4.rotY(-Math.PI / 2),
    M4.rotX(-26 * Math.PI / 180),
  ));
  wheelMount.add(wheelNode);
  node.add(wheelMount);

  // 컬럼 커버와 좌우 레버(1인칭에서도 깜빡이·와이퍼 레버가 움직이는 것이 보인다)
  const col = new Mesh();
  col.merge(cylinder(0.062, 0.055, 0.22, [36, 38, 43], 10), M4.rotX(-90 * Math.PI / 180));
  wheelMount.add(new Node('col', col, M4.translate(0, 0, -0.06)));

  const stalk = (dir) => {
    const s = new Mesh();
    s.merge(cylinder(0.012, 0.010, 0.135, [40, 42, 47], 8), M4.rotZ(dir * 90 * Math.PI / 180));
    s.merge(cylinder(0.016, 0.016, 0.038, [58, 61, 68], 8),
      M4.multiply(M4.translate(0.10 * dir, 0, 0), M4.rotZ(dir * 90 * Math.PI / 180)));
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
      wheelNode.matrix = M4.rotZ(-v.steer * 8);
      // 마운트의 로컬 X 는 차량 좌측(-Z)을 향하므로 좌측 레버는 -X 쪽에 붙는다.
      const sigTarget = ui.turnSignal === 'left' ? 0.26 : ui.turnSignal === 'right' ? -0.26 : 0;
      sigAngle += (sigTarget - sigAngle) * Math.min(1, dt * 8);
      wipAngle += (((ui.wiper || 0) * -0.09) - wipAngle) * Math.min(1, dt * 8);
      stalkL.matrix = M4.multiply(M4.translate(-0.055, 0, -0.10), M4.rotZ(sigAngle));
      stalkR.matrix = M4.multiply(M4.translate(0.055, 0, -0.10), M4.rotZ(wipAngle));
    },
  };
}
