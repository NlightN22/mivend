import { lazyLabels, tr } from '../../utils/lazyLabels';

const LABEL_KEYS = [
    'tab',
    'pageTitle',
    'pageSubtitle',
    'breadcrumb',
    'loading',
    'empty',
    'errorTitle',
    'errorForbidden',
    'retry',
    'redacted',
    'emptyValue',
    'noFields',
    'field',
    'before',
    'after',
    'previous',
    'next',
    'filterEntityType',
    'filterActorType',
    'filterUser',
    'filterAdministrator',
    'filterFrom',
    'filterTo',
    'anyOption',
    'resetFilters',
    'entity',
] as const;

export const CHANGE_JOURNAL_LABELS = Object.assign(lazyLabels('changeJournal.labels', LABEL_KEYS), {
    summary: (start: number, end: number, total: number): string =>
        tr('changeJournal.summary', { start, end, total }),
    pageOf: (page: number, count: number): string => tr('changeJournal.pageOf', { page, count }),
});

export const ACTOR_TYPE_LABELS = lazyLabels('changeJournal.actorType', [
    'administrator',
    'customer',
    'acting',
    'system',
]);

export const ACTION_LABELS = lazyLabels('changeJournal.action', [
    'insert',
    'update',
    'soft-remove',
    'recover',
    'remove',
]);

export const ENTITY_TYPE_LABELS = lazyLabels('changeJournal.entityType', [
    'Counterparty',
    'TradingPoint',
    'Customer',
    'Administrator',
    'Order',
    'OrderLine',
    'User',
]);

export const SOURCE_LABELS = lazyLabels('changeJournal.source', [
    'adminApi',
    'shopApi',
    'rest',
    'scheduledTask',
    'background',
]);
