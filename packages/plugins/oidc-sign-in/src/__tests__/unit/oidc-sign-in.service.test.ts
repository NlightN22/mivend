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
}) {
    const failures: string[] = [];
    const requests = {
        beginExchange: async () =>
            'begin' in over ? over.begin : { id: 1, nonce: 'n', codeVerifier: 'v' },
        markVerified: vi.fn(),
        claimVerified: async () => '5',
    };
    const service = new OidcSignInService(
        {
            exchange: async () =>
                'exchange' in over ? over.exchange : { sub: 's', email: 'a@b.c' },
        } as never,
        requests as never,
        { resolve: async () => ('resolved' in over ? over.resolved : '5') } as never,
        {
            isLocked: async () => over.locked ?? false,
            recordFailure: async () => void failures.push('fail'),
            reset: async () => void failures.push('reset'),
        } as never,
        { getUserById: async () => ({ id: 5, verified: over.verified ?? true }) } as never,
        { authOptions: { requireVerification: over.verification ?? false } } as never,
    );
    return { service, requests, failures };
}

describe('OidcSignInService', () => {
    it('verifies the request and asks for no local second step', async () => {
        const { service, requests, failures } = build({});
        expect(await service.complete(ctx, 'code', 'state')).toBe(true);
        expect(requests.markVerified).toHaveBeenCalledWith(ctx, 1, '5');
        expect(failures).toEqual(['reset']);
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
