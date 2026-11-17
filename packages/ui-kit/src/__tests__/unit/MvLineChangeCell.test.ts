// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MvLineChangeCell from '../../components/MvLineChangeCell/MvLineChangeCell.vue';
import { formatSigned } from '../../components/MvLineChangeCell/lineChange';

const props = {
    events: [
        {
            kind: 'return',
            title: 'Return',
            subtitle: 'From the customer',
            quantity: -2,
            remainder: 8,
        },
    ],
    ordered: 10,
    actual: 8,
    heading: 'Changes of the line',
    productName: 'Widget',
    sku: 'W-1',
    footer: 'actually received 8 of 10',
    infoLabel: 'Show changes',
};

describe('MvLineChangeCell', () => {
    it('shows the signed difference as a chip and an accessible info button', () => {
        const wrapper = mount(MvLineChangeCell, { props, global: { stubs: { MvPopover: true } } });
        expect(wrapper.get('[data-test="line-change-chip"]').text()).toBe('−2');
        expect(wrapper.get('[data-test="line-change-chip"]').classes()).not.toContain(
            'mv-line-change__chip--up',
        );
    });

    it('formats signs', () => {
        expect([formatSigned(3), formatSigned(-3), formatSigned(0)]).toEqual(['+3', '−3', '0']);
    });
});
