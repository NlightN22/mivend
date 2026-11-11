import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { ClientNotificationService } from '../../client-notification.service';

const recipient = { recipientType: 'customer' as const, recipientId: '7' };
const input = { kind: 'error' as const, title: 'T', message: 'M' };

describe('ClientNotificationService.record in an acting session', () => {
    it('returns null and touches neither the database nor the notification service', async () => {
        const connection = { getRepository: vi.fn(), withTransaction: vi.fn() };
        const notifications = { create: vi.fn() };
        const acting = { get: vi.fn(async () => ({ administratorId: '1', tradingPointId: null })) };
        const service = new ClientNotificationService(
            connection as never,
            notifications as never,
            acting as never,
        );

        const result = await service.record({} as RequestContext, recipient, input);

        expect(result).toBeNull();
        expect(connection.getRepository).not.toHaveBeenCalled();
        expect(connection.withTransaction).not.toHaveBeenCalled();
        expect(notifications.create).not.toHaveBeenCalled();
    });
});
