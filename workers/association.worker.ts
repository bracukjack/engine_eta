/* eslint-disable no-restricted-globals */

// ── Worker scope ─────────────────────────────────────────────────────────────
interface WorkerSelf {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}
const ctx = self as unknown as WorkerSelf;

// ── Helpers ──────────────────────────────────────────────────────────────────

const SKIP_ITEMS = new Set(["T", "TRANSPORT", "Divers", "CNCL006", ""]);

function parseEuroNum(val: string | null | undefined): number {
  if (!val) return 0;
  const s = String(val).trim();
  if (s === "") return 0;
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function parseDMY(val: string): Date | null {
  if (!val) return null;
  const s = val.trim();
  const parts = s.split("-");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

function progress(step: string, pct: number, message: string) {
  ctx.postMessage({ type: "progress", step, progress: pct, pct, message });
}

// ── Basket building types ────────────────────────────────────────────────────

interface BasketData {
  items: Set<string>;
  names: Map<string, string>;
  date: Date | null;
  customer: string;
  channel: string;
  status: string;
  total: number;
}

// ── Streaming UTF-16 CSV parser ──────────────────────────────────────────────

async function parseAndBuildBaskets(
  file: File,
  skipItems: Set<string>,
  validStatuses: Set<string>,
  dateFrom: Date | null,
  dateTo: Date | null,
  channels: string[]
): Promise<{
  baskets: Map<number, string[]>;
  nameMap: Map<string, string>;
  totalRows: number;
  totalOrders: number;
  allChannels: Set<string>;
}> {
  const reader = file.stream().getReader();
  const nameMap = new Map<string, string>();
  const orderMap = new Map<number, BasketData>();
  const allChannels = new Set<string>();
  let totalRows = 0;
  let leftover = "";
  let headerCols: string[] | null = null;
  let bytesRead = 0;
  const fileSize = file.size;

  // Detect UTF-16 LE from first chunk
  let isUtf16 = false;
  let firstChunk = true;

  // Column index cache
  let colIdx: Record<string, number> = {};

  const decoder8 = new TextDecoder("utf-8");
  const decoder16 = new TextDecoder("utf-16le");

  // We accumulate bytes for UTF-16 since TextDecoderStream may not be available in workers
  let allBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(0);

  function concatBytes(a: Uint8Array<ArrayBufferLike>, b: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBufferLike> {
    const c = new Uint8Array(a.length + b.length);
    c.set(a);
    c.set(b, a.length);
    return c;
  }

  // Read the file in chunks
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    bytesRead += value.byteLength;

    if (firstChunk) {
      firstChunk = false;
      isUtf16 = value.length >= 2 && value[0] === 0xff && value[1] === 0xfe;
    }

    let text: string;
    if (isUtf16) {
      allBytes = concatBytes(allBytes, value);
      // Only decode complete pairs of bytes
      const usable = allBytes.length - (allBytes.length % 2);
      if (usable === 0) continue;
      text = decoder16.decode(allBytes.subarray(0, usable));
      allBytes = allBytes.subarray(usable);
    } else {
      text = decoder8.decode(value, { stream: true });
    }

    // Remove BOM from first decode
    if (totalRows === 0 && text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }

    const combined = leftover + text;
    const lines = combined.split(/\r?\n/);
    leftover = lines.pop() || "";

    for (const line of lines) {
      if (line.trim() === "") continue;

      const cols = line.split("\t").map((c) => c.replace(/^"|"$/g, "").trim());

      // First non-empty line is the header
      if (!headerCols) {
        headerCols = cols;
        for (let i = 0; i < cols.length; i++) {
          colIdx[cols[i]] = i;
        }
        continue;
      }

      totalRows++;

      const get = (name: string) => {
        const i = colIdx[name];
        return i !== undefined ? cols[i] || "" : "";
      };

      // Skip header rows
      const header = get("Header");
      if (header === "H") continue;

      const orderNumStr = get("Order number");
      const orderNum = parseInt(orderNumStr, 10);
      if (isNaN(orderNum)) continue;

      const item = get("Item");
      if (skipItems.has(item) || !item) continue;

      const status = get("Order status");
      if (!validStatuses.has(status)) continue;

      const channel = get("Deliver toDescription");
      allChannels.add(channel);

      // Channel filter
      if (channels.length > 0 && !channels.includes(channel)) continue;

      // Date filter
      const dateStr = get("Order date");
      const date = parseDMY(dateStr);
      if (dateFrom && date && date < dateFrom) continue;
      if (dateTo && date && date > dateTo) continue;

      const itemName = get("Item descriptionDescription");
      const netPrice = parseEuroNum(get("Net price"));
      const qty = parseEuroNum(get("Quantity"));
      const customer = get("Ordered byDescription");

      if (!orderMap.has(orderNum)) {
        orderMap.set(orderNum, {
          items: new Set(),
          names: new Map(),
          date,
          customer,
          channel,
          status,
          total: 0,
        });
      }

      const basket = orderMap.get(orderNum)!;
      basket.items.add(item);
      basket.names.set(item, itemName);
      nameMap.set(item, itemName);
      basket.total += netPrice * qty;

      if (totalRows % 10000 === 0) {
        const pct = Math.min(Math.round((bytesRead / fileSize) * 40), 40);
        progress("parse", pct, `Reading ${totalRows.toLocaleString()} rows...`);
      }
    }
  }

  // Process leftover
  if (leftover.trim() && headerCols) {
    const cols = leftover.split("\t").map((c) => c.replace(/^"|"$/g, "").trim());
    totalRows++;
    const get = (name: string) => {
      const i = colIdx[name];
      return i !== undefined ? cols[i] || "" : "";
    };
    const header = get("Header");
    if (header !== "H") {
      const orderNum = parseInt(get("Order number"), 10);
      const item = get("Item");
      const status = get("Order status");
      if (!isNaN(orderNum) && item && !skipItems.has(item) && validStatuses.has(status)) {
        const channel = get("Deliver toDescription");
        allChannels.add(channel);
        if (channels.length === 0 || channels.includes(channel)) {
          const date = parseDMY(get("Order date"));
          const skip =
            (dateFrom && date && date < dateFrom) ||
            (dateTo && date && date > dateTo);
          if (!skip) {
            if (!orderMap.has(orderNum)) {
              orderMap.set(orderNum, {
                items: new Set(),
                names: new Map(),
                date,
                customer: get("Ordered byDescription"),
                channel,
                status,
                total: 0,
              });
            }
            const basket = orderMap.get(orderNum)!;
            basket.items.add(item);
            const itemName = get("Item descriptionDescription");
            basket.names.set(item, itemName);
            nameMap.set(item, itemName);
          }
        }
      }
    }
  }

  progress("parse", 40, `Parsed ${totalRows.toLocaleString()} rows`);

  // Build final baskets (only those with ≥ minBasketSize items)
  const baskets = new Map<number, string[]>();
  for (const [orderId, data] of orderMap) {
    const items = Array.from(data.items).sort();
    baskets.set(orderId, items);
  }
  orderMap.clear(); // free memory

  return { baskets, nameMap, totalRows, totalOrders: baskets.size, allChannels };
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
  itemCounts: Map<string, number>;

  constructor() {
    this.root = new FPNode("", 0, null);
    this.headerTable = new Map();
    this.itemCounts = new Map();
  }

  addTransaction(items: string[]) {
    let node = this.root;
    for (const item of items) {
      if (!node.children.has(item)) {
        const newNode = new FPNode(item, 0, node);
        node.children.set(item, newNode);
        // Update header table linked list
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
      this.itemCounts.set(item, (this.itemCounts.get(item) || 0) + 1);
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
    if (path.size > 0) {
      patterns.push(path);
    }
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

  // Prune infrequent items
  const freqItems = new Set<string>();
  for (const [item, count] of freqCount) {
    if (count >= minCount) freqItems.add(item);
  }
  if (freqItems.size === 0) return null;

  // Build tree from filtered patterns
  const tree = new FPTree();
  const sorted = Array.from(freqItems).sort(
    (a, b) => (freqCount.get(b) || 0) - (freqCount.get(a) || 0)
  );
  const rank = new Map(sorted.map((item, i) => [item, i]));

  for (const path of patterns) {
    const items = Array.from(path.keys())
      .filter((i) => freqItems.has(i))
      .sort((a, b) => (rank.get(a) || 0) - (rank.get(b) || 0));

    // Add each item with the pattern's count
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

  // Process items from least frequent to most
  const items = Array.from(tree.headerTable.keys());
  const itemCounts = new Map<string, number>();
  for (const item of items) {
    let count = 0;
    let node: FPNode | null = tree.headerTable.get(item) || null;
    while (node) {
      count += node.count;
      node = node.next;
    }
    if (count >= minCount) {
      itemCounts.set(item, count);
    }
  }

  const sortedItems = Array.from(itemCounts.keys()).sort(
    (a, b) => (itemCounts.get(a) || 0) - (itemCounts.get(b) || 0)
  );

  for (const item of sortedItems) {
    const newPrefix = [...prefix, item].sort();
    const key = newPrefix.join("\x00");
    results.set(key, itemCounts.get(item)!);

    // Build conditional pattern base and tree
    const cpb = buildConditionalPatternBase(item, tree.headerTable);
    const condTree = buildConditionalFPTree(cpb, minCount);
    if (condTree) {
      fpGrowth(condTree, newPrefix, minCount, maxSize, results);
    }
  }
}

function mineFrequentItemsets(
  transactions: string[][],
  minSupport: number,
  maxSize: number
): Map<string, number> {
  const totalTx = transactions.length;
  const minCount = Math.max(1, Math.floor(totalTx * minSupport));

  progress("mine", 50, "Counting item frequencies...");

  // Count single item frequencies
  const itemFreq = new Map<string, number>();
  for (const tx of transactions) {
    for (const item of tx) {
      itemFreq.set(item, (itemFreq.get(item) || 0) + 1);
    }
  }

  // Keep only frequent items
  const freqItems = new Set<string>();
  for (const [item, count] of itemFreq) {
    if (count >= minCount) freqItems.add(item);
  }

  // Sort items by frequency (descending) for optimal tree construction
  const sorted = Array.from(freqItems).sort(
    (a, b) => (itemFreq.get(b) || 0) - (itemFreq.get(a) || 0)
  );
  const rank = new Map(sorted.map((item, i) => [item, i]));

  progress("mine", 55, `Building FP-Tree with ${freqItems.size} frequent items...`);

  // Build FP-Tree
  const tree = new FPTree();
  for (const tx of transactions) {
    const filtered = tx
      .filter((i) => freqItems.has(i))
      .sort((a, b) => (rank.get(a) || 0) - (rank.get(b) || 0));
    if (filtered.length > 0) {
      tree.addTransaction(filtered);
    }
  }

  progress("mine", 65, "Mining frequent itemsets...");

  // Run FP-Growth
  const results = new Map<string, number>();
  // Add single item counts
  for (const item of freqItems) {
    results.set(item, itemFreq.get(item)!);
  }

  fpGrowth(tree, [], minCount, maxSize, results);

  return results;
}

// ── Rule generation ──────────────────────────────────────────────────────────

interface RuleRaw {
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
): RuleRaw[] {
  const rules: RuleRaw[] = [];

  for (const [key, count] of itemsets) {
    const items = key.split("\x00");
    if (items.length < 2) continue;

    const support = count / totalTx;

    // Generate all possible antecedent → consequent splits
    // For a set {A,B,C}: A→{B,C}, B→{A,C}, C→{A,B}, {A,B}→C, {A,C}→B, {B,C}→A
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

      rules.push({
        antecedent: ante,
        consequent: cons,
        support,
        confidence,
        lift,
        count,
      });
    }
  }

  return rules;
}

// ── Discount zones ───────────────────────────────────────────────────────────

type DiscountZone = "green" | "yellow" | "purple" | "gray";

function getDiscountZone(confidence: number, lift: number): DiscountZone {
  if (confidence >= 0.8 && lift >= 1.5) return "green";
  if (confidence >= 0.6 && lift >= 1.2) return "yellow";
  if (lift >= 1.2 && confidence < 0.6) return "purple";
  return "gray";
}

function getRecommendedDiscount(zone: DiscountZone): number {
  switch (zone) {
    case "green":
      return 0;
    case "yellow":
      return 10;
    case "purple":
      return 20;
    case "gray":
      return 0;
  }
}

function getAction(zone: DiscountZone): string {
  switch (zone) {
    case "green":
      return "Show as Frequently Bought Together";
    case "yellow":
      return "Show in cart when product A is added";
    case "purple":
      return "Special campaign to change buying habit";
    case "gray":
      return "No real association — do not create bundle";
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

ctx.onmessage = async (e: MessageEvent) => {
  const { file, params, filters } = e.data;
  const startTime = performance.now();

  try {
    const skipItems = new Set<string>(filters.skipItems || ["T", "TRANSPORT", "Divers", "CNCL006"]);
    const validStatuses = new Set<string>(filters.orderStatuses || ["Complete"]);
    const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
    const dateTo = filters.dateTo ? new Date(filters.dateTo) : null;
    const channels: string[] = filters.channels || [];

    // Step 1: Parse and build baskets
    progress("parse", 5, "Starting file parsing...");
    const { baskets, nameMap, totalRows, totalOrders, allChannels } =
      await parseAndBuildBaskets(file, skipItems, validStatuses, dateFrom, dateTo, channels);

    // Send channels for filter UI
    ctx.postMessage({ type: "channels", channels: Array.from(allChannels).sort() });

    progress("build", 42, `Built ${totalOrders.toLocaleString()} order baskets`);

    // Filter by min basket size
    const minBasket = filters.minBasketSize || 2;
    const transactions: string[][] = [];
    for (const [, items] of baskets) {
      if (items.length >= minBasket) {
        transactions.push(items);
      }
    }
    baskets.clear(); // free memory

    const uniqueSKUs = new Set(transactions.flat()).size;

    progress(
      "build",
      45,
      `${transactions.length.toLocaleString()} baskets with ≥${minBasket} items, ${uniqueSKUs} unique SKUs`
    );

    if (transactions.length === 0) {
      ctx.postMessage({
        type: "done",
        rules: [],
        stats: {
          totalRows,
          totalOrders,
          basketsUsed: 0,
          uniqueSKUs,
          rulesFound: 0,
          strongBundles: 0,
          computeTimeMs: Math.round(performance.now() - startTime),
          channels: Array.from(allChannels).sort(),
        },
      });
      return;
    }

    // Step 2: Mine frequent itemsets
    const itemsets = mineFrequentItemsets(
      transactions,
      params.minSupport,
      params.maxItemsetSize
    );

    progress("compute", 80, `Found ${itemsets.size} frequent itemsets, generating rules...`);

    // Step 3: Generate rules
    const rawRules = generateRules(
      itemsets,
      transactions.length,
      params.minConfidence,
      params.minLift
    );

    progress("compute", 90, `Generated ${rawRules.length} rules, computing zones...`);

    // Step 4: Enrich rules with names and zones
    const rules = rawRules
      .map((r) => ({
        ...r,
        antecedentNames: r.antecedent.map((sku) => nameMap.get(sku) || sku),
        consequentNames: r.consequent.map((sku) => nameMap.get(sku) || sku),
        zone: getDiscountZone(r.confidence, r.lift),
        recommendedDiscountPct: getRecommendedDiscount(
          getDiscountZone(r.confidence, r.lift)
        ),
        action: getAction(getDiscountZone(r.confidence, r.lift)),
      }))
      .sort((a, b) => b.lift - a.lift);

    const strongBundles = rules.filter(
      (r) => r.zone === "green" || r.zone === "yellow"
    ).length;

    progress("complete", 100, "Done!");

    ctx.postMessage({
      type: "done",
      rules,
      stats: {
        totalRows,
        totalOrders,
        basketsUsed: transactions.length,
        uniqueSKUs,
        rulesFound: rules.length,
        strongBundles,
        computeTimeMs: Math.round(performance.now() - startTime),
        channels: Array.from(allChannels).sort(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.postMessage({ type: "error", message });
  }
};

export {};
