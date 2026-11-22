import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as protobuf from 'protobufjs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ORDER_METRICS_PROTO, TIMESTAMP_PROTO } from '../../order-analytics/order-metrics.proto';
import { OrderMetricsClient } from '../../order-analytics/order-metrics.client';
import { OrderMetricsError } from '../../order-analytics/order-metrics.types';
import type { OrderMetricsRequest } from '../../order-analytics/order-metrics.types';

const SECRET = 'test-secret-key-value';
const request: OrderMetricsRequest = {
    from: new Date('2026-01-01T00:00:00Z'),
    to: new Date('2026-02-01T00:00:00Z'),
    granularity: 'DAY',
    dimension: 'CUSTOMER',
    timeZone: 'Europe/Berlin',
    customerIds: ['customer-1'],
    organizationIds: [],
    pointOfSaleIds: [],
    managerIds: [],
};

interface Seen {
    request: Record<string, unknown>;
    authorization: unknown[];
}

let server: grpc.Server;
let address: string;
let dir: string;
let keyFile: string;
let seen: Seen | null = null;
let respond: (call: grpc.ServerUnaryCall<unknown, unknown>, cb: grpc.sendUnaryData<object>) => void;

const clientFor = (over: { address?: string; keyFile?: string } = {}): OrderMetricsClient =>
    new OrderMetricsClient({
        orderMetricsAddress: over.address ?? address,
        orderMetricsKeyFile: over.keyFile ?? keyFile,
        orderMetricsCredentials: grpc.credentials.createInsecure(),
    });

beforeAll(async () => {
    const root = new protobuf.Root();
    protobuf.parse(TIMESTAMP_PROTO, root);
    protobuf.parse(ORDER_METRICS_PROTO, root);
    const loaded = grpc.loadPackageDefinition(
        protoLoader.fromJSON(root.toJSON(), { longs: String, enums: String, defaults: true }),
    ) as unknown as {
        analytics: { v1: { OrderMetricsService: grpc.ServiceClientConstructor } };
    };
    server = new grpc.Server();
    server.addService(loaded.analytics.v1.OrderMetricsService.service, {
        GetOrderTurnover: (
            call: grpc.ServerUnaryCall<unknown, unknown>,
            cb: grpc.sendUnaryData<object>,
        ) => {
            seen = {
                request: call.request as unknown as Record<string, unknown>,
                authorization: call.metadata.get('authorization'),
            };
            respond(call, cb);
        },
    });
    address = await new Promise<string>((resolve, reject) =>
        server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (err, port) =>
            err ? reject(err) : resolve(`127.0.0.1:${port}`),
        ),
    );
    dir = await mkdtemp(join(tmpdir(), 'order-metrics-'));
    keyFile = join(dir, 'manager.key');
    await writeFile(keyFile, `${SECRET}\n`);
});

afterEach(() => {
    seen = null;
});

afterAll(async () => {
    server.forceShutdown();
    await rm(dir, { recursive: true, force: true });
});

describe('OrderMetricsClient over a real gRPC transport', () => {
    it('sends the bearer key read from the file and the request in contract terms', async () => {
        respond = (_call, cb) => cb(null, { rows: [] });

        await clientFor().getOrderTurnover(request);

        expect(seen?.authorization).toEqual([`Bearer ${SECRET}`]);
        expect(seen?.request).toMatchObject({
            granularity: 'GRANULARITY_DAY',
            dimension: 'DIMENSION_CUSTOMER',
            timeZone: 'Europe/Berlin',
            customerIds: ['customer-1'],
            from: { seconds: '1767225600', nanos: 0 },
            to: { seconds: '1769904000', nanos: 0 },
        });
    });

    it('maps rows to dates, numbers and exact decimal strings', async () => {
        respond = (_call, cb) =>
            cb(null, {
                rows: [
                    {
                        periodStart: { seconds: '1767225600', nanos: 0 },
                        dimensionId: 'customer-1',
                        currency: 'RUB',
                        turnover: '1234.50',
                        orderCount: '3',
                        ordersWithoutAmount: '1',
                        turnoverExcludingVat: '1028.75',
                        vatTotal: '205.75',
                    },
                ],
            });

        const [row] = await clientFor().getOrderTurnover(request);

        expect(row).toEqual({
            periodStart: new Date('2026-01-01T00:00:00Z'),
            dimensionId: 'customer-1',
            currency: 'RUB',
            turnover: '1234.50',
            turnoverExcludingVat: '1028.75',
            vatTotal: '205.75',
            orderCount: 3,
            ordersWithoutAmount: 1,
        });
    });

    it('returns a null period for a total without granularity', async () => {
        respond = (_call, cb) =>
            cb(null, {
                rows: [
                    {
                        dimensionId: '',
                        currency: '',
                        turnover: '0.00',
                        orderCount: '0',
                        ordersWithoutAmount: '0',
                        turnoverExcludingVat: '0.00',
                        vatTotal: '0.00',
                    },
                ],
            });

        const [row] = await clientFor().getOrderTurnover({ ...request, granularity: 'NONE' });

        expect(row.periodStart).toBeNull();
    });

    it.each([
        [grpc.status.UNAUTHENTICATED, 'UNAUTHENTICATED'],
        [grpc.status.INVALID_ARGUMENT, 'INVALID_ARGUMENT'],
        [grpc.status.PERMISSION_DENIED, 'PERMISSION_DENIED'],
        [grpc.status.RESOURCE_EXHAUSTED, 'TOO_LARGE'],
        [grpc.status.DEADLINE_EXCEEDED, 'TIMEOUT'],
        [grpc.status.INTERNAL, 'UNAVAILABLE'],
    ])('maps gRPC status %i to %s without leaking the key', async (code, kind) => {
        respond = (_call, cb) => cb({ code, message: `bad ${SECRET}` });

        const error = await clientFor()
            .getOrderTurnover(request)
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(OrderMetricsError);
        expect((error as OrderMetricsError).kind).toBe(kind);
        expect((error as OrderMetricsError).message).not.toContain(SECRET);
    });

    it('reports an unreachable service as UNAVAILABLE', async () => {
        const error = await clientFor({ address: '127.0.0.1:1' })
            .getOrderTurnover(request)
            .catch((e: unknown) => e);

        expect((error as OrderMetricsError).kind).toBe('UNAVAILABLE');
    });

    it('is NOT_CONFIGURED without an address, a key file path, a readable or a non-empty key file', async () => {
        const empty = join(dir, 'empty.key');
        await writeFile(empty, '  \n');
        const cases = [
            new OrderMetricsClient({ orderMetricsKeyFile: keyFile }),
            new OrderMetricsClient({ orderMetricsAddress: address }),
            clientFor({ keyFile: join(dir, 'missing.key') }),
            clientFor({ keyFile: empty }),
        ];
        for (const client of cases) {
            const error = await client.getOrderTurnover(request).catch((e: unknown) => e);
            expect((error as OrderMetricsError).kind).toBe('NOT_CONFIGURED');
        }
        expect(seen).toBeNull();
    });

    it('re-reads the key file on each call so a rotated key is used without a restart', async () => {
        respond = (_call, cb) => cb(null, { rows: [] });
        const rotating = join(dir, 'rotating.key');
        const client = clientFor({ keyFile: rotating });
        await writeFile(rotating, 'old-key');
        await client.getOrderTurnover(request);
        await writeFile(rotating, 'new-key');
        await client.getOrderTurnover(request);

        expect(seen?.authorization).toEqual(['Bearer new-key']);
    });
});
