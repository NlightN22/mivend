# Credit control: scope map and open questions

Status: **discussion, nothing here is decided unless marked "Decided"**. Written 2026-10-06 to gather
everything about limits/receivables in one place before a dedicated implementation session.

## What exists today

| Area | Where | State |
| --- | --- | --- |
| Model "aggregate ceiling + per-contract sublimit" | `docs/ai/erp-streams-map.md` ("Per-contract credit limits", #50) | Decided, partly built |
| Comparison | `CreditLimitCheckService.decide(counterparty, contract, pending)` in `plugin-counterparty` | Built; contract check always `undetermined` (#151) |
| Credit-term approval | `credit-term-*.ts` in `plugin-counterparty` (#142 `creditTermApproval`) | Workflow not wired into checkout |
| Deferred checkout | `plugin-deferred-payment` (eligibility needs `creditLimit > 0`, open-order exposure, warning flag) | Built (#180), docs/payments.md |
| Contract data | `contract` stream -> `Contract` entity (limit, `controlledIndividually`, `debtDaysLimit`, `paymentDelayDays`) | Stored |
| Counterparty balance | `CounterpartyCreditBalanceChanged` (search-platform#129) | Consumed, almost empty on staging |
| Settlement ledger / receivables | #45, docs/payments.md | Not built |

Related issues: #50 (per-org/contract limits), #151 (per-contract balance), #45 (settlement ledger),
#48 (aggregate vs per-organization UI), #31 (manager finance/AR view), #133 (dashboard counterparty
pages), #142/#143/#150 (closed: deferred checkout), #172 in search-platform (main contract reference).

## Data on staging (2026-10-06)

- Contracts: 35,512; limit set on 6,679; `controlledIndividually` on 150; `debtDaysLimit` on 6,136;
  `paymentDelayDays` empty on all.
- Counterparties: 25,591; `creditLimit` = 0 and `paymentDelayDays` = 0 on all; balance non-zero on 4.
  The counterparty stream never carries limit/delay/priceType/branch (see `counterparty.handler.ts`).
- Consequence: the deferred payment method is not eligible for any real staging buyer, because
  eligibility reads the counterparty limit that nothing fills.
- Customer -> counterparty is one-to-one from the customer side (one counterparty custom field);
  one counterparty can have many customers.

## Owner's positions so far (to confirm, not yet decided)

1. The counterparty-level limit is **our own calculation** from contracts; ERP is a data source,
   not a mechanism to copy.
2. Receivables should come from a **1C export**: every counterparty that has receivables plus the
   documents that make them up (orders, sales, ...), so we get the amount and the breakdown and
   can show the customer "these documents, this debt, please pay".
3. The **order should not carry a contract**: it adds complexity for the customer; managers can
   distribute it later. Ideally a counterparty has one contract, reality has many.
4. Limits should be computed by a **worker/scheduled job**, not during import (import would slow down).
5. Changing a contract or limit in the manager portal must reach 1C, so write-back streams are needed.

## Open questions

1. **Counterparty-level limit formula**: sum of contract limits, limit of the main contract
   (search-platform#172 provides the reference), max, or something else?
2. **Contract-level checks vs "no contract on the order"**: per-contract limits need an order->contract
   attribution (`contractId` already travels on `order-changed`, #123). If the order carries no
   contract, are per-contract limits informational only, or enforced when the manager assigns the contract?
3. **Receivables source**: new 1C export of debtors + documents (owner's plan) versus the existing
   settlement-register idea (#45) and balance stream (#129). Who builds it, what shape, what is the
   contract of the event, and does it replace `CounterpartyCreditBalanceChanged`?
4. **Per-contract balance (#151)**: if the export carries documents per contract, do we compute the
   per-contract balance ourselves, or ask for a stream?
5. **Where it is computed**: a scheduled worker task (owner's leaning) — which trigger (on receivable
   change, periodic), and how it avoids the importer's load problems.
6. **Write-back to 1C**: which entities flow back (contract, limit, payment terms), master of data
   (docs/sync.md currently says ERP is master for credit limit), conflict handling, and the outbound
   contract in `event-contracts`.
7. **Frontend**: customer view (limit, debts, documents to pay) and manager view (#48 aggregate vs
   per-organization, #31 finance rollup, #133 dashboard); which exists as mock only.
8. **Presence vs zero** for `creditLimit`/`debtDaysLimit`/`paymentDelayDays` (known ambiguity in
   `erp-streams-map.md`): must be resolved before any gate treats a value as "no limit".
9. **Deferred checkout eligibility** (`creditLimit > 0` on the counterparty) must switch to the
   computed limit once question 1 is decided, otherwise the feature stays dead on real data.
10. **Multiple organizations**: limits and balances per (counterparty, organization) (#50, docs/payments.md)
    versus the flat counterparty total in positions 1-2.

## Suggested next step

Settle questions 1-3 (formula, contract on order, receivables source) in a discussion, record the
answers here, then split implementation into: ERP export + consumer, calculation job, checkout/eligibility
wiring, write-back streams, frontend.
