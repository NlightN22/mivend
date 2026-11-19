import type { AnalyticsReport } from '../analytics-report';

const permission = 'ReadAnalytics';

export const SALES_REPORTS: AnalyticsReport[] = [
    {
        key: 'sales-dynamics',
        title: 'Sales dynamics',
        description:
            'Sales per period compared with the previous period and the same period of the previous year.',
        area: 'sales',
        permission,
        status: 'planned',
        note: 'Period and granularity are parameters. Compare against the previous period and the same period a year earlier. Which sales document counts as a sale (settlement documents with category sale, less returns) is an open question, see docs/analytics.md.',
    },
    {
        key: 'sales-dynamics-by-brand',
        title: 'Sales dynamics by brand',
        description:
            'The same comparison per brand; pick the key brands with chips instead of reading every brand.',
        area: 'sales',
        permission,
        status: 'planned',
        note: 'Brands are database entities and the chip list is read from them, never a fixed list. Needs the brand of every sold line, so the data source is line-level, not document-level.',
    },
    {
        key: 'customer-concentration',
        title: 'Customer concentration',
        description: 'Share of the top customers in sales and an ABC split of the customer base.',
        area: 'sales',
        permission,
        status: 'planned',
        note: 'Top N share and ABC class borders are parameters. Proposed by the first iteration, to be confirmed by the owner.',
    },
    {
        key: 'order-frequency',
        title: 'Order frequency and average order value',
        description: 'How often customers order and how large an average order is, per period.',
        area: 'sales',
        permission,
        status: 'planned',
        note: 'Orders per customer per period, average and median order value. Proposed by the first iteration, to be confirmed by the owner.',
    },
];
