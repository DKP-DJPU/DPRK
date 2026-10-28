"""Uji UI (Playwright) SI-RISK AVSEC terhadap server tiruan dengan data sintetis.

Menjalankan sendiri: server statis (port 8350) + tests/ui/mock-server.js (port 8220).
    python3 tests/ui/smoke.py
Butuh: Node 18+, Python 3, `pip install playwright` + `python -m playwright install chromium`.
"""
import json, os, re, subprocess, sys, time, urllib.request
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
        T('admin: rekap menampilkan cakupan unit (0 dari 1 unit)', 'Cakupan Unit' in pg.inner_text('#opDetail') and '0 dari 1 unit' in pg.inner_text('#opDetail') and 'Satpel Uji Semarang' in pg.inner_text('#opDetail'), pg.inner_text('#opDetail')[:400])
        h1 = pg.evaluate('location.hash'); tab(pg, 'dashboard'); h2 = pg.evaluate('location.hash')
        pg.reload(); pg.wait_for_timeout(3000)
        T('admin: buka rekap operator → Dashboard → refresh tetap di Dashboard', h1.startswith('#operator=') and h2 == '' and pg.evaluate("document.querySelector('.nav button.active').dataset.view") == 'dashboard', [h1, h2, pg.evaluate("document.querySelector('.nav button.active').dataset.view")])
        tab(pg, 'operator')
        tab(pg, 'risk')
        T('admin: Monitoring Risiko berisi data', pg.locator('#riskTbody tr').count() > 20)
        n_rows = pg.locator('#riskTbody tr').count()
        T('admin: kolom Aksi + tombol Edit di setiap baris', pg.is_visible('#riskActCol') and pg.locator('#riskTbody [data-risk-edit]').count() == n_rows, [n_rows, pg.locator('#riskTbody [data-risk-edit]').count()])
        tinggi = sum(1 for r in ctl('/__ctl?a=rows&sheet=RISK_ASSESSMENT') if r['risikoRating'] == 'Tinggi')
        T('admin: kotak "Risiko Tinggi" = rating Tinggi (26–30), nilai 25 tidak ikut', pg.inner_text('#riskHighCount') == str(tinggi), [pg.inner_text('#riskHighCount'), tinggi])
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
        # --- edit lewat akun (V3.36)
        tab(pg, 'risk'); pg.wait_for_selector('[data-risk-edit]', timeout=8000)
        T('operator: tombol Edit hanya untuk skenario Juanda', pg.locator('#riskTbody [data-risk-edit]').count() == pg.locator('#riskTbody tr').count() and 'Achmad Yani' not in pg.inner_text('#riskTbody'))
        rid = pg.get_attribute('#riskTbody [data-risk-edit]', 'data-risk-edit')
        before = next(r for r in ctl('/__ctl?a=rows&sheet=RISK_ASSESSMENT') if r['riskId'] == rid)
        pg.click('#riskTbody [data-risk-edit]'); pg.wait_for_timeout(1500)
        T('operator: klik Edit → pindah ke formulir, terisi lengkap tanpa kode', pg.is_visible('#view-form') and pg.input_value('#skenario') == before['skenario'] and pg.input_value('#tanggalPengesahan') != '' and pg.inner_text('#saveBtn') == 'Perbarui Skenario' and 'lewat akun' in pg.inner_text('#refBox'), [pg.input_value('#skenario'), pg.input_value('#tanggalPengesahan'), pg.inner_text('#saveBtn')])
        T('operator: panel Kode DPRK disembunyikan & petunjuk edit lewat akun tampil', not pg.is_visible('#dprkTokenCard') and 'Monitoring Risiko' in pg.inner_text('#editLoginNote'))
        pg.fill('#area', 'Diubah lewat akun'); pg.fill('#riskOwner', 'Pemilik Baru'); pg.click('#saveBtn'); pg.wait_for_timeout(1800)
        after = next(r for r in ctl('/__ctl?a=rows&sheet=RISK_ASSESSMENT') if r['riskId'] == rid)
        T('operator: Perbarui → tersimpan di server (area & pemilik risiko), versi naik', after['area'] == 'Diubah lewat akun' and after['pemilikRisiko'] == 'Pemilik Baru' and int(after['rowVersion'] or 1) == int(before['rowVersion'] or 1) + 1, [after['area'], after['pemilikRisiko'], before['rowVersion'], after['rowVersion']])
        T('operator: kotak hasil tanpa kode referensi kosong ("id::")', 'Berhasil diperbarui' in pg.inner_text('#refBox') and '::' not in pg.inner_text('#refBox') and pg.inner_text('#saveBtn') == 'Simpan Skenario', pg.inner_text('#refBox'))
        # --- unit / stasiun (V3.37)
        tab(pg, 'form'); pg.wait_for_timeout(600)
        opts = pg.eval_on_selector_all('#unitSelect option', 'e=>e.map(o=>o.value+"|"+o.textContent)')
        T('unit: pilihan Unit tampil hanya dengan Induk + unit Juanda (bukan unit operator lain)', pg.is_visible('#unitArea') and len(opts) == 2 and opts[0].startswith('|Induk') and 'Satpel Uji Juanda' in opts[1] and not any('Semarang' in o for o in opts), opts)
        pg.select_option('#unitSelect', 'BD-100-U01'); fill_form(pg, 'Uji CI unit'); pg.select_option('#unitSelect', 'BD-100-U01')
        pg.click('#saveBtn'); pg.wait_for_timeout(1800)
        ur = [r for r in ctl('/__ctl?a=rows&sheet=RISK_ASSESSMENT') if r['skenario'] == 'Uji CI unit']
        T('unit: simpan dengan unit → baris server ber-unitId', len(ur) == 1 and ur[0]['unitId'] == 'BD-100-U01', ur)
        tab(pg, 'risk'); pg.wait_for_timeout(800)
        T('unit: Monitoring Risiko menampilkan nama unit', 'Satpel Uji Juanda' in pg.inner_text('#riskTbody'))
        pg.click('#riskTbody [data-risk-edit="%s"]' % ur[0]['riskId']); pg.wait_for_timeout(1500)
        T('unit: edit → unit terpilih & terkunci (tidak bisa dipindah)', pg.input_value('#unitSelect') == 'BD-100-U01' and pg.is_disabled('#unitSelect'))
        pg.click('#clearBtn'); pg.wait_for_timeout(300)
        T('unit: Bersihkan → pilihan unit bisa dipilih lagi', not pg.is_disabled('#unitSelect'))
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

        # ================= PANDUAN =================
        pg = page(b); tab(pg, 'panduan'); pg.wait_for_selector('.pdn-sec h2')
        toc = pg.eval_on_selector_all('#pdnToc a', 'e=>e.map(x=>x.textContent)')
        T('panduan: terbuka tanpa login, daftar isi ≥5 bab termasuk FAQ', len(toc) >= 5 and any('FAQ' in t for t in toc), toc)
        T('panduan: bagian Kontak tersembunyi selama kontak.json kosong', not any('Kontak' == t for t in toc) and not pg.query_selector('#pdn-kontak'))
        pg.wait_for_timeout(500)
        imgs = pg.eval_on_selector_all('.pdn-fig img', 'e=>e.map(i=>{i.loading="eager";return i.src})')
        pg.wait_for_timeout(800)
        broken = pg.eval_on_selector_all('.pdn-fig img', 'e=>e.filter(i=>!(i.complete&&i.naturalWidth>0)).map(i=>i.src)')
        T('panduan: semua gambar termuat (%d)' % len(imgs), len(imgs) >= 5 and not broken, broken)
        sizes = pg.eval_on_selector_all('.pdn-img[data-dpr]', 'e=>e.map(i=>[i.naturalWidth, Math.round(i.getBoundingClientRect().width), i.parentElement.parentElement.clientWidth])')
        T('panduan: ukuran tulisan di gambar seragam (gambar @2x tampil ½ ukuran asli, tidak diperbesar)', len(sizes) == len(imgs) and all(abs(w - min(n / 2, fw)) <= 2 for n, w, fw in sizes if n), sizes)
        pg.fill('#pdnSearch', 'kode cek'); pg.wait_for_timeout(400)
        vis = pg.eval_on_selector_all('.pdn-sec', 'e=>e.filter(x=>!x.hidden).map(x=>x.id)')
        opened = pg.eval_on_selector_all('.pdn-faq', 'e=>e.filter(x=>x.open&&!x.hidden).map(x=>x.querySelector("summary").textContent)')
        T('panduan: cari "kode cek" → hanya bab terkait, FAQ yang cocok terbuka', 'pdn-melaporkan-kejadian' in vis and 'pdn-mengisi-dprk' not in vis and any('kode cek' in o for o in opened), [vis, opened])
        pg.fill('#pdnSearch', 'zzzz tidak ada'); pg.wait_for_timeout(400)
        T('panduan: pencarian tanpa hasil → pesan', pg.is_visible('#pdnEmpty') and 'Tidak ada bagian' in pg.inner_text('#pdnEmpty'))
        pg.fill('#pdnSearch', ''); pg.wait_for_timeout(300)
        pg.click('#pdnToc a[data-pdn="pertanyaan-umum-faq"]'); pg.wait_for_timeout(900)
        T('panduan: klik daftar isi → hash #panduan/<bab> & bab terlihat', pg.evaluate('location.hash') == '#panduan/pertanyaan-umum-faq' and pg.evaluate("(()=>{const r=document.getElementById('pdn-pertanyaan-umum-faq').getBoundingClientRect();return r.top<innerHeight&&r.bottom>0})()"))
        T('kaki halaman (teks versi lama) sudah dihapus', pg.query_selector('.footer') is None and 'V3.27' not in pg.inner_text('body'))
        T('panduan: tidak ada error JS', not pg._errs, pg._errs)
        pg.close()
        pg = page(b, url=f'http://localhost:{WEB}/#panduan/mengisi-dprk'); pg.wait_for_timeout(800)
        T('panduan: tautan langsung #panduan/mengisi-dprk membuka tab & bab', pg.is_visible('#view-panduan') and pg.evaluate("document.querySelector('.nav button.active').dataset.view") == 'panduan' and pg.evaluate("(()=>{const r=document.getElementById('pdn-mengisi-dprk').getBoundingClientRect();return r.top<innerHeight&&r.bottom>0})()"))
        pg.close()
        # laporan Alex 20 Okt: pilih bab → kembali ke Dashboard → refresh tidak boleh kembali ke Panduan
        pg = page(b); tab(pg, 'panduan'); pg.wait_for_selector('#pdnToc a')
        pg.click('#pdnToc a[data-pdn="masuk-dan-pendaftaran-akun"]'); pg.wait_for_timeout(500)
        h1 = pg.evaluate('location.hash')
        tab(pg, 'dashboard'); h2 = pg.evaluate('location.hash')
        pg.reload(); pg.wait_for_timeout(2500)
        T('panduan: pilih bab → Dashboard → refresh tetap di Dashboard', h1 == '#panduan/masuk-dan-pendaftaran-akun' and h2 == '' and pg.evaluate("document.querySelector('.nav button.active').dataset.view") == 'dashboard' and not pg.is_visible('#view-panduan'), [h1, h2, pg.evaluate("document.querySelector('.nav button.active').dataset.view")])
        pg.close()
        # kontak & video (isi diganti lewat route, tanpa mengubah repo)
        pg = b.new_page(viewport={'width': 1300, 'height': 900}); pg._errs = []
        pg.on('pageerror', lambda e: pg._errs.append(str(e))); pg.route('**/*', route)
        pg.route('**/data/kontak.json*', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps({'kontak': [{'unit': 'Unit Uji', 'nama': 'Helpdesk Uji', 'email': 'helpdesk@contoh.go.id', 'whatsapp': '0812-0000-1111', 'jam': 'Senin–Jumat'}]})))
        pg.route('**/data/panduan.md*', lambda r: r.fulfill(status=200, content_type='text/markdown', body='## Video\n\n!video[Cara mengisi](https://youtu.be/dQw4w9WgXcQ)\n\n## FAQ\n### Tanya?\nJawab.'))
        pg.goto(f'http://localhost:{WEB}/#panduan'); pg.wait_for_selector('#pdn-kontak', timeout=8000)
        T('panduan: kontak terisi → bagian Kontak tampil dengan tautan WhatsApp', 'Helpdesk Uji' in pg.inner_text('#pdn-kontak') and pg.query_selector('#pdn-kontak a[href="https://wa.me/6281200001111"]') is not None)
        T('panduan: video belum dimuat sebelum diklik', pg.query_selector('#pdnContent iframe') is None)
        pg.click('.pdn-video-btn'); pg.wait_for_timeout(300)
        T('panduan: klik video → iframe youtube-nocookie', (pg.get_attribute('#pdnContent iframe', 'src') or '').startswith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'))
        pg.close()

        # ================= V3.38: penilaian terakhir per unit (simulasi LPP-004) =================
        ctl('/__ctl?a=simunit'); pg = page(b); login(pg, 'admin@dkp.go.id'); tab(pg, 'operator')
        pg.fill('#opSearch', 'yogyakarta'); pg.wait_for_timeout(300); pg.click('.op-link[data-op-id="LPP-004"]'); pg.wait_for_timeout(1500)
        txt = pg.inner_text('#opDetail')
        T('rekap unit: 9 skenario berlaku (Induk Okt + Cilacap Okt + Solo Jan), bukan 3 atau 12', re.search(r'SKENARIO DINILAI\s*9\b', txt, re.I) is not None, txt[:300])
        T('rekap unit: rentang periode Oktober 2026 – Januari 2027 & rata-rata 15.9', 'Oktober 2026 – Januari 2027' in txt and '15.9' in txt)
        row = pg.locator('.opd-table tr:has-text("Cabang Pembantu Solo")').first
        cells = [row.locator('td').nth(i).inner_text().strip() for i in (3, 4)]
        T('Cakupan Unit: Solo 3 skenario (bukan 6), rata-rata 13.7', cells == ['3', '13.7'], cells)
        T('5 Risiko Tertinggi menyebut unit / Induk', pg.locator('.opd-table .risk-unit:has-text("Induk")').count() > 0)
        tab(pg, 'risk'); pg.fill('#riskSearch', 'yogyakarta'); pg.dispatch_event('#riskSearch', 'input'); pg.wait_for_timeout(300)
        T('Monitoring Risiko: default penilaian terkini → 9 baris', pg.locator('#riskTbody tr').count() == 9 and not pg.is_hidden('#riskUnitField'), pg.locator('#riskTbody tr').count())
        pg.select_option('#riskPeriod', 'semua'); pg.wait_for_timeout(300)
        T('Monitoring Risiko: semua periode → 12 baris, 3 bertanda Arsip', pg.locator('#riskTbody tr').count() == 12 and pg.locator('#riskTbody .risk-arsip').count() == 3)
        pg.select_option('#riskPeriod', 'kini'); pg.select_option('#riskUnit', 'LPP-004-U02'); pg.wait_for_timeout(300)
        T('Monitoring Risiko: filter unit Solo → 3 baris Januari 2027', pg.locator('#riskTbody tr').count() == 3 and pg.locator('#riskTbody tr:has-text("Januari 2027")').count() == 3)
        pg.select_option('#riskUnit', '__induk'); pg.wait_for_timeout(300)
        T('Monitoring Risiko: filter Induk saja → 4 baris tanpa nama unit', pg.locator('#riskTbody tr').count() == 4 and pg.locator('#riskTbody .risk-unit').count() == 0)
        pg.close(); ctl('/__ctl?a=reset')

        # ================= HP =================
        m = page(b, w=390); tab(m, 'operator')
        T('HP: tanpa scroll horizontal', m.evaluate('document.documentElement.scrollWidth<=390'))
        tab(m, 'panduan'); m.wait_for_selector('.pdn-sec h2'); m.wait_for_timeout(400)
        T('HP: Panduan tanpa scroll horizontal', m.evaluate('document.documentElement.scrollWidth<=390'), m.evaluate('document.documentElement.scrollWidth'))
        m.close(); b.close()
finally:
    for pr in procs: pr.terminate()
print(f'\n[ui] {ok} lulus, {fail} gagal')
sys.exit(1 if fail else 0)
