import { Injectable, OnModuleInit } from '@nestjs/common';
import { Order, TransactionalConnection } from '@vendure/core';
import { CheckRegistry } from '@mivend/plugin-checks';
import { TradingPointService } from '@mivend/plugin-counterparty';

import {
    FREIGHT_TRADING_POINT,
    evaluateFreightTradingPoint,
    hasFreightWithoutTradingPoint,
} from './freight-trading-point.check';

interface PointFields {
    tradingPointId?: string | null;
}

const isPlaced = (order: Order | null): boolean =>
    !!order && order.state !== 'AddingItems' && order.state !== 'Draft';

// The customer is never stopped at checkout; the manager stage holds the automatic reserve (#241).
@Injectable()
export class FreightTradingPointRegistrar implements OnModuleInit {
    constructor(
        private registry: CheckRegistry,
        private connection: TransactionalConnection,
        private tradingPoints: TradingPointService,
    ) {}

    onModuleInit(): void {
        this.registry.registerCheck<{ orderId: string; customerId: string | null }>({
            code: FREIGHT_TRADING_POINT,
            subjectType: 'order',
            stages: ['checkout', 'pre-reserve', 'on-edit'],
            description: 'Freight delivery needs an active trading point of the customer.',
            stageDefaults: { checkout: 'warn', 'pre-reserve': 'hold', 'on-edit': 'warn' },
            evaluate: async (subject, { ctx }) => {
                const order = await this.connection
                    .getRepository(ctx, Order)
                    .findOne({ where: { id: subject.orderId }, relations: ['shippingLines'] });
                const gap = await hasFreightWithoutTradingPoint(
                    { connection: this.connection, tradingPoints: this.tradingPoints },
                    ctx,
                    {
                        customerId: subject.customerId,
                        placedPointId: isPlaced(order)
                            ? ((order?.customFields as PointFields | undefined)?.tradingPointId ??
                              null)
                            : undefined,
                        shippingMethodIds: (order?.shippingLines ?? [])
                            .map(l => l.shippingMethodId)
                            .filter((id): id is NonNullable<typeof id> => id != null),
                    },
                );
                return evaluateFreightTradingPoint(gap);
            },
        });
    }
}
