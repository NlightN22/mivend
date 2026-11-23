import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { AdministratorEvent, ForbiddenError, UserInputError } from '@vendure/core';
import type { EventBus, RequestContext, TransactionalConnection } from '@vendure/core';

import { AdministratorRolesService } from '../../administrator-roles.service';

const ROLES = [
    { id: '3', code: 'operator' },
    { id: '4', code: 'manager' },
    { id: '5', code: 'department-head' },
];

describe('AdministratorRolesService.setRoles', () => {
    const ctx = { activeUserId: 'actor-user' } as unknown as RequestContext;
    let adminRepo: { findOne: ReturnType<typeof vi.fn>; findOneOrFail: ReturnType<typeof vi.fn> };
    let userRepo: { save: Mock };
    let roleRepo: { find: ReturnType<typeof vi.fn> };
    let eventBus: { publish: Mock };
    let service: AdministratorRolesService;

    function target(userId: string, roleCodes: string[]): void {
        adminRepo.findOne.mockResolvedValue({ id: 'admin-1' });
        adminRepo.findOneOrFail.mockResolvedValue({
            id: 'admin-1',
            user: { id: userId, roles: roleCodes.map(code => ({ code })) },
        });
    }

    beforeEach(() => {
        adminRepo = { findOne: vi.fn(), findOneOrFail: vi.fn() };
        userRepo = { save: vi.fn() };
        roleRepo = { find: vi.fn().mockResolvedValue(ROLES) };
        const connection = {
            withTransaction: (c: RequestContext, work: (c: RequestContext) => Promise<unknown>) =>
                work(c),
            getRepository: (_c: RequestContext, entity: { name: string }) =>
                ({ Administrator: adminRepo, User: userRepo, Role: roleRepo })[entity.name],
        };
        eventBus = { publish: vi.fn() };
        service = new AdministratorRolesService(
            connection as unknown as TransactionalConnection,
            eventBus as unknown as EventBus,
        );
    });

    it('replaces the roles of another staff user with the chosen default role', async () => {
        target('user-2', ['operator']);

        await service.setRoles(ctx, 'admin-1', ['4']);

        expect(adminRepo.findOne).toHaveBeenCalledWith(
            expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
        );
        const saved = userRepo.save.mock.calls[0][0] as { roles: Array<{ code: string }> };
        expect(saved.roles.map(r => r.code)).toEqual(['manager']);
        const events = eventBus.publish.mock.calls.map(c => c[0]);
        expect(events.filter(e => e instanceof AdministratorEvent)).toHaveLength(1);
        expect((events.find(e => e instanceof AdministratorEvent) as AdministratorEvent).type).toBe(
            'updated',
        );
    });

    it('refuses a user holding a custom role instead of silently dropping it', async () => {
        target('user-2', ['operator', 'custom-audit']);

        await expect(service.setRoles(ctx, 'admin-1', ['4'])).rejects.toThrow(UserInputError);
        expect(userRepo.save).not.toHaveBeenCalled();
        expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('refuses a role outside the assignable default roles, including the superadmin role', async () => {
        target('user-2', ['operator']);

        await expect(service.setRoles(ctx, 'admin-1', ['99'])).rejects.toThrow(UserInputError);
        expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('refuses an empty role list so a user is never left without a role', async () => {
        target('user-2', ['operator']);

        await expect(service.setRoles(ctx, 'admin-1', [])).rejects.toThrow(UserInputError);
        expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('refuses to change the actor own roles', async () => {
        target('actor-user', ['portal-admin']);

        await expect(service.setRoles(ctx, 'admin-1', ['4'])).rejects.toThrow(ForbiddenError);
        expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('refuses to touch a superadmin account', async () => {
        target('user-9', ['__super_admin_role__']);

        await expect(service.setRoles(ctx, 'admin-1', ['4'])).rejects.toThrow(ForbiddenError);
        expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('refuses an unknown or deactivated administrator', async () => {
        adminRepo.findOne.mockResolvedValue(null);

        await expect(service.setRoles(ctx, 'admin-1', ['4'])).rejects.toThrow(UserInputError);
        expect(userRepo.save).not.toHaveBeenCalled();
        expect(eventBus.publish).not.toHaveBeenCalled();
    });
});
