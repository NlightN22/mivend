import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');
const ALLOWED = ['stores/cart.ts', 'composables/useCartActions.ts'];

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return name.startsWith('__') ? [] : sourceFiles(full);
        return /\.(ts|vue)$/.test(name) && !/\.(test|stories)\./.test(name) ? [full] : [];
    });
}

describe('cart entry point', () => {
    it('calls cartStore.addItem only through useCartActions', () => {
        const offenders = sourceFiles(SRC)
            .filter(f => !ALLOWED.includes(relative(SRC, f)))
            .filter(f => /\baddItem\(/.test(readFileSync(f, 'utf8')))
            .map(f => relative(SRC, f));
        expect(offenders).toEqual([]);
    });
});
