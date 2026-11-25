import { Inject, Injectable } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as protobuf from 'protobufjs';
import { readFile } from 'node:fs/promises';

import { ORDER_METRICS_PROTO, TIMESTAMP_PROTO } from '../order-analytics/order-metrics.proto';
import { OrderMetricsError } from '../order-analytics/order-metrics.types';
import type { OrderMetricsErrorKind } from '../order-analytics/order-metrics.types';
import { ANALYTICS_PLUGIN_OPTIONS } from '../types';
import type { AnalyticsPluginOptions } from '../types';
import { SALES_METRICS_PROTO } from './sales-metrics.proto';
import type { SalesAmount, SalesMetricsRequest, SalesTurnover } from './sales-metrics.types';

const CALL_TIMEOUT_MS = 20_000;

interface WireTimestamp {
    seconds: string | number;
    nanos: number;
}

interface WireAmount {
    amount: string;
    amountExcludingVatBasis: string;
    documentCount: string | number;
    documentsWithoutAmount: string | number;
}

interface WireRow {
    periodStart?: WireTimestamp | null;
    dimensionId: string;
    currency: string;
    sales: WireAmount;
    returns: WireAmount;
    corrections: WireAmount;
    netSales: WireAmount;
}

interface WireResponse {
    rows: WireRow[];
    correctionsWithoutEffect: string | number;
    unresolvedCurrencies: string[];
}

type SalesCall = (
    request: object,
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: (error: grpc.ServiceError | null, response?: WireResponse) => void,
) => void;

type SalesClient = grpc.Client & { GetSalesTurnover: SalesCall };

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
    protobuf.parse(SALES_METRICS_PROTO, root);
    const definition = protoLoader.fromJSON(root.toJSON(), {
        longs: String,
        enums: String,
        defaults: true,
    });
    const loaded = grpc.loadPackageDefinition(definition) as unknown as {
        analytics: { v1: { SalesMetricsService: grpc.ServiceClientConstructor } };
    };
    return loaded.analytics.v1.SalesMetricsService;
}

const toTimestamp = (date: Date): WireTimestamp => ({
    seconds: String(Math.floor(date.getTime() / 1000)),
    nanos: (date.getTime() % 1000) * 1_000_000,
});

const fromTimestamp = (value?: WireTimestamp | null): Date | null =>
    value ? new Date(Number(value.seconds) * 1000 + Math.floor(value.nanos / 1_000_000)) : null;

const toAmount = (wire?: WireAmount | null): SalesAmount => ({
    amount: wire?.amount ?? '0.00',
    amountExcludingVatBasis: wire?.amountExcludingVatBasis ?? '0.00',
    documentCount: Number(wire?.documentCount ?? 0),
    documentsWithoutAmount: Number(wire?.documentsWithoutAmount ?? 0),
});

// Server-side only: the key file path comes from the environment and its content never leaves this class.
@Injectable()
export class SalesMetricsClient {
    private client: SalesClient | null = null;

    constructor(
        @Inject(ANALYTICS_PLUGIN_OPTIONS) private readonly options: AnalyticsPluginOptions,
    ) {}

    async getSalesTurnover(request: SalesMetricsRequest): Promise<SalesTurnover> {
        const key = await this.readKey();
        const metadata = new grpc.Metadata();
        metadata.set('authorization', `Bearer ${key}`);
        const client = this.connection();
        const response = await new Promise<WireResponse>((resolve, reject) => {
            client.GetSalesTurnover(
                {
                    from: toTimestamp(request.from),
                    to: toTimestamp(request.to),
                    granularity: `GRANULARITY_${request.granularity}`,
                    dimension: `SALES_DIMENSION_${request.dimension}`,
                    timeZone: request.timeZone,
                    counterpartyIds: request.counterpartyIds,
                    organizationIds: request.organizationIds,
                    contractIds: request.contractIds,
                    counterpartyManagerIds: request.counterpartyManagerIds,
                    mainManagerOnly: request.mainManagerOnly,
                },
                metadata,
                { deadline: Date.now() + CALL_TIMEOUT_MS },
                (error, result) =>
                    error
                        ? reject(
                              new OrderMetricsError(
                                  ERROR_KINDS[error.code] ?? 'UNAVAILABLE',
                                  `sales metrics call failed with status ${error.code}`,
                              ),
                          )
                        : resolve(
                              result ?? {
                                  rows: [],
                                  correctionsWithoutEffect: 0,
                                  unresolvedCurrencies: [],
                              },
                          ),
            );
        });
        return {
            rows: response.rows.map(row => ({
                periodStart: fromTimestamp(row.periodStart),
                dimensionId: row.dimensionId,
                currency: row.currency,
                sales: toAmount(row.sales),
                returns: toAmount(row.returns),
                corrections: toAmount(row.corrections),
                netSales: toAmount(row.netSales),
            })),
            correctionsWithoutEffect: Number(response.correctionsWithoutEffect),
            unresolvedCurrencies: response.unresolvedCurrencies ?? [],
        };
    }

    private async readKey(): Promise<string> {
        const { orderMetricsAddress, orderMetricsKeyFile } = this.options;
        if (!orderMetricsAddress || !orderMetricsKeyFile) {
            throw new OrderMetricsError('NOT_CONFIGURED', 'sales metrics are not configured');
        }
        let key = '';
        try {
            key = (await readFile(orderMetricsKeyFile, 'utf8')).trim();
        } catch {
            throw new OrderMetricsError('NOT_CONFIGURED', 'sales metrics key file is unreadable');
        }
        if (!key) throw new OrderMetricsError('NOT_CONFIGURED', 'sales metrics key file is empty');
        return key;
    }

    private connection(): SalesClient {
        if (!this.client) {
            const Service = loadServiceConstructor();
            this.client = new Service(
                this.options.orderMetricsAddress as string,
                this.options.orderMetricsCredentials ??
                    (this.options.orderMetricsInsecure
                        ? grpc.credentials.createInsecure()
                        : grpc.credentials.createSsl()),
            ) as unknown as SalesClient;
        }
        return this.client;
    }
}
