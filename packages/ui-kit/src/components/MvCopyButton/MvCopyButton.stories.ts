import type { Meta, StoryObj } from '@storybook/vue3';
import MvCopyButton from './MvCopyButton.vue';

const meta: Meta<typeof MvCopyButton> = {
    title: 'Atoms/MvCopyButton',
    component: MvCopyButton,
    tags: ['autodocs'],
    args: { value: '100-0000011', label: 'Copy number' },
};

export default meta;
type Story = StoryObj<typeof MvCopyButton>;

export const Default: Story = {};
export const Link: Story = { args: { icon: 'link', label: 'Copy link' } };
