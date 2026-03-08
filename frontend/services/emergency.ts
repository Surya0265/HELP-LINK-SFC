import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { getCurrentLocation, startLocationWatch, stopLocationWatch, mapsUrl } from './location';
import { loadContacts, loadLocation, enqueueAlert, loadQueue, clearQueue, CachedLocation, EmergencyContact } from './storage';

// --- Configuration ---
export const BACKEND_URL = 'http://192.168.1.4:8000';
const USER_ID = 'user_001'; // TODO: replace with real auth user ID

let emergencyInterval: ReturnType<typeof setInterval> | null = null;
let offlineSmsInterval: ReturnType<typeof setInterval> | null = null;
export let activeSessionId: string | null = null;

// Helper to generate a random 8-character string for session IDs without native dependencies
function generateSessionId() {
    return Math.random().toString(36).substring(2, 10);
}

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

    // Generate the Predictive Session ID locally (pure JS to prevent native crashes)
    const predictiveSessionId = generateSessionId();
    activeSessionId = predictiveSessionId;

    // Send the first SMS IMMEDIATELY (offline-first)
    const trackingUrl = isOnline ? `${BACKEND_URL}/track/${predictiveSessionId}` : null;
    await sendEmergencySmsToAll(contacts, location, trackingUrl);

    // If online, explicitly register this specific session ID with the backend
    if (isOnline) {
        try {
            await fetch(`${BACKEND_URL}/api/emergency/trigger`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: USER_ID,
                    session_id: predictiveSessionId, // Handing off our local ID
                    latitude: location.latitude,
                    longitude: location.longitude,
                    accuracy: location.accuracy,
                    contacts,
                }),
            });
            startLocationStreaming(USER_ID);
        } catch (e) {
            console.warn("Backend unavailable during initial session registration. Streaming will pause.");
        }
    } else {
        // Offline: Queue alert and periodically send SMS
        await enqueueAlert({ ...location, contacts });
        startOfflineSmsInterval(contacts);
        watchForConnectivity(contacts);
    }

    return { trackingUrl, sessionId: predictiveSessionId };
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
        ? `HelpLink Test: Track my live location here: ${mapLink}`
        : `HelpLink Test: My location: ${mapLink}`;

    // Send to each contact in parallel
    const promises = contacts.map((c) => sendDirectSms(c.phone, message));
    await Promise.all(promises);
}

/**
 * CASE 2: Send updated SMS every 1 minute when offline.
 */
function startOfflineSmsInterval(contacts: EmergencyContact[]) {
    if (offlineSmsInterval) return;
    offlineSmsInterval = setInterval(async () => {
        const loc = await getCurrentLocation() || await loadLocation();
        if (loc) {
            await sendEmergencySmsToAll(contacts, loc, null);
        }
    }, 1 * 60 * 1000); // every 1 minute
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
                // Generate a new tracking session if the old one died, or resume
                const predictiveSessionId = generateSessionId();
                activeSessionId = predictiveSessionId;

                try {
                    await fetch(`${BACKEND_URL}/api/emergency/trigger`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            user_id: USER_ID,
                            session_id: predictiveSessionId,
                            latitude: loc.latitude,
                            longitude: loc.longitude,
                            accuracy: loc.accuracy,
                            contacts,
                        }),
                    });
                    startLocationStreaming(USER_ID);
                    const fullUrl = `${BACKEND_URL}/track/${predictiveSessionId}`;
                    await sendEmergencySmsToAll(contacts, loc, fullUrl);
                } catch {
                    // Still offline logically
                    startOfflineSmsInterval(contacts);
                }
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
 * Stop all emergency activities.
 */
export async function stopEmergency() {
    stopLocationWatch();

    if (emergencyInterval) { clearInterval(emergencyInterval); emergencyInterval = null; }
    if (offlineSmsInterval) { clearInterval(offlineSmsInterval); offlineSmsInterval = null; }

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
