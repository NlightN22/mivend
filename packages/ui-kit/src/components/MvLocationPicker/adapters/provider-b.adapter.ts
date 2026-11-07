import type { GeoPoint, MapAdapter, MapMountOptions, MapView } from '../types';
import { loadScript } from './loadScript';

interface LatLng {
    lat(): number;
    lng(): number;
}
interface GMap {
    setCenter(c: { lat: number; lng: number }): void;
    setZoom(z: number): void;
    getCenter(): LatLng | undefined;
    getZoom(): number | undefined;
    addListener(name: string, fn: (e: { latLng?: LatLng }) => void): void;
}
interface GMarker {
    setPosition(c: { lat: number; lng: number }): void;
    setMap(m: GMap | null): void;
    addListener(name: string, fn: (e: { latLng?: LatLng }) => void): void;
}
interface GoogleMaps {
    Map: new (el: HTMLElement, o: Record<string, unknown>) => GMap;
    Marker: new (o: Record<string, unknown>) => GMarker;
}

const toLiteral = (p: GeoPoint) => ({ lat: p.latitude, lng: p.longitude });
const fromLatLng = (l: LatLng): GeoPoint => ({ latitude: l.lat(), longitude: l.lng() });

export class ProviderBAdapter implements MapAdapter {
    private map: GMap | null = null;
    private maps: GoogleMaps | null = null;
    private marker: GMarker | null = null;
    private listener: (p: GeoPoint) => void = () => undefined;

    async mount(element: HTMLElement, o: MapMountOptions): Promise<void> {
        if (!o.publicKey) throw new Error('missing key');
        const w = window as unknown as { google?: { maps?: GoogleMaps } };
        if (!w.google?.maps?.Map) {
            await loadScript(
                `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(o.publicKey)}&loading=async&v=weekly`,
            );
        }
        const maps = w.google?.maps;
        if (!maps?.Map) throw new Error('library missing');
        this.maps = maps;
        this.map = new maps.Map(element, {
            center: toLiteral(o.center),
            zoom: o.zoom,
            gestureHandling: o.cooperative ? 'cooperative' : 'greedy',
            clickableIcons: false,
            streetViewControl: false,
            fullscreenControl: false,
        });
        this.map.addListener('click', e => e.latLng && this.listener(fromLatLng(e.latLng)));
        this.setMarker(o.marker);
    }

    setView(v: MapView): void {
        this.map?.setCenter(toLiteral(v.center));
        this.map?.setZoom(v.zoom);
    }

    getView(): MapView {
        const c = this.map?.getCenter();
        return {
            center: c ? fromLatLng(c) : { latitude: 0, longitude: 0 },
            zoom: this.map?.getZoom() ?? 2,
        };
    }

    setMarker(p: GeoPoint | null): void {
        if (!this.map || !this.maps) return;
        if (!p) {
            this.marker?.setMap(null);
            this.marker = null;
            return;
        }
        if (this.marker) {
            this.marker.setPosition(toLiteral(p));
            return;
        }
        this.marker = new this.maps.Marker({
            map: this.map,
            position: toLiteral(p),
            draggable: true,
        });
        this.marker.addListener('dragend', e => e.latLng && this.listener(fromLatLng(e.latLng)));
    }

    onMarkerChange(listener: (p: GeoPoint) => void): void {
        this.listener = listener;
    }

    destroy(): void {
        this.marker?.setMap(null);
        this.marker = null;
        this.map = null;
    }
}
