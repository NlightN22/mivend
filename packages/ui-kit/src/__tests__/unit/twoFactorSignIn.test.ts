import { describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { useOtpAutoSubmit } from '../../composables/twoFactor/useOtpAutoSubmit';
import { useTwoFactorSignIn } from '../../composables/twoFactor/useTwoFactorSignIn';
import { useTwoFactorRecovery } from '../../composables/twoFactor/useTwoFactorRecovery';
import { useTwoFactorSettings } from '../../composables/twoFactor/useTwoFactorSettings';
import {
    authenticationErrorToFailure,
    isCompleteCode,
    normalizeCode,
    type TwoFactorEnrolment,
    type TwoFactorSignInApi,
} from '../../composables/twoFactor/twoFactorTypes';

const enrolment: TwoFactorEnrolment = {
    otpauthUri: 'otpauth://totp/x?secret=ABC',
    secret: 'ABC',
    expiresAt: '2030-01-01T00:00:00Z',
};

function makeApi(overrides: Partial<TwoFactorSignInApi> = {}): TwoFactorSignInApi {
    return {
        start: vi.fn().mockResolvedValue({ kind: 'challenge', stage: 'VERIFY', challenge: 'c1' }),
        plainLogin: vi.fn().mockResolvedValue(true),
        authenticate: vi.fn().mockResolvedValue({ kind: 'ok' }),
        startEnrolment: vi.fn().mockResolvedValue({ kind: 'enrolment', enrolment }),
        requestRecovery: vi
            .fn()
            .mockResolvedValue({ kind: 'sent', maskedEmailAddress: 'u***@example.test' }),
        ...overrides,
    };
}

describe('code and error mapping', () => {
    it('strips spaces and non-digits and caps at six', () => {
        expect(normalizeCode('12 34-56 78')).toBe('123456');
        expect(normalizeCode(' 123 456 ')).toBe('123456');
        expect(normalizeCode('abc')).toBe('');
        expect(isCompleteCode('12345')).toBe(false);
        expect(isCompleteCode('123 456')).toBe(true);
    });
    it('maps authenticationError values to failures', () => {
        expect(authenticationErrorToFailure('TWO_FACTOR_INVALID_CODE')).toBe('INVALID_CODE');
        expect(authenticationErrorToFailure('TWO_FACTOR_CHALLENGE_INVALID')).toBe(
            'CHALLENGE_INVALID',
        );
        expect(authenticationErrorToFailure('TWO_FACTOR_ENROLMENT_EXPIRED')).toBe(
            'ENROLMENT_EXPIRED',
        );
        expect(authenticationErrorToFailure('')).toBe('INVALID_CREDENTIALS');
    });
});

describe('useTwoFactorSignIn', () => {
    it('goes password -> verify -> done and sends the normalized code with the challenge', async () => {
        const api = makeApi();
        const flow = useTwoFactorSignIn(api);
        await flow.submitPassword('u', 'p', true);
        expect(flow.step.value).toBe('verify');
        await flow.submitCode('123 456');
        expect(api.authenticate).toHaveBeenCalledWith('c1', '123456', true);
        expect(flow.step.value).toBe('done');
    });

    it('enrolment stage loads the QR data before showing the step', async () => {
        const api = makeApi({
            start: vi
                .fn()
                .mockResolvedValue({ kind: 'challenge', stage: 'ENROL', challenge: 'c2' }),
        });
        const flow = useTwoFactorSignIn(api);
        await flow.submitPassword('u', 'p', false);
        expect(api.startEnrolment).toHaveBeenCalledWith('c2');
        expect(flow.step.value).toBe('enrol');
        expect(flow.enrolment.value).toEqual(enrolment);
    });

    it('stage NONE falls back to the plain login', async () => {
        const api = makeApi({ start: vi.fn().mockResolvedValue({ kind: 'none' }) });
        const flow = useTwoFactorSignIn(api);
        await flow.submitPassword('u', 'p', false);
        expect(api.plainLogin).toHaveBeenCalledWith('u', 'p', false);
        expect(flow.step.value).toBe('done');
    });

    it('wrong credentials stay on the password step', async () => {
        const api = makeApi({
            start: vi.fn().mockResolvedValue({ kind: 'failure', failure: 'INVALID_CREDENTIALS' }),
        });
        const flow = useTwoFactorSignIn(api);
        await flow.submitPassword('u', 'p', false);
        expect(flow.step.value).toBe('password');
        expect(flow.error.value).toBe('INVALID_CREDENTIALS');
    });

    it('a wrong code keeps the code step so the challenge can be retried', async () => {
        const api = makeApi({
            authenticate: vi.fn().mockResolvedValue({ kind: 'failure', failure: 'INVALID_CODE' }),
        });
        const flow = useTwoFactorSignIn(api);
        await flow.submitPassword('u', 'p', false);
        await flow.submitCode('000000');
        expect(flow.step.value).toBe('verify');
        expect(flow.error.value).toBe('INVALID_CODE');
    });

    it('a dead challenge returns to the password step', async () => {
        const api = makeApi({
            authenticate: vi
                .fn()
                .mockResolvedValue({ kind: 'failure', failure: 'CHALLENGE_INVALID' }),
        });
        const flow = useTwoFactorSignIn(api);
        await flow.submitPassword('u', 'p', false);
        await flow.submitCode('000000');
        expect(flow.step.value).toBe('password');
        expect(flow.error.value).toBe('CHALLENGE_INVALID');
    });

    it('an expired enrolment is restarted on the same step', async () => {
        const api = makeApi({
            start: vi
                .fn()
                .mockResolvedValue({ kind: 'challenge', stage: 'ENROL', challenge: 'c2' }),
            authenticate: vi
                .fn()
                .mockResolvedValue({ kind: 'failure', failure: 'ENROLMENT_EXPIRED' }),
        });
        const flow = useTwoFactorSignIn(api);
        await flow.submitPassword('u', 'p', false);
        await flow.submitCode('123456');
        expect(api.startEnrolment).toHaveBeenCalledTimes(2);
        expect(flow.step.value).toBe('enrol');
        expect(flow.error.value).toBe('ENROLMENT_EXPIRED');
    });

    it('lost access sends the link at once for the challenge and shows the masked address', async () => {
        const api = makeApi();
        const flow = useTwoFactorSignIn(api);
        await flow.submitPassword('u', 'p', false);
        await flow.requestRecovery();
        expect(api.requestRecovery).toHaveBeenCalledWith('c1');
        expect(flow.step.value).toBe('recovery-sent');
        expect(flow.maskedEmail.value).toBe('u***@example.test');
        flow.backToCode();
        expect(flow.step.value).toBe('verify');
        await flow.submitCode('123456');
        expect(api.authenticate).toHaveBeenCalledWith('c1', '123456', false);
    });

    it('a dead challenge on the recovery request returns to the password step', async () => {
        const api = makeApi({
            requestRecovery: vi
                .fn()
                .mockResolvedValue({ kind: 'failure', failure: 'CHALLENGE_INVALID' }),
        });
        const flow = useTwoFactorSignIn(api);
        await flow.submitPassword('u', 'p', false);
        await flow.requestRecovery();
        expect(flow.step.value).toBe('password');
        expect(flow.error.value).toBe('CHALLENGE_INVALID');
    });

    it('a thrown request becomes UNKNOWN and does not advance', async () => {
        const api = makeApi({ start: vi.fn().mockRejectedValue(new Error('offline')) });
        const flow = useTwoFactorSignIn(api);
        await flow.submitPassword('u', 'p', false);
        expect(flow.step.value).toBe('password');
        expect(flow.error.value).toBe('UNKNOWN');
        expect(flow.loading.value).toBe(false);
    });

    it('ignores a second submit while one is in flight', async () => {
        let release: (v: { kind: 'ok' }) => void = () => undefined;
        const api = makeApi({
            authenticate: vi.fn().mockReturnValue(new Promise(r => (release = r))),
        });
        const flow = useTwoFactorSignIn(api);
        await flow.submitPassword('u', 'p', false);
        const first = flow.submitCode('123456');
        await flow.submitCode('123456');
        release({ kind: 'ok' });
        await first;
        expect(api.authenticate).toHaveBeenCalledTimes(1);
    });
});

describe('useTwoFactorRecovery', () => {
    it('is invalid without a token and never calls the API', async () => {
        const complete = vi.fn();
        const r = useTwoFactorRecovery('', { complete });
        expect(r.view.value).toBe('invalid');
        await r.submit('pw');
        expect(complete).not.toHaveBeenCalled();
    });
    it('keeps the form on a wrong password and ends on a dead link', async () => {
        const complete = vi
            .fn()
            .mockResolvedValueOnce('PASSWORD_INVALID')
            .mockResolvedValueOnce('RECOVERY_LINK_INVALID');
        const r = useTwoFactorRecovery('t', { complete });
        await r.submit('bad');
        expect(r.view.value).toBe('form');
        expect(r.error.value).toBe('PASSWORD_INVALID');
        await r.submit('bad');
        expect(r.view.value).toBe('invalid');
    });
    it('finishes on success', async () => {
        const r = useTwoFactorRecovery('t', { complete: vi.fn().mockResolvedValue('ok') });
        await r.submit('pw');
        expect(r.view.value).toBe('done');
    });
});

describe('useTwoFactorSettings', () => {
    const status = { required: true, enrolled: true, activatedAt: null, pendingEnrolment: false };
    it('requires the current code only when a factor exists', async () => {
        const startEnrolment = vi.fn().mockResolvedValue({ kind: 'enrolment', enrolment });
        const s = useTwoFactorSettings({
            status: vi.fn().mockResolvedValue(status),
            startEnrolment,
            confirm: vi.fn(),
        });
        await s.load();
        await s.begin('pw', '12 34 56');
        expect(startEnrolment).toHaveBeenCalledWith('pw', '123456');
        expect(s.enrolment.value).toEqual(enrolment);
    });
    it('swaps to the new status after confirmation', async () => {
        const s = useTwoFactorSettings({
            status: vi.fn().mockResolvedValue({ ...status, enrolled: false }),
            startEnrolment: vi.fn().mockResolvedValue({ kind: 'enrolment', enrolment }),
            confirm: vi.fn().mockResolvedValue({ kind: 'status', status }),
        });
        await s.load();
        await s.begin('pw', '');
        await s.confirm('123456');
        expect(s.status.value?.enrolled).toBe(true);
        expect(s.enrolment.value).toBeNull();
    });
    it('shows the failure and keeps the pending enrolment on a wrong code', async () => {
        const s = useTwoFactorSettings({
            status: vi.fn().mockResolvedValue(status),
            startEnrolment: vi.fn().mockResolvedValue({ kind: 'enrolment', enrolment }),
            confirm: vi.fn().mockResolvedValue({ kind: 'failure', failure: 'INVALID_CODE' }),
        });
        await s.load();
        await s.begin('pw', '123456');
        await s.confirm('000000');
        expect(s.error.value).toBe('INVALID_CODE');
        expect(s.enrolment.value).toEqual(enrolment);
    });
});

describe('useOtpAutoSubmit', () => {
    function setup() {
        const loading = ref(false);
        const error = ref<string | null>(null);
        const submit = vi.fn((_code: string) => {
            loading.value = true;
        });
        const onReset = vi.fn();
        const otp = useOtpAutoSubmit(
            submit,
            { loading: () => loading.value, failed: () => !!error.value },
            onReset,
        );
        async function finish(failure: string | null): Promise<void> {
            error.value = failure;
            loading.value = false;
            await nextTick();
        }
        return { ...otp, submit, onReset, loading, finish };
    }

    it('submits once when the sixth digit is typed, not before', async () => {
        const t = setup();
        for (const value of ['1', '12', '123', '1234', '12345']) {
            t.code.value = value;
            await nextTick();
        }
        expect(t.submit).not.toHaveBeenCalled();
        t.code.value = '123456';
        await nextTick();
        expect(t.submit).toHaveBeenCalledExactlyOnceWith('123456');
    });

    it('submits a pasted or autofilled code at once', async () => {
        const t = setup();
        t.code.value = '654321';
        await nextTick();
        expect(t.submit).toHaveBeenCalledExactlyOnceWith('654321');
    });

    it('ignores the button while the auto-submit is pending and for the same code', async () => {
        const t = setup();
        t.code.value = '123456';
        await nextTick();
        t.trigger();
        t.loading.value = false;
        t.trigger();
        expect(t.submit).toHaveBeenCalledTimes(1);
    });

    it('the button still submits a complete code', () => {
        const t = setup();
        t.trigger();
        expect(t.submit).not.toHaveBeenCalled();
        t.code.value = '123456';
        t.trigger();
        expect(t.submit).toHaveBeenCalledExactlyOnceWith('123456');
    });

    it('clears the code after a failure and waits for a new code', async () => {
        const t = setup();
        t.code.value = '000000';
        await nextTick();
        await t.finish('INVALID_CODE');
        expect(t.code.value).toBe('');
        expect(t.onReset).toHaveBeenCalledTimes(1);
        await nextTick();
        expect(t.submit).toHaveBeenCalledTimes(1);
        t.code.value = '000000';
        await nextTick();
        expect(t.submit).toHaveBeenCalledTimes(2);
    });

    it('keeps the code after a success', async () => {
        const t = setup();
        t.code.value = '123456';
        await nextTick();
        await t.finish(null);
        expect(t.code.value).toBe('123456');
        expect(t.onReset).not.toHaveBeenCalled();
    });
});
