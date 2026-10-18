import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

// Prints each scenario's outcome with its skip reason and the cart variety notes.
export default class SummaryReporter implements Reporter {
    private readonly lines: string[] = [];

    onTestEnd(test: TestCase, result: TestResult): void {
        const notes = result.annotations.map(a => `${a.type}: ${a.description ?? ''}`).join('; ');
        this.lines.push(
            `${result.status.toUpperCase().padEnd(8)} ${test.title}${notes ? `  [${notes}]` : ''}`,
        );
    }

    onEnd(): void {
        console.log(`\ne2e-integration summary:\n${this.lines.join('\n')}`);
    }
}
