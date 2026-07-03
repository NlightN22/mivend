# Pricing architecture

How a price is determined, from ERP import to catalog display to the price actually
charged on an order.

---

## Entities involved

| Entity                     | Plugin                    | Purpose                                                          |
| -------------------------- | ------------------------- | ---------------------------------------------------------------- |
| `PriceType`                | `plugin-customer-pricing` | Named price tier (e.g. `WHOLESALE`, `RETAIL`)                    |
| `CustomerPriceType`        | `plugin-customer-pricing` | Customer → `PriceType` assignment (one active row per customer)  |
| `ProductVariantPriceEntry` | `plugin-price-entry`      | `variantId × priceTypeCode → price` — the base price             |
| `DiscountRule`             | `plugin-price-entry`      | Facet + time-window percentage discount on top of the base price |
| `Counterparty`             | `plugin-counterparty`     | Legal entity; carries the `priceType` string from the ERP        |

There is **no** concept of a public retail price shown in the storefront. Every price
shown or charged is resolved per customer via their assigned `PriceType`.

---

## How a customer gets a price type

```
ERP counterparty record (priceType: "WHOLESALE")
    → erp-import: CustomerCounterpartyHandler.assign()
    → CounterpartyService.setCustomerCounterparty()
        → CounterpartyService.assignPriceType()
        → CustomerPricingService.assignCustomerPriceTypeByCode(ctx, customerId, "WHOLESALE")
            → upsertPriceType(code, code)      // creates PriceType row if missing
            → setCustomerPriceType(customerId, priceType.id)  // upserts CustomerPriceType
```

`CustomerPricingService` is exported from `@mivend/plugin-customer-pricing` and injected
directly into `CounterpartyService` (`packages/plugins/counterparty/src/counterparty.service.ts`) —
standard NestJS plugin-to-plugin dependency, not an event.

**History:** this used to write to a Vendure `CustomerGroup` named after the price type
(`CustomerGroupService`). Nothing else in the codebase ever read that group — it was
dead-end plumbing, and the real lookup below always resolved to `null` for every
ERP-imported customer. Fixed in July 2026; if you see references to `CustomerGroup` and
pricing in old code or docs, they're stale.

---

## How a price is resolved (catalog display AND real orders)

Single entrypoint, used everywhere a price is needed:

```
PriceResolutionService.resolve(ctx, variantId)
  packages/plugins/price-entry/src/price-resolution.service.ts

1. priceTypeCode = PriceEntryService.getPriceTypeCodeForUser(ctx)
   — raw SQL join: customer_price_type → price_type, keyed by ctx.activeUserId
   — null if the customer has no assigned price type (or is a guest)
   → if null: { customerPrice: null, compareAtPrice: null }

2. basePrice = PriceEntryService.getForVariant(ctx, variantId, priceTypeCode)
   — reads ProductVariantPriceEntry
   → if no PriceEntry row exists for this variant+priceType: both null

3. facetValues = merge(ProductVariant.facetValues, Product.facetValues)
   — erp-import's ProductHandler assigns brand/category facets to the PRODUCT,
     not the variant, so both levels must be checked or matching silently misses
     everything (this was a real bug during development — verify with both
     relations loaded if debugging "discount doesn't apply")

4. percent = DiscountRuleService.getBestDiscountPercent(ctx, priceTypeCode, facetValues, now)
   — SQL-level filter: priceTypeCode matches, validFrom <= now <= validTo
   — in-memory filter: facetCode/facetValueCode matches one of the variant's facet
     values, OR the rule is global (facetCode/facetValueCode both null)
   — returns the MAXIMUM percent among all matching rules (no stacking)

5. if percent is null:  { customerPrice: basePrice, compareAtPrice: null }
   else:                { customerPrice: round(basePrice * (1 - percent/100)),
                          compareAtPrice: basePrice }
```

`compareAtPrice` is only ever non-null when a discount is actually active — the
storefront must never show a strikethrough price otherwise (see ui-kit rule below).

### Where `resolve()` is called from

| Call site                                          | Query path                                                     | File                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `ProductVariant.customerPrice` / `.compareAtPrice` | raw `products`/`product` GraphQL queries (product detail page) | `packages/plugins/price-entry/src/price-entry.resolver.ts`             |
| `SearchResult.customerPrice` / `.compareAtPrice`   | Elasticsearch-backed `search` query (catalog grid/list)        | `packages/plugins/search/src/search.resolver.ts` + `search.service.ts` |
| `OrderLine.unitPrice` (the actual charged price)   | `addItemToOrder` / `adjustOrderLine` / address changes         | `apps/server/src/customer-price-calculation.strategy.ts`               |

**Never duplicate the discount-matching logic in a fourth place.** If a new surface
needs a price, call `PriceResolutionService.resolve()`. This is what keeps catalog
display, product page, and the real order total from diverging.

---

## Real order pricing

Vendure's default `OrderItemPriceCalculationStrategy` just uses
`ProductVariant.listPrice` — a single, price-type-agnostic value. Without a custom
strategy, `customerPrice`/`compareAtPrice` would be **catalog-display only**: the
customer would see a wholesale/discounted price in the storefront, but the order itself
— and whatever total reaches 1C — would be priced from the raw ERP import price. This
was a real (now fixed) gap; the fix must be understood before touching pricing again.

`CustomerPriceCalculationStrategy` (`apps/server/src/customer-price-calculation.strategy.ts`)
is registered as `orderOptions.orderItemPriceCalculationStrategy` in
`apps/server/src/vendure-config.ts`. It's invoked by Vendure on `addItemToOrder`,
`adjustOrderLine`, and address changes (see Vendure's `OrderItemPriceCalculationStrategy`
docs for the exact list). It calls `PriceResolutionService.resolve()` and uses
`customerPrice` as the line's unit price, falling back to `productVariant.listPrice`
only when the customer has no resolvable price (guest, or no `PriceEntry` for their
price type).

Follows the same `init(injector)` pattern as `SequentialOrderCodeStrategy`
(`apps/server/src/order-code.strategy.ts`) — both are plain classes instantiated with
`new` in `vendure-config.ts`, not NestJS-managed providers, so they pull their
dependencies from the `Injector` passed to `init()`.

---

## ERP import

Discount rules are pushed the same way as everything else — via the `erp-import`
REST batch endpoint (`POST /erp/import/batch`), record `type: "discountRule"`
(`packages/plugins/erp-import/src/handlers/discount-rule.handler.ts`). Unlike
`price.handler.ts` (which uses raw SQL against `product_variant_price_entry` because
that table belongs to another plugin it doesn't want a hard TS dependency on),
`discount-rule.handler.ts` imports `DiscountRuleService` from `@mivend/plugin-price-entry`
directly — `erp-import` already depends on `plugin-price-entry` for other reasons, so
there's no reason not to use the real service.

`DiscountRule.erpId` is the natural upsert key (not the facet/period combination) —
rules can be edited or reissued from the ERP with the same identity.

---

## Business rules (do not deviate)

- Discounts are (almost always) scoped to a facet — brand, category, or any other
  facet code. A **global** discount (both `facetCode`/`facetValueCode` null) exists but
  is rare; it applies to every variant for that price type.
- If a variant matches multiple active rules, the **highest percent wins**. No stacking.
- Discount periods (`validFrom`/`validTo`) are **always fully bounded** — the business
  never runs open-ended discounts, and 1C currently caps periods at ~3 months. Periods
  for the same facet/price-type combination don't overlap in practice.
- "Now" for period matching is server time at the moment of resolution — a catalog
  browse and an order placement can reasonably see different results if a period
  boundary passes between them; this is expected, not a bug.
- `compareAtPrice` is `null` whenever no discount is active — **never** show a
  strikethrough price otherwise. `MvProductCard`/`MvProductRow` (ui-kit) used to always
  strike through the raw retail `price` whenever `customerPrice` was present, regardless
  of any real discount — that was a bug (fixed alongside `DiscountRule`), not a design
  choice; don't reintroduce it.
- `compareAtPrice` must **never** be `variant.price` (Vendure's built-in field) — it
  always comes from `PriceEntry`, only when `DiscountRule` actually reduced it.

---

## Known gap: volume/weight-tiered discounts (not built)

The business also has discounts scaled by the **purchase weight** of a facet-scoped
product group in a single order — e.g. 15% at 500kg, 18% at 800kg, 20% at 1000kg of a
given brand. This is fundamentally different from the facet+period discount above: it
depends on the quantity/weight the customer is actually buying, which isn't known while
browsing the catalog — it can only be computed at order time, across all matching order
lines.

Agreed design (not implemented):

- Extend `DiscountRule` with a nullable `minWeightKg` column. Flat facet+period rules
  keep it `null`; a volume tier sets it. Both live in the same table/matching pipeline.
- Add a `weight` custom field to `ProductVariant` — the data already exists in 1C, it
  just isn't sent through `erp-import`'s `ProductRecord`/`product.handler.ts` yet.
- Compute the tier **inside** `CustomerPriceCalculationStrategy`, since it already
  receives the current `Order` (existing lines) and the `quantity` being added — sum
  `quantity × variant.weight` across all order lines matching the rule's facet, find the
  highest threshold met, and compare its percent against the flat discount's percent.
  Mutually exclusive with the flat discount — **highest percent wins**, matching the
  same rule as facet+period discounts.
- UX (agreed, not built): no live "buy N more kg for a better price" calculator in the
  cart — just a static promo block in the cart, and a temporary corner toast when adding
  a qualifying item to the cart from the catalog.
- Vendure has a native Promotions engine (`has-facet-values-condition` +
  `facet-values-percentage-discount-action` in `@vendure/core`) that's close to this
  shape but operates on `OrderLine.quantity` (piece count), not weight — not reused
  directly, but worth knowing it exists if the custom-strategy approach above turns out
  to be insufficient.
