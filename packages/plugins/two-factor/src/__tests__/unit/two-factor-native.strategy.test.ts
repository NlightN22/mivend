import { describe, expect, it, vi } from 'vitest';
import type { Injector, RequestContext, User } from '@vendure/core';

import { FactorStoreService } from '../../factor-store.service';
import { TwoFactorLockService } from '../../two-factor-lock.service';
import {
    TWO_FACTOR_INVALID_CODE_ERROR,
    TWO_FACTOR_REQUIRED_ERROR,
    TwoFactorNativeAuthenticationStrategy,
} from '../../two-factor-native.strategy';
import { TwoFactorPolicyService } from '../../two-factor-policy.service';
import { TwoFactorVerificationService } from '../../two-factor-verification.service';

const USER = { id: 7 } as User;
const adminCtx = { apiType: 'admin' } as RequestContext;
const shopCtx = { apiType: 'shop' } as RequestContext;

async function build(options: {
    passwords: Record<string, boolean>;
    enforced: boolean;
    codeAccepted?: boolean;
}): Promise<{
    strategy: TwoFactorNativeAuthenticationStrategy;
    attempted: string[];
    verifyAndClaim: ReturnType<typeof vi.fn>;
}> {
    const attempted: string[] = [];
    const native = {
        init: async () => {},
        defineInputType: vi.fn(),
        verifyUserPassword: vi.fn(),
        authenticate: async (_ctx: RequestContext, data: { password: string }) => {
            attempted.push(data.password);
            return options.passwords[data.password] ? USER : false;
        },
    };
    const verifyAndClaim = vi.fn(async () => options.codeAccepted ?? false);
    const services = new Map<unknown, unknown>([
        [TwoFactorPolicyService, { isEnforced: async () => options.enforced }],
        [TwoFactorVerificationService, { verifyAndClaim }],
        [FactorStoreService, { find: async () => ({ id: 1 }) }],
        [
            TwoFactorLockService,
            { withUser: (_c: unknown, _u: string, work: (c: unknown) => unknown) => work({}) },
        ],
    ]);
    const strategy = new TwoFactorNativeAuthenticationStrategy(native);
    await strategy.init({ get: (token: unknown) => services.get(token) } as unknown as Injector);
    return { strategy, attempted, verifyAndClaim };
}

describe('native strategy wrapper', () => {
    it('keeps the stock name so core flows still find it', async () => {
        expect((await build({ passwords: {}, enforced: false })).strategy.name).toBe('native');
    });

    it('returns the user when no second step is needed', async () => {
        const { strategy } = await build({ passwords: { pw: true }, enforced: false });
        expect(await strategy.authenticate(shopCtx, { username: 'u', password: 'pw' })).toBe(USER);
    });

    it('refuses a correct password alone when the account needs a code, on both APIs', async () => {
        const { strategy } = await build({ passwords: { pw: true }, enforced: true });
        for (const ctx of [shopCtx, adminCtx]) {
            expect(await strategy.authenticate(ctx, { username: 'u', password: 'pw' })).toBe(
                TWO_FACTOR_REQUIRED_ERROR,
            );
        }
    });

    it('returns false for a wrong password without revealing the second step', async () => {
        const { strategy } = await build({ passwords: {}, enforced: true });
        expect(await strategy.authenticate(shopCtx, { username: 'u', password: 'bad' })).toBe(
            false,
        );
    });

    it('accepts "<password> <code>" for administrators only when the code is valid', async () => {
        const ok = await build({ passwords: { pw: true }, enforced: true, codeAccepted: true });
        expect(
            await ok.strategy.authenticate(adminCtx, { username: 'u', password: 'pw 123456' }),
        ).toBe(USER);
        const bad = await build({ passwords: { pw: true }, enforced: true, codeAccepted: false });
        expect(
            await bad.strategy.authenticate(adminCtx, { username: 'u', password: 'pw 123456' }),
        ).toBe(TWO_FACTOR_INVALID_CODE_ERROR);
    });

    it('does not read a code out of the password on the shop API', async () => {
        const { strategy, verifyAndClaim } = await build({
            passwords: { pw: true },
            enforced: true,
            codeAccepted: true,
        });
        expect(await strategy.authenticate(shopCtx, { username: 'u', password: 'pw 123456' })).toBe(
            false,
        );
        expect(verifyAndClaim).not.toHaveBeenCalled();
    });

    it('still signs in an administrator whose real password ends in a space and six digits', async () => {
        const { strategy, attempted } = await build({
            passwords: { 'pw 123456': true },
            enforced: false,
        });
        expect(
            await strategy.authenticate(adminCtx, { username: 'u', password: 'pw 123456' }),
        ).toBe(USER);
        expect(attempted).toEqual(['pw', 'pw 123456']);
    });
});
