// 기능시험장 코스의 형상, 노면 표시, 구조물.
//
// 배치는 부산북부운전면허시험장이 배포하는 「제1·2종 보통기능시험 진행도」를
// 옮긴 것이다. 진행도에 적힌 시험진행 순서는 다음과 같다.
//
//   운전장치조작 ▶ 출발 ▶ 경사로 ▶ 신호교차로(좌회전) ▶ 직각주차
//   ▶ 신호교차로(좌회전) ▶ 가속구간(기어변속) ▶ 종료
//   (차로준수 · 돌발 급정지는 전 구간)
//
// 진행도에서 읽어 낸 배치
//   · 출발 지점과 종료 지점이 좌측 상단에 두 칸 나란히, 둘 다 남향
//   · 경사로는 출발 직후 서측 변에 세로로
//   · 신호교차로 두 곳 모두 좌회전. 코스 하단에 있다
//   · 직각주차 구역(주차 P1 · P2 · P3)은 두 신호교차로 사이, 코스 안쪽
//   · 가속구간은 마지막 직선
//   · 철길건널목은 없다
//
// 좌회전만으로 한 바퀴를 도는 반시계 방향 순환 코스다. 우측통행이므로
// 주행 차로는 항상 순환 코스의 바깥쪽이고, 직각주차 구역은 안쪽에 있다.
//
// 치수는 도로교통법 시행규칙 [별표 23] "기능시험코스의 종류·형상 및 구조" 중
// 제1종 보통면허 기준을 따랐다.
//   · 코스 연장거리 300m 이상, 포장 도로
//   · 도로의 폭 7m 이상, 3~3.5m 너비의 2개 차로
//   · 중앙선 10~15cm 너비
//   · 길가장자리선은 중앙선으로부터 3m 지점에 10~15cm 너비로 설치
//   · 연석은 길가장자리선으로부터 25cm 이상 간격, 높이 10cm 정도
//
// 진행도는 위에서 내려다본 그림이고 접힌 사진이라 미터 단위 치수까지는
// 읽을 수 없다. 구간의 순서·상대 위치·회전 방향은 진행도를 그대로 따랐고,
// 각 구간의 길이는 별표 23 규격과 1톤 화물차가 실제로 돌 수 있는 최소
// 반경에 맞춰 정했다.
//
// 좌표계: X는 동쪽, Z는 남쪽(위에서 내려다본 지도의 아래쪽), Y는 위쪽. 단위는 미터.
// 차량 진행 방향 theta 는 forward = (cos θ, 0, sin θ) 이며 θ가 커지면 우회전이다.

import { M4 } from '../gfx/math.js';
import { Node, Mesh, box, cylinder, quadXZ, lineXZ, shade } from '../gfx/mesh.js';

export const ROAD = 7.0;        // 도로 폭
export const HALF = ROAD / 2;   // 중앙선 ~ 연석
export const EDGE = 3.0;        // 중앙선 ~ 길가장자리선
export const LANE_C = 1.75;     // 중앙선 ~ 주행 차로 중심
export const CURB_H = 0.10;     // 연석 높이
export const LINE_W = 0.12;     // 차선 너비

// 각 변 도로의 중앙선 위치
export const CL = {
  north: 0,     // z · 북측 변 (복귀 → 종료)
  west: 0,      // x · 서측 변 (출발 → 경사로)
  south: 86,    // z · 남측 변 (직각주차)
  east: 100,    // x · 동측 변 (가속구간)
};

// 주행 차로(우측통행이므로 순환 코스의 바깥 차로) 중심
export const LANE = {
  west: CL.west - LANE_C,     //  -1.75 · 남행
  south: CL.south + LANE_C,   //  87.75 · 동행
  east: CL.east + LANE_C,     // 101.75 · 북행
  north: CL.north - LANE_C,   //  -1.75 · 서행
};

// 주요 지점
//
// 진행도에는 출발 지점과 종료 지점이 좌측 상단에 두 칸 나란히, 둘 다 남향으로
// 그려져 있다. 여기서는 두 칸을 같은 남행 차로에 앞뒤로 두었다. 나란히 두면
// 둘 중 하나가 반대 차로에 놓여, 출발할 때 좌측 방향지시등을 켜고 실제로는
// 우측으로 붙어야 하는 앞뒤가 안 맞는 상황이 된다.
export const POINT = {
  startX: CL.west - LANE_C,   // 출발 지점 — 남행 차로
  startZ: 14,
  startLineZ: 17.0,
  finishX: CL.west - LANE_C,  // 종료 지점 — 출발 지점 바로 앞(북쪽) 칸
  finishZ1: 3.0,
  finishZ2: 9.0,
  // 신호교차로 두 곳. 둘 다 좌회전이다.
  cross1: { x: CL.west, z: CL.south, stopZ: CL.south - HALF - 2.0 },
  cross2: { x: CL.east, z: CL.south, stopX: CL.east - HALF - 2.0 },
  // 가속구간 (동측 변, 진행 방향 -Z). 약 40m.
  accelZ1: 72, accelZ2: 32,
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
const STUB = 8.0;   // 신호교차로의 사용하지 않는 가지 길이

export const RECTS = [
  // 순환 코스 네 변
  { id: 'legN', x1: CL.west - HALF, x2: CL.east + HALF, z1: CL.north - HALF, z2: CL.north + HALF },
  { id: 'legW', x1: CL.west - HALF, x2: CL.west + HALF, z1: CL.north - HALF, z2: CL.south + HALF },
  { id: 'legS', x1: CL.west - HALF, x2: CL.east + HALF, z1: CL.south - HALF, z2: CL.south + HALF },
  { id: 'legE', x1: CL.east - HALF, x2: CL.east + HALF, z1: CL.north - HALF, z2: CL.south + HALF },

  // 신호교차로 #1 (서측 변 → 남측 변, 좌회전). 사용하지 않는 두 가지.
  { id: 'x1w', x1: CL.west - HALF - STUB, x2: CL.west - HALF, z1: CL.south - HALF, z2: CL.south + HALF },
  { id: 'x1s', x1: CL.west - HALF, x2: CL.west + HALF, z1: CL.south + HALF, z2: CL.south + HALF + STUB },
  // 신호교차로 #2 (남측 변 → 동측 변, 좌회전)
  { id: 'x2e', x1: CL.east + HALF, x2: CL.east + HALF + STUB, z1: CL.south - HALF, z2: CL.south + HALF },
  { id: 'x2s', x1: CL.east - HALF, x2: CL.east + HALF, z1: CL.south + HALF, z2: CL.south + HALF + STUB },

  // 직각주차: 코스 안쪽의 전면 통로와 주차구획 세 개(P1 · P2 · P3).
  // 1톤 화물차(전장 5.11m · 전폭 1.74m)가 들어가는 폭 3.0m · 깊이 6.5m 구획.
  // 통로는 주차구획 양옆으로 넉넉히 뺀다. 본선으로 되돌아오려면 통로 안에서
  // 비스듬히 10m 쯤 달려야 z 방향으로 3.5m 를 옮길 수 있다.
  { id: 'apron', x1: 20, x2: 84, z1: 75.0, z2: CL.south - HALF },
  { id: 'bayP1', x1: 32, x2: 35, z1: 68.5, z2: 75.0 },
  { id: 'bayP2', x1: 48, x2: 51, z1: 68.5, z2: 75.0 },
  { id: 'bayP3', x1: 64, x2: 67, z1: 68.5, z2: 75.0 },

  // 신호가 없는 두 모퉁이(북동 · 북서)의 우각부.
  // 이것이 없으면 전장 5.11m 화물차가 7m 도로 사이에서 90도 회전을 돌 수 없다.
  { id: 'filletNE', x1: CL.east - HALF - 3, x2: CL.east - HALF, z1: CL.north + HALF, z2: CL.north + HALF + 3 },
  { id: 'filletNW', x1: CL.west + HALF, x2: CL.west + HALF + 3, z1: CL.north + HALF, z2: CL.north + HALF + 3 },
];

export const BAYS = ['bayP1', 'bayP2', 'bayP3'].map((id, i) => {
  const r = RECTS.find((q) => q.id === id);
  return { id, name: `P${i + 1}`, x1: r.x1, x2: r.x2, z1: r.z1, z2: r.z2 };
});
const APRON = RECTS.find((r) => r.id === 'apron');

// 기본 주차구획(안내·미니맵용). 실제 배정은 시험마다 무작위로 정해진다.
export const PARKING_BAY = BAYS[1];

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
export const MAIN = [
  [POINT.startX, POINT.startZ],        // 출발
  [LANE.west, LANE.south],             // 경사로 → 신호교차로 #1 좌회전
  [LANE.east, LANE.south],             // 직각주차 → 신호교차로 #2 좌회전
  [LANE.east, LANE.north],             // 가속구간 → 좌회전
  [LANE.west, LANE.north],             // 북측 변 서행 → 좌회전
  [LANE.west, POINT.finishZ2 - 2],     // 종료
];

export const ROUTE = [
  [POINT.startX, POINT.startZ],
  [LANE.west, LANE.south],
  [26, LANE.south], [31, 79.5],                    // 전면 통로 진입
  [PARKING_BAY.x1 + 1.5, 79.5],                    // 구획 앞
  [PARKING_BAY.x1 + 1.5, 71.5],                    // 후진 주차
  [PARKING_BAY.x1 + 1.5, 79.5],                    // 출차
  [72, 79.5], [78, LANE.south],                    // 본선 복귀
  [LANE.east, LANE.south],
  [LANE.east, LANE.north],
  [LANE.west, LANE.north],
  [LANE.west, POINT.finishZ2 - 2],
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
// lastS 주변 구간만 보기 때문에, 출발 지점과 종료 지점처럼 서로 가까운 곳에서
// 진행도가 엉뚱한 값으로 튀지 않는다. 값은 줄어들지 않는다.
export function routeProgress(x, z, lastS = 0) {
  let best = lastS, bestD = Infinity;
  for (let i = 1; i < MAIN.length; i++) {
    if (MAIN_S[i] < lastS - 12 || MAIN_S[i - 1] > lastS + 70) continue;
    const [ax, az] = MAIN[i - 1], [bx, bz] = MAIN[i];
    const dx = bx - ax, dz = bz - az;
    const L2 = dx * dx + dz * dz;
    if (L2 < 1e-9) continue;
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
      const t = (s - MAIN_S[i - 1]) / Math.max(1e-6, MAIN_S[i] - MAIN_S[i - 1]);
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
// range: 이 판정을 적용할 구간(회전부·교차로는 정상적으로 선을 넘으므로 제외한다)
// ---------------------------------------------------------------------------
const TURN = 12;   // 모퉁이 앞뒤로 이만큼은 판정하지 않는다
const DRIVE_LANES = [
  // 서측 변(남행): 우측 차로는 중앙선보다 -X 쪽
  { axis: 'x', center: CL.west, side: +1, along: 'z', range: [POINT.startZ + 12, CL.south - HALF - TURN] },
  // 남측 변(동행): 우측 차로는 +Z 쪽
  { axis: 'z', center: CL.south, side: -1, along: 'x', range: [CL.west + HALF + TURN, CL.east - HALF - TURN] },
  // 동측 변(북행): 우측 차로는 +X 쪽
  { axis: 'x', center: CL.east, side: -1, along: 'z', range: [CL.north + HALF + TURN, CL.south - HALF - TURN] },
  // 북측 변(서행): 우측 차로는 -Z 쪽
  { axis: 'z', center: CL.north, side: +1, along: 'x', range: [CL.west + HALF + TURN, CL.east - HALF - TURN] },
];

// 해당 지점이 중앙선을 넘어 반대 차로에 있으면 true.
// 길가장자리선 바깥(갓길)으로 나가는 것은 중앙선 침범이 아니므로 세지 않는다.
export function crossedCenterLine(x, z) {
  // 출발·종료 구역, 직각주차 통로, 두 신호교차로 안쪽은 차로 구분이 없다
  if (z < POINT.startZ + 10 && Math.abs(x - CL.west) < HALF + 1) return false;
  if (x >= APRON.x1 - 3 && x <= APRON.x2 + 3 && z >= APRON.z1 - 3 && z <= CL.south + HALF) return false;
  for (const c of [POINT.cross1, POINT.cross2]) {
    if (Math.abs(x - c.x) < HALF + 3 && Math.abs(z - c.z) < HALF + 3) return false;
  }
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
// 경사로 (서측 변, 진행 방향 +Z)
// 종단경사 10%, 오르막 12m. 위·아래 1.5m 구간만 곡선으로 이어 붙여
// 대부분의 구간에서 경사가 일정하게 유지되도록 했다.
// ---------------------------------------------------------------------------
const GRADE = 0.10;
const RAMP_L = 12;
const RAMP_T = 1.5;
const RAMP_H = GRADE * (RAMP_L - RAMP_T);   // 1.05m

export const RAMP = {
  upStart: 30,                  // 오르막 시작(사면 아래끝)
  upEnd: 30 + RAMP_L,           // 42 · 오르막 끝
  topEnd: 48,                   // 정상 평지 끝
  downEnd: 60,                  // 내리막 끝
  height: RAMP_H,
  grade: GRADE,
  stopZ1: 38.0,                 // 정지구간(앞바퀴를 이 사이에 세운다)
  stopZ2: 40.0,
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
  if (x < CL.west - HALF - 0.9 || x > CL.west + HALF + 0.9) return 0;
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

  const G = HALF + 1;   // 모퉁이·교차로에서 선을 끊는 여유

  // 북측 변
  yellow(CL.west + G, CL.north, CL.east - G, CL.north);
  white(CL.west + G, CL.north - EDGE, CL.east - G, CL.north - EDGE);
  white(CL.west + G, CL.north + EDGE, CL.east - G, CL.north + EDGE);

  // 서측 변 (경사면을 따라 기울어진 사각형으로 이어 그린다)
  const slopedLine = (xc, z1, z2, color) => {
    const h1 = groundHeight(CL.west, z1) + Y;
    const h2 = groundHeight(CL.west, z2) + Y;
    m.addPoly([
      [xc - LINE_W / 2, h1, z1], [xc + LINE_W / 2, h1, z1],
      [xc + LINE_W / 2, h2, z2], [xc - LINE_W / 2, h2, z2],
    ], color, M);
  };
  for (let z = CL.north + G; z < CL.south - G; z += 1.5) {
    const z2 = Math.min(z + 1.5, CL.south - G);
    slopedLine(CL.west, z, z2, COL.lineYellow);
    slopedLine(CL.west - EDGE, z, z2, COL.line);
    slopedLine(CL.west + EDGE, z, z2, COL.line);
  }

  // 남측 변 (직각주차 통로가 붙는 구간은 길가장자리선을 끊는다)
  yellow(CL.west + G, CL.south, CL.east - G, CL.south);
  white(CL.west + G, CL.south + EDGE, CL.east - G, CL.south + EDGE);
  white(CL.west + G, CL.south - EDGE, APRON.x1 - 1, CL.south - EDGE);
  white(APRON.x2 + 1, CL.south - EDGE, CL.east - G, CL.south - EDGE);

  // 동측 변
  yellow(CL.east, CL.north + G, CL.east, CL.south - G);
  white(CL.east - EDGE, CL.north + G, CL.east - EDGE, CL.south - G);
  white(CL.east + EDGE, CL.north + G, CL.east + EDGE, CL.south - G);

  // 신호교차로의 사용하지 않는 가지
  yellow(CL.west - HALF - STUB, CL.south, CL.west - G, CL.south);
  yellow(CL.west, CL.south + G, CL.west, CL.south + HALF + STUB);
  yellow(CL.east + G, CL.south, CL.east + HALF + STUB, CL.south);
  yellow(CL.east, CL.south + G, CL.east, CL.south + HALF + STUB);
  return m;
}

// 횡단보도. dir 이 'x' 면 줄무늬가 X축을 따라 늘어선다.
function crosswalk(x1, z1, x2, z2, dir) {
  const m = new Mesh();
  const n = 8;
  const M = { unlit: true, layer: 3 };
  for (let i = 0; i < n; i++) {
    if (dir === 'x') {
      const t = x1 + (x2 - x1) * (i / n);
      m.merge(quadXZ(t, z1, t + (x2 - x1) / n * 0.55, z2, 0.02, COL.line, M));
    } else {
      const t = z1 + (z2 - z1) * (i / n);
      m.merge(quadXZ(x1, t, x2, t + (z2 - z1) / n * 0.55, 0.02, COL.line, M));
    }
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

// 돌발 급정지 경고 표지. 진행도에는 코스 곳곳에 세워져 있고, 돌발은
// 특정 지점이 아니라 전 구간에서 지시될 수 있다.
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

// 제한속도 20 표지
function speedSign() {
  const m = new Mesh();
  m.merge(cylinder(0.07, 0.06, 2.4, [180, 182, 186], 8));
  m.merge(cylinder(0.62, 0.62, 0.08, COL.red, 18),
    M4.multiply(M4.translate(0, 2.7, 0), M4.rotX(90 * Math.PI / 180)));
  m.merge(cylinder(0.50, 0.50, 0.12, COL.white, 18),
    M4.multiply(M4.translate(0, 2.7, 0.02), M4.rotX(90 * Math.PI / 180)));
  // 20
  for (const dx of [-0.17, 0.17]) {
    m.merge(box(0.03, 0.42, 0.22, [40, 42, 48]), M4.translate(dx, 2.7, 0.10));
  }
  return m;
}

// 경사로 정지구간 표지. 노면의 노란선은 오르막에서 가려 보이지 않으므로,
// 실제 시험장처럼 구간 양옆에 세로 표지를 세워 정지 위치를 알려 준다.
function rampStopMarkers() {
  const node = new Node('rampMarkers');
  for (const z of [RAMP.stopZ1, RAMP.stopZ2]) {
    const h = groundHeight(CL.west, z);
    for (const side of [-1, 1]) {
      const m = new Mesh();
      m.merge(cylinder(0.07, 0.06, 1.7, [214, 216, 220], 8));
      m.merge(box(0.5, 0.34, 0.11, COL.lineYellow), M4.translate(0, 1.5, 0));
      m.merge(box(0.5, 0.07, 0.12, [40, 42, 46]), M4.translate(0, 1.5, 0));
      node.add(new Node('rm', m, M4.translate(CL.west + side * (HALF + 0.6), h, z)));
    }
  }
  return node;
}

// 주차구획 번호판 (P1 · P2 · P3)
function bayMarkers() {
  const node = new Node('bayMarkers');
  for (const b of BAYS) {
    const m = new Mesh();
    m.merge(cylinder(0.06, 0.05, 1.6, [180, 182, 186], 8));
    m.merge(box(0.9, 0.5, 0.08, [40, 96, 168]), M4.translate(0, 1.8, 0));
    node.add(new Node(b.id, m, M4.translate((b.x1 + b.x2) / 2, 0, b.z1 - 0.9)));
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
  const cuts = (c, near, far) => {
    const out = [c];
    for (let step = near, d = c; d < c + far; step *= 1.32) { d += step; out.push(d); }
    for (let step = near, d = c; d > c - far; step *= 1.32) { d -= step; out.unshift(d); }
    return out;
  };
  const xs = cuts(50, 14, 460);
  const zs = cuts(43, 14, 440);
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
  m.merge(box(22, 5.0, 13, [176, 172, 165]), M4.translate(66, 2.5, 24));
  m.merge(box(23, 0.5, 14, [120, 118, 116]), M4.translate(66, 5.25, 24));
  for (let i = 0; i < 7; i++) {
    m.merge(box(1.8, 1.4, 0.12, [96, 128, 150]), M4.translate(58 + i * 2.6, 3.2, 17.4));
  }
  // 시험장 바깥 건물
  const blocks = [
    [-32, -24, 9, 12, 14], [-30, 40, 8, 14, 12], [134, 20, 10, 14, 16],
    [130, 74, 9, 12, 14], [-26, 106, 11, 12, 12], [46, 118, 8, 18, 14],
    [42, -26, 9, 16, 12],
  ];
  for (const [x, z, h, w, d] of blocks) {
    const tint = 0.85 + ((Math.abs(x) * 7 + Math.abs(z) * 3) % 5) * 0.05;
    m.merge(box(w, h, d, shade([148, 150, 156], tint)), M4.translate(x, h / 2, z));
    m.merge(box(w + 0.7, 0.4, d + 0.7, shade([110, 112, 118], tint)), M4.translate(x, h + 0.2, z));
  }
  node.add(new Node('buildings', m));

  const trees = new Mesh();
  const spots = [];
  for (let x = 10; x <= 92; x += 14) spots.push([x, -10]);        // 북측 변 바깥
  for (let z = 12; z <= 76; z += 14) spots.push([110, z]);        // 동측 변 바깥
  for (let x = 12; x <= 92; x += 14) spots.push([x, 98]);         // 남측 변 바깥
  for (let z = 12; z <= 76; z += 14) spots.push([-10, z]);        // 서측 변 바깥
  spots.push([20, 20], [20, 40], [40, 20], [86, 46], [86, 62]);   // infield 조경
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

  // 노면. 서측 변만 경사로 때문에 높이가 변한다.
  const road = new Mesh();
  const W = RECTS.find((r) => r.id === 'legW');
  for (const r of RECTS) {
    if (r.id === 'legW') continue;
    road.merge(quadXZ(r.x1, r.z1, r.x2, r.z2, 0.012, COL.asphalt, { layer: 2 }));
  }
  road.merge(heightStrip(W.x1, W.x2, W.z1, W.z2, 0.012, COL.asphalt, { layer: 2 }, 180));
  root.add(new Node('road', road));

  // 경사로 옆 사면
  const bank = new Mesh();
  for (let z = RAMP.upStart; z < RAMP.downEnd; z += 1) {
    const ha = groundHeight(CL.west, z), hb = groundHeight(CL.west, z + 1);
    if (ha < 0.005 && hb < 0.005) continue;
    for (const [x, dir] of [[CL.west - HALF - 0.25, -1], [CL.west + HALF + 0.25, 1]]) {
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

  // 출발선과 종료 정차 구역. 둘 다 남행 차로 위에 남향으로 둔다.
  mark.merge(lineXZ(CL.west - EDGE, POINT.startLineZ, CL.west, POINT.startLineZ, 0.4, Y, COL.line, M));
  mark.merge(lineXZ(CL.west - EDGE, POINT.finishZ1, CL.west, POINT.finishZ1, 0.3, Y, COL.lineYellow, M));
  mark.merge(lineXZ(CL.west - EDGE, POINT.finishZ2, CL.west, POINT.finishZ2, 0.3, Y, COL.lineYellow, M));
  mark.merge(lineXZ(CL.west - EDGE, POINT.finishZ1, CL.west - EDGE, POINT.finishZ2, 0.16, Y, COL.lineYellow, M));

  // 직각주차 구획선 (세 구획 모두 그린다)
  for (const b of BAYS) {
    mark.merge(lineXZ(b.x1, b.z1, b.x1, b.z2, 0.16, Y, COL.lineYellow, M));
    mark.merge(lineXZ(b.x2, b.z1, b.x2, b.z2, 0.16, Y, COL.lineYellow, M));
    mark.merge(lineXZ(b.x1, b.z2, b.x2, b.z2, 0.16, Y, COL.lineYellow, M));
  }

  // 신호교차로 #1 — 남행 정지선과 횡단보도
  const c1 = POINT.cross1;
  mark.merge(lineXZ(CL.west - EDGE, c1.stopZ, CL.west, c1.stopZ, 0.4, Y, COL.line, M));
  mark.merge(crosswalk(CL.west - HALF, c1.stopZ + 0.6, CL.west + HALF, c1.stopZ + 3.0, 'z'));
  mark.merge(crosswalk(c1.x + HALF + 0.6, CL.south - HALF, c1.x + HALF + 3.0, CL.south + HALF, 'x'));

  // 신호교차로 #2 — 동행 정지선과 횡단보도
  const c2 = POINT.cross2;
  mark.merge(lineXZ(c2.stopX, CL.south, c2.stopX, CL.south + EDGE, 0.4, Y, COL.line, M));
  mark.merge(crosswalk(c2.stopX + 0.6, CL.south - HALF, c2.stopX + 3.0, CL.south + HALF, 'x'));
  mark.merge(crosswalk(CL.east - HALF, CL.south + HALF + 0.6, CL.east + HALF, CL.south + HALF + 3.0, 'z'));

  // 경사로 정지구간
  for (const z of [RAMP.stopZ1, RAMP.stopZ2]) {
    const ha = groundHeight(CL.west, z - 0.12) + 0.02;
    const hb = groundHeight(CL.west, z + 0.12) + 0.02;
    mark.addPoly([
      [CL.west - EDGE, ha, z - 0.12], [CL.west, ha, z - 0.12],
      [CL.west, hb, z + 0.12], [CL.west - EDGE, hb, z + 0.12],
    ], COL.lineYellow, M);
  }

  // 가속구간 시작 · 끝 (동측 변, 진행 방향 -Z)
  for (const z of [POINT.accelZ1, POINT.accelZ2]) {
    mark.merge(lineXZ(CL.east, z, CL.east + EDGE, z, 0.3, Y, [120, 200, 255], M));
  }

  // 진행 방향 화살표 (진행도의 바닥 화살표를 그대로 옮겼다)
  const E = 0, S = Math.PI / 2, Wd = Math.PI, N = -Math.PI / 2;
  const arrows = [
    [LANE.west, 22, S], [LANE.west, 66, S], [LANE.west, 76, S],
    [16, LANE.south, E], [42, LANE.south, E], [86, LANE.south, E],
    [LANE.east, 76, N], [LANE.east, 34, N], [LANE.east, 12, N],
    [86, LANE.north, Wd], [50, LANE.north, Wd], [14, LANE.north, Wd],
  ];
  for (const [x, z, d] of arrows) mark.merge(arrow(x, z, d));
  root.add(new Node('markings', mark));

  // ---- 구조물 ------------------------------------------------------------
  // 신호등은 정지선 앞에서 올려다보이도록 교차로 건너편 모서리에 세운다.
  const sig1 = trafficLightUnit();
  sig1.node.matrix = M4.multiply(
    M4.translate(CL.west - HALF - 1.4, 0, CL.south + HALF + 1.4), M4.rotY(-Math.PI / 2));
  root.add(sig1.node);

  const sig2 = trafficLightUnit();
  sig2.node.matrix = M4.multiply(
    M4.translate(CL.east + HALF + 1.4, 0, CL.south + HALF + 1.4), M4.rotY(Math.PI));
  root.add(sig2.node);

  // 돌발 경고 표지 — 진행도처럼 코스 곳곳에 세운다. 실제 돌발 지시는 전 구간에서 나온다.
  const sudden = suddenSign();
  sudden.node.matrix = M4.multiply(
    M4.translate(40, 0, CL.south + HALF + 2.4), M4.rotY(-Math.PI / 2));
  root.add(sudden.node);

  // 제한속도 20 표지 3곳
  const signs = new Node('speedSigns');
  const sp = [
    [CL.west - HALF - 2.2, 24, Math.PI / 2],
    [CL.east + HALF + 2.2, 58, -Math.PI / 2],
    [56, CL.south + HALF + 2.2, Math.PI],
  ];
  for (const [x, z, r] of sp) {
    signs.add(new Node('sp', speedSign(), M4.multiply(M4.translate(x, 0, z), M4.rotY(r))));
  }
  root.add(signs);

  root.add(rampStopMarkers());
  root.add(bayMarkers());
  root.add(scenery());

  return { root, lamps: sig1.lamps, lamps2: sig2.lamps, suddenFace: sudden.face };
}
