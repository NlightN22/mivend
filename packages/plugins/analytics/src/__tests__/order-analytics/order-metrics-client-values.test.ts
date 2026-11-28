import * as grpc from '@grpc/grpc-js';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OrderMetricsClient } from '../../order-analytics/order-metrics.client';
import type { OrderMetricsRequest } from '../../order-analytics/order-metrics.types';
import { startEchoOrderMetricsServer } from '../../testing/echo-order-metrics-server';
import type { EchoOrderMetricsServer } from '../../testing/echo-order-metrics-server';

const KEY = 'test-secret-key-value';
const base: OrderMetricsRequest = {
    from: new Date('2026-01-01T00:00:00Z'),
    to: new Date('2026-02-01T00:00:00Z'),
    granularity: 'NONE',
    dimension: 'NONE',
    timeZone: 'UTC',
    mainManagerOnly: false,
    customerIds: [],
    organizationIds: [],
    pointOfSaleIds: [],
    managerIds: [],
    counterpartyManagerIds: [],
    productIds: [],
    manufacturerIds: [],
    excludeCustomerIds: [],
    excludeOrganizationIds: [],
    excludePointOfSaleIds: [],
    excludeManagerIds: [],
    excludeCounterpartyManagerIds: [],
    excludeProductIds: [],
    excludeManufacturerIds: [],
    manufacturerGroupIds: [],
    excludeManufacturerGroupIds: [],
    productCategoryIds: [],
    excludeProductCategoryIds: [],
    customerGroupIds: [],
    excludeCustomerGroupIds: [],
};

let echo: EchoOrderMetricsServer;
let dir: string;
let keyFile: string;

const clientFor = (file = keyFile): OrderMetricsClient =>
    new OrderMetricsClient({
        orderMetricsAddress: echo.address,
        orderMetricsKeyFile: file,
        orderMetricsCredentials: grpc.credentials.createInsecure(),
    });

const asked = async (request: OrderMetricsRequest): Promise<Record<string, unknown>> => {
    const [row] = await clientFor().getOrderTurnover(request);
    return JSON.parse(row!.dimensionId) as Record<string, unknown>;
};

beforeAll(async () => {
    echo = await startEchoOrderMetricsServer(KEY);
    dir = await mkdtemp(join(tmpdir(), 'order-values-'));
    keyFile = join(dir, 'key');
    await writeFile(keyFile, `${KEY}\n`);
});

afterAll(async () => {
    await echo.stop();
    await rm(dir, { recursive: true, force: true });
});

describe('OrderMetricsClient scheme and status filters', () => {
    it('sends the four lists, empty value included, and none by default', async () => {
        expect(await asked(base)).toMatchObject({
            shipmentSchemes: [],
            excludeShipmentSchemes: [],
            orderStatuses: [],
            excludeOrderStatuses: [],
        });
        expect(
            await asked({
                ...base,
                shipmentSchemes: ['scheme-a', ''],
                excludeShipmentSchemes: ['scheme-b'],
                orderStatuses: ['status-a'],
                excludeOrderStatuses: [''],
            }),
        ).toMatchObject({
            shipmentSchemes: ['scheme-a', ''],
            excludeShipmentSchemes: ['scheme-b'],
            orderStatuses: ['status-a'],
            excludeOrderStatuses: [''],
        });
    });
});

describe('OrderMetricsClient.listOrderTurnoverFilterValues', () => {
    it('maps values and counts and sends the kind and the optional period', async () => {
        const values = await clientFor().listOrderTurnoverFilterValues('ORDER_STATUS');
        expect(values[0]).toEqual({ value: '', orderCount: 2 });
        expect(JSON.parse(values[1]!.value)).toMatchObject({
            kind: 'ORDER_FILTER_KIND_ORDER_STATUS',
            from: null,
        });
        expect(values[1]!.orderCount).toBe(5);

        const withPeriod = await clientFor().listOrderTurnoverFilterValues(
            'SHIPMENT_SCHEME',
            base.from,
            base.to,
        );
        expect(JSON.parse(withPeriod[1]!.value)).toMatchObject({
            kind: 'ORDER_FILTER_KIND_SHIPMENT_SCHEME',
            from: { seconds: '1767225600' },
        });
    });

    it('fails with the same error kinds as the turnover call', async () => {
        const badKey = join(dir, 'bad');
        await writeFile(badKey, 'wrong');
        await expect(
            clientFor(badKey).listOrderTurnoverFilterValues('ORDER_STATUS'),
        ).rejects.toMatchObject({ kind: 'UNAUTHENTICATED' });
        await expect(
            new OrderMetricsClient({}).listOrderTurnoverFilterValues('ORDER_STATUS'),
        ).rejects.toMatchObject({ kind: 'NOT_CONFIGURED' });
    });
});
