import { Button, Input, PasswordInput } from '@vendure/dashboard';
import { useState, type FormEvent } from 'react';

import type { SignInLabels } from './two-factor-sign-in-labels';

export function PasswordForm({
    labels,
    loading,
    onSubmit,
}: Readonly<{
    labels: SignInLabels;
    loading: boolean;
    onSubmit: (username: string, password: string) => void;
}>) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const submit = (event: FormEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        if (username && password) onSubmit(username, password);
    };

    return (
        <form className="grid w-full gap-4" onSubmit={submit}>
            <Input
                value={username}
                onChange={event => setUsername(event.target.value)}
                placeholder={labels.email}
                autoComplete="username"
                autoFocus
                data-testid="tf-username"
            />
            <PasswordInput
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder={labels.password}
                autoComplete="current-password"
                data-testid="tf-password"
            />
            <Button type="submit" disabled={loading || !username || !password}>
                {labels.signIn}
            </Button>
        </form>
    );
}
