import type { Meta, StoryObj } from '@storybook/vue3';
import MvBlockError from './MvBlockError.vue';

const meta: Meta<typeof MvBlockError> = {
    title: 'Molecules/MvBlockError',
    component: MvBlockError,
    tags: ['autodocs'],
    args: {
        title: 'This block could not load',
        message: 'The request is too large. Contact the developers.',
    },
};

export default meta;
type Story = StoryObj<typeof MvBlockError>;

export const Default: Story = {};

export const WithRetry: Story = {
    args: { retryLabel: 'Retry' },
};
