# Страница: Settings (`/settings`)

> Прочитай сначала `00-shared-conventions.md`.

## Назначение

Настройка цепочек согласования (approval workflows). Видна только роли **Portal Admin** — единственная страница во всём портале с таким ограничением, отрази это явно в заголовке/подзаголовке страницы ("Only Portal Admins can edit workflow chains").

## Структура контента

1. Заголовок "Approval Workflow Settings".
2. Список существующих типов заявок (карточки или таблица):
    - Price adjustment approval
    - Discount grant approval
    - Credit term extension approval
    - (каждая строка кликабельна → разворачивает/ведёт к редактору конкретной цепочки)
3. Для выбранного типа заявки — редактор цепочки:
    - Визуализация текущей цепочки **как диаграмма шагов** (переиспользуй тот же визуальный паттерн, что ApprovalStepper на `11-approval-detail.md`, но в режиме редактирования — каждый шаг с кнопкой "Edit"/"Remove", плюс кнопка "Add step" между/в конце).
    - Для каждого шага: select "Required role" (Sales Dept Head / Purchasing Dept Head / Security Officer / General Director / ...), multi-select "Can escalate to" (ограниченный список вышестоящих ролей — это и есть `escalatesTo`).
    - Кнопка "Save changes" внизу.
4. Подсказка мелким текстом под редактором: "This diagram is generated directly from the saved configuration — it always reflects the real chain, not a separate document." (отражает архитектурное решение — диаграмма генерируется из конфига, не из отдельного файла).

## Состояния

Обычная форма-редактор, без сложных состояний — разве что подтверждение при сохранении (маленький toast "Workflow chain updated").
