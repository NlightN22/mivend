import gql from 'graphql-tag';

export const myContractsSchema = gql`
    type ShopContract {
        id: ID!
        name: String
        currency: String
        "Whole currency units; the effective limit when computed, else the ERP limit."
        creditLimit: Float
        paymentDelayDays: Int
        debtDaysLimit: Int
    }

    extend type Query {
        myContracts: [ShopContract!]!
    }
`;
