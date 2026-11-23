// ============================================================
// STAGING.gs — HANYA untuk spreadsheet uji "SI-RISK STAGING". JANGAN ditempel ke proyek produksi.
// (Bila tertempel pun aman: semua fungsi menolak berjalan di spreadsheet produksi / yang namanya tanpa "STAGING".)
//
// 1) buatDataRekaanStaging() — mengisi data REKAAN seukuran peluncuran penuh:
//    444 operator (257 bandara, 126 airlines, 28 LPPNPI, 33 RA), ±560 unit/stasiun, 1 DPRK per operator,
//    ±17 skenario per lokasi untuk periode Juli 2026 + separuh lokasi punya penilaian Juli 2025 (histori).
//    Total ±25 ribu skenario. Semua nama/teks rekaan; tidak ada data operator asli.
// 2) ujiBebanStaging() — mengukur waktu & ukuran respons fungsi baca utama TANPA cache.
// ============================================================
var STAGING_PROD_ID = "13a9hBhANfWZvhk1bIRxdwvqX4qGQoVfX9_TwTl8Nwhk";
var STAGING_KAT = [["01","Person Borne IEDs (Bom Bunuh Diri) - on the body or in cabin baggage"],["02","Bom Kargo (IEDs in Cargo)"],["03","Attacks Using UAS/RPAS (Penyerangan Sistem Pesawat Kendali Jarak Jauh)"],["04","Landside Attack (Ancaman di Daerah Sisi Darat)"],["05","Aircraft as a Weapon (Pemanfaatan Pesawat Udara sebagai Senjata)"],["06","Chemical Threats (Ancaman Serangan Kimia)"],["07","MANPADS (Serangan Sistem Senjata Pertahanan Udara Portable)"],["08","IED in Hold Baggage (Penyusupan Bom di Bagasi Tercatat)"],["09","IED in Catering (Penyusupan Bom/Senjata dalam Kiriman Katering)"],["10","Vehicle-Borne IEDs / Bom Mobil"],["11","Cyber-Attack (Serangan Siber)"],["12","Hijack (Pembajakan)"],["13","Biological and Radiological Threats"],["14","Hoaxes (Informasi Palsu)"],["15","Attack on ATC Facility"],["16","Sabotage (Sabotase)"],["17","Airborne Threats"],["18","IED in Other Services"],["19","Other Attacks (Sumber Serangan Lainnya)"]];
var STAGING_PROV = ["Aceh","Sumatera Utara","Riau","Kepulauan Riau","Sumatera Selatan","Lampung","DKI Jakarta","Banten","Jawa Barat","Jawa Tengah","DI Yogyakarta","Jawa Timur","Bali","Nusa Tenggara Barat","Nusa Tenggara Timur","Kalimantan Barat","Kalimantan Timur","Sulawesi Selatan","Sulawesi Utara","Maluku","Papua","Papua Barat"];

function stagingGuard_() {
  var ss = SpreadsheetApp.getActive();
  if (!ss || ss.getId() === STAGING_PROD_ID || !/STAGING/i.test(ss.getName()))
    throw Error("DITOLAK: fungsi staging hanya berjalan di spreadsheet yang namanya memuat \"STAGING\" dan bukan spreadsheet produksi.");
  return ss;
}
function stagingRng_(seed) { var t = seed >>> 0; return function () { t += 0x6D2B79F5; var r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
function stagingTulis_(s, header, rows) {
  if (!rows.length) return;
  for (var i = 0; i < rows.length; i += 5000) {
    var part = rows.slice(i, i + 5000);
    ensureRows_(s, part.length);
    s.getRange(s.getLastRow() + 1, 1, part.length, header.length).setValues(part);
  }
}

/** Isi spreadsheet STAGING dengan data rekaan. opsi (opsional, untuk uji): {skenarioPerLokasi, skala} */
function buatDataRekaanStaging(opsi) {
  var ss = stagingGuard_(), t0 = Date.now();
  opsi = opsi || {};
  var perLokasi = Number(opsi.skenarioPerLokasi || 17), skala = Number(opsi.skala || 1), rnd = stagingRng_(20261123);
  ensureSheetsOnly_();
  try { setupLogin(); } catch (e) {}
  var opS = sheet_(SHEETS.OP, H.OP), unS = sheet_(SHEETS.UNIT, H.UNIT), dS = sheet_(SHEETS.DPRK, H.DPRK), rS = sheet_(SHEETS.RISK, H.RISK);
  if (rS.getLastRow() > 1 || opS.getLastRow() > 1) throw Error("Spreadsheet STAGING sudah berisi data. Hapus isi sheet MASTER_OPERATOR / RISK_ASSESSMENT dulu bila ingin mengisi ulang.");
  var n = now_(), pick = function (a) { return a[Math.floor(rnd() * a.length)]; };
  var jenis = [["Bandar Udara", "BD-S", 257], ["Airlines", "AIR-S", 126], ["LPPNPI", "LPP-S", 28], ["Regulated Agent", "RA-S", 33]];
  var kelas = ["H", "H", "H", "G", "G", "G", "C", "C", "F", "E", "B", "A", ""];
  var ops = [], units = [];
  jenis.forEach(function (j) {
    var cnt = Math.max(1, Math.round(j[2] * skala));
    for (var i = 1; i <= cnt; i++) {
      var id = j[1] + ("00" + i).slice(-3), prov = pick(STAGING_PROV);
      ops.push({ operatorId: id, jenisOperator: j[0], namaOperator: j[0] + " Rekaan " + i, kodeOperator: id, iata: "", icao: "", provinsi: prov, kabkota: "Kota Rekaan " + i, lokasi: "Lokasi Rekaan " + i, kelas: j[0] === "Bandar Udara" ? pick(kelas) : "", status: "Aktif", aktif: true, createdAt: n, updatedAt: n, kodeWilayah: "" });
      // stasiun: 20 airlines pertama punya banyak stasiun (seperti maskapai nasional), sisanya 1–3; LPPNPI 2 unit
      var nu = j[0] === "Airlines" ? (i <= 20 ? 12 + Math.floor(rnd() * 14) : Math.floor(rnd() * 3)) : j[0] === "LPPNPI" ? 2 : 0;
      for (var u = 1; u <= Math.round(nu * Math.min(1, skala * 1.0)); u++)
        units.push({ unitId: id + "-U" + ("0" + u).slice(-2), operatorId: id, jenisUnit: j[0] === "Airlines" ? "Stasiun" : "Kantor Cabang Pembantu", namaUnit: "Stasiun Rekaan " + u, kodeUnit: "R" + u, provinsi: pick(STAGING_PROV), kabkota: "Kota Rekaan " + u, aktif: true, createdAt: n, updatedAt: n, kodeWilayah: "" });
    }
  });
  stagingTulis_(opS, H.OP, ops.map(function (o) { return H.OP.map(function (k) { return o[k] === undefined ? "" : o[k]; }); }));
  stagingTulis_(unS, H.UNIT, units.map(function (o) { return H.UNIT.map(function (k) { return o[k] === undefined ? "" : o[k]; }); }));
  var dprk = ops.map(function (o) {
    return { dprkId: "DPRK-" + o.operatorId, operatorId: o.operatorId, jenisOperator: o.jenisOperator, namaOperator: o.namaOperator, periode: "Juli", tahun: 2026, versi: 1, tanggalPenyusunan: "2026-07-15", tanggalPengesahan: "2026-07-01", tanggalKajiUlang: "2027-07-01", linkFileDprk: "", status: "Aktif", namaPengisi: "Pengisi Rekaan", jabatanPengisi: "AVSEC", riskOwner: "Pemilik Rekaan", emailRiskOwner: "", dprkEditToken: "", createdAt: n, updatedAt: n, tanggalWajibPembaruan: "" };
  });
  stagingTulis_(dS, H.DPRK, dprk.map(function (o) { return H.DPRK.map(function (k) { return o[k] === undefined ? "" : o[k]; }); }));
  var unitsBy = {}; units.forEach(function (u) { (unitsBy[u.operatorId] = unitsBy[u.operatorId] || []).push(u.unitId); });
  var teks = "Pemeriksaan keamanan sesuai prosedur, patroli berkala, pemantauan CCTV, dan pengendalian akses ke daerah keamanan terbatas (teks rekaan).";
  var risks = [], seq = 0;
  ops.forEach(function (o) {
    var lokasi = [""].concat(unitsBy[o.operatorId] || []);
    lokasi.forEach(function (uid, li) {
      [["Juli", 2026], ["Juli", 2025]].forEach(function (per, pi) {
        if (pi === 1 && (li + o.operatorId.length) % 2) return; // separuh lokasi punya histori tahun lalu
        for (var s = 0; s < perLokasi; s++) {
          var kat = STAGING_KAT[(s * 7 + li) % 19], a = 1 + Math.floor(rnd() * 10), k = 1 + Math.floor(rnd() * 10), c = 1 + Math.floor(rnd() * 10);
          var rk = computeRisk_({ ancamanNilai: a, kerentananNilai: k, konsekuensiNilai: c }), sk = "Skenario rekaan " + kat[0] + "." + ("0" + (s + 1)).slice(-2);
          var x = { riskId: "RISK-STG-" + (++seq), dprkId: "DPRK-" + o.operatorId, operatorId: o.operatorId, jenisOperator: o.jenisOperator, namaOperator: o.namaOperator, kategori: kat[0] + " - " + kat[1], idRisikoKatalog: "'" + kat[0] + "." + ("0" + (s + 1)).slice(-2), skenario: sk, area: "Area rekaan", langkahSaatIni: teks, kerentananSaatIni: teks, perlakuan: rk.risikoNilai >= 14 ? "Mitigasi" : "Diterima", prioritas: rk.risikoNilai >= 26 ? "Sangat Segera" : rk.risikoNilai >= 14 ? "Segera" : "Biasa", langkahTambahan: teks, pemilikRisiko: "Pemilik Rekaan", tanggalKaji: (per[1] + 1) + "-07-01", keterangan: "", bulan: per[0], tahun: per[1], namaPengisi: "Pengisi Rekaan", jabatanPengisi: "AVSEC", createdAt: n, updatedAt: n, editToken: "", assessmentKey: assessmentKey_(o.operatorId, "DPRK-" + o.operatorId, per[0], per[1], kat[0], sk, uid), rowVersion: 1, unitId: uid };
          Object.keys(rk).forEach(function (kk) { x[kk] = rk[kk]; });
          risks.push(H.RISK.map(function (kk) { return x[kk] === undefined ? "" : x[kk]; }));
        }
      });
    });
  });
  stagingTulis_(rS, H.RISK, risks);
  try { invalidateDashboardCache_(); } catch (e) {}
  var msg = "STAGING terisi: " + ops.length + " operator, " + units.length + " unit, " + dprk.length + " DPRK, " + risks.length + " skenario dalam " + Math.round((Date.now() - t0) / 1000) + " detik.";
  Logger.log(msg); return msg;
}

/** Ukur waktu (ms) & ukuran respons (KB) fungsi baca utama tanpa cache. Jalankan dari editor setelah buatDataRekaanStaging(). */
function ujiBebanStaging() {
  stagingGuard_();
  var out = ["UJI BEBAN " + now_() + " — tanpa cache"], hasil = {};
  var ukur = function (nama, fn) {
    var t = Date.now(), v, err = "";
    try { v = fn(); } catch (e) { err = String(e && e.message || e); }
    var ms = Date.now() - t, kb = v === undefined ? 0 : Math.round(JSON.stringify(v).length / 1024);
    hasil[nama] = { ms: ms, kb: kb, error: err };
    out.push("  " + nama + ": " + ms + " ms, " + kb + " KB" + (err ? " — ERROR: " + err : ""));
  };
  ukur("dashboard (publik)", function () { return dashboard_(); });
  ukur("riskData (Admin, semua baris)", function () { return riskMonitoring_(); });
  ukur("operatorStatus (Monitoring Operator)", function () { return operatorMonitoring_(); });
  ukur("trend", function () { return trend_(); });
  ukur("baca RISK_ASSESSMENT mentah", function () { return rows_(sheet_(SHEETS.RISK, H.RISK)).a.length; });
  var n = sheet_(SHEETS.RISK, H.RISK).getLastRow() - 1;
  out.push("  (jumlah skenario: " + n + ")");
  out.push("  Patokan: setiap baris sebaiknya < 10.000 ms (pengguna menunggu) dan respons < 5.000 KB; batas keras Apps Script 6 menit / eksekusi.");
  var msg = out.join("\n"); Logger.log(msg); return msg;
}
