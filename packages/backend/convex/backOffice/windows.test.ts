import { afterEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { refusal, withFirstOwner, withStaffMember } from "../test.staff";

const DAY = 24 * 60 * 60 * 1000;

afterEach(() => {
  vi.useRealTimers();
});

/**
 * The Owner, a Staff member and a Pre-order-only Product with Size S and M Variants, saved
 * as a Draft (Pre-order-only Products are published by opening their first window).
 */
async function preorderProduct() {
  const { t, owner } = await withFirstOwner();
  const kofi = await withStaffMember(t);
  const bags = await owner.mutation(api.backOffice.categories.create, {
    name: "Bags",
  });
  const cover = await t.run((ctx) =>
    ctx.storage.store(new Blob(["photo"], { type: "image/jpeg" })),
  );
  const { productId } = await owner.mutation(api.backOffice.products.save, {
    name: "Linen Kaftan",
    description: "Loose, breathable.",
    categoryId: bags,
    gallery: [cover],
    options: [{ name: "Size", values: ["S", "M"] }],
    variants: [
      { optionValues: ["S"], sku: "LK-S" },
      { optionValues: ["M"], sku: "LK-M" },
    ],
    sellInStock: false,
    publish: false,
  });
  const { variants } = await owner.query(api.backOffice.products.get, {
    productId,
  });
  const [small, medium] = variants.map((variant) => variant._id) as [
    Id<"variants">,
    Id<"variants">,
  ];
  return { t, owner, kofi, productId, small, medium };
}

describe("Staff open an Order Window", () => {
  test("Staff save a draft without prices; the Owner prices it, opens it, and the Product is published", async () => {
    const { owner, kofi, productId, small, medium } = await preorderProduct();
    const closesAt = Date.now() + 14 * DAY;

    const { windowId, stage } = await kofi.mutation(api.backOffice.windows.save, {
      productId,
      variants: [{ variantId: small, cap: 10 }, { variantId: medium }],
      closesAt,
      minimumOrderQuantity: 2,
      shippingFeeEstimate: 4500,
      open: false,
    });
    expect(stage).toBe("draft");

    // Prices are the Owner's, so Staff can neither set them nor open without them.
    expect(
      await refusal(
        kofi.mutation(api.backOffice.windows.save, {
          windowId,
          productId,
          variants: [{ variantId: small, cap: 10, preorderPrice: 38000 }, { variantId: medium }],
          closesAt,
          open: false,
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await refusal(
        kofi.mutation(api.backOffice.windows.save, {
          windowId,
          productId,
          variants: [{ variantId: small, cap: 10 }, { variantId: medium }],
          closesAt,
          open: true,
        }),
      ),
    ).toBe("PRICES_MISSING");

    expect(await owner.query(api.backOffice.windows.needsPrices, {})).toEqual([
      expect.objectContaining({
        windowId,
        productName: "Linen Kaftan",
        number: 1,
      }),
    ]);

    const opened = await owner.mutation(api.backOffice.windows.save, {
      windowId,
      productId,
      variants: [
        { variantId: small, cap: 10, preorderPrice: 38000 },
        { variantId: medium, preorderPrice: 40000 },
      ],
      closesAt,
      minimumOrderQuantity: 2,
      shippingFeeEstimate: 4500,
      open: true,
    });
    expect(opened).toEqual({ windowId, stage: "open" });
    expect(await owner.query(api.backOffice.windows.needsPrices, {})).toEqual([]);

    const window = await kofi.query(api.backOffice.windows.get, { windowId });
    expect(window).toMatchObject({
      number: 1,
      stage: "open",
      closesAt,
      minimumOrderQuantity: 2,
      shippingFeeEstimate: 4500,
      variants: [
        {
          variantId: small,
          label: "S",
          preorderPrice: 38000,
          cap: 10,
          preordered: 0,
        },
        { variantId: medium, label: "M", preorderPrice: 40000, preordered: 0 },
      ],
    });
    expect(window.events.map((event) => event.stage)).toEqual(["open"]);
    const product = await owner.query(api.backOffice.products.get, {
      productId,
    });
    expect(product.status).toBe("published");
  });
});

/** The Owner opens a priced window on the Product, closing in `days`. */
async function openWindow(
  shop: Awaited<ReturnType<typeof preorderProduct>>,
  { days = 7, cap }: { days?: number; cap?: number } = {},
) {
  const { windowId } = await shop.owner.mutation(api.backOffice.windows.save, {
    productId: shop.productId,
    variants: [
      { variantId: shop.small, preorderPrice: 38000, cap },
      { variantId: shop.medium, preorderPrice: 40000 },
    ],
    closesAt: Date.now() + days * DAY,
    open: true,
  });
  return windowId;
}

describe("An open window closes on its own at its close date", () => {
  test("the scheduled job closes it at closesAt, texting no one", async () => {
    vi.useFakeTimers();
    const shop = await preorderProduct();
    const windowId = await openWindow(shop, { days: 3 });

    vi.advanceTimersByTime(3 * DAY - 60 * 1000);
    await shop.t.finishInProgressScheduledFunctions();
    expect((await shop.kofi.query(api.backOffice.windows.get, { windowId })).stage).toBe("open");

    await shop.t.finishAllScheduledFunctions(vi.runAllTimers);
    const window = await shop.kofi.query(api.backOffice.windows.get, {
      windowId,
    });
    expect(window.stage).toBe("closed");
    expect(window.events).toEqual([
      expect.objectContaining({ stage: "open", staffName: "Ama Mensah" }),
      { stage: "closed", at: expect.any(Number) },
    ]);
    const texts = await shop.t.run((ctx) => ctx.db.query("smsMessages").collect());
    expect(texts).toEqual([]);
  });

  test("Extend moves the close date and replaces the job; the old run does nothing", async () => {
    vi.useFakeTimers();
    const shop = await preorderProduct();
    const windowId = await openWindow(shop, { days: 3 });
    const { closesAt } = await shop.kofi.query(api.backOffice.windows.get, {
      windowId,
    });

    await shop.kofi.mutation(api.backOffice.windows.extend, {
      windowId,
      days: 7,
    });
    expect((await shop.kofi.query(api.backOffice.windows.get, { windowId })).closesAt).toBe(
      closesAt + 7 * DAY,
    );

    // A run of the replaced job, as if its cancel came too late, leaves the window open.
    vi.advanceTimersByTime(3 * DAY);
    await shop.t.mutation(internal.system.windows.close, { windowId });
    expect((await shop.kofi.query(api.backOffice.windows.get, { windowId })).stage).toBe("open");
    const pending = await shop.t.run((ctx) =>
      ctx.db.system
        .query("_scheduled_functions")
        .collect()
        .then((jobs) => jobs.filter((job) => job.state.kind === "pending")),
    );
    expect(pending).toHaveLength(1);

    vi.advanceTimersByTime(7 * DAY);
    await shop.t.finishInProgressScheduledFunctions();
    await shop.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await shop.kofi.query(api.backOffice.windows.get, { windowId })).stage).toBe("closed");
  });

  test("Close now ends it early and cancels the job; a stale run after it does nothing", async () => {
    vi.useFakeTimers();
    const shop = await preorderProduct();
    const windowId = await openWindow(shop, { days: 5 });
    const due = Date.now() + 5 * DAY;

    await shop.kofi.mutation(api.backOffice.windows.closeNow, { windowId });
    const closed = await shop.kofi.query(api.backOffice.windows.get, {
      windowId,
    });
    expect(closed.stage).toBe("closed");
    // It shows the day it really closed, not the date it was due to.
    expect(closed.closesAt).toBeLessThan(due - DAY);
    expect(closed.events[closed.events.length - 1]).toMatchObject({
      stage: "closed",
      staffName: "Kofi Boateng",
    });

    await shop.t.mutation(internal.system.windows.close, { windowId });
    expect(
      (await shop.kofi.query(api.backOffice.windows.get, { windowId })).events.map(
        (event) => event.stage,
      ),
    ).toEqual(["open", "closed"]);
    expect(
      await refusal(
        shop.kofi.mutation(api.backOffice.windows.extend, {
          windowId,
          days: 3,
        }),
      ),
    ).toBe("NOT_OPEN");
  });
});

describe("Opening rules", () => {
  test("a Product opens one window at a time, numbered W1, W2, …", async () => {
    const shop = await preorderProduct();
    const first = await openWindow(shop);
    expect(await refusal(openWindow(shop))).toBe("WINDOW_ALREADY_OPEN");

    await shop.kofi.mutation(api.backOffice.windows.closeNow, {
      windowId: first,
    });
    const second = await openWindow(shop);
    expect(
      await shop.kofi.query(api.backOffice.windows.forProduct, {
        productId: shop.productId,
      }),
    ).toEqual([
      expect.objectContaining({ windowId: second, number: 2, stage: "open" }),
      expect.objectContaining({ windowId: first, number: 1, stage: "closed" }),
    ]);
  });

  test("the Product must be publishable apart from Store Prices, and the close date ahead", async () => {
    const shop = await preorderProduct();
    await shop.owner.mutation(api.backOffice.products.save, {
      productId: shop.productId,
      name: "Linen Kaftan",
      description: "",
      gallery: [],
      options: [{ name: "Size", values: ["S", "M"] }],
      variants: [
        { variantId: shop.small, optionValues: ["S"], sku: "LK-S" },
        { variantId: shop.medium, optionValues: ["M"], sku: "LK-M" },
      ],
      sellInStock: false,
      publish: false,
    });
    expect(await refusal(openWindow(shop))).toBe("WINDOW_BLOCKED");

    const fresh = await preorderProduct();
    expect(await refusal(openWindow(fresh, { days: -1 }))).toBe("INVALID_DATE");
    expect(await refusal(openWindow(fresh, { cap: 0 }))).toBe("INVALID_CAP");
  });
});

describe("The opening wizard", () => {
  test("a Pre-order-only Product with an open window can be edited and kept Published", async () => {
    const shop = await preorderProduct();
    await openWindow(shop);
    const saved = await shop.owner.query(api.backOffice.products.get, {
      productId: shop.productId,
    });
    expect(saved.offeredForPreorder).toBe(true);

    const { status } = await shop.owner.mutation(api.backOffice.products.save, {
      productId: shop.productId,
      name: "Linen Kaftan",
      description: "Now in two lengths.",
      categoryId: saved.categoryId,
      gallery: saved.gallery.map((photo) => photo.storageId),
      options: saved.options,
      variants: saved.variants.map(({ _id, ...variant }) => ({
        variantId: _id,
        ...variant,
      })),
      sellInStock: false,
      publish: true,
    });
    expect(status).toBe("published");
  });

  test("pre-fills from the previous window, or the Store Prices on a first one, prices for the Owner only", async () => {
    const shop = await preorderProduct();
    const first = await shop.owner.query(api.backOffice.windows.prefill, {
      productId: shop.productId,
    });
    expect(first).toMatchObject({
      blockedBy: null,
      variants: [
        { variantId: shop.small, label: "S", offered: true },
        { variantId: shop.medium, label: "M", offered: true },
      ],
    });

    const { windowId } = await shop.owner.mutation(api.backOffice.windows.save, {
      productId: shop.productId,
      variants: [{ variantId: shop.medium, preorderPrice: 40000, cap: 6 }],
      closesAt: Date.now() + DAY,
      minimumOrderQuantity: 3,
      shippingFeeEstimate: 4500,
      open: true,
    });
    expect(
      await shop.kofi.query(api.backOffice.windows.prefill, {
        productId: shop.productId,
      }),
    ).toMatchObject({ blockedBy: { windowId, number: 1, stage: "open" } });
    await shop.kofi.mutation(api.backOffice.windows.closeNow, { windowId });

    expect(
      await shop.owner.query(api.backOffice.windows.prefill, {
        productId: shop.productId,
      }),
    ).toEqual({
      blockedBy: null,
      minimumOrderQuantity: 3,
      shippingFeeEstimate: 4500,
      variants: [
        { variantId: shop.small, label: "S", offered: false },
        {
          variantId: shop.medium,
          label: "M",
          offered: true,
          preorderPrice: 40000,
          cap: 6,
        },
      ],
    });
    const forStaff = await shop.kofi.query(api.backOffice.windows.prefill, {
      productId: shop.productId,
    });
    expect(forStaff.variants[1]).toEqual({
      variantId: shop.medium,
      label: "M",
      offered: true,
      cap: 6,
    });
  });
});

describe("Owner prices, Staff open", () => {
  test("Staff open a draft the Owner priced, sending back the prices it has", async () => {
    const shop = await preorderProduct();
    const closesAt = Date.now() + 7 * DAY;
    const { windowId } = await shop.kofi.mutation(api.backOffice.windows.save, {
      productId: shop.productId,
      variants: [{ variantId: shop.small }],
      closesAt,
      open: false,
    });
    await shop.owner.mutation(api.backOffice.windows.save, {
      windowId,
      productId: shop.productId,
      variants: [{ variantId: shop.small, preorderPrice: 38000 }],
      closesAt,
      open: false,
    });

    const saved = await shop.kofi.query(api.backOffice.windows.get, { windowId });
    const { stage } = await shop.kofi.mutation(api.backOffice.windows.save, {
      windowId,
      productId: shop.productId,
      variants: saved.variants.map(({ variantId, preorderPrice, cap }) => ({
        variantId,
        preorderPrice,
        cap,
      })),
      closesAt,
      open: true,
    });
    expect(stage).toBe("open");
  });

  test("a Pre-order-only Product stays publishable after its window closes", async () => {
    const shop = await preorderProduct();
    const windowId = await openWindow(shop);
    await shop.kofi.mutation(api.backOffice.windows.closeNow, { windowId });

    const saved = await shop.owner.query(api.backOffice.products.get, {
      productId: shop.productId,
    });
    const { status } = await shop.owner.mutation(api.backOffice.products.save, {
      productId: shop.productId,
      name: saved.name,
      description: saved.description,
      categoryId: saved.categoryId,
      gallery: saved.gallery.map((photo) => photo.storageId),
      options: saved.options,
      variants: saved.variants.map(({ _id, ...variant }) => ({ variantId: _id, ...variant })),
      sellInStock: false,
      publish: true,
    });
    expect(status).toBe("published");
  });
});
