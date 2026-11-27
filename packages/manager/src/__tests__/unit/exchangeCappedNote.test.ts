// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ExchangeCappedNote from '../../components/exchange-health/ExchangeCappedNote.vue';
import { i18n } from '../../i18n';

const note = (capped: boolean) =>
    mount(ExchangeCappedNote, {
        props: { capped, count: 10000 },
        global: { plugins: [i18n] },
    }).find('[data-testid="exchange-capped-note"]');

describe('capped total note', () => {
    it('shows the ceiling when the total is capped', () => {
        const found = note(true);
        expect(found.exists()).toBe(true);
        expect(found.text()).toContain('10000');
    });

    it('stays hidden when the total is exact', () => {
        expect(note(false).exists()).toBe(false);
    });
});
