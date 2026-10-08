import { describe, expect, it } from 'vitest';

import { inboxIssuesLink, outboundProblemsLink, parseIssueLink } from '../../issue-links';

function decodedFilters(link: string): unknown {
    const raw = new URL(link, 'http://x').searchParams.get('filters');
    return raw ? JSON.parse(raw) : null;
}

describe('issue links', () => {
    it('encodes stream and status as ListPage column filters', () => {
        const link = inboxIssuesLink({ stream: 'price-type', status: 'failed' });
        expect(link.startsWith('/integration-inbox-issues?filters=')).toBe(true);
        expect(decodedFilters(link)).toEqual([
            { id: 'stream', value: { eq: 'price-type' } },
            { id: 'status', value: { eq: 'failed' } },
        ]);
    });

    it('links to the no-op rows by outcome and skips unset filters', () => {
        expect(decodedFilters(inboxIssuesLink({ stream: 'bank', outcome: 'noop' }))).toEqual([
            { id: 'stream', value: { eq: 'bank' } },
            { id: 'outcome', value: { eq: 'noop' } },
        ]);
        expect(inboxIssuesLink({})).toBe('/integration-inbox-issues');
    });

    it('builds outbound links by event type and status', () => {
        expect(
            decodedFilters(
                outboundProblemsLink({ eventType: 'order.submitted', status: 'skipped' }),
            ),
        ).toEqual([
            { id: 'eventType', value: { eq: 'order.submitted' } },
            { id: 'status', value: { eq: 'skipped' } },
        ]);
    });

    it('parses a link back into path, page id and filters', () => {
        expect(parseIssueLink(inboxIssuesLink({ stream: 'unit', status: 'failed' }))).toEqual({
            path: '/integration-inbox-issues',
            pageId: 'integration-inbox-issues-list',
            filters: [
                { id: 'stream', value: { eq: 'unit' } },
                { id: 'status', value: { eq: 'failed' } },
            ],
        });
        expect(parseIssueLink(outboundProblemsLink({})).pageId).toBe(
            'integration-outbound-problems-list',
        );
    });
});
