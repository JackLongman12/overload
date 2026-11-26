// Import from other apps (Hevy, Strong, FitNotes, generic CSV, GPX, TCX, Overload backup)
// and export to portable formats (JSON backup, Strong CSV, Hevy CSV).
'use strict';

const IO = {
  parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    const head = (rows.shift() || []).map(h => h.trim().toLowerCase());
    return { head, rows: rows.filter(r => r.some(x => x.trim() !== '')) };
  },

  detect(head) {
    const h = head.join('|');
    if (h.includes('exercise_title') && h.includes('start_time')) return 'Hevy';
    if (h.includes('exercise name') && h.includes('set order')) return 'Strong';
    if (h.includes('exercise') && h.includes('category') && (h.includes('weight (kgs)') || h.includes('weight (lbs)'))) return 'FitNotes';
    if (h.includes('exercise')) return 'Generic CSV';
    return null;
  },

  col(head, names) { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; },

  parseDate(s) {
    if (!s) return NaN;
    s = s.trim();
    const mon = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    let m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4}),?\s+(\d{1,2}):(\d{2})/); // Hevy: 26 Nov 2026, 18:30
    if (m) return new Date(+m[3], mon[m[2].toLowerCase()], +m[1], +m[4], +m[5]).getTime();
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/); // Strong / FitNotes / ISO
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0)).getTime();
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return new Date(+m[3], +m[1] - 1, +m[2], 12).getTime();
    return Date.parse(s);
  },

  parseStrongDuration(s) { // "1h 5m", "45m", "3600"
    if (!s) return 0; if (/^\d+$/.test(s)) return +s;
    let t = 0; const h = s.match(/(\d+)\s*h/), m = s.match(/(\d+)\s*m/), sec = s.match(/(\d+)\s*s/);
    if (h) t += +h[1] * 3600; if (m) t += +m[1] * 60; if (sec) t += +sec[1]; return t;
  },

  norm(s) { return s.toLowerCase().replace(/\(.*?\)/g, m => ' ' + m.slice(1, -1) + ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|with)\b/g, '').trim(); },

  matchExercise(name, sample) {
    const n = this.norm(name);
    const all = Store.allExercises();
    let hit = all.find(e => this.norm(e.name) === n);
    if (hit) return hit;
    const toks = new Set(n.split(' ').filter(Boolean));
    let best = null, bestScore = 0;
    for (const e of all) {
      const et = new Set(this.norm(e.name).split(' ').filter(Boolean));
      const inter = [...toks].filter(t => et.has(t)).length;
      const score = inter / new Set([...toks, ...et]).size;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    if (best && bestScore >= 0.75) return best;
    // "Deadlift" -> "Deadlift (Barbell)": every imported word is in the library name; prefer fewest extra words, then barbell
    const sub = all.map(e => ({ e, t: this.norm(e.name).split(' ').filter(Boolean) }))
      .filter(x => [...toks].every(t => x.t.includes(t)))
      .sort((a, b) => (a.t.length - b.t.length) || ((b.e.equipment === 'barbell') - (a.e.equipment === 'barbell')));
    if (sub.length && sub[0].t.length - toks.size <= 2) return sub[0].e;
    const type = sample.d ? 'dist' : (sample.t && !sample.r ? 'dur' : (sample.w ? 'wr' : 'bw'));
    return Store.addCustomExercise({ name: name.trim(), muscle: type === 'dist' ? 'cardio' : 'full_body', equipment: 'other', type, discipline: type === 'dist' ? 'cardio' : 'strength', imported: true });
  },

  // Returns {source, workouts:[...], exercisesCreated}
  fromCSV(text, fileUnit) {
    const { head, rows } = this.parseCSV(text);
    const source = this.detect(head);
    if (!source) throw new Error('This CSV has no "exercise" column, so it isn\'t a workout export.');
    const c = n => this.col(head, n);
    const iDate = c(['start_time', 'date', 'workout date']), iEnd = c(['end_time']);
    const iName = c(['title', 'workout name', 'workout']);
    const iEx = c(['exercise_title', 'exercise name', 'exercise']);
    const iNotes = c(['exercise_notes', 'notes']), iWNotes = c(['description', 'workout notes']);
    const iType = c(['set_type', 'set order']);
    const iRpe = c(['rpe']);
    const iReps = c(['reps']);
    const iDurW = c(['duration']);
    const iSec = c(['duration_seconds', 'seconds', 'time']);
    const wCols = [['weight_kg', 'kg'], ['weight_lbs', 'lb'], ['weight (kgs)', 'kg'], ['weight (lbs)', 'lb'], ['weight', fileUnit]];
    let iW = -1, wUnit = fileUnit;
    for (const [n, u] of wCols) { const i = head.indexOf(n); if (i >= 0) { iW = i; wUnit = u; break; } }
    const dCols = [['distance_km', 'km'], ['distance_miles', 'mi'], ['distance', 'km']];
    let iD = -1, dUnit = 'km';
    for (const [n, u] of dCols) { const i = head.indexOf(n); if (i >= 0) { iD = i; dUnit = u; break; } }
    const iDUnit = c(['distance unit']);
    const myUnit = Store.data.settings.unit;
    const conv = w => wUnit === myUnit ? w : (myUnit === 'kg' ? w * 0.45359237 : w / 0.45359237);

    const map = new Map(); const before = Store.data.customExercises.length;
    for (const r of rows) {
      const g = i => i >= 0 ? (r[i] || '').trim() : '';
      const exName = g(iEx); if (!exName) continue;
      const typeRaw = g(iType).toLowerCase();
      if (typeRaw.includes('rest')) continue;
      const start = this.parseDate(g(iDate)); if (isNaN(start)) continue;
      const wName = g(iName) || (source === 'FitNotes' ? 'Workout' : 'Imported workout');
      const key = start + '|' + wName;
      if (!map.has(key)) {
        let end = iEnd >= 0 ? this.parseDate(g(iEnd)) : NaN;
        if (isNaN(end) && iDurW >= 0) end = start + this.parseStrongDuration(g(iDurW)) * 1000;
        map.set(key, { id: uid(), name: wName, start, end: isNaN(end) || end <= start ? start + 3600e3 : end, notes: g(iWNotes), imported: source, exercises: [], _ex: new Map() });
      }
      const w = map.get(key);
      let d = num(g(iD)); const du = (g(iDUnit) || dUnit).toLowerCase();
      if (du.startsWith('mi')) d *= 1.609344; else if (du === 'm') d /= 1000;
      let secs = g(iSec); secs = secs.includes(':') ? parseDur(secs) : num(secs);
      const set = {
        type: typeRaw === 'warmup' || typeRaw === 'w' ? 'W' : typeRaw === 'dropset' || typeRaw === 'd' ? 'D' : typeRaw === 'failure' || typeRaw === 'f' ? 'F' : 'N',
        w: iW >= 0 && g(iW) ? round1(conv(num(g(iW)))) : '', r: num(g(iReps)) || '', rpe: num(g(iRpe)) || '',
        t: secs || '', d: d ? round1(d * 100) / 100 : '', done: true
      };
      if (!w._ex.has(exName)) { const ex = this.matchExercise(exName, set); const e = { exId: ex.id, notes: g(iNotes), sets: [] }; w._ex.set(exName, e); w.exercises.push(e); }
      w._ex.get(exName).sets.push(set);
    }
    const workouts = [...map.values()].map(w => { delete w._ex; return w; });
    return { source, workouts, exercisesCreated: Store.data.customExercises.length - before };
  },

  haversine(a, b) {
    const R = 6371, rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  },

  sportToEx(s) {
    s = (s || '').toLowerCase();
    if (/bik|cycl|ride/.test(s)) return 'cycling';
    if (/swim/.test(s)) return 'swimming';
    if (/walk/.test(s)) return 'walking';
    if (/hik/.test(s)) return 'hiking';
    if (/row/.test(s)) return 'rowing_machine';
    return 'running';
  },

  fromGPX(text, filename) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const pts = [...doc.getElementsByTagName('trkpt')].map(p => ({ lat: +p.getAttribute('lat'), lon: +p.getAttribute('lon'), time: Date.parse((p.getElementsByTagName('time')[0] || {}).textContent) }));
    if (pts.length < 2) throw new Error('No GPS track points found in this GPX file.');
    let km = 0; for (let i = 1; i < pts.length; i++) km += this.haversine(pts[i - 1], pts[i]);
    const t0 = pts.find(p => !isNaN(p.time)), t1 = [...pts].reverse().find(p => !isNaN(p.time));
    const start = t0 ? t0.time : Date.now(), secs = t0 && t1 ? (t1.time - t0.time) / 1000 : 0;
    const typeTag = (doc.getElementsByTagName('type')[0] || {}).textContent || filename;
    const name = (doc.getElementsByTagName('name')[0] || {}).textContent || 'GPS activity';
    const exId = this.sportToEx(typeTag + ' ' + name);
    return { source: 'GPX', exercisesCreated: 0, workouts: [{ id: uid(), name: name.trim(), start, end: start + secs * 1000, imported: 'GPX', notes: '', exercises: [{ exId, sets: [{ type: 'N', d: round1(km * 100) / 100, t: Math.round(secs), done: true }] }] }] };
  },

  fromTCX(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const acts = [...doc.getElementsByTagName('Activity')];
    if (!acts.length) throw new Error('No activities found in this TCX file.');
    const workouts = acts.map(a => {
      const laps = [...a.getElementsByTagName('Lap')];
      const secs = laps.reduce((s, l) => s + num((l.getElementsByTagName('TotalTimeSeconds')[0] || {}).textContent), 0);
      const m = laps.reduce((s, l) => { const d = [...l.children].find(c => c.tagName === 'DistanceMeters'); return s + num(d && d.textContent); }, 0);
      const hrs = [...a.getElementsByTagName('HeartRateBpm')].map(h => num(h.textContent)).filter(Boolean);
      const start = Date.parse((laps[0] && laps[0].getAttribute('StartTime')) || (a.getElementsByTagName('Id')[0] || {}).textContent) || Date.now();
      const sport = a.getAttribute('Sport') || '';
      return { id: uid(), name: (sport || 'Activity') + ' (imported)', start, end: start + secs * 1000, imported: 'TCX',
        notes: hrs.length ? `Avg HR ${Math.round(hrs.reduce((x, y) => x + y, 0) / hrs.length)} bpm, max ${Math.max(...hrs)} bpm` : '',
        exercises: [{ exId: this.sportToEx(sport), sets: [{ type: 'N', d: round1(m / 10) / 100, t: Math.round(secs), done: true }] }] };
    });
    return { source: 'TCX', workouts, exercisesCreated: 0 };
  },

  fromBackup(text) {
    const j = JSON.parse(text);
    if (j.app !== 'overload' || !j.data) throw new Error('This JSON file isn\'t an Overload backup.');
    return { source: 'Overload backup', backup: j, workouts: j.data.workouts || [], exercisesCreated: 0 };
  },

  async parseFile(file, fileUnit) {
    const text = await readFileText(file);
    const name = file.name.toLowerCase();
    if (name.endsWith('.gpx') || text.includes('<gpx')) return this.fromGPX(text, name);
    if (name.endsWith('.tcx') || text.includes('TrainingCenterDatabase')) return this.fromTCX(text);
    if (name.endsWith('.json')) return this.fromBackup(text);
    return this.fromCSV(text, fileUnit);
  },

  // Merge into store, skipping duplicates (same start minute and same name)
  commit(result) {
    const d = Store.data;
    if (result.backup) {
      const b = result.backup.data;
      const mergeBy = (key) => { const ids = new Set(d[key].map(x => x.id)); (b[key] || []).forEach(x => { if (!ids.has(x.id)) d[key].push(x); }); };
      ['workouts', 'routines', 'measurements', 'checkins', 'customExercises'].forEach(mergeBy);
      if (Array.isArray(result.backup.photos)) { const ids = new Set(Store.photos.map(p => p.id)); result.backup.photos.forEach(p => { if (!ids.has(p.id)) Store.photos.push(p); }); Store.savePhotos(); }
      Store.save(true); return (b.workouts || []).length;
    }
    const seen = new Set(d.workouts.map(w => Math.round(w.start / 60000) + '|' + w.name));
    let added = 0;
    for (const w of result.workouts) {
      const k = Math.round(w.start / 60000) + '|' + w.name;
      if (seen.has(k)) continue; seen.add(k); d.workouts.push(w); added++;
    }
    Store.save(true); return added;
  },

  // ---- Export
  csvRow(arr) { return arr.map(v => { v = v == null ? '' : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); },
  pad2: n => String(n).padStart(2, '0'),

  toStrongCSV() {
    const L = [this.csvRow(['Date', 'Workout Name', 'Duration', 'Exercise Name', 'Set Order', 'Weight', 'Reps', 'Distance', 'Seconds', 'Notes', 'Workout Notes', 'RPE'])];
    for (const w of Store.workoutsSorted().reverse()) {
      const dt = new Date(w.start);
      const date = `${dt.getFullYear()}-${this.pad2(dt.getMonth() + 1)}-${this.pad2(dt.getDate())} ${this.pad2(dt.getHours())}:${this.pad2(dt.getMinutes())}:00`;
      const mins = Math.round(((w.end || w.start) - w.start) / 60000);
      const dur = (mins >= 60 ? Math.floor(mins / 60) + 'h ' : '') + (mins % 60) + 'm';
      for (const e of w.exercises) {
        let n = 0;
        for (const s of e.sets.filter(s => s.done)) {
          const order = s.type === 'W' ? 'W' : s.type === 'D' ? 'D' : s.type === 'F' ? 'F' : ++n;
          L.push(this.csvRow([date, w.name, dur, Store.ex(e.exId).name, order, s.w, s.r, s.d, s.t, e.notes || '', w.notes || '', s.rpe]));
        }
      }
    }
    return L.join('\n');
  },

  toHevyCSV() {
    const unit = Store.data.settings.unit;
    const L = [this.csvRow(['title', 'start_time', 'end_time', 'description', 'exercise_title', 'superset_id', 'exercise_notes', 'set_index', 'set_type', unit === 'kg' ? 'weight_kg' : 'weight_lbs', 'reps', 'distance_km', 'duration_seconds', 'rpe'])];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const f = ts => { const d = new Date(ts); return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${this.pad2(d.getHours())}:${this.pad2(d.getMinutes())}`; };
    const types = { W: 'warmup', N: 'normal', D: 'dropset', F: 'failure' };
    for (const w of Store.workoutsSorted().reverse()) for (const e of w.exercises) e.sets.filter(s => s.done).forEach((s, i) =>
      L.push(this.csvRow([w.name, f(w.start), f(w.end || w.start), w.notes || '', Store.ex(e.exId).name, '', e.notes || '', i, types[s.type] || 'normal', s.w, s.r, s.d, s.t, s.rpe])));
    return L.join('\n');
  }
};
