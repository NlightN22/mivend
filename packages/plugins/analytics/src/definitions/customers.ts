import type { AnalyticsReport } from '../analytics-report';

const permission = 'ReadAnalytics';

export const CUSTOMER_REPORTS: AnalyticsReport[] = [
    {
        key: 'churned-customers',
        title: 'Churned customers',
        description:
            'Customers whose purchases fell against the previous period or who stopped ordering.',
        area: 'customers',
        permission,
        status: 'planned',
        note: 'Two parameters, never constants: the drop threshold (percent against the previous period) and the silent-days threshold (no purchase for N days). The definition of churn is an open question, see docs/analytics.md.',
    },
    {
        key: 'churned-customers-by-brand',
        title: 'Churned customers by brand',
        description: 'Customers whose purchases of a brand fell against the previous period.',
        area: 'customers',
        permission,
        status: 'planned',
        note: 'Same parameters as the churned customers report, evaluated per brand picked with chips. Needs line-level data with the brand of each line.',
    },
    {
        key: 'assortment-churn',
        title: 'Assortment churn',
        description: 'Per customer, which items it used to buy and stopped buying.',
        area: 'customers',
        permission,
        status: 'planned',
        note: 'Future report: there is no data for it yet. It needs the purchase history per customer and item from the ERP, which mivend does not hold today.',
    },
    {
        key: 'new-customers-funnel',
        title: 'New customers and activation funnel',
        description: 'Customers by stage: registered, first order, repeat order.',
        area: 'customers',
        permission,
        status: 'planned',
        note: 'Stage dates come from portal registration and the order history; cohort by registration month. Proposed by the first iteration, to be confirmed by the owner.',
    },
    {
        key: 'receivables-aging',
        title: 'Receivables aging by customer',
        description: 'Overdue receivables of each customer split into aging buckets.',
        area: 'receivables',
        permission,
        status: 'planned',
        note: 'The settlement plugin already computes aging; this report presents it across customers. Rows stay inside the counterparty scope of the viewer.',
    },
    {
        key: 'sales-by-manager-at-sale',
        title: 'Sales by responsible manager at the time of sale',
        description: 'Sales grouped by the manager who was responsible when the sale happened.',
        area: 'managers',
        permission,
        status: 'planned',
        note: 'Needs the responsible manager history, not only the current assignment. Rows are scoped: a viewer sees only managers and customers inside their scope.',
    },
    {
        key: 'sales-by-manager-current',
        title: 'Sales by current responsible manager',
        description: 'Sales of the customers a manager is responsible for today, over any period.',
        area: 'managers',
        permission,
        status: 'planned',
        note: 'Groups past sales by the current assignment. Compare with the at-the-time report to see the effect of reassignments. Rows are scoped like the at-the-time report.',
    },
];
