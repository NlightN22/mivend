# Task: plugin-sync — базовый цикл обмена

## Цель

Реализовать минимальный рабочий цикл синхронизации Hub → Branch:

1. Hub получает событие (например, изменение цены из ERP)
2. Пишет запись в таблицу `sync_outbox` в той же транзакции
3. BullMQ-воркер читает outbox и публикует `SyncEvent` в RabbitMQ
4. Branch-consumer получает сообщение и применяет изменение к локальной БД

ERP-адаптер на этом этапе — заглушка (`StubErpAdapter`), эмулирующая входящие события.

---

## Контекст проекта

**Стек:** Vendure 3.6.4, Node.js, TypeScript, NestJS, TypeORM, PostgreSQL, RabbitMQ, BullMQ/Redis.

**Монорепо:** pnpm workspaces.

- `apps/server/` — единый Vendure-инстанс, поведение зависит от `INSTANCE_TYPE=central|branch`
- `packages/plugins/` — плагины Vendure
- `packages/shared/` — общие типы

**Архитектура обмена:** `docs/sync.md` — обязательно прочитать перед началом.

**Ключевые принципы (нарушать нельзя):**

- Outbox пишется в той же DB-транзакции что и бизнес-данные
- Consumer ack-ает сообщение только после успешного commit в БД
- Каждый consumer идемпотентен по `eventId`
- Никаких тихих потерь — все ошибки логируются и уходят в DLQ после N retry
- Только `plugin-sync` знает о RabbitMQ — другие плагины используют Vendure EventBus

**Уже готово:**

- `packages/shared/src/sync.ts` — интерфейс `SyncEvent<T>` и `SyncOutboxEntry`
- `infrastructure/docker/docker-compose.dev.yml` — RabbitMQ на портах 5672/15672
- Паттерн плагина виден в `packages/plugins/customer-pricing/`

---

## Что нужно создать

### `packages/plugins/sync/`

```
src/
  sync.plugin.ts             # VendurePlugin, static init(options)
  sync.service.ts            # writeToOutbox(), processOutbox()
  outbox.worker.ts           # BullMQ worker: читает outbox → публикует в RabbitMQ
  rabbitmq.service.ts        # connect/publish/subscribe, channel management
  erp-adapter.interface.ts   # ErpAdapter interface (fetchChanges, pushOrder, pushInventoryDelta)
  erp-adapter.stub.ts        # StubErpAdapter — эмулирует входящие события для разработки
  consumers/
    product.consumer.ts      # Применяет product.updated на branch
  entities/
    sync-outbox.entity.ts    # TypeORM entity для таблицы sync_outbox
  types.ts                   # SyncPluginOptions, RabbitMQConfig
index.ts
package.json
```

### Таблица `sync_outbox`

```sql
id, event_id (UUID unique), event_type, payload (jsonb),
target (varchar), created_at, delivered_at, retry_count,
last_error, last_error_at
```

Индекс: `WHERE delivered_at IS NULL` — для быстрого поиска необработанных.

### RabbitMQ топология

- Exchange: `mivend.sync` (topic)
- Hub публикует с routing key: `product.updated`, `price.updated`, и т.д.
- Branch подписывается на `mivend.sync` с binding key `#` (все события)
- Dead-letter exchange: `mivend.sync.dlx`

### Интеграционный тест

Написать тест в `src/__tests__/integration/sync-cycle.test.ts`:

- Поднять реальный PostgreSQL (через `@vendure/testing` или testcontainers)
- Записать событие в outbox
- Убедиться что worker опубликовал в RabbitMQ (mock или реальный)
- Убедиться что consumer применил изменение к БД branch

---

## Программный контракт обмена (критически важно)

Контракт уже реализован в `packages/shared/src/sync.ts`. Нельзя обходить — только расширять.

### Как это работает

**1. Zod-схема = единственный источник правды**

`SyncEventSchema` в `packages/shared` — это discriminated union всех возможных событий.
Каждый тип события имеет строго типизированный payload.

```typescript
// При получении сообщения из RabbitMQ — всегда парсить через схему:
const event = SyncEventSchema.parse(JSON.parse(rawMessage));
// Если сообщение не соответствует схеме → ZodError → nack, DLQ
```

**2. Exhaustive switch = compile-time гарантия обработки**

Каждый consumer обязан использовать `assertNever` в default-ветке:

```typescript
import { SyncEventSchema, assertNever } from 'shared';

function handleEvent(raw: unknown): void {
    const event = SyncEventSchema.parse(raw); // runtime validation

    switch (event.eventType) {
        case 'product.updated':
            // event.payload здесь строго типизирован как ProductUpdatedPayload
            await applyProductUpdate(event.payload);
            break;
        case 'price.updated':
            await applyPriceUpdate(event.payload);
            break;
        // ...все остальные типы...
        default:
            return assertNever(event); // TypeScript ошибка если пропустили case
    }
}
```

**Что происходит при добавлении нового события:**

1. Добавляешь новый вариант в `SyncEventSchema` в `packages/shared`
2. TypeScript **не скомпилируется** во всех consumer-файлах где есть exhaustive switch
3. Ошибка компиляции = обязательное требование добавить обработчик
4. CI упадёт → PR не смержится без обработчика

**3. Правила изменения схемы**

- Новый тип события → добавить в `SyncEventSchema` + payload-схему в `packages/shared`
- Изменение payload существующего события → обратная совместимость обязательна (новые поля — `.optional()`)
- Удаление типа события → сначала убрать все consumer-обработчики, потом из схемы
- Схему менять только в `packages/shared` — никогда в плагине напрямую

---

## Правила разработки

- Читать `AGENTS.md` — там все обязательные правила
- `plugin-sync` — единственный плагин, импортирующий `amqplib` или RabbitMQ-клиент
- Другие плагины публикуют события через Vendure `EventBus`, plugin-sync подписывается
- Все бизнес-данные (типы событий и т.д.) — в БД, не хардкодить в коде
- Лицензия: `GPL-3.0-or-later` в `package.json`
- Файлы не более 200–300 строк

---

## Definition of done

- [ ] `sync_outbox` таблица создаётся через TypeORM synchronize
- [ ] Запись в outbox происходит в одной транзакции с бизнес-данными
- [ ] BullMQ-воркер публикует необработанные записи в RabbitMQ
- [ ] Branch-consumer применяет `product.updated` к локальной БД
- [ ] Дубликаты `eventId` игнорируются (идемпотентность)
- [ ] После N ошибок сообщение уходит в DLQ, пишется лог
- [ ] Интеграционный тест проходит
- [ ] `pnpm test` зелёный
