import gql from 'graphql-tag';

export const changeJournalAdminSchema = gql`
    type ChangeJournalEntry {
        id: ID!
        occurredAt: DateTime!
        "administrator, customer, acting (a manager acting as the customer) or system"
        actorType: String!
        userId: ID
        administratorId: ID
        "API operation, REST route or scheduled task that made the change"
        source: String!
        requestId: String
        sessionId: String
        entityType: String!
        entityId: String!
        entityUuid: String
        "insert, update, soft-remove, recover or remove"
        action: String!
        "Field path to { before, after }; a secret field carries only { redacted: true }"
        changes: JSON!
    }

    type ChangeJournalPage {
        items: [ChangeJournalEntry!]!
        totalItems: Int!
    }

    input ChangeJournalFilter {
        entityType: String
        actorType: String
        userId: ID
        administratorId: ID
        occurredAfter: DateTime
        occurredBefore: DateTime
        action: String
        "Case-insensitive match on the changed fields and their values"
        search: String
    }

    extend type Query {
        changeJournalForEntity(
            entityType: String!
            entityId: ID!
            "Narrows the entity's entries; its entityType is ignored"
            filter: ChangeJournalFilter
            skip: Int
            take: Int
        ): ChangeJournalPage!
        changeJournal(filter: ChangeJournalFilter, skip: Int, take: Int): ChangeJournalPage!
    }
`;
