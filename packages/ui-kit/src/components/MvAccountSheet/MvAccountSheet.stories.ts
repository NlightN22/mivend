import type { Meta, StoryObj } from '@storybook/vue3';
import MvAccountSheet from './MvAccountSheet.vue';

const meta: Meta<typeof MvAccountSheet> = {
    title: 'Organisms/MvAccountSheet',
    component: MvAccountSheet,
    tags: ['autodocs'],
    args: { open: true },
    parameters: { viewport: { defaultViewport: 'mvMobile' } },
};

export default meta;
export const Open: StoryObj<typeof MvAccountSheet> = {
    render: args => ({
        components: { MvAccountSheet },
        setup: () => ({ args }),
        template: '<MvAccountSheet v-bind="args">Sheet content</MvAccountSheet>',
    }),
};
