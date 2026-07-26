// 실제 자동차의 조작 부품을 3D로 재현한 모델 모음.
// 각 부품은 { id, title, subtitle, camera, root, update(state, dt), status(state) } 형태를 가진다.
// update()는 매 프레임 호출되어 노드의 행렬을 갱신하는 방식으로 애니메이션을 처리한다.

import { M4 } from '../gfx/math.js';
import { Node, Mesh, box, beveledBox, cylinder, sphere, torus, shade } from '../gfx/mesh.js';
import { approach, lerp } from '../gfx/math.js';

const C = {
  darkPlastic: [78, 82, 90],
  midPlastic: [112, 116, 126],
  litePlastic: [146, 151, 161],
  chrome: [190, 195, 203],
  steel: [154, 159, 167],
  leather: [62, 64, 70],
  amber: [255, 168, 40],
  amberOff: [96, 72, 34],
  red: [206, 48, 42],
  redOff: [92, 34, 32],
  green: [86, 224, 128],
  greenOff: [40, 70, 50],
  blue: [90, 160, 255],
  glass: [150, 190, 210],
  belt: [70, 73, 82],
  white: [232, 234, 238],
};

const DEG = Math.PI / 180;

// 넓은 배경 판(바닥·패널)은 항상 먼저 그린다.
// 폴리곤 단위 깊이 정렬만으로는 큰 면이 작은 부품을 덮어 버리기 때문이다.
const BACKDROP = { layer: 0 };

// ---------------------------------------------------------------------------
// 공용 조각들
// ---------------------------------------------------------------------------

// 스티어링 컬럼(레버가 달리는 몸통) + 스티어링 휠 일부.
// 방향지시등 · 전조등 · 와이퍼 레버가 모두 여기에 붙는다.
function buildColumn({ withWheel = true } = {}) {
  const root = new Node('column');

  // 컬럼 커버(상·하 분리형처럼 보이도록 두 덩어리로 만든다)
  const shroud = new Mesh();
  shroud.merge(cylinder(0.088, 0.072, 0.30, C.darkPlastic, 16), M4.rotX(90 * DEG));
  shroud.merge(cylinder(0.098, 0.09, 0.055, shade(C.darkPlastic, 1.12), 16),
    M4.multiply(M4.translate(0, 0, -0.012), M4.rotX(90 * DEG)));
  root.add(new Node('shroud', shroud, M4.translate(0, 0, -0.30)));

  // 컬럼과 대시보드를 잇는 목 부분
  root.add(new Node('neck',
    beveledBox(0.20, 0.10, 0.16, 0.02, shade(C.darkPlastic, 0.82)),
    M4.translate(0, -0.01, -0.34)));

  if (withWheel) {
    const wheel = new Node('wheel', null, M4.translate(0, 0, 0.06));
    const rim = new Mesh();
    rim.merge(torus(0.185, 0.0165, C.leather, 28, 8));
    // 스포크 3개(9시·3시·6시)
    for (const a of [180, 0, 270]) {
      const spoke = box(0.16, 0.026, 0.028, shade(C.darkPlastic, 1.2));
      rim.merge(spoke, M4.multiply(M4.rotZ(a * DEG), M4.translate(0.095, 0, 0)));
    }
    rim.merge(cylinder(0.052, 0.05, 0.05, shade(C.darkPlastic, 1.05), 14),
      M4.multiply(M4.translate(0, 0, -0.025), M4.rotX(90 * DEG)));
    wheel.add(new Node('rim', rim));
    root.add(wheel);
  }
  return root;
}

// 컬럼에 붙는 레버 하나.
//  side: -1(좌측, 방향지시등/전조등) | +1(우측, 와이퍼)
//  반환된 노드 트리의 'pivot'을 Z축으로 돌리면 레버 끝이 위아래로 움직이고,
//  'knob'을 Y축으로 돌리면 레버 끝 다이얼이 돌아간다.
function buildStalk(side, { knob = 'dial' } = {}) {
  const pivot = new Node('pivot', null, M4.translate(0.072 * side, 0, -0.12));

  // 로컬 +Y 가 레버가 뻗어나가는 방향이 되도록 정렬한다.
  const orient = pivot.add(new Node('orient', null,
    M4.multiply(M4.rotY(-22 * DEG * side), M4.rotZ(90 * DEG * -side))));

  const rod = new Mesh();
  rod.merge(cylinder(0.0165, 0.0125, 0.055, shade(C.darkPlastic, 1.25), 12));
  rod.merge(cylinder(0.0125, 0.0115, 0.075, C.darkPlastic, 12), M4.translate(0, 0.055, 0));
  orient.add(new Node('rod', rod));

  const knobNode = orient.add(new Node('knob', null, M4.translate(0, 0.128, 0)));
  const km = new Mesh();
  if (knob === 'dial') {
    // 전조등 다이얼: 굵은 원통 + 돌기 12개
    km.merge(cylinder(0.0185, 0.0185, 0.052, shade(C.midPlastic, 0.95), 14));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      km.merge(box(0.0035, 0.05, 0.006, shade(C.darkPlastic, 0.8)),
        M4.multiply(M4.rotY(a), M4.translate(0, 0.026, 0.0185)));
    }
    // 위치 표식(현재 단수를 눈으로 확인할 수 있게)
    km.merge(box(0.004, 0.05, 0.004, C.white), M4.translate(0, 0.026, 0.019));
  } else {
    // 와이퍼 링: 얇은 링 두 개 + 손잡이 홈
    km.merge(cylinder(0.0175, 0.0175, 0.040, shade(C.midPlastic, 0.95), 14));
    km.merge(cylinder(0.0195, 0.0195, 0.008, shade(C.litePlastic, 0.9), 14), M4.translate(0, 0.006, 0));
    km.merge(cylinder(0.0195, 0.0195, 0.008, shade(C.litePlastic, 0.9), 14), M4.translate(0, 0.026, 0));
    km.merge(box(0.004, 0.038, 0.004, C.white), M4.translate(0, 0.002, 0.018));
  }
  knobNode.add(new Node('knobMesh', km));

  // 레버 끝 마감
  orient.add(new Node('tip', sphere(0.0135, shade(C.darkPlastic, 1.1), 10, 6),
    M4.translate(0, 0.186, 0)));

  return pivot;
}

// ---------------------------------------------------------------------------
// 부품 정의
// ---------------------------------------------------------------------------

// 1. 방향지시등 레버 --------------------------------------------------------
function partTurnSignal() {
  const root = new Node('root');
  root.add(buildColumn());
  const left = buildStalk(-1, { knob: 'dial' });
  const right = buildStalk(+1, { knob: 'ring' });
  root.add(left);
  root.add(right);

  // 레버 끝 근처에 방향 표시등을 달아 어느 쪽이 켜졌는지 바로 보이게 한다.
  const lampL = new Node('lampL', sphere(0.011, C.amberOff, 10, 6), M4.translate(-0.255, 0.055, 0.055));
  const lampR = new Node('lampR', sphere(0.011, C.amberOff, 10, 6), M4.translate(0.255, 0.055, 0.055));
  root.add(lampL);
  root.add(lampR);

  let angle = 0;
  return {
    id: 'turnSignal',
    title: '방향지시등 레버',
    subtitle: '스티어링 컬럼 좌측 · 아래로 내리면 좌회전, 위로 올리면 우회전',
    camera: { eye: [0.34, 0.30, 0.62], target: [0, -0.01, -0.12], fov: 42 },
    root,
    update(state, dt) {
      // 좌: 레버를 아래로(+Z축 회전) / 우: 위로
      const target = state.turnSignal === 'left' ? 0.26
        : state.turnSignal === 'right' ? -0.26 : 0;
      angle = approach(angle, target, dt * 3.4);
      left.matrix = M4.multiply(M4.translate(-0.072, 0, -0.12), M4.rotZ(angle));

      const on = state.blinkOn;
      lampL.mesh.faces.forEach((f) => {
        f.color = state.turnSignal === 'left' && on ? C.amber : C.amberOff;
        f.unlit = state.turnSignal === 'left' && on;
      });
      lampR.mesh.faces.forEach((f) => {
        f.color = state.turnSignal === 'right' && on ? C.amber : C.amberOff;
        f.unlit = state.turnSignal === 'right' && on;
      });
    },
    status(state) {
      if (state.turnSignal === 'left') return { text: '좌측 점등 ◄', tone: 'amber' };
      if (state.turnSignal === 'right') return { text: '우측 점등 ►', tone: 'amber' };
      return { text: '소등', tone: 'off' };
    },
  };
}

// 2. 와이퍼 레버 ------------------------------------------------------------
function partWiper() {
  const root = new Node('root');
  root.add(buildColumn());
  const left = buildStalk(-1, { knob: 'dial' });
  const right = buildStalk(+1, { knob: 'ring' });
  root.add(left);
  root.add(right);

  // 단수 표시용 작은 눈금(OFF · INT · LO · HI)
  const marks = [];
  for (let i = 0; i < 4; i++) {
    const n = new Node('mark' + i, box(0.018, 0.006, 0.006, C.midPlastic),
      M4.translate(0.135, 0.055 - i * 0.028, 0.02));
    root.add(n);
    marks.push(n);
  }

  let angle = 0, ring = 0;
  const STEPS = [0, -0.10, -0.20, -0.30];
  return {
    id: 'wiper',
    title: '와이퍼 레버',
    subtitle: '스티어링 컬럼 우측 · 아래로 내릴수록 단수가 올라간다',
    camera: { eye: [-0.30, 0.30, 0.60], target: [0.04, 0.0, -0.12], fov: 42 },
    root,
    update(state, dt) {
      angle = approach(angle, STEPS[state.wiper] || 0, dt * 3.0);
      right.matrix = M4.multiply(M4.translate(0.072, 0, -0.12), M4.rotZ(angle));
      // INT(간헐) 단계에서는 조절 링이 돌아간다.
      ring = approach(ring, state.wiper === 1 ? 0.9 : 0, dt * 2.5);
      right.find('knob').matrix = M4.multiply(M4.translate(0, 0.128, 0), M4.rotY(ring));

      marks.forEach((n, i) => {
        const lit = i === state.wiper;
        n.mesh.faces.forEach((f) => {
          f.color = lit ? C.green : C.midPlastic;
          f.unlit = lit;
        });
      });
    },
    status(state) {
      return {
        text: ['OFF (정지)', 'INT (간헐)', 'LO (저속)', 'HI (고속)'][state.wiper] || 'OFF',
        tone: state.wiper > 0 ? 'green' : 'off',
      };
    },
  };
}

// 3. 전조등 스위치 ----------------------------------------------------------
function partHeadlight() {
  const root = new Node('root');
  // 다이얼이 스티어링 휠에 가리지 않도록 휠은 빼고 컬럼만 보여 준다.
  root.add(buildColumn({ withWheel: false }));
  const left = buildStalk(-1, { knob: 'dial' });
  root.add(left);

  // 다이얼 옆 단계 표시
  const marks = [];
  for (let i = 0; i < 3; i++) {
    const n = new Node('hm' + i, box(0.022, 0.008, 0.008, C.midPlastic),
      M4.translate(-0.20, 0.055 - i * 0.028, 0.02));
    root.add(n);
    marks.push(n);
  }

  let dial = 0;
  return {
    id: 'headlight',
    title: '전조등 스위치',
    subtitle: '좌측 레버 끝 다이얼 · OFF → 미등 → 전조등',
    camera: { eye: [0.10, 0.17, 0.34], target: [-0.17, 0.01, -0.07], fov: 40 },
    root,
    update(state, dt) {
      dial = approach(dial, state.headlight * 0.9, dt * 3.2);
      left.find('knob').matrix = M4.multiply(M4.translate(0, 0.128, 0), M4.rotY(dial));
      marks.forEach((n, i) => {
        const lit = i === state.headlight;
        n.mesh.faces.forEach((f) => {
          f.color = lit ? (i === 2 ? C.blue : C.green) : C.midPlastic;
          f.unlit = lit;
        });
      });
    },
    status(state) {
      return {
        text: ['OFF', '미등 (차폭등)', '전조등 (하향등)'][state.headlight] || 'OFF',
        tone: state.headlight > 0 ? 'green' : 'off',
      };
    },
  };
}

// 4. 비상점멸등 스위치 ------------------------------------------------------
function partHazard() {
  const root = new Node('root');
  // 센터페시아 패널
  root.add(new Node('panel', beveledBox(0.40, 0.24, 0.06, 0.015, shade(C.darkPlastic, 0.9), BACKDROP),
    M4.translate(0, 0, -0.03)));
  root.add(new Node('trim', box(0.44, 0.02, 0.05, C.chrome), M4.translate(0, -0.13, -0.02)));
  // 송풍구 흉내(패널이 밋밋하지 않도록)
  for (let i = 0; i < 2; i++) {
    root.add(new Node('vent' + i, box(0.12, 0.05, 0.02, shade(C.darkPlastic, 0.6)),
      M4.translate(-0.13 + i * 0.26, 0.07, 0.015)));
  }

  const btn = new Node('btn', null, M4.identity());
  const bm = new Mesh();
  bm.merge(beveledBox(0.062, 0.062, 0.022, 0.008, shade(C.midPlastic, 1.0)));
  root.add(btn);
  btn.add(new Node('cap', bm, M4.translate(0, 0, 0.012)));

  // 빨간 삼각형(비상등 기호)
  const tri = new Mesh();
  const R = 0.019;
  const outer = [], inner = [];
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + i * (Math.PI * 2 / 3);
    outer.push([Math.cos(a) * R, Math.sin(a) * R, 0]);
    inner.push([Math.cos(a) * R * 0.58, Math.sin(a) * R * 0.58, 0]);
  }
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    tri.addPoly([outer[i], outer[j], inner[j], inner[i]], C.redOff, { unlit: true });
  }
  const triNode = new Node('tri', tri, M4.translate(0, 0, 0.024));
  btn.add(triNode);

  let press = 0;
  return {
    id: 'hazard',
    title: '비상점멸등 스위치',
    subtitle: '센터페시아 중앙 · 돌발상황·정차 시 사용',
    camera: { eye: [0.16, 0.20, 0.46], target: [0, 0.0, 0], fov: 40 },
    root,
    update(state, dt) {
      press = approach(press, state.hazard ? 1 : 0, dt * 8);
      btn.matrix = M4.translate(0, 0, -0.008 * press);
      const lit = state.hazard && state.blinkOn;
      triNode.mesh.faces.forEach((f) => { f.color = lit ? C.red : C.redOff; });
    },
    status(state) {
      return state.hazard
        ? { text: '점멸 중', tone: 'red' }
        : { text: 'OFF', tone: 'off' };
    },
  };
}

// 5. 변속 레버(오토) --------------------------------------------------------
function partGear() {
  const root = new Node('root');
  root.add(new Node('console', beveledBox(0.30, 0.10, 0.46, 0.02, shade(C.darkPlastic, 0.85), BACKDROP),
    M4.translate(0, -0.06, 0)));
  // 게이트 슬롯
  root.add(new Node('slot', box(0.055, 0.02, 0.34, [16, 17, 20]), M4.translate(0, -0.008, 0)));
  root.add(new Node('plate', box(0.20, 0.012, 0.40, shade(C.midPlastic, 0.7), BACKDROP), M4.translate(0, -0.016, 0)));

  // P R N D 위치 표시등
  const POS = [-0.13, -0.043, 0.043, 0.13];   // P, R, N, D (앞쪽이 P)
  const lamps = POS.map((z, i) => {
    const n = new Node('gl' + i, box(0.03, 0.008, 0.022, C.midPlastic),
      M4.translate(0.062, -0.008, z));
    root.add(n);
    return n;
  });

  const lever = new Node('lever', null, M4.identity());
  const lm = new Mesh();
  lm.merge(cylinder(0.015, 0.012, 0.13, C.steel, 10));
  lm.merge(beveledBox(0.052, 0.075, 0.062, 0.018, C.leather), M4.translate(0, 0.155, 0));
  lm.merge(box(0.03, 0.012, 0.03, shade(C.chrome, 0.9)), M4.translate(0, 0.19, 0.012));
  // 부츠(주름 커버)
  lm.merge(cylinder(0.048, 0.028, 0.055, shade(C.leather, 1.3), 12), M4.translate(0, 0.005, 0));
  lever.add(new Node('leverMesh', lm));
  root.add(lever);

  const ORDER = { P: 0, R: 1, N: 2, D: 3 };
  let z = POS[0];
  return {
    id: 'gear',
    title: '변속 레버',
    subtitle: '자동변속기 · P → R → N → D',
    camera: { eye: [0.34, 0.34, 0.44], target: [0, 0.02, 0], fov: 44 },
    root,
    update(state, dt) {
      const idx = ORDER[state.gear] ?? 0;
      z = approach(z, POS[idx], dt * 0.75);
      // 게이트를 따라 움직이며 살짝 기운다.
      lever.matrix = M4.multiply(M4.translate(0, 0, z), M4.rotX(-(z - POS[0]) * 0.35));
      lamps.forEach((n, i) => {
        const lit = i === idx;
        n.mesh.faces.forEach((f) => {
          f.color = lit ? (i === 1 ? C.red : C.green) : C.midPlastic;
          f.unlit = lit;
        });
      });
    },
    status(state) {
      const desc = { P: 'P (주차)', R: 'R (후진)', N: 'N (중립)', D: 'D (주행)' };
      return { text: desc[state.gear] || state.gear, tone: state.gear === 'D' ? 'green' : 'amber' };
    },
  };
}

// 6. 주차 브레이크 ----------------------------------------------------------
function partParkingBrake() {
  const root = new Node('root');
  root.add(new Node('base', beveledBox(0.24, 0.08, 0.34, 0.02, shade(C.darkPlastic, 0.85), BACKDROP),
    M4.translate(0, -0.075, 0)));
  root.add(new Node('boot', cylinder(0.055, 0.04, 0.05, shade(C.leather, 1.2), 12),
    M4.translate(0, -0.04, -0.10)));

  const lever = new Node('lever', null, M4.translate(0, -0.03, -0.10));
  const lm = new Mesh();
  lm.merge(box(0.036, 0.036, 0.24, shade(C.darkPlastic, 1.15)), M4.translate(0, 0, 0.12));
  lm.merge(beveledBox(0.042, 0.042, 0.10, 0.014, C.leather), M4.translate(0, 0.002, 0.25));
  // 끝단 해제 버튼
  lm.merge(cylinder(0.013, 0.013, 0.022, C.chrome, 10),
    M4.multiply(M4.translate(0, 0, 0.30), M4.rotX(90 * DEG)));
  lever.add(new Node('leverMesh', lm));
  root.add(lever);

  // 톱니(라쳇)
  const teeth = new Mesh();
  for (let i = 0; i < 7; i++) {
    teeth.merge(box(0.006, 0.016, 0.012, shade(C.steel, 0.8)),
      M4.multiply(M4.rotX(-(10 + i * 5) * DEG), M4.translate(0, 0.03, 0.06)));
  }
  root.add(new Node('ratchet', teeth, M4.translate(0, -0.03, -0.10)));

  let a = 0;
  return {
    id: 'parkingBrake',
    title: '주차 브레이크',
    subtitle: '운전석 우측 · 출발 전 반드시 해제',
    camera: { eye: [0.44, 0.34, 0.40], target: [0, -0.02, 0.05], fov: 44 },
    root,
    update(state, dt) {
      a = approach(a, state.parkingBrake ? -38 * DEG : -3 * DEG, dt * 2.6);
      lever.matrix = M4.multiply(M4.translate(0, -0.03, -0.10), M4.rotX(a));
    },
    status(state) {
      return state.parkingBrake
        ? { text: '체결됨 (해제 필요)', tone: 'red' }
        : { text: '해제됨', tone: 'green' };
    },
  };
}

// 7. 안전벨트 --------------------------------------------------------------
function partSeatbelt() {
  const root = new Node('root');
  // B필러와 시트 일부
  root.add(new Node('pillar', beveledBox(0.10, 0.62, 0.10, 0.02, shade(C.darkPlastic, 0.95)),
    M4.translate(-0.24, 0.0, -0.06)));
  root.add(new Node('seat', beveledBox(0.34, 0.06, 0.34, 0.03, shade(C.leather, 1.5), BACKDROP),
    M4.translate(0.02, -0.30, 0.02)));
  root.add(new Node('seatback', beveledBox(0.34, 0.42, 0.07, 0.03, shade(C.leather, 1.5)),
    M4.translate(0.02, -0.06, -0.15)));
  // 버클(수) 소켓
  root.add(new Node('socket', beveledBox(0.05, 0.10, 0.035, 0.012, [24, 25, 28]),
    M4.translate(0.20, -0.24, 0.02)));

  const strapNode = new Node('strap', null, M4.identity());
  root.add(strapNode);
  const strapMesh = box(0.048, 1, 0.008, C.belt);   // 로컬 +Y 로 길이 1
  strapNode.add(new Node('strapMesh', strapMesh));

  const tongueNode = new Node('tongue', null, M4.identity());
  const tm = new Mesh();
  tm.merge(beveledBox(0.045, 0.055, 0.010, 0.006, [28, 29, 33]));
  tm.merge(box(0.024, 0.045, 0.006, C.steel), M4.translate(0, -0.045, 0));
  tongueNode.add(new Node('tongueMesh', tm));
  root.add(tongueNode);

  const TOP = [-0.215, 0.27, -0.03];
  const BUCKLED = [0.195, -0.195, 0.02];
  const LOOSE = [-0.195, -0.16, 0.06];

  let t = 0;
  return {
    id: 'seatbelt',
    title: '안전벨트',
    subtitle: '착용하지 않으면 시험이 진행되지 않는다',
    camera: { eye: [0.54, 0.22, 0.62], target: [0.02, -0.05, 0], fov: 44 },
    root,
    update(state, dt) {
      t = approach(t, state.seatbelt ? 1 : 0, dt * 1.8);
      const end = [
        lerp(LOOSE[0], BUCKLED[0], t),
        lerp(LOOSE[1], BUCKLED[1], t),
        lerp(LOOSE[2], BUCKLED[2], t),
      ];
      strapNode.matrix = M4.alignY(TOP, end);
      tongueNode.matrix = M4.multiply(
        M4.translate(end[0], end[1], end[2]),
        M4.rotZ(t * -0.5 + 0.25),
      );
    },
    status(state) {
      return state.seatbelt
        ? { text: '착용 완료', tone: 'green' }
        : { text: '미착용', tone: 'red' };
    },
  };
}

// 8. 시동 버튼 --------------------------------------------------------------
function partIgnition() {
  const root = new Node('root');
  root.add(new Node('panel', beveledBox(0.30, 0.22, 0.05, 0.015, shade(C.darkPlastic, 0.92), BACKDROP),
    M4.translate(0, 0, -0.03)));
  root.add(new Node('ring', cylinder(0.055, 0.055, 0.02, C.chrome, 20),
    M4.multiply(M4.translate(0, 0, 0.0), M4.rotX(90 * DEG))));

  const btn = new Node('btn', null, M4.identity());
  const bm = new Mesh();
  bm.merge(cylinder(0.044, 0.042, 0.022, shade(C.midPlastic, 1.05), 20), M4.rotX(-90 * DEG));
  btn.add(new Node('cap', bm, M4.translate(0, 0, 0.012)));
  root.add(btn);

  // 버튼 위 표시등
  const lamp = new Node('lamp', cylinder(0.014, 0.014, 0.004, C.greenOff, 12),
    M4.multiply(M4.translate(0, 0.016, 0.026), M4.rotX(-90 * DEG)));
  btn.add(lamp);

  let press = 0, pulse = 0;
  return {
    id: 'ignition',
    title: '엔진 시동 버튼',
    subtitle: '브레이크를 밟은 상태에서 눌러 시동',
    camera: { eye: [0.13, 0.16, 0.40], target: [0, 0, 0], fov: 40 },
    root,
    update(state, dt) {
      pulse += dt;
      press = approach(press, state.ignitionPressed ? 1 : 0, dt * 12);
      btn.matrix = M4.translate(0, 0, -0.010 * press);
      const lit = state.engineOn || (!state.engineOn && Math.sin(pulse * 4) > 0);
      lamp.mesh.faces.forEach((f) => {
        f.color = state.engineOn ? C.green : (lit ? C.amber : C.amberOff);
        f.unlit = true;
      });
    },
    status(state) {
      return state.engineOn
        ? { text: '시동 ON', tone: 'green' }
        : { text: '시동 OFF', tone: 'red' };
    },
  };
}

// 9. 스티어링 휠 ------------------------------------------------------------
function partSteering() {
  const root = new Node('root');
  root.add(buildColumn({ withWheel: false }));
  const wheel = new Node('wheel', null, M4.translate(0, 0, 0.06));
  const rim = new Mesh();
  rim.merge(torus(0.19, 0.018, C.leather, 30, 8));
  for (const a of [180, 0, 270]) {
    rim.merge(box(0.17, 0.028, 0.03, shade(C.darkPlastic, 1.2)),
      M4.multiply(M4.rotZ(a * DEG), M4.translate(0.10, 0, 0)));
  }
  rim.merge(cylinder(0.056, 0.054, 0.05, shade(C.darkPlastic, 1.05), 16),
    M4.multiply(M4.translate(0, 0, -0.03), M4.rotX(90 * DEG)));
  // 12시 방향 기준 마크(조향각을 눈으로 읽을 수 있게)
  rim.merge(box(0.012, 0.05, 0.012, C.red), M4.translate(0, 0.185, 0.012));
  wheel.add(new Node('rim', rim));
  root.add(wheel);

  return {
    id: 'steering',
    title: '스티어링 휠',
    subtitle: '조향 각도 표시',
    camera: { eye: [0.06, 0.18, 0.62], target: [0, 0.0, 0], fov: 44 },
    root,
    update(state) {
      // 실제 스티어링은 조향각의 약 8배까지 돌아간다.
      wheel.matrix = M4.multiply(M4.translate(0, 0, 0.06), M4.rotZ(-state.steerAngle * 8));
    },
    status(state) {
      const deg = Math.round(-state.steerAngle * 8 * 180 / Math.PI);
      return {
        text: deg === 0 ? '중립' : `${deg > 0 ? '좌' : '우'} ${Math.abs(deg)}°`,
        tone: 'off',
      };
    },
  };
}

// 10. 페달 ------------------------------------------------------------------
function partPedals() {
  const root = new Node('root');
  root.add(new Node('floor', box(0.30, 0.02, 0.24, shade(C.darkPlastic, 0.78), BACKDROP),
    M4.translate(0, -0.19, 0.02)));
  root.add(new Node('carpet', box(0.25, 0.006, 0.19, shade(C.darkPlastic, 0.6), BACKDROP),
    M4.translate(0, -0.176, 0.03)));
  // 페달이 매달리는 브래킷
  root.add(new Node('bracket', box(0.28, 0.05, 0.06, shade(C.darkPlastic, 0.7)),
    M4.translate(0, 0.11, -0.11)));

  const mkPedal = (x, w, h, name) => {
    const pivot = new Node(name, null, M4.translate(x, 0.10, -0.10));
    const m = new Mesh();
    m.merge(box(0.022, 0.22, 0.022, C.steel), M4.translate(0, -0.11, 0.02));
    const pad = new Mesh();
    pad.merge(box(w, h, 0.018, C.litePlastic));
    for (let i = -1; i <= 1; i++) {
      pad.merge(box(w * 0.72, 0.010, 0.008, shade(C.darkPlastic, 0.75)),
        M4.translate(0, i * h * 0.27, 0.013));
    }
    m.merge(pad, M4.multiply(M4.translate(0, -0.220, 0.058), M4.rotX(26 * DEG)));
    pivot.add(new Node('mesh', m));
    root.add(pivot);
    return pivot;
  };
  const brake = mkPedal(-0.07, 0.105, 0.150, 'brake');
  const accel = mkPedal(0.090, 0.058, 0.165, 'accel');

  return {
    id: 'pedals',
    title: '가속 · 제동 페달',
    subtitle: '왼쪽(넓은 쪽)이 브레이크, 오른쪽이 가속 페달',
    camera: { eye: [0.15, 0.27, 0.40], target: [0.005, -0.11, 0.02], fov: 42 },
    root,
    update(state) {
      brake.matrix = M4.multiply(M4.translate(-0.07, 0.10, -0.10), M4.rotX(state.brake * 0.30));
      accel.matrix = M4.multiply(M4.translate(0.088, 0.10, -0.10), M4.rotX(state.throttle * 0.26));
    },
    status(state) {
      if (state.brake > 0.05) return { text: `제동 ${Math.round(state.brake * 100)}%`, tone: 'red' };
      if (state.throttle > 0.05) return { text: `가속 ${Math.round(state.throttle * 100)}%`, tone: 'green' };
      return { text: '해제', tone: 'off' };
    },
  };
}

// ---------------------------------------------------------------------------

export function createParts() {
  const list = [
    partTurnSignal(),
    partWiper(),
    partHeadlight(),
    partHazard(),
    partGear(),
    partParkingBrake(),
    partSeatbelt(),
    partIgnition(),
    partSteering(),
    partPedals(),
  ];
  const byId = {};
  for (const p of list) byId[p.id] = p;
  return byId;
}
