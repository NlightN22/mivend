// The consumer's copy of analytics.v1 order_metrics.proto (contract v0.8.1, go_package option dropped).
// Keep it identical to the contract; update it together with the version note in docs/analytics.md.
export const ORDER_METRICS_PROTO = `
syntax = "proto3";

package analytics.v1;

import "google/protobuf/timestamp.proto";

service OrderMetricsService {
  // Order turnover: the sum of order amounts as reported by the source system.
  // It is not sales (realization) turnover. Deleted and cancelled orders are
  // not counted, and neither are orders whose latest version says they are
  // not posted (is_posted = false). An order whose latest version carries no
  // posting flag (not yet republished by the source) is still counted, and
  // orders the source cannot publish without a customer are not delivered at
  // all. Orders without an order date are not returned.
  //
  // Errors: UNAUTHENTICATED (missing or invalid credentials), INVALID_ARGUMENT
  // (bad request), PERMISSION_DENIED (an organization outside the caller's
  // scope), RESOURCE_EXHAUSTED (more than 5000 result rows, or a query too
  // heavy for the server: narrow the period or the filters; also a manufacturer,
  // product category or customer group list that expands to more than 20000
  // members: use narrower groups), DEADLINE_EXCEEDED, CANCELLED (the caller gave
  // up), INTERNAL (a server fault, retry later).
  rpc GetOrderTurnover(GetOrderTurnoverRequest) returns (GetOrderTurnoverResponse);
}

enum Granularity {
  GRANULARITY_UNSPECIFIED = 0;
  GRANULARITY_NONE = 1;
  GRANULARITY_DAY = 2;
  GRANULARITY_MONTH = 3;
}

enum Dimension {
  DIMENSION_UNSPECIFIED = 0;
  DIMENSION_NONE = 1;
  DIMENSION_CUSTOMER = 2;
  DIMENSION_ORGANIZATION = 3;
  DIMENSION_POINT_OF_SALE = 4;
  // The manager responsible for the order itself.
  DIMENSION_MANAGER = 5;
  // The manager of the order's counterparty (customer), taken from the
  // counterparty's link to its managers. With main_manager_only the main
  // manager only; otherwise every manager of the counterparty, so an order is
  // counted once for EACH of them and rows of different managers must not be
  // added together. Orders whose counterparty has no known manager fall into
  // the empty dimension_id.
  DIMENSION_COUNTERPARTY_MANAGER = 6;
}

message GetOrderTurnoverRequest {
  // Orders are selected by order date: from is inclusive, to is exclusive.
  // Both are required, must lie between 2000-01-01 and 2100-01-01, and the
  // period may not exceed 5 years. Day and month buckets are cut in UTC; a
  // period that does not align with the buckets returns partial edge buckets.
  google.protobuf.Timestamp from = 1;
  google.protobuf.Timestamp to = 2;
  // Required: UNSPECIFIED is rejected, use NONE for a single total.
  Granularity granularity = 3;
  // Required: UNSPECIFIED is rejected, use NONE for no grouping.
  Dimension dimension = 4;
  // IANA time zone name (for example "Europe/Moscow") used to cut day and month
  // buckets and to label period_start. Empty means UTC. The from/to instants
  // are absolute and are not affected by it.
  string time_zone = 9;
  // Empty filter lists mean no filtering; each list holds at most 1000 values.
  // Results are always limited to the organizations the caller is allowed to see.
  repeated string customer_ids = 5;
  repeated string organization_ids = 6;
  repeated string point_of_sale_ids = 7;
  repeated string manager_ids = 8;
  // Managers of the order's counterparty (not the order's own manager_ids).
  // Selection follows main_manager_only: the main manager only, or any manager
  // of the counterparty. Empty means no filtering.
  repeated string counterparty_manager_ids = 10;
  // false (default): the counterparty's managers are all of its managers;
  // true: only its main manager is considered, for the filter and for
  // DIMENSION_COUNTERPARTY_MANAGER. It has no effect unless
  // counterparty_manager_ids or DIMENSION_COUNTERPARTY_MANAGER is used.
  bool main_manager_only = 11;
  // Product filters (at most 1000 values each, empty means none). When any of
  // them is set the result is counted over the matching order lines, not over
  // whole orders: order_count is the number of orders having at least one
  // matching line, product_quantity and product_amount sum the matching lines,
  // and turnover, turnover_excluding_vat and vat_total are left empty. Both
  // filters together select lines that match both.
  repeated string product_ids = 12;
  // Manufacturer ids as linked to the products by the source system. Only the
  // product's direct manufacturer matches: manufacturer groups (parents) are
  // not expanded, so a group id matches nothing (use manufacturer_group_ids for
  // that). A product deleted at the source is not matched by manufacturer (its
  // newest link version carries none), while product_ids still matches it.
  repeated string manufacturer_ids = 13;

  // Exclude lists: an order or line that matches any value of an exclude list
  // is left out. Each list holds at most 1000 values (more is INVALID_ARGUMENT),
  // empty means no exclusion, and an exclude list is combined with the include
  // list of the same field by AND (include first, then exclude). The exclusion
  // follows the semantics of the matching include filter:
  // - customer, organization, point of sale and manager lists drop whole
  //   orders; they do not widen the caller's organization scope.
  // - counterparty managers (with the same main_manager_only rule): without
  //   DIMENSION_COUNTERPARTY_MANAGER an order is dropped when ANY of its
  //   counterparty's managers is listed; with that dimension only the rows of
  //   the listed managers are dropped (the other managers of the same order keep
  //   their rows). Orders without a known manager are never dropped.
  // - product, manufacturer and manufacturer group lists act on lines and, like
  //   the product include filters, switch the result to line mode: product_*
  //   fields are filled with the lines that are NOT excluded, order_count counts
  //   the orders that keep at least one line, and turnover, turnover_excluding_vat
  //   and vat_total are left empty. A product without a known manufacturer is
  //   never excluded by a manufacturer list or group: this includes a product
  //   deleted at the source whose newest link version carries no manufacturer
  //   (the include filters do not find it, the exclude filters leave its lines in
  //   the sums); only exclude_product_ids drops it.
  repeated string exclude_customer_ids = 14;
  repeated string exclude_organization_ids = 15;
  repeated string exclude_point_of_sale_ids = 16;
  repeated string exclude_manager_ids = 17;
  repeated string exclude_counterparty_manager_ids = 18;
  repeated string exclude_product_ids = 19;
  repeated string exclude_manufacturer_ids = 20;

  // Manufacturer groups expanded at query time: a group id matches the products
  // of its own manufacturer and of every manufacturer below it in the
  // manufacturer hierarchy (parent links, any depth up to 32 levels). Deleted
  // manufacturers are not members and are not traversed. An unknown or deleted
  // group id matches nothing: when manufacturer_group_ids is set and none of
  // its values is a live group the result has no rows, never the unfiltered
  // answer. Combined with manufacturer_ids and the other include filters by AND;
  // at most 1000 values; switches the result to line mode like the other
  // product filters.
  repeated string manufacturer_group_ids = 21;
  // Products of these groups (expanded as in manufacturer_group_ids) are left
  // out. An unknown or deleted group id excludes nothing. At most 1000 values.
  repeated string exclude_manufacturer_group_ids = 22;

  // Product categories expanded at query time exactly like manufacturer groups:
  // a category id matches the products whose category is that category or any
  // category below it in the category hierarchy (parent links, up to 32
  // levels). Deleted categories are neither members nor traversed. An unknown or
  // deleted category id matches nothing: when product_category_ids is set and
  // none of its values is a live category the result has no rows, never the
  // unfiltered answer. Combined with the other include filters by AND; at most
  // 1000 values; switches the result to line mode like the other product
  // filters. A product deleted at the source is not matched (its newest link
  // version carries no category).
  repeated string product_category_ids = 23;
  // Products of these categories (expanded as in product_category_ids) are left
  // out; line mode. An unknown or deleted category excludes nothing, and a
  // product without a known category is never excluded by it. At most 1000
  // values.
  repeated string exclude_product_category_ids = 24;

  // Customer (counterparty) groups expanded at query time: a group id matches
  // the customers whose group is that group or any group below it in the
  // counterparty group hierarchy (parent links, up to 32 levels). Deleted groups
  // are neither members nor traversed. The group of a customer is the one the
  // source reported with its latest version; a customer the source has not
  // re-sent since the group link appeared has no group yet. An unknown or deleted
  // group id matches nothing: when customer_group_ids is set and none of its
  // values is a live group the result has no rows. Whole orders are selected (not
  // lines), combined with the other include filters by AND; at most 1000 values.
  // Orders without a customer belong to no group.
  repeated string customer_group_ids = 25;
  // Orders of customers in these groups (expanded as above) are left out. An
  // unknown or deleted group excludes nothing, and a customer without a known
  // group is never excluded by it. At most 1000 values.
  repeated string exclude_customer_group_ids = 26;
}

message OrderTurnoverRow {
  // Start of the bucket (UTC); the bucket lasts until the next bucket start.
  // Unset when the granularity is NONE.
  google.protobuf.Timestamp period_start = 1;
  // Empty when the dimension is NONE.
  string dimension_id = 2;
  // Currency code as provided by the source; empty when unknown. Amounts of
  // different currencies are never added together.
  string currency = 3;
  // Decimal string with exactly two fraction digits and a dot separator, no
  // exponent (for example "1234.50"): the sum of order amounts INCLUDING VAT
  // over the orders that have an amount. An order whose source says the amount
  // excludes VAT is raised by its VAT; an unknown basis is treated as including.
  string turnover = 4;
  int64 order_count = 5;
  // Orders in the group whose source did not provide an amount; they add nothing to turnover.
  int64 orders_without_amount = 6;
  // The same orders' amounts EXCLUDING VAT, same decimal format as turnover.
  string turnover_excluding_vat = 7;
  // Total VAT of those orders, same decimal format as turnover.
  string vat_total = 8;
  // Filled only when product_ids or manufacturer_ids is set, otherwise empty.
  // Sum of the matching lines' quantities in the lines' own units, a decimal
  // string with a dot and exactly three fraction digits.
  string product_quantity = 9;
  // Sum of the matching lines' amounts as provided by the source, two fraction
  // digits. The basis follows the order: the lines of an order whose amount
  // includes VAT include VAT, otherwise they do not. It is therefore NOT
  // comparable with turnover (always including VAT) when the source states
  // amounts excluding VAT; no VAT split is available per line.
  string product_amount = 10;
  // Matching lines that carry no amount; they add nothing to product_amount.
  int64 product_lines_without_amount = 11;
}

message GetOrderTurnoverResponse {
  repeated OrderTurnoverRow rows = 1;
}
`;

export const TIMESTAMP_PROTO =
    'syntax = "proto3"; package google.protobuf; message Timestamp { int64 seconds = 1; int32 nanos = 2; }';
