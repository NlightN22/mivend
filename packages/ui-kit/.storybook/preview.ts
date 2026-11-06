import type { Preview } from '@storybook/vue3';
import { setup } from '@storybook/vue3';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import 'element-plus/theme-chalk/dark/css-vars.css';
import '../src/styles/tokens.css';
import { themeGlobalTypes, withTheme } from './theme-toolbar';

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
    globalTypes: themeGlobalTypes,
    initialGlobals: { theme: 'light' },
    decorators: [withTheme],
    parameters: {
        backgrounds: { disable: true },
        viewport: {
            viewports: mvViewports,
            defaultViewport: 'mvDesktop',
        },
    },
};

export default preview;
