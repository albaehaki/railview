# RailView

Peta pantau publik Jabodetabek: kereta bergerak di atas rel, jalan bertingkat (tol layang, arteri, gang), JPO, dan kamera CCTV.

Dibuat dengan React 19 + Vite + Three.js.

## Jalankan

```bash
npm install
npm run dev
```

## Bangun

```bash
npm run build
```

## Warna gedung

Panel kiri → **Warna gedung**: tiga tingkat (rendah, sedang, tinggi), lima preset, dan tombol acak. Warna diganti langsung pada material Three.js tanpa memuat ulang peta.

## Catatan

Data di aplikasi ini masih contoh. Sumber data publik yang sudah dipetakan (belum disambungkan):
- 168railway — stasiun, depo, posisi kereta
- JakCCTV, CCTV Bogor, CCTV Bekasi, CCTV Tangerang, CCTV stasiun Kemenhub

Atribusi wajib dicantumkan bila data disambungkan. Jangan menembus login/paywall, dan jangan merekam siaran kamera.
