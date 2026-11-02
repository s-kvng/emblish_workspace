# Tax and VAT on Receipts in Ghana

Research for issue #22 (parent map: #1). Researched 2026-11-02 against the Value Added Tax Act, 2025 (Act 1151), the GRA's implementing guideline for it, GRA's VAT and E-VAT pages, and the Ministry of Finance 2026 Budget Speech. Ghana's VAT law was rewritten with effect from 1 January 2026, so anything written before then (including most blog posts and the older GRA pages) is out of date. This is research, not tax advice: an accountant should confirm the points marked below before launch.

## Recommendation

**Build Receipts and invoices without tax lines for launch, but design for them, and confirm Emblish's VAT status with the Owner (and their accountant) before go-live.**

- **If Emblish is not VAT-registered** (the likely case for a small goods retailer turning over less than GHS 750,000 a year), it must **not** charge, show or mention VAT, NHIL or GETFund on Receipts or invoices. Tax shown on an invoice is recoverable from whoever issued it, registered or not. [A1 s.64, s.62] A plain Receipt with no tax lines is correct. There is no longer a flat-rate scheme to opt into. [G1][A2 §15.2]
- **If Emblish is (or becomes) VAT-registered**, every taxable payment needs a GRA **tax invoice issued through a Certified Invoicing System (E-VAT)** with VAT 15%, NHIL 2.5% and GETFund 2.5% on separate lines plus a total-tax field. A Receipt that the Storefront renders by itself does not meet that requirement. The tax document has to come from GRA's system, either through API integration or GRA's free invoicing app. Prices must be advertised tax-inclusive (effective 20%) and say so. [A1 s.43, s.68][G1][G3]
- **So the data model should leave room for tax**: a per-payment tax breakdown (taxable value, NHIL, GETFund, VAT, total tax), and a slot for the GRA E-VAT invoice reference / QR payload. These can stay empty while Emblish is unregistered. Building the GRA integration now is not justified unless the Owner says Emblish is registered.
- **The Shipping Fee and Delivery Fee follow the goods.** Services incidental to a supply of goods are part of that supply [A1 s.31(1)(a)], so if Emblish is registered they carry the same 20%, and they count toward the GHS 750,000 goods threshold. Import freight is not zero-rated; only export freight is. [A1 Second Schedule]
- **The one trap is the service threshold.** Act 1151 has **no turnover threshold for services**: anyone making taxable supplies of services must register within 30 days. [A1 s.6(1)(a)][A2 §7.1] If GRA (or Emblish's accountant) saw delivery, or the import arrangement, as a separate service rather than part of selling goods, Emblish would have to register regardless of size. The current model has the company buying goods from the supplier and selling them on (GLOSSARY: Order Window), which supports the "goods" reading. An accountant must confirm this.

## Current rates (from 1 January 2026)

| Charge | Rate | Base | Status | Source |
|---|---|---|---|---|
| VAT | 15% | Taxable value (price excluding VAT, NHIL, GETFund) | In force | [A1 s.3, s.44(1)][A2 §5–6] |
| NHIL (National Health Insurance Levy) | 2.5% | Same taxable value as VAT | In force; now deductible as input tax | [G1][G2][S2] |
| GETFund Levy | 2.5% | Same taxable value as VAT | In force; now deductible as input tax | [G1][G2][S2] |
| COVID-19 Health Recovery Levy | was 1% | n/a | **Abolished**: Act 1068 repealed by Act 1150, assented 10 Dec 2025, levy ceased from 1 Jan 2026 | [L1][G1][A2 §15.6] |
| VAT Flat Rate Scheme (3% for retailers) | was 3% | n/a | **Abolished** from 1 Jan 2026 | [G1][G2][A2 §15.2] |
| **Effective total** | **20%** | | Down from about 21.9% under the old cascading model | [G1][G2] |

Worked example (GRA's own): a supply worth GHS 1,000 carries GHS 50 NHIL + GETFund and GHS 150 VAT, so it totals GHS 1,200. The same item cost GHS 1,219 before the reform, when the levies (including COVID) were added to the price before VAT was charged on top. [G1] GRA's implementing guideline gives the same shape: GHS 100,000 + 5,000 levies + 15,000 VAT = 120,000. [A2 §6]

To back tax out of a **tax-inclusive** price: taxable value = price ÷ 1.20; NHIL = GETFund = 2.5% of that; VAT = 15% of that; total tax = price × 1/6. For example, GHS 120.00 inclusive = 100.00 value + 2.50 NHIL + 2.50 GETFund + 15.00 VAT. (Arithmetic follows from [A1 s.3, s.44(1)] and [A2 §6]; rounding rules are not specified.)

These match the 2026 Budget Speech (13 Nov 2025), which also announced Fiscal Electronic Devices (FEDs) and a VAT receipt reward scheme. [B1 ¶204, ¶222]

Pending or uncertain: according to a secondary summary, the 2026 mid-year review reported no further VAT rate or threshold changes. It said FEDs are being rolled out and formal regulations under Act 1151 are expected in 2027. [S3] I could not read the official mid-year document [B2] (a 38 MB PDF that would not download). No VAT regulations under Act 1151 had been found as of this research; the old Act 870 regulations (LI 2243) continue where consistent. [A1 s.73(2)] Re-check before launch, and again after the 2027 budget (normally presented in November).

## Registration threshold and what applies below it

- **Goods: GHS 750,000** of taxable supplies in any 12 months or less, or reasonable grounds at a month-end to expect more than that in the next 12 months. This was raised from GHS 200,000. [A1 s.6(1)(b)][G1][G2] There is also a 3-month test (more than GHS 187,500 in 3 months plus an expectation of more than GHS 750,000 over the year) [A1 s.6(2)], and GRA's guideline adds pro-rata markers of GHS 375,000 per 6 months and GHS 62,500 per month. [A2 §7.2] The application is due within 30 days of crossing [A1 s.6(5)–(6)], and the person becomes taxable from the start of the next tax period (a month). [A1 s.8]
- **Services: no threshold.** Register within 30 days of starting. Service providers below the old threshold had to register within 30 days of 1 Jan 2026. [A1 s.6(1)(a)][A2 §7.1]
- **Related businesses are aggregated**: GRA may count supplies of a related person, or one acting in concert. [A1 s.6(3)]
- **Voluntary registration** is allowed. Once registered voluntarily, a business cannot deregister for 2 years. [A1 s.13, s.20(8)]
- **Penalty for not registering when required**: at least 3× the tax on taxable supplies from when registration was due. [A1 s.16]
- **Below the threshold there is no reduced VAT scheme any more.** The 3% flat rate for retailers is gone. Flat-rate taxpayers over GHS 750,000 were converted to the standard rate. VAT-registered individuals under the threshold are to be verified, deregistered, and moved to the **Modified Taxation System**. That is an income-tax regime, outside this question. They keep charging VAT and filing until GRA deregisters them. [G1][A2 §15.1–15.4, §15.9]
- **Imports by an unregistered importer**: Act 1151 adds a 20% "upfront payment" on customs value for unregistered importers [A1 s.17]. GRA applies it only where the import VAT base on a single Bill of Entry exceeds GHS 750,000 [A2 §9.1–9.3], so it should not hit Emblish's Order Window shipments. Import VAT and levies at customs still apply, and an unregistered business cannot reclaim them; they become part of the cost that the Shipping Fee recovers.

## E-VAT / electronic invoicing

- **The law requires it of every VAT-registered (taxable) person.** "A taxable person shall issue a tax invoice through a Certified Invoicing System" integrated with GRA's system, from Act 1151's commencement "except as otherwise directed by the Commissioner-General". [A1 s.43(2), s.43(13)] A "tax invoice" is defined as an electronic invoice from a Certified Invoicing System, or another invoice the Commissioner-General approves. [A1 s.72 "tax invoice"] A fiscal receipt from a Fiscal Electronic Device under Act 966 also satisfies it. [A1 s.43(9)]
- **In practice GRA onboards in phases.** Taxpayers "may be selected, may request or may be onboarded at the point of application for VAT registration". GRA then chooses API integration (GRA supplies API docs, then testing and sign-off; about 1 month) or its free invoicing software (web, desktop, Android; about 2 weeks). [G3 §9–10, §16] GRA's 2024 phase-two notice onboarded a further 2,000 named taxpayers [G5]. GRA's E-VAT page offers the system free to any VAT-registered business that asks. [G4] I found no 2026 GRA notice setting a universal go-live date, so a newly registered business should expect to be onboarded at registration.
- **Size does not exempt a registered business**, but **an unregistered business is outside E-VAT altogether**. It has no tax invoices to issue.
- **Penalties** (registered persons): failing to issue a tax invoice or sales receipt is an offence (up to 100 penalty units and/or 6 months). Not issuing through the Certified Invoicing System, not integrating it, or not reconnecting it within 24 hours of an outage adds a penalty of up to 50,000 currency points or 3× the tax, whichever is higher. [A1 s.43(10), s.66]
- **What a tax invoice or sales receipt must contain** (GRA's E-VAT guideline, written under the old Act but saved by Act 1151 s.73(2) where consistent): supplier name, address and TIN (Ghana Card PIN); date and time; consecutive number; customer name, address and TIN (optional on a sales receipt, but without it the buyer cannot claim input tax); description, quantity and unit; transaction type (sale, etc.); each levy's rate and amount; tax-exclusive charge per line; VAT rate; total excluding tax; discount rate; total tax; total including tax. E-VAT adds a QR code, invoice signature, verification engine ID, encrypted data and a timestamp. [G3 §7–8] Sales receipts may be sent by SMS or email. [G3 §8] The COVID-19 levy field is now ignored. [A2 §15.6] GRA's VAT page says computer-generated invoices and receipts must show NHIL, GETFund and VAT on separate lines, with the total of the three as a mandatory field. [G1]
- **Refunds and cancellations** on E-VAT: cancel the original invoice and issue a new one. If the VAT return for the period has already been filed, a tax debit/credit note is also needed. [G3 §12.1] This matters for Shortfall refunds.

## Tax-inclusive prices

- **Registered businesses must advertise or quote prices including tax and say so**, or show the tax amount or tax-inclusive price as prominently as the ex-tax price. [A1 s.68(1)–(2)] A prominent notice where payment happens can stand in for per-item labels. [A1 s.68(3)] For a Storefront that means showing 20%-inclusive prices with a "prices include VAT, NHIL and GETFund" note at checkout.
- **Unregistered businesses** fall outside s.68 because they charge no tax. They must not label prices "VAT inclusive" or itemise tax. [A1 s.62(1)(b), s.64]

## How this maps onto Emblish

- **Vocabulary clash**: GRA's "tax invoice" is issued when a supply is made or paid for, which in Emblish terms is the **Receipt**. Emblish's Shipping Fee Invoice and Delivery Fee Invoice are requests for payment and are not tax documents. If Emblish registers, the GRA tax invoice belongs on the payment / Receipt side.
- **Time of supply = payment** for prepaid goods: the earliest of goods removed or made available, payment received, or invoice issued. Each payment counts as a separate supply to the extent of that payment. [A1 s.39(1)(c), s.39(2), s.39(6)] If registered, VAT on a Pre-order falls due on the **Item Payment** when it succeeds, months before the goods arrive. The Shipping Fee and Delivery Fee then each attract VAT when paid. One tax invoice per payment fits "one Receipt per payment" and the one-invoice-per-supply rule. [A1 s.43(7)] An accountant should confirm the treatment of incidental charges paid later, since s.39(8) ties an incidental supply's time to the main supply.
- **Forfeit**: a retained deposit is treated as a supply when forfeited [A1 s.28(1)], and a retained lay-away payment is a supply of services. [A1 s.24] The glossary deliberately says the Item Payment is not a deposit, but if registered, the VAT on it was already due at payment. Forfeits and Shortfall refunds would need E-VAT cancellations or credit notes.
- **Shipping Fee / Delivery Fee**: these are part of the supply of goods [A1 s.31(1)(a)], taxed at the same rate, with no zero-rating. Only freight that is "directly attributable to the export of goods" is zero-rated. [A1 Second Schedule] Billing them separately does not make them separate supplies; s.25 splits a supply only where part of it is zero-rated or exempt.
- **Paystack** is irrelevant to the tax document. It confirms payment, but the tax invoice has to come from the Certified Invoicing System.

## What the Owner / an accountant must confirm

1. Is Emblish (the legal entity, or the Owner as a sole trader) registered for VAT today, including under the old flat-rate scheme, which leaves it registered until GRA deregisters it? What is its TIN? [A2 §15.1, §15.4]
2. What turnover does it expect across Pre-orders and In-stock sales, including Shipping and Delivery Fees, and any related business of the Owner's? Could it approach GHS 750,000 a year, or GHS 187,500 in a quarter? [A1 s.6]
3. Does anything Emblish sells count as a **service** rather than goods? Examples: delivery done as a standalone courier service, or acting as the customer's import agent rather than buying and reselling. Services have no threshold. [A1 s.6(1)(a)]
4. Who is the importer of record on Order Window shipments (Emblish or a freight consolidator), and how are import VAT and levies paid and recovered through the Shipping Fee?
5. If registered: E-VAT onboarding route (API integration vs GRA's free app), and whether GRA would authorise sales receipts by email/SMS instead of full tax invoices. [A1 s.43(5)][G3 §8]
6. Rounding rules for tax lines, and the VAT treatment of Forfeits and partial Shortfall refunds.

## Sources

- [A1] Value Added Tax Act, 2025 (Act 1151), assented 9 Dec 2025, in force 1 Jan 2026 (s.75); repeals Act 870 and its amendments (s.73). Full text via the World Bank African Tax Legislation Atlas (no official PDF found on gra.gov.gh or parliament.gh): https://www.a-tla.org/ghana/value-added-tax-act-2025-act-1151 (PDF: https://www.a-tla.org/sites/default/files/2026-03/Ghana%20-%20Value%20Added%20Tax%20Act%2C%202025%20-%20%28ACT%201151%29%20CC.pdf). Sections used: 3, 6, 8, 13, 16, 17, 20, 24, 25, 28, 31, 39, 43, 44, 62, 64, 66, 68, 72 (interpretation), 73, 75, Second Schedule.
- [A2] GRA, *Guidelines for the Implementation of the Value Added Tax Act, 2025 (Act 1151)*, signed 31 Dec 2025: https://gra.gov.gh/wp-content/uploads/2026/01/VAT-Guidelines-for-VAT-ACT-1151.pdf
- [G1] GRA, VAT page (reforms under Act 1151, invoice line requirements, worked example): https://gra.gov.gh/domestic-tax/tax-types/vat/
- [G2] GRA, Notice to All VAT Registered Taxpayers (effective 1 Jan 2026; threshold, COVID levy, flat rate, NHIL/GETFund recoupling, 20%): https://gra.gov.gh/news/portfolio/notice-to-all-vat-registered-taxpayers/
- [G3] GRA, *Guidelines on Certified Invoicing System (E-VAT)*, GRA/AG/2024/005, 18 Jun 2024: https://gra.gov.gh/wp-content/uploads/2024/07/E-VAT-GUIDELINES_20240222.pdf
- [G4] GRA, E-VAT page: https://gra.gov.gh/e-services/e-vat/
- [G5] GRA, Implementation of Electronic Invoicing of VAT, Phase Two (4 Sep 2024): https://gra.gov.gh/implementation-of-electronic-invoicing-of-value-added-tax-phase-two/
- [L1] COVID-19 Health Recovery Levy (Repeal) Act, 2025 (Act 1150), assented and commenced 10 Dec 2025: https://www.judy.legal/legislation/akn/gh/act/2025/1150
- [B1] Ministry of Finance, 2026 Budget Statement and Speech (13 Nov 2025): https://mofep.gov.gh/sites/default/files/budget-statements/2026-Budget-Statement-and-Economic-Policy.pdf, https://mofep.gov.gh/sites/default/files/budget-statements/2026-Budget-Speech.pdf
- [B2] Ministry of Finance, 2026 Mid-Year Fiscal Policy Review (not read: the download failed; see [S3]): https://mofep.gov.gh/sites/default/files/budget-statements/2026-Mid-Year-Fiscal-Policy-Review-Speech.pdf
- Secondary, used only to cross-check:
  - [S1] Graphic Online, GRA notice coverage (30 Dec 2025): https://www.graphic.com.gh/business/business-news/gra-announces-overhaul-vat-rate-cut-flat-rate-scheme-scrapped-covid-levy-abolished-from-jan-1.html
  - [S2] EY Global Tax News, 12 Jan 2026 (names the GETFund (Amendment) Act, 2025 and National Health Insurance (Amendment) Act, 2025, which made the levies deductible): https://taxnews.ey.com/news/2026-0163-ghanas-parliament-enacts-several-indirect-tax-related-laws-effective-1-january-2026
  - [S3] VATupdate summary of the 2026 mid-year review (20 Aug 2026): https://www.vatupdate.com/2026/08/20/ghana-presents-2026-mid-year-fiscal-policy-review-to-parliament/
