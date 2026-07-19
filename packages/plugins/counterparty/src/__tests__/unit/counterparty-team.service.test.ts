import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestContext, UserInputError } from '@vendure/core';
import { QueryFailedError } from 'typeorm';
import type { AccessScopeService } from '@mivend/plugin-access-control';
import { CounterpartyTeamService } from '../../counterparty-team.service';

const mockCounterpartyRepo = {
    findOne: vi.fn(),
};

const mockTeamRepo = {
    find: vi.fn(),
    create: vi.fn((input: unknown) => input),
    save: vi.fn(),
    delete: vi.fn(),
};

const mockConnection = {
    getRepository: vi.fn((_ctx: unknown, entity: { name: string }) =>
        entity.name === 'Counterparty' ? mockCounterpartyRepo : mockTeamRepo,
    ),
};

const mockAccessScopeService = {
    assertCounterpartyWritable: vi.fn(async () => undefined),
} as unknown as AccessScopeService;

const mockCtx = {} as RequestContext;

describe('CounterpartyTeamService', () => {
    let service: CounterpartyTeamService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new CounterpartyTeamService(mockConnection as never, mockAccessScopeService);
        mockCounterpartyRepo.findOne.mockResolvedValue({
            id: 'cp-1',
            assignedManagerId: 'admin-owner',
            departmentId: 'dept-1',
            branchId: 'branch-a',
        });
    });

    it('addTeamMember saves a valid backup/observer member', async () => {
        mockTeamRepo.save.mockResolvedValue({
            id: 'ctm-1',
            counterpartyId: 'cp-1',
            administratorId: 'admin-2',
            role: 'backup',
        });

        const result = await service.addTeamMember(mockCtx, 'cp-1', 'admin-2', 'backup');

        expect(result.role).toBe('backup');
        expect(mockAccessScopeService.assertCounterpartyWritable).toHaveBeenCalled();
        expect(mockTeamRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({
                counterpartyId: 'cp-1',
                administratorId: 'admin-2',
                role: 'backup',
            }),
        );
    });

    it('addTeamMember rejects an invalid role', async () => {
        await expect(
            service.addTeamMember(mockCtx, 'cp-1', 'admin-2', 'owner' as never),
        ).rejects.toThrow(UserInputError);
        expect(mockTeamRepo.save).not.toHaveBeenCalled();
    });

    it('addTeamMember saves a valid accounting-contact member with a phone number', async () => {
        mockTeamRepo.save.mockResolvedValue({
            id: 'ctm-2',
            counterpartyId: 'cp-1',
            administratorId: 'admin-3',
            role: 'accounting-contact',
            phone: '+1 555 0100',
        });

        const result = await service.addTeamMember(
            mockCtx,
            'cp-1',
            'admin-3',
            'accounting-contact',
            '+1 555 0100',
        );

        expect(result.role).toBe('accounting-contact');
        expect(mockTeamRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({
                role: 'accounting-contact',
                phone: '+1 555 0100',
            }),
        );
    });

    it('addTeamMember defaults phone to null when omitted', async () => {
        mockTeamRepo.save.mockResolvedValue({
            id: 'ctm-3',
            counterpartyId: 'cp-1',
            administratorId: 'admin-4',
            role: 'backup',
            phone: null,
        });

        await service.addTeamMember(mockCtx, 'cp-1', 'admin-4', 'backup');

        expect(mockTeamRepo.save).toHaveBeenCalledWith(expect.objectContaining({ phone: null }));
    });

    it('addTeamMember throws UserInputError when the counterparty does not exist', async () => {
        mockCounterpartyRepo.findOne.mockResolvedValue(null);

        await expect(
            service.addTeamMember(mockCtx, 'cp-missing', 'admin-2', 'backup'),
        ).rejects.toThrow(UserInputError);
    });

    it('addTeamMember surfaces a duplicate-membership unique-constraint violation as UserInputError', async () => {
        mockTeamRepo.save.mockRejectedValue(
            new QueryFailedError(
                'INSERT',
                [],
                new Error('duplicate key value violates unique constraint'),
            ),
        );

        await expect(service.addTeamMember(mockCtx, 'cp-1', 'admin-3', 'observer')).rejects.toThrow(
            UserInputError,
        );
    });

    it('removeTeamMember deletes the row and returns true when a row was affected', async () => {
        mockTeamRepo.delete.mockResolvedValue({ affected: 1 });

        const result = await service.removeTeamMember(mockCtx, 'cp-1', 'admin-2');

        expect(result).toBe(true);
        expect(mockAccessScopeService.assertCounterpartyWritable).toHaveBeenCalled();
        expect(mockTeamRepo.delete).toHaveBeenCalledWith({
            counterpartyId: 'cp-1',
            administratorId: 'admin-2',
        });
    });

    it('removeTeamMember returns false when nothing was removed', async () => {
        mockTeamRepo.delete.mockResolvedValue({ affected: 0 });

        const result = await service.removeTeamMember(mockCtx, 'cp-1', 'admin-nonexistent');

        expect(result).toBe(false);
    });

    it('getTeamMembers lists members for a counterparty', async () => {
        mockTeamRepo.find.mockResolvedValue([
            { id: 'ctm-1', counterpartyId: 'cp-1', administratorId: 'admin-2', role: 'backup' },
        ]);

        const result = await service.getTeamMembers(mockCtx, 'cp-1');

        expect(result).toHaveLength(1);
        expect(mockTeamRepo.find).toHaveBeenCalledWith(
            expect.objectContaining({ where: { counterpartyId: 'cp-1' } }),
        );
    });
});
