import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as protobuf from 'protobufjs';

import { ORDER_METRICS_PROTO, TIMESTAMP_PROTO } from '../order-analytics/order-metrics.proto';
import { SALES_METRICS_PROTO } from '../sales-analytics/sales-metrics.proto';

export interface EchoOrderMetricsServer {
    address: string;
    stop: () => Promise<void>;
}

// Test double of the analytics service: one row whose dimension id is the JSON of what the server asked for (orders and sales).
export async function startEchoOrderMetricsServer(key: string): Promise<EchoOrderMetricsServer> {
    const root = new protobuf.Root();
    protobuf.parse(TIMESTAMP_PROTO, root);
    protobuf.parse(ORDER_METRICS_PROTO, root);
    protobuf.parse(SALES_METRICS_PROTO, root);
    const loaded = grpc.loadPackageDefinition(
        protoLoader.fromJSON(root.toJSON(), { longs: String, enums: String, defaults: true }),
    ) as unknown as {
        analytics: {
            v1: {
                OrderMetricsService: grpc.ServiceClientConstructor;
                SalesMetricsService: grpc.ServiceClientConstructor;
            };
        };
    };
    const server = new grpc.Server();
    server.addService(loaded.analytics.v1.OrderMetricsService.service, {
        GetOrderTurnover: (
            call: grpc.ServerUnaryCall<Record<string, unknown>, unknown>,
            cb: grpc.sendUnaryData<object>,
        ) => {
            if (call.metadata.get('authorization')[0] !== `Bearer ${key}`) {
                cb({ code: grpc.status.UNAUTHENTICATED, name: 'Unauthenticated', message: '' });
                return;
            }
            const asked = { ...call.request };
            delete asked.from;
            delete asked.to;
            cb(null, {
                rows: [
                    {
                        dimensionId: JSON.stringify(asked),
                        currency: 'RUB',
                        turnover: '0.00',
                        turnoverExcludingVat: '0.00',
                        vatTotal: '0.00',
                        orderCount: '0',
                        ordersWithoutAmount: '0',
                        productQuantity: '',
                        productAmount: '',
                        productLinesWithoutAmount: '0',
                    },
                ],
            });
        },
        ListOrderTurnoverFilterValues: (
            call: grpc.ServerUnaryCall<Record<string, unknown>, unknown>,
            cb: grpc.sendUnaryData<object>,
        ) => {
            if (call.metadata.get('authorization')[0] !== `Bearer ${key}`) {
                cb({ code: grpc.status.UNAUTHENTICATED, name: 'Unauthenticated', message: '' });
                return;
            }
            cb(null, {
                values: [
                    { value: '', orderCount: '2' },
                    { value: JSON.stringify(call.request), orderCount: '5' },
                ],
            });
        },
    });
    const zero = {
        amount: '0.00',
        amountExcludingVatBasis: '0.00',
        documentCount: '0',
        documentsWithoutAmount: '0',
    };
    server.addService(loaded.analytics.v1.SalesMetricsService.service, {
        GetSalesTurnover: (
            call: grpc.ServerUnaryCall<Record<string, unknown>, unknown>,
            cb: grpc.sendUnaryData<object>,
        ) => {
            if (call.metadata.get('authorization')[0] !== `Bearer ${key}`) {
                cb({ code: grpc.status.UNAUTHENTICATED, name: 'Unauthenticated', message: '' });
                return;
            }
            const asked = { ...call.request };
            delete asked.from;
            delete asked.to;
            cb(null, {
                rows: [
                    {
                        dimensionId: JSON.stringify(asked),
                        currency: 'RUB',
                        sales: zero,
                        returns: zero,
                        corrections: zero,
                        netSales: zero,
                    },
                ],
                correctionsWithoutEffect: '0',
                unresolvedCurrencies: [],
            });
        },
    });
    const address = await new Promise<string>((resolve, reject) =>
        server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (err, port) =>
            err ? reject(err) : resolve(`127.0.0.1:${port}`),
        ),
    );
    return {
        address,
        stop: () => {
            server.forceShutdown();
            return Promise.resolve();
        },
    };
}
