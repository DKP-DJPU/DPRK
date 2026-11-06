/*
 * Impor Matriks DPRK dari Excel — SI-RISK AVSEC.
 *
 * Operator mengunggah file Excel matriks DPRK (sheet "MATRIKS DAFTAR RISIKO", format Lampiran II: ID RISK |
 * SKENARIO ANCAMAN | AREA KERENTANAN | LANGKAH KEAMANAN SAAT INI | KERENTANAN SAAT INI | ANCAMAN/KERENTANAN/
 * KONSEKUENSI/RISIKO (NILAI + RATING) | LANGKAH TAMBAHAN | PEMILIK RISIKO | TANGGAL KAJI ULANG | KETERANGAN).
 * File dibaca DI PERAMBAN (ExcelJS, assets/vendor) — file tidak dikirim ke server; yang dikirim hanya baris
 * hasil baca lewat aksi saveRiskBatch (Apps Script V3.37: semua baris divalidasi dulu, aman dikirim ulang).
 *
 * Bagian PARSER di bawah murni (tanpa DOM) dan diuji di Node: tests/client/impor-matriks.test.js.
 * Kebiasaan file nyata yang ditangani:
 *  - ID "1.10" yang diubah Excel menjadi tanggal (10 Jan) → 01.10; ID angka 3.6 → 03.06 (dicek dengan teks katalog);
 *    "1,0" / "3. 0" = baris judul kategori.
 *  - ID yang tidak cocok dengan teks skenarionya dikoreksi bila teksnya identik dengan skenario lain di katalog.
 *  - Tanggal kaji ulang berupa tanggal Excel, "22 Juli 2026", "31/12/2026", atau beberapa tanggal + catatan.
 *  - Perlakuan "Sharing" = Pembagian; "Mitigasi dan Sharing" → Mitigasi (teks asli disimpan di keterangan).
 *  - Bagian "HASIL PENILAIAN RISIKO KHUSUS" di bawah tabel utama ditandai "Risiko khusus".
 */
(function (root) {
  "use strict";
  var P = {};
  var BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  var BULAN_RE = [
    /^jan/, /^feb|^peb/, /^mar/, /^apr/, /^mei$|^may|^mei/, /^jun/, /^jul/, /^agu|^ags|^agt|^aug/, /^sep/, /^okt|^oct/, /^nov|^nop/, /^des|^dec/,
  ];
  // Sama dengan Code.gs (PR 16/41 DJPU 2024).
  var BAND_TOTAL = [[3, 7, "Rendah"], [8, 13, "Menengah-Rendah"], [14, 19, "Menengah"], [20, 25, "Menengah-Tinggi"], [26, 30, "Tinggi"]];
  function band(n) {
    for (var i = 0; i < BAND_TOTAL.length; i++) if (n >= BAND_TOTAL[i][0] && n <= BAND_TOTAL[i][1]) return BAND_TOTAL[i][2];
    return "";
  }
  function str(v) {
    return v === null || v === undefined ? "" : String(v).replace(/\r\n?/g, "\n").trim();
  }
  function normH(s) {
    return str(s).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  }
  function normT(s) {
    return str(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }
  // Kemiripan teks (koefisien Dice atas bigram huruf) — 1 = identik.
  function dice(a, b) {
    a = normT(a).replace(/ /g, "");
    b = normT(b).replace(/ /g, "");
    if (!a || !b) return 0;
    if (a === b) return 1;
    var m = {},
      n = 0,
      i;
    for (i = 0; i < a.length - 1; i++) {
      var g = a.substr(i, 2);
      m[g] = (m[g] || 0) + 1;
    }
    for (i = 0; i < b.length - 1; i++) {
      var h = b.substr(i, 2);
      if (m[h] > 0) {
        m[h]--;
        n++;
      }
    }
    return (2 * n) / (a.length - 1 + (b.length - 1));
  }
  P.dice = dice;
  function pad2(n) {
    return ("0" + n).slice(-2);
  }
  function iso(y, m, d) {
    return y + "-" + pad2(m) + "-" + pad2(d);
  }
  function isDate(v) {
    return Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime());
  }
  // ID RISK → {major, minor[], kind}. minor berisi kandidat (lebih dari satu bila ambigu, mis. angka 3.6).
  function parseId(v) {
    if (v === null || v === undefined || v === "") return null;
    if (isDate(v)) return { major: v.getUTCMonth() + 1, minor: [v.getUTCDate()], kind: "tanggal", raw: pad2(v.getUTCMonth() + 1) + "." + pad2(v.getUTCDate()) };
    var s = str(v).replace(/,/g, ".").replace(/\s+/g, "");
    var m = /^(\d{1,2})\.(\d{1,3})$/.exec(s) || /^(\d{1,2})$/.exec(s);
    if (!m) return null;
    var maj = Number(m[1]),
      mn = m[2] === undefined ? "0" : m[2];
    if (/^0+$/.test(mn)) return { major: maj, minor: [0], kind: "kategori", raw: s };
    var cands = [Number(mn)];
    if (typeof v === "number" && mn.length === 1) cands = [Number(mn), Number(mn) * 10]; // 3.6 bisa 3.06 atau 3.60
    return { major: maj, minor: cands, kind: typeof v === "number" ? "angka" : "teks", raw: s };
  }
  P.parseId = parseId;
  function monthIdx(w) {
    w = String(w || "").toLowerCase();
    for (var i = 0; i < 12; i++) if (BULAN_RE[i].test(w)) return i;
    return -1;
  }
  // Semua tanggal yang terbaca dari isi sel (Date Excel, serial, "22 Juli 2026", "31/12/2026", "2026-12-31").
  function parseDates(v) {
    if (isDate(v)) return [iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate())];
    if (typeof v === "number" && v > 30000 && v < 80000) {
      var d = new Date(Math.round((v - 25569) * 86400000));
      return [iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())];
    }
    var s = str(v),
      out = [],
      m,
      re1 = /(\d{1,2})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*(\d{4})/g,
      re2 = /(\d{4})-(\d{1,2})-(\d{1,2})/g,
      re3 = /(\d{1,2})\s+([A-Za-z]{3,10})\.?\s+(\d{4})/g;
    while ((m = re2.exec(s))) out.push(iso(+m[1], +m[2], +m[3]));
    s = s.replace(re2, " ");
    while ((m = re1.exec(s))) if (+m[2] >= 1 && +m[2] <= 12) out.push(iso(+m[3], +m[2], +m[1]));
    while ((m = re3.exec(s))) {
      var mi = monthIdx(m[2]);
      if (mi >= 0) out.push(iso(+m[3], mi + 1, +m[1]));
    }
    return out.filter(function (x) {
      var p = x.split("-");
      return +p[1] >= 1 && +p[1] <= 12 && +p[2] >= 1 && +p[2] <= 31;
    });
  }
  P.parseDates = parseDates;
  function perlakuan(s) {
    var t = normH(s);
    if (!t) return { v: "", note: "" };
    var mit = /MITIGA/.test(t),
      sha = /SHARING|SHARE|PEMBAGIAN|BAGI|TRANSFER|PENGALIHAN/.test(t),
      ter = /DITERIMA|TERIMA|ACCEPT|RETENSI|RETAIN/.test(t),
      tol = /PENOLAKAN|TOLAK|AVOID|HINDAR/.test(t);
    var n = [mit, sha, ter, tol].filter(Boolean).length;
    var v = mit ? "Mitigasi" : sha ? "Pembagian" : ter ? "Diterima" : tol ? "Penolakan" : "";
    return { v: v, note: n > 1 || !v ? "Perlakuan di matriks: " + str(s) : "" };
  }
  P.perlakuan = perlakuan;
  function num(v) {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") return v;
    var s = str(v).replace(",", ".");
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
  }
  // Mencari baris judul (sel "ID RISK") dan peta kolom.
  function headerMap(rows) {
    for (var r = 0; r < Math.min(rows.length, 40); r++) {
      var row = rows[r] || [],
        c = {};
      row.forEach(function (cell, j) {
        var h = normH(cell && cell.v);
        if (!h) return;
        if (h === "ID RISK" || h === "ID RISIKO") c.id = j;
        else if (/^SKENARIO/.test(h) && c.sk === undefined) c.sk = j;
        else if (/^AREA/.test(h)) c.area = j;
        else if (/^LANGKAH KEAMANAN SAAT INI/.test(h)) c.langkah = j;
        else if (/^KERENTANAN (SAAT INI|YANG ADA)/.test(h)) c.kerSaat = j;
        else if (h === "ANCAMAN") c.anc = c.anc === undefined ? j : c.anc;
        else if (h === "KERENTANAN") c.ker = c.ker === undefined ? j : c.ker;
        else if (h === "KONSEKUENSI") c.kon = c.kon === undefined ? j : c.kon;
        else if (h === "RISIKO" || h === "RESIKO") c.ris = c.ris === undefined ? j : c.ris;
        else if (/^LANGKAH LANGKAH/.test(h)) c.tambah = j;
        else if (/^PEMILIK/.test(h)) c.owner = j;
        else if (/^TANGGAL/.test(h)) c.tgl = j;
        else if (/^KETERANGAN|^PERLAKUAN/.test(h)) c.ket = j;
      });
      if (c.id !== undefined && c.sk !== undefined) {
        c.headerRow = r;
        var sub = -1;
        for (var k = r + 1; k <= r + 3 && k < rows.length; k++)
          if ((rows[k] || []).some(function (x) { return normH(x && x.v) === "NILAI"; })) sub = k;
        c.subRow = sub;
        var next = rows[r][c.sk + 1];
        c.skText = !normH(next && next.v) && c.sk + 1 !== c.area ? c.sk + 1 : c.sk;
        return c;
      }
    }
    return null;
  }
  function rowText(row) {
    return (row || []).map(function (x) { return str(x && x.v); }).filter(Boolean).join(" ");
  }
  function parseMeta(rows, upto) {
    var meta = { operator: "", bulan: "", tahun: "" };
    for (var r = 0; r < upto; r++) {
      var t = rowText(rows[r]);
      if (!meta.operator && /OPERATOR/i.test(t)) meta.operator = str(t.split(":").slice(1).join(":")) || str(t.replace(/^.*?OPERATOR\s*(PENERBANGAN|BANDAR UDARA)?/i, ""));
      if (!meta.bulan && /\bBULAN\b/i.test(t)) {
        var words = t.replace(/BULAN|TAHUN|:/gi, " ").split(/\s+/);
        for (var i = 0; i < words.length; i++) {
          var mi = monthIdx(words[i]);
          if (mi >= 0 && words[i].length >= 3) {
            meta.bulan = BULAN[mi];
            break;
          }
        }
        var y = /(20\d{2})/.exec(t);
        if (y) meta.tahun = y[1];
      }
    }
    return meta;
  }
  /*
   * rows: array baris; setiap baris array sel {v} (v = angka | teks | Date | null), indeks kolom mulai 0.
   * katalog: { kategori: [[kode, nama]], skenario: [[id, kodeKategori, teks, area, pemilik]] }.
   * Hasil: { fatal, meta, rows: [{ line, idFile, id, kategori, ..., errors[], warnings[] }] }.
   */
  P.parseGrid = function (rows, katalog) {
    katalog = katalog || { kategori: [], skenario: [] };
    var c = headerMap(rows);
    if (!c) return { fatal: 'Judul kolom "ID RISK" dan "SKENARIO ANCAMAN" tidak ditemukan. Pastikan memakai sheet MATRIKS DAFTAR RISIKO sesuai format Lampiran II.', rows: [] };
    if (c.anc === undefined || c.ker === undefined || c.kon === undefined || c.subRow < 0)
      return { fatal: "Kolom NILAI untuk Ancaman, Kerentanan, dan Konsekuensi tidak ditemukan. Format matriks lama yang hanya berisi rating (tanpa angka) belum dapat diimpor.", rows: [] };
    var KN = {},
      SK = {},
      byKat = {};
    katalog.kategori.forEach(function (k) { KN[k[0]] = k[1]; });
    katalog.skenario.forEach(function (s) {
      SK[s[0]] = s;
      (byKat[s[1]] = byKat[s[1]] || []).push(s);
    });
    var meta = parseMeta(rows, c.headerRow),
      out = [],
      khusus = false;
    for (var r = c.subRow + 1; r < rows.length; r++) {
      var row = rows[r] || [],
        g = function (j) { return j === undefined ? null : row[j] ? row[j].v : null; },
        first = str(g(c.id));
      if (/HASIL PENILAIAN/i.test(rowText(row)) && !parseId(g(c.id))) {
        khusus = true;
        continue;
      }
      var pid = parseId(g(c.id));
      if (!pid) continue;
      var a = num(g(c.anc)),
        k = num(g(c.ker)),
        q = num(g(c.kon)),
        text = str(g(c.skText)) || (c.skText !== c.sk && str(g(c.sk)).length > 3 ? str(g(c.sk)) : ""),
        kosong = a === null && k === null && q === null;
      if (pid.kind === "kategori" && kosong) continue;
      if (kosong && (!text || /^[.…\s-]*$/.test(text))) continue; // baris contoh "b. …..." pada templat
      var kat = pad2(pid.major),
        x = { line: r + 1, idFile: pid.raw || first, kategori: KN[kat] ? kat + " - " + KN[kat] : "", skenario: text, area: str(g(c.area)), langkahSaatIni: str(g(c.langkah)), kerentananSaatIni: str(g(c.kerSaat)), langkahTambahan: str(g(c.tambah)), riskOwner: str(g(c.owner)), ancamanNilai: a, kerentananNilai: k, konsekuensiNilai: q, khusus: khusus, errors: [], warnings: [], notes: [] };
      // ID: kandidat (ambigu untuk angka 3.6) → pilih yang ada di katalog & paling mirip teksnya.
      var cands = pid.minor.map(function (m) { return kat + "." + pad2(m); }).filter(function (id) { return id.length === 5; });
      var scored = cands.map(function (id) { return { id: id, s: SK[id] ? dice(text, SK[id][2]) : -1 }; }).sort(function (u, v) { return v.s - u.s; });
      var id = scored.length ? scored[0].id : kat + "." + pad2(pid.minor[0]),
        own = scored.length ? scored[0].s : -1;
      if (pid.kind === "angka" && cands.length > 1 && !SK[cands[0]] && !SK[cands[1]]) id = cands[0];
      if (text) {
        var best = { id: "", s: 0 };
        (byKat[kat] || []).forEach(function (s) {
          var d = dice(text, s[2]);
          if (d > best.s) best = { id: s[0], s: d };
        });
        if (best.id && best.id !== id && best.s >= 0.95 && own < 0.85) {
          x.warnings.push("ID di file " + x.idFile + ", tetapi teks skenarionya sama dengan katalog " + best.id + " → dipakai " + best.id + ".");
          id = best.id;
          x.idDikoreksi = true;
        } else if (!SK[id]) x.warnings.push("ID " + id + " tidak ada di katalog nasional; tetap disimpan dengan ID ini.");
      }
      x.idRisikoKatalog = id;
      if (!x.kategori) x.errors.push("Kategori " + kat + " tidak dikenal (harus 01–19).");
      if (!text) x.errors.push("Teks skenario kosong.");
      [["Ancaman", a, "ancamanNilai"], ["Kerentanan", k, "kerentananNilai"], ["Konsekuensi", q, "konsekuensiNilai"]].forEach(function (z) {
        if (z[1] === null) x.errors.push("Nilai " + z[0] + " kosong.");
        else if (!(z[1] >= 1 && z[1] <= 10 && Math.floor(z[1]) === z[1])) x.errors.push("Nilai " + z[0] + " harus bilangan bulat 1–10 (di file: " + str(g(c[{ Ancaman: "anc", Kerentanan: "ker", Konsekuensi: "kon" }[z[0]]])) + ").");
      });
      if (!x.errors.length) {
        x.total = a + k + q;
        x.rating = band(x.total);
        var rf = num(g(c.ris)),
          rr = normH(g(c.ris === undefined ? undefined : c.ris + 1));
        if (rf !== null && !isNaN(rf) && rf !== x.total) x.warnings.push("Nilai risiko di file " + rf + ", hasil hitung " + x.total + " (dipakai hasil hitung).");
        if (rr && rr !== normH(x.rating)) x.warnings.push("Rating di file " + str(g(c.ris + 1)) + ", hasil hitung " + x.rating + ".");
      }
      var pl = perlakuan(g(c.ket));
      x.perlakuan = pl.v;
      if (pl.note) x.notes.push(pl.note);
      if (!pl.v) x.warnings.push(str(g(c.ket)) ? "Perlakuan \"" + str(g(c.ket)) + "\" tidak dikenali." : "Perlakuan (kolom KETERANGAN) kosong.");
      var tv = g(c.tgl),
        ds = parseDates(tv).sort();
      x.tanggalKaji = ds[0] || "";
      if (ds.length > 1 || (ds.length && str(tv) && !isDate(tv) && str(tv).replace(/[\d\/.\s-]/g, "").length > 12)) x.notes.push("Tanggal kaji ulang di matriks: " + str(isDate(tv) ? x.tanggalKaji : tv).replace(/\s*\n\s*/g, " / "));
      if (!ds.length && str(tv)) {
        x.warnings.push("Tanggal kaji ulang tidak terbaca: \"" + str(tv) + "\".");
        x.notes.push("Tanggal kaji ulang di matriks: " + str(tv));
      }
      if (khusus) x.notes.unshift("Risiko khusus");
      x.keterangan = x.notes.join("; ");
      out.push(x);
    }
    if (!out.length) return { fatal: "Tidak ada baris skenario yang terbaca di bawah judul kolom.", meta: meta, rows: [] };
    return { fatal: null, meta: meta, rows: out, kolom: c };
  };
  P.BULAN = BULAN;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = P;
    return;
  }
  root.SIRISK_IMPOR = P;

  // ===================== TAMPILAN (peramban) =====================
  var VENDOR = "assets/vendor/exceljs.min.js?v=4.4.0";
  var st = { file: null, res: null, busy: false, msg: null, dup: false };
  function $(id) {
    return document.getElementById(id);
  }
  function S() {
    return window.SIRISK;
  }
  function esc(x) {
    return String(x === null || x === undefined ? "" : x).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }
  function loadExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (loadExcelJS.p) return loadExcelJS.p;
    loadExcelJS.p = new Promise(function (ok, no) {
      var sc = document.createElement("script");
      sc.src = VENDOR;
      sc.onload = function () {
        window.ExcelJS ? ok(window.ExcelJS) : no(Error("Pustaka Excel tidak termuat."));
      };
      sc.onerror = function () {
        loadExcelJS.p = null;
        no(Error("Pustaka pembaca Excel gagal dimuat. Periksa koneksi, lalu coba lagi."));
      };
      document.head.appendChild(sc);
    });
    return loadExcelJS.p;
  }
  // Nilai sel ExcelJS → nilai polos. Sel bagian dari gabungan (merge) selain sel utamanya dianggap kosong.
  function cellVal(cell) {
    if (!cell || cell.type === 1) return null; // ValueType.Merge
    var v = cell.value;
    if (v && typeof v === "object" && !isDate(v)) {
      if (v.richText) return v.richText.map(function (t) { return t.text; }).join("");
      if ("result" in v) v = v.result;
      else if ("text" in v) return v.text;
      else if (v.error) return null;
      else if (v.sharedFormula !== undefined) return null;
    }
    return v === undefined ? null : v;
  }
  function pickSheet(wb) {
    var ws = null;
    wb.eachSheet(function (s) {
      if (!ws && /^\s*matriks daftar ris[ik]+o\s*$/i.test(s.name)) ws = s;
    });
    if (ws) return ws;
    wb.eachSheet(function (s) {
      if (ws || /khusus/i.test(s.name)) return;
      for (var r = 1; r <= Math.min(40, s.rowCount); r++) {
        var hit = false;
        s.getRow(r).eachCell(function (c) {
          if (normH(cellVal(c)) === "ID RISK") hit = true;
        });
        if (hit) {
          ws = s;
          return;
        }
      }
    });
    return ws;
  }
  function toGrid(ws) {
    var rows = [],
      nc = Math.min(Math.max(ws.columnCount || 0, 18), 30),
      nr = Math.min(ws.rowCount || 0, 2000);
    for (var r = 1; r <= nr; r++) {
      var row = ws.getRow(r),
        out = [];
      for (var c = 1; c <= nc; c++) out.push({ v: cellVal(row.getCell(c)) });
      rows.push(out);
    }
    return rows;
  }
  function readFile(file) {
    return new Promise(function (ok, no) {
      var fr = new FileReader();
      fr.onload = function () {
        ok(fr.result);
      };
      fr.onerror = function () {
        no(Error("File tidak dapat dibaca."));
      };
      fr.readAsArrayBuffer(file);
    });
  }
  function onFile(file) {
    st = { file: file, res: null, busy: true, msg: null, dup: false };
    render();
    if (!/\.xlsx$/i.test(file.name)) {
      st.busy = false;
      st.res = { fatal: "Hanya file Excel .xlsx yang didukung. Bila file Anda .xls, simpan ulang sebagai .xlsx." };
      return render();
    }
    if (file.size > 15 * 1024 * 1024) {
      st.busy = false;
      st.res = { fatal: "File lebih dari 15 MB. Hapus sheet yang tidak perlu, lalu coba lagi." };
      return render();
    }
    Promise.all([loadExcelJS(), readFile(file)])
      .then(function (x) {
        var wb = new x[0].Workbook();
        return wb.xlsx.load(x[1]).then(function () {
          var ws = pickSheet(wb);
          if (!ws) return { fatal: 'Sheet "MATRIKS DAFTAR RISIKO" tidak ditemukan di file ini.' };
          var res = P.parseGrid(toGrid(ws), S().katalog());
          res.sheet = ws.name;
          return res;
        });
      })
      .then(function (res) {
        st.res = res;
        st.res.pakai = {};
        (res.rows || []).forEach(function (r, i) {
          st.res.pakai[i] = !r.errors.length;
        });
      })
      .catch(function (e) {
        st.res = { fatal: "File tidak dapat dibaca sebagai Excel: " + (e && e.message ? e.message : e) };
      })
      .then(function () {
        st.busy = false;
        render();
      });
  }
  function ctxIssues(ctx, res) {
    var out = [];
    if (ctx.edit) out.push(["err", "Selesaikan atau batalkan mode edit di formulir terlebih dahulu."]);
    if (!ctx.operatorId) out.push(["err", "Pilih operator di Langkah 01 (dari data induk) terlebih dahulu."]);
    else if (ctx.needsUnit) out.push(["err", "Pilih <b>Lokasi yang dinilai</b> (unit/stasiun atau kantor pusat) di Langkah 01."]);
    if (!ctx.bulan || !ctx.tahun) out.push(["err", "Isi <b>Bulan Penilaian</b> dan <b>Tahun</b> di Langkah 01." + periodeBtn(res)]);
    else if (res && res.meta && res.meta.bulan && (res.meta.bulan !== ctx.bulan || String(res.meta.tahun) !== String(ctx.tahun)))
      out.push(["warn", "Periode di file <b>" + esc(res.meta.bulan + " " + res.meta.tahun) + "</b>, sedangkan di formulir <b>" + esc(ctx.bulan + " " + ctx.tahun) + "</b>." + periodeBtn(res)]);
    if (!ctx.tanggalPengesahan) out.push(["warn", "<b>Tanggal Pengesahan</b> belum diisi — wajib bila operator ini belum pernah mengisi DPRK."]);
    if (!ctx.namaPengisi) out.push(["warn", "<b>Nama Pengisi</b> belum diisi."]);
    return out;
  }
  function periodeBtn(res) {
    return res && res.meta && res.meta.bulan && res.meta.tahun ? ' <button type="button" class="link-btn" data-imp="periode">Pakai periode file (' + esc(res.meta.bulan + " " + res.meta.tahun) + ")</button>" : "";
  }
  function selected() {
    var res = st.res;
    if (!res || !res.rows) return [];
    return res.rows.filter(function (r, i) {
      return res.pakai[i];
    });
  }
  function rowErrors(r, ctx) {
    var e = r.errors.slice();
    if (r.tanggalKaji && ctx.tanggalPengesahan && r.tanggalKaji < ctx.tanggalPengesahan) e.push("Tanggal kaji ulang " + r.tanggalKaji + " lebih awal daripada tanggal pengesahan " + ctx.tanggalPengesahan + ".");
    return e.concat(r.serverErrors || []);
  }
  function fmtTgl(s) {
    if (!s) return "—";
    var p = s.split("-");
    return Number(p[2]) + " " + P.BULAN[Number(p[1]) - 1].slice(0, 3) + " " + p[0];
  }
  function render() {
    var card = $("imporCard"),
      body = $("imporBody");
    if (!card || !S()) return;
    var ctx = S().importContext();
    card.hidden = !ctx.login;
    if (!ctx.login) return;
    if (st.busy) {
      body.innerHTML = '<div class="impor-status">Membaca <b>' + esc(st.file && st.file.name) + "</b>…</div>";
      return;
    }
    var res = st.res;
    if (!res) {
      body.innerHTML = "";
      return;
    }
    if (res.fatal) {
      body.innerHTML = '<div class="impor-msg impor-err">' + esc(res.fatal) + "</div>";
      return;
    }
    var rows = res.rows,
      nErr = 0,
      nWarn = 0,
      nKh = 0;
    rows.forEach(function (r) {
      if (rowErrors(r, ctx).length) nErr++;
      else if (r.warnings.length) nWarn++;
      if (r.khusus) nKh++;
    });
    var sel = selected(),
      selErr = sel.filter(function (r) { return rowErrors(r, ctx).length; }).length,
      issues = ctxIssues(ctx, res),
      block = issues.some(function (x) { return x[0] === "err"; }) || !sel.length || selErr > 0 || st.saving;
    var h =
      '<div class="impor-sum"><div><b>' + esc(st.file.name) + "</b> · sheet " + esc(res.sheet || "") + "</div>" +
      "<div>Di file: " + esc(res.meta.operator || "—") + " · " + esc(((res.meta.bulan || "") + " " + (res.meta.tahun || "")).trim() || "periode tidak tercantum") + "</div>" +
      '<div class="impor-target">Disimpan untuk: <b>' + esc(ctx.nama || "—") + "</b>" + (ctx.lokasi ? " › <b>" + esc(ctx.lokasi) + "</b>" : "") + (ctx.bulan ? " · " + esc(ctx.bulan + " " + ctx.tahun) : "") + "</div></div>" +
      '<div class="impor-counts"><span class="ic-ok">' + (rows.length - nErr - nWarn) + " siap</span>" + (nWarn ? '<span class="ic-warn">' + nWarn + " dengan catatan</span>" : "") + (nErr ? '<span class="ic-err">' + nErr + " bergalat</span>" : "") + (nKh ? '<span class="ic-kh">' + nKh + " risiko khusus</span>" : "") + "</div>" +
      issues.map(function (x) { return '<div class="impor-msg impor-' + x[0] + '">' + x[1] + "</div>"; }).join("") +
      '<div class="impor-table-wrap"><table class="impor-table"><thead><tr><th><input type="checkbox" data-imp="all" aria-label="Pilih semua"' + (sel.length === rows.length ? " checked" : "") + '></th><th>ID</th><th>Skenario</th><th title="Ancaman / Kerentanan / Konsekuensi">A · K · K</th><th>Nilai</th><th>Perlakuan</th><th>Kaji ulang</th><th>Catatan</th></tr></thead><tbody>' +
      rows.map(function (r, i) {
        var e = rowErrors(r, ctx),
          cls = e.length ? "row-err" : r.warnings.length ? "row-warn" : "";
        return (
          '<tr class="' + cls + (res.pakai[i] ? "" : " row-off") + '"><td><input type="checkbox" data-imp="row" data-i="' + i + '"' + (res.pakai[i] ? " checked" : "") + ' aria-label="Sertakan baris ' + r.line + '"></td>' +
          "<td><b>" + esc(r.idRisikoKatalog) + "</b>" + (r.idDikoreksi ? "<small>di file: " + esc(r.idFile) + "</small>" : "") + "<small>baris " + r.line + "</small></td>" +
          '<td class="impor-sk">' + (r.khusus ? '<span class="impor-tag">Khusus</span> ' : "") + esc(r.skenario) + "</td>" +
          "<td>" + [r.ancamanNilai, r.kerentananNilai, r.konsekuensiNilai].map(function (v) { return v === null ? "—" : esc(v); }).join(" · ") + "</td>" +
          "<td>" + (r.total ? "<b>" + r.total + '</b><small class="rt rt-' + esc(String(r.rating).toLowerCase().replace(/[^a-z]+/g, "-")) + '">' + esc(r.rating) + "</small>" : "—") + "</td>" +
          "<td>" + esc(r.perlakuan || "—") + "</td><td>" + fmtTgl(r.tanggalKaji) + "</td>" +
          '<td class="impor-note">' + e.map(function (x) { return '<div class="n-err">' + esc(x) + "</div>"; }).join("") + r.warnings.map(function (x) { return '<div class="n-warn">' + esc(x) + "</div>"; }).join("") + (r.keterangan ? '<div class="n-info">' + esc(r.keterangan) + "</div>" : "") + "</td></tr>"
        );
      }).join("") +
      "</tbody></table></div>";
    if (st.msg) h += '<div class="impor-msg impor-' + st.msg[0] + '">' + st.msg[1] + "</div>";
    h +=
      '<div class="impor-act"><span>' + sel.length + " dari " + rows.length + " skenario dipilih" + (selErr ? " — <b>" + selErr + " bergalat</b>: perbaiki di Excel atau hapus centangnya" : "") + "</span>" +
      '<button type="button" class="btn secondary" data-imp="batal">Batal</button>' +
      (st.dup ? '<button type="button" class="btn secondary" data-imp="lewati">Lewati yang sudah ada &amp; simpan sisanya</button>' : "") +
      '<button type="button" class="btn primary" data-imp="simpan"' + (block ? " disabled" : "") + ">" + (st.saving ? "Menyimpan…" : "Simpan " + sel.length + " skenario") + "</button></div>";
    body.innerHTML = h;
  }
  function sha(s) {
    if (window.crypto && crypto.subtle && window.TextEncoder)
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(function (b) {
        return Array.prototype.map.call(new Uint8Array(b), function (x) { return ("0" + x.toString(16)).slice(-2); }).join("").slice(0, 32);
      });
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Promise.resolve("H" + (h >>> 0).toString(16) + s.length.toString(16) + "x");
  }
  function save(lewati) {
    var ctx = S().importContext(),
      rows = selected();
    if (!rows.length) return;
    st.saving = true;
    st.msg = null;
    rows.forEach(function (r) {
      r.serverErrors = [];
    });
    render();
    var payload = rows.map(function (r) {
      return { unitId: ctx.unitId, kategori: r.kategori, idRisikoKatalog: r.idRisikoKatalog, skenario: r.skenario, area: r.area, langkahSaatIni: r.langkahSaatIni, kerentananSaatIni: r.kerentananSaatIni, ancamanNilai: r.ancamanNilai, kerentananNilai: r.kerentananNilai, konsekuensiNilai: r.konsekuensiNilai, perlakuan: r.perlakuan, prioritas: "", langkahTambahan: r.langkahTambahan, riskOwner: r.riskOwner, tanggalKaji: r.tanggalKaji, keterangan: r.keterangan };
    });
    var kaji = rows.map(function (r) { return r.tanggalKaji; }).filter(Boolean).sort()[0] || "";
    var chunks = [];
    for (var i = 0; i < payload.length; i += 300) chunks.push({ from: i, rows: payload.slice(i, i + 300) });
    sha(JSON.stringify([ctx.operatorId, ctx.unitId, ctx.bulan, ctx.tahun, payload]))
      .then(function (hash) {
        var saved = 0,
          skipped = 0,
          again = 0;
        return chunks
          .reduce(function (pr, ch, n) {
            return pr.then(function (stop) {
              if (stop) return stop;
              return S()
                .post({ action: "saveRiskBatch", operatorId: ctx.operatorId, batchId: "IMP" + hash + (chunks.length > 1 ? "-" + (n + 1) : ""), rows: ch.rows, bulan: ctx.bulan, tahun: ctx.tahun, tanggalPengesahan: ctx.tanggalPengesahan, tanggalKaji: kaji, namaPengisi: ctx.namaPengisi, jabatanPengisi: ctx.jabatanPengisi, linkFileDprk: ctx.linkFileDprk, emailRiskOwner: ctx.emailRiskOwner, lewatiDuplikat: !!lewati })
                .then(function (res) {
                  if (res && res.ok) {
                    if (res.retry) again += res.saved || 0;
                    else saved += res.saved || 0;
                    skipped += res.skipped || 0;
                    return null;
                  }
                  var errs = (res && res.errors) || [],
                    dup = errs.length && errs.every(function (e) { return e.galat.every(function (g) { return /sudah ada/.test(g); }); });
                  errs.forEach(function (e) {
                    var r = rows[ch.from + e.baris - 1];
                    if (r) r.serverErrors = e.galat.map(function (g) { return "Server: " + g; });
                  });
                  st.dup = !!dup;
                  return [res && res.error ? res.error : "Penyimpanan gagal.", dup];
                });
            });
          }, Promise.resolve(null))
          .then(function (fail) {
            st.saving = false;
            if (fail) {
              st.msg = ["err", esc(fail[0]) + (fail[1] ? " Skenario yang sama untuk lokasi dan periode ini sudah pernah disimpan." : " Tidak ada yang disimpan dari paket ini; perbaiki baris yang ditandai.") + (saved ? " (" + saved + " skenario dari paket sebelumnya sudah tersimpan.)" : "")];
            } else {
              st.dup = false;
              st.msg = ["ok", "<b>" + (saved + again) + " skenario tersimpan</b>" + (again && !saved ? " (file ini sudah pernah disimpan sebelumnya; tidak digandakan)" : "") + (skipped ? ", " + skipped + " dilewati karena sudah ada" : "") + ". Lihat hasilnya di Monitoring Risiko."];
              if (S().reloadRisks) S().reloadRisks();
            }
            render();
          });
      })
      .catch(function (e) {
        st.saving = false;
        st.msg = ["err", "Penyimpanan gagal: " + esc(e && e.message ? e.message : e) + ". Coba lagi; mengirim ulang file yang sama tidak menggandakan data."];
        render();
      });
  }
  function bind() {
    var card = $("imporCard");
    if (!card || bind.done) return;
    bind.done = true;
    $("imporFile").addEventListener("change", function () {
      if (this.files && this.files[0]) onFile(this.files[0]);
      this.value = "";
    });
    card.addEventListener("change", function (e) {
      var t = e.target;
      if (!st.res || !st.res.rows) return;
      if (t.getAttribute("data-imp") === "row") st.res.pakai[Number(t.getAttribute("data-i"))] = t.checked;
      if (t.getAttribute("data-imp") === "all") st.res.rows.forEach(function (r, i) { st.res.pakai[i] = t.checked; });
      st.dup = false;
      render();
    });
    card.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("button[data-imp]");
      if (!b) return;
      var a = b.getAttribute("data-imp");
      if (a === "periode" && st.res && st.res.meta) {
        S().setPeriode(st.res.meta.bulan, st.res.meta.tahun);
        render();
      } else if (a === "batal") {
        st = { file: null, res: null, busy: false, msg: null, dup: false };
        render();
      } else if (a === "simpan") save(false);
      else if (a === "lewati") save(true);
    });
    ["bulan", "tahun", "tanggalPengesahan", "namaPengisi"].forEach(function (id) {
      if ($(id)) $(id).addEventListener("change", render);
    });
    document.addEventListener("sirisk:lokasi", render);
    document.addEventListener("sirisk:auth", render);
  }
  function start() {
    if (!S() || !$("imporCard")) return setTimeout(start, 300);
    bind();
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})(this);
