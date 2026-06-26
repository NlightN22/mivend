import type { Preview } from '@storybook/vue3';
import { setup } from '@storybook/vue3';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import '../src/styles/tokens.css';

setup(app => {
    app.use(ElementPlus);
});

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
    },
};

export default preview;
