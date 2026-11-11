# Refunds are paid out by hand and marked refunded

The refunds ticket (s-kvng/emblish_workspace#36) was written for Paystack: the Owner taps Refund, we call Paystack `/refund` (`processing`), and its `refund.*` webhook marks it `refunded`, or `needsAttention` on a failure. Seev Plus replaced Paystack (ADR 0003) and has no refunds API, so a Refund has two states only: `toRefund` and `refunded`. The Owner sends the money from the Seev dashboard, by mobile money or in cash, then taps **Mark refunded** on Refunds to make, picking how it went (`seevDashboard`, `mobileMoney`, `cash`, `other`, which needs a note) and an optional note such as the transaction id. That sets `refundedAt`, `refundedBy` and `method`, and writes a `refunded` order event. Marking is Owner-only (`requireOwner`) and refused once already refunded, which is what the webhook's idempotence protected before.

Flagging a Refund stays as the ticket designed it. Staff cancel units on a Store Order until it leaves the shop (Payment due or Ready). The units go back to Stock as `cancelled` Stock Movements unless Staff untick it, and cancelling the last units cancels the order and adds its paid Delivery Fee. After handover (Collected or Delivered), only an Owner flags a Refund, with a reason, optionally adding the Delivery Fee and restocking the units as `returned`. Each order line keeps a `refundedQuantity`, so no unit is refunded twice, and each refund row records its `lines`, `deliveryFee` and `returnToStock`.

## Considered Options

- **Keep `processing` and `needsAttention` for a future Seev API.** Rejected: nothing would write them, and every screen would have to handle states that can't happen. They come back with the API, if Seev ships one.
- **Mark refunded with no method.** Rejected: payouts happen outside the app, so the method and note are the only trail for reconciling against the Seev dashboard and MoMo statements.
