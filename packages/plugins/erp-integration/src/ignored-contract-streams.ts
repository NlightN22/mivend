// Contract streams mivend deliberately does not consume — each needs a reason, otherwise the
// stream-health table and the drift unit test report it as an error.
export const IGNORED_CONTRACT_STREAMS: Readonly<Record<string, string>> = {
    setting: 'No consumer yet: no mivend feature reads base-wide source settings',
    'counterparty-contact': 'No consumer yet: no mivend feature reads counterparty contacts',
    'counterparty-group': 'No consumer yet: no mivend feature reads counterparty groups',
    'product-group': 'Dictionary referenced by point-of-sale product_group_ids; not resolved yet',
    'point-of-sale-type': 'Dictionary referenced by point-of-sale point_type_ids; not resolved yet',
};
