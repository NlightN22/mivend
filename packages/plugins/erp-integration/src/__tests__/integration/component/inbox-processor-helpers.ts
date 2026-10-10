import { vi } from 'vitest';
import type { DataSource } from 'typeorm';

import { IntegrationInboxProcessorService } from '../../../integration-inbox-processor.service';
import type { IntegrationInboxService } from '../../../integration-inbox.service';

export function makeInboxProcessor(
    dataSource: DataSource,
    inboxService: IntegrationInboxService,
    apply: ReturnType<typeof vi.fn>,
): IntegrationInboxProcessorService {
    const stubHandler = { apply };
    const requestContextService = { create: vi.fn().mockResolvedValue({}) };
    return new IntegrationInboxProcessorService(
        dataSource,
        inboxService,
        requestContextService as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
        stubHandler as never,
    );
}
