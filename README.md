# ETA Product Matcher

Aplikasi Next.js (TypeScript) sederhana untuk mencocokkan **Purchase Order** dengan **Products Shopify** dan menghasilkan file Excel `products_with_eta.xlsx` berisi kolom ETA.

Semua pemrosesan dilakukan di **browser** — tidak ada data yang dikirim ke server.

## Install

```bash
npm install
```

Dependencies utama yang digunakan: `papaparse`, `dayjs`, `lodash`, `xlsx`, `file-saver`.

## Menjalankan

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

## Cara Pakai

1. Upload file **Purchase Order** (CSV atau XLSX) — harus memiliki kolom `Item` / `SKU` dan `Receipt date`.
2. Upload file **Products Shopify** (CSV atau XLSX) — harus memiliki kolom `Variant SKU` / `SKU`.
3. Klik **Process & Download**.
4. File `products_with_eta.xlsx` akan otomatis ter-download.

## Logika Pemrosesan

1. Hapus baris PO tanpa SKU.
2. Parse `Receipt date` (mendukung `DD/MM/YYYY`, `YYYY-MM-DD`, dll).
3. Filter: hanya baris PO dengan `Receipt date` >= hari ini.
4. Sort by `Receipt date` ascending, lalu `Order number`.
5. Group by SKU, ambil baris pertama → ETA terdekat.
6. Inner-join dengan Products pada SKU.
7. Format kolom `ETA` ke `DD/MM/YYYY`.
8. Export ke Excel.
