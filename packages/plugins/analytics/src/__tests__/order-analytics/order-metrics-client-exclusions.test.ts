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
const request: OrderMetricsRequest = {
    from: new Date('2026-01-01T00:00:00Z'),
    to: new Date('2026-02-01T00:00:00Z'),
    granularity: 'DAY',
    dimension: 'CUSTOMER',
    timeZone: 'UTC',
    customerIds: [],
    organizationIds: [],
    pointOfSaleIds: [],
    managerIds: [],
    counterpartyManagerIds: [],
    mainManagerOnly: false,
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

const clientFor = (groups: boolean): OrderMetricsClient =>
    new OrderMetricsClient({
        orderMetricsAddress: echo.address,
        orderMetricsKeyFile: keyFile,
        orderMetricsCredentials: grpc.credentials.createInsecure(),
        productCategoryAndCustomerGroupFilters: groups,
    });

const askedBy = async (client: OrderMetricsClient): Promise<Record<string, unknown>> => {
    const [row] = await client.getOrderTurnover(request2);
    return JSON.parse(row!.dimensionId) as Record<string, unknown>;
};

const request2: OrderMetricsRequest = {
    ...request,
    excludeCustomerIds: ['c9'],
    excludeProductIds: ['p9'],
    manufacturerGroupIds: ['g1'],
    excludeManufacturerGroupIds: ['g2'],
    productCategoryIds: ['k1'],
    excludeProductCategoryIds: ['k2'],
    customerGroupIds: ['u1'],
    excludeCustomerGroupIds: ['u2'],
};

beforeAll(async () => {
    echo = await startEchoOrderMetricsServer(KEY);
    dir = await mkdtemp(join(tmpdir(), 'order-exclusions-'));
    keyFile = join(dir, 'key');
    await writeFile(keyFile, `${KEY}\n`);
});

afterAll(async () => {
    await echo.stop();
    await rm(dir, { recursive: true, force: true });
});

describe('OrderMetricsClient exclusions and groups', () => {
    it('sends the exclude lists and manufacturer groups, but holds category and customer groups back by default', async () => {
        expect(await askedBy(clientFor(false))).toMatchObject({
            excludeCustomerIds: ['c9'],
            excludeProductIds: ['p9'],
            manufacturerGroupIds: ['g1'],
            excludeManufacturerGroupIds: ['g2'],
            productCategoryIds: [],
            excludeProductCategoryIds: [],
            customerGroupIds: [],
            excludeCustomerGroupIds: [],
        });
    });

    it('sends category and customer groups once the switch is on', async () => {
        expect(await askedBy(clientFor(true))).toMatchObject({
            productCategoryIds: ['k1'],
            excludeProductCategoryIds: ['k2'],
            customerGroupIds: ['u1'],
            excludeCustomerGroupIds: ['u2'],
        });
    });
});
