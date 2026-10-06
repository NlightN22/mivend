import { defineDashboardExtension } from '@vendure/dashboard';

import { ProductPhotosPage } from './product-photos-page.js';

defineDashboardExtension({
    routes: [
        {
            path: '/product-photos',
            component: route => ProductPhotosPage({ route }),
            navMenuItem: {
                sectionId: 'settings',
                id: 'product-photos',
                title: 'Product photos',
                url: '/product-photos',
                order: 430,
                requiresPermission: 'ManageErpIntegration',
            },
        },
    ],
});
