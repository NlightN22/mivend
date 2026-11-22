// GraphQL SDL fragment of the admin API extension (combined in admin.schema.ts).
export const healthTypes = `
    type ExchangeStream {
        stream: String!
        entityType: String!
        "OK | DEGRADED | DOWN"
        status: String!
        lastActivityAt: String
        "Ingest/pull: rows or commands pending. Ack: commands delivered and not yet acknowledged."
        pending: Int
        oldestAgeSeconds: Int
        "Ingest: failed inbox rows. Ack: commands the ERP rejected. Pull: null."
        failedLast24h: Int
    }

    type ExchangeChannel {
        "ingest | pull | ack"
        channel: String!
        status: String!
        lastActivityAt: String
        streams: [ExchangeStream!]!
    }

    type ExchangePublishAggregate {
        "The published entity (outbox aggregate type)."
        aggregateType: String!
        status: String!
        mappingErrorsLast24h: Int
        mappingErrorCodes: [String!]!
        deadLetteredLast24h: Int
        pending: Int
        oldestPendingAgeSeconds: Int
        lastPublishedAt: String
    }

    type ExchangePublishChannel {
        status: String!
        lastActivityAt: String
        aggregates: [ExchangePublishAggregate!]!
    }

    type ExchangeMappingError {
        "The stream the problem belongs to."
        kind: String!
        code: String!
        message: String!
        occurrences: Int
        lastSeenAt: String
    }

    type ExchangeFailures {
        status: String!
        inboxFailedLast24h: Int
        outboxFailedLast24h: Int
        outboundRejectedLast24h: Int
    }

    type ExchangeResyncSignal {
        id: String!
        stream: String!
        dryRun: Boolean!
        status: String!
        createdAt: String!
    }

    type ExchangeResync {
        pending: Int
        delivered: Int
        acknowledgedLast24h: Int
        rejectedLast24h: Int
        open: [ExchangeResyncSignal!]!
    }

    type ExchangeHealth {
        generatedAt: String!
        status: String!
        channels: [ExchangeChannel!]!
        "Null when the Integration Service does not report the publish channel (older version)."
        publish: ExchangePublishChannel
        "Active mapping errors, read only while the publish channel is not OK."
        mappingErrors: [ExchangeMappingError!]!
        failures: ExchangeFailures!
        resync: ExchangeResync!
    }

    type ExchangeHealthReport {
        "OK | DEGRADED | DOWN | UNKNOWN"
        state: String!
        "Set only when state is UNKNOWN: NOT_CONFIGURED | UNAUTHORIZED | TIMEOUT | UNREACHABLE | SERVER_ERROR | BAD_RESPONSE | NEVER_POLLED | STALE"
        reason: String
        polledAt: DateTime
        health: ExchangeHealth
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
        dependencyMissing: Int!
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
        "Rows parked because a referenced entity has not arrived yet; retried automatically, not an alert."
        dependencyMissing: Int!
        "Failed rows whose replay was requested and that wait for the replayed event to be processed."
        replayPending: Int!
        oldestPendingAt: DateTime
        "Messages the handler deliberately did nothing for in the last 24 h (issue #200)."
        noop24h: Int!
        lastNoopReason: String
        "Applied messages whose contact step was rolled back in the last 24 h (issue #332); re-seed or resume the stream from the ERP side, or wait for the entity's next event."
        contactFailures24h: Int!
        lastContactFailure: String
    }

    "Result of rebuilding a skipped outbox row: event queued, still skipped (reason updated) or already sent."
    enum RebuildSkippedOutcome {
        QUEUED
        STILL_SKIPPED
        ALREADY_SENT
    }

`;
