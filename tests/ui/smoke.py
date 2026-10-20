"""Uji UI (Playwright) SI-RISK AVSEC terhadap server tiruan dengan data sintetis.

Menjalankan sendiri: server statis (port 8350) + tests/ui/mock-server.js (port 8220).
    python3 tests/ui/smoke.py
Butuh: Node 18+, Python 3, `pip install playwright` + `python -m playwright install chromium`.
"""
import json, os, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.environ.get('UI_SHOTS', os.path.join(ROOT, 'tests', 'ui', 'screenshots'))
os.makedirs(OUT, exist_ok=True)
WEB, M = 8350, 8220
procs = [
    subprocess.Popen([sys.executable, '-m', 'http.server', str(WEB)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL),
    subprocess.Popen(['node', os.path.join(ROOT, 'tests', 'ui', 'mock-server.js')], env=dict(os.environ, PORT=str(M)), stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT),
]
def ctl(path): return json.loads(urllib.request.urlopen(f'http://localhost:{M}{path}').read())
for _ in range(50):
    try:
        ctl('/__ctl?a=log'); urllib.request.urlopen(f'http://localhost:{WEB}/'); break
    except Exception: time.sleep(0.2)

def route(r):
    u = r.request.url
    if 'script.google.com' in u:
        q = u.split('?', 1)[1] if '?' in u else ''
        return r.fulfill(response=r.fetch(url=f'http://localhost:{M}/?' + q, method=r.request.method, post_data=r.request.post_data))
    return r.continue_() if u.startswith('http://localhost') else r.abort()

ok = fail = 0
def T(n, c, info=''):
    global ok, fail
    ok += bool(c); fail += (not c)
    print(('LULUS ' if c else 'GAGAL ') + n + ('' if c else f'  → {str(info)[:300]}'), flush=True)
def page(b, w=1300, url=None):
    pg = b.new_page(viewport={'width': w, 'height': 900}); pg._errs = []
    pg.on('pageerror', lambda e: pg._errs.append(str(e))); pg.route('**/*', route)
    pg.goto(url or f'http://localhost:{WEB}/'); pg.wait_for_timeout(2800); return pg
def login(pg, email, remember=False):
    ctl('/__ctl?a=clearcache')
    pg.click('#authOpenBtn'); pg.wait_for_selector('#authEmail'); pg.fill('#authEmail', email); pg.click('#authSendBtn')
    pg.wait_for_selector('#authCode', timeout=8000); pg.fill('#authCode', ctl('/__mail?to=' + email)['code'])
    if remember: pg.check('#authRemember')
    pg.click('#authVerifyBtn'); pg.wait_for_timeout(1800)
def tab(pg, v): pg.click(f'button[data-view={v}]'); pg.wait_for_timeout(1200)
def fill_form(pg, skenario):
    pg.select_option('#bulan', 'September'); pg.fill('#namaPengisi', 'Budi Santoso'); pg.fill('#jabatanPengisi', 'Kepala AVSEC')
    pg.fill('#tanggalPengesahan', '2026-09-01'); pg.select_option('#kategori', '01'); pg.wait_for_timeout(200); pg.fill('#skenario', skenario)
    for f in ['ancaman', 'kerentanan', 'konsekuensi']: pg.fill('#' + f, '5'); pg.dispatch_event('#' + f, 'input')
    pg.select_option('#perlakuan', index=1); pg.select_option('#prioritas', index=1); pg.fill('#riskOwner', 'GM Bandara'); pg.fill('#tanggalKaji', '2026-12-01')

try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        dash = ctl('/?action=dashboard')['data']
        # ================= PUBLIK =================
        ctl('/__ctl?a=log')
        pg = page(b)
        T('publik: KPI dashboard (390 operator, 14 mengisi)', '390' in pg.inner_text('#k-total') and pg.inner_text('#k-filled') == '14')
        T('publik: donut nasional = agregat server', pg.inner_text('#riskDonutTotal') == str(dash['kpi']['totalRisks']), (pg.inner_text('#riskDonutTotal'), dash['kpi']['totalRisks']))
        T('publik: filter wilayah disembunyikan', not pg.is_visible('.dashboard-filter-location-bar'))
        pg.select_option('#dashboardOperatorFilter', 'Airlines'); pg.wait_for_timeout(400)
        T('publik: Airlines (1 operator) disembunyikan + alasan', 'minimal 2' in pg.inner_text('#riskDominant') and 'disembunyikan' in pg.inner_text('#catbarsList'), pg.inner_text('#riskDominant'))
        pg.select_option('#dashboardOperatorFilter', 'Bandar Udara'); pg.wait_for_timeout(400)
        T('publik: Bandar Udara ikut disembunyikan (supresi komplementer)', 'disembunyikan sementara' in pg.inner_text('#riskDominant'), pg.inner_text('#riskDominant'))
        pg.select_option('#dashboardOperatorFilter', '')
        tab(pg, 'operator')
        T('publik: Monitoring Operator terkunci', 'memerlukan login' in pg.inner_text('#view-operator') and not pg.is_visible('#opTbody'))
        tab(pg, 'risk')
        T('publik: Monitoring Risiko terkunci', 'memerlukan login' in pg.inner_text('#view-risk') and not pg.is_visible('#riskTbody'))
        tab(pg, 'trend')
        T('publik: Trend tampil, kaji ulang minta login', pg.is_visible('#fillChart2') and 'Terbatas' in pg.inner_text('#reviewTbody'))
        tab(pg, 'pelaporan'); pg.click('.plp-subtab[data-plp=list]'); pg.wait_for_timeout(1200)
        T('publik: daftar laporan hanya yang terverifikasi (3)', pg.locator('#plpTbody tr[data-id]').count() == 3, pg.locator('#plpTbody tr[data-id]').count())
        tab(pg, 'form')
        T('publik: Pengisian DPRK terbuka + ajakan masuk (login belum wajib)', pg.is_visible('#types') and 'Anda belum masuk' in pg.inner_text('#authGate'))
        reqs = ctl('/__ctl?a=log')
        T('publik: tidak ada permintaan data per operator', not any(x.split()[1] in ('risks', 'review', 'riskData', 'operatorStatus', 'reviewList') for x in reqs), reqs)
        T('publik: tidak ada error JS', not pg._errs, pg._errs)
        pg.screenshot(path=os.path.join(OUT, 'publik.png'))
        pg.close()
        pg = page(b, url=f'http://localhost:{WEB}/#operator=BD-007')
        T('publik: deep link #operator= tetap terkunci', not pg.is_visible('#opDetail') and 'memerlukan login' in pg.inner_text('#view-operator'))
        pg.close()

        # ================= ALUR LOGIN & PENDAFTARAN =================
        pg = page(b)
        pg.click('#authOpenBtn'); pg.wait_for_selector('#authEmail')
        pg.fill('#authEmail', 'orang@tidakada.com'); pg.click('#authSendBtn'); pg.wait_for_timeout(500)
        T('login: email belum terdaftar → tombol Daftar', 'belum terdaftar' in pg.inner_text('#authMsg') and pg.is_visible('[data-auth-go-inline=register]'))
        pg.fill('#authEmail', 'sari@garuda.co.id'); pg.click('#authSendBtn'); pg.wait_for_timeout(500)
        T('login: akun menunggu persetujuan → pesan jelas', 'menunggu persetujuan' in pg.inner_text('#authMsg'))
        pg.click('[data-auth-go=register]'); pg.wait_for_selector('#authRegForm'); pg.fill('#authRegEmail', ''); pg.click('#authRegBtn'); pg.wait_for_timeout(200)
        T('daftar: isian kosong → 4 kesalahan', pg.locator('#authMsg li').count() == 4, pg.inner_text('#authMsg'))
        pg.fill('#authRegNama', 'Rina Wijaya'); pg.fill('#authRegEmail', 'rina@airnav.co.id'); pg.fill('#authRegJabatan', 'Manager Keamanan')
        pg.fill('#authRegOp', 'surabaya'); pg.wait_for_timeout(200); pg.click('#authRegOpList [data-oid="LPP-011"]'); pg.click('#authRegBtn'); pg.wait_for_timeout(800)
        T('daftar: tersimpan status Menunggu', any(u['email'] == 'rina@airnav.co.id' and u['status'] == 'Menunggu' and u['operatorIds'] == 'LPP-011' for u in ctl('/__ctl?a=rows&sheet=USER_ACCESS')))
        pg.close()

        # ================= ADMIN =================
        pg = page(b)
        login(pg, 'admin@dkp.go.id')
        T('admin: header menampilkan akun', 'Admin' in pg.inner_text('#authBar'))
        T('admin: filter wilayah tampil', pg.is_visible('.dashboard-filter-location-bar'))
        tab(pg, 'operator')
        T('admin: Monitoring Operator berisi semua operator', pg.locator('#opTbody tr').count() > 300)
        pg.fill('#opSearch', 'achmad'); pg.wait_for_timeout(300); pg.click('.op-link:has-text("Achmad Yani")'); pg.wait_for_timeout(1500)
        T('admin: rekap Achmad Yani 14 skenario', pg.inner_text('#opDetail .risk-donut-hole b') == '14' and 'Sudah Mengisi' in pg.inner_text('#opDetail'), pg.inner_text('#opDetail')[:200])
        tab(pg, 'risk')
        T('admin: Monitoring Risiko berisi data', pg.locator('#riskTbody tr').count() > 20)
        tab(pg, 'trend')
        T('admin: daftar kaji ulang memuat Juanda', 'Juanda' in pg.inner_text('#reviewTbody'), pg.inner_text('#reviewTbody'))
        T('admin: tidak ada error JS', not pg._errs, pg._errs)
        pg.click('#authAccountBtn'); pg.click('#authLogoutBtn'); pg.wait_for_timeout(800)
        tab(pg, 'operator')
        T('admin keluar: tab terkunci lagi', 'memerlukan login' in pg.inner_text('#view-operator'))
        pg.close()

        # ================= OPERATOR =================
        pg = page(b)
        login(pg, 'budi@juanda.co.id', remember=True)
        tab(pg, 'operator')
        T('operator: Monitoring Operator hanya Juanda', pg.locator('#opTbody tr').count() == 1 and 'Juanda' in pg.inner_text('#opTbody'))
        tab(pg, 'risk')
        T('operator: Monitoring Risiko hanya Juanda', 'Juanda' in pg.inner_text('#riskTbody') and 'Achmad Yani' not in pg.inner_text('#riskTbody'))
        tab(pg, 'form')
        dis = pg.eval_on_selector_all('input[name=entityType]', 'e=>e.map(x=>x.value+":"+x.disabled)')
        T('operator: formulir hanya Bandar Udara & Juanda terpilih', dis == ['Bandar Udara:false', 'Airlines:true', 'LPPNPI:true', 'Regulated Agent:true'] and 'Juanda' in pg.inner_text('#entitySelected'), dis)
        fill_form(pg, 'Uji CI operator')
        T('formulir: rating 15 → Menengah / ALARP', pg.inner_text('#riskBadge') == 'Menengah' and 'ALARP' in pg.inner_text('#riskPenerimaan'))
        pg.click('#saveBtn'); pg.wait_for_timeout(1500)
        rows = ctl('/__ctl?a=rows&sheet=RISK_ASSESSMENT')
        T('operator: simpan DPRK tersimpan untuk BD-100 + ALARP dari server', any(r['operatorId'] == 'BD-100' and r['skenario'] == 'Uji CI operator' and r['kategoriPenerimaan'] == 'ALARP' for r in rows))
        pg.reload(); pg.wait_for_timeout(2800)
        T('operator: "ingat perangkat" tetap masuk setelah muat ulang', 'Budi Santoso' in pg.inner_text('#authBar'))
        T('operator: tidak ada error JS', not pg._errs, pg._errs)
        pg.close()

        # ================= LOGIN WAJIB =================
        ctl('/__ctl?a=enforce')
        pg = page(b); tab(pg, 'form')
        T('login wajib: formulir terkunci', not pg.is_visible('#types') and 'memerlukan login' in pg.inner_text('#authGate'))
        pg.close(); ctl('/__ctl?a=relax')

        # ================= PELAPORAN =================
        pg = page(b); tab(pg, 'pelaporan')
        pg.fill('#plpJudul', 'Uji laporan CI'); pg.select_option('#plpJenis', index=1); pg.fill('#plpTanggal', '2026-09-26')
        pg.check('#plpLuarBandara'); pg.wait_for_timeout(100); pg.select_option('#plpProvinsi', index=1); pg.fill('#plpNamaPelapor', 'Warga Uji')
        pg.click('#plpSubmit'); pg.wait_for_timeout(1500)
        T('pelaporan: nomor ref + kode cek tampil', 'Kode cek' in pg.inner_text('#plpFormNotice'))
        pg.click('#plpFormNotice [data-plp-go=status]'); pg.wait_for_timeout(1000)
        T('pelaporan: cek status → Menunggu verifikasi', 'Menunggu verifikasi' in pg.inner_text('#plpStatusResult'))
        pg.close()

        # ================= HP =================
        m = page(b, w=390); tab(m, 'operator')
        T('HP: tanpa scroll horizontal', m.evaluate('document.documentElement.scrollWidth<=390'))
        m.close(); b.close()
finally:
    for pr in procs: pr.terminate()
print(f'\n[ui] {ok} lulus, {fail} gagal')
sys.exit(1 if fail else 0)
