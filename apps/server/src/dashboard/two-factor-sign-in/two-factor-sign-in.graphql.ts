import { graphql } from '@vendure/dashboard';

export const startSignInDocument = graphql(`
    mutation DashboardStartTwoFactorSignIn($username: String!, $password: String!) {
        startTwoFactorSignIn(username: $username, password: $password) {
            __typename
            ... on TwoFactorChallenge {
                stage
                challenge
            }
            ... on TwoFactorError {
                failure
            }
        }
    }
`);

export const startEnrolmentDocument = graphql(`
    mutation DashboardStartTwoFactorEnrolment($challenge: String) {
        startTwoFactorEnrolment(challenge: $challenge) {
            __typename
            ... on TwoFactorEnrolment {
                otpauthUri
                secret
                expiresAt
            }
            ... on TwoFactorError {
                failure
            }
        }
    }
`);

export const authenticateDocument = graphql(`
    mutation DashboardAuthenticateTwoFactor($challenge: String!, $code: String!) {
        authenticate(input: { twoFactor: { challenge: $challenge, code: $code } }) {
            __typename
            ... on InvalidCredentialsError {
                authenticationError
            }
        }
    }
`);

export const requestRecoveryDocument = graphql(`
    mutation DashboardRequestTwoFactorRecovery($challenge: String!) {
        requestTwoFactorRecovery(challenge: $challenge) {
            __typename
            ... on TwoFactorRecoveryRequested {
                maskedEmailAddress
            }
            ... on TwoFactorError {
                failure
            }
        }
    }
`);

export const plainLoginDocument = graphql(`
    mutation DashboardPlainLogin($username: String!, $password: String!) {
        login(username: $username, password: $password) {
            __typename
        }
    }
`);
