import { Card, CardContent, LogoMark } from '@vendure/dashboard';
import { useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { CodeForm } from './code-form';
import { EnrolPanel } from './enrol-panel';
import { PasswordForm } from './password-form';
import { resolveRedirectTarget } from './redirect-target';
import { signInApi } from './two-factor-sign-in.api';
import { createSignInFlow } from './two-factor-sign-in-flow';
import { fillEmail, pickLabels } from './two-factor-sign-in-labels';

function LinkButton({ onClick, children }: Readonly<{ onClick: () => void; children: ReactNode }>) {
    return (
        <button type="button" className="text-sm text-primary underline" onClick={onClick}>
            {children}
        </button>
    );
}

function FlowCard() {
    const flow = useMemo(() => createSignInFlow(signInApi), []);
    const state = useSyncExternalStore(flow.subscribe, flow.getState);
    const labels = pickLabels(navigator.language);

    useEffect(() => {
        if (state.step === 'done')
            window.location.assign(resolveRedirectTarget(window.location.search));
    }, [state.step]);

    const titles = {
        password: [labels.passwordTitle, labels.passwordSubtitle],
        verify: [labels.codeTitle, labels.codeSubtitle],
        enrol: [labels.enrolTitle, labels.enrolSubtitle],
        'recovery-sent': [
            labels.recoverySentTitle,
            fillEmail(labels.recoverySentText, state.maskedEmail),
        ],
        done: ['', ''],
    }[state.step];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-sidebar p-6">
            <div className="flex w-full max-w-sm flex-col items-center gap-6 md:max-w-md">
                <LogoMark className="text-primary h-8 w-auto" />
                <Card className="w-full">
                    <CardContent className="flex flex-col items-center gap-4 pt-6">
                        <div className="text-center">
                            <h1 className="text-2xl font-semibold tracking-tight">{titles[0]}</h1>
                            <p className="mt-2 text-sm text-muted-foreground">{titles[1]}</p>
                        </div>
                        {state.error && (
                            <p
                                role="alert"
                                className="text-sm text-destructive"
                                data-testid="tf-error"
                            >
                                {labels.errors[state.error]}
                            </p>
                        )}
                        {state.step === 'password' && (
                            <PasswordForm
                                labels={labels}
                                loading={state.loading}
                                onSubmit={flow.submitPassword}
                            />
                        )}
                        {state.step === 'verify' && (
                            <>
                                <CodeForm
                                    placeholder={labels.codePlaceholder}
                                    submitLabel={labels.codeSubmit}
                                    loading={state.loading}
                                    onSubmit={flow.submitCode}
                                />
                                <LinkButton onClick={() => void flow.requestRecovery()}>
                                    {labels.lostAccess}
                                </LinkButton>
                                <LinkButton onClick={flow.back}>{labels.back}</LinkButton>
                            </>
                        )}
                        {state.step === 'enrol' && state.enrolment && (
                            <>
                                <EnrolPanel enrolment={state.enrolment} labels={labels} />
                                <CodeForm
                                    placeholder={labels.codePlaceholder}
                                    submitLabel={labels.enrolSubmit}
                                    loading={state.loading}
                                    onSubmit={flow.submitCode}
                                />
                                <LinkButton onClick={flow.back}>{labels.back}</LinkButton>
                            </>
                        )}
                        {state.step === 'recovery-sent' && (
                            <>
                                <LinkButton onClick={flow.backToCode}>
                                    {labels.backToCode}
                                </LinkButton>
                                <LinkButton onClick={flow.back}>{labels.back}</LinkButton>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

// The login form cannot be replaced or intercepted by an extension, so this covers the page and hides the stock form.
export function TwoFactorSignIn() {
    const anchor = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const form = anchor.current?.closest('form');
        if (!form) return;
        form.style.display = 'none';
        return () => {
            form.style.display = '';
        };
    }, []);

    return (
        <>
            <span ref={anchor} />
            {createPortal(<FlowCard />, document.body)}
        </>
    );
}
