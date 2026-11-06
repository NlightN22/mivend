import type { Decorator } from '@storybook/vue3';

export const themeGlobalTypes = {
    theme: {
        description: 'Color theme',
        toolbar: {
            title: 'Theme',
            icon: 'circlehollow',
            items: [
                { value: 'light', title: 'Light' },
                { value: 'dark', title: 'Dark' },
            ],
            dynamicTitle: true,
        },
    },
};

export const withTheme: Decorator = (story, context) => {
    const dark = context.globals.theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', dark);
    return story();
};
