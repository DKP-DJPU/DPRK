// Uji pengubah Markdown tab Panduan (assets/js/panduan.js) + isi data/panduan.md & data/kontak.json.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const P = require(path.join(ROOT, 'assets', 'js', 'panduan.js'));
let ok = 0, fail = 0;
const T = (n, c, i) => { c ? ok++ : fail++; console.log((c ? 'LULUS ' : 'GAGAL ') + n + (c ? '' : '  → ' + String(JSON.stringify(i)).slice(0, 400))); };
const html = md => P.render(md).map(s => s.html).join('');

// --- keamanan: tidak ada HTML mentah / skema berbahaya
const evil = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '[klik](javascript:alert(1))',
  '[klik](JaVaScRiPt:alert(1))',
  '[klik](data:text/html,<b>x</b>)',
  '[klik](//evil.example/x)',
  '![g](javascript:alert(1))',
  '![g](https://x" onerror="alert(1))',
  '![g](assets/panduan/../../index.html)',
  '![g](data/kontak.json)',
  '!video[v](https://evil.example/watch?v=abcdefg)',
  '!video[v](javascript:alert(1))',
  '| <b>a</b> | b |\n|---|---|\n| <i onmouseover=x>c</i> | d |',
  '> <iframe src=x></iframe>',
  '### <svg onload=alert(1)>',
  '**<b>tebal</b>**',
  '[a](https://ok.example/"onmouseover="x)',
].join('\n\n');
const h = html('## Uji\n\n' + evil + '\n\n## FAQ\n\n### <script>q</script>\njawab');
T('tidak ada tag HTML mentah dari isi', !/<(script|img src=x|iframe|svg|i onmouseover)/i.test(h), h.match(/<(script|img|iframe|svg)[^>]*>/gi));
T('tidak ada atribut on* yang aktif', !/<[^>]+\son\w+=/i.test(h), h.match(/<[^>]+\son\w+=[^>]*>/gi));
T('tidak ada href/src javascript:/data:', !/(href|src)="\s*(javascript|data):/i.test(h));
T('tautan //host ditolak', !/href="\/\//.test(h));
T('gambar hanya dari assets/panduan/ (tanpa ..) atau https', !/src="(data\/kontak|assets\/panduan\/\.\.)/.test(h));
T('video dari domain lain tidak di-embed', !/evil\.example\/watch/.test(h) && /hanya YouTube atau Google Drive/.test(h));
T('kutip di URL di-escape (tidak keluar dari atribut)', !/href="https:\/\/ok\.example\/"onmouseover/.test(h));

// --- fitur
const m = P.render(`<!-- catatan penyunting -->
Pengantar **tebal** dan *miring* dan \`kode\`.

## Bab Satu
### Sub
1. langkah satu
2. langkah dua dengan [tautan](https://kemenhub.go.id)
- butir
> catatan biasa
> ! bukan peringatan karena baris kedua

> ! peringatan

| A | B |
|---|---|
| 1 | 2 |

![Gambar contoh](assets/panduan/masuk.png)

!video[Video YouTube](https://youtu.be/dQw4w9WgXcQ)

!video[Video Drive](https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrSt/view?usp=sharing)

!video[Watch](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10)

## Bab Satu
## Pertanyaan Umum (FAQ)
### Satu?
Jawaban satu.
### Dua?
Jawaban dua.`);
T('komentar penyunting tidak tampil', !m.some(s => /catatan penyunting/.test(s.html)));
T('pengantar + 3 bab (judul ganda diberi id unik)', m.length === 4 && m[0].id === 'pengantar' && m[1].id === 'bab-satu' && m[2].id === 'bab-satu-2', m.map(s => s.id));
const b1 = m[1].html;
T('ol, ul, h3, tabel, gambar', /<ol><li>langkah satu<\/li><li>langkah dua/.test(b1) && /<ul><li>butir<\/li><\/ul>/.test(b1) && /<h3 id="pdn-sub">Sub<\/h3>/.test(b1) && /<table>.*<th>A<\/th>.*<td>2<\/td>/.test(b1) && /<img class="pdn-img" src="assets\/panduan\/masuk.png" alt="Gambar contoh" loading="lazy"/.test(b1) && /class="pdn-fig-frame"/.test(b1), b1);
T('tautan luar membuka tab baru dengan noopener', /<a href="https:\/\/kemenhub.go.id" target="_blank" rel="noopener noreferrer">tautan<\/a>/.test(b1));
T('catatan & peringatan', (b1.match(/class="pdn-note"/g) || []).length === 1 && (b1.match(/class="pdn-note pdn-warn"/g) || []).length === 1, b1.match(/class="pdn-note[^"]*"/g));
T('video YouTube → youtube-nocookie (dimuat saat diklik)', /data-src="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?autoplay=1&amp;rel=0"/.test(b1) && !/<iframe/.test(b1));
T('video Drive → /preview', /data-src="https:\/\/drive\.google\.com\/file\/d\/1AbCdEfGhIjKlMnOpQrSt\/preview"/.test(b1));
T('youtube.com/watch?v= dikenali', (b1.match(/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/g) || []).length === 2);
const faq = m[3];
T('bab FAQ → pertanyaan buka-tutup', faq.faq && (faq.html.match(/<details class="pdn-faq"><summary>/g) || []).length === 2 && /Jawaban dua\.<\/p><\/div><\/details>$/.test(faq.html), faq.html);
T('teks pencarian berisi isi bab', /jawaban satu/.test(faq.text));
T('gambar @2x ditandai data-dpr="2"; gambar biasa tidak', /src="assets\/panduan\/x@2x.png"[^>]*data-dpr="2"/.test(html('![a](assets/panduan/x@2x.png)')) && !/data-dpr/.test(html('![a](assets/panduan/x.png)')));
T('slug tanpa aksen/simbol', P.slug('Masuk & Pendaftaran Akun!') === 'masuk-pendaftaran-akun' && P.slug('Pertanyaan Umum (FAQ)') === 'pertanyaan-umum-faq');

// --- kontak
T('kontak kosong → bagian Kontak tidak ditampilkan', P.renderKontak({ kontak: [] }) === null && P.renderKontak(null) === null && P.renderKontak({ kontak: [{ unit: 'X' }] }) === null);
const k = P.renderKontak({ catatan: 'Respons maksimal 1x24 jam kerja.', kontak: [{ unit: 'Dit. Kampen', nama: 'Helpdesk', email: 'helpdesk@dephub.go.id', telepon: '(021) 381-1308', whatsapp: '0812-3456-7890', jam: 'Senin–Jumat' }, { unit: '<script>x</script>', email: 'bukan email', whatsapp: '62 811 000 111' }] });
T('kontak: mailto, tel, wa.me (0 → 62)', k && /href="mailto:helpdesk@dephub.go.id"/.test(k.html) && /href="tel:0213811308"/.test(k.html) && /href="https:\/\/wa.me\/6281234567890"/.test(k.html) && /href="https:\/\/wa.me\/62811000111"/.test(k.html), k && k.html);
T('kontak: email tidak valid diabaikan, isi di-escape', k && !/mailto:bukan/.test(k.html) && !/<script>/.test(k.html) && /&lt;script&gt;/.test(k.html));
T('kontak: catatan tampil', k && /Respons maksimal/.test(k.html));

// --- isi asli repo
const real = P.render(fs.readFileSync(path.join(ROOT, 'data', 'panduan.md'), 'utf8'));
T('data/panduan.md: ≥5 bab termasuk FAQ', real.filter(s => s.title).length >= 5 && real.some(s => s.faq), real.map(s => s.title));
const imgs = [...real.map(s => s.html).join('').matchAll(/<img class="pdn-img" src="([^"]+)"/g)].map(x => x[1]);
const missing = imgs.filter(f => !fs.existsSync(path.join(ROOT, f)));
T('semua gambar yang dirujuk ada di repo (' + imgs.length + ')', imgs.length > 0 && missing.length === 0, missing);
const used = new Set(imgs.map(f => path.basename(f)));
const unused = fs.readdirSync(path.join(ROOT, 'assets', 'panduan')).filter(f => !used.has(f));
T('tidak ada gambar yatim di assets/panduan', unused.length === 0, unused);
T('gambar formulir berresolusi ganda (@2x) agar ukuran tulisan seragam', imgs.every(f => /@2x\.png$/.test(f)), imgs);
T('ukuran gambar wajar (< 400 KB per file)', imgs.every(f => fs.statSync(path.join(ROOT, f)).size < 400 * 1024));
const kj = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'kontak.json'), 'utf8'));
T('data/kontak.json valid & punya daftar "kontak"', Array.isArray(kj.kontak));
T('contoh kontak (_contoh) tidak pernah ditampilkan', P.renderKontak({ _contoh: kj._contoh, kontak: [] }) === null);
const facts = real.map(s => s.text).join(' ');
T('isi panduan sesuai aturan: band 3–7/8–13/14–19/20–25/26–30 & ALARP', ['3–7', '8–13', '14–19', '20–25', '26–30', 'alarp'].every(x => facts.includes(x.toLowerCase())));
T('isi panduan sesuai aturan: kode 10 menit, sesi 12 jam / 30 hari', /10 menit/.test(facts) && /12 jam/.test(facts) && /30 hari/.test(facts));

console.log(`\n[panduan] ${ok} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
