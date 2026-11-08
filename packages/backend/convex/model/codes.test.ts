import { afterEach, describe, expect, test, vi } from "vitest";

import { withShop } from "../test.checkout";
import { newPickupCode } from "./codes";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Makes the next random draws produce these digit strings, one per draw. */
function nextDraws(...codes: string[]) {
  const spy = vi.spyOn(crypto, "getRandomValues");
  for (const code of codes) {
    spy.mockImplementationOnce((array) => {
      new Uint8Array(array.buffer).set([...code].map(Number));
      return array;
    });
  }
}

describe("Pickup Codes", () => {
  test("a code held by an open order is drawn again", async () => {
    const { t, customerId } = await withShop();
    await t.run(async (ctx) => {
      const checkoutId = await ctx.db.insert("checkouts", {
        customerId,
        lines: [],
        fulfilment: { method: "pickup" },
        total: 0,
        status: "paid",
        expiresAt: 0,
      });
      const paymentId = await ctx.db.insert("payments", {
        seevReference: "PAY-0",
        amount: 0,
        paidAt: 0,
        customerId,
        checkoutId,
        receiptNumber: "R-0000",
        receiptCode: "AAAAAAAA",
      });
      for (const [pickupCode, status] of [
        ["111111", "ready"],
        ["222222", "collected"],
      ] as const) {
        await ctx.db.insert("orders", {
          kind: "store",
          reference: `S-${pickupCode}`,
          customerId,
          checkoutId,
          paymentId,
          placedAt: 0,
          fulfilment: { method: "pickup" },
          pickupCode,
          status,
        });
      }
    });

    nextDraws("111111", "222222");
    const code = await t.run((ctx) => newPickupCode(ctx));

    // 111111 is still open; 222222 was collected, so it may be used again.
    expect(code).toBe("222222");
  });
});
