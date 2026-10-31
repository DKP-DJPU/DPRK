// DPRK NASIONAL V3.42 HARDENED CORE + LOGIN OTP (lihat Auth.gs) — band risiko & ALARP sesuai PR 16/41 DJPU 2024 — backup harian (V3.35) — edit lewat akun login (V3.36) — usulan lokasi operator + Wilayah.gs (V3.42) — unit/stasiun + simpan per paket + impor admin (V3.37) — kode produksi, stabilitas GET/POST, retry-safe, dan dukungan EDIT
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

var SHEETS={UNIT:"MASTER_UNIT",OP:"MASTER_OPERATOR",DPRK:"MASTER_DPRK",DPRKVER:"DPRK_VERSION",RISK:"RISK_ASSESSMENT",HIST:"RISK_HISTORY",AUDIT:"AUDIT_LOG",ACCESS:"ACCESS_TOKEN",NOTIF:"NOTIFICATION_LOG",USUL:"USULAN_LOKASI"};
var H={
 OP:["operatorId","jenisOperator","namaOperator","kodeOperator","iata","icao","provinsi","kabkota","lokasi","kelas","status","aktif","createdAt","updatedAt","kodeWilayah"],
 DPRK:["dprkId","operatorId","jenisOperator","namaOperator","periode","tahun","versi","tanggalPenyusunan","tanggalPengesahan","tanggalKajiUlang","linkFileDprk","status","namaPengisi","jabatanPengisi","riskOwner","emailRiskOwner","dprkEditToken","createdAt","updatedAt","tanggalWajibPembaruan"],
 DPRKVER:["dprkVersionId","dprkId","operatorId","versionNumber","tanggalPenyusunan","tanggalPengesahan","tanggalWajibPembaruan","linkFileDprk","namaPengisi","jabatanPengisi","riskOwner","emailRiskOwner","status","createdAt","updatedAt"],
 RISK:["riskId","dprkId","operatorId","jenisOperator","namaOperator","kategori","idRisikoKatalog","skenario","area","langkahSaatIni","kerentananSaatIni","ancamanNilai","ancamanRating","kerentananNilai","kerentananRating","konsekuensiNilai","konsekuensiRating","risikoNilai","risikoRating","kategoriPenerimaan","perlakuan","prioritas","langkahTambahan","pemilikRisiko","tanggalKaji","keterangan","bulan","tahun","namaPengisi","jabatanPengisi","createdAt","updatedAt","editToken","assessmentKey","rowVersion","unitId"],
 HIST:["historyId","riskId","dprkId","operatorId","jenisOperator","namaOperator","tanggal","bulan","tahun","nilaiAncaman","nilaiKerentanan","nilaiKonsekuensi","nilaiRisiko","ratingRisiko","versiDprk","perubahan","updatedBy","rowVersion","beforeData","afterData","unitId"],
 AUDIT:["auditId","timestamp","actorType","actorId","entityType","entityId","action","reason","beforeData","afterData","requestId"],
 ACCESS:["accessId","operatorId","dprkId","tokenHash","tokenType","status","createdAt","updatedAt","revokedAt"],
 // V3.37 — unit/stasiun di bawah operator induk (cabang pembantu LPPNPI, stasiun maskapai, Satpel, dll.). Diisi Admin lewat terapkanImporUnit().
 UNIT:["unitId","operatorId","jenisUnit","namaUnit","kodeUnit","provinsi","kabkota","aktif","createdAt","updatedAt","kodeWilayah"],
 // V3.42 — usulan lokasi dari operator. Master TIDAK berubah sampai Admin mengisi Status lalu menjalankan terapkanUsulanLokasi().
 USUL:["usulanId","createdAt","operatorId","namaOperator","unitId","untuk","kodeLokasi","pengusulEmail","kodeWilayah","provinsi","kabkota","alamat","catatan","provinsiSekarang","kabkotaSekarang","jenis","status","alasan","peringatan","diputuskanAt","diputuskanOleh","updatedAt"],
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
  var ops = objs_(opSheet).filter(opActive_);

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
// V3.37: getRange di luar ukuran grid = galat di Google Sheets. RISK_ASSESSMENT produksi tepat 35 kolom,
// sheet baru 26 kolom × 1000 baris → perluas grid dulu sebelum menulis header/baris.
function ensureCols_(s,n){var m=s.getMaxColumns();if(n>m)s.insertColumnsAfter(m,n-m)}
function ensureRows_(s,n){var need=s.getLastRow()+n-s.getMaxRows();if(need>0)s.insertRowsAfter(s.getMaxRows(),need)}
function ensureHeaders_(s,headers){var cur=s.getLastColumn()?s.getRange(1,1,1,s.getLastColumn()).getValues()[0]:[];if(!cur.length){ensureCols_(s,headers.length);s.getRange(1,1,1,headers.length).setValues([headers]);return headers}var add=headers.filter(function(h){return cur.indexOf(h)<0});if(add.length){ensureCols_(s,cur.length+add.length);s.getRange(1,cur.length+1,1,add.length).setValues([add])}return s.getRange(1,1,1,s.getLastColumn()).getValues()[0]}
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
 // V3.42: kode wilayah Kemendagri ("32.78", "32.10") juga dipaksa teks; tanpa apostrof menjadi angka 32.1.
 if(/^\d{2}\.\d{2}$/.test(s))return"'"+s;
 return s;
}
function appendObj_(s,h,o){s.appendRow(h.map(function(k){return sanitizeCell_(o[k]===undefined||o[k]===null?"":o[k])}))}
function id_(p){return p+"-"+Utilities.getUuid().replace(/-/g,"").slice(0,20).toUpperCase()}
function token_(){return Utilities.getUuid().replace(/-/g,"").toUpperCase()}
// V3.42: nomor baris dihitung dari data APA ADANYA (rows_ membuang baris kosong; bila ada baris kosong di tengah sheet,
// nomor baris lama bergeser dan penulisan bisa mengenai baris lain).
function findBy_(s,key,val){var h=s.getLastColumn()?s.getRange(1,1,1,s.getLastColumn()).getValues()[0]:[],c=h.indexOf(key);if(c<0||s.getLastRow()<2)return null;var a=s.getRange(2,1,s.getLastRow()-1,h.length).getValues();for(var i=0;i<a.length;i++)if(String(a[i][c])===String(val)){var o={};h.forEach(function(k,j){o[k]=a[i][j]});return{row:i+2,obj:o,h:h}}return null}
function publicOp_(o){return{kodeWilayah:kodeWil_(o.kodeWilayah),operatorId:o.operatorId,jenisOperator:o.jenisOperator,namaOperator:o.namaOperator,kodeOperator:o.kodeOperator,iata:o.iata,provinsi:o.provinsi,kabkota:o.kabkota,lokasi:o.lokasi,kelas:o.kelas,status:o.status,aktif:o.aktif}}

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
 sheet_(SHEETS.OP,H.OP);sheet_(SHEETS.DPRK,H.DPRK);sheet_(SHEETS.DPRKVER,H.DPRKVER);sheet_(SHEETS.RISK,H.RISK);sheet_(SHEETS.HIST,H.HIST);sheet_(SHEETS.AUDIT,H.AUDIT);sheet_(SHEETS.ACCESS,H.ACCESS);sheet_(SHEETS.NOTIF,H.NOTIF);sheet_(SHEETS.UNIT,H.UNIT);
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
 if(batch.length)(ensureRows_(s,batch.length),s).getRange(s.getLastRow()+1,1,batch.length,H.OP.length).setValues(batch);
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
// V3.37: unitId ikut kunci (skenario sama di dua unit BUKAN duplikat). Tanpa unit, kunci identik dengan versi lama.
function assessmentKey_(operatorId,dprkId,bulan,tahun,kategori,skenario,unitId){
 var k=[operatorId,dprkId,String(tahun||""),String(bulan||"").toLowerCase(),String(kategori||"").split(" - ")[0],normalizeText_(skenario)].join("|"),u=String(unitId||"").trim();
 return u?k+"|u:"+u:k;
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
  var x=a[i],k=x.assessmentKey||assessmentKey_(x.operatorId,x.dprkId,x.bulan,x.tahun,x.kategori,x.skenario,x.unitId);
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
var CACHE_KEYS={dashboard:"dprk_cache_dashboard_v2",operators:"dprk_cache_operators_v2",risks:"dprk_cache_risks_v2",master:"dprk_cache_master_v1",units:"dprk_cache_units_v1"};
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
function invalidateDashboardCache_(){try{CacheService.getScriptCache().removeAll([CACHE_KEYS.dashboard,CACHE_KEYS.operators,CACHE_KEYS.risks,CACHE_KEYS.master,CACHE_KEYS.units])}catch(e){}}
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
// V3.38 — PENILAIAN TERAKHIR PER OPERATOR & UNIT. Setiap unit/stasiun (dan Induk) punya siklus kaji sendiri:
// yang dihitung hanya matriks periode (bulan+tahun) TERBARU milik unit itu. Matriks periode lama yang sudah
// dikaji ulang tidak ikut dihitung lagi (sebelumnya ikut → hitung ganda), dan unit yang belum dikaji ulang
// tetap memakai matriks terakhirnya (tidak hilang). Di dalam satu periode, satu skenario = baris terbaru.
var BULAN_ID=["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
function periodNum_(x){var m=BULAN_ID.indexOf(String(x.bulan||"").trim());return(Number(x.tahun)||0)*100+(m+1)}
function scopeKey_(x){return String(x.operatorId||"")+"|"+String(x.unitId||"")}
function latestCurrentRiskRows_(rows){
 var last={},map={};
 (rows||[]).forEach(function(x){var u=scopeKey_(x),p=periodNum_(x);if(!(u in last)||p>last[u])last[u]=p});
 (rows||[]).forEach(function(x){
  if(periodNum_(x)!==last[scopeKey_(x)])return;
  var key=assessmentKey_(x.operatorId,x.dprkId,x.bulan,x.tahun,x.kategori,x.skenario,x.unitId),dt=String(x.updatedAt||x.createdAt||"");
  if(!map[key]||dt>String(map[key].updatedAt||map[key].createdAt||""))map[key]=x;
 });
 return Object.keys(map).map(function(k){return map[k]});
}
function dashboard_(){
 var ops=objs_(sheet_(SHEETS.OP,H.OP)).filter(opActive_),d=objs_(sheet_(SHEETS.DPRK,H.DPRK)),raw=objs_(sheet_(SHEETS.RISK,H.RISK));
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

// V3.37.1 — satu definisi "operator aktif" untuk semua hitungan: wajib punya operatorId, kolom aktif bukan FALSE,
// dan status bukan Nonaktif (baris yang hanya diubah salah satunya tetap dianggap nonaktif).
function opActive_(o){return !!String(o.operatorId==null?"":o.operatorId).trim()&&String(o.aktif).trim().toLowerCase()!=="false"&&String(o.status==null?"":o.status).trim()!=="Nonaktif"}
function operatorMonitoring_(){
 var ops=objs_(sheet_(SHEETS.OP,H.OP)),d=objs_(sheet_(SHEETS.DPRK,H.DPRK)),r=objs_(sheet_(SHEETS.RISK,H.RISK)),un={},uf={};
 // V3.37: cakupan unit = unit aktif yang sudah punya minimal 1 skenario / unit aktif terdaftar.
 unitMaster_().forEach(function(u){if(u.aktif)(un[u.operatorId]=un[u.operatorId]||[]).push(u.unitId)});
 // V3.37: hitung sekali (sebelumnya menyaring seluruh RISK_ASSESSMENT untuk SETIAP operator: ±445 × 15.000 baris).
 var cnt={},dAct={};r=latestCurrentRiskRows_(r);r.forEach(function(x){if(x.unitId)uf[String(x.unitId)]=1;var k=String(x.operatorId);cnt[k]=(cnt[k]||0)+1});d.forEach(function(x){if(x.status==="Aktif"&&!dAct[x.operatorId])dAct[x.operatorId]=x});
 // V3.42: kelengkapan lokasi (provinsi + kab/kota) dan jumlah usulan lokasi yang belum diputuskan Admin.
 var usul={};usulRowsIfAny_().forEach(function(x){if(usulTerbuka_(x))usul[String(x.operatorId)]=(usul[String(x.operatorId)]||0)+1});
 return ops.filter(opActive_).map(function(o){var z=publicOp_(o),dr=dAct[o.operatorId],us=un[o.operatorId]||[];z.lokasiLengkap=!!(String(o.provinsi||"").trim()&&String(o.kabkota||"").trim());z.usulanLokasi=usul[String(o.operatorId)]||0;z.statusDprk=dr?"Sudah Mengisi":"Belum Mengisi";z.jumlahSkenario=cnt[String(o.operatorId)]||0;z.tanggalKaji=dr?dr.tanggalKajiUlang:"";z.jumlahUnit=us.length;z.unitTerisi=us.filter(function(id){return uf[id]}).length;return z})
}
// V3.34 — daftar identitas operator aktif untuk publik (formulir, pendaftaran, pelaporan).
function operatorMaster_(){
 return objs_(sheet_(SHEETS.OP,H.OP)).filter(opActive_).map(publicOp_);
}
// V3.34 — BACA DATA TERBATAS (wajib login). Admin: semua operator; Operator: hanya operatorIds miliknya.
var READ_ACTIONS=["riskData","operatorStatus","reviewList","riskDetail","unitList","usulanLokasi"];
function authRead_(p,a){
 var u=authSession_(p.sessionToken);
 if(!u)return json_({ok:false,code:"AUTH_REQUIRED",error:"Silakan masuk untuk melihat data ini."});
 if(a==="riskDetail")return riskDetail_(u,p);
 if(a==="unitList")return unitList_(u);
 if(a==="usulanLokasi")return usulanLokasiList_(u,p);
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
 if(out.unitId)out.namaUnit=unitNames_()[String(out.unitId)]||String(out.unitId);
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
// V3.38: terkini=true bila baris termasuk penilaian terakhir unitnya (dipakai rekap & filter Monitoring Risiko).
function riskMonitoring_(){var un=unitNames_(),all=objs_(sheet_(SHEETS.RISK,H.RISK)),cur={};latestCurrentRiskRows_(all).forEach(function(x){cur[String(x.riskId)]=1});return all.map(function(r){var u=String(r.unitId||"");return{riskId:r.riskId,terkini:!!cur[String(r.riskId)],operatorId:String(r.operatorId||""),unitId:u,namaUnit:u?(un[u]||u):"",kategoriPenerimaan:r.kategoriPenerimaan||"",jenisOperator:r.jenisOperator,namaOperator:r.namaOperator,kategori:r.kategori,kategoriKode:String(r.kategori||"").split(" - ")[0],risikoNilai:Number(r.risikoNilai)||0,risikoRating:r.risikoRating,bulan:r.bulan,tahun:r.tahun}})}
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
  if(a==="saveRiskBatch")return saveRiskBatch_(p);
  if(a==="renewDprk")return renewDprk_(p);
  if(a==="createIncident")return createIncident_(p);
  if(a==="usulLokasi")return usulLokasi_(p);
  if(a==="batalUsulLokasi")return batalUsulLokasi_(p);
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
// V3.39 — DATA INDUK OPERATOR DIKUNCI. Simpan skenario TIDAK lagi mengubah MASTER_OPERATOR untuk operator yang
// sudah terdaftar: nama, jenis, kode, dan lokasi selalu diambil dari master. Sebelumnya nama operator ditimpa
// isian formulir (mis. "Super Air Jet Cabang CGK") dan lokasi kosong diisi lokasi stasiun pengisi pertama.
// Koreksi data induk hanya lewat Admin (PERBAIKAN_MASTER → cekImporAdmin/terapkanImporAdmin).
function masterIdentity_(p){
 var f=findBy_(sheet_(SHEETS.OP,H.OP),"operatorId",p.operatorId);if(!f)return null;
 ["jenisOperator","namaOperator"].concat(OP_MERGE_FIELDS).forEach(function(k){p[k]=f.obj[k]===undefined?"":f.obj[k]});
 return f.obj;
}
function upsertOperator_(p){
 var s=sheet_(SHEETS.OP,H.OP),f=findBy_(s,"operatorId",p.operatorId),n=now_();
 if(f)return f.obj;
 var fresh={operatorId:p.operatorId,jenisOperator:p.jenisOperator,namaOperator:p.namaOperator,kodeOperator:p.kodeOperator||"",iata:p.iata||"",icao:p.icao||"",provinsi:p.provinsi||"",kabkota:p.kabkota||"",lokasi:p.lokasi||"",kelas:p.kelas||"",status:"Aktif",aktif:true,createdAt:n,updatedAt:n};
 appendObj_(s,H.OP,fresh);
 return fresh;
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
 masterIdentity_(p); // V3.39: identitas dari master, bukan dari formulir
 var er=validate_(p);if(er.length)return json_({ok:false,error:er.join(";"),code:"VALIDATION_ERROR"});
 if(!verifyApiKey_(p.operatorId,p.apiKey))return json_({ok:false,error:"Kunci akses tidak valid, sudah dicabut, atau tidak sesuai dengan operator ini. Hubungi admin sistem untuk mendapatkan kunci akses.",code:"FORBIDDEN"});
 var rid=cleanToken_(p.id)||id_("RISK"),tok=cleanToken_(p.editToken)||token_(),existing=findRiskById_(rid);
 if(existing){
  if(cleanToken_(existing.obj.editToken)===tok)return json_({ok:true,duplicate:true,retry:true,id:rid,editToken:tok,dprkId:existing.obj.dprkId||"",message:"Request sudah pernah diproses; data tidak dibuat ulang."});
  return json_({ok:false,error:"riskId sudah digunakan oleh risiko lain.",code:"RISK_ID_CONFLICT"});
 }
 var existingDprk=findCurrentDprkByOperator_(p.operatorId),prospectiveDprkId=existingDprk?existingDprk.dprkId:("DPRK-"+p.operatorId),unitErr=checkUnit_(p.operatorId,p.unitId);if(unitErr)return json_({ok:false,error:unitErr,code:"UNIT_INVALID"});
 var akey=assessmentKey_(p.operatorId,prospectiveDprkId,p.bulan,p.tahun,p.kategori,p.skenario,p.unitId),dup=findRiskByAssessmentKey_(akey,"");
 if(dup)return json_({ok:false,error:"Assessment dengan operator, periode, kategori, dan skenario yang sama sudah ada.",code:"DUPLICATE_RISK",existingRiskId:dup.riskId});
 var op=upsertOperator_(p),d=getOrCreateDprk_(p),s=sheet_(SHEETS.RISK,H.RISK),n=now_(),risk=computeRisk_(p),o={riskId:rid,dprkId:d.dprkId,operatorId:op.operatorId,jenisOperator:op.jenisOperator,namaOperator:op.namaOperator,kategori:p.kategori,idRisikoKatalog:p.idRisikoKatalog||"",skenario:p.skenario,area:p.area||"",langkahSaatIni:p.langkahSaatIni||"",kerentananSaatIni:p.kerentananSaatIni||"",ancamanNilai:risk.ancamanNilai,ancamanRating:risk.ancamanRating,kerentananNilai:risk.kerentananNilai,kerentananRating:risk.kerentananRating,konsekuensiNilai:risk.konsekuensiNilai,konsekuensiRating:risk.konsekuensiRating,risikoNilai:risk.risikoNilai,risikoRating:risk.risikoRating,kategoriPenerimaan:risk.kategoriPenerimaan,perlakuan:p.perlakuan||"",prioritas:p.prioritas||"",langkahTambahan:p.langkahTambahan||"",pemilikRisiko:p.riskOwner||"",tanggalKaji:dateOnly_(p.tanggalKaji)||"",keterangan:p.keterangan||"",bulan:p.bulan||"",tahun:p.tahun||new Date().getFullYear(),assessmentKey:akey,rowVersion:1,namaPengisi:p.namaPengisi||"",jabatanPengisi:p.jabatanPengisi||"",createdAt:n,updatedAt:n,editToken:tok,unitId:String(p.unitId||"").trim()};
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
 p.operatorId=old.operatorId;p.dprkId=old.dprkId;p.jenisOperator=old.jenisOperator;p.namaOperator=old.namaOperator;p.bulan=old.bulan;p.tahun=old.tahun;p.unitId=old.unitId||"";
 // V3.36: formulir mengirim "riskOwner", kolom sheet bernama "pemilikRisiko" (sebelumnya perubahan Pemilik Risiko saat edit tidak tersimpan).
 if(p.pemilikRisiko===undefined&&p.riskOwner!==undefined)p.pemilikRisiko=p.riskOwner;
 var key=assessmentKey_(old.operatorId,old.dprkId,old.bulan,old.tahun,p.kategori,p.skenario,old.unitId),dup=findRiskByAssessmentKey_(key,p.id);if(dup)return json_({ok:false,error:"Perubahan akan membuat duplicate assessment.",code:"DUPLICATE_RISK",existingRiskId:dup.riskId});
 var n=now_(),obj={},risk=computeRisk_(p),h=f.h;h.forEach(function(k){obj[k]=p[k]!==undefined?p[k]:(old[k]===undefined?"":old[k])});
 obj.riskId=old.riskId;obj.dprkId=old.dprkId;obj.operatorId=old.operatorId;obj.unitId=old.unitId||"";obj.jenisOperator=old.jenisOperator;obj.namaOperator=old.namaOperator;obj.bulan=old.bulan;obj.tahun=old.tahun;obj.assessmentKey=key;obj.rowVersion=currentVersion+1;obj.ancamanNilai=risk.ancamanNilai;obj.ancamanRating=risk.ancamanRating;obj.kerentananNilai=risk.kerentananNilai;obj.kerentananRating=risk.kerentananRating;obj.konsekuensiNilai=risk.konsekuensiNilai;obj.konsekuensiRating=risk.konsekuensiRating;obj.risikoNilai=risk.risikoNilai;obj.risikoRating=risk.risikoRating;obj.kategoriPenerimaan=risk.kategoriPenerimaan;obj.updatedAt=n;obj.editToken=old.editToken;obj.createdAt=old.createdAt||n;
 sheet_(SHEETS.RISK,H.RISK).getRange(f.row,1,1,h.length).setValues([h.map(function(k){return sanitizeCell_(obj[k]===undefined?"":obj[k])})]);
 appendHistory_(obj,"Update",p.namaPengisi||"",obj.rowVersion,old,obj);audit_(p,"RISK",obj.riskId,"UPDATE",old,obj,p.requestId,"Perubahan assessment risiko");
 invalidateDashboardCache_();
 var resp={ok:true,id:obj.riskId,dprkId:obj.dprkId,rowVersion:obj.rowVersion};var dprkForResp=findCurrentDprkByOperator_(obj.operatorId);if(p.dprkEditToken&&dprkForResp&&cleanToken_(p.dprkEditToken)===cleanToken_(dprkForResp.dprkEditToken))resp.dprkEditToken=dprkForResp.dprkEditToken;return json_(resp);
}
function appendHistory_(r,change,user,rowVersion,beforeData,afterData){appendObj_(sheet_(SHEETS.HIST,H.HIST),H.HIST,{historyId:id_("HIST"),riskId:r.riskId,dprkId:r.dprkId,operatorId:r.operatorId,jenisOperator:r.jenisOperator,namaOperator:r.namaOperator,tanggal:now_(),bulan:r.bulan||"",tahun:r.tahun||"",nilaiAncaman:r.ancamanNilai||"",nilaiKerentanan:r.kerentananNilai||"",nilaiKonsekuensi:r.konsekuensiNilai||"",nilaiRisiko:r.risikoNilai||"",ratingRisiko:r.risikoRating||"",versiDprk:r.versiDprk||1,perubahan:change,updatedBy:user,rowVersion:rowVersion||1,beforeData:safeJson_(beforeData||{}),afterData:safeJson_(afterData||r),unitId:r.unitId||""})}

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

// ============================================================
// V3.37 — UNIT / STASIUN (P5 fondasi)
// ============================================================
// Unit = kantor cabang pembantu / unit kerja LPPNPI, stasiun maskapai, Satpel, dll. di bawah SATU
// operator induk. DPRK tetap satu per operator induk; matriks unit = baris RISK_ASSESSMENT dengan
// kolom unitId terisi. Matriks cabang utama / kantor pusat = baris tanpa unitId.
// Daftar unit HANYA diisi Admin lewat cekImporAdmin() / terapkanImporAdmin() (keputusan 28 Okt 2026).
var UNIT_CMP=["operatorId","jenisUnit","namaUnit","kodeUnit","provinsi","kabkota","aktif"];
var UNIT_JENIS=["Kantor Cabang Pembantu","Unit Kerja","Stasiun","Satuan Pelayanan","Lainnya"];
var UNIT_ID_RE=/^[A-Za-z0-9_.-]{1,100}$/;
function unitMaster_(){return objs_(sheet_(SHEETS.UNIT,H.UNIT)).map(function(u){return{unitId:String(u.unitId||""),operatorId:String(u.operatorId||""),jenisUnit:u.jenisUnit||"",namaUnit:u.namaUnit||"",kodeUnit:String(u.kodeUnit||""),provinsi:u.provinsi||"",kabkota:u.kabkota||"",kodeWilayah:kodeWil_(u.kodeWilayah),aktif:String(u.aktif).toLowerCase()!=="false"}}).filter(function(u){return u.unitId})}
function unitNames_(){var m={};cached_(CACHE_KEYS.units,unitMaster_).forEach(function(u){m[u.unitId]=u.namaUnit});return m}
// null bila valid; pesan galat bila unit tidak ada / nonaktif / bukan milik operator.
function checkUnit_(operatorId,unitId){
 var id=String(unitId||"").trim();if(!id)return null;
 var u=unitMaster_().filter(function(x){return x.unitId===id})[0];
 if(!u)return"Unit "+id+" tidak terdaftar.";
 if(!u.aktif)return"Unit "+id+" sudah nonaktif.";
 if(u.operatorId!==String(operatorId||""))return"Unit "+id+" bukan milik operator ini.";
 return null;
}
// Daftar unit + cakupan (sudah/belum ada matriks). Admin: semua; Operator: hanya operatorIds miliknya.
function unitList_(u){
 var units=cached_(CACHE_KEYS.units,unitMaster_).filter(function(x){return x.aktif&&authCanAccess_(u,x.operatorId)}),n={};
 latestCurrentRiskRows_(objs_(sheet_(SHEETS.RISK,H.RISK))).forEach(function(r){var id=String(r.unitId||"");if(id)n[id]=(n[id]||0)+1});
 return json_({ok:true,scope:u.peran==="Admin"?"all":"own",data:units.map(function(x){var o=JSON.parse(JSON.stringify(x));o.jumlahSkenario=n[x.unitId]||0;return o})});
}

// ============================================================
// V3.42 — USULAN LOKASI OLEH OPERATOR
// ============================================================
// Operator yang login mengusulkan provinsi + kab/kota (wajib, dari daftar resmi Wilayah.gs) untuk kantor pusat
// atau unit/stasiunnya; alamat dan catatan opsional. Usulan masuk ke sheet USULAN_LOKASI — MASTER_OPERATOR dan
// MASTER_UNIT TIDAK berubah. Admin mengisi kolom Status (Diterima/Ditolak; Ditolak wajib Alasan), menjalankan
// cekUsulanLokasi(), lalu terapkanUsulanLokasi() (cadangan + AUDIT_LOG). Keputusan baru berlaku (dan alasan
// penolakan baru tampil di formulir) setelah terapkanUsulanLokasi() dijalankan.
// Kode lokasi bersama: stasiun maskapai (jenisUnit Stasiun) memakai lokasi bandaranya. Usulan yang diterima untuk
// stasiun CGK juga diterapkan ke bandara CGK dan semua stasiun lain berkode CGK; begitu pula sebaliknya.
var USUL_STATUS=["Menunggu","Diterima","Ditolak","Dibatalkan"];
var USUL_MAX_TERBUKA=30; // per akun
// Kode wilayah yang terlanjur tersimpan sebagai angka (mis. diketik manual di sheet: 32.1) dikembalikan ke "32.10".
function kodeWil_(v){if(typeof v==="number"&&isFinite(v))return v.toFixed(2);return String(v==null?"":v).trim()}
function usulRowsIfAny_(){var s=ss_().getSheetByName(SHEETS.USUL);return s&&s.getLastRow()>1?objs_(s):[]}
function usulTerbuka_(x){return !String(x.diputuskanAt||"").trim()&&String(x.status||"").trim()!=="Dibatalkan"&&!!String(x.usulanId||"").trim()}
function usulCacheOff_(){try{CacheService.getScriptCache().remove(CACHE_KEYS.operators)}catch(e){}} // jumlah usulan di Monitoring Operator
function usulScope_(x){return String(x.operatorId||"")+"|"+String(x.unitId||"")}
// Lokasi tercatat sekarang untuk operator induk (unitId kosong) atau unit/stasiunnya.
function usulTarget_(operatorId,unitId){
 var op=findBy_(sheet_(SHEETS.OP,H.OP),"operatorId",operatorId);if(!op)return{error:"Operator "+operatorId+" tidak terdaftar."};
 var o=op.obj,uid=String(unitId||"").trim();
 if(uid){
  var u=unitMaster_().filter(function(x){return x.unitId===uid})[0];
  if(!u)return{error:"Unit "+uid+" tidak terdaftar."};
  if(!u.aktif)return{error:"Unit "+uid+" sudah nonaktif."};
  if(u.operatorId!==String(operatorId))return{error:"Unit "+uid+" bukan milik operator ini."};
  return{op:o,unit:u,untuk:u.namaUnit||uid,provinsi:String(u.provinsi||"").trim(),kabkota:String(u.kabkota||"").trim(),kodeLokasi:u.jenisUnit==="Stasiun"?String(u.kodeUnit||"").trim().toUpperCase():""};
 }
 return{op:o,unit:null,untuk:o.jenisOperator==="Airlines"?"Kantor pusat / stasiun utama":"Kantor pusat",provinsi:String(o.provinsi||"").trim(),kabkota:String(o.kabkota||"").trim(),kodeLokasi:o.jenisOperator==="Bandar Udara"?String(o.iata||"").trim().toUpperCase():""};
}
function usulPublic_(x,u){
 var putus=!!String(x.diputuskanAt||"").trim(),st=String(x.status||"").trim();
 return{usulanId:x.usulanId,createdAt:String(x.createdAt||""),operatorId:x.operatorId,unitId:String(x.unitId||""),untuk:x.untuk,kodeWilayah:kodeWil_(x.kodeWilayah),provinsi:x.provinsi,kabkota:x.kabkota,alamat:x.alamat||"",catatan:x.catatan||"",
  provinsiSekarang:x.provinsiSekarang||"",kabkotaSekarang:x.kabkotaSekarang||"",jenis:x.jenis,
  status:st==="Dibatalkan"?"Dibatalkan":putus?st:"Menunggu",alasan:putus&&st==="Ditolak"?String(x.alasan||""):"",diputuskanAt:putus?String(x.diputuskanAt):"",
  milikSaya:String(x.pengusulEmail||"").toLowerCase()===String(u.email||"").toLowerCase()};
}
// Baca: usulan untuk SATU operator (wajib operatorId). Admin: semua; Operator: hanya operatorIds miliknya.
function usulanLokasiList_(u,p){
 var oid=String(p.operatorId||"");
 if(!AUTH_OPID_RE.test(oid))return json_({ok:false,code:"VALIDATION_ERROR",error:"ID operator tidak valid."});
 if(!authCanAccess_(u,oid))return json_({ok:true,data:[]});
 var a=usulRowsIfAny_().filter(function(x){return String(x.operatorId)===oid&&String(x.status||"").trim()!=="Dibatalkan"});
 a.sort(function(x,y){return String(y.createdAt).localeCompare(String(x.createdAt))});
 return json_({ok:true,data:a.slice(0,50).map(function(x){return usulPublic_(x,u)})});
}
function usulLokasi_(p){
 if(!p._auth)return json_({ok:false,code:"AUTH_REQUIRED",error:"Usulan lokasi hanya dapat dikirim oleh pengguna yang login."});
 var oid=String(p.operatorId),t=usulTarget_(oid,p.unitId);
 if(t.error)return json_({ok:false,code:"VALIDATION_ERROR",error:t.error});
 if(!opActive_(t.op))return json_({ok:false,code:"VALIDATION_ERROR",error:"Operator sudah nonaktif."});
 var w=wilayah_(p.kodeWilayah);
 if(!w)return json_({ok:false,code:"VALIDATION_ERROR",error:"Pilih provinsi dan kabupaten/kota dari daftar resmi."});
 var alamat=String(p.alamat||"").trim(),catatan=String(p.catatan||"").trim();
 if(alamat.length>300)return json_({ok:false,code:"VALIDATION_ERROR",error:"Alamat maksimal 300 karakter."});
 if(catatan.length>500)return json_({ok:false,code:"VALIDATION_ERROR",error:"Catatan maksimal 500 karakter."});
 if(sameVal_("",t.provinsi,w.provinsi)&&sameVal_("",t.kabkota,w.kabkota))return json_({ok:false,code:"VALIDATION_ERROR",error:"Wilayah yang diusulkan sama dengan yang sudah tercatat ("+w.kabkota+", "+w.provinsi+")."});
 var s=sheet_(SHEETS.USUL,H.USUL),email=String(p._auth.email||"").toLowerCase(),uid=t.unit?t.unit.unitId:"",scope=oid+"|"+uid,rows=objs_(s);
 var mine=rows.filter(function(x){return usulTerbuka_(x)&&String(x.pengusulEmail||"").toLowerCase()===email});
 var same=mine.filter(function(x){return usulScope_(x)===scope})[0];
 if(!same&&mine.length>=USUL_MAX_TERBUKA)return json_({ok:false,code:"VALIDATION_ERROR",error:"Akun Anda masih memiliki "+mine.length+" usulan lokasi yang belum diputuskan Admin."});
 var n=now_(),x={usulanId:same?same.usulanId:id_("USL"),createdAt:same?same.createdAt:n,operatorId:oid,namaOperator:t.op.namaOperator,unitId:uid,untuk:t.untuk,kodeLokasi:t.kodeLokasi,pengusulEmail:email,
  kodeWilayah:w.kode,provinsi:w.provinsi,kabkota:w.kabkota,alamat:alamat,catatan:catatan,provinsiSekarang:t.provinsi,kabkotaSekarang:t.kabkota,jenis:t.provinsi||t.kabkota?"Koreksi":"Isi baru",status:"Menunggu",alasan:"",peringatan:"",diputuskanAt:"",diputuskanOleh:"",updatedAt:n};
 if(same){var f=findBy_(s,"usulanId",same.usulanId);s.getRange(f.row,1,1,f.h.length).setValues([f.h.map(function(c){return sanitizeCell_(x[c]===undefined?f.obj[c]:x[c])})]);audit_(p,"USULAN_LOKASI",x.usulanId,"UPDATE",f.obj,x,p.requestId,"Usulan lokasi diperbarui oleh pengusul")}
 else{appendObj_(s,s.getRange(1,1,1,s.getLastColumn()).getValues()[0],x);audit_(p,"USULAN_LOKASI",x.usulanId,"CREATE",{},x,p.requestId,"Usulan lokasi")}
 usulCacheOff_();
 return json_({ok:true,diperbarui:!!same,data:usulPublic_(x,p._auth)});
}
function batalUsulLokasi_(p){
 if(!p._auth)return json_({ok:false,code:"AUTH_REQUIRED",error:"Silakan masuk untuk membatalkan usulan."});
 var s=ss_().getSheetByName(SHEETS.USUL),f=s?findBy_(s,"usulanId",String(p.usulanId||"").trim()):null;
 if(!f||String(f.obj.operatorId)!==String(p.operatorId))return json_({ok:false,code:"NOT_FOUND",error:"Usulan tidak ditemukan."});
 if(!usulTerbuka_(f.obj)||String(f.obj.status).trim()!=="Menunggu")return json_({ok:false,code:"VALIDATION_ERROR",error:"Usulan ini sudah diproses Admin dan tidak dapat dibatalkan."});
 var before=JSON.parse(JSON.stringify(f.obj));f.obj.status="Dibatalkan";f.obj.updatedAt=now_();
 s.getRange(f.row,1,1,f.h.length).setValues([f.h.map(function(c){return sanitizeCell_(f.obj[c]===undefined?"":f.obj[c])})]);
 audit_(p,"USULAN_LOKASI",f.obj.usulanId,"CANCEL",before,f.obj,p.requestId,"Usulan lokasi dibatalkan");
 usulCacheOff_();
 return json_({ok:true});
}

// ---------- PENINJAUAN ADMIN (dijalankan dari editor Apps Script) ----------
function cekUsulanLokasi(){return usulanAdmin_(false)}
function terapkanUsulanLokasi(){return usulanAdmin_(true)}
// Sasaran penerapan satu usulan: lokasi yang diusulkan + semua entitas dengan kode lokasi (bandara) yang sama.
function usulSasaran_(x,ops,units){
 var out=[],seen={},kl=String(x.kodeLokasi||"").trim().toUpperCase(),add=function(jenis,id,obj,label){var k=jenis+":"+id;if(seen[k])return;seen[k]=1;out.push({jenis:jenis,id:id,obj:obj,label:label})};
 var uid=String(x.unitId||"");
 if(uid){var u=units.filter(function(z){return String(z.unitId)===uid})[0];if(u)add("UNIT",uid,u,u.namaUnit||uid)}
 else{var o=ops.filter(function(z){return String(z.operatorId)===String(x.operatorId)})[0];if(o)add("OP",String(o.operatorId),o,o.namaOperator)}
 if(kl){
  ops.forEach(function(o){if(opActive_(o)&&o.jenisOperator==="Bandar Udara"&&String(o.iata||"").trim().toUpperCase()===kl)add("OP",String(o.operatorId),o,"Bandara "+kl+" ("+o.namaOperator+")")});
  units.forEach(function(u){if(String(u.aktif).toLowerCase()!=="false"&&u.jenisUnit==="Stasiun"&&String(u.kodeUnit||"").trim().toUpperCase()===kl)add("UNIT",String(u.unitId),u,u.namaUnit||u.unitId)});
 }
 return out;
}
function usulanAdmin_(apply){
 var cad="";
 if(apply){
  var cek=usulanAdmin_(false);if(cek.indexOf("Pemeriksaan bersih")<0)return cek;
  if(cek.indexOf("siap diterapkan: 0 diterima, 0 ditolak")>=0){Logger.log(cek);return cek+"\nTidak ada keputusan untuk diterapkan."}
  try{cad=backupHarian()}catch(e){var mb="Cadangan sebelum menerapkan usulan GAGAL ("+(e&&e.message||e)+") — DIBATALKAN, tidak ada yang diubah.";Logger.log(mb);return mb}
 }
 var lock=LockService.getScriptLock();if(!lock.tryLock(30000))throw Error("Server sibuk, coba lagi.");
 try{
  ensureSheetsOnly_();
  var s=ss_().getSheetByName(SHEETS.USUL);
  if(!s||s.getLastRow()<2){var m0="USULAN_LOKASI: belum ada usulan.";Logger.log(m0);return m0}
  ensureHeaders_(s,H.USUL);
  var h=s.getRange(1,1,1,s.getLastColumn()).getValues()[0],raw=s.getRange(2,1,s.getLastRow()-1,h.length).getValues();
  var all=raw.map(function(r,i){var o={_row:i+2};h.forEach(function(k,j){o[k]=typeof r[j]==="string"?r[j].trim():r[j]});return o}).filter(function(o){return String(o.usulanId||"")});
  var open=all.filter(usulTerbuka_),opS=sheet_(SHEETS.OP,H.OP),uS=sheet_(SHEETS.UNIT,H.UNIT),ops=objs_(opS),units=objs_(uS);
  var errs=[],warn={},out=[],terima=[],tolak=[],tunggu=0,isi=0,kor=0;
  var w_=function(o,msg){(warn[o._row]=warn[o._row]||[]).push(msg)},lbl=function(o){return o.namaOperator+" › "+o.untuk+" (baris "+o._row+")"};
  open.forEach(function(o){
   var st=String(o.status||"");
   if(USUL_STATUS.indexOf(st)<0){errs.push(lbl(o)+": Status \""+st+"\" tidak dikenal — isi Menunggu, Diterima, atau Ditolak");return}
   if(o.jenis==="Koreksi")kor++;else isi++;
   if(st==="Menunggu"){tunggu++;return}
   if(st==="Ditolak"){if(!String(o.alasan||""))errs.push(lbl(o)+": Ditolak wajib diisi Alasan (tampil ke operator)");else tolak.push(o);return}
   var w=wilayah_(o.kodeWilayah);if(!w){errs.push(lbl(o)+": kodeWilayah \""+o.kodeWilayah+"\" tidak ada di daftar resmi");return}
   var t=usulTarget_(o.operatorId,o.unitId);if(t.error){errs.push(lbl(o)+": "+t.error);return}
   var sudah=sameVal_("",t.provinsi,w.provinsi)&&sameVal_("",t.kabkota,w.kabkota);
   if(!sudah&&!(sameVal_("",t.provinsi,o.provinsiSekarang)&&sameVal_("",t.kabkota,o.kabkotaSekarang)))errs.push(lbl(o)+": lokasi tercatat sudah berubah sejak diusulkan (sekarang \""+[t.kabkota,t.provinsi].filter(String).join(", ")+"\") — tinjau ulang, lalu ubah Status");
   o._w=w;terima.push(o);
  });
  // Bentrok: lokasi yang sama (operator+unit, atau kode bandara yang sama) diusulkan dengan wilayah berbeda.
  var grp=function(keyFn,nama){var g={};open.forEach(function(o){var st=String(o.status);if(st!=="Menunggu"&&st!=="Diterima")return;var k=keyFn(o);if(k)(g[k]=g[k]||[]).push(o)});
   Object.keys(g).forEach(function(k){var a=g[k],kode={};a.forEach(function(o){kode[o.kodeWilayah]=o.kabkota});var ks=Object.keys(kode);if(ks.length<2)return;
    var msg=nama(a[0])+": "+a.length+" usulan dengan wilayah berbeda ("+ks.map(function(c){return kode[c]}).join(" / ")+")";a.forEach(function(o){w_(o,"Bertentangan: "+msg)});
    var acc={};a.forEach(function(o){if(String(o.status)==="Diterima")acc[kodeWil_(o.kodeWilayah)]=1});if(Object.keys(acc).length>1)errs.push(msg+" — lebih dari satu wilayah berstatus Diterima; terima satu saja")})};
  grp(usulScope_,function(o){return o.namaOperator+" › "+o.untuk});
  grp(function(o){return String(o.kodeLokasi||"").toUpperCase()},function(o){return"Lokasi "+String(o.kodeLokasi).toUpperCase()});
  // Pratinjau penerapan untuk usulan Diterima.
  var plan=[];terima.forEach(function(o){
   var sas=usulSasaran_(o,ops,units),ubah=sas.filter(function(z){return!(sameVal_("",z.obj.provinsi,o._w.provinsi)&&sameVal_("",z.obj.kabkota,o._w.kabkota)&&kodeWil_(z.obj.kodeWilayah)===o._w.kode)});
   if(sas.length>1)w_(o,"Berlaku juga untuk "+(sas.length-1)+" entitas lain berkode "+String(o.kodeLokasi).toUpperCase());
   plan.push({o:o,ubah:ubah});
  });
  open.forEach(function(o){if(String(o.status)!=="Menunggu"&&String(o.status)!=="Diterima")return;var kl=String(o.kodeLokasi||"").toUpperCase();if(!kl)return;
   ops.forEach(function(b){if(opActive_(b)&&b.jenisOperator==="Bandar Udara"&&String(b.iata||"").trim().toUpperCase()===kl&&String(b.operatorId)!==String(o.operatorId)&&String(b.kabkota||"").trim()&&!(sameVal_("",b.provinsi,o.provinsi)&&sameVal_("",b.kabkota,o.kabkota)))w_(o,"Bandara "+kl+" tercatat "+b.kabkota+", "+b.provinsi)})});
  // Tulis kolom peringatan (satu kali tulis) — satu-satunya kolom yang diubah oleh pemeriksaan.
  var pc=h.indexOf("peringatan");
  if(pc>=0&&raw.length){var col=raw.map(function(r,i){var o=all.filter(function(z){return z._row===i+2})[0];if(!o||!usulTerbuka_(o))return[r[pc]];return[sanitizeCell_((warn[i+2]||[]).join("; "))]});
   if(col.some(function(v,i){return String(v[0])!==String(raw[i][pc])}))s.getRange(2,pc+1,col.length,1).setValues(col)}
  out.push("USULAN_LOKASI: "+open.length+" usulan belum diputuskan ("+isi+" isi baru, "+kor+" koreksi); "+tunggu+" masih Menunggu; siap diterapkan: "+terima.length+" diterima, "+tolak.length+" ditolak.");
  plan.forEach(function(x){out.push("  DITERIMA: "+lbl(x.o)+" → "+x.o._w.kabkota+", "+x.o._w.provinsi+(x.ubah.length?" — mengubah "+x.ubah.length+" entitas: "+x.ubah.slice(0,6).map(function(z){return z.label}).join("; ")+(x.ubah.length>6?"; …":""):" — data induk sudah sesuai"))});
  Object.keys(warn).forEach(function(r){var o=all.filter(function(z){return String(z._row)===String(r)})[0];warn[r].forEach(function(m){if(m.indexOf("Berlaku juga")<0)out.push("  PERINGATAN: "+lbl(o)+": "+m)})});
  if(errs.length){out.push("");out.push("DITEMUKAN "+errs.length+" MASALAH — tidak ada yang diterapkan:");errs.slice(0,100).forEach(function(x){out.push(" - "+x)});var m1=out.join("\n");Logger.log(m1);return m1}
  if(!apply){out.push("");out.push("Pemeriksaan bersih. Isi kolom Status (Diterima/Ditolak + Alasan) bila belum, lalu jalankan terapkanUsulanLokasi().");var m2=out.join("\n");Logger.log(m2);return m2}
  // --- terapkan
  var n=now_(),actor=adminActor_(),oleh=actor._auth.email,nUbah=0;
  plan.forEach(function(x){var w=x.o._w;x.ubah.forEach(function(z){
   var sh=z.jenis==="UNIT"?uS:opS,f=findBy_(sh,z.jenis==="UNIT"?"unitId":"operatorId",z.id);if(!f)return;
   var before=JSON.parse(JSON.stringify(f.obj));f.obj.provinsi=w.provinsi;f.obj.kabkota=w.kabkota;f.obj.kodeWilayah=w.kode;f.obj.updatedAt=n;
   sh.getRange(f.row,1,1,f.h.length).setValues([f.h.map(function(c){return sanitizeCell_(f.obj[c]===undefined?"":f.obj[c])})]);
   audit_(actor,z.jenis==="UNIT"?"UNIT":"OPERATOR",z.id,"UPDATE",before,f.obj,"","Usulan lokasi "+x.o.usulanId+" diterima");nUbah++})});
  var dc=h.indexOf("diputuskanAt"),oc=h.indexOf("diputuskanOleh"),uc=h.indexOf("updatedAt");
  terima.concat(tolak).forEach(function(o){var r=s.getRange(o._row,1,1,h.length),v=r.getValues()[0];v[dc]=n;v[oc]=oleh;if(uc>=0)v[uc]=n;r.setValues([v.map(sanitizeCell_)]);
   audit_(actor,"USULAN_LOKASI",o.usulanId,String(o.status)==="Diterima"?"APPROVE":"REJECT",{},{status:o.status,alasan:o.alasan||""},"","Peninjauan usulan lokasi")});
  invalidateDashboardCache_();
  var m3=["Cadangan sebelum menerapkan: "+cad,terima.length+" usulan Diterima diterapkan ("+nUbah+" baris MASTER_OPERATOR/MASTER_UNIT diperbarui, tercatat di AUDIT_LOG), "+tolak.length+" Ditolak (alasan tampil di formulir operator), "+tunggu+" tetap Menunggu.","SELESAI."].join("\n");
  Logger.log(m3);return m3;
 }finally{try{lock.releaseLock()}catch(x){}}
}

// ---------- SIMPAN PER PAKET (impor matriks) ----------
// Satu paket = satu operator induk, maks. BATCH_MAX baris. Semua baris divalidasi dulu; bila ada
// satu saja yang salah, TIDAK ADA yang disimpan (respons memuat daftar galat per baris).
// Idempoten: riskId = RISK-B-<batchId>-<n>; paket yang sama dikirim ulang tidak menggandakan data.
// Skenario yang sudah ada (operator+periode+kategori+skenario+unit sama) → galat DUPLICATE,
// kecuali lewatiDuplikat=true (baris itu dilewati, sisanya disimpan).
var BATCH_MAX=300;
var BATCH_FIELDS=["unitId","kategori","idRisikoKatalog","skenario","area","langkahSaatIni","kerentananSaatIni","ancamanNilai","kerentananNilai","konsekuensiNilai","perlakuan","prioritas","langkahTambahan","riskOwner","tanggalKaji","keterangan"];
function saveRiskBatch_(p){
 var rows=p.rows,bid=cleanToken_(p.batchId);
 if(!p._auth)return json_({ok:false,code:"AUTH_REQUIRED",error:"Impor matriks hanya untuk pengguna yang login."});
 if(!/^[A-Za-z0-9_-]{8,64}$/.test(bid))return json_({ok:false,code:"VALIDATION_ERROR",error:"batchId tidak valid."});
 if(!Array.isArray(rows)||!rows.length)return json_({ok:false,code:"VALIDATION_ERROR",error:"Paket kosong."});
 if(rows.length>BATCH_MAX)return json_({ok:false,code:"VALIDATION_ERROR",error:"Maksimal "+BATCH_MAX+" baris per paket."});
 var op=findBy_(sheet_(SHEETS.OP,H.OP),"operatorId",p.operatorId);
 if(!op)return json_({ok:false,code:"VALIDATION_ERROR",error:"Operator "+p.operatorId+" tidak ada di MASTER_OPERATOR."});
 var rs=sheet_(SHEETS.RISK,H.RISK),all=rows_(rs),hi=all.h.indexOf("riskId"),prefix="RISK-B-"+bid+"-";
 var done=all.a.filter(function(r){return String(r[hi]).indexOf(prefix)===0}).length;
 if(done)return json_({ok:true,duplicate:true,retry:true,saved:done,message:"Paket ini sudah pernah disimpan; tidak disimpan ulang."});
 var o=op.obj,d0=findCurrentDprkByOperator_(o.operatorId),dprkId=d0?d0.dprkId:("DPRK-"+o.operatorId);
 if(!d0&&!dateOnly_(p.tanggalPengesahan))return json_({ok:false,code:"VALIDATION_ERROR",error:"Tanggal pengesahan wajib diisi untuk DPRK baru."});
 var units={};unitMaster_().forEach(function(u){units[u.unitId]=u});
 var existing={};objs_(rs).forEach(function(x){existing[x.assessmentKey||assessmentKey_(x.operatorId,x.dprkId,x.bulan,x.tahun,x.kategori,x.skenario,x.unitId)]=x.riskId});
 var errs=[],seen={},keep=[],skipped=[];
 rows.forEach(function(r,i){
  var q={};BATCH_FIELDS.forEach(function(k){q[k]=r?r[k]:undefined});
  q.operatorId=o.operatorId;q.jenisOperator=o.jenisOperator;q.namaOperator=o.namaOperator;q.bulan=p.bulan;q.tahun=p.tahun;q.tanggalPengesahan=p.tanggalPengesahan||(d0&&d0.tanggalPengesahan)||"";q.isExistingDprkUpdate=!!d0;
  var e=validate_(q),uid=String(q.unitId||"").trim();
  if(uid){var u=units[uid];if(!u)e.push("unit "+uid+" tidak terdaftar");else if(!u.aktif)e.push("unit "+uid+" nonaktif");else if(u.operatorId!==o.operatorId)e.push("unit "+uid+" bukan milik operator ini")}
  var key=assessmentKey_(o.operatorId,dprkId,p.bulan,p.tahun,q.kategori,q.skenario,uid);
  if(seen[key]!==undefined)e.push("sama dengan baris "+(seen[key]+1)+" di paket ini");
  else seen[key]=i;
  if(!e.length&&existing[key]){if(p.lewatiDuplikat){skipped.push({baris:i+1,riskId:existing[key]});return}e.push("skenario sudah ada ("+existing[key]+")")}
  if(e.length)errs.push({baris:i+1,unitId:uid,galat:e});else keep.push({q:q,key:key});
 });
 if(errs.length)return json_({ok:false,code:"VALIDATION_ERROR",error:errs.length+" baris tidak valid; tidak ada yang disimpan.",errors:errs.slice(0,200)});
 if(!keep.length)return json_({ok:true,saved:0,skipped:skipped.length,skippedRows:skipped});
 var d=getOrCreateDprk_({operatorId:o.operatorId,jenisOperator:o.jenisOperator,namaOperator:o.namaOperator,bulan:p.bulan,tahun:p.tahun,tanggalPengesahan:p.tanggalPengesahan,tanggalKaji:p.tanggalKaji,namaPengisi:p.namaPengisi,jabatanPengisi:p.jabatanPengisi,linkFileDprk:p.linkFileDprk,emailRiskOwner:p.emailRiskOwner,_auth:p._auth,requestId:p.requestId});
 var n=now_(),h=rs.getLastColumn()?rs.getRange(1,1,1,rs.getLastColumn()).getValues()[0]:H.RISK,objsOut=[];
 var vals=keep.map(function(k,i){var q=k.q,rk=computeRisk_(q),x={riskId:prefix+(i+1),dprkId:d.dprkId,operatorId:o.operatorId,jenisOperator:o.jenisOperator,namaOperator:o.namaOperator,unitId:String(q.unitId||"").trim(),kategori:q.kategori,idRisikoKatalog:q.idRisikoKatalog||"",skenario:q.skenario,area:q.area||"",langkahSaatIni:q.langkahSaatIni||"",kerentananSaatIni:q.kerentananSaatIni||"",ancamanNilai:rk.ancamanNilai,ancamanRating:rk.ancamanRating,kerentananNilai:rk.kerentananNilai,kerentananRating:rk.kerentananRating,konsekuensiNilai:rk.konsekuensiNilai,konsekuensiRating:rk.konsekuensiRating,risikoNilai:rk.risikoNilai,risikoRating:rk.risikoRating,kategoriPenerimaan:rk.kategoriPenerimaan,perlakuan:q.perlakuan||"",prioritas:q.prioritas||"",langkahTambahan:q.langkahTambahan||"",pemilikRisiko:q.riskOwner||"",tanggalKaji:dateOnly_(q.tanggalKaji)||dateOnly_(p.tanggalKaji)||"",keterangan:q.keterangan||"",bulan:p.bulan||"",tahun:p.tahun||new Date().getFullYear(),namaPengisi:p.namaPengisi||"",jabatanPengisi:p.jabatanPengisi||"",createdAt:n,updatedAt:n,editToken:token_(),assessmentKey:k.key,rowVersion:1};objsOut.push(x);return h.map(function(c){return sanitizeCell_(x[c]===undefined?"":x[c])})});
 (ensureRows_(rs,vals.length),rs).getRange(rs.getLastRow()+1,1,vals.length,h.length).setValues(vals);
 var hs=sheet_(SHEETS.HIST,H.HIST),hh=hs.getRange(1,1,1,hs.getLastColumn()).getValues()[0];
 var hv=objsOut.map(function(r){var y={historyId:id_("HIST"),riskId:r.riskId,dprkId:r.dprkId,operatorId:r.operatorId,jenisOperator:r.jenisOperator,namaOperator:r.namaOperator,tanggal:n,bulan:r.bulan,tahun:r.tahun,nilaiAncaman:r.ancamanNilai,nilaiKerentanan:r.kerentananNilai,nilaiKonsekuensi:r.konsekuensiNilai,nilaiRisiko:r.risikoNilai,ratingRisiko:r.risikoRating,versiDprk:1,perubahan:"Create (impor)",updatedBy:p.namaPengisi||"",rowVersion:1,beforeData:"{}",afterData:"{\"batchId\":\""+bid+"\"}",unitId:r.unitId};return hh.map(function(c){return sanitizeCell_(y[c]===undefined?"":y[c])})});
 (ensureRows_(hs,hv.length),hs).getRange(hs.getLastRow()+1,1,hv.length,hh.length).setValues(hv);
 audit_(p,"RISK_BATCH",bid,"BATCH_CREATE",{},{operatorId:o.operatorId,jumlah:objsOut.length,dilewati:skipped.length,unit:Object.keys(objsOut.reduce(function(m,r){if(r.unitId)m[r.unitId]=1;return m},{})).length},p.requestId,"Impor matriks per paket");
 invalidateDashboardCache_();
 return json_({ok:true,saved:objsOut.length,skipped:skipped.length,skippedRows:skipped,dprkId:d.dprkId,riskIds:objsOut.map(function(r){return r.riskId})});
}

// ---------- IMPOR ADMIN (dijalankan dari editor Apps Script) ----------
// Tempel sheet dari file impor ke spreadsheet dengan nama:
//   IMPOR_OPERATOR   (operator baru, mis. PAUA)          → kolom seperti MASTER_OPERATOR
//   PERBAIKAN_MASTER (koreksi kolom MASTER_OPERATOR)       → operatorId, Bandara, Kolom, Nilai sekarang, Nilai baru
//   IMPOR_UNIT       (daftar unit/stasiun)                 → unitId, operatorId, jenisUnit, namaUnit, kodeUnit, provinsi, kabkota
// Lalu: cekImporAdmin() (hanya memeriksa, tidak mengubah apa pun) → bila bersih, terapkanImporAdmin().
// Judul kolom cukup diawali nama kolomnya (mis. "operatorId (induk DPRK)" dikenali sebagai operatorId).
// Aman dijalankan ulang: operator & unit di-upsert berdasarkan ID; perbaikan hanya diterapkan
// bila "Nilai sekarang" masih sama dengan isi master.
var IMPOR_OP_ALLOWED=["Bandar Udara","Airlines","LPPNPI","Regulated Agent"];
var PERBAIKAN_KOLOM=["namaOperator","kodeOperator","iata","icao","provinsi","kabkota","lokasi","kelas","status","aktif"];
// V3.37: status & aktif selalu diselaraskan (Aktif↔TRUE, Nonaktif↔FALSE). Operator Nonaktif tidak dihitung di
// Total Operator / Completion Rate, tetapi riwayatnya (DPRK, laporan, audit) tetap ada.
function boolText_(v){var x=String(v===undefined||v===null?"":v).trim().toLowerCase();if(x==="true"||x==="ya"||x==="aktif"||x==="1")return"true";if(x==="false"||x==="tidak"||x==="nonaktif"||x==="0")return"false";return x}
function sameVal_(k,a,b){return k==="aktif"?boolText_(a)===boolText_(b):String(a===undefined||a===null?"":a).trim()===String(b===undefined||b===null?"":b).trim()}
function imporRows_(name){
 var s=ss_().getSheetByName(name);if(!s||s.getLastRow()<2)return null;
 var raw=s.getRange(1,1,s.getLastRow(),s.getLastColumn()).getValues(),h=raw[0].map(function(x){return String(x||"").split("(")[0].replace(/\s+/g,"")}); // "operatorId (induk DPRK)"→operatorId, "Nilai baru"→Nilaibaru
 return raw.slice(1).filter(function(r){return r.some(function(v){return String(v).trim()!==""})}).map(function(r,i){var o={_baris:i+2};h.forEach(function(k,j){if(k&&!(k in o))o[k]=typeof r[j]==="string"?r[j].trim():r[j]});return o});
}
function adminActor_(){var e="";try{e=Session.getEffectiveUser().getEmail()}catch(x){}return{_auth:{email:"ADMIN_IMPORT:"+(e||"editor")}}}
function cekImporAdmin(){return imporAdmin_(false)}
function terapkanImporAdmin(){return imporAdmin_(true)}
function imporAdmin_(apply){
 // V3.37: sebelum menerapkan, periksa dulu; bila bersih buat CADANGAN spreadsheet (backupHarian). Cadangan gagal → impor dibatalkan.
 var cad="";
 if(apply){
  var cek=imporAdmin_(false);if(cek.indexOf("Pemeriksaan bersih")<0)return cek;
  try{cad=backupHarian()}catch(e){var mb="Cadangan sebelum impor GAGAL ("+(e&&e.message||e)+") — impor DIBATALKAN, tidak ada yang diubah.";Logger.log(mb);return mb}
 }
 var lock=LockService.getScriptLock();if(apply&&!lock.tryLock(30000))throw Error("Server sibuk, coba lagi.");
 try{
  ensureSheetsOnly_();
  var out=[],errs=[],n=now_(),opS=sheet_(SHEETS.OP,H.OP),ops=objs_(opS),opById={};ops.forEach(function(o){opById[String(o.operatorId)]=o});
  // V3.37.1 — kesehatan MASTER_OPERATOR (peringatan, tidak memblokir impor): baris tanpa operatorId, status/aktif tidak selaras,
  // kode bandara/operator ganda di antara operator aktif. Ditambah jumlah yang dihitung Dashboard sebagai Total Operator.
  (function(){var w=[],tanpaId=0,kode={};ops.forEach(function(o){var id=String(o.operatorId==null?"":o.operatorId).trim();
   if(!id){tanpaId++;return}
   var bt=boolText_(o.aktif),st=String(o.status==null?"":o.status).trim();
   if((bt==="false"&&st==="Aktif")||(bt!=="false"&&st==="Nonaktif"))w.push(id+": status \""+st+"\" tetapi aktif \""+o.aktif+"\" (dihitung NONAKTIF; selaraskan lewat PERBAIKAN_MASTER)");
   var kd=String(o.kodeOperator||"").trim().toUpperCase();if(kd&&opActive_(o)){if(kode[kd])w.push("kode "+kd+" dipakai "+kode[kd]+" dan "+id);else kode[kd]=id}});
   if(tanpaId)w.unshift(tanpaId+" baris berisi data tetapi tanpa operatorId (mis. sel berisi spasi) — hapus barisnya");
   out.push("MASTER_OPERATOR: "+ops.filter(opActive_).length+" operator aktif (Total Operator di Dashboard).");
   w.forEach(function(x){out.push("  PERINGATAN: "+x)})})();
  // 1. Operator baru / pelengkap
  var io=imporRows_("IMPOR_OPERATOR"),addOps=[],fillOps=[];
  if(io){var seen={};io.forEach(function(r){
   var id=String(r.operatorId||""),e=[];
   if(!AUTH_OPID_RE.test(id))e.push("operatorId tidak valid");
   if(seen[id])e.push("operatorId ganda (baris "+seen[id]+")");seen[id]=r._baris;
   if(IMPOR_OP_ALLOWED.indexOf(r.jenisOperator)<0)e.push("jenisOperator harus salah satu: "+IMPOR_OP_ALLOWED.join(", "));
   if(!String(r.namaOperator||""))e.push("namaOperator kosong");
   if(e.length){errs.push("IMPOR_OPERATOR baris "+r._baris+": "+e.join("; "));return}
   var aktif=String(r.aktif).toLowerCase()!=="false"&&String(r.status||"Aktif")!=="Nonaktif";
   if(opById[id]){var cur=opById[id],fill={};OP_MERGE_FIELDS.forEach(function(k){if(!String(cur[k]||"").trim()&&String(r[k]||"").trim())fill[k]=r[k]});if(Object.keys(fill).length)fillOps.push({id:id,fill:fill})}
   else addOps.push({operatorId:id,jenisOperator:r.jenisOperator,namaOperator:r.namaOperator,kodeOperator:r.kodeOperator||"",iata:r.iata||"",icao:r.icao||"",provinsi:r.provinsi||"",kabkota:r.kabkota||"",lokasi:r.lokasi||"",kelas:r.kelas||"",status:aktif?"Aktif":"Nonaktif",aktif:aktif,createdAt:n,updatedAt:n});
  });out.push("IMPOR_OPERATOR: "+addOps.length+" operator baru ("+addOps.filter(function(x){return x.aktif}).length+" aktif), "+fillOps.length+" operator lama dilengkapi.")}
  var known={};ops.forEach(function(o){known[String(o.operatorId)]=true});addOps.forEach(function(o){known[o.operatorId]=true});
  // 2. Perbaikan master
  var pm=imporRows_("PERBAIKAN_MASTER"),fixes=[];
  if(pm){pm.forEach(function(r){
   var id=String(r.operatorId||""),k=String(r.Kolom||""),lama=String(r.Nilaisekarang===undefined?"":r.Nilaisekarang).trim(),baru=String(r.Nilaibaru===undefined?"":r.Nilaibaru).trim(),cur=opById[id];
   if(!cur){errs.push("PERBAIKAN_MASTER baris "+r._baris+": operator "+id+" tidak ada");return}
   if(PERBAIKAN_KOLOM.indexOf(k)<0){errs.push("PERBAIKAN_MASTER baris "+r._baris+": kolom "+k+" tidak boleh diubah lewat impor");return}
   if(!baru){errs.push("PERBAIKAN_MASTER baris "+r._baris+": Nilai baru kosong");return}
   if(k==="status"&&["Aktif","Nonaktif"].indexOf(baru)<0){errs.push("PERBAIKAN_MASTER baris "+r._baris+": status harus Aktif atau Nonaktif");return}
   if(k==="aktif"&&["true","false"].indexOf(boolText_(baru))<0){errs.push("PERBAIKAN_MASTER baris "+r._baris+": aktif harus TRUE atau FALSE");return}
   var now=String(cur[k]===undefined?"":cur[k]).trim();
   if(sameVal_(k,now,baru))return; // sudah diterapkan sebelumnya
   if(!sameVal_(k,now,lama)){errs.push("PERBAIKAN_MASTER baris "+r._baris+": "+id+"."+k+" sekarang \""+now+"\", bukan \""+lama+"\" — periksa ulang");return}
   fixes.push({id:id,k:k,v:baru});
  });out.push("PERBAIKAN_MASTER: "+fixes.length+" perubahan siap diterapkan.")}
  // 3. Unit
  var iu=imporRows_("IMPOR_UNIT"),uS=sheet_(SHEETS.UNIT,H.UNIT),uOld={},uAdd=[],uUpd=[],uSama=0;
  objs_(uS).forEach(function(u){uOld[String(u.unitId)]=u});
  if(iu){var seenU={};iu.forEach(function(r){
   var id=String(r.unitId||""),oid=String(r.operatorId||""),e=[];
   if(!UNIT_ID_RE.test(id))e.push("unitId tidak valid");
   if(seenU[id])e.push("unitId ganda (baris "+seenU[id]+")");seenU[id]=r._baris;
   if(!known[oid])e.push("operator induk "+oid+" tidak ada di MASTER_OPERATOR / IMPOR_OPERATOR");
   if(UNIT_JENIS.indexOf(r.jenisUnit)<0)e.push("jenisUnit harus salah satu: "+UNIT_JENIS.join(", "));
   if(!String(r.namaUnit||""))e.push("namaUnit kosong");
   if(uOld[id]&&String(uOld[id].operatorId)!==oid)e.push("unit sudah terdaftar di bawah "+uOld[id].operatorId+" (operator induk tidak boleh berubah)");
   if(e.length){errs.push("IMPOR_UNIT baris "+r._baris+": "+e.join("; "));return}
   var ak=r.aktif===undefined||String(r.aktif).trim()===""?"true":boolText_(r.aktif); // kolom aktif opsional; kosong = aktif
   if(ak!=="true"&&ak!=="false"){errs.push("IMPOR_UNIT baris "+r._baris+": aktif harus TRUE atau FALSE");return}
   var x={unitId:id,operatorId:oid,jenisUnit:r.jenisUnit,namaUnit:r.namaUnit,kodeUnit:r.kodeUnit||"",provinsi:r.provinsi||"",kabkota:r.kabkota||"",aktif:ak==="true"};
   // V3.37.2: unit yang sudah terdaftar dan isinya SAMA dilewati (sebelumnya selalu ditulis ulang satu per satu → batas waktu 6 menit).
   if(uOld[id]){if(UNIT_CMP.some(function(k){return k==="aktif"?boolText_(uOld[id].aktif)!==boolText_(x.aktif):String(uOld[id][k]==null?"":uOld[id][k]).trim()!==String(x[k]).trim()}))uUpd.push(x);else uSama++}
   else uAdd.push(x);
  });out.push("IMPOR_UNIT: "+uAdd.length+" unit baru, "+uUpd.length+" unit diperbarui"+(uSama?", "+uSama+" tidak berubah":"")+(function(){var n=uAdd.concat(uUpd).filter(function(u){return!u.aktif}).length;return n?" ("+n+" dinonaktifkan)":""})()+".")}
  if(!io&&!pm&&!iu)out.push("Tidak ada sheet IMPOR_OPERATOR / PERBAIKAN_MASTER / IMPOR_UNIT yang berisi data.");
  if(errs.length){out.push("");out.push("DITEMUKAN "+errs.length+" MASALAH — tidak ada yang diterapkan:");errs.slice(0,100).forEach(function(x){out.push(" - "+x)});var m1=out.join("\n");Logger.log(m1);return m1}
  if(!apply){out.push("");out.push("Pemeriksaan bersih. Jalankan terapkanImporAdmin() untuk menerapkan.");var m2=out.join("\n");Logger.log(m2);return m2}
  // --- terapkan
  var oh=opS.getRange(1,1,1,opS.getLastColumn()).getValues()[0];
  if(addOps.length)(ensureRows_(opS,addOps.length),opS).getRange(opS.getLastRow()+1,1,addOps.length,oh.length).setValues(addOps.map(function(o){return oh.map(function(c){return sanitizeCell_(o[c]===undefined?"":o[c])})}));
  fillOps.concat(fixes.map(function(f){var x={};x[f.k]=f.v;
   if(f.k==="status")x.aktif=f.v==="Aktif";
   if(f.k==="aktif"){x.aktif=boolText_(f.v)==="true";x.status=x.aktif?"Aktif":"Nonaktif"}
   return{id:f.id,fill:x}})).forEach(function(f){var r=findBy_(opS,"operatorId",f.id),before=JSON.parse(JSON.stringify(r.obj));Object.keys(f.fill).forEach(function(k){r.obj[k]=f.fill[k]});r.obj.updatedAt=n;opS.getRange(r.row,1,1,r.h.length).setValues([r.h.map(function(c){return sanitizeCell_(r.obj[c]===undefined?"":r.obj[c])})]);audit_(adminActor_(),"OPERATOR",f.id,"UPDATE",before,r.obj,"","Impor admin: "+Object.keys(f.fill).join(","))});
  var uh=uS.getRange(1,1,1,uS.getLastColumn()).getValues()[0];
  if(uAdd.length)(ensureRows_(uS,uAdd.length),uS).getRange(uS.getLastRow()+1,1,uAdd.length,uh.length).setValues(uAdd.map(function(u){u.createdAt=n;u.updatedAt=n;return uh.map(function(c){return sanitizeCell_(u[c]===undefined?"":u[c])})}));
  // V3.37.2: perbarui unit dalam SATU baca + SATU tulis (bukan cari & tulis per baris).
  if(uUpd.length&&uS.getLastRow()>1){var ub=uS.getRange(2,1,uS.getLastRow()-1,uh.length).getValues(),ui=uh.indexOf("unitId"),pos={};ub.forEach(function(r,i){pos[String(r[ui])]=i});
   uUpd.forEach(function(u){var i=pos[u.unitId];if(i===undefined)return;u.updatedAt=n;uh.forEach(function(c,j){if(c in u)ub[i][j]=sanitizeCell_(u[c])})});
   uS.getRange(2,1,ub.length,uh.length).setValues(ub)}
  if(addOps.length)audit_(adminActor_(),"OPERATOR","IMPOR_OPERATOR","BATCH_CREATE",{},{jumlah:addOps.length},"","Impor admin operator");
  if(uAdd.length||uUpd.length)audit_(adminActor_(),"UNIT","IMPOR_UNIT","BATCH_UPSERT",{},{baru:uAdd.length,diperbarui:uUpd.length},"","Impor admin unit");
  invalidateDashboardCache_();
  out.push("");out.push("Cadangan sebelum impor: "+cad);out.push("SELESAI diterapkan "+n+".");var m3=out.join("\n");Logger.log(m3);return m3;
 }finally{if(apply)try{lock.releaseLock()}catch(x){}}
}
