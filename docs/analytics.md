# Analytics

How the manager portal "Analytics" menu item is built. Tracked in #363. The catalog lists planned reports; the `orders`
report (#389) is the first one that returns data.

## Concept

- **Separate analytical store, ready results in the portal.** Long-term, reports are computed outside the transactional
  database in a store of their own (aggregates over settlement documents, orders and lines, refreshed on a schedule).
  The portal only shows ready tables and charts; it never aggregates raw documents on request. The store, the
  aggregation and the charts are not built yet, and their cost (storage, refresh load) is an open question.
- **Catalog model mirrors bulk operations** (`docs/bulk-operations.md`): every report is registered in code (key, title,
  description, area, permission, status, implementation note) in `packages/plugins/analytics`. The GraphQL admin query
  `analyticsReports` returns only the reports the caller holds the permission for. The portal shows them as cards
  grouped by area with a search field (`/analytics`), and each card opens `/analytics/:report`.
- **Status** is `planned | available`. All reports are `planned`; a planned report page shows the title, description,
  a "Planned" badge and the implementation note.
- **Permission `ReadAnalytics`** opens the section. Default roles: department head and general director, the roles
  that already read customer-wide data, and the manager (the rows are scoped, see below). Superadmin has every
  permission. The operator does not get it by default; a role is changed in the Admin UI.

## Scope rule for the reports to come

A catalog entry is not data. Once a report returns rows, the rows stay inside the viewer's counterparty scope
(`docs/access-control.md`), applied before any filter or aggregate, like the manager card. Reports by responsible
manager are scoped twice: only the managers the viewer may see, and only their customers inside the viewer's scope. A
partial view must say so (visible against total), as the manager card does.

## Orders report (#389)

The first report, `orders`, reads order amounts from the analytics service over gRPC
(`analytics.v1.OrderMetricsService/GetOrderTurnover`, contract v0.3.2, additive over v0.2.0). The data is order turnover taken from the
integration service: the sum of order amounts, not sales documents; cancelled and deleted orders are not counted.

- **One report, many places.** The table is one shared component with filters and a dimension (customer, order
  manager, customer manager, point of sale, organization, or none) and a granularity (none, day, month). The customer and manager cards embed the same
  component with the entity as a fixed filter. This is the pattern for every later analytical table.
- **Server side only.** `packages/plugins/analytics` holds the client; the browser calls the admin API query
  `orderAnalytics`, never the analytics service. The consumer's copy of the `.proto` is `order-metrics.proto.ts`; keep
  it equal to the contract when the version changes.
- **Key.** One key per consumer. `ANALYTICS_GRPC_KEY_FILE` holds the PATH of the key file (read on every call, so a
  rotation needs no restart), never the key. `ANALYTICS_GRPC_ADDRESS` is `host:port` (TLS). Production mounts the host
  key directory read-only at `/run/analytics-keys` (`ANALYTICS_KEY_DIR`). Without either variable the report shows
  "not configured". Rotation and new consumers go through the owner of the analytics service.
- **Scope.** The key is not per user, so mivend applies the viewer's scope itself. The visible customers become the
  service's `customer_ids` filter (requested customers are intersected with them, more than 1000 are split into several
  requests and merged exactly; above 20000 visible customers the report fails with an explicit "too large" state). The
  manager dimension and manager filter keep only the managers the viewer's team visibility allows. A restricted
  viewer is told the numbers cover the visible customers only. The "visible against total" comparison from the
  scope rule above is not shown yet: it would need a second, unfiltered request.
- **Free-form filters (#396).** The Filters button is the standard filter builder. Its seven fields (customer,
  organization, point of sale, order manager, customer manager, product, manufacturer) take a name with a typeahead
  (`orderAnalyticsSuggest`, at least two characters, ten names, inside the viewer's scope). The browser sends the
  names; the server resolves them to ERP ids (a name matches by case-insensitive "contains", at most 200 entities per
  typed value and 1000 per filter) and applies the viewer's scope on top, so ERP ids never reach the browser. A name
  that matches nothing returns no rows, never the unfiltered answer. The contract's filter lists are sent only when
  not empty. The "customer manager" dimension and filter follow the "main manager only" switch.
- **Customer manager dimension.** A customer with several managers is counted under each of them, so the rows of
  different managers must not be added together; orders of a customer without a manager fall into an empty id. For a
  restricted viewer the rows keep only the managers the team visibility allows, like the order manager dimension.
- **Product and manufacturer filters.** With either set, the service counts order lines, not orders: `order_count` is
  the orders with at least one matching line, the table shows the line quantity and line amount instead of the order
  amounts (the amount basis follows the order, so it is not comparable with the with-VAT turnover). The manufacturer
  filter matches the product's direct manufacturer only and returns nothing until the analytics platform has seeded
  the catalogs of that environment.
- **Failure.** The report returns a state (`OK`, `NOT_CONFIGURED`, `TOO_LARGE`, `UNAVAILABLE`), never partial rows.
  A bad request is a user input error. The key never appears in logs or messages.

## Report catalog

| Key | Area | Idea | Parameters | Data source candidates |
| --- | --- | --- | --- | --- |
| `sales-dynamics` | sales | Sales per period against the previous period and the same period of the previous year | period, granularity | Settlement documents by category (sale, less return) |
| `sales-dynamics-by-brand` | sales | Same per brand; chips pick the key brands | period, granularity, brands (read from the brand entities) | Line-level sales with the brand of the product |
| `churned-customers` | customers | Customers whose purchases fell against the previous period or who stopped ordering | drop threshold (percent), silent days, period | Settlement documents per counterparty |
| `churned-customers-by-brand` | customers | Customers whose purchases of a brand fell | same as above, plus brands | Line-level sales with the brand |
| `assortment-churn` | customers | Per customer, the items it used to buy and stopped buying. Future: no data yet | window of "used to buy", silent days | Purchase history per customer and item (not held today) |
| `new-customers-funnel` | customers | Registered, first order, repeat order | cohort period | Portal registration date, order history |
| `receivables-aging` | receivables | Overdue receivables of each customer in aging buckets | bucket borders, as-of date | Settlement plugin aging (`manager-card-aging`) |
| `customer-concentration` | sales | Share of the top customers, ABC split | top N, class borders, period | Sales per counterparty |
| `order-frequency` | sales | Orders per customer and average order value | period | Orders and sales documents |
| `sales-by-manager-at-sale` | managers | Sales by the manager responsible when the sale happened | period | Sales plus responsible manager history |
| `sales-by-manager-current` | managers | Sales of the customers a manager is responsible for today | period | Sales plus current assignment |

Thresholds (drop percent, silent days, top N, bucket borders) are report parameters, never constants in code. Brands
are database entities, never a hardcoded list.

## Open questions

- **Definition of churn.** Drop against the previous period, against the same period last year, or silence for N days;
  whether a customer with seasonal buying counts; the minimum previous volume below which a drop is noise.
- **Which document is a "sale".** Settlement documents have a data-driven `category` (sale, return, payment,
  correction, bonus, supplier, payroll; see `docs/customer-metrics.md`). Which categories count, and whether
  corrections that move turnover are included, must be fixed once for all reports.
- **Responsible at the time of sale versus current.** The first needs a history of assignments that mivend may not
  keep today; the issue text says analytics may need both, so both are registered as separate reports.
- **Brand per sale.** Brand lives on the product; line-level sales data from the ERP must carry the product to attach it.
- **Cost of the store.** Storage and refresh load of the analytical store, and where it runs.

The catalog texts (title, description, note, area) are server strings in English; the manager translates them by
report code (`i18n/<locale>/analyticsReports.ts`) and shows the server text only for a code it does not know yet.

## Charts (later, not in #396)

Charts will be widgets inside entity cards, on the same contract: the customer card (dynamics of one customer, month or
day, up to 5 years, one line per currency, optionally per manager), the manager card (turnover of the manager's
customers), a manufacturer card and product sales when a product card exists in the manager.

## Not implemented yet

- Every report in the catalog (all are `planned`).
- The analytical store, its aggregation jobs and refresh schedule.
- Charts and tables, report parameters UI, export.
- Brand chips and the brand source for the brand reports.
- Scoping of report rows by counterparty scope and manager visibility.
- The assortment churn data (no source yet).
