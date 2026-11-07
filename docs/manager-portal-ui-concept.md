# Manager portal UI concept

Agreed direction for the redesign of `packages/manager` (issue #320). This is a **concept, not a
specification**: it fixes the shape of the portal and the reuse rules. Page-by-page details
(columns, filters, dashboard widgets) are refined one page at a time in later sessions and added
to this folder. Anything marked *not implemented yet* stays in the menu as a placeholder or out of
the first stage. Colors and button states follow `docs/ui-standards.md`; table shape follows the
`manager-table-standard` skill.

## Principles

- **One entity, one business logic, many contexts.** Build the entity tables first (orders,
  proforma invoices, payments, discounts, customers, approvals), then reuse the same table in other
  places with a preset filter. Example: the customer card's Orders tab is the global orders table
  with `customer` fixed. Same columns, statuses, filters, actions and pagination everywhere.
- **Scope is enforced on the server.** A route or a preset filter never grants access; every
  context is checked through `AccessScopeService` (`docs/access-control.md`).
- **Stay close to the current entities.** No new aggregate registries ("all documents"). A group
  in the menu links to the existing per-entity lists.
- **The portal shows, it does not compute.** Heavy analytics will live in a separate analytical
  store; the portal only renders the ready tables and charts it returns.
- **No second catalog.** The catalog is viewed through the storefront: anonymous (no
  customer prices), as a customer via acting-as-customer (#322), or as the manager themselves.
  Creating an order uses the same acting flow; the portal has no order-creation screen.

## Page types

| Type | Shape |
| --- | --- |
| Dashboard | KPI row and widgets (deferred, see below) |
| List | Title, search, filters, table, pagination; row opens a quick side panel; multi-select opens a bulk action bar |
| Quick side panel | Key data and the actions that need no deep context; "Open" goes to the full card |
| Card | Header (name, status, key attributes, primary actions), compact KPI row, tabs; tabs reuse the entity lists with preset filters |
| Wizard | Bulk operations, step by step |
| Settings | Sub-menu and forms |

Mobile: menu becomes a drawer or bottom bar, tables become compact lists or cards, the side panel
becomes a full screen, tabs show the main ones plus "More".

## Menu

| Item | Content | Status |
| --- | --- | --- |
| Dashboard | KPI and widgets | exists, redesign deferred |
| Customers | list, card with tabs: orders, proforma invoices, payments, discounts | exists |
| Documents (group) | Orders, Proforma invoices, Payments, Discount requests | exists |
| Approvals | list and card (awaiting approval is a quick filter or counter) | exists |
| Team | users and managers | exists |
| Bulk operations | wizard | exists |
| Analytics | placeholder | not implemented yet |
| Settings | roles, branches, policies, and so on | exists |

The Catalog item is removed from the portal (see principles).

## Data notes

- Orders already store who placed them (`placedByAdministratorId`, set from the staff session or
  the acting session). Keep it on every order path and show it in the orders table.
- A customer has one reassignable owner plus team members. No assignment history is kept; if
  analytics later needs "by responsible at the time of sale" and "by current responsible", it is
  decided inside the analytics work.

## Not implemented yet

Analytics, manager card (plan/fact, dynamics, tasks), tasks and "My tasks", dashboard charts,
quick article entry, change-of-assignment action, dashboard redesign (a separate step).

## Order of work

1. Entity lists in the standard shape, each with a preset-filter variant for its parent card.
2. Customer card with tabs on top of those lists.
3. Shell and menu per this document.
4. Dashboard, then the deferred items, one page at a time.
