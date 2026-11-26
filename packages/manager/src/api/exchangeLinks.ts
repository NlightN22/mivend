import { conditionsToQuery } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';

function link(path: string, view: string, columnKey: string, value: string): string {
    const filters = conditionsToQuery([{ columnKey, operator: 'eq', value }]);
    return `${path}?${new URLSearchParams({ view, filters }).toString()}`;
}

export const inboxIssuesLink = (stream: string, view: string): string =>
    link('/settings/inbox-issues', view, 'stream', stream);

export const outboundProblemsLink = (eventType: string, view: string): string =>
    link('/settings/outbound-problems', view, 'eventType', eventType);

export const REJECTED_ORDERS_LINK = '/orders?erpStatus=REJECTED';
