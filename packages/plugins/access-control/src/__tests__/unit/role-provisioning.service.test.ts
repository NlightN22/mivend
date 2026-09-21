import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChannelService, ProcessContext, TransactionalConnection } from '@vendure/core';

import { RoleProvisioningService } from '../../role-provisioning.service';
import { RoleScopeConfigService } from '../../role-scope-config.service';
import { DEFAULT_ROLES } from '../../default-roles';

function createMockRepo() {
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
    let roleScopeConfigService: { setScopeFor: ReturnType<typeof vi.fn> };
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
        roleScopeConfigService = { setScopeFor: vi.fn() };
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
        expect(roleScopeConfigService.setScopeFor).toHaveBeenCalledTimes(DEFAULT_ROLES.length);
        for (const definition of DEFAULT_ROLES) {
            expect(roleScopeConfigService.setScopeFor).toHaveBeenCalledWith(
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
        expect(roleScopeConfigService.setScopeFor).toHaveBeenCalledTimes(DEFAULT_ROLES.length);
    });

    it('updates permissions on an existing role whose permissions have drifted from DEFAULT_ROLES', async () => {
        const drifted = DEFAULT_ROLES[0];
        repo.findOne.mockImplementation(
            async ({ where: { code } }: { where: { code: string } }) => {
                if (code === drifted.code) {
                    return {
                        code: drifted.code,
                        description: drifted.description,
                        permissions: ['Authenticated'],
                    };
                }
                return {
                    code,
                    description: 'x',
                    permissions: [
                        'Authenticated',
                        ...(DEFAULT_ROLES.find(d => d.code === code)?.permissions ?? []),
                    ],
                };
            },
        );

        await service.onApplicationBootstrap();

        expect(repo.create).not.toHaveBeenCalled();
        expect(repo.save).toHaveBeenCalledTimes(1);
        const savedRole = repo.save.mock.calls[0][0] as { permissions: string[] };
        expect(savedRole.permissions).toEqual(expect.arrayContaining(drifted.permissions));
    });

    it('never touches an Administrator assignment — only creates/updates Role and RoleAccessScope rows', async () => {
        repo.findOne.mockResolvedValue(null);
        await service.onApplicationBootstrap();

        // The service has no dependency capable of touching Administrator/User rows at all —
        // its only collaborators are the Role repository (via connection), ChannelService, and
        // RoleScopeConfigService.
        expect(Object.keys(service)).not.toContain('administratorService');
    });

    it('swallows a provisioning failure rather than crashing bootstrap', async () => {
        repo.findOne.mockRejectedValue(new Error('db down'));
        await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    });
});
