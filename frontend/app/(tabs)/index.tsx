import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ScrollView, TextInput, StatusBar, ActivityIndicator,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { requestLocationPermission, getCurrentLocation } from '@/services/location';
import { triggerEmergency, stopEmergency, activeSessionId } from '@/services/emergency';
import { loadContacts, saveContacts, EmergencyContact, loadLocation } from '@/services/storage';

export default function HomeScreen() {
  const [isEmergency, setIsEmergency] = useState(false);
  const [loading, setLoading] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<'online' | 'offline'>('online');
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [lastLocation, setLastLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    // Request location permission on startup
    requestLocationPermission().then((granted) => {
      setPermissionGranted(granted);
      if (granted) {
        getCurrentLocation().then((loc) => {
          if (loc) setLastLocation({ lat: loc.latitude, lng: loc.longitude });
        });
      }
    });

    // Load saved contacts
    loadContacts().then(setContacts);

    // Monitor network
    const unsub = NetInfo.addEventListener((state) => {
      setNetworkStatus(state.isConnected && state.isInternetReachable ? 'online' : 'offline');
    });
    return () => unsub();
  }, []);

  const handleSOS = async () => {
    if (isEmergency) {
      // Stop emergency
      await stopEmergency();
      setIsEmergency(false);
      setTrackingUrl(null);
      Alert.alert('Emergency Stopped', 'Your emergency has been cancelled.');
      return;
    }

    if (!permissionGranted) {
      Alert.alert('Permission Needed', 'Please allow location access to use the SOS feature.');
      return;
    }

    if (contacts.length === 0) {
      Alert.alert('No Contacts', 'Please add at least one emergency contact below before using SOS.');
      return;
    }

    setLoading(true);
    try {
      const result = await triggerEmergency();
      setIsEmergency(true);
      setTrackingUrl(result.trackingUrl);

      const loc = await loadLocation();
      if (loc) setLastLocation({ lat: loc.latitude, lng: loc.longitude });

      Alert.alert(
        'Emergency Activated',
        networkStatus === 'online'
          ? 'Live tracking SMS sent to your emergency contacts!'
          : 'Offline SMS sent with your location. Will switch to live tracking when internet returns.',
        [{ text: 'OK' }]
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not trigger emergency. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const addContact = async () => {
    if (!newName.trim() || !newPhone.trim()) return;
    const updated = [...contacts, { name: newName.trim(), phone: newPhone.trim() }];
    setContacts(updated);
    await saveContacts(updated);
    setNewName('');
    setNewPhone('');
  };

  const removeContact = async (index: number) => {
    const updated = contacts.filter((_, i) => i !== index);
    setContacts(updated);
    await saveContacts(updated);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f0f0f" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>HelpLink:SFC</Text>
        <View style={[styles.networkBadge, networkStatus === 'online' ? styles.online : styles.offline]}>
          <Text style={styles.networkText}>{networkStatus === 'online' ? 'Online' : 'Offline'}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* GPS Status */}
        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>GPS Status</Text>
          <Text style={styles.statusValue}>
            {permissionGranted
              ? lastLocation
                ? `${lastLocation.lat.toFixed(5)}, ${lastLocation.lng.toFixed(5)}`
                : 'Fetching...'
              : 'Permission required'}
          </Text>
        </View>

        {/* Tracking URL display */}
        {isEmergency && trackingUrl && (
          <View style={styles.trackingCard}>
            <Text style={styles.trackingLabel}>Live Tracking Active</Text>
            <Text style={styles.trackingUrl}>{trackingUrl}</Text>
          </View>
        )}

        {/* SOS Button */}
        <TouchableOpacity
          style={[styles.sosButton, isEmergency && styles.sosButtonActive]}
          onPress={handleSOS}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <>
              <Text style={styles.sosText}>{isEmergency ? 'STOP' : 'SOS'}</Text>
              <Text style={styles.sosSubtext}>
                {isEmergency ? 'Tap to cancel emergency' : 'Tap to trigger emergency'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Emergency Contacts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Emergency Contacts</Text>

          {contacts.length === 0 && (
            <Text style={styles.emptyText}>No contacts added yet. Add below.</Text>
          )}

          {contacts.map((c, i) => (
            <View key={i} style={styles.contactItem}>
              <View>
                <Text style={styles.contactName}>{c.name}</Text>
                <Text style={styles.contactPhone}>{c.phone}</Text>
              </View>
              <TouchableOpacity onPress={() => removeContact(i)} style={styles.removeBtn}>
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* Add contact form */}
          <View style={styles.addForm}>
            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor="#666"
              value={newName}
              onChangeText={setNewName}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone number"
              placeholderTextColor="#666"
              value={newPhone}
              onChangeText={setNewPhone}
              keyboardType="phone-pad"
            />
            <TouchableOpacity style={styles.addBtn} onPress={addContact}>
              <Text style={styles.addBtnText}>Add Contact</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
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
  networkBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  online: { backgroundColor: '#1a4a2e' },
  offline: { backgroundColor: '#4a1a1a' },
  networkText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  scroll: { padding: 20, paddingBottom: 40 },
  statusCard: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: '#2a2a2a',
  },
  statusLabel: { color: '#888', fontSize: 12, marginBottom: 4 },
  statusValue: { color: '#fff', fontSize: 14, fontWeight: '500' },
  trackingCard: {
    backgroundColor: '#1a2a1a', borderRadius: 12, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: '#2ecc71',
  },
  trackingLabel: { color: '#2ecc71', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  trackingUrl: { color: '#aaa', fontSize: 12 },
  sosButton: {
    backgroundColor: '#c0392b', borderRadius: 120, width: 200, height: 200,
    alignSelf: 'center', alignItems: 'center', justifyContent: 'center',
    marginVertical: 32,
    shadowColor: '#c0392b', shadowOpacity: 0.5, shadowRadius: 20, elevation: 12,
  },
  sosButtonActive: { backgroundColor: '#555' },
  sosText: { color: '#fff', fontSize: 48, fontWeight: '900', letterSpacing: 2 },
  sosSubtext: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 },
  section: { marginTop: 8 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  emptyText: { color: '#555', fontSize: 13, marginBottom: 12 },
  contactItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#1a1a1a', borderRadius: 10, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: '#2a2a2a',
  },
  contactName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  contactPhone: { color: '#888', fontSize: 12, marginTop: 2 },
  removeBtn: { backgroundColor: '#3a1a1a', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  removeText: { color: '#e74c3c', fontSize: 12 },
  addForm: { marginTop: 12 },
  input: {
    backgroundColor: '#1a1a1a', color: '#fff', borderRadius: 10,
    padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#2a2a2a', fontSize: 14,
  },
  addBtn: {
    backgroundColor: '#c0392b', borderRadius: 10, padding: 14, alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
