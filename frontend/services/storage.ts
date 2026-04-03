import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCATION_KEY = 'helplink_last_location';
const CONTACTS_KEY = 'helplink_contacts';
const QUEUE_KEY = 'helplink_offline_queue';

export interface CachedLocation {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    timestamp: string;
}

export interface EmergencyContact {
    name: string;
    phone: string;
    layer?: number;
}

// --- Location Cache ---

export async function saveLocation(location: CachedLocation): Promise<void> {
    await AsyncStorage.setItem(LOCATION_KEY, JSON.stringify(location));
}

export async function loadLocation(): Promise<CachedLocation | null> {
    const raw = await AsyncStorage.getItem(LOCATION_KEY);
    return raw ? JSON.parse(raw) : null;
}

// --- Contacts ---

export async function saveContacts(contacts: EmergencyContact[]): Promise<void> {
    await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
}

export async function loadContacts(): Promise<EmergencyContact[]> {
    const raw = await AsyncStorage.getItem(CONTACTS_KEY);
    return raw ? JSON.parse(raw) : [];
}

// --- Offline Alert Queue ---

export interface QueuedAlert {
    latitude: number;
    longitude: number;
    timestamp: string;
    contacts: EmergencyContact[];
}

export async function enqueueAlert(alert: QueuedAlert): Promise<void> {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue: QueuedAlert[] = raw ? JSON.parse(raw) : [];
    queue.push(alert);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function loadQueue(): Promise<QueuedAlert[]> {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
}

export async function clearQueue(): Promise<void> {
    await AsyncStorage.removeItem(QUEUE_KEY);
}
