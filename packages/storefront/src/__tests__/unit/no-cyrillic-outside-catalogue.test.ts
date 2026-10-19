import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '../..');
const SKIPPED = [/^i18n\/ru\//, /^__tests__\//, /^api\/generated\//, /\.test\.ts$/];

function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const path = join(dir, entry.name);
        return entry.isDirectory() ? sourceFiles(path) : [path];
    });
}

describe('storefront sources', () => {
    it('keep Cyrillic text only in the ru catalogue', () => {
        const offenders = sourceFiles(SRC)
            .map(path => relative(SRC, path))
            .filter(path => !SKIPPED.some(rule => rule.test(path)))
            .filter(path => /[Ѐ-ӿ]/.test(readFileSync(join(SRC, path), 'utf8')));
        expect(offenders).toEqual([]);
    });
});
