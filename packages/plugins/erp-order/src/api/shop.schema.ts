import { gql } from 'graphql-tag';

// Uses Vendure's own generated `OrderListOptions`/`OrderList!` — this is the documented
// convention (docs.vendure.io/guides/how-to/paginated-list/), not just a way to avoid the
// generateListOptions collision. `filter.erpStatus` already exists on `OrderFilterParameter`
// for free (Order.customFields are exposed flat, per AGENTS.md), so no custom filter/options
// type is needed for that. `search` (free text across order.code and joined product names) is
// a plain sibling scalar arg — it isn't a real Order column, so it can't be a `filter` field
// without a `customPropertyMap`-mapped joined expression; a bare arg is simpler and doesn't
// require inventing a custom options/list type. See AGENTS.md's generateListOptions gotcha.
export const shopApiExtensions = gql`
    extend type Query {
        myOrders(options: OrderListOptions, search: String): OrderList!
    }
`;
