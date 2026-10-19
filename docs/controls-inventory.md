# Controls inventory (#241)

Every control that exists in the code today, classified against `docs/checks-and-policies.md`.
Order controls were migrated in #241 (state per row below); the manager controls are #242.
Rule text of a concrete control stays in its domain doc; this file only classifies.

Status values: **provider** (in the framework), **migrated** (was a guard or a flag, now a provider and
policy rows, #241), **open** (not migrated yet, issue linked), **stays outside** (a guard that is not a business
control, reason given).

## Order subject

| # | Control (code today) | Where it runs | On failure now | Target `code` / stages | Target default | Status |
|---|---|---|---|---|---|---|
| 1 | Contract with the storage organization (#237) | providers in `erp-integration` | `warn` | `erp.contract-with-storage-organization`, all order stages | `warn` | provider |
| 2 | Organization stock (#237) | providers in `erp-integration` | `warn` | `erp.organization-stock` | `warn` | provider |
| 3 | Variant without a seller organization (#201) | provider `order.line-without-organization` (plugin-acquiring); `organizationOrderGuard` only stamps; the reserve keeps its `findErpExportGaps` gate | finding; checkout is not refused | `order.line-without-organization`: `checkout` warn, `pre-reserve` hold, `on-edit` warn | as left | migrated |
| 4 | No usable order contract (#205) | provider `order.contract-unresolved` (plugin-acquiring); `contractOrderGuard` only stamps | finding; checkout is not refused | `order.contract-unresolved`: same stages | as left | migrated |
| 5 | ERP export data gaps: customer id, product id, warehouse id | provider `erp.export-data-missing` (plugin-reservation); `findErpExportGaps` stays as the reserve's transactional gate | finding; the reserve still refuses an unexportable order | `erp.export-data-missing`: same stages | as left | migrated (hard gate stays) |
| 6 | Quantity multiplicity (#103, #219) | provider `order.multiplicity` (plugin-moq); the interceptor and the line editor read the `cart` policy; the reserve keeps its defense-in-depth check | cart: quantity refused when the policy blocks; findings otherwise | `order.multiplicity`: `cart` block, `pre-reserve` hold, `on-edit` warn; all off by default, a branch override turns it on | as left | migrated |
| 7 | Warehouse stock at reserve | `reserveOrder` (`InsufficientStockError`); free stock also computed by `OrderLineAvailabilityService` (#233) and ATP | reserve fails, reservation state FAILED | the order page describes it (`erp.organization-stock` and the availability columns); the reserve gate stays | n/a | stays outside (hard transactional gate) |
| 8 | Credit limit exceeded (#222) | provider `credit.limit` (plugin-deferred-payment); the placement decision reads the `checkout` policy of the order's branch; the customer's explicit acknowledgement step is unchanged | `hold`: manager confirmation; `warn`/`info`: `erp-now` after the acknowledgement; disabled: no limit control | `credit.limit`: `checkout` hold, `on-edit` warn | as left | migrated |
| 9 | Freight needs an active trading point | provider `delivery.freight-trading-point` (plugin-freight-shipping); the guard is gone | finding; checkout is not refused | same stages as row 3 | as left | migrated |
| 10 | Staff confirmation hold | `OrderChecksService.isHeld`, `OrderSendHoldService` | n/a, consumer of policies | part of the framework | n/a | provider (framework) |
| 11 | ERP rejects a registered order (#204) | inbound ERP result handling | order marked rejected, shown on the order | later: finding `erp.registration-rejected` (display only) | `info` | stays outside for now (an inbound fact, not a pre-check) |

## Manager subject (#242)

| # | Control | Where | On failure now | Target | Status |
|---|---|---|---|---|---|
| 12 | Reservation extension limit per role (max extra days), fail closed without a row | provider `manager.reservation-extension-days` (plugin-reservation); `ReservationExtensionService` evaluates it | policy `block` (default): extension refused | `manager.reservation-extension-days`, stage `extend-reservation` | done (#242) |
| 13 | Credit-term limit (days, amount), gate hard-codes the `department-head` role | provider `manager.credit-term-extension` (plugin-counterparty); `CreditTermService` evaluates it; the gate service is gone | policy `require-approval` (default): escalated chain | `manager.credit-term-extension`, stage `extend-credit-term` | done (#242); the limit role is the policy recipient, no role code in code |
| 14 | Price adjustment below the floor price (no floor = approval) | provider `manager.price-adjustment-floor` (plugin-price-entry); `PriceAdjustmentService` evaluates it; the gate service is gone | policy `require-approval` (default): approval request | `manager.price-adjustment-floor`, stage `adjust-price` | done (#242) |
| 15 | Discount grant needs justification and approval | `DiscountGrantService`, approval-workflow | justification missing = validation error; approval chain | approval chain stays in `approval-workflow`; the consequence is `require-approval` | stays outside (input validation) + executor |

## Guards that intentionally stay outside

These protect data ownership or the legality of a state transition, not a business rule a manager
should be able to relax. No finding, no policy.

| Guard | Why it stays |
|---|---|
| `externalOrderProcess`, `isExternal` refusals in reserve, edit and proforma issuing | the ERP owns the order |
| `ReplicaOrderInterceptor` / `replica-order.guard` | a replica is read-only for humans, sync owns it |
| `decideCancellation`, `decideEdit` (`order-cancellation.decision.ts`), `order-line-edit.guard` | state-transition legality (cancel and edit share one stage-facts rule) |
| Portal binding needs a unique inn (#225): empty inn, or another active counterparty with the same normalized inn and a live portal Customer, refuses `activateCounterpartyPortalAccess`, the bulk toggle and `assignCustomerToCounterparty` (`counterparty-inn-guard.ts`, lock `counterparty-inn:<digits>`). Staff find cases by the `innStatus` field / list filter; the one-off report is `infrastructure/scripts/report-inn-duplicates.sql` | a data requirement for binding, like the phone/email gate; the fix is in the ERP, not a manager waiver |
| Proforma issuing preconditions (not external, not cancelled, placed) | state legality |
| `packagesOnly` (`BranchSettings`) | selects the selling unit; it changes what is offered, it produces no finding |
| `prepaymentReserveDays`, `proformaPaymentTermDays` | parameters, not controls |
| Credit limit recompute, reservation expiry, held-send sweep | background jobs |

## Manager-portal toggles (moved into "Controls and policies" in #241)

| Toggle (was) | Is now | Note |
| --- | --- | --- |
| `BranchSettings.enforceMultiplicity` | branch override of `order.multiplicity` (`cart`, `pre-reserve`, `on-edit`) | migration `1791519000000` carries the data; the branch settings form only points to the tab |
| `BranchSettings.allowExceedingCreditLimit` | branch override of `credit.limit` at `checkout` (`warn` = was on, `hold` = was off) | same migration |
| Role editor: reservation extension limit, credit-term limit | stay data per role | the consequence of exceeding them is the policy of the `manager` checks (#242) |
| Stay in branch settings | `packagesOnly`, `prepaymentReserveDays`, `proformaPaymentTermDays`, default/visible price types and warehouses | parameters and scope defaults |

## Duplicates

- **Contract** and **organization**: the guards no longer refuse and only stamp; the reserve's
  `findErpExportGaps` stays as a transactional gate and the providers describe the same facts for the
  manager. One lookup (`order-contract-resolution`) serves the guard and the provider.
- **Multiplicity**: the cart interceptor, the line editor step and the reserve check all call
  `PackagingPolicyService.requiredMultiple`; the provider calls it with the rule assumed enforced.
- **Stock**: the reserve check, `OrderLineAvailabilityService` and ATP share `freeQuantity`; the reserve gate
  stays (a hard, race-safe barrier), the page only describes it.

## Owner decisions (#241)

- **Branch scope**: a `branchId` dimension on `check_policy` (a branch row overrides the global row).
- **Reserve stock** stays a hard transactional gate; guards that refused checkout no longer do.
- **Credit limit** only informs the customer and the manager: no new consequence and no new confirmation step;
  the existing acknowledgement step is kept.
- **No block at customer checkout**: `block` exists for the order subject at `cart` only (a quantity refused when
  added); the four ERP-oriented controls (organization, contract, ERP data, freight) warn at checkout and hold
  at the manager stage, and show in the manager order page.
- **Manager-action checks and basic approvals**: #242. Only basic client-manager approvals; complex routes may
  move to an external approvals system later.

No control is left unclassified; a new one found later is added to this table when it is added to
the code (the `checks-policy` skill, step 3).
