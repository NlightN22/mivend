import {
    IconCategory,
    IconClipboardList,
    IconDots,
    IconHeart,
    IconLogin,
    IconUser,
} from '@tabler/icons-vue';
import type { BottomTabItem } from '@mivend/ui-kit';
import type { BottomTabKey } from './bottomTabActive';

export interface BottomTabLabels {
    catalog: string;
    orders: string;
    favourites: string;
    account: string;
    more: string;
    signIn: string;
}

export function buildBottomTabs(opts: {
    loggedIn: boolean;
    active: BottomTabKey | null;
    favoritesCount: number;
    labels: BottomTabLabels;
}): BottomTabItem[] {
    const { labels, active } = opts;
    const catalog = {
        key: 'catalog',
        label: labels.catalog,
        icon: IconCategory,
        active: active === 'catalog',
    };
    if (!opts.loggedIn) {
        return [
            catalog,
            { key: 'login', label: labels.signIn, icon: IconLogin, to: '/login', active: false },
        ];
    }
    return [
        catalog,
        {
            key: 'orders',
            label: labels.orders,
            icon: IconClipboardList,
            to: '/orders',
            active: active === 'orders',
        },
        {
            key: 'favorites',
            label: labels.favourites,
            icon: IconHeart,
            to: '/favorites',
            active: active === 'favorites',
            badgeCount: opts.favoritesCount,
        },
        {
            key: 'cabinet',
            label: labels.account,
            icon: IconUser,
            to: '/account',
            active: active === 'cabinet',
        },
        { key: 'more', label: labels.more, icon: IconDots, active: active === 'more' },
    ];
}
