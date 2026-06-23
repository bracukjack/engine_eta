# Feature Plan: Omtrek Calculator
**Devtools Internal — Modul Baru pada Sidebar**

---

## 1. Overview

Menambahkan fitur **Omtrek Calculator** ke dalam devtools Next.js kantor sebagai menu baru di sidebar. Fitur ini memungkinkan tim untuk:
- Menghitung omtrek (girth) satu item secara manual
- Upload file CSV produk dan filter item yang melewati batas omtrek tertentu
- Export hasilnya sebagai CSV baru

**Sumber dimensi:** kolom Packaging (bukan Product).

**Filter wajib:** hanya baris dengan `Class_04Description` yang cocok dengan `"BB_Living"` (case-insensitive) yang diproses. Baris lain dibuang sebelum kalkulasi.

Formula yang digunakan:
```
Omtrek = MAX(L, W, H) + 2 × MEDIAN(L, W, H) + 2 × MIN(L, W, H)
```

---

## 2. Lokasi File di Project

```
src/
├── app/
│   └── omtrek/
│       └── page.tsx                  ← Route utama fitur
├── components/
│   └── omtrek/
│       ├── OmtrekCalculator.tsx      ← Form input manual (1 item)
│       ├── OmtrekBulkUpload.tsx      ← Upload & proses CSV
│       ├── OmtrekResultTable.tsx     ← Tabel hasil filter
│       └── OmtrekSummaryCard.tsx     ← Kartu ringkasan statistik
├── lib/
│   └── omtrek.ts                     ← Logic kalkulasi & CSV parsing
└── types/
    └── omtrek.ts                     ← Type definitions
```

---

## 3. Sidebar Navigation

Tambahkan entry berikut ke konfigurasi sidebar yang sudah ada (sesuaikan dengan pola yang dipakai modul lain — apakah array di `nav.config.ts`, `sidebar.ts`, atau langsung di komponen layout):

```ts
{
  label: "Omtrek Calculator",
  href: "/omtrek",
  icon: "Ruler",          // dari lucide-react, konsisten dengan ikon modul lain
  group: "Logistics",     // masukkan ke group yang relevan, atau buat group baru
}
```

> **Catatan desain:** Ikuti pola penamaan group, ikon, dan urutan yang sudah ada di sidebar. Jika modul lain pakai `PackageIcon` atau `BoxIcon`, pertimbangkan konsistensi tema logistik/produk.

---

## 4. Halaman Utama (`/omtrek`)

Layout dua-mode dengan tab atau toggle:

```
┌──────────────────────────────────────────────┐
│  Omtrek Calculator                            │
│  ─────────────────────────────────────────── │
│  [ Single Item ]  [ Bulk CSV ]               │  ← tab/toggle
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │  Mode aktif di sini                  │   │
│  └──────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

---

## 5. Mode: Single Item Calculator

Form input tiga field (L, W, H dalam cm) dengan hasil real-time.

```
┌─────────────────────────────────┐
│  L (cm)  [________]             │
│  W (cm)  [________]             │
│  H (cm)  [________]             │
│                                 │
│  Omtrek: 245.0 cm               │
│  Status: ✅ Di bawah batas       │
│                                 │
│  Batas: [___250___] cm          │
└─────────────────────────────────┘
```

- Kalkulasi langsung saat user mengetik (tanpa tombol submit)
- Tampilkan breakdown: mana L/W/H yang jadi MAX, MEDIAN, MIN
- Status badge berubah warna: hijau (lolos) / merah (melewati batas)

---

## 6. Mode: Bulk CSV Upload

```
┌──────────────────────────────────────────────────┐
│  Drop CSV di sini atau klik untuk upload         │
│  ────────────────────────────────────────────── │
│  Batas Omtrek: [___250___] cm    [Proses CSV]   │
│                                                  │
│  ┌────────────────────────────────────────────┐ │
│  │ Ringkasan:                                 │ │
│  │  Total baris  : 8.000                      │ │
│  │  BB_LIVING    : 6.575  (dari total file)   │ │
│  │  Lolos        : 4.543  (69.1%)             │ │
│  │  Melewati     : 2.032  (30.9%)  ← merah   │ │
│  └────────────────────────────────────────────┘ │
│                                                  │
│  [Tampilkan: Semua ▼]  [Export hasil ⬇]        │
│                                                  │
│  Tabel hasil...                                  │
└──────────────────────────────────────────────────┘
```

### Kolom tabel hasil:

| Code | Description | Class_04Description | L (cm) | W (cm) | H (cm) | Omtrek (cm) | Status |
|------|-------------|---------------------|--------|--------|--------|-------------|--------|
| ...  | ...         | BB_LIVING           | ...    | ...    | ...    | ...         | ✅ / ❌ |

> Kolom `Class_04Description` ditampilkan agar user bisa memverifikasi bahwa filter berjalan benar.

- Sortable per kolom (khususnya Omtrek)
- Filter tampilan: "Semua", "Melewati batas", "Lolos"
- Export CSV hanya berisi item yang melewati batas

---

## 7. Logic: `src/lib/omtrek.ts`

```ts
export function hitungOmtrek(l: number, w: number, h: number): number {
  const vals = [l, w, h].sort((a, b) => a - b);
  // vals[0] = min, vals[1] = median, vals[2] = max
  return vals[2] + 2 * vals[1] + 2 * vals[0];
}

export function parseNilai(str: string): number {
  // Handle format Eropa: "13,5" → 13.5
  return parseFloat(str.replace(',', '.'));
}

export function prosesCSV(rows: RawRow[], threshold: number): OmtrekResult[] {
  return rows
    // Filter wajib: hanya baris BB_Living (case-insensitive)
    .filter(row => String(row['Class_04Description'] ?? '').trim().toLowerCase() === 'bb_living')
    .map(row => {
      const l = parseNilai(row['Extra field:  Packaging - L (cm)'] ?? '');
      const w = parseNilai(row['Extra field: Packaging - W (cm)'] ?? '');
      const h = parseNilai(row['Extra field:  Packaging - H (cm)'] ?? '');
      if (isNaN(l) || isNaN(w) || isNaN(h)) return null;
      const omtrek = hitungOmtrek(l, w, h);
      return { ...row, l, w, h, omtrek, class04: String(row['Class_04Description'] ?? '').trim(), melebihiBatas: omtrek > threshold };
    })
    .filter(Boolean) as OmtrekResult[];
}
```

---

## 8. Types: `src/types/omtrek.ts`

```ts
export interface OmtrekResult {
  code: string;
  description: string;
  class04: string;        // selalu "BB_LIVING" (hasil filter)
  l: number;
  w: number;
  h: number;
  omtrek: number;
  melebihiBatas: boolean;
}

export interface OmtrekSummary {
  totalFile: number;      // total baris di file sebelum filter
  totalBBLiving: number;  // baris yang lolos filter BB_LIVING
  lolos: number;
  melewati: number;
}
```

---

## 9. CSV Parsing di Client

Gunakan library `papaparse` (ringan, tidak perlu backend):

```bash
npm install papaparse
npm install -D @types/papaparse
```

```ts
import Papa from 'papaparse';

Papa.parse(file, {
  header: true,
  encoding: 'UTF-16',         // sesuai file LogItemSearch.csv
  delimiter: '\t',            // tab-separated
  skipEmptyLines: true,
  complete: (results) => {
    const processed = prosesCSV(results.data, threshold);
    setResults(processed);
  }
});
```

> **Penting:** File CSV sumber menggunakan encoding **UTF-16** dan delimiter **tab**. Pastikan ini di-handle di parser.

---

## 10. Export CSV

```ts
import Papa from 'papaparse';

function exportCSV(data: OmtrekResult[]) {
  const csv = Papa.unparse(data.map(r => ({
    'Code': r.code,
    'Description': r.description,
    'L (cm)': r.l,
    'W (cm)': r.w,
    'H (cm)': r.h,
    'Omtrek (cm)': r.omtrek,
    'Status': r.melebihiBatas ? 'Melewati Batas' : 'Lolos',
  })));
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `omtrek-results-${Date.now()}.csv`;
  a.click();
}
```

---

## 11. Design & Konsistensi UI

> Karena ini adalah devtools internal dengan modul yang sudah ada, **ikuti design system yang sudah berjalan** — jangan import library UI baru jika project sudah punya pilihan (shadcn/ui, Tailwind, dsb).

Checklist konsistensi:
- [ ] Gunakan komponen `Button`, `Input`, `Badge`, `Card` dari library yang sudah dipakai
- [ ] Ikon dari `lucide-react` (sudah pasti ada di Next.js modern)
- [ ] Warna status (merah/hijau) pakai token warna yang sudah didefinisikan (`destructive`, `success`, atau sesuai tema)
- [ ] Ukuran font, padding, border-radius mengikuti komponen yang sudah ada
- [ ] Sidebar entry mengikuti pola group dan label yang sama dengan modul lain
- [ ] Loading state saat proses CSV menggunakan skeleton atau spinner yang konsisten dengan modul lain

---

## 12. Urutan Implementasi

1. **Buat types** → `src/types/omtrek.ts`
2. **Buat logic** → `src/lib/omtrek.ts` + unit test sederhana
3. **Buat komponen Single Item** → `OmtrekCalculator.tsx` (paling mudah, validasi formula dulu)
4. **Tambah sidebar entry** → sesuaikan dengan pola nav yang sudah ada
5. **Buat halaman** → `src/app/omtrek/page.tsx` dengan tab Single/Bulk
6. **Buat Bulk Upload** → `OmtrekBulkUpload.tsx` + `OmtrekResultTable.tsx`
7. **Tambah export CSV**
8. **Polish:** summary card, status badge, sort tabel

---

## 13. Edge Cases yang Perlu Di-handle

| Case | Handling |
|------|----------|
| Salah satu dimensi Packaging kosong/null | Skip row, jangan crash |
| Nilai desimal dengan koma (`13,5`) | Replace `,` → `.` sebelum `parseFloat` |
| File bukan CSV / encoding salah | Tampilkan error message yang jelas |
| Semua item lolos / semua melewati | Empty state yang informatif |
| Nilai dimensi sangat besar (data error, misal 50.000 cm) | Tampilkan apa adanya, beri tanda visual jika ekstrem |
| Threshold diubah → recalculate tanpa re-upload | Simpan raw results di state, filter ulang di client |
| **Tidak ada baris `BB_LIVING` sama sekali** | Tampilkan pesan: "Tidak ada baris BB_LIVING ditemukan di file ini. Pastikan kolom `Class_04Description` ada dan berisi nilai `BB_LIVING`." |
| File tidak punya kolom `Class_04Description` | Seluruh baris di-skip, tampilkan pesan di atas |

---

*Plan ini bersifat standalone — tidak ada dependency backend baru. Semua kalkulasi dan parsing dilakukan di client side.*
