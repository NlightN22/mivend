import gql from 'graphql-tag';
import { DocumentNode } from 'graphql';

export const actingSessionAdminSchema: DocumentNode = gql`
    type ActingTicketStart {
        ticket: String!
        storefrontUrl: String!
        expiresAt: DateTime!
    }

    extend type Mutation {
        startActingSession(counterpartyId: ID!, tradingPointId: ID): ActingTicketStart!
    }
`;

export const actingSessionShopSchema: DocumentNode = gql`
    type ActingSessionToken {
        token: String!
        expiresAt: DateTime!
        administratorId: ID!
        administratorName: String!
        counterpartyId: ID!
        tradingPointId: ID
    }

    extend type Mutation {
        exchangeActingTicket(ticket: String!): ActingSessionToken!
        finishActingSession: Boolean!
    }
`;
