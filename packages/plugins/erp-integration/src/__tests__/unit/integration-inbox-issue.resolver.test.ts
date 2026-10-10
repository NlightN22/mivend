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

    // #212: an undecodable row has no entity id Integration Service could ever replay by.
    it('is false for an undecodable row even though its stream is replayable', () => {
        expect(resolver.replayable(row({ undecodable: true }))).toBe(false);
    });

    // #213 regression: lastError no longer carries the signal (a failed replay attempt overwrites
    // it) — the durable `undecodable` column must still win even when lastError looks unrelated.
    it('is false for an undecodable row even after lastError was overwritten by a failed replay attempt', () => {
        expect(
            resolver.replayable(
                row({
                    undecodable: true,
                    lastError:
                        'replay did not resolve: Integration Service did not accept the replay: not_found',
                }),
            ),
        ).toBe(false);
    });
});

describe('IntegrationInboxIssueResolver.dismissable', () => {
    const resolver = new IntegrationInboxIssueResolver();

    it('is true for any failed row, replayable or not', () => {
        expect(resolver.dismissable(row({}))).toBe(true);
        expect(resolver.dismissable(row({ lastError: 'decode failed: invalid wire type' }))).toBe(
            true,
        );
    });

    it('is false once the row has left the failed status', () => {
        expect(resolver.dismissable(row({ status: 'processed' }))).toBe(false);
    });
});
