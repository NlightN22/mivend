// Contract streams mivend deliberately does not consume — each needs a reason, otherwise the
// stream-health table and the drift unit test report it as an error.
export const IGNORED_CONTRACT_STREAMS: Readonly<Record<string, string>> = {
    'customer-claim': 'No consumer yet: no mivend feature reads customer claims',
    'order-correction': 'No consumer yet: no mivend feature reads order corrections',
    'sales-correction': 'No consumer yet: no mivend feature reads sales corrections',
    setting: 'No consumer yet: no mivend feature reads base-wide source settings',
    'counterparty-contact': 'No consumer yet: no mivend feature reads counterparty contacts',
    'counterparty-group': 'No consumer yet: no mivend feature reads counterparty groups',
    'order-change-result':
        'Reply to an order change command; mivend sends no such commands yet (order-changed is consumed)',
    'power-of-attorney':
        'No consumer yet: powers of attorney are not shown in mivend; contract carries the scan id',
    'product-group': 'Dictionary referenced by point-of-sale product_group_ids; not resolved yet',
    'point-of-sale-type': 'Dictionary referenced by point-of-sale point_type_ids; not resolved yet',
};
