// 기능시험장 코스의 형상, 노면 표시, 주변 구조물.
//
// 좌표계: X는 동쪽, Z는 남쪽(위에서 내려다본 지도의 아래쪽), Y는 위쪽. 단위는 미터.
// 차량 진행 방향 theta 는 forward = (cos θ, 0, sin θ) 이며 θ가 커지면 우회전이다.
//
// 코스 전체는 축에 정렬된 사각형들의 합집합으로 정의한다.
// 덕분에 "검지선 접촉 / 코스 이탈" 판정을 정확하고 싸게 할 수 있고,
// 노면도 같은 사각형 목록에서 그대로 생성한다.

import { M4 } from '../gfx/math.js';
import { Node, Mesh, box, cylinder, quadXZ, lineXZ, shade } from '../gfx/mesh.js';

export const LANE = 4.0;          // 주행로 폭
export const HALF = LANE / 2;

// 각 구간의 중심선
export const CL = {
  legA: 0,        // 출발 직선의 z
  legB: 50,       // 경사로 구간의 x
  legC: -35,      // 가속 구간의 z
  legD: 12,       // 철길건널목 구간의 x
  legE: -7.5,     // 종료 구간의 z
};

const COL = {
  asphalt: [64, 66, 71],
  asphaltDark: [55, 57, 62],
  line: [226, 228, 232],
  lineYellow: [214, 176, 60],
  ground: [78, 96, 68],
  groundAlt: [86, 104, 74],
  curb: [188, 190, 196],
  red: [198, 52, 46],
  white: [235, 237, 240],
};

// ---------------------------------------------------------------------------
// 코스 영역(축 정렬 사각형) : [x1, x2, z1, z2]
// ---------------------------------------------------------------------------
export const RECTS = [
  // 출발 직선
  { id: 'legA', x1: -9.0, x2: CL.legB - HALF, z1: CL.legA - HALF, z2: CL.legA + HALF },
  // 직각주차 전면 통로 + 주차구획(구획 폭 2.6m는 실제 규격에 맞춘 좁은 값이다)
  { id: 'apron', x1: 13.0, x2: 41.0, z1: CL.legA + HALF, z2: 5.5 },
  { id: 'bay', x1: 21.0, x2: 23.6, z1: 5.5, z2: 10.5 },
  // 신호교차로(교차로는 주행로보다 넓다) + 동쪽 가지
  { id: 'cross', x1: CL.legB - HALF - 2, x2: CL.legB + HALF + 2, z1: -6.0, z2: 6.0 },
  { id: 'crossE', x1: CL.legB + HALF + 2, x2: 56.5, z1: CL.legA - HALF, z2: CL.legA + HALF },
  // 교차로에서 경사로 구간으로 빠져나가는 확폭 목(좌회전 궤적을 담는다)
  { id: 'crossThroat', x1: CL.legB - HALF - 1.3, x2: CL.legB + HALF + 1.3, z1: -10.5, z2: -6.0 },
  // 경사로 구간
  { id: 'legB', x1: CL.legB - HALF, x2: CL.legB + HALF, z1: CL.legC - HALF, z2: CL.legA - HALF },
  // 가속 + 돌발 구간
  { id: 'legC', x1: CL.legD - HALF, x2: CL.legB + HALF, z1: CL.legC - HALF, z2: CL.legC + HALF },
  // 철길건널목 구간
  { id: 'legD', x1: CL.legD - HALF, x2: CL.legD + HALF, z1: CL.legC - HALF, z2: CL.legE + HALF },
  // 종료 구간
  { id: 'legE', x1: -9.0, x2: CL.legD + HALF, z1: CL.legE - HALF, z2: CL.legE + HALF },

  // 90도 회전부 확폭. 실제 시험장의 코너도 주행로보다 넓게 만들어져 있다.
  // 회전 바깥쪽(궤적이 부풀어 나가는 방향)으로만 넓힌다.
  { id: 'cornerBC', x1: CL.legB - HALF - 2, x2: CL.legB + HALF + 2, z1: CL.legC - HALF - 2, z2: CL.legC + HALF },
  { id: 'cornerCD', x1: CL.legD - HALF - 2, x2: CL.legD + HALF + 2, z1: CL.legC - HALF - 2, z2: CL.legC + HALF + 2 },
  { id: 'cornerDE', x1: CL.legD - HALF - 2, x2: CL.legD + HALF + 2, z1: CL.legE - HALF - 2, z2: CL.legE + HALF + 2 },
];

const BAY = RECTS.find((r) => r.id === 'bay');
export const PARKING_BAY = { x1: BAY.x1, x2: BAY.x2, z1: BAY.z1, z2: BAY.z2 };

// 코스 위(검지선 안쪽)인지 판정한다. margin 을 주면 그만큼 여유를 준다.
export function insideCourse(x, z, margin = 0) {
  for (const r of RECTS) {
    if (x >= r.x1 - margin && x <= r.x2 + margin &&
        z >= r.z1 - margin && z <= r.z2 + margin) return true;
  }
  return false;
}

// 검지선에 d 이내로 접근했는지.
// 코스가 사각형 "합집합"이라 사각형 하나만 보면 내부 이음매를 경계로 착각한다.
// 네 방향으로 d 만큼 밀어 보고 모두 코스 안이면 경계에서 떨어져 있는 것으로 본다.
export function nearCourseEdge(x, z, d) {
  return !(insideCourse(x + d, z) && insideCourse(x - d, z) &&
           insideCourse(x, z + d) && insideCourse(x, z - d));
}

// ---------------------------------------------------------------------------
// 경사로 : legB 구간의 높이 프로파일
// ---------------------------------------------------------------------------
// 실제 기능시험 경사로의 구배(약 6~10%)에 맞춰 완만하게 잡는다.
// 정지구간은 오르막 위에 있어야 브레이크를 놓았을 때 뒤로 밀린다.
export const RAMP = {
  upStart: -10, upEnd: -20,      // 오르막 10m
  topEnd: -24,                   // 정상 평지 끝
  downEnd: -32,                  // 내리막 끝
  height: 0.9,                   // 평균 9%, 최대 13.5% 구배
  stopZ1: -17.5, stopZ2: -15.5,  // 정지구간(이 사이에 앞바퀴를 세워야 한다)
};

export function groundHeight(x, z) {
  if (x < CL.legB - HALF - 0.8 || x > CL.legB + HALF + 0.8) return 0;
  if (z > RAMP.upStart || z < RAMP.downEnd) return 0;
  if (z > RAMP.upEnd) {
    const t = (RAMP.upStart - z) / (RAMP.upStart - RAMP.upEnd);
    return RAMP.height * smooth(t);
  }
  if (z > RAMP.topEnd) return RAMP.height;
  const t = (z - RAMP.downEnd) / (RAMP.topEnd - RAMP.downEnd);
  return RAMP.height * smooth(t);
}

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// ---------------------------------------------------------------------------
// 주행 경로(안내 및 미니맵용)
// ---------------------------------------------------------------------------
export const ROUTE = [
  [-7, 0], [12, 0], [20, 3.0], [30, 3.4],      // 출발 → 직각주차 전면 통로
  [22.3, 8.2], [30, 3.4],                      // 후진 주차 → 출차
  [36, 1.0], [CL.legB, CL.legA],               // 본선 복귀 → 신호교차로
  [CL.legB, CL.legC],                          // 경사로 → 좌회전
  [CL.legD, CL.legC],                          // 가속 · 돌발 → 좌회전
  [CL.legD, CL.legE],                          // 철길건널목 → 우회전
  [-4, CL.legE],                               // 종료
];

// ---------------------------------------------------------------------------
// 노면 · 구조물 메시 생성
// ---------------------------------------------------------------------------

// 높이 함수를 따라가는 도로 띠. 경사로처럼 높이가 변하는 구간에 사용한다.
function heightStrip(x1, x2, z1, z2, y, color, opts, steps = 40) {
  const m = new Mesh();
  for (let i = 0; i < steps; i++) {
    const za = z1 + (z2 - z1) * (i / steps);
    const zb = z1 + (z2 - z1) * ((i + 1) / steps);
    const ha = groundHeight((x1 + x2) / 2, za) + y;
    const hb = groundHeight((x1 + x2) / 2, zb) + y;
    m.addPoly([[x1, ha, za], [x2, ha, za], [x2, hb, zb], [x1, hb, zb]], color, opts);
  }
  return m;
}

// 경사로 옆면(도로가 공중에 떠 보이지 않도록)
function rampSides() {
  const m = new Mesh();
  const steps = 40;
  const z1 = RAMP.upStart + 0.5, z2 = RAMP.downEnd - 0.5;
  for (const [x, dir] of [[CL.legB - HALF - 0.15, -1], [CL.legB + HALF + 0.15, 1]]) {
    for (let i = 0; i < steps; i++) {
      const za = z1 + (z2 - z1) * (i / steps);
      const zb = z1 + (z2 - z1) * ((i + 1) / steps);
      const ha = groundHeight(50, za), hb = groundHeight(50, zb);
      if (ha < 0.005 && hb < 0.005) continue;
      m.addPoly([
        [x, 0, za], [x, ha, za], [x, hb, zb], [x, 0, zb],
      ], shade(COL.curb, 0.62), { layer: 1 });
      // 흙받이(경사로 옆 둔덕)
      m.addPoly([
        [x, 0, za], [x + dir * 1.4, 0, za], [x + dir * 1.4, 0, zb], [x, 0, zb],
      ], COL.groundAlt, { layer: 0 });
    }
  }
  return m;
}

function stripeCrosswalk(x, z1, z2, dirX = true) {
  const m = new Mesh();
  const n = 7;
  for (let i = 0; i < n; i++) {
    const t = z1 + (z2 - z1) * (i / n);
    const t2 = t + (z2 - z1) / n * 0.55;
    if (dirX) m.merge(quadXZ(x, t, x + 2.6, t2, 0.02, COL.line, { unlit: true, layer: 2 }));
    else m.merge(quadXZ(t, x, t2, x + 2.6, 0.02, COL.line, { unlit: true, layer: 2 }));
  }
  return m;
}

// 진행 방향 화살표(연습용 안내 표시)
function arrow(x, z, dir, color = [190, 200, 215]) {
  const m = new Mesh();
  const L = 1.6, W = 0.34, H = 0.6;
  const pts = [
    [-L / 2, W], [L / 2 - H, W], [L / 2 - H, H / 1.4],
    [L / 2, 0], [L / 2 - H, -H / 1.4], [L / 2 - H, -W], [-L / 2, -W],
  ];
  const rot = pts.map(([a, b]) => {
    const c = Math.cos(dir), s = Math.sin(dir);
    return [x + a * c - b * s, 0.025 + groundHeight(x, z), z + a * s + b * c];
  });
  m.addPoly(rot, color, { unlit: true, layer: 2 });
  return m;
}

function trafficLightUnit() {
  const node = new Node('signal');
  const pole = new Mesh();
  pole.merge(cylinder(0.11, 0.09, 5.2, [92, 96, 100], 10));
  pole.merge(cylinder(0.09, 0.08, 3.6, [92, 96, 100], 10),
    M4.multiply(M4.translate(0, 5.0, 0), M4.rotZ(90 * Math.PI / 180)));
  pole.merge(cylinder(0.3, 0.3, 0.12, [70, 74, 78], 12));
  node.add(new Node('pole', pole));

  const housing = new Mesh();
  housing.merge(box(1.35, 0.46, 0.24, [42, 46, 44]));
  housing.merge(box(1.42, 0.06, 0.30, [34, 38, 36]), M4.translate(0, 0.23, 0.02));
  const head = new Node('head', housing, M4.translate(-3.1, 4.75, 0));
  node.add(head);

  const lamps = {};
  const defs = [['red', -0.45, [200, 46, 40]], ['yellow', 0, [220, 178, 40]], ['green', 0.45, [60, 200, 120]]];
  for (const [name, dx, c] of defs) {
    const lm = cylinder(0.155, 0.155, 0.06, c, 14);
    const n = new Node(name, lm, M4.multiply(M4.translate(dx, 0, 0.13), M4.rotX(90 * Math.PI / 180)));
    head.add(n);
    lamps[name] = { node: n, on: c, off: shade(c, 0.22) };
  }
  return { node, lamps };
}

function suddenSign() {
  const node = new Node('suddenSign');
  const m = new Mesh();
  m.merge(cylinder(0.08, 0.07, 2.6, [96, 100, 104], 8));
  m.merge(box(1.9, 0.95, 0.12, [28, 30, 34]), M4.translate(0, 3.1, 0));
  node.add(new Node('body', m));
  const face = new Mesh();
  face.addPoly([[-0.8, 2.72, 0.07], [0.8, 2.72, 0.07], [0.8, 3.48, 0.07], [-0.8, 3.48, 0.07]],
    [70, 24, 22], { unlit: true });
  node.add(new Node('face', face));
  return { node, face };
}

// 경사로 정지구간 표지 기둥.
// 노면의 노란선은 오르막에서 보닛에 가려 보이지 않으므로,
// 실제 시험장처럼 구간 양옆에 세로 표지를 세워 정지 위치를 알려 준다.
function rampStopMarkers() {
  const node = new Node('rampMarkers');
  for (const z of [RAMP.stopZ1, RAMP.stopZ2]) {
    const h = groundHeight(CL.legB, z);
    for (const side of [-1, 1]) {
      const m = new Mesh();
      m.merge(cylinder(0.06, 0.055, 1.5, [214, 216, 220], 8));
      m.merge(box(0.10, 0.30, 0.46, COL.lineYellow), M4.translate(0, 1.35, 0));
      m.merge(box(0.11, 0.06, 0.46, [40, 42, 46]), M4.translate(0, 1.35, 0));
      node.add(new Node('rm', m,
        M4.translate(CL.legB + side * (HALF + 0.45), h, z)));
    }
  }
  return node;
}

function railroad() {
  const m = new Mesh();
  // 침목
  for (let z = -21.6; z <= -18.6; z += 0.55) {
    m.merge(box(4.4, 0.06, 0.24, [82, 66, 48]), M4.translate(12, 0.03, z));
  }
  // 레일
  for (const dx of [-0.72, 0.72]) {
    m.merge(box(4.0, 0.10, 0.08, [150, 150, 156]),
      M4.multiply(M4.translate(12 + dx, 0.10, -20.1), M4.rotY(Math.PI / 2)));
  }
  const node = new Node('railroad', m);

  // 건널목 차단기 기둥과 X 표지
  for (const [x, z] of [[9.3, -22.6], [14.7, -17.6]]) {
    const p = new Mesh();
    p.merge(cylinder(0.09, 0.08, 3.0, [200, 200, 204], 8));
    p.merge(box(0.16, 1.1, 0.09, COL.red), M4.multiply(M4.translate(0, 2.6, 0), M4.rotZ(0.78)));
    p.merge(box(0.16, 1.1, 0.09, COL.white), M4.multiply(M4.translate(0, 2.6, 0), M4.rotZ(-0.78)));
    node.add(new Node('xsign', p, M4.translate(x, 0, z)));
  }
  return node;
}

function scenery() {
  const node = new Node('scenery');
  const m = new Mesh();
  // 시험장 건물(관리동)
  m.merge(box(14, 4.2, 9, [176, 172, 165]), M4.translate(30, 2.1, 20));
  m.merge(box(15, 0.4, 10, [120, 118, 116]), M4.translate(30, 4.35, 20));
  for (let i = 0; i < 5; i++) {
    m.merge(box(1.6, 1.2, 0.1, [96, 128, 150]), M4.translate(25 + i * 2.4, 2.6, 15.45));
  }
  // 주변 건물
  const blocks = [
    [-24, -20, 8, 10, 12], [-20, 8, 7, 12, 9], [64, -12, 9, 14, 11],
    [58, -42, 8, 10, 13], [-14, -46, 10, 9, 10], [26, -52, 7, 16, 12],
  ];
  for (const [x, z, h, w, d] of blocks) {
    const tint = 0.85 + ((x * 7 + z * 3) % 5) * 0.05;
    m.merge(box(w, h, d, shade([148, 150, 156], tint)), M4.translate(x, h / 2, z));
    m.merge(box(w + 0.6, 0.35, d + 0.6, shade([110, 112, 118], tint)), M4.translate(x, h + 0.15, z));
  }
  node.add(new Node('buildings', m));

  // 가로수
  const trees = new Mesh();
  const spots = [
    [-6, 9], [4, 9], [14, 9], [38, 9], [44, 12], [58, 4], [60, -20], [58, -30],
    [42, -44], [30, -44], [18, -44], [6, -44], [4, -30], [4, -18], [2, -10],
    [-14, -14], [-14, 4],
  ];
  for (const [x, z] of spots) {
    trees.merge(cylinder(0.16, 0.13, 1.5, [88, 70, 52], 6), M4.translate(x, 0, z));
    trees.merge(cylinder(1.15, 0.05, 2.4, [72, 116, 64], 8), M4.translate(x, 1.4, z));
    trees.merge(cylinder(0.9, 0.05, 1.8, [82, 128, 70], 8), M4.translate(x, 2.2, z));
  }
  node.add(new Node('trees', trees));

  // 라바콘(코스 바깥 경계 표시)
  const cones = new Mesh();
  const conePts = [];
  for (let x = -8; x <= 56; x += 6) conePts.push([x, 6.6]);
  for (let z = -34; z <= -10; z += 6) conePts.push([54.5, z]);
  for (let x = 16; x <= 48; x += 6) conePts.push([x, -39.2]);
  for (let z = -30; z <= -10; z += 6) conePts.push([7.6, z]);
  for (const [x, z] of conePts) {
    cones.merge(cylinder(0.22, 0.04, 0.62, [222, 96, 36], 8), M4.translate(x, 0, z));
    cones.merge(box(0.46, 0.03, 0.46, [40, 40, 44]), M4.translate(x, 0.015, z));
    cones.merge(cylinder(0.145, 0.13, 0.09, COL.white, 8), M4.translate(x, 0.30, z));
  }
  node.add(new Node('cones', cones));
  return node;
}

// ---------------------------------------------------------------------------

export function buildCourse() {
  const root = new Node('course');

  // 바닥
  const ground = new Mesh();
  ground.merge(quadXZ(-420, -440, 460, 400, -0.02, COL.ground, { layer: 0 }));
  root.add(new Node('ground', ground));

  // 검지선(도로보다 조금 넓은 흰 바탕) → 그 위에 아스팔트를 덮으면 테두리만 남는다.
  const curb = new Mesh();
  const road = new Mesh();
  const EDGE = 0.14;
  for (const r of RECTS) {
    if (r.id === 'legB') continue;   // 경사로는 높이를 따라 따로 만든다
    curb.merge(quadXZ(r.x1 - EDGE, r.z1 - EDGE, r.x2 + EDGE, r.z2 + EDGE, 0.005, COL.line, { unlit: true, layer: 1 }));
    road.merge(quadXZ(r.x1, r.z1, r.x2, r.z2, 0.012, COL.asphalt, { layer: 2 }));
  }
  const B = RECTS.find((r) => r.id === 'legB');
  curb.merge(heightStrip(B.x1 - EDGE, B.x2 + EDGE, B.z1, B.z2, 0.005, COL.line, { unlit: true, layer: 1 }, 70));
  road.merge(heightStrip(B.x1, B.x2, B.z1, B.z2, 0.012, COL.asphalt, { layer: 2 }, 70));
  root.add(new Node('curb', curb));
  root.add(new Node('road', road));
  root.add(new Node('rampSides', rampSides()));

  // ---- 노면 표시 -----------------------------------------------------------
  const mark = new Mesh();
  const M = { unlit: true, layer: 3 };
  const Y = 0.02;

  // 출발선
  mark.merge(lineXZ(-8.4, -HALF, -8.4, HALF, 0.35, Y, COL.line, M));
  // 종료(도착) 정차 구역
  mark.merge(lineXZ(-6.2, CL.legE - HALF, -6.2, CL.legE + HALF, 0.3, Y, COL.lineYellow, M));
  mark.merge(lineXZ(-1.6, CL.legE - HALF, -1.6, CL.legE + HALF, 0.3, Y, COL.lineYellow, M));
  mark.merge(lineXZ(-6.2, CL.legE + HALF, -1.6, CL.legE + HALF, 0.16, Y, COL.lineYellow, M));

  // 직각주차 구획선
  mark.merge(lineXZ(BAY.x1, BAY.z1, BAY.x1, BAY.z2, 0.16, Y, COL.lineYellow, M));
  mark.merge(lineXZ(BAY.x2, BAY.z1, BAY.x2, BAY.z2, 0.16, Y, COL.lineYellow, M));
  mark.merge(lineXZ(BAY.x1, BAY.z2, BAY.x2, BAY.z2, 0.16, Y, COL.lineYellow, M));
  // 주차 목표선(이 선을 넘어 들어가야 주차 완료)
  mark.merge(lineXZ(BAY.x1, 7.4, BAY.x2, 7.4, 0.1, Y, [150, 150, 156], M));

  // 신호교차로 정지선 + 횡단보도
  mark.merge(lineXZ(45.0, -HALF, 45.0, HALF, 0.4, Y, COL.line, M));
  mark.merge(stripeCrosswalk(45.4, -HALF, HALF, true));
  mark.merge(stripeCrosswalk(52.0, -HALF, HALF, true));

  // 경사로 정지구간 표시(노면 노란선)
  for (const z of [RAMP.stopZ1, RAMP.stopZ2]) {
    const h = groundHeight(50, z);
    mark.merge(quadXZ(CL.legB - HALF, z - 0.12, CL.legB + HALF, z + 0.12, h + 0.02, COL.lineYellow, M));
  }

  // 가속구간 시작/끝
  mark.merge(lineXZ(46, CL.legC - HALF, 46, CL.legC + HALF, 0.3, Y, [120, 200, 255], M));
  mark.merge(lineXZ(26, CL.legC - HALF, 26, CL.legC + HALF, 0.3, Y, [120, 200, 255], M));

  // 철길건널목 정지선
  mark.merge(lineXZ(CL.legD - HALF, -23.2, CL.legD + HALF, -23.2, 0.4, Y, COL.line, M));

  // 진행 방향 화살표
  const arrows = [
    [4, 0, 0], [34, 0, 0], [42, 0, 0],
    [50, -6, -Math.PI / 2], [50, -30, -Math.PI / 2],
    [44, -35, Math.PI], [32, -35, Math.PI], [18, -35, Math.PI],
    [CL.legD, -28, Math.PI / 2], [CL.legD, -14, Math.PI / 2],
    [7, CL.legE, Math.PI], [1, CL.legE, Math.PI],
  ];
  for (const [x, z, d] of arrows) mark.merge(arrow(x, z, d));
  root.add(new Node('markings', mark));

  // ---- 구조물 --------------------------------------------------------------
  const signal = trafficLightUnit();
  signal.node.matrix = M4.multiply(M4.translate(53.4, 0, 3.2), M4.rotY(Math.PI));
  root.add(signal.node);

  const sudden = suddenSign();
  sudden.node.matrix = M4.multiply(M4.translate(22.0, 0, -38.6), M4.rotY(-Math.PI / 2));
  root.add(sudden.node);

  root.add(rampStopMarkers());
  root.add(railroad());
  root.add(scenery());

  return {
    root,
    lamps: signal.lamps,
    suddenFace: sudden.face,
  };
}

export { COL as COURSE_COLORS };
