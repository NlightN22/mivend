import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

// A new writer of the counterparty row fails until classified: 'bumps' = changes a portal-owned field via
// CounterpartyVersionService, 'inbound' = ERP stream data, 'local' = columns outside the portal-owned set.
const WRITERS: Record<string, 'bumps' | 'inbound' | 'local' | 'helper'> = {
    'counterparty-manager-assignment.service.ts': 'bumps',
    'counterparty-team.service.ts': 'bumps',
    'counterparty.resolver.ts': 'bumps',
    'counterparty-version.service.ts': 'helper',
    'counterparty-stream-state.service.ts': 'inbound',
    'counterparty.service.ts': 'inbound',
    'counterparty-branch-override.service.ts': 'local',
    'credit-term.service.ts': 'local',
    'credit-limit-recompute.sql.ts': 'local',
    'branch-assignment.service.ts': 'local',
    'department-branch-mapping.service.ts': 'local',
};
const ROOTS = ['../../../..', '../../../../../../apps/server/src'];
const BUMPERS = Object.entries(WRITERS)
    .filter(([, kind]) => kind === 'bumps')
    .map(([name]) => name);

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

describe('every writer of counterparty is classified', () => {
    const writeCall =
        /(?:getRepository\([^)]*,\s*Counterparty\)|\.update\(Counterparty\))[\s\S]{0,400}?\.(save|update|insert|delete|execute)\(|UPDATE counterparty\b|UPDATE "counterparty"/;
    const files = ROOTS.flatMap(root => sourceFiles(join(__dirname, root))).filter(
        file => !file.includes('/migrations/'),
    );
    const found = files
        .filter(file => writeCall.test(readFileSync(file, 'utf8')))
        .map(file => file.split('/').pop() as string);

    it('knows every file that writes the row', () => {
        const unclassified = [...new Set(found)].filter(name => !(name in WRITERS));
        expect(unclassified).toEqual([]);
    });

    it('every portal-owned writer calls the version service', () => {
        for (const name of BUMPERS) {
            const file = files.find(f => f.endsWith(`/${name}`));
            expect(file, name).toBeDefined();
            expect(readFileSync(file as string, 'utf8'), name).toContain('versions.bump');
        }
    });

    it('keeps the inbound write path free of version bumps', () => {
        for (const name of ['counterparty-stream-state.service.ts', 'counterparty.service.ts']) {
            const file = files.find(f => f.endsWith(`/${name}`));
            expect(readFileSync(file as string, 'utf8'), name).not.toContain('versions.bump');
        }
        const team = readFileSync(join(__dirname, '../../counterparty-team.service.ts'), 'utf8');
        const seed = team.slice(team.indexOf('async seedFromErp('), team.indexOf('private async'));
        expect(seed).not.toContain('bump');
    });
});
