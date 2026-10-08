export const INBOX_ISSUES_PATH = '/integration-inbox-issues';
export const OUTBOUND_PROBLEMS_PATH = '/integration-outbound-problems';

type Filters = Record<string, string | undefined>;

// The ListPage reads column filters from the `filters` search param as [{ id, value }].
export function filtersSearch(filters: Filters): string {
    const entries = Object.entries(filters)
        .filter((entry): entry is [string, string] => entry[1] !== undefined)
        .map(([id, eq]) => ({ id, value: { eq } }));
    return entries.length === 0 ? '' : `?filters=${encodeURIComponent(JSON.stringify(entries))}`;
}

export function inboxIssuesLink(filters: {
    stream?: string;
    status?: string;
    outcome?: string;
}): string {
    return `${INBOX_ISSUES_PATH}${filtersSearch(filters)}`;
}

export function outboundProblemsLink(filters: { eventType?: string; status?: string }): string {
    return `${OUTBOUND_PROBLEMS_PATH}${filtersSearch(filters)}`;
}

const PAGE_IDS: Record<string, string> = {
    [INBOX_ISSUES_PATH]: 'integration-inbox-issues-list',
    [OUTBOUND_PROBLEMS_PATH]: 'integration-outbound-problems-list',
};

export interface IssueLinkTarget {
    path: string;
    pageId: string | undefined;
    filters: { id: string; value: unknown }[];
}

// ListPage with a pageId reads column filters from user settings, not from the URL.
export function parseIssueLink(href: string): IssueLinkTarget {
    const url = new URL(href, 'http://local');
    const raw = url.searchParams.get('filters');
    return {
        path: url.pathname,
        pageId: PAGE_IDS[url.pathname],
        filters: raw ? JSON.parse(raw) : [],
    };
}
