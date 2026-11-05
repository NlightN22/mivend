import type { Meta, StoryObj } from '@storybook/vue3';
import MvAccountDropdown from './MvAccountDropdown.vue';

const meta: Meta<typeof MvAccountDropdown> = {
    title: 'Organisms/MvAccountDropdown',
    component: MvAccountDropdown,
    tags: ['autodocs'],
    args: { open: true, label: 'Account' },
};

export default meta;
export const Open: StoryObj<typeof MvAccountDropdown> = {
    render: args => ({
        components: { MvAccountDropdown },
        setup: () => ({ args }),
        template:
            '<div style="height:240px"><MvAccountDropdown v-bind="args">Panel content</MvAccountDropdown></div>',
    }),
};
