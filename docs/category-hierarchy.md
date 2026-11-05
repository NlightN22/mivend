# Category hierarchy

How ERP categories become the Vendure Collection tree, and every decision behind it (issue #158).
Stream status lives in `ai/erp-streams-map.md`; this file is the design record.

## Data model

- One `category` FacetValue per ERP category (`code` = ERP id) and one Collection per category
  (slug `cat-<erpId>`), under the root Collection or under its parent category's Collection.
- Contract (`CategoryChanged`): `name`, `parent_id` (optional), `is_active`, `is_deleted`. There is
  no folder/group discriminator; a deletion tombstone carries no name and no `parent_id`.
- Collection custom fields: `visibilityOverride` (manual, #90) and `feedHidden` (internal, what the
  feed alone says: inactive, deleted, or a placeholder).

## Parent resolution

- Absent `parent_id` means top level. A self-referencing `parent_id` is ignored with a warning.
- The parent is resolved to `cat-<parentErpId>`. If it has not arrived yet, a **private placeholder**
  Collection (name = ERP id, `feedHidden=true`, no filter) is created and the child is placed under it.
  The parent's own event later fills it in as an ordinary update.
- Rejected: failing with `MissingDependencyError` and retrying. Kafka gives no ordering across entity
  keys, and bulk resync or replay would turn a hierarchy into a retry storm. Also rejected: placing the
  child under the root as a fallback, which would freeze a wrong tree.
- The Kafka handler and the REST import handler share one parent implementation
  (`packages/shared/src/categoryParentCollection.ts`): placeholder on a missing parent, `move` on change.
- A changed `parent_id` moves the Collection (`CollectionService.move`). A tombstone never moves it.
- Cycles in the parent chain are not detected on write; Vendure refuses to move a Collection into its
  own descendant, and the inbox retries and dead-letters that event.

## Product membership

- Each category Collection filters by `facet-value-filter` with `containsAny=true` over its own
  FacetValue plus every descendant's, so a parent lists the products of its whole subtree.
- Vendure's `inheritFilters` is not used: it ANDs parent and child filters (child = subset of parent),
  so it cannot widen a parent.
- The category's own event refreshes its own filter. Subtree changes (a descendant added, moved or
  finally named) reach ancestors through the periodic recompute.
- Descendants without a FacetValue yet (placeholders) contribute nothing until their event arrives.

## Visibility

- **Rule (owner, 2026-11-05): a hidden category hides everything below it, always. There is no visible
  exception inside a hidden subtree.** A hidden ancestor wins over any override on a descendant.
- Effective `isPrivate`: hidden when the parent is hidden; else `visibilityOverride` (`hidden` hides,
  `visible` shows even if the category's own feed hides it); else `feedHidden`. **Children are hidden
  together with a deleted or not-yet-synced parent**; reviving the parent restores each child to its
  own state (a stored `visible` override takes effect again), except those the feed hides itself.
- The manager page does not offer `visible` for a category with a hidden ancestor. The Admin API
  still accepts the value (Vendure's `updateCollection`); it has no effect, the recompute that every
  override change triggers keeps the category hidden.
- A category's event applies this using its parent's current state. Propagation to the rest of the
  subtree when an ancestor flips is done by the periodic recompute, so it can lag by up to one interval.
- Why `feedHidden` is stored: without it a revived parent could not tell "hidden by an ancestor" from
  "hidden by the feed", and would either keep children hidden or unhide deleted ones.

## Products of hidden categories

- Owner decision (2026-11-05): a product whose category is hidden (own override, feed, or a hidden
  ancestor, i.e. its category Collection is `isPrivate`) is invisible to customers everywhere: shop
  `search` (text, catalog listing, `collectionSlug`, suggestions, code groups, facet values, counts),
  `products`, `product(id|slug)`, `Collection.productVariants`, home widgets, favorites and cart add
  (`OrderInterceptor`, shop API only). A product sits in one category chain; there is no
  "visible if any category is visible" case. Products with no category are unaffected.
- One truth: `collection.isPrivate`, read at query time (`productInHiddenCategorySql` in
  `packages/shared/src/hiddenCategoryProducts.ts`, `HiddenCategoryProductsService` in access-control).
  Nothing is denormalised into the index, so the recompute that flips `isPrivate` hides and un-hides
  products at once and no reindex or backfill is needed. The category FacetValue is read from the
  product (local import) and from its live variants (ERP feed).
- Internal backend: the shop `search` resolver puts the hidden category FacetValue ids on the input and
  `mapSearchQuery` adds a `must_not` filter on `facetValueIds`, so hits, counts and facets agree.
  External backend: hits are loaded through `ProductLookupService`, which drops hidden-category
  products, and a hidden requested category answers empty without calling search-service.
- Staff: the Admin API (manager portal, `UpdateCatalog`/`ReadCatalog`) is untouched, as hidden
  Collections already are, so the Category visibility page keeps working.
- External contract: every shop `POST /resolve-query` carries `excludeCategoryIds` (ERP ids of all hidden
  categories, at most 1000, each 1-100 chars; past the cap only hidden nodes with a visible parent;
  omitted when empty and for staff). search-service applies it to code groups, items, total and facets
  with no index change. The param alone is not a browse filter. Known gap: it matches `categoryPath`
  (subtree), which is the same set as `collection.isPrivate` since a hidden ancestor always hides its subtree.
- Deploy order: search-service (image `sha-dc51122` or later) first, mivend second. Local post-filtering in
  `ProductLookupService` stays as a second guard.
- Release: no migration, reindex or backfill step. A stored `visible` override under a hidden ancestor
  (plain data) stops having effect at the next recompute (override change, import batch or the hourly
  task) and applies again only if the ancestor is un-hidden.

## Periodic recompute

- `category-tree-recompute.scheduled-task.ts` (central hub with Kafka enabled only), default every
  hour (`categoryTreeRecomputeIntervalMs`). It reads all category Collections once, plans subtree
  filters and propagated visibility, and writes only what changed.
- The REST import path (`erp-import`, local seed) runs the same recompute once after each batch that
  contains categories, so the local contour shows the same tree.
- The planning logic is pure and shared (`packages/shared/src/categoryCollectionFilter.ts`); the
  Vendure-facing part is `recomputeCategoryTree.ts` in the same package.

## Known data quirks

- Staging (2026-10-03): some categories deleted in the ERP still have live children and products. They
  stay as private placeholders, and their children are hidden (decision above). The only way to show
  them again is a real event for the parent (the child is hidden while the parent is, whatever its override).
- A tombstone seen before any real event for that category is a no-op for a nameless, unknown category.

## Backfill

Existing Kafka contours need the `category` aggregate re-delivered once after deploy (bulk resync via
upstream); the already-processed inbox rows carry the old flat result.
