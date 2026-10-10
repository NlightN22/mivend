// GraphQL SDL fragment of the admin API extension (combined in admin.schema.ts).
export const healthTypes = `
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
        "Failed rows whose replay was requested and that wait for the replayed event to be processed."
        replayPending: Int!
        oldestPendingAt: DateTime
        "Messages the handler deliberately did nothing for in the last 24 h (issue #200)."
        noop24h: Int!
        lastNoopReason: String
    }

    "Result of rebuilding a skipped outbox row: event queued, still skipped (reason updated) or already sent."
    enum RebuildSkippedOutcome {
        QUEUED
        STILL_SKIPPED
        ALREADY_SENT
    }

`;
