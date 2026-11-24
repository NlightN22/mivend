import { Inject, Injectable } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as protobuf from 'protobufjs';
import { readFile } from 'node:fs/promises';

import { ANALYTICS_PLUGIN_OPTIONS } from '../types';
import type { AnalyticsPluginOptions } from '../types';
import { ORDER_METRICS_PROTO, TIMESTAMP_PROTO } from './order-metrics.proto';
import { OrderMetricsError } from './order-metrics.types';
import type {
    OrderMetricsErrorKind,
    OrderMetricsRequest,
    OrderTurnoverRow,
} from './order-metrics.types';

const CALL_TIMEOUT_MS = 20_000;

interface WireTimestamp {
    seconds: string | number;
    nanos: number;
}

interface WireRow {
    periodStart?: WireTimestamp | null;
    dimensionId: string;
    currency: string;
    turnover: string;
    orderCount: string | number;
    ordersWithoutAmount: string | number;
    turnoverExcludingVat: string;
    vatTotal: string;
    productQuantity: string;
    productAmount: string;
    productLinesWithoutAmount: string | number;
}

type TurnoverCall = (
    request: object,
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: (error: grpc.ServiceError | null, response?: { rows: WireRow[] }) => void,
) => void;

type TurnoverClient = grpc.Client & { GetOrderTurnover: TurnoverCall };

const ERROR_KINDS: Record<number, OrderMetricsErrorKind> = {
    [grpc.status.UNAUTHENTICATED]: 'UNAUTHENTICATED',
    [grpc.status.INVALID_ARGUMENT]: 'INVALID_ARGUMENT',
    [grpc.status.PERMISSION_DENIED]: 'PERMISSION_DENIED',
    [grpc.status.RESOURCE_EXHAUSTED]: 'TOO_LARGE',
    [grpc.status.DEADLINE_EXCEEDED]: 'TIMEOUT',
};

function loadServiceConstructor(): grpc.ServiceClientConstructor {
    const root = new protobuf.Root();
    protobuf.parse(TIMESTAMP_PROTO, root);
    protobuf.parse(ORDER_METRICS_PROTO, root);
    const definition = protoLoader.fromJSON(root.toJSON(), {
        longs: String,
        enums: String,
        defaults: true,
    });
    const loaded = grpc.loadPackageDefinition(definition) as unknown as {
        analytics: { v1: { OrderMetricsService: grpc.ServiceClientConstructor } };
    };
    return loaded.analytics.v1.OrderMetricsService;
}

const toTimestamp = (date: Date): WireTimestamp => ({
    seconds: String(Math.floor(date.getTime() / 1000)),
    nanos: (date.getTime() % 1000) * 1_000_000,
});

const fromTimestamp = (value?: WireTimestamp | null): Date | null =>
    value ? new Date(Number(value.seconds) * 1000 + Math.floor(value.nanos / 1_000_000)) : null;

// Server-side only: the key file path comes from the environment and its content never leaves this class.
@Injectable()
export class OrderMetricsClient {
    private client: TurnoverClient | null = null;

    constructor(
        @Inject(ANALYTICS_PLUGIN_OPTIONS) private readonly options: AnalyticsPluginOptions,
    ) {}

    async getOrderTurnover(request: OrderMetricsRequest): Promise<OrderTurnoverRow[]> {
        const key = await this.readKey();
        const metadata = new grpc.Metadata();
        metadata.set('authorization', `Bearer ${key}`);
        const client = this.connection();
        const response = await new Promise<{ rows: WireRow[] }>((resolve, reject) => {
            client.GetOrderTurnover(
                {
                    from: toTimestamp(request.from),
                    to: toTimestamp(request.to),
                    granularity: `GRANULARITY_${request.granularity}`,
                    dimension: `DIMENSION_${request.dimension}`,
                    timeZone: request.timeZone,
                    customerIds: request.customerIds,
                    organizationIds: request.organizationIds,
                    pointOfSaleIds: request.pointOfSaleIds,
                    managerIds: request.managerIds,
                    counterpartyManagerIds: request.counterpartyManagerIds,
                    mainManagerOnly: request.mainManagerOnly,
                    productIds: request.productIds,
                    manufacturerIds: request.manufacturerIds,
                },
                metadata,
                { deadline: Date.now() + CALL_TIMEOUT_MS },
                (error, result) =>
                    error
                        ? reject(
                              new OrderMetricsError(
                                  ERROR_KINDS[error.code] ?? 'UNAVAILABLE',
                                  `order metrics call failed with status ${error.code}`,
                              ),
                          )
                        : resolve(result ?? { rows: [] }),
            );
        });
        return response.rows.map(row => ({
            periodStart: fromTimestamp(row.periodStart),
            dimensionId: row.dimensionId,
            currency: row.currency,
            turnover: row.turnover,
            turnoverExcludingVat: row.turnoverExcludingVat,
            vatTotal: row.vatTotal,
            orderCount: Number(row.orderCount),
            ordersWithoutAmount: Number(row.ordersWithoutAmount),
            productQuantity: row.productQuantity,
            productAmount: row.productAmount,
            productLinesWithoutAmount: Number(row.productLinesWithoutAmount),
        }));
    }

    private async readKey(): Promise<string> {
        const { orderMetricsAddress, orderMetricsKeyFile } = this.options;
        if (!orderMetricsAddress || !orderMetricsKeyFile) {
            throw new OrderMetricsError('NOT_CONFIGURED', 'order metrics are not configured');
        }
        let key = '';
        try {
            key = (await readFile(orderMetricsKeyFile, 'utf8')).trim();
        } catch {
            throw new OrderMetricsError('NOT_CONFIGURED', 'order metrics key file is unreadable');
        }
        if (!key) throw new OrderMetricsError('NOT_CONFIGURED', 'order metrics key file is empty');
        return key;
    }

    private connection(): TurnoverClient {
        if (!this.client) {
            const Service = loadServiceConstructor();
            this.client = new Service(
                this.options.orderMetricsAddress as string,
                this.options.orderMetricsCredentials ?? grpc.credentials.createSsl(),
            ) as unknown as TurnoverClient;
        }
        return this.client;
    }
}
