import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import { i18n } from '../../i18n';

const NOT_FILTERED = { type: 'none' } as const;
const t = (key: string): string => i18n.global.t(`analytics.orders.columns.${key}`);

// The title column is the identifying one: the entity, else the period, else "Total".
export function buildOrderAnalyticsColumns(showPeriod: boolean): AdvancedDataTableColumn[] {
    const columns: AdvancedDataTableColumn[] = [
        {
            field: 'title',
            header: t('title'),
            sortField: 'title',
            width: 280,
            minWidth: 160,
            priority: 10,
            required: true,
            filterConfig: NOT_FILTERED,
            mobile: { primary: true },
        },
    ];
    if (showPeriod) {
        columns.push({
            field: 'period',
            header: t('period'),
            sortField: 'period',
            width: 130,
            minWidth: 110,
            priority: 8,
            filterConfig: NOT_FILTERED,
        });
    }
    columns.push(
        {
            field: 'orderCount',
            header: t('orderCount'),
            sortField: 'orderCount',
            align: 'end',
            width: 110,
            minWidth: 90,
            priority: 7,
            filterConfig: NOT_FILTERED,
        },
        {
            field: 'turnover',
            header: t('turnover'),
            sortField: 'turnover',
            align: 'end',
            width: 170,
            minWidth: 150,
            priority: 9,
            filterConfig: NOT_FILTERED,
        },
        {
            field: 'turnoverExcludingVat',
            header: t('turnoverExcludingVat'),
            sortField: 'turnoverExcludingVat',
            align: 'end',
            width: 170,
            minWidth: 150,
            priority: 6,
            filterConfig: NOT_FILTERED,
        },
        {
            field: 'vatTotal',
            header: t('vatTotal'),
            sortField: 'vatTotal',
            align: 'end',
            width: 140,
            minWidth: 120,
            priority: 5,
            filterConfig: NOT_FILTERED,
        },
        {
            field: 'ordersWithoutAmount',
            header: t('ordersWithoutAmount'),
            sortField: 'ordersWithoutAmount',
            align: 'end',
            width: 150,
            minWidth: 130,
            priority: 4,
            filterConfig: NOT_FILTERED,
            mobile: { hidden: true },
        },
    );
    return columns;
}

export const HIDDEN_BY_DEFAULT = ['ordersWithoutAmount'];
