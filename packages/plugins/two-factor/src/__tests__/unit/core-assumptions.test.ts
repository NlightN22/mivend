import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Tripwires for docs/vendure-core-divergences.md and docs/two-factor.md: a failure means a Vendure upgrade
// added or changed a way to open a session, which must be re-checked against the second step.
const coreDist = path.dirname(require.resolve('@vendure/core'));

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) return sources(full);
        return full.endsWith('.js') ? [full] : [];
    });
}

function filesContaining(needle: string): string[] {
    return sources(coreDist)
        .filter(file => readFileSync(file, 'utf8').includes(needle))
        .map(file => path.relative(coreDist, file))
        .sort();
}

describe('every way core opens a session', () => {
    it('createAuthenticatedSessionForUser is called only by AuthService and the customer verification flow', () => {
        expect(filesContaining('createAuthenticatedSessionForUser(')).toEqual([
            'api/resolvers/shop/shop-auth.resolver.js',
            'service/services/auth.service.js',
        ]);
    });

    it('createNewAuthenticatedSession is called only by those two and the API key paths', () => {
        expect(filesContaining('createNewAuthenticatedSession(')).toEqual([
            'api/middleware/auth-guard.js',
            'service/services/api-key.service.js',
            'service/services/auth.service.js',
            'service/services/session.service.js',
        ]);
    });

    it('authentication runs through the configured strategies before a session exists', () => {
        const source = readFileSync(
            path.join(coreDist, 'service/services/auth.service.js'),
            'utf8',
        );
        expect(source.indexOf('authenticationStrategy.authenticate(')).toBeGreaterThan(-1);
        expect(source.indexOf('authenticationStrategy.authenticate(')).toBeLessThan(
            source.indexOf('createAuthenticatedSessionForUser(ctx, authenticateResult'),
        );
    });

    it('resetPassword and verifyCustomerAccount sign the customer in themselves', () => {
        const source = readFileSync(
            path.join(coreDist, 'api/resolvers/shop/shop-auth.resolver.js'),
            'utf8',
        );
        expect(source).toContain('verifyCustomerEmailAddress');
        expect(source).toContain('customerService.resetPassword');
    });
});
