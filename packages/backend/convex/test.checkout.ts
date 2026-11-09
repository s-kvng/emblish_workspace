import type { Id } from "./_generated/dataModel";
import { settlePayment } from "./model/payments";
import { recordMovement } from "./model/stock";
import { setupBackend, type TestBackend } from "./test.setup";

export const kofiPhone = "+233241234567";

/** A Customer signed in on the Storefront, with or without the name asked at first Checkout. */
export async function withCustomer(t: TestBackend, name?: string, phone = kofiPhone) {
  const authUserId = `auth-${phone}`;
  const customerId = await t.run((ctx) =>
    ctx.db.insert("customers", { authUserId, phone, ...(name ? { name } : {}) }),
  );
  return { customerId, customer: t.withIdentity({ subject: authUserId }) };
}

/**
 * A Published In-stock Product, "Kente Weekend Tote", with Size S (GHS 450, 3 in Stock) and
 * Size M (GHS 520, 1 in Stock), plus a signed-in Customer (`null`: one not yet named).
 */
export async function withShop(customerName: string | null = "Kofi Boateng") {
  const t = setupBackend();
  const { small, medium } = await t.run(async (ctx) => {
    const productId = await ctx.db.insert("products", {
      name: "Kente Weekend Tote",
      slug: "kente-weekend-tote",
      description: "",
      status: "published",
      gallery: [],
      options: [{ name: "Size", values: ["S", "M"] }],
      sellInStock: true,
    });
    const small = await ctx.db.insert("variants", {
      productId,
      optionValues: ["S"],
      sku: "KWT-S",
      storePrice: 45000,
    });
    const medium = await ctx.db.insert("variants", {
      productId,
      optionValues: ["M"],
      sku: "KWT-M",
      storePrice: 52000,
    });
    await recordMovement(ctx, { variantId: small, kind: "arrival", quantity: 3 });
    await recordMovement(ctx, { variantId: medium, kind: "arrival", quantity: 1 });
    await ctx.db.insert("settings", {
      location: "Osu, Oxford Street. Mon-Sat 9am-6pm",
      whatsappNumber: "",
      callNumber: "",
    });
    return { small, medium };
  });
  const { customerId, customer } = await withCustomer(t, customerName ?? undefined);
  return { t, small, medium, customerId, customer };
}

/** A Variant's Stock counts, read straight from its cached counters. */
export async function stockOf(t: TestBackend, variantId: Id<"variants">) {
  const variant = await t.run((ctx) => ctx.db.get(variantId));
  const onHand = variant?.stockOnHand ?? 0;
  const held = variant?.stockHeld ?? 0;
  return { onHand, held, available: onHand - held };
}

/**
 * A Store Order paid through the real settlement path: a Checkout for these lines, a Seev
 * session, then `settlePayment` as if Seev had verified it. Returns the order and its code.
 */
export async function paidOrder(
  t: TestBackend,
  customerId: Id<"customers">,
  lines: { variantId: Id<"variants">; quantity: number }[],
) {
  return await t.run(async (ctx) => {
    const priced = [];
    for (const { variantId, quantity } of lines) {
      const variant = await ctx.db.get(variantId);
      const product = variant && (await ctx.db.get(variant.productId));
      if (!variant || !product || variant.storePrice === undefined)
        throw new Error("No such Variant");
      priced.push({
        variantId,
        productName: product.name,
        variantLabel: variant.optionValues.join(" / "),
        quantity,
        unitPrice: variant.storePrice,
      });
    }
    const total = priced.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    const checkoutId = await ctx.db.insert("checkouts", {
      customerId,
      lines: priced,
      fulfilment: { method: "pickup" },
      total,
      status: "pending",
      expiresAt: Date.now() + 30 * 60 * 1000,
    });
    const reference = `PAY-${checkoutId}`;
    await ctx.db.insert("paymentSessions", {
      checkoutId,
      reference,
      checkoutUrl: `https://pay.seevplus.com/${reference}`,
      expiresAt: Date.now() + 30 * 60 * 1000,
    });
    await settlePayment(ctx, { reference, amount: total });
    const order = await ctx.db
      .query("orders")
      .withIndex("by_customer", (q) => q.eq("customerId", customerId))
      .order("desc")
      .first();
    if (!order) throw new Error("No order was created");
    return { orderId: order._id, reference: order.reference, pickupCode: order.pickupCode };
  });
}
