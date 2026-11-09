import gql from 'graphql-tag';

export const oidcSchema = gql`
    type OidcSignInInfo {
        host: String!
        iconUrl: String!
    }

    type OidcSignInStart {
        authorizationUrl: String!
    }

    extend type Query {
        oidcSignIn: OidcSignInInfo
    }

    extend type Mutation {
        startOidcSignIn: OidcSignInStart!
        completeOidcSignIn(code: String!, state: String!): Boolean!
        prepareOidcSignOut: String
    }
`;
