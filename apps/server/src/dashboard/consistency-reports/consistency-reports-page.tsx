import { ListPage } from '@vendure/dashboard';
import { AnyRoute } from '@tanstack/react-router';

import { consistencyReportListDocument } from './consistency-reports.graphql.js';
import { reportColumnOrder, reportColumns } from './consistency-report-columns.js';
import { STATUS_OPTIONS, toReportFilter } from './consistency-display.js';

export function ConsistencyReportsPage({ route }: Readonly<{ route: AnyRoute }>) {
    return (
        <ListPage
            pageId="consistency-report-list"
            title="Data drift reports"
            listQuery={consistencyReportListDocument}
            route={route}
            onSearchTermChange={() => ({}) as any}
            transformVariables={variables => {
                const f = toReportFilter(
                    variables.options?.filter as Parameters<typeof toReportFilter>[0],
                );
                return {
                    options: { take: variables.options?.take, skip: variables.options?.skip, ...f },
                } as typeof variables;
            }}
            customizeColumns={reportColumns}
            facetedFilters={{
                status: { title: 'Status', options: STATUS_OPTIONS },
                severity: {
                    title: 'Severity',
                    options: [
                        { label: 'Critical', value: 'critical' },
                        { label: 'Warning', value: 'warning' },
                    ],
                },
            }}
            defaultColumnOrder={reportColumnOrder}
        />
    );
}
