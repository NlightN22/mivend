# Страница: Discounts (`/discounts`)

> Прочитай сначала `00-shared-conventions.md`.

## Назначение

Список **действующих установок скидок** (discount grants) — политики скидки на клиента/группу товаров с периодом действия, в отличие от разовых корректировок на `/pricing`. Соответствует механизму `discountGrantApproval` в архитектурном концепте — та же сущность, что технически называется `DiscountRule`.

## Структура контента

1. Заголовок "Discount Grants" + кнопка справа "New discount grant" (открывает форму подачи заявки).
2. **FilterBar**: поиск по клиенту, select "Status" (Active / Expiring soon / Expired / Pending approval / Rejected), кнопка "Reset".
3. **DataTable**, столбцы:
    - Customer
    - Product group / facet
    - Discount % (может быть отрицательным — наценка, покажи хотя бы одну такую строку в примере)
    - Valid from — Valid to
    - Status (StatusBadge: важно показать все варианты в примерах строк — `Active` зелёный, `Expiring soon` жёлтый — это состояние grace period, за N дней до истечения, `Expired` серый, `Pending approval` синий)
    - Justification (можно как усечённый текст с "..." и tooltip полного текста при наведении)
4. Для строк со статусом "Expiring soon" — маленькая иконка-ссылка "Renew" прямо в строке таблицы, которая открывает форму продления.

## Форма "New discount grant" / "Renew" (можно как отдельный блок в конце HTML-файла или модалка — на выбор, но покажи оба поля обязательно)

- Select "Customer"
- Select "Product group / facet"
- Поле "Discount %" (положительное или отрицательное)
- Поля "Valid from" / "Valid to"
- **Textarea "Justification" — обязательное поле**, отдельно подпиши, что при продлении это поле **не может быть пустым или совпадать со старым обоснованием** (можно показать placeholder-подсказку "Explain why this is being renewed — don't just repeat the previous justification").
- Если это форма продления (Renew) — над формой блок "Renewal history": компактный список предыдущих версий этой скидки (дата, %, кто согласовывал) — чтобы согласующий видел историю, а не только текущую заявку в изоляции.
- Кнопка "Submit for approval" внизу.

## Состояния

- EmptyState "No discount grants yet" + кнопка "New discount grant".
- Обязательно включи в моковые данные хотя бы одну строку с статусом "Expiring soon", чтобы продемонстрировать этот сценарий визуально.
