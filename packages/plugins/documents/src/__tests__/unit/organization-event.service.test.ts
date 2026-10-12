import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { OrganizationEventService } from '../../organization-event.service';

const ctx = {} as RequestContext;
const none = {};

const mockQb = {
    select: vi.fn(),
    where: vi.fn(),
    andWhere: vi.fn(),
    setParameter: vi.fn(),
    getRawMany: vi.fn(),
};
for (const k of ['select', 'where', 'andWhere', 'setParameter'] as const) {
    mockQb[k].mockReturnValue(mockQb);
}
const orgRepo = {
    findOne: vi.fn(),
    create: vi.fn((v: unknown) => ({ ...(v as object) })),
    save: vi.fn(async (v: unknown) => ({ id: '5', ...(v as object) })),
};
const docRepo = { createQueryBuilder: vi.fn(() => mockQb), update: vi.fn() };
const connection = {
    getRepository: vi.fn((_c: unknown, entity: { name: string }) =>
        entity.name === 'Document' ? docRepo : orgRepo,
    ),
};
const pdf = { enqueue: vi.fn() };
const service = new OrganizationEventService(connection as never, pdf as never);

beforeEach(() => {
    vi.clearAllMocks();
    mockQb.getRawMany.mockResolvedValue([]);
});

describe('OrganizationEventService.upsertFromEvent', () => {
    it('creates a row with all provided requisites', async () => {
        orgRepo.findOne.mockResolvedValue(null);
        const ok = await service.upsertFromEvent(ctx, 'org-1', {
            legalName: 'Acme',
            isActive: true,
            fields: {
                inn: '1',
                kpp: '2',
                ogrn: '3',
                legalAddress: 'A',
                bankName: 'B',
                bankAccount: 'C',
                bankBik: 'D',
                correspondentAccount: 'E',
            },
        });
        expect(ok).toBe(true);
        expect(orgRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({
                erpId: 'org-1',
                legalName: 'Acme',
                inn: '1',
                bankBik: 'D',
                correspondentAccount: 'E',
            }),
        );
    });

    it('never wipes stored values with empty ones but overwrites with non-empty', async () => {
        orgRepo.findOne.mockResolvedValue({
            erpId: 'org-1',
            legalName: 'Old',
            isActive: true,
            inn: '111',
            legalAddress: 'Old addr',
            kpp: 'k',
        });
        await service.upsertFromEvent(ctx, 'org-1', {
            legalName: 'New',
            isActive: false,
            fields: { inn: null, legalAddress: 'New addr', kpp: '' },
        });
        expect(orgRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({
                legalName: 'New',
                isActive: false,
                inn: '111',
                legalAddress: 'New addr',
                kpp: 'k',
            }),
        );
    });

    it('keeps the stored legalName when the event has none (tombstone)', async () => {
        orgRepo.findOne.mockResolvedValue({ erpId: 'org-1', legalName: 'Keep', isActive: true });
        await service.upsertFromEvent(ctx, 'org-1', {
            legalName: null,
            isActive: false,
            fields: none,
        });
        expect(orgRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({ legalName: 'Keep', isActive: false }),
        );
    });

    it('creates nothing for a nameless event on an unknown row', async () => {
        orgRepo.findOne.mockResolvedValue(null);
        expect(
            await service.upsertFromEvent(ctx, 'org-x', {
                legalName: null,
                isActive: false,
                fields: none,
            }),
        ).toBe(false);
        expect(orgRepo.save).not.toHaveBeenCalled();
    });

    it('requeues failed proforma documents once when the row becomes complete', async () => {
        orgRepo.findOne.mockResolvedValue({
            erpId: 'org-1',
            legalName: 'A',
            isActive: true,
            inn: null,
            legalAddress: null,
        });
        mockQb.getRawMany.mockResolvedValue([{ id: '10' }, { id: '11' }]);
        docRepo.update
            .mockResolvedValueOnce({ affected: 1 })
            .mockResolvedValueOnce({ affected: 0 });
        await service.upsertFromEvent(ctx, 'org-1', {
            legalName: 'A',
            isActive: true,
            fields: { inn: '1', legalAddress: 'X' },
        });
        expect(docRepo.update).toHaveBeenCalledWith(
            { id: '10', status: 'failed' },
            { status: 'pending', metadata: null },
        );
        expect(pdf.enqueue).toHaveBeenCalledTimes(1);
        expect(pdf.enqueue).toHaveBeenCalledWith('10');
    });

    it('does not requeue when requisites stay incomplete or were already complete', async () => {
        orgRepo.findOne.mockResolvedValue({
            erpId: 'org-1',
            legalName: 'A',
            isActive: true,
            inn: null,
            legalAddress: null,
        });
        await service.upsertFromEvent(ctx, 'org-1', {
            legalName: 'A',
            isActive: true,
            fields: { inn: '1' },
        });
        orgRepo.findOne.mockResolvedValue({
            erpId: 'org-1',
            legalName: 'A',
            isActive: true,
            inn: '1',
            legalAddress: 'X',
        });
        await service.upsertFromEvent(ctx, 'org-1', {
            legalName: 'A',
            isActive: true,
            fields: { inn: '2' },
        });
        expect(mockQb.getRawMany).not.toHaveBeenCalled();
        expect(pdf.enqueue).not.toHaveBeenCalled();
    });
});
