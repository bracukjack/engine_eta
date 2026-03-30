# PROMPT — Advanced Association Rules Feature (Next.js + Tailwind)

---

## CONTEXT

I already have a Next.js + Tailwind app with a side menu. One of the menu items is **"Association Rules"**. The current implementation only processes a single file (`SlsSalesOrdersSearch` — sales order data) and generates basic item-to-item recommendations.

I need to **upgrade this Association Rules page** to support 3 file uploads and produce significantly more powerful, actionable insights for an **internal sales team**.

---

## THE 3 DATA SOURCES

All files are uploaded by the user (CSV, encoding UTF-16, tab-separated `\t`).

### 1. `SlsSalesOrdersSearch` — Sales Transactions
Key columns:
- `Order number` — transaction ID (group items by this)
- `Item` — item SKU/code
- `Item descriptionDescription` — item name
- `Ordered byCode`, `Ordered byDescription` — customer
- `Sales personDescription` — salesperson
- `Order date` — format DD-MM-YYYY
- `Net price` — revenue per line (comma as decimal separator)
- `Quantity` — qty ordered (comma as decimal)
- `Order status`

### 2. `LogItemSearch` — Product Master Data
Key columns:
- `Code` — item SKU (joins to `Item` in sales)
- `DescriptionDescription` — item name
- `ItemGroupDescription` — top-level category: `FURNITURE`, `HOMEWARE`, `DINING`, `DECORATION`, `LIGHTING`, `HOME TEXTILES`, `FASHION`, `SORT`, `PACKAGING`, `CATALOGUES`
- `Class_01Description` — sub-category: e.g. `Seating`, `Tables`, `Tableware`, `Carpets & Runners`, `Jewelry`, `Lamps`, `Cushion Covers`, etc.
- `Class_04Description` — collection status: `BB_LIVING`, `OUT_OF_COLLECTION`, `LAST ITEMS_OUT_OF_COLLECTION`, `MADE_TO_ORDER`, `SAMPLE`, `CUSTOM_CLIENT`, `SOURCING_ONLY`
- `SalesPrice` — base sales price (comma as decimal)
- `CostPriceStandard` — cost price

### 3. `InvStockPositionSearch` — Live Stock Data
Key columns:
- `ItemCode` — joins to `Item` in sales
- `Stock` — current physical stock
- `PlannedInStock` — incoming stock (purchase orders)
- `PlannedOutStock` — committed/outgoing stock
- `AvailableStock` — net available (`Stock - PlannedOutStock + PlannedInStock`)

---

## PARSING NOTES (important)

```typescript
// All numeric fields use comma as decimal separator
const parseNum = (val: string) => parseFloat((val || '0').replace(',', '.')) || 0

// Parse CSV: encoding UTF-16, separator \t
// Use papaparse with: encoding: 'UTF-16', delimiter: '\t'
// Skip rows where Item is empty (header/summary rows in sales file)
// Join: sales.Item === logItem.Code === stockPosition.ItemCode
```

---

## ALGORITHM — What to compute (all client-side)

### Step 1 — Build enriched transactions
For each `Order number`, collect all items. Enrich each item with:
- `ItemGroup`, `SubCategory`, `CollectionStatus` from LogItem
- `AvailableStock`, `PlannedInStock` from StockPosition
- `Net price` from sales line
- Exclude items where `CollectionStatus` is `OUT_OF_COLLECTION` or `LAST ITEMS_OUT_OF_COLLECTION` from **output recommendations** (still use them as antecedents in rule mining, but never recommend them)

### Step 2 — Mine association rules (Apriori, fully client-side)
Implement a lightweight Apriori in TypeScript:

```typescript
// Minimum thresholds (configurable via UI sliders)
const MIN_SUPPORT = 0.01       // 1% of orders
const MIN_CONFIDENCE = 0.2     // 20%
const MIN_LIFT = 1.3

// For each rule, compute:
// support = orders containing both A and B / total orders
// confidence = orders containing both / orders containing A
// lift = confidence / support(B)
// revenue_lift = avg net price of B when bought with A vs avg net price of B alone
```

### Step 3 — Score rules with Revenue Weight
```typescript
// revenue_weight = lift * avg_net_price_of_consequent
// Use this as primary sort when "Revenue Mode" is active
```

### Step 4 — Category-level rules
Run the same Apriori on `ItemGroup` basket (not item SKU), and separately on `SubCategory` basket. These produce macro-level insights like *"FURNITURE buyers also buy LIGHTING 68% of the time"*.

### Step 5 — Bundle Detection ("Complete the Look")
A bundle = 3+ items that frequently appear in the same order AND span at least 2 different `ItemGroup` categories. Score bundles by:
- Frequency (support)
- Total bundle value (sum of SalesPrice)
- Stock completeness (all items available)

---

## UI REQUIREMENTS

### File Upload Panel (top of page)
- 3 separate drag-and-drop zones, clearly labeled: **Sales Orders**, **Product Data**, **Stock Position**
- Each zone shows: file name, row count, and a green ✓ when parsed successfully
- A single **"Run Analysis"** CTA button — disabled until all 3 files loaded
- Show a progress indicator while computing

### Results Layout — 4 tabbed sections:

#### Tab 1 — 🔗 Item Recommendations
Table with columns:
| If customer buys | → Recommend | Confidence | Lift | Revenue Lift | Stock | Action |
|---|---|---|---|---|---|---|
- **Stock badge** on each recommended item:
  - 🟢 `In Stock (N)` — AvailableStock > 10
  - 🟡 `Low Stock (N)` — AvailableStock 1–10
  - 🔴 `Out of Stock` — AvailableStock = 0 → grey out row
  - 🔵 `Incoming (N)` — AvailableStock = 0 but PlannedInStock > 0
- Toggle: **"Hide out-of-stock recommendations"** (default: ON)
- Toggle: **"Sort by Revenue Lift"** vs "Sort by Confidence"
- Clicking a row expands to show: item image placeholder, full item name, ItemGroup, SubCategory, SalesPrice

#### Tab 2 — 🏷️ Category Insights  
Two side-by-side heatmap tables:
- Left: `ItemGroup × ItemGroup` co-purchase matrix (color intensity = lift)
- Right: `SubCategory × SubCategory` co-purchase matrix (top 15 sub-categories by volume)
- Below: Top 10 cross-category rules as cards showing *"Customers who buy [Category A] also buy [Category B] — X% of the time"*

#### Tab 3 — 💰 Revenue Opportunities
- Top 20 rules ranked by **Revenue Lift** (revenue impact, not just frequency)
- Each card shows:
  - The rule (antecedent → consequent)
  - Estimated additional revenue per 100 orders
  - Stock availability of consequent
  - "Upsell script" hint: a one-liner the salesperson can say
- Filter by `Sales personDescription` — show which rules are most relevant per salesperson based on their customer portfolio

#### Tab 4 — 🛋️ Bundle / Complete the Look
- Grid of bundle cards (3–5 items per bundle)
- Each card shows:
  - Bundle name auto-generated from ItemGroups (e.g. *"Living Room Set"*, *"Dining Essentials"*)
  - Items list with stock badge per item
  - Total bundle value (sum SalesPrice)
  - Bundle frequency (how many orders contained this combo)
  - **"Bundle completeness"** progress bar — how many of the bundle items are currently in stock
  - CTA: **"Copy bundle to clipboard"** — copies item codes as comma-separated list

### Global Controls (sidebar/top bar)
- **Min Support** slider: 0.5% – 5%
- **Min Confidence** slider: 10% – 50%  
- **Min Lift** slider: 1.0 – 3.0
- **Date range filter** (from Order date)
- **ItemGroup filter** (multi-select checkboxes)
- **Stock filter** toggle: show only rules where consequent is in stock
- **Collection Status filter**: hide OUT_OF_COLLECTION (default: ON)

### Summary KPI bar (top of results)
Show 4 cards:
- Total orders analyzed
- Unique items in rules
- Rules found
- Estimated revenue opportunity (sum of revenue_lift × frequency across top 20 rules)

---

## COMPONENT STRUCTURE

```
/app/association-rules/
  page.tsx                  ← main page, state management
  components/
    FileUploadZone.tsx      ← 3-zone upload with parse status
    RulesTable.tsx          ← Tab 1 item recommendations
    CategoryHeatmap.tsx     ← Tab 2 heatmap matrix
    RevenueOpportunities.tsx ← Tab 3 revenue cards
    BundleGrid.tsx          ← Tab 4 bundle cards
    StockBadge.tsx          ← reusable stock status badge
    RuleControls.tsx        ← sliders + filters sidebar
    KpiBar.tsx              ← summary stats bar
  lib/
    parseCsv.ts             ← papaparse wrapper, UTF-16 + tab
    apriori.ts              ← pure TS Apriori implementation
    enrichRules.ts          ← join rules with stock + category data
    bundleDetector.ts       ← bundle mining logic
    revenueScorer.ts        ← revenue lift calculation
```

---

## STYLE GUIDELINES (Tailwind)

- Clean data-dense layout — this is a **sales tool**, not a marketing page
- Use a dark sidebar for controls, white/light main content area
- Tables: zebra striping, sticky header, sortable columns
- Stock badges: pill-shaped, color-coded (green/yellow/red/blue)
- Cards with subtle shadow, hover state shows border highlight
- Use `@tanstack/react-table` for sortable/filterable tables
- Use a lightweight charting lib (recharts or visx) for the heatmap

---

## IMPORTANT CONSTRAINTS

- **All computation must be 100% client-side** — no API calls, no server
- Files can be large (10k–20k rows) — use `useMemo` and `useCallback` aggressively, compute in a `useEffect` with a loading state
- Debounce slider changes (300ms) before re-running rule scoring
- The Apriori implementation must handle up to 1500 unique items — use a Map-based approach, not nested arrays
- Never recommend items where `CollectionStatus` = `OUT_OF_COLLECTION` or `LAST ITEMS_OUT_OF_COLLECTION`
- Parse errors should show a clear inline error per file zone, not crash the page

---

## DELIVERABLE

Build the complete upgraded Association Rules page as described above. Start with `parseCsv.ts` and `apriori.ts` as the foundation, then build components bottom-up. The existing app routing and side menu are already in place — only implement the content of this page and its sub-components.
