import { describe, expect, it, vi } from 'vitest';
import type { Injector, RequestContext, User } from '@vendure/core';

import {
    TWO_FACTOR_REQUIRED_ERROR,
    TwoFactorNativeAuthenticationStrategy,
} from '../../two-factor-native.strategy';
import { SignInGuardService } from '@mivend/plugin-sign-in-protection';
import { TwoFactorPolicyService } from '../../two-factor-policy.service';

const USER = { id: 7 } as User;
const adminCtx = { apiType: 'admin' } as RequestContext;
const shopCtx = { apiType: 'shop' } as RequestContext;

async function build(options: {
    passwords: Record<string, boolean>;
    enforced: boolean;
    locked?: boolean;
}): Promise<{
    strategy: TwoFactorNativeAuthenticationStrategy;
    attempted: string[];
    failures: string[];
}> {
    const attempted: string[] = [];
    const failures: string[] = [];
    const native = {
        init: async () => {},
        defineInputType: vi.fn(),
        verifyUserPassword: vi.fn(),
        authenticate: async (_ctx: RequestContext, data: { password: string }) => {
            attempted.push(data.password);
            return options.passwords[data.password] ? USER : false;
        },
    };
    const services = new Map<unknown, unknown>([
        [TwoFactorPolicyService, { isEnforced: async () => options.enforced }],
        [
            SignInGuardService,
            {
                admit: async () => !options.locked,
                recordFailure: async () => {
                    failures.push('failure');
                },
                recordSuccess: async () => {
                    failures.push('success');
                },
            },
        ],
    ]);
    const strategy = new TwoFactorNativeAuthenticationStrategy(native);
    await strategy.init({ get: (token: unknown) => services.get(token) } as unknown as Injector);
    return { strategy, attempted, failures };
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

    it('never reads a code out of the password, on either API', async () => {
        const { strategy, attempted } = await build({ passwords: { pw: true }, enforced: true });
        for (const ctx of [shopCtx, adminCtx]) {
            expect(await strategy.authenticate(ctx, { username: 'u', password: 'pw 123456' })).toBe(
                false,
            );
        }
        expect(attempted).toEqual(['pw 123456', 'pw 123456']);
    });

    it('signs in an administrator whose real password ends in a space and six digits', async () => {
        const { strategy } = await build({ passwords: { 'pw 123456': true }, enforced: false });
        expect(
            await strategy.authenticate(adminCtx, { username: 'u', password: 'pw 123456' }),
        ).toBe(USER);
    });

    it('answers a locked login with false and never checks the password', async () => {
        const { strategy, attempted } = await build({
            passwords: { pw: true },
            enforced: false,
            locked: true,
        });
        expect(await strategy.authenticate(shopCtx, { username: 'u', password: 'pw' })).toBe(false);
        expect(await strategy.verifyCredentials(adminCtx, { username: 'u', password: 'pw' })).toBe(
            false,
        );
        expect(attempted).toEqual([]);
    });

    it('records a failure for a wrong password and a success for a right one', async () => {
        const { strategy, failures } = await build({ passwords: { pw: true }, enforced: false });
        await strategy.authenticate(shopCtx, { username: 'u', password: 'bad' });
        await strategy.authenticate(shopCtx, { username: 'u', password: 'pw' });
        expect(failures).toEqual(['failure', 'success']);
    });
});
