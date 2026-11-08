import { describe, expect, it, vi } from 'vitest';

import type {
    CodeResult,
    EnrolmentResult,
    RecoveryRequestResult,
    StartResult,
    TwoFactorSignInApi,
} from '../../../../../../../packages/ui-kit/src/composables/twoFactor/twoFactorTypes';
import { createSignInFlow, type SignInFlow } from '../../two-factor-sign-in-flow';

const ENROLMENT = { otpauthUri: 'otpauth://totp/x', secret: 'ABCD', expiresAt: '2030-01-01' };

function build(overrides: Partial<TwoFactorSignInApi> = {}): {
    api: TwoFactorSignInApi;
    flow: SignInFlow;
} {
    const api: TwoFactorSignInApi = {
        start: vi.fn(
            async (): Promise<StartResult> => ({
                kind: 'challenge',
                stage: 'VERIFY',
                challenge: 'c1',
            }),
        ),
        plainLogin: vi.fn(async () => true),
        authenticate: vi.fn(async (): Promise<CodeResult> => ({ kind: 'ok' })),
        startEnrolment: vi.fn(
            async (): Promise<EnrolmentResult> => ({ kind: 'enrolment', enrolment: ENROLMENT }),
        ),
        requestRecovery: vi.fn(
            async (): Promise<RecoveryRequestResult> => ({
                kind: 'sent',
                maskedEmailAddress: 'j***@example.org',
            }),
        ),
        ...overrides,
    };
    return { api, flow: createSignInFlow(api) };
}

describe('dashboard sign-in flow', () => {
    it('asks for the code after the password and finishes after a right code', async () => {
        const { api, flow } = build();
        await flow.submitPassword('a@example.org', 'pw');
        expect(flow.getState().step).toBe('verify');
        await flow.submitCode(' 123 456 ');
        expect(api.authenticate).toHaveBeenCalledWith('c1', '123456', false);
        expect(flow.getState().step).toBe('done');
    });

    it('goes straight to enrolment and loads the secret when the account has no factor', async () => {
        const { api, flow } = build({
            start: vi.fn(
                async (): Promise<StartResult> => ({
                    kind: 'challenge',
                    stage: 'ENROL',
                    challenge: 'c2',
                }),
            ),
        });
        await flow.submitPassword('a@example.org', 'pw');
        expect(api.startEnrolment).toHaveBeenCalledWith('c2');
        expect(flow.getState()).toMatchObject({ step: 'enrol', enrolment: ENROLMENT });
        await flow.submitCode('654321');
        expect(flow.getState().step).toBe('done');
    });

    it('falls back to the plain login when no second step applies', async () => {
        const { api, flow } = build({
            start: vi.fn(async (): Promise<StartResult> => ({ kind: 'none' })),
        });
        await flow.submitPassword('a@example.org', 'pw');
        expect(api.plainLogin).toHaveBeenCalledWith('a@example.org', 'pw', false);
        expect(flow.getState().step).toBe('done');
    });

    it('stays on the password step with an error for wrong credentials', async () => {
        const { flow } = build({
            start: vi.fn(
                async (): Promise<StartResult> => ({
                    kind: 'failure',
                    failure: 'INVALID_CREDENTIALS',
                }),
            ),
        });
        await flow.submitPassword('a@example.org', 'bad');
        expect(flow.getState()).toMatchObject({ step: 'password', error: 'INVALID_CREDENTIALS' });
    });

    it('keeps the code step on a wrong code so the same challenge can be retried', async () => {
        const { flow } = build({
            authenticate: vi.fn(
                async (): Promise<CodeResult> => ({ kind: 'failure', failure: 'INVALID_CODE' }),
            ),
        });
        await flow.submitPassword('a@example.org', 'pw');
        await flow.submitCode('000000');
        expect(flow.getState()).toMatchObject({ step: 'verify', error: 'INVALID_CODE' });
    });

    it('returns to the password when the challenge is no longer valid', async () => {
        const { flow } = build({
            authenticate: vi.fn(
                async (): Promise<CodeResult> => ({
                    kind: 'failure',
                    failure: 'CHALLENGE_INVALID',
                }),
            ),
        });
        await flow.submitPassword('a@example.org', 'pw');
        await flow.submitCode('000000');
        expect(flow.getState()).toMatchObject({
            step: 'password',
            error: 'CHALLENGE_INVALID',
            enrolment: null,
        });
    });

    it('reloads the secret when the enrolment expired', async () => {
        const { api, flow } = build({
            start: vi.fn(
                async (): Promise<StartResult> => ({
                    kind: 'challenge',
                    stage: 'ENROL',
                    challenge: 'c2',
                }),
            ),
            authenticate: vi.fn(
                async (): Promise<CodeResult> => ({
                    kind: 'failure',
                    failure: 'ENROLMENT_EXPIRED',
                }),
            ),
        });
        await flow.submitPassword('a@example.org', 'pw');
        await flow.submitCode('000000');
        expect(api.startEnrolment).toHaveBeenCalledTimes(2);
        expect(flow.getState()).toMatchObject({ step: 'enrol', error: 'ENROLMENT_EXPIRED' });
    });

    it('sends one recovery request and shows the masked address', async () => {
        const { api, flow } = build();
        await flow.submitPassword('a@example.org', 'pw');
        await flow.requestRecovery();
        expect(api.requestRecovery).toHaveBeenCalledTimes(1);
        expect(api.requestRecovery).toHaveBeenCalledWith('c1');
        expect(flow.getState()).toMatchObject({
            step: 'recovery-sent',
            maskedEmail: 'j***@example.org',
        });
        flow.backToCode();
        expect(flow.getState().step).toBe('verify');
    });

    it('maps a thrown request to UNKNOWN and ignores a second submit while loading', async () => {
        let release: () => void = () => {};
        const start = vi.fn(
            () =>
                new Promise<StartResult>((_, reject) => {
                    release = () => reject(new Error('network'));
                }),
        );
        const { flow } = build({ start });
        const first = flow.submitPassword('a@example.org', 'pw');
        await flow.submitPassword('a@example.org', 'pw');
        expect(start).toHaveBeenCalledTimes(1);
        release();
        await first;
        expect(flow.getState()).toMatchObject({
            step: 'password',
            error: 'UNKNOWN',
            loading: false,
        });
    });

    it('notifies subscribers and stops after unsubscribe', async () => {
        const { flow } = build();
        const listener = vi.fn();
        const off = flow.subscribe(listener);
        await flow.submitPassword('a@example.org', 'pw');
        const calls = listener.mock.calls.length;
        expect(calls).toBeGreaterThan(0);
        off();
        flow.back();
        expect(listener).toHaveBeenCalledTimes(calls);
    });
});
