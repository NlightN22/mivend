import { describe, expect, it, vi } from 'vitest';
import { QueryTooLargeError } from 'shared';
import type { RequestContext } from '@vendure/core';

import { IntegrationInboxProcessorService } from '../../integration-inbox-processor.service';
import type { IntegrationInboxEvent } from '../../entities/integration-inbox-event.entity';
import { INBOX_VERSIONS_CEILING } from '../../read-ceilings';

type Probe = {
    isSupersededByNewerVersion: (c: RequestContext, r: IntegrationInboxEvent) => Promise<boolean>;
};

function processorWithVersions(count: number): { probe: Probe; find: ReturnType<typeof vi.fn> } {
    const find = vi.fn(async () =>
        Array.from({ length: count }, (_, i) => ({ version: `${i + 1}` })),
    );
    const connection = { getRepository: () => ({ find }) };
    const probe = Object.assign(Object.create(IntegrationInboxProcessorService.prototype), {
        connection,
    }) as Probe;
    return { probe, find };
}

const incoming = { stream: 'unit', entityId: 'e-1', version: '5000' } as IntegrationInboxEvent;
const ctx = {} as RequestContext;

describe('isSupersededByNewerVersion ceiling', () => {
    it('handles an entity with more than 1000 processed versions (production has 1077)', async () => {
        const { probe, find } = processorWithVersions(1077);
        await expect(probe.isSupersededByNewerVersion(ctx, incoming)).resolves.toBe(false);
        expect(find).toHaveBeenCalledWith(
            expect.objectContaining({ take: INBOX_VERSIONS_CEILING + 1 }),
        );
    });

    it('fails explicitly instead of truncating past the ceiling', async () => {
        const { probe } = processorWithVersions(INBOX_VERSIONS_CEILING + 1);
        await expect(probe.isSupersededByNewerVersion(ctx, incoming)).rejects.toBeInstanceOf(
            QueryTooLargeError,
        );
    });
});
