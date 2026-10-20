import type en from '../en/common';

const ru: typeof en = {
    common: {
        loading: 'Загрузка...',
        error: 'Произошла ошибка',
        retry: 'Повторить',
        notImplemented: {
            title: 'Пока не реализовано',
            message: 'Раздел в разработке и скоро станет доступен.',
        },
        save: 'Сохранить',
        cancel: 'Отмена',
        language: 'Язык',
        yes: 'Да',
        no: 'Нет',
        previous: 'Назад',
        next: 'Вперёд',
        help: 'Помощь',
        breadcrumb: 'Навигационная цепочка',
        support: 'Поддержка',
    },
    pagination: {
        summary: '{start}–{end} из {total}',
        page: 'Страница {page} из {count}',
    },
    nav: {
        catalog: 'Каталог',
        cart: 'Корзина',
        orders: 'Заказы',
        account: 'Кабинет',
        favourites: 'Избранное',
        signIn: 'Войти',
        home: 'Главная',
        menu: 'Меню',
    },
    header: {
        tagline: '{portal} для быстрого заказа автозапчастей и расходников',
        portal: 'B2B-портал',
        liveStock: 'Актуальные остатки и цены',
        searchPlaceholder: 'Артикул, VIN, бренд, название или OEM',
        tradingPoint: 'Торговая точка',
        noTradingPoint: 'Торговая точка не выбрана',
    },
    search: {
        products: 'Товары',
        button: 'Найти',
        open: 'Открыть поиск',
        clear: 'Очистить',
        removeScope: 'Убрать категорию',
        noResults: 'По запросу «{query}» ничего не найдено',
    },
    units: {
        pc: 'шт.',
        pieces: '{n} шт.',
        kg: '{value} кг',
        m3: '{value} м³',
    },
    loadError: {
        noConnectionTitle: 'Нет соединения',
        noConnectionMessage: 'Проверьте подключение к интернету и попробуйте снова.',
        serverBusyTitle: 'Сервер перегружен',
        serverBusyMessage: 'Подождите немного и попробуйте снова.',
        genericTitle: 'Что-то пошло не так',
        genericMessage: 'Попробуйте снова.',
    },
    errorPages: {
        notFoundCode: '404 · Не найдено',
        notFoundTitle: 'Мы искали, но не нашли',
        notFoundText:
            'Страница могла быть перемещена или удалена, либо ссылка неверна. Попробуйте поиск по каталогу или вернитесь на главную.',
        searchPlaceholder: 'Поиск по каталогу…',
        find: 'Найти',
        openCatalog: 'Открыть каталог',
        myOrders: 'Мои заказы',
        deniedCode: 'Доступ ограничен',
        deniedTitle: 'Сюда нельзя',
        deniedText:
            'У вас нет прав на просмотр этой страницы. Если вы считаете это ошибкой, обратитесь к администратору вашей учётной записи.',
        backToCatalog: 'Вернуться в каталог',
        myAccount: 'Мой кабинет',
        otherAccount: 'Войти под другой учётной записью',
        requestAccess: 'Запросить доступ',
    },
};

export default ru;
