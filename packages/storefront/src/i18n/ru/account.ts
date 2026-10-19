import type en from '../en/account';

const ru: typeof en = {
    auth: {
        login: 'Войти',
        logout: 'Выйти',
        email: 'Email',
        password: 'Пароль',
        loginError: 'Неверный email или пароль',
        signIn: 'Вход',
        signInSubtitle: 'Введите email и пароль для входа в личный кабинет.',
        emailOrPhone: 'Телефон или email',
        emailPlaceholder: '+7 900 000-00-00 или email',
        passwordPlaceholder: '••••••••',
        rememberMe: 'Запомнить вход',
        forgotPassword: 'Забыли пароль?',
        publicCatalog: 'Публичный каталог',
        help: 'Помощь',
        security: 'Безопасность',
    },
    account: {
        title: 'Личный кабинет',
        companyNameUnknown: 'Название организации не указано',
        creditLimit: 'Кредитный лимит',
        creditUsed: 'Использовано',
        priceType: 'Тип цен',
    },
};

export default ru;
