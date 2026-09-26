// ============================================================
// SI-RISK AVSEC — MODUL SISTEM PELAPORAN KEAMANAN PENERBANGAN
// ============================================================
// File ini ditambahkan sebagai file script BARU di proyek Apps Script yang
// sama dengan Code.gs (Editor Apps Script → + → Script → beri nama
// "Pelaporan"). Semua fungsi bantu (sheet_, objs_, appendObj_, json_, id_,
// now_, audit_, cached_, dll.) berasal dari Code.gs.
//
// Wajib: tambahkan 2 baris di Code.gs (lihat apps-script/PERUBAHAN-Code.gs.md):
//   doGet  : if(a==="incidents")return json_({ok:true,data:cached_(INC_CACHE_KEY,incidentsPublic_)});
//   doPost : if(a==="createIncident")return createIncident_(p);
//
// Kebijakan data:
//   - Semua kejadian dicatat, diberi penanda "lingkup" (AVSEC / Non-AVSEC /
//     Perlu Klasifikasi) berdasarkan jenis kejadian.
//   - Endpoint publik action=incidents TIDAK PERNAH mengembalikan data
//     pelapor (nama, instansi, HP, email) maupun catatan internal.
//   - Laporan berstatus "Ditolak" tidak ditampilkan di daftar publik.
//   - Status verifikasi diubah oleh admin langsung di sheet LAPORAN_INSIDEN
//     (kolom statusVerifikasi: Baru / Terverifikasi / Ditolak).
// ============================================================

var INC_SHEET = "LAPORAN_INSIDEN";
var INC_H = [
  "id", "refNumber", "createdAt", "updatedAt", "statusVerifikasi", "lingkup",
  "judul", "jenis", "kategoriAncaman", "ringkasan", "tanggal", "jam",
  "lokasiOperatorId", "lokasiBandara", "lokasiDetail", "provinsi", "otoritasWilayah",
  "pihakTerlibatIds", "pihakTerlibat", "otoritasPenangan", "terdampak",
  "penyebab", "kronologi", "severity", "sumber", "namaMedia", "linkMedia",
  "namaPelapor", "instansi", "hp", "email", "catatan", "verifiedBy", "verifiedAt"
];
// Kolom yang BOLEH keluar lewat endpoint publik (tanpa data pelapor/catatan).
var INC_PUBLIC = [
  "id", "refNumber", "createdAt", "statusVerifikasi", "lingkup",
  "judul", "jenis", "kategoriAncaman", "ringkasan", "tanggal", "jam",
  "lokasiOperatorId", "lokasiBandara", "lokasiDetail", "provinsi", "otoritasWilayah",
  "pihakTerlibat", "otoritasPenangan", "terdampak", "penyebab", "kronologi",
  "severity", "sumber", "namaMedia", "linkMedia", "verifiedAt"
];
var INC_JENIS = {
  "Ancaman keamanan (unlawful interference)": "AVSEC",
  "Pelanggaran prosedur keamanan (security breach)": "AVSEC",
  "Isu regulasi / kebijakan keamanan": "AVSEC",
  "Kegiatan pengawasan / inspeksi / audit": "AVSEC",
  "Latihan / simulasi keamanan": "AVSEC",
  "Berita media terkait keamanan penerbangan": "AVSEC",
  "Kecelakaan penerbangan": "Non-AVSEC",
  "Insiden serius / near-miss": "Non-AVSEC",
  "Gangguan operasional bandara/maskapai": "Non-AVSEC",
  "Lainnya": "Perlu Klasifikasi"
};
var INC_SEVERITY = ["Rendah", "Sedang", "Tinggi", "Kritis"];
var INC_SUMBER = [
  "Laporan langsung / pengamatan lapangan", "Berita media massa",
  "Laporan internal maskapai/operator", "Hasil pengawasan/inspeksi", "Lainnya"
];
var INC_STATUS = ["Baru", "Terverifikasi", "Ditolak"];
var INC_CACHE_KEY = "sirisk_cache_incidents_v1";
var INC_MAX_LEN = 5000;

function incidentLingkup_(jenis) {
  return INC_JENIS[jenis] || "Perlu Klasifikasi";
}

// Nilai sel bisa berupa Date bila diketik manual di sheet — normalisasi ke teks.
function incCell_(key, v) {
  if (v instanceof Date) {
    var tz = Session.getScriptTimeZone() || "Asia/Jakarta";
    if (key === "jam") return Utilities.formatDate(v, tz, "HH:mm");
    if (key === "tanggal") return Utilities.formatDate(v, tz, "yyyy-MM-dd");
    return v.toISOString();
  }
  return v === null || v === undefined ? "" : String(v);
}

function incidentsPublic_() {
  var rows = objs_(sheet_(INC_SHEET, INC_H));
  return rows
    .filter(function (r) { return String(r.statusVerifikasi) !== "Ditolak"; })
    .map(function (r) {
      var o = {};
      INC_PUBLIC.forEach(function (k) { o[k] = incCell_(k, r[k]); });
      if (!o.lingkup) o.lingkup = incidentLingkup_(o.jenis);
      if (!o.statusVerifikasi) o.statusVerifikasi = "Baru";
      return o;
    })
    .sort(function (a, b) {
      var ka = (a.tanggal || "") + " " + (a.jam || ""), kb = (b.tanggal || "") + " " + (b.jam || "");
      if (ka !== kb) return ka < kb ? 1 : -1;
      return String(a.createdAt) < String(b.createdAt) ? 1 : -1;
    });
}

// Nomor referensi LKP/NNNN/MM/YYYY — NNNN berurutan global, dihitung dari
// nomor terbesar yang ada. Aman dari duplikat karena doPost berjalan di
// dalam Script Lock.
function nextIncidentRef_(rows) {
  var max = 0;
  rows.forEach(function (r) {
    var m = String(r.refNumber || "").match(/^LKP\/(\d+)\//);
    if (m) max = Math.max(max, Number(m[1]));
  });
  var tz = Session.getScriptTimeZone() || "Asia/Jakarta", d = new Date();
  return "LKP/" + ("000" + (max + 1)).slice(-4) + "/" + Utilities.formatDate(d, tz, "MM") + "/" + Utilities.formatDate(d, tz, "yyyy");
}

function incStr_(v, max) {
  return String(v === undefined || v === null ? "" : v).trim().slice(0, max || INC_MAX_LEN);
}

function validateIncident_(p) {
  var e = [];
  if (!incStr_(p.judul)) e.push("Judul kejadian wajib diisi");
  if (incStr_(p.judul).length > 200) e.push("Judul maksimal 200 karakter");
  if (!INC_JENIS.hasOwnProperty(p.jenis)) e.push("Jenis kejadian tidak valid");
  if (INC_SEVERITY.indexOf(p.severity) < 0) e.push("Tingkat keparahan tidak valid");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(incStr_(p.tanggal))) e.push("Tanggal kejadian wajib diisi (YYYY-MM-DD)");
  if (p.jam && !/^([01]\d|2[0-3]):[0-5]\d$/.test(incStr_(p.jam))) e.push("Format jam harus HH:MM");
  if (p.kategoriAncaman && !/^(0[1-9]|1[0-9])$/.test(incStr_(p.kategoriAncaman))) e.push("Kategori ancaman harus 01-19");
  if (p.sumber && INC_SUMBER.indexOf(p.sumber) < 0) e.push("Sumber informasi tidak valid");
  if (p.linkMedia && !/^https?:\/\/\S+$/i.test(incStr_(p.linkMedia))) e.push("Tautan harus diawali http:// atau https://");
  if (p.email && !/^\S+@\S+\.\S+$/.test(incStr_(p.email))) e.push("Format email pelapor tidak valid");
  if (!incStr_(p.namaPelapor)) e.push("Nama pelapor wajib diisi");
  return e;
}

function createIncident_(p) {
  // Honeypot: bot biasanya mengisi semua field. Balas "sukses" tanpa menyimpan.
  if (p.website) return json_({ ok: true, id: "", refNumber: "", ignored: true });
  var er = validateIncident_(p);
  if (er.length) return json_({ ok: false, error: er.join("; "), code: "VALIDATION_ERROR" });

  var s = sheet_(INC_SHEET, INC_H), rows = objs_(s);
  var cid = incStr_(p.clientId, 60);
  if (cid) {
    var dup = rows.filter(function (r) { return String(r.id) === cid; })[0];
    if (dup) return json_({ ok: true, duplicate: true, id: dup.id, refNumber: dup.refNumber, lingkup: dup.lingkup });
  }

  // Lokasi & pihak terlibat divalidasi terhadap MASTER_OPERATOR (sumber kebenaran).
  var ops = objs_(sheet_(SHEETS.OP, H.OP)), byId = {};
  ops.forEach(function (o) { byId[String(o.operatorId)] = o; });
  var lokId = incStr_(p.lokasiOperatorId, 40), lok = lokId ? byId[lokId] : null;
  if (lokId && !lok) return json_({ ok: false, error: "Bandara lokasi tidak ditemukan di master.", code: "VALIDATION_ERROR" });
  var pihakIds = String(p.pihakTerlibatIds || "").split(",").map(function (x) { return x.trim(); })
    .filter(function (x) { return x && byId[x]; });

  var n = now_(), id = cid || Utilities.getUuid();
  var o = {
    id: id, refNumber: nextIncidentRef_(rows), createdAt: n, updatedAt: n,
    statusVerifikasi: "Baru", lingkup: incidentLingkup_(p.jenis),
    judul: incStr_(p.judul, 200), jenis: p.jenis,
    kategoriAncaman: incStr_(p.kategoriAncaman, 2),
    ringkasan: incStr_(p.ringkasan),
    // Apostrof memaksa Sheets menyimpan sebagai teks (bukan tanggal/jam otomatis).
    tanggal: "'" + incStr_(p.tanggal, 10), jam: p.jam ? "'" + incStr_(p.jam, 5) : "",
    lokasiOperatorId: lok ? lok.operatorId : "",
    lokasiBandara: lok ? lok.namaOperator : "",
    lokasiDetail: incStr_(p.lokasiDetail, 500),
    provinsi: lok && lok.provinsi ? lok.provinsi : incStr_(p.provinsi, 60),
    otoritasWilayah: incStr_(p.otoritasWilayah, 120),
    pihakTerlibatIds: pihakIds.join(","),
    pihakTerlibat: incStr_(p.pihakTerlibat, 1000),
    otoritasPenangan: incStr_(p.otoritasPenangan, 500),
    terdampak: incStr_(p.terdampak, 500),
    penyebab: incStr_(p.penyebab), kronologi: incStr_(p.kronologi),
    severity: p.severity, sumber: p.sumber || "",
    namaMedia: incStr_(p.namaMedia, 120), linkMedia: incStr_(p.linkMedia, 500),
    namaPelapor: incStr_(p.namaPelapor, 120), instansi: incStr_(p.instansi, 200),
    hp: incStr_(p.hp, 30), email: incStr_(p.email, 120), catatan: incStr_(p.catatan),
    verifiedBy: "", verifiedAt: ""
  };
  appendObj_(s, INC_H, o);
  // Audit tanpa data pelapor.
  audit_({}, "INCIDENT", id, "CREATE", {}, { refNumber: o.refNumber, jenis: o.jenis, lingkup: o.lingkup, severity: o.severity }, p.requestId, "Pelaporan kejadian keamanan penerbangan");
  try { CacheService.getScriptCache().remove(INC_CACHE_KEY); } catch (x) {}
  return json_({ ok: true, duplicate: false, id: id, refNumber: o.refNumber, lingkup: o.lingkup });
}
