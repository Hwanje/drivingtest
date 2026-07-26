// 최소한의 3D 수학 유틸리티.
// 행렬은 길이 16의 배열이며 row-major(m[행*4 + 열])로 저장한다.
// 벡터는 열벡터로 취급하므로 변환은 v' = M * v 이다.

export const V3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm(a) {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ],
};

export const M4 = {
  identity: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],

  multiply(a, b) {
    const o = new Array(16);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        o[r * 4 + c] =
          a[r * 4] * b[c] +
          a[r * 4 + 1] * b[4 + c] +
          a[r * 4 + 2] * b[8 + c] +
          a[r * 4 + 3] * b[12 + c];
      }
    }
    return o;
  },

  // 여러 행렬을 왼쪽부터 차례로 곱한다. chain(A, B, C) === A*B*C
  chain(...ms) {
    return ms.reduce((acc, m) => M4.multiply(acc, m), M4.identity());
  },

  translate: (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1],

  scale: (x, y = x, z = x) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1],

  rotX(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1];
  },

  rotY(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1];
  },

  rotZ(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  },

  // 점(w=1)을 변환한다.
  xformPoint(m, p) {
    return [
      m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
      m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
      m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
    ];
  },

  // 방향 벡터(w=0)를 변환한다. 이동 성분은 무시된다.
  xformDir(m, v) {
    return [
      m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
      m[4] * v[0] + m[5] * v[1] + m[6] * v[2],
      m[8] * v[0] + m[9] * v[1] + m[10] * v[2],
    ];
  },

  // 로컬 +Y(길이 1) 방향으로 만들어진 도형을 p0 → p1 선분에 맞추는 행렬.
  // 벨트 스트랩처럼 양 끝점이 움직이는 부품에 사용한다.
  alignY(p0, p1) {
    const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const len = Math.hypot(d[0], d[1], d[2]) || 1e-6;
    const pitch = Math.acos(clamp(d[1] / len, -1, 1));
    const yaw = Math.atan2(d[0], d[2]);
    return M4.chain(
      M4.translate(p0[0], p0[1], p0[2]),
      M4.rotY(yaw),
      M4.rotX(pitch),
      M4.scale(1, len, 1),
    );
  },

  // 월드 → 카메라 변환 행렬. 카메라는 -Z 방향을 바라본다.
  lookAt(eye, target, up = [0, 1, 0]) {
    const z = V3.norm(V3.sub(eye, target));
    let x = V3.cross(up, z);
    if (V3.len(x) < 1e-6) x = V3.cross([0, 0, 1], z); // up과 시선이 평행한 경우
    x = V3.norm(x);
    const y = V3.cross(z, x);
    return [
      x[0], x[1], x[2], -V3.dot(x, eye),
      y[0], y[1], y[2], -V3.dot(y, eye),
      z[0], z[1], z[2], -V3.dot(z, eye),
      0, 0, 0, 1,
    ];
  },
};

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

// 각도를 -PI..PI 범위로 정규화한다.
export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

// 현재 값을 목표 값으로 최대 maxDelta 만큼 접근시킨다.
export function approach(cur, target, maxDelta) {
  const d = target - cur;
  if (Math.abs(d) <= maxDelta) return target;
  return cur + Math.sign(d) * maxDelta;
}
