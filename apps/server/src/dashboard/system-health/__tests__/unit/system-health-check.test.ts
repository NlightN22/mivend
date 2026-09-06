import { describe, it, expect } from 'vitest';
import {
    buildSystemHealthChecklist,
    getMissingChecks,
    type SystemHealthQueryResult,
} from '../../system-health-check';

// Test plan (see .claude/skills/test-design/SKILL.md):
//
// - Changed behavior: buildSystemHealthChecklist/getMissingChecks, the Dashboard-alert-side
//   twin of packages/manager/src/api/system-health.ts's derivation (issue #76, follow-up for
//   #77's @vendure/dashboard migration) — same fixed 6-item checklist, same query shape.
// - Business invariants: each of the 6 checks is independent — one entity type present/absent
//   never flips another item's status. The literal incident: Zone + TaxCategory + TaxRate can
//   all exist while Channel.defaultTaxZone is still null, and only that one item must report
//   missing.
// - Data ownership and scope: none — pure derivation over an already-fetched read-only query
//   result, no backend boundary of its own.
// - Failure modes: an empty/all-missing result, an all-present result (getMissingChecks
//   returns []), and the specific partial-incident shape.
// - Applicable patterns: none of docs/testing-patterns.md's backend risk patterns apply — pure
//   function over a plain object, no CQRS/inbox/outbox/concurrency involved.
// - Test placement: unit only. The React/Dashboard alert wiring in index.ts (api.query call,
//   DashboardAlertDefinition shape) is thin plumbing around this function, same reasoning as
//   the manager-portal version's own test file. This module lives under apps/server/src/dashboard
//   (not packages/plugins/*) because @vendure/dashboard's static plugin-discovery step cannot
//   see a pnpm-workspace-symlinked package's dashboard extension — see
//   system-health-dashboard.plugin.ts's registration comment in vendure-config.ts for the full
//   explanation; vitest's own apps/**/*.test.ts include already covers this location with no
//   extra config.
// - Existing coverage reused: mirrors packages/manager/src/__tests__/unit/system-health.test.ts's
//   scenarios; not a duplicate in the "same level, same file" sense — this covers a distinct
//   module (`missing: boolean` shape vs that file's `status: 'ok' | 'missing'` shape) consumed
//   by a different app.
// - Deliberate omissions: no test that exercises the actual `api.query`/GraphQL call, or the
//   DashboardAlertDefinition's `check`/`shouldShow`/`title` functions directly — @vendure/dashboard
//   has no test harness precedent in this repo, and per test-design's minimum-sufficient-level
//   rule, that plumbing is verified by manual browser verification instead (see PR/commit notes).

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

describe('buildSystemHealthChecklist / getMissingChecks', () => {
    it('reports nothing missing when all 6 conditions are satisfied', () => {
        const checklist = buildSystemHealthChecklist(fullyHealthyResult());
        expect(checklist).toHaveLength(6);
        expect(getMissingChecks(fullyHealthyResult())).toEqual([]);
    });

    it('reports every item missing when nothing exists', () => {
        const empty: SystemHealthQueryResult = {
            zones: { totalItems: 0 },
            taxCategories: { totalItems: 0 },
            taxRates: { items: [] },
            activeChannel: { defaultTaxZone: null },
            shippingMethods: { totalItems: 0 },
            paymentMethods: { items: [] },
        };
        expect(getMissingChecks(empty)).toHaveLength(6);
    });

    // The specific incident this issue was filed about.
    it('reports only default-tax-zone missing when Zone/TaxCategory/TaxRate all exist but defaultTaxZone is null', () => {
        const result = fullyHealthyResult();
        result.activeChannel = { defaultTaxZone: null };

        const missing = getMissingChecks(result);
        expect(missing.map(item => item.id)).toEqual(['default-tax-zone']);
    });

    it('reports payment-method missing when payment methods exist but none are enabled', () => {
        const result = fullyHealthyResult();
        result.paymentMethods = { items: [{ enabled: false }, { enabled: false }] };

        const missing = getMissingChecks(result);
        expect(missing.map(item => item.id)).toEqual(['payment-method']);
    });

    it('reports tax-rate missing when the tax rate list is empty', () => {
        const result = fullyHealthyResult();
        result.taxRates = { items: [] };

        const missing = getMissingChecks(result);
        expect(missing.map(item => item.id)).toEqual(['tax-rate']);
    });
});
