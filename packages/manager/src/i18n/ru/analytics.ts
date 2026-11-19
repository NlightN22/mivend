import type en from '../en/analytics';

const analytics: typeof en = {
    title: 'Аналитика',
    status: { planned: 'Запланирован', available: 'Доступен' },
    catalog: {
        search: 'Поиск отчётов…',
        loadFailedTitle: 'Не удалось загрузить отчёты',
        loadFailedMessage: 'Проверьте соединение и попробуйте снова.',
        none: 'Для вашей роли нет доступных отчётов.',
        noMatch: 'Нет отчётов, подходящих под поиск.',
    },
    report: {
        back: 'Аналитика',
        notBuilt: 'Этот отчёт ещё не построен. Зарегистрировано только его описание.',
        notes: 'Заметки по реализации',
        notFound: 'Такого отчёта нет или он недоступен для вашей роли.',
    },
};

export default analytics;
