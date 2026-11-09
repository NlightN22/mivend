export const OIDC_LABELS = {
    divider: 'или',
    checking: 'Проверяем вход…',
    failed: 'Не удалось войти через корпоративную учётную запись. Попробуйте ещё раз или войдите по логину и паролю.',
    backToLogin: 'Вернуться ко входу',
    startFailed: 'Вход через корпоративную учётную запись сейчас недоступен.',
};

export const oidcButtonLabel = (host: string): string => `Войти с помощью ${host}`;
