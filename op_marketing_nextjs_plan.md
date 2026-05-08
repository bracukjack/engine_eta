# Plan: OP Marketing Builder — Next.js Feature

## Ringkasan Fitur

Upload 4 file (discountlist, stock, offers, item log) + template Excel + konfigurasi Country & Shop Name → proses otomatis → download file `OP_Marketing_{COUNTRY}_{SHOP_NAME}.xlsx`.

---

## Stack yang Dibutuhkan

Tambahkan package ini ke project:

```bash
npm install xlsx papaparse
npm install -D @types/papaparse
```

| Package | Kegunaan |
|---------|----------|
| `xlsx` | Parse & generate file Excel (.xlsx) |
| `papaparse` | Parse CSV dengan dukungan encoding UTF-16 |

---

## Struktur File yang Perlu Dibuat

```
app/
  ops-tools/
    op-marketing/
      page.tsx                     ← UI form upload
      _components/
        UploadForm.tsx             ← form dengan file input per kolom
        ResultPreview.tsx          ← preview tabel hasil (opsional)

  api/
    ops/
      op-marketing/
        route.ts                   ← POST handler: proses + return Excel

lib/
  op-marketing/
    process.ts                     ← semua logika transformasi data
    types.ts                       ← type definitions
```

---

## Types — `lib/op-marketing/types.ts`

```ts
export interface Config {
  country: string
  shopName: string
}

export interface DiscountRow {
  SKU: string
  GTIN: string
  DISC: string          // contoh: "40%" atau "0.40"
}

export interface StockRow {
  ItemCode: string
  Stock: string | number
  PlannedOutStock: string | number
}

export interface OfferRow {
  'Offer SKU': string
  'Product SKU': string
  Product: string
  EAN: string
}

export interface LogRow {
  Code: string
  'Extra field:  Retail Price EUR': string
}

export interface OutputRow {
  EAN: string
  'SKU VU': string
  'Shop name': string
  'Product title': string
  Price: number
  'Discount price': number
  '% discount': string
  Country: string
}
```

---

## Logika Inti — `lib/op-marketing/process.ts`

Implementasikan 6 step dari notebook Python:

```ts
import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import type { Config, DiscountRow, StockRow, OfferRow, LogRow, OutputRow } from './types'

// ── Step 1: Hitung RealStock, filter > 0 ─────────────────────────────────
function filterPositiveStock(rows: StockRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const r of rows) {
    const stock    = Number(r.Stock) || 0
    const planned  = Number(r.PlannedOutStock) || 0
    const real     = stock - planned
    if (real > 0) map.set(r.ItemCode, real)
  }
  return map
}

// ── Step 2: Match disc list × stock × offers ──────────────────────────────
function matchOffers(
  disc: DiscountRow[],
  stockMap: Map<string, number>,
  offers: OfferRow[]
) {
  const offerMap = new Map(offers.map(o => [o['Offer SKU'], o]))
  return disc
    .filter(d => stockMap.has(d.SKU))
    .map(d => ({ ...d, offer: offerMap.get(d.SKU) }))
    .filter(d => d.offer !== undefined)
}

// ── Step 3: Enrich dengan RetailPriceEUR dari log ─────────────────────────
function enrichWithPrice(matched: ReturnType<typeof matchOffers>, log: LogRow[]) {
  const priceMap = new Map<string, number>()
  for (const l of log) {
    const raw = String(l['Extra field:  Retail Price EUR']).replace(',', '.')
    const val = parseFloat(raw)
    if (!isNaN(val)) priceMap.set(l.Code, val)
  }
  return matched.map(r => ({ ...r, retailPrice: priceMap.get(r.SKU) ?? null }))
}

// ── Step 4: Hitung DiscountPrice ─────────────────────────────────────────
function calcDiscount(retailPrice: number, disc: string): number {
  const pct = parseFloat(String(disc).replace('%', '').trim()) / 100
  return Math.round(retailPrice * (1 - pct) * 100) / 100
}

// ── Step 5: Susun kolom output ────────────────────────────────────────────
function buildOutputRows(
  enriched: ReturnType<typeof enrichWithPrice>,
  config: Config
): OutputRow[] {
  return enriched
    .filter(r => r.retailPrice !== null)
    .map(r => ({
      EAN:              r.GTIN,
      'SKU VU':         r.offer!['Product SKU'],
      'Shop name':      config.shopName,
      'Product title':  r.offer!.Product,
      Price:            r.retailPrice!,
      'Discount price': calcDiscount(r.retailPrice!, r.DISC),
      '% discount':     r.DISC,
      Country:          config.country,
    }))
}

// ── Step 6: Generate Excel dari template ─────────────────────────────────
function generateExcel(rows: OutputRow[], templateBuffer: ArrayBuffer): Buffer {
  const wb = XLSX.read(templateBuffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]

  rows.forEach((row, i) => {
    const rowNum = i + 2  // row 1 = header
    const cols = Object.values(row)
    cols.forEach((val, j) => {
      const cellRef = XLSX.utils.encode_cell({ r: rowNum - 1, c: j })
      ws[cellRef] = { v: val, t: typeof val === 'number' ? 'n' : 's' }
    })
  })

  // Update worksheet range
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  range.e.r = rows.length + 1
  ws['!ref'] = XLSX.utils.encode_range(range)

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

// ── Main export ───────────────────────────────────────────────────────────
export function processOPMarketing(
  config: Config,
  discBuffer: ArrayBuffer,
  stockCsv: string,
  offersCsv: string,
  logCsv: string,
  templateBuffer: ArrayBuffer
): Buffer {
  // Parse discount list (Excel)
  const discWb   = XLSX.read(discBuffer, { type: 'array' })
  const disc     = XLSX.utils.sheet_to_json<DiscountRow>(discWb.Sheets[discWb.SheetNames[0]])

  // Parse CSVs
  const stock  = Papa.parse<StockRow>(stockCsv,  { header: true, skipEmptyLines: true }).data
  const offers = Papa.parse<OfferRow>(offersCsv,  { header: true, skipEmptyLines: true, delimiter: ';' }).data
  const log    = Papa.parse<LogRow>(logCsv,       { header: true, skipEmptyLines: true }).data

  const stockMap = filterPositiveStock(stock)
  const matched  = matchOffers(disc, stockMap, offers)
  const enriched = enrichWithPrice(matched, log)
  const output   = buildOutputRows(enriched, config)

  return generateExcel(output, templateBuffer)
}
```

> **Catatan encoding UTF-16:** `stock.csv` dan `item.csv` dibaca sebagai UTF-16.
> Di API route, decode buffer sebelum dioper ke `processOPMarketing`:
> ```ts
> const stockText = new TextDecoder('utf-16').decode(await stockFile.arrayBuffer())
> ```

---

## API Route — `app/api/ops/op-marketing/route.ts`

```ts
import { NextResponse } from 'next/server'
import { processOPMarketing } from '@/lib/op-marketing/process'

export async function POST(req: Request) {
  try {
    const formData = await req.formData()

    const country   = formData.get('country')  as string
    const shopName  = formData.get('shopName') as string
    const discFile  = formData.get('disclist') as File
    const stockFile = formData.get('stock')    as File
    const offersFile= formData.get('offers')   as File
    const logFile   = formData.get('log')      as File
    const template  = formData.get('template') as File

    if (!country || !shopName || !discFile || !stockFile || !offersFile || !logFile || !template) {
      return NextResponse.json({ error: 'Semua file dan konfigurasi wajib diisi' }, { status: 400 })
    }

    // Parse buffers & text
    const discBuffer     = await discFile.arrayBuffer()
    const stockText      = new TextDecoder('utf-16').decode(await stockFile.arrayBuffer())
    const offersText     = new TextDecoder('utf-8').decode(await offersFile.arrayBuffer())
    const logText        = new TextDecoder('utf-16').decode(await logFile.arrayBuffer())
    const templateBuffer = await template.arrayBuffer()

    const excelBuffer = processOPMarketing(
      { country, shopName },
      discBuffer,
      stockText,
      offersText,
      logText,
      templateBuffer
    )

    const filename = `OP_Marketing_${country}_${shopName.replace(/\s+/g, '_')}.xlsx`

    return new Response(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('[op-marketing]', err)
    return NextResponse.json({ error: 'Gagal memproses file' }, { status: 500 })
  }
}

// Aktifkan jika butuh upload file besar
export const config = {
  api: { bodyParser: false },
}
```

---

## UI — `app/ops-tools/op-marketing/page.tsx`

```tsx
'use client'

import { useState } from 'react'
import { UploadForm } from './_components/UploadForm'

export default function OPMarketingPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [done, setDone]       = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    setDone(false)

    try {
      const res = await fetch('/api/ops/op-marketing', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Unknown error')
      }

      // Trigger auto-download
      const blob     = await res.blob()
      const url      = URL.createObjectURL(blob)
      const filename = res.headers.get('Content-Disposition')
                         ?.match(/filename="(.+)"/)?.[1] ?? 'output.xlsx'
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)

      setDone(true)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-semibold mb-6">OP Marketing Builder</h1>
      <UploadForm onSubmit={handleSubmit} loading={loading} />
      {error && <p className="mt-4 text-red-500">{error}</p>}
      {done  && <p className="mt-4 text-green-600">File berhasil di-generate dan didownload.</p>}
    </div>
  )
}
```

---

## UI — `app/ops-tools/op-marketing/_components/UploadForm.tsx`

```tsx
'use client'

import { useRef } from 'react'

interface Props {
  onSubmit: (fd: FormData) => void
  loading: boolean
}

const FILE_FIELDS = [
  { name: 'disclist', label: 'Discount List',  accept: '.xlsx' },
  { name: 'stock',    label: 'Stock CSV',       accept: '.csv'  },
  { name: 'offers',   label: 'Offers CSV',      accept: '.csv'  },
  { name: 'log',      label: 'Item Log CSV',    accept: '.csv'  },
  { name: 'template', label: 'Template Excel',  accept: '.xlsx' },
]

export function UploadForm({ onSubmit, loading }: Props) {
  const formRef = useRef<HTMLFormElement>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData(formRef.current!)
    onSubmit(fd)
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      {/* Config */}
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-medium">Country Code</span>
          <input name="country" defaultValue="AT" required
            className="mt-1 block w-full border rounded px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Shop Name</span>
          <input name="shopName" required
            className="mt-1 block w-full border rounded px-3 py-2" />
        </label>
      </div>

      {/* File inputs */}
      {FILE_FIELDS.map(f => (
        <label key={f.name} className="block">
          <span className="text-sm font-medium">{f.label}</span>
          <input type="file" name={f.name} accept={f.accept} required
            className="mt-1 block w-full text-sm" />
        </label>
      ))}

      <button type="submit" disabled={loading}
        className="w-full bg-blue-600 text-white py-2 rounded disabled:opacity-50">
        {loading ? 'Memproses...' : 'Generate Excel'}
      </button>
    </form>
  )
}
```

---

## Urutan Implementasi

1. Install package: `xlsx` dan `papaparse`
2. Buat `lib/op-marketing/types.ts`
3. Buat `lib/op-marketing/process.ts` — test logic murni dulu dengan data sample
4. Buat `app/api/ops/op-marketing/route.ts`
5. Buat `app/ops-tools/op-marketing/page.tsx` + `UploadForm.tsx`
6. Test end-to-end dengan file dari notebook

---

## Catatan Penting

| Hal | Detail |
|-----|--------|
| Encoding UTF-16 | `stock.csv` & `item.csv` — decode dengan `new TextDecoder('utf-16')` sebelum diparse papaparse |
| Delimiter offers | `offers.csv` pakai `;` bukan `,` — set `delimiter: ';'` di papaparse |
| DISC parsing | Handle dua format: `"40%"` dan `"0.40"` — strip `%` lalu bagi 100 |
| GTIN vs EAN | Kolom `EAN` di output diambil dari `GTIN` di disclist, bukan dari offers |
| Template Excel | Styling row 1 dipertahankan, data ditulis mulai row 2 |
| File besar | Jika stock/log > 10MB, tambahkan `export const config = { api: { bodyParser: false } }` di route |
| Next.js version | Plan ini untuk App Router (Next.js 13+) |
