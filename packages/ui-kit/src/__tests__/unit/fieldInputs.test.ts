// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MvEmailInput from '../../components/MvEmailInput/MvEmailInput.vue';
import MvWorkingHoursInput from '../../components/MvWorkingHoursInput/MvWorkingHoursInput.vue';

describe('MvEmailInput', () => {
    it('emits the value without spaces and blur when focus leaves', async () => {
        const wrapper = mount(MvEmailInput, { props: { modelValue: '' } });
        await wrapper.find('input').setValue('a @b.co');
        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['a@b.co']);
        await wrapper.find('input').trigger('focusout');
        expect(wrapper.emitted('blur')).toHaveLength(1);
    });
});

describe('MvWorkingHoursInput', () => {
    it('offers presets through a datalist linked to the input', () => {
        const wrapper = mount(MvWorkingHoursInput, {
            props: { modelValue: '', presets: ['A 1', 'B 2', 'C 3'] },
        });
        const listId = wrapper.find('input').attributes('list');
        expect(listId).toBeTruthy();
        expect(wrapper.find('datalist').attributes('id')).toBe(listId);
        expect(wrapper.findAll('option')).toHaveLength(3);
    });

    it('takes custom presets and keeps the typed text as is', async () => {
        const wrapper = mount(MvWorkingHoursInput, {
            props: { modelValue: '', presets: ['A 1', 'B 2'] },
        });
        expect(wrapper.findAll('option')).toHaveLength(2);
        await wrapper.find('input').setValue('Mon 9-17');
        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['Mon 9-17']);
    });
});
