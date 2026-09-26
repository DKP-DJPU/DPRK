/* ============================================================
   SI-RISK AVSEC — Modul Sistem Pelaporan Keamanan Penerbangan
   Bergantung pada window.SIRISK (disediakan assets/js/app.js).
   Backend: action=incidents (GET, tanpa data pelapor) dan
            action=createIncident (POST) — lihat apps-script/Pelaporan.gs
   ============================================================ */
(function () {
  "use strict";
  var S = window.SIRISK;
  if (!S) {
    console.error("SIRISK belum tersedia; pelaporan.js harus dimuat setelah app.js");
    return;
  }
  var esc = S.esc;

  // Harus sama dengan INC_JENIS di Pelaporan.gs.
  var JENIS_LINGKUP = {
    "Ancaman keamanan (unlawful interference)": "AVSEC",
    "Pelanggaran prosedur keamanan (security breach)": "AVSEC",
    "Isu regulasi / kebijakan keamanan": "AVSEC",
    "Kegiatan pengawasan / inspeksi / audit": "AVSEC",
    "Latihan / simulasi keamanan": "AVSEC",
    "Berita media terkait keamanan penerbangan": "AVSEC",
    "Kecelakaan penerbangan": "Non-AVSEC",
    "Insiden serius / near-miss": "Non-AVSEC",
    "Gangguan operasional bandara/maskapai": "Non-AVSEC",
    Lainnya: "Perlu Klasifikasi",
  };
  var SEVERITIES = ["Rendah", "Sedang", "Tinggi", "Kritis"];
  var LINGKUP_CLASS = { AVSEC: "avsec", "Non-AVSEC": "nonavsec", "Perlu Klasifikasi": "klasifikasi" };
  var STATUS_CLASS = { Baru: "baru", Terverifikasi: "verified", Ditolak: "rejected" };

  var st = {
    inited: false,
    panel: "form",
    bandara: null, // operator objek dari master
    pihak: [], // daftar operator objek
    reports: [],
    loadedAt: 0,
    current: null,
    clientId: null,
  };

  function $(id) {
    return document.getElementById(id);
  }
  function lingkupOf(jenis) {
    return JENIS_LINGKUP[jenis] || "Perlu Klasifikasi";
  }
  function sevClass(s) {
    return SEVERITIES.indexOf(s) > -1 ? s : "Rendah";
  }
  function lingkupPill(l) {
    return '<span class="plp-pill plp-l-' + (LINGKUP_CLASS[l] || "klasifikasi") + '">' + esc(l || "Perlu Klasifikasi") + "</span>";
  }
  function sevPill(s) {
    return '<span class="plp-pill plp-s-' + sevClass(s) + '">' + esc(s || "—") + "</span>";
  }
  function statusPill(s) {
    s = s || "Baru";
    return '<span class="plp-pill plp-st-' + (STATUS_CLASS[s] || "baru") + '">' + esc(s) + "</span>";
  }
  function newClientId() {
    var a = new Uint8Array(12);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return (
      "INC-" +
      Array.prototype.map
        .call(a, function (x) {
          return ("0" + x.toString(16)).slice(-2);
        })
        .join("")
        .toUpperCase()
    );
  }
  function todayLocal() {
    var d = new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  var BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  function fmtTanggal(t, jam) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(t || ""));
    if (!m) return "—";
    return Number(m[3]) + " " + BULAN[Number(m[2]) - 1] + " " + m[1] + (jam ? ", pukul " + jam : "");
  }
  function fmtTanggalPendek(t) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(t || ""));
    return m ? m[3] + "/" + m[2] + "/" + m[1] : "—";
  }
  function lokasiText(r) {
    var parts = [r.lokasiBandara, r.lokasiDetail].filter(Boolean);
    return parts.join(" — ") || "—";
  }

  /* ---------------- Navigasi sub-tab ---------------- */
  function showPanel(name) {
    st.panel = name;
    $("plpForm").hidden = name !== "form";
    $("plpList").hidden = name !== "list";
    $("plpDetail").hidden = name !== "detail";
    Array.prototype.forEach.call(document.querySelectorAll(".plp-subtab"), function (b) {
      var on = b.getAttribute("data-plp") === name || (name === "detail" && b.getAttribute("data-plp") === "list");
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (name === "list" && (!st.loadedAt || Date.now() - st.loadedAt > 60000)) loadReports();
  }

  /* ---------------- Formulir ---------------- */
  function fillStaticOptions() {
    $("plpProvinsi").innerHTML =
      '<option value="">— Pilih provinsi —</option>' +
      S.provinsi
        .map(function (p) {
          return "<option>" + esc(p) + "</option>";
        })
        .join("");
    fillKategori();
    $("plpTanggal").max = todayLocal();
  }
  function fillKategori() {
    var k = S.kategori() || [];
    $("plpKategori").innerHTML =
      '<option value="">— Belum ditentukan —</option>' +
      k
        .map(function (x) {
          return '<option value="' + esc(x[0]) + '">' + esc(x[0] + " — " + x[1]) + "</option>";
        })
        .join("");
  }
  function updateLingkup() {
    var j = $("plpJenis").value;
    if (!j) {
      $("plpLingkup").innerHTML = '<span class="plp-muted">Pilih jenis kejadian terlebih dahulu</span>';
      $("plpKategoriWrap").hidden = true;
      return;
    }
    var l = lingkupOf(j);
    var note =
      l === "AVSEC"
        ? "Masuk rekap keamanan penerbangan."
        : l === "Non-AVSEC"
          ? "Dicatat, tetapi dipisahkan dari rekap keamanan."
          : "Akan diklasifikasikan saat verifikasi.";
    $("plpLingkup").innerHTML = lingkupPill(l) + ' <span class="plp-muted">' + esc(note) + "</span>";
    $("plpKategoriWrap").hidden = l !== "AVSEC";
    if (l !== "AVSEC") $("plpKategori").value = "";
  }

  function searchOperators(q, types, excludeIds) {
    q = String(q || "").toLowerCase().trim();
    if (!q) return [];
    return S.operators()
      .filter(function (o) {
        if (types && types.indexOf(o.jenisOperator) < 0) return false;
        if (excludeIds && excludeIds.indexOf(o.operatorId) > -1) return false;
        return (
          [o.namaOperator, o.iata, o.kodeOperator, o.kabkota, o.lokasi, o.provinsi].join(" ").toLowerCase().indexOf(q) > -1
        );
      })
      .slice(0, 25);
  }
  function renderResults(box, list, emptyText) {
    if (!S.operatorsLoaded()) {
      box.innerHTML = '<div class="empty">Master operator sedang dimuat...</div>';
      box.hidden = false;
      return;
    }
    box.innerHTML =
      list
        .map(function (o) {
          return (
            '<div class="plp-result" data-oid="' +
            esc(o.operatorId) +
            '" role="option" tabindex="0"><b>' +
            esc(o.namaOperator) +
            "</b> " +
            esc(o.iata || "") +
            '<br><small>' +
            esc([o.jenisOperator, o.kabkota || o.lokasi, o.provinsi].filter(Boolean).join(" • ")) +
            "</small></div>"
          );
        })
        .join("") || '<div class="empty">' + esc(emptyText) + "</div>";
    box.hidden = false;
  }
  function findOp(id) {
    return S.operators().filter(function (o) {
      return String(o.operatorId) === String(id);
    })[0];
  }
  function bindPicker(input, box, onPick, typesFn, excludeFn, emptyText) {
    input.addEventListener("input", function () {
      if (!input.value.trim()) {
        box.hidden = true;
        return;
      }
      renderResults(box, searchOperators(input.value, typesFn(), excludeFn()), emptyText);
    });
    function pick(el) {
      var o = findOp(el.getAttribute("data-oid"));
      if (!o) return;
      input.value = "";
      box.hidden = true;
      onPick(o);
    }
    box.addEventListener("click", function (e) {
      var el = e.target.closest("[data-oid]");
      if (el) pick(el);
    });
    box.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target.getAttribute("data-oid")) pick(e.target);
    });
  }
  function renderBandara() {
    var b = st.bandara,
      luar = $("plpLuarBandara").checked;
    $("plpBandaraSearch").disabled = luar;
    if (luar) {
      st.bandara = null;
      $("plpBandaraSelected").innerHTML = "";
      $("plpProvinsi").disabled = false;
      return;
    }
    if (b) {
      $("plpBandaraSelected").innerHTML =
        '<div class="notice ok plp-selected"><span><b>' +
        esc(b.namaOperator) +
        "</b> " +
        esc(b.iata || "") +
        " • " +
        esc([b.kabkota || b.lokasi, b.provinsi].filter(Boolean).join(", ")) +
        '</span><button type="button" class="plp-x" id="plpBandaraClear" aria-label="Hapus pilihan bandara">×</button></div>';
      $("plpBandaraClear").onclick = function () {
        st.bandara = null;
        renderBandara();
      };
      if (b.provinsi) {
        $("plpProvinsi").value = b.provinsi;
        $("plpProvinsi").disabled = true;
      } else $("plpProvinsi").disabled = false;
    } else {
      $("plpBandaraSelected").innerHTML = "";
      $("plpProvinsi").disabled = false;
    }
  }
  function renderChips() {
    $("plpPihakChips").innerHTML = st.pihak
      .map(function (o) {
        return (
          '<span class="plp-chip">' +
          esc(o.namaOperator) +
          ' <small>' +
          esc(o.jenisOperator) +
          '</small><button type="button" class="plp-x" data-rm="' +
          esc(o.operatorId) +
          '" aria-label="Hapus ' +
          esc(o.namaOperator) +
          '">×</button></span>'
        );
      })
      .join("");
  }

  function readForm() {
    var sev = document.querySelector("input[name=plpSeverity]:checked");
    var names = st.pihak.map(function (o) {
      return o.namaOperator;
    });
    var lain = $("plpPihakLain").value.trim();
    return {
      action: "createIncident",
      clientId: st.clientId,
      judul: $("plpJudul").value.trim(),
      jenis: $("plpJenis").value,
      kategoriAncaman: $("plpKategori").value,
      ringkasan: $("plpRingkasan").value.trim(),
      tanggal: $("plpTanggal").value,
      jam: $("plpJam").value,
      lokasiOperatorId: st.bandara ? st.bandara.operatorId : "",
      lokasiDetail: $("plpLokasiDetail").value.trim(),
      provinsi: $("plpProvinsi").value,
      otoritasWilayah: $("plpOtoritas").value,
      pihakTerlibatIds: st.pihak
        .map(function (o) {
          return o.operatorId;
        })
        .join(","),
      pihakTerlibat: names.concat(lain ? [lain] : []).join("; "),
      otoritasPenangan: $("plpPenangan").value.trim(),
      terdampak: $("plpTerdampak").value.trim(),
      penyebab: $("plpPenyebab").value.trim(),
      kronologi: $("plpKronologi").value.trim(),
      severity: sev ? sev.value : "",
      sumber: $("plpSumber").value,
      namaMedia: $("plpNamaMedia").value.trim(),
      linkMedia: $("plpLinkMedia").value.trim(),
      namaPelapor: $("plpNamaPelapor").value.trim(),
      instansi: $("plpInstansi").value.trim(),
      hp: $("plpHp").value.trim(),
      email: $("plpEmail").value.trim(),
      catatan: $("plpCatatan").value.trim(),
      website: $("plpWebsite").value,
    };
  }
  function validate(p) {
    var e = [];
    if (!p.judul) e.push(["plpJudul", "Judul kejadian wajib diisi."]);
    if (!p.jenis) e.push(["plpJenis", "Jenis kejadian wajib dipilih."]);
    if (!p.tanggal) e.push(["plpTanggal", "Tanggal kejadian wajib diisi."]);
    else if (p.tanggal > todayLocal()) e.push(["plpTanggal", "Tanggal kejadian tidak boleh di masa depan."]);
    if (!p.lokasiOperatorId && !$("plpLuarBandara").checked && !p.provinsi)
      e.push(["plpBandaraSearch", "Pilih bandar udara, atau centang “di luar area bandar udara” dan pilih provinsi."]);
    if (p.linkMedia && !/^https?:\/\/\S+$/i.test(p.linkMedia)) e.push(["plpLinkMedia", "Tautan harus diawali http:// atau https://."]);
    if (p.email && !/^\S+@\S+\.\S+$/.test(p.email)) e.push(["plpEmail", "Format email tidak valid."]);
    if (!p.namaPelapor) e.push(["plpNamaPelapor", "Nama pelapor wajib diisi."]);
    return e;
  }
  function notice(html, ok) {
    $("plpFormNotice").innerHTML = '<div class="notice' + (ok ? " ok" : "") + '" role="status">' + html + "</div>";
  }
  function submit() {
    var p = readForm(),
      err = validate(p);
    if (err.length) {
      notice(
        "<b>Periksa kembali isian berikut:</b><ul class=\"validation-list\">" +
          err
            .map(function (x) {
              return "<li>" + esc(x[1]) + "</li>";
            })
            .join("") +
          "</ul>",
      );
      var f = $(err[0][0]);
      if (f) f.focus();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    var btn = $("plpSubmit");
    btn.disabled = true;
    btn.textContent = "Mengirim...";
    S.post(p)
      .then(function (res) {
        if (!res || !res.ok) throw Error((res && res.error) || "Server menolak laporan.");
        resetForm(true);
        notice(
          "Laporan <b>" +
            esc(res.refNumber || "") +
            "</b> berhasil dikirim" +
            (res.lingkup ? " dengan penanda " + lingkupPill(res.lingkup) : "") +
            ". Laporan akan diverifikasi oleh Direktorat Keamanan Penerbangan.",
          true,
        );
        st.loadedAt = 0;
        window.scrollTo({ top: 0, behavior: "smooth" });
      })
      .catch(function (e) {
        notice("Gagal mengirim laporan: " + esc(e.message) + ". Data di formulir tidak hilang — silakan coba lagi.");
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = "Kirim Laporan";
      });
  }
  function resetForm(keepNotice) {
    Array.prototype.forEach.call(document.querySelectorAll("#plpForm input, #plpForm textarea"), function (el) {
      if (el.type === "radio") el.checked = el.value === "Rendah";
      else if (el.type === "checkbox") el.checked = false;
      else el.value = "";
    });
    Array.prototype.forEach.call(document.querySelectorAll("#plpForm select"), function (el) {
      el.selectedIndex = 0;
    });
    st.bandara = null;
    st.pihak = [];
    st.clientId = newClientId();
    renderBandara();
    renderChips();
    updateLingkup();
    if (!keepNotice) $("plpFormNotice").innerHTML = "";
  }

  /* ---------------- Daftar & rekap ---------------- */
  function loadReports() {
    $("plpTbody").innerHTML = '<tr><td colspan="6" class="empty">Memuat data laporan...</td></tr>';
    return S.get("incidents")
      .then(function (res) {
        if (!res || !res.ok) throw Error((res && res.error) || "Data tidak tersedia");
        st.reports = res.data || [];
        st.loadedAt = Date.now();
        fillFilters();
        renderList();
      })
      .catch(function (e) {
        $("plpTbody").innerHTML =
          '<tr><td colspan="6" class="empty">Gagal memuat laporan (' + esc(e.message) + '). Klik <b>Muat Ulang</b>.</td></tr>';
      });
  }
  function uniq(arr) {
    return arr
      .filter(function (x, i) {
        return x && arr.indexOf(x) === i;
      })
      .sort();
  }
  function fillSelect(id, label, values) {
    var el = $(id),
      cur = el.value;
    el.innerHTML =
      '<option value="">' +
      esc(label) +
      "</option>" +
      values
        .map(function (v) {
          return "<option>" + esc(v) + "</option>";
        })
        .join("");
    el.value = values.indexOf(cur) > -1 ? cur : "";
  }
  function fillFilters() {
    fillSelect(
      "plpFJenis",
      "Semua jenis",
      uniq(
        st.reports.map(function (r) {
          return r.jenis;
        }),
      ),
    );
    fillSelect(
      "plpFProv",
      "Semua provinsi",
      uniq(
        st.reports.map(function (r) {
          return r.provinsi;
        }),
      ),
    );
  }
  function filtered() {
    var l = $("plpFLingkup").value,
      j = $("plpFJenis").value,
      p = $("plpFProv").value,
      s = $("plpFSev").value,
      q = $("plpFSearch").value.toLowerCase().trim();
    return st.reports.filter(function (r) {
      if (l && r.lingkup !== l) return false;
      if (j && r.jenis !== j) return false;
      if (p && r.provinsi !== p) return false;
      if (s && r.severity !== s) return false;
      if (q && [r.refNumber, r.judul, r.lokasiBandara, r.lokasiDetail, r.pihakTerlibat, r.provinsi].join(" ").toLowerCase().indexOf(q) < 0)
        return false;
      return true;
    });
  }
  function renderList() {
    var all = st.reports;
    $("plpStatTotal").textContent = all.length;
    $("plpStatAvsec").textContent = all.filter(function (r) {
      return r.lingkup === "AVSEC";
    }).length;
    $("plpStatHigh").textContent = all.filter(function (r) {
      return r.lingkup === "AVSEC" && (r.severity === "Tinggi" || r.severity === "Kritis");
    }).length;
    $("plpStatPending").textContent = all.filter(function (r) {
      return (r.statusVerifikasi || "Baru") === "Baru";
    }).length;
    var list = filtered();
    if (!list.length) {
      $("plpTbody").innerHTML =
        '<tr><td colspan="6" class="empty">' + (all.length ? "Tidak ada laporan yang cocok dengan filter." : "Belum ada laporan.") + "</td></tr>";
      return;
    }
    $("plpTbody").innerHTML = list
      .map(function (r) {
        return (
          '<tr class="plp-row" data-id="' +
          esc(r.id) +
          '" tabindex="0"><td><span class="plp-ref">' +
          esc(r.refNumber) +
          "</span></td><td><b>" +
          esc(r.judul) +
          "</b><br><small>" +
          esc(r.jenis || "—") +
          "</small> " +
          lingkupPill(r.lingkup) +
          "</td><td>" +
          esc(lokasiText(r)) +
          "<br><small>" +
          esc(r.provinsi || "—") +
          "</small></td><td>" +
          esc(fmtTanggalPendek(r.tanggal)) +
          "</td><td>" +
          sevPill(r.severity) +
          "</td><td>" +
          statusPill(r.statusVerifikasi) +
          "</td></tr>"
        );
      })
      .join("");
  }

  /* ---------------- Detail / dokumen ---------------- */
  function kategoriNama(kode) {
    var k = (S.kategori() || []).filter(function (x) {
      return x[0] === kode;
    })[0];
    return k ? kode + " — " + k[1] : kode;
  }
  function docSection(title, body) {
    return '<div class="plp-doc-section"><h4>' + esc(title) + "</h4><p>" + body + "</p></div>";
  }
  function buildDoc(r) {
    var now = new Date(),
      dicetak = fmtTanggal(todayLocal()) + " " + ("0" + now.getHours()).slice(-2) + ":" + ("0" + now.getMinutes()).slice(-2);
    return (
      '<div class="plp-doc-head"><div class="plp-doc-org"><img src="assets/img/logo.png" alt="" class="plp-doc-logo"><div><h3>Direktorat Keamanan Penerbangan</h3><p>SI-RISK AVSEC — Sistem Pelaporan Keamanan Penerbangan</p></div></div>' +
      '<div class="plp-doc-ref">No. Referensi: ' +
      esc(r.refNumber) +
      "<br>Dicetak: " +
      esc(dicetak) +
      "</div></div>" +
      '<div class="plp-doc-title"><div class="plp-doc-eyebrow">' +
      esc(r.jenis || "Laporan Kejadian") +
      "</div><h2>" +
      esc(r.judul) +
      '</h2><div class="plp-doc-meta">' +
      lingkupPill(r.lingkup) +
      " " +
      sevPill(r.severity) +
      " " +
      statusPill(r.statusVerifikasi) +
      (r.kategoriAncaman ? ' <span class="plp-pill plp-kat">Kategori ' + esc(kategoriNama(r.kategoriAncaman)) + "</span>" : "") +
      "</div></div>" +
      docSection("Ringkasan (Apa)", esc(r.ringkasan || "—")) +
      '<div class="plp-doc-grid">' +
      docSection("Waktu (Kapan)", esc(fmtTanggal(r.tanggal, r.jam))) +
      docSection(
        "Lokasi (Di Mana)",
        esc(lokasiText(r)) + (r.provinsi ? ", " + esc(r.provinsi) : "") + "\nOtoritas wilayah: " + esc(r.otoritasWilayah || "—"),
      ) +
      "</div>" +
      docSection(
        "Pihak Terlibat (Siapa)",
        "Pihak/operator terlibat: " +
          esc(r.pihakTerlibat || "—") +
          "\nOtoritas/instansi penanganan: " +
          esc(r.otoritasPenangan || "—") +
          "\nPihak terdampak/korban: " +
          esc(r.terdampak || "—"),
      ) +
      '<div class="plp-doc-grid">' +
      docSection("Latar Belakang dan Faktor (Mengapa)", esc(r.penyebab || "—")) +
      docSection(
        "Sumber Informasi",
        esc(r.sumber || "—") + (r.namaMedia ? "\nMedia: " + esc(r.namaMedia) : "") + (r.linkMedia ? "\nTautan: " + esc(r.linkMedia) : ""),
      ) +
      "</div>" +
      docSection("Kronologi (Bagaimana)", esc(r.kronologi || "—")) +
      '<div class="plp-doc-sign"><div>Dilaporkan melalui,<div class="plp-doc-line">SI-RISK AVSEC</div></div><div>Diverifikasi oleh,<div class="plp-doc-line">Direktorat Keamanan Penerbangan</div></div></div>' +
      '<div class="plp-doc-foot">Dokumen dihasilkan otomatis oleh SI-RISK AVSEC. Identitas pelapor tersimpan di database internal dan tidak dicantumkan pada dokumen ini. Status verifikasi: ' +
      esc(r.statusVerifikasi || "Baru") +
      ".</div>"
    );
  }
  function openDetail(id) {
    var r = st.reports.filter(function (x) {
      return String(x.id) === String(id);
    })[0];
    if (!r) return;
    st.current = r;
    $("plpDoc").innerHTML = buildDoc(r);
    showPanel("detail");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function printDoc() {
    document.body.classList.add("plp-printing");
    window.print();
  }
  window.addEventListener("afterprint", function () {
    document.body.classList.remove("plp-printing");
  });
  function downloadWord() {
    var r = st.current;
    if (!r) return;
    var body = $("plpDoc").innerHTML.replace(/<img[^>]*>/g, "");
    var html =
      '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
      "body{font-family:Calibri,Arial,sans-serif;color:#182632;padding:24px}h2,h3{font-family:Georgia,serif;color:#0f2a45}" +
      ".plp-doc-head{border-bottom:2px solid #0f2a45;padding-bottom:8px;margin-bottom:14px}.plp-doc-ref{font-size:10pt;color:#607080}" +
      ".plp-doc-title{text-align:center;margin-bottom:16px}.plp-doc-eyebrow{color:#c9902f;font-size:9pt;text-transform:uppercase;letter-spacing:1px}" +
      ".plp-doc-section h4{color:#c9902f;border-bottom:1px solid #dfe6ee;text-transform:uppercase;font-size:10pt;margin:14px 0 4px}" +
      "p{white-space:pre-wrap;line-height:1.5;margin:0}.plp-pill{border:1px solid #b8c3ce;padding:1px 6px;font-size:9pt;margin-right:4px}" +
      ".plp-doc-sign{margin-top:36px}.plp-doc-line{margin-top:48px;border-top:1px solid #182632;width:220px}.plp-doc-foot{margin-top:24px;font-size:8pt;color:#607080}" +
      "</style></head><body>" +
      body +
      "</body></html>";
    var blob = new Blob(["﻿", html], { type: "application/msword" });
    var url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download =
      String(r.refNumber || "laporan").replace(/[^A-Za-z0-9]+/g, "-") +
      "_" +
      String(r.judul || "")
        .slice(0, 40)
        .replace(/[^A-Za-z0-9]+/g, "_") +
      ".doc";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  /* ---------------- Inisialisasi ---------------- */
  function init() {
    if (st.inited) return;
    st.inited = true;
    st.clientId = newClientId();
    fillStaticOptions();
    Array.prototype.forEach.call(document.querySelectorAll(".plp-subtab"), function (b) {
      b.onclick = function () {
        showPanel(b.getAttribute("data-plp"));
      };
    });
    $("plpJenis").onchange = updateLingkup;
    $("plpLuarBandara").onchange = renderBandara;
    bindPicker(
      $("plpBandaraSearch"),
      $("plpBandaraResults"),
      function (o) {
        st.bandara = o;
        renderBandara();
      },
      function () {
        return ["Bandar Udara"];
      },
      function () {
        return [];
      },
      "Bandara tidak ditemukan di master.",
    );
    bindPicker(
      $("plpPihakSearch"),
      $("plpPihakResults"),
      function (o) {
        st.pihak.push(o);
        renderChips();
      },
      function () {
        return null;
      },
      function () {
        return st.pihak.map(function (o) {
          return o.operatorId;
        });
      },
      "Operator tidak ditemukan di master. Tulis di kolom “Pihak lain”.",
    );
    $("plpPihakChips").addEventListener("click", function (e) {
      var id = e.target.getAttribute("data-rm");
      if (!id) return;
      st.pihak = st.pihak.filter(function (o) {
        return o.operatorId !== id;
      });
      renderChips();
    });
    $("plpSubmit").onclick = submit;
    $("plpReset").onclick = function () {
      resetForm(false);
    };
    ["plpFLingkup", "plpFJenis", "plpFProv", "plpFSev", "plpFSearch"].forEach(function (id) {
      $(id).addEventListener("input", renderList);
      $(id).addEventListener("change", renderList);
    });
    $("plpRefresh").onclick = loadReports;
    $("plpTbody").addEventListener("click", function (e) {
      var tr = e.target.closest("tr[data-id]");
      if (tr) openDetail(tr.getAttribute("data-id"));
    });
    $("plpTbody").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target.getAttribute("data-id")) openDetail(e.target.getAttribute("data-id"));
    });
    $("plpBack").onclick = function () {
      showPanel("list");
    };
    $("plpPrint").onclick = printDoc;
    $("plpWord").onclick = downloadWord;
    document.addEventListener("click", function (e) {
      ["plpBandaraResults", "plpPihakResults"].forEach(function (id) {
        var box = $(id);
        if (!box.hidden && !box.contains(e.target) && e.target !== box.previousElementSibling) box.hidden = true;
      });
    });
  }

  window.SIRISK_PELAPORAN = {
    show: function () {
      init();
      if (!$("plpKategori").options.length || $("plpKategori").options.length < 2) fillKategori();
      showPanel(st.panel === "detail" ? "list" : st.panel);
    },
  };
})();
