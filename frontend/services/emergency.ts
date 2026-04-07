import { NativeModules, PermissionsAndroid, Platform, Alert } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as SMS from 'expo-sms';
import SmsAndroid from 'react-native-get-sms-android';
import { getCurrentLocation, startLocationWatch, stopLocationWatch, mapsUrl } from './location';
import { loadContacts, loadLocation, enqueueAlert, loadQueue, clearQueue, CachedLocation, EmergencyContact } from './storage';

// --- Configuration ---
export const BACKEND_URL = 'https://zora-unharked-incidentally.ngrok-free.dev';
const USER_ID = 'user_001'; // TODO: replace with real auth user ID
const NETWORK_TIMEOUT_MS = 10000;
const SMS_TIMEOUT_MS = 60000; // Increased massively because opening the SMS UI takes time

let emergencyInterval: ReturnType<typeof setInterval> | null = null;
let offlineSmsInterval: ReturnType<typeof setInterval> | null = null;
let smsReplyInterval: ReturnType<typeof setInterval> | null = null;
let emergencyStartTime: number = 0;
export let activeSessionId: string | null = null;

// Helper to generate a random 8-character string for session IDs without native dependencies
function generateSessionId() {
    return Math.random().toString(36).substring(2, 10);
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = NETWORK_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const fetchOptions = {
            ...options,
            headers: {
                ...options.headers,
                'ngrok-skip-browser-warning': 'true', // Required for ngrok free tier
                'Bypass-Tunnel-Reminder': 'true'     // Alternate header
            },
            signal: controller.signal
        };
        return await fetch(url, fetchOptions);
    } finally {
        clearTimeout(timeout);
    }
}

async function sendDirectSmsWithTimeout(phoneNumber: string, message: string): Promise<boolean> {
    return await Promise.race([
        sendDirectSms(phoneNumber, message),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), SMS_TIMEOUT_MS)),
    ]);
}

/**
 * Request SEND_SMS permission from the user (Android only, one-time).
 */
async function requestSmsPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
        const timeoutPromise = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000));
        const permissionPromise = PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.SEND_SMS,
            PermissionsAndroid.PERMISSIONS.READ_SMS
        ]).then(statuses => 
            statuses[PermissionsAndroid.PERMISSIONS.SEND_SMS] === PermissionsAndroid.RESULTS.GRANTED &&
            statuses[PermissionsAndroid.PERMISSIONS.READ_SMS] === PermissionsAndroid.RESULTS.GRANTED
        );
        
        return await Promise.race([permissionPromise, timeoutPromise]);
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
        
        // Expo Go does not include custom native modules. Fallback to user-interactive SMS.
        if (!DirectSms) {
            console.warn('DirectSms native module not available in Expo Go. Launching SMS app.');
            
            const isAvailable = await SMS.isAvailableAsync();
            if (isAvailable) {
                // This will open your phone's default messaging app with the text pre-filled.
                await SMS.sendSMSAsync([phoneNumber], message);
                return true;
            } else {
                Alert.alert('Try on an actual Android/iOS phone to see SMS launch.');
                return false;
            }
        }
        
        // This is your actual background logic once the app is fully built
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
export async function triggerEmergency(onAcknowledge?: () => void): Promise<{ trackingUrl: string | null; sessionId: string | null }> {
    const contacts = await loadContacts();
    if (contacts.length === 0) {
        throw new Error('No emergency contacts configured. Please add contacts first.');
    }

    // Request SMS permission first
    const smsAllowed = await requestSmsPermission();
    if (!smsAllowed) {
        console.warn('SMS permission denied. Continuing without automatic SMS alerts.');
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
    const isOnline = netState.isConnected === true && netState.isInternetReachable !== false;

    // Generate the Predictive Session ID locally (pure JS to prevent native crashes)
    const predictiveSessionId = generateSessionId();
    activeSessionId = predictiveSessionId;

    // Send the first SMS IMMEDIATELY to Layer 1 (offline-first)
    const trackingUrl = isOnline ? `${BACKEND_URL}/track/${predictiveSessionId}` : null;
    if (smsAllowed) {
        const layer1Contacts = contacts.filter((c) => (c.layer || 1) === 1);
        if (layer1Contacts.length > 0) {
            await sendEmergencySmsToAll(layer1Contacts, location, trackingUrl);
        } else {
            console.warn('No Layer 1 contacts found! Please assign contacts to Layer 1.');
        }
    }

    // If online, explicitly register this specific session ID with the backend
    if (isOnline) {
        try {
            await fetchWithTimeout(`${BACKEND_URL}/api/emergency/trigger`, {
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
        if (smsAllowed) {
            startOfflineSmsInterval(contacts);
        }
        watchForConnectivity(contacts, smsAllowed);
    }

    if (smsAllowed) {
        startSmsReplyPolling(contacts, onAcknowledge);
    }

    return { trackingUrl, sessionId: predictiveSessionId };
}

/**
 * CASE 1: Stream GPS to backend every 5 seconds.
 */
function startLocationStreaming(userId: string) {
    startLocationWatch(async (loc) => {
        try {
            await fetchWithTimeout(`${BACKEND_URL}/api/location/update`, {
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

    // Send to each contact in parallel, but do not block forever on any single number.
    const promises = contacts.map((c) => sendDirectSmsWithTimeout(c.phone, message));
    await Promise.allSettled(promises);
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
function watchForConnectivity(contacts: EmergencyContact[], smsAllowed: boolean) {
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
                    await fetchWithTimeout(`${BACKEND_URL}/api/emergency/trigger`, {
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
                    if (smsAllowed) {
                        await sendEmergencySmsToAll(contacts, loc, fullUrl);
                    }
                } catch {
                    // Still offline logically
                    if (smsAllowed) {
                        startOfflineSmsInterval(contacts);
                    }
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
            await fetchWithTimeout(`${BACKEND_URL}/api/location/update`, {
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
 * Native Android SMS Polling mapping incoming replies from contacts.
 */
function startSmsReplyPolling(contacts: EmergencyContact[], onAck?: () => void) {
    if (Platform.OS !== 'android') return;
    if (smsReplyInterval) clearInterval(smsReplyInterval);
    emergencyStartTime = Date.now();

    smsReplyInterval = setInterval(() => {
        // Strip formatting, get the last 10 digits
        const numbers = contacts.map(c => c.phone.replace(/\D/g, '').slice(-10)).filter(n => n.length >= 10);
        if (numbers.length === 0) return;

        const filter = {
            box: 'inbox',
            minDate: emergencyStartTime,
            maxDate: Date.now()
        };

        SmsAndroid.list(
            JSON.stringify(filter),
            (fail: any) => console.log('SmsAndroid.list failed', fail),
            (count: number, smsList: string) => {
                try {
                    const messages = JSON.parse(smsList);
                    for (const msg of messages) {
                        const senderStr = (msg.address || '').replace(/\D/g, '');
                        // If any sender ends with any of our contact numbers
                        if (numbers.some(num => senderStr.endsWith(num))) {
                            // Hit the acknowledgment condition!
                            if (smsReplyInterval) clearInterval(smsReplyInterval);
                            smsReplyInterval = null;

                            if (activeSessionId) {
                                fetch(`${BACKEND_URL}/api/emergency/acknowledge`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ session_id: activeSessionId })
                                }).catch(() => {});
                            }

                            // Trigger the UI cascade
                            stopEmergency();
                            if (onAck) onAck();
                            return; // Stop the interval loop
                        }
                    }
                } catch (e) {
                    console.log('Error parsing SMS list:', e);
                }
            }
        );
    }, 5000); // Check inbox every 5 seconds for a reply
}

/**
 * Stop all emergency activities.
 */
export async function stopEmergency() {
    stopLocationWatch();

    if (emergencyInterval) { clearInterval(emergencyInterval); emergencyInterval = null; }
    if (offlineSmsInterval) { clearInterval(offlineSmsInterval); offlineSmsInterval = null; }
    if (smsReplyInterval) { clearInterval(smsReplyInterval); smsReplyInterval = null; }

    if (activeSessionId) {
        try {
            await fetchWithTimeout(`${BACKEND_URL}/api/emergency/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: USER_ID, session_id: activeSessionId }),
            });
        } catch { /* ignore */ }
        activeSessionId = null;
    }
}

/**
 * Escalate the emergency to the specified tier (layer 2 or 3).
 */
export async function escalateEmergencyLayer(layer: number, trackingUrl: string | null = null) {
    if (!activeSessionId) return;
    
    const contacts = await loadContacts();
    const targetContacts = contacts.filter(c => (c.layer || 1) === layer);
    
    // Hit backend escalation webhook
    const netState = await NetInfo.fetch();
    if (netState.isConnected && netState.isInternetReachable) {
        try {
            await fetchWithTimeout(`${BACKEND_URL}/api/emergency/escalate-layer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: activeSessionId,
                    new_layer: layer
                }),
            });
        } catch (e) {
            console.warn("Could not reach backend for escalate-layer");
        }
    }

    // Fire SMS sequentially for this layer
    const location = await getCurrentLocation() || await loadLocation();
    if (targetContacts.length > 0 && location) {
       await sendEmergencySmsToAll(targetContacts, location, trackingUrl);
    }
}
