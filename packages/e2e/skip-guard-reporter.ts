import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

// The only skips allowed: a spec that runs under one role project, or needs a permission only some
// roles hold. Missing data is seeded, never skipped; any other skip fails the run.
const ALLOWED_REASONS = new Set([
    'UI-mechanics test, one project is enough',
    'UI-kit-level test, runs once',
    'UI test, runs once',
    'API-level test, runs once',
    'Display parity runs once',
    'Display check runs once',
    'Listing check runs once',
    'Covered by the positive case',
    'Covered by the positive cases',
    'Leadership-only feature',
    'needs portal access rights',
    'Needs ManageAccessControl',
    'Needs ManageAdministratorLifecycle',
    'Needs ReadEntityHistory',
    'Needs ReassignCounterpartyManager + ReadEntityHistory',
    'Needs UpdateCatalog',
]);

export default class SkipGuardReporter implements Reporter {
    private readonly byReason = new Map<string, number>();
    private readonly disallowed: string[] = [];

    onTestEnd(test: TestCase, result: TestResult): void {
        if (result.status !== 'skipped') return;
        const reasons = [...test.annotations, ...result.annotations]
            .filter(a => a.type === 'skip')
            .map(a => a.description ?? '');
        const reason = reasons[0] ?? '';
        this.byReason.set(reason, (this.byReason.get(reason) ?? 0) + 1);
        if (!ALLOWED_REASONS.has(reason))
            this.disallowed.push(`${test.titlePath().join(' > ')}: "${reason}"`);
    }

    onEnd(result: FullResult): { status?: FullResult['status'] } | undefined {
        const counts = [...this.byReason].sort((a, b) => b[1] - a[1]);
        if (counts.length > 0) {
            console.log('\nSkips by reason:');
            for (const [reason, count] of counts) console.log(`  ${count}  ${reason || '(none)'}`);
        }
        if (this.disallowed.length === 0) return undefined;
        console.error(`\n${this.disallowed.length} skip(s) with a reason off the allow-list:`);
        for (const line of this.disallowed) console.error(`  ${line}`);
        return { status: result.status === 'interrupted' ? 'interrupted' : 'failed' };
    }

    printsToStdio(): boolean {
        return false;
    }
}
