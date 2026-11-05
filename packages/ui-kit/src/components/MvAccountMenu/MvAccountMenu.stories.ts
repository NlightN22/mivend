import type { Meta, StoryObj } from '@storybook/vue3';
import MvAccountMenu from './MvAccountMenu.vue';

const meta: Meta<typeof MvAccountMenu> = {
    title: 'Organisms/MvAccountMenu',
    component: MvAccountMenu,
    tags: ['autodocs'],
    args: {
        userName: 'Customer 123',
        userRole: 'Company administrator',
        userInitials: 'CU',
        activePath: '/account',
        locale: 'en',
        languages: [
            { code: 'ru', nativeName: 'Русский', flagRegion: 'ru' },
            { code: 'en', nativeName: 'English', flagRegion: 'gb' },
        ],
        entries: [
            { key: 'home', label: 'Home', to: '/account' },
            {
                key: 'documents',
                label: 'Documents',
                children: [{ key: 'contracts', label: 'Contracts', to: '/documents', count: 2 }],
            },
            { key: 'settings', label: 'Settings', to: '/account/settings' },
        ],
    },
};

export default meta;
export const Default: StoryObj<typeof MvAccountMenu> = {};
