import type { Meta, StoryObj } from '@storybook/vue3';
import { IconBox } from '@tabler/icons-vue';
import MvIconStat from './MvIconStat.vue';

const meta: Meta<typeof MvIconStat> = {
    title: 'Atoms/MvIconStat',
    component: MvIconStat,
    tags: ['autodocs'],
    args: { icon: IconBox, label: 'Items', value: '2 items' },
};

export default meta;
type Story = StoryObj<typeof MvIconStat>;

export const Default: Story = {};
