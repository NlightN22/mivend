import type { TwoFactorUiError } from '../../../../../packages/ui-kit/src/composables/twoFactor/twoFactorTypes';

export interface SignInLabels {
    passwordTitle: string;
    passwordSubtitle: string;
    email: string;
    password: string;
    signIn: string;
    codeTitle: string;
    codeSubtitle: string;
    codePlaceholder: string;
    codeSubmit: string;
    lostAccess: string;
    back: string;
    enrolTitle: string;
    enrolSubtitle: string;
    stepInstall: string;
    stepScan: string;
    stepCode: string;
    playStore: string;
    appStore: string;
    qrAlt: string;
    manualKey: string;
    copyKey: string;
    enrolSubmit: string;
    recoverySentTitle: string;
    recoverySentText: string;
    backToCode: string;
    errors: Record<TwoFactorUiError, string>;
}

const en: SignInLabels = {
    passwordTitle: 'Sign in to the dashboard',
    passwordSubtitle: 'Enter your e-mail and password',
    email: 'Email',
    password: 'Password',
    signIn: 'Sign in',
    codeTitle: 'Enter the code',
    codeSubtitle: 'Enter the 6-digit code from your authenticator app',
    codePlaceholder: '000000',
    codeSubmit: 'Confirm',
    lostAccess: 'I lost access to the app',
    back: 'Back to sign in',
    enrolTitle: 'Set up two-factor sign-in',
    enrolSubtitle: 'Sign-in needs a code from your own phone. Set it up once to continue.',
    stepInstall: '1. Install an authenticator app on your phone',
    stepScan: '2. Scan the QR code, or type the key by hand',
    stepCode: '3. Enter the 6-digit code the app shows',
    playStore: 'Google Play',
    appStore: 'App Store',
    qrAlt: 'QR code for the authenticator app',
    manualKey: 'Manual key',
    copyKey: 'Copy',
    enrolSubmit: 'Confirm and sign in',
    recoverySentTitle: 'Check your e-mail',
    recoverySentText:
        'We sent a recovery link to {email}. Open it on the manager portal or the storefront to set up a new device.',
    backToCode: 'Back to the code',
    errors: {
        INVALID_CREDENTIALS: 'Wrong e-mail or password.',
        CHALLENGE_INVALID: 'The sign-in step expired. Enter your password again.',
        INVALID_CODE: 'Wrong code. Check the app and try again.',
        PASSWORD_INVALID: 'Wrong password.',
        CODE_REQUIRED: 'Enter the current code.',
        NOT_ENROLLED: 'Two-factor sign-in is not set up for this account.',
        ENROLMENT_EXPIRED: 'The setup expired. Scan the new QR code.',
        RECOVERY_LINK_INVALID: 'The recovery link is not valid.',
        UNKNOWN: 'Something went wrong. Try again.',
    },
};

const ru: SignInLabels = {
    passwordTitle: 'Вход в панель управления',
    passwordSubtitle: 'Введите e-mail и пароль',
    email: 'E-mail',
    password: 'Пароль',
    signIn: 'Войти',
    codeTitle: 'Введите код',
    codeSubtitle: 'Введите 6-значный код из приложения-аутентификатора',
    codePlaceholder: '000000',
    codeSubmit: 'Подтвердить',
    lostAccess: 'Я потерял доступ к приложению',
    back: 'Назад ко входу',
    enrolTitle: 'Настройте двухфакторный вход',
    enrolSubtitle:
        'Для входа нужен код с вашего телефона. Настройте его один раз, чтобы продолжить.',
    stepInstall: '1. Установите на телефон приложение-аутентификатор',
    stepScan: '2. Отсканируйте QR-код или введите ключ вручную',
    stepCode: '3. Введите 6-значный код из приложения',
    playStore: 'Google Play',
    appStore: 'App Store',
    qrAlt: 'QR-код для приложения-аутентификатора',
    manualKey: 'Ключ для ручного ввода',
    copyKey: 'Копировать',
    enrolSubmit: 'Подтвердить и войти',
    recoverySentTitle: 'Проверьте почту',
    recoverySentText:
        'Мы отправили ссылку для восстановления на {email}. Откройте её в портале менеджера или в магазине, чтобы настроить новое устройство.',
    backToCode: 'Назад к вводу кода',
    errors: {
        INVALID_CREDENTIALS: 'Неверный e-mail или пароль.',
        CHALLENGE_INVALID: 'Шаг входа истёк. Введите пароль ещё раз.',
        INVALID_CODE: 'Неверный код. Проверьте приложение и попробуйте ещё раз.',
        PASSWORD_INVALID: 'Неверный пароль.',
        CODE_REQUIRED: 'Введите текущий код.',
        NOT_ENROLLED: 'Для этой учётной записи двухфакторный вход не настроен.',
        ENROLMENT_EXPIRED: 'Настройка истекла. Отсканируйте новый QR-код.',
        RECOVERY_LINK_INVALID: 'Ссылка для восстановления недействительна.',
        UNKNOWN: 'Что-то пошло не так. Попробуйте ещё раз.',
    },
};

export function pickLabels(language: string | undefined): SignInLabels {
    return language?.toLowerCase().startsWith('ru') ? ru : en;
}

export function fillEmail(template: string, email: string): string {
    return template.replace('{email}', email);
}
