import { gql } from 'graphql-tag';
import type { DocumentNode } from 'graphql';

export const adminApiExtensions: DocumentNode = gql`
    # Backs the Product.manufacturer relation customField (vendure-config.ts) — issue #116
    # registered the entity but never declared this type, which @vendure/core's own
    # addGraphQLCustomFields validates exists at schema-build time. Missed by every automated
    # check here (a green make test/make lint doesn't build the real GraphQL schema), only
    # surfaced when @vendure/dashboard's own standalone schema-generator tried to build it for
    # this issue's unrelated Dashboard work (issue #119 Phase 1).
    type Manufacturer {
        id: ID!
        externalId: String!
        name: String
    }

    type FailedIntegrationInboxEvent {
        id: ID!
        stream: String!
        entityId: String!
        lastError: String
        attempts: Int!
        updatedAt: DateTime!
    }

    type FailedIntegrationInboxEventList {
        items: [FailedIntegrationInboxEvent!]!
        totalItems: Int!
    }

    input FailedIntegrationInboxEventListOptions {
        take: Int
        skip: Int
    }

    type ProductTaxCodeFlag {
        id: ID!
        externalProductId: String!
        rawVatCode: String!
        reason: String!
        detail: String!
        detectedAt: DateTime!
    }

    type ProductTaxCodeFlagList {
        items: [ProductTaxCodeFlag!]!
        totalItems: Int!
    }

    input ProductTaxCodeFlagListOptions {
        take: Int
        skip: Int
    }

    type ErpReconciliationIssue {
        id: ID!
        issueType: String!
        aggregateType: String!
        ourCount: Int!
        theirActiveCount: Int!
        detectedAt: DateTime!
        status: String!
        resolution: String
        triggeredBy: String!
        triggeredByAdministratorId: ID
    }

    type ErpReconciliationIssueList {
        items: [ErpReconciliationIssue!]!
        totalItems: Int!
    }

    input OpenErpReconciliationIssueListOptions {
        take: Int
        skip: Int
    }

    type ErpReconciliationRunResult {
        checked: Int!
        issuesFound: Int!
        skipped: [String!]!
    }

    type KafkaTopicLagPartition {
        partition: Int!
        committedOffset: String
        endOffset: String!
        lag: String
    }

    type IntegrationInboxBacklogByStream {
        stream: String!
        pending: Int!
        processing: Int!
        failed: Int!
    }

    type IntegrationStreamHealth {
        stream: String!
        topic: String
        inContract: Boolean!
        consumed: Boolean!
        ignoredReason: String
        "NOT_CONSUMED | NOT_IN_CONTRACT | UNKNOWN_STREAM, null when the stream is consistent."
        drift: String
        lag: KafkaTopicLag
        pending: Int!
        processing: Int!
        failed: Int!
        oldestPendingAt: DateTime
    }

    type ContractVersionDrift {
        installed: String!
        latest: String
        "UP_TO_DATE | BEHIND | AHEAD | UNKNOWN (latest version could not be looked up)."
        status: String!
    }

    type IntegrationOutboxHealth {
        eventType: String!
        pending: Int!
        failed: Int!
        oldestPendingAt: DateTime
        lastPublishedAt: DateTime
        lastError: String
        lastErrorAt: DateTime
    }

    type IntegrationStreamHealthReport {
        contractVersion: String!
        versionDrift: ContractVersionDrift!
        streams: [IntegrationStreamHealth!]!
    }

    type KafkaTopicLag {
        topic: String!
        stream: String!
        totalLag: String
        polledAt: DateTime!
        partitions: [KafkaTopicLagPartition!]!
    }

    "A product photo that is not downloaded yet (pending) or gave up (failed) — issue #181."
    type ProductPhoto implements Node {
        id: ID!
        updatedAt: DateTime!
        externalId: String!
        productExternalId: String!
        position: Int!
        status: String!
        lastError: String
        replayAttempts: Int!
        lastReplayAt: DateTime
    }

    type ProductPhotoList implements PaginatedList {
        items: [ProductPhoto!]!
        totalItems: Int!
    }

    input ProductPhotoFilterParameter {
        externalId: StringOperators
        productExternalId: StringOperators
        status: StringOperators
    }

    input ProductPhotoSortParameter {
        externalId: SortOrder
        productExternalId: SortOrder
        status: SortOrder
        updatedAt: SortOrder
        replayAttempts: SortOrder
    }

    input ProductPhotoListOptions {
        skip: Int
        take: Int
        sort: ProductPhotoSortParameter
        filter: ProductPhotoFilterParameter
        filterOperator: LogicalOperator
    }

    extend type Query {
        "Product photos still pending or failed, newest first (issue #181)."
        problemProductPhotos(options: ProductPhotoListOptions): ProductPhotoList!
        "Dead-lettered inbound Kafka events, newest first — for the manager-portal dashboard's integration-health panel (issue #76)."
        failedIntegrationInboxEvents(
            options: FailedIntegrationInboxEventListOptions
        ): FailedIntegrationInboxEventList!
        "Non-blocking VAT-code review flags raised while importing products, newest first (issue #79)."
        recentProductTaxCodeFlags(options: ProductTaxCodeFlagListOptions): ProductTaxCodeFlagList!
        "Open entity-completeness discrepancies against Integration Service's reconciliation summary (issue #84), newest first."
        openErpReconciliationIssues(
            options: OpenErpReconciliationIssueListOptions
        ): ErpReconciliationIssueList!
        "Per-topic/per-partition Kafka consumer lag for every inbound ERP stream (issue #91), as of the last scheduled poll."
        kafkaConsumerLag: [KafkaTopicLag!]!
        "Live count of not-yet-fully-processed IntegrationInboxEvent rows per stream (pending/processing/failed) — a different number from Kafka lag: these rows were already consumed and committed, this is Postgres-side processing backlog."
        integrationInboxBacklog: [IntegrationInboxBacklogByStream!]!
        "One row per stream: union of the event contract, configured topics and inbox rows, with Kafka lag, inbox backlog and drift (issue #195)."
        integrationStreamHealth: IntegrationStreamHealthReport!
        "Outbound events written to the outbox per event type: not yet published, dead-lettered, oldest pending age, last error."
        integrationOutboxHealth: [IntegrationOutboxHealth!]!
    }

    extend type Mutation {
        "Asks Integration Service to re-publish one photo (fresh download link) and resets its attempt counter (issue #181)."
        replayProductPhoto(id: ID!): ProductPhoto!
        "Manually runs the reconciliation comparison against Integration Service immediately, instead of waiting for the daily ScheduledTask (issue #84) — same ReconciliationService.runComparison the scheduled run uses, recorded with triggeredBy='manual' and the calling administrator's id."
        runErpReconciliation: ErpReconciliationRunResult!
        "Marks an open ErpReconciliationIssue as resolved by a human, with a required free-text resolution note — never auto-resolved."
        resolveErpReconciliationIssue(id: ID!, resolution: String!): ErpReconciliationIssue!
        "Returns outbox rows that gave up publishing (status failed) to pending so the next sweep retries them. Returns how many moved (issue #200)."
        requeueFailedIntegrationOutbox(ids: [ID!]!): Int!
        "Rebuilds the event of a skipped outbox row from its source data. Returns queued, still-skipped (reason updated) or already-sent (issue #200)."
        rebuildSkippedIntegrationOutbox(id: ID!): String!
    }
`;
