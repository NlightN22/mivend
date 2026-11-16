import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import type { ChannelService, ProcessContext, TransactionalConnection } from '@vendure/core';

import { RoleProvisioningService } from '../../role-provisioning.service';
import { RoleScopeConfigService } from '../../role-scope-config.service';
import { DEFAULT_ROLES } from '../../default-roles';
interface CreateMockRepoResult {
    findOne: Mock;
    create: Mock<[x: unknown], unknown>;
    save: Mock<[x: unknown], Promise<unknown>>;
}

function createMockRepo(): CreateMockRepoResult {
    return {
        findOne: vi.fn(),
        create: vi.fn((x: unknown) => x),
        save: vi.fn(async (x: unknown) => x),
    };
}

describe('RoleProvisioningService', () => {
    let repo: ReturnType<typeof createMockRepo>;
    let getRepositoryCallCount: number;
    let connection: { getRepository: (...args: unknown[]) => ReturnType<typeof createMockRepo> };
    let channelService: { getDefaultChannel: ReturnType<typeof vi.fn> };
    let roleScopeConfigService: { createScopeIfMissing: ReturnType<typeof vi.fn> };
    let processContext: { isWorker: boolean };
    let service: RoleProvisioningService;

    beforeEach(() => {
        repo = createMockRepo();
        getRepositoryCallCount = 0;
        connection = {
            getRepository: () => {
                getRepositoryCallCount++;
                return repo;
            },
        };
        channelService = { getDefaultChannel: vi.fn().mockResolvedValue({ id: 1 }) };
        roleScopeConfigService = { createScopeIfMissing: vi.fn() };
        processContext = { isWorker: false };
        service = new RoleProvisioningService(
            connection as unknown as TransactionalConnection,
            channelService as unknown as ChannelService,
            roleScopeConfigService as unknown as RoleScopeConfigService,
            processContext as unknown as ProcessContext,
        );
    });

    it('does nothing on the worker process', async () => {
        processContext.isWorker = true;
        await service.onApplicationBootstrap();
        expect(getRepositoryCallCount).toBe(0);
    });

    it('creates every role that does not yet exist, on the default channel', async () => {
        repo.findOne.mockResolvedValue(null);
        await service.onApplicationBootstrap();

        expect(repo.create).toHaveBeenCalledTimes(DEFAULT_ROLES.length);
        expect(repo.save).toHaveBeenCalledTimes(DEFAULT_ROLES.length);
        expect(roleScopeConfigService.createScopeIfMissing).toHaveBeenCalledTimes(
            DEFAULT_ROLES.length,
        );
        for (const definition of DEFAULT_ROLES) {
            expect(roleScopeConfigService.createScopeIfMissing).toHaveBeenCalledWith(
                expect.anything(),
                definition.code,
                definition.accessScopeConfig,
            );
        }
    });

    it('is idempotent: running twice against an already-provisioned DB does not create duplicates', async () => {
        const existingRoles = new Map(
            DEFAULT_ROLES.map(definition => [
                definition.code,
                {
                    code: definition.code,
                    description: definition.description,
                    permissions: ['Authenticated', ...definition.permissions],
                },
            ]),
        );
        repo.findOne.mockImplementation(
            async ({ where: { code } }: { where: { code: string } }) =>
                existingRoles.get(code) ?? null,
        );

        await service.onApplicationBootstrap();

        expect(repo.create).not.toHaveBeenCalled();
        expect(repo.save).not.toHaveBeenCalled();
        expect(roleScopeConfigService.createScopeIfMissing).toHaveBeenCalledTimes(
            DEFAULT_ROLES.length,
        );
    });

    it('leaves an existing role with edited permissions and description untouched', async () => {
        repo.findOne.mockImplementation(
            async ({ where: { code } }: { where: { code: string } }) => ({
                code,
                description: 'edited in the admin UI',
                permissions: ['Authenticated'],
            }),
        );

        await service.onApplicationBootstrap();

        expect(repo.create).not.toHaveBeenCalled();
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('never touches an Administrator assignment — only creates Role and RoleAccessScope rows', async () => {
        repo.findOne.mockResolvedValue(null);
        await service.onApplicationBootstrap();

        // Invariant: must not read or write Administrator/User rows, so it takes no dependency
        // that could (only Role repository, ChannelService, RoleScopeConfigService).
        expect(Object.keys(service)).not.toContain('administratorService');
    });

    it('swallows a provisioning failure rather than crashing bootstrap', async () => {
        repo.findOne.mockRejectedValue(new Error('db down'));
        await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    });

    it('provisions every other role even when one role fails', async () => {
        const failingCode = DEFAULT_ROLES[2].code;
        repo.findOne.mockImplementation(
            async ({ where: { code } }: { where: { code: string } }) => {
                if (code === failingCode) {
                    throw new Error('constraint violation');
                }
                return null;
            },
        );

        await service.onApplicationBootstrap();

        expect(repo.save).toHaveBeenCalledTimes(DEFAULT_ROLES.length - 1);
        expect(roleScopeConfigService.createScopeIfMissing).toHaveBeenCalledTimes(
            DEFAULT_ROLES.length - 1,
        );
        for (const definition of DEFAULT_ROLES) {
            if (definition.code === failingCode) continue;
            expect(roleScopeConfigService.createScopeIfMissing).toHaveBeenCalledWith(
                expect.anything(),
                definition.code,
                definition.accessScopeConfig,
            );
        }
    });
});
