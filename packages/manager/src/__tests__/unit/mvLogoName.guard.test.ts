import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots = [
    '../../../../storefront/src',
    '../../../../manager/src',
    '../../../../ui-kit/src/components',
];

function vueFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(entry => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return vueFiles(path);
        return path.endsWith('.vue') && !path.includes('.stories.') ? [path] : [];
    });
}

describe('MvLogo usage', () => {
    it('is never rendered without a name outside stories', () => {
        const offenders = roots
            .flatMap(root => vueFiles(join(__dirname, root)))
            .filter(file =>
                (readFileSync(file, 'utf8').match(/<MvLogo\b[^>]*>/g) ?? []).some(
                    tag => !/(:name|\bname)=/.test(tag),
                ),
            );
        expect(offenders).toEqual([]);
    });
});
