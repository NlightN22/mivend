// The consumer's copy of analytics.v1 sales_metrics.proto (contract v0.5.0, go_package option dropped).
// Keep it identical to the contract; update it together with the version note in docs/analytics.md.
export const SALES_METRICS_PROTO = `
syntax = "proto3";

package analytics.v1;

import "analytics/v1/order_metrics.proto";
import "google/protobuf/timestamp.proto";


service SalesMetricsService {
  // Real sales: realization documents (goods and services sales), customer
  // returns and sales corrections as posted in the accounting system, not order
  // amounts. Only posted documents that are not marked for deletion and not
  // deleted are counted; the period is cut by the document date.
  //
  // Errors: UNAUTHENTICATED, INVALID_ARGUMENT (bad request), PERMISSION_DENIED
  // (an organization outside the caller's scope), RESOURCE_EXHAUSTED (more than
  // 5000 result rows or a query too heavy: narrow the period or the filters),
  // DEADLINE_EXCEEDED, CANCELLED, INTERNAL.
  rpc GetSalesTurnover(GetSalesTurnoverRequest) returns (GetSalesTurnoverResponse);
}

enum SalesDimension {
  SALES_DIMENSION_UNSPECIFIED = 0;
  SALES_DIMENSION_NONE = 1;
  SALES_DIMENSION_COUNTERPARTY = 2;
  SALES_DIMENSION_ORGANIZATION = 3;
  SALES_DIMENSION_CONTRACT = 4;
  // Any manager of the document's counterparty (a counterparty with several
  // managers is counted under each of them, so rows must not be added across
  // managers); main_manager_only limits it to the main manager. A counterparty
  // without a link has an empty dimension_id.
  SALES_DIMENSION_COUNTERPARTY_MANAGER = 5;
}

message GetSalesTurnoverRequest {
  // Documents are selected by document date: from is inclusive, to is exclusive.
  // Both are required, must lie between 2000-01-01 and 2100-01-01, and the
  // period may not exceed 5 years.
  google.protobuf.Timestamp from = 1;
  google.protobuf.Timestamp to = 2;
  // Required: UNSPECIFIED is rejected, use NONE for a single total.
  Granularity granularity = 3;
  // Required: UNSPECIFIED is rejected, use NONE for no grouping.
  SalesDimension dimension = 4;
  // IANA time zone name used to cut day and month buckets. Empty means UTC.
  string time_zone = 5;
  // The customer of a sale is the counterparty of the document.
  repeated string counterparty_ids = 6;
  repeated string organization_ids = 7;
  repeated string contract_ids = 8;
  repeated string counterparty_manager_ids = 9;
  // Same meaning as in GetOrderTurnoverRequest.
  bool main_manager_only = 10;
}

// One measure of a bucket. Document totals are summed as the source reports
// them: a document whose total excludes VAT is not converted (the document has
// no VAT split), so amount mixes both bases and amount_excluding_vat_basis
// tells how much of it comes from documents whose total excludes VAT. A
// document that does not state the basis is treated as including VAT.
message SalesAmount {
  // Decimal string, exactly two fraction digits, dot separator, no exponent.
  string amount = 1;
  // The part of amount that comes from documents whose total excludes VAT,
  // same format. Always "0.00" for corrections (register effect).
  string amount_excluding_vat_basis = 2;
  // Documents counted in this figure, including those without an amount.
  int64 document_count = 3;
  // Documents of the figure whose source carries no total; they add nothing to
  // amount.
  int64 documents_without_amount = 4;
}

message SalesTurnoverRow {
  // Start of the bucket (UTC); unset when the granularity is NONE.
  google.protobuf.Timestamp period_start = 1;
  // Empty when the dimension is NONE or the manager is unknown.
  string dimension_id = 2;
  // Currency as provided by the source (an id or a code); amounts of different
  // currencies are never added together, each currency is its own row.
  string currency = 3;
  // Realization documents.
  SalesAmount sales = 4;
  // Customer returns, a positive amount that reduces sales.
  SalesAmount returns = 5;
  // Sales corrections as the signed effect on the settlement register: a
  // negative amount reduces sales, a positive one increases it. Taken from the
  // register entries of correction documents that are still posted (a
  // tombstoned or deleted correction is dropped), in the register's currency,
  // and counted by document date.
  SalesAmount corrections = 6;
  // Net sales: sales - returns + corrections, with returns and corrections
  // applied together.
  SalesAmount net_sales = 8;

  reserved 7;
  reserved "net_of_returns";
}

message GetSalesTurnoverResponse {
  repeated SalesTurnoverRow rows = 1;
  // Posted correction documents in the period (counterparty, organization and
  // contract filters applied; the counterparty manager filter and dimension are
  // NOT applied) for which the register effect has not arrived yet, so they are
  // missing from corrections and the net figures.
  int64 corrections_without_effect = 2;
  // Currency values of the rows that could not be turned into a catalog code
  // (an id the currency catalog does not know). The same currency can then
  // appear under an id and under a code in separate rows, and net_sales of such
  // a row mixes only the documents that carry the same value. An empty
  // currency (the source gave none) is not listed.
  repeated string unresolved_currencies = 3;
}
`;
