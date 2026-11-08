import { api } from '@vendure/dashboard';

import {
    authenticationErrorToFailure,
    type EnrolmentResult,
    type TwoFactorFailure,
    type TwoFactorSignInApi,
} from '../../../../../packages/ui-kit/src/composables/twoFactor/twoFactorTypes';
import {
    authenticateDocument,
    plainLoginDocument,
    requestRecoveryDocument,
    startEnrolmentDocument,
    startSignInDocument,
} from './two-factor-sign-in.graphql';

type Failed = { kind: 'failure'; failure: TwoFactorFailure };

function failed(result: { failure?: unknown }): Failed {
    return { kind: 'failure', failure: String(result.failure) as TwoFactorFailure };
}

// api.mutate stores the returned vendure-auth-token itself, so a successful step needs no extra session code.
export const signInApi: TwoFactorSignInApi = {
    async start(username, password) {
        const { startTwoFactorSignIn: r } = await api.mutate(startSignInDocument)({
            username,
            password,
        });
        if (r.__typename !== 'TwoFactorChallenge') return failed(r);
        if (r.stage === 'NONE' || !r.challenge) return { kind: 'none' };
        return {
            kind: 'challenge',
            stage: r.stage === 'ENROL' ? 'ENROL' : 'VERIFY',
            challenge: r.challenge,
        };
    },
    async plainLogin(username, password) {
        const { login } = await api.mutate(plainLoginDocument)({ username, password });
        return login.__typename === 'CurrentUser';
    },
    async authenticate(challenge, code) {
        const { authenticate: r } = await api.mutate(authenticateDocument)({ challenge, code });
        if (r.__typename === 'CurrentUser') return { kind: 'ok' };
        const error = 'authenticationError' in r ? r.authenticationError : '';
        return { kind: 'failure', failure: authenticationErrorToFailure(error) };
    },
    async startEnrolment(challenge): Promise<EnrolmentResult> {
        const { startTwoFactorEnrolment: r } = await api.mutate(startEnrolmentDocument)({
            challenge,
        });
        if (r.__typename !== 'TwoFactorEnrolment') return failed(r);
        return {
            kind: 'enrolment',
            enrolment: {
                otpauthUri: r.otpauthUri,
                secret: r.secret,
                expiresAt: String(r.expiresAt),
            },
        };
    },
    async requestRecovery(challenge) {
        const { requestTwoFactorRecovery: r } = await api.mutate(requestRecoveryDocument)({
            challenge,
        });
        return r.__typename === 'TwoFactorRecoveryRequested'
            ? { kind: 'sent', maskedEmailAddress: r.maskedEmailAddress }
            : failed(r);
    },
};
