import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../../../../..');
const MIRRORED_COLUMN = /customFields[A-Z][a-z0-9]*/g;
const DEFINED_NAME = /\bname:\s*'([A-Za-z][A-Za-z0-9]*)'/g;

function walk(dir: string, out: string[]): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === 'dist' || entry === 'generated') continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (full.endsWith('.ts')) out.push(full);
    }
    return out;
}

// Vendure names a custom field column `customFields` + the name with only its first letter upper-cased.
function columnOf(name: string): string {
    return `customFields${name[0].toUpperCase()}${name.slice(1).toLowerCase()}`;
}

const isTest = (f: string): boolean => /__tests__|\.test\.ts$|\.harness\.ts$/.test(f);

describe('hand-mirrored custom field columns in test harnesses (#244)', () => {
    const files = [...walk(join(ROOT, 'packages'), []), ...walk(join(ROOT, 'apps'), [])];
    const defined = new Set<string>();
    for (const f of files.filter(f => !isTest(f))) {
        for (const m of readFileSync(f, 'utf8').matchAll(DEFINED_NAME)) defined.add(columnOf(m[1]));
    }

    it('every mirrored customFields* column is still defined by production code', () => {
        const stale: string[] = [];
        for (const f of files.filter(isTest)) {
            const mirrored = new Set(readFileSync(f, 'utf8').match(MIRRORED_COLUMN) ?? []);
            for (const column of mirrored) {
                if (!defined.has(column)) stale.push(`${relative(ROOT, f)}: ${column}`);
            }
        }
        expect(stale).toEqual([]);
    });

    it('derives the column name the way Vendure does', () => {
        expect(columnOf('selectedContractId')).toBe('customFieldsSelectedcontractid');
    });
});
