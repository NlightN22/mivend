import { normalizePhoneE164 } from 'shared';

import type { ContactPointType } from './entities/contact-point.entity';

export interface ContactPointInput {
    type: ContactPointType;
    value: string;
    label?: string | null;
    isPrimary?: boolean;
    comment?: string | null;
}

export interface ResolvedContactPoint {
    type: ContactPointType;
    value: string;
    normalizedValue: string | null;
    isUsable: boolean;
    label: string | null;
    isPrimary: boolean;
    comment: string | null;
    key: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function contactPointKey(
    type: ContactPointType,
    normalizedValue: string | null,
    value: string,
): string {
    return `${type}:${normalizedValue ?? `raw:${value.trim()}`}`;
}

// Routes by content, not by the declared kind: the source holds e-mails in phone fields. The value is kept as received.
export function resolveContactPoint(input: ContactPointInput): ResolvedContactPoint | null {
    const value = input.value.trim();
    if (value === '') return null;
    let type = input.type;
    let normalized: string | null;
    if (EMAIL.test(value)) {
        type = 'email';
        normalized = value.toLowerCase();
    } else if (type === 'phone' || type === 'email') {
        const phone = normalizePhoneE164(value);
        if (phone) type = 'phone';
        normalized = phone;
    } else {
        normalized = value.replace(/\s+/g, ' ').toLowerCase();
    }
    return {
        type,
        value,
        normalizedValue: normalized,
        isUsable: normalized !== null,
        label: input.label?.trim() || null,
        isPrimary: input.isPrimary === true,
        comment: input.comment?.trim() || null,
        key: contactPointKey(type, normalized, value),
    };
}

// Dedupe on type + normalized value: the first row wins, a primary flag on any duplicate is kept.
export function resolveContactPoints(inputs: readonly ContactPointInput[]): ResolvedContactPoint[] {
    const byKey = new Map<string, ResolvedContactPoint>();
    for (const input of inputs) {
        const resolved = resolveContactPoint(input);
        if (!resolved) continue;
        const seen = byKey.get(resolved.key);
        if (seen) seen.isPrimary = seen.isPrimary || resolved.isPrimary;
        else byKey.set(resolved.key, resolved);
    }
    return [...byKey.values()];
}
