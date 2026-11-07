import type { GeoProviderInfo, LocationPickerLabels } from '@mivend/ui-kit';

type Translate = (key: string) => string;

const KEYS: (keyof LocationPickerLabels)[] = [
    'title',
    'close',
    'save',
    'cancel',
    'searchPlaceholder',
    'searchLabel',
    'provider',
    'chosen',
    'nothingChosen',
    'address',
    'latitude',
    'longitude',
    'manualHint',
    'loadFailed',
    'retry',
    'tryProvider',
    'mapHint',
    'cooperativeHint',
    'invalidLatitude',
    'invalidLongitude',
    'notSet',
    'searchUnavailable',
    'loading',
];

export function locationLabels(t: Translate): LocationPickerLabels {
    return Object.fromEntries(
        KEYS.map(key => [key, t(`locationPicker.${key}`)]),
    ) as unknown as LocationPickerLabels;
}

// Neutral display names; an unknown registry key falls back to the key itself.
export function providerNames(t: Translate, providers: GeoProviderInfo[]): Record<string, string> {
    return Object.fromEntries(
        providers.map(p => {
            const name = t(`locationPicker.providers.${p.key}`);
            return [p.key, name.startsWith('locationPicker.') ? p.key : name];
        }),
    );
}
