import { Inject } from '@nestjs/common';
import { Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext, TransactionalConnection } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { compareContractVersions } from './contract-version-drift';
import type { ContractVersionDrift } from './contract-version-drift';
import { ContractVersionClient } from './contract-version.client';
import { CONTRACT_VERSION, listContractStreams } from './contract-streams';
import { KafkaConsumerLagEntry } from './entities/kafka-consumer-lag.entity';
import { IGNORED_CONTRACT_STREAMS } from './ignored-contract-streams';
import { VariantUnitHealthService } from './variant-unit-health.service';
import type { VariantUnitHealth } from './variant-unit-health.service';
import { OrderCheckHealthService } from './order-checks/order-check-health.service';
import type { OrderCheckHealthRow } from './order-checks/order-check-health.service';
import { RejectedOrderHealthService } from './rejected-order-health.service';
import { IntegrationInboxHealthService } from './integration-inbox-health.service';
import { IntegrationOutboxHealthService } from './integration-outbox-health.service';
import type { OutboxHealthByEventType } from './outbox-health';
import { groupLagRowsByTopic } from './kafka-lag.resolver';
import { buildStreamHealthRows, lagByConsumedStream } from './stream-health';
import type { StreamHealthRow } from './stream-health';
import { ERP_INTEGRATION_PLUGIN_OPTIONS } from './types';
import type { ErpIntegrationPluginOptions } from './types';

export interface IntegrationStreamHealthReport {
    contractVersion: string;
    versionDrift: ContractVersionDrift;
    streams: StreamHealthRow[];
}

@Resolver()
export class IntegrationStreamHealthResolver {
    constructor(
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
        private readonly connection: TransactionalConnection,
        private readonly inbox: IntegrationInboxHealthService,
        private readonly outboxHealth: IntegrationOutboxHealthService,
        private readonly contractVersions: ContractVersionClient,
        private readonly variantUnits: VariantUnitHealthService,
        private readonly rejectedOrders: RejectedOrderHealthService,
        private readonly orderChecks: OrderCheckHealthService,
    ) {}

    @Query()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    async integrationStreamHealth(
        @Ctx() ctx: RequestContext,
    ): Promise<IntegrationStreamHealthReport> {
        const [lagRows, backlog, noops] = await Promise.all([
            this.connection.getRepository(ctx, KafkaConsumerLagEntry).find(),
            this.inbox.getBacklogByStream(ctx),
            this.inbox.getNoopSummaryByStream(ctx),
        ]);
        const latest = await this.contractVersions.getLatestVersion();
        const topics: Record<string, string> = this.options.kafkaConsumer.topics;
        return {
            contractVersion: CONTRACT_VERSION,
            versionDrift: compareContractVersions(CONTRACT_VERSION, latest),
            streams: buildStreamHealthRows({
                contractStreams: listContractStreams(),
                consumedStreams: Object.keys(topics),
                ignoredStreams: IGNORED_CONTRACT_STREAMS,
                topics,
                lagByStream: lagByConsumedStream(groupLagRowsByTopic(lagRows), topics),
                backlogByStream: new Map(backlog.map(b => [b.stream, b])),
                noopByStream: new Map(noops.map(n => [n.stream, n])),
            }),
        };
    }

    @Query()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    async integrationOutboxHealth(@Ctx() ctx: RequestContext): Promise<OutboxHealthByEventType[]> {
        return this.outboxHealth.getHealthByEventType(ctx);
    }

    @Query()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    async variantUnitHealth(@Ctx() ctx: RequestContext): Promise<VariantUnitHealth> {
        return this.variantUnits.getHealth(ctx);
    }

    @Query()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    async rejectedOrderCount(@Ctx() ctx: RequestContext): Promise<number> {
        return this.rejectedOrders.getRejectedCount(ctx);
    }

    @Query()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    async orderCheckHealth(@Ctx() ctx: RequestContext): Promise<OrderCheckHealthRow[]> {
        return this.orderChecks.getHealth(ctx);
    }
}
