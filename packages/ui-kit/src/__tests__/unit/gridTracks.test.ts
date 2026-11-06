import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PACKAGES = resolve(__dirname, '../../../..');
const SKIP_DIRS = new Set(['node_modules', '__tests__', 'generated']);

function styleFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(entry => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return SKIP_DIRS.has(entry) ? [] : styleFiles(path);
        return /\.(vue|css)$/.test(path) ? [path] : [];
    });
}

// A bare 1fr track has an automatic minimum of its content, so one long word widens the whole page on a phone.
describe('grid tracks', () => {
    it('storefront and ui-kit declare flexible tracks as minmax(0, 1fr), never a bare 1fr', () => {
        const dirs = ['ui-kit/src', 'storefront/src'].map(d => join(PACKAGES, d));
        const offenders = dirs
            .flatMap(styleFiles)
            .flatMap(file =>
                [...readFileSync(file, 'utf8').matchAll(/grid-template-columns:[^;]*;/g)]
                    .filter(m => /\b1fr\b/.test(m[0].replace(/minmax\([^)]*\)/g, '')))
                    .map(m => `${file}: ${m[0]}`),
            );
        expect(offenders).toEqual([]);
    });
});
