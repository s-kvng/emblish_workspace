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

## Catalog

**Pre-order Product**:
A product listed for ordering before the company has imported it.
_Avoid_: Upcoming product, backorder

**In-stock Product**:
A product the company already holds in its warehouse or shop and can sell immediately.
_Avoid_: Available product, ready product

## Pre-order lifecycle

**Pre-order**:
A customer's order for a Pre-order Product within one Order Window, settled in two payments: the Item Payment and the Shipping Fee. A Pre-order exists only once its Item Payment has succeeded; an unpaid checkout is not a Pre-order. One checkout may create several Pre-orders, one per Order Window.
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
The charge for delivering arrived goods to a customer who chose Delivery; billed on the Shipping Fee Invoice when already known, otherwise on its own invoice.
_Avoid_: Courier fee, dispatch fee

**Minimum Order Quantity**:
The fewest units of a Pre-order Product a single Pre-order may contain; optional, set per product.
_Avoid_: MOQ (in customer-facing text), minimum batch

**Shipping Fee Invoice**:
The request sent to a customer to pay the Shipping Fee.
_Avoid_: Shipping bill, balance invoice

**Receipt**:
The confirmation a customer receives after a payment succeeds. An invoice requests money not yet paid; a Receipt confirms money received.
_Avoid_: Invoice (for a payment already made), proof of payment

**Forfeit**:
Staff ending a Pre-order whose Shipping Fee Invoice has gone unpaid long past its due date; the goods are released to stock and the Item Payment is not automatically refunded.
_Avoid_: Abandon, expire, write off

**Shortfall**:
Units ordered in an Order Window that never arrive; the affected Pre-orders are refunded for the missing units, earliest-placed Pre-orders being filled first.
_Avoid_: Backorder, missing stock

**Fulfilment Method**:
How the customer receives arrived goods: Pickup or Delivery.
_Avoid_: Shipping option, collection mode
