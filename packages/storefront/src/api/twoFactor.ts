import type {
    CodeResult,
    ConfirmResult,
    EnrolmentResult,
    TwoFactorFailure,
    TwoFactorRecoveryApi,
    TwoFactorSettingsApi,
    TwoFactorSignInApi,
    TwoFactorStatusView,
} from '@mivend/ui-kit';
import { authenticationErrorToFailure } from '@mivend/ui-kit';
import { shopApi } from './client';
import {
    AuthenticateTwoFactorDocument,
    CompleteTwoFactorRecoveryDocument,
    ConfirmTwoFactorEnrolmentDocument,
    RequestTwoFactorRecoveryDocument,
    StartTwoFactorEnrolmentDocument,
    StartTwoFactorSignInDocument,
    TwoFactorStatusDocument,
} from './generated/graphql';

type Enrolment = { otpauthUri: string; secret: string; expiresAt: string };
type WithFailure = { __typename?: string; failure?: unknown };

function failure(result: WithFailure): { kind: 'failure'; failure: TwoFactorFailure } {
    return { kind: 'failure', failure: String(result.failure) as TwoFactorFailure };
}

function enrolmentResult(result: WithFailure & Partial<Enrolment>): EnrolmentResult {
    if (result.__typename === 'TwoFactorEnrolment') {
        const { otpauthUri = '', secret = '', expiresAt = '' } = result;
        return { kind: 'enrolment', enrolment: { otpauthUri, secret, expiresAt } };
    }
    return failure(result);
}

export function createSignInApi(deps: {
    plainLogin: TwoFactorSignInApi['plainLogin'];
    onSession: () => Promise<void>;
}): TwoFactorSignInApi {
    return {
        plainLogin: deps.plainLogin,
        async start(username, password) {
            const { startTwoFactorSignIn: r } = await shopApi(StartTwoFactorSignInDocument, {
                username,
                password,
            });
            if (r.__typename !== 'TwoFactorChallenge') return failure(r);
            const stage = String(r.stage);
            if (stage === 'NONE' || !r.challenge) return { kind: 'none' };
            return {
                kind: 'challenge',
                stage: stage === 'ENROL' ? 'ENROL' : 'VERIFY',
                challenge: r.challenge,
            };
        },
        async authenticate(challenge, code, rememberMe): Promise<CodeResult> {
            const { authenticate: r } = await shopApi(AuthenticateTwoFactorDocument, {
                challenge,
                code,
                rememberMe,
            });
            if (r.__typename === 'CurrentUser') {
                await deps.onSession();
                return { kind: 'ok' };
            }
            const error = 'authenticationError' in r ? r.authenticationError : '';
            return { kind: 'failure', failure: authenticationErrorToFailure(error) };
        },
        async startEnrolment(challenge) {
            const { startTwoFactorEnrolment: r } = await shopApi(StartTwoFactorEnrolmentDocument, {
                challenge,
            });
            return enrolmentResult(r);
        },
        async requestRecovery(emailAddress) {
            await shopApi(RequestTwoFactorRecoveryDocument, { emailAddress });
        },
    };
}

export const twoFactorSettingsApi: TwoFactorSettingsApi = {
    async status() {
        const { twoFactorStatus: s } = await shopApi(TwoFactorStatusDocument);
        return { ...s, activatedAt: s.activatedAt ?? null };
    },
    async startEnrolment(password, currentCode) {
        const { startTwoFactorEnrolment: r } = await shopApi(StartTwoFactorEnrolmentDocument, {
            password,
            currentCode,
        });
        return enrolmentResult(r);
    },
    async confirm(code): Promise<ConfirmResult> {
        const { confirmTwoFactorEnrolment: r } = await shopApi(ConfirmTwoFactorEnrolmentDocument, {
            code,
        });
        if (r.__typename === 'TwoFactorStatus') {
            const status: TwoFactorStatusView = {
                required: r.required,
                enrolled: r.enrolled,
                activatedAt: r.activatedAt ?? null,
                pendingEnrolment: r.pendingEnrolment,
            };
            return { kind: 'status', status };
        }
        return failure(r);
    },
};

export const twoFactorRecoveryApi: TwoFactorRecoveryApi = {
    async complete(token, password) {
        const { completeTwoFactorRecovery: r } = await shopApi(CompleteTwoFactorRecoveryDocument, {
            token,
            password,
        });
        return r.__typename === 'TwoFactorError' ? failure(r).failure : 'ok';
    },
};
