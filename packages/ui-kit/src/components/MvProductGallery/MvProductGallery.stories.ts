import type { Meta, StoryObj } from '@storybook/vue3';
import MvProductGallery from './MvProductGallery.vue';

const meta: Meta<typeof MvProductGallery> = {
    title: 'Organisms/MvProductGallery',
    component: MvProductGallery,
    tags: ['autodocs'],
    argTypes: {
        showFavorite: { control: 'boolean' },
        showDocuments: { control: 'boolean' },
    },
    args: {
        productName: 'Brake pad set — front axle',
        showFavorite: true,
        showDocuments: true,
    },
};

export default meta;
type Story = StoryObj<typeof MvProductGallery>;

export const Default: Story = {
    render: args => ({
        components: { MvProductGallery },
        setup: () => ({ args }),
        template: '<div style="max-width: 420px;"><MvProductGallery v-bind="args" /></div>',
    }),
};

export const StaffViewNoDocuments: Story = {
    args: { showDocuments: false, showFavorite: false },
    render: args => ({
        components: { MvProductGallery },
        setup: () => ({ args }),
        template: '<div style="max-width: 420px;"><MvProductGallery v-bind="args" /></div>',
    }),
};
