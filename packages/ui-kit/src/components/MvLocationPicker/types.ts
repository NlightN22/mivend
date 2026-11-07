export interface GeoPoint {
    latitude: number;
    longitude: number;
}

export interface GeoProviderInfo {
    key: string;
    publicKey?: string | null;
}

export interface GeoConfig {
    providers: GeoProviderInfo[];
    defaultProvider?: string | null;
    defaultLatitude?: number | null;
    defaultLongitude?: number | null;
    defaultZoom?: number | null;
}

export interface GeoSuggestion {
    address: string;
    latitude?: number | null;
    longitude?: number | null;
}

export interface MapView {
    center: GeoPoint;
    zoom: number;
}

export interface MapMountOptions extends MapView {
    marker: GeoPoint | null;
    cooperative: boolean;
    publicKey: string | null;
}

export interface MapAdapter {
    mount(element: HTMLElement, options: MapMountOptions): Promise<void>;
    setView(view: MapView): void;
    getView(): MapView;
    setMarker(point: GeoPoint | null): void;
    onMarkerChange(listener: (point: GeoPoint) => void): void;
    destroy(): void;
}

export type AdapterFactory = (providerKey: string) => Promise<MapAdapter>;
export type SearchFn = (
    query: string,
    bias: GeoPoint | null,
    provider: string,
) => Promise<GeoSuggestion[]>;
export type ReverseFn = (point: GeoPoint, provider: string) => Promise<string | null>;

export interface LocationPickerLabels {
    title: string;
    close: string;
    save: string;
    cancel: string;
    searchPlaceholder: string;
    searchLabel: string;
    provider: string;
    chosen: string;
    nothingChosen: string;
    address: string;
    latitude: string;
    longitude: string;
    manualHint: string;
    loadFailed: string;
    retry: string;
    tryProvider: string;
    mapHint: string;
    cooperativeHint: string;
    invalidLatitude: string;
    invalidLongitude: string;
    notSet: string;
    searchUnavailable: string;
    loading: string;
}

export const DEFAULT_LABELS: LocationPickerLabels = {
    title: 'Pick location on map',
    close: 'Close',
    save: 'Save',
    cancel: 'Cancel',
    searchPlaceholder: 'Search a place or address',
    searchLabel: 'Search',
    provider: 'Map provider',
    chosen: 'Chosen location',
    nothingChosen: 'Click the map to place the marker',
    address: 'Address at this point',
    latitude: 'Latitude',
    longitude: 'Longitude',
    manualHint: 'Enter coordinates manually',
    loadFailed: 'The map could not be loaded.',
    retry: 'Retry',
    tryProvider: 'Try another map',
    mapHint: 'Click to place the marker, arrow keys move it',
    cooperativeHint: 'Use Ctrl or Cmd with the wheel to zoom the map',
    invalidLatitude: 'Latitude must be between -90 and 90',
    invalidLongitude: 'Longitude must be between -180 and 180',
    notSet: 'Choose a real location, not 0, 0',
    searchUnavailable: 'Search is unavailable, use the map',
    loading: 'Loading map',
};
