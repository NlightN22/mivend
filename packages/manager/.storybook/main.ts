import type { StorybookConfig } from '@storybook/vue3-vite';

const config: StorybookConfig = {
    stories: ['../src/**/*.stories.@(js|ts)'],
    addons: ['@storybook/addon-essentials', '@storybook/addon-viewport'],
    staticDirs: ['../public'],
    framework: {
        name: '@storybook/vue3-vite',
        options: {},
    },
    viteFinal: async viteConfig => {
        viteConfig.server = {
            ...viteConfig.server,
            hmr: {
                port: 6017,
                clientPort: 6017,
            },
        };
        return viteConfig;
    },
};

export default config;
