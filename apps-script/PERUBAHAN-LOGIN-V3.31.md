# Pemasangan Login OTP & Perubahan Pelaporan (Apps Script V3.31)

Perubahan ini menambahkan **login dengan kode email (OTP)** untuk Pengisian DPRK, serta mengubah
Sistem Pelaporan: **daftar publik hanya memuat laporan Terverifikasi** dan pelapor dapat **mengecek
status** laporannya dengan nomor referensi + kode cek.

> Login **belum diwajibkan** setelah pemasangan. Anda bisa menguji dulu, mendaftarkan operator,
> lalu mewajibkan login dengan `aktifkanLoginWajib()` saat siap. Selama belum diwajibkan, cara lama
> (kode DPRK / kode edit) tetap berfungsi.

## Langkah pemasangan (±15 menit)

1. Buka spreadsheet → **Extensions → Apps Script**.
2. **Tambah file `Auth`**: klik **+ → Script**, beri nama `Auth`, tempel seluruh isi [`Auth.gs`](Auth.gs).
3. **Perbarui `Pelaporan`**: ganti seluruh isinya dengan [`Pelaporan.gs`](Pelaporan.gs) versi terbaru.
4. **Perbarui `Code.gs`** — pilih salah satu:
   - **Cara mudah:** ganti seluruh isi `Code.gs` dengan file `Code.gs` V3.31 yang dilampirkan bersama PR ini
     (sudah termasuk perubahan dashboard V3.30), **atau**
   - **Cara manual:** lakukan 7 penggantian kecil di bagian *Rincian perubahan Code.gs* di bawah.
5. Simpan (Ctrl+S). Di menu fungsi pilih **`setupLogin`** → **Run**.
   - Google akan meminta izin (kirim email, kelola pemicu). Klik *Advanced → Go to … → Allow*.
   - Hasil: sheet `USER_ACCESS` & `AUTH_SESSION` dibuat, dan **email Anda (pemilik script) menjadi Admin**.
6. **Deploy → Manage deployments → Edit ✏️ → Version: New version → Deploy.** URL tidak berubah.
7. *(Disarankan)* Jalankan **`pasangNotifikasiPersetujuan`** sekali, agar pendaftar otomatis menerima email
   saat Anda mengubah statusnya menjadi `Aktif` / `Ditolak`.
8. Buka website → klik **Masuk** → masukkan email Anda → masukkan kode dari email. Pastikan berhasil.

## ⚠️ Laporan lama perlu diverifikasi

Mulai versi ini daftar publik **hanya** menampilkan laporan berstatus `Terverifikasi`. Laporan yang ada
saat ini berstatus `Baru`, sehingga **daftar publik akan kosong** sampai Anda memeriksanya.
Buka sheet `LAPORAN_INSIDEN`, dan untuk laporan yang valid ubah kolom `statusVerifikasi` menjadi
`Terverifikasi` (isi juga `verifiedBy` dan `verifiedAt`).

## Mengelola pengguna (sheet `USER_ACCESS`)

| Kolom | Isi |
|---|---|
| `email` | Email login (huruf kecil) |
| `peran` | `Admin` (semua operator) atau `Operator` |
| `operatorIds` | ID operator yang boleh diisi, pisahkan dengan koma. Contoh: `BD-100` atau `BD-100, LPP-011` |
| `status` | `Menunggu` → ubah ke `Aktif` untuk menyetujui, `Ditolak`, atau `Nonaktif` untuk mencabut akses |

- **Operator mendaftar sendiri** lewat tombol *Masuk → Daftar sebagai perwakilan operator*. Admin menerima
  email ringkasan (maks. 1× per 3 jam). **Sebelum menyetujui, pastikan orang tersebut memang mewakili operator
  yang dipilih** (misalnya konfirmasi ke kantor operator atau dari domain email).
- **Menambah admin/staf DKP:** tambahkan baris baru langsung di sheet dengan `peran=Admin`, `status=Aktif`.
- **Mencabut akses:** ubah `status` menjadi `Nonaktif` — sesi yang sedang berjalan langsung tidak berlaku.

## Mewajibkan login

Setelah operator yang aktif sudah terdaftar, jalankan **`aktifkanLoginWajib`** dari editor. Sejak saat itu
Pengisian DPRK di website terkunci untuk yang belum masuk, dan server menolak simpan DPRK tanpa login.
Untuk mengembalikan: jalankan **`nonaktifkanLoginWajib`**.

## Aturan keamanan yang berlaku

- Kode 6 digit berlaku 10 menit, sekali pakai, maks. 5 kali salah. Maks. 5 kode per email per jam dan
  60 kode per jam untuk seluruh sistem (melindungi kuota email harian Apps Script).
- Sesi 12 jam, atau 30 hari bila pengguna mencentang *Ingat perangkat ini*. Server hanya menyimpan
  **hash** token sesi.
- Operator hanya dapat menyimpan/mengubah/memperbarui DPRK untuk `operatorIds` miliknya; semua aksi tercatat
  di `AUDIT_LOG` atas nama email pengguna (`actorType = USER_LOGIN`).
- Kuota email Apps Script: ±100/hari (akun Gmail) atau ±1.500/hari (Google Workspace).

## Rincian perubahan Code.gs (cara manual)

### 1. Di fungsi `doGet`, di bawah baris `if(a==="incidents")...`

Ganti:
```js
  if(a==="incidents")return json_({ok:true,data:cached_(INC_CACHE_KEY,incidentsPublic_)});
```
menjadi:
```js
  if(a==="incidents")return json_({ok:true,data:cached_(INC_CACHE_KEY,incidentsPublic_)});
  if(a==="incidentStatus")return incidentStatus_(p);
  if(a==="authConfig")return authConfig_();
```

### 2. Di fungsi `doPost`, tepat setelah baris `var p=JSON.parse(...),a=p.action||"create";`

Ganti:
```js
  var p=JSON.parse(e.postData.contents||"{}"),a=p.action||"create";

```
menjadi:
```js
  var p=JSON.parse(e.postData.contents||"{}"),a=p.action||"create";
  var gate=authGate_(p,a);if(gate)return gate;
  if(String(a).indexOf("auth")===0)return authPost_(p,a);

```

### 3. Di fungsi `getOrCreateDprk_`: pengguna yang login dan berhak = pemilik DPRK

Ganti:
```js
  var ownerMatch=!!d.dprkEditToken&&cleanToken_(p.dprkEditToken)===cleanToken_(d.dprkEditToken);
```
menjadi:
```js
  var ownerMatch=!!p._auth||(!!d.dprkEditToken&&cleanToken_(p.dprkEditToken)===cleanToken_(d.dprkEditToken));
```

### 4. Di fungsi `renewDprk_`: login menggantikan kode DPRK

Ganti:
```js
 if(!d||!cleanToken_(p.dprkEditToken)||cleanToken_(p.dprkEditToken)!==cleanToken_(d.dprkEditToken))return json_({ok:false,error:"Kode DPRK tidak valid atau bukan pemilik dokumen.",code:"FORBIDDEN"});
```
menjadi:
```js
 if(!d)return json_({ok:false,error:"DPRK operator ini tidak ditemukan.",code:"NOT_FOUND"});
 if(!p._auth&&(!cleanToken_(p.dprkEditToken)||cleanToken_(p.dprkEditToken)!==cleanToken_(d.dprkEditToken)))return json_({ok:false,error:"Kode DPRK tidak valid atau bukan pemilik dokumen.",code:"FORBIDDEN"});
```

### 5. Di fungsi `updateRisk_`: login menggantikan kode edit per skenario

Ganti:
```js
 if(!p.id||!p.editToken)return json_({ok:false,error:"id dan editToken wajib",code:"VALIDATION_ERROR"});
 var f=findRiskToken_(p.id,p.editToken);
```
menjadi:
```js
 if(!p.id||(!p.editToken&&!p._auth))return json_({ok:false,error:"id dan editToken wajib",code:"VALIDATION_ERROR"});
 var f=p._auth?findRiskById_(String(p.id)):findRiskToken_(p.id,p.editToken);
```

### 6. Di fungsi `audit_`: email pengguna dicatat sebagai pelaku

Ganti:
```js
actorType:p&&p.editToken?"RISK_EDIT_TOKEN":(p&&p.dprkEditToken?"DPRK_EDIT_TOKEN":"OPERATOR_SUBMIT"),actorId:(p&&p.operatorId)||"",
```
menjadi:
```js
actorType:p&&p._auth?"USER_LOGIN":(p&&p.editToken?"RISK_EDIT_TOKEN":(p&&p.dprkEditToken?"DPRK_EDIT_TOKEN":"OPERATOR_SUBMIT")),actorId:p&&p._auth?p._auth.email:((p&&p.operatorId)||""),
```

### 7. Baris pertama (penanda versi, opsional)

Ganti:
```js
// DPRK NASIONAL V3.29 HARDENED CORE
```
menjadi:
```js
// DPRK NASIONAL V3.31 HARDENED CORE + LOGIN OTP (lihat Auth.gs)
```
