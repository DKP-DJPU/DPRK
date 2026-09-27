# Perubahan Apps Script V3.30 — KPI Dashboard

Perubahan ini hanya mengganti **satu fungsi**, yaitu `dashboard_()` di `Code.gs`. Fungsi lain tidak berubah.

## Yang berubah

| KPI | Sebelum (V3.29) | Sesudah (V3.30) |
|---|---|---|
| Sudah Mengisi | Semua operator yang punya DPRK Aktif, termasuk operator **nonaktif** | Hanya operator **aktif** yang punya DPRK Aktif |
| Completion Rate | Bilangan bulat (`completionRate`, mis. 4) | Ditambah `completionRatePct` dengan 1 desimal (mis. 3.6). Field lama tetap dikirim. |
| Risiko Tinggi | Jumlah **skenario** berating Tinggi (`highRisk`) | Ditambah `highRiskOperators`: jumlah **operator** aktif dengan ≥1 skenario Tinggi. `highRisk` tetap dikirim, `highRiskScenarios` sama dengan `highRisk`. |
| Risiko Tinggi per jenis | `byType[].risk`, jumlah skenario | Ditambah `byType[].riskOperators`, jumlah operator |
| Kaji Ulang Mendekat | Memakai `tanggalWajibPembaruan` (pengesahan + 2 tahun) | Memakai **`tanggalKajiUlang`** dalam 30 hari ke depan, sama dengan tabel *Monitoring Kaji Ulang* (`review_`) dan email pengingat |

Field lama tetap ada, jadi urutan deploy tidak berpengaruh: frontend baru bekerja dengan server lama, dan sebaliknya.

## Langkah pemasangan

1. Buka spreadsheet, lalu **Extensions → Apps Script → Code.gs**.
2. Cari `function dashboard_(){` dan ganti seluruh fungsi itu, sampai `}` penutupnya, dengan kode di bawah.
3. Simpan. Lalu **Deploy → Manage deployments → Edit ✏️ → Version: New version → Deploy**. URL tidak berubah.
4. Dashboard di-cache sebentar. Angka baru muncul setelah cache kedaluwarsa (beberapa menit).

```js
function dashboard_(){
 var ops=objs_(sheet_(SHEETS.OP,H.OP)).filter(function(o){return String(o.aktif).toLowerCase()!=="false"}),d=objs_(sheet_(SHEETS.DPRK,H.DPRK)),raw=objs_(sheet_(SHEETS.RISK,H.RISK));
 var r=latestCurrentRiskRows_(raw),filled={},activeId={};
 ops.forEach(function(o){activeId[String(o.operatorId)]=true});
 d.filter(function(x){return x.status==="Aktif"}).forEach(function(x){filled[x.operatorId]=true});
 // V3.30: hanya operator AKTIF yang dihitung "Sudah Mengisi" (DPRK milik operator nonaktif tidak ikut).
 var total=ops.length,fn=ops.filter(function(o){return filled[o.operatorId]}).length,dist={"Tinggi":0,"Menengah-Tinggi":0,"Menengah":0,"Menengah-Rendah":0,"Rendah":0};
 r.forEach(function(x){if(dist.hasOwnProperty(x.risikoRating))dist[x.risikoRating]++});
 // V3.30: Risiko Tinggi per operator — operator aktif yang punya minimal 1 skenario berating Tinggi.
 var highOps={};r.forEach(function(x){if(x.risikoRating==="Tinggi"&&activeId[String(x.operatorId)])highOps[String(x.operatorId)]=x.jenisOperator||""});
 var cats={};r.forEach(function(x){var k=String(x.kategori||"").split(" - ")[0];if(!/^\d{2}$/.test(k))return;if(!cats[k])cats[k]={sum:0,n:0};cats[k].sum+=Number(x.risikoNilai)||0;cats[k].n++});
 var cl=[];for(var i=1;i<=19;i++){var k=("0"+i).slice(-2),c=cats[k]||{sum:0,n:0};cl.push({kode:k,avg:c.n?Number((c.sum/c.n).toFixed(2)):0,n:c.n})}
 var byType=["Bandar Udara","Airlines","LPPNPI","Regulated Agent"].map(function(t){var oo=ops.filter(function(o){return o.jenisOperator===t}),ff=oo.filter(function(o){return filled[o.operatorId]}).length,hh=r.filter(function(x){return x.jenisOperator===t&&x.risikoRating==="Tinggi"}).length,ho=oo.filter(function(o){return highOps.hasOwnProperty(String(o.operatorId))}).length;return{jenisOperator:t,total:oo.length,filled:ff,risk:hh,riskOperators:ho}});
 // V3.30: Kaji Ulang Mendekat memakai Tanggal Kaji Ulang — sama dengan tabel Monitoring Kaji Ulang (review_) dan email pengingat.
 var rd=review_().length;
 return{kpi:{totalEntities:total,filledEntities:fn,unfilledEntities:Math.max(0,total-fn),completionRate:total?Math.round(fn/total*100):0,completionRatePct:total?Number((fn/total*100).toFixed(1)):0,highRisk:dist.Tinggi,highRiskScenarios:dist.Tinggi,highRiskOperators:Object.keys(highOps).length,reviewDue:rd,totalRisks:r.length},byType:byType,riskDistribution:dist,categories:cl,trend:trend_()}
}
```
