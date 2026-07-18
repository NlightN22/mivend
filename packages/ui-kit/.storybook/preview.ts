import type { Preview } from '@storybook/vue3';
import { setup } from '@storybook/vue3';
import { INITIAL_VIEWPORTS } from '@storybook/addon-viewport';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import '../src/styles/tokens.css';

const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
});

setup(app => {
    app.use(ElementPlus);
    app.use(router);
});

const mvViewports = {
    mvMobile: {
        name: 'Manager Mobile (390px)',
        styles: { width: '390px', height: '844px' },
        type: 'mobile' as const,
    },
    mvTablet: {
        name: 'Manager Tablet (768px)',
        styles: { width: '768px', height: '1024px' },
        type: 'tablet' as const,
    },
    mvDesktop: {
        name: 'Manager Desktop (1440px)',
        styles: { width: '1440px', height: '900px' },
        type: 'desktop' as const,
    },
};

const preview: Preview = {
    parameters: {
        backgrounds: {
            default: 'page',
            values: [
                { name: 'page', value: '#F6F8FB' },
                { name: 'surface', value: '#FFFFFF' },
                { name: 'catalog', value: '#F2FFF8' },
            ],
        },
        viewport: {
            viewports: { ...mvViewports, ...INITIAL_VIEWPORTS },
            defaultViewport: 'mvDesktop',
        },
    },
};

export default preview;
