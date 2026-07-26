// 폴리곤 메시와 간단한 장면 그래프.
// 삼각형 대신 볼록 다각형(면)을 그대로 다룬다. 캔버스 2D로 채워 그리기 때문에
// 면 단위로 처리하는 편이 정점 수도 적고 외곽선 처리도 쉽다.

import { M4 } from './math.js';

export class Mesh {
  constructor() {
    this.verts = [];  // [x, y, z, ...]
    this.faces = [];  // { idx: number[], color: [r,g,b], unlit?, layer?, alpha? }
  }

  addVert(x, y, z) {
    this.verts.push(x, y, z);
    return this.verts.length / 3 - 1;
  }

  addVerts(points) {
    return points.map((p) => this.addVert(p[0], p[1], p[2]));
  }

  // idx: 정점 인덱스 배열(반시계 방향이 앞면)
  addFace(idx, color, opts = {}) {
    this.faces.push({ idx, color, ...opts });
    return this;
  }

  // 좌표 배열로 바로 면을 추가한다.
  addPoly(points, color, opts = {}) {
    return this.addFace(this.addVerts(points), color, opts);
  }

  vert(i) {
    return [this.verts[i * 3], this.verts[i * 3 + 1], this.verts[i * 3 + 2]];
  }

  // 다른 메시를 행렬을 적용해 흡수한다.
  merge(other, matrix = null) {
    const base = this.verts.length / 3;
    for (let i = 0; i < other.verts.length; i += 3) {
      let p = [other.verts[i], other.verts[i + 1], other.verts[i + 2]];
      if (matrix) p = M4.xformPoint(matrix, p);
      this.verts.push(p[0], p[1], p[2]);
    }
    for (const f of other.faces) {
      this.faces.push({ ...f, idx: f.idx.map((i) => i + base) });
    }
    return this;
  }
}

// 장면 그래프 노드. 애니메이션은 노드의 matrix 를 갈아끼우는 방식으로 처리한다.
export class Node {
  constructor(name = '', mesh = null, matrix = M4.identity()) {
    this.name = name;
    this.mesh = mesh;
    this.matrix = matrix;
    this.children = [];
    this.visible = true;
  }

  add(child) {
    this.children.push(child);
    return child;
  }

  find(name) {
    if (this.name === name) return this;
    for (const c of this.children) {
      const hit = c.find(name);
      if (hit) return hit;
    }
    return null;
  }
}

// ---------------------------------------------------------------- 색 유틸

// 밝기를 곱한다. 부품 모델에서 같은 색의 명암 변화를 줄 때 사용.
export const shade = (c, k) => [
  Math.min(255, c[0] * k),
  Math.min(255, c[1] * k),
  Math.min(255, c[2] * k),
];

export const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

// ---------------------------------------------------------------- 도형 빌더

// 축에 정렬된 직육면체. 중심 기준, 크기 (w, h, d).
export function box(w, h, d, color, opts = {}) {
  const m = new Mesh();
  const x = w / 2, y = h / 2, z = d / 2;
  const v = m.addVerts([
    [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z],       // 앞(+Z)
    [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z],   // 뒤(-Z)
  ]);
  m.addFace([v[0], v[1], v[2], v[3]], color, opts);
  m.addFace([v[5], v[4], v[7], v[6]], color, opts);
  m.addFace([v[4], v[0], v[3], v[7]], color, opts);
  m.addFace([v[1], v[5], v[6], v[2]], color, opts);
  m.addFace([v[3], v[2], v[6], v[7]], color, opts);
  m.addFace([v[4], v[5], v[1], v[0]], color, opts);
  return m;
}

// Y축을 따르는 원기둥/원뿔대. 밑면 y=0, 윗면 y=h.
export function cylinder(rBottom, rTop, h, color, segs = 12, opts = {}) {
  const m = new Mesh();
  const bottom = [], top = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    bottom.push(m.addVert(c * rBottom, 0, s * rBottom));
    top.push(m.addVert(c * rTop, h, s * rTop));
  }
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % segs;
    m.addFace([bottom[i], bottom[j], top[j], top[i]], color, opts);
  }
  if (rTop > 1e-4) m.addFace([...top], color, opts);
  if (rBottom > 1e-4) m.addFace([...bottom].reverse(), color, opts);
  return m;
}

// 구(위도/경도 분할). 중심 원점.
export function sphere(r, color, segs = 10, rings = 6, opts = {}) {
  const m = new Mesh();
  const grid = [];
  for (let j = 0; j <= rings; j++) {
    const phi = (j / rings) * Math.PI;
    const row = [];
    for (let i = 0; i < segs; i++) {
      const th = (i / segs) * Math.PI * 2;
      row.push(m.addVert(
        r * Math.sin(phi) * Math.cos(th),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(th),
      ));
    }
    grid.push(row);
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segs; i++) {
      const i2 = (i + 1) % segs;
      m.addFace([grid[j][i], grid[j][i2], grid[j + 1][i2], grid[j + 1][i]], color, opts);
    }
  }
  return m;
}

// XZ 평면의 볼록/오목 다각형을 Y 방향으로 밀어 올린다.
// points: [[x, z], ...] (반시계 방향)
export function extrude(points, h, color, opts = {}) {
  const m = new Mesh();
  const lo = points.map((p) => m.addVert(p[0], 0, p[1]));
  const hi = points.map((p) => m.addVert(p[0], h, p[1]));
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    m.addFace([lo[i], lo[j], hi[j], hi[i]], color, opts);
  }
  m.addFace([...hi], color, opts);
  m.addFace([...lo].reverse(), color, opts);
  return m;
}

// XZ 평면 위의 사각형(y 고정). 도로 노면과 노면 표시에 사용한다.
export function quadXZ(x1, z1, x2, z2, y, color, opts = {}) {
  const m = new Mesh();
  m.addPoly([
    [x1, y, z1], [x2, y, z1], [x2, y, z2], [x1, y, z2],
  ], color, opts);
  return m;
}

// 임의의 네 점으로 이루어진 사각면.
export function quad(p0, p1, p2, p3, color, opts = {}) {
  return new Mesh().addPoly([p0, p1, p2, p3], color, opts);
}

// 두께가 있는 선분을 XZ 평면 위에 그린다(노면 차선용).
export function lineXZ(x1, z1, x2, z2, width, y, color, opts = {}) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz) || 1;
  const nx = (-dz / len) * (width / 2);
  const nz = (dx / len) * (width / 2);
  return quad(
    [x1 + nx, y, z1 + nz], [x2 + nx, y, z2 + nz],
    [x2 - nx, y, z2 - nz], [x1 - nx, y, z1 - nz],
    color, opts,
  );
}

// 점선. 노면의 차로 경계 표시에 사용한다.
export function dashedLineXZ(x1, z1, x2, z2, width, y, color, dash = 2, gap = 2, opts = {}) {
  const m = new Mesh();
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  for (let t = 0; t < len; t += dash + gap) {
    const t2 = Math.min(t + dash, len);
    m.merge(lineXZ(x1 + ux * t, z1 + uz * t, x1 + ux * t2, z1 + uz * t2, width, y, color, opts));
  }
  return m;
}

// 원환(도넛). 스티어링 휠 림에 사용한다. XY 평면에 놓인다.
export function torus(R, r, color, majorSegs = 20, minorSegs = 8, opts = {}) {
  const m = new Mesh();
  const grid = [];
  for (let i = 0; i < majorSegs; i++) {
    const a = (i / majorSegs) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const row = [];
    for (let j = 0; j < minorSegs; j++) {
      const b = (j / minorSegs) * Math.PI * 2;
      const cb = Math.cos(b), sb = Math.sin(b);
      row.push(m.addVert((R + r * cb) * ca, (R + r * cb) * sa, r * sb));
    }
    grid.push(row);
  }
  for (let i = 0; i < majorSegs; i++) {
    const i2 = (i + 1) % majorSegs;
    for (let j = 0; j < minorSegs; j++) {
      const j2 = (j + 1) % minorSegs;
      m.addFace([grid[i][j], grid[i2][j], grid[i2][j2], grid[i][j2]], color, opts);
    }
  }
  return m;
}

// 모서리를 깎은 상자. 부품이 딱딱해 보이지 않도록 쓰는 근사 형태.
export function beveledBox(w, h, d, bevel, color, opts = {}) {
  const m = new Mesh();
  const x = w / 2, y = h / 2, z = d / 2, b = bevel;
  const ring = (yy, sx, sz) => [
    [-x * sx + b * sx, yy, -z * sz],
    [x * sx - b * sx, yy, -z * sz],
    [x * sx, yy, -z * sz + b * sz],
    [x * sx, yy, z * sz - b * sz],
    [x * sx - b * sx, yy, z * sz],
    [-x * sx + b * sx, yy, z * sz],
    [-x * sx, yy, z * sz - b * sz],
    [-x * sx, yy, -z * sz + b * sz],
  ];
  const shrink = 1 - b / Math.max(w, d);
  const lo = m.addVerts(ring(-y, shrink, shrink));
  const mid1 = m.addVerts(ring(-y + b, 1, 1));
  const mid2 = m.addVerts(ring(y - b, 1, 1));
  const hi = m.addVerts(ring(y, shrink, shrink));
  const bandFaces = (a, bb) => {
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      m.addFace([a[i], a[j], bb[j], bb[i]], color, opts);
    }
  };
  bandFaces(lo, mid1);
  bandFaces(mid1, mid2);
  bandFaces(mid2, hi);
  m.addFace([...hi], color, opts);
  m.addFace([...lo].reverse(), color, opts);
  return m;
}
