# Seev Plus replaces Paystack, and we poll for payment as well as taking the webhook

Payments go through the Seev Plus Checkout API (`POST /api/v1/developer/payments`, then the hosted checkout page), not Paystack, which was chosen in the payment-provider decision (s-kvng/emblish_workspace#7). The Checkout flow stays the same: the Checkout and its Stock Holds start at Pay, the Customer pays on a hosted page, and a verified payment creates the `payments` row and the Store Order. Only the provider-facing pieces change, and they live in `convex/model/seev.ts` so the provider can be swapped again.

Seev settles differently from Paystack in ways that change our design:

- **Its webhook can't be the only signal.** Seev fires `payment.succeeded` only when something calls its verify route, tries each delivery once with an 8-second timeout, and can deliver the same event twice or out of order. So every payment session is also polled: `system/seev` verifies it about once a minute while it can still be paid, plus a final check after its expiry, and the Storefront's return page verifies on arrival. The signed webhook (`POST /seev/webhook`, HMAC-SHA256 `v1=` over `{timestamp}.{raw body}`) only triggers the same verify early. Every path re-verifies with Seev before settling, and settling is idempotent on the Seev reference.
- **Payment sessions are stored.** The data-model decision (s-kvng/emblish_workspace#20) kept no unpaid attempts. Seev makes the reference, and its verify response doesn't carry our `meta`, so each attempt is a `paymentSessions` row (Checkout, reference, hosted URL, expiry). It maps a reference back to its Checkout and drives the polling. A Checkout's retries each get a new session with their own `Idempotency-Key`.
- **No fee is reported.** Neither verify nor the webhook gives a fee, so `payments` has no `paystackFee` field. Fees are reconciled from the Seev dashboard.
- **No refunds API.** Refunds are still recorded as `refunds` rows (`toRefund`). Paying them out is manual, from the Seev dashboard, until Seev offers an API (ADR 0004).
- **Mobile money only.** Seev collects only mobile money (MTN, Telecel, AT) and USDC today, not cards. The Storefront mustn't promise card payment.
- **No Customer email.** Seev asks for the customer's real name and email. We send the name asked at the first Checkout and the verified phone, and no email, so we keep the "no Customer email" decision. Before going live, confirm with support@seevplus.com that payments without an email are acceptable.

Amounts sent to Seev are pesewas, as ours are. Webhook amounts arrive in cedis, which is one more reason we settle only on what the verify route reports (`final_amount`, in pesewas).

## Considered Options

- **Build on Paystack, then migrate.** Rejected: no Paystack code existed yet, so this would have meant building the webhook and settlement twice.
- **Webhook only.** Rejected: a payment nobody verifies never produces a webhook, and a single failed delivery is never retried, so a paid Checkout could go unsettled.
