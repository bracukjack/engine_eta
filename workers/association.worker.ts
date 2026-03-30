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
    }

    const orders = new Map<string, OrderData>();
    const itemNetPrices = new Map<string, number[]>();
    const salespersonItemsMap = new Map<string, Set<string>>();
    const allSalespersons = new Set<string>();
    const allItemGroups = new Set<string>();
    const nameMap = new Map<string, string>();

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

      // Date filter
      const dateStr = String(row["Order date"] || "").trim();
      if (dateStr && (dateFrom || dateTo)) {
        const date = parseDMY(dateStr);
        if (date) {
          if (dateFrom && date < dateFrom) continue;
          if (dateTo && date > dateTo) continue;
        }
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

      // Build order basket
      if (!orders.has(orderNum)) {
        orders.set(orderNum, {
          items: new Set(),
          itemGroups: new Set(),
          subCategories: new Set(),
          salesperson,
        });
      }
      const order = orders.get(orderNum)!;
      order.items.add(item);
      if (itemGroup) order.itemGroups.add(itemGroup);
      if (subCategory) order.subCategories.add(subCategory);
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
      65,
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

    // Enrich item rules (only single-consequent for clarity)
    const itemRules: Array<{
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
    }> = [];

    for (const raw of rawItemRules) {
      if (raw.consequent.length !== 1) continue;

      const consItem = raw.consequent[0];
      const product = productMap.get(consItem);

      // Never recommend OUT_OF_COLLECTION items
      if (product && EXCLUDED_COLLECTION.has(product.collectionStatus)) continue;

      const consAvgPrice =
        avgPriceMap.get(consItem) || product?.salesPrice || 0;
      const stockInfo = getStockInfo(stockMap.get(consItem));

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
      });
    }

    itemRules.sort((a, b) => b.lift - a.lift);

    // ── Step 4: Mine category-level rules ──────────────────────────────────

    progress("Mining categories", 72, "Mining category-level patterns...");

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

    // Build heatmap matrices (1-to-1 rules only)
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

    // Cross-category rules: top 20 by lift (different categories only)
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

    progress("Detecting bundles", 82, "Finding product bundles...");

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

      // Must span 2+ categories
      const categories = new Set<string>();
      for (const item of items) {
        const p = productMap.get(item);
        if (p?.itemGroup) categories.add(p.itemGroup);
      }
      if (categories.size < 2) continue;

      const support = count / itemTransactions.length;
      if (support < filters.minSupport * 0.5) continue; // slightly relaxed threshold for bundles

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
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.postMessage({ type: "error", message });
  }
};

export {};
