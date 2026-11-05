import { describe, expect, it } from 'vitest';
import en from '../../i18n/en';
import ru from '../../i18n/ru';
import { buildAccountMenu } from '../../composables/accountMenuItems';

function lookup(messages: unknown, path: string): unknown {
    return path
        .split('.')
        .reduce<unknown>(
            (node, part) =>
                node && typeof node === 'object'
                    ? (node as Record<string, unknown>)[part]
                    : undefined,
            messages,
        );
}

const menuKeys = buildAccountMenu(true).flatMap(n => [
    n.key,
    ...(n.children?.map(c => c.key) ?? []),
]);
const USED_KEYS = [
    'auth.logout',
    'nav.account',
    'nav.catalog',
    'nav.orders',
    'nav.favourites',
    'nav.more',
    'nav.tabs',
    'nav.interfaceLanguage',
    ...menuKeys.map(k => `accountNav.${k}`),
];

describe('account menu i18n keys', () => {
    it.each([
        ['en', en],
        ['ru', ru],
    ])('%s has every key the menu and tab bar use', (_locale, messages) => {
        for (const key of USED_KEYS) {
            expect(typeof lookup(messages, key), key).toBe('string');
        }
    });

    it('every menu entry has an icon', () => {
        const nodes = buildAccountMenu(true);
        for (const node of nodes) {
            expect(node.icon, node.key).toBeDefined();
        }
    });
});
