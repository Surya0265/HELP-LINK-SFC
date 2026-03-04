import * as Location from 'expo-location';
import { saveLocation, CachedLocation } from './storage';

let locationSubscription: Location.LocationSubscription | null = null;

/**
 * Request foreground location permission from the user.
 * Returns true if granted.
 */
export async function requestLocationPermission(): Promise<boolean> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
}

/**
 * Get the current GPS position as a one-time read.
 * Also caches it to AsyncStorage.
 */
export async function getCurrentLocation(): Promise<CachedLocation | null> {
    try {
        const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
        });
        const cached: CachedLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: new Date().toISOString(),
        };
        await saveLocation(cached);
        return cached;
    } catch {
        return null;
    }
}

/**
 * Start continuous location watching.
 * Calls onUpdate every time location changes.
 * Use intervalMs to control how often (ms).
 */
export async function startLocationWatch(
    onUpdate: (loc: CachedLocation) => void,
    intervalMs = 5000
): Promise<void> {
    if (locationSubscription) return; // already watching

    locationSubscription = await Location.watchPositionAsync(
        {
            accuracy: Location.Accuracy.High,
            timeInterval: intervalMs,
            distanceInterval: 5, // minimum 5 metres movement
        },
        async (position) => {
            const cached: CachedLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                timestamp: new Date().toISOString(),
            };
            await saveLocation(cached);
            onUpdate(cached);
        }
    );
}

/**
 * Stop the continuous location watch.
 */
export function stopLocationWatch(): void {
    if (locationSubscription) {
        locationSubscription.remove();
        locationSubscription = null;
    }
}

/**
 * Build a Google Maps URL for a given lat/lng.
 */
export function mapsUrl(lat: number, lng: number): string {
    return `https://maps.google.com/?q=${lat},${lng}`;
}
