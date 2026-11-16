import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const API_DIR = join(__dirname, '../../api');
const COUNT_ONLY = /\{\s*totalItems\s*\}/g;

// Walks back from a `{ totalItems }` selection to the field's argument list, balancing parentheses.
function argumentsOf(source: string, selectionAt: number): string | null {
    let end = selectionAt - 1;
    while (/\s/.test(source[end])) end--;
    if (source[end] !== ')') return null;
    let depth = 0;
    for (let i = end; i >= 0; i--) {
        if (source[i] === ')') depth++;
        else if (source[i] === '(' && --depth === 0) return source.slice(i, end + 1);
    }
    return null;
}

function countOnlyFields(): { file: string; args: string }[] {
    return readdirSync(API_DIR)
        .filter(name => name.endsWith('.graphql'))
        .flatMap(file => {
            const source = readFileSync(join(API_DIR, file), 'utf8');
            return [...source.matchAll(COUNT_ONLY)].flatMap(match => {
                const args = argumentsOf(source, match.index);
                return args ? [{ file, args }] : [];
            });
        });
}

// A list read that asks only for totalItems still hydrates a full default page (1000 rows) unless take is 0 (#370).
describe('count-only list fields', () => {
    it('finds the count-only fields it is meant to check', () => {
        expect(countOnlyFields().length).toBeGreaterThan(10);
    });

    it('pass take: 0 or hand the options over as a variable', () => {
        const unbounded = countOnlyFields().filter(
            ({ args }) => !/\btake:\s*0\b/.test(args) && !/\boptions:\s*\$\w+\s*[,)]/.test(args),
        );
        expect(unbounded.map(({ file, args }) => `${file}: ${args.replace(/\s+/g, ' ')}`)).toEqual(
            [],
        );
    });
});
