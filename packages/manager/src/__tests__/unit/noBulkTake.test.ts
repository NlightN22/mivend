import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOTS = [
    resolve(__dirname, '../../../src'),
    resolve(__dirname, '../../../../storefront/src'),
];
const BIG_TAKE = /\btake:\s*(\d+)/;
const MAX_UNMARKED = 99;

function graphqlFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        if (name === 'node_modules' || name === 'generated') return [];
        if (statSync(path).isDirectory()) return graphqlFiles(path);
        return name.endsWith('.graphql') ||
            (name.endsWith('.ts') && !name.includes('.test.') && !name.includes('.stories.'))
            ? [path]
            : [];
    });
}

// Checks .graphql and gql strings in non-test .ts only; `take: $take` variables are not checked.
// Large fixed `take` results filtered in the browser are a bug; use server-side search or counts.
describe('no bulk take in manager/storefront GraphQL documents', () => {
    it('flags take >= 100 unless that line or the one after it carries a "# bounded:" reason', () => {
        const offenders = ROOTS.flatMap(root =>
            graphqlFiles(root).flatMap(file =>
                readFileSync(file, 'utf8')
                    .split('\n')
                    .flatMap((line, i, lines) => {
                        const take = BIG_TAKE.exec(line);
                        const bounded = [line, lines[i + 1] ?? ''].some(l =>
                            l.includes('# bounded:'),
                        );
                        return take && Number(take[1]) > MAX_UNMARKED && !bounded
                            ? [`${file}:${i + 1}: ${line.trim()}`]
                            : [];
                    }),
            ),
        );
        expect(offenders).toEqual([]);
    });
});
