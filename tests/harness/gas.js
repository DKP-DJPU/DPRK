// Menjalankan Code.gs + Auth.gs + Pelaporan.gs ASLI di Node dengan tiruan
// layanan Apps Script (Spreadsheet, Cache, Properties, Mail, Lock, dst).
const fs = require('fs'), vm = require('vm'), crypto = require('crypto');

function makeSheet(name, ssRef) {
  const data = []; // baris 1 = header
  const width = () => data.reduce((m, r) => Math.max(m, r.length), 0);
  // Tiru Sheets: teks diawali apostrof disimpan sebagai teks; teks berbentuk angka berubah jadi Number (nol di depan hilang).
  const norm = v => (typeof v === 'string' && v[0] === "'" ? v.slice(1) : (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v));
  // Ukuran grid seperti Google Sheets: sheet baru 1000 baris × 26 kolom; getRange di luar grid = galat,
  // appendRow memperluas grid otomatis. (V3.37: produksi RISK_ASSESSMENT tepat 35 kolom.)
  let maxRows = 1000, maxCols = 26;
  const OUT = 'Exception: The coordinates of the range are outside the dimensions of the sheet.';
  const sh = {
    _data: data,
    getMaxRows: () => maxRows, getMaxColumns: () => maxCols,
    _setGrid: (r, c) => { if (r != null) maxRows = r; if (c != null) maxCols = c; },
    insertRowsAfter: (after, n) => { maxRows += n; return sh; },
    insertColumnsAfter: (after, n) => { maxCols += n; return sh; },
    getName: () => name,
    setName: n => { if (ssRef) { if (ssRef._sheets[n] && ssRef._sheets[n] !== sh) throw new Error('Sheet ' + n + ' sudah ada'); delete ssRef._sheets[name]; ssRef._sheets[n] = sh; } name = n; return sh; },
    copyTo: dest => { const c = dest.insertSheet('Salinan dari ' + name); data.forEach(r => c._data.push(r.slice())); return c; },
    getLastRow: () => { let n = data.length; while (n > 0 && data[n - 1].every(v => v === '' || v == null)) n--; return n; },
    getLastColumn: () => width(),
    appendRow: arr => { data.push(arr.map(norm)); if (data.length > maxRows) maxRows = data.length; if (arr.length > maxCols) maxCols = arr.length; },
    getRange: (r, c, nr = 1, nc = 1) => { if (r < 1 || c < 1 || nr < 1 || nc < 1 || r + nr - 1 > maxRows || c + nc - 1 > maxCols) throw new Error(OUT + ' (' + name + ' r' + r + '+' + nr + ' c' + c + '+' + nc + ' grid ' + maxRows + 'x' + maxCols + ')'); return ({
      getSheet: () => sh, getRow: () => r, getColumn: () => c, getLastRow: () => r + nr - 1, getLastColumn: () => c + nc - 1,
      getValues: () => { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (data[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); } return out; },
      getValue: () => { const v = (data[r - 1] || [])[c - 1]; return v === undefined ? '' : v; },
      setValues: vals => { vals.forEach((row, i) => { while (data.length < r + i) data.push([]); row.forEach((v, j) => { data[r - 1 + i][c - 1 + j] = norm(v); }); }); },
      setValue: v => { while (data.length < r) data.push([]); data[r - 1][c - 1] = norm(v); },
      clearContent: () => {},
    }); },
  };
  return sh;
}

function makeEnv(opts = {}) {
  const sheets = {}, cache = new Map(), props = {}, mails = [], triggers = [];
  // Drive tiruan: berkas & folder di memori.
  const drive = { files: {}, folders: {}, seq: 0 };
  const makeSS = (sh, id) => {
    const o = {
      _sheets: sh, _id: id,
      getId: () => id,
      getSheetByName: n => sh[n] || null,
      getSheets: () => Object.values(sh),
      insertSheet: n => (sh[n] = makeSheet(n, o)),
      deleteSheet: s => { if (Object.keys(sh).length <= 1) throw new Error('Tidak bisa menghapus satu-satunya sheet'); delete sh[s.getName()]; },
    };
    return o;
  };
  const makeFile = (name, mime, parent) => {
    const id = 'F' + ++drive.seq, f = { _id: id, _name: name, _mime: mime, _parent: parent, _trashed: false, _created: new Date(nowMs()),
      getId: () => id, getName: () => f._name, getMimeType: () => f._mime, getDateCreated: () => f._created, isTrashed: () => f._trashed,
      setTrashed: t => { f._trashed = !!t; return f; }, moveTo: folder => { f._parent = folder.getId(); return f; } };
    return (drive.files[id] = f);
  };
  const makeFolder = name => {
    const id = 'D' + ++drive.seq, d = { _id: id, _name: name, _trashed: false, getId: () => id, getName: () => name, isTrashed: () => d._trashed, setTrashed: t => { d._trashed = !!t; },
      getFiles: () => { const l = Object.values(drive.files).filter(f => f._parent === id && !f._trashed); let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; } };
    return (drive.folders[id] = d);
  };
  const iter = l => { let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; };
  let clock = opts.now || null; // ms; null = waktu nyata
  const nowMs = () => clock == null ? Date.now() : clock;
  const ss = makeSS(sheets, 'SS-UTAMA');
  ss.deleteSheet = s => { delete sheets[s.getName()]; };
  const created = {}; // spreadsheet baru (SpreadsheetApp.create) per id berkas
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, getActive: () => ss,
      create: name => { if (opts.failCreate) throw new Error(opts.failCreate); const f = makeFile(name, 'application/vnd.google-apps.spreadsheet', 'ROOT'); const x = makeSS({}, f._id); x.insertSheet('Sheet1'); return (created[f._id] = x); } },
    MimeType: { GOOGLE_SHEETS: 'application/vnd.google-apps.spreadsheet' },
    DriveApp: {
      getFolderById: id => { const d = drive.folders[id]; if (!d) throw new Error('No item with the given ID'); return d; },
      getFoldersByName: n => iter(Object.values(drive.folders).filter(d => d._name === n && !d._trashed)),
      createFolder: n => makeFolder(n),
      getFileById: id => { const f = drive.files[id]; if (!f) throw new Error('No item with the given ID'); return f; },
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ _t: t, setMimeType() { return this; }, getContent() { return this._t; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => (opts.lockBusy ? false : true), releaseLock() {} }) },
    Logger: { log: m => { (opts.logs||[]).push(String(m)); if (opts.verbose) console.log('[Logger]', m); } },
    Session: { getScriptTimeZone: () => 'Asia/Jakarta', getEffectiveUser: () => ({ getEmail: () => opts.owner || 'owner@dkp.go.id' }), getActiveUser: () => ({ getEmail: () => opts.owner || 'owner@dkp.go.id' }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({
      get: k => { const e = cache.get(k); if (!e) return null; if (e.x < nowMs()) { cache.delete(k); return null; } return e.v; },
      put: (k, v, ttl) => { if (Buffer.byteLength(String(v)) > 100000) throw new Error('Argument too large: value'); cache.set(k, { v: String(v), x: nowMs() + (ttl || 600) * 1000 }); },
      putAll: (o, ttl) => { Object.keys(o).forEach(k => { if (Buffer.byteLength(String(o[k])) > 100000) throw new Error('Argument too large: value'); }); Object.keys(o).forEach(k => cache.set(k, { v: String(o[k]), x: nowMs() + (ttl || 600) * 1000 })); },
      getAll: ks => { const r = {}; ks.forEach(k => { const e = cache.get(k); if (e && e.x >= nowMs()) r[k] = e.v; }); return r; },
      remove: k => { cache.delete(k); },
      removeAll: ks => ks.forEach(k => cache.delete(k)),
    }) },
    MailApp: { sendEmail: (o, subject, body) => { mails.push(typeof o === 'string' ? { to: o, subject, body } : o); }, getRemainingDailyQuota: () => (opts.quota == null ? 100 : opts.quota) },
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      newTrigger: fn => { const t = { fn, kind: '', hour: null, getHandlerFunction: () => fn }; const b = { forSpreadsheet() { t.kind = 'spreadsheet'; return b; }, onEdit() { t.kind = 'onEdit'; return b; }, timeBased() { t.kind = 'time'; return b; }, everyDays(n) { t.days = n; return b; }, atHour(h) { t.hour = h; return b; }, create() { triggers.push(t); return t; } }; return b; },
      deleteTrigger: t => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(String(s), 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
      formatDate: (d, tz, f) => { const j = new Date(d.getTime() + 7 * 3600e3); const p = n => String(n).padStart(2, '0'); return f.replace('yyyy', j.getUTCFullYear()).replace('MM', p(j.getUTCMonth() + 1)).replace('dd', p(j.getUTCDate())).replace('HH', p(j.getUTCHours())).replace('mm', p(j.getUTCMinutes())); },
    },
  };
  vm.createContext(ctx);
  // Date & Date.now mengikuti jam tiruan agar kedaluwarsa bisa diuji.
  vm.runInContext(`(function(){var RD=Date;function FD(){if(!(this instanceof FD))return RD();var a=[].slice.call(arguments);if(!a.length&&__now()!=null)return new RD(__now());return new (Function.prototype.bind.apply(RD,[null].concat(a)))();}FD.prototype=RD.prototype;FD.now=function(){return __now()!=null?__now():RD.now()};FD.UTC=RD.UTC;FD.parse=RD.parse;Date=FD;})();`, Object.assign(ctx, { __now: () => clock }));
  const files = opts.files || [];
  files.forEach(f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }));
  const env = {
    ctx, sheets, mails, props, cache, triggers, drive, created,
    setNow: ms => { clock = ms; }, advance: ms => { clock = (clock == null ? Date.now() : clock) + ms; },
    post: p => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(p) } }).getContent()),
    get: p => JSON.parse(ctx.doGet({ parameter: p }).getContent()),
    rows: name => { const s = sheets[name]; if (!s) return []; const [h, ...r] = s._data; return r.filter(x => x.some(v => v !== '' && v != null)).map(x => Object.fromEntries(h.map((k, i) => [k, x[i] === undefined ? '' : x[i]]))); },
    seed: (name, headersVar, objs) => { const h = vm.runInContext(headersVar, ctx); const s = ctx.sheet_(name, h); objs.forEach(o => s.appendRow(h.map(k => (o[k] == null ? '' : o[k])))); },
    lastCode: to => { const m = mails.filter(x => x.to === to && /Kode masuk/.test(x.subject)).pop(); return m ? m.subject.match(/(\d{6})$/)[1] : null; },
  };
  return env;
}
module.exports = { makeEnv };
