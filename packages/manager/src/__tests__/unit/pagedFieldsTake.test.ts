import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const API_DIR = join(__dirname, '../../api');

// Fields that page by their own means or look up a handful of rows; every other paged field must say its take.
const ALLOWED: Record<string, string> = {
    'discounts.graphql:expiringDiscountGrants': 'bounded server-side by the withinDays window',
    'globalSearch.graphql:globalSearch': 'limitPerKind bounds every group',
    'settings.graphql:roles': 'looked up by code, a few rows',
};

function closing(source: string, from: number, open: string, close: string): number {
    let depth = 0;
    for (let i = from; i < source.length; i++) {
        if (source[i] === open) depth++;
        else if (source[i] === close && --depth === 0) return i;
    }
    return -1;
}

// A paged field is any field with arguments whose selection holds items or totalItems.
function pagedFields(): { id: string; args: string }[] {
    return readdirSync(API_DIR)
        .filter(name => name.endsWith('.graphql'))
        .flatMap(file => {
            const source = readFileSync(join(API_DIR, file), 'utf8');
            return [...source.matchAll(/(\w+)\s*\(/g)].flatMap(match => {
                const open = match.index + match[0].length - 1;
                const end = closing(source, open, '(', ')');
                const args = source.slice(open, end + 1);
                if (/^\(\s*\$\w+\s*:/.test(args)) return [];
                const brace = source.slice(end + 1).search(/\S/) + end + 1;
                if (source[brace] !== '{') return [];
                const selection = source.slice(brace, closing(source, brace, '{', '}') + 1);
                return /\b(items|totalItems)\b/.test(selection)
                    ? [{ id: `${file}:${match[1]}`, args: args.replace(/\s+/g, ' ') }]
                    : [];
            });
        });
}

// Without take the server pages by its default of 1000 rows with their joins, even when only totalItems is read (#370).
// Options handed over as a variable are checked at runtime by the caller, not here.
describe('paged GraphQL fields', () => {
    it('finds the fields it is meant to check', () => {
        expect(pagedFields().length).toBeGreaterThan(50);
    });

    it('state their take (0 for a count) or hand the options over as a variable', () => {
        const unbounded = pagedFields().filter(
            ({ id, args }) =>
                !ALLOWED[id] &&
                !/\btake:\s*(\d+|\$\w+)/.test(args) &&
                !/\b(options|list):\s*\$\w+\s*[,)]/.test(args),
        );
        expect(unbounded.map(({ id, args }) => `${id} ${args}`)).toEqual([]);
    });

    it('keeps the allowed list free of fields that no longer exist', () => {
        const ids = new Set(pagedFields().map(({ id }) => id));
        expect(Object.keys(ALLOWED).filter(id => !ids.has(id))).toEqual([]);
    });
});
