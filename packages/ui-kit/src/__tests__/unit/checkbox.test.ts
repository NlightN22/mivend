// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MvCheckbox from '../../components/MvCheckbox/MvCheckbox.vue';

describe('MvCheckbox error state', () => {
    it('marks the box invalid and styles it only while error is set', async () => {
        const wrapper = mount(MvCheckbox, { props: { modelValue: false, label: 'Accept' } });
        expect(wrapper.classes()).not.toContain('mv-checkbox--error');
        expect(wrapper.find('input').attributes('aria-invalid')).toBeUndefined();
        await wrapper.setProps({ error: true });
        expect(wrapper.classes()).toContain('mv-checkbox--error');
        expect(wrapper.find('input').attributes('aria-invalid')).toBe('true');
    });
});
