import { ConvexError } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getWindow, preorderHolders } from "./orderWindows";
import { getProduct, inOptionOrder, listVariants } from "./products";
import { keptUnits } from "./refunds";
import { ordersUrl, queueSms } from "./sms";
import { recordMovement } from "./stock";
import { listWindowVariants } from "./windowLookups";

function refuse(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

/** How many units of one Variant arrived, as Staff counted them. */
export type ArrivalCount = { variantId: Id<"variants">; arrived: number };

/** A Pre-order line as allocation sees it: the units still on it, at its frozen price. */
type AllocationLine = {
  orderLineId: Id<"orderLines">;
  variantId: Id<"variants">;
  ordered: number;
  unitPrice: number;
};

type AllocationPreorder = {
  orderId: Id<"orders">;
  reference: string;
  placedAt: number;
  lines: AllocationLine[];
};

/**
 * Splits each Variant's arrived units: Pre-orders first, earliest placed first (ties by
 * reference, so it's deterministic), then Store Quantity, and the rest is Surplus. A Pre-order
 * line gets what's left when its turn comes; what it misses is its Shortfall, refunded at its
 * price.
 */
export function allocateArrival(
  variants: {
    variantId: Id<"variants">;
    arrived: number;
    storeQuantity: number;
  }[],
  preorders: AllocationPreorder[],
) {
  const left = new Map(variants.map((v) => [v.variantId, v.arrived]));
  const ordered = [...preorders].sort(
    (a, b) => a.placedAt - b.placedAt || a.reference.localeCompare(b.reference),
  );
  const filled = ordered.map((preorder) => {
    const lines = preorder.lines.map((line) => {
      const available = left.get(line.variantId) ?? 0;
      const got = Math.min(available, line.ordered);
      left.set(line.variantId, available - got);
      return { ...line, got };
    });
    return {
      orderId: preorder.orderId,
      reference: preorder.reference,
      lines,
      got: lines.reduce((sum, line) => sum + line.got, 0),
      ordered: lines.reduce((sum, line) => sum + line.ordered, 0),
      refund: lines.reduce((sum, line) => sum + (line.ordered - line.got) * line.unitPrice, 0),
    };
  });
  return {
    variants: variants.map(({ variantId, arrived, storeQuantity }) => {
      const lines = filled.flatMap((p) => p.lines).filter((l) => l.variantId === variantId);
      const toPreorders = lines.reduce((sum, line) => sum + line.got, 0);
      const wanted = lines.reduce((sum, line) => sum + line.ordered, 0);
      const rest = arrived - toPreorders;
      const toStore = Math.min(rest, storeQuantity);
      return {
        variantId,
        arrived,
        toPreorders,
        toStore,
        surplus: rest - toStore,
        shortfall: wanted - toPreorders,
      };
    }),
    preorders: filled,
  };
}

/** The window's Pre-orders still awaiting arrival, with the units still on each line. */
async function awaitingPreorders(ctx: Pick<QueryCtx, "db">, windowId: Id<"orderWindows">) {
  const orders = await ctx.db
    .query("orders")
    .withIndex("by_orderWindow", (q) => q.eq("orderWindowId", windowId))
    .collect();
  const preorders = [];
  for (const order of orders) {
    if (order.kind !== "preorder" || order.status !== "awaitingArrival") continue;
    const lines = await ctx.db
      .query("orderLines")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();
    preorders.push({
      order,
      lines,
      allocation: {
        orderId: order._id,
        reference: order.reference,
        placedAt: order.placedAt,
        lines: lines
          .filter((line) => keptUnits(line) > 0)
          .map((line) => ({
            orderLineId: line._id,
            variantId: line.variantId,
            ordered: keptUnits(line),
            unitPrice: line.unitPrice,
          })),
      },
    });
  }
  return preorders;
}

/** Stages a window can be recorded as arrived from: once ordered from the supplier. */
const arrivableStages: readonly Doc<"orderWindows">["stage"][] = [
  "orderedFromSupplier",
  "inTransit",
];

/** Checks Staff's counts: one whole number, 0 or more, for every Variant the window offers. */
function assertCounts(rows: Doc<"windowVariants">[], counts: ArrivalCount[]) {
  if (new Set(counts.map((c) => c.variantId)).size !== counts.length) {
    refuse("INVALID_VARIANTS", "A Variant is counted twice.");
  }
  for (const { variantId, arrived } of counts) {
    if (!rows.some((row) => row.variantId === variantId)) {
      refuse("INVALID_VARIANTS", "That Variant isn't offered in this window.");
    }
    if (!Number.isSafeInteger(arrived) || arrived < 0) {
      refuse("INVALID_COUNT", "Count the arrived units as a whole number, 0 or more.");
    }
  }
  if (rows.some((row) => !counts.some((c) => c.variantId === row.variantId))) {
    refuse("COUNT_MISSING", "Count every Variant before locking the arrival.");
  }
}

/**
 * Lock arrival & text Customers: records the arrived units per Variant, once, and allocates
 * them. Each Pre-order keeps the units it got; what it missed is flagged as a Shortfall Refund
 * on its Item Payment, and one that got nothing ends `cancelled / nothingArrived`. Store
 * Quantity plus Surplus enter Stock as one `arrival` movement per Variant. The window is marked
 * Arrived and every affected Customer is texted.
 */
export async function lockArrival(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  actor: Doc<"staff">,
  windowId: Id<"orderWindows">,
  counts: ArrivalCount[],
) {
  const window = await getWindow(ctx, windowId);
  if (window.stage === "arrived") {
    refuse("ALREADY_ARRIVED", `W${window.number}'s arrival is already locked.`);
  }
  if (!arrivableStages.includes(window.stage)) {
    refuse("NOT_ORDERED", `Mark W${window.number} as ordered from the supplier first.`);
  }
  const rows = await listWindowVariants(ctx, windowId);
  assertCounts(rows, counts);
  const product = await getProduct(ctx, window.productId);
  // Read before any Pre-order is cancelled, so Customers whose units all missed are texted too.
  const holders = await preorderHolders(ctx, windowId);
  const preorders = await awaitingPreorders(ctx, windowId);
  const result = allocateArrival(
    rows.map((row) => ({
      variantId: row.variantId,
      arrived: counts.find((c) => c.variantId === row.variantId)?.arrived ?? 0,
      storeQuantity: row.storeQuantity ?? 0,
    })),
    preorders.map((p) => p.allocation),
  );

  for (const variant of result.variants) {
    const row = rows.find((r) => r.variantId === variant.variantId);
    if (row) await ctx.db.patch(row._id, { arrivedUnits: variant.arrived });
    const intoStock = variant.toStore + variant.surplus;
    if (intoStock > 0) {
      await recordMovement(ctx, {
        variantId: variant.variantId,
        kind: "arrival",
        quantity: intoStock,
        staffId: actor._id,
        orderWindowId: windowId,
      });
    }
  }

  const staff = { kind: "staff" as const, staffId: actor._id };
  for (const filled of result.preorders) {
    const preorder = preorders.find((p) => p.order._id === filled.orderId);
    if (!preorder) continue;
    const { order } = preorder;
    for (const line of preorder.lines) {
      const got = filled.lines.find((l) => l.orderLineId === line._id);
      const missed = got ? got.ordered - got.got : 0;
      await ctx.db.patch(line._id, {
        arrivedUnits: got?.got ?? 0,
        ...(missed > 0 ? { refundedQuantity: (line.refundedQuantity ?? 0) + missed } : {}),
      });
    }
    await ctx.db.insert("orderEvents", {
      orderId: order._id,
      kind: "arrived",
      actor: staff,
      units: filled.got,
    });
    if (filled.refund > 0) {
      const short = filled.lines
        .filter((line) => line.got < line.ordered)
        .map((line) => ({
          orderLineId: line.orderLineId,
          quantity: line.ordered - line.got,
        }));
      await ctx.db.insert("refunds", {
        paymentId: order.paymentId,
        orderId: order._id,
        kind: "shortfall",
        amount: filled.refund,
        status: "toRefund",
        returnToStock: false,
        lines: short,
        flaggedBy: actor._id,
      });
      await ctx.db.insert("orderEvents", {
        orderId: order._id,
        kind: "refundFlagged",
        actor: staff,
        units: filled.ordered - filled.got,
        amount: filled.refund,
      });
    }
    if (filled.got === 0) {
      await ctx.db.patch(order._id, {
        status: "cancelled",
        cancelReason: "nothingArrived",
      });
      await ctx.db.insert("orderEvents", {
        orderId: order._id,
        kind: "cancelled",
        actor: staff,
        // Its refund is on the `refundFlagged` event above, so History shows it once.
        units: filled.ordered,
      });
    }
  }

  await ctx.db.patch(windowId, { stage: "arrived" });
  await ctx.db.insert("windowStageEvents", {
    orderWindowId: windowId,
    stage: "arrived",
    staffId: actor._id,
    ...(holders.length > 0 ? { texted: holders.length } : {}),
  });
  for (const holder of holders) {
    const theirs = result.preorders.filter((p) => holder.references.includes(p.reference));
    const got = theirs.reduce((sum, p) => sum + p.got, 0);
    const ordered = theirs.reduce((sum, p) => sum + p.ordered, 0);
    const refund = theirs.reduce((sum, p) => sum + p.refund, 0);
    const args = {
      references: holder.references,
      productName: product.name,
      got,
      ordered,
      refund,
      ordersUrl: ordersUrl(),
    };
    if (got === 0) await queueSms(ctx, holder.phone, "arrivedNone", args);
    else await queueSms(ctx, holder.phone, "arrived", args);
  }
  return { texted: holders.length };
}

/**
 * Who gets what: each Variant's arrived units split into Pre-orders, Store Quantity, Surplus
 * and Shortfall, then each Pre-order in placement order with what it got and its refund. Before
 * the lock it previews `counts`, which must cover every Variant; once locked it shows what was
 * recorded. Null while a window hasn't been ordered from the supplier, or before every Variant
 * is counted.
 */
export async function describeAllocation(
  ctx: Pick<QueryCtx, "db">,
  windowId: Id<"orderWindows">,
  counts: ArrivalCount[] | undefined,
) {
  const window = await getWindow(ctx, windowId);
  const locked = window.stage === "arrived";
  if (!locked && !arrivableStages.includes(window.stage)) return null;
  const product = await getProduct(ctx, window.productId);
  const variants = inOptionOrder(product.options, await listVariants(ctx, product._id));
  const rows = await listWindowVariants(ctx, windowId);
  const labelOf = (variantId: Id<"variants">) =>
    variants.find((v) => v._id === variantId)?.optionValues.join(" / ") ?? "";
  const ordered = variants.flatMap((v) => rows.filter((r) => r.variantId === v._id));

  let result: ReturnType<typeof allocateArrival>;
  if (locked) {
    result = await recordedAllocation(ctx, windowId, ordered);
  } else {
    if (!counts || ordered.some((row) => !counts.some((c) => c.variantId === row.variantId))) {
      return null;
    }
    assertCounts(rows, counts);
    const preorders = await awaitingPreorders(ctx, windowId);
    result = allocateArrival(
      ordered.map((row) => ({
        variantId: row.variantId,
        arrived: counts.find((c) => c.variantId === row.variantId)?.arrived ?? 0,
        storeQuantity: row.storeQuantity ?? 0,
      })),
      preorders.map((p) => p.allocation),
    );
  }

  const preorders = [];
  for (const filled of result.preorders) {
    const order = await ctx.db.get(filled.orderId);
    const customer = order && (await ctx.db.get(order.customerId));
    preorders.push({
      orderId: filled.orderId,
      reference: filled.reference,
      customerName: customer?.name ?? customer?.phone ?? "",
      got: filled.got,
      ordered: filled.ordered,
      refund: filled.refund,
      lines: filled.lines.map((line) => ({
        variantId: line.variantId,
        label: labelOf(line.variantId),
        got: line.got,
        ordered: line.ordered,
      })),
    });
  }
  return {
    locked,
    variants: result.variants.map((variant) => ({
      ...variant,
      label: labelOf(variant.variantId),
    })),
    preorders,
    customers: new Set(
      (await Promise.all(result.preorders.map((p) => ctx.db.get(p.orderId)))).flatMap((order) =>
        order ? [order.customerId] : [],
      ),
    ).size,
  };
}

/**
 * The allocation as it was locked, rebuilt from what the lock stored: each Variant's arrived
 * units and each Pre-order line's arrived units.
 */
async function recordedAllocation(
  ctx: Pick<QueryCtx, "db">,
  windowId: Id<"orderWindows">,
  rows: Doc<"windowVariants">[],
): Promise<ReturnType<typeof allocateArrival>> {
  const orders = (
    await ctx.db
      .query("orders")
      .withIndex("by_orderWindow", (q) => q.eq("orderWindowId", windowId))
      .collect()
  ).sort((a, b) => a.placedAt - b.placedAt || a.reference.localeCompare(b.reference));
  const preorders: ReturnType<typeof allocateArrival>["preorders"] = [];
  for (const order of orders) {
    const lines = (
      await ctx.db
        .query("orderLines")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect()
    ).filter((line) => line.arrivedUnits !== undefined);
    if (lines.length === 0) continue;
    // What it was owed at the lock: what it got plus the Shortfall refunded on that line.
    const shortfalls = await shortfallUnits(ctx, order);
    const allocated = lines.map((line) => {
      const got = line.arrivedUnits ?? 0;
      const missed = shortfalls.get(line._id) ?? 0;
      return {
        orderLineId: line._id,
        variantId: line.variantId,
        ordered: got + missed,
        unitPrice: line.unitPrice,
        got,
      };
    });
    preorders.push({
      orderId: order._id,
      reference: order.reference,
      lines: allocated,
      got: allocated.reduce((sum, l) => sum + l.got, 0),
      ordered: allocated.reduce((sum, l) => sum + l.ordered, 0),
      refund: allocated.reduce((sum, l) => sum + (l.ordered - l.got) * l.unitPrice, 0),
    });
  }
  return {
    variants: rows.map((row) => {
      const lines = preorders.flatMap((p) => p.lines).filter((l) => l.variantId === row.variantId);
      const arrived = row.arrivedUnits ?? 0;
      const toPreorders = lines.reduce((sum, l) => sum + l.got, 0);
      const toStore = Math.min(arrived - toPreorders, row.storeQuantity ?? 0);
      return {
        variantId: row.variantId,
        arrived,
        toPreorders,
        toStore,
        surplus: arrived - toPreorders - toStore,
        shortfall: lines.reduce((sum, l) => sum + l.ordered - l.got, 0),
      };
    }),
    preorders,
  };
}

/** Units per order line that the order's Shortfall Refunds cover. */
async function shortfallUnits(ctx: Pick<QueryCtx, "db">, order: Doc<"orders">) {
  const refunds = await ctx.db
    .query("refunds")
    .withIndex("by_payment", (q) => q.eq("paymentId", order.paymentId))
    .collect();
  const units = new Map<Id<"orderLines">, number>();
  for (const refund of refunds) {
    if (refund.kind !== "shortfall" || refund.orderId !== order._id) continue;
    for (const line of refund.lines ?? []) {
      units.set(line.orderLineId, (units.get(line.orderLineId) ?? 0) + line.quantity);
    }
  }
  return units;
}

/**
 * Units of an arrived window's Variant that turn up after the arrival was locked: Surplus,
 * straight into Stock as a `lateArrival` movement.
 */
export async function recordLateArrival(
  ctx: Pick<MutationCtx, "db">,
  actor: Doc<"staff">,
  {
    windowId,
    variantId,
    quantity,
    note,
  }: {
    windowId: Id<"orderWindows">;
    variantId: Id<"variants">;
    quantity: number;
    note?: string;
  },
) {
  const window = await getWindow(ctx, windowId);
  if (window.stage !== "arrived") {
    refuse("NOT_ARRIVED", `Record W${window.number}'s arrival first.`);
  }
  const rows = await listWindowVariants(ctx, windowId);
  if (!rows.some((row) => row.variantId === variantId)) {
    refuse("INVALID_VARIANTS", "That Variant isn't offered in this window.");
  }
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    refuse("INVALID_QUANTITY", "Enter how many turned up, a whole number more than 0.");
  }
  return await recordMovement(ctx, {
    variantId,
    kind: "lateArrival",
    quantity,
    note,
    staffId: actor._id,
    orderWindowId: windowId,
  });
}
