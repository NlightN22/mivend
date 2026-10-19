import type en from '../en/catalog';

const ru: typeof en = {
    catalog: {
        title: 'Каталог',
        search: 'Поиск по артикулу или названию',
        noResults: 'Ничего не найдено',
        addToCart: 'В корзину',
        inStock: 'В наличии',
        outOfStock: 'Нет в наличии',
    },
    catalogNav: {
        home: 'Главная',
        more: 'Ещё',
        less: 'Свернуть',
        showAll: 'Посмотреть все',
        clearSelection: 'Сбросить выбор',
        search: 'Найти',
        loading: 'Загрузка категорий…',
        empty: 'Нет доступных категорий',
    },
    catalogFilters: {
        inStock: 'Только в наличии',
        price: 'Цена: {range}',
        clearAll: 'Сбросить всё',
        remove: 'Убрать фильтр',
    },
};

export default ru;
