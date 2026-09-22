import { describe, it, expect } from 'vitest';
import {
    isZoneMissing,
    isTaxCategoryMissing,
    isTaxRateMissing,
    isDefaultTaxZoneMissing,
    isShippingMethodMissing,
    isPaymentMethodMissing,
} from '../../system-health-check';

// Test plan (see .claude/skills/test-design/SKILL.md):
//
// - Changed behavior: issue #140's split of one bundled "system configuration incomplete"
//   alert into 6 standalone per-entity alerts (see index.ts) — each now has its own tiny
//   predicate instead of one combined checklist builder.
// - Business invariants: each of the 6 checks is independent — one entity type present/absent
//   never flips another item's status. The literal incident: Zone + TaxCategory + TaxRate can
//   all exist while Channel.defaultTaxZone is still null, and only that predicate must report
//   missing.
// - Data ownership and scope: none — pure derivation over an already-fetched read-only query
//   result, no backend boundary of its own.
// - Failure modes: each predicate's true/false boundary, and payment-method's "exists but none
//   enabled" case (the one predicate that isn't a plain empty-list check).
// - Applicable patterns: none of docs/testing-patterns.md's backend risk patterns apply — pure
//   functions over plain objects, no CQRS/inbox/outbox/concurrency involved.
// - Test placement: unit only — each predicate is thin plumbing consumed directly by index.ts's
//   6 DashboardAlertDefinitions, verified live via the dashboard-extension-rules skill's mandatory
//   visual audit instead of a GraphQL-level test.
// - Existing coverage reused: none — this replaces the old buildSystemHealthChecklist/
//   getMissingChecks test wholesale rather than duplicating it alongside the new predicates.
// - Deliberate omissions: no test of the actual api.query call or DashboardAlertDefinition
//   shape — no @vendure/dashboard test harness precedent in this repo.

describe('system-health predicates', () => {
    it('isZoneMissing / isTaxCategoryMissing / isShippingMethodMissing: true only when totalItems is 0', () => {
        expect(isZoneMissing({ totalItems: 0 })).toBe(true);
        expect(isZoneMissing({ totalItems: 1 })).toBe(false);
        expect(isTaxCategoryMissing({ totalItems: 0 })).toBe(true);
        expect(isTaxCategoryMissing({ totalItems: 2 })).toBe(false);
        expect(isShippingMethodMissing({ totalItems: 0 })).toBe(true);
        expect(isShippingMethodMissing({ totalItems: 1 })).toBe(false);
    });

    it('isTaxRateMissing: true only when the tax rate list is empty', () => {
        expect(isTaxRateMissing({ items: [] })).toBe(true);
        expect(isTaxRateMissing({ items: [{ id: 'x' }] })).toBe(false);
    });

    it('isDefaultTaxZoneMissing: true only when the active channel has no defaultTaxZone', () => {
        expect(isDefaultTaxZoneMissing({ defaultTaxZone: null })).toBe(true);
        expect(isDefaultTaxZoneMissing({ defaultTaxZone: { id: 'zone-1' } })).toBe(false);
    });

    it('isPaymentMethodMissing: true when no payment method exists, and when some exist but none are enabled', () => {
        expect(isPaymentMethodMissing({ items: [] })).toBe(true);
        expect(isPaymentMethodMissing({ items: [{ enabled: false }, { enabled: false }] })).toBe(
            true,
        );
        expect(isPaymentMethodMissing({ items: [{ enabled: false }, { enabled: true }] })).toBe(
            false,
        );
    });
});
