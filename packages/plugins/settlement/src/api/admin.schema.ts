import { gql } from 'graphql-tag';

export const adminApiExtensions = gql`
    "Overdue debt of one counterparty over all its customer contracts; oldestDays is null when no due date is known."
    type CounterpartyOverdue {
        amount: Money!
        currency: String!
        oldestDays: Int
    }

    extend type Query {
        counterpartyOverdue(counterpartyId: ID!): CounterpartyOverdue
    }
`;
