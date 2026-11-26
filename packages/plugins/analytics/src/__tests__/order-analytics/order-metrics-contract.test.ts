import * as protobuf from 'protobufjs';
import { describe, expect, it } from 'vitest';

import { ORDER_METRICS_PROTO, TIMESTAMP_PROTO } from '../../order-analytics/order-metrics.proto';
import { SALES_METRICS_PROTO } from '../../sales-analytics/sales-metrics.proto';

function fieldIds(proto: string, message: string): Record<string, number> {
    const root = new protobuf.Root();
    protobuf.parse(TIMESTAMP_PROTO, root);
    protobuf.parse(ORDER_METRICS_PROTO, root);
    protobuf.parse(SALES_METRICS_PROTO, root);
    const type = root.lookupType(`analytics.v1.${message}`);
    return Object.fromEntries(Object.values(type.fields).map(f => [f.name, f.id]));
}

describe('analytics contract v0.8.1 consumer copy', () => {
    it('carries the order exclude, manufacturer group, category and customer group fields', () => {
        expect(fieldIds(ORDER_METRICS_PROTO, 'GetOrderTurnoverRequest')).toMatchObject({
            excludeCustomerIds: 14,
            excludeOrganizationIds: 15,
            excludePointOfSaleIds: 16,
            excludeManagerIds: 17,
            excludeCounterpartyManagerIds: 18,
            excludeProductIds: 19,
            excludeManufacturerIds: 20,
            manufacturerGroupIds: 21,
            excludeManufacturerGroupIds: 22,
            productCategoryIds: 23,
            excludeProductCategoryIds: 24,
            customerGroupIds: 25,
            excludeCustomerGroupIds: 26,
        });
    });

    it('carries the sales exclude and counterparty group fields', () => {
        expect(fieldIds(SALES_METRICS_PROTO, 'GetSalesTurnoverRequest')).toMatchObject({
            excludeCounterpartyIds: 11,
            excludeOrganizationIds: 12,
            excludeContractIds: 13,
            excludeCounterpartyManagerIds: 14,
            counterpartyGroupIds: 15,
            excludeCounterpartyGroupIds: 16,
        });
    });
});
