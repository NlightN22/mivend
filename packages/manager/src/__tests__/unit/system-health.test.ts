import { describe, it, expect } from 'vitest';
import { buildSystemHealthChecklist, type SystemHealthQueryResult } from '../../api/system-health';

// Test plan (see .claude/skills/test-design/SKILL.md):
//
// - Changed behavior: buildSystemHealthChecklist, the pure derivation of the fixed 6-item
//   "store setup" checklist (issue #76) from a raw SystemHealthCheckData query result.
// - Business invariants: each of the 6 checks is independent of the other 5 — one entity type
//   being present/absent never flips another item's status. The literal incident this issue was
//   filed about is invariant #4: Zone + TaxCategory + TaxRate can all exist while
//   Channel.defaultTaxZone is still null, and only that one item must report missing.
// - Data ownership and scope: none — pure client-side derivation over an already-fetched
//   read-only query result, no backend boundary of its own.
// - Failure modes: an empty/all-missing result, an all-present result, and the specific
//   partial-incident shape (5 of 6 present, only defaultTaxZone missing).
// - Applicable patterns: none of docs/testing-patterns.md's backend risk patterns apply (no
//   CQRS/inbox/outbox/idempotency/concurrency) — this is a pure function over a plain object.
// - Test placement: unit only, on the pure function directly — no need for a component/E2E test
//   for a derivation with no DOM or async behavior of its own (SystemHealthPage.vue's own fetch
//   wiring is a thin, low-risk wrapper around this function and fetchSystemHealthData).
// - Existing coverage reused: none — first test for this new api/system-health.ts module.
// - Deliberate omissions: no test for fetchSystemHealthData itself (a thin adminApi query
//   wrapper, same shape as every other fetch* function in packages/manager/src/api that has no
//   dedicated test); no E2E test — this is a settings page assembled from already-tested
//   ui-kit/auth-store pieces, not a new business flow.

function fullyHealthyResult(): SystemHealthQueryResult {
    return {
        zones: { totalItems: 1 },
        taxCategories: { totalItems: 1 },
        taxRates: { items: [{ enabled: true }] },
        activeChannel: { defaultTaxZone: { id: 'zone-1' } },
        shippingMethods: { totalItems: 1 },
        paymentMethods: { items: [{ enabled: true }] },
    };
}

describe('buildSystemHealthChecklist', () => {
    it('reports every item ok when all 6 conditions are satisfied', () => {
        const checklist = buildSystemHealthChecklist(fullyHealthyResult());
        expect(checklist).toHaveLength(6);
        expect(checklist.every(item => item.status === 'ok')).toBe(true);
    });

    it('reports every item missing when nothing exists', () => {
        const checklist = buildSystemHealthChecklist({
            zones: { totalItems: 0 },
            taxCategories: { totalItems: 0 },
            taxRates: { items: [] },
            activeChannel: { defaultTaxZone: null },
            shippingMethods: { totalItems: 0 },
            paymentMethods: { items: [] },
        });
        expect(checklist.every(item => item.status === 'missing')).toBe(true);
    });

    // The specific incident this issue was filed about.
    it('reports only the default-tax-zone item missing when Zone/TaxCategory/TaxRate all exist but defaultTaxZone is null', () => {
        const result = fullyHealthyResult();
        result.activeChannel = { defaultTaxZone: null };

        const checklist = buildSystemHealthChecklist(result);
        const byId = new Map(checklist.map(item => [item.id, item]));

        expect(byId.get('zone')?.status).toBe('ok');
        expect(byId.get('tax-category')?.status).toBe('ok');
        expect(byId.get('tax-rate')?.status).toBe('ok');
        expect(byId.get('default-tax-zone')?.status).toBe('missing');
        expect(byId.get('default-tax-zone')?.detail).toBeTruthy();
        expect(byId.get('shipping-method')?.status).toBe('ok');
        expect(byId.get('payment-method')?.status).toBe('ok');
    });

    it('reports the payment-method item missing when payment methods exist but none are enabled', () => {
        const result = fullyHealthyResult();
        result.paymentMethods = { items: [{ enabled: false }, { enabled: false }] };

        const checklist = buildSystemHealthChecklist(result);
        expect(checklist.find(item => item.id === 'payment-method')?.status).toBe('missing');
    });

    it('reports the tax-rate item missing when the tax rate list is empty', () => {
        const result = fullyHealthyResult();
        result.taxRates = { items: [] };

        const checklist = buildSystemHealthChecklist(result);
        expect(checklist.find(item => item.id === 'tax-rate')?.status).toBe('missing');
    });
});
