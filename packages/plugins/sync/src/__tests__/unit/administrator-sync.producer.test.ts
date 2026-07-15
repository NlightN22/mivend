import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventBus } from '@vendure/core';
import { AdministratorEvent } from '@vendure/core';

import { AdministratorSyncProducer } from '../../consumers/administrator-sync.producer';
import type { SyncPluginOptions } from '../../types';

const CENTRAL_OPTIONS: SyncPluginOptions = {
    instanceType: 'central',
    instanceId: 'hub',
    redis: { host: 'localhost', port: 6379 },
    rabbitmq: { url: 'amqp://localhost' },
};

const BRANCH_OPTIONS: SyncPluginOptions = { ...CENTRAL_OPTIONS, instanceType: 'branch' };

function makeAdmin(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        id: 'admin-1',
        emailAddress: 'ivan@example.com',
        firstName: 'Ivan',
        lastName: 'Ivanov',
        customFields: { branchId: 'branch-a' },
        user: { id: 'user-1', roles: [{ code: 'operator' }] },
        ...overrides,
    };
}

describe('AdministratorSyncProducer', () => {
    let subscribers: Map<unknown, (event: unknown) => void>;
    let eventBus: { ofType: ReturnType<typeof vi.fn> };
    let syncService: { writeToOutbox: ReturnType<typeof vi.fn> };
    let dataSource: {
        transaction: ReturnType<typeof vi.fn>;
        getRepository: ReturnType<typeof vi.fn>;
    };
    let adminFindOne: ReturnType<typeof vi.fn>;
    let nativeGetOne: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        subscribers = new Map();
        eventBus = {
            ofType: vi.fn((eventClass: unknown) => ({
                subscribe: (fn: (event: unknown) => void) => subscribers.set(eventClass, fn),
            })),
        };
        syncService = { writeToOutbox: vi.fn(async () => undefined) };
        adminFindOne = vi.fn();
        nativeGetOne = vi.fn();

        // NativeAuthenticationMethod.passwordHash is `select: false` in Vendure core, so it's
        // read via an explicit addSelect query builder, never a plain findOne — see the
        // producer's comment on why this must be mocked as a query builder chain, not findOne.
        const nativeQueryBuilder = {
            addSelect: vi.fn(function (this: unknown) {
                return this;
            }),
            where: vi.fn(function (this: unknown) {
                return this;
            }),
            getOne: nativeGetOne,
        };

        dataSource = {
            transaction: vi.fn(async (work: (em: unknown) => unknown) => work({})),
            getRepository: vi.fn((entity: { name: string }) => {
                if (entity.name === 'Administrator') return { findOne: adminFindOne };
                return { createQueryBuilder: vi.fn(() => nativeQueryBuilder) };
            }),
        };
    });

    it('does not subscribe on a branch instance', () => {
        const producer = new AdministratorSyncProducer(
            eventBus as unknown as EventBus,
            dataSource as never,
            syncService as never,
            BRANCH_OPTIONS,
        );
        producer.onApplicationBootstrap();

        expect(eventBus.ofType).not.toHaveBeenCalled();
    });

    it('writes administrator.deactivated on a "deleted" AdministratorEvent, without re-reading the entity', async () => {
        const producer = new AdministratorSyncProducer(
            eventBus as unknown as EventBus,
            dataSource as never,
            syncService as never,
            CENTRAL_OPTIONS,
        );
        producer.onApplicationBootstrap();
        const handler = subscribers.get(AdministratorEvent)!;

        await handler({ type: 'deleted', entity: { id: 'admin-1' } });

        expect(dataSource.getRepository).not.toHaveBeenCalled();
        expect(syncService.writeToOutbox).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                eventType: 'administrator.deactivated',
                payload: { administratorId: 'admin-1' },
            }),
            'all-branches',
        );
    });

    it('writes administrator.created with the replicated password hash and role codes', async () => {
        adminFindOne.mockResolvedValue(makeAdmin());
        nativeGetOne.mockResolvedValue({ passwordHash: 'hashed-pw' });
        const producer = new AdministratorSyncProducer(
            eventBus as unknown as EventBus,
            dataSource as never,
            syncService as never,
            CENTRAL_OPTIONS,
        );
        producer.onApplicationBootstrap();
        const handler = subscribers.get(AdministratorEvent)!;

        await handler({ type: 'created', entity: { id: 'admin-1' } });

        expect(syncService.writeToOutbox).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                eventType: 'administrator.created',
                payload: {
                    administratorId: 'admin-1',
                    emailAddress: 'ivan@example.com',
                    firstName: 'Ivan',
                    lastName: 'Ivanov',
                    roleCodes: ['operator'],
                    passwordHash: 'hashed-pw',
                    branchId: 'branch-a',
                },
            }),
            'all-branches',
        );
    });

    it('skips a "created"/"updated" event with no native (password) authentication method — nothing a branch could authenticate against offline', async () => {
        adminFindOne.mockResolvedValue(makeAdmin());
        nativeGetOne.mockResolvedValue(undefined);
        const producer = new AdministratorSyncProducer(
            eventBus as unknown as EventBus,
            dataSource as never,
            syncService as never,
            CENTRAL_OPTIONS,
        );
        producer.onApplicationBootstrap();
        const handler = subscribers.get(AdministratorEvent)!;

        await handler({ type: 'updated', entity: { id: 'admin-1' } });

        expect(syncService.writeToOutbox).not.toHaveBeenCalled();
    });
});
