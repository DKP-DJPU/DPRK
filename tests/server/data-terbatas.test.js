// Uji P1 (V3.34): data per operator (Terbatas) tidak keluar ke publik; agregat publik
// dengan ambang MIN_GROUP & supresi komplementer; baca terbatas sesuai peran; cache berpotongan.
const { fx, tester, newEnv, seedAll } = require('./_lib.js');
const T = tester('data-terbatas');
const logs = [];
const env = newEnv({ logs, now: Date.parse('2026-10-19T03:00:00Z') });
seedAll(env, { incidents: false });
const RISKS = fx('risks');
const ops = [...new Set(RISKS.map(r => r.operatorId))];
env.ctx.terapkanHitungUlangRisiko(); // kondisi produksi setelah V3.32–V3.33
const c=env.ctx; c.setupLogin();
const login=(email)=>{env.cache.clear();env.post({action:'authRequestCode',email});return env.post({action:'authVerify',email,code:env.lastCode(email)}).data.token};
// --- publik
let g=env.get({action:'risks'}); T('GET risks publik → AUTH_REQUIRED',!g.ok&&g.code==='AUTH_REQUIRED',g);
g=env.get({action:'review'}); T('GET review publik → AUTH_REQUIRED',!g.ok&&g.code==='AUTH_REQUIRED',g);
g=env.get({action:'operators'});
T('GET operators publik: identitas saja (tanpa statusDprk/jumlahSkenario/tanggalKaji)',g.ok&&g.data.length>300&&!g.data.some(o=>'statusDprk' in o||'jumlahSkenario' in o||'tanggalKaji' in o),g.ok&&Object.keys(g.data[0]));
T('cache master >100KB kini tersimpan (berpotongan)',JSON.stringify(g.data).length>80000&&c.cacheGet_(c.CACHE_KEYS.master)&&c.cacheGet_(c.CACHE_KEYS.master).length===g.data.length&&!logs.some(l=>/cachePut_/.test(l)),[JSON.stringify(g.data).length,logs]);
const d=env.get({action:'dashboard'}).data;
T('dashboard: KPI tetap',d.kpi.totalEntities>300&&d.kpi.filledEntities===ops.length,d.kpi);
const an=d.analytics;
T('analitik nasional (_all) tampil; skenario ganda dihitung sekali',!an._all.suppressed&&an._all.totalRisks===d.kpi.totalRisks&&d.kpi.totalRisks===RISKS.length-1&&an._all.operators===14,an._all);
T('[supresi komplementer] Bandar Udara ikut disembunyikan karena Airlines hanya 1 operator',an['Bandar Udara'].suppressed&&an['Bandar Udara'].complementary,an['Bandar Udara']);
const opsPerKat={};RISKS.forEach(r=>{const k=String(r.kategori).split(' - ')[0].padStart(2,'0');(opsPerKat[k]=opsPerKat[k]||new Set()).add(r.operatorId)});
T('kategori nasional: tampil hanya bila dinilai ≥ MIN_GROUP operator',d.categories.every(x=>{const n=(opsPerKat[x.kode]||new Set()).size;return n>=c.MIN_GROUP?x.n>0&&x.avg>0:x.avg===0&&x.n===0}),d.categories.map(x=>[x.kode,x.n,(opsPerKat[x.kode]||new Set()).size]));
T('kartu per jenis: semua angka risiko disembunyikan (komplementer)',d.byType.every(b=>b.riskSuppressed&&!('riskOperators' in b)),d.byType);
T('tren per bulan: bulan Juni (hanya Thai AirAsia) → null; Juli (13 bandara) tampil',d.trend.labels.indexOf('2026-06')>-1&&d.trend.risk[d.trend.labels.indexOf('2026-06')]===null&&d.trend.risk[d.trend.labels.indexOf('2026-07')]>0,d.trend);
T('Airlines (1 operator) DISEMBUNYIKAN',an.Airlines.suppressed===true&&an.Airlines.operators===1&&!an.Airlines.distribution,an.Airlines);
T('LPPNPI & RA (0 operator) disembunyikan',an.LPPNPI.suppressed&&an['Regulated Agent'].suppressed);
T('dashboard tidak memuat nama operator di analitik',!/Achmad Yani|Juanda|Thai AirAsia/.test(JSON.stringify(an)));
// --- POST baca tanpa login
let r=env.post({action:'riskData'}); T('POST riskData tanpa login → AUTH_REQUIRED',!r.ok&&r.code==='AUTH_REQUIRED',r);
r=env.post({action:'riskData',sessionToken:'F'.repeat(64)}); T('token palsu → AUTH_REQUIRED',!r.ok&&r.code==='AUTH_REQUIRED');
r=env.post({action:'operatorStatus',_auth:{peran:'Admin',operatorIds:[]}}); T('memalsukan _auth → AUTH_REQUIRED',!r.ok&&r.code==='AUTH_REQUIRED');
// --- admin
const at=login('owner@dkp.go.id');
r=env.post({action:'riskData',sessionToken:at}); T('admin: riskData semua baris + operatorId + kategoriPenerimaan',r.ok&&r.scope==='all'&&r.data.length===RISKS.length&&r.data.every(x=>x.operatorId&&x.kategoriPenerimaan),r.ok?r.data[0]:r);
r=env.post({action:'operatorStatus',sessionToken:at}); T('admin: operatorStatus semua (+statusDprk)',r.ok&&r.data.length>300&&r.data.filter(x=>x.statusDprk==='Sudah Mengisi').length===14);
r=env.post({action:'reviewList',sessionToken:at}); T('admin: reviewList (Juanda kaji ulang 1 Nov)',r.ok&&r.data.length===1&&r.data[0].operatorId==='BD-100',r);
// --- operator
env.post({action:'authRegister',nama:'Budi',email:'budi@juanda.co.id',jabatan:'AVSEC',operatorId:'BD-100'});
const us=env.sheets.USER_ACCESS,h=us._data[0]; us._data.find(x=>x[h.indexOf('email')]==='budi@juanda.co.id')[h.indexOf('status')]='Aktif';
const ot=login('budi@juanda.co.id');
r=env.post({action:'riskData',sessionToken:ot}); T('operator: riskData hanya Juanda',r.ok&&r.scope==='own'&&r.data.length>0&&r.data.every(x=>x.operatorId==='BD-100'),r.ok?[r.data.length,[...new Set(r.data.map(x=>x.operatorId))]]:r);
r=env.post({action:'operatorStatus',sessionToken:ot}); T('operator: operatorStatus hanya 1 baris (Juanda)',r.ok&&r.data.length===1&&r.data[0].operatorId==='BD-100',r.ok&&r.data.length);
r=env.post({action:'reviewList',sessionToken:ot}); T('operator: reviewList hanya miliknya',r.ok&&r.data.every(x=>x.operatorId==='BD-100'));
// --- akun nonaktif
us._data.find(x=>x[h.indexOf('email')]==='budi@juanda.co.id')[h.indexOf('status')]='Nonaktif';
r=env.post({action:'riskData',sessionToken:ot}); T('akun dinonaktifkan → AUTH_REQUIRED',!r.ok&&r.code==='AUTH_REQUIRED');
// --- invalidasi cache setelah simpan
const before=env.post({action:'riskData',sessionToken:at}).data.length;
const cr=env.post({action:'create',sessionToken:at,operatorId:'BD-007',jenisOperator:'Bandar Udara',namaOperator:'Achmad Yani',kategori:'01 - X',skenario:'baru p1',ancamanNilai:5,kerentananNilai:5,konsekuensiNilai:5,bulan:'Oktober',tahun:2026,tanggalPengesahan:'2026-10-01',tanggalKaji:'2026-12-01',namaPengisi:'A'});
T('simpan berhasil',cr.ok,cr);
T('setelah simpan, riskData langsung memuat baris baru (cache diinvalidasi)',env.post({action:'riskData',sessionToken:at}).data.length===before+1);
T('baca terbatas tidak memakai lock (tetap jalan saat lock sibuk)',(()=>{const L=c.LockService.getScriptLock;c.LockService.getScriptLock=()=>({tryLock:()=>false,releaseLock(){}});const x=env.post({action:'riskData',sessionToken:at});const y=env.post({action:'create'});c.LockService.getScriptLock=L;return x.ok&&y.code==='BUSY'})());
T('tidak ada error cache di log',!logs.some(l=>/cachePut_|Argument too large/.test(l)),logs.filter(l=>/cache/.test(l)));

const addAir=oid=>{for(let q=1;q<=3;q++)env.post({action:'create',sessionToken:at,operatorId:oid,jenisOperator:'Airlines',namaOperator:oid,kategori:'0'+q+' - X',skenario:'s'+oid+q,ancamanNilai:5,kerentananNilai:5,konsekuensiNilai:5,bulan:'Oktober',tahun:2026,tanggalPengesahan:'2026-10-01',tanggalKaji:'2026-12-01',namaPengisi:'A'})};
addAir('AIR-GARUDA-INDONESIA');env.cache.clear();const d1=env.get({action:'dashboard'}).data;
T('tepat 2 maskapai (ambang 2) → Airlines & Bandar Udara tampil',!d1.analytics.Airlines.suppressed&&d1.analytics.Airlines.operators===2&&!d1.analytics['Bandar Udara'].suppressed,Object.fromEntries(Object.entries(d1.analytics).map(([k,v])=>[k,!!v.suppressed])));
T('kartu per jenis Airlines kini menampilkan angka risiko',d1.byType.find(b=>b.jenisOperator==='Airlines').riskOperators!=null);
// maskapai ke-3
['AIR-LION-MENTARI-AIRLINES'].forEach((oid,j)=>{for(let q=1;q<=3;q++)env.post({action:'create',sessionToken:at,operatorId:oid,jenisOperator:'Airlines',namaOperator:oid,kategori:'0'+q+' - X',skenario:'L'+j+q,ancamanNilai:5,kerentananNilai:5,konsekuensiNilai:5,bulan:'Oktober',tahun:2026,tanggalPengesahan:'2026-10-01',tanggalKaji:'2026-12-01',namaPengisi:'A'})});
env.cache.clear();const d2=env.get({action:'dashboard'}).data;
T('3 maskapai → Airlines & Bandar Udara tampil, LPPNPI/RA (0) tetap tersembunyi',!d2.analytics.Airlines.suppressed&&!d2.analytics['Bandar Udara'].suppressed&&d2.analytics.LPPNPI.suppressed,Object.fromEntries(Object.entries(d2.analytics).map(([k,v])=>[k,!!v.suppressed])));
T('kategori Airlines hanya yang dinilai ≥2 operator',d2.analytics.Airlines.categories.length>=3&&d2.analytics.Airlines.categories.every(c=>['01','02','03'].includes(c.kode)),d2.analytics.Airlines.categories);
T('MIN_GROUP = 2',c.MIN_GROUP===2);
T('find dengan token kosong ditolak',!env.get({action:'find',id:'x',token:''}).ok);
// cache berpotongan dengan nilai besar (>100 KB) dan potongan yang hilang
const big={x:'a'.repeat(250000)};c.cachePut_('uji_besar',big);
T('cache: nilai 250 KB tersimpan & terbaca utuh',JSON.stringify(c.cacheGet_('uji_besar'))===JSON.stringify(big));
env.cache.delete('uji_besar__1');
T('cache: potongan hilang → dibangun ulang (null), bukan data rusak',c.cacheGet_('uji_besar')===null);
T.done();
