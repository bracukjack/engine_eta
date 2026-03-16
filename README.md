# ETA Product Matcher

A simple Next.js (TypeScript) app to match **Purchase Order** data with **Shopify Products** and generate an Excel file `products_with_eta.xlsx` containing an ETA column.

All processing is done in the **browser** - no data is sent to the server.

## Install

```bash
npm install
```

Main dependencies: `papaparse`, `dayjs`, `lodash`, `xlsx`, `file-saver`.

## Run

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

## How To Use

1. Upload a **Purchase Order** file (CSV or XLSX) - it must contain `Item` / `SKU` and `Receipt date` columns.
2. Upload a **Shopify Products** file (CSV or XLSX) - it must contain a `Variant SKU` / `SKU` column.
3. Click **Process & Download**.
4. The `products_with_eta.xlsx` file will be downloaded automatically.

## Processing Logic

1. Remove PO rows without SKU.
2. Parse `Receipt date` (supports `DD/MM/YYYY`, `YYYY-MM-DD`, etc.).
3. Filter: keep only PO rows with `Receipt date` >= today.
4. Sort by `Receipt date` ascending, then by `Order number`.
5. Group by SKU and take the first row -> nearest ETA.
6. Inner-join with Products by SKU.
7. Format `ETA` to `DD/MM/YYYY`.
8. Export to Excel.
