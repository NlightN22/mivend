export const consistencyTypes = `
    type ConsistencyReport {
        id: ID!
        uuid: String!
        number: Int!
        source: String!
        providerIssueId: String!
        type: String!
        severity: String!
        entityType: String!
        entityId: String!
        scope: JSON!
        expected: JSON
        actual: JSON
        details: String!
        replayable: Boolean!
        occurrences: Int!
        firstDetectedAt: DateTime!
        lastDetectedAt: DateTime!
        resolvedAt: DateTime
        status: String!
    }

    type ConsistencyReportList {
        items: [ConsistencyReport!]!
        totalItems: Int!
    }

    input ConsistencyReportListOptions {
        take: Int
        skip: Int
        source: String
        status: String
        type: String
        severity: String
        entityType: String
    }

    type ConsistencySource {
        source: String!
        health: String!
        healthDetail: String!
        summary: JSON
        lastFinishedAt: DateTime
        lastPolledAt: DateTime
        lastSuccessAt: DateTime
        localOpenByType: JSON!
        localOpenBySeverity: JSON!
    }

    extend type Query {
        "Collected data-drift reports from external systems, newest detection first (issue #303)."
        consistencyReports(options: ConsistencyReportListOptions): ConsistencyReportList!
        "Per-source health, last provider summary and local open counts (issue #303); empty when no source is configured."
        consistencySources: [ConsistencySource!]!
    }
`;
