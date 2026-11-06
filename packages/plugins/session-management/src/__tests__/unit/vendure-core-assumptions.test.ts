import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Tripwires for docs/vendure-core-divergences.md: a failure here means re-check that table after a Vendure upgrade.
const coreDist = path.dirname(require.resolve('@vendure/core'));
const read = (relative: string): string => readFileSync(path.join(coreDist, relative), 'utf8');

describe('Vendure core behavior that our plugins replace or work around', () => {
    it('logout deletes every session of the user', () => {
        expect(read('service/services/auth.service.js')).toContain('deleteSessionsByUser');
    });

    it('the session cookie is read before the bearer header', () => {
        const source = read('api/common/extract-session-token.js');
        expect(source.indexOf("method: 'cookie'")).toBeGreaterThan(-1);
        expect(source.indexOf("method: 'cookie'")).toBeLessThan(source.indexOf("method: 'bearer'"));
    });

    it('a new authenticated session picks up the newest active order of the user', () => {
        const source = read('service/services/session.service.js');
        expect(source).toContain('getActiveOrderForUser');
        expect(source).toContain('mergeOrders');
    });
});
