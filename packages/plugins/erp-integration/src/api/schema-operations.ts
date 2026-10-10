// GraphQL SDL fragment of the admin API extension (combined in admin.schema.ts).
export const operations = `
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
        "How many variants reference a unit that has not arrived (soft link, issue #200)."
        variantUnitHealth: VariantUnitHealth!
        "Orders currently refused by the ERP (Order.customFields.erpStatus = REJECTED), issue #204."
        rejectedOrderCount: Int!
        "Failed and no-op inbox rows, newest first, server-side filtered/sorted/paginated (issue #200)."
        integrationInboxIssues(
            options: IntegrationInboxIssueListOptions
        ): IntegrationInboxIssueList!
        "Failed and skipped outbox rows, newest first, server-side filtered/sorted/paginated (issue #200)."
        integrationOutboxProblems(
            options: IntegrationOutboxProblemListOptions
        ): IntegrationOutboxProblemList!
    }

    extend type Mutation {
        "Asks Integration Service to re-publish dead-lettered inbox entities (1 to 100 row ids); replayed rows become resolved. Needs RecoverIntegrationEvents."
        replayFailedIntegrationInbox(ids: [ID!]!): [IntegrationInboxReplayResult!]!
        "Resolves a failed inbox row that can never be replayed (e.g. undecodable, no entity id) with a required reason; the row leaves the failures list permanently. Needs RecoverIntegrationEvents."
        dismissFailedIntegrationInbox(id: ID!, reason: String!): Boolean!
        "Asks Integration Service to re-publish one photo (fresh download link) and resets its attempt counter (issue #181)."
        replayProductPhoto(id: ID!): ProductPhoto!
        "Manually runs the reconciliation comparison against Integration Service immediately, instead of waiting for the daily ScheduledTask (issue #84) — same ReconciliationService.runComparison the scheduled run uses, recorded with triggeredBy='manual' and the calling administrator's id."
        runErpReconciliation: ErpReconciliationRunResult!
        "Marks an open ErpReconciliationIssue as resolved by a human, with a required free-text resolution note — never auto-resolved."
        resolveErpReconciliationIssue(id: ID!, resolution: String!): ErpReconciliationIssue!
        "Returns outbox rows that gave up publishing (status failed) to pending so the next sweep retries them. Returns how many moved (issue #200)."
        requeueFailedIntegrationOutbox(ids: [ID!]!): Int!
        "Rebuilds the event of a skipped outbox row from its source data (issue #200)."
        rebuildSkippedIntegrationOutbox(id: ID!): RebuildSkippedOutcome!
    }
`;
