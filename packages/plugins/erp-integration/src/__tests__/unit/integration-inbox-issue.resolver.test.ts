import { describe, expect, it } from 'vitest';

import type { IntegrationInboxEvent } from '../../entities/integration-inbox-event.entity';
import { IntegrationInboxIssueResolver } from '../../integration-inbox-issue.resolver';

const row = (patch: Partial<IntegrationInboxEvent>): IntegrationInboxEvent =>
    ({ stream: 'bank', status: 'failed', ...patch }) as IntegrationInboxEvent;

describe('IntegrationInboxIssueResolver.replayable', () => {
    const resolver = new IntegrationInboxIssueResolver();

    it('is true only for failed rows of a replayable stream', () => {
        expect(resolver.replayable(row({}))).toBe(true);
        expect(resolver.replayable(row({ stream: 'vat-rate' }))).toBe(false);
        expect(resolver.replayable(row({ status: 'processed' }))).toBe(false);
    });
});
