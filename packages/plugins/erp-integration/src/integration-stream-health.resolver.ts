import { Inject } from '@nestjs/common';
import { Query, Resolver } from '@nestjs/graphql';
import { Allow } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import { DataSource } from 'typeorm';

import { CONTRACT_VERSION, listContractStreams } from './contract-streams';
import { KafkaConsumerLagEntry } from './entities/kafka-consumer-lag.entity';
import { IGNORED_CONTRACT_STREAMS } from './ignored-contract-streams';
import { IntegrationInboxService } from './integration-inbox.service';
import { groupLagRowsByTopic } from './kafka-lag.resolver';
import { buildStreamHealthRows } from './stream-health';
import type { StreamHealthRow } from './stream-health';
import { ERP_INTEGRATION_PLUGIN_OPTIONS } from './types';
import type { ErpIntegrationPluginOptions } from './types';

export interface IntegrationStreamHealthReport {
    contractVersion: string;
    streams: StreamHealthRow[];
}

@Resolver()
export class IntegrationStreamHealthResolver {
    constructor(
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
        private readonly dataSource: DataSource,
        private readonly inbox: IntegrationInboxService,
    ) {}

    @Query()
    @Allow(CustomPermission.ManageErpIntegration.Permission)
    async integrationStreamHealth(): Promise<IntegrationStreamHealthReport> {
        const [lagRows, backlog] = await Promise.all([
            this.dataSource.getRepository(KafkaConsumerLagEntry).find(),
            this.inbox.getBacklogByStream(),
        ]);
        const topics: Record<string, string> = this.options.kafkaConsumer.topics;
        return {
            contractVersion: CONTRACT_VERSION,
            streams: buildStreamHealthRows({
                contractStreams: listContractStreams(),
                consumedStreams: Object.keys(topics),
                ignoredStreams: IGNORED_CONTRACT_STREAMS,
                topics,
                lagByStream: new Map(groupLagRowsByTopic(lagRows).map(l => [l.stream, l])),
                backlogByStream: new Map(backlog.map(b => [b.stream, b])),
            }),
        };
    }
}
