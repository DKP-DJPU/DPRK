// Backup harian (V3.35): salinan ke folder Drive pribadi, tanpa sheet login, retensi 30 hari.
const { newEnv, seedAll, tester } = require('./_lib');
const T = tester('backup');
const DAY = 86400000, START = Date.parse('2026-10-20T19:00:00Z'); // 02.00 WIB
const env = newEnv({ now: START }), c = env.ctx;
seedAll(env);
c.setupLogin();
// pastikan sheet login ada & berisi
env.post({ action: 'authRequestCode', email: 'owner@dkp.go.id' });
env.post({ action: 'authVerify', email: 'owner@dkp.go.id', code: env.lastCode('owner@dkp.go.id') });
c.sheet_('ACCESS_TOKEN', c.H.ACCESS);
T('prasyarat: sheet login berisi', env.sheets.AUTH_SESSION && env.sheets.AUTH_SESSION._data.length > 1, Object.keys(env.sheets));

const msg = c.pasangBackupHarian();
const tr = env.triggers.filter(t => t.fn === 'backupHarian');
T('pasangBackupHarian: 1 trigger harian jam 02', tr.length === 1 && tr[0].kind === 'time' && tr[0].days === 1 && tr[0].hour === 2, tr);
c.pasangBackupHarian();
T('dipasang ulang tidak menggandakan trigger', env.triggers.filter(t => t.fn === 'backupHarian').length === 1);
const folders = Object.values(env.drive.folders);
T('folder "SI-RISK BACKUP" dibuat sekali & dicatat di properti', folders.length === 1 && folders[0].getName() === 'SI-RISK BACKUP' && env.props.BACKUP_FOLDER_ID === folders[0].getId(), folders.map(f => f.getName()));
const files = Object.values(env.drive.files).filter(f => !f._trashed);
T('backup langsung dibuat saat dipasang (2 salinan setelah dipasang 2x)', files.length === 2 && files.every(f => f._parent === folders[0].getId()), files.map(f => [f._name, f._parent]));
T('nama berkas memuat tanggal WIB', files[0].getName() === 'SI-RISK BACKUP 2026-10-21 0200', files[0].getName());
const copy = env.created[files[0].getId()], names = copy.getSheets().map(s => s.getName()).sort();
T('salinan memuat sheet data (RISK_ASSESSMENT, MASTER_DPRK, USER_ACCESS, LAPORAN_INSIDEN)', ['RISK_ASSESSMENT', 'MASTER_DPRK', 'USER_ACCESS', 'LAPORAN_INSIDEN', 'MASTER_OPERATOR'].every(n => names.includes(n)), names);
T('sheet login (AUTH_SESSION, ACCESS_TOKEN) TIDAK ikut', !names.includes('AUTH_SESSION') && !names.includes('ACCESS_TOKEN'), names);
T('sheet bawaan "Sheet1" dibuang', !names.some(n => /^Sheet1$|__bawaan_/.test(n)), names);
T('isi RISK_ASSESSMENT sama persis', JSON.stringify(copy.getSheetByName('RISK_ASSESSMENT')._data) === JSON.stringify(env.sheets.RISK_ASSESSMENT._data));
T('pesan ringkas dikembalikan', /Backup 2026-10-21 0200 selesai: \d+ sheet/.test(msg), msg);

// --- retensi: 40 hari backup harian
for (let d = 1; d <= 40; d++) { env.setNow(START + d * DAY); c.backupHarian(); }
const live = Object.values(env.drive.files).filter(f => !f._trashed && /^SI-RISK BACKUP /.test(f._name));
const oldest = Math.min(...live.map(f => f._created.getTime()));
T('retensi: salinan > 30 hari dipindah ke Sampah (bukan dihapus permanen)', live.length === 31 && (START + 40 * DAY - oldest) <= 30 * DAY && Object.values(env.drive.files).some(f => f._trashed), [live.length, (START + 40 * DAY - oldest) / DAY]);
T('folder tidak dibuat ulang', Object.keys(env.drive.folders).length === 1);
// berkas lain di folder tidak disentuh
const other = Object.values(env.drive.files)[0];
const foreign = { ...other };
env.drive.files.X1 = Object.assign(Object.create(null), { _id: 'X1', _name: 'Catatan admin', _mime: 'application/pdf', _parent: folders[0].getId(), _trashed: false, _created: new Date(START - 400 * DAY), getId: () => 'X1', getName: () => 'Catatan admin', getMimeType: () => 'application/pdf', getDateCreated() { return this._created; }, setTrashed(t) { this._trashed = t; } });
env.setNow(START + 41 * DAY); c.backupHarian();
T('berkas lain di folder (bukan backup) tidak dibuang', env.drive.files.X1._trashed === false);

// --- minimal 7 salinan selalu disimpan meski semuanya tua (mis. trigger sempat mati lama)
env.setNow(START + 200 * DAY);
const before = Object.values(env.drive.files).filter(f => !f._trashed && /^SI-RISK BACKUP /.test(f._name)).length;
c.backupHarian();
const after = Object.values(env.drive.files).filter(f => !f._trashed && /^SI-RISK BACKUP /.test(f._name)).length;
T('minimal 7 salinan terbaru selalu disimpan', after === 7, [before, after]);

// --- folder terhapus → dibuat lagi
folders[0].setTrashed(true);
c.backupHarian();
T('folder dibuang ke Sampah → dibuat folder baru', Object.values(env.drive.folders).filter(d => !d._trashed).length === 1 && env.props.BACKUP_FOLDER_ID !== folders[0].getId());

// --- gagal → email ke pemilik + error dilempar (trigger tercatat gagal) + tidak meninggalkan berkas setengah jadi
const env2 = newEnv({ now: START, failCreate: 'Service Spreadsheets failed' }); seedAll(env2, { risks: false, incidents: false });
let thrown = false; try { env2.ctx.backupHarian(); } catch (e) { thrown = true; }
T('gagal: error dilempar & email pemberitahuan ke pemilik', thrown && env2.mails.some(m => /Backup harian gagal/.test(m.subject) && m.to === 'owner@dkp.go.id'), env2.mails);
const env3 = newEnv({ now: START, quota: 2 }); seedAll(env3, { risks: false, incidents: false });
env3.ctx.SpreadsheetApp.getActive().getSheets = () => { throw new Error('boom'); };
try { env3.ctx.backupHarian(); } catch (e) {}
T('gagal setelah salinan dibuat: salinan setengah jadi dibuang; kuota email rendah → tidak kirim email', Object.values(env3.drive.files).every(f => f._trashed) && env3.mails.length === 0, [Object.values(env3.drive.files).map(f => f._trashed), env3.mails.length]);
// lock sibuk tetap backup
const env4 = newEnv({ now: START, lockBusy: true }); seedAll(env4);
T('lock sibuk (simpan berjalan lama) → backup tetap dibuat', /selesai/.test(env4.ctx.backupHarian()));
T.done();
