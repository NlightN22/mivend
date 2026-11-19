// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MvProductGallery from '../../components/MvProductGallery/MvProductGallery.vue';

describe('MvProductGallery favorite heart', () => {
    it('reflects isFavorited and emits toggle-favorite instead of keeping local state', async () => {
        const wrapper = mount(MvProductGallery, { props: { productName: 'Item' } });
        const heart = wrapper.find('.mv-favorite-btn');
        expect(heart.classes()).not.toContain('mv-favorite-btn--active');
        await heart.trigger('click');
        expect(wrapper.emitted('toggle-favorite')).toHaveLength(1);
        expect(heart.classes()).not.toContain('mv-favorite-btn--active');
        await wrapper.setProps({ isFavorited: true });
        expect(heart.classes()).toContain('mv-favorite-btn--active');
    });

    it('hides the heart when showFavorite is false', () => {
        const wrapper = mount(MvProductGallery, {
            props: { productName: 'Item', showFavorite: false },
        });
        expect(wrapper.find('.mv-favorite-btn').exists()).toBe(false);
    });
});
