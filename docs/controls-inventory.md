# Controls inventory (#241)

Every control that exists in the code today, classified against `docs/checks-and-policies.md`.
This table is the source for the follow-up migration issues (clusters below), not a refactor plan.
Rule text of a concrete control stays in its domain doc; this file only classifies.

Status values: **provider** (already in the framework), **wrap** (becomes a provider), **policy
toggle** (a hard-coded behavior or a `BranchSettings` flag that becomes a policy row), **stays
outside** (a guard that is not a business control, reason given).

## Order subject

| # | Control (code today) | Where it runs | On failure now | Target `code` / stages | Target default | Status |
|---|---|---|---|---|---|---|
| 1 | Contract with the storage organization (#237) | providers in `erp-integration` | `warn` | `erp.contract-with-storage-organization`, all order stages | `warn` | provider |
| 2 | Organization stock (#237) | providers in `erp-integration` | `warn` | `erp.organization-stock` | `warn` | provider |
| 3 | Variant without a seller organization (#201) | `organizationOrderGuard` (to `ArrangingPayment`); again in `findErpExportGaps` (reserve, `organizationId`) | checkout refused with the SKU list; reserve fails | `order.line-without-organization`, `checkout`, `pre-reserve` | `block` | wrap |
| 4 | No usable order contract (#205) | `contractOrderGuard` (to `ArrangingPayment`); again in `findErpExportGaps` (`missingContract`) | checkout refused; reserve fails | `order.contract-unresolved`, `checkout`, `pre-reserve` | `block` | wrap |
| 5 | ERP export data gaps: customer id, product id, warehouse id | `findErpExportGaps` in `reserveOrder` | reserve fails (`ErpExportDataMissingError`), reservation state FAILED | `erp.export-data-missing`, `pre-reserve` | `block` | wrap |
| 6 | Quantity multiplicity (#103, #219) | `MultiplicityOrderInterceptor` (add, adjust); `findMultiplicityViolations` in `reserveOrder`; stepper step in the line editor (#233) | add/adjust refused; reserve fails | `order.multiplicity`, `cart`, `pre-reserve`, `on-edit` | `block`, enabled by branch flag | wrap + policy toggle |
| 7 | Warehouse stock at reserve | `reserveOrder` (`InsufficientStockError`); free stock also computed by `OrderLineAvailabilityService` (#233) and ATP | reserve fails, reservation state FAILED | `reservation.warehouse-stock`, `pre-reserve` | `block` | wrap (see decision D2) |
| 8 | Credit limit exceeded (#222) | `DeferredCreditAssessmentService` + `decidePlacement`; flag stored in payment metadata (`CreditFlagService`) | route `manager-confirmation` (hold), or `erp-now` when the branch allows and the customer acknowledged | `credit.limit`, `checkout` (preview), `pre-send-to-erp` | `hold` | wrap + policy toggle |
| 9 | Freight needs an active trading point | `freightOrderGuard` (to `ArrangingPayment`) | checkout refused | `delivery.freight-trading-point`, `checkout` | `block` | wrap |
| 10 | Staff confirmation hold | `OrderChecksService.isHeld`, `OrderSendHoldService` | n/a, consumer of policies | part of the framework | n/a | provider (framework) |
| 11 | ERP rejects a registered order (#204) | inbound ERP result handling | order marked rejected, shown on the order | later: finding `erp.registration-rejected` (display only) | `info` | stays outside for now (an inbound fact, not a pre-check) |

## Manager / actor subject (does not exist yet)

| # | Control | Where | On failure now | Target | Status |
|---|---|---|---|---|---|
| 12 | Reservation extension limit per role (max extra days), fail closed without a row | `ReservationExtensionLimitService`, `ReservationExtensionService` | extension refused | `manager.reservation-extension-days` | policy toggle (data already per role) |
| 13 | Credit-term limit (days, amount), gate hard-codes the `department-head` role | `CreditTermGateService`, `CreditTermService` | request escalates to security review | `manager.credit-term-extension`, `require-approval` | wrap + policy toggle; the role code must become data |
| 14 | Price adjustment below the floor price (no floor = approval) | `PriceAdjustmentGateService` | needs approval | `manager.price-adjustment-floor`, `require-approval` | wrap |
| 15 | Discount grant needs justification and approval | `DiscountGrantService`, approval-workflow | justification missing = validation error; approval chain | approval chain stays in `approval-workflow`; the consequence is `require-approval` | stays outside (input validation) + executor |

## Guards that intentionally stay outside

These protect data ownership or the legality of a state transition, not a business rule a manager
should be able to relax. No finding, no policy.

| Guard | Why it stays |
|---|---|
| `externalOrderProcess`, `isExternal` refusals in reserve, edit and proforma issuing | the ERP owns the order |
| `ReplicaOrderInterceptor` / `replica-order.guard` | a replica is read-only for humans, sync owns it |
| `decideCancellation`, `decideEdit` (`order-cancellation.decision.ts`), `order-line-edit.guard` | state-transition legality (cancel and edit share one stage-facts rule) |
| Proforma issuing preconditions (not external, not cancelled, placed) | state legality |
| `packagesOnly` (`BranchSettings`) | selects the selling unit; it changes what is offered, it produces no finding |
| `prepaymentReserveDays`, `proformaPaymentTermDays` | parameters, not controls |
| Credit limit recompute, reservation expiry, held-send sweep | background jobs |

## Manager-portal toggles to move into "Controls and policies"

| Toggle (today) | Becomes | Note |
|---|---|---|
| `BranchSettings.enforceMultiplicity` | policy of `order.multiplicity` (enabled flag, consequence) | settings are per branch, policies are global: see D1 |
| `BranchSettings.allowExceedingCreditLimit` | policy of `credit.limit` | needs "customer acknowledges" (D3) |
| Role editor: reservation extension limit | policy of `manager.reservation-extension-days` | per role already |
| Role editor: credit-term limit | policy of `manager.credit-term-extension` | per role already |
| Stay in branch settings | `packagesOnly`, `prepaymentReserveDays`, `proformaPaymentTermDays`, default/visible price types and warehouses | parameters and scope defaults |

## Duplicates to collapse into one provider plus `runChecks`

- **Contract**: `contractOrderGuard` and `findErpExportGaps` re-implement the same lookup (#4).
- **Organization**: `organizationOrderGuard`, `findErpExportGaps` (`organizationId`) and the #237
  providers read the same line field (#3, #1, #2).
- **Multiplicity**: interceptor on add, interceptor on adjust, `findMultiplicityViolations` in the
  reserve, and the line editor step (#6).
- **Stock**: the reserve check, `OrderLineAvailabilityService` and ATP compute free stock separately
  (`freeQuantity` is the shared core) (#7).

## Framework gaps the migration needs (owner decisions)

- **D1 branch scope.** A policy row is per (check, stage); two toggles are per branch. Either add a
  scope dimension (global, branch) to `check_policy` or keep these two flags in branch settings and
  let the provider read them.
- **D2 enforcement vs advisory.** The reserve check is a transactional, race-safe guard and must
  stay the hard gate; a provider can only describe it for the manager page. Same for checkout
  guards: the guard must call `runChecks` and act on the consequence, not keep its own `if`.
- **D3 customer acknowledgement.** The credit-limit route needs a "customer acknowledges" step the
  five consequences do not express.
- **D4 `block` for orders.** Orders reject `block` today (#237). Items 3, 4, 5, 9 refuse checkout and
  need it at least at `checkout`.
- **D5 `manager` subject type** for items 12 to 14, with `require-approval` bridged to
  `approval-workflow`.

## Proposed follow-up issues (one per cluster)

1. Order data completeness (#3, #4, #5, #9) with D4.
2. Multiplicity (#6) with D1.
3. Credit limit (#8) with D1 and D3.
4. Warehouse stock provider (#7) with D2, on top of `OrderLineAvailabilityService`.
5. Manager limits (#12 to #14) with D5 and the `require-approval` bridge.
6. Framework: D1, D2, D4 as needed by the above.

No control is left unclassified; a new one found later is added to this table when it is added to
the code (the `checks-policy` skill, step 3).
