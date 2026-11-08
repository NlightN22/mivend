import { defineDashboardExtension } from '@vendure/dashboard';

import { TwoFactorSignIn } from './two-factor-sign-in';

// Lives under apps/server/src, not packages/plugins/*: pnpm symlinks break dashboard discovery.
defineDashboardExtension({
    login: { beforeForm: { component: TwoFactorSignIn } },
});
