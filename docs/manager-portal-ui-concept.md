# Manager portal UI concept

Agreed direction for the redesign of `packages/manager` (issue #320). This is a **concept, not a
specification**: it fixes the shape of the portal and the reuse rules. Page-by-page details
(columns, filters, dashboard widgets) are refined one page at a time in later sessions and added
to this folder. Anything marked _not implemented yet_ stays in the menu as a placeholder or out of
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
  customer prices), as a customer via acting-as-customer, or as the manager themselves.
  Creating an order uses the same acting flow, started by the "Act as customer" button on the
  customer card (one click, opens the storefront in a new tab); the portal has no order-creation
  screen, and old `/catalog` and `/orders/new` links fall to the not-found page.

## Page types

| Type             | Shape                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard        | KPI row and widgets (deferred, see below)                                                                                                           |
| List             | Title, search, filters, table, pagination; row opens the entity card; multi-select opens a bulk action bar                                          |
| Quick side panel | Optional per entity, not part of the list by default and not used for orders (a row opens the card); key data and actions that need no deep context |
| Card | Header (name, status, key attributes, primary actions), compact KPI row, tabs; tabs reuse the entity lists with preset filters |
| Wizard | Bulk operations, step by step: select, parameters, review, run and result (`docs/bulk-operations.md`) |
| Settings | Sub-menu and forms |

Mobile: menu becomes a drawer or bottom bar, tables become compact lists or cards, the side panel
becomes a full screen, tabs show the main ones plus "More".

## Styles and themes

- **Same look as the storefront.** The manager portal uses the same ui-kit components, tokens and
  typography as the client portal. Shared parts (tables, filter chips, pagination, badges, side
  panel, tabs, KPI tiles, buttons) live in `packages/ui-kit`; nothing is restyled inside the manager.
- **Colors only from ui-kit.** No color literal and no `--palette-*` in `packages/manager`; only
  role tokens from `packages/ui-kit/src/styles/` (palette, light and dark roles), enforced by
  stylelint in the manager too. A missing role is added to both theme files, never inline.
- **Two themes: light and dark.** Both are supported in the manager, switched the same way as in
  the storefront (the manager's PrimeVue preset follows the same dark selector).
- **One state per button role** as in `docs/ui-standards.md`.
- Every changed page is checked by screenshot in both themes, desktop and phone width.

## Order card

One page, no tabs, top to bottom:

1. **Header.** Breadcrumb, order number, status, customer, manager, created, then the order's own
   fields in the header (contract select, delivery, price type, ERP registration badge whose
   popover holds the document number, registration status and any ERP rejection reason). A manual
   payment waiting for confirmation is a header chip whose popover holds the "received" action.
   Actions:
   the primary buttons (confirm, cancel order) and one "..." menu: recompute, proforma invoices
   (modal with the order's proforma invoices, the request action and an "Open in the list" link
   to the proforma list filtered by the order number), documents (modal), reservation actions and,
   only when lines exceed the available stock, "Cut lines to available stock".
   The documents list has no manager page yet, so its modal has no list link. There is no
   whole-order "send to approval" action: a price change goes to approval by itself when the
   price-adjustment rules say so; per-line sending does not exist either.
2. **Customer summary.** One compact card: sales last 30 days, open orders, outstanding balance,
   available credit, credit limit (same data as the customer card) and the overdue debt (amount, and
   the days since the oldest overdue lot, in the danger tone). The overdue figure is the same FIFO
   aging the customer portal shows, read through `counterpartyOverdue` (needs the counterparty
   credit right and the counterparty in the caller's scope); without the right it is not shown.
3. **Lines table.** Built from the ui-kit document lines kit (`MvDocumentLines`, see `docs/ui-standards.md`,
   "Document lines kit"). Header row in the style of the orders list; value cells and their column labels are
   left-aligned, so the flag icon after a value never makes the alignment look broken. Columns: Product (image, name,
   SKU), Qty, Available, Reserve (display only), Price, Discount, Retro bonus (conditional), Total. A
   problem is shown in the cell where it occurs; a stripe on the row's left edge shows the worst one (red block or
   hold, orange approval needed, yellow warn, green clean). Tones come from the check's policy consequence, so branch
   overrides apply. A flagged cell shows its plain value and a small icon button, no status text. On desktop, hovering
   or focusing the icon shows a styled tooltip with the same findings and consequence; clicking opens the popover
   with them plus Confirm (hidden when the order cannot be confirmed) and Reject (opens the cancel dialog). On a
   phone the tap opens the popover as a bottom sheet. The popover also carries what used to be separate panels: the
   failed automatic reserve (reason, the SKU detail, time, what to do) in the Reserve cell of the line it names,
   quantity cut for lack of stock in the Available cell of its line, a pending price approval in the Price cell, a
   discount over the employee's limit in the Discount cell, a contract the buyer lacks in the Available cell and next
   to the contract select. A mark by the total carries findings about the order itself (credit, and cut or failure
   notes naming no remaining line). Nothing is repeated in a panel above the table.
4. **Selecting, editing and adding positions.** The toolbar is the title with a muted count ("7 positions"); there is
   no "Add by article" input and no "Select" toggle. On desktop a checkbox column is always visible (header checkbox
   selects all); with one row selected a bar appears above the table ("Selected: N", a "Delete" button) and the
   selected rows are tinted. Every row has a pencil and a trash button; the trash deletes that one position behind the
   confirm dialog. Edits are offered only while the order is not yet sent to the ERP and not terminal. A phone has no
   checkboxes (a long-press entry is a later task; `useLineSelection` stays reusable).

   **Edit mode** is inline: the row is tinted green with a green left accent, Qty becomes a stepper, Price an input
   with the currency suffix and Discount an input with "%", and the actions become a green check and a red cross.
   Available and Reserve keep their flags, so the shortfall stays visible while the quantity is reduced; the Total
   updates live. Price and discount are two views of one value, measured from the customer's reference price
   (`orderLineDiscountLimits.discountPercent`, see `docs/access-control.md`): editing the percent recomputes the
   price and the other way round, a negative percent is a surcharge. Under the Discount input a hint shows the
   employee's limit; a deepening past it shows "will be sent for approval" and a compact reason input appears under
   the price. Saving goes through `requestPriceAdjustment` (free when reducing, approval path otherwise) and the
   quantity mutations. The rules are the server's; the hint only mirrors them.

   **Adding** a position: a dashed full-width "Add position" button under the table swaps for an inline add row
   (green outline): product search (SKU or name, `productVariants`), quantity stepper, Available, Reserve, Price and
   Discount, a check and a cross. Picking a product calls `orderLineQuote` and prefills Price and Discount (0) with the
   customer's price for the chosen quantity (re-quoted ~300 ms after the quantity changes; a price the manager typed
   is kept). The quote also carries the article's ERP sales unit (`unitName`, the variant's unit data) and the required
   multiple (the pack rule or enforced multiplicity): the stepper steps by it, the unit shows as muted text after it,
   and a quantity off the multiple shows the add's refusal text at once. The lines table and the edit row show the same
   muted unit under the quantity; nothing is shown for a variant without unit data and shows the warehouse stock; a refusal (no customer price, no seller organization, ambiguous article) shows inline at
   once. Price and percent are linked as in edit mode. Confirming calls `addOrderLineBySku`; quantity or multiple
   refusals stay inline. Only a price the manager changed from the prefilled one is then applied to the new line
   through the price path in the same action (two server calls); if that second call fails the line stays added
   and a notice says the price was not applied, or that it was sent for approval. The form is the same on a phone,
   as a card.
5. **Totals block.** Right-aligned stacked rows under the table (label left, value right; full width on a phone):
   Positions, Weight total and Volume total (always shown; the known lines are summed and a muted "n positions
   without data" says how many have no unit data), Subtotal, Discount total in money (reference price minus effective
   price over lines; a surcharge line subtracts nothing), Retro bonus total in money (only when the column below is
   shown), Delivery, Paid in ERP (a lower bound, only when known) and the emphasised order Total. Financial
   findings belong to the total and keep their mark on the Total row.

   **Retro bonus column.** When the order's counterparty has at least one active retro-bonus rule,
   the lines table gets a "Retro bonus" column after Discount: the percent that covers the line and,
   for a rule without a threshold, that percent of the line total; the totals block adds the expected total.
   With no active rule the column and the totals figure are absent. Coverage is evaluated from the
   rule's explicit product list or its all-products flag; a rule whose product selection is an
   ERP-evaluated filter (empty member list) cannot be evaluated here and shows nothing for its lines,
   and a rule with a threshold shows the percent without an amount. When several rules cover a line
   the deepest percent wins. The page cannot tell "the customer has no rules" from "this employee may not
   read them" (an order or counterparty outside the caller's scope answers like no rules): both hide the
   column, on purpose, so the column never reveals what the caller may not see. It is display only: it never changes an order price, a discount or a total.
6. **Below the table only.** Status history as a vertical timeline (newest first, all statuses,
   hidden when empty) and a compact list of the order's approval requests.

Phone width: the table turns into one card per row with the same stripe and flagged cells, the
action menu keeps everything the buttons show, the summary wraps.

## Proforma invoice card

A view-only page at `/proforma-invoices/:id` (reached from the order card's proforma modal). Reissuing happens through an order edit, so the card has no withdraw, reissue or send
action. Blocks, top to bottom:

1. **Header.** Number with a version badge, the display status (current, superseded, cancelled; a proforma
   invoice is never shown as paid), issue and pay-by dates, the order link. Two buttons for the print
   form: **Open** (inline, a new tab) and **Download** (`?download=1`, an attachment, for forwarding the
   file); until the PDF is ready both give way to a disabled "PDF is being prepared". The "..." menu
   holds copy number, show in the list and open the order.
2. **Parties.** Customer (link to the customer card) and the seller organization with its tax ids,
   plus the order card's compact customer summary (reused, not copied).
3. **Lines.** The ui-kit document lines kit in view-only mode (no selection, no actions column) and the
   totals block: positions, subtotal, discount, total. The snapshot has no delivery, unit or product
   image, so none is shown; there are no flags because the snapshot has no problem to report.
4. **Below.** Payments applied to this version (link to the payments list by number, paid and remaining;
   informational, the debt comes from the ERP sales invoice), the version history, related documents.

The version history is a vertical timeline (newest first, only when there is more than one version).
Each version keeps its own immutable line snapshot, so every entry shows its date, amount, the cause the
model records (`kind`: order placed, order changed, by shipment), the amount delta and the number of
lines added, removed and changed against the previous version, and links to open that version.

Server: the admin query `proformaInvoice(id)` (ReadProformaInvoice, the same scope as
`visibleProformaInvoices`; a hidden or unknown id is null) with `payments` and `versions` fields that
inherit the parent's visibility. The PDF route `/document-pdf/:uuid` answers `inline` by default and
`attachment` for `?download=1`, with the same session and scope check.

## Menu

| Item | Content | Status |
| --- | --- | --- |
| Dashboard | KPI and widgets | exists, redesign deferred |
| Customers | list, card with tabs: orders, proforma invoices, payments, discounts | exists |
| Documents (group) | Orders, Proforma invoices, Payments, Discounts | exists |
| Settlements | one list of the ERP documents that move a customer's settlement; its own entry right after Documents, shown only with `ReadSettlementDocument` (desktop sidebar and the mobile More sheet) | exists |
| Approvals | list and card (awaiting approval is a quick filter or counter) | exists |
| Team | users and managers | exists |
| Bulk operations | catalog and one wizard, batch history; see `docs/bulk-operations.md` (#337) | built on the framework: catalog, wizard, History tab (#337) |
| Analytics | placeholder | not implemented yet |
| Settings | roles, branches, policies, and so on | exists |

The Catalog item is removed from the portal (see principles).

## Approvals

One flow for every kind of request (price adjustment, discount grant, payment term extension and
whatever the workflow engine adds). A discount or price request is not a separate document: it is
an approval of that kind, with its own type, subject, requester, requested value and chain of steps.

- **Inbox** (`/approvals`): the standard entity list. Chips "Awaiting me" (default), "My requests"
  and "All" carry counts that follow the active filters; the Filter builder offers type, requested by,
  submitted date and status; sortable headers (request number, type, submitted, status), saved views,
  URL sync, search by request number, server-side pagination. "Current step" is a column that opens
  hidden. Rows never exceed what the server lets the person see (department and price-type scope are
  applied first).
- **Decision page** (`/approvals/:id`): header (number, type, status, escalation mark, requester and
  time, link to the order or customer), request details (old and requested value, the percent change
  for a price request, the current step and its role), a vertical steps timeline (newest first, with
  decision comments), and the decision panel. Approve and Reject are disabled with a reason when the
  server reports the viewer may not decide the current step (`viewerCanApprove` and `viewerCanReject`, both
  from `ApprovalRequestService.mayDecide`, the one predicate `decide` also uses); a reject needs a comment. Escalation is offered only to the requester, as the
  server enforces.
- Server list arguments (`ApprovalListOptions`): `requestTypes`, `statuses`, `requestedByAdministratorId`,
  `createdFrom` (inclusive), `createdTo` (exclusive), `search` (request number), `sortField`
  (`id`, `requestType`, `status`, `createdAt`, `decidedAt`) and `sortDir`; `take` is clamped to 0..200
  and `take: 0` returns the count only.
- `viewerCanApprove` and `viewerCanReject` are single-request fields (a few lookups each): do not
  select them in list queries; the inbox does not.
- `viewerCanApprove` includes the approver-eligibility rule (the approver's own discount limit for
  price requests); rejecting needs only the step permission, so a refused approve with an allowed
  reject is shown as "your discount limit does not cover this request".
- Not shown yet: the policy that required the approval (requests do not store a link to the check
  policy that created them) and an approval request number separate from the row id.

## Data notes

- Orders already store who placed them (`placedByAdministratorId`, set from the staff session or
  the acting session). Keep it on every order path and show it in the orders table.
- A customer has one reassignable owner plus team members. No assignment history is kept; if
  analytics later needs "by responsible at the time of sale" and "by current responsible", it is
  decided inside the analytics work.

## Proforma invoices list

Same list shape as orders (`components/proforma-invoices/`): the numeric proforma invoice number
first, then date, customer, order, status, amount and due date. Status chips with counts (All,
Current, Superseded, Cancelled) follow the search; the search box matches the number (an order
number finds its `<order number>-NN` documents), the customer name and INN. Views, URL sync
(`search`, `view`, `counterpartyId`, `pageSize`, `page`), top and bottom pagination and the mobile
card view are shared with orders. A row opens the order card; there is no quick panel and no
actions. The Filter builder (number, date, customer, order, status, amount, due date) and the
sortable headers (all but order) are applied on the server: `visibleProformaInvoices` takes
`options { filter sort }` over a fixed field whitelist, inside the caller's visible set. The chips
and their counts follow the search and the builder conditions; the default sort is newest first.
Money columns are end-aligned (`align: 'end'` on the table column).

## Payments list

Same list shape as orders (`components/payments/`): the numeric payment number first, then date,
customer, proforma invoice, order, source, status and amount. Status chips with counts (All,
Captured, Pending, Failed, Refunded) follow the search and the Filter builder conditions; the
search box matches the payment number, the customer name and INN. Views, URL sync (`search`,
`view`, `filters`, `sortField`, `sortDir`, `counterpartyId`, `pageSize`, `page`), top and bottom
pagination and the mobile card view are shared with orders. The customer links to its card, the
order to the order card, the proforma invoice to the proforma list searched by its number; there
is no quick panel and no row actions. A row click (outside its links) and the payment number open
the payment card (`/payments/:id`). The Filter builder and the sortable headers (all but
proforma invoice and order) are applied on the server: `visiblePayments` takes
`options { filter sort }` over a fixed field whitelist, inside the caller's visible set (the
scope of the payment's proforma invoice). The default sort is newest first. Money columns are
end-aligned (`align: 'end'` on the table column).

## Discounts list

The registry of discount grants at `/discounts` (menu entry "Discounts"), `components/discounts/`: the numeric discount
number first, then date, customer, price type, product group, discount percent, valid to and status (valid from and the
justification start hidden). One row is one request through its whole life (pending, rejected, or approved and then
active, expiring soon or expired); an ERP-pushed rule is a row without a request. The number is taken when the request
is filed and the grant it becomes keeps it. Status chips with counts (All, Active, Expiring soon, Pending approval,
Rejected; Expired through the Status filter) follow the search and the Filter builder conditions; the search box matches
the number, price type, product group and customer names. Views (key `discounts`), URL sync (`search`, `view`,
`filters`, `sortField`, `sortDir`, `pageSize`, `page`), pagination and the mobile card view are shared with the other
lists; `?search=<customer>` still works for the link from the customers list. A row click and the number open the
discount request card (`/approvals/:id`); a row without a request is not clickable. "New discount grant" sits in the
toolbar and opens the form above the list; "Renew" appears under valid to on an expiring-soon row. `discountRegistryPage`
takes `options { filter sort search status }` over a fixed field whitelist, inside the caller's allowed price types, and
`take: 0` returns the count only. The default sort is newest first.

## Settlements list

One list of every ERP document that affects the settlement with a customer (sales invoices,
payments, returns, corrections; whatever the document type table holds, no type is hardcoded),
`components/settlements/`. A row is one document's entry on one contract: document number as the ERP
sends it, date, type badge, customer, contract, organization, order, proforma invoice and the signed
amount (plus raises the customer's debt, minus lowers it). The chips are built from the data: All
and one per document type, counted over the current search and Filter builder conditions
(`visibleSettlementTypeCounts`). The search box matches the document number, customer name and INN
and the order codes. The customer links to its card, the order to the order card (only an order of
the same customer resolves), the proforma invoice to the proforma list searched by its number (the
proforma whose sales invoice number equals the document number). Views, URL sync, pagination and
mobile cards are shared with the payments list. `visibleSettlementDocuments` takes
`options { documentType search filter sort }` and `counterpartyId`, inside the counterparties the
caller may see; `SettlementsList` accepts a fixed `counterpartyId` so the same list can later sit
in the customer card. Gated by its own `ReadSettlementDocument` (granted to every default role; it shows no credit
limit, balance or overdue figure, unlike `ReadCounterpartyCredit`, though the signed amounts can be added up), with the counterparty scope on top; the proforma number is a raw read of the acquiring plugin's
`proforma_invoice` table (no plugin dependency; the server always loads both). The per-row
correlated order-code aggregation used by the search and the type counts is the first thing to
profile when the settlements table grows (check the plan once on a prod-sized table). No running balance is shown because the model keeps none per document.

## Payment card

Read-only page for one payment (`pages/payments/PaymentDetailPage.vue`, parts under
`components/payment-detail/`): header with the payment number, status chip, amount, source and
creation date, then panels for the payment (amount, currency, status, source, provider reference,
created), the customer (name linking to its card, INN), the proforma invoice (number linking to the
proforma list searched by it, version, amount, due date, status) and the order (number linking to
the order card, status, total). A vertical refunds timeline, newest first and capped at the 50
newest, shows only when there are refunds: number, status, amount, date and reason. The model
records no status history and no initiator, so neither is shown. There are no actions; the header
offers copy number, show in list (the list searched by the number) and open order as plain links.
Mobile is one column. Data comes from the admin query `payment(id)`: same `ReadPayment` permission
and the same proforma-derived scope as `visiblePayments`, a foreign, unknown or malformed id
(anything but 1 to 9 digits) is null and shown as "Payment not found". Refunds, proforma and order
summaries are batched per request (`PaymentCardLoader`); the `PaymentCard` type exists in the Admin
schema only.

## Not implemented yet

Analytics, manager card (plan/fact, dynamics, tasks), tasks and "My tasks", dashboard charts,
quick article entry, change-of-assignment action, dashboard redesign (a separate step).

## Order of work

1. Entity lists in the standard shape, each with a preset-filter variant for its parent card.
2. Customer card with tabs on top of those lists (the card tab layout comes in this stage, later;
   until then the card keeps its current layout with the "Act as customer" button).
3. Shell and menu per this document.
4. Dashboard, then the deferred items, one page at a time.

## Filter mechanism inventory (#337)

Rule: every server list that filters or sorts uses the shared list filter engine
(`packages/shared/src/list-filter-engine.ts`) and the standard filter builder in the portal.
Deviations below are follow-ups, not migrated in #337. "Verify" marks a mechanism read from the
portal API layer only and not re-checked on the server.

| List | Server mechanism | Status |
| --- | --- | --- |
| Proforma invoices | Shared engine | Conforms |
| Payments | Shared engine | Conforms |
| Settlements | Shared engine | Conforms |
| Customers (counterparties) | Shared engine (field whitelist in `counterparty-list-query.ts`), legacy list args beside it; sort is still `counterparty-sort.ts` | Filter conforms; sort follow-up |
| Customer activation list (bulk) | Same counterparty filter plus search and readiness chip | Conforms |
| Orders | Native Vendure list options (`filter`/`sort`) via `orders-filter.ts` | Deviates |
| Approvals inbox | Bespoke query service (`approval-request-query.service.ts`) with its own filter args | Deviates |
| Discounts | Bespoke registry list args (verify) | Deviates |
| Team / users | Native Vendure administrator list options (verify) | Deviates |
| Bulk history | Bespoke `BulkBatchFilter` input (fixed fields, own SQL) | Deviates |
| Entity history panel | Bespoke `EntityVersionListOptions` (typed columns) | Deviates |
| Roles | Native Vendure role list (verify) | Deviates |
