"""Uji beban browser (manual, tidak di CI): data rekaan ±24 ribu skenario, lalu ukur waktu muat tab Admin.
    python3 tests/ui/beban.py
"""
import json, os, sys, time, urllib.request
sys.argv = sys.argv[:1]
HERE = os.path.dirname(__file__)
src = open(os.path.join(HERE, 'smoke.py')).read().split('\ntry:\n    with sync_playwright')[0]   # pakai server & helper dari smoke.py
exec(compile(src, 'smoke-helpers', 'exec'))
from playwright.sync_api import sync_playwright
try:
    print(ctl('/__ctl?a=beban')['pesan'])
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = page(b); login(pg, 'admin@dkp.go.id')
        sizes = []
        pg.on('response', lambda r: sizes.append((json.loads(r.request.post_data or '{}').get('action', '?') if r.request.method == 'POST' else 'GET', len(r.body()))) if 'script.google.com' in r.url else None)
        for v, ready in (('dashboard', '#k-total'), ('risk', '#riskCount'), ('operator', '#opListCard'), ('trend', '#view-trend')):
            t = time.time(); pg.click(f'button[data-view={v}]')
            pg.wait_for_function("()=>!document.querySelector('.view.active .loading, .view.active .skeleton')", timeout=120000)
            pg.wait_for_timeout(300); dt = time.time() - t
            print(f'tab {v:10s}: {dt:5.1f} dtk', ('· skenario ' + pg.inner_text('#riskCount')) if v == 'risk' else '')
        heap = pg.evaluate("performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : -1")
        print('memori JS halaman ±', heap, 'MB')
        agg = {}
        for a, n in sizes: agg[a] = agg.get(a, 0) + n
        for a, n in sorted(agg.items(), key=lambda x: -x[1]): print(f'  respons {a:16s}: {n/1024:8.0f} KB')
        pg.close(); b.close()
finally:
    for pr in procs: pr.terminate()
