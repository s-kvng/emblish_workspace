# Payment provider for Ghana on Convex

Research for issue #7 (parent map: #1). Researched 2026-10-18 from official provider docs and pricing pages, plus Convex docs. Fees and requirements change, so re-check the linked pages before signing up.

## Recommendation

**Use Paystack.** Use its hosted checkout (`/transaction/initialize`) for both the Item Payment and the Shipping Fee Invoice, confirm payments through `charge.success` webhooks received by a Convex HTTP action, and verify them with `/transaction/verify` before marking anything paid.

Why Paystack:

- It covers all three Ghana mobile-money networks plus Visa/Mastercard in GHS, through a single hosted checkout. [P1][P2]
- It charges a flat **1.95%** on local and international transactions, with no setup or maintenance fee. Settlement is automatic and T+1 to a bank account or a mobile-money wallet. [P1]
- It signs webhooks with HMAC-SHA512, which the Convex default runtime can verify with Web Crypto. Retries are generous: live mode retries for 72 hours. [P3][C2]
- It has full and partial refunds through the API, with refund webhooks. [P5]
- A sole trader can start as a "Starter Business" before incorporating. [P6]
- It is a Stripe company, and its docs are the most complete and stable of the options compared.

Runner-up: **Hubtel.** It is local, with similar headline pricing and cheaper tiered MoMo fees on some amounts, and it also sells SMS. But its checkout callbacks are not documented as signed. That forces a status-check on every payment, which may need a whitelisted static IP, and Convex does not obviously provide one. Its docs are also split across several inconsistent sites. Flutterwave costs more in Ghana and its webhook "signature" is a static shared secret.

## Comparison

| | **Paystack** | **Hubtel** | **Flutterwave** |
|---|---|---|---|
| MoMo networks | MTN (`mtn`), Telecel (`vod`), AT Money (`atl`) [P2] | MTN, Telecel, AT Money (in the fee schedule) [H3] | MTN, Telecel/Vodafone, AirtelTigo; docs contradict themselves on the network codes [F3] |
| Cards | Visa, Mastercard (+ Apple Pay) [P1][P2] | Visa, Mastercard, also G-Money, Zeepay, GhQR [H3] | Visa, Mastercard, Amex, Discover [F1] |
| Local fee | 1.95% [P1] | 1.95% card-not-present. MoMo is tiered, roughly 1% in the mid range, then a flat cap (e.g. MTN GHS 20 above GHS 2,000) [H3] | 2.0% MoMo, 2.6% local card [F1] |
| International card fee | 1.95%, settled in GHS [P1] | 1.95% (CNP) [H3] | 4.8% [F1] |
| Payout fees | GHS 1 to MoMo, GHS 8 to bank [P1] | not verified | 1.5% to MoMo, GHS 10 to bank [F1] |
| Settlement | T+1 automatic; no minimum to a MoMo wallet, GHS 50 minimum to a bank [P1] | Hubtel claims hourly settlement, unverified on a primary page (see notes) | Next day for local payments [F1] |
| Hosted checkout / link | `POST /transaction/initialize` returns `authorization_url`. `POST /paymentrequest` creates invoices (email notification, due date, line items) [P4][P7] | `POST payproxyapi.hubtel.com/items/initiate` returns `checkoutUrl` / `checkoutDirectUrl` [H1] | `POST /v3/payments` returns a hosted link. Dashboard payment links also exist [F4] |
| Webhook auth | `x-paystack-signature` = HMAC-SHA512(raw body, secret key), plus a published IP allow-list [P3] | Not documented as signed; status-check is mandatory if no callback within 5 min [H1][H2] | `verif-hash` header equals a static secret you set (no HMAC) [F2] |
| Webhook retries | Live: every 3 min ×4, then hourly for 72 h. Events can be resent via API [P3] | not documented | 3 retries, 30 min apart, only if enabled in the dashboard [F2] |
| Refund API | Full/partial `POST /refund`. Processed refunds can take up to 10 business days to reach the customer. Can enter `needs-attention`, which needs the customer's account details [P5] | not verified | `POST /v3/transactions/{id}/refund`, partial allowed. MoMo refunds take 3–5 days [F5] |
| Onboarding | Starter: Ghana Card/ID, TIN, personal bank/MoMo, matching names. Registered: e.g. Cert. of Incorporation + Form 3 + TIN, or sole-prop Cert. of Registration [P6] | not verified | not verified |

"Not verified" means I found no primary source for it during this research.

## How it fits Convex

Convex can do everything this integration needs without the Node runtime.

- **Outbound API calls** (initialize, verify, refund) run in a Convex **action**. `fetch` is available in actions in the default runtime. [C2]
- **Webhooks** go to an `httpAction` routed in `convex/http.ts`. The URL is `https://<deployment>.convex.site/...`. The handler gets a standard `Request`, so `await request.text()` gives the raw body needed for HMAC. [C1]
- **Signature check**: the default runtime has Web Crypto (`crypto.subtle`) [C2], so compute HMAC-SHA512 with the Paystack secret key from `process.env`, then compare it with `x-paystack-signature`. `"use node"` with `node:crypto` also works, but only inside a separate Node action file. [C2]
- HTTP actions are **not** retried by Convex on error, so make the webhook idempotent on `reference` and return 200 quickly. Paystack's own retries cover failures. [C1][P3]
- Defence in depth: after a valid `charge.success`, re-verify the payment from an action with `GET /transaction/verify/:reference`. Check `status === "success"`, plus amount, currency `GHS` and reference, before a mutation marks the Item Payment or Shipping Fee Invoice paid. A scheduled job should also sweep stale pending payments. Paystack advises calling verify if no webhook arrives within 180 s for MoMo. [P2][P7]

### Suggested flow for the Shipping Fee Invoice (SMS link)

1. When Staff issue the Shipping Fee Invoice, Convex stores it and the SMS links to **our own stable URL**, e.g. `emblish.com/pay/<invoiceId>`. Do not put a provider URL in the SMS.
2. When that page opens, a Convex action calls `/transaction/initialize` with `currency: "GHS"`, a fresh `reference`, the invoice id in `metadata`, and `callback_url` back to the page. It then redirects to `authorization_url`.
3. The webhook plus verify marks the invoice paid, and the page reflects it reactively.

This keeps the link valid indefinitely and lets the invoice amount change before payment. It also avoids depending on Paystack Payment Requests, which notify by email only (`send_notification`) and default to NGN. [P4]

## Caveats and open questions

- **Paystack MoMo refunds**: the refund docs don't say how refunds back to a mobile-money wallet behave. The `needs-attention` retry example takes bank details. Confirm with Paystack Ghana support before relying on automatic MoMo refunds. [P5]
- **MoMo authorisation window**: the customer must approve on their phone within 180 s, a network limit. The UI should say "check your phone" and handle timeouts. [P2]
- **Starter vs Registered**: a Starter account pays out to a personal account in the owner's name. Plan to upgrade once Emblish is registered. [P6]
- **Hubtel settlement and fees**: the hourly-settlement claim and the tiered MoMo fee figures came through search summaries of Hubtel's fee page, which did not render for direct fetch. Treat them as indicative.
- **Hubtel static IP**: Hubtel's Programmable Services docs require a whitelisted static IP for status-check endpoints [H2]. Whether that applies to Online Checkout is unconfirmed. Convex deployments do not advertise fixed egress IPs, which would block Hubtel unless a proxy is added.
- **Fees exclude taxes**: Flutterwave states VAT and local taxes are extra [F1]. Check Paystack's position on Ghana's VAT and levies with their support.
- **SMS is separate**: Paystack does not send SMS, so the SMS provider is a different decision. Hubtel is a candidate for SMS even if Paystack handles payments.
- **Other local gateways** (e.g. theteller/PaySwitch, ExpressPay): these exist with card and MoMo checkout and basic-auth APIs, but publish no pricing and offer thinner docs. They were not pursued. [T1]

## Sources

- [P1] Paystack Ghana pricing: https://paystack.com/gh/pricing
- [P2] Paystack payment channels (Mobile money): https://paystack.com/docs/payments/payment-channels/
- [P3] Paystack webhooks: https://paystack.com/docs/payments/webhooks/
- [P4] Paystack Payment Requests API: https://paystack.com/docs/api/payment-request/
- [P5] Paystack refunds: https://paystack.com/docs/payments/refunds/
- [P6] Paystack compliance requirements for Ghana: https://support.paystack.com/en/articles/2123842
- [P7] Paystack Transactions API (initialize / verify): https://paystack.com/docs/api/transaction/
- [H1] Hubtel Online Checkout API reference: https://dev-docs.hubtel.com/frontend/tools-and-sdks/checkout/api-reference.html and https://businessdocs-developers.hubtel.com/docs/api-reference-online-checkout
- [H2] Hubtel checkout callback / onsite checkout / programmable services: https://businessdocs-developers.hubtel.com/reference/checkout-callback, https://businessdocs-developers.hubtel.com/docs/ussd-checkout, https://businessdocs-developers.hubtel.com/reference/programmable-services
- [H3] Hubtel service fees: https://explore.hubtel.com/legal/service-fees/
- [F1] Flutterwave Ghana pricing: https://flutterwave.com/gh/pricing
- [F2] Flutterwave webhooks: https://developer.flutterwave.com/docs/webhooks
- [F3] Flutterwave Ghana mobile money: https://developer.flutterwave.com/docs/ghana
- [F4] Flutterwave Standard (hosted checkout): https://developer.flutterwave.com/docs/collecting-payments/standard
- [F5] Flutterwave refunds: https://developer.flutterwave.com/docs/refunds
- [C1] Convex HTTP actions: https://docs.convex.dev/functions/http-actions
- [C2] Convex runtimes: https://docs.convex.dev/functions/runtimes
- [T1] theteller documentation: https://theteller.net/documentation
