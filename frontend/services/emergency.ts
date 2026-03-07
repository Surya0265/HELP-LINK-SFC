import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import * as Battery from 'expo-battery';
import NetInfo from '@react-native-community/netinfo';
import { getCurrentLocation, startLocationWatch, stopLocationWatch, mapsUrl } from './location';
import { loadContacts, loadLocation, enqueueAlert, loadQueue, clearQueue, CachedLocation, EmergencyContact } from './storage';

// --- Configuration ---
export const BACKEND_URL = 'http://192.168.1.4:8000';
const USER_ID = 'user_001'; // TODO: replace with real auth user ID

let emergencyInterval: ReturnType<typeof setInterval> | null = null;
let offlineSmsInterval: ReturnType<typeof setInterval> | null = null;
let batterySubscription: Battery.Subscription | null = null;
export let activeSessionId: string | null = null;

/**
 * Request SEND_SMS permission from the user (Android only, one-time).
 */
async function requestSmsPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
        const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.SEND_SMS,
            {
                title: 'HelpLink:SFC SMS Permission',
                message: 'This app needs permission to send emergency SMS alerts automatically.',
                buttonPositive: 'Allow',
                buttonNegative: 'Deny',
            }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
        return false;
    }
}

/**
 * Send SMS directly from the phone — no SMS app opens, fully automatic.
 * Uses react-native-sms-z for background sending.
 */
async function sendDirectSms(phoneNumber: string, message: string): Promise<boolean> {
    try {
        const { DirectSms } = NativeModules;
        if (!DirectSms) {
            console.warn('DirectSms native module not available');
            return false;
        }
        await DirectSms.sendDirectSms(phoneNumber, message);
        return true;
    } catch (error) {
        console.error('Failed to send SMS to', phoneNumber, error);
        return false;
    }
}

/**
 * Main function called when SOS is pressed.
 * Handles all 3 cases: online, offline, and battery monitoring.
 */
export async function triggerEmergency(): Promise<{ trackingUrl: string | null; sessionId: string | null }> {
    const contacts = await loadContacts();
    if (contacts.length === 0) {
        throw new Error('No emergency contacts configured. Please add contacts first.');
    }

    // Request SMS permission first
    const smsAllowed = await requestSmsPermission();
    if (!smsAllowed) {
        throw new Error('SMS permission denied. Please allow SMS permission to send emergency alerts.');
    }

    // Get fresh GPS (fall back to cached)
    let location = await getCurrentLocation();
    if (!location) {
        location = await loadLocation();
    }
    if (!location) {
        throw new Error('Unable to determine location. Please enable GPS.');
    }

    // Check network
    const netState = await NetInfo.fetch();
    const isOnline = netState.isConnected && netState.isInternetReachable;

    // Send SMS with Google Maps pin immediately
    await sendEmergencySmsToAll(contacts, location, null);

    // If online, optionally stream GPS to backend in the background (fire and forget)
    if (isOnline) {
        startLocationStreaming(USER_ID);
    } else {
        // Offline: Queue alert and periodically send SMS
        await enqueueAlert({ ...location, contacts });
        startOfflineSmsInterval(contacts);
        watchForConnectivity(contacts);
    }

    // CASE 3: Start battery monitoring (always)
    startBatteryMonitoring(contacts, location);

    return { trackingUrl: null, sessionId: null };
}

/**
 * CASE 1: Post emergency to backend and get tracking URL.
 */
async function triggerOnlineEmergency(
    location: CachedLocation,
    contacts: EmergencyContact[]
): Promise<{ trackingUrl: string; sessionId: string }> {
    try {
        const res = await fetch(`${BACKEND_URL}/api/emergency/trigger`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: USER_ID,
                latitude: location.latitude,
                longitude: location.longitude,
                accuracy: location.accuracy,
                contacts,
            }),
        });
        const data = await res.json();
        return { trackingUrl: data.tracking_url, sessionId: data.session_id };
    } catch (error) {
        console.warn('Backend unreachable for live tracking. Falling back to offline SMS.', error);
        throw new Error('BACKEND_UNREACHABLE');
    }
}

/**
 * CASE 1: Stream GPS to backend every 5 seconds.
 */
function startLocationStreaming(userId: string) {
    startLocationWatch(async (loc) => {
        try {
            await fetch(`${BACKEND_URL}/api/location/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    latitude: loc.latitude,
                    longitude: loc.longitude,
                    accuracy: loc.accuracy,
                    timestamp: loc.timestamp,
                }),
            });
        } catch {
            // Network might have dropped; location is still cached locally
        }
    }, 5000);
}

/**
 * Auto-send SMS to ALL emergency contacts — no SMS app opens, fully automatic.
 */
async function sendEmergencySmsToAll(
    contacts: EmergencyContact[],
    location: CachedLocation,
    trackingUrl: string | null
) {
    const mapLink = trackingUrl ?? mapsUrl(location.latitude, location.longitude);
    const message = trackingUrl
        ? `EMERGENCY! I need help! Track my live location: ${mapLink}`
        : `EMERGENCY! I need help! My location: ${mapLink}`;

    // Send to each contact in parallel
    const promises = contacts.map((c) => sendDirectSms(c.phone, message));
    await Promise.all(promises);
}

/**
 * CASE 2: Send updated SMS every 2 minutes when offline.
 */
function startOfflineSmsInterval(contacts: EmergencyContact[]) {
    if (offlineSmsInterval) return;
    offlineSmsInterval = setInterval(async () => {
        const loc = await getCurrentLocation() || await loadLocation();
        if (loc) {
            await sendEmergencySmsToAll(contacts, loc, null);
        }
    }, 2 * 60 * 1000); // every 2 minutes
}

/**
 * Watch for internet to return. When it does, flush the queue.
 */
function watchForConnectivity(contacts: EmergencyContact[]) {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
        if (state.isConnected && state.isInternetReachable) {
            unsubscribe();
            await flushOfflineQueue(contacts);

            if (offlineSmsInterval) {
                clearInterval(offlineSmsInterval);
                offlineSmsInterval = null;
            }

            // Switch to live tracking
            const loc = await getCurrentLocation() || await loadLocation();
            if (loc) {
                const result = await triggerOnlineEmergency(loc, contacts);
                activeSessionId = result.sessionId;
                startLocationStreaming(USER_ID);
                const fullUrl = `${BACKEND_URL}${result.trackingUrl}`;
                await sendEmergencySmsToAll(contacts, loc, fullUrl);
            }
        }
    });
}

/**
 * Send all queued alerts to backend when internet returns.
 */
async function flushOfflineQueue(contacts: EmergencyContact[]) {
    const queue = await loadQueue();
    for (const alert of queue) {
        try {
            await fetch(`${BACKEND_URL}/api/location/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: USER_ID, ...alert }),
            });
        } catch {
            return;
        }
    }
    await clearQueue();
}

/**
 * CASE 3: Monitor battery. Auto-send SMS when battery drops to 15%.
 */
function startBatteryMonitoring(contacts: EmergencyContact[], lastLocation: CachedLocation) {
    if (batterySubscription) return;
    batterySubscription = Battery.addBatteryLevelListener(async ({ batteryLevel }) => {
        if (batteryLevel <= 0.15) {
            const loc = await getCurrentLocation() || lastLocation;
            if (loc) {
                const msg = `WARNING: My phone battery is at ${Math.round(batteryLevel * 100)}%. Last known location: ${mapsUrl(loc.latitude, loc.longitude)}. If I go unreachable, check this location.`;
                const promises = contacts.map((c) => sendDirectSms(c.phone, msg));
                await Promise.all(promises);
            }
            batterySubscription?.remove();
            batterySubscription = null;
        }
    });
}

/**
 * Stop all emergency activities.
 */
export async function stopEmergency() {
    stopLocationWatch();

    if (emergencyInterval) { clearInterval(emergencyInterval); emergencyInterval = null; }
    if (offlineSmsInterval) { clearInterval(offlineSmsInterval); offlineSmsInterval = null; }
    if (batterySubscription) { batterySubscription.remove(); batterySubscription = null; }

    if (activeSessionId) {
        try {
            await fetch(`${BACKEND_URL}/api/emergency/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: USER_ID, session_id: activeSessionId }),
            });
        } catch { /* ignore */ }
        activeSessionId = null;
    }
}
