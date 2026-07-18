import type { Preview } from '@storybook/vue3';
import { setup } from '@storybook/vue3';
import { createPinia, setActivePinia } from 'pinia';
import { INITIAL_VIEWPORTS } from '@storybook/addon-viewport';
import { initialize, mswLoader } from 'msw-storybook-addon';
import { http, HttpResponse } from 'msw';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import 'element-plus/dist/index.css';
import '@mivend/ui-kit/src/styles/tokens.css';
import {
    MvButton,
    MvStatusTag,
    MvAmountDisplay,
    MvSearchInput,
    MvTable,
    MvPageHeader,
    MvFormField,
    MvInput,
    MvPasswordInput,
    MvNotice,
    MvLogo,
    MvProductCard,
    MvProductRow,
    MvStockBadge,
    MvQtyStepper,
    MvCard,
    MvBreadcrumbs,
    MvCatalogDropdown,
} from '@mivend/ui-kit';

import { router } from '../src/router';
import { i18n } from '../src/i18n';
import { extractOperationName, resetMocks, resolveMock } from './graphql-mock-registry';
import { registerDefaultMocks } from './default-mocks';

initialize({ onUnhandledRequest: 'bypass' });

// Created at module scope (not inside setup()) so router navigation guards can call
// useAuthStore() from a story `loaders` function, which runs before the Vue app that owns
// the router is even mounted. See packages/manager/.storybook/preview.ts for the same fix.
const pinia = createPinia();
setActivePinia(pinia);

setup(app => {
    app.use(pinia);
    app.use(router);
    app.use(i18n);
    app.use(ElementPlus);
    for (const [name, component] of Object.entries(ElementPlusIconsVue)) {
        app.component(name, component);
    }
    app.component('MvButton', MvButton);
    app.component('MvStatusTag', MvStatusTag);
    app.component('MvAmountDisplay', MvAmountDisplay);
    app.component('MvSearchInput', MvSearchInput);
    app.component('MvTable', MvTable);
    app.component('MvPageHeader', MvPageHeader);
    app.component('MvFormField', MvFormField);
    app.component('MvInput', MvInput);
    app.component('MvPasswordInput', MvPasswordInput);
    app.component('MvNotice', MvNotice);
    app.component('MvLogo', MvLogo);
    app.component('MvProductCard', MvProductCard);
    app.component('MvProductRow', MvProductRow);
    app.component('MvStockBadge', MvStockBadge);
    app.component('MvQtyStepper', MvQtyStepper);
    app.component('MvCard', MvCard);
    app.component('MvBreadcrumbs', MvBreadcrumbs);
    app.component('MvCatalogDropdown', MvCatalogDropdown);
});

const mvViewports = {
    mvMobile: {
        name: 'Storefront Mobile (390px)',
        styles: { width: '390px', height: '844px' },
        type: 'mobile' as const,
    },
    mvTablet: {
        name: 'Storefront Tablet (768px)',
        styles: { width: '768px', height: '1024px' },
        type: 'tablet' as const,
    },
    mvDesktop: {
        name: 'Storefront Desktop (1440px)',
        styles: { width: '1440px', height: '900px' },
        type: 'desktop' as const,
    },
};

const graphqlHandler = http.post('/shop-api', async ({ request }) => {
    const body = (await request.json()) as { query: string; variables?: Record<string, unknown> };
    const operationName = extractOperationName(body.query);
    const data = operationName ? resolveMock(operationName, body.variables ?? {}) : {};
    return HttpResponse.json({ data });
});

const preview: Preview = {
    parameters: {
        msw: { handlers: [graphqlHandler] },
        viewport: {
            viewports: { ...mvViewports, ...INITIAL_VIEWPORTS },
            defaultViewport: 'mvMobile',
        },
        backgrounds: {
            default: 'page',
            values: [
                { name: 'page', value: '#F6F8FB' },
                { name: 'surface', value: '#FFFFFF' },
            ],
        },
    },
    loaders: [
        mswLoader,
        async () => {
            resetMocks();
            registerDefaultMocks();
        },
    ],
};

export default preview;
