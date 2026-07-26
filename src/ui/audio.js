// 외부 음원 없이 Web Audio API 로 합성하는 효과음.
// 엔진음 · 방향지시등 릴레이 · 와이퍼 모터 · 경고음 · 시험관 안내음성(TTS).

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.ready = false;
    this.speechOn = true;
  }

  // 브라우저 정책상 사용자 조작 이후에만 오디오를 켤 수 있다.
  ensure() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    // --- 엔진: 톱니파 두 개 + 저역 필터
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 700;
    this.engineFilter.Q.value = 3;
    this.engineGain.connect(this.engineFilter);
    this.engineFilter.connect(this.master);

    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    this.osc1.connect(this.engineGain);
    this.osc2.connect(g2);
    g2.connect(this.engineGain);
    this.osc1.frequency.value = 40;
    this.osc2.frequency.value = 20;
    this.osc1.start();
    this.osc2.start();

    // --- 노면 소음
    this.noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    this.noise.buffer = buf;
    this.noise.loop = true;
    this.roadGain = ctx.createGain();
    this.roadGain.gain.value = 0;
    const rf = ctx.createBiquadFilter();
    rf.type = 'bandpass';
    rf.frequency.value = 420;
    this.noise.connect(rf);
    rf.connect(this.roadGain);
    this.roadGain.connect(this.master);
    this.noise.start();

    this.ready = true;
  }

  setMuted(m) {
    this.enabled = !m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  // 매 프레임 엔진 상태 반영
  updateEngine(rpm, speed, load) {
    if (!this.ready || !this.enabled) return;
    const t = this.ctx.currentTime;
    if (rpm < 30) {
      this.engineGain.gain.setTargetAtTime(0, t, 0.15);
      this.roadGain.gain.setTargetAtTime(0, t, 0.2);
      return;
    }
    const f = Math.max(24, (rpm / 60) * 2);
    this.osc1.frequency.setTargetAtTime(f, t, 0.06);
    this.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(420 + rpm * 0.34 + load * 900, t, 0.1);
    this.engineGain.gain.setTargetAtTime(0.085 + load * 0.10, t, 0.1);
    this.roadGain.gain.setTargetAtTime(Math.min(0.09, Math.abs(speed) * 0.012), t, 0.2);
  }

  // 짧은 클릭/틱 (방향지시등 릴레이)
  tick(high) {
    this.blip(high ? 1750 : 1250, 0.035, 0.16, 'square');
  }

  // 와이퍼 모터가 한 번 지나가는 소리
  wiperSwoosh() {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    const len = ctx.sampleRate * 0.32;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * t) * 0.5;
    }
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(500, ctx.currentTime);
    f.frequency.linearRampToValueAtTime(1500, ctx.currentTime + 0.3);
    const g = ctx.createGain();
    g.gain.value = 0.22;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
  }

  blip(freq, dur, vol = 0.2, type = 'sine') {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  chime() { this.blip(880, 0.16, 0.18); setTimeout(() => this.blip(1320, 0.2, 0.16), 130); }
  ok() { this.blip(1046, 0.1, 0.16); }
  warn() { this.blip(320, 0.35, 0.24, 'square'); }
  fail() { this.blip(220, 0.5, 0.26, 'sawtooth'); setTimeout(() => this.blip(160, 0.7, 0.24, 'sawtooth'), 260); }

  // 시험관 안내 음성 (브라우저 TTS)
  speak(text) {
    if (!this.speechOn || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ko-KR';
      u.rate = 1.05;
      u.pitch = 1.0;
      const ko = window.speechSynthesis.getVoices().find((v) => v.lang && v.lang.startsWith('ko'));
      if (ko) u.voice = ko;
      window.speechSynthesis.speak(u);
    } catch (_) { /* 음성 미지원 환경은 조용히 무시 */ }
  }
}
