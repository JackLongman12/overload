'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (n, cls = '') => `<i class="ti ti-${n} ${cls}" aria-hidden="true"></i>`;
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; };
const round1 = n => Math.round(n * 10) / 10;

function fmtDur(sec) {
  sec = Math.max(0, Math.round(+sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
function fmtPace(secPerKm) { return secPerKm ? fmtDur(secPerKm) + ' /km' : '–'; }
function fmtDate(ts, opts) { return new Date(ts).toLocaleDateString(undefined, opts || { weekday: 'short', day: 'numeric', month: 'short' }); }
function fmtTime(ts) { return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }
function fmtNum(n) { return Math.round(n).toLocaleString(); }
function parseDur(str) { // "1:30" or "90" or "1:02:03"
  if (str == null || str === '') return 0;
  const p = String(str).split(':').map(x => parseFloat(x) || 0);
  return p.reduce((a, b) => a * 60 + b, 0);
}

let _toastT;
function toast(msg, ms = 2400) {
  let el = $('#toast');
  if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(_toastT); _toastT = setTimeout(() => el.classList.remove('show'), ms);
}

// ---- Sound and haptics
let _ac;
function beep(freq = 880, ms = 180, vol = 0.25) {
  try {
    _ac = _ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = _ac.createOscillator(), g = _ac.createGain();
    o.frequency.value = freq; o.type = 'sine'; g.gain.value = vol;
    o.connect(g); g.connect(_ac.destination); o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, _ac.currentTime + ms / 1000);
    o.stop(_ac.currentTime + ms / 1000 + 0.02);
  } catch (e) { }
}
function buzz(pattern = [200]) {
  const h = Plugin('Haptics');
  if (h) { h.vibrate({ duration: Array.isArray(pattern) ? pattern[0] : pattern }).catch(() => { }); return; }
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// ---- Native notifications (rest timer while screen is off)
const Notify = {
  async ensure() {
    const ln = Plugin('LocalNotifications'); if (!ln) return false;
    try { const p = await ln.checkPermissions(); if (p.display !== 'granted') { const r = await ln.requestPermissions(); return r.display === 'granted'; } return true; } catch (e) { return false; }
  },
  async at(id, when, title, body) {
    const ln = Plugin('LocalNotifications'); if (!ln) return;
    try { await ln.cancel({ notifications: [{ id }] }); await ln.schedule({ notifications: [{ id, title, body, schedule: { at: new Date(when), allowWhileIdle: true } }] }); } catch (e) { }
  },
  async cancel(id) { const ln = Plugin('LocalNotifications'); if (!ln) return; try { await ln.cancel({ notifications: [{ id }] }); } catch (e) { } }
};

// ---- Charts (pure SVG)
function lineChart(pts, opts = {}) {
  const W = 340, H = opts.h || 150, P = { l: 34, r: 10, t: 12, b: 22 };
  if (pts.length < 2) return `<div class="empty-chart">${pts.length ? 'Log one more session to see a trend' : 'No data yet'}</div>`;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.1; y0 -= pad; y1 += pad;
  const sx = x => P.l + (x - x0) / ((x1 - x0) || 1) * (W - P.l - P.r);
  const sy = y => H - P.b - (y - y0) / (y1 - y0) * (H - P.t - P.b);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + sx(p.x).toFixed(1) + ' ' + sy(p.y).toFixed(1)).join(' ');
  const ticks = [y0 + pad, (y0 + y1) / 2, y1 - pad];
  const fmt = opts.fmt || (v => round1(v));
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(opts.label || 'chart')}">
    ${ticks.map(v => `<line x1="${P.l}" x2="${W - P.r}" y1="${sy(v)}" y2="${sy(v)}" class="grid"/><text x="${P.l - 4}" y="${sy(v) + 3}" class="axis" text-anchor="end">${fmt(v)}</text>`).join('')}
    <text x="${P.l}" y="${H - 6}" class="axis">${fmtDate(x0, { day: 'numeric', month: 'short' })}</text>
    <text x="${W - P.r}" y="${H - 6}" class="axis" text-anchor="end">${fmtDate(x1, { day: 'numeric', month: 'short' })}</text>
    <path d="${d}" class="line"/>
    ${pts.map(p => `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="2.6" class="dot"><title>${fmtDate(p.x)}: ${fmt(p.y)}</title></circle>`).join('')}
  </svg>`;
}

function barChart(bars, opts = {}) {
  const W = 340, H = opts.h || 140, P = { l: 6, r: 6, t: 14, b: 20 };
  if (!bars.length) return `<div class="empty-chart">No data yet</div>`;
  const max = Math.max(1, ...bars.map(b => b.v));
  const bw = (W - P.l - P.r) / bars.length;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(opts.label || 'bar chart')}">
    ${bars.map((b, i) => { const h = b.v / max * (H - P.t - P.b); const x = P.l + i * bw + bw * 0.15; const y = H - P.b - h;
      return `<rect x="${x}" y="${y}" width="${bw * 0.7}" height="${Math.max(h, b.v ? 1 : 0)}" rx="3" class="bar"><title>${esc(b.l)}: ${esc(opts.fmt ? opts.fmt(b.v) : Math.round(b.v))}</title></rect>
        <text x="${x + bw * 0.35}" y="${H - 6}" class="axis" text-anchor="middle">${esc(b.l)}</text>`; }).join('')}
  </svg>`;
}

function download(name, text, mime = 'text/plain') {
  const share = Plugin('Share'), fs = Plugin('Filesystem');
  if (share && fs) {
    fs.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' })
      .then(r => share.share({ title: name, url: r.uri, dialogTitle: 'Save or share ' + name }))
      .catch(e => toast('Export failed: ' + (e.message || e)));
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

function readFileText(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); });
}

function resizeImage(file, max = 640) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.72));
    }; img.onerror = rej; img.src = r.result; };
    r.onerror = rej; r.readAsDataURL(file);
  });
}

// ---- Local error log: crashes and failed actions are recorded on the phone only, and can be exported
const ErrorLog = {
  KEY: 'gymapp.errors.v1', MAX: 100,
  list() { try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch (e) { return []; } },
  add(kind, msg, stack) {
    const l = this.list();
    l.push({ t: Date.now(), kind, msg: String(msg || 'Unknown error').slice(0, 500), stack: String(stack || '').slice(0, 2000), ver: typeof Updater !== 'undefined' ? Updater.bundleVersion : '' });
    while (l.length > this.MAX) l.shift();
    try { localStorage.setItem(this.KEY, JSON.stringify(l)); } catch (e) { }
  },
  clear() { try { localStorage.removeItem(this.KEY); } catch (e) { } },
  text() {
    const head = `Gym App error log\nApp ${typeof Updater !== 'undefined' ? Updater.bundleVersion + ' / native ' + (Updater.nativeVersion || 'browser') : ''}\n${typeof navigator !== 'undefined' ? navigator.userAgent : ''}\n\n`;
    return head + this.list().map(e => `[${new Date(e.t).toISOString()}] ${e.kind} (v${e.ver}): ${e.msg}\n${e.stack}`).join('\n\n');
  }
};
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('error', e => ErrorLog.add('error', e.message, e.error && e.error.stack));
  window.addEventListener('unhandledrejection', e => ErrorLog.add('promise', e.reason && (e.reason.message || e.reason), e.reason && e.reason.stack));
}
