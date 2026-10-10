// GraphQL SDL fragment of the admin API extension (combined in admin.schema.ts).
export const reportTypes = `
    type VariantUnitHealth {
        "Variants that name a default sales unit."
        total: Int!
        "Of those, variants whose unit has not arrived on the unit stream (unit fields stay empty until it does)."
        unitMissing: Int!
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
        "Events that could not be built and were never published (issue #200)."
        skipped: Int!
        oldestPendingAt: DateTime
        lastPublishedAt: DateTime
        lastError: String
        lastErrorAt: DateTime
        lastSkipReason: String
        "contract = schema from the shared contract package, local = this plugin's own copy."
        schemaSource: String
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

`;
