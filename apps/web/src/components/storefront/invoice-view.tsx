"use client";

import { api } from "@emblish_workspace/backend/convex/_generated/api";
import { Button } from "@emblish_workspace/ui/components/button";
import { type Preloaded, useAction, usePreloadedQuery } from "convex/react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { messageOf } from "@/lib/convex-errors";
import { cedi } from "@/lib/money";

const DAY = 24 * 60 * 60 * 1000;

/** "18.00": the document's amounts always show pesewas, under a GHS heading. */
function ghs(pesewas: number) {
  return (pesewas / 100).toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function day(at: number) {
  return new Date(at).toLocaleDateString("en-GH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Whole days from today to the due day, in Ghana time (GMT): negative once it's overdue. */
function daysUntil(dueAt: number, now: number) {
  return Math.floor(dueAt / DAY) - Math.floor(now / DAY);
}

function dueText(days: number) {
  if (days > 1) return `IN ${days} DAYS`;
  if (days === 1) return "TOMORROW";
  if (days === 0) return "TODAY";
  return `OVERDUE ${-days} DAY${days === -1 ? "" : "S"}`;
}

/**
 * The `/p/` page: a printable paper invoice (a sibling of the Receipt) with AMOUNT DUE, the due
 * date and a PAID or VOID stamp, and a sticky Pay bar that opens Seev. No sign-in, and pay-only:
 * fulfilment is changed in My orders.
 */
export default function InvoiceView({
  preloaded,
  returnedFromSeev,
}: {
  preloaded: Preloaded<typeof api.storefront.invoices.get>;
  returnedFromSeev: boolean;
}) {
  const invoice = usePreloadedQuery(preloaded);
  const pay = useAction(api.storefront.invoices.pay);
  const refresh = useAction(api.storefront.invoices.refresh);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string>();
  const [checked, setChecked] = useState(!returnedFromSeev);
  const [now] = useState(() => Date.now());
  const refreshed = useRef(false);
  const router = useRouter();
  const code = invoice?.code;
  const replacedByCode = invoice?.status === "void" ? invoice.replacedByCode : undefined;

  // Voided and reissued while open: follow to the invoice to pay now, as the page load does.
  useEffect(() => {
    if (replacedByCode) router.replace(`/p/${replacedByCode}` as Route);
  }, [replacedByCode, router]);

  // Back from Seev: ask Seev now rather than waiting for the next poll.
  useEffect(() => {
    if (!returnedFromSeev || !code || refreshed.current) return;
    refreshed.current = true;
    refresh({ code })
      .catch(() => {})
      .finally(() => setChecked(true));
  }, [returnedFromSeev, code, refresh]);

  if (!invoice) return null;

  const payNow = async () => {
    setPaying(true);
    setError(undefined);
    try {
      const { checkoutUrl } = await pay({ code: invoice.code });
      window.location.assign(checkoutUrl);
    } catch (failure) {
      setError(messageOf(failure, "We couldn't open the payment page. Try again."));
      setPaying(false);
    }
  };

  const unpaid = invoice.status === "unpaid";
  const days = daysUntil(invoice.dueAt, now);
  const overdue = unpaid && days < 0;
  const shipping = invoice.kind === "shippingFee";
  const { fulfilment } = invoice;

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-6 pb-32 print:max-w-none print:p-0">
      {returnedFromSeev && checked && unpaid && (
        <p className="mb-4 rounded-md bg-brand-gold-mist px-3 py-2 text-center text-sm print:hidden">
          Payment didn't go through. Nothing was charged.
        </p>
      )}
      <article className="relative overflow-hidden rounded-sm border bg-card px-5 py-6 text-[13px] shadow-sm print:border-0 print:shadow-none">
        {invoice.status !== "unpaid" && (
          <div
            aria-hidden
            className={`pointer-events-none absolute top-24 right-4 rotate-[-14deg] rounded border-4 px-3 py-1 font-bold text-4xl tracking-widest ${
              invoice.status === "paid"
                ? "border-brand-success text-brand-success"
                : "border-muted-foreground text-muted-foreground"
            } opacity-80`}
          >
            {invoice.status === "paid" ? "PAID" : "VOID"}
          </div>
        )}
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display font-semibold text-2xl text-brand-purple">Emblish</p>
            <p className="mt-1 font-semibold tracking-wide">
              {shipping ? "SHIPPING FEE INVOICE" : "DELIVERY FEE INVOICE"}
            </p>
          </div>
          <div className="text-right text-muted-foreground">
            <p className="font-mono text-foreground">{invoice.number}</p>
            <p>Issued {day(invoice.issuedAt)}</p>
          </div>
        </header>

        <Rule />
        <p className="font-semibold">
          Pre-order {invoice.orderReference}
          {invoice.customerName && (
            <span className="font-normal text-muted-foreground"> · {invoice.customerName}</span>
          )}
        </p>
        <ul className="mt-1 space-y-0.5">
          {invoice.items
            .filter((item) => item.arrived > 0 || item.missing > 0)
            .map((item) => (
              <li key={`${item.productName}-${item.variantLabel}`}>
                {item.arrived} × {item.productName}
                {item.variantLabel && (
                  <span className="text-muted-foreground"> · {item.variantLabel}</span>
                )}
                {item.missing > 0 && (
                  <span className="block text-muted-foreground">
                    {item.missing} didn't arrive, refunded separately
                  </span>
                )}
              </li>
            ))}
        </ul>
        <p className="mt-2 text-muted-foreground">
          {fulfilment.method === "pickup" ? (
            <>
              Pickup · <span className="whitespace-pre-line">{invoice.pickupLocation}</span>
            </>
          ) : (
            <>
              Delivery · {fulfilment.zoneName}
              <br />
              {[fulfilment.street, fulfilment.area].filter(Boolean).join(", ")}, near{" "}
              {fulfilment.landmark}
            </>
          )}
        </p>

        <Rule />
        <ul className="space-y-2">
          {invoice.lines.map((line) => (
            <li key={line.kind}>
              <div className="flex justify-between gap-3">
                <span>{line.kind === "shippingFee" ? "Shipping Fee" : "Delivery Fee"}</span>
                <span className="font-mono">{ghs(line.amount)}</span>
              </div>
              <p className="text-muted-foreground">
                {line.kind === "shippingFee"
                  ? `${line.units} arrived unit${line.units === 1 ? "" : "s"} × ${cedi(line.unitFee)}`
                  : line.zoneName}
              </p>
            </li>
          ))}
        </ul>

        <Rule />
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-semibold text-muted-foreground text-xs tracking-wide">
              AMOUNT DUE (GHS)
            </p>
            <p className="font-bold font-mono text-2xl">{ghs(unpaid ? invoice.total : 0)}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">DUE {day(invoice.dueAt).toUpperCase()}</p>
            {unpaid && (
              <p
                className={
                  overdue ? "font-bold text-brand-danger" : "text-muted-foreground text-xs"
                }
              >
                {dueText(days)}
              </p>
            )}
          </div>
        </div>

        {invoice.itemReceiptNumber && (
          <>
            <Rule />
            <p className="text-center text-muted-foreground">
              Item Payment already paid · Receipt {invoice.itemReceiptNumber}
            </p>
          </>
        )}
      </article>

      <div className="mt-4 space-y-2 text-center text-sm print:hidden">
        {invoice.paid ? (
          <>
            <p>
              Paid {day(invoice.paid.paidAt)} ·{" "}
              <Link
                href={`/r/${invoice.paid.receiptCode}` as Route}
                className="font-semibold text-brand-purple"
              >
                Receipt {invoice.paid.receiptNumber}
              </Link>
            </p>
            <p className="text-muted-foreground">We texted your Receipt.</p>
            <Link href="/orders" className="inline-block font-semibold text-brand-purple">
              Track this order in My orders
            </Link>
          </>
        ) : invoice.status === "void" ? (
          <>
            <p className="text-muted-foreground">
              This invoice was cancelled{invoice.voidReason ? `: ${invoice.voidReason}` : "."}
            </p>
            {invoice.replacedByCode && (
              <Link
                href={`/p/${invoice.replacedByCode}` as Route}
                className="inline-block font-semibold text-brand-purple"
              >
                Open the new invoice
              </Link>
            )}
          </>
        ) : shipping ? (
          <p className="text-muted-foreground">
            {overdue
              ? "This is overdue. After 30 days unpaid we may release your goods, and the Item Payment isn't automatically refunded."
              : "Your goods are waiting. We hand them over once this is paid."}
          </p>
        ) : (
          <p className="text-muted-foreground">
            {overdue
              ? "Your goods are safe with us. You can switch to Pickup in My orders."
              : "We dispatch as soon as this is paid."}
          </p>
        )}
        <Button variant="outline" className="h-11" onClick={() => window.print()}>
          Print or save PDF
        </Button>
      </div>

      {unpaid && (
        <div className="fixed inset-x-0 bottom-0 border-t bg-card/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur print:hidden">
          <div className="mx-auto max-w-md">
            {error && <p className="mb-2 text-center text-brand-danger text-sm">{error}</p>}
            <Button
              size="lg"
              className="h-12 w-full bg-brand-gold font-semibold text-base text-brand-purple-deep hover:bg-brand-gold-bright"
              disabled={paying}
              onClick={payNow}
            >
              {paying ? "Opening payment…" : `Pay ${cedi(invoice.total)}`}
            </Button>
            <p className="mt-1.5 text-center text-muted-foreground text-xs">
              Mobile money, on Seev Plus. No sign-in needed.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Rule() {
  return <hr className="my-3 border-dashed" />;
}
