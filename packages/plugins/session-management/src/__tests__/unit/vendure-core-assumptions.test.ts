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

    // Deactivating an account (customer portal access, staff) ends all its sessions only through this chain.
    describe('deactivation ends every session of the account', () => {
        const body = (file: string, method: string): string => {
            const source = read(file);
            const start = source.indexOf(`async ${method}(`);
            return source.slice(start, source.indexOf('\n    async ', start + 1));
        };

        it('customer soft delete goes through the user soft delete', () => {
            expect(body('service/services/customer.service.js', 'softDelete')).toContain(
                'userService.softDelete',
            );
        });

        it('administrator soft delete goes through the user soft delete', () => {
            expect(body('service/services/administrator.service.js', 'softDelete')).toContain(
                'userService.softDelete',
            );
        });

        it('user soft delete deletes all sessions of the user, acting ones included', () => {
            expect(body('service/services/user.service.js', 'softDelete')).toContain(
                'deleteSessionsByUser',
            );
        });
    });
});
