import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

// Every file that writes the trading_point row. A new writer fails this test until it is classified:
// 'bumps' = goes through TradingPointVersionService, 'inbound' = ERP/hub-branch/seed data, never sent back.
const WRITERS: Record<string, 'bumps' | 'inbound' | 'helper'> = {
    'trading-point.service.ts': 'bumps',
    'trading-point-customer.service.ts': 'bumps',
    'trading-point-version.service.ts': 'helper',
    'trading-point-location.ts': 'inbound',
};
// Within trading-point.service.ts, the inbound-only methods (no bump, no send).
const INBOUND_METHODS = ['upsertFromStream', 'markErpDeleted', 'deactivate'];
const ROOTS = ['../../../..', '../../../../../../apps/server/src'];

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        if (name === 'node_modules' || name === 'dist' || name === '__tests__') return [];
        const full = join(dir, name);
        return statSync(full).isDirectory()
            ? sourceFiles(full)
            : name.endsWith('.ts')
              ? [full]
              : [];
    });
}

describe('every writer of trading_point is classified', () => {
    const writeCall =
        /(?:getRepository\([^)]*,\s*TradingPoint\)|UPDATE trading_point\b)[\s\S]{0,400}?\.(save|update|insert|delete)\(|UPDATE trading_point\b/;
    const found = ROOTS.flatMap(root => sourceFiles(join(__dirname, root)))
        .filter(
            file =>
                !file.includes('/migrations/') &&
                /TradingPoint\b|trading_point/.test(readFileSync(file, 'utf8')),
        )
        .filter(file => writeCall.test(readFileSync(file, 'utf8')))
        .map(file => file.split('/').pop() as string);

    it('knows every file that writes the row', () => {
        const unclassified = [...new Set(found)].filter(name => !(name in WRITERS));
        expect(unclassified).toEqual([]);
    });

    it('keeps the inbound methods free of version bumps', () => {
        const source = readFileSync(join(__dirname, '../../trading-point.service.ts'), 'utf8');
        for (const method of INBOUND_METHODS) {
            const start = source.indexOf(`async ${method}(`);
            expect(start).toBeGreaterThan(-1);
            const end = source.indexOf('\n    async ', start + 1);
            expect(source.slice(start, end === -1 ? undefined : end)).not.toContain(
                'versions.bump',
            );
        }
    });
});
