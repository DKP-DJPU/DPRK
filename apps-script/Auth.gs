// ============================================================
// SI-RISK AVSEC — MODUL LOGIN (KODE OTP LEWAT EMAIL)
// ============================================================
// File script BARU di proyek Apps Script yang sama dengan Code.gs
// (Editor Apps Script → + → Script → beri nama "Auth"). Fungsi bantu
// (sheet_, objs_, rows_, appendObj_, json_, now_, id_, token_, hashToken_,
// audit_, sanitizeCell_, SHEETS, H) berasal dari Code.gs.
//
// Ringkas cara kerja:
//   1. Pengguna memasukkan email → server mengirim kode 6 digit (berlaku 10 menit).
//   2. Kode benar → server membuat sesi (12 jam, atau 30 hari bila
//      "ingat perangkat ini"). Browser menyimpan token sesi; server hanya
//      menyimpan HASH token di sheet AUTH_SESSION.
//   3. Setiap simpan DPRK membawa token sesi. authGate_ memeriksa sesi dan
//      hak akses: Admin = semua operator; Operator = hanya operatorIds miliknya.
//
// Daftar pengguna ada di sheet USER_ACCESS:
//   - Admin DKP didaftarkan langsung (jalankan setupLogin() sekali — email
//     pemilik script otomatis menjadi Admin).
//   - Operator mendaftar sendiri dari website → status "Menunggu" → admin
//     mengubah kolom status menjadi "Aktif" (atau "Ditolak").
//
// Saklar penguncian (Script Property AUTH_ENFORCE):
//   - Default OFF: login sudah bisa dipakai, tetapi simpan DPRK tanpa login
//     masih diterima (cara lama dengan kode DPRK). Gunakan masa ini untuk
//     mendaftarkan admin & menguji login.
//   - Jalankan aktifkanLoginWajib() → simpan DPRK WAJIB login.
//   - nonaktifkanLoginWajib() mengembalikan ke mode OFF.
// ============================================================

var AUTH_USER_SHEET = "USER_ACCESS";
var AUTH_SESSION_SHEET = "AUTH_SESSION";
var AUTH_USER_H = [
  "userId", "email", "nama", "jabatan", "instansi", "noHp", "peran", "operatorIds",
  "status", "catatan", "createdAt", "updatedAt", "approvedBy", "approvedAt", "lastLoginAt"
];
var AUTH_SESSION_H = ["sessionId", "tokenHash", "email", "createdAt", "expiresAt", "lastSeenAt", "status"];

var AUTH_OTP_TTL_SEC = 600;          // kode berlaku 10 menit
var AUTH_OTP_MAX_TRY = 5;            // salah 5x → kode hangus
var AUTH_RESEND_SEC = 60;            // jeda minimal kirim ulang kode
var AUTH_MAX_CODES_PER_HOUR = 5;     // per email
var AUTH_SESSION_HOURS = 12;
var AUTH_REMEMBER_DAYS = 30;
var AUTH_MAX_REGISTER_PER_HOUR = 30; // seluruh sistem, mencegah spam pendaftaran
var AUTH_MAX_CODES_GLOBAL_HOUR = 60; // seluruh sistem, mencegah kuota email habis
var AUTH_MAIL_RESERVE = 25;          // sisa kuota email yang dicadangkan khusus untuk kode login
var AUTH_ADMIN_NOTIFY_SEC = 3 * 3600; // notifikasi pendaftaran ke admin maks. 1x per 3 jam
// operatorId yang sah: huruf/angka/titik/garis bawah/tanda hubung saja (tanpa spasi, koma, titik koma)
var AUTH_OPID_RE = /^[A-Za-z0-9_.-]{1,80}$/;
var AUTH_PERAN = ["Admin", "Operator"];
var AUTH_WRITE_ACTIONS = ["create", "update", "renewDprk"];

// ---------------- Konfigurasi & setup (dijalankan manual dari editor) ----------------

function authEnforced_() {
  return PropertiesService.getScriptProperties().getProperty("AUTH_ENFORCE") === "true";
}

/** Jalankan SEKALI: membuat sheet USER_ACCESS & AUTH_SESSION, dan menjadikan
 *  email pemilik script sebagai Admin aktif. */
function setupLogin() {
  var s = sheet_(AUTH_USER_SHEET, AUTH_USER_H);
  sheet_(AUTH_SESSION_SHEET, AUTH_SESSION_H);
  var email = authNormEmail_(Session.getEffectiveUser().getEmail());
  if (!email) return "Email pemilik script tidak terbaca. Tambahkan baris Admin secara manual di sheet " + AUTH_USER_SHEET + ".";
  var f = authFindUser_(email);
  if (f) return "Sheet siap. " + email + " sudah terdaftar sebagai " + f.obj.peran + " (" + f.obj.status + ").";
  var n = now_();
  appendObj_(s, AUTH_USER_H, {
    userId: id_("USR"), email: email, nama: "Admin SI-RISK", jabatan: "", instansi: "Direktorat Keamanan Penerbangan",
    noHp: "", peran: "Admin", operatorIds: "", status: "Aktif", catatan: "Dibuat oleh setupLogin()",
    createdAt: n, updatedAt: n, approvedBy: "setupLogin", approvedAt: n, lastLoginAt: ""
  });
  return "Sheet siap. " + email + " ditambahkan sebagai Admin aktif.";
}

function aktifkanLoginWajib() {
  PropertiesService.getScriptProperties().setProperty("AUTH_ENFORCE", "true");
  return "Login WAJIB untuk menyimpan DPRK sekarang AKTIF.";
}

function nonaktifkanLoginWajib() {
  PropertiesService.getScriptProperties().setProperty("AUTH_ENFORCE", "false");
  return "Login wajib dimatikan. Simpan DPRK tanpa login kembali diterima (cara lama dengan kode DPRK).";
}

/** Opsional: pasang pemicu agar pengguna otomatis menerima email ketika
 *  admin mengubah status pendaftarannya di sheet USER_ACCESS. */
function pasangNotifikasiPersetujuan() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "authOnEdit") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("authOnEdit").forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
  return "Pemicu notifikasi persetujuan terpasang.";
}

function authOnEdit(e) {
  try {
    if (!e || !e.range) return;
    var s = e.range.getSheet();
    if (s.getName() !== AUTH_USER_SHEET || e.range.getRow() < 2) return;
    var h = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
    var cStatus = h.indexOf("status") + 1;
    if (e.range.getColumn() > cStatus || e.range.getLastColumn() < cStatus) return;
    for (var r = e.range.getRow(); r <= e.range.getLastRow(); r++) {
      var row = s.getRange(r, 1, 1, h.length).getValues()[0], o = {};
      h.forEach(function (k, i) { o[k] = row[i]; });
      var st = String(o.status || "").trim();
      if (st !== "Aktif" && st !== "Ditolak") continue;
      var n = now_(), me = authNormEmail_(Session.getActiveUser().getEmail());
      if (st === "Aktif" && !o.approvedAt) {
        var ca = h.indexOf("approvedAt") + 1, cb = h.indexOf("approvedBy") + 1;
        if (ca) s.getRange(r, ca).setValue(n);
        if (cb) s.getRange(r, cb).setValue(me || "admin");
      }
      authMail_(o.email, st === "Aktif"
        ? "Akun SI-RISK AVSEC Anda sudah aktif"
        : "Pendaftaran SI-RISK AVSEC tidak disetujui",
        st === "Aktif"
          ? "Halo " + (o.nama || "") + ",\n\nPendaftaran Anda di SI-RISK AVSEC telah disetujui. Silakan masuk dengan email ini; kode masuk akan dikirim setiap kali Anda login.\n\nDirektorat Keamanan Penerbangan"
          : "Halo " + (o.nama || "") + ",\n\nPendaftaran Anda di SI-RISK AVSEC belum dapat disetujui. Hubungi Direktorat Keamanan Penerbangan untuk informasi lebih lanjut.\n\nDirektorat Keamanan Penerbangan");
    }
  } catch (err) {
    Logger.log("authOnEdit: " + err);
  }
}

// ---------------- Utilitas ----------------

function authNormEmail_(e) { return String(e || "").trim().toLowerCase(); }
function authValidEmail_(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120; }
function authStr_(v, max) { return String(v === undefined || v === null ? "" : v).trim().slice(0, max || 200); }
function authCache_() { return CacheService.getScriptCache(); }
function authMask_(email) {
  var p = String(email).split("@");
  return p[0].slice(0, 2) + "***@" + (p[1] || "");
}
function authIds_(v) {
  return String(v || "").split(/[,;]/).map(function (x) { return x.trim(); }).filter(function (x) { return AUTH_OPID_RE.test(x); });
}
// Buang karakter kontrol & baris baru (mencegah teks palsu disisipkan ke email admin).
function authClean_(v, max) {
  return authStr_(String(v === undefined || v === null ? "" : v).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s{2,}/g, " "), max);
}
function authMail_(to, subject, body) {
  if (!to) return;
  MailApp.sendEmail({ to: String(to), subject: subject, body: body, name: "SI-RISK AVSEC" });
}

function authFindUser_(email) {
  email = authNormEmail_(email);
  if (!email) return null;
  var s = sheet_(AUTH_USER_SHEET, AUTH_USER_H), x = rows_(s), ce = x.h.indexOf("email");
  for (var i = 0; i < x.a.length; i++) {
    if (authNormEmail_(x.a[i][ce]) === email) {
      var o = {};
      x.h.forEach(function (k, j) { o[k] = x.a[i][j]; });
      return { row: i + 2, obj: o, h: x.h, sheet: s };
    }
  }
  return null;
}

function authSetUserField_(f, key, val) {
  var c = f.h.indexOf(key);
  if (c >= 0) f.sheet.getRange(f.row, c + 1).setValue(sanitizeCell_(val));
}

/** Objek pengguna yang aman dikirim ke browser & dipakai authGate_. */
function authPublicUser_(u) {
  var peran = AUTH_PERAN.indexOf(String(u.peran)) >= 0 ? String(u.peran) : "Operator";
  var ids = authIds_(u.operatorIds), ops = [];
  if (ids.length) {
    var byId = {};
    objs_(sheet_(SHEETS.OP, H.OP)).forEach(function (o) { byId[String(o.operatorId)] = o; });
    ids.forEach(function (id) {
      var o = byId[id];
      ops.push({ operatorId: id, namaOperator: o ? o.namaOperator : id, jenisOperator: o ? o.jenisOperator : "" });
    });
  }
  return {
    email: authNormEmail_(u.email), nama: String(u.nama || ""), jabatan: String(u.jabatan || ""),
    instansi: String(u.instansi || ""), peran: peran, operatorIds: ids, operators: ops
  };
}

function authCanAccess_(user, operatorId) {
  if (!user) return false;
  if (user.peran === "Admin") return true;
  return user.operatorIds.indexOf(String(operatorId || "")) >= 0;
}

// ---------------- Sesi ----------------

/** Mengembalikan pengguna (authPublicUser_) bila token sesi sah & akun aktif; selain itu null. */
function authSession_(token) {
  token = String(token || "").trim();
  if (!/^[A-F0-9]{40,80}$/.test(token)) return null;
  var h = hashToken_(token), cache = authCache_(), key = "sess:" + h, email = null, exp = 0;
  var c = cache.get(key);
  if (c) {
    try { c = JSON.parse(c); email = c.e; exp = c.x; } catch (x) { c = null; }
  }
  if (!c) {
    var s = sheet_(AUTH_SESSION_SHEET, AUTH_SESSION_H), x = rows_(s);
    var ch = x.h.indexOf("tokenHash"), ce = x.h.indexOf("email"), cx = x.h.indexOf("expiresAt"), cs = x.h.indexOf("status");
    for (var i = 0; i < x.a.length; i++) {
      if (String(x.a[i][ch]) === h && String(x.a[i][cs]) === "Aktif") {
        email = authNormEmail_(x.a[i][ce]);
        exp = new Date(x.a[i][cx]).getTime();
        break;
      }
    }
    if (!email) return null;
    cache.put(key, JSON.stringify({ e: email, x: exp }), 600);
  }
  if (!exp || exp < Date.now()) return null;
  var f = authFindUser_(email);
  if (!f || String(f.obj.status) !== "Aktif") return null;
  return authPublicUser_(f.obj);
}

function authCreateSession_(email, remember) {
  var token = token_() + token_(), n = new Date();
  var exp = new Date(n.getTime() + (remember ? AUTH_REMEMBER_DAYS * 86400000 : AUTH_SESSION_HOURS * 3600000));
  appendObj_(sheet_(AUTH_SESSION_SHEET, AUTH_SESSION_H), AUTH_SESSION_H, {
    sessionId: id_("SES"), tokenHash: hashToken_(token), email: email, createdAt: n.toISOString(),
    expiresAt: exp.toISOString(), lastSeenAt: n.toISOString(), status: "Aktif"
  });
  return { token: token, expiresAt: exp.toISOString() };
}

// ---------------- Gerbang untuk doPost (dipanggil dari Code.gs) ----------------

/**
 * Dipanggil di doPost SEBELUM action dijalankan.
 * - Selalu menghapus p._auth kiriman browser (tidak boleh dipalsukan).
 * - Untuk create/update/renewDprk: bila ada sesi sah → cek hak akses operator
 *   lalu isi p._auth. Bila tidak ada sesi → ditolak saat AUTH_ENFORCE aktif.
 * - Untuk createIncident: sesi opsional (menandai laporan dari akun terdaftar).
 * Mengembalikan respons json_ bila DITOLAK, atau null bila boleh lanjut.
 */
function authGate_(p, a) {
  delete p._auth;
  if (a === "createIncident") {
    var su = authSession_(p.sessionToken);
    if (su) p._auth = su;
    return null;
  }
  if (AUTH_WRITE_ACTIONS.indexOf(a) < 0) return null;
  if (a !== "update" && !AUTH_OPID_RE.test(String(p.operatorId || "")))
    return json_({ ok: false, code: "VALIDATION_ERROR", error: "ID operator tidak valid." });
  var u = authSession_(p.sessionToken);
  if (!u) {
    if (authEnforced_()) return json_({ ok: false, code: "AUTH_REQUIRED", error: "Sesi login tidak ditemukan atau sudah berakhir. Silakan masuk kembali untuk menyimpan DPRK." });
    return null;
  }
  var oid = String(p.operatorId || "");
  if (a === "update") {
    var f = findRiskById_(String(p.id || ""));
    if (!f) return json_({ ok: false, code: "NOT_FOUND", error: "Data risiko tidak ditemukan." });
    oid = String(f.obj.operatorId || "");
  }
  if (!authCanAccess_(u, oid)) return json_({ ok: false, code: "FORBIDDEN", error: "Akun Anda tidak berhak mengisi atau mengubah DPRK untuk operator ini." });
  p._auth = u;
  return null;
}

// ---------------- Endpoint ----------------

/** GET action=authConfig */
function authConfig_() {
  return json_({ ok: true, data: { enforce: authEnforced_() } });
}

/** POST action=auth* */
function authPost_(p, a) {
  if (a === "authRequestCode") return authRequestCode_(p);
  if (a === "authVerify") return authVerify_(p);
  if (a === "authMe") return authMe_(p);
  if (a === "authLogout") return authLogout_(p);
  if (a === "authRegister") return authRegister_(p);
  return json_({ ok: false, error: "Action login tidak dikenali." });
}

function authRequestCode_(p) {
  var email = authNormEmail_(p.email);
  if (!authValidEmail_(email)) return json_({ ok: false, code: "VALIDATION_ERROR", error: "Format email tidak valid." });
  var f = authFindUser_(email);
  if (!f) return json_({ ok: false, code: "NOT_REGISTERED", error: "Email ini belum terdaftar. Silakan daftar terlebih dahulu." });
  var st = String(f.obj.status || "");
  if (st === "Menunggu") return json_({ ok: false, code: "PENDING", error: "Pendaftaran Anda masih menunggu persetujuan admin." });
  if (st !== "Aktif") return json_({ ok: false, code: "INACTIVE", error: "Akun ini tidak aktif. Hubungi Direktorat Keamanan Penerbangan." });

  var cache = authCache_();
  if (cache.get("otp_wait:" + email)) return json_({ ok: false, code: "TOO_SOON", error: "Kode baru saja dikirim. Tunggu sekitar 1 menit sebelum meminta kode lagi." });
  var cnt = Number(cache.get("otp_cnt:" + email) || 0);
  if (cnt >= AUTH_MAX_CODES_PER_HOUR) return json_({ ok: false, code: "RATE_LIMIT", error: "Terlalu banyak permintaan kode. Coba lagi dalam 1 jam." });
  var gcnt = Number(cache.get("otp_gcnt") || 0);
  if (gcnt >= AUTH_MAX_CODES_GLOBAL_HOUR) return json_({ ok: false, code: "RATE_LIMIT", error: "Server sedang menerima terlalu banyak permintaan kode. Coba lagi beberapa saat lagi." });
  if (MailApp.getRemainingDailyQuota() < 2) return json_({ ok: false, code: "MAIL_QUOTA", error: "Kuota email harian server habis. Coba lagi besok atau hubungi admin." });

  var code = ("000000" + (parseInt(Utilities.getUuid().replace(/-/g, "").slice(0, 12), 16) % 1000000)).slice(-6);
  var exp = Date.now() + AUTH_OTP_TTL_SEC * 1000;
  cache.put("otp:" + email, JSON.stringify({ h: hashToken_(email + ":" + code), t: 0, x: exp }), AUTH_OTP_TTL_SEC);
  cache.put("otp_wait:" + email, "1", AUTH_RESEND_SEC);
  cache.put("otp_cnt:" + email, String(cnt + 1), 3600);
  cache.put("otp_gcnt", String(gcnt + 1), 3600);
  authMail_(email, "Kode masuk SI-RISK AVSEC: " + code,
    "Kode masuk SI-RISK AVSEC Anda:\n\n    " + code + "\n\nKode berlaku 10 menit dan hanya dapat dipakai sekali.\n" +
    "Jangan berikan kode ini kepada siapa pun, termasuk yang mengaku petugas.\n\n" +
    "Jika Anda tidak sedang masuk ke SI-RISK AVSEC, abaikan email ini.\n\nDirektorat Keamanan Penerbangan");
  return json_({ ok: true, data: { sentTo: authMask_(email), expiresInSec: AUTH_OTP_TTL_SEC } });
}

function authVerify_(p) {
  var email = authNormEmail_(p.email), code = String(p.code || "").replace(/\D/g, "");
  if (!authValidEmail_(email) || code.length !== 6) return json_({ ok: false, code: "VALIDATION_ERROR", error: "Masukkan 6 digit kode dari email." });
  var cache = authCache_(), key = "otp:" + email, raw = cache.get(key), e = null;
  try { e = raw ? JSON.parse(raw) : null; } catch (x) { e = null; }
  if (!e || e.x < Date.now()) return json_({ ok: false, code: "CODE_EXPIRED", error: "Kode sudah kedaluwarsa. Minta kode baru." });
  if (e.h !== hashToken_(email + ":" + code)) {
    e.t = (e.t || 0) + 1;
    if (e.t >= AUTH_OTP_MAX_TRY) {
      cache.remove(key);
      return json_({ ok: false, code: "CODE_LOCKED", error: "Kode salah terlalu sering. Minta kode baru." });
    }
    cache.put(key, JSON.stringify(e), Math.max(1, Math.floor((e.x - Date.now()) / 1000)));
    return json_({ ok: false, code: "CODE_WRONG", error: "Kode salah. Sisa percobaan: " + (AUTH_OTP_MAX_TRY - e.t) + "." });
  }
  cache.remove(key);
  var f = authFindUser_(email);
  if (!f || String(f.obj.status) !== "Aktif") return json_({ ok: false, code: "INACTIVE", error: "Akun ini tidak aktif." });
  var ses = authCreateSession_(email, !!p.remember);
  authSetUserField_(f, "lastLoginAt", now_());
  var user = authPublicUser_(f.obj);
  audit_({ _auth: user }, "AUTH", email, "LOGIN", {}, { remember: !!p.remember, expiresAt: ses.expiresAt }, p.requestId, "Login dengan kode email");
  return json_({ ok: true, data: { token: ses.token, expiresAt: ses.expiresAt, user: user, enforce: authEnforced_() } });
}

function authMe_(p) {
  var u = authSession_(p.sessionToken);
  if (!u) return json_({ ok: false, code: "NO_SESSION", error: "Sesi tidak ditemukan atau sudah berakhir.", enforce: authEnforced_() });
  return json_({ ok: true, data: { user: u, enforce: authEnforced_() } });
}

function authLogout_(p) {
  var token = String(p.sessionToken || "").trim();
  if (!token) return json_({ ok: true });
  var h = hashToken_(token), s = sheet_(AUTH_SESSION_SHEET, AUTH_SESSION_H), x = rows_(s);
  var ch = x.h.indexOf("tokenHash"), cs = x.h.indexOf("status");
  for (var i = 0; i < x.a.length; i++) {
    if (String(x.a[i][ch]) === h) { s.getRange(i + 2, cs + 1).setValue("Keluar"); break; }
  }
  authCache_().remove("sess:" + h);
  return json_({ ok: true });
}

function authRegister_(p) {
  if (p.website) return json_({ ok: true, data: { status: "Menunggu" } }); // honeypot bot
  var email = authNormEmail_(p.email), nama = authClean_(p.nama, 120), jabatan = authClean_(p.jabatan, 120);
  var noHp = authClean_(p.noHp, 30).replace(/[^0-9+()\- ]/g, ""), oid = authStr_(p.operatorId, 80), e = [];
  if (!nama) e.push("Nama wajib diisi");
  if (!authValidEmail_(email)) e.push("Format email tidak valid");
  if (!jabatan) e.push("Jabatan wajib diisi");
  if (!oid || !AUTH_OPID_RE.test(oid)) e.push("Pilih operator yang Anda wakili");
  if (e.length) return json_({ ok: false, code: "VALIDATION_ERROR", error: e.join("; ") });

  var op = objs_(sheet_(SHEETS.OP, H.OP)).filter(function (o) {
    return String(o.operatorId) === oid && String(o.aktif).toLowerCase() !== "false";
  })[0];
  if (!op) return json_({ ok: false, code: "VALIDATION_ERROR", error: "Operator tidak ditemukan di master." });

  var f = authFindUser_(email);
  if (f) {
    var st = String(f.obj.status || "");
    if (st === "Aktif") return json_({ ok: false, code: "ALREADY_ACTIVE", error: "Email ini sudah terdaftar dan aktif. Silakan masuk." });
    if (st === "Menunggu") return json_({ ok: false, code: "PENDING", error: "Email ini sudah mendaftar dan sedang menunggu persetujuan admin." });
    return json_({ ok: false, code: "INACTIVE", error: "Email ini pernah didaftarkan namun tidak aktif. Hubungi Direktorat Keamanan Penerbangan." });
  }
  var cache = authCache_(), cnt = Number(cache.get("reg_cnt") || 0);
  if (cnt >= AUTH_MAX_REGISTER_PER_HOUR) return json_({ ok: false, code: "RATE_LIMIT", error: "Terlalu banyak pendaftaran saat ini. Coba lagi nanti." });
  cache.put("reg_cnt", String(cnt + 1), 3600);

  var n = now_();
  appendObj_(sheet_(AUTH_USER_SHEET, AUTH_USER_H), AUTH_USER_H, {
    userId: id_("USR"), email: email, nama: nama, jabatan: jabatan, instansi: op.namaOperator, noHp: noHp,
    peran: "Operator", operatorIds: oid, status: "Menunggu", catatan: "", createdAt: n, updatedAt: n,
    approvedBy: "", approvedAt: "", lastLoginAt: ""
  });
  // Beri tahu admin — maks. 1x per 3 jam (berisi jumlah pendaftaran yang menunggu),
  // dan hanya bila kuota email masih di atas cadangan untuk kode login.
  try {
    if (!cache.get("reg_notify") && MailApp.getRemainingDailyQuota() > AUTH_MAIL_RESERVE + 3) {
      var all = objs_(sheet_(AUTH_USER_SHEET, AUTH_USER_H));
      var pending = all.filter(function (u) { return String(u.status) === "Menunggu"; }).length;
      var admins = all.filter(function (u) { return String(u.peran) === "Admin" && String(u.status) === "Aktif"; }).slice(0, 3);
      admins.forEach(function (a) {
        authMail_(a.email, "SI-RISK AVSEC: " + pending + " pendaftaran menunggu persetujuan",
          "Ada " + pending + " pendaftaran akun operator yang menunggu persetujuan di sheet " + AUTH_USER_SHEET + ".\n\n" +
          "Periksa setiap baris berstatus \"Menunggu\": pastikan nama, jabatan, dan email benar mewakili operator yang dipilih " +
          "(kolom operatorIds), lalu ubah status menjadi \"Aktif\" atau \"Ditolak\".\n\n" +
          "Email ini dikirim paling banyak sekali setiap 3 jam.");
      });
      if (admins.length) cache.put("reg_notify", "1", AUTH_ADMIN_NOTIFY_SEC);
    }
  } catch (x) {
    Logger.log("Notifikasi admin gagal: " + x);
  }
  return json_({ ok: true, data: { status: "Menunggu" } });
}
