import { Inject } from '@nestjs/common';
import { Query, Resolver } from '@nestjs/graphql';
import { Allow } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import { DataSource } from 'typeorm';

import { compareContractVersions } from './contract-version-drift';
import type { ContractVersionDrift } from './contract-version-drift';
import { ContractVersionClient } from './contract-version.client';
import { CONTRACT_VERSION, listContractStreams } from './contract-streams';
import { KafkaConsumerLagEntry } from './entities/kafka-consumer-lag.entity';
import { IGNORED_CONTRACT_STREAMS } from './ignored-contract-streams';
import { VariantUnitHealthService } from './variant-unit-health.service';
import type { VariantUnitHealth } from './variant-unit-health.service';
import { IntegrationInboxHealthService } from './integration-inbox-health.service';
import { IntegrationOutboxHealthService } from './integration-outbox-health.service';
import type { OutboxHealthByEventType } from './outbox-health';
import { groupLagRowsByTopic } from './kafka-lag.resolver';
import { buildStreamHealthRows } from './stream-health';
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
        private readonly dataSource: DataSource,
        private readonly inbox: IntegrationInboxHealthService,
        private readonly outboxHealth: IntegrationOutboxHealthService,
        private readonly contractVersions: ContractVersionClient,
        private readonly variantUnits: VariantUnitHealthService,
    ) {}

    @Query()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    async integrationStreamHealth(): Promise<IntegrationStreamHealthReport> {
        const [lagRows, backlog, noops] = await Promise.all([
            this.dataSource.getRepository(KafkaConsumerLagEntry).find(),
            this.inbox.getBacklogByStream(),
            this.inbox.getNoopSummaryByStream(),
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
                lagByStream: new Map(groupLagRowsByTopic(lagRows).map(l => [l.stream, l])),
                backlogByStream: new Map(backlog.map(b => [b.stream, b])),
                noopByStream: new Map(noops.map(n => [n.stream, n])),
            }),
        };
    }

    @Query()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    async integrationOutboxHealth(): Promise<OutboxHealthByEventType[]> {
        return this.outboxHealth.getHealthByEventType();
    }

    @Query()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    async variantUnitHealth(): Promise<VariantUnitHealth> {
        return this.variantUnits.getHealth();
    }
}
