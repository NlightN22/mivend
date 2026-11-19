# Analytics

How the manager portal "Analytics" menu item is built. Tracked in #363. The first iteration is a skeleton: a catalog
of planned reports, no report is implemented.

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
  that already read customer-wide data. Superadmin has every permission. Manager and operator do not get it by default;
  a role is changed in the Admin UI.

## Scope rule for the reports to come

A catalog entry is not data. Once a report returns rows, the rows stay inside the viewer's counterparty scope
(`docs/access-control.md`), applied before any filter or aggregate, like the manager card. Reports by responsible
manager are scoped twice: only the managers the viewer may see, and only their customers inside the viewer's scope. A
partial view must say so (visible against total), as the manager card does.

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

## Not implemented yet

- Every report in the catalog (all are `planned`).
- The analytical store, its aggregation jobs and refresh schedule.
- Charts and tables, report parameters UI, export.
- Brand chips and the brand source for the brand reports.
- Scoping of report rows by counterparty scope and manager visibility.
- The assortment churn data (no source yet).
- Russian titles and descriptions of the reports: they are server strings in English, like bulk operation titles.
