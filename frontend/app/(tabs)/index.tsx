import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ScrollView, TextInput, StatusBar, ActivityIndicator, Platform,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { requestLocationPermission, getCurrentLocation } from '@/services/location';
import { triggerEmergency, stopEmergency, activeSessionId } from '@/services/emergency';
import { loadContacts, saveContacts, EmergencyContact, loadLocation } from '@/services/storage';
import { useFocusEffect } from 'expo-router';

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs)),
  ]);
}

export default function HomeScreen() {
  const [isEmergency, setIsEmergency] = useState(false);
  const [loading, setLoading] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<'online' | 'offline'>('online');
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [selectedLayer, setSelectedLayer] = useState(1);
  const [lastLocation, setLastLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

  useFocusEffect(
    useCallback(() => {
      // Reload contacts every time this screen gains focus
      loadContacts().then(setContacts);
    }, [])
  );

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
      const result = await withTimeout(
        triggerEmergency(),
        20000,
        'Emergency request timed out. Please try again.'
      );
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
    const name = newName.trim();
    let phone = newPhone.trim();
    if (!name || !phone) return;

    // Validate and clean phone number
    phone = phone.replace(/[\s-]/g, '');
    if (!/^(?:\+91|91)?[6-9]\d{9}$/.test(phone)) {
      Alert.alert('Invalid Number', 'Please enter a valid 10-digit Indian phone number.');
      return;
    }
    
    // Format to standard +91 length
    if (phone.length === 10) phone = '+91' + phone;
    else if (phone.length === 12 && phone.startsWith('91')) phone = '+' + phone;

    const updated = [...contacts, { name, phone, layer: selectedLayer }];
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
          <Text style={styles.sectionTitle}>Emergency Contact Layers</Text>
          <Text style={styles.emptyText}>Contacts are escalated layer by layer if no response is detected.</Text>

          {contacts.length === 0 && (
            <Text style={styles.emptyText}>No contacts added yet. Add below.</Text>
          )}

          {[1, 2, 3].map((layer) => {
            const layerContacts = contacts.filter((c) => (c.layer || 1) === layer);
            return (
              <View key={layer} style={styles.layerBubble}>
                <View style={styles.layerHeader}>
                  <Text style={styles.layerTitle}>Layer {layer}</Text>
                  <Text style={styles.layerSubtitle}>{layerContacts.length} contacts</Text>
                </View>
                
                {layerContacts.map((c, i) => {
                  const globalIndex = contacts.indexOf(c);
                  return (
                    <View key={globalIndex} style={styles.contactItem}>
                      <View>
                        <Text style={styles.contactName}>{c.name}</Text>
                        <Text style={styles.contactPhone}>{c.phone}</Text>
                      </View>
                      <TouchableOpacity onPress={() => removeContact(globalIndex)} style={styles.removeBtn}>
                        <Text style={styles.removeText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            );
          })}

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

            <View style={styles.layerSelector}>
              <Text style={styles.layerSelectLabel}>Assign to Layer:</Text>
              <View style={styles.layerOptions}>
                {[1, 2, 3].map((l) => (
                  <TouchableOpacity
                    key={l}
                    style={[styles.layerOptionBtn, selectedLayer === l && styles.layerOptionBtnActive]}
                    onPress={() => setSelectedLayer(l)}
                  >
                    <Text style={[styles.layerOptionText, selectedLayer === l && styles.layerOptionTextActive]}>
                      Layer {l}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

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
  scroll: { padding: 20, paddingBottom: 120 },
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
  layerBubble: {
    backgroundColor: '#111', borderRadius: 16, padding: 14,
    marginBottom: 20, borderWidth: 1, borderColor: '#333',
    shadowColor: '#000', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.5, shadowRadius: 8, elevation: 8,
  },
  layerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    marginBottom: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#222'
  },
  layerTitle: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  layerSubtitle: { color: '#666', fontSize: 12, fontWeight: '600' },
  contactItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#1a1a1a', borderRadius: 10, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: '#2a2a2a',
  },
  contactName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  contactPhone: { color: '#888', fontSize: 12, marginTop: 2 },
  removeBtn: { backgroundColor: '#3a1a1a', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  removeText: { color: '#e74c3c', fontSize: 12 },
  addForm: { marginTop: 12, backgroundColor: '#1a1a1a', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#222' },
  input: {
    backgroundColor: '#0a0a0a', color: '#fff', borderRadius: 10,
    padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#2a2a2a', fontSize: 14,
  },
  layerSelector: { flexDirection: 'column', marginBottom: 16, marginTop: 8 },
  layerSelectLabel: { color: '#888', fontSize: 13, marginBottom: 8, fontWeight: '600' },
  layerOptions: { flexDirection: 'row', justifyContent: 'space-between' },
  layerOptionBtn: {
    flex: 1, paddingVertical: 10, marginHorizontal: 4, borderRadius: 8,
    borderWidth: 1, borderColor: '#333', backgroundColor: '#0a0a0a', alignItems: 'center'
  },
  layerOptionBtnActive: { borderColor: '#e74c3c', backgroundColor: '#2c1412' },
  layerOptionText: { color: '#666', fontSize: 12, fontWeight: '700' },
  layerOptionTextActive: { color: '#e74c3c' },
  addBtn: {
    backgroundColor: '#c0392b', borderRadius: 10, padding: 14, alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
