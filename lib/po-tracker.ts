export interface POLineItem {
  item: string;
  quantity: number | null;
  unitPrice: number | null;
  vatCode: string;
}

export interface PORecord {
  orderNumber: string;
  supplier: string;
  currency: string;
  orderDate: string | null;
  receiptDate: string | null;
  discount: string;
  items: POLineItem[];
}

export interface PriceRecord {
  itemCode: string;
  supplierName: string;
  supplierCode: string;
  currency: string;
  purchasePrice: number | null;
  activeFrom: string | null;
  activeTo: string | null;
  purchaseLeadTime: number | null;
  minimumQuantity: number | null;
  unitDescription: string;
  dropShipment: string;
  mainSupplier: string;
}

export function parseNum(s: string | undefined): number | null {
  if (!s || s.trim() === "") return null;
  const n = parseFloat(s.trim().replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

export function parsePOData(raw: Record<string, unknown>[]): PORecord[] {
  const poMap = new Map<string, PORecord>();
  for (const row of raw) {
    const header = String(row["Header"] ?? "").trim();
    const orderNumber = String(row["Order number"] ?? "").trim();
    const supplier = String(row["Supplier nameDescription"] ?? "").trim();
    const currency = String(row["Currency"] ?? "").trim();
    const orderDate = String(row["Order date"] ?? "").trim() || null;
    const receiptDate = String(row["Receipt date"] ?? "").trim() || null;
    const discount = String(row["Discount"] ?? "").trim();

    if (header === "H") {
      if (!poMap.has(orderNumber)) {
        poMap.set(orderNumber, { orderNumber, supplier, currency, orderDate, receiptDate, discount, items: [] });
      }
    } else {
      const item = String(row["Item"] ?? "").trim();
      if (!item || !orderNumber) continue;
      const lineItem: POLineItem = {
        item,
        quantity: parseNum(String(row["Quantity"] ?? "")),
        unitPrice: parseNum(String(row["Unit price"] ?? "")),
        vatCode: String(row["VAT code"] ?? "").trim(),
      };
      const po = poMap.get(orderNumber);
      if (po) {
        po.items.push(lineItem);
      } else {
        poMap.set(orderNumber, { orderNumber, supplier, currency, orderDate, receiptDate, discount, items: [lineItem] });
      }
    }
  }
  return Array.from(poMap.values());
}

export function parsePriceData(raw: Record<string, unknown>[]): PriceRecord[] {
  const records: PriceRecord[] = [];
  for (const row of raw) {
    const header = String(row["Header"] ?? "").trim();
    if (header === "H") continue;
    const itemCode = String(row["Item code"] ?? "").trim();
    const purchasePriceRaw = String(row["Purchase price"] ?? "").trim();
    if (!itemCode || !purchasePriceRaw) continue;
    records.push({
      itemCode,
      supplierName: String(row["Supplier name"] ?? "").trim(),
      supplierCode: String(row["Supplier code"] ?? "").trim(),
      currency: String(row["Currency"] ?? "").trim(),
      purchasePrice: parseNum(purchasePriceRaw),
      activeFrom: String(row["Active from"] ?? "").trim() || null,
      activeTo: String(row["Active to"] ?? "").trim() || null,
      purchaseLeadTime: parseNum(String(row["Purchase lead time"] ?? "")),
      minimumQuantity: parseNum(String(row["Minimum quantity"] ?? "")),
      unitDescription: String(row["Unit description"] ?? "").trim(),
      dropShipment: String(row["Drop shipment"] ?? "").trim(),
      mainSupplier: String(row["Main supplier"] ?? "").trim(),
    });
  }
  return records;
}

export function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const parts = s.split("-");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  const dt = new Date(`${y}-${m}-${d}`);
  return isNaN(dt.getTime()) ? null : dt;
}

export function fmtDate(s: string | null): string {
  if (!s) return "—";
  const parts = s.split("-");
  if (parts.length !== 3) return s;
  return `${parts[0]}/${parts[1]}/${parts[2]}`;
}

export function fmtPrice(n: number | null): string {
  if (n === null) return "—";
  const abs = Math.abs(n).toFixed(2);
  const [intPart, dec] = abs.split(".");
  const fmt = intPart!.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}${fmt},${dec}`;
}

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

export function getStatus(receiptDate: string | null): "Received" | "Pending" {
  const d = parseDate(receiptDate);
  if (!d) return "Pending";
  return d <= TODAY ? "Received" : "Pending";
}

export function leadTimeDays(orderDate: string | null, receiptDate: string | null): number | null {
  const a = parseDate(orderDate);
  const b = parseDate(receiptDate);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export const CHART_COLORS = [
  "#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed",
  "#0891b2", "#be185d", "#65a30d", "#ea580c", "#0369a1",
];
