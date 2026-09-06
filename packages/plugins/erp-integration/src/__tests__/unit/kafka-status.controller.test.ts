import { describe, it, expect, vi } from 'vitest';

import { KafkaStatusController } from '../../kafka-status.controller';

describe('KafkaStatusController', () => {
    it('reports connected: true when the persisted status row says so', async () => {
        const dataSource = {
            getRepository: () => ({
                findOne: vi.fn().mockResolvedValue({ key: 'default', connected: true }),
            }),
        };
        const controller = new KafkaStatusController(dataSource as never);

        await expect(controller.getStatus()).resolves.toEqual({ connected: true });
    });

    it('reports connected: false when the persisted row says so', async () => {
        const dataSource = {
            getRepository: () => ({
                findOne: vi.fn().mockResolvedValue({ key: 'default', connected: false }),
            }),
        };
        const controller = new KafkaStatusController(dataSource as never);

        await expect(controller.getStatus()).resolves.toEqual({ connected: false });
    });

    // The consumer may never have run in this environment at all (e.g. kafkaEnabled: false) —
    // no row yet must read as "not connected", never throw or report a stale true.
    it('reports connected: false when no status row exists yet', async () => {
        const dataSource = {
            getRepository: () => ({
                findOne: vi.fn().mockResolvedValue(null),
            }),
        };
        const controller = new KafkaStatusController(dataSource as never);

        await expect(controller.getStatus()).resolves.toEqual({ connected: false });
    });
});
