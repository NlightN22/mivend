import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { layers } from '../../tokens/layers';

const SRC = resolve(__dirname, '../..');
const PACKAGES = resolve(SRC, '../..');
const SKIP_DIRS = new Set(['node_modules', '__tests__', 'generated']);

function kebab(name: string): string {
    return name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
}

function styleFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(entry => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return SKIP_DIRS.has(entry) ? [] : styleFiles(path);
        return /\.(vue|ts|css)$/.test(path) && !path.endsWith('tokens/layers.ts') ? [path] : [];
    });
}

describe('layer tokens', () => {
    it('tokens.css declares every layer with the same value as layers.ts', () => {
        const css = readFileSync(join(SRC, 'styles/tokens.css'), 'utf8');
        const declared = Object.fromEntries(
            [...css.matchAll(/--mv-z-([a-z-]+):\s*(\d+);/g)].map(m => [m[1], Number(m[2])]),
        );
        const expected = Object.fromEntries(Object.entries(layers).map(([k, v]) => [kebab(k), v]));
        expect(declared).toEqual(expected);
    });

    // Values up to 10 only order siblings inside one component; anything larger competes across the page.
    it('no component in either portal or the ui-kit uses a raw page-level z-index', () => {
        const dirs = ['ui-kit/src', 'storefront/src', 'manager/src'].map(d => join(PACKAGES, d));
        const offenders = dirs
            .flatMap(styleFiles)
            .flatMap(file =>
                [
                    ...readFileSync(file, 'utf8').matchAll(
                        /(?:z-index|zIndex)['"]?\s*:\s*['"]?(-?\d+)/g,
                    ),
                ]
                    .filter(m => Math.abs(Number(m[1])) > 10)
                    .map(m => `${file}: ${m[0]}`),
            );
        expect(offenders).toEqual([]);
    });
});
