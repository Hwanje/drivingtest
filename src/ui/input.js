// 키보드 · 화면 버튼 입력 처리.
// 아날로그 입력(가속/제동/조향)은 눌린 시간에 따라 서서히 차오르게 해
// 키보드로도 급조작이 아닌 부드러운 조작이 가능하도록 했다.

const AXIS_RISE = 3.4;    // 초당 증가율
const AXIS_FALL = 5.0;    // 초당 감소율

export class Input {
  constructor(target = window) {
    this.keys = new Set();
    this.throttle = 0;
    this.brake = 0;
    this.steer = 0;
    this.actions = new Map();
    this._pending = [];

    // 터치 조작이 잡고 있는 아날로그 값. null 이면 키보드 입력을 쓴다.
    // 차량 모델은 이 값을 "목표"로만 받고 조향 속도·구동력은 스스로 제한하므로,
    // 여기에 값을 넣어도 물리 거동은 달라지지 않는다.
    this.analog = { steer: null, throttle: null, brake: null };

    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = normalize(e);
      if (HANDLED.has(k)) e.preventDefault();
      this.keys.add(k);
      this._pending.push(k);
    });
    target.addEventListener('keyup', (e) => {
      this.keys.delete(normalize(e));
    });
    target.addEventListener('blur', () => this.keys.clear());
  }

  on(key, fn) {
    if (!this.actions.has(key)) this.actions.set(key, []);
    this.actions.get(key).push(fn);
  }

  // 화면 버튼 등에서 키 입력을 흉내 낼 때 사용
  trigger(key) {
    this._pending.push(key);
  }

  // 눌린 키/버튼에 걸린 동작만 실행한다. 일시정지 중에도 이건 돌아야
  // 일시정지를 다시 풀 수 있다.
  flush() {
    for (const k of this._pending) {
      const fns = this.actions.get(k);
      if (fns) for (const fn of fns) fn();
    }
    this._pending.length = 0;
  }

  update(dt) {
    this.flush();

    const up = this.keys.has('up') || this.keys.has('w');
    const down = this.keys.has('down') || this.keys.has('s');
    const left = this.keys.has('left') || this.keys.has('a');
    const right = this.keys.has('right') || this.keys.has('d');

    this.throttle = axis(this.throttle, up, dt);
    this.brake = axis(this.brake, down, dt);

    let steerTarget = 0;
    if (left) steerTarget -= 1;
    if (right) steerTarget += 1;
    if (steerTarget === 0) {
      this.steer += (0 - this.steer) * Math.min(1, dt * 7);
      if (Math.abs(this.steer) < 0.01) this.steer = 0;
    } else {
      this.steer += (steerTarget - this.steer) * Math.min(1, dt * 4.2);
    }

    // 터치 조작 중이면 그 값이 이긴다. 손을 떼면 다시 키보드 값으로 돌아간다.
    const a = this.analog;
    if (a.steer !== null) this.steer = a.steer;
    if (a.throttle !== null) this.throttle = Math.max(this.throttle, a.throttle);
    if (a.brake !== null) this.brake = Math.max(this.brake, a.brake);
  }
}

function axis(cur, pressed, dt) {
  const t = pressed ? 1 : 0;
  const rate = pressed ? AXIS_RISE : AXIS_FALL;
  const d = t - cur;
  const step = rate * dt;
  return Math.abs(d) <= step ? t : cur + Math.sign(d) * step;
}

const HANDLED = new Set([
  'up', 'down', 'left', 'right', 'space', 'tab', 'enter',
  'w', 'a', 's', 'd', 'q', 'e', 'z', 'x', 'v', 'h', 'b', 'c', 'r', 'p',
  '1', '2', '3', '4',
]);

function normalize(e) {
  switch (e.key) {
    case 'ArrowUp': return 'up';
    case 'ArrowDown': return 'down';
    case 'ArrowLeft': return 'left';
    case 'ArrowRight': return 'right';
    case ' ': return 'space';
    case 'Tab': return 'tab';
    case 'Enter': return 'enter';
    case 'Escape': return 'escape';
    default: return e.key.toLowerCase();
  }
}
