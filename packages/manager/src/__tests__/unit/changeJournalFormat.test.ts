import { describe, expect, it } from 'vitest';
import type { ChangeJournalEntry } from '../../api/changeJournal';
import {
    changeLines,
    formatAction,
    formatActor,
    formatSource,
    formatValue,
} from '../../utils/changeJournalFormat';
import {
    toChangeJournalFilter,
    BLANK_CHANGE_JOURNAL_FILTERS,
} from '../../utils/changeJournalFilter';

function entry(patch: Partial<ChangeJournalEntry>): ChangeJournalEntry {
    return {
        id: '1',
        occurredAt: '2026-11-10T10:00:00.000Z',
        actorType: 'system',
        userId: null,
        administratorId: null,
        source: 'background',
        entityType: 'TradingPoint',
        entityId: '7',
        action: 'update',
        changes: {},
        ...patch,
    };
}

const names = (id: string): string | null => (id === '5' ? 'Anna Admin' : null);

describe('formatActor', () => {
    it('names a known administrator and falls back to the id for an unknown one', () => {
        expect(
            formatActor(entry({ actorType: 'administrator', administratorId: '5' }), names),
        ).toBe('Администратор: Anna Admin');
        expect(
            formatActor(entry({ actorType: 'administrator', administratorId: '9' }), names),
        ).toBe('Администратор: #9');
    });

    it('shows the acting manager and the customer user it acted for', () => {
        const acting = entry({ actorType: 'acting', administratorId: '5', userId: '42' });
        expect(formatActor(acting, names)).toBe('Anna Admin от имени клиента (пользователь #42)');
    });

    it('shows a customer by user id and the system without ids', () => {
        expect(formatActor(entry({ actorType: 'customer', userId: '42' }), names)).toBe(
            'Клиент: пользователь #42',
        );
        expect(formatActor(entry({ actorType: 'system' }), names)).toBe('Система');
    });
});

describe('formatSource', () => {
    it.each([
        ['admin-api:updateTradingPointDetails', 'Админ-API: updateTradingPointDetails'],
        ['shop-api:addItemToOrder', 'Витрина: addItemToOrder'],
        ['shop-api:rest:POST /payments/callback', 'REST: POST /payments/callback'],
        [
            'scheduled-task:settlement-reconcile-pending',
            'Плановая задача: settlement-reconcile-pending',
        ],
        ['background', 'Фоновая обработка'],
        ['something-new', 'something-new'],
    ])('%s', (source, expected) => {
        expect(formatSource(source)).toBe(expected);
    });
});

describe('changeLines', () => {
    it('renders before/after, empty values and a redacted field without its value', () => {
        const lines = changeLines({
            name: { before: 'Old', after: 'New' },
            phone: { after: '' },
            passwordHash: { redacted: true },
            contacts: { before: null, after: [{ name: 'A' }] },
        });
        expect(lines).toEqual([
            { field: 'name', before: 'Old', after: 'New', redacted: false },
            { field: 'phone', before: '—', after: '—', redacted: false },
            {
                field: 'passwordHash',
                before: 'изменено, значение скрыто',
                after: 'изменено, значение скрыто',
                redacted: true,
            },
            { field: 'contacts', before: '—', after: '[{"name":"A"}]', redacted: false },
        ]);
    });

    it('returns nothing for a non-object payload', () => {
        expect(changeLines(null)).toEqual([]);
        expect(changeLines('x')).toEqual([]);
    });

    it('formats scalars and keeps unknown actions as they are', () => {
        expect(formatValue(false)).toBe('false');
        expect(formatValue(0)).toBe('0');
        expect(formatAction('soft-remove')).toBe('Удаление в архив');
        expect(formatAction('merge')).toBe('merge');
    });
});

describe('toChangeJournalFilter', () => {
    it('omits blank fields', () => {
        expect(toChangeJournalFilter(BLANK_CHANGE_JOURNAL_FILTERS)).toEqual({});
    });

    it('maps the inclusive local date range to [from 00:00, day after to 00:00)', () => {
        const filter = toChangeJournalFilter({
            ...BLANK_CHANGE_JOURNAL_FILTERS,
            entityType: ' TradingPoint ',
            actorType: 'acting',
            userId: '42',
            administratorId: '5',
            from: '2026-11-01',
            to: '2026-11-10',
        });
        expect(filter).toEqual({
            entityType: 'TradingPoint',
            actorType: 'acting',
            userId: '42',
            administratorId: '5',
            occurredAfter: new Date(2026, 10, 1).toISOString(),
            occurredBefore: new Date(2026, 10, 11).toISOString(),
        });
    });
});
