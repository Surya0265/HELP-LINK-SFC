import React, { useEffect, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { requestLocationPermission, getCurrentLocation, startLocationWatch } from '@/services/location';
import { loadLocation, CachedLocation } from '@/services/storage';

export default function LocationScreen() {
    const [location, setLocation] = useState<CachedLocation | null>(null);
    const [permissionGranted, setPermissionGranted] = useState(false);
    const [networkStatus, setNetworkStatus] = useState<'online' | 'offline'>('online');
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        init();
        const unsub = NetInfo.addEventListener((state) => {
            setNetworkStatus(state.isConnected && state.isInternetReachable ? 'online' : 'offline');
        });
        return () => unsub();
    }, []);

    const init = async () => {
        const granted = await requestLocationPermission();
        setPermissionGranted(granted);
        if (granted) {
            const loc = await getCurrentLocation();
            if (loc) setLocation(loc);
            // Watch for live updates
            startLocationWatch((updated) => setLocation(updated), 10000);
        } else {
            // Load cached
            const cached = await loadLocation();
            if (cached) setLocation(cached);
        }
    };

    const refresh = async () => {
        setRefreshing(true);
        const loc = await getCurrentLocation();
        if (loc) setLocation(loc);
        setRefreshing(false);
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#0f0f0f" />

            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>My Location</Text>
                <View style={[styles.netBadge, networkStatus === 'online' ? styles.online : styles.offline]}>
                    <Text style={styles.netText}>{networkStatus === 'online' ? 'Online' : 'Offline'}</Text>
                </View>
            </View>

            {/* Location Status */}
            <View style={styles.noMap}>
                {permissionGranted && location ? (
                    <View style={styles.locationInfo}>
                        <Text style={styles.locationLabel}>Current Coordinates</Text>
                        <Text style={styles.locationValue}>
                            {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                        </Text>
                        {location.accuracy && (
                            <Text style={styles.accuracyText}>
                                Accuracy: ±{location.accuracy.toFixed(1)}m
                            </Text>
                        )}
                    </View>
                ) : (
                    <Text style={styles.noMapText}>
                        {permissionGranted ? 'Fetching location...' : 'Location permission not granted.'}
                    </Text>
                )}
            </View>

            {/* Info Panel */}
            <ScrollView style={styles.infoPanel} contentContainerStyle={{ padding: 16 }}>
                <Row label="Latitude" value={location ? location.latitude.toFixed(6) : '—'} />
                <Row label="Longitude" value={location ? location.longitude.toFixed(6) : '—'} />
                <Row label="Accuracy" value={location?.accuracy ? `${location.accuracy.toFixed(0)} m` : '—'} />
                <Row label="Last Updated" value={location ? new Date(location.timestamp).toLocaleTimeString() : '—'} />
                <Row label="GPS Permission" value={permissionGranted ? 'Granted' : 'Denied'} />
                <Row label="Network" value={networkStatus === 'online' ? 'Connected' : 'No Internet'} />

                <TouchableOpacity style={styles.refreshBtn} onPress={refresh} disabled={refreshing}>
                    <Text style={styles.refreshText}>{refreshing ? 'Refreshing...' : 'Refresh Location'}</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.row}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowValue}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f0f0f' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingTop: 54, paddingBottom: 16,
        backgroundColor: '#1a1a1a', borderBottomWidth: 1, borderBottomColor: '#2a2a2a',
    },
    headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
    netBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    online: { backgroundColor: '#1a4a2e' },
    offline: { backgroundColor: '#4a1a1a' },
    netText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    noMap: {
        height: 240, backgroundColor: '#1a1a1a',
        alignItems: 'center', justifyContent: 'center',
        marginHorizontal: 16, marginTop: 16, borderRadius: 16,
        borderWidth: 1, borderColor: '#2a2a2a',
    },
    locationInfo: { alignItems: 'center' },
    locationLabel: { color: '#888', fontSize: 14, marginBottom: 8 },
    locationValue: { color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: 1 },
    accuracyText: { color: '#c0392b', fontSize: 13, marginTop: 12, fontWeight: '600' },
    noMapText: { color: '#555', fontSize: 14 },
    infoPanel: { flex: 1, backgroundColor: '#0f0f0f' },
    row: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
    },
    rowLabel: { color: '#888', fontSize: 13 },
    rowValue: { color: '#fff', fontSize: 13, fontWeight: '500' },
    refreshBtn: {
        backgroundColor: '#1a1a1a', borderRadius: 10, padding: 14,
        alignItems: 'center', marginTop: 20,
        borderWidth: 1, borderColor: '#2a2a2a',
    },
    refreshText: { color: '#c0392b', fontSize: 14, fontWeight: '700' },
});
