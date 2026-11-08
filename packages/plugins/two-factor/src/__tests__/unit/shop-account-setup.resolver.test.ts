import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    AuthService,
    ConfigService,
    CustomerService,
    RequestContext,
    User,
} from '@vendure/core';

import { ShopAccountSetupResolver } from '../../api/shop-account-setup.resolver';
import type { TwoFactorPolicyService } from '../../two-factor-policy.service';

const setHeader = vi.fn();
const ctx = {} as RequestContext;
const user = {
    id: 5,
    identifier: 'customer@example.org',
    roles: [{ permissions: ['Authenticated'], channels: [{ id: 1, token: 't', code: 'default' }] }],
} as unknown as User;
const req = {} as never;
const res = { set: setHeader } as never;

function build(enforced: boolean): {
    resolver: ShopAccountSetupResolver;
    createSession: ReturnType<typeof vi.fn>;
} {
    const createSession = vi.fn(async () => ({ token: 'session-token', user }));
    const customers = {
        verifyCustomerEmailAddress: vi.fn(async () => ({ user })),
        resetPassword: vi.fn(async (_c: unknown, token: string) =>
            token === 'bad'
                ? { __typename: 'PasswordResetTokenInvalidError', errorCode: 'X', message: 'm' }
                : user,
        ),
    } as unknown as CustomerService;
    const resolver = new ShopAccountSetupResolver(
        customers,
        { createAuthenticatedSessionForUser: createSession } as unknown as AuthService,
        {
            authOptions: { tokenMethod: ['bearer'], authTokenHeaderKey: 'vendure-auth-token' },
        } as unknown as ConfigService,
        { isEnforced: async () => enforced } as unknown as TwoFactorPolicyService,
    );
    return { resolver, createSession };
}

beforeEach(() => setHeader.mockReset());

describe('account setup flows that core ends with a sign-in', () => {
    it.each(['verifyCustomerAccount', 'resetPassword'] as const)(
        '%s opens no session for an account that needs a second step',
        async flow => {
            const { resolver, createSession } = build(true);
            const result =
                flow === 'verifyCustomerAccount'
                    ? await resolver.verifyCustomerAccount(
                          ctx,
                          { token: 't', password: 'p' },
                          req,
                          res,
                      )
                    : await resolver.resetPassword(ctx, { token: 't', password: 'p' }, req, res);
            expect(createSession).not.toHaveBeenCalled();
            expect(setHeader).not.toHaveBeenCalled();
            expect(result).toMatchObject({ __typename: 'CurrentUser', id: 5, channels: [] });
        },
    );

    it.each(['verifyCustomerAccount', 'resetPassword'] as const)(
        '%s still signs in an account that needs no second step',
        async flow => {
            const { resolver, createSession } = build(false);
            const result =
                flow === 'verifyCustomerAccount'
                    ? await resolver.verifyCustomerAccount(
                          ctx,
                          { token: 't', password: 'p' },
                          req,
                          res,
                      )
                    : await resolver.resetPassword(ctx, { token: 't', password: 'p' }, req, res);
            expect(createSession).toHaveBeenCalledWith(ctx, user, 'native');
            expect(setHeader).toHaveBeenCalledWith('vendure-auth-token', 'session-token');
            expect(result).toMatchObject({
                id: 5,
                channels: [{ code: 'default', permissions: ['Authenticated'] }],
            });
        },
    );

    it('passes a token error through and creates nothing', async () => {
        const { resolver, createSession } = build(false);
        const result = await resolver.resetPassword(ctx, { token: 'bad', password: 'p' }, req, res);
        expect(result).toMatchObject({ __typename: 'PasswordResetTokenInvalidError' });
        expect(createSession).not.toHaveBeenCalled();
    });
});
