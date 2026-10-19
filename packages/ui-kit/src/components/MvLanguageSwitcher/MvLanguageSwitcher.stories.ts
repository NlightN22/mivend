import type { Meta, StoryObj } from '@storybook/vue3';
import MvLanguageSwitcher from './MvLanguageSwitcher.vue';

const meta: Meta<typeof MvLanguageSwitcher> = {
    title: 'Molecules/MvLanguageSwitcher',
    component: MvLanguageSwitcher,
    tags: ['autodocs'],
    args: {
        modelValue: 'en',
        options: [
            { code: 'en', nativeName: 'English', flagRegion: 'gb' },
            { code: 'ru', nativeName: 'Русский', flagRegion: 'ru' },
        ],
    },
};

export default meta;
type Story = StoryObj<typeof MvLanguageSwitcher>;

export const Default: Story = {};
