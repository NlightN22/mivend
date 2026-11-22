// The consumer's copy of analytics.v1 order_metrics.proto (contract v0.2.0, go_package option dropped).
// Keep it identical to the contract; update it together with the version note in docs/analytics.md.
export const ORDER_METRICS_PROTO = `
syntax = "proto3";

package analytics.v1;

import "google/protobuf/timestamp.proto";


service OrderMetricsService {
  // Order turnover: the sum of order amounts as reported by the source system.
  // It is not sales (realization) turnover. Deleted and cancelled orders are
  // not counted; orders without an order date are not returned.
  //
  // Errors: UNAUTHENTICATED (missing or invalid credentials), INVALID_ARGUMENT
  // (bad request), PERMISSION_DENIED (an organization outside the caller's
  // scope), RESOURCE_EXHAUSTED (more than 10000 result rows, or a query too
  // heavy for the server: narrow the period or the filters), DEADLINE_EXCEEDED,
  // CANCELLED (the caller gave up), INTERNAL (a server fault, retry later).
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
  DIMENSION_MANAGER = 5;
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
}

message GetOrderTurnoverResponse {
  repeated OrderTurnoverRow rows = 1;
}
`;

export const TIMESTAMP_PROTO =
    'syntax = "proto3"; package google.protobuf; message Timestamp { int64 seconds = 1; int32 nanos = 2; }';
