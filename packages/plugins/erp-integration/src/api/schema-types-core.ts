// GraphQL SDL fragment of the admin API extension (combined in admin.schema.ts).
export const coreTypes = `
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

`;
