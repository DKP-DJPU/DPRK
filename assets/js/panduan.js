/* SI-RISK AVSEC — Tab Panduan (P4)
 * Isi panduan ditulis di data/panduan.md (Markdown sederhana) dan kontak di data/kontak.json,
 * sehingga bisa diubah lewat GitHub tanpa menyentuh kode.
 *
 * Markdown yang didukung (HTML mentah TIDAK dijalankan — semua teks di-escape):
 *   ## Judul bab            → bab baru (muncul di daftar isi)
 *   ### Sub judul           → sub judul; di bab "Pertanyaan Umum (FAQ)" menjadi pertanyaan buka-tutup
 *   paragraf, **tebal**, *miring*, `kode`, [tautan](https://...)
 *   - butir / 1. langkah
 *   > catatan               → kotak catatan;  "> !" → kotak peringatan
 *   | tabel | sederhana |
 *   ![keterangan](assets/panduan/gambar.png)
 *   !video[Judul video](https://youtu.be/ID)  atau tautan Google Drive (file/d/ID)
 */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function slug(s) {
    return (
      String(s)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "bab"
    );
  }
  // Hanya http(s), mailto, tel, jangkar, atau jalur relatif di dalam situs.
  function safeUrl(u) {
    u = String(u || "").trim();
    if (/^(https:\/\/|http:\/\/|mailto:|tel:|#)/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u) || /^\/\//.test(u)) return null; // javascript:, data:, //host
    if (/^[\w./-]+(\?[\w=&.-]*)?(#[\w-]*)?$/.test(u)) return u;
    return null;
  }
  function safeImg(u) {
    u = String(u || "").trim();
    if (/^https:\/\//i.test(u)) return u;
    if (/^assets\/panduan\/[\w./-]+\.(png|jpe?g|webp|gif|svg)$/i.test(u) && u.indexOf("..") < 0) return u;
    return null;
  }
  function parseVideo(u) {
    u = String(u || "").trim();
    var m =
      /^https:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:.*&)?v=([\w-]{6,20})/.exec(u) ||
      /^https:\/\/youtu\.be\/([\w-]{6,20})/.exec(u) ||
      /^https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/(?:embed|shorts|live)\/([\w-]{6,20})/.exec(u);
    if (m) return { kind: "youtube", id: m[1] };
    m = /^https:\/\/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]{10,80})/.exec(u);
    if (m) return { kind: "drive", id: m[1] };
    return null;
  }
  function videoSrc(v) {
    return v.kind === "youtube"
      ? "https://www.youtube-nocookie.com/embed/" + v.id + "?autoplay=1&rel=0"
      : "https://drive.google.com/file/d/" + v.id + "/preview";
  }

  // Inline: escape dulu, lalu pola aman. Tautan dikerjakan sebelum tebal/miring.
  function inline(s) {
    var out = "",
      re = /\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`/g,
      last = 0,
      m;
    while ((m = re.exec(s))) {
      out += emph(esc(s.slice(last, m.index)));
      if (m[3] != null) out += "<code>" + esc(m[3]) + "</code>";
      else {
        var href = safeUrl(m[2]);
        var ext = href && /^https?:/i.test(href);
        out += href
          ? '<a href="' + esc(href) + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : "") + ">" + emph(esc(m[1])) + "</a>"
          : emph(esc(m[1]));
      }
      last = re.lastIndex;
    }
    return out + emph(esc(s.slice(last)));
  }
  function emph(h) {
    return h.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>");
  }
  function plain(s) {
    return String(s)
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*`>#|]/g, " ");
  }

  function cells(line) {
    return line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map(function (c) {
        return c.trim();
      });
  }

  // Ubah satu bab (baris-baris) menjadi HTML.
  function block(lines, faq) {
    var html = "",
      i = 0,
      para = [],
      faqOpen = false;
    function flush() {
      if (para.length) html += "<p>" + inline(para.join(" ")) + "</p>";
      para = [];
    }
    while (i < lines.length) {
      var l = lines[i],
        t = l.trim(),
        m;
      if (!t || /^-{3,}$/.test(t)) {
        flush();
        i++;
        continue;
      }
      if ((m = /^###\s+(.+)$/.exec(t))) {
        flush();
        if (faq) {
          if (faqOpen) html += "</div></details>";
          html += '<details class="pdn-faq"><summary>' + inline(m[1]) + '</summary><div class="pdn-faq-body">';
          faqOpen = true;
        } else html += '<h3 id="' + "pdn-" + slug(m[1]) + '">' + inline(m[1]) + "</h3>";
        i++;
        continue;
      }
      if ((m = /^!video\[([^\]]*)\]\(([^)\s]+)\)$/.exec(t))) {
        flush();
        var v = parseVideo(m[2]);
        html += v
          ? '<figure class="pdn-video"><button type="button" class="pdn-video-btn" data-src="' +
            esc(videoSrc(v)) +
            '" data-title="' +
            esc(m[1] || "Video panduan") +
            '"' +
            (v.kind === "youtube" ? ' style="background-image:url(\'https://i.ytimg.com/vi/' + v.id + "/hqdefault.jpg')\"" : "") +
            '><span class="pdn-play" aria-hidden="true">▶</span><span class="pdn-video-label">Putar video: ' +
            esc(m[1] || "Video panduan") +
            "</span></button>" +
            (m[1] ? "<figcaption>" + inline(m[1]) + "</figcaption>" : "") +
            "</figure>"
          : '<p class="pdn-warn-inline">Video tidak dapat ditampilkan (hanya YouTube atau Google Drive).</p>';
        i++;
        continue;
      }
      if ((m = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(t))) {
        flush();
        var src = safeImg(m[2]);
        if (src)
          html +=
            '<figure class="pdn-fig"><a href="' +
            esc(src) +
            '" target="_blank" rel="noopener"><img src="' +
            esc(src) +
            '" alt="' +
            esc(m[1]) +
            '" loading="lazy" decoding="async"></a>' +
            (m[1] ? "<figcaption>" + inline(m[1]) + "</figcaption>" : "") +
            "</figure>";
        i++;
        continue;
      }
      if (/^>/.test(t)) {
        flush();
        var q = [];
        while (i < lines.length && /^>/.test(lines[i].trim())) q.push(lines[i++].trim().replace(/^>\s?/, ""));
        var warn = /^!\s*/.test(q[0] || "");
        if (warn) q[0] = q[0].replace(/^!\s*/, "");
        html += '<div class="pdn-note' + (warn ? " pdn-warn" : "") + '">' + block(q, false) + "</div>";
        continue;
      }
      if (/^\|/.test(t) && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1].trim())) {
        flush();
        var head = cells(t);
        i += 2;
        var body = "";
        while (i < lines.length && /^\|/.test(lines[i].trim())) {
          body +=
            "<tr>" +
            cells(lines[i++])
              .map(function (c) {
                return "<td>" + inline(c) + "</td>";
              })
              .join("") +
            "</tr>";
        }
        html +=
          '<div class="pdn-table"><table><thead><tr>' +
          head
            .map(function (c) {
              return "<th>" + inline(c) + "</th>";
            })
            .join("") +
          "</tr></thead><tbody>" +
          body +
          "</tbody></table></div>";
        continue;
      }
      if (/^([-*]|\d+[.)])\s+/.test(t)) {
        flush();
        var ordered = /^\d/.test(t),
          items = [];
        while (i < lines.length) {
          var x = lines[i].trim();
          if (ordered ? /^\d+[.)]\s+/.test(x) : /^[-*]\s+/.test(x)) items.push(x.replace(/^([-*]|\d+[.)])\s+/, ""));
          else if (x && /^\s{2,}/.test(lines[i]) && items.length) items[items.length - 1] += " " + x;
          else break;
          i++;
        }
        var tag = ordered ? "ol" : "ul";
        html +=
          "<" +
          tag +
          ">" +
          items
            .map(function (it) {
              return "<li>" + inline(it) + "</li>";
            })
            .join("") +
          "</" +
          tag +
          ">";
        continue;
      }
      para.push(t);
      i++;
    }
    flush();
    if (faqOpen) html += "</div></details>";
    return html;
  }

  // Markdown → daftar bab {id, title, html, text}. Teks sebelum bab pertama menjadi pengantar.
  function render(md) {
    var lines = String(md || "")
        .replace(/\r\n?/g, "\n")
        .replace(/<!--[\s\S]*?-->/g, "") // catatan penyunting tidak ditampilkan
        .split("\n"),
      sections = [],
      cur = { id: "pengantar", title: "", lines: [] },
      seen = {};
    lines.forEach(function (l) {
      var m = /^##\s+(.+)$/.exec(l.trim());
      if (m && !/^###/.test(l.trim())) {
        sections.push(cur);
        var id = slug(m[1]);
        while (seen[id]) id += "-2";
        seen[id] = 1;
        cur = { id: id, title: m[1].trim(), lines: [] };
      } else if (!/^#\s/.test(l.trim())) cur.lines.push(l);
    });
    sections.push(cur);
    return sections
      .filter(function (s) {
        return s.title || s.lines.join("").trim();
      })
      .map(function (s) {
        var faq = /faq|pertanyaan/i.test(s.title);
        return {
          id: s.id,
          title: s.title,
          faq: faq,
          html: block(s.lines, faq),
          text: (s.title + " " + plain(s.lines.join(" "))).toLowerCase(),
        };
      });
  }

  // data/kontak.json → kartu kontak. Kosong → null (bagian Kontak tidak ditampilkan).
  function renderKontak(data) {
    var list = ((data && data.kontak) || []).filter(function (k) {
      return k && (k.nama || k.unit) && (k.email || k.telepon || k.whatsapp);
    });
    if (!list.length) return null;
    var h = list
      .map(function (k) {
        var rows = [];
        if (k.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k.email))
          rows.push('<a class="pdn-k-row" href="mailto:' + esc(k.email) + '"><span>Email</span><b>' + esc(k.email) + "</b></a>");
        var tel = String(k.telepon || "").replace(/[^\d+]/g, "");
        if (tel.length >= 6) rows.push('<a class="pdn-k-row" href="tel:' + esc(tel) + '"><span>Telepon</span><b>' + esc(k.telepon) + "</b></a>");
        var wa = String(k.whatsapp || "")
          .replace(/\D/g, "")
          .replace(/^0/, "62");
        if (wa.length >= 9)
          rows.push(
            '<a class="pdn-k-row" href="https://wa.me/' +
              wa +
              '" target="_blank" rel="noopener noreferrer"><span>WhatsApp</span><b>' +
              esc(k.whatsapp) +
              "</b></a>",
          );
        return (
          '<div class="pdn-kontak-card"><div class="pdn-k-unit">' +
          esc(k.unit || "") +
          "</div>" +
          (k.nama ? '<div class="pdn-k-nama">' + esc(k.nama) + "</div>" : "") +
          (k.layanan ? '<div class="pdn-k-layanan">' + esc(k.layanan) + "</div>" : "") +
          rows.join("") +
          (k.jam ? '<div class="pdn-k-jam">' + esc(k.jam) + "</div>" : "") +
          "</div>"
        );
      })
      .join("");
    return {
      id: "kontak",
      title: "Kontak",
      faq: false,
      html:
        "<p>Hubungi kami bila ada kendala yang tidak terjawab di panduan ini.</p>" +
        (data.catatan ? '<div class="pdn-note">' + block([String(data.catatan)], false) + "</div>" : "") +
        '<div class="pdn-kontak">' +
        h +
        "</div>",
      text: ("kontak hubungi " + JSON.stringify(list)).toLowerCase(),
    };
  }

  var api = { render: render, renderKontak: renderKontak, safeUrl: safeUrl, parseVideo: parseVideo, slug: slug };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window === "undefined" || typeof document === "undefined") return;
  window.SIRISK_PANDUAN = api;

  // ===================== Tampilan =====================
  var VER = "20261020a",
    st = { loaded: false, loading: null, sections: [], pending: null };
  function $(id) {
    return document.getElementById(id);
  }
  function load() {
    if (st.loading) return st.loading;
    var get = function (u, json) {
      return fetch(u + "?v=" + VER, { cache: "no-cache" }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return json ? r.json() : r.text();
      });
    };
    st.loading = Promise.all([
      get("data/panduan.md"),
      get("data/kontak.json", true).catch(function () {
        return null;
      }),
    ])
      .then(function (res) {
        st.sections = render(res[0]);
        var k = renderKontak(res[1]);
        if (k) st.sections.push(k);
        st.loaded = true;
        draw();
      })
      .catch(function () {
        st.loading = null;
        $("pdnContent").innerHTML =
          '<div class="notice">Panduan gagal dimuat. Periksa koneksi lalu <button type="button" class="auth-link" id="pdnRetry">coba lagi</button>.</div>';
        $("pdnRetry").onclick = load;
      });
    return st.loading;
  }
  function draw() {
    var secs = st.sections;
    $("pdnToc").innerHTML = secs
      .filter(function (s) {
        return s.title;
      })
      .map(function (s) {
        return '<a href="#panduan/' + s.id + '" data-pdn="' + s.id + '">' + esc(s.title) + "</a>";
      })
      .join("");
    $("pdnContent").innerHTML =
      secs
        .map(function (s) {
          return (
            '<section class="card pdn-sec' +
            (s.faq ? " pdn-sec-faq" : "") +
            '" id="pdn-' +
            s.id +
            '" data-pdn-sec="' +
            s.id +
            '">' +
            (s.title ? "<h2>" + esc(s.title) + "</h2>" : "") +
            s.html +
            "</section>"
          );
        })
        .join("") + '<div class="notice pdn-empty" id="pdnEmpty" hidden></div>';
    filter($("pdnSearch").value);
    if (st.pending) {
      var p = st.pending;
      st.pending = null;
      go(p);
    }
  }
  function filter(q) {
    q = String(q || "")
      .toLowerCase()
      .trim();
    var words = q.split(/\s+/).filter(Boolean),
      shown = 0;
    st.sections.forEach(function (s) {
      var el = $("pdn-" + s.id);
      if (!el) return;
      var ok = words.every(function (w) {
        return s.text.indexOf(w) >= 0;
      });
      el.hidden = !ok;
      if (ok) shown++;
      // di FAQ: buka pertanyaan yang cocok, sembunyikan yang tidak
      if (s.faq) {
        var ds = Array.prototype.slice.call(el.querySelectorAll("details")),
          hits = ds.map(function (d) {
            var tx = d.textContent.toLowerCase();
            return words.every(function (w) {
              return tx.indexOf(w) >= 0;
            });
          }),
          any = hits.indexOf(true) >= 0;
        ds.forEach(function (d, i) {
          d.hidden = words.length > 0 && any && !hits[i]; // bila tak ada yang cocok (mis. cari "faq"), tampilkan semua
          d.open = words.length > 0 && hits[i];
        });
      }
      var a = document.querySelector('#pdnToc a[data-pdn="' + s.id + '"]');
      if (a) a.classList.toggle("pdn-dim", !ok);
    });
    var e = $("pdnEmpty");
    if (e) {
      e.hidden = shown > 0;
      e.innerHTML =
        "Tidak ada bagian panduan yang memuat <b>" +
        esc(q) +
        "</b>." +
        (st.sections.some(function (s) {
          return s.id === "kontak";
        })
          ? ' Silakan <a href="#panduan/kontak" data-pdn-clear>hubungi kami</a>.'
          : "");
    }
  }
  function go(id) {
    if (!st.loaded) {
      st.pending = id;
      return;
    }
    var el = $("pdn-" + id);
    if (!el) return;
    if (el.hidden) {
      $("pdnSearch").value = "";
      filter("");
    }
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    Array.prototype.forEach.call(document.querySelectorAll("#pdnToc a"), function (a) {
      a.classList.toggle("active", a.getAttribute("data-pdn") === id);
    });
    // Gambar di bab sebelumnya yang baru termuat menggeser posisi bab tujuan → sejajarkan ulang,
    // kecuali pengguna sudah menggulir sendiri.
    var token = (st.goToken = (st.goToken || 0) + 1),
      moved = false,
      mark = function () {
        moved = true;
      },
      evs = ["wheel", "touchstart", "keydown"];
    evs.forEach(function (n) {
      window.addEventListener(n, mark, { once: true, passive: true });
    });
    var before = Array.prototype.filter.call(document.querySelectorAll("#pdnContent img"), function (img) {
      return !img.complete && img.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING;
    });
    before.forEach(function (img) {
      img.loading = "eager";
      img.addEventListener(
        "load",
        function () {
          if (!moved && token === st.goToken) el.scrollIntoView({ block: "start" });
        },
        { once: true },
      );
    });
    setTimeout(function () {
      evs.forEach(function (n) {
        window.removeEventListener(n, mark);
      });
    }, 5000);
  }
  function tabButton() {
    return document.querySelector('.nav button[data-view="panduan"]');
  }
  // Aktifkan tab sendiri (handler tab di app.js baru terpasang setelah katalog dimuat).
  function openTab(id) {
    var b = tabButton(),
      v = $("view-panduan");
    if (b && v && !b.classList.contains("active")) {
      Array.prototype.forEach.call(document.querySelectorAll(".nav button"), function (x) {
        x.classList.toggle("active", x === b);
        x.setAttribute("aria-selected", x === b ? "true" : "false");
      });
      Array.prototype.forEach.call(document.querySelectorAll(".view"), function (x) {
        x.classList.toggle("active", x === v);
      });
    }
    load();
    if (id) go(id);
  }
  function fromHash() {
    var m = /^#panduan(?:\/([\w-]+))?$/.exec(location.hash);
    if (m) openTab(m[1] || "");
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t.closest) return;
    if (t.closest('.nav button[data-view="panduan"]')) {
      load();
      return;
    }
    var a = t.closest("a[data-pdn], a[data-pdn-clear], #pdnContent a[href^='#panduan/']");
    if (a) {
      e.preventDefault();
      var id = (a.getAttribute("href") || "").replace(/^#panduan\/?/, "");
      history.replaceState(null, "", "#panduan/" + id);
      go(id);
      return;
    }
    var link = t.closest("a[href^='#panduan']");
    if (link && !link.closest("#view-panduan")) {
      e.preventDefault();
      history.replaceState(null, "", link.getAttribute("href"));
      fromHash();
      return;
    }
    var v = t.closest(".pdn-video-btn");
    if (v) {
      var f = document.createElement("iframe");
      f.src = v.getAttribute("data-src");
      f.title = v.getAttribute("data-title") || "Video panduan";
      f.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture; fullscreen");
      f.setAttribute("allowfullscreen", "");
      f.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      f.className = "pdn-iframe";
      v.replaceWith(f);
    }
  });
  function init() {
    var s = $("pdnSearch");
    if (!s) return;
    var tm;
    s.addEventListener("input", function () {
      clearTimeout(tm);
      tm = setTimeout(function () {
        filter(s.value);
      }, 120);
    });
    window.addEventListener("hashchange", fromHash);
    if (/^#panduan/.test(location.hash)) setTimeout(fromHash, 0);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
