import { describe, expect, it } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { TwoFactorEnrolmentService } from '../../two-factor-enrolment.service';
import type { TwoFactorApi, TwoFactorPluginOptions } from '../../two-factor.types';
import { totpMethod } from '../../totp/totp-method';

function serviceFor(options: Partial<TwoFactorPluginOptions>): TwoFactorEnrolmentService {
    const factors = {
        hasActive: async () => false,
        newUuid: () => 'uuid-1',
        replacePending: async () => new Date(),
    };
    const tokens = {
        findUserId: async () => '7',
        findUsable: async (ctx: RequestContext) => ({ stage: 'ENROL', apiType: ctx.apiType }),
    };
    const locks = {
        withUser: async (ctx: RequestContext, _id: string, fn: (c: RequestContext) => unknown) =>
            fn(ctx),
    };
    const users = { getUserById: async () => ({ identifier: 'user@example.com' }) };
    const methods = { get: () => totpMethod };
    return new TwoFactorEnrolmentService(
        factors as never,
        tokens as never,
        {} as never,
        {} as never,
        locks as never,
        users as never,
        methods as never,
        { encryptionKey: Buffer.alloc(32, 1), required: true, issuer: 'Site A', ...options },
    );
}

async function issuerFor(
    api: TwoFactorApi,
    options: Partial<TwoFactorPluginOptions>,
): Promise<string> {
    const result = await serviceFor(options).startForChallenge(
        { apiType: api } as RequestContext,
        'c',
    );
    if (result.__typename !== 'TwoFactorEnrolment') throw new Error('enrolment expected');
    return new URL(result.otpauthUri).searchParams.get('issuer') ?? '';
}

describe('enrolment issuer', () => {
    const issuerByApi = { shop: 'shop.example.com', admin: 'sales.example.com' };

    it('names the shop entry by the shop domain and the manager entry by the manager domain', async () => {
        expect(await issuerFor('shop', { issuerByApi })).toBe('shop.example.com');
        expect(await issuerFor('admin', { issuerByApi })).toBe('sales.example.com');
    });

    it('falls back to the site name when the portal has no domain', async () => {
        expect(await issuerFor('admin', { issuerByApi: { shop: 'shop.example.com' } })).toBe(
            'Site A',
        );
        expect(await issuerFor('shop', {})).toBe('Site A');
    });
});
