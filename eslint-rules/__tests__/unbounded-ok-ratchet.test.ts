import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { countMarkersByGroup } from '../unbounded-ok-count.mjs';

const baseline: { groups: Record<string, number> } = JSON.parse(
    readFileSync(new URL('../unbounded-ok-baseline.json', import.meta.url), 'utf8'),
);

// One line per plugin: parallel conversion branches edit different lines, so merges stay clean.
// After removing markers run `node eslint-rules/unbounded-ok-count.mjs` to lower the baseline.
describe('unbounded-ok ratchet', () => {
    const actual = countMarkersByGroup();

    it('never lets a group exceed its committed count, and a new group starts at zero', () => {
        for (const [group, count] of Object.entries(actual)) {
            expect(count, group).toBeLessThanOrEqual(baseline.groups[group] ?? 0);
        }
    });

    it('keeps the baseline tight: lower it in the same commit that removes a marker', () => {
        for (const [group, count] of Object.entries(baseline.groups)) {
            expect(actual[group] ?? 0, group).toBe(count);
        }
    });
});
