import gql from 'graphql-tag';
import { DocumentNode } from 'graphql';

// Same document for the shop and admin APIs; contract in docs/two-factor.md.
export const twoFactorSchema: DocumentNode = gql`
    enum TwoFactorStage {
        NONE
        VERIFY
        ENROL
    }

    enum TwoFactorFailure {
        INVALID_CREDENTIALS
        CHALLENGE_INVALID
        INVALID_CODE
        PASSWORD_INVALID
        CODE_REQUIRED
        NOT_ENROLLED
        ENROLMENT_EXPIRED
        RECOVERY_LINK_INVALID
    }

    type TwoFactorError implements ErrorResult {
        errorCode: ErrorCode!
        message: String!
        failure: TwoFactorFailure!
    }

    type TwoFactorChallenge {
        stage: TwoFactorStage!
        challenge: String
        expiresAt: DateTime
    }

    type TwoFactorEnrolment {
        otpauthUri: String!
        secret: String!
        expiresAt: DateTime!
    }

    type TwoFactorStatus {
        required: Boolean!
        enrolled: Boolean!
        method: String
        activatedAt: DateTime
        pendingEnrolment: Boolean!
    }

    union StartTwoFactorSignInResult = TwoFactorChallenge | TwoFactorError
    union StartTwoFactorEnrolmentResult = TwoFactorEnrolment | TwoFactorError
    union ConfirmTwoFactorEnrolmentResult = TwoFactorStatus | TwoFactorError
    union CompleteTwoFactorRecoveryResult = TwoFactorChallenge | TwoFactorError

    extend type Query {
        twoFactorRequired: Boolean!
        twoFactorStatus: TwoFactorStatus!
    }

    extend type Mutation {
        startTwoFactorSignIn(username: String!, password: String!): StartTwoFactorSignInResult!
        startTwoFactorEnrolment(
            challenge: String
            password: String
            currentCode: String
        ): StartTwoFactorEnrolmentResult!
        confirmTwoFactorEnrolment(code: String!): ConfirmTwoFactorEnrolmentResult!
        requestTwoFactorRecovery(emailAddress: String!): Success!
        completeTwoFactorRecovery(
            token: String!
            password: String!
        ): CompleteTwoFactorRecoveryResult!
    }
`;
