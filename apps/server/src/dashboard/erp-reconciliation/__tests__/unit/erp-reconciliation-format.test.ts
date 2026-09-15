import { describe, it, expect } from 'vitest';
import { formatIssueTypeLabel, formatRunSummary } from '../../erp-reconciliation-format';

// Test plan (see .claude/skills/test-design/SKILL.md):
//
// - Changed behavior: formatIssueTypeLabel/formatRunSummary, the Dashboard-page-side display
//   formatting for issue #97 (native Dashboard ERP reconciliation page) — reuses #84's existing
//   ErpReconciliationIssue.issueType/ErpReconciliationRunResult shapes, no new backend field.
// - Business invariants: the two known issue types ('upstream-higher'/'local-higher') each map to
//   a fixed, distinct human-readable label; an unrecognized value passes through unchanged rather
//   than throwing (this is display-only formatting, not a validator — a schema field could add a
//   third type before this file's next update, and the page must not crash on it).
// - Data ownership and scope: none — pure derivation over an already-fetched read-only query/
//   mutation result, no backend boundary of its own.
// - Failure modes: unknown issueType string; empty skipped list vs a populated one.
// - Applicable patterns: none of docs/testing-patterns.md's backend risk patterns apply — pure
//   string formatting, no CQRS/inbox/outbox/concurrency involved.
// - Test placement: unit only, same reasoning as system-health-check.ts's own test file — thin
//   React/api.query plumbing in erp-reconciliation-page.tsx is verified by manual browser
//   verification instead (see PR/commit notes), not by a test harness that doesn't exist here yet.
// - Existing coverage reused: none — this is a new module, no prior formatting logic for this data.
// - Deliberate omissions: no test of the React page component or api.query call itself.

describe('formatIssueTypeLabel', () => {
    it('labels upstream-higher as Integration Service having more', () => {
        expect(formatIssueTypeLabel('upstream-higher')).toBe(
            'Integration Service has more than mivend',
        );
    });

    it('labels local-higher as mivend having more', () => {
        expect(formatIssueTypeLabel('local-higher')).toBe(
            'mivend has more than Integration Service',
        );
    });

    it('passes an unrecognized issue type through unchanged instead of throwing', () => {
        expect(formatIssueTypeLabel('some-future-type')).toBe('some-future-type');
    });
});

describe('formatRunSummary', () => {
    it('formats a run with no skipped aggregate types', () => {
        expect(formatRunSummary({ checked: 7, issuesFound: 2, skipped: [] })).toBe(
            'Checked 7, found 2',
        );
    });

    it('appends the skipped aggregate types when present', () => {
        expect(
            formatRunSummary({ checked: 5, issuesFound: 0, skipped: ['warehouse', 'price'] }),
        ).toBe('Checked 5, found 0 (skipped: warehouse, price)');
    });
});
