import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

// Zero skips: role-dependent runs are selected by runsOn() tags, missing data is seeded.

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
        this.disallowed.push(`${test.titlePath().join(' > ')}: "${reason}"`);
    }

    onEnd(result: FullResult): { status?: FullResult['status'] } | undefined {
        const counts = [...this.byReason].sort((a, b) => b[1] - a[1]);
        if (counts.length > 0) {
            console.log('\nSkips by reason:');
            for (const [reason, count] of counts) console.log(`  ${count}  ${reason || '(none)'}`);
        }
        if (this.disallowed.length === 0) return undefined;
        console.error(`\n${this.disallowed.length} skip(s), the suite allows none:`);
        for (const line of this.disallowed) console.error(`  ${line}`);
        return { status: result.status === 'interrupted' ? 'interrupted' : 'failed' };
    }

    printsToStdio(): boolean {
        return false;
    }
}
