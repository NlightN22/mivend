// Contract streams mivend deliberately does not consume — each needs a reason, otherwise the
// stream-health table and the drift unit test report it as an error.
export const IGNORED_CONTRACT_STREAMS: Readonly<Record<string, string>> = {
    'counterparty-contact': 'No consumer yet: no mivend feature reads counterparty contacts',
    'counterparty-group': 'No consumer yet: no mivend feature reads counterparty groups',
    'order-change-result': 'No consumer yet: order changes are tracked via order-changed',
    'product-group': 'No consumer yet: catalog grouping comes from category',
    'point-of-sale-type': 'No consumer yet: point-of-sale types are not used',
};
