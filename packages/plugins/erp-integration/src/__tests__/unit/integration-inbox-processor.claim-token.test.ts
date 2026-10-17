import { describe, expect, it, vi } from 'vitest';

import { IntegrationInboxProcessorService } from '../../integration-inbox-processor.service';
import type { IntegrationInboxEvent } from '../../entities/integration-inbox-event.entity';

const TOKEN = '11111111-1111-4111-8111-111111111111';

const row = (id: number, version = '1'): IntegrationInboxEvent =>
    ({
        id,
        stream: 'unit',
        entityId: `e-${id}`,
        version,
        attempts: 0,
        payload: {},
        claimToken: TOKEN,
    }) as unknown as IntegrationInboxEvent;

function makeProcessor(
    rows: IntegrationInboxEvent[],
    apply: () => Promise<unknown>,
    processedVersions: string[] = [],
) {
    const inbox = {
        claimBatch: vi.fn().mockResolvedValue(rows),
        markProcessed: vi.fn().mockResolvedValue(undefined),
        markFailed: vi.fn().mockResolvedValue(undefined),
        releaseClaims: vi.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
        getRepository: () => ({
            find: vi.fn().mockResolvedValue(processedVersions.map(version => ({ version }))),
        }),
    };
    const processor = Object.create(IntegrationInboxProcessorService.prototype) as Record<
        string,
        unknown
    >;
    Object.assign(processor, {
        dataSource,
        inbox,
        requestContextService: { create: vi.fn().mockResolvedValue({}) },
        handlers: { unit: { apply } },
    });
    return { service: processor as unknown as IntegrationInboxProcessorService, inbox };
}

describe('IntegrationInboxProcessorService settles with the row claim token', () => {
    it('passes the token when a row is applied', async () => {
        const { service, inbox } = makeProcessor([row(1)], async () => undefined);
        await service.processPendingBatch();
        expect(inbox.markProcessed).toHaveBeenCalledWith(1, 'applied', null, TOKEN);
    });

    it('passes the token when a handler reports a noop', async () => {
        const { service, inbox } = makeProcessor([row(1)], async () => ({
            kind: 'noop',
            reason: 'nothing to do',
        }));
        await service.processPendingBatch();
        expect(inbox.markProcessed).toHaveBeenCalledWith(1, 'noop', 'nothing to do', TOKEN);
    });

    it('passes the token when a row is superseded by a newer version', async () => {
        const { service, inbox } = makeProcessor([row(1, '1')], async () => undefined, ['2']);
        await service.processPendingBatch();
        expect(inbox.markProcessed).toHaveBeenCalledWith(
            1,
            'superseded',
            expect.any(String),
            TOKEN,
        );
    });

    it('passes the token when a handler fails', async () => {
        const { service, inbox } = makeProcessor([row(1)], async () => {
            throw new Error('boom');
        });
        await service.processPendingBatch();
        expect(inbox.markFailed).toHaveBeenCalledWith(
            1,
            expect.any(Error),
            expect.any(Function),
            null,
            TOKEN,
        );
    });

    it('passes the token when a deadline releases the unprocessed rows', async () => {
        const { service, inbox } = makeProcessor([row(1), row(2)], async () => undefined);
        await service.processPendingBatch(undefined, 20, Date.now() - 1);
        expect(inbox.releaseClaims).toHaveBeenCalledWith([1, 2], TOKEN);
    });
});
