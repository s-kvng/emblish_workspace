# SMS provider for Ghana

Research for wayfinder ticket [#8](https://github.com/s-kvng/emblish_workspace/issues/8) (map [#1](https://github.com/s-kvng/emblish_workspace/issues/1)). Researched 2026-10-18.

## Question

Which SMS provider should Emblish use in Ghana? SMS is the main notification channel. It carries Item Payment receipts, Shipping Fee Invoices with a payment link, and ready-for-Pickup notices. It may also carry phone OTP if phone verification is chosen. The backend is Convex, so the provider is called from Convex actions and its webhooks land on Convex HTTP actions.

## Recommendation

**Use Arkesel for SMS (and for OTP if phone verification is chosen).** Put it behind a small `sendSms` interface in the backend so it can be swapped.

Why:

- **Best publicly documented API of the three.** Arkesel publishes a full OpenAPI spec (v2.4.0). It uses JSON over HTTPS with an `api-key` header, works from a Convex action with `fetch`, and needs no SDK.
- **Push delivery reports with signed webhooks.** You pass a `callback_url` on each send. Arkesel pushes the status (for example `DELIVERED`) to that URL and signs it with HMAC-SHA256, with a timestamp header and secret rotation. That maps cleanly onto a Convex HTTP action that updates a notification record. mNotify only supports polling. Hubtel's delivery-report contract is not publicly visible.
- **Free sandbox mode** (`sandbox: true`). Sandbox messages are not billed and not sent to the networks, which suits dev and preview deployments.
- **OTP built in.** `/api/otp/generate` and `/api/otp/verify` cost GHS 0.035 per verification, with a USSD fallback code (for example `*928*01#`) for when the SMS does not arrive.
- **Transparent, low price.** GHS 0.025–0.031 per SMS on non-expiring credits, or GHS 0.022–0.029 on 3-month expiring credits.

**Hubtel is the alternative to revisit only if Hubtel is chosen as the payment provider.** Then one vendor, one contract and one dashboard covers both SMS and Online Checkout. Even then, the SMS integration is small enough that consolidating is a convenience, not a reason to choose. Hubtel's per-network gateway prices are lower, but its developer docs are behind a business-account login, so we could not check the API or the delivery-report contract.

## Comparison

| | **Arkesel** | **Hubtel** | **mNotify (now "BMS")** | Twilio (benchmark) |
|---|---|---|---|---|
| **API docs** | Public OpenAPI spec v2.4.0 [A1] | Developer portal docs need a business-account login [H3]. Only community SDKs are public [H4] | Public OpenAPI (Redoc) [M1] | Public |
| **Auth** | `api-key` header [A1] | HTTP Basic (Client ID / Secret) [H4] | `key` query parameter (API key in the URL) [M1] | Basic |
| **Send** | `POST https://sms.arkesel.com/api/v2/sms/send` with `sender` (11 chars or fewer), `recipients[]`, `message`, optional `scheduled_date`, `callback_url`, `sandbox` [A1] | `.../v1/messages/send` with `From`, `To`, `Content`, `RegisteredDelivery` (from SDKs, not verified against official docs) [H4] | `POST https://api.mnotify.com/api/sms/quick` with `recipient[]`, `sender` (11 chars or fewer), `message`, `is_schedule`/`schedule_date` [M1] | — |
| **Delivery reports** | **Push**: per-message `callback_url`, HMAC-SHA256 signed, timestamp, secret rotation. Also pull via `/api/v2/sms/{id}` and `/message-reports` [A1] | Request with `RegisteredDelivery`. The callback format is in the gated docs. Reports are in the dashboard [H1][H4] | **Pull only**: `GET /api/status/<id>`, `/campaign/<id>/<status>`, `/report`. No SMS delivery webhook in the spec [M1] | Push |
| **Sandbox** | Yes, free and unlimited [A1] | Not seen publicly | Not seen | Test credentials |
| **Price per SMS (GHS)** | 0.025–0.031 (non-expiring); 0.0219–0.0288 (3-month expiry) [A2] | Per gateway: Hubtel SMS (Ghana, all networks) 0.033; MTN-only 0.0201; Telecel-only 0.0303; AirtelTigo-only 0.0151 [H1] | Not published. Sales/demo only [M2] | US$0.3741 per segment (about 10x+ local) [T2] |
| **OTP** | Dedicated generate/verify API, GHS 0.035 per OTP, USSD fallback, voice option [A1][A2] | OTP / verification product exists (RequestId + prefix + 4-digit code, USSD fallback per search snippets of the gated reference) [H3] | No verify API. `sms_type: "otp"` flag on a normal send costs an extra GHS 0.035 per campaign [M1] | Verify API |
| **Sender ID registration** | Dashboard request, sent to the networks. "A few business days", varies by network [A3] | Dashboard. Process and lead time not published | Dashboard or `POST /api/senderid/register` (`sender_name`, `purpose`), plus `/api/senderid/status`. Lead time not published [M1][M3] | 2 weeks domestic, 3 weeks international pre-registration [T1] |
| **Also does payments?** | No (SMS, voice, OTP, USSD, WhatsApp, email) [A2] | **Yes**: Online Checkout (`POST https://payproxyapi.hubtel.com/items/initiate`; MoMo, card, GHQR, Hubtel wallet; `callbackUrl` / `returnUrl`), Receive Money, transfers [H2][H5] | No | No |

## Sender ID rules in Ghana

- **Register an alphanumeric sender ID (for example `EMBLISH`) before launch, and treat it as being on the critical path.** MTN requires registration and does not allow dynamic alphanumeric sender IDs. Twilio states that from **8 July 2026** messages with unregistered sender IDs to these networks are blocked [T1]. That date has now passed, so unregistered sends to MTN subscribers will fail. MTN has the largest subscriber base.
- **The networks approve sender IDs, not the NCA.** Arkesel describes approval as an operator step, not a government registration [A3]. The NCA's Amended UEC Code of Conduct (2016) does not run a sender-ID registry. It requires accurate sender information on commercial messages, and requires transactional messages to show the service provider's name or a dedicated short code [N1 §14].
- **Format**: 3–11 alphanumeric characters with at least one letter. Do not use another brand's name or a generic word [A3][T1][AWS1]. Expect to provide a company name, website and address, a use-case description and sample messages [AWS1].
- **Lead time** ranges from "a few business days" (Arkesel's own claim) [A3] to 2 weeks for domestic pre-registration [T1]. **Plan for 2 weeks.**
- **Timing rules**: the UEC Code limits *Network Commercial Communications* (promotions) to 8:00 a.m.–7:00 p.m. [N1 §19.2.3]. Emblish's receipts, invoices and pickup notices are transactional (billing feedback / service information [N1 §7.2.1]), so they are not under the promotional window. Any future marketing SMS needs opt-in consent and must respect that window [N1 §11–13, §19].

## Caveats

1. **Payment links inside SMS.** Some carriers filter link shorteners. Use full-domain links (for example `https://emblish.com/i/…`), not `bit.ly`. A link pushes most invoice messages past 160 GSM-7 characters, so budget about 2 segments per invoice SMS. Non-GSM characters (for example the `₵` sign or emoji) switch to UCS-2 at 70 characters per segment, so write `GHS`.
2. **Hubtel's docs could not be checked.** The developer portal and `dev-docs.hubtel.com` need a login [H3][H5]. If Hubtel wins the payments ticket, re-check its SMS delivery-callback contract with a business account before choosing it for SMS too.
3. **Arkesel price tiers are prepaid credits.** Buy non-expiring credits at our likely volume, and top up so a balance of zero never blocks a Shipping Fee Invoice. Arkesel exposes `/api/v2/clients/balance-details` [A1]. A Convex cron can alert Staff when the balance is low.
4. **Webhook verification.** Arkesel signs the canonical JSON of the callback's *query parameters* with PHP-style escaping. Port the provided Node example exactly into the Convex HTTP action, and reject timestamps older than 5 minutes [A1].
5. **Vendor lock-in is low.** Every vendor here has the same send shape (sender, recipients, text). Keep provider-specific code in one Convex module.
6. **Pricing is a point-in-time snapshot** (October 2026) and is not contractual.

## Sources

- [A1] Arkesel API reference, OpenAPI spec v2.4.0: https://developers.arkesel.com/ (spec file `https://developers.arkesel.com/spec/api_spec.v2.4.0.yaml`). Covers SMS v2 send, delivery webhook, webhook signature verification, sandbox, OTP generate/verify, balance, and the 11-character sender limit.
- [A2] Arkesel pricing (Ghana): https://arkesel.com/pricing
- [A3] Arkesel, "How to Send Bulk SMS with Your Sender ID": https://arkesel.com/how-to-send-bulk-sms-with-your-sender-id/
- [H1] Hubtel SMS product page with the gateway pricing table: https://hubtel.com/consumer/sms
- [H2] Hubtel developer portal landing (products: receive MoMo and card, transfers, bills, verification, SMS tracking): https://developers.hubtel.com/
- [H3] Hubtel developer docs routes (`/docs/business/*`) redirect to `/login` (checked from the portal's JS bundle). Search snippets of the gated reference describe the OTP flow.
- [H4] Hubtel API authentication page (Basic auth with Client ID/Secret): https://businessdocs-developers.hubtel.com/docs/authentication (host no longer resolves). Send-field names come from community SDKs such as https://github.com/hubtel/hubtel-sms-csharp
- [H5] Hubtel Online Checkout API reference: https://dev-docs.hubtel.com/frontend/tools-and-sdks/checkout/api-reference.html (login-gated portal)
- [M1] mNotify / BMS API v2.0 OpenAPI: https://developer.bms.africa/ (spec `openapi14.yaml`, mirrored at https://readthedocs.mnotify.com/)
- [M2] mNotify pricing page (no rates, contact sales): https://www.mnotify.com/pricing
- [M3] mNotify help, "How to register a Sender ID": https://mnotify.tawk.help/article/new-how-to-register-a-sender-id
- [N1] NCA, Amended Unsolicited Electronic Communications Code of Conduct (Nov 2016): https://nca.org.gh/wp-content/uploads/2021/11/Amended-UEC-Code-of-Conduct2.pdf
- [T1] Twilio, Ghana SMS guidelines (MTN registration, 8 July 2026 blocking date, provisioning times): https://www.twilio.com/en-us/guidelines/gh/sms
- [T2] Twilio SMS pricing, Ghana: https://www.twilio.com/en-us/sms/pricing/gh
- [AWS1] AWS End User Messaging, Ghana sender ID registration fields: https://docs.aws.amazon.com/end-user-messaging/latest/userguide/nx-country-reg-gh.html
