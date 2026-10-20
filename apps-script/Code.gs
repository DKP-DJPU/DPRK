// DPRK NASIONAL V3.36 HARDENED CORE + LOGIN OTP (lihat Auth.gs) — band risiko & ALARP sesuai PR 16/41 DJPU 2024 — backup harian (V3.35) — edit lewat akun login (V3.36) — kode produksi, stabilitas GET/POST, retry-safe, dan dukungan EDIT
/**
 * DASHBOARD MONITORING DPRK KEAMANAN PENERBANGAN NASIONAL — V2
 *
 * 4 entitas setara:
 *   1. Bandar Udara
 *   2. Airlines
 *   3. LPPNPI
 *   4. Regulated Agent
 *
 * Jalankan setupSystemV2() SATU KALI setelah script dipasang.
 * Setup produksi TIDAK menjalankan migrasi legacy.
 * Untuk pengingat email, jalankan createDailyReminderTrigger() SATU KALI.
 *
 * SETELAH SETUP AWAL — WAJIB dijalankan manual dari editor Apps Script:
 *   issueApiKeysForAllOperators()
 * untuk menerbitkan API key bagi semua operator aktif. Hasilnya (CSV
 * operatorId,namaOperator,apiKey) muncul di Execution Log — salin dan
 * distribusikan ke masing-masing operator lewat kanal aman. Tanpa API key,
 * operator TIDAK BISA mengirim/mengubah data (REQUIRE_API_KEY=true).
 *
 * PERUBAHAN V3.29 (hardening lanjutan):
 *  1. API key wajib per-operator untuk action=create/update/renewDprk
 *     (disimpan sebagai hash SHA-256 di sheet ACCESS_TOKEN, bukan plaintext).
 *  2. Guard formula-injection pada semua sel yang ditulis ke Sheets.
 *  3. seedAirports_() dipindah keluar dari hot path doPost (hanya jalan
 *     saat setupSystemV2()), agar setiap submit tidak men-scan 281 baris
 *     MASTER_OPERATOR.
 *  4. Cache singkat (CacheService, TTL 45 detik) untuk endpoint
 *     dashboard/operators/risks, diinvalidasi otomatis setelah tulis.
 *  5. Pesan error ke client digeneralisasi; detail asli tetap tercatat
 *     lewat Logger.log untuk keperluan debug.
 */

// CATATAN PRODUKSI: data baseline DPRK Nasional V2 telah divalidasi.
// Fungsi migrasi/audit historis tidak disertakan dalam file produksi ini.

var SHEETS={OP:"MASTER_OPERATOR",DPRK:"MASTER_DPRK",DPRKVER:"DPRK_VERSION",RISK:"RISK_ASSESSMENT",HIST:"RISK_HISTORY",AUDIT:"AUDIT_LOG",ACCESS:"ACCESS_TOKEN",NOTIF:"NOTIFICATION_LOG"};
var H={
 OP:["operatorId","jenisOperator","namaOperator","kodeOperator","iata","icao","provinsi","kabkota","lokasi","kelas","status","aktif","createdAt","updatedAt"],
 DPRK:["dprkId","operatorId","jenisOperator","namaOperator","periode","tahun","versi","tanggalPenyusunan","tanggalPengesahan","tanggalKajiUlang","linkFileDprk","status","namaPengisi","jabatanPengisi","riskOwner","emailRiskOwner","dprkEditToken","createdAt","updatedAt","tanggalWajibPembaruan"],
 DPRKVER:["dprkVersionId","dprkId","operatorId","versionNumber","tanggalPenyusunan","tanggalPengesahan","tanggalWajibPembaruan","linkFileDprk","namaPengisi","jabatanPengisi","riskOwner","emailRiskOwner","status","createdAt","updatedAt"],
 RISK:["riskId","dprkId","operatorId","jenisOperator","namaOperator","kategori","idRisikoKatalog","skenario","area","langkahSaatIni","kerentananSaatIni","ancamanNilai","ancamanRating","kerentananNilai","kerentananRating","konsekuensiNilai","konsekuensiRating","risikoNilai","risikoRating","kategoriPenerimaan","perlakuan","prioritas","langkahTambahan","pemilikRisiko","tanggalKaji","keterangan","bulan","tahun","namaPengisi","jabatanPengisi","createdAt","updatedAt","editToken","assessmentKey","rowVersion"],
 HIST:["historyId","riskId","dprkId","operatorId","jenisOperator","namaOperator","tanggal","bulan","tahun","nilaiAncaman","nilaiKerentanan","nilaiKonsekuensi","nilaiRisiko","ratingRisiko","versiDprk","perubahan","updatedBy","rowVersion","beforeData","afterData"],
 AUDIT:["auditId","timestamp","actorType","actorId","entityType","entityId","action","reason","beforeData","afterData","requestId"],
 ACCESS:["accessId","operatorId","dprkId","tokenHash","tokenType","status","createdAt","updatedAt","revokedAt"],
 NOTIF:["notificationId","dprkId","operatorId","jenisOperator","namaOperator","riskOwner","email","tanggalKaji","reminderType","statusEmail","sentAt"]
};

// ============================================================
// SPRINT 1 — KONFIGURASI KEBIJAKAN AKSES BACA (opsional, default OFF)
// ============================================================
// Jika suatu saat diputuskan endpoint GET (action=operators / action=risks)
// perlu dibatasi hanya untuk instansi yang berwenang, set REQUIRE_READ_KEY=true
// dan isi READ_KEYS dengan daftar kunci yang dibagikan ke instansi terkait.
// Selama masih false, perilaku endpoint GET TIDAK berubah dari versi sebelumnya
// (tetap terbuka, sesuai desain dashboard transparansi nasional saat ini).
var REQUIRE_READ_KEY=false;
var READ_KEYS=[]; // contoh: ["KUNCI-INSTANSI-A","KUNCI-INSTANSI-B"]
function readKeyValid_(p){
 if(!REQUIRE_READ_KEY)return true;
 return READ_KEYS.indexOf(String(p.readKey||""))>=0;
}

// ============================================================
// SPRINT 2 — API KEY PER-OPERATOR (WAJIB UNTUK MENULIS DATA)
// ============================================================
// Setiap operator (Bandar Udara / Airlines / LPPNPI / Regulated Agent)
// diberi SATU API key aktif oleh admin lewat fungsi issueApiKey_(operatorId)
// (dijalankan manual dari Apps Script editor, BUKAN endpoint publik).
// Hanya HASH (SHA-256) dari key yang disimpan di sheet ACCESS_TOKEN — key
// asli hanya tampil sekali saat diterbitkan (di Execution Log / return value).
// action=create, action=update, dan action=renewDprk WAJIB menyertakan
// apiKey yang cocok dengan operatorId terkait, selama REQUIRE_API_KEY=true.
var REQUIRE_API_KEY=false;
function hashToken_(raw){
 var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(raw||""),Utilities.Charset.UTF_8);
 return bytes.map(function(b){var v=(b<0?b+256:b).toString(16);return v.length===1?"0"+v:v}).join("");
}
function verifyApiKey_(operatorId,apiKey){
 if(!REQUIRE_API_KEY)return true;
 var key=cleanToken_(apiKey);
 if(!operatorId||!key)return false;
 var hash=hashToken_(key),rows=objs_(sheet_(SHEETS.ACCESS,H.ACCESS));
 for(var i=0;i<rows.length;i++){
  var r=rows[i];
  if(String(r.operatorId)===String(operatorId)&&String(r.tokenType)==="API_KEY"&&String(r.status)==="active"&&String(r.tokenHash)===hash)return true;
 }
 return false;
}
function revokeApiKey_(operatorId){
 var s=sheet_(SHEETS.ACCESS,H.ACCESS),x=rows_(s),oi=x.h.indexOf("operatorId"),ti=x.h.indexOf("tokenType"),si=x.h.indexOf("status"),ui=x.h.indexOf("updatedAt"),ri=x.h.indexOf("revokedAt"),n=now_(),count=0;
 for(var i=0;i<x.a.length;i++){
  if(String(x.a[i][oi])===String(operatorId)&&String(x.a[i][ti])==="API_KEY"&&String(x.a[i][si])==="active"){
   s.getRange(i+2,si+1).setValue("revoked");s.getRange(i+2,ui+1).setValue(n);s.getRange(i+2,ri+1).setValue(n);count++;
  }
 }
 return count+" API key operator "+operatorId+" dicabut.";
}
// Jalankan MANUAL dari editor Apps Script (pilih fungsi ini lalu klik Run).
// Key asli hanya tampil SEKALI di Execution Log — segera salin & bagikan ke
// operator lewat kanal aman (bukan email biasa/tidak terenkripsi bila bisa dihindari).
function issueApiKey_(operatorId){
 ensureSheetsOnly_();
 var opRow=findBy_(sheet_(SHEETS.OP,H.OP),"operatorId",operatorId);
 if(!opRow)throw Error("Operator "+operatorId+" tidak ditemukan di MASTER_OPERATOR.");
 revokeApiKey_(operatorId);
 var raw=Utilities.getUuid().replace(/-/g,"").toUpperCase(),n=now_();
 appendObj_(sheet_(SHEETS.ACCESS,H.ACCESS),H.ACCESS,{accessId:id_("ACC"),operatorId:operatorId,dprkId:"",tokenHash:hashToken_(raw),tokenType:"API_KEY",status:"active",createdAt:n,updatedAt:n,revokedAt:""});
 audit_({operatorId:operatorId},"ACCESS_TOKEN",operatorId,"ISSUE_API_KEY",{},{operatorId:operatorId,tokenType:"API_KEY"},id_("REQ"),"Penerbitan API key operator (manual admin)");
 Logger.log("API KEY untuk "+operatorId+" ("+(opRow.obj.namaOperator||"")+"): "+raw);
 return raw;
}
// Terbitkan API key untuk SEMUA operator aktif sekaligus. Jalankan manual
// SATU KALI saat roll-out awal. Hasil (CSV operatorId,namaOperator,apiKey)
// tercetak di Execution Log dan juga dikembalikan sebagai string — salin
// dari sana lalu distribusikan satu per satu ke masing-masing operator.
// V3.30 — versi batch, menghindari timeout 6 menit untuk 281+ operator.
// Root cause versi lama: issueApiKey_() per operator melakukan ~13 panggilan
// Sheets API terpisah (ensureSheetsOnly_ 9x, scan MASTER_OPERATOR, scan+tulis
// ACCESS_TOKEN 3x setValue per baris, appendRow ACCESS, appendRow AUDIT).
// Untuk 281 operator itu jadi ribuan roundtrip jaringan -> timeout.
// Versi ini membaca semua sheet SEKALI, memproses di memori, lalu menulis
// hasilnya hanya dalam beberapa batch setValues/appendRow saja.
function issueApiKeysForAllOperators(){
  ensureSheetsOnly_();

  var opSheet = sheet_(SHEETS.OP, H.OP);
  var ops = objs_(opSheet).filter(function(o){ return String(o.aktif).toLowerCase() !== "false"; });

  var accessSheet = sheet_(SHEETS.ACCESS, H.ACCESS);
  var accessData = rows_(accessSheet); // {h, a}
  var aH = accessData.h, aRows = accessData.a;
  var tiIdx = aH.indexOf("tokenType"), siIdx = aH.indexOf("status"),
      uiIdx = aH.indexOf("updatedAt"), riIdx = aH.indexOf("revokedAt");

  var n = now_();

  // 1) Cabut semua API key aktif yang sudah ada, di memori, lalu tulis balik
  //    kolom status/updatedAt/revokedAt dalam SATU batch per kolom (bukan
  //    setValue satu-satu per baris seperti versi lama).
  var statusCol = [], updatedCol = [], revokedCol = [], anyRevoked = false;
  for (var i = 0; i < aRows.length; i++) {
    var r = aRows[i];
    if (String(r[tiIdx]) === "API_KEY" && String(r[siIdx]) === "active") {
      statusCol.push(["revoked"]); updatedCol.push([n]); revokedCol.push([n]);
      anyRevoked = true;
    } else {
      statusCol.push([r[siIdx]]); updatedCol.push([r[uiIdx]]); revokedCol.push([r[riIdx]]);
    }
  }
  if (anyRevoked && aRows.length) {
    accessSheet.getRange(2, siIdx + 1, aRows.length, 1).setValues(statusCol);
    accessSheet.getRange(2, uiIdx + 1, aRows.length, 1).setValues(updatedCol);
    accessSheet.getRange(2, riIdx + 1, aRows.length, 1).setValues(revokedCol);
  }

  // 2) Terbitkan API key baru untuk semua operator aktif — dikumpulkan dulu
  //    di memori, ditulis dengan SATU appendRange batch di akhir.
  var newAccessRows = [], newAuditRows = [], lines = ["operatorId,namaOperator,apiKey"];

  ops.forEach(function(o){
    var raw = Utilities.getUuid().replace(/-/g, "").toUpperCase();
    var accessObj = {
      accessId: id_("ACC"), operatorId: o.operatorId, dprkId: "",
      tokenHash: hashToken_(raw), tokenType: "API_KEY", status: "active",
      createdAt: n, updatedAt: n, revokedAt: ""
    };
    newAccessRows.push(H.ACCESS.map(function(k){
      var v = accessObj[k];
      return sanitizeCell_(v === undefined || v === null ? "" : v);
    }));
    var auditObj = {
      auditId: id_("AUD"), timestamp: n, actorType: "OPERATOR_SUBMIT",
      actorId: o.operatorId, entityType: "ACCESS_TOKEN", entityId: o.operatorId,
      action: "ISSUE_API_KEY", reason: "Penerbitan API key operator (manual admin, batch)",
      beforeData: "{}", afterData: safeJson_({operatorId:o.operatorId,tokenType:"API_KEY"}),
      requestId: id_("REQ")
    };
    newAuditRows.push(H.AUDIT.map(function(k){
      var v = auditObj[k];
      return sanitizeCell_(v === undefined || v === null ? "" : v);
    }));
    lines.push(o.operatorId + "," + o.namaOperator + "," + raw);
  });

  if (newAccessRows.length) {
    var startRow = accessSheet.getLastRow() + 1;
    accessSheet.getRange(startRow, 1, newAccessRows.length, H.ACCESS.length).setValues(newAccessRows);
  }
  if (newAuditRows.length) {
    var auditSheet = sheet_(SHEETS.AUDIT, H.AUDIT);
    var auditStart = auditSheet.getLastRow() + 1;
    auditSheet.getRange(auditStart, 1, newAuditRows.length, H.AUDIT.length).setValues(newAuditRows);
  }

  var csv = lines.join("\n");
  Logger.log(csv);
  return csv;
}

var AIRPORT_SEED=[{"operatorId":"BD-001","jenisOperator":"Bandar Udara","namaOperator":"A.A. Bere Tallo","kodeOperator":"ABU","iata":"ABU","icao":"","provinsi":"","kabkota":"Atambua","lokasi":"Atambua","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-002","jenisOperator":"Bandar Udara","namaOperator":"Abdul Haris Nasution","kodeOperator":"JHN","iata":"JHN","icao":"","provinsi":"","kabkota":"Mandailing Natal","lokasi":"Mandailing Natal","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-003","jenisOperator":"Bandar Udara","namaOperator":"Abdul Rachman Saleh","kodeOperator":"MLG","iata":"MLG","icao":"","provinsi":"","kabkota":"Malang","lokasi":"Malang","kelas":"F","status":"Aktif","aktif":true},{"operatorId":"BD-004","jenisOperator":"Bandar Udara","namaOperator":"Aboy","kodeOperator":"ABY","iata":"ABY","icao":"","provinsi":"","kabkota":"Pegunungan Bintang","lokasi":"Pegunungan Bintang","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-005","jenisOperator":"Bandar Udara","namaOperator":"Aboyaga","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Dogiyai","lokasi":"Dogiyai","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-006","jenisOperator":"Bandar Udara","namaOperator":"Abresso","kodeOperator":"RSK","iata":"RSK","icao":"","provinsi":"","kabkota":"Manokwari Selatan","lokasi":"Manokwari Selatan","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-007","jenisOperator":"Bandar Udara","namaOperator":"Achmad Yani","kodeOperator":"SRG","iata":"SRG","icao":"","provinsi":"","kabkota":"Semarang","lokasi":"Semarang","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-008","jenisOperator":"Bandar Udara","namaOperator":"Adau Airstrip","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Nunukan","lokasi":"Nunukan","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-009","jenisOperator":"Bandar Udara","namaOperator":"Adi Soemarmo","kodeOperator":"SOC","iata":"SOC","icao":"","provinsi":"","kabkota":"Solo","lokasi":"Solo","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-010","jenisOperator":"Bandar Udara","namaOperator":"Adisutjipto","kodeOperator":"JOG","iata":"JOG","icao":"","provinsi":"","kabkota":"Yogyakarta","lokasi":"Yogyakarta","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-011","jenisOperator":"Bandar Udara","namaOperator":"Aek Godang","kodeOperator":"AEG","iata":"AEG","icao":"","provinsi":"","kabkota":"Padang Sidempuan","lokasi":"Padang Sidempuan","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-012","jenisOperator":"Bandar Udara","namaOperator":"Akimuga","kodeOperator":"WABC","iata":"WABC","icao":"","provinsi":"","kabkota":"Akimuga","lokasi":"Akimuga","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-013","jenisOperator":"Bandar Udara","namaOperator":"Alama","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Mimika","lokasi":"Mimika","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-014","jenisOperator":"Bandar Udara","namaOperator":"Alas Lauser","kodeOperator":"LSR","iata":"LSR","icao":"","provinsi":"","kabkota":"Kutacane","lokasi":"Kutacane","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-015","jenisOperator":"Bandar Udara","namaOperator":"Amahai","kodeOperator":"AHI","iata":"AHI","icao":"","provinsi":"","kabkota":"Pulau Seram","lokasi":"Pulau Seram","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-016","jenisOperator":"Bandar Udara","namaOperator":"Amman Mineral Poto Tano","kodeOperator":"PNW","iata":"PNW","icao":"","provinsi":"","kabkota":"Sumbawa Barat","lokasi":"Sumbawa Barat","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-017","jenisOperator":"Bandar Udara","namaOperator":"Andi Jemma","kodeOperator":"MXB","iata":"MXB","icao":"","provinsi":"","kabkota":"Masamba","lokasi":"Masamba","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-018","jenisOperator":"Bandar Udara","namaOperator":"Anggi","kodeOperator":"AGD","iata":"AGD","icao":"","provinsi":"","kabkota":"Anggi","lokasi":"Anggi","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-019","jenisOperator":"Bandar Udara","namaOperator":"Apalapsili","kodeOperator":"AAS","iata":"AAS","icao":"","provinsi":"","kabkota":"Yalimo","lokasi":"Yalimo","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-020","jenisOperator":"Bandar Udara","namaOperator":"APT. Pranoto","kodeOperator":"AAP","iata":"AAP","icao":"","provinsi":"","kabkota":"Samarinda","lokasi":"Samarinda","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-021","jenisOperator":"Bandar Udara","namaOperator":"Aroanop","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Mimika","lokasi":"Mimika","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-022","jenisOperator":"Bandar Udara","namaOperator":"Arung Palakka","kodeOperator":"ARP","iata":"ARP","icao":"","provinsi":"","kabkota":"Bone","lokasi":"Bone","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-023","jenisOperator":"Bandar Udara","namaOperator":"Atung Bungsu","kodeOperator":"PXA","iata":"PXA","icao":"","provinsi":"","kabkota":"Dempo Selatan","lokasi":"Dempo Selatan","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-024","jenisOperator":"Bandar Udara","namaOperator":"Ayawasi","kodeOperator":"AYW","iata":"AYW","icao":"","provinsi":"","kabkota":"Ayawasi","lokasi":"Ayawasi","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-025","jenisOperator":"Bandar Udara","namaOperator":"Babo","kodeOperator":"BXB","iata":"BXB","icao":"","provinsi":"","kabkota":"Kab. Teluk Bintuni","lokasi":"Kab. Teluk Bintuni","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-026","jenisOperator":"Bandar Udara","namaOperator":"Bade","kodeOperator":"BXD","iata":"BXD","icao":"","provinsi":"","kabkota":"Bade","lokasi":"Bade","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-027","jenisOperator":"Bandar Udara","namaOperator":"Bandaneira","kodeOperator":"NDA","iata":"NDA","icao":"","provinsi":"","kabkota":"Pulau Banda","lokasi":"Pulau Banda","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-028","jenisOperator":"Bandar Udara","namaOperator":"Banyuwangi","kodeOperator":"BWX","iata":"BWX","icao":"","provinsi":"","kabkota":"Banyuwangi","lokasi":"Banyuwangi","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-029","jenisOperator":"Bandar Udara","namaOperator":"Batom","kodeOperator":"BXM","iata":"BXM","icao":"","provinsi":"","kabkota":"Batom","lokasi":"Batom","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-030","jenisOperator":"Bandar Udara","namaOperator":"Beoga","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Beoga Barat","lokasi":"Beoga Barat","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-031","jenisOperator":"Bandar Udara","namaOperator":"Bersujud Batu Licin","kodeOperator":"BTW","iata":"BTW","icao":"","provinsi":"","kabkota":"Tanah Bumbu","lokasi":"Tanah Bumbu","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-032","jenisOperator":"Bandar Udara","namaOperator":"Betoambari","kodeOperator":"BUW","iata":"BUW","icao":"","provinsi":"","kabkota":"Bau-Bau","lokasi":"Bau-Bau","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-033","jenisOperator":"Bandar Udara","namaOperator":"Bilai","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Intan Jaya","lokasi":"Intan Jaya","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-034","jenisOperator":"Bandar Udara","namaOperator":"Bilorai","kodeOperator":"UGU","iata":"UGU","icao":"","provinsi":"","kabkota":"Kab. Intan Jaya","lokasi":"Kab. Intan Jaya","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-035","jenisOperator":"Bandar Udara","namaOperator":"Binaka","kodeOperator":"GNS","iata":"GNS","icao":"","provinsi":"","kabkota":"Gunung Sitoli","lokasi":"Gunung Sitoli","kelas":"F","status":"Aktif","aktif":true},{"operatorId":"BD-036","jenisOperator":"Bandar Udara","namaOperator":"Bintuni","kodeOperator":"NTI","iata":"NTI","icao":"","provinsi":"","kabkota":"Bintuni","lokasi":"Bintuni","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-037","jenisOperator":"Bandar Udara","namaOperator":"Binuang","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Nunukan","lokasi":"Nunukan","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-038","jenisOperator":"Bandar Udara","namaOperator":"Blangkejeren","kodeOperator":"GYO","iata":"GYO","icao":"","provinsi":"","kabkota":"Gayo Lues","lokasi":"Gayo Lues","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-039","jenisOperator":"Bandar Udara","namaOperator":"Bokondini","kodeOperator":"BUI","iata":"BUI","icao":"","provinsi":"","kabkota":"Bokondini","lokasi":"Bokondini","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-040","jenisOperator":"Bandar Udara","namaOperator":"Bolaang Mongondow","kodeOperator":"LKM","iata":"LKM","icao":"","provinsi":"","kabkota":"Bolaang Mongondow","lokasi":"Bolaang Mongondow","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-041","jenisOperator":"Bandar Udara","namaOperator":"Bomakia","kodeOperator":"BXG","iata":"BXG","icao":"","provinsi":"","kabkota":"Bomakia","lokasi":"Bomakia","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-042","jenisOperator":"Bandar Udara","namaOperator":"Borome","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Pegunungan Bintang","lokasi":"Pegunungan Bintang","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-043","jenisOperator":"Bandar Udara","namaOperator":"Budiarto","kodeOperator":"BTO","iata":"BTO","icao":"","provinsi":"","kabkota":"Tanggerang","lokasi":"Tanggerang","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-044","jenisOperator":"Bandar Udara","namaOperator":"Buli","kodeOperator":"WUB","iata":"WUB","icao":"","provinsi":"","kabkota":"Maba","lokasi":"Maba","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-045","jenisOperator":"Bandar Udara","namaOperator":"Cakrabhuwana","kodeOperator":"CBN","iata":"CBN","icao":"","provinsi":"","kabkota":"Cirebon","lokasi":"Cirebon","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-046","jenisOperator":"Bandar Udara","namaOperator":"Cut Nyak Dhien","kodeOperator":"MEQ","iata":"MEQ","icao":"","provinsi":"","kabkota":"Nagan Raya","lokasi":"Nagan Raya","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-047","jenisOperator":"Bandar Udara","namaOperator":"Dabo","kodeOperator":"SIQ","iata":"SIQ","icao":"","provinsi":"","kabkota":"Singkep","lokasi":"Singkep","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-048","jenisOperator":"Bandar Udara","namaOperator":"Dabra","kodeOperator":"DRH","iata":"DRH","icao":"","provinsi":"","kabkota":"Dabra","lokasi":"Dabra","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-049","jenisOperator":"Bandar Udara","namaOperator":"Datah Dawai","kodeOperator":"DTD","iata":"DTD","icao":"","provinsi":"","kabkota":"Datah Dawai","lokasi":"Datah Dawai","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-050","jenisOperator":"Bandar Udara","namaOperator":"David Constantijn Saudale","kodeOperator":"RTI","iata":"RTI","icao":"","provinsi":"","kabkota":"Rote","lokasi":"Rote","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-051","jenisOperator":"Bandar Udara","namaOperator":"Depati Amir","kodeOperator":"PGK","iata":"PGK","icao":"","provinsi":"","kabkota":"Pangkal Pinang","lokasi":"Pangkal Pinang","kelas":"E","status":"Aktif","aktif":true},{"operatorId":"BD-052","jenisOperator":"Bandar Udara","namaOperator":"Depati Parbo","kodeOperator":"KRC","iata":"KRC","icao":"","provinsi":"","kabkota":"Kerinci","lokasi":"Kerinci","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-053","jenisOperator":"Bandar Udara","namaOperator":"Dewadaru","kodeOperator":"KWB","iata":"KWB","icao":"","provinsi":"","kabkota":"Karimun Jawa, Kab. Jepara","lokasi":"Karimun Jawa, Kab. Jepara","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-054","jenisOperator":"Bandar Udara","namaOperator":"Dhoho","kodeOperator":"DHX","iata":"DHX","icao":"","provinsi":"","kabkota":"Kediri","lokasi":"Kediri","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-055","jenisOperator":"Bandar Udara","namaOperator":"Dirung - Puruk Cahu","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Murung Raya","lokasi":"Murung Raya","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-056","jenisOperator":"Bandar Udara","namaOperator":"Djalaluddin","kodeOperator":"GTO","iata":"GTO","icao":"","provinsi":"","kabkota":"Gorontalo","lokasi":"Gorontalo","kelas":"F","status":"Aktif","aktif":true},{"operatorId":"BD-057","jenisOperator":"Bandar Udara","namaOperator":"Dobo","kodeOperator":"DOB","iata":"DOB","icao":"","provinsi":"","kabkota":"Pulau Aru, Kep. Arusi","lokasi":"Pulau Aru, Kep. Arusi","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-058","jenisOperator":"Bandar Udara","namaOperator":"Dofa Benjina Falabisahaya","kodeOperator":"MAL","iata":"MAL","icao":"","provinsi":"","kabkota":"Mangole","lokasi":"Mangole","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-059","jenisOperator":"Bandar Udara","namaOperator":"Domine Eduard Osok","kodeOperator":"SOQ","iata":"SOQ","icao":"","provinsi":"","kabkota":"Sorong","lokasi":"Sorong","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-060","jenisOperator":"Bandar Udara","namaOperator":"Douw Aturure","kodeOperator":"NBX","iata":"NBX","icao":"","provinsi":"","kabkota":"Nabire","lokasi":"Nabire","kelas":"F","status":"Aktif","aktif":true},{"operatorId":"BD-061","jenisOperator":"Bandar Udara","namaOperator":"Dr. Ferdinand Lumban Tobing","kodeOperator":"FLZ","iata":"FLZ","icao":"","provinsi":"","kabkota":"Sibolga","lokasi":"Sibolga","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-062","jenisOperator":"Bandar Udara","namaOperator":"El Tari","kodeOperator":"KOE","iata":"KOE","icao":"","provinsi":"","kabkota":"Kupang","lokasi":"Kupang","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-063","jenisOperator":"Bandar Udara","namaOperator":"Elelim","kodeOperator":"ELR","iata":"ELR","icao":"","provinsi":"","kabkota":"Kab. Yalimo","lokasi":"Kab. Yalimo","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-064","jenisOperator":"Bandar Udara","namaOperator":"Emalamo","kodeOperator":"SQN","iata":"SQN","icao":"","provinsi":"","kabkota":"Sanana","lokasi":"Sanana","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-065","jenisOperator":"Bandar Udara","namaOperator":"Enarotali","kodeOperator":"EWI","iata":"EWI","icao":"","provinsi":"","kabkota":"Enarotali","lokasi":"Enarotali","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-066","jenisOperator":"Bandar Udara","namaOperator":"Enggano","kodeOperator":"ENG","iata":"ENG","icao":"","provinsi":"","kabkota":"Bengkulu Utara","lokasi":"Bengkulu Utara","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-067","jenisOperator":"Bandar Udara","namaOperator":"Ewer","kodeOperator":"EWE","iata":"EWE","icao":"","provinsi":"","kabkota":"Ewer","lokasi":"Ewer","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-068","jenisOperator":"Bandar Udara","namaOperator":"Fatmawati Soekarno","kodeOperator":"BKS","iata":"BKS","icao":"","provinsi":"","kabkota":"Padang Kemiling","lokasi":"Padang Kemiling","kelas":"F","status":"Aktif","aktif":true},{"operatorId":"BD-069","jenisOperator":"Bandar Udara","namaOperator":"Fawi","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Puncak Jaya","lokasi":"Puncak Jaya","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-070","jenisOperator":"Bandar Udara","namaOperator":"Frans Kaisiepo","kodeOperator":"BIK","iata":"BIK","icao":"","provinsi":"","kabkota":"Biak","lokasi":"Biak","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-071","jenisOperator":"Bandar Udara","namaOperator":"Frans Sales Lega","kodeOperator":"RTG","iata":"RTG","icao":"","provinsi":"","kabkota":"Ruteng","lokasi":"Ruteng","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-072","jenisOperator":"Bandar Udara","namaOperator":"Frans Seda","kodeOperator":"MOF","iata":"MOF","icao":"","provinsi":"","kabkota":"Maumere","lokasi":"Maumere","kelas":"F","status":"Aktif","aktif":true},{"operatorId":"BD-073","jenisOperator":"Bandar Udara","namaOperator":"Gamarmalamo","kodeOperator":"GLX","iata":"GLX","icao":"","provinsi":"","kabkota":"Galela","lokasi":"Galela","kelas":"F","status":"Aktif","aktif":true},{"operatorId":"BD-074","jenisOperator":"Bandar Udara","namaOperator":"Gatot Soebroto","kodeOperator":"WYK","iata":"WYK","icao":"","provinsi":"","kabkota":"Way Kanan","lokasi":"Way Kanan","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-075","jenisOperator":"Bandar Udara","namaOperator":"Gebe","kodeOperator":"GEB","iata":"GEB","icao":"","provinsi":"","kabkota":"Halmahera Utara","lokasi":"Halmahera Utara","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-076","jenisOperator":"Bandar Udara","namaOperator":"Gewayantana","kodeOperator":"LKA","iata":"LKA","icao":"","provinsi":"","kabkota":"Larantuka","lokasi":"Larantuka","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-077","jenisOperator":"Bandar Udara","namaOperator":"Gusti Syamsir Alam","kodeOperator":"KBU","iata":"KBU","icao":"","provinsi":"","kabkota":"Kotabaru","lokasi":"Kotabaru","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-078","jenisOperator":"Bandar Udara","namaOperator":"H. Aroeppala","kodeOperator":"KSR","iata":"KSR","icao":"","provinsi":"","kabkota":"Selayar","lokasi":"Selayar","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-079","jenisOperator":"Bandar Udara","namaOperator":"H. Asan","kodeOperator":"SMQ","iata":"SMQ","icao":"","provinsi":"","kabkota":"Sampit","lokasi":"Sampit","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-080","jenisOperator":"Bandar Udara","namaOperator":"H. Hasan Aroeboesman","kodeOperator":"ENE","iata":"ENE","icao":"","provinsi":"","kabkota":"Ende","lokasi":"Ende","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-081","jenisOperator":"Bandar Udara","namaOperator":"H.A.S. Hanandjoeddin","kodeOperator":"TJQ","iata":"TJQ","icao":"","provinsi":"","kabkota":"Tanjung Pandan","lokasi":"Tanjung Pandan","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-082","jenisOperator":"Bandar Udara","namaOperator":"Haji Muhammad Sidik","kodeOperator":"HMS","iata":"HMS","icao":"","provinsi":"","kabkota":"Muara Teweh","lokasi":"Muara Teweh","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-083","jenisOperator":"Bandar Udara","namaOperator":"Halim Perdanakusuma","kodeOperator":"HLP","iata":"HLP","icao":"","provinsi":"","kabkota":"Jakarta","lokasi":"Jakarta","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-084","jenisOperator":"Bandar Udara","namaOperator":"Haluoleo","kodeOperator":"KDI","iata":"KDI","icao":"","provinsi":"","kabkota":"Kendari","lokasi":"Kendari","kelas":"E","status":"Aktif","aktif":true},{"operatorId":"BD-085","jenisOperator":"Bandar Udara","namaOperator":"Hang Nadim","kodeOperator":"BTH","iata":"BTH","icao":"","provinsi":"","kabkota":"Batam","lokasi":"Batam","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-086","jenisOperator":"Bandar Udara","namaOperator":"Harun Thohir","kodeOperator":"BXW","iata":"BXW","icao":"","provinsi":"","kabkota":"Gresik","lokasi":"Gresik","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-087","jenisOperator":"Bandar Udara","namaOperator":"Husein Sastranegara","kodeOperator":"BDO","iata":"BDO","icao":"","provinsi":"","kabkota":"Bandung","lokasi":"Bandung","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-088","jenisOperator":"Bandar Udara","namaOperator":"Ibu Kota Nusantara","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Penajam Paser Utara","lokasi":"Penajam Paser Utara","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-089","jenisOperator":"Bandar Udara","namaOperator":"Ilaga","kodeOperator":"ILA","iata":"ILA","icao":"","provinsi":"","kabkota":"Ilaga","lokasi":"Ilaga","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-090","jenisOperator":"Bandar Udara","namaOperator":"Ilu","kodeOperator":"IUL","iata":"IUL","icao":"","provinsi":"","kabkota":"Ilu","lokasi":"Ilu","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-091","jenisOperator":"Bandar Udara","namaOperator":"IMIP","kodeOperator":"MWS","iata":"MWS","icao":"","provinsi":"","kabkota":"Morowali","lokasi":"Morowali","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-092","jenisOperator":"Bandar Udara","namaOperator":"Inanwatan","kodeOperator":"INX","iata":"INX","icao":"","provinsi":"","kabkota":"Inanwatan","lokasi":"Inanwatan","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-093","jenisOperator":"Bandar Udara","namaOperator":"Iskandar","kodeOperator":"PKN","iata":"PKN","icao":"","provinsi":"","kabkota":"Pangkalan Bun","lokasi":"Pangkalan Bun","kelas":"F","status":"Aktif","aktif":true},{"operatorId":"BD-094","jenisOperator":"Bandar Udara","namaOperator":"Japura","kodeOperator":"RGT","iata":"RGT","icao":"","provinsi":"","kabkota":"Rengat","lokasi":"Rengat","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-095","jenisOperator":"Bandar Udara","namaOperator":"Jenderal Besar Soedirman","kodeOperator":"PWL","iata":"PWL","icao":"","provinsi":"","kabkota":"Purbalingga","lokasi":"Purbalingga","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-096","jenisOperator":"Bandar Udara","namaOperator":"Jila","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Mimika","lokasi":"Mimika","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-097","jenisOperator":"Bandar Udara","namaOperator":"Jita","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Mimika","lokasi":"Mimika","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-098","jenisOperator":"Bandar Udara","namaOperator":"John Becker","kodeOperator":"JBE","iata":"JBE","icao":"","provinsi":"","kabkota":"Pulau Kisar","lokasi":"Pulau Kisar","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-099","jenisOperator":"Bandar Udara","namaOperator":"Jos Orno Imsula","kodeOperator":"JOE","iata":"JOE","icao":"","provinsi":"","kabkota":"Moa","lokasi":"Moa","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-100","jenisOperator":"Bandar Udara","namaOperator":"Juanda","kodeOperator":"SUB","iata":"SUB","icao":"","provinsi":"","kabkota":"Surabaya","lokasi":"Surabaya","kelas":"B","status":"Aktif","aktif":true},{"operatorId":"BD-101","jenisOperator":"Bandar Udara","namaOperator":"Juwata","kodeOperator":"TRK","iata":"TRK","icao":"","provinsi":"","kabkota":"Tarakan","lokasi":"Tarakan","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-102","jenisOperator":"Bandar Udara","namaOperator":"Kabare","kodeOperator":"KBE","iata":"KBE","icao":"","provinsi":"","kabkota":"Kabare","lokasi":"Kabare","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-103","jenisOperator":"Bandar Udara","namaOperator":"Kabir","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Tidak tersedia","lokasi":"Tidak tersedia","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-104","jenisOperator":"Bandar Udara","namaOperator":"Kalimarau","kodeOperator":"BEJ","iata":"BEJ","icao":"","provinsi":"","kabkota":"Tanjung Redeb","lokasi":"Tanjung Redeb","kelas":"E","status":"Aktif","aktif":true},{"operatorId":"BD-105","jenisOperator":"Bandar Udara","namaOperator":"Kambuaya","kodeOperator":"KBX","iata":"KBX","icao":"","provinsi":"","kabkota":"Kambuaya","lokasi":"Kambuaya","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-106","jenisOperator":"Bandar Udara","namaOperator":"Kamur","kodeOperator":"KCD","iata":"KCD","icao":"","provinsi":"","kabkota":"Kamur","lokasi":"Kamur","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-107","jenisOperator":"Bandar Udara","namaOperator":"Kapiraya","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Deiyai","lokasi":"Deiyai","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-108","jenisOperator":"Bandar Udara","namaOperator":"Karel Sadsuitubun","kodeOperator":"LUV","iata":"LUV","icao":"","provinsi":"","kabkota":"Langgur","lokasi":"Langgur","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-109","jenisOperator":"Bandar Udara","namaOperator":"Karubaga","kodeOperator":"KBF","iata":"KBF","icao":"","provinsi":"","kabkota":"Karubaga","lokasi":"Karubaga","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-110","jenisOperator":"Bandar Udara","namaOperator":"Kasiguncu","kodeOperator":"PSJ","iata":"PSJ","icao":"","provinsi":"","kabkota":"Poso","lokasi":"Poso","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-111","jenisOperator":"Bandar Udara","namaOperator":"Kebar","kodeOperator":"KEQ","iata":"KEQ","icao":"","provinsi":"","kabkota":"Kebar","lokasi":"Kebar","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-112","jenisOperator":"Bandar Udara","namaOperator":"Kebo","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Paniai","lokasi":"Paniai","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-113","jenisOperator":"Bandar Udara","namaOperator":"Kelila","kodeOperator":"LLN","iata":"LLN","icao":"","provinsi":"","kabkota":"Mamberamo Tengah","lokasi":"Mamberamo Tengah","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-114","jenisOperator":"Bandar Udara","namaOperator":"Kenyam","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Nduga","lokasi":"Nduga","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-115","jenisOperator":"Bandar Udara","namaOperator":"Kepi","kodeOperator":"KEI","iata":"KEI","icao":"","provinsi":"","kabkota":"Kab. Mappi","lokasi":"Kab. Mappi","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-116","jenisOperator":"Bandar Udara","namaOperator":"Kertajati","kodeOperator":"KJT","iata":"KJT","icao":"","provinsi":"","kabkota":"Majalengka","lokasi":"Majalengka","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-117","jenisOperator":"Bandar Udara","namaOperator":"Kimaam","kodeOperator":"KMM","iata":"KMM","icao":"","provinsi":"","kabkota":"Kimaam","lokasi":"Kimaam","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-118","jenisOperator":"Bandar Udara","namaOperator":"Kiwirok","kodeOperator":"WAJK","iata":"WAJK","icao":"","provinsi":"","kabkota":"Kiwirok","lokasi":"Kiwirok","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-119","jenisOperator":"Bandar Udara","namaOperator":"Kobakma","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Mamberamo Tengah","lokasi":"Mamberamo Tengah","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-120","jenisOperator":"Bandar Udara","namaOperator":"Kokonau","kodeOperator":"KOX","iata":"KOX","icao":"","provinsi":"","kabkota":"Kokonau","lokasi":"Kokonau","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-121","jenisOperator":"Bandar Udara","namaOperator":"Kol. Robert Atty Bessing","kodeOperator":"LNU","iata":"LNU","icao":"","provinsi":"","kabkota":"Malinau","lokasi":"Malinau","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-122","jenisOperator":"Bandar Udara","namaOperator":"Komodo","kodeOperator":"LBJ","iata":"LBJ","icao":"","provinsi":"","kabkota":"Labuan Bajo","lokasi":"Labuan Bajo","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-123","jenisOperator":"Bandar Udara","namaOperator":"Koroway Batu","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Boven Digoel","lokasi":"Boven Digoel","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-124","jenisOperator":"Bandar Udara","namaOperator":"Kuabang","kodeOperator":"KAZ","iata":"KAZ","icao":"","provinsi":"","kabkota":"Kao","lokasi":"Kao","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-125","jenisOperator":"Bandar Udara","namaOperator":"Kuala Batu","kodeOperator":"KJX","iata":"KJX","icao":"","provinsi":"","kabkota":"Blang Pidie","lokasi":"Blang Pidie","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-126","jenisOperator":"Bandar Udara","namaOperator":"Kuala Kurun","kodeOperator":"KLG","iata":"KLG","icao":"","provinsi":"","kabkota":"Kuala Kurun","lokasi":"Kuala Kurun","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-127","jenisOperator":"Bandar Udara","namaOperator":"Kuala Pembuang","kodeOperator":"KLP","iata":"KLP","icao":"","provinsi":"","kabkota":"Kotawaringin Timur","lokasi":"Kotawaringin Timur","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-128","jenisOperator":"Bandar Udara","namaOperator":"Kualanamu","kodeOperator":"KNO","iata":"KNO","icao":"","provinsi":"","kabkota":"Medan","lokasi":"Medan","kelas":"B","status":"Aktif","aktif":true},{"operatorId":"BD-129","jenisOperator":"Bandar Udara","namaOperator":"Kufar","kodeOperator":"KFR","iata":"KFR","icao":"","provinsi":"","kabkota":"Kufar","lokasi":"Kufar","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-130","jenisOperator":"Bandar Udara","namaOperator":"Lagaligo (BUA)","kodeOperator":"LLO","iata":"LLO","icao":"","provinsi":"","kabkota":"Palopo","lokasi":"Palopo","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-131","jenisOperator":"Bandar Udara","namaOperator":"Larat","kodeOperator":"LRT","iata":"LRT","icao":"","provinsi":"","kabkota":"Tanimbar Utara","lokasi":"Tanimbar Utara","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-132","jenisOperator":"Bandar Udara","namaOperator":"Lasikin","kodeOperator":"LKI","iata":"LKI","icao":"","provinsi":"","kabkota":"Sinabang","lokasi":"Sinabang","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-133","jenisOperator":"Bandar Udara","namaOperator":"Lasondre","kodeOperator":"LSE","iata":"LSE","icao":"","provinsi":"","kabkota":"Pulau-Pulau Batu","lokasi":"Pulau-Pulau Batu","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-134","jenisOperator":"Bandar Udara","namaOperator":"Letung","kodeOperator":"LMU","iata":"LMU","icao":"","provinsi":"","kabkota":"Kepulauan Anambas","lokasi":"Kepulauan Anambas","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-135","jenisOperator":"Bandar Udara","namaOperator":"LNG Badak","kodeOperator":"BXT","iata":"BXT","icao":"","provinsi":"","kabkota":"Bontang","lokasi":"Bontang","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-136","jenisOperator":"Bandar Udara","namaOperator":"Lombok International Airport (BIL)","kodeOperator":"LOP","iata":"LOP","icao":"","provinsi":"","kabkota":"Praya","lokasi":"Praya","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-137","jenisOperator":"Bandar Udara","namaOperator":"Long Apung","kodeOperator":"LPU","iata":"LPU","icao":"","provinsi":"","kabkota":"Malinau","lokasi":"Malinau","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-138","jenisOperator":"Bandar Udara","namaOperator":"Long Apung","kodeOperator":"LPU","iata":"LPU","icao":"","provinsi":"","kabkota":"Long Apung","lokasi":"Long Apung","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-139","jenisOperator":"Bandar Udara","namaOperator":"Maimun Saleh","kodeOperator":"SBG","iata":"SBG","icao":"","provinsi":"","kabkota":"Sabang","lokasi":"Sabang","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-140","jenisOperator":"Bandar Udara","namaOperator":"Mali","kodeOperator":"ARD","iata":"ARD","icao":"","provinsi":"","kabkota":"Alor","lokasi":"Alor","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-141","jenisOperator":"Bandar Udara","namaOperator":"Malikussaleh","kodeOperator":"LSW","iata":"LSW","icao":"","provinsi":"","kabkota":"Lhokseumawe","lokasi":"Lhokseumawe","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-142","jenisOperator":"Bandar Udara","namaOperator":"Malinau Robert Atty Bessing","kodeOperator":"LNU","iata":"LNU","icao":"","provinsi":"","kabkota":"Malinau","lokasi":"Malinau","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-143","jenisOperator":"Bandar Udara","namaOperator":"Mararena","kodeOperator":"MRF","iata":"MRF","icao":"","provinsi":"","kabkota":"Sarmi","lokasi":"Sarmi","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-144","jenisOperator":"Bandar Udara","namaOperator":"Maratua","kodeOperator":"RTU","iata":"RTU","icao":"","provinsi":"","kabkota":"Berau","lokasi":"Berau","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-145","jenisOperator":"Bandar Udara","namaOperator":"Maratua","kodeOperator":"RTU","iata":"RTU","icao":"","provinsi":"","kabkota":"Berau","lokasi":"Berau","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-146","jenisOperator":"Bandar Udara","namaOperator":"Marimoi","kodeOperator":"MRM","iata":"MRM","icao":"","provinsi":"","kabkota":"Kobok","lokasi":"Kobok","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-147","jenisOperator":"Bandar Udara","namaOperator":"Marinda/Waisai","kodeOperator":"RJM","iata":"RJM","icao":"","provinsi":"","kabkota":"Waisai","lokasi":"Waisai","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-148","jenisOperator":"Bandar Udara","namaOperator":"Matahora (Wakatobi)","kodeOperator":"WNI","iata":"WNI","icao":"","provinsi":"","kabkota":"Wangi-Wangi","lokasi":"Wangi-Wangi","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-149","jenisOperator":"Bandar Udara","namaOperator":"Matak","kodeOperator":"MWK","iata":"MWK","icao":"","provinsi":"","kabkota":"Kep. Anambas","lokasi":"Kep. Anambas","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-150","jenisOperator":"Bandar Udara","namaOperator":"Mathilda Batlayeri","kodeOperator":"SXK","iata":"SXK","icao":"","provinsi":"","kabkota":"Saumlaki","lokasi":"Saumlaki","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-151","jenisOperator":"Bandar Udara","namaOperator":"Maulana Prins Mandapar","kodeOperator":"BQR","iata":"BQR","icao":"","provinsi":"","kabkota":"Banggai Laut","lokasi":"Banggai Laut","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-152","jenisOperator":"Bandar Udara","namaOperator":"Melak","kodeOperator":"MLK","iata":"MLK","icao":"","provinsi":"","kabkota":"Sendawar","lokasi":"Sendawar","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-153","jenisOperator":"Bandar Udara","namaOperator":"Melonguane","kodeOperator":"MNA","iata":"MNA","icao":"","provinsi":"","kabkota":"Sangihe Talaud","lokasi":"Sangihe Talaud","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-154","jenisOperator":"Bandar Udara","namaOperator":"mentawai","kodeOperator":"RKI","iata":"RKI","icao":"","provinsi":"","kabkota":"Sipora","lokasi":"Sipora","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-155","jenisOperator":"Bandar Udara","namaOperator":"Merdey","kodeOperator":"RDE","iata":"RDE","icao":"","provinsi":"","kabkota":"Merdey","lokasi":"Merdey","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-156","jenisOperator":"Bandar Udara","namaOperator":"Miangas","kodeOperator":"MKF","iata":"MKF","icao":"","provinsi":"","kabkota":"Tidak tersedia","lokasi":"Tidak tersedia","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-157","jenisOperator":"Bandar Udara","namaOperator":"Minangkabau","kodeOperator":"PDG","iata":"PDG","icao":"","provinsi":"","kabkota":"Padang","lokasi":"Padang","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-158","jenisOperator":"Bandar Udara","namaOperator":"Mindiptana","kodeOperator":"OMD","iata":"OMD","icao":"","provinsi":"","kabkota":"Kab. Boven Digoel","lokasi":"Kab. Boven Digoel","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-159","jenisOperator":"Bandar Udara","namaOperator":"Moanamani","kodeOperator":"ONI","iata":"ONI","icao":"","provinsi":"","kabkota":"Moanamani","lokasi":"Moanamani","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-160","jenisOperator":"Bandar Udara","namaOperator":"Molof","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Keerom","lokasi":"Keerom","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-161","jenisOperator":"Bandar Udara","namaOperator":"Mopah","kodeOperator":"MKQ","iata":"MKQ","icao":"","provinsi":"","kabkota":"Merauke","lokasi":"Merauke","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-162","jenisOperator":"Bandar Udara","namaOperator":"Morowali","kodeOperator":"MOH","iata":"MOH","icao":"","provinsi":"","kabkota":"Morowali","lokasi":"Morowali","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-163","jenisOperator":"Bandar Udara","namaOperator":"Mozes Kilangin","kodeOperator":"TIM","iata":"TIM","icao":"","provinsi":"","kabkota":"Timika","lokasi":"Timika","kelas":"F","status":"Aktif","aktif":true},{"operatorId":"BD-164","jenisOperator":"Bandar Udara","namaOperator":"Muara Bungo","kodeOperator":"BUU","iata":"BUU","icao":"","provinsi":"","kabkota":"Muaro Bungo","lokasi":"Muaro Bungo","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-165","jenisOperator":"Bandar Udara","namaOperator":"Muara Wahau","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Kutai Timur","lokasi":"Kutai Timur","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-166","jenisOperator":"Bandar Udara","namaOperator":"Mugi","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Nduga","lokasi":"Nduga","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-167","jenisOperator":"Bandar Udara","namaOperator":"Muhammad Taufiq Kiemas","kodeOperator":"KXI","iata":"KXI","icao":"","provinsi":"","kabkota":"Kab, Pesisir barat","lokasi":"Kab, Pesisir barat","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-168","jenisOperator":"Bandar Udara","namaOperator":"Muko-Muko","kodeOperator":"MPC","iata":"MPC","icao":"","provinsi":"","kabkota":"Muko-Muko","lokasi":"Muko-Muko","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-169","jenisOperator":"Bandar Udara","namaOperator":"Mulia","kodeOperator":"OHI","iata":"OHI","icao":"","provinsi":"","kabkota":"Kab. Puncak Jaya","lokasi":"Kab. Puncak Jaya","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-170","jenisOperator":"Bandar Udara","namaOperator":"Mutiara","kodeOperator":"PLW","iata":"PLW","icao":"","provinsi":"","kabkota":"Palu","lokasi":"Palu","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-171","jenisOperator":"Bandar Udara","namaOperator":"Naha","kodeOperator":"NAH","iata":"NAH","icao":"","provinsi":"","kabkota":"Tahuna","lokasi":"Tahuna","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-172","jenisOperator":"Bandar Udara","namaOperator":"Namlea","kodeOperator":"NAM","iata":"NAM","icao":"","provinsi":"","kabkota":"Pulau Buru","lokasi":"Pulau Buru","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-173","jenisOperator":"Bandar Udara","namaOperator":"Namrole","kodeOperator":"NRE","iata":"NRE","icao":"","provinsi":"","kabkota":"Pulau Buru","lokasi":"Pulau Buru","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-174","jenisOperator":"Bandar Udara","namaOperator":"Nanga Pinoh","kodeOperator":"NPO","iata":"NPO","icao":"","provinsi":"","kabkota":"Nanga Pinoh","lokasi":"Nanga Pinoh","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-175","jenisOperator":"Bandar Udara","namaOperator":"Ngloram","kodeOperator":"CPF","iata":"CPF","icao":"","provinsi":"","kabkota":"Blora","lokasi":"Blora","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-176","jenisOperator":"Bandar Udara","namaOperator":"Ngurah Rai","kodeOperator":"DPS","iata":"DPS","icao":"","provinsi":"","kabkota":"Bali (Denpasar)","lokasi":"Bali (Denpasar)","kelas":"A","status":"Aktif","aktif":true},{"operatorId":"BD-177","jenisOperator":"Bandar Udara","namaOperator":"Notohadinegoro","kodeOperator":"JBB","iata":"JBB","icao":"","provinsi":"","kabkota":"Jember","lokasi":"Jember","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-178","jenisOperator":"Bandar Udara","namaOperator":"Numfor","kodeOperator":"FOO","iata":"FOO","icao":"","provinsi":"","kabkota":"Biak","lokasi":"Biak","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-179","jenisOperator":"Bandar Udara","namaOperator":"Nunukan","kodeOperator":"NNX","iata":"NNX","icao":"","provinsi":"","kabkota":"Nunukan","lokasi":"Nunukan","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-180","jenisOperator":"Bandar Udara","namaOperator":"Nusawiru","kodeOperator":"CJN","iata":"CJN","icao":"","provinsi":"","kabkota":"Ciamis","lokasi":"Ciamis","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-181","jenisOperator":"Bandar Udara","namaOperator":"Oesman Sadik","kodeOperator":"LAH","iata":"LAH","icao":"","provinsi":"","kabkota":"Labuha","lokasi":"Labuha","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-182","jenisOperator":"Bandar Udara","namaOperator":"Okaba","kodeOperator":"OKQ","iata":"OKQ","icao":"","provinsi":"","kabkota":"Okaba","lokasi":"Okaba","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-183","jenisOperator":"Bandar Udara","namaOperator":"Oksibil","kodeOperator":"OKL","iata":"OKL","icao":"","provinsi":"","kabkota":"Oksibil","lokasi":"Oksibil","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-184","jenisOperator":"Bandar Udara","namaOperator":"Pagerungan","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Sumenep","lokasi":"Sumenep","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-185","jenisOperator":"Bandar Udara","namaOperator":"Pangsuma","kodeOperator":"PSU","iata":"PSU","icao":"","provinsi":"","kabkota":"Putussibau","lokasi":"Putussibau","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-186","jenisOperator":"Bandar Udara","namaOperator":"Panua Pohuwato","kodeOperator":"PWX","iata":"PWX","icao":"","provinsi":"","kabkota":"Pohuwato","lokasi":"Pohuwato","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-187","jenisOperator":"Bandar Udara","namaOperator":"Paro","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Nduga","lokasi":"Nduga","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-188","jenisOperator":"Bandar Udara","namaOperator":"Pasir Pangaraian","kodeOperator":"PPR","iata":"PPR","icao":"","provinsi":"","kabkota":"Pasir Pangaraian","lokasi":"Pasir Pangaraian","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-189","jenisOperator":"Bandar Udara","namaOperator":"Pattimura","kodeOperator":"AMQ","iata":"AMQ","icao":"","provinsi":"","kabkota":"Ambon","lokasi":"Ambon","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-190","jenisOperator":"Bandar Udara","namaOperator":"Pinang Kampai","kodeOperator":"DUM","iata":"DUM","icao":"","provinsi":"","kabkota":"Dumai","lokasi":"Dumai","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-191","jenisOperator":"Bandar Udara","namaOperator":"Pitu","kodeOperator":"OTI","iata":"OTI","icao":"","provinsi":"","kabkota":"Morotai","lokasi":"Morotai","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-192","jenisOperator":"Bandar Udara","namaOperator":"Pogogul","kodeOperator":"UOL","iata":"UOL","icao":"","provinsi":"","kabkota":"Buol","lokasi":"Buol","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-193","jenisOperator":"Bandar Udara","namaOperator":"Pondok Cabe","kodeOperator":"PCB","iata":"PCB","icao":"","provinsi":"","kabkota":"Tanggerang Selatan","lokasi":"Tanggerang Selatan","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-194","jenisOperator":"Bandar Udara","namaOperator":"Potowaiburu","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Mimika","lokasi":"Mimika","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-195","jenisOperator":"Bandar Udara","namaOperator":"Pusako Anak Nagari","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Pasaman Barat","lokasi":"Pasaman Barat","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-196","jenisOperator":"Bandar Udara","namaOperator":"Radin Inten II","kodeOperator":"TKG","iata":"TKG","icao":"","provinsi":"","kabkota":"Tanjung Karang (Bandar Lampung)","lokasi":"Tanjung Karang (Bandar Lampung)","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-197","jenisOperator":"Bandar Udara","namaOperator":"Rahadi Oesman","kodeOperator":"KTG","iata":"KTG","icao":"","provinsi":"","kabkota":"Ketapang","lokasi":"Ketapang","kelas":"F","status":"Aktif","aktif":true},{"operatorId":"BD-198","jenisOperator":"Bandar Udara","namaOperator":"Raja Haji Abdullah","kodeOperator":"TJB","iata":"TJB","icao":"","provinsi":"","kabkota":"Tanjung Balai Karimun","lokasi":"Tanjung Balai Karimun","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-199","jenisOperator":"Bandar Udara","namaOperator":"Raja Haji Fisabilillah","kodeOperator":"TNJ","iata":"TNJ","icao":"","provinsi":"","kabkota":"Tanjung Pinang","lokasi":"Tanjung Pinang","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-200","jenisOperator":"Bandar Udara","namaOperator":"Raja Sisingamangaraja XII","kodeOperator":"DTB","iata":"DTB","icao":"","provinsi":"","kabkota":"Siborong-Borong","lokasi":"Siborong-Borong","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-201","jenisOperator":"Bandar Udara","namaOperator":"Rampi","kodeOperator":"RMP","iata":"RMP","icao":"","provinsi":"","kabkota":"Rampi","lokasi":"Rampi","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-202","jenisOperator":"Bandar Udara","namaOperator":"Ranai","kodeOperator":"NTX","iata":"NTX","icao":"","provinsi":"","kabkota":"Natuna","lokasi":"Natuna","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-203","jenisOperator":"Bandar Udara","namaOperator":"Rembele","kodeOperator":"TXE","iata":"TXE","icao":"","provinsi":"","kabkota":"Takengon","lokasi":"Takengon","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-204","jenisOperator":"Bandar Udara","namaOperator":"Rendani","kodeOperator":"MKW","iata":"MKW","icao":"","provinsi":"","kabkota":"Manokwari","lokasi":"Manokwari","kelas":"E","status":"Aktif","aktif":true},{"operatorId":"BD-205","jenisOperator":"Bandar Udara","namaOperator":"Sam Ratulangi","kodeOperator":"MDC","iata":"MDC","icao":"","provinsi":"","kabkota":"Manado","lokasi":"Manado","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-206","jenisOperator":"Bandar Udara","namaOperator":"Sanggu","kodeOperator":"SGQ","iata":"SGQ","icao":"","provinsi":"","kabkota":"Buntok","lokasi":"Buntok","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-207","jenisOperator":"Bandar Udara","namaOperator":"Sangia Nibandera","kodeOperator":"SQR","iata":"SQR","icao":"","provinsi":"","kabkota":"Kolaka","lokasi":"Kolaka","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-208","jenisOperator":"Bandar Udara","namaOperator":"Seko","kodeOperator":"SKO","iata":"SKO","icao":"","provinsi":"","kabkota":"Luwu Utara","lokasi":"Luwu Utara","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-209","jenisOperator":"Bandar Udara","namaOperator":"Senggeh","kodeOperator":"SEH","iata":"SEH","icao":"","provinsi":"","kabkota":"Senggeh","lokasi":"Senggeh","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-210","jenisOperator":"Bandar Udara","namaOperator":"Senggo","kodeOperator":"ZEG","iata":"ZEG","icao":"","provinsi":"","kabkota":"Senggo","lokasi":"Senggo","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-211","jenisOperator":"Bandar Udara","namaOperator":"Sentani","kodeOperator":"DJJ","iata":"DJJ","icao":"","provinsi":"","kabkota":"Jayapura","lokasi":"Jayapura","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-212","jenisOperator":"Bandar Udara","namaOperator":"Sepinggan","kodeOperator":"BPN","iata":"BPN","icao":"","provinsi":"","kabkota":"Balikpapan","lokasi":"Balikpapan","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-213","jenisOperator":"Bandar Udara","namaOperator":"Sibisa","kodeOperator":"SIW","iata":"SIW","icao":"","provinsi":"","kabkota":"Kab. Toba","lokasi":"Kab. Toba","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-214","jenisOperator":"Bandar Udara","namaOperator":"Siboru","kodeOperator":"FKQ","iata":"FKQ","icao":"","provinsi":"","kabkota":"Fak-Fak","lokasi":"Fak-Fak","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-215","jenisOperator":"Bandar Udara","namaOperator":"Silampari","kodeOperator":"LLJ","iata":"LLJ","icao":"","provinsi":"","kabkota":"Lubuk Linggau","lokasi":"Lubuk Linggau","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-216","jenisOperator":"Bandar Udara","namaOperator":"Sinak","kodeOperator":"NKD","iata":"NKD","icao":"","provinsi":"","kabkota":"Puncak Jaya","lokasi":"Puncak Jaya","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-217","jenisOperator":"Bandar Udara","namaOperator":"Singkawang","kodeOperator":"SKJ","iata":"SKJ","icao":"","provinsi":"","kabkota":"Singkawang","lokasi":"Singkawang","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-218","jenisOperator":"Bandar Udara","namaOperator":"Sitaro","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Kep. Siau","lokasi":"Kep. Siau","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-219","jenisOperator":"Bandar Udara","namaOperator":"Smart Semelagi","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Sambas","lokasi":"Sambas","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-220","jenisOperator":"Bandar Udara","namaOperator":"Soa","kodeOperator":"BJW","iata":"BJW","icao":"","provinsi":"","kabkota":"Bajawa","lokasi":"Bajawa","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-221","jenisOperator":"Bandar Udara","namaOperator":"Sobaham","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Mamberamo Raya","lokasi":"Mamberamo Raya","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-222","jenisOperator":"Bandar Udara","namaOperator":"Soekarno-Hatta","kodeOperator":"CGK","iata":"CGK","icao":"","provinsi":"","kabkota":"Cengkareng (Jakarta)","lokasi":"Cengkareng (Jakarta)","kelas":"A","status":"Aktif","aktif":true},{"operatorId":"BD-223","jenisOperator":"Bandar Udara","namaOperator":"Sorowako","kodeOperator":"SQR","iata":"SQR","icao":"","provinsi":"","kabkota":"Luwu Timur","lokasi":"Luwu Timur","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-224","jenisOperator":"Bandar Udara","namaOperator":"Stevanus Rumbewas","kodeOperator":"ZRI","iata":"ZRI","icao":"","provinsi":"","kabkota":"Serui","lokasi":"Serui","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-225","jenisOperator":"Bandar Udara","namaOperator":"Sugimanuru","kodeOperator":"RAQ","iata":"RAQ","icao":"","provinsi":"","kabkota":"Muna","lokasi":"Muna","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-226","jenisOperator":"Bandar Udara","namaOperator":"Sultan Babullah","kodeOperator":"TTE","iata":"TTE","icao":"","provinsi":"","kabkota":"Ternate","lokasi":"Ternate","kelas":"F","status":"Aktif","aktif":true},{"operatorId":"BD-227","jenisOperator":"Bandar Udara","namaOperator":"Sultan Bantilan","kodeOperator":"TLI","iata":"TLI","icao":"","provinsi":"","kabkota":"Toli-Toli","lokasi":"Toli-Toli","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-228","jenisOperator":"Bandar Udara","namaOperator":"Sultan Hasanuddin","kodeOperator":"UPG","iata":"UPG","icao":"","provinsi":"","kabkota":"Makassar","lokasi":"Makassar","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-229","jenisOperator":"Bandar Udara","namaOperator":"Sultan Iskandar Muda","kodeOperator":"BTJ","iata":"BTJ","icao":"","provinsi":"","kabkota":"Banda Aceh","lokasi":"Banda Aceh","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-230","jenisOperator":"Bandar Udara","namaOperator":"Sultan Mahmud Badaruddin II","kodeOperator":"PLM","iata":"PLM","icao":"","provinsi":"","kabkota":"Palembang","lokasi":"Palembang","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-231","jenisOperator":"Bandar Udara","namaOperator":"Sultan Muhammad Kaharuddin","kodeOperator":"SWQ","iata":"SWQ","icao":"","provinsi":"","kabkota":"Sumbawa Besar","lokasi":"Sumbawa Besar","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-232","jenisOperator":"Bandar Udara","namaOperator":"Sultan Muhammad Salahuddin","kodeOperator":"BMU","iata":"BMU","icao":"","provinsi":"","kabkota":"Bima","lokasi":"Bima","kelas":"F","status":"Aktif","aktif":true},{"operatorId":"BD-233","jenisOperator":"Bandar Udara","namaOperator":"Sultan Syarif Haroen Setia Negara","kodeOperator":"RPL","iata":"RPL","icao":"","provinsi":"","kabkota":"Pelalawan","lokasi":"Pelalawan","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-234","jenisOperator":"Bandar Udara","namaOperator":"Sultan Syarif Kasim II","kodeOperator":"PKU","iata":"PKU","icao":"","provinsi":"","kabkota":"Pekanbaru","lokasi":"Pekanbaru","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-235","jenisOperator":"Bandar Udara","namaOperator":"Sultan Thaha","kodeOperator":"DJB","iata":"DJB","icao":"","provinsi":"","kabkota":"Jambi","lokasi":"Jambi","kelas":"E","status":"Aktif","aktif":true},{"operatorId":"BD-236","jenisOperator":"Bandar Udara","namaOperator":"Sumarorong","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Mamasa","lokasi":"Mamasa","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-237","jenisOperator":"Bandar Udara","namaOperator":"Supadio","kodeOperator":"PNK","iata":"PNK","icao":"","provinsi":"","kabkota":"Pontianak","lokasi":"Pontianak","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-238","jenisOperator":"Bandar Udara","namaOperator":"Syamsudin Noor","kodeOperator":"BDJ","iata":"BDJ","icao":"","provinsi":"","kabkota":"Banjarmasin","lokasi":"Banjarmasin","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-239","jenisOperator":"Bandar Udara","namaOperator":"Syekh Hamzah Fansury","kodeOperator":"WIMI","iata":"WIMI","icao":"","provinsi":"","kabkota":"Singkil","lokasi":"Singkil","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-240","jenisOperator":"Bandar Udara","namaOperator":"Syukuran Aminuddin Amir","kodeOperator":"LUW","iata":"LUW","icao":"","provinsi":"","kabkota":"Luwuk","lokasi":"Luwuk","kelas":"F","status":"Aktif","aktif":true},{"operatorId":"BD-241","jenisOperator":"Bandar Udara","namaOperator":"Taive","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Tolikara","lokasi":"Tolikara","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-242","jenisOperator":"Bandar Udara","namaOperator":"Tambelan","kodeOperator":"TBX","iata":"TBX","icao":"","provinsi":"","kabkota":"Bintan","lokasi":"Bintan","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-243","jenisOperator":"Bandar Udara","namaOperator":"Tambolaka","kodeOperator":"TMC","iata":"TMC","icao":"","provinsi":"","kabkota":"Waikabubak","lokasi":"Waikabubak","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-244","jenisOperator":"Bandar Udara","namaOperator":"Tampa Padang","kodeOperator":"MJU","iata":"MJU","icao":"","provinsi":"","kabkota":"Mamuju","lokasi":"Mamuju","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-245","jenisOperator":"Bandar Udara","namaOperator":"Tanah Merah","kodeOperator":"TMH","iata":"TMH","icao":"","provinsi":"","kabkota":"Tanah Merah","lokasi":"Tanah Merah","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-246","jenisOperator":"Bandar Udara","namaOperator":"Tanjung Api Ampana","kodeOperator":"OJU","iata":"OJU","icao":"","provinsi":"","kabkota":"Ampana","lokasi":"Ampana","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-247","jenisOperator":"Bandar Udara","namaOperator":"Tanjung Bara","kodeOperator":"TJC","iata":"TJC","icao":"","provinsi":"","kabkota":"Kutai Timur","lokasi":"Kutai Timur","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-248","jenisOperator":"Bandar Udara","namaOperator":"Tanjung Harapan","kodeOperator":"TJS","iata":"TJS","icao":"","provinsi":"","kabkota":"Tanjung Selor","lokasi":"Tanjung Selor","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-249","jenisOperator":"Bandar Udara","namaOperator":"Tanjung Warukin","kodeOperator":"TJG","iata":"TJG","icao":"","provinsi":"","kabkota":"Tanjung","lokasi":"Tanjung","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-250","jenisOperator":"Bandar Udara","namaOperator":"Tardamu","kodeOperator":"SAU","iata":"SAU","icao":"","provinsi":"","kabkota":"Sabu","lokasi":"Sabu","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-251","jenisOperator":"Bandar Udara","namaOperator":"Tebelian","kodeOperator":"SQG","iata":"SQG","icao":"","provinsi":"","kabkota":"Sintang","lokasi":"Sintang","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-252","jenisOperator":"Bandar Udara","namaOperator":"Teminabuan","kodeOperator":"TXM","iata":"TXM","icao":"","provinsi":"","kabkota":"Teminabuan","lokasi":"Teminabuan","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-253","jenisOperator":"Bandar Udara","namaOperator":"Tempuling","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Indragiri Hilir","lokasi":"Indragiri Hilir","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-254","jenisOperator":"Bandar Udara","namaOperator":"Teraplu","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Pengunungan Bintang","lokasi":"Pengunungan Bintang","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-255","jenisOperator":"Bandar Udara","namaOperator":"Teuku Cut Ali","kodeOperator":"TPK","iata":"TPK","icao":"","provinsi":"","kabkota":"Tapak Tuan","lokasi":"Tapak Tuan","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-256","jenisOperator":"Bandar Udara","namaOperator":"Tiom","kodeOperator":"TIO","iata":"TIO","icao":"","provinsi":"","kabkota":"Tiom","lokasi":"Tiom","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-257","jenisOperator":"Bandar Udara","namaOperator":"Tjilik Riwut","kodeOperator":"PKY","iata":"PKY","icao":"","provinsi":"","kabkota":"Palangkaraya","lokasi":"Palangkaraya","kelas":"F","status":"Aktif","aktif":true},{"operatorId":"BD-258","jenisOperator":"Bandar Udara","namaOperator":"Toraja","kodeOperator":"TRT","iata":"TRT","icao":"","provinsi":"","kabkota":"Tana Toraja","lokasi":"Tana Toraja","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-259","jenisOperator":"Bandar Udara","namaOperator":"Torea","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Fak-Fak","lokasi":"Fak-Fak","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-260","jenisOperator":"Bandar Udara","namaOperator":"Towe Hitam","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Keerom","lokasi":"Keerom","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-261","jenisOperator":"Bandar Udara","namaOperator":"Trunojoyo","kodeOperator":"SUP","iata":"SUP","icao":"","provinsi":"","kabkota":"Sumenep","lokasi":"Sumenep","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-262","jenisOperator":"Bandar Udara","namaOperator":"Tsingga","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Tsingga","lokasi":"Tsingga","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-263","jenisOperator":"Bandar Udara","namaOperator":"Tuanku Tambusai","kodeOperator":"PPR","iata":"PPR","icao":"","provinsi":"","kabkota":"Rokan Hulu","lokasi":"Rokan Hulu","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-264","jenisOperator":"Bandar Udara","namaOperator":"Tumbang Samba","kodeOperator":"TBM","iata":"TBM","icao":"","provinsi":"","kabkota":"Kaltingan","lokasi":"Kaltingan","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-265","jenisOperator":"Bandar Udara","namaOperator":"Tunggul Wulung","kodeOperator":"CXP","iata":"CXP","icao":"","provinsi":"","kabkota":"Cilacap","lokasi":"Cilacap","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-266","jenisOperator":"Bandar Udara","namaOperator":"Umbu Mehang Kunda","kodeOperator":"WGP","iata":"WGP","icao":"","provinsi":"","kabkota":"Waingapu","lokasi":"Waingapu","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-267","jenisOperator":"Bandar Udara","namaOperator":"Utarom","kodeOperator":"KNG","iata":"KNG","icao":"","provinsi":"","kabkota":"Kaimana","lokasi":"Kaimana","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-268","jenisOperator":"Bandar Udara","namaOperator":"Waghte","kodeOperator":"WET","iata":"WET","icao":"","provinsi":"","kabkota":"Waghte","lokasi":"Waghte","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-269","jenisOperator":"Bandar Udara","namaOperator":"Wahai","kodeOperator":"WBA","iata":"WBA","icao":"","provinsi":"","kabkota":"Pulau Seram","lokasi":"Pulau Seram","kelas":"H","status":"Aktif","aktif":true},{"operatorId":"BD-270","jenisOperator":"Bandar Udara","namaOperator":"Wamena","kodeOperator":"WMX","iata":"WMX","icao":"","provinsi":"","kabkota":"Wamena","lokasi":"Wamena","kelas":"F","status":"Aktif","aktif":true},{"operatorId":"BD-271","jenisOperator":"Bandar Udara","namaOperator":"Wangbe","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Wangbe","lokasi":"Wangbe","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-272","jenisOperator":"Bandar Udara","namaOperator":"Wasior","kodeOperator":"WSR","iata":"WSR","icao":"","provinsi":"","kabkota":"Wasior","lokasi":"Wasior","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-273","jenisOperator":"Bandar Udara","namaOperator":"Weda Bay","kodeOperator":"WED","iata":"WED","icao":"","provinsi":"","kabkota":"Weda Bay","lokasi":"Weda Bay","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-274","jenisOperator":"Bandar Udara","namaOperator":"Werur","kodeOperator":"WRR","iata":"WRR","icao":"","provinsi":"","kabkota":"Werur","lokasi":"Werur","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-275","jenisOperator":"Bandar Udara","namaOperator":"Wiriadinata","kodeOperator":"TSY","iata":"TSY","icao":"","provinsi":"","kabkota":"Tasikmalaya","lokasi":"Tasikmalaya","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-276","jenisOperator":"Bandar Udara","namaOperator":"Wonopito","kodeOperator":"LWE","iata":"LWE","icao":"","provinsi":"","kabkota":"Lewoleba","lokasi":"Lewoleba","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-277","jenisOperator":"Bandar Udara","namaOperator":"Yakuhimo/Nop Goliat Dekai","kodeOperator":"DEK","iata":"DEK","icao":"","provinsi":"","kabkota":"Dekai","lokasi":"Dekai","kelas":"G","status":"Aktif","aktif":true},{"operatorId":"BD-278","jenisOperator":"Bandar Udara","namaOperator":"Yaniruma","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Boven Digoel","lokasi":"Boven Digoel","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-279","jenisOperator":"Bandar Udara","namaOperator":"Yogyakarta International Airport","kodeOperator":"YIA","iata":"YIA","icao":"","provinsi":"","kabkota":"Kulon Progo","lokasi":"Kulon Progo","kelas":"C","status":"Aktif","aktif":true},{"operatorId":"BD-280","jenisOperator":"Bandar Udara","namaOperator":"Yunuf","kodeOperator":"","iata":"","icao":"","provinsi":"","kabkota":"Keerom","lokasi":"Keerom","kelas":"","status":"Aktif","aktif":true},{"operatorId":"BD-281","jenisOperator":"Bandar Udara","namaOperator":"Yuvai Semaring","kodeOperator":"LBW","iata":"LBW","icao":"","provinsi":"","kabkota":"Long Bawan","lokasi":"Long Bawan","kelas":"G","status":"Aktif","aktif":true}];
// Transition V3.28: full 281-airport master copied from the current frontend master.
// Province values are intentionally preserved as-is; do not invent geography data.

function json_(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)}
function now_(){return new Date().toISOString()}
function ss_(){return SpreadsheetApp.getActiveSpreadsheet()}
function sheet_(name,headers){var s=ss_().getSheetByName(name);if(!s)s=ss_().insertSheet(name);ensureHeaders_(s,headers);return s}
function ensureHeaders_(s,headers){var cur=s.getLastColumn()?s.getRange(1,1,1,s.getLastColumn()).getValues()[0]:[];if(!cur.length){s.getRange(1,1,1,headers.length).setValues([headers]);return headers}var add=headers.filter(function(h){return cur.indexOf(h)<0});if(add.length)s.getRange(1,cur.length+1,1,add.length).setValues([add]);return s.getRange(1,1,1,s.getLastColumn()).getValues()[0]}
function rows_(s){var h=s.getLastColumn()?s.getRange(1,1,1,s.getLastColumn()).getValues()[0]:[];if(s.getLastRow()<2)return{h:h,a:[]};return{h:h,a:s.getRange(2,1,s.getLastRow()-1,h.length).getValues().filter(function(r){return r.some(function(v){return v!==""})})}}
function objs_(s){var x=rows_(s);return x.a.map(function(r){var o={};x.h.forEach(function(h,i){o[h]=r[i]});return o})}
function sanitizeCell_(v){
 if(v===undefined||v===null)return"";
 if(typeof v==="boolean"||typeof v==="number")return v;
 var s=String(v);
 // Cegah formula injection: nilai yang diawali =, +, -, @ dieksekusi sebagai
 // formula oleh Google Sheets bila ditulis apa adanya. Prefix apostrof
 // memaksa Sheets memperlakukannya sebagai teks murni (apostrof itu sendiri
 // tidak ikut tampil di sel).
 if(/^[=+\-@]/.test(s))return"'"+s;
 // V3.33: teks angka berawalan nol (kode kategori "01", No. HP "0812…") dipaksa tetap teks;
 // tanpa apostrof Sheets mengubahnya menjadi angka dan nol di depan hilang.
 if(/^0\d+$/.test(s))return"'"+s;
 return s;
}
function appendObj_(s,h,o){s.appendRow(h.map(function(k){return sanitizeCell_(o[k]===undefined||o[k]===null?"":o[k])}))}
function id_(p){return p+"-"+Utilities.getUuid().replace(/-/g,"").slice(0,20).toUpperCase()}
function token_(){return Utilities.getUuid().replace(/-/g,"").toUpperCase()}
function findBy_(s,key,val){var x=rows_(s),c=x.h.indexOf(key);if(c<0)return null;for(var i=0;i<x.a.length;i++)if(String(x.a[i][c])===String(val)){var o={};x.h.forEach(function(h,j){o[h]=x.a[i][j]});return{row:i+2,obj:o,h:x.h}}return null}
function publicOp_(o){return{operatorId:o.operatorId,jenisOperator:o.jenisOperator,namaOperator:o.namaOperator,kodeOperator:o.kodeOperator,iata:o.iata,provinsi:o.provinsi,kabkota:o.kabkota,lokasi:o.lokasi,kelas:o.kelas,status:o.status,aktif:o.aktif}}

// ============================================================
// SPRINT 1, POIN 3 — PERHITUNGAN RISIKO OTORITATIF DI SERVER
// Mirror persis dari BAND di client (lihat komentar), supaya rating yang
// ditampilkan dashboard SELALU konsisten dengan yang dihitung ulang di sini.
// Client TIDAK LAGI dipercaya untuk risikoNilai/risikoRating/*Rating.
// ============================================================
// V3.32 — Kriteria Risiko sesuai PR 16 DJPU 2024 Lampiran II (tidak diubah oleh PR 41 DJPU 2024).
var SERVER_BAND=[{min:3,max:7,l:"Rendah"},{min:8,max:13,l:"Menengah-Rendah"},{min:14,max:19,l:"Menengah"},{min:20,max:25,l:"Menengah-Tinggi"},{min:26,max:30,l:"Tinggi"}];
// V3.32 — Kategori penerimaan risiko (ALARP) sesuai PR 16 DJPU 2024 butir 4.2.13–4.2.14.
var PENERIMAAN={"Tinggi":"Tidak dapat ditoleransi","Menengah-Tinggi":"Tidak dapat ditoleransi","Menengah":"ALARP","Menengah-Rendah":"Dapat ditoleransi","Rendah":"Dapat ditoleransi"};
var COMPONENT_BAND=[{min:1,max:2,l:"Rendah"},{min:3,max:4,l:"Menengah-Rendah"},{min:5,max:6,l:"Menengah"},{min:7,max:8,l:"Menengah-Tinggi"},{min:9,max:10,l:"Tinggi"}];
function ratingTotal_(n){for(var i=0;i<SERVER_BAND.length;i++)if(n>=SERVER_BAND[i].min&&n<=SERVER_BAND[i].max)return SERVER_BAND[i].l;return""}
function ratingComponent_(n){for(var i=0;i<COMPONENT_BAND.length;i++)if(n>=COMPONENT_BAND[i].min&&n<=COMPONENT_BAND[i].max)return COMPONENT_BAND[i].l;return""}
// Menghitung ulang seluruh nilai risiko dari payload mentah, MENGABAIKAN
// risikoNilai/risikoRating/ancamanRating/kerentananRating/konsekuensiRating
// yang mungkin dikirim client. Dipanggil oleh createRisk_ dan updateRisk_.
function computeRisk_(p){
 var a=Number(p.ancamanNilai),k=Number(p.kerentananNilai),c=Number(p.konsekuensiNilai);
 var total=a+k+c;
 return{
  ancamanNilai:a,ancamanRating:ratingComponent_(a),
  kerentananNilai:k,kerentananRating:ratingComponent_(k),
  konsekuensiNilai:c,konsekuensiRating:ratingComponent_(c),
  risikoNilai:total,risikoRating:ratingTotal_(total),
  kategoriPenerimaan:PENERIMAAN[ratingTotal_(total)]||""
 };
}

function ensureSheetsOnly_(){
 // Dipanggil di HOT PATH (setiap doPost). Hanya memastikan header sheet ada
 // (operasi murah) — TIDAK menjalankan seedAirports_() yang men-scan 281
 // baris MASTER_OPERATOR di setiap request tulis.
 sheet_(SHEETS.OP,H.OP);sheet_(SHEETS.DPRK,H.DPRK);sheet_(SHEETS.DPRKVER,H.DPRKVER);sheet_(SHEETS.RISK,H.RISK);sheet_(SHEETS.HIST,H.HIST);sheet_(SHEETS.AUDIT,H.AUDIT);sheet_(SHEETS.ACCESS,H.ACCESS);sheet_(SHEETS.NOTIF,H.NOTIF);
}
function ensureSystem_(){
 // Dipanggil HANYA dari setupSystemV2() (setup awal, manual) — bukan dari
 // doPost. Melakukan seeding 281 bandara sekali di awal.
 ensureSheetsOnly_();
 seedAirports_();
}
function setupSystemV2(){
  // PRODUKSI: hanya memastikan struktur sheet dan master operator tersedia.
  // Migrasi legacy sudah selesai dan sengaja tidak dijalankan lagi.
  ensureSystem_();
  return "OK — struktur DPRK Nasional V3.29 hardened siap. Jalankan issueApiKeysForAllOperators() selanjutnya untuk menerbitkan API key operator.";
}
function seedAirports_(){
 var s=sheet_(SHEETS.OP,H.OP),old=objs_(s),seen={};old.forEach(function(x){seen[String(x.operatorId)]=true});
 var n=now_(),batch=[];
 AIRPORT_SEED.forEach(function(x){if(!seen[x.operatorId])batch.push(H.OP.map(function(k){return x[k]!==undefined?x[k]:(k==="createdAt"||k==="updatedAt"?n:"")}))});
 if(batch.length)s.getRange(s.getLastRow()+1,1,batch.length,H.OP.length).setValues(batch);
}

function cleanToken_(v){return String(v||"").trim();}
function normalizeText_(v){return String(v||"").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");}
function dateOnly_(v){var s=String(v||"").trim();return s?s.slice(0,10):"";}
function addYearsDate_(dateValue,years){
 var s=dateOnly_(dateValue);if(!s)return"";
 var d=new Date(s+"T00:00:00");if(isNaN(d.getTime()))return"";
 d.setFullYear(d.getFullYear()+Number(years||0));
 return d.toISOString().slice(0,10);
}
function assessmentKey_(operatorId,dprkId,bulan,tahun,kategori,skenario){
 return [operatorId,dprkId,String(tahun||""),String(bulan||"").toLowerCase(),String(kategori||"").split(" - ")[0],normalizeText_(skenario)].join("|");
}
function redact_(o){
 var x={};Object.keys(o||{}).forEach(function(k){if(k!=="editToken"&&k!=="dprkEditToken")x[k]=o[k]});return x;
}
function safeJson_(o){try{return JSON.stringify(redact_(o))}catch(e){return"{}"}}
function audit_(p,entityType,entityId,action,beforeData,afterData,requestId,reason){
 appendObj_(sheet_(SHEETS.AUDIT,H.AUDIT),H.AUDIT,{auditId:id_("AUD"),timestamp:now_(),actorType:p&&p._auth?"USER_LOGIN":(p&&p.editToken?"RISK_EDIT_TOKEN":(p&&p.dprkEditToken?"DPRK_EDIT_TOKEN":"OPERATOR_SUBMIT")),actorId:p&&p._auth?p._auth.email:((p&&p.operatorId)||""),entityType:entityType,entityId:entityId,action:action,reason:reason||"",beforeData:safeJson_(beforeData||{}),afterData:safeJson_(afterData||{}),requestId:requestId||id_("REQ")});
}
function findCurrentDprkByOperator_(oid){
 var a=objs_(sheet_(SHEETS.DPRK,H.DPRK)).filter(function(d){return d.operatorId===oid&&d.status==="Aktif"});
 a.sort(function(x,y){return String(y.updatedAt||y.createdAt||"").localeCompare(String(x.updatedAt||x.createdAt||""));});
 return a[0]||null;
}
function findRiskByAssessmentKey_(key,excludeId){
 var a=objs_(sheet_(SHEETS.RISK,H.RISK));
 for(var i=0;i<a.length;i++){
  var x=a[i],k=x.assessmentKey||assessmentKey_(x.operatorId,x.dprkId,x.bulan,x.tahun,x.kategori,x.skenario);
  if(k===key&&String(x.riskId)!==String(excludeId||""))return x;
 }
 return null;
}
function ensureDprkVersionRow_(d){
 if(!d||!d.dprkId)return null;
 var s=sheet_(SHEETS.DPRKVER,H.DPRKVER),a=objs_(s).filter(function(x){return x.dprkId===d.dprkId});
 if(a.length)return a.sort(function(x,y){return Number(y.versionNumber||0)-Number(x.versionNumber||0)})[0];
 var n=now_(),v={dprkVersionId:id_("DPRKV"),dprkId:d.dprkId,operatorId:d.operatorId,versionNumber:Number(d.versi||1),tanggalPenyusunan:d.tanggalPenyusunan||n,tanggalPengesahan:dateOnly_(d.tanggalPengesahan),tanggalWajibPembaruan:dateOnly_(d.tanggalWajibPembaruan)||addYearsDate_(d.tanggalPengesahan,2),linkFileDprk:d.linkFileDprk||"",namaPengisi:d.namaPengisi||"",jabatanPengisi:d.jabatanPengisi||"",riskOwner:d.riskOwner||"",emailRiskOwner:d.emailRiskOwner||"",status:d.status||"Aktif",createdAt:n,updatedAt:n};appendObj_(s,H.DPRKVER,v);return v;
}
function getCurrentDprk_(oid,year){
 var exact=objs_(sheet_(SHEETS.DPRK,H.DPRK)).filter(function(d){return d.operatorId===oid&&String(d.tahun)===String(year)&&d.status==="Aktif"})[0]||null;
 return exact||findCurrentDprkByOperator_(oid);
}

// ============================================================
// SPRINT 2 — CACHE UNTUK ENDPOINT BACA BERAT
// ============================================================
// dashboard/operators/risks melakukan full-scan sheet setiap dipanggil.
// Dengan cache singkat (TTL detik), banyak pemuatan dashboard beruntun oleh
// banyak pengunjung tidak perlu men-scan ulang sheet setiap saat, dan
// membantu menghindari limit kuota eksekusi harian Apps Script.
var CACHE_TTL_SECONDS=45;
var CACHE_KEYS={dashboard:"dprk_cache_dashboard_v2",operators:"dprk_cache_operators_v2",risks:"dprk_cache_risks_v2",master:"dprk_cache_master_v1"};
// V3.34 — CacheService membatasi 100 KB per kunci. Nilai yang lebih besar dipecah
// menjadi beberapa potongan; kunci utama hanya berisi penanda jumlah potongan.
// Menghapus kunci utama (removeAll/remove) sudah cukup untuk menginvalidasi.
var CACHE_CHUNK=80000;
function cacheGet_(key){try{var c=CacheService.getScriptCache(),v=c.get(key);if(!v)return null;
 if(v.indexOf('{"__chunks":')===0){var n=JSON.parse(v).__chunks,ks=[],i;for(i=0;i<n;i++)ks.push(key+"__"+i);var m=c.getAll(ks),str="";for(i=0;i<n;i++){if(m[ks[i]]==null)return null;str+=m[ks[i]]}return JSON.parse(str)}
 return JSON.parse(v)}catch(e){return null}}
function cachePut_(key,obj){try{var c=CacheService.getScriptCache(),str=JSON.stringify(obj);
 if(str.length<=CACHE_CHUNK){c.put(key,str,CACHE_TTL_SECONDS);return}
 var n=Math.ceil(str.length/CACHE_CHUNK),parts={};if(n>60)return;
 for(var i=0;i<n;i++)parts[key+"__"+i]=str.substr(i*CACHE_CHUNK,CACHE_CHUNK);
 c.putAll(parts,CACHE_TTL_SECONDS+30);c.put(key,JSON.stringify({__chunks:n}),CACHE_TTL_SECONDS)}catch(e){Logger.log("cachePut_ "+key+": "+e)}}
function invalidateDashboardCache_(){try{CacheService.getScriptCache().removeAll([CACHE_KEYS.dashboard,CACHE_KEYS.operators,CACHE_KEYS.risks,CACHE_KEYS.master])}catch(e){}}
function cached_(key,builder){var v=cacheGet_(key);if(v)return v;v=builder();cachePut_(key,v);return v}

function doGet(e){
 var p=(e&&e.parameter)||{},a=p.action||"dashboard";
 try{
  // Endpoint agregat/publik (dashboard, trend, review) tetap terbuka by design
  // (dashboard transparansi nasional). action=operators dan action=risks
  // mengembalikan daftar mentah per entitas — lihat REQUIRE_READ_KEY di atas
  // bila suatu saat perlu dibatasi.
  if((a==="operators"||a==="risks")&&!readKeyValid_(p)){
   return json_({ok:false,error:"Akses tidak diizinkan. Kunci baca tidak valid.",code:"FORBIDDEN"});
  }
  // GET hanya membaca data. Tidak menggunakan Script Lock agar beberapa
  // permintaan dashboard dapat berjalan bersamaan.
  if(a==="dashboard")return json_({ok:true,data:cached_(CACHE_KEYS.dashboard,dashboard_)});
  // V3.34: publik hanya menerima identitas operator (nama/lokasi), tanpa status DPRK.
  if(a==="operators")return json_({ok:true,data:cached_(CACHE_KEYS.master,operatorMaster_)});
  // V3.34: data per operator berklasifikasi Terbatas → hanya lewat POST riskData/operatorStatus/reviewList setelah login.
  if(a==="risks"||a==="review")return json_({ok:false,code:"AUTH_REQUIRED",error:"Data per operator berklasifikasi Terbatas dan hanya tersedia setelah login."});
  if(a==="trend")return json_({ok:true,data:trend_()});
  if(a==="incidents")return json_({ok:true,data:cached_(INC_CACHE_KEY,incidentsPublic_)});
  if(a==="incidentStatus")return incidentStatus_(p);
  if(a==="authConfig")return authConfig_();
  if(a==="find")return findEdit_(p);
  if(a==="finddprk")return findDprkToken_(p);
  return json_({ok:false,error:"Action tidak dikenali."});
 }catch(err){Logger.log("doGet error: "+err+" | stack: "+(err&&err.stack));return json_({ok:false,error:"Terjadi kesalahan saat membaca data. Coba lagi beberapa saat.",code:"READ_ERROR"})}
}
function latestCurrentRiskRows_(rows){
 var map={};
 (rows||[]).forEach(function(x){
  var key=assessmentKey_(x.operatorId,x.dprkId,x.bulan,x.tahun,x.kategori,x.skenario),dt=String(x.updatedAt||x.createdAt||"");
  if(!map[key]||dt>String(map[key].updatedAt||map[key].createdAt||""))map[key]=x;
 });
 return Object.keys(map).map(function(k){return map[k]});
}
function dashboard_(){
 var ops=objs_(sheet_(SHEETS.OP,H.OP)).filter(function(o){return String(o.aktif).toLowerCase()!=="false"}),d=objs_(sheet_(SHEETS.DPRK,H.DPRK)),raw=objs_(sheet_(SHEETS.RISK,H.RISK));
 var r=latestCurrentRiskRows_(raw),filled={},activeId={};
 ops.forEach(function(o){activeId[String(o.operatorId)]=true});
 d.filter(function(x){return x.status==="Aktif"}).forEach(function(x){filled[x.operatorId]=true});
 // V3.30: hanya operator AKTIF yang dihitung "Sudah Mengisi" (DPRK milik operator nonaktif tidak ikut).
 var total=ops.length,fn=ops.filter(function(o){return filled[o.operatorId]}).length,dist={"Tinggi":0,"Menengah-Tinggi":0,"Menengah":0,"Menengah-Rendah":0,"Rendah":0};
 r.forEach(function(x){if(dist.hasOwnProperty(x.risikoRating))dist[x.risikoRating]++});
 // V3.30: Risiko Tinggi per operator — operator aktif yang punya minimal 1 skenario berating Tinggi.
 var highOps={};r.forEach(function(x){if(x.risikoRating==="Tinggi"&&activeId[String(x.operatorId)])highOps[String(x.operatorId)]=x.jenisOperator||""});
 var cats={};r.forEach(function(x){var k=String(x.kategori||"").split(" - ")[0];if(!/^\d{2}$/.test(k))return;if(!cats[k])cats[k]={sum:0,n:0,ops:{}};cats[k].sum+=Number(x.risikoNilai)||0;cats[k].n++;cats[k].ops[String(x.operatorId)]=1});
 // V3.34: kategori yang dinilai < MIN_GROUP operator tidak ditampilkan (mencegah identifikasi satu operator).
 var cl=[];for(var i=1;i<=19;i++){var k=("0"+i).slice(-2),c=cats[k]||{sum:0,n:0,ops:{}},few=Object.keys(c.ops).length<MIN_GROUP;cl.push(few?{kode:k,avg:0,n:0,suppressed:c.n>0}:{kode:k,avg:Number((c.sum/c.n).toFixed(2)),n:c.n})}
 var byType=["Bandar Udara","Airlines","LPPNPI","Regulated Agent"].map(function(t){var oo=ops.filter(function(o){return o.jenisOperator===t}),ff=oo.filter(function(o){return filled[o.operatorId]}).length,hh=r.filter(function(x){return x.jenisOperator===t&&x.risikoRating==="Tinggi"}).length,ho=oo.filter(function(o){return highOps.hasOwnProperty(String(o.operatorId))}).length;return{jenisOperator:t,total:oo.length,filled:ff,risk:hh,riskOperators:ho}});
 // V3.30: Kaji Ulang Mendekat memakai Tanggal Kaji Ulang — sama dengan tabel Monitoring Kaji Ulang (review_) dan email pengingat.
 var rd=review_().length;
 var an=riskAnalytics_(r),natOk=!an._all.suppressed;
 if(!natOk){Object.keys(dist).forEach(function(k){dist[k]=0})}
 byType=byType.map(function(b){return an[b.jenisOperator]&&an[b.jenisOperator].suppressed?{jenisOperator:b.jenisOperator,total:b.total,filled:b.filled,riskSuppressed:true}:b});
 return{kpi:{totalEntities:total,filledEntities:fn,unfilledEntities:Math.max(0,total-fn),completionRate:total?Math.round(fn/total*100):0,completionRatePct:total?Number((fn/total*100).toFixed(1)):0,highRisk:natOk?dist.Tinggi:null,highRiskScenarios:natOk?dist.Tinggi:null,highRiskOperators:natOk?Object.keys(highOps).length:null,reviewDue:rd,totalRisks:natOk?r.length:null},byType:byType,riskDistribution:dist,categories:natOk?cl:[],analytics:an,trend:trend_()}
}

function operatorMonitoring_(){
 var ops=objs_(sheet_(SHEETS.OP,H.OP)),d=objs_(sheet_(SHEETS.DPRK,H.DPRK)),r=objs_(sheet_(SHEETS.RISK,H.RISK));
 return ops.filter(function(o){return String(o.aktif).toLowerCase()!=="false"}).map(function(o){var z=publicOp_(o),dr=d.filter(function(x){return x.operatorId===o.operatorId&&x.status==="Aktif"})[0];z.statusDprk=dr?"Sudah Mengisi":"Belum Mengisi";z.jumlahSkenario=r.filter(function(x){return x.operatorId===o.operatorId}).length;z.tanggalKaji=dr?dr.tanggalKajiUlang:"";return z})
}
// V3.34 — daftar identitas operator aktif untuk publik (formulir, pendaftaran, pelaporan).
function operatorMaster_(){
 return objs_(sheet_(SHEETS.OP,H.OP)).filter(function(o){return String(o.aktif).toLowerCase()!=="false"}).map(publicOp_);
}
// V3.34 — BACA DATA TERBATAS (wajib login). Admin: semua operator; Operator: hanya operatorIds miliknya.
var READ_ACTIONS=["riskData","operatorStatus","reviewList","riskDetail"];
function authRead_(p,a){
 var u=authSession_(p.sessionToken);
 if(!u)return json_({ok:false,code:"AUTH_REQUIRED",error:"Silakan masuk untuk melihat data ini."});
 if(a==="riskDetail")return riskDetail_(u,p);
 var data=a==="riskData"?cached_(CACHE_KEYS.risks,riskMonitoring_):a==="operatorStatus"?cached_(CACHE_KEYS.operators,operatorMonitoring_):review_();
 var all=u.peran==="Admin";
 return json_({ok:true,scope:all?"all":"own",data:all?data:data.filter(function(r){return authCanAccess_(u,r.operatorId)})});
}
// V3.36 — muat SATU skenario lengkap untuk diedit lewat akun yang login (tanpa kode referensi).
// Admin: semua operator; Operator: hanya operatorIds miliknya. Respons sama untuk "tidak ada" dan
// "bukan milik Anda" agar riskId operator lain tidak bisa ditebak keberadaannya.
// Metadata dokumen (tanggal pengesahan, email pemilik risiko, link file) diambil dari MASTER_DPRK
// supaya formulir edit terisi lengkap.
function isoDate_(v){
 if(Object.prototype.toString.call(v)==="[object Date]"&&!isNaN(v.getTime()))return Utilities.formatDate(v,Session.getScriptTimeZone()||"Asia/Jakarta","yyyy-MM-dd");
 var s=String(v||"").trim();return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):"";
}
function riskDetail_(u,p){
 var id=String(p.id||"").trim(),f=id?findRiskById_(id):null;
 if(!f||!authCanAccess_(u,f.obj.operatorId))return json_({ok:false,code:"NOT_FOUND",error:"Data risiko tidak ditemukan atau bukan milik akun Anda."});
 var out=redact_(f.obj),d=findCurrentDprkByOperator_(String(f.obj.operatorId||""));
 out.rowVersion=Number(f.obj.rowVersion||1);
 out.tanggalKaji=isoDate_(f.obj.tanggalKaji)||(d?isoDate_(d.tanggalKajiUlang):""); // isian awal dari tanggal kaji ulang DPRK bila kosong
 out.tanggalPengesahan=d?isoDate_(d.tanggalPengesahan):"";
 out.emailRiskOwner=d?String(d.emailRiskOwner||""):"";
 out.linkFileDprk=d?String(d.linkFileDprk||""):"";
 out.tanggalWajibPembaruan=d?(isoDate_(d.tanggalWajibPembaruan)||addYearsDate_(d.tanggalPengesahan,2)||""):"";
 return json_({ok:true,data:out});
}
// V3.34 — analitik agregat publik per jenis operator. Kelompok dengan kurang dari
// MIN_GROUP operator disembunyikan agar profil risiko satu operator tidak dapat dikenali.
// Ambang kerahasiaan agregat publik. 2 = keputusan Alex (19 Okt 2026) untuk masa awal;
// catatan: dengan 2 operator, masing-masing dapat menghitung angka operator lainnya. Standar umum = 3.
var MIN_GROUP=2;
function riskAnalytics_(rows){
 var out={};
 ["_all","Bandar Udara","Airlines","LPPNPI","Regulated Agent"].forEach(function(t){
  var rr=t==="_all"?rows:rows.filter(function(x){return x.jenisOperator===t}),os={};
  rr.forEach(function(x){if(x.operatorId)os[String(x.operatorId)]=1});
  var n=Object.keys(os).length;
  if(n<MIN_GROUP){out[t]={suppressed:true,operators:n,minGroup:MIN_GROUP};return}
  var dist={"Tinggi":0,"Menengah-Tinggi":0,"Menengah":0,"Menengah-Rendah":0,"Rendah":0},cats={};
  rr.forEach(function(x){
   if(dist.hasOwnProperty(x.risikoRating))dist[x.risikoRating]++;
   var k=String(x.kategori||"").split(" - ")[0].trim();if(!/^\d{2}$/.test(k))return;
   if(!cats[k])cats[k]={sum:0,n:0,ops:{}};cats[k].sum+=Number(x.risikoNilai)||0;cats[k].n++;cats[k].ops[String(x.operatorId)]=1;
  });
  out[t]={operators:n,totalRisks:rr.length,distribution:dist,categories:Object.keys(cats).sort().filter(function(k){return Object.keys(cats[k].ops).length>=MIN_GROUP}).map(function(k){return{kode:k,avg:Number((cats[k].sum/cats[k].n).toFixed(2)),n:cats[k].n}})};
 });
 // Supresi komplementer: bila total operator di kelompok yang disembunyikan 1–2, angkanya bisa
 // dihitung dari (nasional − kelompok yang tampil). Maka semua rincian per jenis ikut disembunyikan.
 var rem=0;["Bandar Udara","Airlines","LPPNPI","Regulated Agent"].forEach(function(t){if(out[t].suppressed)rem+=out[t].operators});
 if(rem>0&&rem<MIN_GROUP)["Bandar Udara","Airlines","LPPNPI","Regulated Agent"].forEach(function(t){if(!out[t].suppressed)out[t]={suppressed:true,complementary:true,operators:out[t].operators,minGroup:MIN_GROUP}});
 return out;
}
function riskMonitoring_(){return objs_(sheet_(SHEETS.RISK,H.RISK)).map(function(r){return{riskId:r.riskId,operatorId:String(r.operatorId||""),kategoriPenerimaan:r.kategoriPenerimaan||"",jenisOperator:r.jenisOperator,namaOperator:r.namaOperator,kategori:r.kategori,kategoriKode:String(r.kategori||"").split(" - ")[0],risikoNilai:Number(r.risikoNilai)||0,risikoRating:r.risikoRating,bulan:r.bulan,tahun:r.tahun}})}
function trend_(){
 var d=objs_(sheet_(SHEETS.DPRK,H.DPRK)),r=objs_(sheet_(SHEETS.RISK,H.RISK));
 var completion={},risk={};
 var bulanMap={"Januari":"01","Februari":"02","Maret":"03","April":"04","Mei":"05","Juni":"06","Juli":"07","Agustus":"08","September":"09","Oktober":"10","November":"11","Desember":"12"};
 d.filter(function(x){return x.status==="Aktif"&&x.operatorId}).forEach(function(x){
  var key="";
  if(x.tanggalPenyusunan){
   var dt=new Date(x.tanggalPenyusunan);
   if(!isNaN(dt.getTime()))key=dt.getFullYear()+"-"+("0"+(dt.getMonth()+1)).slice(-2);
  }
  if(!key){
   var tahun=String(x.tahun||"").trim(),periode=String(x.periode||"").trim(),bulan=bulanMap[periode]||periode;
   if(/^\d{1,2}$/.test(bulan))bulan=("0"+bulan).slice(-2);
   if(/^\d{4}$/.test(tahun)&&/^\d{2}$/.test(bulan))key=tahun+"-"+bulan;
  }
  if(!key)return;
  if(!completion[key])completion[key]={};
  completion[key][String(x.operatorId)]=true;
 });
 r.forEach(function(x){
  var tahun=String(x.tahun||"").trim(),bulan=String(x.bulan||"").trim();
  if(!tahun||!bulan)return;
  bulan=bulanMap[bulan]||bulan;
  if(/^\d{1,2}$/.test(bulan))bulan=("0"+bulan).slice(-2);
  if(!/^\d{4}$/.test(tahun)||!/^\d{2}$/.test(bulan))return;
  var key=tahun+"-"+bulan;
  if(!risk[key])risk[key]={sum:0,n:0,ops:{}};
  risk[key].sum+=Number(x.risikoNilai)||0;
  risk[key].n++;risk[key].ops[String(x.operatorId)]=1;
 });
 var all={};
 Object.keys(completion).forEach(function(k){all[k]=true});
 Object.keys(risk).forEach(function(k){all[k]=true});
 var keys=Object.keys(all).sort().slice(-12);
 return{
  labels:keys,
  filled:keys.map(function(k){return completion[k]?Object.keys(completion[k]).length:0}),
  // V3.34: rata-rata bulan dengan < MIN_GROUP operator tidak ditampilkan (null).
  risk:keys.map(function(k){return risk[k]&&risk[k].n&&Object.keys(risk[k].ops).length>=MIN_GROUP?Number((risk[k].sum/risk[k].n).toFixed(2)):null}),
  riskCount:keys.map(function(k){return risk[k]&&Object.keys(risk[k].ops).length>=MIN_GROUP?risk[k].n:null})
 };
}
function review_(){
 var d=objs_(sheet_(SHEETS.DPRK,H.DPRK)),t=new Date(),s=new Date(t.getTime()+30*86400000);
 return d.filter(function(x){if(!x.tanggalKajiUlang)return false;var z=new Date(x.tanggalKajiUlang);return z>=t&&z<=s}).map(function(x){return{operatorId:String(x.operatorId||""),jenisOperator:x.jenisOperator,namaOperator:x.namaOperator,tanggalKaji:x.tanggalKajiUlang,status:"Mendekat"}})
}
function findRiskById_(id){
 var s=sheet_(SHEETS.RISK,H.RISK),x=rows_(s),ci=x.h.indexOf("riskId");
 if(ci<0)return null;
 for(var i=0;i<x.a.length;i++){
  if(String(x.a[i][ci])===String(id)){
   var o={};x.h.forEach(function(h,j){o[h]=x.a[i][j]});
   return{row:i+2,obj:o,h:x.h};
  }
 }
 return null;
}
function findRiskToken_(id,tok){var s=sheet_(SHEETS.RISK,H.RISK),x=rows_(s),ci=x.h.indexOf("riskId"),ct=x.h.indexOf("editToken");for(var i=0;i<x.a.length;i++)if(String(x.a[i][ci])===id&&tok!==""&&String(x.a[i][ct])===tok){var o={};x.h.forEach(function(h,j){o[h]=x.a[i][j]});return{row:i+2,obj:o,h:x.h}}return null}
function findEdit_(p){var f=findRiskToken_(String(p.id||""),String(p.token||""));if(!f)return json_({ok:false,error:"Data tidak ditemukan atau kode referensi salah."});var out=redact_(f.obj),d=findCurrentDprkByOperator_(f.obj.operatorId);out.rowVersion=Number(f.obj.rowVersion||1);out.tanggalWajibPembaruan=d?dateOnly_(d.tanggalWajibPembaruan)||addYearsDate_(d.tanggalPengesahan,2):"";return json_({ok:true,data:out})}

// ============================================================
// SPRINT 1 (LANJUTAN) — VERIFIKASI KODE DPRK MANUAL
// Dipakai frontend saat pengguna menempel kode "operatorId|tahun::TOKEN"
// dari perangkat lain (mis. ganti laptop, serah-terima ke staf lain).
// Hanya mengembalikan info identitas non-sensitif untuk konfirmasi ke
// pengguna (bukan seluruh data DPRK) — token itu sendiri tidak pernah
// dikirim balik karena pemanggil sudah memilikinya.
// ============================================================
function findDprkByToken_(operatorId,tahun,tok){
 var s=sheet_(SHEETS.DPRK,H.DPRK),x=rows_(s),oi=x.h.indexOf("operatorId"),ti=x.h.indexOf("tahun"),tki=x.h.indexOf("dprkEditToken");
 if(oi<0||tki<0)return null;
 var hits=[];
 for(var i=0;i<x.a.length;i++){
  var sameOperator=String(x.a[i][oi])===String(operatorId),sameToken=String(x.a[i][tki])===String(tok)&&x.a[i][tki]!=="";
  var sameYear=!tahun||ti<0||String(x.a[i][ti])===String(tahun);
  if(sameOperator&&sameToken&&sameYear){var o={};x.h.forEach(function(h,j){o[h]=x.a[i][j]});hits.push(o);}
 }
 hits.sort(function(a,b){return String(b.updatedAt||"").localeCompare(String(a.updatedAt||""));});
 return hits[0]||null;
}
function findDprkToken_(p){
 var o=findDprkByToken_(p.operatorId,p.tahun,p.dprkToken);
 if(!o)return json_({ok:false,error:"Kode DPRK tidak ditemukan atau tidak cocok."});
 return json_({ok:true,data:{operatorId:o.operatorId,jenisOperator:o.jenisOperator,namaOperator:o.namaOperator,tahun:o.tahun,tanggalPengesahan:o.tanggalPengesahan||"",tanggalWajibPembaruan:o.tanggalWajibPembaruan||addYearsDate_(o.tanggalPengesahan,2)||""}});
}
function validate_(p){
 var e=[],req=["operatorId","jenisOperator","namaOperator","kategori","skenario","ancamanNilai","kerentananNilai","konsekuensiNilai"];
 req.forEach(function(k){if(p[k]===undefined||p[k]===null||String(p[k]).trim()==="")e.push(k+" wajib diisi")});
 ["ancamanNilai","kerentananNilai","konsekuensiNilai"].forEach(function(k){var n=Number(p[k]);if(!isFinite(n)||Math.floor(n)!==n||n<1||n>10)e.push(k+" harus bilangan bulat 1-10")});
 if(["Bandar Udara","Airlines","LPPNPI","Regulated Agent"].indexOf(p.jenisOperator)<0)e.push("Jenis operator tidak valid");
 var cat=String(p.kategori||"").trim().split(/\s*[—-]\s*/)[0];if(!/^(0[1-9]|1[0-9])$/.test(cat))e.push("Kategori risiko harus 01-19");
 if(!dateOnly_(p.tanggalPengesahan)&&!p.isExistingDprkUpdate)e.push("Tanggal pengesahan wajib diisi");
 var tp=dateOnly_(p.tanggalPengesahan),tk=dateOnly_(p.tanggalKaji);if(tp&&tk&&new Date(tk+"T00:00:00")<new Date(tp+"T00:00:00"))e.push("Tanggal kaji ulang tidak boleh lebih awal daripada tanggal pengesahan");
 if(p.emailRiskOwner&&(!/^\S+@\S+\.\S+$/.test(String(p.emailRiskOwner).trim())))e.push("Format email pemilik risiko tidak valid");
 return e;
}

function doPost(e){
 // V3.34: permintaan BACA data terbatas tidak memakai Script Lock (tidak mengantre di belakang simpan).
 var p0=null;try{p0=JSON.parse((e&&e.postData&&e.postData.contents)||"{}")}catch(x){}
 if(p0&&READ_ACTIONS.indexOf(p0.action)>=0){
  try{return authRead_(p0,p0.action)}catch(err){Logger.log("authRead_ error: "+err+" | stack: "+(err&&err.stack));return json_({ok:false,error:"Terjadi kesalahan saat membaca data. Coba lagi beberapa saat.",code:"READ_ERROR"})}
 }
 var lock=LockService.getScriptLock();
 try{
  if(!lock.tryLock(15000))return json_({ok:false,error:"Server sedang memproses permintaan lain. Silakan ulangi beberapa detik lagi.",code:"BUSY"});
  ensureSheetsOnly_();
  var p=JSON.parse(e.postData.contents||"{}"),a=p.action||"create";
  var gate=authGate_(p,a);if(gate)return gate;
  if(String(a).indexOf("auth")===0)return authPost_(p,a);
  if(a==="create")return createRisk_(p);
  if(a==="update")return updateRisk_(p);
  if(a==="renewDprk")return renewDprk_(p);
  if(a==="createIncident")return createIncident_(p);
  return json_({ok:false,error:"Action POST tidak dikenali."});
 }catch(err){Logger.log("doPost error: "+err+" | stack: "+(err&&err.stack));return json_({ok:false,error:"Terjadi kesalahan saat menyimpan data. Coba lagi beberapa saat.",code:"SERVER_ERROR"})}finally{try{lock.releaseLock()}catch(x){}}
}

// ============================================================
// SPRINT 1, POIN 2 — MASTER_OPERATOR: MERGE, BUKAN OVERWRITE
// Field master (kodeOperator/iata/icao/provinsi/kabkota/lokasi/kelas) HANYA
// diisi jika saat ini KOSONG di sheet DAN payload menyertakan nilai baru
// yang tidak kosong. Field yang sudah terisi TIDAK PERNAH ditimpa oleh
// submit skenario biasa — mencegah data 281 bandara terkorup oleh payload
// parsial dari form Airlines/LPPNPI/Regulated Agent.
// Jika suatu saat perlu koreksi data master secara sengaja, buat fungsi
// admin terpisah (mis. adminFixOperator_) yang dijalankan manual dari editor
// Apps Script, bukan lewat endpoint publik doPost.
// ============================================================
var OP_MERGE_FIELDS=["kodeOperator","iata","icao","provinsi","kabkota","lokasi","kelas"];
function upsertOperator_(p){
 var s=sheet_(SHEETS.OP,H.OP),f=findBy_(s,"operatorId",p.operatorId),n=now_();
 if(!f){
  var fresh={operatorId:p.operatorId,jenisOperator:p.jenisOperator,namaOperator:p.namaOperator,kodeOperator:p.kodeOperator||"",iata:p.iata||"",icao:p.icao||"",provinsi:p.provinsi||"",kabkota:p.kabkota||"",lokasi:p.lokasi||"",kelas:p.kelas||"",status:"Aktif",aktif:true,createdAt:n,updatedAt:n};
  appendObj_(s,H.OP,fresh);
  return fresh;
 }
 var merged={};
 H.OP.forEach(function(k){merged[k]=f.obj[k]});
 OP_MERGE_FIELDS.forEach(function(k){
  var current=String(merged[k]||"").trim();
  var incoming=String(p[k]||"").trim();
  if(!current&&incoming)merged[k]=incoming; // hanya isi kalau saat ini kosong
 });
 // namaOperator/jenisOperator boleh sinkron ulang (bukan data referensi rawan-korup)
 merged.namaOperator=p.namaOperator||merged.namaOperator;
 merged.jenisOperator=p.jenisOperator||merged.jenisOperator;
 merged.updatedAt=n;
 s.getRange(f.row,1,1,f.h.length).setValues([f.h.map(function(k){return sanitizeCell_(merged[k]!==undefined?merged[k]:"")})]);
 return merged;
}

// ============================================================
// SPRINT 1, POIN 1 — KEPEMILIKAN DPRK VIA dprkEditToken
// - DPRK baru: dibuat bersama dprkEditToken baru, dikembalikan ke client
//   sekali saja (mirip pola editToken pada risk) supaya pengisi resmi dapat
//   menyimpannya untuk sesi edit berikutnya.
// - DPRK yang SUDAH ADA: field identitas (email pemilik risiko, link file,
//   tanggal kaji ulang, nama/jabatan pengisi, risk owner) HANYA diperbarui
//   jika p.dprkEditToken cocok dengan token tersimpan. Jika token tidak
//   dikirim/tidak cocok, DPRK yang sudah ada TETAP DIPAKAI APA ADANYA
//   (skenario baru tetap bisa ditambahkan ke DPRK itu — hanya identitas
//   intinya yang dilindungi).
// ============================================================
function getOrCreateDprk_(p){
 var s=sheet_(SHEETS.DPRK,H.DPRK),d=findCurrentDprkByOperator_(p.operatorId),n=now_();
 if(d){
  var ownerMatch=!!p._auth||(!!d.dprkEditToken&&cleanToken_(p.dprkEditToken)===cleanToken_(d.dprkEditToken));
  if(ownerMatch){
   var before=JSON.parse(JSON.stringify(d));
   d.updatedAt=n;
   // Identity of operator remains immutable; only document metadata may change under DPRK token.
   d.periode=p.bulan||d.periode;
   d.tanggalPengesahan=dateOnly_(p.tanggalPengesahan)||dateOnly_(d.tanggalPengesahan);
   d.tanggalWajibPembaruan=addYearsDate_(d.tanggalPengesahan,2)||dateOnly_(d.tanggalWajibPembaruan);
   d.tanggalKajiUlang=dateOnly_(p.tanggalKaji)||dateOnly_(d.tanggalKajiUlang);
   d.linkFileDprk=p.linkFileDprk||d.linkFileDprk;
   d.namaPengisi=p.namaPengisi||d.namaPengisi;
   d.jabatanPengisi=p.jabatanPengisi||d.jabatanPengisi;
   d.riskOwner=p.riskOwner||d.riskOwner;
   d.emailRiskOwner=p.emailRiskOwner||d.emailRiskOwner;
   var f=findBy_(s,"dprkId",d.dprkId);
   s.getRange(f.row,1,1,f.h.length).setValues([f.h.map(function(k){return sanitizeCell_(d[k]===undefined?"":d[k])})]);
   ensureDprkVersionRow_(d);
   audit_(p,"DPRK",d.dprkId,"UPDATE",before,d,p.requestId,"Pembaruan metadata DPRK oleh pemegang token");
  }
  d._ownerMatch=ownerMatch;d._dprkTokenIssued=ownerMatch?d.dprkEditToken:null;
  return d;
 }
 if(!dateOnly_(p.tanggalPengesahan))throw Error("tanggalPengesahan wajib diisi untuk DPRK baru.");
 var newToken=token_(),due=addYearsDate_(p.tanggalPengesahan,2);
 d={dprkId:"DPRK-"+p.operatorId,operatorId:p.operatorId,jenisOperator:p.jenisOperator,namaOperator:p.namaOperator,periode:p.bulan||"",tahun:p.tahun||new Date().getFullYear(),versi:1,tanggalPenyusunan:n,tanggalPengesahan:dateOnly_(p.tanggalPengesahan),tanggalWajibPembaruan:due,tanggalKajiUlang:dateOnly_(p.tanggalKaji)||"",linkFileDprk:p.linkFileDprk||"",status:"Aktif",namaPengisi:p.namaPengisi||"",jabatanPengisi:p.jabatanPengisi||"",riskOwner:p.riskOwner||"",emailRiskOwner:p.emailRiskOwner||"",dprkEditToken:newToken,createdAt:n,updatedAt:n};
 appendObj_(s,H.DPRK,d);ensureDprkVersionRow_(d);d._ownerMatch=true;d._dprkTokenIssued=newToken;
 audit_(p,"DPRK",d.dprkId,"CREATE",{},d,p.requestId,"Pembuatan DPRK");
 return d;
}

function renewDprk_(p){
 var d=findCurrentDprkByOperator_(String(p.operatorId||""));
 if(!d)return json_({ok:false,error:"DPRK operator ini tidak ditemukan.",code:"NOT_FOUND"});
 if(!p._auth&&(!cleanToken_(p.dprkEditToken)||cleanToken_(p.dprkEditToken)!==cleanToken_(d.dprkEditToken)))return json_({ok:false,error:"Kode DPRK tidak valid atau bukan pemilik dokumen.",code:"FORBIDDEN"});
 if(!verifyApiKey_(d.operatorId,p.apiKey))return json_({ok:false,error:"Kunci akses tidak valid atau sudah dicabut. Hubungi admin sistem untuk mendapatkan kunci akses.",code:"FORBIDDEN"});
 var due=dateOnly_(d.tanggalWajibPembaruan)||addYearsDate_(d.tanggalPengesahan,2),today=dateOnly_(now_());
 if(due&&today<due&&!p.force)return json_({ok:false,error:"DPRK belum mencapai tanggal wajib pembaruan.",code:"RENEWAL_NOT_DUE",tanggalWajibPembaruan:due});
 if(!dateOnly_(p.tanggalPengesahanBaru))return json_({ok:false,error:"tanggalPengesahanBaru wajib diisi.",code:"VALIDATION_ERROR"});
 var s=sheet_(SHEETS.DPRK,H.DPRK),verS=sheet_(SHEETS.DPRKVER,H.DPRKVER),before=JSON.parse(JSON.stringify(d)),next=Number(d.versi||1)+1,n=now_(),newDue=addYearsDate_(p.tanggalPengesahanBaru,2);
 var ver={dprkVersionId:id_("DPRKV"),dprkId:d.dprkId,operatorId:d.operatorId,versionNumber:next,tanggalPenyusunan:n,tanggalPengesahan:dateOnly_(p.tanggalPengesahanBaru),tanggalWajibPembaruan:newDue,linkFileDprk:p.linkFileDprk||d.linkFileDprk,namaPengisi:p.namaPengisi||d.namaPengisi,jabatanPengisi:p.jabatanPengisi||d.jabatanPengisi,riskOwner:p.riskOwner||d.riskOwner,emailRiskOwner:p.emailRiskOwner||d.emailRiskOwner,status:"Aktif",createdAt:n,updatedAt:n};
 appendObj_(verS,H.DPRKVER,ver);
 d.versi=next;d.tahun=new Date(dateOnly_(p.tanggalPengesahanBaru)+"T00:00:00").getFullYear();d.tanggalPenyusunan=n;d.tanggalPengesahan=ver.tanggalPengesahan;d.tanggalWajibPembaruan=newDue;d.tanggalKajiUlang="";d.linkFileDprk=ver.linkFileDprk;d.namaPengisi=ver.namaPengisi;d.jabatanPengisi=ver.jabatanPengisi;d.riskOwner=ver.riskOwner;d.emailRiskOwner=ver.emailRiskOwner;d.updatedAt=n;
 var f=findBy_(s,"dprkId",d.dprkId);s.getRange(f.row,1,1,f.h.length).setValues([f.h.map(function(k){return sanitizeCell_(d[k]===undefined?"":d[k])})]);
 audit_(p,"DPRK",d.dprkId,"RENEW",before,d,p.requestId,"Pembaruan versi DPRK setelah jatuh tempo");
 invalidateDashboardCache_();
 return json_({ok:true,data:{dprkId:d.dprkId,version:next,tanggalPengesahan:d.tanggalPengesahan,tanggalWajibPembaruan:d.tanggalWajibPembaruan}});
}

function createRisk_(p){
 var er=validate_(p);if(er.length)return json_({ok:false,error:er.join(";"),code:"VALIDATION_ERROR"});
 if(!verifyApiKey_(p.operatorId,p.apiKey))return json_({ok:false,error:"Kunci akses tidak valid, sudah dicabut, atau tidak sesuai dengan operator ini. Hubungi admin sistem untuk mendapatkan kunci akses.",code:"FORBIDDEN"});
 var rid=cleanToken_(p.id)||id_("RISK"),tok=cleanToken_(p.editToken)||token_(),existing=findRiskById_(rid);
 if(existing){
  if(cleanToken_(existing.obj.editToken)===tok)return json_({ok:true,duplicate:true,retry:true,id:rid,editToken:tok,dprkId:existing.obj.dprkId||"",message:"Request sudah pernah diproses; data tidak dibuat ulang."});
  return json_({ok:false,error:"riskId sudah digunakan oleh risiko lain.",code:"RISK_ID_CONFLICT"});
 }
 var existingDprk=findCurrentDprkByOperator_(p.operatorId),prospectiveDprkId=existingDprk?existingDprk.dprkId:("DPRK-"+p.operatorId),akey=assessmentKey_(p.operatorId,prospectiveDprkId,p.bulan,p.tahun,p.kategori,p.skenario),dup=findRiskByAssessmentKey_(akey,"");
 if(dup)return json_({ok:false,error:"Assessment dengan operator, periode, kategori, dan skenario yang sama sudah ada.",code:"DUPLICATE_RISK",existingRiskId:dup.riskId});
 var op=upsertOperator_(p),d=getOrCreateDprk_(p),s=sheet_(SHEETS.RISK,H.RISK),n=now_(),risk=computeRisk_(p),o={riskId:rid,dprkId:d.dprkId,operatorId:op.operatorId,jenisOperator:op.jenisOperator,namaOperator:op.namaOperator,kategori:p.kategori,idRisikoKatalog:p.idRisikoKatalog||"",skenario:p.skenario,area:p.area||"",langkahSaatIni:p.langkahSaatIni||"",kerentananSaatIni:p.kerentananSaatIni||"",ancamanNilai:risk.ancamanNilai,ancamanRating:risk.ancamanRating,kerentananNilai:risk.kerentananNilai,kerentananRating:risk.kerentananRating,konsekuensiNilai:risk.konsekuensiNilai,konsekuensiRating:risk.konsekuensiRating,risikoNilai:risk.risikoNilai,risikoRating:risk.risikoRating,kategoriPenerimaan:risk.kategoriPenerimaan,perlakuan:p.perlakuan||"",prioritas:p.prioritas||"",langkahTambahan:p.langkahTambahan||"",pemilikRisiko:p.riskOwner||"",tanggalKaji:dateOnly_(p.tanggalKaji)||"",keterangan:p.keterangan||"",bulan:p.bulan||"",tahun:p.tahun||new Date().getFullYear(),assessmentKey:akey,rowVersion:1,namaPengisi:p.namaPengisi||"",jabatanPengisi:p.jabatanPengisi||"",createdAt:n,updatedAt:n,editToken:tok};
 appendObj_(s,H.RISK,o);appendHistory_(o,"Create",p.namaPengisi||"",1,{},o);audit_(p,"RISK",o.riskId,"CREATE",{},o,p.requestId,"Pembuatan assessment risiko");
 invalidateDashboardCache_();
 var resp={ok:true,duplicate:false,retry:false,id:rid,editToken:tok,dprkId:d.dprkId,tanggalPengesahan:d.tanggalPengesahan||"",tanggalWajibPembaruan:d.tanggalWajibPembaruan||""};if(d._dprkTokenIssued)resp.dprkEditToken=d._dprkTokenIssued;return json_(resp);
}
function updateRisk_(p){
 if(!p.id||(!p.editToken&&!p._auth))return json_({ok:false,error:"id dan editToken wajib",code:"VALIDATION_ERROR"});
 var f=p._auth?findRiskById_(String(p.id)):findRiskToken_(p.id,p.editToken);if(!f)return json_({ok:false,error:"Kode referensi tidak valid",code:"FORBIDDEN"});
 if(!verifyApiKey_(f.obj.operatorId,p.apiKey))return json_({ok:false,error:"Kunci akses tidak valid, sudah dicabut, atau tidak sesuai dengan operator ini. Hubungi admin sistem untuk mendapatkan kunci akses.",code:"FORBIDDEN"});
 var er=validate_(p);if(er.length)return json_({ok:false,error:er.join(";"),code:"VALIDATION_ERROR"});
 var old=f.obj,currentVersion=Number(old.rowVersion||1),incomingVersion=p.rowVersion===undefined?currentVersion:Number(p.rowVersion);
 if(incomingVersion!==currentVersion)return json_({ok:false,error:"Data sudah diperbarui oleh pengguna lain. Muat ulang data terbaru sebelum menyimpan.",code:"STALE_RECORD",rowVersion:currentVersion});
 // Immutable identity/period fields come from the server-side record, never the client.
 p.operatorId=old.operatorId;p.dprkId=old.dprkId;p.jenisOperator=old.jenisOperator;p.namaOperator=old.namaOperator;p.bulan=old.bulan;p.tahun=old.tahun;
 // V3.36: formulir mengirim "riskOwner", kolom sheet bernama "pemilikRisiko" (sebelumnya perubahan Pemilik Risiko saat edit tidak tersimpan).
 if(p.pemilikRisiko===undefined&&p.riskOwner!==undefined)p.pemilikRisiko=p.riskOwner;
 var key=assessmentKey_(old.operatorId,old.dprkId,old.bulan,old.tahun,p.kategori,p.skenario),dup=findRiskByAssessmentKey_(key,p.id);if(dup)return json_({ok:false,error:"Perubahan akan membuat duplicate assessment.",code:"DUPLICATE_RISK",existingRiskId:dup.riskId});
 var n=now_(),obj={},risk=computeRisk_(p),h=f.h;h.forEach(function(k){obj[k]=p[k]!==undefined?p[k]:(old[k]===undefined?"":old[k])});
 obj.riskId=old.riskId;obj.dprkId=old.dprkId;obj.operatorId=old.operatorId;obj.jenisOperator=old.jenisOperator;obj.namaOperator=old.namaOperator;obj.bulan=old.bulan;obj.tahun=old.tahun;obj.assessmentKey=key;obj.rowVersion=currentVersion+1;obj.ancamanNilai=risk.ancamanNilai;obj.ancamanRating=risk.ancamanRating;obj.kerentananNilai=risk.kerentananNilai;obj.kerentananRating=risk.kerentananRating;obj.konsekuensiNilai=risk.konsekuensiNilai;obj.konsekuensiRating=risk.konsekuensiRating;obj.risikoNilai=risk.risikoNilai;obj.risikoRating=risk.risikoRating;obj.kategoriPenerimaan=risk.kategoriPenerimaan;obj.updatedAt=n;obj.editToken=old.editToken;obj.createdAt=old.createdAt||n;
 sheet_(SHEETS.RISK,H.RISK).getRange(f.row,1,1,h.length).setValues([h.map(function(k){return sanitizeCell_(obj[k]===undefined?"":obj[k])})]);
 appendHistory_(obj,"Update",p.namaPengisi||"",obj.rowVersion,old,obj);audit_(p,"RISK",obj.riskId,"UPDATE",old,obj,p.requestId,"Perubahan assessment risiko");
 invalidateDashboardCache_();
 var resp={ok:true,id:obj.riskId,dprkId:obj.dprkId,rowVersion:obj.rowVersion};var dprkForResp=findCurrentDprkByOperator_(obj.operatorId);if(p.dprkEditToken&&dprkForResp&&cleanToken_(p.dprkEditToken)===cleanToken_(dprkForResp.dprkEditToken))resp.dprkEditToken=dprkForResp.dprkEditToken;return json_(resp);
}
function appendHistory_(r,change,user,rowVersion,beforeData,afterData){appendObj_(sheet_(SHEETS.HIST,H.HIST),H.HIST,{historyId:id_("HIST"),riskId:r.riskId,dprkId:r.dprkId,operatorId:r.operatorId,jenisOperator:r.jenisOperator,namaOperator:r.namaOperator,tanggal:now_(),bulan:r.bulan||"",tahun:r.tahun||"",nilaiAncaman:r.ancamanNilai||"",nilaiKerentanan:r.kerentananNilai||"",nilaiKonsekuensi:r.konsekuensiNilai||"",nilaiRisiko:r.risikoNilai||"",ratingRisiko:r.risikoRating||"",versiDprk:r.versiDprk||1,perubahan:change,updatedBy:user,rowVersion:rowVersion||1,beforeData:safeJson_(beforeData||{}),afterData:safeJson_(afterData||r)})}

function sendReviewReminders(){
 var d=objs_(sheet_(SHEETS.DPRK,H.DPRK)),log=sheet_(SHEETS.NOTIF,H.NOTIF),logs=objs_(log),sent={};logs.forEach(function(x){sent[x.dprkId+"|"+x.reminderType]=true});
 var today=new Date(),targets=[30,7];
 d.forEach(function(x){if(!x.emailRiskOwner||!x.tanggalKajiUlang)return;var dt=new Date(x.tanggalKajiUlang),days=Math.ceil((dt-today)/86400000);
  targets.forEach(function(n){var key=x.dprkId+"|H-"+n;if(days<=n&&days>=0&&!sent[key]){MailApp.sendEmail(x.emailRiskOwner,"Pengingat Kaji Ulang DPRK — "+x.namaOperator,"Kaji ulang DPRK mendekat. Entitas: "+x.namaOperator+". Tanggal kaji ulang: "+x.tanggalKajiUlang+".");appendObj_(log,H.NOTIF,{notificationId:id_("NOTIF"),dprkId:x.dprkId,operatorId:x.operatorId,jenisOperator:x.jenisOperator,namaOperator:x.namaOperator,riskOwner:x.riskOwner,email:x.emailRiskOwner,tanggalKaji:x.tanggalKajiUlang,reminderType:"H-"+n,statusEmail:"sent",sentAt:now_()})}})
 })
}
function createDailyReminderTrigger(){
 ScriptApp.getProjectTriggers().forEach(function(t){if(t.getHandlerFunction()==="sendReviewReminders")ScriptApp.deleteTrigger(t)});
 ScriptApp.newTrigger("sendReviewReminders").timeBased().everyDays(1).atHour(8).create();
 return "Trigger pengingat harian berhasil dibuat.";
}

// ============================================================
// PEMBERSIHAN SATU KALI — V3.34
// Membersihkan sisa data dari eksperimen login (username/password) dan
// sistem API-key yang sudah tidak dipakai lagi (REQUIRE_API_KEY=false),
// serta sheet SYSTEM_CONFIG yang tidak pernah dipakai kode manapun.
// Jalankan SATU KALI secara manual dari editor Apps Script (klik nama
// fungsi > Run), lalu boleh dihapus dari kode setelahnya. Aman dijalankan
// berkali-kali (idempotent) — tidak menghapus MASTER_OPERATOR/MASTER_DPRK/
// RISK_ASSESSMENT/RISK_HISTORY/AUDIT_LOG.
// ============================================================
function cleanupUnusedData_v1(){
 var report=[];
 // Kosongkan OPERATOR_USER (sisa eksperimen login username/password yang dibatalkan)
 report.push(clearSheetData_("OPERATOR_USER"));
 // Kosongkan ACCESS_TOKEN (sisa sistem API-key, sudah nonaktif sejak REQUIRE_API_KEY=false)
 report.push(clearSheetData_("ACCESS_TOKEN"));
 // Hapus sheet SYSTEM_CONFIG sepenuhnya (tidak pernah dipakai kode manapun)
 var cfg=ss_().getSheetByName("SYSTEM_CONFIG");
 if(cfg){ss_().deleteSheet(cfg);report.push("SYSTEM_CONFIG: sheet dihapus.");}
 else report.push("SYSTEM_CONFIG: sheet tidak ditemukan (sudah bersih).");
 var msg=report.join("\n");
 Logger.log(msg);
 return msg;
}
function clearSheetData_(name){
 var s=ss_().getSheetByName(name);
 if(!s)return name+": sheet tidak ditemukan.";
 var lastRow=s.getLastRow();
 if(lastRow>1){s.getRange(2,1,lastRow-1,s.getLastColumn()).clearContent();return name+": "+(lastRow-1)+" baris data dikosongkan (header tetap).";}
 return name+": sudah kosong.";
}

// ============================================================
// V3.32 — HITUNG ULANG NILAI & RATING RISIKO SESUAI PR 16/41 DJPU 2024
// Jalankan MANUAL dari editor Apps Script:
//   1. cekHitungUlangRisiko()      → HANYA melaporkan baris yang akan berubah (tidak menulis apa pun).
//   2. terapkanHitungUlangRisiko() → menulis perubahan ke RISK_ASSESSMENT, mencatat setiap
//      perubahan di RISK_HISTORY ("Hitung ulang PR16/41"), satu ringkasan di AUDIT_LOG,
//      lalu menghapus cache dashboard.
// Aman dijalankan berkali-kali: baris yang sudah benar tidak disentuh.
// Yang dihitung ulang dari nilai ancaman/kerentanan/konsekuensi (1–10) yang tersimpan:
//   ancamanRating, kerentananRating, konsekuensiRating, risikoNilai, risikoRating, kategoriPenerimaan.
// Kode kategori 1 digit (mis. "1") dirapikan menjadi 2 digit ("01").
// Baris dengan nilai komponen tidak valid TIDAK diubah, hanya dilaporkan.
// ============================================================
function cekHitungUlangRisiko(){return hitungUlangRisiko_(false)}
function terapkanHitungUlangRisiko(){return hitungUlangRisiko_(true)}
function hitungUlangRisiko_(apply){
 var lock=LockService.getScriptLock();
 if(apply&&!lock.tryLock(30000))return "Server sedang sibuk. Coba lagi beberapa saat.";
 try{
  var s=sheet_(SHEETS.RISK,H.RISK),last=s.getLastRow(),lastCol=s.getLastColumn();
  if(last<2)return "RISK_ASSESSMENT kosong.";
  var h=s.getRange(1,1,1,lastCol).getValues()[0],data=s.getRange(2,1,last-1,lastCol).getValues();
  var col={};h.forEach(function(k,i){col[k]=i});
  var FIELDS=["ancamanRating","kerentananRating","konsekuensiRating","risikoNilai","risikoRating","kategoriPenerimaan"];
  var changed=[],invalid=[],ratingShift={},n=now_();
  data.forEach(function(row,i){
   if(!row.some(function(v){return v!==""}))return;
   var o={};h.forEach(function(k,j){o[k]=row[j]});
   var a=Number(o.ancamanNilai),k=Number(o.kerentananNilai),c=Number(o.konsekuensiNilai);
   var ok=[a,k,c].every(function(v){return isFinite(v)&&Math.floor(v)===v&&v>=1&&v<=10});
   if(!ok){invalid.push((o.riskId||("baris "+(i+2)))+" ("+o.namaOperator+")");return}
   var r=computeRisk_({ancamanNilai:a,kerentananNilai:k,konsekuensiNilai:c}),diff={};
   FIELDS.forEach(function(f){if(col[f]!==undefined&&String(o[f])!==String(r[f]))diff[f]=[o[f],r[f]]});
   var kat=String(o.kategori===undefined?"":o.kategori).trim();
   if(col.kategori!==undefined&&/^\d(\.0+)?$/.test(kat))diff.kategori=[o.kategori,"0"+String(parseInt(kat,10))];
   if(!Object.keys(diff).length)return;
   if(diff.risikoRating){var key=diff.risikoRating[0]+" → "+diff.risikoRating[1];ratingShift[key]=(ratingShift[key]||0)+1}
   changed.push({row:i+2,obj:o,diff:diff});
  });
  var lines=[(apply?"DITERAPKAN":"PRATINJAU (belum ada yang ditulis)")+" — "+changed.length+" baris berubah, "+invalid.length+" baris nilai tidak valid (dilewati)."];
  Object.keys(ratingShift).forEach(function(k){lines.push("  Rating "+k+": "+ratingShift[k]+" baris")});
  changed.slice(0,40).forEach(function(x){
   lines.push("  baris "+x.row+" "+x.obj.namaOperator+" ["+String(x.obj.kategori).slice(0,2)+"] "+Object.keys(x.diff).map(function(f){return f+": "+x.diff[f][0]+" → "+x.diff[f][1]}).join("; "));
  });
  if(changed.length>40)lines.push("  ... dan "+(changed.length-40)+" baris lain.");
  if(invalid.length)lines.push("Nilai tidak valid (periksa manual): "+invalid.join(", "));
  if(apply&&changed.length){
   changed.forEach(function(x){
    var before=JSON.parse(JSON.stringify(x.obj)),cur=Number(x.obj.rowVersion||1);
    Object.keys(x.diff).forEach(function(f){
     // Tulis per sel (bukan setValues satu blok) agar teks lain di baris tidak ditafsirkan ulang oleh Sheets.
     s.getRange(x.row,col[f]+1).setValue(sanitizeCell_(x.diff[f][1]));x.obj[f]=x.diff[f][1];
    });
    x.obj.rowVersion=cur+1;x.obj.updatedAt=n;
    if(col.rowVersion!==undefined)s.getRange(x.row,col.rowVersion+1).setValue(cur+1);
    if(col.updatedAt!==undefined)s.getRange(x.row,col.updatedAt+1).setValue(n);
    appendHistory_(x.obj,"Hitung ulang PR16/41","SISTEM",cur+1,before,x.obj);
   });
   audit_({},"RISK","ALL","RECOMPUTE",{},{jumlah:changed.length,ratingShift:ratingShift},id_("REQ"),"Hitung ulang rating risiko sesuai PR 16/41 DJPU 2024 (V3.32)");
   invalidateDashboardCache_();
  }
  var msg=lines.join("\n");Logger.log(msg);return msg;
 }finally{if(apply)try{lock.releaseLock()}catch(x){}}
}

// ============================================================
// V3.35 — BACKUP HARIAN SPREADSHEET
// ============================================================
// Pasang SATU KALI dari editor: pasangBackupHarian()  (minta izin Google Drive sekali).
// Setiap hari ±02.00 WIB dibuat salinan berisi semua sheet data ke folder Drive
// pribadi "SI-RISK BACKUP". Sheet login (AUTH_SESSION, ACCESS_TOKEN) TIDAK ikut dicadangkan.
// Salinan lebih tua dari BACKUP_RETENSI_HARI dipindah ke Sampah (masih bisa dipulihkan 30 hari),
// dengan minimal BACKUP_MIN_SIMPAN salinan terbaru selalu disimpan.
// Sengaja TIDAK memakai makeCopy: itu ikut menggandakan proyek Apps Script & sheet login.
var BACKUP_FOLDER="SI-RISK BACKUP",BACKUP_PREFIX="SI-RISK BACKUP ",BACKUP_RETENSI_HARI=30,BACKUP_MIN_SIMPAN=7;
var BACKUP_KECUALI=["AUTH_SESSION","ACCESS_TOKEN"];

function backupFolder_(){
 var props=PropertiesService.getScriptProperties(),id=props.getProperty("BACKUP_FOLDER_ID");
 if(id){try{var f=DriveApp.getFolderById(id);if(!f.isTrashed())return f}catch(e){}}
 var it=DriveApp.getFoldersByName(BACKUP_FOLDER),folder=it.hasNext()?it.next():DriveApp.createFolder(BACKUP_FOLDER);
 props.setProperty("BACKUP_FOLDER_ID",folder.getId());return folder;
}
function backupHarian(){
 var src=SpreadsheetApp.getActive(),tz=Session.getScriptTimeZone()||"Asia/Jakarta",stamp=Utilities.formatDate(new Date(),tz,"yyyy-MM-dd HHmm");
 var lock=LockService.getScriptLock(),locked=false,dst=null;
 try{
  var folder=backupFolder_();
  locked=lock.tryLock(30000); // tunggu simpan yang sedang berjalan agar salinan konsisten
  dst=SpreadsheetApp.create(BACKUP_PREFIX+stamp);
  var bawaan=dst.getSheets();bawaan.forEach(function(sh,i){sh.setName("__bawaan_"+i)}); // hindari bentrok nama
  var n=0;
  src.getSheets().forEach(function(sh){
   if(BACKUP_KECUALI.indexOf(sh.getName())>=0)return;
   sh.copyTo(dst).setName(sh.getName());n++;
  });
  if(locked){lock.releaseLock();locked=false}
  if(n)bawaan.forEach(function(sh){dst.deleteSheet(sh)}); // buang "Sheet1" bawaan
  var file=DriveApp.getFileById(dst.getId());file.moveTo(folder);
  var dihapus=bersihkanBackupLama_(folder);
  var msg="Backup "+stamp+" selesai: "+n+" sheet → folder \""+folder.getName()+"\". Salinan lama dipindah ke Sampah: "+dihapus+".";
  Logger.log(msg);return msg;
 }catch(e){
  var err="Backup GAGAL ("+stamp+"): "+(e&&e.message||e);Logger.log(err);
  if(dst)try{DriveApp.getFileById(dst.getId()).setTrashed(true)}catch(x){}
  try{var to=Session.getEffectiveUser().getEmail();if(to&&MailApp.getRemainingDailyQuota()>5)MailApp.sendEmail(to,"[SI-RISK] Backup harian gagal",err+"\n\nJalankan backupHarian() dari editor Apps Script untuk mencoba lagi.")}catch(x){}
  throw e;
 }finally{if(locked)try{lock.releaseLock()}catch(x){}}
}
function bersihkanBackupLama_(folder){
 var files=[],it=folder.getFiles();
 while(it.hasNext()){var f=it.next();if(String(f.getName()).indexOf(BACKUP_PREFIX)===0&&f.getMimeType()===MimeType.GOOGLE_SHEETS)files.push(f)}
 files.sort(function(a,b){return b.getDateCreated()-a.getDateCreated()});
 var batas=Date.now()-BACKUP_RETENSI_HARI*86400000,n=0;
 files.forEach(function(f,i){if(i>=BACKUP_MIN_SIMPAN&&f.getDateCreated().getTime()<batas){f.setTrashed(true);n++}});
 return n;
}
function pasangBackupHarian(){
 ScriptApp.getProjectTriggers().forEach(function(t){if(t.getHandlerFunction()==="backupHarian")ScriptApp.deleteTrigger(t)});
 ScriptApp.newTrigger("backupHarian").timeBased().everyDays(1).atHour(2).create();
 var msg=backupHarian(); // backup pertama langsung, sekaligus memastikan izin Drive sudah diberikan
 Logger.log("Trigger backup harian (±02.00) terpasang. "+msg);return "Trigger backup harian terpasang. "+msg;
}
