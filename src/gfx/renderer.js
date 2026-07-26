// 캔버스 2D 위에서 동작하는 소프트웨어 폴리곤 렌더러.
// 외부 라이브러리 없이 동작해야 하므로 직접 구현했다.
// 파이프라인: 모델 → 뷰 변환 → 근평면 클리핑 → 원근 투영 → 깊이 정렬 → 채우기.

import { M4, V3 } from './math.js';
import { rgb } from './mesh.js';

const LIGHT_WORLD = V3.norm([-0.45, 0.86, 0.25]);

export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ambient = 0.46;
    this.diffuse = 0.58;
    this.fog = null;   // { color: [r,g,b], start, end }
    this._polys = [];
  }

  // 장치 픽셀 비율을 반영해 캔버스 버퍼 크기를 맞춘다.
  resize(cssWidth, cssHeight) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = cssWidth;
    this.height = cssHeight;
    this.canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    this.canvas.style.width = cssWidth + 'px';
    this.canvas.style.height = cssHeight + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear(color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (color) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    } else {
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    ctx.restore();
  }

  // root: Node, camera: { eye, target, up, fov(도), near }
  render(root, camera) {
    const view = M4.lookAt(camera.eye, camera.target, camera.up || [0, 1, 0]);
    const lightView = V3.norm(M4.xformDir(view, LIGHT_WORLD));
    const near = camera.near || 0.12;
    const focal = (this.height / 2) / Math.tan((camera.fov || 60) * Math.PI / 360);
    const cx = this.width / 2;
    const cy = this.height / 2;

    this._polys.length = 0;
    this._collect(root, view, M4.identity(), near, focal, cx, cy, lightView);

    // 화가 알고리즘: 레이어 우선, 그다음 먼 것부터.
    this._polys.sort((a, b) => (a.layer - b.layer) || (b.depth - a.depth));

    const ctx = this.ctx;
    for (const p of this._polys) {
      ctx.beginPath();
      ctx.moveTo(p.pts[0], p.pts[1]);
      for (let i = 2; i < p.pts.length; i += 2) ctx.lineTo(p.pts[i], p.pts[i + 1]);
      ctx.closePath();
      ctx.fillStyle = p.style;
      if (p.alpha !== undefined) {
        ctx.globalAlpha = p.alpha;
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        ctx.fill();
        // 인접 폴리곤 사이의 안티에일리어싱 틈을 메운다.
        ctx.strokeStyle = p.style;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    return this._polys.length;
  }

  _collect(node, view, parent, near, focal, cx, cy, lightView) {
    if (!node.visible) return;
    const world = M4.multiply(parent, node.matrix);
    if (node.mesh) {
      this._emitMesh(node.mesh, M4.multiply(view, world), near, focal, cx, cy, lightView);
    }
    for (const c of node.children) {
      this._collect(c, view, world, near, focal, cx, cy, lightView);
    }
  }

  _emitMesh(mesh, mv, near, focal, cx, cy, lightView) {
    // 정점을 한 번만 뷰 공간으로 옮겨 두고 면마다 재사용한다.
    const n = mesh.verts.length / 3;
    const vx = this._buf(n);
    for (let i = 0; i < n; i++) {
      const x = mesh.verts[i * 3], y = mesh.verts[i * 3 + 1], z = mesh.verts[i * 3 + 2];
      vx[i * 3] = mv[0] * x + mv[1] * y + mv[2] * z + mv[3];
      vx[i * 3 + 1] = mv[4] * x + mv[5] * y + mv[6] * z + mv[7];
      vx[i * 3 + 2] = mv[8] * x + mv[9] * y + mv[10] * z + mv[11];
    }

    for (const f of mesh.faces) {
      let poly = f.idx.map((i) => [vx[i * 3], vx[i * 3 + 1], vx[i * 3 + 2]]);
      poly = clipNear(poly, near);
      if (poly.length < 3) continue;

      // 면 법선(뷰 공간). 모든 면을 양면으로 그리므로 카메라 쪽으로 뒤집는다.
      let nrm = faceNormal(poly);
      const center = polyCenter(poly);
      if (V3.dot(nrm, center) > 0) nrm = V3.scale(nrm, -1);

      let color = f.color;
      if (!f.unlit) {
        const k = this.ambient + this.diffuse * Math.max(0, V3.dot(nrm, lightView));
        color = [color[0] * k, color[1] * k, color[2] * k];
      }

      let depth = 0;
      const pts = new Array(poly.length * 2);
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i];
        const invZ = 1 / -p[2];
        pts[i * 2] = cx + focal * p[0] * invZ;
        pts[i * 2 + 1] = cy - focal * p[1] * invZ;
        depth += -p[2];
      }
      depth /= poly.length;

      if (this.fog) {
        const t = Math.min(1, Math.max(0, (depth - this.fog.start) / (this.fog.end - this.fog.start)));
        if (t > 0) color = V3.lerp(color, this.fog.color, t * 0.92);
      }

      this._polys.push({
        pts,
        depth,
        // layer 를 지정하지 않은 면은 최상위(입체물)로 본다.
        // 서로 겹쳐 있는 평평한 노면(바닥→검지선→아스팔트→표시)만 0~3을 쓴다.
        layer: f.layer === undefined ? 4 : f.layer,
        alpha: f.alpha,
        style: rgb(color),
      });
    }
  }

  _buf(n) {
    if (!this._vbuf || this._vbuf.length < n * 3) this._vbuf = new Float64Array(n * 3 + 64);
    return this._vbuf;
  }
}

// 카메라 앞(z <= -near)만 남기도록 다각형을 잘라낸다 (Sutherland–Hodgman).
function clipNear(poly, near) {
  const out = [];
  const inside = (p) => p[2] <= -near;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ain = inside(a), bin = inside(b);
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (-near - a[2]) / (b[2] - a[2]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, -near]);
    }
  }
  return out;
}

function faceNormal(poly) {
  // 뉴웰(Newell) 법선: 완전히 평면이 아닌 면에서도 안정적이다.
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

function polyCenter(poly) {
  let x = 0, y = 0, z = 0;
  for (const p of poly) { x += p[0]; y += p[1]; z += p[2]; }
  return [x / poly.length, y / poly.length, z / poly.length];
}
