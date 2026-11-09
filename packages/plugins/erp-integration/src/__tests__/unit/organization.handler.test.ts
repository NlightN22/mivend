import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { OrganizationStreamHandler } from '../../handlers/organization.handler';

const ctx = {} as RequestContext;
const setup = (stored = true) => {
    const service = { upsertFromEvent: vi.fn().mockResolvedValue(stored) };
    const points = { replaceErpPointsByErpId: vi.fn().mockResolvedValue(true) };
    return {
        service,
        points,
        handler: new OrganizationStreamHandler(service as never, points as never),
    };
};
const empty = {
    inn: null,
    kpp: null,
    ogrn: null,
    legalAddress: null,
    bankName: null,
    bankAccount: null,
    bankBik: null,
    correspondentAccount: null,
    phone: null,
};

describe('OrganizationStreamHandler', () => {
    it('maps every contract field onto the requisites input', async () => {
        const { service, handler } = setup();
        const outcome = await handler.apply(ctx, 'org-1', {
            name: 'Short',
            legalName: 'Full Legal LLC',
            isActive: true,
            inn: '7700000000',
            kpp: '770001001',
            ogrn: '1020000000000',
            legalAddress: '1 Demo Ave',
            bankName: 'Demo Bank',
            bankAccount: '40702810000000000001',
            bankBik: '044525000',
            correspondentAccount: '30101810000000000002',
            phone: '+0 000 000',
            signatories: [
                {
                    role: 'Руководитель',
                    roleLabel: 'Head',
                    personName: 'Head H. H.',
                    position: 'CEO',
                },
                { role: 'Кассир', roleLabel: 'Cashier', personName: '' },
                { role: '', personName: 'No Role' },
            ],
        });

        expect(outcome).toEqual({ kind: 'applied' });
        expect(service.upsertFromEvent).toHaveBeenCalledWith(ctx, 'org-1', {
            legalName: 'Full Legal LLC',
            isActive: true,
            fields: {
                inn: '7700000000',
                kpp: '770001001',
                ogrn: '1020000000000',
                legalAddress: '1 Demo Ave',
                bankName: 'Demo Bank',
                bankAccount: '40702810000000000001',
                bankBik: '044525000',
                correspondentAccount: '30101810000000000002',
                phone: '+0 000 000',
            },
            signatories: [
                {
                    role: 'Руководитель',
                    roleLabel: 'Head',
                    personName: 'Head H. H.',
                    position: 'CEO',
                },
            ],
        });
    });

    it('falls back to name when legalName is absent or empty', async () => {
        const { service, handler } = setup();
        await handler.apply(ctx, 'org-1', { name: 'Acme', legalName: '' });
        expect(service.upsertFromEvent).toHaveBeenCalledWith(ctx, 'org-1', {
            legalName: 'Acme',
            isActive: undefined,
            fields: empty,
            signatories: [],
        });
    });

    it('treats empty strings as not provided (null), never as a value', async () => {
        const { service, handler } = setup();
        await handler.apply(ctx, 'org-1', { name: 'Acme', inn: '', legalAddress: '  ' });
        expect(service.upsertFromEvent.mock.calls[0][2].fields).toEqual(empty);
    });

    it('leaves isActive undefined when absent and folds in isDeleted', async () => {
        const { service, handler } = setup();
        await handler.apply(ctx, 'org-1', { name: 'Acme' });
        await handler.apply(ctx, 'org-1', { name: 'Acme', isActive: true, isDeleted: true });
        expect(service.upsertFromEvent.mock.calls[0][2].isActive).toBeUndefined();
        expect(service.upsertFromEvent.mock.calls[1][2].isActive).toBe(false);
    });

    it('passes legalName:null for a nameless tombstone and returns noop when no row matched', async () => {
        const { service, handler } = setup(false);
        const outcome = await handler.apply(ctx, 'org-1', { isDeleted: true });
        expect(service.upsertFromEvent.mock.calls[0][2].legalName).toBeNull();
        expect(outcome).toMatchObject({ kind: 'noop' });
    });

    it('passes an explicit false and true controlsStock, and leaves an absent one undefined', async () => {
        const { service, handler } = setup();
        await handler.apply(ctx, 'org-1', { name: 'Acme', controlsStock: false });
        await handler.apply(ctx, 'org-1', { name: 'Acme', controlsStock: true });
        await handler.apply(ctx, 'org-1', { name: 'Acme' });
        const flags = service.upsertFromEvent.mock.calls.map(c => c[2].controlsStock);
        expect(flags).toEqual([false, true, undefined]);
    });

    it('replaces the ERP channels from a present list and keeps them when the list is absent', async () => {
        const { points, handler } = setup();
        await handler.apply(ctx, 'org-1', {
            name: 'Org',
            contactInfos: [{ type: 'Телефон', presentation: '+7 912 345-67-89' }],
        });
        expect(points.replaceErpPointsByErpId).toHaveBeenCalledWith(ctx, 'organization', 'org-1', [
            expect.objectContaining({ type: 'phone' }),
        ]);
        points.replaceErpPointsByErpId.mockClear();
        await handler.apply(ctx, 'org-1', { name: 'Org' });
        expect(points.replaceErpPointsByErpId).not.toHaveBeenCalled();
    });
});
