import { describe, expect, it, vi } from 'vitest';

import { KafkaConsumerService } from '../../kafka-consumer.service';

function build(disconnect: () => Promise<void>) {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const dataSource = { getRepository: () => ({ upsert }) };
    const service = new KafkaConsumerService({} as never, {} as never, dataSource as never);
    (service as unknown as { consumer: unknown }).consumer = { disconnect };
    return { service, upsert };
}

describe('KafkaConsumerService.onModuleDestroy', () => {
    it('persists connected=false so a stopped worker never reads as connected', async () => {
        const { service, upsert } = build(async () => undefined);
        await service.onModuleDestroy();
        expect(upsert).toHaveBeenCalledWith(
            { key: 'default', connected: false },
            { conflictPaths: ['key'] },
        );
        expect(service.isConnected()).toBe(false);
    });

    it('still persists the status when disconnect() throws', async () => {
        const { service, upsert } = build(async () => {
            throw new Error('boom');
        });
        await expect(service.onModuleDestroy()).resolves.toBeUndefined();
        expect(upsert).toHaveBeenCalledTimes(1);
    });
});
