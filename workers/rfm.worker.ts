/**
 * RFM Analysis Web Worker
 * Runs completely in a background thread to avoid blocking the UI.
 *
 * Steps:
 *  1. Parse & preprocess CSV rows (filter header rows, parse dates/prices)
 *  2. Calculate R, F, M per customer
 *  3. Min-Max normalise (Recency is inverted: lower days = higher score)
 *  4. Elbow Method: run K-Means for K=2..8, compute WCSS, detect elbow
 *  5. Final K-Means with optimal K
 *  6. Label each cluster → segment name + colour
 */

import type {
  CustomerRFM,
  ClusterCentroid,
  ElbowPoint,
  RFMResult,
  SegmentLabel,
} from "@/lib/rfm-types";

// ── Worker context typing ──────────────────────────────────────────────────────
interface WorkerSelf {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}
const ctx = self as unknown as WorkerSelf;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse DD-MM-YYYY → Date */
function parseDate(raw: unknown): Date | null {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return isNaN(d.getTime()) ? null : d;
}

/** Parse EU/US number string → float (returns 0 on failure) */
function parsePrice(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  const s = String(raw).trim();
  if (s === "" || s === "-") return 0;
  // EU format "1.234,56" → remove dots, replace comma with dot
  const normalised = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(normalised);
  return isNaN(n) ? 0 : n;
}

function progress(step: string, pct: number, message: string) {
  ctx.postMessage({ type: "progress", step, progress: pct, message });
}

// ── K-Means ───────────────────────────────────────────────────────────────────

type Point = [number, number, number]; // [recencyNorm, frequencyNorm, monetaryNorm]

function euclidean(a: Point, b: Point): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

/** K-Means++ seeded initialisation */
function initCentroids(points: Point[], k: number): Point[] {
  const n = points.length;
  const centroids: Point[] = [points[Math.floor(Math.random() * n)]];
  while (centroids.length < k) {
    // Probability proportional to squared distance to nearest centroid
    const dists = points.map((p) =>
      Math.min(...centroids.map((c) => euclidean(p, c) ** 2))
    );
    const sum = dists.reduce((a, b) => a + b, 0);
    if (sum === 0) { centroids.push(points[Math.floor(Math.random() * n)]); continue; }
    let r = Math.random() * sum;
    let idx = 0;
    while (r > 0 && idx < n - 1) { r -= dists[idx++]; }
    centroids.push([...points[idx]] as Point);
  }
  return centroids;
}

/** Single K-Means run. Returns assignments, centroids, WCSS. */
function runKMeans(
  points: Point[],
  k: number,
  maxIter = 150
): { assignments: number[]; centroids: Point[]; wcss: number } {
  let centroids = initCentroids(points, k);
  let assignments: number[] = new Array(points.length).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // Assign each point to nearest centroid
    const newAssignments = points.map((p) => {
      let best = 0;
      let minD = Infinity;
      for (let i = 0; i < k; i++) {
        const d = euclidean(p, centroids[i]);
        if (d < minD) { minD = d; best = i; }
      }
      return best;
    });

    const changed = newAssignments.some((a, i) => a !== assignments[i]);
    assignments = newAssignments;
    if (!changed) break;

    // Recompute centroids
    const newCentroids: Point[] = Array.from({ length: k }, () => [0, 0, 0] as Point);
    const counts = new Array(k).fill(0);
    for (let i = 0; i < points.length; i++) {
      const c = assignments[i];
      newCentroids[c][0] += points[i][0];
      newCentroids[c][1] += points[i][1];
      newCentroids[c][2] += points[i][2];
      counts[c]++;
    }
    for (let i = 0; i < k; i++) {
      if (counts[i] > 0) {
        newCentroids[i][0] /= counts[i];
        newCentroids[i][1] /= counts[i];
        newCentroids[i][2] /= counts[i];
      } else {
        // Empty cluster — reinitialise with random point
        newCentroids[i] = [...points[Math.floor(Math.random() * points.length)]] as Point;
      }
    }
    centroids = newCentroids;
  }

  // WCSS (inertia)
  const wcss = points.reduce(
    (sum, p, i) => sum + euclidean(p, centroids[assignments[i]]) ** 2,
    0
  );

  return { assignments, centroids, wcss };
}

/** Run K-Means N times, keep best (lowest WCSS). Reduces sensitivity to init. */
function stableKMeans(points: Point[], k: number, runs = 5) {
  let best = runKMeans(points, k);
  for (let r = 1; r < runs; r++) {
    const attempt = runKMeans(points, k);
    if (attempt.wcss < best.wcss) best = attempt;
  }
  return best;
}

/** Detect elbow using the second-derivative (max acceleration of WCSS drop). */
function detectElbow(elbowData: ElbowPoint[]): number {
  if (elbowData.length <= 2) return elbowData[0].k;
  const wcss = elbowData.map((e) => e.wcss);
  const n = wcss.length;
  // First differences
  const d1 = Array.from({ length: n - 1 }, (_, i) => wcss[i] - wcss[i + 1]);
  // Second differences
  const d2 = Array.from({ length: n - 2 }, (_, i) => d1[i] - d1[i + 1]);
  let maxIdx = 0;
  for (let i = 1; i < d2.length; i++) {
    if (d2[i] > d2[maxIdx]) maxIdx = i;
  }
  return elbowData[maxIdx + 1].k;
}

// ── Segment Labelling ─────────────────────────────────────────────────────────

/** Label a cluster based on its normalised centroid and raw frequency mean. */
function labelCluster(
  centroid: Point,
  avgRawFrequency: number
): { label: SegmentLabel; color: string } {
  const [r, f, m] = centroid;

  if (avgRawFrequency <= 1.5) {
    return { label: "One-time Buyers", color: "#6B7280" };
  }
  if (f > 0.55 && m > 0.55) {
    return { label: "VIP Champions", color: "#D97706" };
  }
  if (r < 0.35) {
    return { label: "At Risk", color: "#DC2626" };
  }
  if (r > 0.65 && f < 0.45) {
    return { label: "New / Potential", color: "#16A34A" };
  }
  return { label: "Loyal Customers", color: "#2563EB" };
}

// ── Main handler ──────────────────────────────────────────────────────────────
ctx.onmessage = (e: MessageEvent) => {
  const { type, rows } = e.data as { type: string; rows: Record<string, unknown>[] };
  if (type !== "analyze") return;

  try {
    // ── STEP 1: Preprocess ──────────────────────────────────────────────────
    progress("Preprocessing", 10, "Filtering header rows & parsing dates…");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Group by customer: accumulate orders (from H rows) and monetary (from item rows)
    const customerMap = new Map<
      string,
      { name: string; orders: Set<string>; dates: Date[]; monetary: number }
    >();

    let parsedRows = 0;
    let skippedRows = 0;

    for (const row of rows) {
      const code = String(row["Ordered byCode"] ?? "").trim();
      const name = String(row["Ordered byDescription"] ?? row["Ordered byCode"] ?? "").trim();
      const headerFlag = String(row["Header"] ?? "").trim().toUpperCase();
      const orderNum  = String(row["Order number"] ?? "").trim();

      if (!code) { skippedRows++; continue; }

      if (!customerMap.has(code)) {
        customerMap.set(code, { name, orders: new Set(), dates: [], monetary: 0 });
      }
      const cust = customerMap.get(code)!;

      if (headerFlag === "H") {
        // Header row → register order and date
        if (orderNum) cust.orders.add(orderNum);
        const d = parseDate(row["Order date"]);
        if (d) cust.dates.push(d);
        parsedRows++;
      } else {
        // Item row → accumulate monetary
        cust.monetary += parsePrice(row["Net price"]);
      }
    }

    if (customerMap.size === 0) {
      throw new Error(
        "No valid customers found. Check that the file has 'Header', 'Ordered byCode', and 'Order date' columns."
      );
    }

    progress("Preprocessing", 25, `Found ${customerMap.size} customers from ${parsedRows} orders.`);

    // ── STEP 2: Calculate R, F, M ──────────────────────────────────────────
    progress("RFM Calculation", 35, "Computing Recency, Frequency, Monetary…");

    type RawCustomer = {
      code: string;
      name: string;
      recency: number;
      frequency: number;
      monetary: number;
    };

    const rawCustomers: RawCustomer[] = [];
    let minDate = new Date(9999, 0, 1);
    let maxDate = new Date(0);

    for (const [code, data] of customerMap) {
      if (data.dates.length === 0) continue; // skip if no valid dates
      const lastOrder = new Date(Math.max(...data.dates.map((d) => d.getTime())));
      const recency   = Math.max(0, Math.round((today.getTime() - lastOrder.getTime()) / 86_400_000));
      const frequency = data.orders.size || data.dates.length; // fallback to date count

      if (lastOrder < minDate) minDate = lastOrder;
      if (lastOrder > maxDate) maxDate = lastOrder;

      rawCustomers.push({
        code,
        name: data.name,
        recency,
        frequency,
        monetary: data.monetary,
      });
    }

    if (rawCustomers.length < 2) {
      throw new Error("At least 2 customers with valid order dates are required.");
    }

    progress("RFM Calculation", 45, `Calculated RFM for ${rawCustomers.length} customers.`);

    // ── STEP 3: Normalise (Min-Max, Recency inverted) ──────────────────────
    progress("Normalising", 50, "Min-Max normalisation…");

    const rValues = rawCustomers.map((c) => c.recency);
    const fValues = rawCustomers.map((c) => c.frequency);
    const mValues = rawCustomers.map((c) => c.monetary);

    const rMin = Math.min(...rValues), rMax = Math.max(...rValues);
    const fMin = Math.min(...fValues), fMax = Math.max(...fValues);
    const mMin = Math.min(...mValues), mMax = Math.max(...mValues);

    const norm = (v: number, min: number, max: number) =>
      max === min ? 0.5 : (v - min) / (max - min);

    const points: Point[] = rawCustomers.map((c) => [
      1 - norm(c.recency,   rMin, rMax), // invert: recent → high score
      norm(c.frequency, fMin, fMax),
      norm(c.monetary,  mMin, mMax),
    ]);

    // ── STEP 4: Elbow Method (K = 2..8) ───────────────────────────────────
    const maxK = Math.min(8, rawCustomers.length - 1);
    const minK = Math.min(2, maxK);
    const elbowData: ElbowPoint[] = [];

    progress("Elbow Method", 55, `Running K-Means for K=${minK}..${maxK}…`);

    for (let k = minK; k <= maxK; k++) {
      const { wcss } = stableKMeans(points, k, 3);
      elbowData.push({ k, wcss });
      const pct = 55 + Math.round(((k - minK) / (maxK - minK + 1)) * 25);
      progress("Elbow Method", pct, `K=${k}: WCSS=${wcss.toFixed(4)}`);
    }

    const optimalK = detectElbow(elbowData);
    progress("Elbow Method", 82, `Optimal K=${optimalK} selected by elbow method.`);

    // ── STEP 5: Final K-Means with optimal K ──────────────────────────────
    progress("Clustering", 84, `Running final K-Means with K=${optimalK}…`);

    const { assignments, centroids: rawCentroids } = stableKMeans(points, optimalK, 8);

    // ── STEP 6: Build centroids with raw averages ──────────────────────────
    const centroidRaw: { sumR: number; sumF: number; sumM: number; count: number }[] =
      Array.from({ length: optimalK }, () => ({ sumR: 0, sumF: 0, sumM: 0, count: 0 }));

    for (let i = 0; i < rawCustomers.length; i++) {
      const cid = assignments[i];
      centroidRaw[cid].sumR += rawCustomers[i].recency;
      centroidRaw[cid].sumF += rawCustomers[i].frequency;
      centroidRaw[cid].sumM += rawCustomers[i].monetary;
      centroidRaw[cid].count++;
    }

    const centroids: ClusterCentroid[] = rawCentroids.map((c, i) => ({
      id: i,
      recencyNorm:   c[0],
      frequencyNorm: c[1],
      monetaryNorm:  c[2],
      avgRecency:   centroidRaw[i].count ? centroidRaw[i].sumR / centroidRaw[i].count : 0,
      avgFrequency: centroidRaw[i].count ? centroidRaw[i].sumF / centroidRaw[i].count : 0,
      avgMonetary:  centroidRaw[i].count ? centroidRaw[i].sumM / centroidRaw[i].count : 0,
      count: centroidRaw[i].count,
    }));

    // ── STEP 7: Label clusters & build final customers ─────────────────────
    progress("Labelling", 92, "Labelling segments…");

    const clusterLabels: { label: SegmentLabel; color: string }[] = centroids.map((c) =>
      labelCluster(rawCentroids[c.id], c.avgFrequency)
    );

    const customers: CustomerRFM[] = rawCustomers.map((c, i) => {
      const cid   = assignments[i];
      const p     = points[i];
      const score = (p[0] + p[1] + p[2]) / 3;
      return {
        code:          c.code,
        name:          c.name,
        recency:       c.recency,
        frequency:     c.frequency,
        monetary:      c.monetary,
        recencyNorm:   p[0],
        frequencyNorm: p[1],
        monetaryNorm:  p[2],
        rfmScore:      score,
        clusterId:     cid,
        segmentLabel:  clusterLabels[cid].label,
        segmentColor:  clusterLabels[cid].color,
      };
    });

    progress("Complete", 100, "Analysis complete.");

    const fmt = (d: Date) => d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

    const result: RFMResult = {
      customers,
      centroids,
      elbowData,
      optimalK,
      totalCustomers: customers.length,
      dateRange: {
        from: fmt(minDate),
        to:   fmt(maxDate),
      },
    };

    ctx.postMessage({ type: "result", data: result });

  } catch (err: unknown) {
    ctx.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
