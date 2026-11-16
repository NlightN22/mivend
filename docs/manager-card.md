# Manager card (manager portal)

Concept for the card behind a row of `/team`. Issue #362. Customer figures follow `docs/customer-metrics.md`; scope
follows `docs/access-control.md`. Nothing here is built yet.

## Who sees what

- A **manager** opens only their own card. A **department head** opens the cards of the managers of their department.
  A **general director** (scope `all`) opens every card. The rule is the existing access scope on the manager's
  department; no new scope kind.
- Every figure is computed over the customers the viewer may see (counterparty visibility scope) and that belong to
  the manager. A viewer who sees only part of a manager's customers gets figures for that part and a visible
  "partial: n of m customers" note, never a silently smaller number.
- New permission `ReadManagerCard`, held by the three roles above. The card never shows another manager's credit or
  approval data; it shows sales, debt and customer activity only.

## Which customers belong to the manager

A customer belongs to the manager when `assignedManagerId` is that manager (the single owner). Co-managers (team
members) are shown as a count "also working with n customers" and are not added to the figures: one customer in one
manager's numbers, so department totals add up. History follows the **current** owner: after a reassignment the
customer's past sales move with it. The card says so in a hint.

## Phase 1: figures from data we already have

| Block | Figures | Source |
| --- | --- | --- |
| Sales | Last 30 days against the previous 30; this month so far against the same days of last month and of the same month last year; year to date against last year to date; average check; sale documents count | Settlement entries of the document types that move turnover (`docs/customer-metrics.md`), summed over the manager's customers by the daily rollup |
| Receivables | Total debt, overdue amount and its share of the debt, aging buckets (not due, 1-30, 31-60, over 60 days), the five largest overdue debtors with links | `counterpartyOverdue` FIFO aging per customer, summed |
| Lost customers | Customers who bought in the last 12 months but not for 60, 90 or 180 days (the viewer picks the threshold, default 90), with the 12-month turnover they carry, largest first, as a standard list | Date of the last sale entry per customer; not `lastOrderAt`, which only knows portal orders |
| Customer dynamics | Active customers (bought in the period) against the previous period and the same period last year; new customers (first sale in the period); returned customers (bought again after at least 90 idle days); lost customers (bought in the previous period, not in this one) | Same rollup; a customer is counted by its first and last sale day |
| Work in progress | Open orders count and amount, orders awaiting approval | Orders of the manager's customers in a non-terminal state |

Every tile shows the value, the comparison value, and the change (absolute and percent; "new" when the comparison
period is empty), plus `computedAt`. Periods use calendar days in the business time zone, today included.

The card is a page with a header (name, department, customer count, `computedAt`) and tabs: **Overview** (the tiles
and the lost-customers list), **Customers** and **Orders** (the standard lists with a fixed parent filter, as on the
customer card, so the filter builder, sorting, saved views and bulk actions are the same as everywhere else).

## Phase 2: needs data we do not have

- **Plan against fact.** No plan reaches mivend from the ERP. Proposal: a mivend-owned monthly plan per manager (sales
  amount, optionally per manufacturer) entered by the department head on the card; the ERP can send it later without
  changing the card. The plan tile shows plan, fact, percent done and the run rate needed to reach it.
- **Sales by key brand.** The product has a manufacturer entity (the ERP's own id, name from its stream), so the unit
  is there. Sales by manufacturer need line-level sales: the settlement stream carries document amounts, not lines. Until
  the ERP side agrees to send turnover by manufacturer per customer and month, a "by brand" block can only count
  portal orders (a part of the real sales) and must say so on the tile.

## Architecture

Reuse the daily rollup of `docs/customer-metrics.md` (`counterparty_metrics_daily`, recomputed per customer under the
customer lock). The manager's figures are one grouped read over the rollup joined to `assignedManagerId`, bounded by
the viewer's visible customers. Dynamics and lost-customer figures need the rollup (the on-the-fly path in
`counterpartyMetrics` cannot give them cheaply); if the rollup is not built when this starts, building it is the first
step of the work and a separate change. The list queries use the shared list filter engine; no bespoke filter code.

## Open questions

1. Phase 1 as the first release, plan and brands later: confirm.
2. Plan: mivend-owned entry by the head, or wait for an ERP stream.
3. Brands: ask the ERP side for turnover by manufacturer per customer and month, or accept the portal-order proxy.
4. Lost-customer thresholds 60 / 90 / 180 days and the "returned after 90 idle days" rule: confirm or change.
5. Attribution by the current owner (history moves with a reassignment): confirm.
