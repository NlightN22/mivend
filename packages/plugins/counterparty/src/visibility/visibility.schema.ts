import type { DocumentNode } from 'graphql';
import gql from 'graphql-tag';

export const visibilitySchema: DocumentNode = gql`
    "A grant of one more manager's clients to an administrator; status is active | scheduled | expired | revoked."
    type VisibilityGrant {
        id: ID!
        uuid: String!
        granteeAdministratorId: ID!
        granteeName: String!
        managerAdministratorId: ID!
        managerName: String!
        subjectKind: String!
        validFrom: DateTime
        validTo: DateTime
        reason: String!
        grantedByAdministratorId: ID
        grantedByName: String
        revokedAt: DateTime
        revokedByAdministratorId: ID
        createdAt: DateTime!
        status: String!
    }

    type VisibilityGrantPage {
        items: [VisibilityGrant!]!
        totalItems: Int!
    }

    type VisibilityCandidate {
        id: ID!
        firstName: String!
        lastName: String!
    }

    type UnsortedAdministrator {
        id: ID!
        firstName: String!
        lastName: String!
        emailAddress: String!
        departmentId: String
        roleCodes: [String!]!
    }

    type UnsortedAdministratorPage {
        items: [UnsortedAdministrator!]!
        totalItems: Int!
    }

    type UnsortedCounterpartyPage {
        items: [Counterparty!]!
        totalItems: Int!
    }

    extend type Query {
        visibilityGrants(
            granteeAdministratorId: ID
            status: String
            search: String
            take: Int
            skip: Int
        ): VisibilityGrantPage!
        "Administrators the caller may pick in a grant: everyone for ManageAccessControl, else their team and granted managers."
        visibilityGrantCandidates: [VisibilityCandidate!]!
        unsortedCounterparties(take: Int, skip: Int, search: String): UnsortedCounterpartyPage!
        unsortedAdministrators(take: Int, skip: Int): UnsortedAdministratorPage!
    }

    extend type Mutation {
        grantManagerVisibility(
            granteeAdministratorId: ID!
            managerAdministratorId: ID!
            validFrom: DateTime
            validTo: DateTime
            reason: String!
        ): VisibilityGrant!
        revokeVisibilityGrant(id: ID!, reason: String): VisibilityGrant!
    }
`;
