# Emblish

A pre-order commerce business: customers order goods before the company imports them, pay for the goods up front, and pay a shipping fee once the goods arrive. Some goods are also sold from stock.

## Channels

**Storefront**:
The customer-facing website where products are browsed, ordered and paid for.
_Avoid_: Shop, site, web app

**Back Office**:
The staff-only mobile app used to manage the catalog and inventory.
_Avoid_: Admin app, mobile app, dashboard

**Staff**:
A person working for the company who uses the Back Office.
_Avoid_: Admin, user, employee

**Owner**:
A Staff member who may also send money out (refunds, Forfeits), set standing prices and Delivery Zone fees, and invite, deactivate or change the roles of other Staff. There is always at least one active Owner.
_Avoid_: Admin, superuser, manager

**Customer**:
A person who buys on the Storefront, identified by a verified phone number. A Customer comes into being on their first verified checkout; there is no separate sign-up.
_Avoid_: User, account, guest, buyer

## Catalog

**Product**:
A thing the company sells, listed in the Back Office and shown on the Storefront. The same Product can be offered for Pre-order, In-stock, or both at once.
_Avoid_: Item, listing, SKU

**Variant**:
One purchasable version of a Product, distinguished by its options (such as size or colour), with its own SKU. Every Product has at least one Variant; stock, prices and order lines always refer to a Variant.
_Avoid_: Option, model, SKU (for the whole Product)

**Category**:
A group used to browse Products on the Storefront. Categories form a flat list; each Product belongs to exactly one.
_Avoid_: Collection, department, tag

**Pre-order Product**:
A Product while it has an open Order Window, i.e. while it is being offered for ordering before the company has imported it.
_Avoid_: Upcoming product, backorder

**In-stock Product**:
A Product while any of its Variants has Stock, i.e. while it can be bought immediately.
_Avoid_: Available product, ready product

**Store Price**:
The price at which a Variant is sold In-stock, set independently of any Order Window's Pre-order price.
_Avoid_: Retail price, shelf price, regular price

## Inventory

**Stock**:
The sellable units of a Variant the company holds, counted as one pool regardless of where they physically sit. Units allocated to Pre-orders are never Stock.
_Avoid_: Inventory (for the count), on-hand, warehouse stock, shop stock

**Stock Movement**:
A recorded change to a Variant's Stock, with its kind, quantity, who made it and why. Stock is the sum of its Stock Movements; it is never edited directly.
_Avoid_: Stock change, transaction, log entry

**Adjustment**:
A Stock Movement made by Staff to bring Stock in line with reality, such as a recount, damage or loss; it always carries a reason.
_Avoid_: Correction, write-off, stock edit

**Stock Hold**:
Units of Stock set aside for an In-stock checkout while it awaits payment; it becomes a sale on payment and lapses if the checkout expires.
_Avoid_: Reservation, lock, cart hold

**Store Quantity**:
Units of a Variant that Staff add to an Order Window's supplier order to sell from Stock rather than to fill Pre-orders.
_Avoid_: Extras, buffer stock, spare units

**Surplus**:
Units of an Order Window's arrival left over after its Pre-orders and Store Quantity are filled, plus any that turn up after the arrival is recorded; they go into Stock.
_Avoid_: Overage, extra stock, leftovers

## Pre-order lifecycle

**Pre-order**:
A customer's order for a Pre-order Product within one Order Window, settled in two payments: the Item Payment and the Shipping Fee. A Pre-order exists only once its Item Payment has succeeded; an unpaid Checkout is not a Pre-order. One Checkout may create several Pre-orders, one per Order Window.
_Avoid_: Reservation, booking

**Order Window**:
A period during which a Pre-order Product takes Pre-orders. When it closes, everything ordered in it is bought from the supplier together and arrives together, and Staff report its progress (stage and expected timeframe) to every customer who ordered in it. A Pre-order Product can have many Order Windows over time, one open at a time.
_Avoid_: Batch, import batch, drop, campaign

**Item Payment**:
The first payment on a Pre-order, covering the full price of the goods.
_Avoid_: Deposit, down payment, first payment, pre-order fee

**Shipping Fee**:
The second payment on a Pre-order, charged per arrived unit once the goods have arrived. An estimate may be shown when the Pre-order is placed; the amount charged is confirmed by Staff on arrival.
_Avoid_: Top-up, balance, second payment

**Delivery Fee**:
The charge for delivering a Pre-order's or Store Order's goods to a Customer who chose Delivery, set by their Delivery Zone. On a Pre-order it is billed on the Shipping Fee Invoice when already known, otherwise on its own invoice.
_Avoid_: Courier fee, dispatch fee

**Minimum Order Quantity**:
The fewest units of a Pre-order Product a single Pre-order may contain; optional, set per product.
_Avoid_: MOQ (in customer-facing text), minimum batch

**Shipping Fee Invoice**:
The request sent to a customer to pay the Shipping Fee.
_Avoid_: Shipping bill, balance invoice

**Receipt**:
The confirmation a customer receives after a payment succeeds, one per payment, listing what it paid for under each order it covers. An invoice requests money not yet paid; a Receipt confirms money received.
_Avoid_: Invoice (for a payment already made), proof of payment

**Forfeit**:
Staff ending a Pre-order whose Shipping Fee Invoice has gone unpaid long past its due date; the goods are released to stock and the Item Payment is not automatically refunded.
_Avoid_: Abandon, expire, write off

**Shortfall**:
Units ordered in an Order Window that never arrive; the affected Pre-orders are refunded for the missing units, earliest-placed Pre-orders being filled first.
_Avoid_: Backorder, missing stock

## Store sales

**Checkout**:
A Customer's submitted basket awaiting a single payment. It may mix In-stock and Pre-order Variants; when paid it becomes at most one Store Order plus one Pre-order per Order Window, and if unpaid it expires as a whole.
_Avoid_: Cart, basket, payment intent, order

**Store Order**:
A Customer's paid purchase of In-stock Variants, paid in full with no Shipping Fee. One Checkout may create a Store Order alongside Pre-orders; each is fulfilled on its own.
_Avoid_: In-stock order, direct order, purchase

## Fulfilment

**Fulfilment Method**:
How the Customer receives a Pre-order's or Store Order's goods: Pickup or Delivery.
_Avoid_: Shipping option, collection mode

**Pickup Code**:
A short code sent to the Customer by SMS when goods are ready for Pickup, given to Staff at handover to prove the goods are theirs.
_Avoid_: Collection code, OTP, PIN

**Delivery Zone**:
An area the company delivers to, with a flat Delivery Fee set by Staff; "Elsewhere in Ghana" is a zone whose fee Staff quote per order.
_Avoid_: Region, area, delivery band
