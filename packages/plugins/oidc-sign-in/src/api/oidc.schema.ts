import gql from 'graphql-tag';

export const oidcSchema = gql`
    type OidcSignInStart {
        authorizationUrl: String!
    }

    extend type Query {
        oidcSignInEnabled: Boolean!
    }

    extend type Mutation {
        startOidcSignIn: OidcSignInStart!
        completeOidcSignIn(code: String!, state: String!): Boolean!
    }
`;
