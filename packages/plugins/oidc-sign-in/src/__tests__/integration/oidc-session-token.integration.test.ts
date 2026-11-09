import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { OidcFixture, ctx, openOidcFixture } from './oidc-fixture';

let fx: OidcFixture;
beforeAll(async () => {
    fx = await openOidcFixture('oidc_session_token');
});
afterAll(() => fx.close());
beforeEach(() => fx.reset());

const ageTokens = (): Promise<unknown> =>
    fx.dataSource.query(`UPDATE oidc_session_token SET "updatedAt" = now() - interval '1 hour'`);

async function session(
    token: string,
    userId: number,
    opts: { strategy?: string; invalidated?: boolean; expiresInMs?: number } = {},
): Promise<void> {
    await fx.dataSource.query(
        `INSERT INTO session (token, expires, invalidated, "authenticationStrategy", "userId")
         VALUES ($1, now() + ($2 * interval '1 millisecond'), $3, $4, $5)`,
        [
            token,
            opts.expiresInMs ?? 3_600_000,
            opts.invalidated ?? false,
            opts.strategy ?? 'oidc',
            userId,
        ],
    );
}
const stored = (): Promise<Array<{ userId: number; idToken: string }>> =>
    fx.dataSource.query('SELECT "userId", "idToken" FROM oidc_session_token ORDER BY id');

describe('OIDC ID token store (real Postgres)', () => {
    it('keeps one row per administrator, the newest token', async () => {
        await fx.tokens.save(ctx, 7, 'old');
        await fx.tokens.save(ctx, 7, 'new');
        expect(await stored()).toEqual([{ userId: 7, idToken: 'new' }]);
    });

    it('hands out the token for a provider session and drops it with the last such session', async () => {
        await fx.tokens.save(ctx, 7, 'tok');
        await session('s1', 7);
        await ageTokens();
        expect(await fx.tokens.takeForSession(ctx, 7, 's1')).toEqual({ idToken: 'tok' });
        expect(await stored()).toEqual([]);
    });

    it('keeps the token while another live provider session of the administrator exists', async () => {
        await fx.tokens.save(ctx, 7, 'tok');
        await session('s1', 7);
        await session('s2', 7);
        await ageTokens();
        expect(await fx.tokens.takeForSession(ctx, 7, 's1')).toEqual({ idToken: 'tok' });
        expect(await stored()).toHaveLength(1);
        await fx.dataSource.query(`UPDATE session SET invalidated = true WHERE token = 's1'`);
        expect(await fx.tokens.takeForSession(ctx, 7, 's2')).toEqual({ idToken: 'tok' });
        expect(await stored()).toEqual([]);
    });

    it('keeps a freshly saved token even when no other provider session exists', async () => {
        await fx.tokens.save(ctx, 7, 'tok');
        await session('s1', 7);
        expect(await fx.tokens.takeForSession(ctx, 7, 's1')).toEqual({ idToken: 'tok' });
        expect(await stored()).toHaveLength(1);
    });

    it('gives nothing for a local session, another administrator, or an ended session', async () => {
        await fx.tokens.save(ctx, 7, 'tok');
        await session('local', 7, { strategy: 'native' });
        await session('other', 8);
        await session('ended', 7, { invalidated: true });
        expect(await fx.tokens.takeForSession(ctx, 7, 'local')).toBeNull();
        expect(await fx.tokens.takeForSession(ctx, 7, 'other')).toBeNull();
        expect(await fx.tokens.takeForSession(ctx, 7, 'ended')).toBeNull();
        expect(await fx.tokens.takeForSession(ctx, 7, 'missing')).toBeNull();
        expect(await stored()).toHaveLength(1);
    });

    it('sweeps tokens that no live provider session needs, sparing fresh and needed ones', async () => {
        await fx.tokens.save(ctx, 1, 'live');
        await fx.tokens.save(ctx, 2, 'orphan');
        await fx.tokens.save(ctx, 3, 'fresh');
        await session('s1', 1);
        await session('s2', 2, { expiresInMs: -1000 });
        await fx.dataSource.query(
            `UPDATE oidc_session_token SET "updatedAt" = now() - interval '2 hours' WHERE "userId" IN (1, 2)`,
        );
        expect(await fx.tokens.deleteOrphans(ctx)).toBe(1);
        expect((await stored()).map(r => r.userId)).toEqual([1, 3]);
    });
});
