# Task: packages/ui-kit — компонентная библиотека

## Цель

Создать `packages/ui-kit/` — набор базовых Vue 3 компонентов поверх Element Plus
с единым дизайн-токеном проекта. Storybook для разработки и документации компонентов.
Страницы storefront строятся из этих кирпичей, не изобретая стиль каждый раз заново.

---

## Контекст проекта

**Стек фронтенда:** Vue 3, Vite, Element Plus, TypeScript, vue-i18n.
Архитектура: `docs/frontend.md`.

**Storefront** (`packages/storefront/`) уже существует со структурой:

```
src/
  pages/{auth,catalog,cart,orders,account}/
  components/{catalog,order,ui}/
  layouts/
  stores/
  composables/
  i18n/ru.ts
```

**Проблема:** сейчас компоненты пишутся без общего дизайн-языка. UI kit решает это.

---

## Что нужно создать

### `packages/ui-kit/`

```
.storybook/
  main.ts            # Storybook config: Vite builder, Vue plugin
  preview.ts         # Global decorators: Element Plus, i18n, theme

src/
  tokens/
    colors.ts        # CSS-переменные цветовой палитры (переопределяет el-*)
    spacing.ts       # Базовые отступы
    typography.ts    # Шрифты и размеры

  components/
    MvButton/
      MvButton.vue
      MvButton.stories.ts
    MvTable/
      MvTable.vue          # Обёртка над ElTableV2 с дефолтными настройками
      MvTable.stories.ts
    MvSearchInput/
      MvSearchInput.vue    # Поле поиска с debounce и иконкой
      MvSearchInput.stories.ts
    MvStatusTag/
      MvStatusTag.vue      # Цветной тег для статусов заказа/резерва
      MvStatusTag.stories.ts
    MvAmountDisplay/
      MvAmountDisplay.vue  # Форматирование суммы с валютой
      MvAmountDisplay.stories.ts
    MvPageHeader/
      MvPageHeader.vue     # Заголовок страницы + breadcrumbs
      MvPageHeader.stories.ts

  index.ts           # Экспорт всех компонентов + токенов

package.json
tsconfig.json
vite.config.ts
```

### Дизайн-токены

Базовая палитра под B2B (нейтральная, деловая):

- Primary: синий (#1677ff или близкий)
- Success / Warning / Danger: стандартные Element Plus
- Фон страницы: светло-серый
- Определяется через CSS custom properties, переопределяет `--el-color-primary`

### Компоненты приоритета 1 (сделать сразу)

| Компонент         | Зачем                                                        |
| ----------------- | ------------------------------------------------------------ |
| `MvButton`        | Единый стиль кнопок (primary/secondary/danger + loading)     |
| `MvTable`         | Виртуальный скролл, пагинация, empty state — везде одинаково |
| `MvSearchInput`   | OEM-поиск, поиск по заказам — общий компонент                |
| `MvStatusTag`     | Статусы заказов и резервов — цветовая кодировка              |
| `MvAmountDisplay` | Суммы с форматированием и валютой                            |
| `MvPageHeader`    | Заголовок + breadcrumbs на всех страницах                    |

---

## Storybook

- Builder: Vite (не webpack)
- В каждой `.stories.ts` — минимум 2 story: дефолтный вариант + edge case
- Документация пишется в MDX только если компонент нетривиальный
- Запуск: `pnpm --filter @mivend/ui-kit storybook`

---

## Интеграция со storefront

После создания ui-kit:

1. Добавить `@mivend/ui-kit` в dependencies `packages/storefront/package.json`
2. Импортировать компоненты в storefront глобально или по месту
3. Существующие страницы-заглушки переписать с использованием ui-kit

---

## Правила

- Читать `AGENTS.md` — там все обязательные правила
- Компоненты — обёртки, не замены. Не дублировать то что Element Plus делает хорошо.
- `MvTable` — всегда `ElTableV2` (виртуальный скролл), не `ElTable`
- Никаких хардкоженных строк — все через props или слоты (ui-kit не зависит от vue-i18n)
- Лицензия: `GPL-3.0-or-later` в `package.json`
- Файлы не более 200–300 строк

---

## Definition of done

- [ ] Storybook запускается: `pnpm --filter @mivend/ui-kit storybook`
- [ ] 6 компонентов приоритета 1 реализованы с stories
- [ ] Дизайн-токены применяются глобально через CSS custom properties
- [ ] `vue-tsc --noEmit` чистый
- [ ] `packages/storefront` зависит от `@mivend/ui-kit` и использует хотя бы 2 компонента
