import type { Id } from "./_generated/dataModel";
import { deliveryFeeToday, type Fulfilment } from "./model/fulfilment";
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
 * Pickup unless a frozen `fulfilment` is given; its Delivery Fee is paid with the lines.
 */
export async function paidOrder(
  t: TestBackend,
  customerId: Id<"customers">,
  lines: { variantId: Id<"variants">; quantity: number }[],
  fulfilment: Fulfilment = { method: "pickup" },
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
    const total =
      priced.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) +
      deliveryFeeToday(fulfilment);
    const checkoutId = await ctx.db.insert("checkouts", {
      customerId,
      lines: priced,
      fulfilment,
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

/**
 * Delivery Zones on a test backend: Accra Central (GHS 30), a disabled Tema (GHS 45),
 * and Elsewhere in Ghana with no fee.
 */
export async function withZones(t: TestBackend) {
  return await t.run(async (ctx) => ({
    accra: await ctx.db.insert("deliveryZones", {
      name: "Accra Central",
      areas: "Osu, Labone, Cantonments",
      fee: 3000,
      isElsewhere: false,
      active: true,
    }),
    tema: await ctx.db.insert("deliveryZones", {
      name: "Tema",
      areas: "Community 1-25",
      fee: 4500,
      isElsewhere: false,
      active: false,
    }),
    elsewhere: await ctx.db.insert("deliveryZones", {
      name: "Elsewhere in Ghana",
      areas: "Anywhere else",
      isElsewhere: true,
      active: true,
    }),
  }));
}

/** A Delivery to Kofi in Accra Central (GHS 30), frozen as Checkout would. */
export function accraDelivery(
  zoneId: Id<"deliveryZones">,
): Extract<Fulfilment, { method: "delivery" }> {
  return {
    method: "delivery",
    zoneId,
    zoneName: "Accra Central",
    deliveryFee: 3000,
    recipientName: "Kofi Boateng",
    recipientPhone: kofiPhone,
    area: "East Legon",
    landmark: "Opposite the Shell",
  };
}

/**
 * The shop of `withShop`, plus two open Order Windows:
 * - "Linen Kaftan" (Pre-order only) W1: Size S GHS 380 capped at 3, Size M GHS 400 uncapped,
 *   a Minimum Order Quantity of 2 across them and a GHS 45 Shipping Fee estimate.
 * - "Shea Body Butter" (Pre-order only) W1: one default Variant at GHS 90, no minimum, uncapped.
 */
export async function withPreorders(customerName: string | null = "Kofi Boateng") {
  const shop = await withShop(customerName);
  const windows = await shop.t.run(async (ctx) => {
    const staffId = await ctx.db.insert("staff", {
      authUserId: "auth-window-opener",
      email: "opener@emblish.test",
      name: "Ama Mensah",
      role: "owner",
      status: "active",
    });
    async function preorderProduct(name: string, slug: string, optionValues: string[][]) {
      const productId = await ctx.db.insert("products", {
        name,
        slug,
        description: "",
        status: "published",
        gallery: [],
        options: optionValues[0]!.length > 0 ? [{ name: "Size", values: optionValues.flat() }] : [],
        sellInStock: false,
      });
      const variants = [];
      for (const values of optionValues) {
        variants.push(await ctx.db.insert("variants", { productId, optionValues: values }));
      }
      return { productId, variants };
    }
    async function openWindow(
      productId: Id<"products">,
      rows: {
        variantId: Id<"variants">;
        preorderPrice: number;
        cap?: number;
      }[],
      terms: { minimumOrderQuantity?: number; shippingFeeEstimate?: number },
    ) {
      const windowId = await ctx.db.insert("orderWindows", {
        productId,
        number: 1,
        stage: "open",
        opensAt: Date.now(),
        closesAt: Date.now() + 10 * 24 * 60 * 60 * 1000,
        createdBy: staffId,
        ...terms,
      });
      for (const row of rows) {
        await ctx.db.insert("windowVariants", {
          orderWindowId: windowId,
          ...row,
          preordered: 0,
          held: 0,
        });
      }
      return windowId;
    }
    const kaftan = await preorderProduct("Linen Kaftan", "linen-kaftan", [["S"], ["M"]]);
    const [kaftanS, kaftanM] = kaftan.variants as [Id<"variants">, Id<"variants">];
    const kaftanWindow = await openWindow(
      kaftan.productId,
      [
        { variantId: kaftanS, preorderPrice: 38000, cap: 3 },
        { variantId: kaftanM, preorderPrice: 40000 },
      ],
      { minimumOrderQuantity: 2, shippingFeeEstimate: 4500 },
    );
    const shea = await preorderProduct("Shea Body Butter", "shea-body-butter", [[]]);
    const [sheaJar] = shea.variants as [Id<"variants">];
    const sheaWindow = await openWindow(
      shea.productId,
      [{ variantId: sheaJar, preorderPrice: 9000 }],
      {},
    );
    return { kaftanS, kaftanM, kaftanWindow, sheaJar, sheaWindow };
  });
  return { ...shop, ...windows };
}

/** A window's offered-Variant row, with its cached `preordered` and `held` counts. */
export async function windowRow(
  t: TestBackend,
  orderWindowId: Id<"orderWindows">,
  variantId: Id<"variants">,
) {
  return await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("windowVariants")
      .withIndex("by_window", (q) => q.eq("orderWindowId", orderWindowId))
      .collect();
    const row = rows.find((r) => r.variantId === variantId);
    if (!row) throw new Error("The window doesn't offer that Variant");
    return { preordered: row.preordered, held: row.held };
  });
}
