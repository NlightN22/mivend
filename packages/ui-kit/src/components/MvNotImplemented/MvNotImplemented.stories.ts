import type { Meta, StoryObj } from '@storybook/vue3';
import MvNotImplemented from './MvNotImplemented.vue';

const meta: Meta<typeof MvNotImplemented> = {
    title: 'Molecules/MvNotImplemented',
    component: MvNotImplemented,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof MvNotImplemented>;

export const Page: Story = {};

export const Widget: Story = {
    args: { size: 'widget', title: 'Recent orders', message: 'Not implemented yet.' },
};
