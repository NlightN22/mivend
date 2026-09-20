import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdministratorService, EventBus, RequestContext, UserService } from '@vendure/core';

import { AdministratorProvisioningService } from '../../administrator-provisioning.service';
import type { PendingErpUserService } from '../../pending-erp-user.service';

describe('AdministratorProvisioningService', () => {
    let administratorService: { create: ReturnType<typeof vi.fn> };
    let userService: {
        setPasswordResetToken: ReturnType<typeof vi.fn>;
        resetPasswordByToken: ReturnType<typeof vi.fn>;
    };
    let eventBus: { publish: ReturnType<typeof vi.fn> };
    let pendingErpUserService: {
        findByErpId: ReturnType<typeof vi.fn>;
        deleteByErpId: ReturnType<typeof vi.fn>;
    };
    let service: AdministratorProvisioningService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        administratorService = { create: vi.fn() };
        userService = { setPasswordResetToken: vi.fn(), resetPasswordByToken: vi.fn() };
        eventBus = { publish: vi.fn() };
        pendingErpUserService = { findByErpId: vi.fn(), deleteByErpId: vi.fn() };
        service = new AdministratorProvisioningService(
            administratorService as unknown as AdministratorService,
            userService as unknown as UserService,
            eventBus as unknown as EventBus,
            pendingErpUserService as unknown as PendingErpUserService,
        );
    });

    it('throws when no PendingErpUser exists for the given erpId', async () => {
        pendingErpUserService.findByErpId.mockResolvedValue(null);

        await expect(service.createFromPending(ctx, 'user-1')).rejects.toThrow();
        expect(administratorService.create).not.toHaveBeenCalled();
    });

    it('throws when the pending candidate has no email', async () => {
        pendingErpUserService.findByErpId.mockResolvedValue({
            erpId: 'user-1',
            email: null,
            fullName: 'Ivan Petrov',
            departmentId: null,
        });

        await expect(service.createFromPending(ctx, 'user-1')).rejects.toThrow();
        expect(administratorService.create).not.toHaveBeenCalled();
    });

    it('creates an Administrator with zero roles, erpId customField, and never returns/exposes the generated password', async () => {
        pendingErpUserService.findByErpId.mockResolvedValue({
            erpId: 'user-1',
            email: 'ivan@example.com',
            fullName: 'Ivan Petrov',
            departmentId: 'dept-1',
        });
        administratorService.create.mockResolvedValue({ id: 'admin-1' });
        userService.setPasswordResetToken.mockResolvedValue({
            id: 'user-1',
            identifier: 'ivan@example.com',
        });

        const result = await service.createFromPending(ctx, 'user-1');

        expect(administratorService.create).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                emailAddress: 'ivan@example.com',
                firstName: 'Ivan',
                lastName: 'Petrov',
                roleIds: [],
                customFields: { erpId: 'user-1', departmentId: 'dept-1' },
            }),
        );
        const createArgs = administratorService.create.mock.calls[0][1];
        expect(typeof createArgs.password).toBe('string');
        expect(createArgs.password.length).toBeGreaterThan(20);
        expect(result).toEqual({ id: 'admin-1' });
    });

    it('deletes the PendingErpUser row and publishes a PasswordResetEvent after creation', async () => {
        pendingErpUserService.findByErpId.mockResolvedValue({
            erpId: 'user-1',
            email: 'ivan@example.com',
            fullName: 'Ivan Petrov',
            departmentId: null,
        });
        administratorService.create.mockResolvedValue({ id: 'admin-1' });
        userService.setPasswordResetToken.mockResolvedValue({ id: 'user-1' });

        await service.createFromPending(ctx, 'user-1');

        expect(pendingErpUserService.deleteByErpId).toHaveBeenCalledWith(ctx, 'user-1');
        expect(userService.setPasswordResetToken).toHaveBeenCalledWith(ctx, 'ivan@example.com');
        expect(eventBus.publish).toHaveBeenCalledTimes(1);
    });

    it('does not publish an event when setPasswordResetToken finds no native auth method', async () => {
        pendingErpUserService.findByErpId.mockResolvedValue({
            erpId: 'user-1',
            email: 'ivan@example.com',
            fullName: 'Ivan Petrov',
            departmentId: null,
        });
        administratorService.create.mockResolvedValue({ id: 'admin-1' });
        userService.setPasswordResetToken.mockResolvedValue(undefined);

        await service.createFromPending(ctx, 'user-1');

        expect(eventBus.publish).not.toHaveBeenCalled();
    });

    describe('completePasswordReset', () => {
        it('reports success when resetPasswordByToken returns a User', async () => {
            userService.resetPasswordByToken.mockResolvedValue({
                id: 'user-1',
                identifier: 'ivan@example.com',
            });

            const result = await service.completePasswordReset(ctx, 'tok-1', 'new-pass');

            expect(result).toEqual({ success: true });
        });

        it('reports an expired-token reason for PasswordResetTokenExpiredError', async () => {
            userService.resetPasswordByToken.mockResolvedValue({
                __typename: 'PasswordResetTokenExpiredError',
            });

            const result = await service.completePasswordReset(ctx, 'tok-1', 'new-pass');

            expect(result).toEqual({ success: false, reason: 'expired' });
        });

        it('reports an invalid-token reason for PasswordResetTokenInvalidError', async () => {
            userService.resetPasswordByToken.mockResolvedValue({
                __typename: 'PasswordResetTokenInvalidError',
            });

            const result = await service.completePasswordReset(ctx, 'tok-1', 'new-pass');

            expect(result).toEqual({ success: false, reason: 'invalid' });
        });

        it('reports a validation reason for PasswordValidationError', async () => {
            userService.resetPasswordByToken.mockResolvedValue({
                __typename: 'PasswordValidationError',
                validationErrorMessage: 'Too short',
            });

            const result = await service.completePasswordReset(ctx, 'tok-1', 'new-pass');

            expect(result).toEqual({ success: false, reason: 'validation' });
        });
    });
});
