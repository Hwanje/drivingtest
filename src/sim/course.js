// 기능시험장 코스의 형상, 노면 표시, 구조물.
//
// 치수는 도로교통법 시행규칙 [별표 23] "기능시험코스의 종류·형상 및 구조" 중
// 제1종 보통면허 기준을 따랐다.
//   · 코스 연장거리 300m 이상, 포장 도로
//   · 도로의 폭 7m 이상, 3~3.5m 너비의 2개 차로
//   · 중앙선 10~15cm 너비
//   · 길가장자리선은 중앙선으로부터 3m 지점에 10~15cm 너비로 설치
//   · 연석은 길가장자리선으로부터 25cm 이상 간격, 높이 10cm 정도
//
// 좌표계: X는 동쪽, Z는 남쪽(위에서 내려다본 지도의 아래쪽), Y는 위쪽. 단위는 미터.
// 차량 진행 방향 theta 는 forward = (cos θ, 0, sin θ) 이며 θ가 커지면 우회전이다.
//
// 코스 영역은 축에 정렬된 사각형들의 합집합으로 정의한다. 덕분에 바퀴가 도로를
// 벗어났는지(차로 이탈) 판정이 정확하고, 노면·연석도 같은 정의에서 생성된다.

import { M4 } from '../gfx/math.js';
import { Node, Mesh, box, cylinder, quadXZ, lineXZ, shade } from '../gfx/mesh.js';

export const ROAD = 7.0;        // 도로 폭
export const HALF = ROAD / 2;   // 중앙선 ~ 연석
export const EDGE = 3.0;        // 중앙선 ~ 길가장자리선
export const LANE_C = 1.75;     // 중앙선 ~ 주행 차로 중심
export const CURB_H = 0.10;     // 연석 높이
export const LINE_W = 0.12;     // 차선 너비

// 각 구간의 중심선(도로 중앙선 위치)
export const CL = {
  legA: 0,      // z · 출발 직선
  legB: 70,     // x · 경사로 구간
  legC: -70,    // z · 가속 · 돌발 구간
  legD: 14,     // x · 철길건널목 구간
  legE: -14,    // z · 종료 구간
};

const COL = {
  asphalt: [66, 68, 73],
  line: [232, 234, 238],
  lineYellow: [216, 178, 58],
  curb: [206, 208, 212],
  curbTop: [226, 228, 232],
  ground: [78, 96, 68],
  groundAlt: [86, 104, 74],
  red: [198, 52, 46],
  white: [235, 237, 240],
};

// ---------------------------------------------------------------------------
// 코스 영역
// ---------------------------------------------------------------------------
export const RECTS = [
  // 출발 직선 (교차로까지 이어진다)
  { id: 'legA', x1: -14, x2: CL.legB + HALF, z1: CL.legA - HALF, z2: CL.legA + HALF },
  // 신호교차로의 나머지 가지(동쪽 · 남쪽)
  { id: 'crossE', x1: CL.legB + HALF, x2: 81, z1: CL.legA - HALF, z2: CL.legA + HALF },
  { id: 'crossS', x1: CL.legB - HALF, x2: CL.legB + HALF, z1: CL.legA + HALF, z2: CL.legA + 11 },
  // 경사로 구간
  { id: 'legB', x1: CL.legB - HALF, x2: CL.legB + HALF, z1: CL.legC - HALF, z2: CL.legA + HALF },
  // 가속 · 돌발 구간
  { id: 'legC', x1: CL.legD - HALF, x2: CL.legB + HALF, z1: CL.legC - HALF, z2: CL.legC + HALF },
  // 철길건널목 구간
  { id: 'legD', x1: CL.legD - HALF, x2: CL.legD + HALF, z1: CL.legC - HALF, z2: CL.legE + HALF },
  // 종료 구간
  { id: 'legE', x1: -14, x2: CL.legD + HALF, z1: CL.legE - HALF, z2: CL.legE + HALF },
  // 직각주차: 전면 통로와 주차구획
  // 1톤 화물차(전장 5.1m · 전폭 1.74m)가 들어가는 폭 3.0m · 깊이 6.5m 구획.
  { id: 'apron', x1: 18, x2: 52, z1: CL.legA + HALF, z2: 10.0 },
  { id: 'bay', x1: 28.0, x2: 31.0, z1: 10.0, z2: 16.5 },
  // 통로가 본선으로 합쳐지는 테이퍼 구간
  { id: 'apronTaper', x1: 52, x2: 62, z1: CL.legA + HALF, z2: 6.2 },

  // 교차로 우각부(모서리 곡선). 실제 도로의 교차 지점도 안쪽 모서리가 둥글게
  // 처리되어 있다. 이것이 없으면 전장 5.1m 화물차가 90도 회전을 돌 수 없다.
  { id: 'filletBC', x1: CL.legB - HALF - 3, x2: CL.legB - HALF, z1: CL.legC - HALF, z2: CL.legC - HALF + 3 },
  { id: 'filletCD', x1: CL.legD + HALF, x2: CL.legD + HALF + 3, z1: CL.legC - HALF, z2: CL.legC - HALF + 3 },
  { id: 'filletDE', x1: CL.legD - HALF - 3, x2: CL.legD - HALF, z1: CL.legE - HALF - 3, z2: CL.legE - HALF },
];

const BAY = RECTS.find((r) => r.id === 'bay');
export const PARKING_BAY = { x1: BAY.x1, x2: BAY.x2, z1: BAY.z1, z2: BAY.z2 };

// 포장된 코스 위(연석 안쪽)인지 판정한다.
export function insideCourse(x, z, margin = 0) {
  for (const r of RECTS) {
    if (x >= r.x1 - margin && x <= r.x2 + margin &&
        z >= r.z1 - margin && z <= r.z2 + margin) return true;
  }
  return false;
}

// 코스 경계에 d 이내로 접근했는지.
// 사각형 "합집합"이라 사각형 하나만 보면 내부 이음매를 경계로 착각한다.
// 네 방향으로 d 만큼 밀어 보고 모두 코스 안이면 경계에서 떨어져 있는 것으로 본다.
export function nearCourseEdge(x, z, d) {
  return !(insideCourse(x + d, z) && insideCourse(x - d, z) &&
           insideCourse(x, z + d) && insideCourse(x, z - d));
}

// ---------------------------------------------------------------------------
// 주행 차로 (중앙선 침범 판정용)
// 각 직선 구간에서 주행해야 하는 차로의 범위를 정의한다. 교차로 · 주차 구역처럼
// 차로 개념이 없는 곳은 목록에 없으므로 침범 판정을 하지 않는다.
// ---------------------------------------------------------------------------
const DRIVE_LANES = [
  // center: 중앙선 위치, side: 중앙선을 넘어간 쪽의 부호
  // range: 이 판정을 적용할 구간(회전부 부근은 정상적으로 선을 넘으므로 제외한다)
  { axis: 'z', center: CL.legA, side: -1, along: 'x', range: [-13, 17] },
  { axis: 'z', center: CL.legA, side: -1, along: 'x', range: [53, CL.legB - HALF - 9] },
  { axis: 'x', center: CL.legB, side: -1, along: 'z', range: [CL.legC + HALF + 9, -HALF - 9] },
  { axis: 'z', center: CL.legC, side: +1, along: 'x', range: [CL.legD + HALF + 9, CL.legB - HALF - 9] },
  { axis: 'x', center: CL.legD, side: +1, along: 'z', range: [CL.legC + HALF + 9, CL.legE - HALF - 9] },
  { axis: 'z', center: CL.legE, side: +1, along: 'x', range: [-13, CL.legD - HALF - 9] },
];

const APRON = RECTS.find((r) => r.id === 'apron');

// 해당 지점이 중앙선을 넘어 반대 차로에 있으면 true.
// 길가장자리선 바깥(갓길)으로 나가는 것은 중앙선 침범이 아니므로 세지 않는다.
export function crossedCenterLine(x, z) {
  // 직각주차 통로와 주차구획은 차로 구분이 없다
  if (x >= APRON.x1 && x <= APRON.x2 + 10 && z >= APRON.z1) return false;
  for (const d of DRIVE_LANES) {
    const s = d.along === 'x' ? x : z;
    if (s < d.range[0] || s > d.range[1]) continue;
    const v = d.axis === 'x' ? x : z;
    if (Math.abs(v - d.center) > HALF + 1) continue;   // 이 도로 위가 아니면 무시
    if ((v - d.center) * d.side > 0.06) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 경사로
// 종단경사 10%, 오르막 12m. 위·아래 1.5m 구간만 곡선으로 이어 붙여
// 대부분의 구간에서 경사가 일정하게 유지되도록 했다.
// 정지구간은 오르막 위쪽에 2m 폭으로 둔다.
// ---------------------------------------------------------------------------
const GRADE = 0.10;
const RAMP_L = 12;
const RAMP_T = 1.5;
const RAMP_H = GRADE * (RAMP_L - RAMP_T);   // 1.05m

export const RAMP = {
  upStart: -20,                 // 오르막 시작(사면 아래끝)
  upEnd: -20 - RAMP_L,          // -32 · 오르막 끝
  topEnd: -38,                  // 정상 평지 끝
  downEnd: -50,                 // 내리막 끝
  height: RAMP_H,
  grade: GRADE,
  stopZ1: -30.0,                // 정지구간(앞바퀴를 이 사이에 세운다)
  stopZ2: -28.0,
};

// 오르막을 따라 이동한 거리 d 에 대한 높이
function slopeHeight(d) {
  if (d <= 0) return 0;
  if (d >= RAMP_L) return RAMP_H;
  if (d <= RAMP_T) return GRADE * d * d / (2 * RAMP_T);
  if (d >= RAMP_L - RAMP_T) {
    const e = RAMP_L - d;
    return RAMP_H - GRADE * e * e / (2 * RAMP_T);
  }
  return GRADE * (d - RAMP_T / 2);
}

export function groundHeight(x, z) {
  if (x < CL.legB - HALF - 0.9 || x > CL.legB + HALF + 0.9) return 0;
  if (z > RAMP.upStart || z < RAMP.downEnd) return 0;
  if (z > RAMP.upEnd) return slopeHeight(RAMP.upStart - z);
  if (z > RAMP.topEnd) return RAMP_H;
  return slopeHeight((z - RAMP.downEnd) / (RAMP.topEnd - RAMP.downEnd) * RAMP_L);
}

// ---------------------------------------------------------------------------
// 주행 경로 (안내 · 미니맵용). 우측 차로 중심을 따라간다.
// ---------------------------------------------------------------------------
export const ROUTE = [
  [-12, LANE_C], [22, LANE_C], [28, 6.6], [40, 6.8],       // 출발 → 직각주차 통로
  [29.5, 13.5], [40, 6.8],                                  // 후진 주차 → 출차
  [50, LANE_C], [CL.legB + LANE_C, LANE_C],                 // 본선 복귀 → 신호교차로
  [CL.legB + LANE_C, CL.legC - LANE_C],                     // 좌회전 → 경사로 → 좌회전
  [CL.legD - LANE_C, CL.legC - LANE_C],                     // 가속 · 돌발 → 좌회전
  [CL.legD - LANE_C, CL.legE - LANE_C],                     // 철길건널목 → 우회전
  [-10, CL.legE - LANE_C],                                  // 종료
];

// 코스 연장거리(직각주차 왕복 포함). 별표 23의 300m 이상 요건 확인용.
export function courseLength() {
  let s = 0;
  for (let i = 1; i < ROUTE.length; i++) {
    s += Math.hypot(ROUTE[i][0] - ROUTE[i - 1][0], ROUTE[i][1] - ROUTE[i - 1][1]);
  }
  return s;
}

// ---------------------------------------------------------------------------
// 노면 생성
// ---------------------------------------------------------------------------

// 높이 함수를 따라가는 도로 띠(경사로 구간용)
function heightStrip(x1, x2, z1, z2, y, color, opts, steps = 60) {
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

// 연석. 각 사각형의 변을 따라가며 "바깥쪽이 코스가 아닌" 구간에만 세운다.
// 연속된 구간은 하나의 상자로 묶어 폴리곤 수를 줄인다.
function buildCurbs() {
  const m = new Mesh();
  const W = 0.25;      // 연석 폭
  const STEP = 2.0;

  // ax: 연석이 뻗는 축, [a0,a1]: 그 축의 구간, at: 고정 좌표, out: 바깥 방향.
  // 경사로에서도 계단이 지지 않도록 양 끝 높이를 각각 구해 기울어진 프리즘으로 만든다.
  const emit = (ax, a0, a1, at, out) => {
    const w0 = at, w1 = at + out * W;
    const xz = (a, wv) => (ax === 'x' ? [a, wv] : [wv, a]);   // (축, 폭) → (x, z)
    const hAt = (a) => { const [x, z] = xz(a, at); return groundHeight(x, z); };
    const h0 = hAt(a0), h1 = hAt(a1);
    const corner = (a, wv, h) => { const [x, z] = xz(a, wv); return [x, h, z]; };
    const lo = [corner(a0, w0, h0), corner(a0, w1, h0), corner(a1, w1, h1), corner(a1, w0, h1)];
    const hi = lo.map((p) => [p[0], p[1] + CURB_H, p[2]]);
    m.addPoly(hi, COL.curbTop);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      m.addPoly([lo[i], lo[j], hi[j], hi[i]], COL.curb);
    }
  };

  for (const r of RECTS) {
    const edges = [
      { ax: 'x', at: r.z1, a0: r.x1, a1: r.x2, out: -1 },
      { ax: 'x', at: r.z2, a0: r.x1, a1: r.x2, out: +1 },
      { ax: 'z', at: r.x1, a0: r.z1, a1: r.z2, out: -1 },
      { ax: 'z', at: r.x2, a0: r.z1, a1: r.z2, out: +1 },
    ];
    for (const e of edges) {
      let runStart = null;
      for (let t = e.a0; t < e.a1 - 1e-6; t += STEP) {
        const t2 = Math.min(t + STEP, e.a1);
        const mid = (t + t2) / 2;
        const px = e.ax === 'x' ? mid : e.at;
        const pz = e.ax === 'x' ? e.at : mid;
        const ox = e.ax === 'z' ? px + e.out * 0.3 : px;
        const oz = e.ax === 'x' ? pz + e.out * 0.3 : pz;
        const need = !insideCourse(ox, oz, 0);
        if (need && runStart === null) runStart = t;
        // 경사면에서는 한 조각씩 끊어 기울기를 그대로 따라가게 한다
        const onSlope = groundHeight(px, pz) > 0.005;
        if (runStart !== null && (!need || onSlope)) {
          const end = need ? t2 : t;
          if (end - runStart > 0.01) emit(e.ax, runStart, end, e.at, e.out);
          runStart = (need && onSlope) ? t2 : null;
        }
      }
      if (runStart !== null && e.a1 - runStart > 0.01) emit(e.ax, runStart, e.a1, e.at, e.out);
    }
  }
  return m;
}

// 차선(중앙선 · 길가장자리선). 교차로 안에서는 끊어 준다.
function buildLaneLines() {
  const m = new Mesh();
  const M = { unlit: true, layer: 3 };
  const Y = 0.02;
  const yellow = (x1, z1, x2, z2) => m.merge(lineXZ(x1, z1, x2, z2, LINE_W, Y, COL.lineYellow, M));
  const white = (x1, z1, x2, z2) => m.merge(lineXZ(x1, z1, x2, z2, LINE_W, Y, COL.line, M));

  // 출발 직선 (직각주차 통로가 붙는 구간에서는 길가장자리선을 끊는다)
  yellow(-13, CL.legA, CL.legB - HALF - 1, CL.legA);
  white(-13, CL.legA - EDGE, CL.legB - HALF - 1, CL.legA - EDGE);
  white(-13, CL.legA + EDGE, 17, CL.legA + EDGE);
  white(53, CL.legA + EDGE, CL.legB - HALF - 1, CL.legA + EDGE);

  // 경사로 구간 (경사면을 따라 기울어진 사각형으로 이어 그린다)
  const slopedLine = (xc, z1, z2, color) => {
    const h1 = groundHeight(CL.legB, z1) + Y;
    const h2 = groundHeight(CL.legB, z2) + Y;
    m.addPoly([
      [xc - LINE_W / 2, h1, z1], [xc + LINE_W / 2, h1, z1],
      [xc + LINE_W / 2, h2, z2], [xc - LINE_W / 2, h2, z2],
    ], color, M);
  };
  for (let z = CL.legA - HALF - 1; z > CL.legC + HALF + 1; z -= 1.5) {
    const z2 = Math.max(z - 1.5, CL.legC + HALF + 1);
    slopedLine(CL.legB, z, z2, COL.lineYellow);
    slopedLine(CL.legB - EDGE, z, z2, COL.line);
    slopedLine(CL.legB + EDGE, z, z2, COL.line);
  }

  // 가속 · 돌발 구간
  yellow(CL.legB - HALF - 1, CL.legC, CL.legD + HALF + 1, CL.legC);
  white(CL.legB - HALF - 1, CL.legC - EDGE, CL.legD + HALF + 1, CL.legC - EDGE);
  white(CL.legB - HALF - 1, CL.legC + EDGE, CL.legD + HALF + 1, CL.legC + EDGE);

  // 철길건널목 구간
  yellow(CL.legD, CL.legC + HALF + 1, CL.legD, CL.legE - HALF - 1);
  white(CL.legD - EDGE, CL.legC + HALF + 1, CL.legD - EDGE, CL.legE - HALF - 1);
  white(CL.legD + EDGE, CL.legC + HALF + 1, CL.legD + EDGE, CL.legE - HALF - 1);

  // 종료 구간
  yellow(CL.legD - HALF - 1, CL.legE, -13, CL.legE);
  white(CL.legD - HALF - 1, CL.legE - EDGE, -13, CL.legE - EDGE);
  white(CL.legD - HALF - 1, CL.legE + EDGE, -13, CL.legE + EDGE);
  return m;
}

function stripeCrosswalk(x1, x2, z1, z2) {
  const m = new Mesh();
  const n = 8;
  const M = { unlit: true, layer: 3 };
  for (let i = 0; i < n; i++) {
    const t = z1 + (z2 - z1) * (i / n);
    m.merge(quadXZ(x1, t, x2, t + (z2 - z1) / n * 0.55, 0.02, COL.line, M));
  }
  return m;
}

// 진행 방향 화살표(연습용 안내 표시)
function arrow(x, z, dir) {
  const m = new Mesh();
  const L = 2.4, W = 0.4, H = 0.9;
  const pts = [
    [-L / 2, W], [L / 2 - H, W], [L / 2 - H, H / 1.3],
    [L / 2, 0], [L / 2 - H, -H / 1.3], [L / 2 - H, -W], [-L / 2, -W],
  ];
  const c = Math.cos(dir), s = Math.sin(dir);
  m.addPoly(pts.map(([a, b]) => [
    x + a * c - b * s, 0.025 + groundHeight(x, z), z + a * s + b * c,
  ]), [190, 200, 215], { unlit: true, layer: 3 });
  return m;
}

// ---------------------------------------------------------------------------
// 구조물
// ---------------------------------------------------------------------------

function trafficLightUnit() {
  const node = new Node('signal');
  const pole = new Mesh();
  pole.merge(cylinder(0.12, 0.10, 5.6, [92, 96, 100], 10));
  pole.merge(cylinder(0.10, 0.09, 4.6, [92, 96, 100], 10),
    M4.multiply(M4.translate(0, 5.4, 0), M4.rotZ(90 * Math.PI / 180)));
  pole.merge(cylinder(0.34, 0.34, 0.14, [70, 74, 78], 12));
  node.add(new Node('pole', pole));

  const housing = new Mesh();
  housing.merge(box(1.5, 0.52, 0.26, [42, 46, 44]));
  housing.merge(box(1.58, 0.07, 0.34, [34, 38, 36]), M4.translate(0, 0.26, 0.03));
  const head = new Node('head', housing, M4.translate(-4.0, 5.1, 0));
  node.add(head);

  const lamps = {};
  const defs = [['red', -0.5, [200, 46, 40]], ['yellow', 0, [220, 178, 40]], ['green', 0.5, [60, 200, 120]]];
  for (const [name, dx, c] of defs) {
    const lm = cylinder(0.17, 0.17, 0.06, c, 14);
    const n = new Node(name, lm, M4.multiply(M4.translate(dx, 0, 0.14), M4.rotX(90 * Math.PI / 180)));
    head.add(n);
    lamps[name] = { node: n, on: c, off: shade(c, 0.22) };
  }
  return { node, lamps };
}

function suddenSign() {
  const node = new Node('suddenSign');
  const m = new Mesh();
  m.merge(cylinder(0.09, 0.08, 2.8, [96, 100, 104], 8));
  m.merge(box(2.2, 1.1, 0.14, [28, 30, 34]), M4.translate(0, 3.4, 0));
  node.add(new Node('body', m));
  const face = new Mesh();
  face.addPoly([[-0.95, 2.95, 0.08], [0.95, 2.95, 0.08], [0.95, 3.85, 0.08], [-0.95, 3.85, 0.08]],
    [70, 24, 22], { unlit: true });
  node.add(new Node('face', face));
  return { node, face };
}

// 경사로 정지구간 표지.
// 노면의 노란선은 오르막에서 보닛에 가려 보이지 않으므로,
// 실제 시험장처럼 구간 양옆에 세로 표지를 세워 정지 위치를 알려 준다.
function rampStopMarkers() {
  const node = new Node('rampMarkers');
  for (const z of [RAMP.stopZ1, RAMP.stopZ2]) {
    const h = groundHeight(CL.legB, z);
    for (const side of [-1, 1]) {
      const m = new Mesh();
      m.merge(cylinder(0.07, 0.06, 1.7, [214, 216, 220], 8));
      m.merge(box(0.11, 0.34, 0.5, COL.lineYellow), M4.translate(0, 1.5, 0));
      m.merge(box(0.12, 0.07, 0.5, [40, 42, 46]), M4.translate(0, 1.5, 0));
      node.add(new Node('rm', m, M4.translate(CL.legB + side * (HALF + 0.6), h, z)));
    }
  }
  return node;
}

function railroad() {
  const zTrack = -37.0;
  const m = new Mesh();
  for (let z = zTrack - 1.8; z <= zTrack + 1.8; z += 0.6) {
    m.merge(box(8.0, 0.07, 0.26, [82, 66, 48]), M4.translate(CL.legD, 0.035, z));
  }
  for (const dz of [-0.72, 0.72]) {
    m.merge(box(7.6, 0.11, 0.09, [150, 150, 156]), M4.translate(CL.legD, 0.11, zTrack + dz));
  }
  const node = new Node('railroad', m);
  for (const [x, z] of [[CL.legD - HALF - 1.1, zTrack - 3.0], [CL.legD + HALF + 1.1, zTrack + 3.0]]) {
    const p = new Mesh();
    p.merge(cylinder(0.10, 0.09, 3.2, [200, 200, 204], 8));
    p.merge(box(0.18, 1.2, 0.10, COL.red), M4.multiply(M4.translate(0, 2.8, 0), M4.rotZ(0.78)));
    p.merge(box(0.18, 1.2, 0.10, COL.white), M4.multiply(M4.translate(0, 2.8, 0), M4.rotZ(-0.78)));
    node.add(new Node('xsign', p, M4.translate(x, 0, z)));
  }
  return { node, zTrack };
}

function scenery() {
  const node = new Node('scenery');
  const m = new Mesh();
  // 관리동
  m.merge(box(18, 4.6, 11, [176, 172, 165]), M4.translate(36, 2.3, 26));
  m.merge(box(19, 0.45, 12, [120, 118, 116]), M4.translate(36, 4.8, 26));
  for (let i = 0; i < 6; i++) {
    m.merge(box(1.8, 1.3, 0.12, [96, 128, 150]), M4.translate(29 + i * 2.6, 2.9, 20.45));
  }
  const blocks = [
    [-32, -30, 9, 12, 14], [-28, 12, 8, 14, 10], [92, -20, 10, 16, 13],
    [86, -80, 9, 12, 15], [-20, -86, 11, 11, 12], [40, -92, 8, 18, 14],
    [-30, -60, 7, 10, 16],
  ];
  for (const [x, z, h, w, d] of blocks) {
    const tint = 0.85 + ((x * 7 + z * 3) % 5) * 0.05;
    m.merge(box(w, h, d, shade([148, 150, 156], tint)), M4.translate(x, h / 2, z));
    m.merge(box(w + 0.7, 0.4, d + 0.7, shade([110, 112, 118], tint)), M4.translate(x, h + 0.2, z));
  }
  node.add(new Node('buildings', m));

  const trees = new Mesh();
  const spots = [];
  for (let x = -10; x <= 62; x += 12) spots.push([x, 13]);
  for (let z = -14; z >= -64; z -= 12) spots.push([80, z]);
  for (let x = 24; x <= 60; x += 12) spots.push([x, -80]);
  for (let z = -22; z >= -62; z -= 12) spots.push([4, z]);
  spots.push([-20, -4], [-20, -24], [-22, 6]);
  for (const [x, z] of spots) {
    trees.merge(cylinder(0.18, 0.15, 1.7, [88, 70, 52], 6), M4.translate(x, 0, z));
    trees.merge(cylinder(1.3, 0.05, 2.7, [72, 116, 64], 8), M4.translate(x, 1.6, z));
    trees.merge(cylinder(1.0, 0.05, 2.0, [82, 128, 70], 8), M4.translate(x, 2.5, z));
  }
  node.add(new Node('trees', trees));
  return node;
}

// ---------------------------------------------------------------------------

export function buildCourse() {
  const root = new Node('course');

  const ground = new Mesh();
  ground.merge(quadXZ(-440, -460, 480, 420, -0.02, COL.ground, { layer: 0 }));
  root.add(new Node('ground', ground));

  // 노면
  const road = new Mesh();
  const B = RECTS.find((r) => r.id === 'legB');
  for (const r of RECTS) {
    if (r.id === 'legB') continue;
    road.merge(quadXZ(r.x1, r.z1, r.x2, r.z2, 0.012, COL.asphalt, { layer: 2 }));
  }
  road.merge(heightStrip(B.x1, B.x2, B.z1, B.z2, 0.012, COL.asphalt, { layer: 2 }, 120));
  root.add(new Node('road', road));

  // 경사로 옆 사면(도로가 공중에 떠 보이지 않도록)
  const bank = new Mesh();
  for (let z = RAMP.upStart; z > RAMP.downEnd; z -= 1) {
    const ha = groundHeight(CL.legB, z), hb = groundHeight(CL.legB, z - 1);
    if (ha < 0.005 && hb < 0.005) continue;
    for (const [x, dir] of [[CL.legB - HALF - 0.25, -1], [CL.legB + HALF + 0.25, 1]]) {
      bank.addPoly([[x, 0, z], [x, ha, z], [x, hb, z - 1], [x, 0, z - 1]],
        shade(COL.curb, 0.6), { layer: 1 });
      bank.addPoly([[x, 0, z], [x + dir * 2.2, 0, z], [x + dir * 2.2, 0, z - 1], [x, 0, z - 1]],
        COL.groundAlt, { layer: 0 });
    }
  }
  root.add(new Node('bank', bank));

  root.add(new Node('curbs', buildCurbs()));
  root.add(new Node('lanes', buildLaneLines()));

  // ---- 그 밖의 노면 표시 -------------------------------------------------
  const mark = new Mesh();
  const M = { unlit: true, layer: 3 };
  const Y = 0.02;

  // 출발선 · 종료(도착) 정차 구역
  mark.merge(lineXZ(-13.0, CL.legA, -13.0, CL.legA + EDGE, 0.4, Y, COL.line, M));
  mark.merge(lineXZ(-8.0, CL.legE - EDGE, -8.0, CL.legE, 0.3, Y, COL.lineYellow, M));
  mark.merge(lineXZ(-12.5, CL.legE - EDGE, -12.5, CL.legE, 0.3, Y, COL.lineYellow, M));
  mark.merge(lineXZ(-8.0, CL.legE - EDGE, -12.5, CL.legE - EDGE, 0.16, Y, COL.lineYellow, M));

  // 직각주차 구획선
  mark.merge(lineXZ(BAY.x1, BAY.z1, BAY.x1, BAY.z2, 0.16, Y, COL.lineYellow, M));
  mark.merge(lineXZ(BAY.x2, BAY.z1, BAY.x2, BAY.z2, 0.16, Y, COL.lineYellow, M));
  mark.merge(lineXZ(BAY.x1, BAY.z2, BAY.x2, BAY.z2, 0.16, Y, COL.lineYellow, M));

  // 신호교차로 정지선 + 횡단보도
  const STOP_X = CL.legB - HALF - 3.6;
  mark.merge(lineXZ(STOP_X, CL.legA, STOP_X, CL.legA + EDGE, 0.4, Y, COL.line, M));
  mark.merge(stripeCrosswalk(STOP_X + 0.6, STOP_X + 3.0, CL.legA - HALF, CL.legA + HALF));
  mark.merge(stripeCrosswalk(CL.legB + HALF + 0.6, CL.legB + HALF + 3.0, CL.legA - HALF, CL.legA + HALF));

  // 경사로 정지구간
  for (const z of [RAMP.stopZ1, RAMP.stopZ2]) {
    const ha = groundHeight(CL.legB, z + 0.12) + 0.02;
    const hb = groundHeight(CL.legB, z - 0.12) + 0.02;
    mark.addPoly([
      [CL.legB, ha, z + 0.12], [CL.legB + HALF, ha, z + 0.12],
      [CL.legB + HALF, hb, z - 0.12], [CL.legB, hb, z - 0.12],
    ], COL.lineYellow, M);
  }

  // 가속구간 시작 · 끝
  const ACC = { x1: 30, x2: 60 };
  for (const x of [ACC.x1, ACC.x2]) {
    mark.merge(lineXZ(x, CL.legC - EDGE, x, CL.legC, 0.3, Y, [120, 200, 255], M));
  }

  // 철길건널목 정지선
  const rail = railroad();
  const RAIL_STOP_Z = rail.zTrack - 4.2;
  mark.merge(lineXZ(CL.legD - EDGE, RAIL_STOP_Z, CL.legD, RAIL_STOP_Z, 0.4, Y, COL.line, M));

  // 진행 방향 화살표
  const arrows = [
    [0, LANE_C, 0], [14, LANE_C, 0], [52, LANE_C, 0],
    [CL.legB + LANE_C, -12, -Math.PI / 2], [CL.legB + LANE_C, -56, -Math.PI / 2],
    [56, CL.legC - LANE_C, Math.PI], [26, CL.legC - LANE_C, Math.PI],
    [CL.legD - LANE_C, -56, Math.PI / 2], [CL.legD - LANE_C, -22, Math.PI / 2],
    [4, CL.legE - LANE_C, Math.PI], [-6, CL.legE - LANE_C, Math.PI],
  ];
  for (const [x, z, d] of arrows) mark.merge(arrow(x, z, d));
  root.add(new Node('markings', mark));

  // ---- 구조물 ------------------------------------------------------------
  const signal = trafficLightUnit();
  signal.node.matrix = M4.multiply(
    M4.translate(CL.legB + HALF + 1.4, 0, CL.legA + HALF + 1.4), M4.rotY(Math.PI));
  root.add(signal.node);

  const sudden = suddenSign();
  sudden.node.matrix = M4.multiply(
    M4.translate(26, 0, CL.legC - HALF - 2.4), M4.rotY(-Math.PI / 2));
  root.add(sudden.node);

  root.add(rampStopMarkers());
  root.add(rail.node);
  root.add(scenery());

  return {
    root,
    lamps: signal.lamps,
    suddenFace: sudden.face,
    stopLineX: STOP_X,
    railStopZ: RAIL_STOP_Z,
    accel: ACC,
  };
}
