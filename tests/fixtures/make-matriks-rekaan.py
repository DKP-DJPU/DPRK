"""Membuat tests/fixtures/matriks-rekaan.xlsx — matriks DPRK REKAAN (format Lampiran II) untuk uji UI impor.
Tidak memuat data operator nyata; teks skenario diambil dari katalog publik data/katalog-risiko.json.
Meniru kebiasaan file nyata: judul kolom tergabung (merge), ID "1.10" berformat tanggal, ID angka 3.6,
"1,0" sebagai judul kategori, tanggal kaji ulang campuran, perlakuan "Sharing", blok risiko khusus, satu baris bergalat.
    python3 tests/fixtures/make-matriks-rekaan.py
"""
import datetime, json, os
import openpyxl
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
K = {s[0]: s for s in json.load(open(os.path.join(ROOT, 'data', 'katalog-risiko.json')))['skenario']}
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'MATRIKS DAFTAR RISIKO'
ws['A1'] = 'MATRIKS DAFTAR RISIKO BANDAR UDARA REKAAN'
ws['A2'] = 'OPERATOR PENERBANGAN'; ws['D2'] = ': Bandar Udara Rekaan'
ws['A3'] = 'BULAN'; ws['D3'] = ': Juli 2026'
hdr = ['ID RISK', 'SKENARIO ANCAMAN', None, 'AREA KERENTANAN', 'LANGKAH KEAMANAN SAAT INI', 'KERENTANAN SAAT INI', 'ANCAMAN', None, 'KERENTANAN', None, 'KONSEKUENSI', None, 'RISIKO', None, 'LANGKAH-LANGKAH KEAMANAN TAMBAHAN', 'PEMILIK RESIKO (RISK OWNER)', 'TANGGAL KAJI ULANG RISIKO', 'KETERANGAN']
for j, h in enumerate(hdr, 1): ws.cell(5, j, h)
for j, h in enumerate(['NILAI', 'RATING'] * 4, 7): ws.cell(6, j, h)
ws.merge_cells('B5:C6')
for a in ['G5:H5', 'I5:J5', 'K5:L5', 'M5:N5']: ws.merge_cells(a)
r = 7
def add(idv, huruf, sk, a, k, c, tgl, ket, fmt=None):
    global r
    vals = [idv, huruf, sk, 'PSCP', 'SOP rekaan', 'Kerentanan rekaan', a, None, k, None, c, None, (a + k + c) if isinstance(a, int) and isinstance(k, int) and isinstance(c, (int,)) else None, None, 'Langkah rekaan', 'Pemilik rekaan', tgl, ket]
    for j, v in enumerate(vals, 1): ws.cell(r, j, v)
    if fmt: ws.cell(r, 1).number_format = fmt
    r += 1
add('1,0', 'PERSON BORNE IEDs ON THE BODY', None, None, None, None, None, None)
add(1.01, 'a.', K['01.01'][2], 4, 3, 8, '22 Juli 2026', 'Mitigasi')
add(datetime.datetime(2026, 1, 10), 'b.', K['01.10'][2], 4, 3, 6, datetime.datetime(2026, 12, 31), 'Sharing', fmt='m.d')
add(None, 'c.', '…...', None, None, None, None, None)
add('3. 0', 'ATTACKS USING UAS', None, None, None, None, None, None)
add(3.6, 'a.', K['03.06'][2], 6, 6, 10, '31/12/2026\n\n31 Maret 2027 (anggaran)', 'Mitigasi dan Sharing')
add('4.0', 'LANDSIDE ATTACK', None, None, None, None, None, None)
add('4.2', 'a.', K['04.09'][2], 4, 2, 8, datetime.datetime(2027, 3, 31), 'Diterima')
add('4.3', 'b.', 'Skenario rekaan dengan nilai di luar rentang', 11, 2, 2, '', 'Mitigasi')
ws.cell(r, 1, 'HASIL PENILAIAN RISIKO KHUSUS'); r += 1
add('2.0', 'IED IN CARGO', None, None, None, None, None, None)
add('2.2', 'a.', K['02.02'][2], 2, 1, 10, datetime.datetime(2026, 9, 1), 'Sharing')
ws.cell(r + 1, 1, 'Mengetahui,')
wb.create_sheet('ID Risk').append(['ID RISK', 'SKENARIO ANCAMAN'])
wb.save(os.path.join(ROOT, 'tests', 'fixtures', 'matriks-rekaan.xlsx'))
print('OK')
