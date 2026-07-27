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
// 배치는 실제 시험장처럼 하나의 순환 코스로 잡았다.
//   출발 직선(북쪽) → 우회전 → 경사로(동쪽) → 우회전 → 가속·돌발(남쪽)
//   → 우회전 → 철길건널목(서쪽) → 좌회전 → 출발 직선 반대 차로로 돌아와 종료
// 출발 직선은 갈 때와 올 때를 서로 다른 차로로 쓰므로 중앙선이 실제 의미를 갖는다.
// 직각주차 코스는 순환 코스 안쪽(infield)에 두어 실제 시험장 배치에 가깝게 했다.
//
// 좌표계: X는 동쪽, Z는 남쪽(위에서 내려다본 지도의 아래쪽), Y는 위쪽. 단위는 미터.
// 차량 진행 방향 theta 는 forward = (cos θ, 0, sin θ) 이며 θ가 커지면 우회전이다.

import { M4 } from '../gfx/math.js';
import { Node, Mesh, box, cylinder, quadXZ, lineXZ, shade } from '../gfx/mesh.js';

export const ROAD = 7.0;        // 도로 폭
export const HALF = ROAD / 2;   // 중앙선 ~ 연석
export const EDGE = 3.0;        // 중앙선 ~ 길가장자리선
export const LANE_C = 1.5;      // 중앙선 ~ 주행 차로 중심
export const CURB_H = 0.10;     // 연석 높이
export const LINE_W = 0.12;     // 차선 너비

// 각 구간 도로의 중앙선 위치
export const CL = {
  legA: 0,      // z · 출발 직선(왕복 사용, 종료 구간이기도 하다)
  legB: 86,     // x · 경사로 구간
  legC: 48,     // z · 가속 · 돌발 구간
  legD: 14,     // x · 철길건널목 구간
};

// 주요 지점
export const POINT = {
  startX: -16,             // 출발 위치
  startLineX: -13.5,       // 출발선
  finishX1: -13.0,         // 종료 정차 구역
  finishX2: -8.0,
  crossX: 64,              // 신호교차로 중심
  stopLineX: 59.0,         // 신호교차로 정지선
  accelX1: 40, accelX2: 70,  // 가속구간(진행 방향 -X)
  suddenX: 34,             // 돌발상황 표지
  railZ: 26,               // 철길 선로
  railStopZ: 30,           // 철길건널목 정지선(진행 방향 -Z)
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
  // 출발 직선 (동쪽 끝 교차 지점까지 이어진다)
  { id: 'legA', x1: -18, x2: CL.legB + HALF, z1: CL.legA - HALF, z2: CL.legA + HALF },
  // 경사로 구간 (동쪽 변)
  { id: 'legB', x1: CL.legB - HALF, x2: CL.legB + HALF, z1: CL.legA - HALF, z2: CL.legC + HALF },
  // 가속 · 돌발 구간 (남쪽 변)
  { id: 'legC', x1: CL.legD - HALF, x2: CL.legB + HALF, z1: CL.legC - HALF, z2: CL.legC + HALF },
  // 철길건널목 구간 (서쪽 변)
  { id: 'legD', x1: CL.legD - HALF, x2: CL.legD + HALF, z1: CL.legA - HALF, z2: CL.legC + HALF },
  // 신호교차로의 남북 가지
  { id: 'cross', x1: POINT.crossX - HALF, x2: POINT.crossX + HALF, z1: CL.legA - 9, z2: CL.legA + 9 },

  // 직각주차: 순환 코스 안쪽의 전면 통로와 주차구획.
  // 1톤 화물차(전장 5.11m · 전폭 1.74m)가 들어가는 폭 3.0m · 깊이 6.5m 구획.
  // 통로는 본선과 맞닿은 한 장의 직사각형으로 둔다. 양 끝을 얕은 사각형으로
  // 덧대면 위에서 봤을 때 경계가 계단처럼 끊긴다.
  { id: 'apron', x1: 17.0, x2: 49.5, z1: CL.legA + HALF, z2: 11.0 },
  { id: 'bay', x1: 30.0, x2: 33.0, z1: 11.0, z2: 17.5 },

  // 교차 지점 우각부(모서리 곡선). 실제 도로도 안쪽 모서리가 둥글게 처리되어 있다.
  // 이것이 없으면 전장 5.11m 화물차가 90도 회전을 돌 수 없다.
  { id: 'filletAB', x1: CL.legB - HALF - 3, x2: CL.legB - HALF, z1: CL.legA + HALF, z2: CL.legA + HALF + 3 },
  { id: 'filletBC', x1: CL.legB - HALF - 3, x2: CL.legB - HALF, z1: CL.legC - HALF - 3, z2: CL.legC - HALF },
  { id: 'filletCD', x1: CL.legD + HALF, x2: CL.legD + HALF + 3, z1: CL.legC - HALF - 3, z2: CL.legC - HALF },
];

const BAY = RECTS.find((r) => r.id === 'bay');
const APRON = RECTS.find((r) => r.id === 'apron');
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
// 주행 경로
//   MAIN  : 본선(직각주차 우회 없음). 진행도 계산과 단계 순서 판정에 쓴다.
//   ROUTE : 안내 · 미니맵용. 직각주차 왕복을 포함한다.
// 둘 다 "우측 차로 중심"을 따라간다.
// ---------------------------------------------------------------------------
const LA_E = CL.legA + LANE_C;    //  1.5 · 출발 직선 동쪽 방향 차로
const LA_W = CL.legA - LANE_C;    // -1.5 · 출발 직선 서쪽 방향(종료) 차로
const LB = CL.legB - LANE_C;      // 84.5 · 경사로 구간 차로
const LC = CL.legC - LANE_C;      // 46.5 · 가속 구간 차로
const LD = CL.legD + LANE_C;      // 15.5 · 철길건널목 구간 차로

export const MAIN = [
  [POINT.startX, LA_E], [LB, LA_E],       // 출발 직선 → 우회전
  [LB, LC],                               // 경사로 → 우회전
  [LD, LC],                               // 가속 · 돌발 → 우회전
  [LD, LA_W],                             // 철길건널목 → 좌회전
  [POINT.finishX2 - 2, LA_W],             // 종료
];

export const ROUTE = [
  [POINT.startX, LA_E], [24, LA_E],       // 출발
  [28, 7.2], [42, 7.4],                   // 직각주차 전면 통로
  [31.5, 14.6], [42, 7.4],                // 후진 주차 → 출차
  [52, LA_E], [LB, LA_E],                 // 본선 복귀 → 신호교차로 직진
  [LB, LC], [LD, LC], [LD, LA_W],
  [POINT.finishX2 - 2, LA_W],
];

function polyLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return s;
}

// 코스 연장거리(직각주차 왕복 포함). 별표 23의 300m 이상 요건 확인용.
export function courseLength() { return polyLength(ROUTE); }

// MAIN 각 꼭짓점까지의 누적 거리
const MAIN_S = (() => {
  const acc = [0];
  for (let i = 1; i < MAIN.length; i++) {
    acc.push(acc[i - 1] + Math.hypot(MAIN[i][0] - MAIN[i - 1][0], MAIN[i][1] - MAIN[i - 1][1]));
  }
  return acc;
})();
export const MAIN_LENGTH = MAIN_S[MAIN_S.length - 1];

// 본선을 따라 얼마나 진행했는지(m). 시험 단계의 순서를 정하는 기준이 된다.
// lastS 주변 구간만 보기 때문에, 서로 겹쳐 지나가는 구간(출발 직선과 철길 구간이
// 만나는 지점 등)에서 진행도가 엉뚱한 값으로 튀지 않는다. 값은 줄어들지 않는다.
export function routeProgress(x, z, lastS = 0) {
  let best = lastS, bestD = Infinity;
  for (let i = 1; i < MAIN.length; i++) {
    if (MAIN_S[i] < lastS - 12 || MAIN_S[i - 1] > lastS + 70) continue;
    const [ax, az] = MAIN[i - 1], [bx, bz] = MAIN[i];
    const dx = bx - ax, dz = bz - az;
    const L2 = dx * dx + dz * dz;
    let t = ((x - ax) * dx + (z - az) * dz) / L2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t, pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < bestD) { bestD = d; best = MAIN_S[i - 1] + Math.sqrt(L2) * t; }
  }
  return Math.max(lastS, best);
}

// 본선 위 진행거리 s 에 해당하는 좌표(안내용)
export function pointAt(s) {
  for (let i = 1; i < MAIN.length; i++) {
    if (s <= MAIN_S[i] || i === MAIN.length - 1) {
      const t = (s - MAIN_S[i - 1]) / (MAIN_S[i] - MAIN_S[i - 1]);
      const k = Math.max(0, Math.min(1, t));
      return [MAIN[i - 1][0] + (MAIN[i][0] - MAIN[i - 1][0]) * k,
        MAIN[i - 1][1] + (MAIN[i][1] - MAIN[i - 1][1]) * k];
    }
  }
  return MAIN[0];
}

// ---------------------------------------------------------------------------
// 주행 차로 (중앙선 침범 판정용)
// center: 중앙선 위치, side: 중앙선을 넘어간 쪽의 부호,
// range: 이 판정을 적용할 구간(회전부 부근은 정상적으로 선을 넘으므로 제외한다)
// ---------------------------------------------------------------------------
const DRIVE_LANES = [
  // 출발 직선 동쪽 방향: 우측 차로는 중앙선보다 +Z 쪽
  { axis: 'z', center: CL.legA, side: -1, along: 'x', range: [POINT.startX, 15] },
  { axis: 'z', center: CL.legA, side: -1, along: 'x', range: [51, CL.legB - HALF - 10] },
  // 경사로 구간(진행 -? 실제로는 +Z): 우측 차로는 -X 쪽
  { axis: 'x', center: CL.legB, side: +1, along: 'z', range: [CL.legA + HALF + 10, CL.legC - HALF - 10] },
  // 가속 구간(진행 -X): 우측 차로는 -Z 쪽
  { axis: 'z', center: CL.legC, side: +1, along: 'x', range: [CL.legD + HALF + 10, CL.legB - HALF - 10] },
  // 철길건널목 구간(진행 -Z): 우측 차로는 +X 쪽
  { axis: 'x', center: CL.legD, side: -1, along: 'z', range: [CL.legA + HALF + 10, CL.legC - HALF - 10] },
  // 종료 구간 = 출발 직선의 반대 차로(진행 -X): 우측 차로는 -Z 쪽
  { axis: 'z', center: CL.legA, side: +1, along: 'x', range: [POINT.startX, CL.legD - HALF - 10] },
];

// 해당 지점이 중앙선을 넘어 반대 차로에 있으면 true.
// 길가장자리선 바깥(갓길)으로 나가는 것은 중앙선 침범이 아니므로 세지 않는다.
// dirHint: 'east' | 'west' — 출발 직선은 왕복이라 진행 방향을 알려 주어야 한다.
export function crossedCenterLine(x, z, dirHint) {
  // 직각주차 통로 · 주차구획 · 교차로는 차로 구분이 없다
  if (x >= APRON.x1 - 2 && x <= APRON.x2 + 2 && z >= APRON.z1 - 0.2) return false;
  if (Math.abs(x - POINT.crossX) < HALF + 2) return false;
  for (const d of DRIVE_LANES) {
    // 출발 직선의 두 차로는 진행 방향에 맞는 것만 본다
    if (d.axis === 'z' && d.center === CL.legA) {
      if (d.side === -1 && dirHint !== 'east') continue;
      if (d.side === +1 && dirHint !== 'west') continue;
    }
    const s = d.along === 'x' ? x : z;
    if (s < d.range[0] || s > d.range[1]) continue;
    const v = d.axis === 'x' ? x : z;
    if (Math.abs(v - d.center) > HALF + 1) continue;   // 이 도로 위가 아니면 무시
    if ((v - d.center) * d.side > 0.06) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 경사로 (legB, 진행 방향 +Z)
// 종단경사 10%, 오르막 12m. 위·아래 1.5m 구간만 곡선으로 이어 붙여
// 대부분의 구간에서 경사가 일정하게 유지되도록 했다.
// ---------------------------------------------------------------------------
const GRADE = 0.10;
const RAMP_L = 12;
const RAMP_T = 1.5;
const RAMP_H = GRADE * (RAMP_L - RAMP_T);   // 1.05m

export const RAMP = {
  upStart: 12,                  // 오르막 시작(사면 아래끝)
  upEnd: 12 + RAMP_L,           // 24 · 오르막 끝
  topEnd: 30,                   // 정상 평지 끝
  downEnd: 42,                  // 내리막 끝
  height: RAMP_H,
  grade: GRADE,
  stopZ1: 20.0,                 // 정지구간(앞바퀴를 이 사이에 세운다)
  stopZ2: 22.0,
};

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
  if (z < RAMP.upStart || z > RAMP.downEnd) return 0;
  if (z < RAMP.upEnd) return slopeHeight(z - RAMP.upStart);
  if (z < RAMP.topEnd) return RAMP_H;
  return slopeHeight((RAMP.downEnd - z) / (RAMP.downEnd - RAMP.topEnd) * RAMP_L);
}

// ---------------------------------------------------------------------------
// 노면 생성
// ---------------------------------------------------------------------------

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
function buildCurbs() {
  const m = new Mesh();
  const W = 0.25;
  const STEP = 2.0;

  // 경사면에서도 계단이 지지 않도록 양 끝 높이를 각각 구해 기울어진 프리즘으로 만든다.
  const emit = (ax, a0, a1, at, out) => {
    const w0 = at, w1 = at + out * W;
    const xz = (a, wv) => (ax === 'x' ? [a, wv] : [wv, a]);
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

// 차선(중앙선 · 길가장자리선). 회전부와 교차로 안에서는 끊어 준다.
function buildLaneLines() {
  const m = new Mesh();
  const M = { unlit: true, layer: 3 };
  const Y = 0.02;
  const yellow = (x1, z1, x2, z2) => m.merge(lineXZ(x1, z1, x2, z2, LINE_W, Y, COL.lineYellow, M));
  const white = (x1, z1, x2, z2) => m.merge(lineXZ(x1, z1, x2, z2, LINE_W, Y, COL.line, M));

  const AX1 = POINT.startX - 2, AX2 = CL.legB - HALF - 1;
  // 출발 직선 (교차로와 직각주차 통로 구간에서 끊는다)
  yellow(AX1, CL.legA, POINT.crossX - HALF - 1, CL.legA);
  yellow(POINT.crossX + HALF + 1, CL.legA, AX2, CL.legA);
  white(AX1, CL.legA - EDGE, AX2, CL.legA - EDGE);
  white(AX1, CL.legA + EDGE, APRON.x1 - 1, CL.legA + EDGE);
  white(APRON.x2 + 1, CL.legA + EDGE, AX2, CL.legA + EDGE);

  // 경사로 구간 (경사면을 따라 기울어진 사각형으로 이어 그린다)
  const slopedLine = (xc, z1, z2, color) => {
    const h1 = groundHeight(CL.legB, z1) + Y;
    const h2 = groundHeight(CL.legB, z2) + Y;
    m.addPoly([
      [xc - LINE_W / 2, h1, z1], [xc + LINE_W / 2, h1, z1],
      [xc + LINE_W / 2, h2, z2], [xc - LINE_W / 2, h2, z2],
    ], color, M);
  };
  for (let z = CL.legA + HALF + 1; z < CL.legC - HALF - 1; z += 1.5) {
    const z2 = Math.min(z + 1.5, CL.legC - HALF - 1);
    slopedLine(CL.legB, z, z2, COL.lineYellow);
    slopedLine(CL.legB - EDGE, z, z2, COL.line);
    slopedLine(CL.legB + EDGE, z, z2, COL.line);
  }

  // 가속 · 돌발 구간
  yellow(CL.legD + HALF + 1, CL.legC, CL.legB - HALF - 1, CL.legC);
  white(CL.legD + HALF + 1, CL.legC - EDGE, CL.legB - HALF - 1, CL.legC - EDGE);
  white(CL.legD + HALF + 1, CL.legC + EDGE, CL.legB - HALF - 1, CL.legC + EDGE);

  // 철길건널목 구간
  yellow(CL.legD, CL.legA + HALF + 1, CL.legD, CL.legC - HALF - 1);
  white(CL.legD - EDGE, CL.legA + HALF + 1, CL.legD - EDGE, CL.legC - HALF - 1);
  white(CL.legD + EDGE, CL.legA + HALF + 1, CL.legD + EDGE, CL.legC - HALF - 1);

  // 신호교차로 남북 가지
  yellow(POINT.crossX, CL.legA - 8, POINT.crossX, CL.legA - HALF - 1);
  yellow(POINT.crossX, CL.legA + HALF + 1, POINT.crossX, CL.legA + 8);
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

// 경사로 정지구간 표지. 노면의 노란선은 오르막에서 가려 보이지 않으므로,
// 실제 시험장처럼 구간 양옆에 세로 표지를 세워 정지 위치를 알려 준다.
function rampStopMarkers() {
  const node = new Node('rampMarkers');
  for (const z of [RAMP.stopZ1, RAMP.stopZ2]) {
    const h = groundHeight(CL.legB, z);
    for (const side of [-1, 1]) {
      const m = new Mesh();
      m.merge(cylinder(0.07, 0.06, 1.7, [214, 216, 220], 8));
      m.merge(box(0.5, 0.34, 0.11, COL.lineYellow), M4.translate(0, 1.5, 0));
      m.merge(box(0.5, 0.07, 0.12, [40, 42, 46]), M4.translate(0, 1.5, 0));
      node.add(new Node('rm', m, M4.translate(CL.legB + side * (HALF + 0.6), h, z)));
    }
  }
  return node;
}

function railroad() {
  const z0 = POINT.railZ;
  const m = new Mesh();
  for (let z = z0 - 1.8; z <= z0 + 1.8; z += 0.6) {
    m.merge(box(9.0, 0.07, 0.26, [82, 66, 48]), M4.translate(CL.legD, 0.035, z));
  }
  for (const dz of [-0.72, 0.72]) {
    m.merge(box(8.6, 0.11, 0.09, [150, 150, 156]), M4.translate(CL.legD, 0.11, z0 + dz));
  }
  const node = new Node('railroad', m);
  for (const [x, z] of [[CL.legD + HALF + 1.1, z0 + 3.2], [CL.legD - HALF - 1.1, z0 - 3.2]]) {
    const p = new Mesh();
    p.merge(cylinder(0.10, 0.09, 3.2, [200, 200, 204], 8));
    p.merge(box(0.18, 1.2, 0.10, COL.red), M4.multiply(M4.translate(0, 2.8, 0), M4.rotZ(0.78)));
    p.merge(box(0.18, 1.2, 0.10, COL.white), M4.multiply(M4.translate(0, 2.8, 0), M4.rotZ(-0.78)));
    node.add(new Node('xsign', p, M4.translate(x, 0, z)));
  }
  return node;
}

// 지면.
//
// 안개는 면 하나당 한 번, 그 면의 평균 깊이로 계산한다. 그래서 지면을 커다란
// 사각형 하나로 깔면 평균 깊이가 수백 미터가 되어 바로 앞 발밑까지 통째로
// 안개색(하늘색)으로 칠해진다 — 지평선이 사라지고 코스가 하늘에 떠 있는 것처럼
// 보인다. 거리에 따라 커지는 격자로 잘라서 깔면 안개가 거리별로 제대로 먹는다.
function groundPlane() {
  const mesh = new Mesh();
  // 코스 중심에서 바깥으로 점점 넓어지는 분할선
  const cuts = (c, near, far) => {
    const out = [c];
    for (let step = near, d = c; d < c + far; step *= 1.32) { d += step; out.push(d); }
    for (let step = near, d = c; d > c - far; step *= 1.32) { d -= step; out.unshift(d); }
    return out;
  };
  const xs = cuts(37, 14, 460);
  const zs = cuts(24, 14, 440);
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      // 칸 경계가 띠로 보이지 않을 만큼만 색을 흔든다
      const tint = 0.985 + (((i * 7 + j * 13) % 3) / 3) * 0.03;
      mesh.merge(quadXZ(xs[i], zs[j], xs[i + 1], zs[j + 1], -0.02,
        shade(COL.ground, tint), { layer: 0 }));
    }
  }
  return mesh;
}

function scenery() {
  const node = new Node('scenery');
  const m = new Mesh();
  // 관리동 — 순환 코스 안쪽(infield)에 두어 실제 시험장처럼 보이게 한다
  m.merge(box(20, 5.0, 12, [176, 172, 165]), M4.translate(62, 2.5, 26));
  m.merge(box(21, 0.5, 13, [120, 118, 116]), M4.translate(62, 5.25, 26));
  for (let i = 0; i < 7; i++) {
    m.merge(box(1.8, 1.4, 0.12, [96, 128, 150]), M4.translate(54 + i * 2.6, 3.2, 19.9));
  }
  // 시험장 바깥 건물
  const blocks = [
    [-34, -22, 9, 12, 14], [-30, 30, 8, 14, 12], [104, 10, 10, 14, 16],
    [98, 62, 9, 12, 14], [-24, 66, 11, 12, 12], [46, 76, 8, 18, 14],
  ];
  for (const [x, z, h, w, d] of blocks) {
    const tint = 0.85 + ((x * 7 + z * 3) % 5) * 0.05;
    m.merge(box(w, h, d, shade([148, 150, 156], tint)), M4.translate(x, h / 2, z));
    m.merge(box(w + 0.7, 0.4, d + 0.7, shade([110, 112, 118], tint)), M4.translate(x, h + 0.2, z));
  }
  node.add(new Node('buildings', m));

  const trees = new Mesh();
  const spots = [];
  for (let x = -12; x <= 78; x += 13) spots.push([x, -10]);      // 출발 직선 바깥
  for (let z = 6; z <= 42; z += 12) spots.push([96, z]);         // 경사로 구간 바깥
  for (let x = 24; x <= 72; x += 13) spots.push([x, 58]);        // 가속 구간 바깥
  for (let z = 10; z <= 40; z += 12) spots.push([4, z]);         // 철길 구간 바깥
  spots.push([24, 22], [24, 34], [70, 40]);                      // infield 조경
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

  root.add(new Node('ground', groundPlane()));

  // 노면
  const road = new Mesh();
  const B = RECTS.find((r) => r.id === 'legB');
  for (const r of RECTS) {
    if (r.id === 'legB') continue;
    road.merge(quadXZ(r.x1, r.z1, r.x2, r.z2, 0.012, COL.asphalt, { layer: 2 }));
  }
  road.merge(heightStrip(B.x1, B.x2, B.z1, B.z2, 0.012, COL.asphalt, { layer: 2 }, 140));
  root.add(new Node('road', road));

  // 경사로 옆 사면
  const bank = new Mesh();
  for (let z = RAMP.upStart; z < RAMP.downEnd; z += 1) {
    const ha = groundHeight(CL.legB, z), hb = groundHeight(CL.legB, z + 1);
    if (ha < 0.005 && hb < 0.005) continue;
    for (const [x, dir] of [[CL.legB - HALF - 0.25, -1], [CL.legB + HALF + 0.25, 1]]) {
      bank.addPoly([[x, 0, z], [x, ha, z], [x, hb, z + 1], [x, 0, z + 1]],
        shade(COL.curb, 0.6), { layer: 1 });
      bank.addPoly([[x, 0, z], [x + dir * 2.2, 0, z], [x + dir * 2.2, 0, z + 1], [x, 0, z + 1]],
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
  mark.merge(lineXZ(POINT.startLineX, CL.legA, POINT.startLineX, CL.legA + EDGE, 0.4, Y, COL.line, M));
  mark.merge(lineXZ(POINT.finishX1, CL.legA - EDGE, POINT.finishX1, CL.legA, 0.3, Y, COL.lineYellow, M));
  mark.merge(lineXZ(POINT.finishX2, CL.legA - EDGE, POINT.finishX2, CL.legA, 0.3, Y, COL.lineYellow, M));
  mark.merge(lineXZ(POINT.finishX1, CL.legA - EDGE, POINT.finishX2, CL.legA - EDGE, 0.16, Y, COL.lineYellow, M));

  // 직각주차 구획선
  mark.merge(lineXZ(BAY.x1, BAY.z1, BAY.x1, BAY.z2, 0.16, Y, COL.lineYellow, M));
  mark.merge(lineXZ(BAY.x2, BAY.z1, BAY.x2, BAY.z2, 0.16, Y, COL.lineYellow, M));
  mark.merge(lineXZ(BAY.x1, BAY.z2, BAY.x2, BAY.z2, 0.16, Y, COL.lineYellow, M));

  // 신호교차로 정지선 + 횡단보도(양방향)
  mark.merge(lineXZ(POINT.stopLineX, CL.legA, POINT.stopLineX, CL.legA + EDGE, 0.4, Y, COL.line, M));
  mark.merge(stripeCrosswalk(POINT.stopLineX + 0.6, POINT.stopLineX + 3.0, CL.legA - HALF, CL.legA + HALF));
  mark.merge(stripeCrosswalk(POINT.crossX + HALF + 0.6, POINT.crossX + HALF + 3.0, CL.legA - HALF, CL.legA + HALF));

  // 경사로 정지구간
  for (const z of [RAMP.stopZ1, RAMP.stopZ2]) {
    const ha = groundHeight(CL.legB, z - 0.12) + 0.02;
    const hb = groundHeight(CL.legB, z + 0.12) + 0.02;
    mark.addPoly([
      [CL.legB - EDGE, ha, z - 0.12], [CL.legB, ha, z - 0.12],
      [CL.legB, hb, z + 0.12], [CL.legB - EDGE, hb, z + 0.12],
    ], COL.lineYellow, M);
  }

  // 가속구간 시작 · 끝
  for (const x of [POINT.accelX1, POINT.accelX2]) {
    mark.merge(lineXZ(x, CL.legC - EDGE, x, CL.legC, 0.3, Y, [120, 200, 255], M));
  }

  // 철길건널목 정지선
  mark.merge(lineXZ(CL.legD, POINT.railStopZ, CL.legD + EDGE, POINT.railStopZ, 0.4, Y, COL.line, M));

  // 진행 방향 화살표
  const arrows = [
    [-6, LA_E, 0], [12, LA_E, 0], [52, LA_E, 0], [74, LA_E, 0],
    [LB, 8, Math.PI / 2], [LB, 38, Math.PI / 2],
    [72, LC, Math.PI], [30, LC, Math.PI],
    [LD, 38, -Math.PI / 2], [LD, 10, -Math.PI / 2],
    [6, LA_W, Math.PI], [-4, LA_W, Math.PI],
  ];
  for (const [x, z, d] of arrows) mark.merge(arrow(x, z, d));
  root.add(new Node('markings', mark));

  // ---- 구조물 ------------------------------------------------------------
  const signal = trafficLightUnit();
  // 정지선 앞에서 올려다보이도록 교차로 건너편 모서리에 세운다
  signal.node.matrix = M4.multiply(
    M4.translate(POINT.crossX + HALF + 1.4, 0, CL.legA + HALF + 1.4), M4.rotY(Math.PI));
  root.add(signal.node);

  const sudden = suddenSign();
  sudden.node.matrix = M4.multiply(
    M4.translate(POINT.suddenX, 0, CL.legC + HALF + 2.4), M4.rotY(Math.PI / 2));
  root.add(sudden.node);

  root.add(rampStopMarkers());
  root.add(railroad());
  root.add(scenery());

  return { root, lamps: signal.lamps, suddenFace: sudden.face };
}
