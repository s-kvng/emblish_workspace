import { api } from "./_generated/api";
import { kofiPhone, paidPreorder, withCustomer, withPreorders } from "./test.checkout";
import type { captureSms } from "./test.sms";

export const esiPhone = "+233201234567";

/**
 * The Shea window (one Variant at GHS 90, a GHS 8 Shipping Fee estimate), ordered from the
 * supplier: Kofi pre-ordered 1 (P-0001) then 2 (P-0002), and Esi 1 (P-0003). `arrived` units
 * are counted and locked, so P-0003 gets nothing when fewer than 4 arrive. Texts sent so far
 * are taken from `sms`.
 */
export async function sheaArrived(sms: ReturnType<typeof captureSms>, arrived = 4) {
  const shop = await withPreorders();
  const { t, customerId, sheaWindow, sheaJar } = shop;
  await t.run((ctx) => ctx.db.patch(sheaWindow, { shippingFeeEstimate: 800 }));
  const ama = t.withIdentity({ subject: "auth-window-opener" });
  const esi = await withCustomer(t, "Esi Owusu", esiPhone);
  await paidPreorder(t, customerId, sheaWindow, [{ variantId: sheaJar, quantity: 1 }]);
  await paidPreorder(t, customerId, sheaWindow, [{ variantId: sheaJar, quantity: 2 }]);
  await paidPreorder(t, esi.customerId, sheaWindow, [{ variantId: sheaJar, quantity: 1 }]);
  await ama.mutation(api.backOffice.windows.closeNow, { windowId: sheaWindow });
  await ama.mutation(api.backOffice.windows.advance, {
    windowId: sheaWindow,
    stage: "orderedFromSupplier",
    storeQuantities: [{ variantId: sheaJar, quantity: 0 }],
  });
  await ama.mutation(api.backOffice.arrivals.lock, {
    windowId: sheaWindow,
    counts: [{ variantId: sheaJar, arrived }],
  });
  // Payment, stage and arrival texts aren't what's under test.
  await sms.to(t, kofiPhone.slice(1));
  await sms.to(t, esiPhone.slice(1));
  return { ...shop, ama, esi };
}

/** The `/p/` code in an invoice SMS. */
export function payCodeIn(message: string) {
  const code = message.match(/\/p\/([A-Z2-9]{8})\b/)?.[1];
  if (!code) throw new Error(`No pay link in "${message}"`);
  return code;
}

/**
 * `sheaArrived` with all 4 units in and invoices issued at GHS 9 a unit; returns the `/p/` codes
 * texted to Kofi (P-0001, P-0002) and Esi (P-0003).
 */
export async function sheaInvoiced(sms: ReturnType<typeof captureSms>) {
  const shop = await sheaArrived(sms);
  const { t, ama, sheaWindow } = shop;
  await ama.mutation(api.backOffice.invoices.confirmFee, { windowId: sheaWindow, fee: 900 });
  await ama.mutation(api.backOffice.invoices.issue, { windowId: sheaWindow });
  const [kofi1, kofi2] = (await sms.to(t, kofiPhone.slice(1))).map((s) => payCodeIn(s.message));
  const [esi] = (await sms.to(t, esiPhone.slice(1))).map((s) => payCodeIn(s.message));
  return { ...shop, codes: { kofi1: kofi1!, kofi2: kofi2!, esi: esi! } };
}
