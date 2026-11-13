import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const baseline: { count: number } = JSON.parse(
    readFileSync(new URL('../unbounded-ok-baseline.json', import.meta.url), 'utf8'),
);

function countMarkers(): number {
    const out = execFileSync(
        'git',
        [
            'grep',
            '-h',
            'unbounded-ok:',
            '--',
            'apps',
            'packages',
            ':!**/__tests__/**',
            ':!*.test.ts',
        ],
        { encoding: 'utf8', cwd: new URL('../..', import.meta.url) },
    );
    return out.split('\n').filter(Boolean).length;
}

describe('unbounded-ok ratchet', () => {
    it('never exceeds the committed baseline', () => {
        expect(countMarkers()).toBeLessThanOrEqual(baseline.count);
    });

    it('keeps the baseline tight: lower it in the same commit that removes a marker', () => {
        expect(countMarkers()).toBe(baseline.count);
    });
});
