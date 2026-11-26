// On-device AI rep counter and form cues (MediaPipe Pose Landmarker, runs fully on the phone).
// The ~20 MB "AI pack" is downloaded once on first use, checked against the SHA-256 hashes below
// (these ship inside the signed app), and kept in private storage. No video ever leaves the phone.
'use strict';

const AI_PACK = {
  version: 'mp-1.2.3-lite-1',
  files: [
    { name: 'vision_bundle.js', url: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/vision_bundle.mjs', sha256: 'fb0c02c296f44ce0cc324ba16bd646d8773eb4a7847db4019cc4d0430db7a9b5' },
    { name: 'vision_wasm_internal.js', url: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm/vision_wasm_internal.js', sha256: '2aa5fd3fdd3d8208cd7587df0bb19fb6925c4ea16a76dd025aedc1f64d6a6309' },
    { name: 'vision_wasm_internal.wasm', url: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm/vision_wasm_internal.wasm', sha256: '225bc06c0f51a9cf31fea0e9e0b0243e9e01fb5ef332cc1a7fa6656dbdfdaabf' },
    { name: 'pose_landmarker_lite.task', url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', sha256: '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a' }
  ],
  sizeMB: 20
};

// Landmark indices (MediaPipe pose)
const LM = { ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16, lh: 23, rh: 24, lk: 25, rk: 26, la: 27, ra: 28 };
const SKELETON = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];

const Pose = {
  landmarker: null, stream: null, raf: 0, facing: 'environment', state: null,

  // Which joint to track for an exercise, and the angle thresholds for a rep
  modeFor(ex) {
    const n = ex.name.toLowerCase();
    if (/curl/.test(n) && !/leg curl|nordic/.test(n)) return { joint: 'elbow', low: 60, high: 145, label: 'Elbow', countOn: 'return' };
    if (/pull up|chin up|pulldown|row|muscle up/.test(n)) return { joint: 'elbow', low: 85, high: 150, label: 'Elbow', countOn: 'return' };
    if (/deadlift|rdl|romanian|hip thrust|swing|good morning|glute bridge|back extension/.test(n)) return { joint: 'hip', low: 115, high: 160, label: 'Hip', countOn: 'return' };
    if (/squat|lunge|leg press|pistol|step up|wall ball|thruster|box jump/.test(n) || (['quads', 'glutes'].includes(ex.muscle) && ex.compound)) return { joint: 'knee', low: 105, high: 160, label: 'Knee', countOn: 'return', depth: true };
    if (/push up|bench|press|dip|pike/.test(n) || ['chest', 'triceps', 'shoulders'].includes(ex.muscle)) return { joint: 'elbow', low: 95, high: 150, label: 'Elbow', countOn: 'return', plank: /push up|pike/.test(n) };
    return { joint: 'elbow', low: 90, high: 150, label: 'Elbow', countOn: 'return' };
  },

  angle(a, b, c) {
    const ab = Math.atan2(a.y - b.y, a.x - b.x), cb = Math.atan2(c.y - b.y, c.x - b.x);
    let d = Math.abs((ab - cb) * 180 / Math.PI); if (d > 180) d = 360 - d; return d;
  },
  jointAngle(p, joint, side) {
    const L = side === 'l';
    const S = p[L ? LM.ls : LM.rs], E = p[L ? LM.le : LM.re], W = p[L ? LM.lw : LM.rw], H = p[L ? LM.lh : LM.rh], K = p[L ? LM.lk : LM.rk], A = p[L ? LM.la : LM.ra];
    if (joint === 'elbow') return { a: this.angle(S, E, W), vis: Math.min(S.visibility, E.visibility, W.visibility) };
    if (joint === 'knee') return { a: this.angle(H, K, A), vis: Math.min(H.visibility, K.visibility, A.visibility) };
    return { a: this.angle(S, H, K), vis: Math.min(S.visibility, H.visibility, K.visibility) };
  },

  // ---- AI pack
  isNative() { return !!Cap() && !!Plugin('Filesystem'); },
  async packBase() {
    if (!this.isNative()) return 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3';
    const fs = Plugin('Filesystem');
    const r = await fs.getUri({ path: 'ai', directory: 'DATA' });
    return Cap().convertFileSrc(r.uri);
  },
  async packInstalled() {
    if (!this.isNative()) return true; // browser loads from the CDN directly
    return Store.data.settings.aiPack === AI_PACK.version;
  },
  async sha256OfFile(path) {
    const fs = Plugin('Filesystem');
    const r = await fs.readFile({ path, directory: 'DATA' });
    const bytes = Uint8Array.from(atob(r.data), c => c.charCodeAt(0));
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
  },
  async installPack(onProgress) {
    const fs = Plugin('Filesystem');
    for (let i = 0; i < AI_PACK.files.length; i++) {
      const f = AI_PACK.files[i];
      onProgress && onProgress(`Downloading ${i + 1} of ${AI_PACK.files.length}…`);
      const path = 'ai/' + f.name;
      await fs.downloadFile({ url: f.url, path, directory: 'DATA', recursive: true });
      onProgress && onProgress(`Checking ${i + 1} of ${AI_PACK.files.length}…`);
      if ((await this.sha256OfFile(path)) !== f.sha256) {
        await fs.deleteFile({ path, directory: 'DATA' }).catch(() => { });
        throw new Error('Download failed its integrity check, so it was discarded. Try again on a different network.');
      }
    }
    Store.data.settings.aiPack = AI_PACK.version; Store.save(true);
  },

  async load() {
    if (this.landmarker) return this.landmarker;
    const base = await this.packBase();
    const native = this.isNative();
    const vision = await import(native ? base + '/vision_bundle.js' : base + '/vision_bundle.mjs');
    const files = await vision.FilesetResolver.forVisionTasks(native ? base : base + '/wasm');
    const model = native ? base + '/pose_landmarker_lite.task' : AI_PACK.files[3].url;
    const opts = d => ({ baseOptions: { modelAssetPath: model, delegate: d }, runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    try { this.landmarker = await vision.PoseLandmarker.createFromOptions(files, opts('GPU')); }
    catch (e) { this.landmarker = await vision.PoseLandmarker.createFromOptions(files, opts('CPU')); }
    return this.landmarker;
  },

  // ---- Camera + loop
  async start(video, canvas, ex, onUpdate) {
    this.stop();
    const mode = this.modeFor(ex);
    this.state = { mode, reps: 0, phase: 'up', smooth: null, minAngle: 180, cue: 'Get your whole body in frame, side-on to the camera', depthOk: null, lastRepAt: 0, onUpdate };
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: this.facing, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    video.srcObject = this.stream; await video.play();
    await this.load();
    const ctx = canvas.getContext('2d');
    let lastTs = -1;
    const loop = () => {
      if (!this.stream) return;
      if (video.readyState >= 2) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        const ts = performance.now();
        if (ts > lastTs) {
          lastTs = ts;
          const res = this.landmarker.detectForVideo(video, ts);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const p = res.landmarks && res.landmarks[0];
          if (p) { this.draw(ctx, p, canvas.width, canvas.height); this.step(p); }
          else this.cue('No one in frame');
        }
      }
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  },
  stop() {
    cancelAnimationFrame(this.raf);
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
  },
  cue(text) { if (this.state && this.state.cue !== text) { this.state.cue = text; this.state.onUpdate(this.state); } },

  step(p) {
    const st = this.state, m = st.mode;
    const l = this.jointAngle(p, m.joint, 'l'), r = this.jointAngle(p, m.joint, 'r');
    const side = l.vis >= r.vis ? l : r;
    if (side.vis < 0.5) return this.cue(`Can't see your ${m.label.toLowerCase()} clearly. Turn side-on and step back.`);
    st.smooth = st.smooth == null ? side.a : st.smooth * 0.35 + side.a * 0.65;
    const a = st.smooth;
    st.angle = Math.round(a);
    if (m.depth && a < m.high) { // squat depth: hip crease at or below the top of the knee, checked on every frame of the rep
      const hip = (p[LM.lh].y + p[LM.rh].y) / 2, knee = (p[LM.lk].y + p[LM.rk].y) / 2;
      if (hip >= knee - 0.01) st.depthOk = true;
    }
    if (st.phase === 'up') {
      if (a < m.low) { st.phase = 'down'; st.minAngle = a; }
      else this.cue(st.reps ? 'Good. Next rep' : 'Start your set');
    } else {
      st.minAngle = Math.min(st.minAngle, a);
      if (a > m.high && Date.now() - st.lastRepAt > 400) {
        st.reps++; st.phase = 'up'; st.lastRepAt = Date.now();
        beep(880, 80, 0.15); buzz([40]);
        let msg = 'Rep ' + st.reps;
        if (m.depth) { msg += st.depthOk ? ': good depth' : ': go a little deeper'; st.depthOk = false; }
        if (m.plank) { const body = this.angle(p[LM.ls], p[LM.lh], p[LM.la]); if (body < 155) msg += ', keep your hips in line'; }
        st.cue = msg;
        st.onUpdate(st);
      }
    }
    const el = $('#poseAngle'); if (el) el.textContent = st.angle + '°';
  },

  draw(ctx, p, w, h) {
    ctx.lineWidth = 4; ctx.strokeStyle = '#3d8bfd'; ctx.fillStyle = '#34c77b';
    SKELETON.forEach(([a, b]) => { if (p[a].visibility > 0.4 && p[b].visibility > 0.4) { ctx.beginPath(); ctx.moveTo(p[a].x * w, p[a].y * h); ctx.lineTo(p[b].x * w, p[b].y * h); ctx.stroke(); } });
    [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].forEach(i => { if (p[i].visibility > 0.4) { ctx.beginPath(); ctx.arc(p[i].x * w, p[i].y * h, 5, 0, 7); ctx.fill(); } });
  }
};
