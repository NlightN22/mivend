import gql from 'graphql-tag';

export const oidcSchema = gql`
    enum OidcSignInResult {
        OK
        FAILED
        EMAIL_NOT_VERIFIED
    }

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
        completeOidcSignIn(code: String!, state: String!): OidcSignInResult!
        prepareOidcSignOut: String
    }
`;
