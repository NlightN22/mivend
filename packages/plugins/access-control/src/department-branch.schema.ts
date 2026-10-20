import type { DocumentNode } from 'graphql';
import gql from 'graphql-tag';

export const departmentBranchSdl: DocumentNode = gql`
    type DepartmentBranchNode {
        departmentErpId: String!
        name: String!
        parentErpId: String
        isActive: Boolean!
        ownBranchId: String
        effectiveBranchId: String
        inheritedFromErpId: String
        userCount: Int!
        counterpartyCount: Int!
    }

    extend type Query {
        departmentBranchOverview: [DepartmentBranchNode!]!
    }

    extend type Mutation {
        setDepartmentBranch(departmentErpId: String!, branchId: String!): Boolean!
        clearDepartmentBranch(departmentErpId: String!): Boolean!
        setCounterpartyBranchOverride(counterpartyId: ID!, branchId: String): Boolean!
    }
`;
