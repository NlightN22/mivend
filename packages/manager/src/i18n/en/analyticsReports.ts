export default {
    orders: {
        title: 'Orders',
        description:
            'Order amounts and counts per period, by customer, manager, point of sale or organization.',
        note: 'Read from the analytics service, which holds order turnover from the integration service (the amounts of orders, not sales documents). Rows stay inside the viewer scope; the same table is embedded in the customer and manager cards with the entity as a fixed filter.',
    },
    'sales-dynamics': {
        title: 'Sales dynamics',
        description:
            'Sales per period compared with the previous period and the same period of the previous year.',
        note: 'Period and granularity are parameters. Compare against the previous period and the same period a year earlier. Which sales document counts as a sale (settlement documents with category sale, less returns) is an open question, see docs/analytics.md.',
    },
    'sales-dynamics-by-brand': {
        title: 'Sales dynamics by brand',
        description:
            'The same comparison per brand; pick the key brands with chips instead of reading every brand.',
        note: 'Brands are database entities and the chip list is read from them, never a fixed list. Needs the brand of every sold line, so the data source is line-level, not document-level.',
    },
    'customer-concentration': {
        title: 'Customer concentration',
        description: 'Share of the top customers in sales and an ABC split of the customer base.',
        note: 'Top N share and ABC class borders are parameters. Proposed by the first iteration, to be confirmed by the owner.',
    },
    'order-frequency': {
        title: 'Order frequency and average order value',
        description: 'How often customers order and how large an average order is, per period.',
        note: 'Orders per customer per period, average and median order value. Proposed by the first iteration, to be confirmed by the owner.',
    },
    'churned-customers': {
        title: 'Churned customers',
        description:
            'Customers whose purchases fell against the previous period or who stopped ordering.',
        note: 'Two parameters, never constants: the drop threshold (percent against the previous period) and the silent-days threshold (no purchase for N days). The definition of churn is an open question, see docs/analytics.md.',
    },
    'churned-customers-by-brand': {
        title: 'Churned customers by brand',
        description: 'Customers whose purchases of a brand fell against the previous period.',
        note: 'Same parameters as the churned customers report, evaluated per brand picked with chips. Needs line-level data with the brand of each line.',
    },
    'assortment-churn': {
        title: 'Assortment churn',
        description: 'Per customer, which items it used to buy and stopped buying.',
        note: 'Future report: there is no data for it yet. It needs the purchase history per customer and item from the ERP, which mivend does not hold today.',
    },
    'new-customers-funnel': {
        title: 'New customers and activation funnel',
        description: 'Customers by stage: registered, first order, repeat order.',
        note: 'Stage dates come from portal registration and the order history; cohort by registration month. Proposed by the first iteration, to be confirmed by the owner.',
    },
    'receivables-aging': {
        title: 'Receivables aging by customer',
        description: 'Overdue receivables of each customer split into aging buckets.',
        note: 'The settlement plugin already computes aging; this report presents it across customers. Rows stay inside the counterparty scope of the viewer.',
    },
    'sales-by-manager-at-sale': {
        title: 'Sales by responsible manager at the time of sale',
        description: 'Sales grouped by the manager who was responsible when the sale happened.',
        note: 'Needs the responsible manager history, not only the current assignment. Rows are scoped: a viewer sees only managers and customers inside their scope.',
    },
    'sales-by-manager-current': {
        title: 'Sales by current responsible manager',
        description: 'Sales of the customers a manager is responsible for today, over any period.',
        note: 'Groups past sales by the current assignment. Compare with the at-the-time report to see the effect of reassignments. Rows are scoped like the at-the-time report.',
    },
};
