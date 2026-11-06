// Colors live in packages/ui-kit/src/styles (palette, then light/dark roles). Components use roles only.
const STYLES = 'packages/ui-kit/src/styles/**/*.css';

const colorRules = {
    'color-no-hex': [
        true,
        {
            message:
                'No hex color here: use a role token (--app-*, --el-*) from ui-kit styles/theme-*.css',
        },
    ],
    'color-named': ['never', { message: 'No named color: use a role token' }],
    'function-disallowed-list': [
        ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color'],
        {
            message:
                'No color function here: use a role token; define new colors only in ui-kit styles/',
        },
    ],
    'declaration-property-value-disallowed-list': [
        {
            '/.*/': ['/var\\(--palette-/'],
            '/^(background|border|outline-color|box-shadow)/': [
                '/var\\(--(app-nav-accent|app-nav-accent-soft|app-price)\\)/',
            ],
        },
        {
            message:
                'Components use role tokens, never --palette-* steps; text-accent roles are not fills (use --app-brand-fill)',
        },
    ],
};

const off = Object.fromEntries(Object.keys(colorRules).map(rule => [rule, null]));

export default {
    rules: colorRules,
    overrides: [
        { files: ['**/*.vue'], customSyntax: 'postcss-html' },
        { files: [STYLES], rules: off },
    ],
    ignoreFiles: ['**/dist/**', '**/node_modules/**', '**/generated/**'],
};
