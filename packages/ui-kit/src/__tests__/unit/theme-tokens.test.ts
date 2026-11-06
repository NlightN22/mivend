import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const STYLES = resolve(__dirname, '../../styles');

function declared(file: string, pattern: RegExp): Set<string> {
    const css = readFileSync(resolve(STYLES, file), 'utf8');
    return new Set([...css.matchAll(pattern)].map(m => m[1]));
}

const ROLE = /^\s+(--(?:app|el)-[a-z0-9-]+):/gm;
const PALETTE_REF = /var\((--palette-[a-z0-9-]+)\)/g;

describe('theme tokens', () => {
    it('dark theme defines exactly the roles the light theme defines', () => {
        expect(declared('theme-dark.css', ROLE)).toEqual(declared('theme-light.css', ROLE));
    });

    it('every palette step a theme references exists in the palette', () => {
        const palette = declared('palette.css', /^\s+(--palette-[a-z0-9-]+):/gm);
        const used = [
            ...declared('theme-light.css', PALETTE_REF),
            ...declared('theme-dark.css', PALETTE_REF),
        ];
        expect(used.filter(name => !palette.has(name))).toEqual([]);
    });
});
