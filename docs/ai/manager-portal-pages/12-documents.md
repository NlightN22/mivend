# Страница: Documents (`/documents`)

> Прочитай сначала `00-shared-conventions.md`.

## Назначение

Административный список документов клиентов (счета, договоры, возвраты, акты сверки) — то же самое видит клиент в своём личном кабинете (storefront), но здесь общий вид по всем доступным менеджеру клиентам, а не только "мои документы" одного клиента. Видимость документов = видимость самого клиента (own/department/all), отдельного права нет.

## Структура контента

1. Заголовок "Documents".
2. **FilterBar**: поиск по клиенту/номеру документа, select "Type" (Invoice / Contract / Return / Reconciliation report), select "Status" (Ready / Generating / Failed), кнопка "Reset".
3. **DataTable**, столбцы:
    - Document # / номер
    - Type (иконка типа)
    - Customer
    - Amount
    - Issue date
    - Status (StatusBadge: Ready зелёный, Generating — жёлтый со спиннер-иконкой, Failed — красный)
    - Действие: иконка-кнопка "Download" (активна только при статусе Ready)
4. Кнопка сверху "Generate contract" — открывает маленькую форму/модалку с select "Customer" → генерирует договор для выбранного клиента (доступно только для клиентов, которых текущий пользователь видит).

## Состояния

- EmptyState "No documents yet" для нового менеджера без клиентов/документов.
- Строка со статусом "Generating" — кнопка Download неактивна (серая, с tooltip "Document is being generated").
- Строка со статусом "Failed" — вместо Download показывай маленькую иконку-предупреждение с tooltip "Generation failed — contact support".
