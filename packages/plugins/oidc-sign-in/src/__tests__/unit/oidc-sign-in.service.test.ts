import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { OidcSignInService } from '../../oidc-sign-in.service';

const ctx = { apiType: 'admin' } as RequestContext;

function build(over: {
    exchange?: unknown;
    resolved?: string | null;
    locked?: boolean;
    begin?: unknown;
    verification?: boolean;
    verified?: boolean;
    create?: string | null;
    taken?: { idToken: string } | null;
}) {
    const failures: string[] = [];
    const tx = { open: 0, openAtExchange: -1, transactions: 0 };
    const connection = {
        withTransaction: async (_c: unknown, work: (c: unknown) => Promise<unknown>) => {
            tx.open++;
            tx.transactions++;
            try {
                return await work(ctx);
            } finally {
                tx.open--;
            }
        },
    };
    const requests = {
        beginExchange: async () =>
            'begin' in over ? over.begin : { id: 1, nonce: 'n', codeVerifier: 'v' },
        markVerified: vi.fn(),
        create: async () => ('create' in over ? over.create : 'state-1'),
        claimVerified: async () => '5',
    };
    const tokens = {
        save: vi.fn(),
        takeForSession: vi.fn(async () => ('taken' in over ? over.taken : { idToken: 'tok' })),
    };
    const service = new OidcSignInService(
        {
            exchange: async () => {
                tx.openAtExchange = tx.open;
                return 'exchange' in over
                    ? over.exchange
                    : { sub: 's', email: 'a@b.c', idToken: 'tok' };
            },
            endSessionUrl: async (t: string) => `https://idp.example.com/logout?hint=${t}`,
            authorizationUrl: async (st: string) => `https://idp.example.com/auth?state=${st}`,
        } as never,
        requests as never,
        tokens as never,
        { resolve: async () => ('resolved' in over ? over.resolved : '5') } as never,
        {
            isLocked: async () => over.locked ?? false,
            recordFailure: async () => void failures.push('fail'),
            reset: async () => void failures.push('reset'),
        } as never,
        { getUserById: async () => ({ id: 5, verified: over.verified ?? true }) } as never,
        { authOptions: { requireVerification: over.verification ?? false } } as never,
        connection as never,
    );
    return { service, requests, tokens, failures, tx };
}

describe('OidcSignInService', () => {
    it('verifies the request and asks for no local second step', async () => {
        const { service, requests, failures } = build({});
        expect(await service.complete(ctx, 'code', 'state')).toBe(true);
        expect(requests.markVerified).toHaveBeenCalledWith(ctx, 1, '5');
        expect(failures).toEqual(['reset']);
    });

    it('keeps the ID token for the administrator when the request is verified', async () => {
        const { service, tokens } = build({});
        await service.complete(ctx, 'code', 'state');
        expect(tokens.save).toHaveBeenCalledWith(ctx, 5, 'tok');
    });

    it('keeps no ID token when the sign-in is refused', async () => {
        const { service, tokens } = build({ resolved: null });
        await service.complete(ctx, 'code', 'state');
        expect(tokens.save).not.toHaveBeenCalled();
    });

    it('returns the provider logout URL for a provider-opened session', async () => {
        const { service } = build({});
        const signedIn = { ...ctx, activeUserId: 5, session: { token: 't1' } } as never;
        expect(await service.providerSignOutUrl(signedIn)).toBe(
            'https://idp.example.com/logout?hint=tok',
        );
    });

    it('returns no URL for a local session or without a session', async () => {
        const { service } = build({ taken: null });
        const signedIn = { ...ctx, activeUserId: 5, session: { token: 't1' } } as never;
        expect(await service.providerSignOutUrl(signedIn)).toBeNull();
        expect(await service.providerSignOutUrl(ctx)).toBeNull();
    });

    it('calls the provider with no transaction open, between two short transactions', async () => {
        const { service, tx } = build({});
        await service.complete(ctx, 'code', 'state');
        expect(tx.openAtExchange).toBe(0);
        expect(tx.transactions).toBe(2);
    });

    it('refuses to start above the pending cap with a generic error', async () => {
        await expect(build({ create: null }).service.start(ctx)).rejects.toThrow(
            'OIDC sign-in is unavailable',
        );
        await expect(build({}).service.start(ctx)).resolves.toContain('state=state-1');
    });

    it('opens a session from a verified request without any second-step policy', async () => {
        expect(await build({}).service.claim(ctx, 'state')).toMatchObject({ id: 5 });
    });

    it.each([
        ['replayed state', { begin: null }],
        ['provider refusal', { exchange: null }],
        ['throttled subject', { locked: true }],
        ['no matching administrator', { resolved: null }],
        ['unverified account', { verification: true, verified: false }],
    ])('refuses %s', async (_n, over) => {
        const { service, requests } = build(over);
        expect(await service.complete(ctx, 'code', 'state')).toBe(false);
        expect(requests.markVerified).not.toHaveBeenCalled();
    });

    it('counts a failed link towards the throttle', async () => {
        const { service, failures } = build({ resolved: null });
        await service.complete(ctx, 'code', 'state');
        expect(failures).toEqual(['fail']);
    });
});
