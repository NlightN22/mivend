import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import { i18n } from '../../i18n';

const NOT_FILTERED = { type: 'none' } as const;
const t = (key: string): string => i18n.global.t(`analytics.sales.columns.${key}`);

function numberColumn(field: string, width: number, priority: number): AdvancedDataTableColumn {
    return {
        field,
        header: t(field),
        sortField: field,
        align: 'end',
        width,
        minWidth: width - 20,
        priority,
        filterConfig: NOT_FILTERED,
    };
}

// The title is the identifying column: the entity, else the period, else "Total".
export function buildSalesAnalyticsColumns(showPeriod: boolean): AdvancedDataTableColumn[] {
    const columns: AdvancedDataTableColumn[] = [
        {
            field: 'title',
            header: t('title'),
            sortField: 'title',
            width: 260,
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
            field: 'currency',
            header: t('currency'),
            sortField: 'currency',
            width: 110,
            minWidth: 90,
            priority: 9,
            filterConfig: NOT_FILTERED,
        },
        numberColumn('netSales', 160, 9),
        numberColumn('sales', 150, 7),
        numberColumn('returns', 140, 6),
        numberColumn('corrections', 150, 5),
        numberColumn('netSalesExcludingVatBasis', 200, 3),
        numberColumn('documentCount', 140, 4),
        { ...numberColumn('documentsWithoutAmount', 170, 2), mobile: { hidden: true } },
    );
    return columns;
}

export const SALES_HIDDEN_BY_DEFAULT: string[] = [];
