// Pure derivation logic, deliberately separated from the React/Dashboard page plumbing in
// erp-reconciliation-page.tsx so it can be unit-tested — same split as
// ../system-health/system-health-check.ts and ../integration-health/integration-health-page.tsx's
// own isLagOverThreshold.

export function formatIssueTypeLabel(issueType: string): string {
    switch (issueType) {
        case 'upstream-higher':
            return 'Integration Service has more than mivend';
        case 'local-higher':
            return 'mivend has more than Integration Service';
        default:
            return issueType;
    }
}

export interface RunSummaryResult {
    checked: number;
    issuesFound: number;
    skipped: string[];
}

export function formatRunSummary(result: RunSummaryResult): string {
    const skippedSuffix = result.skipped.length ? ` (skipped: ${result.skipped.join(', ')})` : '';
    return `Checked ${result.checked}, found ${result.issuesFound}${skippedSuffix}`;
}
