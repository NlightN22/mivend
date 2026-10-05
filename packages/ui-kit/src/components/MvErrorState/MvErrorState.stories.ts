import type { Meta, StoryObj } from '@storybook/vue3';
import MvErrorState from './MvErrorState.vue';

const meta: Meta<typeof MvErrorState> = {
    title: 'Molecules/MvErrorState',
    component: MvErrorState,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof MvErrorState>;

export const WithMessage: Story = {
    args: { title: 'Could not load products', message: 'Check your connection and try again.' },
};

export const TitleOnly: Story = {
    args: { title: 'Something went wrong', retryLabel: 'Reload' },
};
