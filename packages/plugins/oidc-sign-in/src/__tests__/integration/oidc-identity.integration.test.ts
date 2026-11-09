import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { OidcFixture, ctx, openOidcFixture } from './oidc-fixture';

let fx: OidcFixture;
beforeAll(async () => {
    fx = await openOidcFixture('oidc_identity');
});
afterAll(() => fx.close());
beforeEach(() => fx.reset());

describe('linking by e-mail, then by sub', () => {
    it('links a single active administrator case-insensitively and stores the sub', async () => {
        const id = await fx.addAdmin('Person@Example.com');
        expect(await fx.identity.resolve(ctx, { sub: 's1', email: 'person@example.COM' })).toBe(id);
        expect(await fx.linkedSubs()).toEqual([{ userId: id, sub: 's1' }]);
    });

    it('later signs in by sub only, ignoring a changed or missing e-mail', async () => {
        const id = await fx.addAdmin('person@example.com');
        await fx.identity.resolve(ctx, { sub: 's1', email: 'person@example.com' });
        expect(await fx.identity.resolve(ctx, { sub: 's1', email: 'other@example.com' })).toBe(id);
        expect(await fx.identity.resolve(ctx, { sub: 's1', email: null })).toBe(id);
    });

    it('refuses a missing e-mail claim on first sign-in', async () => {
        await fx.addAdmin('person@example.com');
        expect(await fx.identity.resolve(ctx, { sub: 's1', email: null })).toBeNull();
        expect(await fx.linkedSubs()).toEqual([]);
    });

    it('refuses no match and an ambiguous match, linking nothing', async () => {
        expect(
            await fx.identity.resolve(ctx, { sub: 's1', email: 'nobody@example.com' }),
        ).toBeNull();
        await fx.addAdmin('dup@example.com', { identifier: 'dup-1' });
        await fx.addAdmin('DUP@example.com', { identifier: 'dup-2' });
        expect(await fx.identity.resolve(ctx, { sub: 's2', email: 'dup@example.com' })).toBeNull();
        expect(await fx.linkedSubs()).toEqual([]);
    });

    it('refuses a deactivated administrator on e-mail and on sub', async () => {
        await fx.addAdmin('gone@example.com', { deleted: true });
        expect(await fx.identity.resolve(ctx, { sub: 's1', email: 'gone@example.com' })).toBeNull();
        const id = await fx.addAdmin('later@example.com');
        await fx.identity.resolve(ctx, { sub: 's2', email: 'later@example.com' });
        await fx.dataSource.query(
            `UPDATE administrator SET "deletedAt" = now() WHERE "userId" = $1`,
            [id],
        );
        expect(
            await fx.identity.resolve(ctx, { sub: 's2', email: 'later@example.com' }),
        ).toBeNull();
    });

    it('refuses a sub already linked to another administrator', async () => {
        await fx.addAdmin('a@example.com');
        const b = await fx.addAdmin('b@example.com');
        await fx.identity.resolve(ctx, { sub: 's1', email: 'a@example.com' });
        const viaSub = await fx.identity.resolve(ctx, { sub: 's1', email: 'b@example.com' });
        expect(viaSub).not.toBe(b);
        expect((await fx.linkedSubs()).length).toBe(1);
    });

    it('refuses to link a second sub to an already linked administrator', async () => {
        await fx.addAdmin('a@example.com');
        await fx.identity.resolve(ctx, { sub: 's1', email: 'a@example.com' });
        expect(await fx.identity.resolve(ctx, { sub: 's2', email: 'a@example.com' })).toBeNull();
        expect((await fx.linkedSubs()).length).toBe(1);
    });

    it('never signs in the superadmin', async () => {
        await fx.addAdmin('root@example.com', { identifier: 'superadmin' });
        expect(await fx.identity.resolve(ctx, { sub: 's1', email: 'root@example.com' })).toBeNull();
    });

    it('concurrent first sign-ins of two subs for one e-mail link exactly one', async () => {
        await fx.addAdmin('race@example.com');
        const results = await Promise.all([
            fx.identity.resolve(ctx, { sub: 'sa', email: 'race@example.com' }),
            fx.identity.resolve(ctx, { sub: 'sb', email: 'race@example.com' }),
        ]);
        expect(results.filter(Boolean).length).toBe(1);
        expect((await fx.linkedSubs()).length).toBe(1);
    });
});
