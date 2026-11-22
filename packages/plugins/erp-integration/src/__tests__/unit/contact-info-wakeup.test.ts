import { describe, it, expect, vi } from 'vitest';

import { IntegrationInboxProcessorService } from '../../integration-inbox-processor.service';

type Wake = (ctx: unknown, row: { stream: string; entityId: string }) => Promise<void>;

function setup(): { wake: Wake; query: ReturnType<typeof vi.fn> } {
    const query = vi.fn().mockResolvedValue([]);
    const service = Object.create(IntegrationInboxProcessorService.prototype) as Record<
        string,
        unknown
    >;
    service.connection = { getRepository: () => ({ query }) };
    const wake = (service.requeueContactInfoOf as Wake).bind(service);
    return { wake, query };
}

describe('contact-info wake-up', () => {
    it('returns a parked contact-info row of the owner to pending when the owner event is applied', async () => {
        const { wake, query } = setup();
        await wake({}, { stream: 'counterparty', entityId: 'cp-1' });
        const [sql, params] = query.mock.calls[0];
        expect(sql).toContain("stream = 'contact-info'");
        expect(sql).toContain("status = 'dependency_missing'");
        expect(sql).toContain("SET status = 'pending'");
        expect(params).toEqual(['cp-1']);
    });

    it('does nothing for a stream that owns no contacts', async () => {
        const { wake, query } = setup();
        await wake({}, { stream: 'price', entityId: 'p-1' });
        expect(query).not.toHaveBeenCalled();
    });
});
