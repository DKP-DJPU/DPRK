"""Membuat ulang gambar untuk tab Panduan (assets/panduan/*.png) dari server tiruan berisi DATA REKAAN.
    python3 tests/ui/make-screenshots.py
Jalankan ulang setiap kali tampilan formulir berubah, lalu periksa gambarnya sebelum commit.
"""
import json, os, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'panduan')
WEB, M = 8351, 8221
procs = [
    subprocess.Popen([sys.executable, '-m', 'http.server', str(WEB)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL),
    subprocess.Popen(['node', os.path.join(ROOT, 'tests', 'ui', 'mock-server.js')], env=dict(os.environ, PORT=str(M)), stdout=subprocess.DEVNULL),
]
def ctl(path): return json.loads(urllib.request.urlopen(f'http://localhost:{M}{path}').read())
for _ in range(50):
    try: ctl('/__ctl?a=log'); urllib.request.urlopen(f'http://localhost:{WEB}/'); break
    except Exception: time.sleep(0.2)
def route(r):
    u = r.request.url
    if 'script.google.com' in u:
        q = u.split('?', 1)[1] if '?' in u else ''
        return r.fulfill(response=r.fetch(url=f'http://localhost:{M}/?' + q, method=r.request.method, post_data=r.request.post_data))
    return r.continue_() if u.startswith('http://localhost') or 'fonts.g' in u else r.abort()
def page(b):
    pg = b.new_page(viewport={'width': 900, 'height': 900}, device_scale_factor=1.5, locale='id-ID', timezone_id='Asia/Jakarta')
    pg.route('**/*', route); pg.goto(f'http://localhost:{WEB}/'); pg.wait_for_timeout(2500); return pg
def shot(el, name):
    el.screenshot(path=os.path.join(OUT, name)); print('✓', name)
def clip(pg, top_sel, bottom_sel, name, pad=14):
    box = lambda sel: pg.eval_on_selector(sel, "e=>{const r=e.getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height}}")
    a = box(top_sel); z = box(bottom_sel)
    x = min(a['x'], z['x']) - pad; y = a['y'] - pad
    pg.screenshot(path=os.path.join(OUT, name), clip={'x': x, 'y': y, 'width': max(a['width'], z['width']) + 2 * pad, 'height': z['y'] + z['height'] - y + pad}, full_page=True); print('✓', name)

try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--lang=id-ID'], env=dict(os.environ, LANG='id_ID.UTF-8', LANGUAGE='id'))
        # --- daftar
        pg = page(b)
        pg.click('#authOpenBtn'); pg.click('[data-auth-go=register]'); pg.wait_for_selector('#authRegForm')
        pg.fill('#authRegNama', 'Rina Wijaya'); pg.fill('#authRegEmail', 'rina.wijaya@contoh.co.id'); pg.fill('#authRegJabatan', 'Kepala Unit AVSEC')
        pg.fill('#authRegOp', 'juanda'); pg.wait_for_timeout(300); pg.click('#authRegOpList [data-oid="BD-100"]'); pg.wait_for_timeout(200)
        shot(pg.locator('.auth-dialog'), 'daftar.png'); pg.close()
        # --- masuk (langkah kode)
        ctl('/__ctl?a=clearcache'); pg = page(b)
        pg.click('#authOpenBtn'); pg.fill('#authEmail', 'budi@juanda.co.id'); pg.click('#authSendBtn'); pg.wait_for_selector('#authCode')
        pg.fill('#authCode', '123456'); shot(pg.locator('.auth-dialog'), 'masuk.png')
        # --- formulir
        pg.fill('#authCode', ctl('/__mail?to=budi@juanda.co.id')['code']); pg.click('#authVerifyBtn'); pg.wait_for_timeout(1800)
        pg.click('button[data-view=form]'); pg.wait_for_timeout(1200)
        pg.select_option('#bulan', 'Oktober'); pg.fill('#namaPengisi', 'Budi Santoso'); pg.fill('#jabatanPengisi', 'Kepala Unit AVSEC')
        pg.fill('#tanggalPengesahan', '2026-10-01'); pg.fill('#emailRiskOwner', 'risk.owner@contoh.co.id'); pg.fill('#linkDprk', 'https://drive.google.com/file/d/contoh')
        pg.evaluate("document.querySelector('#authGate').style.display='none'")
        shot(pg.locator('#view-form .step-card').first, 'form-identitas.png')
        pg.select_option('#kategori', index=1); pg.wait_for_timeout(200); pg.select_option('#riskCatalog', index=1); pg.wait_for_timeout(200)
        pg.fill('#area', 'Security Check Point Terminal'); pg.fill('#langkahSaatIni', 'Pemeriksaan X-ray dan WTMD oleh personel AVSEC bersertifikat.'); pg.fill('#kerentananSaatIni', 'Antrean padat pada jam sibuk.')
        for f, v in [('ancaman', '5'), ('kerentanan', '6'), ('konsekuensi', '5')]: pg.fill('#' + f, v); pg.dispatch_event('#' + f, 'input')
        pg.select_option('#perlakuan', 'Mitigasi'); pg.select_option('#prioritas', 'Segera'); pg.fill('#riskOwner', 'Airport Security Manager'); pg.fill('#tanggalKaji', '2027-04-01')
        pg.wait_for_timeout(300)
        clip(pg, '#view-form .form-section-title', '#riskPenerimaan', 'form-penilaian.png')
        pg.click('#saveBtn'); pg.wait_for_selector('#refBox:not(:empty)', timeout=8000); pg.wait_for_timeout(400)
        # --- tombol Edit di Monitoring Risiko (akun operator)
        pg.click('button[data-view=risk]'); pg.wait_for_selector('[data-risk-edit]', timeout=8000); pg.wait_for_timeout(400)
        bx = pg.eval_on_selector('#view-risk .tablewrap', "e=>{const r=e.getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height}}")
        pg.screenshot(path=os.path.join(OUT, 'edit-monitoring.png'), clip={'x': bx['x'], 'y': bx['y'], 'width': bx['width'], 'height': min(bx['height'], 330)}, full_page=True); print('✓ edit-monitoring.png')
        pg.close()
        # --- laporan
        pg = page(b); pg.click('button[data-view=pelaporan]'); pg.wait_for_timeout(800)
        pg.fill('#plpJudul', 'Contoh laporan kejadian'); pg.select_option('#plpJenis', index=2); pg.fill('#plpTanggal', '2026-10-20')
        pg.check('#plpLuarBandara'); pg.select_option('#plpProvinsi', index=1); pg.fill('#plpNamaPelapor', 'Pelapor Contoh')
        pg.click('#plpSubmit'); pg.wait_for_timeout(1500)
        shot(pg.locator('#plpFormNotice'), 'laporan-terkirim.png'); pg.close()
        b.close()
finally:
    for pr in procs: pr.terminate()
