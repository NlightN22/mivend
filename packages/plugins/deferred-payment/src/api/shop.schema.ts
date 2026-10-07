import { gql } from 'graphql-tag';

export const shopApiExtensions = gql`
    type DeferredCreditPreview {
        exceeded: Boolean!
        availableCredit: Float!
        orderAmount: Float!
    }

    extend type Query {
        deferredCreditPreview: DeferredCreditPreview!
    }
`;
