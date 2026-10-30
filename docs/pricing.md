# Pricing architecture

How a price is determined, from ERP import to catalog display to the price actually
charged on an order.

---

## Entities involved

| Entity                     | Plugin                    | Purpose                                                          |
| -------------------------- | ------------------------- | ---------------------------------------------------------------- |
| `PriceType`                | `plugin-customer-pricing` | Named price tier (e.g. `WHOLESALE`, `RETAIL`)                    |
| `CustomerPriceType`        | `plugin-customer-pricing` | Customer → `PriceType` assignment (one active row per customer)  |
| `ProductVariantPriceEntry` | `plugin-price-entry`      | `productExternalId × priceTypeCode → price` — the base price     |
| `DiscountRule`             | `plugin-price-entry`      | Facet + time-window percentage discount on top of the base price |
| `DiscountSetup`            | `plugin-price-entry`      | One ERP discount/markup setup document: recipients, product list |
| `Counterparty`             | `plugin-counterparty`     | Legal entity; carries the `priceType` string from the ERP        |

**Fallback price (issue #70):** a guest, or a customer whose own price can't be resolved, gets the
branch's default `PriceType` (`BranchSettings.defaultPriceTypeId`, see #66) with only
general/all-counterparty discounts applied — never a customer-specific one and never a raw index
price. This replaces the earlier "no price resolved at all" stance; what the storefront _displays_
to a guest is decided separately below.

**Guest display (decided 2026-10-04):** the API still resolves the branch-default price and stock
tier for a guest (`customerPrice`, `stockLevel`), but the storefront UI does NOT show them to a
guest: product cards say "Log in to see prices" and hide the stock tier. The default price is the
branch's retail `PriceType`, so exposing it through the API is accepted, not a leak to close.
Showing guest prices in the UI later is a pure frontend change (the `isLoggedIn` conditions in
`ProductListView.vue`/`ProductScrollRow.vue`/`MvProductCard`).

The default branch and its `BranchSettings` are bootstrapped by `plugin-access-control` (issue
#161): `BOOTSTRAP_BRANCH_NAMES` lists branches to create (the first becomes
`GlobalSettings.defaultBranchId` if empty) and `DEFAULT_PRICE_TYPE_CODE` picks the default price
type by code. Idempotent, never overrides admin-set values. If the price type has not synced yet
there is no default until the next restart (the lookup is retried on every bootstrap).
Branch is mivend's own entity (see docs/access-control.md), never sent by the ERP over Kafka, so
bootstrap-by-name is the source of truth for branches on Kafka-only contours.
The default channel currency is set from `DEFAULT_CURRENCY_CODE` (default `RUB`) by the same plugin; Vendure creates it as USD and `ChannelService.update` re-currencies its variant prices.

---

## Price type visibility and the derived floor (#235)

`PriceType.visibility` (`customer` | `confidential`, default `confidential`) decides who may see a
type; the rules live in `docs/access-control.md` (layer 4, `PriceTypeAccessService`).

**Classifying the customer set is a data step, not code.** After the migration every type is
confidential. Apply `infrastructure/scripts/price-type-visibility.sql` to the contour's database
with the codes of the customer types, for example
`psql -v customer_codes=code-a,code-b -f price-type-visibility.sql`: it marks those types
`customer` (never the purchase type) and fills every still-empty branch allow-list with all
customer types. Types nobody classified stay confidential. The local seed applies it to its
synthetic types.

**The floor is derived, not a price type.** The ERP price-type stream carries `isPurchasePriceType`
(exactly one type) and `ceilingPriceMultiplier` (only on that type); they are stored as
`PriceType.isPurchase` / `ceilingMultiplier` (a partial unique index keeps one purchase type, a new
one takes the flag over). `FloorPriceService.forVariants` = the variant's purchase entry x the
multiplier; without a purchase type, multiplier or entry the floor is unknown and the existing
rule applies (no floor = approval). The floor check and the `floorPrice`/`floorPricesForVariants`
queries use it; the latter need `ReadConfidentialPriceTypes`. A purchase type is never resolved as
a customer's selling price. Re-checking open orders when the floor changes: #256.

## How a customer gets a price type

**Target rule (decided 2026-10-06):** a customer's price type is the price type of their
counterparty's **main contract**. If the main contract cannot be determined, the customer gets
the **branch default** price type (`BranchSettings.defaultPriceTypeId`) — the same fallback a
guest gets (see "How a price is resolved", step 1b). A contract's own name is never used to
guess which one is main: one counterparty can have several contracts named "main", one per
organization.

```
counterparty.mainContractId (ERP: counterparty's main-contract reference)
    → contract (by erpId) → contract.priceTypeId (ERP price type GUID)
        → PriceType (by externalId) → CustomerPriceType(customerId → priceType)
no mainContractId / contract or price type not found  → no CustomerPriceType row
                                                        → branch-default fallback
```

**Current state (implemented, #188):** `Counterparty.mainContractId` is stored and resolved **at
read time** by SQL (`mainContractPriceTypeIdSql` in plugin-customer-pricing, used by
`CustomerPricingService.getCustomerPriceType` and `PriceEntryService`), because counterparty and
contract events arrive in undefined order and a read-time join needs no recompute job. Precedence:
main-contract price type, then an existing `CustomerPriceType` row (manual/legacy assignment), then
the branch default. A missing contract, a contract deactivated in the ERP (`isActive=false`), a
contract without a matching or with an inactive `PriceType`, or no `mainContractId` simply falls
through, silently (no logging). There is no manual way to set a customer's price type: the Admin
API `setCustomerPriceType` mutation was removed; only the legacy `Counterparty.priceType` string
still creates a `CustomerPriceType` row (fallback step). Nothing is written to `CustomerPriceType` by this path.

**Legacy flow (description below is what the old code did, kept for context; the ERP counterparty
stream does not carry `priceType`, so it never fires against real data):**

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
   → if null (or step 2 finds no PriceEntry row): fall through to the
     branch-default fallback (step 1b) instead of returning both null

1b. FALLBACK (#70, when step 1/2 can't resolve the customer's own price):
    branchId = counterparty's own branchId, else GlobalSettings.defaultBranchId
    — in practice this always takes the GlobalSettings.defaultBranchId branch today:
      Counterparty.branchId is never populated (no auto-assignment rule exists yet,
      see docs/access-control.md's "Branch scope" section and issue #65)
    defaultPriceTypeId = BranchSettingsService.resolveEffective(branchId).defaultPriceTypeId
    basePrice = PriceEntryService.getForVariant(ctx, variantId, defaultPriceTypeId)
    percent = DiscountRuleService.getBestPercent(ctx, defaultPriceTypeId, facetValues, now,
              weightByFacet, counterpartyId: null)   — counterpartyId explicitly null,
              so only general/all-counterparty DiscountRules can match here, never one
              scoped to a specific customer
    → only if this ALSO fails to resolve (e.g. empty bootstrap, no BranchSettings yet)
      does resolve() return { customerPrice: null, compareAtPrice: null }

2. basePrice = PriceEntryService.getForVariant(ctx, variantId, priceTypeCode)
   — reads ProductVariantPriceEntry, joining variant -> product -> `customFieldsExternalid`
   → if no PriceEntry row exists for this product+priceType: fall through to 1b

3. facetValues = merge(ProductVariant.facetValues, Product.facetValues)
   — facets such as category are assigned to the PRODUCT, not the variant (brand is
     not a facet, but matches as a synthetic `manufacturer` entry, see "Brand / manufacturer"
     below), so both levels must be checked or matching silently misses
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
— and whatever total reaches ERP — would be priced from the raw ERP import price. This
was a real (now fixed) gap; the fix must be understood before touching pricing again.

`CustomerPriceCalculationStrategy` (`apps/server/src/customer-price-calculation.strategy.ts`)
is registered as `orderOptions.orderItemPriceCalculationStrategy` in
`apps/server/src/vendure-config.ts`. It's invoked by Vendure on `addItemToOrder`,
`adjustOrderLine`, and address changes (see Vendure's `OrderItemPriceCalculationStrategy`
docs for the exact list). It calls `PriceResolutionService.resolve()` and uses
`customerPrice` as the line's unit price, falling back to `productVariant.listPrice`
only when neither the customer's own price nor the branch-default fallback resolves.

Uses Vendure's `init(injector)` pattern (a plain class instantiated with `new` in
`vendure-config.ts`, not a NestJS-managed provider) to pull `PriceResolutionService`
from the `Injector`. `apps/server/src/order-code.strategy.ts`
(`DateStampedOrderCodeStrategy`) is a sibling strategy in the same file/pattern family,
though it no longer needs `init()` itself — its `code = ORD-YYYYMM-<random hex>` format
needs no DB access at all (see "Do not redo" below for why the previous MAX+1 approach
was replaced).

---

## Price entries are keyed by the product ERP id (#297)

An entry is stored per product ERP id (`product.customFieldsExternalid`) and price type code, never per variant. A
price event is stored the moment it arrives, even before its product; the variant resolves it at read time through
variant -> product -> ERP id. Consequences:

- All variants of one product share one price. The admin mutation `upsertPriceEntry(variantId, ...)` and
  `bulkUpsertPriceEntries` therefore price the whole product; a variant whose product has no ERP id is rejected
  (`upsertPriceEntry`) or skipped (`bulk`). No UI writes entries; the manager catalog only reads them
  (`priceEntriesForVariants`), and the ERP models one variant per product, so no screen expects per-variant prices.
- A price stored for a product that never arrives stays as an orphan row. This is intended (it costs nothing and
  resolves if the product shows up later); `reconciliation-local-counts` counts the table as a whole, so orphans
  are included in the local count.
- `getForVariants` pins per-variant index lookups for up to 500 ids (`LATERAL ... OFFSET 0`) and uses a plain join
  above that; see "Pricing benchmark" in `testing-strategy.md` for the plans and numbers.

## ERP import

Discount rules are pushed the same way as everything else — via the `erp-import`
REST batch endpoint (`POST /erp/import/batch`), record `type: "discountRule"`
(`packages/plugins/erp-import/src/handlers/discount-rule.handler.ts`). Unlike
`price.handler.ts`, `discount-rule.handler.ts` imports `DiscountRuleService` from
`@mivend/plugin-price-entry` directly; `price.handler.ts` likewise calls
`PriceEntryService.upsertByProduct`. A `price` record carries `productExternalId` (the product's
ERP id), not a SKU, and does not need the product to exist yet.

`DiscountRule.erpId` is the natural upsert key (not the facet/period combination) —
rules can be edited or reissued from the ERP with the same identity.

---

## Business rules (do not deviate)

- Discounts are (almost always) scoped to a facet — category, manufacturer (facet code
  `manufacturer`, value code = ERP manufacturer id), or any other facet code. A **global** discount (both `facetCode`/`facetValueCode` null) exists but
  is rare; it applies to every variant for that price type.
- If a variant matches multiple active rules, the **highest percent wins**. No stacking.
- Discount periods (`validFrom`/`validTo`) are **always fully bounded** — the business
  never runs open-ended discounts, and ERP currently caps periods at ~3 months. Periods
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
- `OrderDiscountService` passes `{ order, quantity }` as `orderContext` (see "Order-dependent discounts"); it is the _only_ call site that does; catalog/product-page/search
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
  (`OrderLineDiscountResolver` in `price-entry.resolver.ts`): the price before every discount, from the
  same `PriceResolutionService.resolve(ctx, variantId, { order, quantity })` call the promotion uses —
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

## Currency

The default Channel's currency is set by config (`DEFAULT_CURRENCY_CODE`, default `RUB`) and
reapplied at every boot by `DefaultChannelCurrencyBootstrapService` (single available currency).
Config is the source of truth: a currency changed in the admin UI is reverted on restart.

## Brand / manufacturer

The brand shown on cards, the cart, checkout, the product page and in discount messages is the
product's `manufacturer` relation (`Product.customFields.manufacturer`), never a facet. The Shop
API exposes it as `Product.manufacturer { id name }` and `SearchResult.manufacturer`
(erp-integration, batched per request); the storefront reads it only through `brandOf`
(`packages/storefront/src/utils/brand.ts`). There is no `brand` facet — nothing assigns one.

A `DiscountRule` with `facetCode = manufacturer` and `facetValueCode = <manufacturer ERP id>`
matches by that relation: `toFacetsAndWeight` (`order-preload.ts`) adds one synthetic entry
`{ facetCode: 'manufacturer', valueCode: <Manufacturer.externalId>, name }` to the product's facet
values when it has a manufacturer. Everything that matches rules reads that one list — tier display
(`resolveTiers`), price resolution, tier progress and the per-facet order aggregates — so a brand
ladder (percent by amount or weight) counts every cart line of that brand and never mixes brands.
The relation loads with the same single variant query as the facets (a join; no extra query per
variant on a catalog page or in a cart preload). No facet value, column or brand list is involved.

---

## Products without a price

The ERP publishes prices per product and price type; a large part of the catalog (mostly items
not in stock) has no price row at all (staging, 2026-10-06: ~38% of variants), which is real
upstream data, not a sync loss. A logged-in customer sees "Price on request" with a "Request
price" action instead of a dash; guests see "Log in to see prices".

## Order-dependent discounts (one pass, #196)

Tier ladders (weight/amount), promo rules and discount setup documents depend on the whole order, so they are a
Vendure promotion, not part of the line's list price:

- `CustomerPriceCalculationStrategy` prices a line with the flat facet+period discount only
  (`resolve(..., { orderRules: false })`); `OrderLine.unitPrice` is that price.
- One automatic `Promotion` (provisioned at boot by `OrderDiscountPromotionBootstrapService`, re-enabled if a
  staff member disables it) carries the condition `mivend-order-discount-condition` and the item action
  `mivend-order-discount`. Vendure runs it for every line inside every order mutation's own transaction, so
  there is no background pass, no marker and no `activeOrder` wait; totals are always consistent.
- `OrderDiscountService.stateFor` evaluates the order once per snapshot (cached per `Order` object and line
  signature) with the full `PriceResolutionService.resolve`; the per-unit discount is `listPrice - bestPrice`.
  ONE action means the highest percent among all sources wins (never stacked, as before); never add a second
  promotion for these rules, Vendure would stack it.
- Skipped: lines with a manual unit price (`manualUnitPrice`) and read-only ERP orders (`isExternal`).
- A discount setup amount condition compares the pre-promotion line total (`documentAmount`), not the persisted
  order total, which still carries the previous pass's discounts.
- Consumers read the price a customer pays from `discounted*`/`prorated*` fields (`discountedLinePriceWithTax`,
  `proratedUnitPriceWithTax`); `unitPrice`/`linePrice` are before the promotion. `OrderLine.compareAtPrice`
  is the price before every discount. The floor-price check compares the prorated price.
- Any OTHER enabled Vendure promotion (a coupon, one an admin creates) stacks additively on top of this one,
  which could not happen while the price was baked into `listPrice`; create no such promotion without a decision.
- Amount thresholds (`minAmount`, setup amount conditions) are measured BEFORE discounts (list-price line
  totals, shipping and surcharges excluded). A manual-price line gets no discount but still counts toward its
  siblings' weight, amount and quantity (pinned by a unit test).
- The bootstrap re-enables the promotion at every boot if staff disabled it (warn log): that is intended, a disabled
  promotion silently removes every order-dependent discount.
- Size: before #271 the evaluation was linear, about 60 ms per line per mutation (41 lines: add ~2.5 s, adjust ~2.4 s,
  read ~1.9 s). Now `preloadOrderLookups` seeds the memo with one query each for variants (facets, weight, erp id),
  promo rules and base prices (plus one query for the branch default type, only for variants the customer type lacks), so the per-line pass only reads memory. Measured on the local
  contour with `infrastructure/scripts/seed-large-cart.mjs` (200 lines, one cart), before -> after: add of the 41st
  line 2.6 s -> 0.3 s, of the 100th 6.4 s -> 0.5 s, of the 200th 12.5 s -> 0.9 s; adjust at 200 lines 13.2 s -> 0.7 s.
  Supported: at least 200 lines.
- Progress (`tierProgress`) is derived from the order's quantities, independent of prices.
- Catalog progress: `ProductVariant.tierProgress` reads the caller's own active order (null for a guest, 0 of N for an empty cart). It considers only the nearest unreached rung, so a rung weaker than the current discount hides a stronger later one; the storefront also hides the ladder in that case (`useTierProgressView`).

## Markup rules (negative percent, #283)

- A discount setup with a negative percent raises the price (`price * (1 - percent/100)`) and competes by max with every other rule, so it applies only when nothing better matches. No clamping to the list price.
- Orders: `OrderDiscountService` keeps a signed per-unit state and the item action returns a positive adjustment, which Vendure accepts (only negative adjustments are clamped to the line price). Prorated prices, totals, taxes, proforma invoice amounts and the ERP order `totalWithTax` include it.
- Catalog and list price: setups with no condition or a threshold of 0 apply without an order (like price-type rules without a threshold), including markups. A setup with a threshold above 0 depends on the order, so it stays out of the catalog (the same treatment as positive percents) and enters the price through the order adjustment once reached. A contract rule reaches the catalog price only through an order that names the contract.
- A markup is never shown as a discount, markup or saving: no `compareAtPrice`, and the proforma invoice prints the final price with no discount value.
- Known limitation: a setup whose recipient row names a contract is not in the catalog price, because the contract is known only in an order. For such an unconditional setup the catalog price and the cart price differ.
- Tier badges (`discountTiers`, `tierProgress`) come from the price-type ladder only. A discount setup already in the price can match or beat a rung, so a badge may offer a rung that is not better than the current price; this is unchanged by markups and not corrected here.
- `DiscountRule.validTo` is nullable only for promo rows; the registry resolver filters those out, so the GraphQL `validTo` stays non-null.

## Discount setup documents (#290, #289)

Counterparty- and contract-scoped discounts and markups come from the ERP as one **setup document** each
(`DiscountSetup`, table `discount_setup`), not as expanded register rows. `DiscountSetupRulesService.getBestPercent`
(called from `PriceResolutionService.resolve`) matches by:

- **counterparty and contract** through the document's recipient rows (an empty counterparty or contract means any; a
  contract row matches only an order on that contract);
- **price type**: a document naming a price type applies only to a customer whose effective price type is that one
  (a markup is relative to a price type); a document without one applies to any;
- **products**: an "all products" flag, the document's product list (one indexed probe per priced product), or a
  dynamic filter evaluated lazily (see "Filter-mode documents" below);
- **condition**: `DiscountConditionKind` maps the ERP condition name to `unconditional` (applies always), `quantity` (summed over the document's product
  list, or all lines for an "all products" document) or `amount` (the whole document amount); an empty condition is
  unconditional and an unknown name never matches;
- the validity window and the active flag.

Several matching documents never stack: the highest percent wins and a negative percent competes by max. Documents
mivend cannot evaluate are stored inactive with a reason and ignored: fixed prices, price groups, bonus lines, set
components, weekday or time windows, reference conditions, dynamic product filters with a field or comparison mivend does not evaluate, and any non-default value of an
attribute mivend does not read (markup type, purpose, currency, pseudo documents, product-line attributes).
A positive percent with a markup type is therefore never a discount. Opaque ids are compared only to empty, never by name.
Details and field accounting: `docs/ai/erp-streams-map.md`.

- **Catalog vs cart**: the catalog has no order, so `loadRules` runs with an empty contract and matches only recipient
  rows whose contract is empty (any counterparty or the customer's own, any contract). The catalog price therefore
  includes documents addressed to the customer or to everyone without a contract. A document whose recipient names a
  contract is applied only by the cart and the order (contract known), so the cart or order price can be lower than
  the catalog price. This is deliberate, not a bug.
- **No-condition kind**: the ERP name for "no condition" is a `discount_condition_kind` row with metric `unconditional`
  (bootstrap row); it applies at any quantity and amount, catalog included, exactly like an empty condition.
- **Unknown condition**: a condition name missing from `discount_condition_kind` stores the document inactive with the
  reason `unknown condition <name>` and a warning log; the inbox row settles as a noop. To enable it, insert the kind row
  (`erpName`, `metric` of `quantity` or `amount`); the document is re-evaluated when the ERP sends a newer version.
- **Operation kind**: only kinds listed in `discount_operation_kind` (seeded: by-product-list percent documents) are
  evaluated; any other non-empty `operation_kind` is stored inactive with `unsupported operation <name>`. Add a row to enable one.
- **No recipients**: a document with an empty recipient list is stored inactive (`no-recipients`) until the ERP confirms
  that an empty list means everyone.
- **Version order**: a tombstone or unposted document older than the stored version is a noop (a replay); at an equal
  version it applies only while the row is still active; only a strictly newer upsert reactivates.
- `limit_percent` is stored but not enforced yet, so the real discount can be lower than the ERP's (issue #292).

**Filter-mode documents (#296).** The ERP sends a dynamic selection as a flat list of ANDed conditions; mivend
evaluates it lazily over the products in play and never materialises members, so a manufacturer or category change
needs no recompute.

- _Write time_: `classifySelectionFilter` (`packages/shared`) normalises the filter into term rows
  (`discount_setup_filter_term`, `retro_bonus_rule_filter_term`: field, hierarchical, negated, refs) and decides
  evaluability once. Supported: fields `Номенклатура.Производитель` and `Номенклатура` with the comparisons Равно,
  НеРавно, ВСписке, НеВСписке, ВИерархии, НеВИерархии, ВСпискеПоИерархии, НеВСпискеПоИерархии; on the counterparty side
  (retro-bonus) `Контрагент` with the non-hierarchy comparisons. Anything else stores the document inactive with
  `unknown-filter-field`, `unknown-comparison`, `unsupported-comparison` (hierarchy on a counterparty),
  `unknown-value-type`, `invalid-values` or `empty-filter` (a filter-mode document with no conditions and no all flag
  never applies). Retro-bonus reasons are prefixed with the side (`product-`/`counterparty-`).
- _Read time_: `DiscountSetupRulesService` loads the terms of the matching filter setups and resolves their refs
  (manufacturer by `manufacturer.externalId`, category by slug `cat-<ref>`, product by `product.customFieldsExternalid`),
  reads one attribute row per product in play (manufacturer, own category and all ancestors through
  `collection_closure`, from the product's `category` facet value) and evaluates in memory. The result is the member
  set a list document would produce, so catalog, cart and order share one evaluator and the thresholds and
  max-percent logic are untouched.
- _Fail closed_: an unresolved ref (category, product or manufacturer not synced) makes a negated term false; a
  hierarchy comparison on a manufacturer needs every ref to be a stored manufacturer; an unknown comparison never
  applies; a product without a resolved category matches no category term. **A negated term also needs a known
  attribute**: НеРавно/НеВСписке on the manufacturer is false for a product with no manufacturer, and
  НеВИерархии/НеВСпискеПоИерархии is false for a product with no category facet value, because the ERP may hold that
  product under the excluded manufacturer or group. Negation on product identity (НеРавно, НеВСписке on an item) needs no
  attribute.
- _Limits_: no manufacturer tree is stored (hierarchy on manufacturers behaves as in-list); counterparty hierarchy is
  not evaluated (no `counterparty-groups` stream); other fields (supplier, parent, nomenclature group) and comparisons
  (greater/less, contains, interval) stay inactive. Retro-bonus stays display only: the counterparty side narrows
  `retroBonusRules`, the product side is only validated and stored.
- _Existing rows_: discount documents stored before this change as `product-filter` are reclassified once at server
  start from the stored filter. Their recipients were not stored while the document was inactive, so an evaluable one
  gets `awaiting-redelivery` (its stored version is reset). **What the owner must do after the deploy: have the ERP
  resend the filter-mode discount documents (a replay of the `discount-setup` stream), nothing else.** Any redelivery
  of such a document, at any version, activates it. Documents that stay `awaiting-redelivery` were not resent. Retro-bonus
  rules keep their members and are fixed in place, no resend needed.
- _Wire shape_: a condition value is a `SourceFieldValue`; in proto JSON a reference is `{"refId": "<uuid>"}`. Any other
  value kind (string, number, enum) stores the document inactive as `unknown-value-type`.
- _Query cost_: with only filter documents a 100-line cart costs 4 queries in total (rules, terms, ref resolution, product
  attributes) through the per-request `LookupMemo`. A catalog page costs the same 4 however many products it has: the
  variants of a page are resolved concurrently and `BatchLoader` collects their product ids within a 5 ms window into one
  attribute query. Products that reach the loader in separate windows (a slow variant) add one query per extra window;
  results stay correct. Asserted in `discount-setup-filter.int.test.ts`. Every lookup is indexed
  (`collection_translation.slug`, `manufacturer.externalId`, `product.customFieldsExternalid`, `collection_closure`
  both columns, facet-value joins), so no index was added. Wall-clock timing is left to the first run on a populated database.
- _Retro-bonus display_: `retroBonusRules` returns a rule whose product or counterparty side is not evaluable with
  `inactiveReason` set (visible to the manager); nothing else reads retro-bonus rules (no accrual or grant logic
  depends on them), and the portal does not use `allProducts`, so such a rule is never presented as covering all products.
