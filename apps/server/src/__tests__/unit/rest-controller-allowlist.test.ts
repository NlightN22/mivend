import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../../../../..');

// Every REST controller must carry a key guard and be flag-gated; a new one must be listed here
// with its reason, so it cannot ship unguarded by accident (docs/environments.md, REST policy).
// `session`: a portal download authorized per row by the caller's own Vendure session (#263), not a key.
const ALLOW_LIST: Record<string, { reason: string; session?: true }> = {
    'packages/plugins/documents/src/document-pdf.controller.ts': {
        reason: 'Vendure session + DocumentPdfAccessService scope check; 404 for guest/hidden/missing',
        session: true,
    },
    'packages/plugins/sync/src/erp-callback.controller.ts': {
        reason: 'ErpCallbackApiKeyGuard + ERP_CALLBACK_ENABLED gate in sync.plugin.ts',
    },
    'packages/plugins/sync/src/erp-order-status.controller.ts': {
        reason: 'ErpCallbackApiKeyGuard + ERP_CALLBACK_ENABLED gate in sync.plugin.ts',
    },
    'packages/plugins/erp-integration/src/kafka-status.controller.ts': {
        reason: 'KafkaStatusApiKeyGuard + ERP_CALLBACK_ENABLED gate in erp-integration.plugin.ts',
    },
    'packages/plugins/erp-import/src/erp-import.controller.ts': {
        reason: 'ErpAuthGuard + plugin loaded only when ERP_IMPORT_ENABLED=true',
    },
};

function walk(dir: string, out: string[]): string[] {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist' || name === '__tests__') continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(full);
    }
    return out;
}

describe('REST controllers', () => {
    const files = [...walk(join(ROOT, 'packages'), []), ...walk(join(ROOT, 'apps'), [])];
    const withController = files
        .filter(f => /@Controller\(/.test(readFileSync(f, 'utf8')))
        .map(f => relative(ROOT, f));

    it('are all on the explicit allow-list', () => {
        expect(withController.filter(f => !(f in ALLOW_LIST)).sort()).toEqual([]);
    });

    it('allow-list has no stale entries', () => {
        expect(Object.keys(ALLOW_LIST).filter(f => !withController.includes(f))).toEqual([]);
    });

    it('every allow-listed controller declares a guard', () => {
        for (const [f, entry] of Object.entries(ALLOW_LIST)) {
            expect(readFileSync(join(ROOT, f), 'utf8'), f).toMatch(
                entry.session ? /@Allow\(/ : /@UseGuards\(/,
            );
        }
    });
});
