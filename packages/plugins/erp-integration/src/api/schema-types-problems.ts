// GraphQL SDL fragment of the admin API extension (combined in admin.schema.ts).
export const problemTypes = `
    "Inbox row that needs attention: dead-lettered (failed) or recorded as a no-op. Never carries the payload."
    type IntegrationInboxIssue implements Node {
        id: ID!
        stream: String!
        entityId: String!
        status: String!
        attempts: Int!
        firstFailedAt: DateTime
        lastError: String
        updatedAt: DateTime!
        outcome: String
        outcomeReason: String
        "True when the row is failed and Integration Service can replay its entity."
        replayable: Boolean!
        "True when the row is failed and can be dismissed by a human (#212) — e.g. undecodable."
        dismissable: Boolean!
    }

    type IntegrationInboxIssueList implements PaginatedList {
        items: [IntegrationInboxIssue!]!
        totalItems: Int!
    }

    input IntegrationInboxIssueFilterParameter {
        stream: StringOperators
        entityId: StringOperators
        status: StringOperators
        outcome: StringOperators
        lastError: StringOperators
        outcomeReason: StringOperators
        _and: [IntegrationInboxIssueFilterParameter!]
        _or: [IntegrationInboxIssueFilterParameter!]
    }

    input IntegrationInboxIssueSortParameter {
        stream: SortOrder
        entityId: SortOrder
        status: SortOrder
        attempts: SortOrder
        firstFailedAt: SortOrder
        updatedAt: SortOrder
    }

    input IntegrationInboxIssueListOptions {
        skip: Int
        take: Int
        sort: IntegrationInboxIssueSortParameter
        filter: IntegrationInboxIssueFilterParameter
        filterOperator: LogicalOperator
    }

    "Outbox row that needs attention: failed (publish gave up) or skipped (event could not be built). Never carries the payload."
    type IntegrationOutboxProblem implements Node {
        id: ID!
        eventId: String!
        eventType: String!
        status: String!
        retryCount: Int!
        lastError: String
        lastErrorAt: DateTime
        firstFailedAt: DateTime
        nextRetryAt: DateTime
        createdAt: DateTime!
        "Identifier of what the event is about (the order id for order.submitted)."
        subjectId: String
    }

    type IntegrationOutboxProblemList implements PaginatedList {
        items: [IntegrationOutboxProblem!]!
        totalItems: Int!
    }

    input IntegrationOutboxProblemFilterParameter {
        eventType: StringOperators
        eventId: StringOperators
        status: StringOperators
        lastError: StringOperators
        _and: [IntegrationOutboxProblemFilterParameter!]
        _or: [IntegrationOutboxProblemFilterParameter!]
    }

    input IntegrationOutboxProblemSortParameter {
        eventType: SortOrder
        status: SortOrder
        retryCount: SortOrder
        lastErrorAt: SortOrder
        createdAt: SortOrder
    }

    input IntegrationOutboxProblemListOptions {
        skip: Int
        take: Int
        sort: IntegrationOutboxProblemSortParameter
        filter: IntegrationOutboxProblemFilterParameter
        filterOperator: LogicalOperator
    }

    enum InboxReplayOutcome {
        REPLAYED
        NOT_FOUND
        UNSUPPORTED
        NOT_FAILED
        FAILED
        "The message could not be decoded and has no entity id to replay — dismiss it instead."
        UNDECODABLE
    }

    type IntegrationInboxReplayResult {
        id: ID!
        stream: String!
        entityId: String!
        outcome: InboxReplayOutcome!
        message: String
    }

`;
