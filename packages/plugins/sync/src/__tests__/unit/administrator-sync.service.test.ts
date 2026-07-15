import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityManager } from 'typeorm';
import type { SyncEventByType } from 'shared';

import { AdministratorSyncService } from '../../administrator-sync.service';

function makeEm(overrides: {
    query: ReturnType<typeof vi.fn>;
    userFindOne?: ReturnType<typeof vi.fn>;
    nativeFindOne?: ReturnType<typeof vi.fn>;
}): {
    em: EntityManager;
    roleRepo: { find: ReturnType<typeof vi.fn> };
    adminRepo: {
        update: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
        save: ReturnType<typeof vi.fn>;
    };
    userRepo: {
        findOne: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
        save: ReturnType<typeof vi.fn>;
    };
    nativeRepo: {
        findOne: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
        save: ReturnType<typeof vi.fn>;
    };
} {
    const roleRepo = { find: vi.fn(async () => [{ code: 'operator' }]) };
    const adminRepo = { update: vi.fn(), create: vi.fn(x => x), save: vi.fn(async x => x) };
    const userRepo = {
        findOne: overrides.userFindOne ?? vi.fn(async () => undefined),
        create: vi.fn(x => x),
        save: vi.fn(async (x: unknown) => x),
    };
    const nativeRepo = {
        findOne: overrides.nativeFindOne ?? vi.fn(async () => undefined),
        create: vi.fn(x => x),
        save: vi.fn(async (x: unknown) => x),
    };

    const em = {
        query: overrides.query,
        getRepository: vi.fn((entity: { name: string }) => {
            if (entity.name === 'Role') return roleRepo;
            if (entity.name === 'Administrator') return adminRepo;
            if (entity.name === 'User') return userRepo;
            return nativeRepo;
        }),
    };
    return { em: em as unknown as EntityManager, roleRepo, adminRepo, userRepo, nativeRepo };
}

const upsertPayload = {
    administratorId: 'central-admin-9',
    emailAddress: 'ivan@example.com',
    firstName: 'Ivan',
    lastName: 'Ivanov',
    roleCodes: ['operator'],
    passwordHash: 'hashed-pw',
    branchId: 'branch-a',
};

describe('AdministratorSyncService', () => {
    let service: AdministratorSyncService;

    beforeEach(() => {
        service = new AdministratorSyncService();
    });

    it('creates a new local User + NativeAuthenticationMethod + Administrator when no replica exists yet', async () => {
        const { em, adminRepo, userRepo, nativeRepo } = makeEm({ query: vi.fn(async () => []) });

        const event = {
            eventType: 'administrator.created',
            payload: upsertPayload,
        } as unknown as SyncEventByType<'administrator.created'>;

        await service.applyUpsert(em, event);

        expect(userRepo.save).toHaveBeenCalled();
        expect(nativeRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({ identifier: 'ivan@example.com', passwordHash: 'hashed-pw' }),
        );
        expect(adminRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({
                emailAddress: 'ivan@example.com',
                customFields: { branchId: 'branch-a', sourceAdministratorId: 'central-admin-9' },
            }),
        );
        expect(adminRepo.update).not.toHaveBeenCalled();
    });

    it('updates the existing local replica (found by sourceAdministratorId) instead of creating a duplicate', async () => {
        const query = vi.fn(async () => [{ id: 'local-admin-1', userId: 'local-user-1' }]);
        const userFindOne = vi.fn(async () => ({
            id: 'local-user-1',
            identifier: 'old@example.com',
            roles: [],
        }));
        const nativeFindOne = vi.fn(async () => ({
            identifier: 'old@example.com',
            passwordHash: 'old-hash',
        }));
        const { em, adminRepo, userRepo, nativeRepo } = makeEm({
            query,
            userFindOne,
            nativeFindOne,
        });

        const event = {
            eventType: 'administrator.updated',
            payload: upsertPayload,
        } as unknown as SyncEventByType<'administrator.updated'>;

        await service.applyUpsert(em, event);

        expect(adminRepo.update).toHaveBeenCalledWith(
            'local-admin-1',
            expect.objectContaining({ emailAddress: 'ivan@example.com' }),
        );
        expect(userRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({ identifier: 'ivan@example.com' }),
        );
        expect(nativeRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({ passwordHash: 'hashed-pw' }),
        );
        expect(adminRepo.save).not.toHaveBeenCalled();
    });

    it('soft-deletes the local replica by sourceAdministratorId on deactivation', async () => {
        const query = vi.fn(async () => []);
        const { em } = makeEm({ query });

        const event = {
            eventType: 'administrator.deactivated',
            payload: { administratorId: 'central-admin-9' },
        } as unknown as SyncEventByType<'administrator.deactivated'>;

        await service.applyDeactivation(em, event);

        expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE administrator'), [
            'central-admin-9',
        ]);
    });
});
