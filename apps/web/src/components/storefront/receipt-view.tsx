"use client";

import type { api } from "@emblish_workspace/backend/convex/_generated/api";
import { Button } from "@emblish_workspace/ui/components/button";
import { type Preloaded, usePreloadedQuery } from "convex/react";
import { Download, Share2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { cedi } from "@/lib/money";

/** "450.00": the slip's amounts always show pesewas, like a till receipt, under a GHS heading. */
function ghs(pesewas: number) {
  return (pesewas / 100).toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** The paper-slip Receipt: printable, with Save PDF (the print dialog) and Share. */
export default function ReceiptView({
  preloaded,
}: {
  preloaded: Preloaded<typeof api.storefront.receipts.get>;
}) {
  const receipt = usePreloadedQuery(preloaded);
  if (!receipt) return null;

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Emblish receipt ${receipt.receiptNumber}`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Receipt link copied");
      }
    } catch {
      // The Customer closed the share sheet.
    }
  };

  // Fulfilment is chosen once per Checkout, so every order on the Receipt shares it.
  const fulfilment = receipt.orders[0]?.fulfilment ?? {
    method: "pickup" as const,
  };
  const paidAt = new Date(receipt.paidAt).toLocaleString("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 print:max-w-none print:p-0">
      <p className="mb-4 text-center font-semibold text-brand-purple text-sm print:hidden">
        Payment received. Thank you!
      </p>
      <article className="rounded-sm border border-dashed bg-card px-5 py-6 font-mono text-[13px] shadow-sm print:border-0 print:shadow-none">
        <header className="text-center">
          <p className="font-display font-semibold text-2xl text-brand-purple not-italic">
            Emblish
          </p>
          <p className="mt-1">RECEIPT {receipt.receiptNumber}</p>
          <p className="text-muted-foreground">{paidAt}</p>
        </header>
        <Rule />
        <dl className="space-y-0.5">
          {receipt.customerName && <Row label="Customer" value={receipt.customerName} />}
          <Row label="Phone" value={receipt.phone} />
          <Row
            label="Fulfilment"
            value={fulfilment.method === "pickup" ? "Pickup" : `Delivery · ${fulfilment.zoneName}`}
          />
        </dl>
        {fulfilment.method === "pickup" ? (
          receipt.pickupLocation && (
            <p className="mt-1 whitespace-pre-line text-muted-foreground">
              {receipt.pickupLocation}
            </p>
          )
        ) : (
          <p className="mt-1 text-muted-foreground">
            To {fulfilment.recipientName} ({fulfilment.recipientPhone})
            <br />
            {[fulfilment.street, fulfilment.area].filter(Boolean).join(", ")}
            <br />
            Near {fulfilment.landmark}
            {fulfilment.ghanaPostGps && (
              <>
                <br />
                GPS {fulfilment.ghanaPostGps}
              </>
            )}
          </p>
        )}
        {receipt.orders.map((order) => (
          <section key={order.reference}>
            <Rule />
            <p className="font-semibold">STORE ORDER {order.reference}</p>
            <ul className="mt-1 space-y-1">
              {order.lines.map((line) => (
                <li key={`${line.productName}-${line.variantLabel}`}>
                  <div className="flex justify-between gap-3">
                    <span>
                      {line.quantity} × {line.productName}
                    </span>
                    <span>{ghs(line.unitPrice * line.quantity)}</span>
                  </div>
                  {line.variantLabel && (
                    <p className="text-muted-foreground">
                      {line.variantLabel} @ {ghs(line.unitPrice)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {order.fulfilment.method === "delivery" && (
              <div className="mt-1 flex justify-between gap-3">
                <span>Delivery Fee</span>
                <span>
                  {order.fulfilment.deliveryFee === undefined
                    ? "quoted by SMS"
                    : ghs(order.fulfilment.deliveryFee)}
                </span>
              </div>
            )}
            {order.fulfilment.method === "pickup" && (
              <div className="mt-3 rounded border-2 border-brand-purple border-dashed py-2 text-center">
                <p className="text-[11px] text-muted-foreground uppercase">Pickup Code</p>
                <p className="font-bold text-2xl text-brand-purple tracking-[0.3em]">
                  {order.pickupCode}
                </p>
              </div>
            )}
          </section>
        ))}
        <Rule />
        <div className="flex justify-between font-bold text-base">
          <span>TOTAL PAID (GHS)</span>
          <span>{ghs(receipt.total)}</span>
        </div>
        {receipt.toRefund > 0 && (
          <p className="mt-2">
            {receipt.orders.length === 0
              ? "We couldn't fill an order with this payment."
              : "Part of this order sold out before the payment came through."}{" "}
            {cedi(receipt.toRefund)} will be refunded to you.
          </p>
        )}
        <dl className="mt-2 space-y-0.5 text-muted-foreground">
          <Row label="Paid with" value="Mobile money · Seev Plus" />
          <Row label="Ref" value={receipt.seevReference} />
        </dl>
        <Rule />
        <p className="text-center text-muted-foreground">
          {receipt.orders.length > 0 && (
            <>
              {fulfilment.method === "pickup"
                ? "Show your Pickup Code when you collect."
                : "We text you when your order is on its way."}
              <br />
            </>
          )}
          Shipping Fees for Pre-orders are invoiced separately on arrival.
        </p>
      </article>

      <div className="mt-5 grid grid-cols-2 gap-3 print:hidden">
        <Button variant="outline" size="lg" className="h-11 text-sm" onClick={() => window.print()}>
          <Download className="size-4" /> Save PDF
        </Button>
        <Button variant="outline" size="lg" className="h-11 text-sm" onClick={share}>
          <Share2 className="size-4" /> Share
        </Button>
        <Link
          href="/orders"
          className="col-span-2 py-2 text-center font-semibold text-brand-purple text-sm"
        >
          Track my orders
        </Link>
      </div>
    </div>
  );
}

function Rule() {
  return <hr className="my-3 border-dashed" />;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
