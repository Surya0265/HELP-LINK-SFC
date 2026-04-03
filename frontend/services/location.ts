import * as Location from 'expo-location';
import { saveLocation, CachedLocation } from './storage';

let locationSubscription: Location.LocationSubscription | null = null;
const LOCATION_TIMEOUT_MS = 12000;

function toCachedLocation(position: Location.LocationObject | any): CachedLocation {
    return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: new Date().toISOString(),
    };
}

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
        const position = await Promise.race([
            Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            }),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Location timed out')), LOCATION_TIMEOUT_MS)
            ),
        ]);
        const cached = toCachedLocation(position as Location.LocationObject);
        await saveLocation(cached);
        return cached;
    } catch {
        try {
            const fallback = await Location.getLastKnownPositionAsync();
            if (!fallback) return null;

            const cached = toCachedLocation(fallback);
            await saveLocation(cached);
            return cached;
        } catch {
            return null;
        }
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
