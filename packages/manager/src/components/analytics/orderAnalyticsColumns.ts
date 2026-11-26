import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import { i18n } from '../../i18n';

const NOT_FILTERED = { type: 'none' } as const;
const t = (key: string): string => i18n.global.t(`analytics.orders.columns.${key}`);

function numberColumn(
    field: string,
    width: number,
    priority: number,
    minWidth = width - 20,
): AdvancedDataTableColumn {
    return {
        field,
        header: t(field),
        sortField: field,
        align: 'end',
        width,
        minWidth,
        priority,
        filterConfig: NOT_FILTERED,
    };
}

// The title column is the identifying one: the entity, else the period, else "Total".
// A product or manufacturer filter counts order lines, so the order amounts give way to the line totals.
export function buildOrderAnalyticsColumns(
    showPeriod: boolean,
    productMode = false,
): AdvancedDataTableColumn[] {
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
            width: 160,
            minWidth: 160,
            priority: 8,
            filterConfig: NOT_FILTERED,
        });
    }
    columns.push({
        field: 'currency',
        header: t('currency'),
        sortField: 'currency',
        width: 150,
        minWidth: 150,
        priority: 9,
        filterConfig: NOT_FILTERED,
    });
    columns.push(numberColumn('orderCount', 130, 7, 120));
    columns.push(
        ...(productMode
            ? [
                  numberColumn('productQuantity', 140, 9, 120),
                  numberColumn('productAmount', 170, 8, 150),
                  {
                      ...numberColumn('productLinesWithoutAmount', 160, 4, 140),
                      mobile: { hidden: true },
                  },
              ]
            : [
                  numberColumn('turnover', 170, 9, 150),
                  numberColumn('turnoverExcludingVat', 170, 6, 150),
                  numberColumn('vatTotal', 140, 5, 120),
                  { ...numberColumn('ordersWithoutAmount', 150, 4, 130), mobile: { hidden: true } },
              ]),
    );
    return columns;
}

export const HIDDEN_BY_DEFAULT = ['ordersWithoutAmount', 'productLinesWithoutAmount'];
