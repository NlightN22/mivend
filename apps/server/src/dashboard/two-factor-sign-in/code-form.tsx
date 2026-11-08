import { Button, Input } from '@vendure/dashboard';
import { useState, type FormEvent } from 'react';

import { isCompleteCode } from '../../../../../packages/ui-kit/src/composables/twoFactor/twoFactorTypes';

export function CodeForm({
    placeholder,
    submitLabel,
    loading,
    onSubmit,
}: Readonly<{
    placeholder: string;
    submitLabel: string;
    loading: boolean;
    onSubmit: (code: string) => void;
}>) {
    const [code, setCode] = useState('');

    const submit = (event: FormEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        if (isCompleteCode(code)) onSubmit(code);
    };

    return (
        <form className="grid w-full gap-4" onSubmit={submit}>
            <Input
                value={code}
                onChange={event => setCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={7}
                placeholder={placeholder}
                aria-label={placeholder}
                className="text-center text-xl tracking-widest"
                data-testid="tf-code"
            />
            <Button type="submit" disabled={loading || !isCompleteCode(code)}>
                {submitLabel}
            </Button>
        </form>
    );
}
