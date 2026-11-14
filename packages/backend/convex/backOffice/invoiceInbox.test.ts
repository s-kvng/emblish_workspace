import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { sheaInvoiced } from "../test.invoices";
import { captureSms } from "../test.sms";

const sms = captureSms();
const DAY = 24 * 60 * 60 * 1000;

/**
 * The Shea window invoiced (Kofi P-0001 GHS 9, P-0002 GHS 18, Esi P-0003 GHS 9), with each
 * invoice's first issue moved back by the given number of days.
 */
async function invoicedDaysAgo(days: { kofi1?: number; kofi2?: number; esi?: number }) {
  const shop = await sheaInvoiced(sms);
  const ids = await shop.t.run(async (ctx) => {
    const byCode = async (code: string) =>
      (await ctx.db
        .query("invoices")
        .withIndex("by_code", (q) => q.eq("code", code))
        .unique())!;
    const out: Record<string, Awaited<ReturnType<typeof byCode>>["_id"]> = {};
    for (const key of ["kofi1", "kofi2", "esi"] as const) {
      const invoice = await byCode(shop.codes[key]);
      out[key] = invoice._id;
      const ago = days[key];
      if (ago !== undefined) {
        await ctx.db.patch(invoice._id, {
          clockStartedAt: Date.now() - ago * DAY,
        });
      }
    }
    return out as Record<"kofi1" | "kofi2" | "esi", (typeof out)[string]>;
  });
  return { ...shop, ids };
}

describe("The Invoices inbox", () => {
  test("each filter header shows a count and GH₵ total, worked out from the first issue date", async () => {
    // P-0001 is 20 days in (overdue), P-0003 is 31 days in (overdue and Forfeit-eligible).
    const { ama } = await invoicedDaysAgo({ kofi1: 20, esi: 31 });

    const inbox = await ama.query(api.backOffice.invoices.inbox, {
      filter: "unpaid",
    });

    expect(inbox.counts).toEqual({
      overdue: { count: 2, total: 1800 },
      eligible: { count: 1, total: 900 },
      unpaid: { count: 3, total: 3600 },
      paid: { count: 0, total: 0 },
      void: { count: 0, total: 0 },
    });
  });

  test("Eligible for Forfeit lists Shipping Fee Invoices unpaid 30 or more days after first issue", async () => {
    const { ama } = await invoicedDaysAgo({ kofi1: 29, esi: 30 });

    const inbox = await ama.query(api.backOffice.invoices.inbox, {
      filter: "eligible",
    });

    expect(inbox.rows).toEqual([
      expect.objectContaining({
        number: "INV-0003",
        orderReference: "P-0003",
        customerName: "Esi Owusu",
        productName: "Shea Body Butter",
        total: 900,
        state: "forfeitable",
        day: 30,
      }),
    ]);
  });

  test("Overdue lists unpaid invoices past their due date, oldest first", async () => {
    const { ama } = await invoicedDaysAgo({ kofi1: 15, kofi2: 14, esi: 40 });

    const inbox = await ama.query(api.backOffice.invoices.inbox, {
      filter: "overdue",
    });

    expect(inbox.rows.map((row) => [row.number, row.state, row.day])).toEqual([
      ["INV-0003", "forfeitable", 40],
      ["INV-0001", "overdue", 15],
    ]);
  });
});
