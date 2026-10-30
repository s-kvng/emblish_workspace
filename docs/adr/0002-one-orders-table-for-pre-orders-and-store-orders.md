# Pre-orders and Store Orders share one `orders` table

Pre-orders and Store Orders are distinct in the glossary, but they share fulfilment, Delivery Zone and frozen Delivery Fee, Pickup Code, handover statuses, Delivery Fee Invoices, Refunds, history and the order reference sequence. We store both in one `orders` table discriminated by `kind: "preorder" | "store"` (Order Window, Shipping Fee and Forfeit fields exist only on `preorder`), with one `orderLines` and one `orderEvents` table. This keeps "Pickup Codes unique among open orders", the Counter's "also ready" orders and the Customer's single My orders feed as one indexed query each, instead of two merged ones.

## Considered Options

Separate `preorders` and `storeOrders` tables were rejected: every handover, refund and invoice path would need to accept either table, and cross-kind queries would be merged by hand.
