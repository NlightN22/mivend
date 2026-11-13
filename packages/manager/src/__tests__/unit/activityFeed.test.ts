// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ActivityFeed from '../../components/dashboard/ActivityFeed.vue';

const items = [{ id: 'o1', text: 'Order 100 placed', at: '2026-11-01T10:00:00.000Z' }];

describe('ActivityFeed', () => {
    it('lists the entries when both sources loaded', () => {
        const wrapper = mount(ActivityFeed, { props: { items } });
        expect(wrapper.text()).toContain('Order 100 placed');
        expect(wrapper.find('[role=alert]').exists()).toBe(false);
    });

    it('hides a partial feed and shows the reason when the orders read failed', () => {
        const wrapper = mount(ActivityFeed, {
            props: { items, failed: { orders: 'The request is too large.' } },
        });
        expect(wrapper.find('[role=alert]').exists()).toBe(true);
        expect(wrapper.text()).toContain('The request is too large.');
        expect(wrapper.text()).not.toContain('Order 100 placed');
        expect(wrapper.text()).not.toContain('No recent activity');
    });

    it('names both reasons when orders and approvals failed differently', () => {
        const wrapper = mount(ActivityFeed, {
            props: {
                items: [],
                failed: { orders: 'reason-orders', approvals: 'reason-approvals' },
            },
        });
        expect(wrapper.text()).toContain('reason-orders; reason-approvals');
    });

    it('names a shared reason once', () => {
        const wrapper = mount(ActivityFeed, {
            props: { items: [], failed: { orders: 'same-reason', approvals: 'same-reason' } },
        });
        expect(wrapper.text().split('same-reason')).toHaveLength(2);
    });
});
