import { Inject } from '@nestjs/common';
import { Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext, TransactionalConnection } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { ExchangeHealthSnapshot } from './entities/exchange-health-snapshot.entity';
import { EXCHANGE_SNAPSHOT_KEY } from './exchange-health-poller.service';
import { viewSnapshot } from './exchange-health';
import type { ExchangeHealthSnapshotView } from './exchange-health';
import { EXCHANGE_HEALTH_POLL_INTERVAL_DEFAULT, ERP_INTEGRATION_PLUGIN_OPTIONS } from './types';
import type { ErpIntegrationPluginOptions } from './types';

@Resolver()
export class ExchangeHealthResolver {
    constructor(
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
        private readonly connection: TransactionalConnection,
    ) {}

    @Query()
    @Allow(
        CustomPermission.ManageErpIntegration.Permission,
        CustomPermission.ReadExchangeHealth.Permission,
    )
    async exchangeHealth(@Ctx() ctx: RequestContext): Promise<ExchangeHealthSnapshotView> {
        const stored = await this.connection
            .getRepository(ctx, ExchangeHealthSnapshot)
            .findOne({ where: { key: EXCHANGE_SNAPSHOT_KEY } });
        const interval =
            this.options.exchangeHealthPollIntervalMs ?? EXCHANGE_HEALTH_POLL_INTERVAL_DEFAULT;
        return viewSnapshot(stored, new Date(), interval);
    }
}
