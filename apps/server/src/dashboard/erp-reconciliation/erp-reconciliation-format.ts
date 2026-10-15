// Keep this free of React/Dashboard page code; the split exists so it can be unit-tested.
// Page-level imports here would pull the rendering dependencies into the unit tests.

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
