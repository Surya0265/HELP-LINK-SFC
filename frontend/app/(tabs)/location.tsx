import React, { useEffect, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
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

            {/* Map */}
            {permissionGranted && location ? (
                <MapView
                    style={styles.map}
                    provider={PROVIDER_GOOGLE}
                    region={{
                        latitude: location.latitude,
                        longitude: location.longitude,
                        latitudeDelta: 0.005,
                        longitudeDelta: 0.005,
                    }}
                >
                    <Marker
                        coordinate={{ latitude: location.latitude, longitude: location.longitude }}
                        title="My Location"
                        description={`Accuracy: ${location.accuracy?.toFixed(0) ?? '?'} m`}
                        pinColor="#c0392b"
                    />
                </MapView>
            ) : (
                <View style={styles.noMap}>
                    <Text style={styles.noMapText}>
                        {permissionGranted ? 'Fetching location...' : 'Location permission not granted.'}
                    </Text>
                </View>
            )}

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
    map: { height: 320 },
    noMap: {
        height: 320, backgroundColor: '#1a1a1a',
        alignItems: 'center', justifyContent: 'center',
    },
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
