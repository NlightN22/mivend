import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { OrganizationEventService } from '../../organization-event.service';
import { ProformaRequeueService } from '../../proforma-requeue.service';

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
    query: vi.fn(),
};
const docRepo = { createQueryBuilder: vi.fn(() => mockQb), update: vi.fn() };
const connection = {
    withTransaction: vi.fn(async (c: unknown, work: (x: unknown) => unknown) => work(c)),
    getRepository: vi.fn((_c: unknown, entity: { name: string }) =>
        entity.name === 'Document' ? docRepo : orgRepo,
    ),
};
const pdf = { enqueue: vi.fn() };
const service = new OrganizationEventService(
    connection as never,
    new ProformaRequeueService(connection as never, pdf as never),
);

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

    it('keeps the stored isActive when the event does not carry it', async () => {
        orgRepo.findOne.mockResolvedValue({ erpId: 'org-1', legalName: 'A', isActive: true });
        await service.upsertFromEvent(ctx, 'org-1', { legalName: 'A', fields: none });
        expect(orgRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: true }));
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
            fields: { inn: '1', bankName: 'B', bankBik: '0', bankAccount: '0' },
        });
        expect(docRepo.update).toHaveBeenCalledWith(
            { id: '10', status: 'failed' },
            { status: 'pending', metadata: null },
        );
        expect(pdf.enqueue).toHaveBeenCalledTimes(1);
        expect(pdf.enqueue).toHaveBeenCalledWith('10');
    });

    it('does not requeue when requisites stay incomplete', async () => {
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
            fields: { inn: '1', legalAddress: 'X' },
        });
        expect(mockQb.getRawMany).not.toHaveBeenCalled();
        expect(pdf.enqueue).not.toHaveBeenCalled();
    });

    it('takes a per-organization advisory lock before reading the row', async () => {
        orgRepo.findOne.mockResolvedValue({ erpId: 'org-1', legalName: 'A' });
        await service.upsertFromEvent(ctx, 'org-1', {
            legalName: 'A',
            isActive: true,
            fields: none,
        });
        expect(orgRepo.query).toHaveBeenCalledWith(
            expect.stringContaining('pg_advisory_xact_lock'),
            ['organization-requisites:org-1'],
        );
        expect(orgRepo.query.mock.invocationCallOrder[0]).toBeLessThan(
            orgRepo.findOne.mock.invocationCallOrder[0],
        );
    });

    it('puts the document back to failed and rethrows when the enqueue fails', async () => {
        orgRepo.findOne.mockResolvedValue({
            erpId: 'org-1',
            legalName: 'A',
            isActive: true,
            inn: '1',
            bankName: 'B',
            bankBik: '0',
            bankAccount: '0',
            legalAddress: 'X',
        });
        mockQb.getRawMany.mockResolvedValue([{ id: '10' }]);
        docRepo.update.mockResolvedValue({ affected: 1 });
        pdf.enqueue.mockRejectedValueOnce(new Error('queue down'));
        await expect(
            service.upsertFromEvent(ctx, 'org-1', { legalName: 'A', isActive: true, fields: none }),
        ).rejects.toThrow('queue down');
        expect(docRepo.update).toHaveBeenLastCalledWith(
            { id: '10', status: 'pending' },
            { status: 'failed' },
        );
    });

    it('replaces the signatory list with a non-empty one and keeps it on an empty list', async () => {
        const stored = [
            { role: 'Руководитель', roleLabel: 'H', personName: 'Old', position: null },
        ];
        const next = [{ role: 'Руководитель', roleLabel: 'H', personName: 'New', position: 'CEO' }];
        orgRepo.findOne.mockResolvedValue({ erpId: 'org-1', legalName: 'A', signatories: stored });
        await service.upsertFromEvent(ctx, 'org-1', {
            legalName: null,
            isActive: true,
            fields: {},
            signatories: [],
        });
        expect(orgRepo.save).toHaveBeenLastCalledWith(
            expect.objectContaining({ signatories: stored }),
        );
        await service.upsertFromEvent(ctx, 'org-1', {
            legalName: null,
            isActive: true,
            fields: {},
            signatories: next,
        });
        expect(orgRepo.save).toHaveBeenLastCalledWith(
            expect.objectContaining({ signatories: next }),
        );
    });

    it('keeps a stored phone when the event phone is empty', async () => {
        orgRepo.findOne.mockResolvedValue({ erpId: 'org-1', legalName: 'A', phone: '+0 1' });
        await service.upsertFromEvent(ctx, 'org-1', {
            legalName: null,
            isActive: true,
            fields: { phone: null },
        });
        expect(orgRepo.save).toHaveBeenLastCalledWith(expect.objectContaining({ phone: '+0 1' }));
    });

    it('clears a stored phone on a named event with an empty phone, keeps legal requisites', async () => {
        orgRepo.findOne.mockResolvedValue({
            erpId: 'org-1',
            legalName: 'A',
            phone: '+0 1',
            inn: '123',
        });
        for (let i = 0; i < 2; i++) {
            await service.upsertFromEvent(ctx, 'org-1', {
                legalName: 'A',
                isActive: true,
                fields: { phone: null, inn: null },
            });
        }
        expect(orgRepo.save).toHaveBeenLastCalledWith(
            expect.objectContaining({ phone: null, inn: '123' }),
        );
    });
});
