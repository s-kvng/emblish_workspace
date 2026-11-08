import type { Id } from "./_generated/dataModel";
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
