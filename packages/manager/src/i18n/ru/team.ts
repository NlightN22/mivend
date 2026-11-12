import type en from '../en/team';

const team: typeof en = {
    page: { breadcrumb: 'Рабочее пространство', title: 'Команда' },
    views: { all: 'Все', active: 'Активные', unassigned: 'Не распределены', inactive: 'Неактивные' },
    status: { active: 'Активен', inactive: 'Неактивен', unassigned: 'Не распределён' },
    columns: {
        name: 'Имя',
        department: 'Подразделение',
        position: 'Должность',
        branch: 'Филиал',
        roles: 'Роль',
        erpId: 'ERP ID',
        status: 'Статус',
    },
    filters: {
        name: 'Имя или ERP ID содержит…',
        allDepartments: 'Все подразделения',
        allBranches: 'Все филиалы',
        allRoles: 'Все роли',
        allStatuses: 'Все',
    },
    table: {
        searchPlaceholder: 'Поиск по имени или ERP ID…',
        empty: 'Нет сотрудников по выбранным фильтрам',
        manageRoles: 'Управление ролями',
    },
    errors: {
        loadFailed: 'Не удалось загрузить справочник команды',
        loadOptionsFailed: 'Не удалось загрузить подразделения и филиалы',
    },
};

export default team;
