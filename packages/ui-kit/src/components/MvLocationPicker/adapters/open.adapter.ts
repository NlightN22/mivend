import type * as Leaflet from 'leaflet';
import type { GeoPoint, MapAdapter, MapMountOptions, MapView, SearchMode } from '../types';

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export class OpenAdapter implements MapAdapter {
    readonly searchMode: SearchMode = 'host-submit';

    private L: typeof Leaflet | null = null;
    private map: Leaflet.Map | null = null;
    private marker: Leaflet.Marker | null = null;
    private listener: (p: GeoPoint) => void = () => undefined;

    async mount(element: HTMLElement, o: MapMountOptions): Promise<void> {
        const L = (await import('leaflet')).default;
        await import('leaflet/dist/leaflet.css');
        this.L = L;
        const map = L.map(element, {
            center: [o.center.latitude, o.center.longitude],
            zoom: o.zoom,
            scrollWheelZoom: !o.cooperative,
            keyboard: false,
        });
        this.map = map;
        L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);
        map.on('click', (e: Leaflet.LeafletMouseEvent) =>
            this.listener({ latitude: e.latlng.lat, longitude: e.latlng.lng }),
        );
        if (o.cooperative) {
            element.addEventListener(
                'wheel',
                e => {
                    if (!(e.ctrlKey || e.metaKey)) return;
                    e.preventDefault();
                    map.setZoom(map.getZoom() + (e.deltaY < 0 ? 1 : -1));
                },
                { passive: false },
            );
            map.dragging.disable();
            element.addEventListener(
                'touchstart',
                e => (e.touches.length > 1 ? map.dragging.enable() : map.dragging.disable()),
                { passive: true },
            );
        }
        this.setMarker(o.marker);
    }

    setView(v: MapView): void {
        this.map?.setView([v.center.latitude, v.center.longitude], v.zoom);
    }

    getView(): MapView {
        const c = this.map?.getCenter();
        return {
            center: { latitude: c?.lat ?? 0, longitude: c?.lng ?? 0 },
            zoom: this.map?.getZoom() ?? 2,
        };
    }

    setMarker(p: GeoPoint | null): void {
        if (!this.map || !this.L) return;
        if (!p) {
            this.marker?.remove();
            this.marker = null;
            return;
        }
        const latlng: Leaflet.LatLngTuple = [p.latitude, p.longitude];
        if (this.marker) {
            this.marker.setLatLng(latlng);
            return;
        }
        const icon = this.L.divIcon({
            className: 'mv-location-pin',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
        });
        this.marker = this.L.marker(latlng, { icon, draggable: true }).addTo(this.map);
        this.marker.on('dragend', () => {
            const ll = this.marker?.getLatLng();
            if (ll) this.listener({ latitude: ll.lat, longitude: ll.lng });
        });
    }

    onMarkerChange(listener: (p: GeoPoint) => void): void {
        this.listener = listener;
    }

    destroy(): void {
        this.map?.remove();
        this.map = null;
        this.marker = null;
    }
}
