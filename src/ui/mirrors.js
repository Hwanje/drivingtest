// 룸미러 · 좌우 사이드미러.
//
// 각각 작은 캔버스에 장면을 한 번 더 그린다. 코스 전체가 2천 폴리곤 남짓이고
// 미러 캔버스가 작아서, 세 장을 더 그려도 프레임 시간은 0.2ms 정도만 는다.
//
// 거울이므로 좌우가 뒤집혀 보여야 한다. 캔버스에 CSS 로 scaleX(-1) 을 걸어
// 뒤집는다(렌더러는 손대지 않는다).
//
// 미러를 그리는 동안에는 차체 껍데기를 잠깐 켠다. 1인칭에서는 껍데기가
// 숨겨져 있는데, 사이드미러에 차 옆구리가 안 보이면 차폭을 가늠할 수 없다.

import { Renderer3D } from '../gfx/renderer.js';
import { M4 } from '../gfx/math.js';

// 차체 좌표계 기준 카메라 위치 · 바라보는 점 (x 앞, y 위, z 오른쪽)
const VIEWS = {
  // 룸미러: 캡 지붕 뒤쪽에서 뒤를 본다. 적재함 너머로 뒤 노면이 보인다.
  room: { eye: [0.10, 2.26, 0], target: [-14, 0.55, 0], fov: 46 },
  // 사이드미러: 실제 거울 위치에서 뒤·바깥쪽을 본다. 차 옆구리가 함께 보인다.
  left: { eye: [2.02, 1.30, -1.20], target: [-10, 0.15, -2.7], fov: 42 },
  right: { eye: [2.02, 1.30, 1.20], target: [-10, 0.15, 2.7], fov: 42 },
};

export class Mirrors {
  constructor(world, car, opts = {}) {
    this.world = world;
    this.car = car;
    this.fog = opts.fog || null;
    this.enabled = false;
    this.every = opts.every || 2;    // 몇 프레임마다 한 번 그릴지
    this._tick = 0;
    this.views = {};
  }

  // el: 각 미러의 <canvas>
  attach(name, canvas, w, h) {
    const r = new Renderer3D(canvas);
    r.resize(w, h);
    r.fog = this.fog;
    this.views[name] = { r, def: VIEWS[name] };
  }

  setEnabled(on) { this.enabled = on; }

  update(vehicle, interior) {
    if (!this.enabled) return;
    this._tick += 1;
    if (this._tick % this.every) return;

    // 미러에는 차체가 보여야 한다. 1인칭이면 잠깐 껍데기를 켠다.
    if (interior) this.car.setInterior(false);
    const m = M4.chain(
      M4.translate(vehicle.x, vehicle.y + vehicle.bodyBounce, vehicle.z),
      M4.rotY(-vehicle.heading),
      M4.rotZ(vehicle.pitch),
      M4.rotX(vehicle.roll),
    );
    for (const v of Object.values(this.views)) {
      v.r.clear('#93b4d2');
      v.r.render(this.world, {
        eye: M4.xformPoint(m, v.def.eye),
        target: M4.xformPoint(m, v.def.target),
        up: [0, 1, 0],
        fov: v.def.fov,
        near: 0.10,
      });
    }
    if (interior) this.car.setInterior(true);
  }
}
