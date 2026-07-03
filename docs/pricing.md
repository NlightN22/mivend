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

4. percent = DiscountRuleService.getBestPercent(ctx, priceTypeCode, facetValues, now, weightByFacet)
   — SQL-level filter: priceTypeCode matches, validFrom <= now <= validTo
   — in-memory filter: facetCode/facetValueCode matches one of the variant's facet
     values, OR the rule is global (facetCode/facetValueCode both null)
   — a rule with minWeightKg set also requires weightByFacet to meet the threshold
     (see "Volume/weight-tiered discounts" below) — weightByFacet is empty here for
     catalog display, so tiered rules simply never match at this call site
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

Uses Vendure's `init(injector)` pattern (a plain class instantiated with `new` in
`vendure-config.ts`, not a NestJS-managed provider) to pull `PriceResolutionService`
from the `Injector`. `apps/server/src/order-code.strategy.ts`
(`DateStampedOrderCodeStrategy`) is a sibling strategy in the same file/pattern family,
though it no longer needs `init()` itself — its `code = ORD-YYYYMM-<random hex>` format
needs no DB access at all (see "Do not redo" below for why the previous MAX+1 approach
was replaced).

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

**Built** (weight-based ladder):

- `DiscountRule` has a nullable `minWeightKg` column
  (`packages/plugins/price-entry/src/discount-rule.entity.ts`). Flat facet+period rules
  keep it `null`; a ladder rung sets it. Both share the same table and matching method.
- `ProductVariant` has a `weight` (kg) custom field, declared in
  `apps/server/src/vendure-config.ts` (`customFields.ProductVariant`) and typed via
  module augmentation in `packages/plugins/price-entry/src/types.ts`. Populated by
  `erp-import`'s `ProductRecord.weight` → `product.handler.ts`.
- `DiscountRuleService.getBestPercent(ctx, priceTypeCode, facetValues, now, weightByFacet)`
  — `weightByFacet: Map<'facetCode:valueCode', kg>` is empty for catalog display (no
  order/quantity context, so tiered rules never match there) and populated by
  `PriceResolutionService` when an `orderContext` (`{ order, quantity }`) is passed. A
  rule qualifies if its facet matches AND (`minWeightKg` is null, OR the aggregated
  weight for that facet meets it) — flat and tiered rules are evaluated together, same
  "highest percent wins" reduction, no special-casing.
- `PriceResolutionService.resolve(ctx, variantId, orderContext?)` computes
  `weightByFacet` by summing `quantity × variant.weight` across the variant being priced
  plus every other line already in the order that shares a facet value (skipping the
  line being priced itself if it already exists, to avoid double-counting on
  `adjustOrderLine`).
- `CustomerPriceCalculationStrategy.calculateUnitPrice()` passes `{ order, quantity }` as
  `orderContext` — this is the _only_ call site that does; catalog/product-page/search
  resolvers still call `resolve()` with no order context, so tiers are correctly invisible
  while browsing.

**How rules get created — ERP is a data-loading channel, not the only one.** The
`discountRule` ERP-import record type (`packages/plugins/erp-import/src/handlers/discount-rule.handler.ts`)
exists mainly to make **dev/test seeding** convenient (`infrastructure/scripts/seed-erp.mjs`,
`packages/e2e/fixtures/seed.ts`) — in production, discount rules (flat and weight-tiered
alike) are **not expected to come from the ERP**. The plan is a manager-facing portal
built on Vendure's Admin API, with a multi-step approval workflow (director, department
heads). That portal will call the exact same Admin GraphQL mutations already exposed —
`upsertDiscountRule` / `bulkUpsertDiscountRules` — directly against
`DiscountRuleService`. **No data-layer rework needed** when that portal is built; ERP
import and a future admin portal are two independent writers into the same table.

**Built — sum-based ladder.** Tiers can also be keyed on purchased **amount** (money
spent on a facet-scoped group), not just weight — e.g. "spend 2,000₽ on a facet, get
30% off". `DiscountRule.minAmount` (smallest currency unit, alongside `minWeightKg`) is
the parallel metric; a rule sets **one or the other, never both**. In
`PriceResolutionService.buildAggregates()`, `amountByFacet` sums `quantity × basePrice`
per facet across the priced line and every other matching order line, computed in the
same pass as `weightByFacet` (one query per order line, not two).
`DiscountRuleService.getBestPercent()` takes both maps and picks the highest percent
among all eligible rules — flat, weight-tiered, and amount-tiered together, still one
reduction, no special-casing between the two metrics. `erp-import`'s `DiscountRuleRecord.minAmount`
is a decimal amount (same convention as `PriceRecord.price`), converted to the smallest
currency unit in `discount-rule.handler.ts`. Verified end-to-end via
`packages/e2e/storefront/orders/amount-discount.spec.ts`.

**Built — UX.** No live "buy N more kg for a better price" calculator, as agreed — just:

- A toast on add-to-cart, reusing catalog-level `compareAtPrice`/`customerPrice`
  already fetched by `ProductListView.vue`/`ProductPage.vue` (no backend change — this
  only ever reflects the _flat_ facet+period discount, never a tier, since the catalog
  has no order-quantity context). Wired through
  `useCartActions.onAddToCart(variantId, qty, discountHint?)`
  (`packages/storefront/src/composables/useCartActions.ts`).
- A static promo block in the cart (`CartPromoBanner.vue`,
  `packages/storefront/src/pages/cart/`), which _does_ reflect the real active discount
  including a reached tier — via a new `OrderLine.compareAtPrice` field
  (`OrderLineDiscountResolver` in `price-entry.resolver.ts`) that re-exposes what
  `CustomerPriceCalculationStrategy` already computed for that line's `unitPrice`, using
  the same `PriceResolutionService.resolve(ctx, variantId, { order, quantity })` call —
  zero new pricing logic, just a read-only view of it.
- The toast itself (`MvToast`/`MvToastContainer`/`useToast`) lives in `ui-kit` as a
  general-purpose primitive (queue-based, module-level state, no Pinia dependency) —
  not discount-specific. Mounted once in `App.vue`.
- **Known gap, not fixed here:** `ProductScrollRow.vue`/home-page widgets
  (`useWidgetProducts.ts`) still don't fetch `compareAtPrice` at all (pre-existing,
  noted when `ProductPage.vue` was wired) — the toast won't fire from home-page
  "Add to cart" clicks. Low priority; fix by mirroring the same field addition already
  done for `useProductList.ts`.

Vendure has a native Promotions engine (`has-facet-values-condition` +
`facet-values-percentage-discount-action` in `@vendure/core`) that's close to this shape
but operates on `OrderLine.quantity` (piece count), not weight/amount — not reused here,
since the custom-strategy approach above already covers both metrics without it, but
worth knowing it exists.
