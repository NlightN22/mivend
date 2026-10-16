import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = join(__dirname, '../../migrations');

describe('migration files', () => {
    it('export only migration classes, because TypeORM instantiates every export of the glob', async () => {
        const files = readdirSync(dir).filter(f => f.endsWith('.ts'));
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
            const mod = (await import(join(dir, file))) as Record<string, unknown>;
            for (const [name, value] of Object.entries(mod)) {
                const isMigration =
                    typeof value === 'function' &&
                    typeof (value as { prototype?: { up?: unknown } }).prototype?.up === 'function';
                expect(
                    isMigration,
                    `${file} exports "${name}", which is not a migration class`,
                ).toBe(true);
            }
        }
    }, 60_000);
});
