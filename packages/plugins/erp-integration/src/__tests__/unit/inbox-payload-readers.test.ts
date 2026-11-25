import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');

// Files that touch inbox rows and mention payload. A new entry needs a decision on LATEST_PAYLOAD_STREAMS.
const KNOWN_PAYLOAD_TOUCHERS = [
    'entities/integration-inbox-event.entity.ts',
    'handlers/warehouse-tombstone.query.ts',
    'integration-event-list.service.ts',
    'integration-inbox-batch.ts',
    'integration-inbox-expiry.service.ts',
    'integration-inbox-processor.service.ts',
    'integration-inbox-rejected.ts',
    'integration-inbox-retention-slice.ts',
    'integration-inbox-retention.service.ts',
    'integration-inbox.service.ts',
    'kafka-inbound-message.ts',
    'reconciliation-local-counts.service.ts',
];

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        if (name === '__tests__' || name === 'generated') return [];
        if (statSync(path).isDirectory()) return sourceFiles(path);
        return path.endsWith('.ts') ? [path] : [];
    });
}

describe('inbox payload readers', () => {
    it('has no new file touching inbox rows and payload without a LATEST_PAYLOAD_STREAMS decision', () => {
        const found = sourceFiles(SRC)
            .filter(file => {
                const text = readFileSync(file, 'utf8');
                return (
                    /integration_inbox_event|IntegrationInboxEvent/.test(text) &&
                    /payload/.test(text)
                );
            })
            .map(file => relative(SRC, file))
            .sort();
        expect(
            found,
            'New file reads inbox rows with payload: decide whether its stream must be added to LATEST_PAYLOAD_STREAMS (reconciled-streams.ts), then list it here',
        ).toEqual([...KNOWN_PAYLOAD_TOUCHERS].sort());
    });
});
