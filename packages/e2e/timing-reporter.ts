import { writeFileSync } from 'fs';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

// Prints the slowest tests and spec files of a run; E2E_TIMINGS_JSON=<path> also writes every test (docs/e2e-testing.md "Timing report").

interface Timing {
    file: string;
    project: string;
    title: string;
    ms: number;
    hookMs: number;
}

const TOP = 12;
const seconds = (ms: number): string => (ms / 1000).toFixed(1).padStart(6);

export default class TimingReporter implements Reporter {
    private readonly timings: Timing[] = [];

    onTestEnd(test: TestCase, result: TestResult): void {
        const hookMs = result.steps
            .filter(s => s.category === 'hook' || s.category === 'fixture')
            .reduce((sum, s) => sum + s.duration, 0);
        this.timings.push({
            file: test.location.file.replace(/^.*\/packages\/e2e\//, ''),
            project: test.parent.project()?.name ?? '',
            title: test.titlePath().slice(3).join(' > '),
            ms: result.duration,
            hookMs,
        });
    }

    onEnd(_result: FullResult): void {
        if (this.timings.length === 0) return;
        const byFile = new Map<string, { ms: number; tests: number }>();
        for (const t of this.timings) {
            const entry = byFile.get(t.file) ?? { ms: 0, tests: 0 };
            byFile.set(t.file, { ms: entry.ms + t.ms, tests: entry.tests + 1 });
        }
        const total = this.timings.reduce((sum, t) => sum + t.ms, 0);
        const hooks = this.timings.reduce((sum, t) => sum + t.hookMs, 0);
        console.log(
            `\ne2e timing: ${this.timings.length} tests, ${seconds(total).trim()}s in tests, ${seconds(hooks).trim()}s of it in hooks and fixtures`,
        );
        console.log('Slowest spec files (s, tests):');
        for (const [file, e] of [...byFile].sort((a, b) => b[1].ms - a[1].ms).slice(0, TOP))
            console.log(`  ${seconds(e.ms)}  ${String(e.tests).padStart(3)}  ${file}`);
        console.log('Slowest tests (s, of which hooks/fixtures):');
        for (const t of [...this.timings].sort((a, b) => b.ms - a.ms).slice(0, TOP))
            console.log(
                `  ${seconds(t.ms)}  ${seconds(t.hookMs)}  ${t.file} [${t.project}] ${t.title}`,
            );
        const out = process.env.E2E_TIMINGS_JSON;
        if (out) writeFileSync(out, JSON.stringify(this.timings, null, 1));
    }

    printsToStdio(): boolean {
        return false;
    }
}
