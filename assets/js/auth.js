/* ============================================================
   SI-RISK AVSEC — Login (kode OTP lewat email)
   Dimuat setelah app.js. Menyediakan window.SIRISK_AUTH:
     token(), user(), enforce(), scopeIds(), open(step), logout(), expired()
   Sesi disimpan di localStorage (bila "ingat perangkat") atau
   sessionStorage (hilang saat browser ditutup). Server tetap penentu akhir:
   token diperiksa ulang di setiap simpan DPRK.
   ============================================================ */
(function () {
  var S = window.SIRISK;
  if (!S) return;
  var esc = S.esc;
  var KEY = "sirisk_session_v1";
  var st = {
    token: null,
    user: null,
    enforce: false,
    checked: false,
    step: "email",
    email: "",
    resendAt: 0,
    timer: null,
    pick: null,
    lastFocus: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  /* ---------- penyimpanan sesi ---------- */
  function readStored() {
    var raw = null;
    try {
      raw = localStorage.getItem(KEY) || sessionStorage.getItem(KEY);
    } catch (e) {}
    if (!raw) return null;
    try {
      var o = JSON.parse(raw);
      if (
        !o ||
        !o.token ||
        (o.expiresAt && Date.parse(o.expiresAt) < Date.now())
      )
        return null;
      return o;
    } catch (e) {
      return null;
    }
  }
  function store(o, remember) {
    try {
      localStorage.removeItem(KEY);
      sessionStorage.removeItem(KEY);
      if (o)
        (remember ? localStorage : sessionStorage).setItem(
          KEY,
          JSON.stringify(o),
        );
    } catch (e) {}
  }
  function setSession(token, user, enforce) {
    st.token = token || null;
    st.user = user || null;
    if (typeof enforce === "boolean") st.enforce = enforce;
    renderBar();
    renderGate();
    if (S.applyAuthScope) S.applyAuthScope();
    document.dispatchEvent(
      new CustomEvent("sirisk:auth", { detail: { user: st.user } }),
    );
  }

  /* ---------- API ---------- */
  function call(p) {
    return S.post(p).then(function (res) {
      return res || { ok: false, error: "Tidak ada respons dari server." };
    });
  }

  function init() {
    var saved = readStored();
    S.get("authConfig")
      .then(function (res) {
        if (res && res.ok && res.data) st.enforce = !!res.data.enforce;
      })
      .catch(function () {})
      .then(function () {
        if (!saved) return null;
        st.token = saved.token;
        return call({ action: "authMe", sessionToken: saved.token }).then(
          function (res) {
            if (res.ok) return res.data.user;
            store(null);
            return null;
          },
        );
      })
      .catch(function () {
        return null;
      })
      .then(function (user) {
        st.checked = true;
        setSession(user ? st.token : null, user, st.enforce);
      });
  }

  /* ---------- Bilah akun di header ---------- */
  function initials(n) {
    return (
      String(n || "?")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(function (w) {
          return w.charAt(0).toUpperCase();
        })
        .join("") || "?"
    );
  }
  function renderBar() {
    var b = $("authBar");
    if (!b) return;
    if (!st.user) {
      b.innerHTML =
        '<button type="button" class="auth-login-btn" id="authOpenBtn">Masuk</button>';
      $("authOpenBtn").onclick = function () {
        open("email");
      };
      return;
    }
    b.innerHTML =
      '<button type="button" class="auth-chip" id="authAccountBtn" aria-label="Akun: ' +
      esc(st.user.nama) +
      '"><span class="auth-avatar" aria-hidden="true">' +
      esc(initials(st.user.nama)) +
      '</span><span class="auth-chip-text"><b>' +
      esc(st.user.nama) +
      "</b><small>" +
      esc(st.user.peran === "Admin" ? "Admin DKP" : scopeLabel()) +
      "</small></span></button>";
    $("authAccountBtn").onclick = function () {
      open("account");
    };
  }
  function scopeLabel() {
    var ops = (st.user && st.user.operators) || [];
    if (!ops.length) return "Operator";
    return ops.length === 1 ? ops[0].namaOperator : ops.length + " entitas";
  }

  /* ---------- Gerbang tab Pengisian DPRK ---------- */
  function renderGate() {
    var g = $("authGate"),
      view = $("view-form");
    if (!g || !view) return;
    var locked = st.checked && st.enforce && !st.user;
    view.classList.toggle("auth-locked", !!locked);
    if (!st.checked) {
      g.innerHTML = "";
      return;
    }
    if (locked) {
      g.innerHTML =
        '<div class="card auth-gate-card"><div class="auth-lock-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z"/></svg></div>' +
        "<h2>Pengisian DPRK memerlukan login</h2>" +
        '<p class="sub">Masuk dengan email yang terdaftar untuk mengisi atau memperbarui DPRK. Operator hanya dapat mengisi DPRK milik entitasnya sendiri.</p>' +
        '<div class="auth-gate-actions"><button type="button" class="btn primary" data-auth-open="email">Masuk</button><button type="button" class="btn secondary" data-auth-open="register">Daftar sebagai perwakilan operator</button></div></div>';
      return;
    }
    if (st.user) {
      var ops = st.user.operators || [];
      g.innerHTML =
        '<div class="notice ok auth-gate-banner">Masuk sebagai <b>' +
        esc(st.user.nama) +
        "</b> (" +
        esc(st.user.email) +
        "). " +
        (st.user.peran === "Admin"
          ? "Sebagai Admin, Anda dapat mengisi DPRK untuk semua operator."
          : ops.length
            ? "Anda dapat mengisi DPRK untuk: <b>" +
              ops
                .map(function (o) {
                  return esc(o.namaOperator);
                })
                .join(", ") +
              "</b>."
            : "Akun Anda belum dikaitkan dengan operator mana pun — hubungi admin.") +
        "</div>";
      return;
    }
    g.innerHTML =
      '<div class="notice auth-gate-banner">Anda belum masuk. <button type="button" class="auth-link" data-auth-open="email">Masuk</button> agar DPRK tersimpan atas nama akun Anda dan dapat diperbarui tanpa kode DPRK.</div>';
  }

  /* ---------- Modal ---------- */
  function ensureModal() {
    if ($("authModal")) return;
    var m = document.createElement("div");
    m.id = "authModal";
    m.className = "auth-modal";
    m.hidden = true;
    m.innerHTML =
      '<div class="auth-backdrop" data-auth-close></div><div class="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="authTitle"><button type="button" class="auth-x" data-auth-close aria-label="Tutup">×</button><div id="authBody"></div></div>';
    document.body.appendChild(m);
    m.addEventListener("click", function (e) {
      if (e.target.hasAttribute("data-auth-close")) close();
    });
    m.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
      if (e.key === "Tab") trapFocus(e);
    });
  }
  function trapFocus(e) {
    var f = Array.prototype.filter.call(
      $("authModal").querySelectorAll("button,input,select,textarea,a[href]"),
      function (el) {
        return !el.disabled && el.offsetParent !== null;
      },
    );
    if (!f.length) return;
    var first = f[0],
      last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
      first.focus();
      e.preventDefault();
    }
  }
  function open(step, opts) {
    ensureModal();
    if ($("authModal").hidden) st.lastFocus = document.activeElement;
    $("authModal").hidden = false;
    document.body.classList.add("auth-open");
    render(step || (st.user ? "account" : "email"), opts);
  }
  function close() {
    if (!$("authModal")) return;
    $("authModal").hidden = true;
    document.body.classList.remove("auth-open");
    clearInterval(st.timer);
    if (st.lastFocus && st.lastFocus.focus) st.lastFocus.focus();
    st.lastFocus = null;
  }
  function msg(html, kind) {
    var n = $("authMsg");
    if (n)
      n.innerHTML = html
        ? '<div class="notice' +
          (kind === "ok" ? " ok" : "") +
          '" role="alert">' +
          html +
          "</div>"
        : "";
  }
  function busy(btn, on, label) {
    if (!btn) return;
    btn.disabled = on;
    if (on) {
      btn.dataset.label = btn.textContent;
      btn.textContent = label || "Memproses...";
    } else if (btn.dataset.label) btn.textContent = btn.dataset.label;
  }

  function render(step, opts) {
    opts = opts || {};
    st.step = step;
    clearInterval(st.timer);
    var b = $("authBody"),
      h = "";
    if (step === "email") {
      h =
        '<h2 id="authTitle">Masuk ke SI-RISK AVSEC</h2><p class="sub">Masukkan email yang terdaftar. Kami akan mengirim <b>kode 6 digit</b> ke email tersebut — tidak perlu kata sandi.</p><div id="authMsg"></div>' +
        '<form id="authEmailForm" novalidate><div class="field"><label for="authEmail">Email</label><input id="authEmail" type="email" autocomplete="email" inputmode="email" required value="' +
        esc(st.email) +
        '"></div><button type="submit" class="btn primary auth-wide" id="authSendBtn">Kirim kode</button></form>' +
        '<p class="auth-foot">Belum punya akun? <button type="button" class="auth-link" data-auth-go="register">Daftar sebagai perwakilan operator</button></p>' +
        '<p class="auth-foot auth-muted">Masyarakat yang ingin melaporkan kejadian tidak perlu masuk — gunakan tab <b>Sistem Pelaporan</b>.</p>';
    } else if (step === "code") {
      h =
        '<h2 id="authTitle">Masukkan kode</h2><p class="sub">Kode 6 digit telah dikirim ke <b>' +
        esc(opts.sentTo || st.email) +
        '</b>. Periksa juga folder spam. Kode berlaku 10 menit.</p><div id="authMsg"></div>' +
        '<form id="authCodeForm" novalidate><div class="field"><label for="authCode">Kode dari email</label><input id="authCode" class="auth-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></div>' +
        '<label class="auth-check"><input type="checkbox" id="authRemember"><span>Ingat perangkat ini selama 30 hari <span class="auth-muted">(jangan dicentang di komputer umum)</span></span></label>' +
        '<button type="submit" class="btn primary auth-wide" id="authVerifyBtn">Masuk</button></form>' +
        '<p class="auth-foot"><button type="button" class="auth-link" id="authResend" disabled>Kirim ulang kode</button> · <button type="button" class="auth-link" data-auth-go="email">Ganti email</button></p>';
    } else if (step === "register") {
      h =
        '<h2 id="authTitle">Daftar sebagai perwakilan operator</h2><p class="sub">Untuk petugas Bandar Udara, Airlines, LPPNPI, atau Regulated Agent yang akan mengisi DPRK. Pendaftaran diperiksa oleh Direktorat Keamanan Penerbangan sebelum akun aktif.</p><div id="authMsg"></div>' +
        '<form id="authRegForm" novalidate><div class="auth-grid">' +
        '<div class="field"><label for="authRegNama">Nama lengkap</label><input id="authRegNama" autocomplete="name" maxlength="120" required></div>' +
        '<div class="field"><label for="authRegEmail">Email kantor</label><input id="authRegEmail" type="email" autocomplete="email" maxlength="120" required value="' +
        esc(st.email) +
        '"></div>' +
        '<div class="field"><label for="authRegJabatan">Jabatan</label><input id="authRegJabatan" maxlength="120" required placeholder="Contoh: Kepala Unit AVSEC"></div>' +
        '<div class="field"><label for="authRegHp">No. HP <span class="auth-muted">(opsional)</span></label><input id="authRegHp" type="tel" autocomplete="tel" maxlength="30"></div>' +
        '<div class="field auth-full"><label for="authRegOp">Operator yang Anda wakili</label><input id="authRegOp" autocomplete="off" placeholder="Ketik nama bandara, maskapai, cabang AirNav, atau RA..." role="combobox" aria-expanded="false" aria-controls="authRegOpList"><div id="authRegOpList" class="auth-results" role="listbox" hidden></div><div id="authRegOpSel"></div></div>' +
        '<div class="auth-hp" aria-hidden="true"><label>Website<input id="authRegWeb" tabindex="-1" autocomplete="off"></label></div>' +
        '</div><button type="submit" class="btn primary auth-wide" id="authRegBtn">Kirim pendaftaran</button></form>' +
        '<p class="auth-foot">Sudah punya akun? <button type="button" class="auth-link" data-auth-go="email">Masuk</button></p>';
    } else if (step === "registered") {
      h =
        '<h2 id="authTitle">Pendaftaran terkirim</h2><div class="notice ok">Terima kasih. Pendaftaran Anda sedang <b>menunggu persetujuan admin</b>. Anda akan menerima email ketika akun sudah aktif, lalu dapat masuk dengan email tersebut.</div><button type="button" class="btn secondary auth-wide" data-auth-close>Tutup</button>';
    } else if (step === "account") {
      var u = st.user || {};
      h =
        '<h2 id="authTitle">Akun Anda</h2><dl class="auth-dl"><dt>Nama</dt><dd>' +
        esc(u.nama) +
        "</dd><dt>Email</dt><dd>" +
        esc(u.email) +
        "</dd><dt>Peran</dt><dd>" +
        esc(
          u.peran === "Admin"
            ? "Admin DKP — semua operator"
            : "Perwakilan operator",
        ) +
        "</dd>" +
        (u.peran !== "Admin"
          ? "<dt>Entitas</dt><dd>" +
            ((u.operators || [])
              .map(function (o) {
                return (
                  esc(o.namaOperator) +
                  ' <span class="auth-muted">' +
                  esc(o.jenisOperator || "") +
                  "</span>"
                );
              })
              .join("<br>") || "—") +
            "</dd>"
          : "") +
        '</dl><button type="button" class="btn secondary auth-wide" id="authLogoutBtn">Keluar</button>';
    }
    b.innerHTML = h;
    Array.prototype.forEach.call(
      b.querySelectorAll("[data-auth-go]"),
      function (x) {
        x.onclick = function () {
          if ($("authEmail")) st.email = $("authEmail").value.trim();
          render(x.getAttribute("data-auth-go"));
        };
      },
    );
    bindStep(step);
    var f = b.querySelector("input:not([tabindex='-1']),button.btn");
    if (f)
      setTimeout(function () {
        f.focus();
      }, 30);
  }

  function explain(res) {
    var e = esc((res && res.error) || "Terjadi kesalahan. Coba lagi.");
    if (res && res.code === "NOT_REGISTERED")
      return (
        e +
        ' <button type="button" class="auth-link" data-auth-go-inline="register">Daftar sekarang</button>'
      );
    return e;
  }
  function bindInlineGo() {
    Array.prototype.forEach.call(
      document.querySelectorAll("[data-auth-go-inline]"),
      function (x) {
        x.onclick = function () {
          render(x.getAttribute("data-auth-go-inline"));
        };
      },
    );
  }

  function requestCode(email, btn, onDone) {
    busy(btn, true, "Mengirim...");
    return call({ action: "authRequestCode", email: email })
      .then(function (res) {
        if (!res.ok) {
          msg(explain(res), res.code === "PENDING" ? "ok" : "");
          bindInlineGo();
          return;
        }
        st.email = email;
        st.resendAt = Date.now() + 60000;
        onDone(res.data);
      })
      .catch(function (e) {
        msg("Gagal menghubungi server: " + esc(e.message));
      })
      .then(function () {
        busy(btn, false);
      });
  }

  function bindStep(step) {
    if (step === "email") {
      $("authEmailForm").onsubmit = function (e) {
        e.preventDefault();
        var v = $("authEmail").value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
          msg("Format email tidak valid.");
          $("authEmail").focus();
          return;
        }
        requestCode(v, $("authSendBtn"), function (d) {
          render("code", { sentTo: d.sentTo });
        });
      };
    }
    if (step === "code") {
      var tick = function () {
        var left = Math.ceil((st.resendAt - Date.now()) / 1000),
          r = $("authResend");
        if (!r) return clearInterval(st.timer);
        r.disabled = left > 0;
        r.textContent =
          left > 0 ? "Kirim ulang kode (" + left + " dtk)" : "Kirim ulang kode";
      };
      tick();
      st.timer = setInterval(tick, 1000);
      $("authResend").onclick = function () {
        requestCode(st.email, $("authResend"), function () {
          msg("Kode baru telah dikirim.", "ok");
          tick();
        });
      };
      $("authCode").oninput = function () {
        this.value = this.value.replace(/\D/g, "").slice(0, 6);
      };
      $("authCodeForm").onsubmit = function (e) {
        e.preventDefault();
        var code = $("authCode").value.trim(),
          remember = $("authRemember").checked;
        if (!/^\d{6}$/.test(code)) {
          msg("Masukkan 6 digit kode dari email.");
          $("authCode").focus();
          return;
        }
        var btn = $("authVerifyBtn");
        busy(btn, true, "Memeriksa...");
        call({
          action: "authVerify",
          email: st.email,
          code: code,
          remember: remember,
        })
          .then(function (res) {
            if (!res.ok) {
              msg(esc(res.error || "Kode tidak valid."));
              if (res.code === "CODE_EXPIRED" || res.code === "CODE_LOCKED") {
                st.resendAt = 0;
              }
              $("authCode").select();
              return;
            }
            store(
              { token: res.data.token, expiresAt: res.data.expiresAt },
              remember,
            );
            setSession(res.data.token, res.data.user, res.data.enforce);
            close();
          })
          .catch(function (e) {
            msg("Gagal menghubungi server: " + esc(e.message));
          })
          .then(function () {
            busy(btn, false);
          });
      };
    }
    if (step === "register") bindRegister();
    if (step === "account") {
      $("authLogoutBtn").onclick = function () {
        logout();
        close();
      };
    }
  }

  function bindRegister() {
    st.pick = null;
    var inp = $("authRegOp"),
      list = $("authRegOpList");
    function show(q) {
      q = q.toLowerCase().trim();
      var ops = (S.operators() || [])
        .filter(function (o) {
          return (
            !q ||
            (
              String(o.namaOperator || "") +
              " " +
              String(o.kodeOperator || "") +
              " " +
              String(o.iata || "") +
              " " +
              String(o.kabkota || "")
            )
              .toLowerCase()
              .indexOf(q) > -1
          );
        })
        .slice(0, 20);
      list.innerHTML =
        ops
          .map(function (o) {
            return (
              '<div class="auth-opt" role="option" tabindex="-1" data-oid="' +
              esc(o.operatorId) +
              '"><b>' +
              esc(o.namaOperator) +
              '</b> <span class="auth-muted">' +
              esc(o.jenisOperator) +
              (o.kabkota ? " • " + esc(o.kabkota) : "") +
              "</span></div>"
            );
          })
          .join("") ||
        '<div class="auth-opt auth-muted">' +
          (S.operatorsLoaded()
            ? "Tidak ditemukan di master operator."
            : "Memuat daftar operator...") +
          "</div>";
      list.hidden = false;
      inp.setAttribute("aria-expanded", "true");
    }
    inp.oninput = function () {
      show(this.value);
    };
    inp.onfocus = function () {
      if (!st.pick) show(this.value);
    };
    inp.onkeydown = function (e) {
      if (e.key === "ArrowDown") {
        var f = list.querySelector("[data-oid]");
        if (f) {
          f.focus();
          e.preventDefault();
        }
      }
    };
    list.onkeydown = function (e) {
      var el = e.target;
      if (e.key === "ArrowDown" && el.nextElementSibling) {
        el.nextElementSibling.focus();
        e.preventDefault();
      } else if (e.key === "ArrowUp") {
        (el.previousElementSibling || inp).focus();
        e.preventDefault();
      } else if (e.key === "Enter") {
        el.click();
        e.preventDefault();
      }
    };
    list.onclick = function (e) {
      var el = e.target.closest("[data-oid]");
      if (!el) return;
      var id = el.getAttribute("data-oid");
      st.pick = (S.operators() || []).filter(function (o) {
        return String(o.operatorId) === id;
      })[0];
      list.hidden = true;
      inp.setAttribute("aria-expanded", "false");
      inp.value = "";
      $("authRegOpSel").innerHTML = st.pick
        ? '<div class="notice ok auth-picked"><span><b>' +
          esc(st.pick.namaOperator) +
          "</b> • " +
          esc(st.pick.jenisOperator) +
          '</span><button type="button" class="auth-link" id="authRegOpClear">Ganti</button></div>'
        : "";
      if ($("authRegOpClear"))
        $("authRegOpClear").onclick = function () {
          st.pick = null;
          $("authRegOpSel").innerHTML = "";
          inp.focus();
        };
    };
    $("authRegForm").onsubmit = function (e) {
      e.preventDefault();
      var p = {
          action: "authRegister",
          nama: $("authRegNama").value.trim(),
          email: $("authRegEmail").value.trim().toLowerCase(),
          jabatan: $("authRegJabatan").value.trim(),
          noHp: $("authRegHp").value.trim(),
          operatorId: st.pick ? st.pick.operatorId : "",
          website: $("authRegWeb").value,
        },
        err = [];
      if (!p.nama) err.push(["authRegNama", "Nama lengkap wajib diisi."]);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p.email))
        err.push(["authRegEmail", "Format email tidak valid."]);
      if (!p.jabatan) err.push(["authRegJabatan", "Jabatan wajib diisi."]);
      if (!p.operatorId)
        err.push(["authRegOp", "Pilih operator yang Anda wakili dari daftar."]);
      if (err.length) {
        msg(
          '<ul class="validation-list">' +
            err
              .map(function (x) {
                return "<li>" + esc(x[1]) + "</li>";
              })
              .join("") +
            "</ul>",
        );
        $(err[0][0]).focus();
        return;
      }
      var btn = $("authRegBtn");
      busy(btn, true, "Mengirim...");
      call(p)
        .then(function (res) {
          if (!res.ok) {
            msg(
              esc(res.error || "Pendaftaran gagal."),
              res.code === "PENDING" ? "ok" : "",
            );
            return;
          }
          st.email = p.email;
          render("registered");
        })
        .catch(function (e) {
          msg("Gagal menghubungi server: " + esc(e.message));
        })
        .then(function () {
          busy(btn, false);
        });
    };
  }

  function logout() {
    var t = st.token;
    store(null);
    setSession(null, null);
    if (t)
      call({ action: "authLogout", sessionToken: t }).catch(function () {});
  }

  /** Dipanggil app.js bila server menjawab AUTH_REQUIRED. */
  function expired() {
    if (st.user) {
      store(null);
      setSession(null, null);
    }
    st.enforce = true;
    renderGate();
    open("email");
    setTimeout(function () {
      msg(
        "Sesi Anda berakhir atau belum masuk. Silakan masuk untuk menyimpan DPRK.",
      );
    }, 40);
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-auth-open]");
    if (t) open(t.getAttribute("data-auth-open"));
  });

  window.SIRISK_AUTH = {
    token: function () {
      return st.token;
    },
    user: function () {
      return st.user;
    },
    enforce: function () {
      return st.enforce;
    },
    /** Daftar operatorId yang boleh diisi; null = tidak dibatasi (Admin / belum masuk). */
    scopeIds: function () {
      if (!st.user || st.user.peran === "Admin") return null;
      return (st.user.operatorIds || []).map(String);
    },
    open: open,
    close: close,
    logout: logout,
    expired: expired,
  };

  init();
})();
