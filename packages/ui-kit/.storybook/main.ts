import type { StorybookConfig } from '@storybook/vue3-vite';

const config: StorybookConfig = {
    stories: ['../src/**/*.stories.@(js|ts)'],
    addons: ['@storybook/addon-essentials', '@chromatic-com/storybook'],
    framework: {
        name: '@storybook/vue3-vite',
        options: {},
    },
    viteFinal: async viteConfig => {
        viteConfig.server = {
            ...viteConfig.server,
            hmr: {
                port: 6007,
                clientPort: 6007,
            },
        };
        return viteConfig;
    },
};

export default config;
