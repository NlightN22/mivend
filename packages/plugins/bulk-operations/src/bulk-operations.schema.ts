import type { DocumentNode } from 'graphql';
import gql from 'graphql-tag';

export const adminApiSchema: DocumentNode = gql`
    type BulkOperation {
        type: String!
        title: String!
        description: String!
        area: String!
        undoable: Boolean!
        supportsMatching: Boolean!
        maxRecords: Int!
    }

    type BulkBatch {
        uuid: String!
        number: String!
        operationType: String!
        parameters: JSON!
        status: String!
        createdById: String!
        createdByName: String
        undoOfUuid: String
        totalCount: Int!
        appliedCount: Int!
        skippedCount: Int!
        failedCount: Int!
        startedAt: DateTime
        finishedAt: DateTime
        createdAt: DateTime!
        errorMessage: String
        undoable: Boolean!
    }

    type BulkBatchItem {
        targetId: String!
        label: String
        previewOutcome: String!
        previewReasonCode: String
        outcome: String
        reasonCode: String
        message: String
    }

    type BulkBatchList {
        items: [BulkBatch!]!
        totalItems: Int!
    }

    type BulkBatchItemList {
        items: [BulkBatchItem!]!
        totalItems: Int!
    }

    input BulkBatchSort {
        field: String!
        direction: String!
    }

    input BulkBatchFilter {
        operationType: String
        status: String
        createdById: String
        numberPrefix: String
        createdFrom: DateTime
        createdTo: DateTime
    }

    input BulkBatchListOptions {
        take: Int
        skip: Int
        sort: BulkBatchSort
        filter: BulkBatchFilter
    }

    input BulkBatchItemListOptions {
        take: Int
        skip: Int
        outcome: String
    }

    "Exactly one of ids or matching; matching is the list filter the server resolves itself, inside the caller's scope"
    input BulkSelectionInput {
        ids: [String!]
        matching: JSON
    }

    extend type Query {
        bulkOperationCatalog: [BulkOperation!]!
        bulkBatches(options: BulkBatchListOptions): BulkBatchList!
        bulkBatch(uuid: String!): BulkBatch!
        bulkBatchItems(uuid: String!, options: BulkBatchItemListOptions): BulkBatchItemList!
    }

    extend type Mutation {
        previewBulkBatch(
            type: String!
            parameters: JSON
            selection: BulkSelectionInput!
        ): BulkBatch!
        runBulkBatch(uuid: String!): BulkBatch!
        undoBulkBatch(uuid: String!): BulkBatch!
    }
`;
