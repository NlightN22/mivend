import { describe, it, expect } from 'vitest';
import { formatIssueTypeLabel, formatRunSummary } from '../../erp-reconciliation-format';

// Display-only: unknown issueType passes through unchanged, not thrown, because the backend
// schema may add a type before this map is updated and the page must not crash on it.

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
