/* eslint-disable no-restricted-globals */

// ── Worker scope ─────────────────────────────────────────────────────────────
interface WorkerSelf {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}
const ctx = self as unknown as WorkerSelf;

// ── Inline types (workers can't reliably import from lib/) ───────────────────

type StockStatus = "in_stock" | "low_stock" | "out_of_stock" | "incoming";

interface StockInfo {
  availableStock: number;
  plannedInStock: number;
  status: StockStatus;
}

interface ProductInfo {
  name: string;
  itemGroup: string;
  subCategory: string;
  collectionStatus: string;
  salesPrice: number;
  costPrice: number;
}

interface StockData {
  availableStock: number;
  plannedInStock: number;
  plannedOutStock: number;
}

interface WorkerFilters {
  minSupport: number;
  minConfidence: number;
  minLift: number;
  dateFrom: string | null;
  dateTo: string | null;
  itemGroups: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const EXCLUDED_COLLECTION = new Set([
  "OUT_OF_COLLECTION",
  "LAST ITEMS_OUT_OF_COLLECTION",
]);

function parseNum(val: string | undefined | null): number {
  if (!val) return 0;
  const s = String(val).trim();
  if (s === "") return 0;
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function parseDMY(val: string): Date | null {
  if (!val) return null;
  const parts = val.trim().split("-");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

function getStockStatus(avail: number, planned: number): StockStatus {
  if (avail > 10) return "in_stock";
  if (avail >= 1) return "low_stock";
  if (planned > 0) return "incoming";
  return "out_of_stock";
}

function getStockInfo(data: StockData | undefined): StockInfo {
  if (!data)
    return { availableStock: 0, plannedInStock: 0, status: "out_of_stock" };
  return {
    availableStock: data.availableStock,
    plannedInStock: data.plannedInStock,
    status: getStockStatus(data.availableStock, data.plannedInStock),
  };
}

function progress(step: string, pct: number, message: string) {
  ctx.postMessage({ type: "progress", step, pct, message });
}

function toYearMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── FP-Growth Implementation ─────────────────────────────────────────────────

class FPNode {
  item: string;
  count: number;
  parent: FPNode | null;
  children: Map<string, FPNode>;
  next: FPNode | null;

  constructor(item: string, count: number, parent: FPNode | null) {
    this.item = item;
    this.count = count;
    this.parent = parent;
    this.children = new Map();
    this.next = null;
  }
}

class FPTree {
  root: FPNode;
  headerTable: Map<string, FPNode>;

  constructor() {
    this.root = new FPNode("", 0, null);
    this.headerTable = new Map();
  }

  addTransaction(items: string[]) {
    let node = this.root;
    for (const item of items) {
      if (!node.children.has(item)) {
        const newNode = new FPNode(item, 0, node);
        node.children.set(item, newNode);
        if (this.headerTable.has(item)) {
          let current = this.headerTable.get(item)!;
          while (current.next) current = current.next;
          current.next = newNode;
        } else {
          this.headerTable.set(item, newNode);
        }
      }
      node = node.children.get(item)!;
      node.count++;
    }
  }
}

function buildConditionalPatternBase(
  item: string,
  headerTable: Map<string, FPNode>
): Map<string, number>[] {
  const patterns: Map<string, number>[] = [];
  let node = headerTable.get(item) || null;
  while (node) {
    const path = new Map<string, number>();
    let parent = node.parent;
    while (parent && parent.item !== "") {
      path.set(parent.item, node.count);
      parent = parent.parent;
    }
    if (path.size > 0) patterns.push(path);
    node = node.next;
  }
  return patterns;
}

function buildConditionalFPTree(
  patterns: Map<string, number>[],
  minCount: number
): FPTree | null {
  const freqCount = new Map<string, number>();
  for (const path of patterns) {
    for (const [item, count] of path) {
      freqCount.set(item, (freqCount.get(item) || 0) + count);
    }
  }

  const freqItems = new Set<string>();
  for (const [item, count] of freqCount) {
    if (count >= minCount) freqItems.add(item);
  }
  if (freqItems.size === 0) return null;

  const tree = new FPTree();
  const sorted = Array.from(freqItems).sort(
    (a, b) => (freqCount.get(b) || 0) - (freqCount.get(a) || 0)
  );
  const rank = new Map(sorted.map((item, i) => [item, i]));

  for (const path of patterns) {
    const items = Array.from(path.keys())
      .filter((i) => freqItems.has(i))
      .sort((a, b) => (rank.get(a) || 0) - (rank.get(b) || 0));
    let node = tree.root;
    const count = Math.min(...Array.from(path.values()));
    for (const item of items) {
      if (!node.children.has(item)) {
        const newNode = new FPNode(item, 0, node);
        node.children.set(item, newNode);
        if (tree.headerTable.has(item)) {
          let current = tree.headerTable.get(item)!;
          while (current.next) current = current.next;
          current.next = newNode;
        } else {
          tree.headerTable.set(item, newNode);
        }
      }
      node = node.children.get(item)!;
      node.count += count;
    }
  }

  return tree;
}

function fpGrowth(
  tree: FPTree,
  prefix: string[],
  minCount: number,
  maxSize: number,
  results: Map<string, number>
) {
  if (prefix.length >= maxSize) return;

  const itemCounts = new Map<string, number>();
  for (const item of tree.headerTable.keys()) {
    let count = 0;
    let node: FPNode | null = tree.headerTable.get(item) || null;
    while (node) {
      count += node.count;
      node = node.next;
    }
    if (count >= minCount) itemCounts.set(item, count);
  }

  const sortedItems = Array.from(itemCounts.keys()).sort(
    (a, b) => (itemCounts.get(a) || 0) - (itemCounts.get(b) || 0)
  );

  for (const item of sortedItems) {
    const newPrefix = [...prefix, item].sort();
    const key = newPrefix.join("\x00");
    results.set(key, itemCounts.get(item)!);
    const cpb = buildConditionalPatternBase(item, tree.headerTable);
    const condTree = buildConditionalFPTree(cpb, minCount);
    if (condTree) fpGrowth(condTree, newPrefix, minCount, maxSize, results);
  }
}

function mineFrequentItemsets(
  transactions: string[][],
  minSupport: number,
  maxSize: number
): Map<string, number> {
  const totalTx = transactions.length;
  const minCount = Math.max(1, Math.floor(totalTx * minSupport));

  const itemFreq = new Map<string, number>();
  for (const tx of transactions) {
    for (const item of tx) {
      itemFreq.set(item, (itemFreq.get(item) || 0) + 1);
    }
  }

  const freqItems = new Set<string>();
  for (const [item, count] of itemFreq) {
    if (count >= minCount) freqItems.add(item);
  }

  const sorted = Array.from(freqItems).sort(
    (a, b) => (itemFreq.get(b) || 0) - (itemFreq.get(a) || 0)
  );
  const rank = new Map(sorted.map((item, i) => [item, i]));

  const tree = new FPTree();
  for (const tx of transactions) {
    const filtered = tx
      .filter((i) => freqItems.has(i))
      .sort((a, b) => (rank.get(a) || 0) - (rank.get(b) || 0));
    if (filtered.length > 0) tree.addTransaction(filtered);
  }

  const results = new Map<string, number>();
  for (const item of freqItems) {
    results.set(item, itemFreq.get(item)!);
  }
  fpGrowth(tree, [], minCount, maxSize, results);

  return results;
}

// ── Rule generation ──────────────────────────────────────────────────────────

interface RawRule {
  antecedent: string[];
  consequent: string[];
  support: number;
  confidence: number;
  lift: number;
  count: number;
}

function generateRules(
  itemsets: Map<string, number>,
  totalTx: number,
  minConfidence: number,
  minLift: number
): RawRule[] {
  const rules: RawRule[] = [];

  for (const [key, count] of itemsets) {
    const items = key.split("\x00");
    if (items.length < 2) continue;

    const support = count / totalTx;
    const n = items.length;

    for (let mask = 1; mask < (1 << n) - 1; mask++) {
      const ante: string[] = [];
      const cons: string[] = [];
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) ante.push(items[i]);
        else cons.push(items[i]);
      }

      const anteKey = ante.join("\x00");
      const anteCount = itemsets.get(anteKey);
      if (!anteCount) continue;

      const confidence = count / anteCount;
      if (confidence < minConfidence) continue;

      const consKey = cons.join("\x00");
      const consCount = itemsets.get(consKey);
      if (!consCount) continue;

      const expectedConfidence = consCount / totalTx;
      const lift = confidence / expectedConfidence;
      if (lift < minLift) continue;

      rules.push({ antecedent: ante, consequent: cons, support, confidence, lift, count });
    }
  }

  return rules;
}

// ── Bundle name generation ───────────────────────────────────────────────────

const GROUP_SHORT: Record<string, string> = {
  FURNITURE: "Furniture",
  HOMEWARE: "Home",
  DINING: "Dining",
  DECORATION: "Decor",
  LIGHTING: "Lighting",
  "HOME TEXTILES": "Textile",
  FASHION: "Fashion",
};

function generateBundleName(categories: string[]): string {
  const names = categories.map((c) => GROUP_SHORT[c] || c);
  if (names.length === 1) return `${names[0]} Collection`;
  if (
    categories.includes("FURNITURE") &&
    categories.includes("LIGHTING")
  )
    return "Living Room Set";
  if (categories.includes("DINING") && categories.includes("HOMEWARE"))
    return "Dining Essentials";
  if (
    categories.includes("FURNITURE") &&
    categories.includes("HOME TEXTILES")
  )
    return "Comfort Collection";
  if (
    categories.includes("DECORATION") &&
    categories.includes("LIGHTING")
  )
    return "Ambiance Set";
  if (
    categories.includes("FURNITURE") &&
    categories.includes("DECORATION")
  )
    return "Interior Set";
  return `${names.slice(0, 3).join(" & ")} Set`;
}

// ── Main handler ─────────────────────────────────────────────────────────────

ctx.onmessage = async (e: MessageEvent) => {
  const { salesRows, productRows, stockRows, filters } = e.data as {
    salesRows: Record<string, string>[];
    productRows: Record<string, string>[];
    stockRows: Record<string, string>[];
    filters: WorkerFilters;
  };
  const startTime = performance.now();

  try {
    // ── Step 1: Build lookup maps ──────────────────────────────────────────

    progress("Building lookups", 5, "Processing product data...");

    const productMap = new Map<string, ProductInfo>();
    for (const row of productRows) {
      const code = String(row["Code"] || "").trim();
      if (!code) continue;
      productMap.set(code, {
        name: String(row["DescriptionDescription"] || "").trim(),
        itemGroup: String(row["ItemGroupDescription"] || "").trim(),
        subCategory: String(row["Class_01Description"] || "").trim(),
        collectionStatus: String(row["Class_04Description"] || "").trim(),
        salesPrice: parseNum(row["SalesPrice"]),
        costPrice: parseNum(row["CostPriceStandard"]),
      });
    }

    progress("Building lookups", 10, "Processing stock data...");

    const stockMap = new Map<string, StockData>();
    for (const row of stockRows) {
      const code = String(row["ItemCode"] || "").trim();
      if (!code) continue;
      stockMap.set(code, {
        availableStock: parseNum(row["AvailableStock"]),
        plannedInStock: parseNum(row["PlannedInStock"]),
        plannedOutStock: parseNum(row["PlannedOutStock"]),
      });
    }

    // ── Step 2: Build enriched transactions ────────────────────────────────

    progress("Building transactions", 15, "Processing sales data...");

    const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
    const dateTo = filters.dateTo ? new Date(filters.dateTo) : null;
    const filterGroups = new Set(filters.itemGroups);
    const hasGroupFilter = filterGroups.size > 0;

    interface OrderData {
      items: Set<string>;
      itemGroups: Set<string>;
      subCategories: Set<string>;
      salesperson: string;
      customer: string;
      date: Date | null;
      total: number;
    }

    const orders = new Map<string, OrderData>();
    const itemNetPrices = new Map<string, number[]>();
    const salespersonItemsMap = new Map<string, Set<string>>();
    const allSalespersons = new Set<string>();
    const allItemGroups = new Set<string>();
    const nameMap = new Map<string, string>();

    // Phase 2: customer → order list for sequential rules & RFM
    const customerOrders = new Map<string, string[]>();
    // Phase 2: item → set of order numbers for basket uplift & stability
    const itemToOrders = new Map<string, Set<string>>();
    // Phase 2: order date tracking for seasonality
    const orderDates = new Map<string, Date>();

    let processedRows = 0;
    for (const row of salesRows) {
      processedRows++;
      if (processedRows % 5000 === 0) {
        const pct = 15 + Math.round((processedRows / salesRows.length) * 25);
        progress(
          "Building transactions",
          pct,
          `Processing row ${processedRows.toLocaleString()}...`
        );
      }

      const item = String(row["Item"] || "").trim();
      if (!item) continue;

      const orderNum = String(row["Order number"] || "").trim();
      if (!orderNum) continue;

      // Date parsing
      const dateStr = String(row["Order date"] || "").trim();
      const date = dateStr ? parseDMY(dateStr) : null;

      // Date filter
      if (date && (dateFrom || dateTo)) {
        if (dateFrom && date < dateFrom) continue;
        if (dateTo && date > dateTo) continue;
      }

      // Product enrichment
      const product = productMap.get(item);
      const itemGroup = product?.itemGroup || "";
      const subCategory = product?.subCategory || "";

      // Item group filter
      if (hasGroupFilter && itemGroup && !filterGroups.has(itemGroup)) continue;

      if (itemGroup) allItemGroups.add(itemGroup);

      // Item name
      const itemName = String(row["Item descriptionDescription"] || "").trim();
      if (itemName) nameMap.set(item, itemName);
      else if (product?.name) nameMap.set(item, product.name);

      // Net price tracking
      const netPrice = parseNum(row["Net price"]);
      if (netPrice > 0) {
        if (!itemNetPrices.has(item)) itemNetPrices.set(item, []);
        itemNetPrices.get(item)!.push(netPrice);
      }

      // Salesperson tracking
      const salesperson = String(
        row["Sales personDescription"] || ""
      ).trim();
      if (salesperson) {
        allSalespersons.add(salesperson);
        if (!salespersonItemsMap.has(salesperson))
          salespersonItemsMap.set(salesperson, new Set());
        salespersonItemsMap.get(salesperson)!.add(item);
      }

      // Customer tracking
      const customer = String(row["Order account"] || row["Account"] || "").trim();

      // Build order basket
      if (!orders.has(orderNum)) {
        orders.set(orderNum, {
          items: new Set(),
          itemGroups: new Set(),
          subCategories: new Set(),
          salesperson,
          customer,
          date,
          total: 0,
        });
      }
      const order = orders.get(orderNum)!;
      order.items.add(item);
      if (itemGroup) order.itemGroups.add(itemGroup);
      if (subCategory) order.subCategories.add(subCategory);
      order.total += netPrice;
      if (date && !order.date) order.date = date;

      // Item → orders index
      if (!itemToOrders.has(item)) itemToOrders.set(item, new Set());
      itemToOrders.get(item)!.add(orderNum);

      // Customer → orders
      if (customer) {
        if (!customerOrders.has(customer)) customerOrders.set(customer, []);
        const list = customerOrders.get(customer)!;
        if (!list.includes(orderNum)) list.push(orderNum);
      }

      // Order dates
      if (date && !orderDates.has(orderNum)) orderDates.set(orderNum, date);
    }

    progress(
      "Building transactions",
      42,
      `Built ${orders.size.toLocaleString()} orders`
    );

    // Build transaction arrays (orders with 2+ items)
    const itemTransactions: string[][] = [];
    const itemGroupTransactions: string[][] = [];
    const subCategoryTransactions: string[][] = [];

    for (const [, order] of orders) {
      const items = Array.from(order.items).sort();
      if (items.length >= 2) itemTransactions.push(items);

      const groups = Array.from(order.itemGroups).sort();
      if (groups.length >= 2) itemGroupTransactions.push(groups);

      const subs = Array.from(order.subCategories).sort();
      if (subs.length >= 2) subCategoryTransactions.push(subs);
    }

    const uniqueItems = new Set(itemTransactions.flat()).size;

    progress(
      "Mining",
      45,
      `Mining ${itemTransactions.length} baskets, ${uniqueItems} unique items...`
    );

    // Empty results shortcut
    if (itemTransactions.length === 0) {
      ctx.postMessage({
        type: "done",
        results: {
          itemRules: [],
          itemGroupMatrix: [],
          subCategoryMatrix: [],
          crossCategoryRules: [],
          bundles: [],
          stats: {
            totalOrders: orders.size,
            uniqueItems: 0,
            rulesFound: 0,
            estimatedRevenueOpportunity: 0,
            computeTimeMs: Math.round(performance.now() - startTime),
          },
          salespersons: Array.from(allSalespersons).sort(),
          itemGroups: Array.from(allItemGroups).sort(),
          salespersonItems: {},
          sequentialRules: [],
          segments: [],
          negativeRules: [],
          cannibalizationPairs: [],
          salespersonMetrics: [],
          seasonalData: [],
          smartBundles: [],
        },
      });
      return;
    }

    // ── Step 3: Mine item-level rules ──────────────────────────────────────

    progress("Mining items", 50, "Mining item-level patterns...");
    const itemItemsets = mineFrequentItemsets(
      itemTransactions,
      filters.minSupport,
      3
    );

    progress(
      "Generating rules",
      58,
      `Found ${itemItemsets.size} frequent itemsets...`
    );
    const rawItemRules = generateRules(
      itemItemsets,
      itemTransactions.length,
      filters.minConfidence,
      filters.minLift
    );

    // Compute average net prices
    const avgPriceMap = new Map<string, number>();
    for (const [item, prices] of itemNetPrices) {
      avgPriceMap.set(
        item,
        prices.reduce((a, b) => a + b, 0) / prices.length
      );
    }

    // ── Step 3b: Compute basket values per order ──────────────────────────

    const orderValues = new Map<string, number>();
    for (const [orderNum, order] of orders) {
      orderValues.set(orderNum, order.total);
    }

    // ── Step 3c: Compute per-month confidence for stability ───────────────

    // Group orders by month
    const monthOrders = new Map<string, Set<string>>();
    for (const [orderNum, date] of orderDates) {
      const ym = toYearMonth(date);
      if (!monthOrders.has(ym)) monthOrders.set(ym, new Set());
      monthOrders.get(ym)!.add(orderNum);
    }
    const sortedMonths = Array.from(monthOrders.keys()).sort();

    // ── Step 3d: Build subCategory→item index for alternatives ────────────

    const subCatItems = new Map<string, string[]>();
    for (const [code, prod] of productMap) {
      if (!prod.subCategory) continue;
      if (EXCLUDED_COLLECTION.has(prod.collectionStatus)) continue;
      if (!subCatItems.has(prod.subCategory))
        subCatItems.set(prod.subCategory, []);
      subCatItems.get(prod.subCategory)!.push(code);
    }

    // Enrich item rules with Phase 2 fields
    progress("Enriching rules", 62, "Computing profit, basket, stability...");

    interface EnrichedItemRule {
      antecedent: string[];
      consequent: string[];
      antecedentNames: string[];
      consequentNames: string[];
      support: number;
      confidence: number;
      lift: number;
      count: number;
      revenueLift: number;
      consequentAvgPrice: number;
      consequentStock: StockInfo;
      consequentItemGroup: string;
      consequentSubCategory: string;
      consequentSalesPrice: number;
      profitLift: number;
      basketUplift: number;
      stabilityScore: "low" | "medium" | "high";
      alternative: { code: string; name: string; stock: StockInfo } | null;
    }

    const itemRules: EnrichedItemRule[] = [];

    for (const raw of rawItemRules) {
      if (raw.consequent.length !== 1) continue;

      const consItem = raw.consequent[0];
      const product = productMap.get(consItem);

      // Never recommend OUT_OF_COLLECTION items
      if (product && EXCLUDED_COLLECTION.has(product.collectionStatus)) continue;

      const consAvgPrice =
        avgPriceMap.get(consItem) || product?.salesPrice || 0;
      const stockInfo = getStockInfo(stockMap.get(consItem));

      // Profit lift: lift * margin
      const margin = product
        ? product.salesPrice - product.costPrice
        : consAvgPrice * 0.4; // fallback 40% margin
      const profitLift = raw.lift * Math.max(0, margin);

      // Basket uplift: avg basket value WITH consequent vs WITHOUT
      const consOrders = itemToOrders.get(consItem);
      let basketUplift = 0;
      if (consOrders && consOrders.size > 0) {
        let withTotal = 0,
          withCount = 0,
          withoutTotal = 0,
          withoutCount = 0;
        for (const [oNum, oVal] of orderValues) {
          if (consOrders.has(oNum)) {
            withTotal += oVal;
            withCount++;
          } else {
            withoutTotal += oVal;
            withoutCount++;
          }
        }
        const avgWith = withCount > 0 ? withTotal / withCount : 0;
        const avgWithout = withoutCount > 0 ? withoutTotal / withoutCount : 0;
        basketUplift = avgWithout > 0 ? (avgWith - avgWithout) / avgWithout : 0;
      }

      // Stability score: coefficient of variation of monthly confidence
      let stabilityScore: "low" | "medium" | "high" = "medium";
      if (sortedMonths.length >= 3) {
        const monthlyConf: number[] = [];
        for (const ym of sortedMonths) {
          const monthOrdSet = monthOrders.get(ym)!;
          // Build transactions for this month that contain the antecedent
          let anteCount = 0;
          let bothCount = 0;
          for (const oNum of monthOrdSet) {
            const order = orders.get(oNum);
            if (!order) continue;
            const hasAnte = raw.antecedent.every((a) => order.items.has(a));
            if (hasAnte) {
              anteCount++;
              if (order.items.has(consItem)) bothCount++;
            }
          }
          if (anteCount >= 2) {
            monthlyConf.push(bothCount / anteCount);
          }
        }
        if (monthlyConf.length >= 3) {
          const mean =
            monthlyConf.reduce((a, b) => a + b, 0) / monthlyConf.length;
          if (mean > 0) {
            const variance =
              monthlyConf.reduce((s, v) => s + (v - mean) ** 2, 0) /
              monthlyConf.length;
            const cv = Math.sqrt(variance) / mean;
            if (cv < 0.2) stabilityScore = "high";
            else if (cv > 0.5) stabilityScore = "low";
            else stabilityScore = "medium";
          }
        }
      }

      // Alternative: find in-stock item in same subCategory
      let alternative: EnrichedItemRule["alternative"] = null;
      if (
        stockInfo.status === "out_of_stock" &&
        product?.subCategory
      ) {
        const candidates = subCatItems.get(product.subCategory) || [];
        for (const altCode of candidates) {
          if (altCode === consItem) continue;
          const altStock = getStockInfo(stockMap.get(altCode));
          if (
            altStock.status === "in_stock" ||
            altStock.status === "low_stock"
          ) {
            alternative = {
              code: altCode,
              name: nameMap.get(altCode) || productMap.get(altCode)?.name || altCode,
              stock: altStock,
            };
            break;
          }
        }
      }

      itemRules.push({
        antecedent: raw.antecedent,
        consequent: raw.consequent,
        antecedentNames: raw.antecedent.map((s) => nameMap.get(s) || s),
        consequentNames: raw.consequent.map((s) => nameMap.get(s) || s),
        support: raw.support,
        confidence: raw.confidence,
        lift: raw.lift,
        count: raw.count,
        revenueLift: raw.lift * consAvgPrice,
        consequentAvgPrice: consAvgPrice,
        consequentStock: stockInfo,
        consequentItemGroup: product?.itemGroup || "",
        consequentSubCategory: product?.subCategory || "",
        consequentSalesPrice: product?.salesPrice || 0,
        profitLift,
        basketUplift,
        stabilityScore,
        alternative,
      });
    }

    itemRules.sort((a, b) => b.lift - a.lift);

    // ── Step 4: Mine category-level rules ──────────────────────────────────

    progress("Mining categories", 66, "Mining category-level patterns...");

    const igItemsets =
      itemGroupTransactions.length >= 2
        ? mineFrequentItemsets(itemGroupTransactions, 0.005, 3)
        : new Map<string, number>();

    const scItemsets =
      subCategoryTransactions.length >= 2
        ? mineFrequentItemsets(subCategoryTransactions, 0.005, 3)
        : new Map<string, number>();

    const rawIGRules = igItemsets.size > 0
      ? generateRules(igItemsets, itemGroupTransactions.length, 0.1, 1.0)
      : [];
    const rawSCRules = scItemsets.size > 0
      ? generateRules(scItemsets, subCategoryTransactions.length, 0.1, 1.0)
      : [];

    // Build heatmap matrices
    const itemGroupMatrix: Array<{
      row: string;
      col: string;
      lift: number;
      confidence: number;
      count: number;
    }> = [];
    for (const rule of rawIGRules) {
      if (rule.antecedent.length === 1 && rule.consequent.length === 1) {
        itemGroupMatrix.push({
          row: rule.antecedent[0],
          col: rule.consequent[0],
          lift: rule.lift,
          confidence: rule.confidence,
          count: rule.count,
        });
      }
    }

    const subCategoryMatrix: Array<{
      row: string;
      col: string;
      lift: number;
      confidence: number;
      count: number;
    }> = [];
    for (const rule of rawSCRules) {
      if (rule.antecedent.length === 1 && rule.consequent.length === 1) {
        subCategoryMatrix.push({
          row: rule.antecedent[0],
          col: rule.consequent[0],
          lift: rule.lift,
          confidence: rule.confidence,
          count: rule.count,
        });
      }
    }

    const crossCategoryRules = [
      ...rawIGRules
        .filter(
          (r) =>
            r.antecedent.length === 1 &&
            r.consequent.length === 1 &&
            r.antecedent[0] !== r.consequent[0]
        )
        .map((r) => ({
          antecedent: r.antecedent[0],
          consequent: r.consequent[0],
          support: r.support,
          confidence: r.confidence,
          lift: r.lift,
          count: r.count,
          level: "itemGroup" as const,
        })),
      ...rawSCRules
        .filter(
          (r) =>
            r.antecedent.length === 1 &&
            r.consequent.length === 1 &&
            r.antecedent[0] !== r.consequent[0]
        )
        .map((r) => ({
          antecedent: r.antecedent[0],
          consequent: r.consequent[0],
          support: r.support,
          confidence: r.confidence,
          lift: r.lift,
          count: r.count,
          level: "subCategory" as const,
        })),
    ]
      .sort((a, b) => b.lift - a.lift)
      .slice(0, 20);

    // ── Step 5: Bundle detection ───────────────────────────────────────────

    progress("Detecting bundles", 70, "Finding product bundles...");

    const bundles: Array<{
      id: string;
      name: string;
      items: Array<{
        code: string;
        name: string;
        itemGroup: string;
        salesPrice: number;
        stock: StockInfo;
      }>;
      support: number;
      frequency: number;
      totalValue: number;
      stockCompleteness: number;
      categories: string[];
    }> = [];

    for (const [key, count] of itemItemsets) {
      const items = key.split("\x00");
      if (items.length < 3 || items.length > 5) continue;

      const categories = new Set<string>();
      for (const item of items) {
        const p = productMap.get(item);
        if (p?.itemGroup) categories.add(p.itemGroup);
      }
      if (categories.size < 2) continue;

      const support = count / itemTransactions.length;
      if (support < filters.minSupport * 0.5) continue;

      const bundleItems = items.map((code) => {
        const p = productMap.get(code);
        const s = stockMap.get(code);
        return {
          code,
          name: nameMap.get(code) || p?.name || code,
          itemGroup: p?.itemGroup || "",
          salesPrice: p?.salesPrice || 0,
          stock: getStockInfo(s),
        };
      });

      const totalValue = bundleItems.reduce((sum, b) => sum + b.salesPrice, 0);
      const inStockCount = bundleItems.filter(
        (b) => b.stock.status === "in_stock" || b.stock.status === "low_stock"
      ).length;
      const stockCompleteness =
        bundleItems.length > 0 ? inStockCount / bundleItems.length : 0;
      const catArray = Array.from(categories).sort();

      bundles.push({
        id: key,
        name: generateBundleName(catArray),
        items: bundleItems,
        support,
        frequency: count,
        totalValue,
        stockCompleteness,
        categories: catArray,
      });
    }

    bundles.sort((a, b) => b.frequency - a.frequency);
    const topBundles = bundles.slice(0, 50);

    // ── Step 6: Sequential rules ───────────────────────────────────────────

    progress("Sequential rules", 74, "Mining sequential patterns...");

    // Build sequential pairs: for each customer with 2+ orders, pair consecutive orders
    const seqPairCounts = new Map<string, { count: number; totalDays: number }>();
    const seqAnteCounts = new Map<string, number>();
    const seqConsCounts = new Map<string, number>();
    let totalSeqPairs = 0;

    for (const [, orderNums] of customerOrders) {
      if (orderNums.length < 2) continue;
      // Sort by date
      const dated = orderNums
        .map((o) => ({ num: o, date: orderDates.get(o) }))
        .filter((o) => o.date)
        .sort((a, b) => a.date!.getTime() - b.date!.getTime());

      for (let i = 0; i < dated.length - 1; i++) {
        const orderA = orders.get(dated[i].num);
        const orderB = orders.get(dated[i + 1].num);
        if (!orderA || !orderB) continue;

        const daysBetween = Math.round(
          (dated[i + 1].date!.getTime() - dated[i].date!.getTime()) /
            (1000 * 60 * 60 * 24)
        );
        if (daysBetween > 365) continue; // skip if > 1 year apart

        totalSeqPairs++;

        // Track each item in A → each item in B
        for (const itemA of orderA.items) {
          const aKey = itemA;
          seqAnteCounts.set(aKey, (seqAnteCounts.get(aKey) || 0) + 1);
          for (const itemB of orderB.items) {
            if (itemA === itemB) continue; // skip self
            const bKey = itemB;
            seqConsCounts.set(bKey, (seqConsCounts.get(bKey) || 0) + 1);
            const pairKey = `${itemA}\x00${itemB}`;
            const existing = seqPairCounts.get(pairKey);
            if (existing) {
              existing.count++;
              existing.totalDays += daysBetween;
            } else {
              seqPairCounts.set(pairKey, { count: 1, totalDays: daysBetween });
            }
          }
        }
      }
    }

    const sequentialRules: Array<{
      antecedent: string[];
      consequent: string[];
      antecedentNames: string[];
      consequentNames: string[];
      support: number;
      confidence: number;
      lift: number;
      count: number;
      avgDaysBetween: number;
      consequentStock: StockInfo;
    }> = [];

    if (totalSeqPairs > 0) {
      const minSeqCount = Math.max(2, Math.floor(totalSeqPairs * filters.minSupport * 0.5));
      for (const [pairKey, data] of seqPairCounts) {
        if (data.count < minSeqCount) continue;
        const [itemA, itemB] = pairKey.split("\x00");
        const anteCount = seqAnteCounts.get(itemA) || 0;
        if (anteCount < 2) continue;

        const support = data.count / totalSeqPairs;
        const confidence = data.count / anteCount;
        if (confidence < filters.minConfidence * 0.5) continue;

        const consSupport = (seqConsCounts.get(itemB) || 0) / totalSeqPairs;
        const lift = consSupport > 0 ? confidence / consSupport : 0;
        if (lift < 1.0) continue;

        const productB = productMap.get(itemB);
        if (productB && EXCLUDED_COLLECTION.has(productB.collectionStatus)) continue;

        sequentialRules.push({
          antecedent: [itemA],
          consequent: [itemB],
          antecedentNames: [nameMap.get(itemA) || itemA],
          consequentNames: [nameMap.get(itemB) || itemB],
          support,
          confidence,
          lift,
          count: data.count,
          avgDaysBetween: Math.round(data.totalDays / data.count),
          consequentStock: getStockInfo(stockMap.get(itemB)),
        });
      }
      sequentialRules.sort((a, b) => b.lift - a.lift);
      sequentialRules.splice(200); // cap at 200
    }

    // ── Step 7: RFM Segmentation ───────────────────────────────────────────

    progress("RFM Segmentation", 78, "Computing customer segments...");

    type RFMSegment = "champion" | "loyal" | "potential" | "at_risk" | "lost";

    interface CustomerRFM {
      customer: string;
      recency: number;
      frequency: number;
      monetary: number;
      segment: RFMSegment;
      items: Set<string>;
    }

    const now = new Date();
    const customerRFMs: CustomerRFM[] = [];

    for (const [customer, orderNums] of customerOrders) {
      if (!customer) continue;
      let latestDate: Date | null = null;
      let totalSpend = 0;
      const custItems = new Set<string>();

      for (const oNum of orderNums) {
        const order = orders.get(oNum);
        if (!order) continue;
        totalSpend += order.total;
        for (const item of order.items) custItems.add(item);
        if (order.date) {
          if (!latestDate || order.date > latestDate) latestDate = order.date;
        }
      }

      const recency = latestDate
        ? Math.round((now.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24))
        : 9999;
      const frequency = orderNums.length;
      const monetary = totalSpend;

      customerRFMs.push({
        customer,
        recency,
        frequency,
        monetary,
        segment: "potential", // placeholder, scored below
        items: custItems,
      });
    }

    // Score RFM using quintiles
    if (customerRFMs.length > 0) {
      const sortByVal = (arr: number[]) => [...arr].sort((a, b) => a - b);
      const recencies = sortByVal(customerRFMs.map((c) => c.recency));
      const frequencies = sortByVal(customerRFMs.map((c) => c.frequency));
      const monetaries = sortByVal(customerRFMs.map((c) => c.monetary));

      const quintile = (sorted: number[], val: number): number => {
        const idx = sorted.findIndex((v) => v >= val);
        const pos = idx === -1 ? sorted.length : idx;
        return Math.min(4, Math.floor((pos / sorted.length) * 5));
      };

      for (const c of customerRFMs) {
        const rScore = 4 - quintile(recencies, c.recency); // lower recency = better
        const fScore = quintile(frequencies, c.frequency);
        const mScore = quintile(monetaries, c.monetary);
        const total = rScore + fScore + mScore; // 0-12

        if (total >= 10) c.segment = "champion";
        else if (total >= 8) c.segment = "loyal";
        else if (total >= 5) c.segment = "potential";
        else if (total >= 3) c.segment = "at_risk";
        else c.segment = "lost";
      }
    }

    // Aggregate segments
    const segmentMap = new Map<
      RFMSegment,
      {
        customers: CustomerRFM[];
        totalRecency: number;
        totalFrequency: number;
        totalMonetary: number;
        itemCounts: Map<string, number>;
      }
    >();

    for (const c of customerRFMs) {
      if (!segmentMap.has(c.segment)) {
        segmentMap.set(c.segment, {
          customers: [],
          totalRecency: 0,
          totalFrequency: 0,
          totalMonetary: 0,
          itemCounts: new Map(),
        });
      }
      const seg = segmentMap.get(c.segment)!;
      seg.customers.push(c);
      seg.totalRecency += c.recency;
      seg.totalFrequency += c.frequency;
      seg.totalMonetary += c.monetary;
      for (const item of c.items) {
        seg.itemCounts.set(item, (seg.itemCounts.get(item) || 0) + 1);
      }
    }

    const segments: Array<{
      segment: RFMSegment;
      customerCount: number;
      avgRecency: number;
      avgFrequency: number;
      avgMonetary: number;
      topItems: string[];
      topItemNames: string[];
    }> = [];

    for (const [segment, data] of segmentMap) {
      const count = data.customers.length;
      const topItems = Array.from(data.itemCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([code]) => code);

      segments.push({
        segment,
        customerCount: count,
        avgRecency: Math.round(data.totalRecency / count),
        avgFrequency: Math.round((data.totalFrequency / count) * 10) / 10,
        avgMonetary: Math.round(data.totalMonetary / count),
        topItems,
        topItemNames: topItems.map((c) => nameMap.get(c) || c),
      });
    }

    // Sort by segment order
    const segOrder: Record<RFMSegment, number> = {
      champion: 0,
      loyal: 1,
      potential: 2,
      at_risk: 3,
      lost: 4,
    };
    segments.sort((a, b) => segOrder[a.segment] - segOrder[b.segment]);

    // ── Step 8: Negative rules & Cannibalization ───────────────────────────

    progress("Conflicts", 82, "Detecting negative rules & cannibalization...");

    // Negative rules: item pairs with lift < 1 (appear together less than expected)
    const negativeRules: Array<{
      itemA: string;
      itemB: string;
      nameA: string;
      nameB: string;
      observedSupport: number;
      expectedSupport: number;
      lift: number;
      itemGroupA: string;
      itemGroupB: string;
    }> = [];

    // Use frequent single items from itemItemsets to find pairs with low co-occurrence
    const singleItemCounts = new Map<string, number>();
    for (const [key, count] of itemItemsets) {
      if (!key.includes("\x00")) {
        singleItemCounts.set(key, count);
      }
    }

    const totalTx = itemTransactions.length;
    // Check pairs from top 100 items
    const topSingleItems = Array.from(singleItemCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100);

    for (let i = 0; i < topSingleItems.length; i++) {
      for (let j = i + 1; j < topSingleItems.length; j++) {
        const [itemA, countA] = topSingleItems[i];
        const [itemB, countB] = topSingleItems[j];
        const pairKey = [itemA, itemB].sort().join("\x00");
        const pairCount = itemItemsets.get(pairKey) || 0;

        const suppA = countA / totalTx;
        const suppB = countB / totalTx;
        const expectedSupport = suppA * suppB;
        const observedSupport = pairCount / totalTx;
        const lift = expectedSupport > 0 ? observedSupport / expectedSupport : 0;

        if (lift < 0.5 && lift > 0 && pairCount >= 1) {
          const pA = productMap.get(itemA);
          const pB = productMap.get(itemB);
          negativeRules.push({
            itemA,
            itemB,
            nameA: nameMap.get(itemA) || itemA,
            nameB: nameMap.get(itemB) || itemB,
            observedSupport,
            expectedSupport,
            lift,
            itemGroupA: pA?.itemGroup || "",
            itemGroupB: pB?.itemGroup || "",
          });
        }
      }
    }

    negativeRules.sort((a, b) => a.lift - b.lift);
    negativeRules.splice(50);

    // Cannibalization: same subCategory, similar price, rarely co-occurring
    const cannibalizationPairs: Array<{
      itemA: string;
      itemB: string;
      nameA: string;
      nameB: string;
      subCategory: string;
      priceA: number;
      priceB: number;
      coOccurrenceRate: number;
      soloRateA: number;
      soloRateB: number;
    }> = [];

    for (const [subCat, items] of subCatItems) {
      if (items.length < 2 || items.length > 50) continue;
      for (let i = 0; i < items.length; i++) {
        const countA = singleItemCounts.get(items[i]) || 0;
        if (countA < 3) continue;
        const priceA = productMap.get(items[i])?.salesPrice || 0;
        if (priceA === 0) continue;

        for (let j = i + 1; j < items.length; j++) {
          const countB = singleItemCounts.get(items[j]) || 0;
          if (countB < 3) continue;
          const priceB = productMap.get(items[j])?.salesPrice || 0;
          if (priceB === 0) continue;

          // Similar price: within 30%
          const ratio = Math.min(priceA, priceB) / Math.max(priceA, priceB);
          if (ratio < 0.7) continue;

          const pairKey = [items[i], items[j]].sort().join("\x00");
          const pairCount = itemItemsets.get(pairKey) || 0;
          const coRate = Math.min(countA, countB) > 0
            ? pairCount / Math.min(countA, countB)
            : 0;

          // Low co-occurrence = potential cannibalization
          if (coRate < 0.15) {
            const ordersA = itemToOrders.get(items[i]);
            const ordersB = itemToOrders.get(items[j]);
            const soloA = ordersA
              ? Array.from(ordersA).filter(
                  (o) => !ordersB || !ordersB.has(o)
                ).length / ordersA.size
              : 0;
            const soloB = ordersB
              ? Array.from(ordersB).filter(
                  (o) => !ordersA || !ordersA.has(o)
                ).length / ordersB.size
              : 0;

            cannibalizationPairs.push({
              itemA: items[i],
              itemB: items[j],
              nameA: nameMap.get(items[i]) || items[i],
              nameB: nameMap.get(items[j]) || items[j],
              subCategory: subCat,
              priceA,
              priceB,
              coOccurrenceRate: coRate,
              soloRateA: soloA,
              soloRateB: soloB,
            });
          }
        }
      }
    }

    cannibalizationPairs.sort((a, b) => a.coOccurrenceRate - b.coOccurrenceRate);
    cannibalizationPairs.splice(50);

    // ── Step 9: Salesperson Metrics ─────────────────────────────────────────

    progress("Salesperson metrics", 86, "Computing salesperson performance...");

    const spOrderMap = new Map<
      string,
      { orderNums: Set<string>; revenue: number; items: Set<string>; crossSellOrders: number }
    >();

    for (const [orderNum, order] of orders) {
      if (!order.salesperson) continue;
      if (!spOrderMap.has(order.salesperson)) {
        spOrderMap.set(order.salesperson, {
          orderNums: new Set(),
          revenue: 0,
          items: new Set(),
          crossSellOrders: 0,
        });
      }
      const sp = spOrderMap.get(order.salesperson)!;
      sp.orderNums.add(orderNum);
      sp.revenue += order.total;
      for (const item of order.items) sp.items.add(item);
      if (order.itemGroups.size >= 2) sp.crossSellOrders++;
    }

    const salespersonMetrics: Array<{
      name: string;
      totalOrders: number;
      totalRevenue: number;
      uniqueItems: number;
      avgBasketSize: number;
      avgBasketValue: number;
      topItems: string[];
      topItemNames: string[];
      crossSellRate: number;
    }> = [];

    for (const [name, data] of spOrderMap) {
      const orderCount = data.orderNums.size;
      if (orderCount === 0) continue;

      // Count items per order for basket size
      let totalBasketSize = 0;
      for (const oNum of data.orderNums) {
        const order = orders.get(oNum);
        if (order) totalBasketSize += order.items.size;
      }

      // Top items by frequency
      const itemFreq = new Map<string, number>();
      for (const oNum of data.orderNums) {
        const order = orders.get(oNum);
        if (!order) continue;
        for (const item of order.items) {
          itemFreq.set(item, (itemFreq.get(item) || 0) + 1);
        }
      }
      const topItems = Array.from(itemFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([code]) => code);

      salespersonMetrics.push({
        name,
        totalOrders: orderCount,
        totalRevenue: Math.round(data.revenue),
        uniqueItems: data.items.size,
        avgBasketSize: Math.round((totalBasketSize / orderCount) * 10) / 10,
        avgBasketValue: Math.round(data.revenue / orderCount),
        topItems,
        topItemNames: topItems.map((c) => nameMap.get(c) || c),
        crossSellRate:
          Math.round((data.crossSellOrders / orderCount) * 1000) / 10,
      });
    }

    salespersonMetrics.sort((a, b) => b.totalRevenue - a.totalRevenue);

    // ── Step 10: Seasonality ────────────────────────────────────────────────

    progress("Seasonality", 90, "Computing seasonal patterns...");

    const monthlyData = new Map<
      string,
      { orderCount: number; revenue: number; items: Map<string, number>; totalBasketSize: number }
    >();

    for (const [, order] of orders) {
      if (!order.date) continue;
      const ym = toYearMonth(order.date);
      if (!monthlyData.has(ym)) {
        monthlyData.set(ym, {
          orderCount: 0,
          revenue: 0,
          items: new Map(),
          totalBasketSize: 0,
        });
      }
      const md = monthlyData.get(ym)!;
      md.orderCount++;
      md.revenue += order.total;
      md.totalBasketSize += order.items.size;
      for (const item of order.items) {
        md.items.set(item, (md.items.get(item) || 0) + 1);
      }
    }

    const seasonalData: Array<{
      period: string;
      orderCount: number;
      revenue: number;
      topItems: string[];
      topItemNames: string[];
      avgBasketSize: number;
    }> = [];

    for (const [period, data] of Array.from(monthlyData.entries()).sort(
      (a, b) => a[0].localeCompare(b[0])
    )) {
      const topItems = Array.from(data.items.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([code]) => code);

      seasonalData.push({
        period,
        orderCount: data.orderCount,
        revenue: Math.round(data.revenue),
        topItems,
        topItemNames: topItems.map((c) => nameMap.get(c) || c),
        avgBasketSize:
          Math.round((data.totalBasketSize / data.orderCount) * 10) / 10,
      });
    }

    // ── Step 11: Smart Bundles ──────────────────────────────────────────────

    progress("Smart bundles", 94, "Generating smart bundles...");

    // Smart bundles: margin-optimized, all in-stock, from top item rules
    const smartBundles: typeof bundles = [];
    const usedItems = new Set<string>();

    // Group rules by antecedent
    const rulesByAnte = new Map<string, typeof itemRules>();
    for (const rule of itemRules) {
      const anteKey = rule.antecedent.join("\x00");
      if (!rulesByAnte.has(anteKey)) rulesByAnte.set(anteKey, []);
      rulesByAnte.get(anteKey)!.push(rule);
    }

    let bundleId = 0;
    for (const [anteKey, rules] of rulesByAnte) {
      if (smartBundles.length >= 20) break;
      const anteItems = anteKey.split("\x00");

      // Pick top 2-3 consequents by profitLift that are in stock
      const goodCons = rules
        .filter(
          (r) =>
            r.consequentStock.status === "in_stock" ||
            r.consequentStock.status === "low_stock"
        )
        .sort((a, b) => b.profitLift - a.profitLift)
        .slice(0, 3);

      if (goodCons.length === 0) continue;

      const allItems = [
        ...anteItems,
        ...goodCons.map((r) => r.consequent[0]),
      ];

      // Skip if we've already used these items
      if (allItems.some((i) => usedItems.has(i))) continue;

      const categories = new Set<string>();
      const bundleItems = allItems.map((code) => {
        const p = productMap.get(code);
        const s = stockMap.get(code);
        if (p?.itemGroup) categories.add(p.itemGroup);
        return {
          code,
          name: nameMap.get(code) || p?.name || code,
          itemGroup: p?.itemGroup || "",
          salesPrice: p?.salesPrice || 0,
          stock: getStockInfo(s),
        };
      });

      if (bundleItems.length < 3) continue;

      const totalValue = bundleItems.reduce((sum, b) => sum + b.salesPrice, 0);
      const inStockCount = bundleItems.filter(
        (b) => b.stock.status === "in_stock" || b.stock.status === "low_stock"
      ).length;
      const stockCompleteness = inStockCount / bundleItems.length;
      const catArray = Array.from(categories).sort();

      if (stockCompleteness < 0.8) continue;

      for (const i of allItems) usedItems.add(i);
      smartBundles.push({
        id: `smart-${bundleId++}`,
        name: `Smart: ${generateBundleName(catArray)}`,
        items: bundleItems,
        support: goodCons[0].support,
        frequency: goodCons[0].count,
        totalValue,
        stockCompleteness,
        categories: catArray,
      });
    }

    // ── Compute estimated revenue opportunity ──────────────────────────────

    const top20ByRevenue = [...itemRules]
      .sort((a, b) => b.revenueLift - a.revenueLift)
      .slice(0, 20);
    const estimatedRevenue = top20ByRevenue.reduce(
      (sum, r) => sum + r.support * r.consequentAvgPrice * 100,
      0
    );

    // ── Build salesperson items record ─────────────────────────────────────

    const spItems: Record<string, string[]> = {};
    for (const [sp, items] of salespersonItemsMap) {
      spItems[sp] = Array.from(items);
    }

    progress("Complete", 100, "Done!");

    ctx.postMessage({
      type: "done",
      results: {
        itemRules,
        itemGroupMatrix,
        subCategoryMatrix,
        crossCategoryRules,
        bundles: topBundles,
        stats: {
          totalOrders: orders.size,
          uniqueItems,
          rulesFound: itemRules.length,
          estimatedRevenueOpportunity: Math.round(estimatedRevenue),
          computeTimeMs: Math.round(performance.now() - startTime),
        },
        salespersons: Array.from(allSalespersons).sort(),
        itemGroups: Array.from(allItemGroups).sort(),
        salespersonItems: spItems,
        sequentialRules,
        segments,
        negativeRules,
        cannibalizationPairs,
        salespersonMetrics,
        seasonalData,
        smartBundles,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.postMessage({ type: "error", message });
  }
};

export {};
