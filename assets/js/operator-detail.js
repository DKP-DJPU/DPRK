/* ============================================================
   SI-RISK AVSEC — Rekap per Operator (tab Monitoring Operator)
   Klik nama operator → panel rekap: status DPRK, ringkasan risiko,
   distribusi rating, profil kategori 01–19, tren per periode,
   risiko tertinggi, dan laporan kejadian terkait.
   Link dapat dibagikan: #operator=<operatorId>
   Bergantung pada window.SIRISK (assets/js/app.js).
   Catatan akses: prototipe — terbuka bagi pemegang link. Saat sistem
   login dibuat, cukup batasi fungsi loadData() di bawah.
   ============================================================ */
(function () {
  "use strict";
  var S = window.SIRISK;
  if (!S) return;
  var esc = S.esc;

  var BULAN = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  var RATING_COLOR = {
    Tinggi: "#CF4A42",
    "Menengah-Tinggi": "#DD8A42",
    Menengah: "#E0B341",
    "Menengah-Rendah": "#8FB86A",
    Rendah: "#5B9E5E",
  };
  var st = {
    current: null,
    incidents: null,
    incidentsAt: 0,
    pendingHash: null,
  };

  function $(id) {
    return document.getElementById(id);
  }
  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }
  function findOperator(id) {
    return (S.allOperators ? S.allOperators() : S.operators()).filter(function (o) {
      return String(o.operatorId) === String(id);
    })[0];
  }
  function ratingOf(x) {
    var r = String(x.risikoRating || "").trim();
    if (RATING_COLOR[r]) return r;
    var b = S.rating(Number(x.risikoNilai));
    return b ? b.l : "";
  }
  function periodKey(x) {
    var m = BULAN.indexOf(String(x.bulan || "").trim());
    var y = Number(x.tahun) || 0;
    return y * 100 + (m > -1 ? m + 1 : 0);
  }
  function periodLabel(k) {
    var y = Math.floor(k / 100),
      m = k % 100;
    return (m ? BULAN[m - 1] + " " : "") + (y || "—");
  }
  function fmtDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ""));
    if (m) return Number(m[3]) + " " + BULAN[Number(m[2]) - 1] + " " + m[1];
    var d = new Date(v);
    if (v && !isNaN(d))
      return d.getDate() + " " + BULAN[d.getMonth()] + " " + d.getFullYear();
    return v ? String(v) : "—";
  }
  function kategoriNama(kode) {
    var k = (S.kategori() || []).filter(function (x) {
      return x[0] === kode;
    })[0];
    return k ? k[1] : "";
  }
  function pill(text, color, dark) {
    return (
      '<span class="opd-pill" style="background:' +
      color +
      ";color:" +
      (dark ? "#3d3100" : "#fff") +
      '">' +
      esc(text) +
      "</span>"
    );
  }
  function ratingPill(r) {
    return r ? pill(r, RATING_COLOR[r] || "#8fa5b8", r === "Menengah") : "—";
  }

  /* ---------------- Data ---------------- */
  function risksFor(op) {
    var n = norm(op.namaOperator),
      t = op.jenisOperator;
    return S.risks().filter(function (x) {
      return String(x.jenisOperator || "") === t && norm(x.namaOperator) === n;
    });
  }
  function incidentsFor(op) {
    var n = norm(op.namaOperator);
    return (st.incidents || []).filter(function (r) {
      if (String(r.lokasiOperatorId || "") === String(op.operatorId))
        return true;
      if (op.jenisOperator === "Bandar Udara" && norm(r.lokasiBandara) === n)
        return true;
      return n.length > 3 && norm(r.pihakTerlibat).indexOf(n) > -1;
    });
  }
  // Satu titik pengambilan data — tempat pemeriksaan login di masa depan.
  function loadData() {
    var jobs = [];
    if (!S.risksLoaded())
      jobs.push(
        new Promise(function (resolve) {
          var done = function () {
            document.removeEventListener("sirisk:risks", done);
            resolve();
          };
          document.addEventListener("sirisk:risks", done);
          setTimeout(done, 15000);
        }),
      );
    if (!st.incidents || Date.now() - st.incidentsAt > 60000)
      jobs.push(
        S.get("incidents")
          .then(function (res) {
            st.incidents = res && res.ok ? res.data || [] : [];
            st.incidentsAt = Date.now();
          })
          .catch(function () {
            st.incidents = st.incidents || [];
          }),
      );
    return Promise.all(jobs);
  }

  /* ---------------- Rekap ---------------- */
  function summarize(rows) {
    var periods = {};
    rows.forEach(function (x) {
      var k = periodKey(x);
      (periods[k] = periods[k] || []).push(x);
    });
    var keys = Object.keys(periods)
      .map(Number)
      .sort(function (a, b) {
        return a - b;
      });
    var latestKey = keys.length ? keys[keys.length - 1] : null;
    var latest = latestKey !== null ? periods[latestKey] : [];
    var dist = {};
    S.ratings.forEach(function (r) {
      dist[r] = 0;
    });
    var sum = 0,
      cats = {};
    latest.forEach(function (x) {
      var r = ratingOf(x),
        v = Number(x.risikoNilai) || 0;
      if (dist.hasOwnProperty(r)) dist[r]++;
      sum += v;
      var k = String(
        x.kategoriKode || String(x.kategori || "").split(" - ")[0],
      ).trim();
      if (!/^\d{2}$/.test(k)) return;
      if (!cats[k]) cats[k] = { sum: 0, n: 0, max: 0 };
      cats[k].sum += v;
      cats[k].n++;
      cats[k].max = Math.max(cats[k].max, v);
    });
    var trend = keys.map(function (k) {
      var a = periods[k],
        s = 0;
      a.forEach(function (x) {
        s += Number(x.risikoNilai) || 0;
      });
      return {
        key: k,
        n: a.length,
        avg: a.length ? s / a.length : 0,
        high: a.filter(function (x) {
          var r = ratingOf(x);
          return r === "Tinggi" || r === "Menengah-Tinggi";
        }).length,
      };
    });
    var top = latest
      .slice()
      .sort(function (a, b) {
        return (Number(b.risikoNilai) || 0) - (Number(a.risikoNilai) || 0);
      })
      .slice(0, 5);
    return {
      latestKey: latestKey,
      latest: latest,
      dist: dist,
      avg: latest.length ? sum / latest.length : 0,
      cats: cats,
      trend: trend,
      top: top,
    };
  }

  function donutHtml(dist, total) {
    var deg = 0,
      parts = [];
    S.ratings.forEach(function (r) {
      if (!dist[r]) return;
      var d = (dist[r] / total) * 360;
      parts.push(RATING_COLOR[r] + " " + deg + "deg " + (deg + d) + "deg");
      deg += d;
    });
    var bg = parts.length
      ? "conic-gradient(" + parts.join(",") + ")"
      : "conic-gradient(#dce5ec 0deg 360deg)";
    var legend = S.ratings
      .map(function (r) {
        var pct = total ? Math.round((dist[r] / total) * 100) : 0;
        return (
          '<div class="risk-legend-item" style="--dot:' +
          RATING_COLOR[r] +
          '"><span class="risk-legend-name">' +
          esc(r) +
          '</span><span class="risk-legend-value">' +
          dist[r] +
          '<span class="risk-legend-pct">' +
          pct +
          "%</span></span></div>"
        );
      })
      .join("");
    return (
      '<div class="risk-donut-wrap opd-donut-wrap"><div class="risk-donut" style="background:' +
      bg +
      '" role="img" aria-label="Distribusi rating risiko"><div class="risk-donut-hole"><b>' +
      total +
      "</b><span>Skenario</span></div></div>" +
      '<div class="risk-legend">' +
      legend +
      "</div></div>"
    );
  }

  function catBarsHtml(cats) {
    var keys = Object.keys(cats).sort();
    if (!keys.length)
      return '<div class="empty">Belum ada kategori yang dinilai.</div>';
    keys.sort(function (a, b) {
      return cats[b].sum / cats[b].n - cats[a].sum / cats[a].n;
    });
    return (
      '<div class="threat-list">' +
      keys
        .map(function (k) {
          var c = cats[k],
            avg = c.sum / c.n,
            band = S.rating(Math.round(avg)),
            col = band ? band.c : "#8fa5b8",
            w = Math.max(4, Math.round((avg / 30) * 100));
          return (
            '<div class="threat-item"><div class="threat-item-top"><span class="threat-code">' +
            esc(k) +
            '</span><span class="threat-name" title="' +
            esc(kategoriNama(k)) +
            '">' +
            esc(kategoriNama(k) || "Kategori " + k) +
            '</span><span class="threat-value" style="color:' +
            col +
            '">' +
            avg.toFixed(1) +
            '</span></div><div class="bar"><i style="width:' +
            w +
            "%;background:" +
            col +
            '"></i></div><div class="opd-cat-meta">' +
            c.n +
            " skenario • tertinggi " +
            c.max +
            "</div></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function trendHtml(trend) {
    if (trend.length < 2)
      return (
        '<div class="opd-note">Baru ada ' +
        trend.length +
        " periode penilaian. Tren akan tampil setelah operator mengisi DPRK di periode berikutnya.</div>" +
        (trend.length
          ? '<div class="opd-trend-single">Rata-rata nilai risiko <b>' +
            trend[0].avg.toFixed(1) +
            "</b> dari " +
            trend[0].n +
            " skenario (" +
            esc(periodLabel(trend[0].key)) +
            ").</div>"
          : "")
      );
    var max = 30;
    return (
      '<div class="opd-trend">' +
      trend
        .map(function (t) {
          var band = S.rating(Math.round(t.avg)),
            col = band ? band.c : "#8fa5b8";
          return (
            '<div class="opd-trend-col" title="' +
            esc(periodLabel(t.key)) +
            ": rata-rata " +
            t.avg.toFixed(1) +
            '"><span class="opd-trend-val">' +
            t.avg.toFixed(1) +
            '</span><i style="height:' +
            Math.max(4, Math.round((t.avg / max) * 100)) +
            "%;background:" +
            col +
            '"></i><span class="opd-trend-lbl">' +
            esc(periodLabel(t.key)) +
            "</span></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function topHtml(top) {
    if (!top.length) return '<div class="empty">Belum ada skenario.</div>';
    return (
      '<div class="tablewrap opd-table"><table><thead><tr><th>Kategori</th><th>Nilai</th><th>Rating</th></tr></thead><tbody>' +
      top
        .map(function (x) {
          var k = String(
            x.kategoriKode || String(x.kategori || "").split(" - ")[0],
          ).trim();
          return (
            "<tr><td><b>" +
            esc(k) +
            "</b> " +
            esc(kategoriNama(k) || x.kategori || "") +
            '</td><td class="risk-number">' +
            esc(x.risikoNilai) +
            "</td><td>" +
            ratingPill(ratingOf(x)) +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }

  function incidentsHtml(list) {
    if (st.incidents === null)
      return '<div class="empty">Memuat laporan kejadian...</div>';
    if (!list.length)
      return '<div class="empty">Belum ada laporan kejadian yang terkait dengan operator ini.</div>';
    var sevCol = {
      Rendah: "#5B9E5E",
      Sedang: "#E0B341",
      Tinggi: "#DD8A42",
      Kritis: "#CF4A42",
    };
    return (
      '<div class="tablewrap"><table><thead><tr><th>No. Ref</th><th>Kejadian</th><th>Tanggal</th><th>Lingkup</th><th>Keparahan</th></tr></thead><tbody>' +
      list
        .map(function (r) {
          return (
            '<tr><td class="opd-ref">' +
            esc(r.refNumber) +
            "</td><td><b>" +
            esc(r.judul) +
            "</b><br><small>" +
            esc(r.jenis || "") +
            "</small></td><td>" +
            esc(fmtDate(r.tanggal)) +
            "</td><td>" +
            pill(
              r.lingkup || "—",
              r.lingkup === "AVSEC" ? "#17466f" : "#8098ab",
            ) +
            "</td><td>" +
            pill(
              r.severity || "—",
              sevCol[r.severity] || "#8fa5b8",
              r.severity === "Sedang",
            ) +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }

  function render(op) {
    var rows = risksFor(op),
      sm = summarize(rows),
      inc = incidentsFor(op),
      filled = /sudah/i.test(op.statusDprk || ""),
      lokasi = [op.lokasi, op.kabkota, op.provinsi]
        .filter(function (x, i, a) {
          return x && a.indexOf(x) === i;
        })
        .join(", "),
      highCount = (sm.dist.Tinggi || 0) + (sm.dist["Menengah-Tinggi"] || 0),
      avsec = inc.filter(function (r) {
        return r.lingkup === "AVSEC";
      }).length;

    var head =
      '<div class="card opd-head"><div class="opd-toolbar"><button type="button" class="btn secondary" id="opdBack">← Kembali ke daftar operator</button>' +
      '<button type="button" class="btn secondary" id="opdCopy">Salin link rekap</button></div>' +
      '<div class="opd-title"><div><div class="section-kicker">' +
      esc(String(op.jenisOperator || "").toUpperCase()) +
      "</div><h2>" +
      esc(op.namaOperator) +
      '</h2><div class="sub">' +
      esc(
        [op.operatorId, op.iata || op.kodeOperator].filter(Boolean).join(" • "),
      ) +
      (lokasi ? " • " + esc(lokasi) : "") +
      "</div></div>" +
      '<span class="pill-status ' +
      (filled ? "filled" : "unfilled") +
      '">' +
      esc(op.statusDprk || "Belum Mengisi") +
      "</span></div></div>";

    var kpi =
      '<div class="card"><div class="data-summary">' +
      '<div class="mini-stat"><span>Skenario Dinilai</span><b>' +
      sm.latest.length +
      "</b></div>" +
      '<div class="mini-stat"><span>Rata-rata Nilai Risiko</span><b>' +
      (sm.latest.length
        ? sm.avg.toFixed(1) + '<small class="opd-of"> / 30</small>'
        : "—") +
      "</b></div>" +
      '<div class="mini-stat"><span>Tinggi & Menengah-Tinggi</span><b>' +
      (sm.latest.length ? highCount : "—") +
      "</b></div>" +
      '<div class="mini-stat"><span>Kejadian Terkait</span><b>' +
      (st.incidents === null
        ? "…"
        : inc.length + '<small class="opd-of"> · ' + avsec + " AVSEC</small>") +
      "</b></div></div>" +
      '<div class="opd-meta">Periode penilaian terakhir: <b>' +
      esc(sm.latestKey !== null ? periodLabel(sm.latestKey) : "—") +
      "</b> • Tanggal kaji ulang: <b>" +
      esc(fmtDate(op.tanggalKaji)) +
      "</b></div></div>";

    var riskSections = sm.latest.length
      ? '<div class="opd-grid">' +
        '<div class="card"><div class="section-head"><div><div class="section-kicker">RISK SNAPSHOT</div><h2>Distribusi Rating Risiko</h2><div class="sub">Periode ' +
        esc(periodLabel(sm.latestKey)) +
        ".</div></div></div>" +
        donutHtml(sm.dist, sm.latest.length) +
        "</div>" +
        '<div class="card"><div class="section-head"><div><div class="section-kicker">THREAT PROFILE</div><h2>Profil Risiko per Kategori</h2><div class="sub">Rata-rata nilai risiko per kategori ancaman (skala 3–30).</div></div></div>' +
        catBarsHtml(sm.cats) +
        "</div></div>" +
        '<div class="opd-grid">' +
        '<div class="card"><div class="section-head"><div><div class="section-kicker">TOP RISK</div><h2>5 Risiko Tertinggi</h2><div class="sub">Periode ' +
        esc(periodLabel(sm.latestKey)) +
        ".</div></div></div>" +
        topHtml(sm.top) +
        "</div>" +
        '<div class="card"><div class="section-head"><div><div class="section-kicker">TREND</div><h2>Tren Nilai Risiko</h2><div class="sub">Rata-rata nilai risiko per periode penilaian.</div></div></div>' +
        trendHtml(sm.trend) +
        "</div></div>"
      : '<div class="card"><div class="notice">' +
        (filled
          ? "DPRK operator ini tercatat, tetapi belum ada skenario risiko yang dinilai."
          : "Operator ini <b>belum mengisi DPRK</b>. Rekap risiko akan tampil setelah penilaian risiko diisi melalui tab Pengisian DPRK.") +
        "</div></div>";

    var incSection =
      '<div class="card"><div class="section-head"><div><div class="section-kicker">INCIDENT LOG</div><h2>Laporan Kejadian Terkait</h2><div class="sub">Dari Sistem Pelaporan — kejadian di lokasi operator ini atau yang melibatkan operator ini. Tanpa data pelapor.</div></div></div>' +
      incidentsHtml(inc) +
      "</div>";

    $("opDetail").innerHTML = head + kpi + riskSections + incSection;
    $("opdBack").onclick = close;
    $("opdCopy").onclick = function () {
      var url =
          location.href.split("#")[0] +
          "#operator=" +
          encodeURIComponent(op.operatorId),
        btn = this;
      var ok = function () {
        btn.textContent = "Link tersalin ✓";
        setTimeout(function () {
          btn.textContent = "Salin link rekap";
        }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText)
        navigator.clipboard.writeText(url).then(ok, function () {
          window.prompt("Salin link berikut:", url);
        });
      else window.prompt("Salin link berikut:", url);
    };
  }

  /* ---------------- Navigasi ---------------- */
  function open(id) {
    var op = findOperator(id);
    if (!op) {
      st.pendingHash = id;
      return;
    }
    st.current = op;
    $("opListCard").hidden = true;
    $("opDetail").hidden = false;
    if (location.hash !== "#operator=" + encodeURIComponent(op.operatorId))
      history.replaceState(
        null,
        "",
        "#operator=" + encodeURIComponent(op.operatorId),
      );
    render(op);
    window.scrollTo({ top: 0, behavior: "smooth" });
    loadData().then(function () {
      if (st.current === op) render(op);
    });
  }
  function close() {
    st.current = null;
    $("opDetail").hidden = true;
    $("opDetail").innerHTML = "";
    $("opListCard").hidden = false;
    if (/^#operator=/.test(location.hash))
      history.replaceState(null, "", location.pathname + location.search);
  }
  function showOperatorTab() {
    var b = document.querySelector('.nav button[data-view="operator"]');
    if (b && !b.classList.contains("active")) b.click();
  }
  function fromHash() {
    var m = /^#operator=(.+)$/.exec(location.hash);
    if (!m) return;
    var id = decodeURIComponent(m[1]);
    showOperatorTab();
    open(id);
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest(".op-link[data-op-id]");
    if (btn) {
      open(btn.getAttribute("data-op-id"));
      return;
    }
    var nav =
      e.target.closest && e.target.closest('.nav button[data-view="operator"]');
    if (nav && st.current) close();
  });
  document.addEventListener("sirisk:operators", function () {
    if (st.pendingHash) {
      var id = st.pendingHash;
      st.pendingHash = null;
      showOperatorTab();
      open(id);
    }
  });
  document.addEventListener("sirisk:risks", function () {
    if (st.current) render(st.current);
  });
  window.addEventListener("hashchange", fromHash);
  if (/^#operator=/.test(location.hash)) {
    st.pendingHash = decodeURIComponent(
      location.hash.replace(/^#operator=/, ""),
    );
    if (S.operatorsLoaded()) fromHash();
  }

  window.SIRISK_OPERATOR_DETAIL = { open: open, close: close };
})();
