import * as grpc from '@grpc/grpc-js';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OrderMetricsError } from '../../order-analytics/order-metrics.types';
import { SalesMetricsClient } from '../../sales-analytics/sales-metrics.client';
import type { SalesMetricsRequest } from '../../sales-analytics/sales-metrics.types';
import { startEchoOrderMetricsServer } from '../../testing/echo-order-metrics-server';
import type { EchoOrderMetricsServer } from '../../testing/echo-order-metrics-server';

const KEY = 'test-secret-key-value';
const request: SalesMetricsRequest = {
    from: new Date('2026-01-01T00:00:00Z'),
    to: new Date('2026-02-01T00:00:00Z'),
    granularity: 'MONTH',
    dimension: 'COUNTERPARTY_MANAGER',
    timeZone: 'Europe/Berlin',
    counterpartyIds: ['c1'],
    organizationIds: ['o1'],
    contractIds: ['k1'],
    counterpartyManagerIds: ['m1'],
    mainManagerOnly: true,
    excludeCounterpartyIds: [],
    excludeOrganizationIds: [],
    excludeContractIds: [],
    excludeCounterpartyManagerIds: [],
    counterpartyGroupIds: [],
    excludeCounterpartyGroupIds: [],
};

let echo: EchoOrderMetricsServer;
let dir: string;
let keyFile: string;

const clientFor = (file = keyFile, groups = false): SalesMetricsClient =>
    new SalesMetricsClient({
        orderMetricsAddress: echo.address,
        orderMetricsKeyFile: file,
        orderMetricsCredentials: grpc.credentials.createInsecure(),
        productCategoryAndCustomerGroupFilters: groups,
    });

beforeAll(async () => {
    echo = await startEchoOrderMetricsServer(KEY);
    dir = await mkdtemp(join(tmpdir(), 'sales-client-'));
    keyFile = join(dir, 'key');
    await writeFile(keyFile, `${KEY}\n`);
});

afterAll(async () => {
    await echo.stop();
    await rm(dir, { recursive: true, force: true });
});

describe('SalesMetricsClient', () => {
    it('sends the filters as the contract names them and maps the row', async () => {
        const result = await clientFor().getSalesTurnover(request);

        expect(JSON.parse(result.rows[0].dimensionId)).toMatchObject({
            granularity: 'GRANULARITY_MONTH',
            dimension: 'SALES_DIMENSION_COUNTERPARTY_MANAGER',
            timeZone: 'Europe/Berlin',
            counterpartyIds: ['c1'],
            organizationIds: ['o1'],
            contractIds: ['k1'],
            counterpartyManagerIds: ['m1'],
            mainManagerOnly: true,
        });
        expect(result.rows[0].netSales).toEqual({
            amount: '0.00',
            amountExcludingVatBasis: '0.00',
            documentCount: 0,
            documentsWithoutAmount: 0,
        });
        expect(result.correctionsWithoutEffect).toBe(0);
        expect(result.unresolvedCurrencies).toEqual([]);
    });

    it('sends the exclude lists, and counterparty groups only while the switch is on', async () => {
        const wanted = {
            ...request,
            excludeCounterpartyIds: ['c9'],
            excludeOrganizationIds: ['o9'],
            excludeContractIds: ['k9'],
            excludeCounterpartyManagerIds: ['m9'],
            counterpartyGroupIds: ['g1'],
            excludeCounterpartyGroupIds: ['g2'],
        };

        const off = await clientFor().getSalesTurnover(wanted);
        expect(JSON.parse(off.rows[0].dimensionId)).toMatchObject({
            excludeCounterpartyIds: ['c9'],
            excludeOrganizationIds: ['o9'],
            excludeContractIds: ['k9'],
            excludeCounterpartyManagerIds: ['m9'],
            counterpartyGroupIds: [],
            excludeCounterpartyGroupIds: [],
        });

        const on = await clientFor(keyFile, true).getSalesTurnover(wanted);
        expect(JSON.parse(on.rows[0].dimensionId)).toMatchObject({
            counterpartyGroupIds: ['g1'],
            excludeCounterpartyGroupIds: ['g2'],
        });
    });

    it('reports a wrong key as UNAUTHENTICATED and a missing one as NOT_CONFIGURED', async () => {
        const wrong = join(dir, 'wrong');
        await writeFile(wrong, 'another-key');
        await expect(clientFor(wrong).getSalesTurnover(request)).rejects.toMatchObject({
            kind: 'UNAUTHENTICATED',
        });
        await expect(clientFor(join(dir, 'missing')).getSalesTurnover(request)).rejects.toEqual(
            expect.any(OrderMetricsError),
        );
    });
});
