# Prompt: Association Rules Tool — Next.js Dashboard

## Konteks

Tambahkan tool baru bernama **"Association Rules"** ke dashboard Next.js yang sudah ada (BazarBizar Ops).
Tool ini harus muncul di sidebar menggantikan slot "coming soon" yang sebelumnya.
Semua komputasi berjalan **100% client-side** di browser via **Web Worker** — tidak ada backend, tidak ada server.
Data real bisa mencapai **2GB**, jadi seluruh pipeline harus dirancang untuk streaming dan chunking.

---

## Struktur file yang perlu dibuat

```
/app
  /association-rules
    page.tsx                  ← halaman utama tool

/components
  /association-rules
    FileUploadZone.tsx         ← drag-drop upload sales orders CSV
    FilterPanel.tsx            ← filter: channel, status, date range, min support/confidence/lift
    RulesTable.tsx             ← tabel hasil rules (virtualized)
    BundleCards.tsx            ← kartu rekomendasi bundle + diskon
    DiscountDecisionBadge.tsx  ← badge zona: hijau/kuning/ungu/abu
    MetricsSummary.tsx         ← stat cards: total orders, rules found, strong bundles
    ProgressBar.tsx            ← progress streaming dari Web Worker

/workers
  association.worker.ts        ← semua komputasi berat di sini

/lib
  /association-rules
    parser.ts                  ← parse CSV sales orders
    apriori.ts                 ← implementasi FP-Growth/Apriori
    discount.ts                ← logika zona diskon
    types.ts                   ← semua TypeScript interfaces
```

---

## Input File

### Format file: `SlsSalesOrdersSearch.csv`
- **Encoding**: UTF-16 LE with BOM
- **Separator**: tab (`\t`)
- **Size**: bisa mencapai 2GB — harus di-stream, jangan load sekaligus ke memori

### Kolom yang tersedia dan kegunaannya:

| Kolom | Tipe | Kegunaan untuk Association Rules |
|-------|------|----------------------------------|
| `Header` | string | Filter baris: `"H"` = header order (skip), `NaN` = baris item |
| `Order number` | number | **Transaction ID** — kunci utama untuk membentuk basket |
| `Item` | string | **SKU** — item yang dibeli. Skip nilai: `"T"`, `"TRANSPORT"`, `"Divers"`, `""`, `null` |
| `Item descriptionDescription` | string | Nama produk untuk tampilan UI |
| `Order date` | string `DD-MM-YYYY` | Untuk filter rentang tanggal dan analisis seasonal |
| `Order status` | string | Filter: gunakan hanya `"Complete"` secara default. Opsional include `"Partial"` |
| `Ordered byDescription` | string | Nama customer — untuk segmentasi rules per customer |
| `Deliver toDescription` | string | Channel/destinasi — untuk filter rules per channel (B2C, B2B, dropship, dll) |
| `Sales personDescription` | string | Sales person — segmentasi opsional |
| `Net price` | string (European decimal) | Nilai transaksi per item — format `"119,95"` parse ke float |
| `Quantity` | string (European decimal) | Jumlah unit — format `"1,00"` parse ke float |
| `Reference` | string | Berisi pola seperti `"BBA_06121_PAID_2026/02/02"` — bisa dipakai deteksi paid/unpaid |
| `CostPriceFC` | string (European decimal) | Cost price item — untuk kalkulasi margin diskon bundle |

### Kolom yang TIDAK dipakai untuk association rules:
`OrderDiscountAmountInclVat`, `OrderDiscountPercentage`, `OrderDiscountAmountExclVat`,
`Invoice toCode`, `Invoice toDescription`, `CostPriceFC` (kecuali fitur margin calculator),
`Unit price`, `Discount`, `Unit:Code`, `VAT code`, `VATPercentage`, `Currency`

---

## Preprocessing Pipeline (di dalam Web Worker)

### Step 1: Parse CSV dengan streaming
```typescript
// JANGAN load seluruh file sekaligus — gunakan ReadableStream + TextDecoderStream
// File bisa 2GB, browser akan crash jika di-load sekaligus

async function* streamCSV(file: File): AsyncGenerator<string[]> {
  const stream = file.stream()
  const reader = stream.pipeThrough(new TextDecoderStream('utf-16')).getReader()
  // Parse baris per baris, emit array kolom per baris
  // Kirim progress setiap 10.000 baris
}
```

### Step 2: Build transaction basket
```typescript
// Satu "transaksi" = satu Order number yang berisi semua SKU-nya
// Aturan filtering:
const SKIP_ITEMS = new Set(['T', 'TRANSPORT', 'Divers', 'CNCL006'])
const VALID_STATUSES = new Set(['Complete']) // default, bisa include 'Partial'

// Struktur basket:
type Basket = Map<number, {
  items: string[]           // array SKU
  itemNames: Map<string, string>  // SKU → nama produk
  date: Date
  customer: string
  channel: string
  totalValue: number
}>
```

### Step 3: Filter opsional (semua kombinasi bisa aktif bersamaan)
- **Date range**: filter `Order date` antara tanggal mulai dan selesai
- **Order status**: `Complete` saja (default) atau tambah `Partial`
- **Channel**: filter berdasarkan `Deliver toDescription` — contoh: "Bazar Bizar B2C", "Maisons du Monde"
- **Customer segment**: filter berdasarkan `Ordered byDescription`
- **Min basket size**: hanya order dengan ≥ 2 item (default)
- **Exclude SKU patterns**: exclude item yang mengandung kata tertentu di nama

### Step 4: Jalankan Apriori / FP-Growth
```typescript
// Implementasi FP-Growth lebih efisien dari Apriori untuk data besar
// Untuk 2GB data dengan ribuan SKU, FP-Growth adalah pilihan yang tepat

interface Rule {
  antecedent: string[]    // [SKU_A] atau [SKU_A, SKU_B]
  consequent: string[]    // [SKU_B]
  support: number         // 0–1
  confidence: number      // 0–1
  lift: number            // > 1 = positif, < 1 = negatif
  count: number           // jumlah transaksi aktual
  antecedentNames: string[]
  consequentNames: string[]
}

// Parameter yang bisa dikonfigurasi user:
interface MiningParams {
  minSupport: number      // default: 0.01 (1%) — rendah karena katalog besar
  minConfidence: number   // default: 0.3 (30%)
  minLift: number         // default: 1.0
  maxItemsetSize: number  // default: 3 (max kombinasi yang dicari)
}
```

### Step 5: Hitung discount zone per rule
```typescript
// Berdasarkan confidence dan lift, tentukan zona diskon:

function getDiscountZone(confidence: number, lift: number): DiscountZone {
  if (confidence >= 0.8 && lift >= 1.5) return 'green'   // Tidak perlu diskon
  if (confidence >= 0.6 && lift >= 1.2) return 'yellow'  // Diskon moderat 5–15%
  if (lift >= 1.2 && confidence < 0.6)  return 'purple'  // Diskon agresif 15–25%
  return 'gray'                                           // Skip — tidak ada asosiasi
}

// Label dan aksi per zona:
const ZONE_CONFIG = {
  green:  { label: 'Tidak perlu diskon',   discountRange: [0, 5],   action: 'Tampilkan sebagai bundle tanpa potongan' },
  yellow: { label: 'Diskon bundle moderat', discountRange: [5, 15],  action: 'Tampilkan di cart page saat A masuk keranjang' },
  purple: { label: 'Diskon agresif',        discountRange: [15, 25], action: 'Campaign khusus untuk break habit beli terpisah' },
  gray:   { label: 'Skip',                  discountRange: [0, 0],   action: 'Jangan buat bundle — tidak ada asosiasi nyata' },
}
```

### Step 6: Post ke main thread dengan progress
```typescript
// Web Worker harus kirim progress setiap langkah:
type WorkerMessage =
  | { type: 'progress'; step: string; pct: number; message: string }
  | { type: 'done'; rules: Rule[]; stats: MiningStats }
  | { type: 'error'; message: string }

// Contoh progress updates:
// { type: 'progress', step: 'parse',   pct: 20,  message: 'Membaca 50.000 baris...' }
// { type: 'progress', step: 'build',   pct: 40,  message: 'Membangun 1.200 basket...' }
// { type: 'progress', step: 'mine',    pct: 70,  message: 'Mining frequent itemsets...' }
// { type: 'progress', step: 'compute', pct: 90,  message: 'Menghitung confidence & lift...' }
// { type: 'done',     rules: [...],    stats: { totalOrders, basketsUsed, rulesFound, ... } }
```

---

## UI Layout

### Layout halaman (dua panel)

```
┌─────────────────────────────────────────────────────────────────┐
│  SIDEBAR (sama dengan tool Shopify Processor)                    │
├──────────────┬──────────────────────────────────────────────────┤
│              │  TOP BAR: stat cards + Run button + progress      │
│  LEFT PANEL  ├──────────────────────────────────────────────────┤
│  Upload +    │                                                   │
│  Filter      │  MAIN PANEL: Rules table + Bundle cards           │
│              │                                                   │
└──────────────┴──────────────────────────────────────────────────┘
```

### Left panel — Upload & Filter

**File upload zone:**
- Satu file drop zone untuk `SlsSalesOrdersSearch.csv`
- Tampilkan nama file, size, dan status (belum upload / siap / processing)
- Warna amber saat file terpilih, hijau saat selesai diproses

**Filter panel (collapsible sections):**

```
▾ Date range
  [01/02/2026] → [27/03/2026]

▾ Order status
  [x] Complete   [ ] Partial   [ ] Open

▾ Channel (Deliver to)
  [ ] All
  [x] Bazar Bizar B2C
  [x] Maisons du Monde
  [ ] La Redoute
  ... (list dinamis dari data)

▾ Customer segment
  [ ] All customers
  Search: [____________]

▾ Mining parameters
  Min support    [====|----] 1%
  Min confidence [===|-----] 30%
  Min lift       [=|-------] 1.0
  Max itemset    [==|------] 3 items

▾ Exclude SKU
  Skip items containing: [T] [TRANSPORT] [Divers] [+]
```

**Run button:**
- Besar, full-width di bawah filter
- Disabled jika belum ada file
- Saat running: tampilkan progress bar + step label
- Saat selesai: tampilkan waktu komputasi

### Top bar — Summary stats

4 metric cards:
- **Total orders dianalisis** (setelah filter)
- **Basket dengan ≥2 item** (orders yang berguna untuk rules)
- **Rules ditemukan** (setelah threshold)
- **Bundle potensial** (zona hijau + kuning)

### Main panel — Tab view

**Tab 1: Rules Table**

Kolom tabel:
| Kolom | Keterangan |
|-------|-----------|
| Antecedent | SKU + nama produk (jika beli A...) |
| → Consequent | SKU + nama produk (...maka beli B) |
| Support | % transaksi yang berisi A+B |
| Confidence | % pembeli A yang juga beli B |
| Lift | Kekuatan asosiasi (>1 = positif) |
| Count | Jumlah transaksi aktual |
| Zona | Badge warna: hijau/kuning/ungu/abu |
| Aksi diskon | Rekomendasi diskon % |

- Virtualized dengan `react-window` (handle 10.000+ rules)
- Sort by: lift (default), confidence, support, count
- Filter bar: zona saja, search SKU
- Row hover: tampilkan detail produk

**Tab 2: Bundle Cards**

Grid kartu rekomendasi, dikelompokkan per zona:

```
┌─────────────────────────────────┐
│  ZONA HIJAU — tidak perlu diskon │
├─────────────────────────────────┤
│ ┌───────────┐  ┌───────────┐   │
│ │ SKU_A     │→ │ SKU_B     │   │
│ │ Nama Prod │  │ Nama Prod │   │
│ │ Conf: 85% │  │ Lift: 1.8 │   │
│ │ Aksi: FBT │  │           │   │
│ └───────────┘  └───────────┘   │
└─────────────────────────────────┘
```

- "FBT" = Frequently Bought Together
- Setiap kartu punya tombol copy rule untuk dipakai di Shopify

**Tab 3: Discount Planner** *(opsional, nice to have)*

Kalkulator interaktif per rule:
- Input margin produk A dan B
- Hitung batas diskon maksimal yang aman (margin tidak < 20%)
- Output: harga bundle, margin akhir, estimasi uplift

**Tab 4: Seasonal Heatmap** *(opsional, nice to have)*

Jika data memiliki rentang minimal 60 hari:
- Heatmap: bulan vs SKU, warna = frekuensi co-purchase
- Identifikasi kombinasi yang hanya muncul di bulan tertentu

---

## Export

Dua tombol di atas tabel:
- **Export Rules CSV** — semua rules dengan semua kolom metrik
- **Export Bundle Suggestions** — hanya zona hijau + kuning, format siap upload ke Shopify metafields

Format bundle export:
```csv
SKU_A,SKU_B,Bundle Name,Confidence,Lift,Discount Zone,Recommended Discount %
BAYU010N-XL-110,FL-NW-001,Pendant + Fitting Bundle,0.85,1.8,green,0
...
```

---

## Performance Requirements

### Untuk file 2GB:
- **Jangan** gunakan `FileReader.readAsText()` — akan crash
- **Gunakan** `File.stream()` + `ReadableStream` + `TextDecoderStream('utf-16')`
- Parse baris per baris, akumulasi basket di `Map`
- Kirim progress ke main thread setiap 10.000 baris
- **FP-Growth** jauh lebih efisien dari Apriori untuk katalog besar (1000+ SKU)
- Targetkan: 2GB file selesai dalam < 3 menit di laptop modern

### Memory management:
```typescript
// Setelah basket selesai dibangun, jangan simpan raw string CSV di memori
// Hanya simpan: Map<orderId, string[]> (basket)
// Setelah mining selesai, buang basket — hanya simpan Rule[]
```

### Web Worker lifecycle:
```typescript
// Di komponen React:
const workerRef = useRef<Worker | null>(null)

// Buat worker saat komponen mount
useEffect(() => {
  workerRef.current = new Worker(
    new URL('/workers/association.worker.ts', import.meta.url),
    { type: 'module' }
  )
  return () => workerRef.current?.terminate()
}, [])

// Kirim file + params ke worker
workerRef.current.postMessage({ file, params, filters })

// Terima progress + hasil
workerRef.current.onmessage = (e: MessageEvent<WorkerMessage>) => {
  if (e.data.type === 'progress') setProgress(e.data)
  if (e.data.type === 'done') setRules(e.data.rules)
}
```

---

## TypeScript Interfaces Lengkap

```typescript
// /lib/association-rules/types.ts

export interface SalesOrderRow {
  header: string | null
  orderNumber: number
  orderedByCode: string
  orderedByDescription: string
  itemDescription: string
  orderDate: string
  orderStatus: string
  item: string
  netPrice: number
  quantity: number
  deliverToDescription: string
  salesPersonDescription: string
  reference: string
  costPriceFC: number
}

export interface Basket {
  orderId: number
  items: string[]
  itemNames: Map<string, string>
  date: Date
  customer: string
  channel: string
  totalValue: number
}

export interface Rule {
  antecedent: string[]
  consequent: string[]
  antecedentNames: string[]
  consequentNames: string[]
  support: number
  confidence: number
  lift: number
  count: number
  zone: 'green' | 'yellow' | 'purple' | 'gray'
  recommendedDiscountPct: number
  action: string
}

export interface MiningStats {
  totalRows: number
  totalOrders: number
  basketsUsed: number          // orders dengan ≥2 item setelah filter
  uniqueSKUs: number
  rulesFound: number
  strongBundles: number        // zona hijau + kuning
  computeTimeMs: number
  dateRange: { from: Date; to: Date }
}

export interface MiningParams {
  minSupport: number           // 0.01 default
  minConfidence: number        // 0.3 default
  minLift: number              // 1.0 default
  maxItemsetSize: number       // 3 default
}

export interface FilterParams {
  dateFrom: Date | null
  dateTo: Date | null
  orderStatuses: string[]      // ['Complete'] default
  channels: string[]           // [] = semua channel
  customers: string[]          // [] = semua customer
  minBasketSize: number        // 2 default
  skipItemPatterns: string[]   // ['T','TRANSPORT','Divers']
}

export type WorkerMessage =
  | { type: 'progress'; step: string; pct: number; message: string }
  | { type: 'done'; rules: Rule[]; stats: MiningStats }
  | { type: 'error'; message: string }

export type DiscountZone = 'green' | 'yellow' | 'purple' | 'gray'

export const ZONE_CONFIG: Record<DiscountZone, {
  label: string
  colorClass: string
  discountRange: [number, number]
  action: string
}> = {
  green:  { label: 'Tidak perlu diskon',    colorClass: 'teal',   discountRange: [0, 5],   action: 'Tampilkan sebagai Frequently Bought Together' },
  yellow: { label: 'Diskon bundle moderat', colorClass: 'amber',  discountRange: [5, 15],  action: 'Tampilkan di cart page saat produk A masuk keranjang' },
  purple: { label: 'Diskon agresif',        colorClass: 'purple', discountRange: [15, 25], action: 'Campaign khusus untuk ubah kebiasaan beli' },
  gray:   { label: 'Skip',                  colorClass: 'gray',   discountRange: [0, 0],   action: 'Tidak ada asosiasi nyata — jangan buat bundle' },
}
```

---

## Catatan Penting dari Analisis Data

Berdasarkan file `SlsSalesOrdersSearch.csv` (Feb–Mar 2026):

- **2.044 total orders**, **1.405 unique SKU**, **843 orders dengan 2+ item** (41.5%)
- **Status yang valid**: gunakan `Complete` (7.693 rows) sebagai default. `Cancelled` jangan dipakai.
- **SKU yang harus di-skip**: `T`, `TRANSPORT`, `Divers`, `CNCL006` — ini bukan produk
- **Channel utama**: Maisons du Monde (487), DROPSHIPPING_BBA (318), Bazar Bizar B2C (191), La Redoute (130) — rules per channel sangat berbeda karakternya
- **Min support realistis**: gunakan **1–3%** (bukan 20–30% seperti dataset kecil) karena katalog sangat luas (1400+ SKU). Support 1% di 2GB data = ribuan transaksi, sudah sangat signifikan.
- **Date format**: `DD-MM-YYYY` — harus parse dengan `format='%d-%m-%Y'`
- **Number format**: European decimal — `"119,95"` → `119.95`, `"1.000,00"` → `1000.00`
- **Reference column**: pola `PAID` bisa dipakai untuk verifikasi pembayaran (konsisten dengan pipeline Shopify sebelumnya)

---

## Integrasi dengan Tool Shopify Processor

Tool Association Rules ini menghasilkan output yang bisa langsung memperkaya `shopify_final.csv`:

| Output Association Rules | Kolom di shopify_final.csv |
|--------------------------|---------------------------|
| Bundle zona hijau → SKU_B | Tampil di metafield `complementary_products` |
| Bundle zona kuning/ungu | Feed ke `Discount %` jika belum ada diskon dari Class_09 |
| Confidence threshold tinggi | Kandidat untuk `Variant Inventory Policy: continue` (high-demand pairs) |

Tambahkan tombol **"Kirim ke Shopify Processor"** di tab Bundle Cards yang akan:
1. Mengambil SKU dari rule yang dipilih
2. Membuka Shopify Processor tool dengan pre-filled filter untuk SKU tersebut

---

## Design System

Ikuti design system yang sama dengan tool Shopify Processor:
- Dark theme, industrial-utilitarian aesthetic
- JetBrains Mono untuk angka/SKU, Geist Sans untuk UI
- Amber accent (#f59e0b) untuk highlight penting
- Zinc borders, near-black background
- Sidebar sama dengan tool sebelumnya — Association Rules menggantikan slot "coming soon" pertama

Badge zona diskon:
- Hijau: `bg-emerald-900 text-emerald-300`
- Kuning: `bg-amber-900 text-amber-300`
- Ungu: `bg-purple-900 text-purple-300`
- Abu: `bg-zinc-800 text-zinc-400`
