export default {
    priceTypeGaps: {
        columns: {
            counterparty: 'Counterparty',
            taxId: 'Tax id',
            reason: 'Reason',
            mainContract: 'Main contract',
        },
        filterPlaceholder: 'Name or tax id contains…',
        searchPlaceholder: 'Search counterparties…',
        empty: 'Every counterparty has a resolved price type',
        reasons: {
            'no-main-contract': 'No main contract in the ERP',
            'contract-not-found': 'Main contract not received from the ERP',
            'contract-inactive': 'Main contract is inactive in the ERP',
            'price-type-not-synced': 'Contract price type not received from the ERP',
        },
    },
    orderCheckHealth: {
        loadFailed: 'Could not load ERP requirement counters',
        empty: 'No orders currently fail an ERP requirement.',
        orders: '{count} order | {count} orders',
        outOfDate: '{count} out of date',
    },
    erpReconciliation: {
        run: 'Run reconciliation now',
        summary: 'Checked {checked}, found {found}',
        summarySkipped: 'Checked {checked}, found {found} (skipped: {skipped})',
        runFailed: 'Reconciliation run failed',
        empty: 'No open ERP discrepancies',
        detected: '{message} · detected {date}',
    },
};
