import type { Meta, StoryObj } from '@storybook/vue3';
import MvFavoriteButton from './MvFavoriteButton.vue';

const meta: Meta<typeof MvFavoriteButton> = {
    title: 'Atoms/MvFavoriteButton',
    component: MvFavoriteButton,
    tags: ['autodocs'],
    argTypes: {
        isFavorited: { control: 'boolean' },
    },
    args: { isFavorited: false },
};

export default meta;
type Story = StoryObj<typeof MvFavoriteButton>;

export const Default: Story = {
    render: args => ({
        components: { MvFavoriteButton },
        setup: () => ({ args }),
        template: '<MvFavoriteButton v-bind="args" />',
    }),
};

export const Favorited: Story = {
    args: { isFavorited: true },
    render: args => ({
        components: { MvFavoriteButton },
        setup: () => ({ args }),
        template: '<MvFavoriteButton v-bind="args" />',
    }),
};
