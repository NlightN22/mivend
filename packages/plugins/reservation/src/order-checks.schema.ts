import gql from 'graphql-tag';

export const adminOrderChecksSchema = gql`
    extend type Mutation {
        "Recomputes the ERP-requirement checks of one visible order and returns its stored results (#237). Needs ReadCheckResults."
        recomputeOrderChecks(orderId: ID!): [CheckResult!]!
    }
`;
