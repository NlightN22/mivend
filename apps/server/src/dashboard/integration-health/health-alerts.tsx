import { Alert, AlertDescription, AlertTitle } from '@vendure/dashboard';

import {
    VERSION_DRIFT_MESSAGES,
    formatVariantOrganizationLine,
    formatVariantUnitLine,
} from './stream-health-view.js';
import type { VariantOrganizationHealth, VariantUnitHealth } from './stream-health-view.js';

interface VersionDrift {
    status: string;
    installed: string;
    latest?: string | null;
}

export function VariantUnitAlert({ health }: Readonly<{ health: VariantUnitHealth }>) {
    const line = formatVariantUnitLine(health);
    return (
        <Alert variant={line.problem ? 'destructive' : 'default'} className="mb-3">
            <AlertDescription>{line.text}</AlertDescription>
        </Alert>
    );
}

export function VariantOrganizationAlert({
    health,
}: Readonly<{ health: VariantOrganizationHealth }>) {
    const line = formatVariantOrganizationLine(health);
    return (
        <Alert variant={line.problem ? 'destructive' : 'default'} className="mb-3">
            <AlertDescription>{line.text}</AlertDescription>
        </Alert>
    );
}

export function VersionDriftAlert({ drift }: Readonly<{ drift: VersionDrift }>) {
    const message = VERSION_DRIFT_MESSAGES[drift.status];
    if (!message) return null;
    return (
        <Alert variant={drift.status === 'BEHIND' ? 'destructive' : 'default'} className="mb-3">
            <AlertTitle>Event contract {message.title}</AlertTitle>
            <AlertDescription>{message.text(drift.installed, drift.latest)}</AlertDescription>
        </Alert>
    );
}
