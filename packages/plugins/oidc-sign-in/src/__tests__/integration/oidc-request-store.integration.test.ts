import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { sha256Hex } from '../../oidc-crypto';
import { OidcRequestStoreService } from '../../oidc-request-store.service';
import { OidcFixture, ctx, openOidcFixture } from './oidc-fixture';

let fx: OidcFixture;
beforeAll(async () => {
    fx = await openOidcFixture('oidc_requests');
});
afterAll(() => fx.close());
beforeEach(() => fx.reset());

describe('request lifecycle', () => {
    it('stores only the hash of the state', async () => {
        const state = await fx.requests.create(ctx, 'n', 'v');
        const rows = await fx.dataSource.query('SELECT "stateHash" FROM oidc_auth_request');
        expect(rows).toEqual([{ stateHash: sha256Hex(state) }]);
    });

    it('lets one of two concurrent exchanges win and refuses a replay', async () => {
        const state = await fx.requests.create(ctx, 'n', 'v');
        const [a, b] = await Promise.all([
            fx.requests.beginExchange(ctx, state),
            fx.requests.beginExchange(ctx, state),
        ]);
        expect([a, b].filter(Boolean).length).toBe(1);
        expect(await fx.requests.beginExchange(ctx, state)).toBeNull();
    });

    it('refuses an expired or unknown state', async () => {
        const state = await fx.requests.create(ctx, 'n', 'v');
        await fx.dataSource.query(
            `UPDATE oidc_auth_request SET "expiresAt" = now() - interval '1 second'`,
        );
        expect(await fx.requests.beginExchange(ctx, state)).toBeNull();
        expect(await fx.requests.beginExchange(ctx, 'unknown')).toBeNull();
    });

    it('claims a verified request once, only after verification', async () => {
        const state = await fx.requests.create(ctx, 'n', 'v');
        expect(await fx.requests.claimVerified(ctx, state)).toBeNull();
        const row = await fx.requests.beginExchange(ctx, state);
        await fx.requests.markVerified(ctx, row!.id, '7');
        const [first, second] = await Promise.all([
            fx.requests.claimVerified(ctx, state),
            fx.requests.claimVerified(ctx, state),
        ]);
        expect([first, second].filter(v => v === '7').length).toBe(1);
        expect(await fx.requests.claimVerified(ctx, state)).toBeNull();
    });

    it('refuses a new request above the pending cap and counts only live ones', async () => {
        const capped = new OidcRequestStoreService(fx.connection, {
            maxPendingRequests: 2,
        } as never);
        expect(await capped.create(ctx, 'n', 'v')).not.toBeNull();
        expect(await capped.create(ctx, 'n', 'v')).not.toBeNull();
        expect(await capped.create(ctx, 'n', 'v')).toBeNull();
        await fx.dataSource.query(
            `UPDATE oidc_auth_request SET "expiresAt" = now() - interval '1 second'`,
        );
        expect(await capped.create(ctx, 'n', 'v')).not.toBeNull();
    });

    it('deletes expired rows after an hour, not before', async () => {
        await fx.requests.create(ctx, 'n', 'v');
        await fx.requests.create(ctx, 'n', 'v');
        await fx.dataSource.query(
            `UPDATE oidc_auth_request SET "expiresAt" = now() - interval '30 minutes' WHERE id = 1`,
        );
        expect(await fx.requests.deleteExpired(ctx)).toBe(0);
        await fx.dataSource.query(
            `UPDATE oidc_auth_request SET "expiresAt" = now() - interval '2 hours' WHERE id = 1`,
        );
        expect(await fx.requests.deleteExpired(ctx)).toBe(1);
    });
});
