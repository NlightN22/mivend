import { Button } from '@vendure/dashboard';
import { useMemo, useState } from 'react';

import { AUTHENTICATOR_APPS } from '../../../../../packages/ui-kit/src/data/authenticatorApps';
import type { TwoFactorEnrolment } from '../../../../../packages/ui-kit/src/composables/twoFactor/twoFactorTypes';
import { buildQrPath } from './qr-path';
import type { SignInLabels } from './two-factor-sign-in-labels';

const spaced = (secret: string): string => secret.replace(/(.{4})/g, '$1 ').trim();

export function EnrolPanel({
    enrolment,
    labels,
}: Readonly<{ enrolment: TwoFactorEnrolment; labels: SignInLabels }>) {
    const qr = useMemo(() => buildQrPath(enrolment.otpauthUri), [enrolment.otpauthUri]);
    const [copied, setCopied] = useState(false);

    const copy = (): void => {
        void navigator.clipboard
            ?.writeText(enrolment.secret)
            .then(() => setCopied(true))
            .catch(() => setCopied(false));
    };

    return (
        <div className="flex flex-col items-center gap-4 w-full">
            <ol className="w-full list-none space-y-1 text-sm text-muted-foreground">
                <li>{labels.stepInstall}</li>
                <li>{labels.stepScan}</li>
                <li>{labels.stepCode}</li>
            </ol>
            <ul className="w-full space-y-1 text-sm">
                {AUTHENTICATOR_APPS.map(app => (
                    <li key={app.name} className="flex flex-wrap items-baseline gap-x-3">
                        <span className="flex-1 font-medium">{app.name}</span>
                        <a
                            className="text-primary underline"
                            href={app.playStoreUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {labels.playStore}
                        </a>
                        <a
                            className="text-primary underline"
                            href={app.appStoreUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {labels.appStore}
                        </a>
                    </li>
                ))}
            </ul>
            <svg
                role="img"
                aria-label={labels.qrAlt}
                viewBox={`0 0 ${qr.size} ${qr.size}`}
                shapeRendering="crispEdges"
                className="size-48 rounded-md border bg-background fill-foreground dark:invert"
            >
                <path d={qr.path} />
            </svg>
            <div className="w-full space-y-1">
                <span className="text-xs text-muted-foreground">{labels.manualKey}</span>
                <div className="flex items-center gap-2">
                    <code
                        className="flex-1 break-all rounded bg-muted px-2 py-1 text-sm"
                        data-testid="tf-secret"
                    >
                        {spaced(enrolment.secret)}
                    </code>
                    <Button type="button" variant="outline" size="sm" onClick={copy}>
                        {copied ? '✓' : labels.copyKey}
                    </Button>
                </div>
            </div>
        </div>
    );
}
