import { describe, it, expect, vi, Mock } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { OrganizationStreamHandler } from '../../handlers/organization.handler';

const ctx = {} as RequestContext;
interface SetupResult {
    service: { upsertFromEvent: Mock };
    bank: { refresh: Mock };
    handler: OrganizationStreamHandler;
}

const setup = (stored = true): SetupResult => {
    const service = { upsertFromEvent: vi.fn().mockResolvedValue(stored) };
    const bank = { refresh: vi.fn().mockResolvedValue(1) };
    return {
        service,
        bank,
        handler: new OrganizationStreamHandler(service as never, bank as never),
    };
};
const empty = { inn: null, kpp: null, ogrn: null };

describe('OrganizationStreamHandler', () => {
    it('maps the fields the event still carries onto the requisites input and ignores the removed ones', async () => {
        const { service, handler } = setup();
        const outcome = await handler.apply(ctx, 'org-1', {
            name: 'Short',
            legalName: 'Full Legal LLC',
            isActive: true,
            inn: '7700000000',
            kpp: '770001001',
            ogrn: '1020000000000',
            mainBankAccountId: 'acc-1',
            legalAddress: '1 Demo Ave',
            bankName: 'Demo Bank',
            phone: '+0 000 000',
            signatories: [{ role: 'Руководитель', personName: 'Head H. H.' }],
        });

        expect(outcome).toEqual({ kind: 'applied' });
        expect(service.upsertFromEvent).toHaveBeenCalledWith(ctx, 'org-1', {
            legalName: 'Full Legal LLC',
            isActive: true,
            fields: { inn: '7700000000', kpp: '770001001', ogrn: '1020000000000' },
            mainBankAccountId: 'acc-1',
        });
    });

    it('refreshes the bank requisites of the organization after each stored event, not for an unknown tombstone', async () => {
        const { bank, handler } = setup();
        await handler.apply(ctx, 'org-1', { name: 'Acme' });
        expect(bank.refresh).toHaveBeenCalledWith(ctx, { organizationErpId: 'org-1' });
        const unknown = setup(false);
        await unknown.handler.apply(ctx, 'org-1', { isDeleted: true });
        expect(unknown.bank.refresh).not.toHaveBeenCalled();
    });

    it('keeps the stored main bank account when the event omits it', async () => {
        const { service, handler } = setup();
        await handler.apply(ctx, 'org-1', { name: 'Acme' });
        expect(service.upsertFromEvent.mock.calls[0][2].mainBankAccountId).toBeUndefined();
    });

    it('falls back to name when legalName is absent or empty', async () => {
        const { service, handler } = setup();
        await handler.apply(ctx, 'org-1', { name: 'Acme', legalName: '' });
        expect(service.upsertFromEvent).toHaveBeenCalledWith(ctx, 'org-1', {
            legalName: 'Acme',
            isActive: undefined,
            fields: empty,
            mainBankAccountId: undefined,
        });
    });

    it('treats empty strings as not provided (null), never as a value', async () => {
        const { service, handler } = setup();
        await handler.apply(ctx, 'org-1', { name: 'Acme', inn: '', kpp: '  ' });
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
});
