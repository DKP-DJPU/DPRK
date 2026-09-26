(function () {
  "use strict";
  var GAS_URL =
    "https://script.google.com/macros/s/AKfycbyY6BLRyTqZSSlDS3o9nkWms_ky6saoxdYsELZoSv1fw_I0f0eENMb8T-ICphAtHwahrA/exec";
  var AIRPORT_REGIONS = {
    TJQ: ["Kepulauan Bangka Belitung", "Kabupaten Belitung"],
    DJB: ["Jambi", "Kota Jambi"],
    BKS: ["Bengkulu", "Kota Bengkulu"],
    PDG: ["Sumatera Barat", "Kabupaten Padang Pariaman"],
    UPG: ["Sulawesi Selatan", "Kabupaten Maros"],
    BDJ: ["Kalimantan Selatan", "Kota Banjarbaru"],
    SOC: ["Jawa Tengah", "Kabupaten Boyolali"],
    DHX: ["Jawa Timur", "Kabupaten Kediri"],
    TNJ: ["Kepulauan Riau", "Kota Tanjung Pinang"],
    SRG: ["Jawa Tengah", "Kota Semarang"],
    SUB: ["Jawa Timur", "Kabupaten Sidoarjo"],
    BTJ: ["Aceh", "Kabupaten Aceh Besar"],
    BDO: ["Jawa Barat", "Kota Bandung"],
  };
  function airportRegion(a) {
    var i = String((a && a[3]) || "").toUpperCase();
    var oid = "BD-" + String((a && a[0]) || "");
    var ops = state.operators || [];
    var master =
      ops.filter(function (x) {
        return String(x.operatorId || "") === oid;
      })[0] ||
      (i
        ? ops.filter(function (x) {
            return (
              String(x.iata || "").toUpperCase() === i && String(x.jenisOperator || "") === "Bandar Udara"
            );
          })[0]
        : null);
    if (master && (master.provinsi || master.kabkota)) {
      return [String(master.provinsi || ""), String(master.kabkota || "")];
    }
    return AIRPORT_REGIONS[i] || ["", String((a && a[2]) || "")];
  }
  var AIRPORTS = [],
    CATALOG = [],
    KATEGORI = []; // dimuat dari data/*.json saat start
  var KATEGORI_NAME = {};
  var PROVINSI = [
    "Aceh",
    "Sumatera Utara",
    "Sumatera Barat",
    "Riau",
    "Kepulauan Riau",
    "Jambi",
    "Sumatera Selatan",
    "Kepulauan Bangka Belitung",
    "Bengkulu",
    "Lampung",
    "DKI Jakarta",
    "Jawa Barat",
    "Jawa Tengah",
    "DI Yogyakarta",
    "Jawa Timur",
    "Banten",
    "Bali",
    "Nusa Tenggara Barat",
    "Nusa Tenggara Timur",
    "Kalimantan Barat",
    "Kalimantan Tengah",
    "Kalimantan Selatan",
    "Kalimantan Timur",
    "Kalimantan Utara",
    "Sulawesi Utara",
    "Sulawesi Tengah",
    "Sulawesi Selatan",
    "Sulawesi Tenggara",
    "Gorontalo",
    "Sulawesi Barat",
    "Maluku",
    "Maluku Utara",
    "Papua",
    "Papua Barat",
    "Papua Selatan",
    "Papua Tengah",
    "Papua Pegunungan",
    "Papua Barat Daya",
  ];
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
  var TYPES = [
    ["Bandar Udara", "Bandar Udara", "Master 281 bandara"],
    ["Airlines", "Airlines", "Entitas operator penerbangan"],
    ["LPPNPI", "LPPNPI", "Unit/fasilitas LPPNPI"],
    ["Regulated Agent", "Regulated Agent", "Entitas regulated agent"],
  ];
  var RATING = ["Tinggi", "Menengah-Tinggi", "Menengah", "Menengah-Rendah", "Rendah"];
  var BAND = [
    { min: 3, max: 6, l: "Rendah", c: "#5B9E5E" },
    { min: 7, max: 12, l: "Menengah-Rendah", c: "#8FB86A" },
    { min: 13, max: 18, l: "Menengah", c: "#E0B341" },
    { min: 19, max: 24, l: "Menengah-Tinggi", c: "#DD8A42" },
    { min: 25, max: 30, l: "Tinggi", c: "#CF4A42" },
  ];
  var PERLAKUAN = ["Diterima", "Mitigasi", "Penolakan", "Pembagian"],
    PRIORITAS = ["Sangat Segera", "Segera", "Biasa"];
  var state = {
    type: "",
    entity: null,
    data: null,
    operators: [],
    risks: [],
    risksLoadedAt: 0,
    edit: null,
    pendingCreateId: null,
    pendingCreateToken: null,
    pendingCreateFingerprint: null,
  };
  function $(id) {
    return document.getElementById(id);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function get(a, attempt) {
    attempt = attempt || 0;
    var bits = String(a).split("&"),
      action = bits.shift();
    var url =
      GAS_URL +
      "?action=" +
      encodeURIComponent(action) +
      (bits.length ? "&" + bits.join("&") : "") +
      "&_ts=" +
      Date.now();
    return fetch(url, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (res) {
        if (res && res.code === "BUSY" && attempt < 2)
          return new Promise(function (resolve) {
            setTimeout(resolve, 800 * (attempt + 1));
          }).then(function () {
            return get(a, attempt + 1);
          });
        return res;
      });
  }
  function post(p, attempt) {
    attempt = attempt || 0;
    return fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(p),
    })
      .then(function (r) {
        if (!r.ok) throw Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (res) {
        if (res && res.code === "BUSY" && attempt < 2)
          return new Promise(function (resolve) {
            setTimeout(resolve, 1000 * (attempt + 1));
          }).then(function () {
            return post(p, attempt + 1);
          });
        return res;
      });
  }
  function rating(n) {
    for (var i = 0; i < BAND.length; i++) if (n >= BAND[i].min && n <= BAND[i].max) return BAND[i];
    return null;
  }
  function pill(r) {
    return r ? '<span class="pill" style="background:' + r.c + '">' + esc(r.l) + "</span>" : "—";
  }
  function token() {
    var a = new Uint8Array(10);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (var i = 0; i < a.length; i++) a[i] = Math.random() * 256;
    return Array.prototype.map
      .call(a, function (x) {
        return ("0" + x.toString(16)).slice(-2);
      })
      .join("")
      .toUpperCase();
  }

  function init() {
    $("bulan").innerHTML =
      '<option value="">Pilih bulan</option>' +
      BULAN.map(function (x) {
        return "<option>" + x + "</option>";
      }).join("");
    $("kategori").innerHTML =
      '<option value="">Pilih kategori</option>' +
      KATEGORI.map(function (x) {
        return '<option value="' + x[0] + '">' + esc(x[0] + " — " + x[1]) + "</option>";
      }).join("");
    $("perlakuan").innerHTML =
      '<option value="">Pilih perlakuan</option>' +
      PERLAKUAN.map(function (x) {
        return "<option>" + x + "</option>";
      }).join("");
    $("prioritas").innerHTML =
      '<option value="">Pilih prioritas</option>' +
      PRIORITAS.map(function (x) {
        return "<option>" + x + "</option>";
      }).join("");
    $("riskRating").innerHTML =
      '<option value="">Semua Rating</option>' +
      RATING.map(function (x) {
        return "<option>" + x + "</option>";
      }).join("");
    $("riskCategory").innerHTML =
      '<option value="">Semua Kategori</option>' +
      KATEGORI.map(function (x) {
        return '<option value="' + x[0] + '">' + x[0] + " — " + esc(x[1]) + "</option>";
      }).join("");
    $("riskType").innerHTML =
      '<option value="">Semua Jenis Operator</option>' +
      TYPES.map(function (x) {
        return '<option value="' + esc(x[0]) + '">' + esc(x[0]) + "</option>";
      }).join("");
    renderTypes();
    renderEntityArea();
    bind();
    renderLocalHistory();
    loadDashboard();
    loadRisks();
    loadOperatorMasterForForm();
  }
  function loadOperatorMasterForForm() {
    get("operators")
      .then(function (res) {
        if (res && res.ok) {
          state.operators = res.data || [];
          state.operatorsLoaded = true;
          enrichRiskLocations();
          initDashboardLocationFilters();
          renderTypes();
          if (!state.entity) renderEntityArea();
          else if (state.type === "Bandar Udara") renderEntityArea();
          document.dispatchEvent(new CustomEvent("sirisk:operators"));
        }
      })
      .catch(function (e) {
        console.warn("MASTER_OPERATOR belum dapat dimuat:", e);
        state.operatorsError = true;
        renderTypes();
      });
  }
  function isActiveOp(o) {
    return String(o && o.aktif).toLowerCase() !== "false";
  }
  function activeOpsByType(t) {
    return (state.operators || []).filter(function (o) {
      return isActiveOp(o) && String(o.jenisOperator || "") === t;
    });
  }
  var TYPE_UNIT = {
    "Bandar Udara": "bandara",
    Airlines: "badan usaha angkutan udara",
    LPPNPI: "cabang LPPNPI",
    "Regulated Agent": "lokasi regulated agent",
  };
  function typeCountLabel(t, fallback) {
    if (!state.operatorsLoaded) return state.operatorsError ? fallback : "Memuat jumlah dari master...";
    var n = activeOpsByType(t).length;
    return n + " " + (TYPE_UNIT[t] || "entitas") + " aktif";
  }
  function airportList() {
    var m = activeOpsByType("Bandar Udara");
    if (!m.length) return AIRPORTS;
    return m
      .map(function (o) {
        var a = [
          String(o.operatorId || "").replace(/^BD-/, ""),
          String(o.namaOperator || ""),
          String(o.kabkota || o.lokasi || ""),
          String(o.iata || o.kodeOperator || ""),
          String(o.kelas || ""),
        ];
        a.operatorId = String(o.operatorId || "");
        return a;
      })
      .sort(function (a, b) {
        return a[1].localeCompare(b[1]);
      });
  }
  function renderTypes() {
    $("types").innerHTML =
      TYPES.map(function (t) {
        return (
          '<label class="type ' +
          (state.type === t[0] ? "selected" : "") +
          '"><input type="radio" name="entityType" value="' +
          esc(t[0]) +
          '"><b>' +
          esc(t[1]) +
          "</b><small>" +
          esc(typeCountLabel(t[0], t[2])) +
          "</small></label>"
        );
      }).join("") +
      (state.operatorsLoaded
        ? '<div class="scenario-hint full" style="grid-column:1/-1">Total ' +
          (state.operators || []).filter(isActiveOp).length +
          " operator aktif terdaftar di MASTER_OPERATOR.</div>"
        : "");
    Array.prototype.forEach.call(document.querySelectorAll("input[name=entityType]"), function (r) {
      r.checked = r.value === state.type;
      r.disabled = !!state.edit;
      r.onchange = function () {
        if (this.disabled) return;
        state.type = this.value;
        state.entity = null;
        renderTypes();
        renderEntityArea();
        clearScenarioSelection();
        filterCatalog();
      };
    });
  }
  function renderEntityArea() {
    var a = $("entityArea");
    if (!state.type) {
      a.innerHTML = '<div class="notice">Pilih salah satu dari 4 jenis operator untuk melanjutkan.</div>';
      return;
    }
    if (state.type === "Bandar Udara") {
      a.innerHTML =
        '<div class="field"><label>Nama Bandar Udara</label><input id="entitySearch" placeholder="Ketik nama bandara atau kota... (' +
        esc(airportList().length) +
        ' bandara aktif)"><div id="entityResults" style="border:1px solid var(--line);border-radius:9px;max-height:230px;overflow:auto;display:none;background:#fff"></div></div><div id="entitySelected"></div>';
      $("entitySearch").oninput = function () {
        var q = this.value.toLowerCase(),
          arr = airportList()
            .filter(function (x) {
              return (x[1] + " " + x[2] + " " + x[3]).toLowerCase().indexOf(q) > -1;
            })
            .slice(0, 25),
          box = $("entityResults");
        box.innerHTML =
          arr
            .map(function (x) {
              return (
                '<div style="padding:9px;border-bottom:1px solid #edf1f5;cursor:pointer" data-id="' +
                x[0] +
                '"><b>' +
                esc(x[1]) +
                "</b> " +
                esc(x[3] || "") +
                "<br><small>" +
                esc(x[2]) +
                " • Kelas " +
                esc(x[4] || "-") +
                "</small></div>"
              );
            })
            .join("") || '<div class="empty">Tidak ditemukan.</div>';
        box.style.display = "block";
        Array.prototype.forEach.call(box.children, function (el) {
          el.onclick = function () {
            var id = this.getAttribute("data-id");
            state.entity = airportList().filter(function (x) {
              return x[0] === id;
            })[0];
            renderEntityArea();
          };
        });
      };
      if (state.edit) {
        $("entitySearch").disabled = true;
      }
      if (state.entity) {
        var rg = airportRegion(state.entity);
        var source = (state.operators || []).some(function (x) {
          return (
            String(x.operatorId || "") === "BD-" + String(state.entity[0] || "") && (x.provinsi || x.kabkota)
          );
        });
        $("entitySelected").innerHTML =
          '<div class="notice ok"><b>' +
          esc(state.entity[1]) +
          "</b> • " +
          esc(state.entity[3] || "-") +
          " • " +
          esc(state.entity[2]) +
          " • Kelas " +
          esc(state.entity[4] || "-") +
          (source ? " • Wilayah dari MASTER_OPERATOR" : "") +
          '</div><div class="formgrid" style="margin-top:10px"><div class="field"><label>Provinsi</label><input id="airportProv" value="' +
          esc(rg[0]) +
          '" readonly></div><div class="field"><label>Kabupaten/Kota</label><input id="airportKab" value="' +
          esc(rg[1]) +
          '" readonly></div></div>';
      }
    } else {
      var mlist = activeOpsByType(state.type);
      a.innerHTML =
        (mlist.length
          ? '<div class="field"><label>Cari ' +
            esc(state.type) +
            " dari master (" +
            mlist.length +
            ' terdaftar)</label><input id="masterSearch" placeholder="Ketik nama, kode, atau kota..."><div id="masterResults" style="border:1px solid var(--line);border-radius:9px;max-height:230px;overflow:auto;display:none;background:#fff"></div>' +
            (state.entity &&
            state.entity.operatorId &&
            mlist.some(function (o) {
              return String(o.operatorId) === String(state.entity.operatorId);
            })
              ? '<div class="notice ok" style="margin-top:8px">Terhubung ke MASTER_OPERATOR: <b>' +
                esc(state.entity.nama) +
                "</b> • " +
                esc(state.entity.operatorId) +
                "</div>"
              : '<div class="scenario-hint">Pilih dari daftar agar data tersambung ke master. Isi manual di bawah hanya jika entitas belum terdaftar.</div>') +
            "</div>"
          : "") +
        '<div class="formgrid"><div class="field"><label>Nama Entitas / Unit</label><input id="entityName" placeholder="Nama ' +
        esc(state.type) +
        '"></div><div class="field"><label>Kode / ICAO / Identitas (opsional)</label><input id="entityCode" placeholder="Kode identitas"></div><div class="field"><label>Provinsi</label><select id="entityProv"><option value="">Pilih provinsi</option>' +
        PROVINSI.map(function (x) {
          return "<option>" + x + "</option>";
        }).join("") +
        '</select></div><div class="field"><label>Kabupaten/Kota</label><input id="entityKab" placeholder="Kabupaten/Kota"></div><div class="field full"><label>Lokasi / Basis / Fasilitas</label><input id="entityLoc" placeholder="Lokasi operasional"></div></div>';
      if ($("masterSearch")) {
        if (state.edit) $("masterSearch").disabled = true;
        $("masterSearch").oninput = function () {
          var q = this.value.toLowerCase().trim(),
            arr = mlist
              .filter(function (o) {
                return (
                  (
                    String(o.namaOperator || "") +
                    " " +
                    String(o.kodeOperator || "") +
                    " " +
                    String(o.iata || "") +
                    " " +
                    String(o.kabkota || "") +
                    " " +
                    String(o.lokasi || "")
                  )
                    .toLowerCase()
                    .indexOf(q) > -1
                );
              })
              .slice(0, 30),
            box = $("masterResults");
          box.innerHTML =
            arr
              .map(function (o) {
                return (
                  '<div style="padding:9px;border-bottom:1px solid #edf1f5;cursor:pointer" data-oid="' +
                  esc(o.operatorId) +
                  '"><b>' +
                  esc(o.namaOperator) +
                  "</b> " +
                  esc(o.iata || "") +
                  "<br><small>" +
                  esc([o.lokasi || o.kabkota, o.provinsi].filter(Boolean).join(" • ") || o.operatorId) +
                  "</small></div>"
                );
              })
              .join("") || '<div class="empty">Tidak ditemukan di master. Isi manual di bawah.</div>';
          box.style.display = "block";
          Array.prototype.forEach.call(box.querySelectorAll("[data-oid]"), function (el) {
            el.onclick = function () {
              var oid = this.getAttribute("data-oid"),
                o = mlist.filter(function (x) {
                  return String(x.operatorId) === oid;
                })[0];
              if (!o) return;
              state.entity = {
                operatorId: String(o.operatorId),
                jenisOperator: state.type,
                nama: o.namaOperator || "",
                kode: o.kodeOperator || "",
                provinsi: o.provinsi || "",
                kabkota: o.kabkota || "",
                lokasi: o.lokasi || "",
              };
              renderEntityArea();
            };
          });
        };
      }
      if (state.entity) {
        $("entityName").value = state.entity.nama || "";
        $("entityCode").value = state.entity.kode || "";
        $("entityProv").value = state.entity.provinsi || "";
        $("entityKab").value = state.entity.kabkota || "";
        $("entityLoc").value = state.entity.lokasi || "";
      }
      if (state.edit) {
        ["entityName", "entityCode", "entityProv", "entityKab", "entityLoc"].forEach(function (id) {
          if ($(id)) $(id).disabled = true;
        });
      }
    }
  }
  function generatedOperatorId(type, name) {
    return (
      String(type || "")
        .slice(0, 3)
        .toUpperCase() +
      "-" +
      String(name || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 24)
    );
  }
  function resolveStableOperatorId(type, name, code) {
    var t = String(type || "").trim(),
      n = String(name || "")
        .trim()
        .toLowerCase(),
      c = String(code || "")
        .trim()
        .toLowerCase();
    var arr = activeOpsByType(t);
    var byCode = c
      ? arr.filter(function (x) {
          return (
            String(x.kodeOperator || "")
              .trim()
              .toLowerCase() === c
          );
        })[0]
      : null;
    if (byCode && byCode.operatorId) return String(byCode.operatorId);
    var byName = n
      ? arr.filter(function (x) {
          return (
            String(x.namaOperator || "")
              .trim()
              .toLowerCase() === n
          );
        })[0]
      : null;
    if (byName && byName.operatorId) return String(byName.operatorId);
    return generatedOperatorId(t, name);
  }
  function readEntity() {
    if (state.type === "Bandar Udara") {
      if (!state.entity) return null;
      var rg = airportRegion(state.entity);
      return {
        operatorId: state.entity.operatorId || "BD-" + state.entity[0],
        jenisOperator: "Bandar Udara",
        namaOperator: state.entity[1],
        kodeOperator: state.entity[3] || "",
        iata: state.entity[3] || "",
        provinsi: rg[0] || "",
        kabkota: rg[1] || state.entity[2] || "",
        lokasi: state.entity[2] || "",
        kelas: state.entity[4] || "",
      };
    }
    var n = $("entityName") && $("entityName").value.trim();
    if (!n) return null;
    var code = $("entityCode") ? $("entityCode").value.trim() : "";
    var stableId =
      state.entity && state.entity.operatorId && String(state.entity.nama || "").trim() === n
        ? String(state.entity.operatorId)
        : resolveStableOperatorId(state.type, n, code);
    return {
      operatorId: stableId,
      jenisOperator: state.type,
      namaOperator: n,
      kodeOperator: code,
      iata: "",
      provinsi: $("entityProv").value,
      kabkota: $("entityKab").value.trim(),
      lokasi: $("entityLoc").value.trim(),
      kelas: "",
    };
  }
  function normalizeCategory(v) {
    return String(v || "")
      .trim()
      .split(/\s*[—-]\s*/)[0]
      .trim();
  }
  function catalogCategory(x) {
    return normalizeCategory(x[1] || x[0]);
  }
  function clearScenarioSelection() {
    if ($("riskCatalog")) $("riskCatalog").value = "";
    if ($("skenario")) $("skenario").value = "";
    if ($("area")) $("area").value = "";
    if ($("skenario"))
      $("skenario").placeholder = "Skenario akan terisi dari katalog dan dapat disesuaikan bila diperlukan.";
  }
  function filterCatalog() {
    var cat = $("kategori").value || "";
    var arr = CATALOG.filter(function (x) {
      return !cat || catalogCategory(x) === normalizeCategory(cat);
    });
    arr.sort(function (a, b) {
      return String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true });
    });
    $("riskCatalog").innerHTML =
      '<option value="">Pilih skenario katalog (' +
      arr.length +
      " tersedia)</option>" +
      arr
        .map(function (x) {
          return '<option value="' + esc(x[0]) + '">' + esc(x[0] + " — " + x[2]) + "</option>";
        })
        .join("") +
      '<option value="__MANUAL__">Isi Sendiri — Skenario belum tersedia di katalog</option>';
  }
  function catalogScenarioById(id) {
    if (!id || id === "__MANUAL__") return null;
    return (
      CATALOG.filter(function (x) {
        return String(x[0]) === String(id);
      })[0] || null
    );
  }
  function isSelectedCatalogScenarioAllowed() {
    var id = $("riskCatalog") ? $("riskCatalog").value : "";
    if (!id || id === "__MANUAL__") return true;
    var scenario = catalogScenarioById(id);
    return (
      !!scenario &&
      (!$("kategori").value || catalogCategory(scenario) === normalizeCategory($("kategori").value))
    );
  }
  function bind() {
    Array.prototype.forEach.call(document.querySelectorAll(".nav button"), function (b) {
      b.onclick = function () {
        Array.prototype.forEach.call(document.querySelectorAll(".nav button"), function (x) {
          x.classList.remove("active");
          x.setAttribute("aria-selected", "false");
        });
        b.classList.add("active");
        b.setAttribute("aria-selected", "true");
        Array.prototype.forEach.call(document.querySelectorAll(".view"), function (v) {
          v.classList.remove("active");
        });
        $("view-" + b.dataset.view).classList.add("active");
        window.scrollTo({ top: 0, behavior: "smooth" });
        if (b.dataset.view === "operator") loadOperators();
        if (b.dataset.view === "risk") loadRisks();
        if (b.dataset.view === "trend") renderTrends();
        if (b.dataset.view === "pelaporan" && window.SIRISK_PELAPORAN) window.SIRISK_PELAPORAN.show();
      };
    });
    $("kategori").onchange = function () {
      clearScenarioSelection();
      filterCatalog();
    };
    $("riskCatalog").onchange = function () {
      if (this.value === "__MANUAL__") {
        $("skenario").value = "";
        $("area").value = "";
        $("skenario").placeholder = "Tulis skenario ancaman/metode serangan secara manual.";
        $("skenario").focus();
        return;
      }
      var x = CATALOG.filter(function (c) {
        return c[0] === this.value;
      }, this)[0];
      if (x) {
        $("skenario").value = x[2];
        $("area").value = x[3] || "";
        $("skenario").placeholder = "Skenario terisi dari katalog dan dapat disesuaikan bila diperlukan.";
      }
    };
    ["ancaman", "kerentanan", "konsekuensi"].forEach(function (id) {
      $(id).oninput = updateRisk;
    });
    $("saveBtn").onclick = save;
    $("loadEditBtn").onclick = loadEdit;
    $("loadDprkTokenBtn").onclick = loadDprkToken;
    $("clearBtn").onclick = clearForm;
    $("clearLocalHistoryBtn").onclick = clearLocalHistory;
    $("opRefresh").onclick = loadOperators;
    ["opFilterType", "opFilterProv", "opSearch"].forEach(function (id) {
      $(id).oninput = renderOperatorTable;
    });
    ["riskType", "riskRating", "riskCategory", "riskSearch"].forEach(function (id) {
      $(id).oninput = renderRiskTable;
    });
  }
  function applyRiskColor(boxId, ratingId, n) {
    var box = $(boxId),
      lab = $(ratingId);
    box.classList.remove("risk-low", "risk-ml", "risk-mid", "risk-mh", "risk-high");
    if (!n) {
      lab.textContent = "Belum diisi";
      return;
    }
    if (n <= 2) {
      box.classList.add("risk-low");
      lab.textContent = "Rendah";
    } else if (n <= 4) {
      box.classList.add("risk-ml");
      lab.textContent = "Menengah-Rendah";
    } else if (n <= 6) {
      box.classList.add("risk-mid");
      lab.textContent = "Menengah";
    } else if (n <= 8) {
      box.classList.add("risk-mh");
      lab.textContent = "Menengah-Tinggi";
    } else {
      box.classList.add("risk-high");
      lab.textContent = "Tinggi";
    }
  }
  function updateRisk() {
    var a = Number($("ancaman").value),
      k = Number($("kerentanan").value),
      c = Number($("konsekuensi").value),
      sum = (a || 0) + (k || 0) + (c || 0),
      r = rating(sum);
    applyRiskColor("riskBoxAncaman", "ancamanRating", a);
    applyRiskColor("riskBoxKerentanan", "kerentananRating", k);
    applyRiskColor("riskBoxKonsekuensi", "konsekuensiRating", c);
    $("riskNum").textContent = a && k && c ? sum : "—";
    $("riskBadge").textContent = r ? r.l : "Belum lengkap";
    $("riskBadge").style.background = r ? r.c : "#cfd7df";
    $("riskMeterFill").style.width = a && k && c ? Math.min(100, (sum / 30) * 100) + "%" : "0%";
    $("riskMeterFill").style.background = r ? r.c : "#cfd7df";
  }
  function clearScenario() {
    [
      "skenario",
      "area",
      "langkahSaatIni",
      "kerentananSaatIni",
      "ancaman",
      "kerentanan",
      "konsekuensi",
      "langkahTambahan",
      "keterangan",
    ].forEach(function (id) {
      $(id).value = "";
    });
    $("riskCatalog").value = "";
    updateRisk();
  }
  function clearForm() {
    clearScenario();
    [
      "namaPengisi",
      "jabatanPengisi",
      "riskOwner",
      "emailRiskOwner",
      "tanggalPengesahan",
      "tanggalKaji",
      "linkDprk",
    ].forEach(function (id) {
      $(id).value = "";
    });
    $("kategori").value = "";
    $("bulan").value = "";
    $("formNotice").innerHTML = "";
    $("refBox").style.display = "none";
    state.edit = null;
    state.pendingCreateId = null;
    state.pendingCreateToken = null;
    state.pendingCreateFingerprint = null;
    renderTypes();
    renderEntityArea();
    filterCatalog();
  }
  // ============================================================
  // SPRINT 1 (FRONTEND) — PENYIMPANAN LOKAL dprkEditToken
  // Backend (V2 Sprint 1) sekarang menerbitkan dprkEditToken saat DPRK sebuah
  // entitas pertama kali dibuat, dan mensyaratkan token itu untuk mengubah
  // field identitas DPRK (email risk owner, link file, tanggal kaji, dst)
  // pada pengisian berikutnya. Token disimpan per kombinasi operatorId+tahun,
  // bukan per skenario risiko, karena satu DPRK bisa memuat banyak skenario.
  // ============================================================
  var DPRK_TOKEN_KEY = "DPRK_NASIONAL_DPRKTOKEN_V1";
  function dprkTokenMapKey(operatorId, tahun) {
    return String(operatorId || "") + "|" + String(tahun || "");
  }
  function getDprkTokenMap() {
    try {
      return JSON.parse(localStorage.getItem(DPRK_TOKEN_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }
  function setDprkTokenMap(m) {
    try {
      localStorage.setItem(DPRK_TOKEN_KEY, JSON.stringify(m));
    } catch (e) {}
  }
  function getDprkToken(operatorId, tahun) {
    var m = getDprkTokenMap();
    return m[dprkTokenMapKey(operatorId, tahun)] || "";
  }
  function setDprkToken(operatorId, tahun, tok) {
    if (!tok) return;
    var m = getDprkTokenMap();
    m[dprkTokenMapKey(operatorId, tahun)] = tok;
    setDprkTokenMap(m);
  }

  var LOCAL_HISTORY_KEY = "DPRK_NASIONAL_RIWAYAT_V1";
  function getLocalHistory() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }
  function setLocalHistory(a) {
    try {
      localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(a.slice(0, 100)));
    } catch (e) {}
  }
  function saveLocalHistory(p, action, dprkEditTokenIssued) {
    var a = getLocalHistory(),
      item = {
        id: p.id,
        editToken: p.editToken,
        dprkEditToken: dprkEditTokenIssued || getDprkToken(p.operatorId, p.tahun) || "",
        operatorId: p.operatorId,
        jenisOperator: p.jenisOperator,
        namaOperator: p.namaOperator,
        kategori: p.kategori,
        idRisikoKatalog: p.idRisikoKatalog,
        skenario: p.skenario,
        risikoNilai: p.risikoNilai,
        risikoRating: p.risikoRating,
        bulan: p.bulan,
        tahun: p.tahun,
        periodKey: p.periodKey || p.operatorId + "|" + p.tahun + "|" + p.bulan,
        duplicateKey: p.duplicateKey || "",
        savedAt: new Date().toISOString(),
        action: action || "create",
      };
    var idx = a.findIndex(function (x) {
      return x.id === item.id;
    });
    if (idx >= 0) a.splice(idx, 1);
    a.unshift(item);
    setLocalHistory(a);
    renderLocalHistory();
  }
  function renderLocalHistory() {
    var box = $("localHistoryList");
    if (!box) return;
    var a = getLocalHistory();
    if (!a.length) {
      box.innerHTML = '<div class="empty">Belum ada riwayat pengisian pada perangkat ini.</div>';
      return;
    }
    box.innerHTML = a
      .map(function (x, i) {
        var when = x.savedAt ? new Date(x.savedAt).toLocaleString("id-ID") : "-",
          rr = rating(Number(x.risikoNilai)) || { c: "#607080" };
        var dprkBtn = x.dprkEditToken
          ? '<button class="btn secondary" data-local-copy-dprk="' + i + '">Salin Kode DPRK</button>'
          : "";
        return (
          '<div class="local-item"><div class="local-item-head"><div><div class="local-item-title">' +
          esc(x.namaOperator || "-") +
          " • " +
          esc(x.idRisikoKatalog || "Manual") +
          '</div><div class="local-item-meta">' +
          esc(x.kategori || "-") +
          " • Risiko " +
          esc(x.risikoNilai || "-") +
          " • " +
          esc(x.risikoRating || "-") +
          " • " +
          esc(when) +
          '</div></div><span class="pill" style="background:' +
          rr.c +
          '">' +
          esc(x.action === "update" ? "Diperbarui" : "Tersimpan") +
          '</span></div><div style="margin-top:6px;font-size:12px">' +
          esc(x.skenario || "-") +
          '</div><div class="local-item-actions"><button class="btn secondary" data-local-edit="' +
          i +
          '">Edit</button><button class="btn secondary" data-local-copy="' +
          i +
          '">Salin Kode Edit</button>' +
          dprkBtn +
          '<button class="btn secondary" data-local-delete="' +
          i +
          '">Hapus</button></div></div>'
        );
      })
      .join("");
    Array.prototype.forEach.call(box.querySelectorAll("[data-local-edit]"), function (b) {
      b.onclick = function () {
        var x = getLocalHistory()[Number(this.dataset.localEdit)];
        if (!x) return;
        $("editRef").value = x.id + "::" + x.editToken;
        loadEdit();
      };
    });
    Array.prototype.forEach.call(box.querySelectorAll("[data-local-copy]"), function (b) {
      b.onclick = function () {
        var x = getLocalHistory()[Number(this.dataset.localCopy)];
        if (!x) return;
        var ref = x.id + "::" + x.editToken;
        if (navigator.clipboard) {
          navigator.clipboard
            .writeText(ref)
            .then(function () {
              b.textContent = "Tersalin";
              setTimeout(function () {
                b.textContent = "Salin Kode Edit";
              }, 1200);
            })
            .catch(function () {
              prompt("Salin kode edit berikut:", ref);
            });
        } else prompt("Salin kode edit berikut:", ref);
      };
    });
    Array.prototype.forEach.call(box.querySelectorAll("[data-local-copy-dprk]"), function (b) {
      b.onclick = function () {
        var x = getLocalHistory()[Number(this.dataset.localCopyDprk)];
        if (!x || !x.dprkEditToken) return;
        var ref = x.operatorId + "|" + x.tahun + "::" + x.dprkEditToken;
        if (navigator.clipboard) {
          navigator.clipboard
            .writeText(ref)
            .then(function () {
              b.textContent = "Tersalin";
              setTimeout(function () {
                b.textContent = "Salin Kode DPRK";
              }, 1200);
            })
            .catch(function () {
              prompt("Salin kode edit DPRK berikut:", ref);
            });
        } else prompt("Salin kode edit DPRK berikut:", ref);
      };
    });
    Array.prototype.forEach.call(box.querySelectorAll("[data-local-delete]"), function (b) {
      b.onclick = function () {
        var a = getLocalHistory();
        a.splice(Number(this.dataset.localDelete), 1);
        setLocalHistory(a);
        renderLocalHistory();
      };
    });
  }
  function clearLocalHistory() {
    if (!getLocalHistory().length) return;
    if (
      !confirm(
        "Hapus seluruh riwayat pengisian dari browser/perangkat ini? Data utama di Google Sheets tidak akan terhapus.",
      )
    )
      return;
    localStorage.removeItem(LOCAL_HISTORY_KEY);
    renderLocalHistory();
  }

  function buildPeriodKey(e) {
    var bulan = $("bulan") ? $("bulan").value : "";
    var tahun = $("tahun") ? String($("tahun").value || "").trim() : "";
    return [String((e && e.operatorId) || ""), tahun, bulan].join("|");
  }
  function normalizeDuplicateText(v) {
    return String(v || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ");
  }
  function buildDuplicateKey(e, category, scenario, bulan, tahun) {
    return [
      String((e && e.operatorId) || "")
        .trim()
        .toUpperCase(),
      String(tahun || "").trim(),
      String(bulan || "")
        .trim()
        .toLowerCase(),
      normalizeCategory(category),
      normalizeDuplicateText(scenario),
    ].join("|");
  }
  function recordDuplicateKey(x) {
    return buildDuplicateKey(
      { operatorId: (x && x.operatorId) || "" },
      (x && x.kategoriKode) || (x && x.kategori) || "",
      (x && x.skenario) || "",
      (x && x.bulan) || "",
      (x && x.tahun) || "",
    );
  }
  function buildRecordFingerprint(x) {
    return [
      (x && x.operatorId) || "",
      (x && x.jenisOperator) || "",
      (x && x.namaOperator) || "",
      (x && x.kodeOperator) || "",
      (x && x.provinsi) || "",
      (x && x.kabkota) || "",
      (x && x.lokasi) || "",
      (x && x.bulan) || "",
      (x && x.tahun) || "",
      (x && x.tanggalPengesahan) || "",
      (x && x.namaPengisi) || "",
      (x && x.jabatanPengisi) || "",
      (x && x.emailRiskOwner) || (x && x.emailPemilikRisiko) || "",
      (x && x.linkFileDprk) || (x && x.linkDprk) || "",
      (x && x.kategoriKode) || (x && x.kategori) || "",
      (x && x.idRisikoKatalog) || "",
      (x && x.skenario) || "",
      (x && x.area) || "",
      (x && x.langkahSaatIni) || "",
      (x && x.kerentananSaatIni) || "",
      (x && x.ancamanNilai) || "",
      (x && x.kerentananNilai) || "",
      (x && x.konsekuensiNilai) || "",
      (x && x.pemilikRisiko) || (x && x.riskOwner) || "",
      (x && x.tanggalKaji) || "",
      (x && x.perlakuan) || "",
      (x && x.prioritas) || "",
      (x && x.langkahTambahan) || "",
      (x && x.keterangan) || "",
    ].join("|");
  }
  function findDuplicateRisk(e, category, scenario, bulan, tahun, excludeId) {
    var key = buildDuplicateKey(e, category, scenario, bulan, tahun);
    var hit = (state.risks || []).filter(function (x) {
      return String(x.riskId || x.id || "") !== String(excludeId || "") && recordDuplicateKey(x) === key;
    })[0];
    return hit || null;
  }
  function ensureRecentRisks() {
    var fresh = state.risksLoadedAt && Date.now() - state.risksLoadedAt < 30000;
    if (fresh) return Promise.resolve(true);
    return get("risks").then(function (res) {
      if (!res.ok) throw Error(res.error || "Data risiko belum dapat dimuat untuk pemeriksaan duplikasi.");
      state.risks = res.data || [];
      state.risksLoadedAt = Date.now();
      enrichRiskLocations();
      return true;
    });
  }
  function checkEditFreshness() {
    if (!state.edit || !state.edit.id || !state.edit.editToken) return Promise.resolve(true);
    return get(
      "find&id=" + encodeURIComponent(state.edit.id) + "&token=" + encodeURIComponent(state.edit.editToken),
    ).then(function (res) {
      if (!res.ok) throw Error(res.error || "Data edit tidak dapat diverifikasi.");
      var server = res.data || {};
      var current = buildRecordFingerprint(server);
      if (state.edit.baseFingerprint && current !== state.edit.baseFingerprint) {
        throw Error(
          "Data ini sudah berubah di server sejak dimuat. Muat ulang data untuk menghindari menimpa perubahan terbaru.",
        );
      }
      return true;
    });
  }
  function createFingerprint(e) {
    return [
      e.operatorId || "",
      e.jenisOperator || "",
      e.namaOperator || "",
      buildPeriodKey(e),
      $("bulan").value || "",
      $("tahun").value || "",
      $("tanggalPengesahan").value || "",
      $("kategori").value || "",
      $("riskCatalog").value || "",
      $("skenario").value.trim() || "",
      $("area").value.trim() || "",
      $("langkahSaatIni").value.trim() || "",
      $("kerentananSaatIni").value.trim() || "",
      $("ancaman").value || "",
      $("kerentanan").value || "",
      $("konsekuensi").value || "",
      $("perlakuan").value || "",
      $("prioritas").value || "",
      $("langkahTambahan").value.trim() || "",
      $("keterangan").value.trim() || "",
    ].join("|");
  }
  function validateForm(e, cat, sc, a, k, c) {
    var errors = [];
    var bulan = $("bulan") ? $("bulan").value : "";
    var tahun = $("tahun") ? Number($("tahun").value) : NaN;
    var nama = $("namaPengisi") ? $("namaPengisi").value.trim() : "";
    var jabatan = $("jabatanPengisi") ? $("jabatanPengisi").value.trim() : "";
    var tPengesahan = $("tanggalPengesahan") ? $("tanggalPengesahan").value : "";
    var perlakuan = $("perlakuan") ? $("perlakuan").value : "";
    var prioritas = $("prioritas") ? $("prioritas").value : "";
    var riskOwner = $("riskOwner") ? $("riskOwner").value.trim() : "";
    var tKaji = $("tanggalKaji") ? $("tanggalKaji").value : "";
    var email = $("emailRiskOwner") ? $("emailRiskOwner").value.trim() : "";
    var link = $("linkDprk") ? $("linkDprk").value.trim() : "";
    var catalogId = $("riskCatalog") ? $("riskCatalog").value : "";
    if (!e) errors.push("Identitas entitas/operator belum dipilih atau diisi.");
    if (!state.type) errors.push("Jenis operator belum dipilih.");
    if (
      state.edit &&
      state.edit.originalOperatorId &&
      e &&
      String(e.operatorId || "") !== String(state.edit.originalOperatorId)
    )
      errors.push(
        "Identitas operator pada mode edit tidak boleh berubah. Buat pengisian baru bila risiko akan dipindahkan ke operator lain.",
      );
    if (
      state.edit &&
      state.edit.originalJenisOperator &&
      e &&
      String(e.jenisOperator || "") !== String(state.edit.originalJenisOperator)
    )
      errors.push(
        "Jenis operator pada mode edit tidak boleh berubah. Buat pengisian baru untuk jenis operator lain.",
      );
    if (!bulan) errors.push("Bulan penilaian wajib dipilih.");
    if (!Number.isInteger(tahun) || tahun < 2024 || tahun > 2040)
      errors.push("Tahun penilaian harus antara 2024–2040.");
    if (!nama) errors.push("Nama pengisi wajib diisi.");
    if (!jabatan) errors.push("Jabatan pengisi wajib diisi.");
    if (!tPengesahan) errors.push("Tanggal pengesahan wajib diisi.");
    if (!cat) errors.push("Kategori ancaman wajib dipilih.");
    if (!sc) errors.push("Skenario ancaman/metode serangan wajib diisi.");
    [a, k, c].forEach(function (v, i) {
      var label = ["Ancaman", "Kerentanan", "Konsekuensi"][i];
      if (!Number.isInteger(v) || v < 1 || v > 10) errors.push(label + " harus bernilai 1–10.");
    });
    if (!perlakuan) errors.push("Perlakuan risiko wajib dipilih.");
    if (!prioritas) errors.push("Prioritas penanganan wajib dipilih.");
    if (!riskOwner) errors.push("Pemilik risiko (Risk Owner) wajib diisi.");
    if (!tKaji) errors.push("Tanggal kaji ulang wajib diisi.");
    if (tPengesahan && tKaji && new Date(tKaji + "T00:00:00") < new Date(tPengesahan + "T00:00:00"))
      errors.push("Tanggal kaji ulang tidak boleh lebih awal daripada tanggal pengesahan.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errors.push("Format email pemilik risiko tidak valid.");
    if (link) {
      try {
        var u = new URL(link);
        if (!/^https?:$/.test(u.protocol)) throw Error();
      } catch (err) {
        errors.push("Link file DPRK harus berupa URL http/https yang valid.");
      }
    }
    if (catalogId && catalogId !== "__MANUAL__" && !isSelectedCatalogScenarioAllowed())
      errors.push("Skenario katalog tidak konsisten dengan kategori yang dipilih.");
    return errors;
  }
  function showValidationErrors(errors) {
    var box = $("formNotice");
    if (!box) return;
    if (!errors.length) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML =
      '<div class="notice"><b>Periksa data sebelum disimpan:</b><ul class="validation-list">' +
      errors
        .map(function (x) {
          return "<li>" + esc(x) + "</li>";
        })
        .join("") +
      "</ul></div>";
  }
  function save() {
    if ($("website") && $("website").value) {
      return;
    }
    var e = readEntity(),
      cat = $("kategori").value,
      sc = $("skenario").value.trim(),
      a = Number($("ancaman").value),
      k = Number($("kerentanan").value),
      c = Number($("konsekuensi").value),
      r = rating(a + k + c);
    var validationErrors = validateForm(e, cat, sc, a, k, c);
    if (validationErrors.length) {
      showValidationErrors(validationErrors);
      return;
    }
    showValidationErrors([]);
    var fingerprint = createFingerprint(e);
    var wasEdit = !!state.edit;
    var bulan = $("bulan").value,
      tahun = $("tahun").value;
    $("saveBtn").disabled = true;
    $("saveBtn").textContent = "Memeriksa data...";
    var preflight = (wasEdit ? checkEditFreshness() : Promise.resolve(true))
      .then(function () {
        return ensureRecentRisks();
      })
      .then(function () {
        var dup = findDuplicateRisk(e, cat, sc, bulan, tahun, wasEdit ? state.edit.id : "");
        if (dup) {
          throw Error(
            "Skenario yang sama sudah tersimpan untuk operator dan periode ini (" +
              (dup.riskId || "referensi tidak tersedia") +
              "). Gunakan Edit pada data tersebut atau isi skenario yang berbeda.",
          );
        }
        if (!state.edit) {
          if (!state.pendingCreateId || state.pendingCreateFingerprint !== fingerprint) {
            state.pendingCreateId = "risk-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
            state.pendingCreateToken = token();
            state.pendingCreateFingerprint = fingerprint;
          }
        }
        var p = {
          action: wasEdit ? "update" : "create",
          id: wasEdit ? state.edit.id : state.pendingCreateId,
          editToken: wasEdit ? state.edit.editToken : state.pendingCreateToken,
          dprkEditToken: getDprkToken(e.operatorId, tahun),
          operatorId: e.operatorId,
          jenisOperator: e.jenisOperator,
          namaOperator: e.namaOperator,
          kodeOperator: e.kodeOperator,
          iata: e.iata,
          provinsi: e.provinsi || ($("entityProv") ? $("entityProv").value : ""),
          kabkota: e.kabkota || ($("entityKab") ? $("entityKab").value : ""),
          lokasi: e.lokasi,
          kelas: e.kelas,
          bulan: bulan,
          tahun: tahun,
          periodKey: buildPeriodKey(e),
          duplicateKey: buildDuplicateKey(e, cat, sc, bulan, tahun),
          namaPengisi: $("namaPengisi").value.trim(),
          jabatanPengisi: $("jabatanPengisi").value.trim(),
          riskOwner: $("riskOwner").value.trim(),
          emailRiskOwner: $("emailRiskOwner").value.trim(),
          tanggalPengesahan: $("tanggalPengesahan").value,
          tanggalKaji: $("tanggalKaji").value,
          linkFileDprk: $("linkDprk").value.trim(),
          kategori: cat,
          idRisikoKatalog: $("riskCatalog").value,
          skenario: sc,
          area: $("area").value.trim(),
          langkahSaatIni: $("langkahSaatIni").value.trim(),
          kerentananSaatIni: $("kerentananSaatIni").value.trim(),
          ancamanNilai: a,
          kerentananNilai: k,
          konsekuensiNilai: c,
          risikoNilai: a + k + c,
          risikoRating: r.l,
          perlakuan: $("perlakuan").value,
          prioritas: $("prioritas").value,
          langkahTambahan: $("langkahTambahan").value.trim(),
          keterangan: $("keterangan").value.trim(),
          savedAt: new Date().toISOString(),
        };
        $("saveBtn").textContent = wasEdit ? "Memperbarui..." : "Menyimpan...";
        $("formNotice").innerHTML = "";
        return post(p).then(function (res) {
          if (!res.ok) {
            if (res.code === "FORBIDDEN")
              throw Error(
                (res.error || "Akses ditolak.") + " Periksa kembali API Key operator pada field di atas.",
              );
            throw Error(res.error || "Gagal menyimpan");
          }
          if (res.dprkEditToken) setDprkToken(p.operatorId, p.tahun, res.dprkEditToken);
          saveLocalHistory(p, wasEdit ? "update" : "create", res.dprkEditToken || "");
          if (!wasEdit) {
            state.pendingCreateId = null;
            state.pendingCreateToken = null;
            state.pendingCreateFingerprint = null;
          }
          state.edit = null;
          var dprkTok = getDprkToken(p.operatorId, p.tahun);
          var dprkLine = dprkTok
            ? "<br>Kode Edit DPRK entitas ini (simpan untuk memperbarui email/link/tanggal kaji di lain waktu): <code>" +
              esc(p.operatorId + "|" + p.tahun + "::" + dprkTok) +
              "</code>"
            : "";
          $("refBox").style.display = "block";
          $("refBox").innerHTML =
            "<b>" +
            (wasEdit
              ? "Berhasil diperbarui."
              : res.duplicate
                ? "Request sudah tersimpan sebelumnya."
                : "Berhasil disimpan.") +
            "</b> Kode referensi skenario: <code>" +
            esc(p.id + "::" + p.editToken) +
            "</code>" +
            dprkLine;
          clearScenario();
          $("editRef").value = "";
          $("editNotice").innerHTML = "";
          loadDashboard();
          loadRisks();
        });
      })
      .catch(function (err) {
        $("formNotice").innerHTML = '<div class="notice">Gagal: ' + esc(err.message) + "</div>";
      })
      .finally(function () {
        $("saveBtn").disabled = false;
        $("saveBtn").textContent = "Simpan Skenario";
      });
  }

  function loadEdit() {
    var ref = $("editRef").value.trim();
    if (!ref) {
      $("editNotice").innerHTML = '<div class="notice">Masukkan kode referensi terlebih dahulu.</div>';
      return;
    }
    var parts = ref.split("::");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      $("editNotice").innerHTML =
        '<div class="notice">Format kode tidak valid. Gunakan riskId::editToken.</div>';
      return;
    }
    $("loadEditBtn").disabled = true;
    $("loadEditBtn").textContent = "Memuat...";
    get("find&id=" + encodeURIComponent(parts[0]) + "&token=" + encodeURIComponent(parts[1]))
      .then(function (res) {
        if (!res.ok) throw Error(res.error || "Data tidak ditemukan");
        var x = res.data || {};
        state.edit = {
          id: x.riskId,
          editToken: parts[1],
          originalOperatorId: x.operatorId || "",
          originalJenisOperator: x.jenisOperator || "",
          baseFingerprint: buildRecordFingerprint(x),
        };
        state.type = x.jenisOperator || "";
        state.entity = null;
        renderTypes();
        renderEntityArea();
        if (state.type === "Bandar Udara") {
          var found = airportList()
            .concat(AIRPORTS)
            .filter(function (a) {
              return "BD-" + a[0] === x.operatorId || a[1] === x.namaOperator || a[3] === x.iata;
            })[0];
          if (found) {
            found.operatorId = x.operatorId || "BD-" + found[0];
            state.entity = found;
            renderEntityArea();
          }
        } else {
          state.entity = {
            operatorId: x.operatorId || "",
            jenisOperator: state.type,
            nama: x.namaOperator || "",
            kode: x.kodeOperator || "",
            provinsi: x.provinsi || "",
            kabkota: x.kabkota || "",
            lokasi: x.lokasi || "",
          };
          renderEntityArea();
        }
        $("bulan").value = x.bulan || "";
        $("tahun").value = x.tahun || "";
        $("tanggalPengesahan").value = (x.tanggalPengesahan || "").toString().slice(0, 10);
        $("namaPengisi").value = x.namaPengisi || "";
        $("jabatanPengisi").value = x.jabatanPengisi || "";
        $("emailRiskOwner").value = x.emailRiskOwner || "";
        $("linkDprk").value = x.linkFileDprk || x.linkDprk || "";
        $("kategori").value = x.kategori || x.kategoriKode || "";
        filterCatalog();
        $("riskCatalog").value = x.idRisikoKatalog || "";
        if ($("riskCatalog").value !== x.idRisikoKatalog) $("riskCatalog").value = "__MANUAL__";
        $("skenario").value = x.skenario || "";
        $("area").value = x.area || "";
        $("langkahSaatIni").value = x.langkahSaatIni || "";
        $("kerentananSaatIni").value = x.kerentananSaatIni || "";
        $("ancaman").value = x.ancamanNilai || "";
        $("kerentanan").value = x.kerentananNilai || "";
        $("konsekuensi").value = x.konsekuensiNilai || "";
        $("perlakuan").value = x.perlakuan || "";
        $("prioritas").value = x.prioritas || "";
        $("riskOwner").value = x.pemilikRisiko || "";
        $("tanggalKaji").value = x.tanggalKaji || "";
        $("langkahTambahan").value = x.langkahTambahan || "";
        $("keterangan").value = x.keterangan || "";
        updateRisk();
        $("saveBtn").textContent = "Perbarui Skenario";
        $("refBox").style.display = "block";
        $("refBox").innerHTML =
          "<b>Mode edit aktif.</b> Risiko <code>" +
          esc(x.riskId) +
          "</code> siap diperbarui." +
          (x.bulan || x.tahun
            ? ' <span class="local-note">Periode: ' + esc((x.bulan || "") + " " + (x.tahun || "")) + "</span>"
            : "");
        $("editNotice").innerHTML =
          '<div class="notice ok">Data berhasil dimuat. Klik <b>Perbarui Skenario</b> setelah selesai.</div>';
        window.scrollTo({ top: 0, behavior: "smooth" });
      })
      .catch(function (err) {
        $("editNotice").innerHTML = '<div class="notice">Gagal memuat: ' + esc(err.message) + "</div>";
      })
      .finally(function () {
        $("loadEditBtn").disabled = false;
        $("loadEditBtn").textContent = "Muat Data untuk Edit";
      });
  }
  function loadDprkToken() {
    var ref = $("dprkRef").value.trim();
    if (!ref) {
      $("dprkTokenNotice").innerHTML = '<div class="notice">Masukkan kode DPRK terlebih dahulu.</div>';
      return;
    }
    var sep = ref.split("::");
    if (sep.length !== 2 || !sep[0] || !sep[1]) {
      $("dprkTokenNotice").innerHTML =
        '<div class="notice">Format kode tidak valid. Gunakan operatorId|tahun::TOKEN.</div>';
      return;
    }
    var idPart = sep[0].split("|"),
      tok = sep[1];
    if (idPart.length !== 2 || !idPart[0] || !idPart[1]) {
      $("dprkTokenNotice").innerHTML =
        '<div class="notice">Format kode tidak valid. Gunakan operatorId|tahun::TOKEN.</div>';
      return;
    }
    var operatorId = idPart[0],
      tahun = idPart[1];
    $("loadDprkTokenBtn").disabled = true;
    $("loadDprkTokenBtn").textContent = "Memeriksa...";
    get(
      "finddprk&operatorId=" +
        encodeURIComponent(operatorId) +
        "&tahun=" +
        encodeURIComponent(tahun) +
        "&dprkToken=" +
        encodeURIComponent(tok),
    )
      .then(function (res) {
        if (!res.ok) throw Error(res.error || "Kode DPRK tidak valid");
        var x = res.data || {};
        setDprkToken(operatorId, tahun, tok);
        $("dprkTokenNotice").innerHTML =
          '<div class="notice ok">Kode DPRK tersimpan untuk <b>' +
          esc(x.namaOperator || operatorId) +
          "</b> tahun " +
          esc(tahun) +
          ". Perangkat ini sekarang dapat memperbarui email pemilik risiko, link file, dan tanggal kaji ulang entitas tersebut saat mengisi ulang formulir.</div>";
        $("dprkRef").value = "";
      })
      .catch(function (err) {
        $("dprkTokenNotice").innerHTML = '<div class="notice">Gagal: ' + esc(err.message) + "</div>";
      })
      .finally(function () {
        $("loadDprkTokenBtn").disabled = false;
        $("loadDprkTokenBtn").textContent = "Simpan Kode DPRK";
      });
  }
  function loadDashboard() {
    get("dashboard")
      .then(function (res) {
        if (!res.ok) throw Error(res.error);
        state.data = res.data || {};
        renderDashboard();
        renderTrends();
      })
      .catch(function (e) {
        $("opcards").innerHTML =
          '<div class="notice">Dashboard belum dapat memuat data: ' + esc(e.message) + "</div>";
      });
  }
  function renderDashboard() {
    var d = state.data || {},
      k = d.kpi || {};
    $("k-total").textContent = k.totalEntities || 0;
    $("k-filled").textContent = k.filledEntities || 0;
    $("k-empty").textContent = k.unfilledEntities || 0;
    $("k-rate").textContent = (k.completionRate || 0) + "%";
    $("k-high").textContent = k.highRisk || 0;
    $("k-review").textContent = k.reviewDue || 0;
    ["k-total", "k-filled", "k-empty", "k-rate", "k-high", "k-review"].forEach(function (id) {
      $(id).classList.remove("is-loading");
    });
    if ($("attentionHigh")) $("attentionHigh").textContent = k.highRisk || 0;
    if ($("attentionReview")) $("attentionReview").textContent = k.reviewDue || 0;
    if ($("attentionFilled")) $("attentionFilled").textContent = k.filledEntities || 0;
    if ($("dashboardUpdated"))
      $("dashboardUpdated").textContent =
        "Data diperbarui " +
        new Date().toLocaleString("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

    $("opcards").innerHTML = (d.byType || [])
      .map(function (x) {
        return (
          '<div class="opcard dashboard-selectable" data-dashboard-type="' +
          esc(x.jenisOperator) +
          '" role="button" tabindex="0" title="Tampilkan Risk Snapshot dan Threat Landscape untuk ' +
          esc(x.jenisOperator) +
          '">' +
          "<b>" +
          esc(x.jenisOperator) +
          "</b>" +
          '<div class="opcard-num">' +
          (x.filled || 0) +
          "</div>" +
          '<div class="opmeta"><span>Sudah Mengisi</span><span>' +
          x.risk +
          " risiko tinggi</span></div>" +
          "</div>"
        );
      })
      .join("");

    var selected = $("dashboardOperatorFilter") ? $("dashboardOperatorFilter").value : "";
    renderDashboardRiskAnalytics(selected);
    bindDashboardOperatorFilter();
  }
  function bindDashboardOperatorFilter() {
    var sel = $("dashboardOperatorFilter");
    if (sel && !sel.dataset.bound) {
      sel.dataset.bound = "1";
      sel.addEventListener("change", function () {
        renderDashboardRiskAnalytics(
          this.value,
          $("dashboardProvinceFilter").value,
          $("dashboardKabkotaFilter").value,
        );
      });
    }
    $("opcards")
      .querySelectorAll(".dashboard-selectable")
      .forEach(function (card) {
        if (card.dataset.bound === "1") return;
        card.dataset.bound = "1";
        function choose() {
          var type = card.getAttribute("data-dashboard-type") || "";
          if ($("dashboardOperatorFilter")) $("dashboardOperatorFilter").value = type;
          renderDashboardRiskAnalytics(
            type,
            $("dashboardProvinceFilter").value,
            $("dashboardKabkotaFilter").value,
          );
        }
        card.addEventListener("click", choose);
        card.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            choose();
          }
        });
      });
  }
  function enrichRiskLocations() {
    var risks = state.risks || [],
      ops = state.operators || [];
    risks.forEach(function (r) {
      if (String(r.provinsi || "").trim() && String(r.kabkota || "").trim()) return;
      var name = String(r.namaOperator || "")
        .trim()
        .toLowerCase();
      var rid = String(r.operatorId || r.kodeOperator || "").trim();
      var op = ops.filter(function (o) {
        return (
          (rid && String(o.operatorId || o.kodeOperator || "").trim() === rid) ||
          (name &&
            String(o.namaOperator || "")
              .trim()
              .toLowerCase() === name)
        );
      })[0];
      if (op) {
        r.provinsi = r.provinsi || op.provinsi || "";
        r.kabkota = r.kabkota || op.kabkota || "";
      }
    });
  }
  function initDashboardLocationFilters() {
    var p = $("dashboardProvinceFilter"),
      k = $("dashboardKabkotaFilter");
    if (!p) return;
    enrichRiskLocations();
    var risks = state.risks || [],
      source = risks.length ? risks : state.operators || [];
    var vals = [];
    source.forEach(function (x) {
      var v = String(x.provinsi || "").trim();
      if (v && vals.indexOf(v) < 0) vals.push(v);
    });
    vals.sort(function (a, b) {
      return a.localeCompare(b, "id");
    });
    var cur = p.value;
    p.innerHTML =
      '<option value="">Semua Provinsi</option>' +
      vals
        .map(function (v) {
          return '<option value="' + esc(v) + '">' + esc(v) + "</option>";
        })
        .join("");
    p.value = vals.indexOf(cur) >= 0 ? cur : "";
    if (k) {
      var list = p.value
          ? source.filter(function (x) {
              return String(x.provinsi || "").trim() === p.value;
            })
          : source,
        ks = [];
      list.forEach(function (x) {
        var v = String(x.kabkota || "").trim();
        if (v && ks.indexOf(v) < 0) ks.push(v);
      });
      ks.sort(function (a, b) {
        return a.localeCompare(b, "id");
      });
      var ck = k.value;
      k.innerHTML =
        '<option value="">Semua Kabupaten/Kota</option>' +
        ks
          .map(function (v) {
            return '<option value="' + esc(v) + '">' + esc(v) + "</option>";
          })
          .join("");
      k.value = ks.indexOf(ck) >= 0 ? ck : "";
    }
  }
  function bindDashboardLocationFilters() {
    var p = $("dashboardProvinceFilter"),
      k = $("dashboardKabkotaFilter");
    if (p && !p.dataset.bound) {
      p.dataset.bound = "1";
      p.addEventListener("change", function () {
        initDashboardLocationFilters();
        renderDashboardRiskAnalytics(
          $("dashboardOperatorFilter") ? $("dashboardOperatorFilter").value : "",
          p.value,
          k ? k.value : "",
        );
      });
    }
    if (k && !k.dataset.bound) {
      k.dataset.bound = "1";
      k.addEventListener("change", function () {
        renderDashboardRiskAnalytics(
          $("dashboardOperatorFilter") ? $("dashboardOperatorFilter").value : "",
          p ? p.value : "",
          k.value,
        );
      });
    }
  }
  function renderDashboardRiskAnalytics(selectedType, selectedProv, selectedKab) {
    var all = state.risks || [];
    var filtered = all.filter(function (x) {
      return (
        (!selectedType || String(x.jenisOperator || "") === selectedType) &&
        (!selectedProv || String(x.provinsi || "").trim() === selectedProv) &&
        (!selectedKab || String(x.kabkota || "").trim() === selectedKab)
      );
    });
    initDashboardLocationFilters();
    bindDashboardLocationFilters();
    var riskColors = {
      Tinggi: "#CF4A42",
      "Menengah-Tinggi": "#DD8A42",
      Menengah: "#E0B341",
      "Menengah-Rendah": "#8FB86A",
      Rendah: "#5B9E5E",
    };
    var dist = {};
    RATING.forEach(function (x) {
      dist[x] = 0;
    });
    filtered.forEach(function (x) {
      var r = String(x.risikoRating || rating(Number(x.risikoNilai)) || "").trim();
      if (dist.hasOwnProperty(r)) dist[r]++;
    });
    var total = filtered.length;
    var operatorSet = {};
    filtered.forEach(function (x) {
      var op = String(x.namaOperator || x.operatorId || "").trim();
      if (op) operatorSet[op] = true;
    });
    var operatorCount = Object.keys(operatorSet).length;
    if (!selectedType && !all.length) {
      var d = state.data || {},
        k = d.kpi || {};
      dist = d.riskDistribution || {};
      total = k.totalRisks || 0;
    }
    if ($("riskDonutTotal")) $("riskDonutTotal").textContent = total;
    if ($("riskDonutOperators")) $("riskDonutOperators").textContent = String(operatorCount);
    if ($("riskTotalBadge")) $("riskTotalBadge").textContent = total + " RISIKO";

    var riskRows = RATING.map(function (x) {
      return { x: x, n: Number(dist[x] || 0), col: riskColors[x] };
    }).filter(function (x) {
      return x.n > 0;
    });
    var GAP = riskRows.length > 1 ? 2.2 : 0,
      start = 0,
      stops = [];
    riskRows.forEach(function (r, i) {
      var deg = total ? (r.n / total) * (360 - GAP * riskRows.length) : 0;
      stops.push(r.col + " " + start + "deg " + (start + deg) + "deg");
      start += deg;
      if (GAP && i < riskRows.length - 1) {
        stops.push("#fff " + start + "deg " + (start + GAP) + "deg");
        start += GAP;
      }
    });
    if ($("riskDonut"))
      $("riskDonut").style.background = stops.length
        ? "conic-gradient(" + stops.join(",") + ")"
        : "conic-gradient(#dce5ec 0deg 360deg)";
    if ($("riskLegend"))
      $("riskLegend").innerHTML = RATING.map(function (x) {
        var n = Number(dist[x] || 0),
          pct = total ? Math.round((n / total) * 100) : 0;
        return (
          '<div class="risk-legend-item" style="--dot:' +
          riskColors[x] +
          '"><span class="risk-legend-name">' +
          x +
          '</span><span class="risk-legend-value">' +
          n +
          ' <span class="risk-legend-pct">(' +
          pct +
          "%)</span></span></div>"
        );
      }).join("");
    if ($("riskDominant")) {
      var top = riskRows.slice().sort(function (a, b) {
        return b.n - a.n;
      })[0];
      $("riskDominant").innerHTML = top
        ? 'Didominasi risiko <b style="color:' +
          top.col +
          '">' +
          esc(top.x) +
          "</b> — " +
          top.n +
          " dari " +
          total +
          " risiko (" +
          Math.round((top.n / total) * 100) +
          "%)"
        : "Belum ada data risiko untuk ditampilkan.";
    }

    var cats = {};
    filtered.forEach(function (x) {
      var code = String(x.kategoriKode || "").trim();
      var val = Number(x.risikoNilai);
      if (code && isFinite(val)) {
        if (!cats[code]) cats[code] = { sum: 0, n: 0 };
        cats[code].sum += val;
        cats[code].n++;
      }
    });
    var catList;
    if (selectedType) {
      catList = Object.keys(cats).map(function (code) {
        return { kode: code, avg: cats[code].n ? cats[code].sum / cats[code].n : 0 };
      });
    } else if (all.length) {
      catList = Object.keys(cats).map(function (code) {
        return { kode: code, avg: cats[code].n ? cats[code].sum / cats[code].n : 0 };
      });
    } else {
      catList = (state.data.categories || []).slice();
    }
    catList.sort(function (a, b) {
      return Number(b.avg || 0) - Number(a.avg || 0);
    });

    $("catbarsList").innerHTML =
      catList
        .map(function (x) {
          var avg = Number(x.avg || 0),
            band = rating(Math.round(avg)),
            color = band ? band.c : "#8fa5b8",
            name = KATEGORI_NAME[x.kode] || x.kode;
          return (
            '<div class="threat-item" title="' +
            esc(x.kode + " — " + name) +
            '"><div class="threat-item-top"><span class="threat-code">' +
            esc(x.kode) +
            '</span><span class="threat-name">' +
            esc(name) +
            '</span><b class="threat-value" style="color:' +
            color +
            '">' +
            avg.toFixed(1) +
            '</b></div><div class="bar"><i style="width:' +
            Math.min(100, (avg / 30) * 100) +
            "%;background:" +
            color +
            '"></i></div></div>'
          );
        })
        .join("") || '<div class="empty">Belum ada data kategori untuk operator ini.</div>';

    var scope = [];
    if (selectedType) scope.push(selectedType);
    if (selectedProv) scope.push(selectedProv);
    if (selectedKab) scope.push(selectedKab);
    var hint = scope.length
      ? "Menampilkan kondisi risiko dan ancaman untuk " + scope.join(" • ") + "."
      : "Menampilkan kondisi risiko seluruh operator.";
    if ($("dashboardLocationHint"))
      $("dashboardLocationHint").textContent = scope.length
        ? "Menampilkan kondisi risiko untuk " + scope.join(" • ") + "."
        : "Menampilkan kondisi risiko seluruh provinsi dan kabupaten/kota.";
    if ($("dashboardFilterHint")) $("dashboardFilterHint").textContent = hint;
    document.querySelectorAll("#opcards .dashboard-selectable").forEach(function (card) {
      card.classList.toggle("selected", card.getAttribute("data-dashboard-type") === selectedType);
    });
    var riskTitle = document.querySelector("#view-dashboard .risk-snapshot-card h2");
    var threatTitle = document.querySelector("#view-dashboard .threat-landscape-card h2");
    if (riskTitle)
      riskTitle.textContent = scope.length
        ? "Kondisi Risiko — " + scope.join(" • ")
        : "Kondisi Risiko Nasional";
    if (threatTitle)
      threatTitle.textContent = scope.length
        ? "19 Kategori Ancaman — " + scope.join(" • ")
        : "19 Kategori Ancaman";
    var riskSub = document.querySelector("#view-dashboard .risk-snapshot-card .sub");
    var threatSub = document.querySelector("#view-dashboard .threat-landscape-card .sub");
    if (riskSub)
      riskSub.textContent = "Menampilkan " + operatorCount + " operator dengan " + total + " total risiko.";
    if (threatSub)
      threatSub.textContent = selectedType
        ? "Rata-rata nilai risiko 19 kategori untuk operator yang dipilih."
        : "Rata-rata nilai risiko dari skenario yang telah diisi, diurutkan dari yang tertinggi.";
  }
  function loadOperators() {
    get("operators")
      .then(function (res) {
        if (!res.ok) throw Error(res.error);
        state.operators = res.data || [];
        fillOpFilters();
        renderOperatorTable();
      })
      .catch(function (e) {
        $("opTbody").innerHTML = '<tr><td colspan="6">' + esc(e.message) + "</td></tr>";
      });
  }
  function fillOpFilters() {
    $("opFilterType").innerHTML =
      '<option value="">Semua Jenis Operator</option>' +
      TYPES.map(function (x) {
        return "<option>" + x[0] + "</option>";
      }).join("");
    $("opFilterProv").innerHTML =
      '<option value="">Semua Provinsi</option>' +
      PROVINSI.map(function (x) {
        return "<option>" + x + "</option>";
      }).join("");
  }
  function renderOperatorTable() {
    var a = state.operators || [],
      t = $("opFilterType").value,
      p = $("opFilterProv").value,
      q = $("opSearch").value.toLowerCase();
    a = a.filter(function (x) {
      return (
        (!t || x.jenisOperator === t) &&
        (!p || x.provinsi === p) &&
        (!q || (x.namaOperator || "").toLowerCase().indexOf(q) > -1)
      );
    });
    var filled = a.filter(function (x) {
      return /sudah/i.test(x.statusDprk || "");
    }).length;
    $("opCount").textContent = a.length;
    $("opFilled").textContent = filled;
    $("opUnfilled").textContent = a.length - filled;
    $("opFilterState").textContent = t || p || q ? "Aktif" : "Semua";
    $("opTbody").innerHTML =
      a
        .map(function (x) {
          var st = x.statusDprk || "Belum Mengisi",
            isFilled = /sudah/i.test(st);
          return (
            "<tr><td>" +
            esc(x.jenisOperator) +
            '</td><td><button type="button" class="op-link" data-op-id="' +
            esc(x.operatorId) +
            '" title="Lihat rekap operator">' +
            esc(x.namaOperator) +
            "</button><br><small>" +
            esc(x.kodeOperator || "") +
            "</small></td><td>" +
            esc((x.provinsi || "") + " " + (x.kabkota || "")) +
            '</td><td class="status-cell"><span class="pill-status ' +
            (isFilled ? "filled" : "unfilled") +
            '">' +
            esc(st) +
            "</span></td><td>" +
            esc(x.jumlahSkenario || 0) +
            "</td><td>" +
            esc(x.tanggalKaji || "-") +
            "</td></tr>"
          );
        })
        .join("") ||
      '<tr><td colspan="6" class="empty empty-row">Tidak ada data yang sesuai dengan filter.</td></tr>';
  }
  function loadRisks() {
    get("risks")
      .then(function (res) {
        if (!res.ok) throw Error(res.error);
        state.risks = res.data || [];
        state.risksLoadedAt = Date.now();
        document.dispatchEvent(new CustomEvent("sirisk:risks"));
        enrichRiskLocations();
        initDashboardLocationFilters();
        renderRiskTable();
        renderDashboardRiskAnalytics(
          $("dashboardOperatorFilter").value,
          $("dashboardProvinceFilter").value,
          $("dashboardKabkotaFilter").value,
        );
      })
      .catch(function (e) {
        $("riskTbody").innerHTML = '<tr><td colspan="6">' + esc(e.message) + "</td></tr>";
      });
  }
  function renderRiskTable() {
    var a = state.risks || [],
      t = $("riskType").value,
      r = $("riskRating").value,
      c = $("riskCategory").value,
      q = $("riskSearch").value.toLowerCase();
    a = a.filter(function (x) {
      return (
        (!t || x.jenisOperator === t) &&
        (!r || x.risikoRating === r) &&
        (!c || x.kategoriKode === c) &&
        (!q || ((x.namaOperator || "") + " " + (x.kategori || "")).toLowerCase().indexOf(q) > -1)
      );
    });
    var nums = a
        .map(function (x) {
          return Number(x.risikoNilai);
        })
        .filter(function (n) {
          return isFinite(n);
        }),
      avg = nums.length
        ? nums.reduce(function (s, n) {
            return s + n;
          }, 0) / nums.length
        : 0,
      high = a.filter(function (x) {
        return Number(x.risikoNilai) >= 25;
      }).length;
    $("riskCount").textContent = a.length;
    $("riskHighCount").textContent = high;
    $("riskAvgCount").textContent = nums.length ? avg.toFixed(1) : "—";
    $("riskFilterState").textContent = t || r || c || q ? "Aktif" : "Semua";
    $("riskTbody").innerHTML =
      a
        .map(function (x) {
          return (
            "<tr><td>" +
            esc(x.jenisOperator) +
            "</td><td><b>" +
            esc(x.namaOperator) +
            '</b></td><td class="risk-cat">' +
            esc(x.kategori) +
            '</td><td class="risk-number">' +
            esc(x.risikoNilai) +
            "</td><td>" +
            pill(rating(Number(x.risikoNilai))) +
            '</td><td class="risk-period">' +
            esc((x.bulan || "") + " " + (x.tahun || "")) +
            "</td></tr>"
          );
        })
        .join("") ||
      '<tr><td colspan="6" class="empty empty-row">Tidak ada data yang sesuai dengan filter.</td></tr>';
  }
  function renderTrends() {
    var d = state.data || {},
      t = d.trend || {},
      labels = t.labels || [],
      filled = t.filled || [],
      risk = t.risk || [];
    draw("fillChart2", labels, filled, "Completion");
    draw("riskChart2", labels, risk, "Rata-rata Risiko");
    $("trendPeriods").textContent = labels.length;
    $("trendLatestFilled").textContent = filled.length ? filled[filled.length - 1] : "—";
    $("trendLatestRisk").textContent = risk.length ? Number(risk[risk.length - 1]).toFixed(1) : "—";
    var rv = d.review || [];
    $("reviewTbody").innerHTML =
      rv
        .map(function (x) {
          return (
            "<tr><td>" +
            esc(x.jenisOperator) +
            "</td><td><b>" +
            esc(x.namaOperator) +
            "</b></td><td>" +
            esc(x.tanggalKaji) +
            "</td><td>" +
            esc(x.status) +
            "</td></tr>"
          );
        })
        .join("") ||
      '<tr><td colspan="4" class="empty empty-row">Tidak ada kaji ulang yang mendekat.</td></tr>';
  }
  function draw(id, labels, vals, title) {
    var c = $(id),
      ctx = c.getContext("2d"),
      w = c.clientWidth || 700,
      h = 300;
    c.width = w * 2;
    c.height = h * 2;
    ctx.scale(2, 2);
    ctx.clearRect(0, 0, w, h);
    ctx.font = "11px Inter, Arial";
    ctx.fillStyle = "#0f2a45";
    ctx.font = "700 11px Inter, Arial";
    ctx.fillText(title, 15, 16);
    if (!vals.length) {
      ctx.fillStyle = "#607080";
      ctx.font = "12px Inter, Arial";
      ctx.fillText("Belum ada data untuk periode ini", 20, h / 2);
      return;
    }
    var max = Math.max.apply(null, vals.concat([1])),
      pad = 40,
      plotW = w - pad - 20,
      plotH = h - 70,
      baseY = h - 40;
    ctx.strokeStyle = "#edf1f5";
    ctx.lineWidth = 1;
    ctx.font = "10px Inter, Arial";
    ctx.fillStyle = "#8a97a3";
    for (var g = 0; g <= 3; g++) {
      var gy = 25 + g * (plotH / 3);
      ctx.beginPath();
      ctx.moveTo(pad, gy);
      ctx.lineTo(w - 15, gy);
      ctx.stroke();
      ctx.fillText(Math.round(max - (max * g) / 3), 4, gy + 3);
    }
    ctx.strokeStyle = "#dfe6ee";
    ctx.beginPath();
    ctx.moveTo(pad, 25);
    ctx.lineTo(pad, baseY);
    ctx.lineTo(w - 15, baseY);
    ctx.stroke();
    function px(i) {
      return pad + (i * plotW) / Math.max(1, vals.length - 1);
    }
    function py(v) {
      return 25 + plotH - (v / max) * plotH;
    }
    ctx.beginPath();
    vals.forEach(function (v, i) {
      var x = px(i),
        y = py(v);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.lineTo(px(vals.length - 1), baseY);
    ctx.lineTo(px(0), baseY);
    ctx.closePath();
    var grad = ctx.createLinearGradient(0, 25, 0, baseY);
    grad.addColorStop(0, "rgba(44,110,158,.16)");
    grad.addColorStop(1, "rgba(44,110,158,0)");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "#2c6e9e";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    vals.forEach(function (v, i) {
      var x = px(i),
        y = py(v);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = "#182632";
    ctx.font = "11px Inter, Arial";
    vals.forEach(function (v, i) {
      var x = px(i),
        y = py(v);
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = "#2c6e9e";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.fillStyle = "#607080";
      ctx.font = "10px Inter, Arial";
      if (i === 0 || i === vals.length - 1 || vals.length <= 6) ctx.fillText(labels[i] || "", x - 12, h - 20);
    });
    ctx.fillStyle = "#0f2a45";
    ctx.font = "700 11px Inter, Arial";
    ctx.fillText(String(vals[vals.length - 1]), px(vals.length - 1) - 8, py(vals[vals.length - 1]) - 8);
  }
  // ===== Data referensi statis (data/*.json) =====
  function loadStaticData() {
    function j(u) {
      return fetch(u, { cache: "no-cache" }).then(function (r) {
        if (!r.ok) throw Error(u + " HTTP " + r.status);
        return r.json();
      });
    }
    return Promise.all([
      j("data/katalog-risiko.json"),
      j("data/bandara-cadangan.json").catch(function (e) {
        console.warn("Bandara cadangan tidak dimuat:", e);
        return { bandara: [] };
      }),
    ]).then(function (r) {
      KATEGORI = r[0].kategori || [];
      CATALOG = r[0].skenario || [];
      AIRPORTS = r[1].bandara || [];
      KATEGORI.forEach(function (x) {
        KATEGORI_NAME[x[0]] = x[1];
      });
    });
  }
  // API bersama untuk modul lain (mis. assets/js/pelaporan.js).
  window.SIRISK = {
    GAS_URL: GAS_URL,
    get: get,
    post: post,
    esc: esc,
    provinsi: PROVINSI,
    operators: function () {
      return (state.operators || []).filter(isActiveOp);
    },
    // Semua operator termasuk Nonaktif (tabel Monitoring Operator menampilkan semuanya).
    allOperators: function () {
      return state.operators || [];
    },
    operatorsLoaded: function () {
      return !!state.operatorsLoaded;
    },
    kategori: function () {
      return KATEGORI;
    },
    risks: function () {
      return state.risks || [];
    },
    risksLoaded: function () {
      return !!state.risksLoadedAt;
    },
    rating: rating,
    ratings: RATING,
  };
  loadStaticData()
    .then(init)
    .catch(function (e) {
      console.error(e);
      document.body.insertAdjacentHTML(
        "afterbegin",
        '<div class="notice" style="margin:12px">Gagal memuat data referensi (katalog risiko). Periksa koneksi lalu muat ulang halaman.</div>',
      );
    });
})();
