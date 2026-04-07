import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ScrollView, StatusBar, ActivityIndicator, Platform,
} from 'react-native';
import { loadContacts, saveContacts } from '@/services/storage';
import { calculateSmartRankings } from '@/services/ranking';
import { Ionicons } from '@expo/vector-icons';

export default function RankingScreen() {
  const [isRanking, setIsRanking] = useState(false);
  const [rankingProgress, setRankingProgress] = useState('');
  const [scannedGroups, setScannedGroups] = useState<{name: string; phone: string; layer: number}[]>([]);
  const [rankingLogs, setRankingLogs] = useState<string[]>([
    '[System] Ready to run Auto-Detect Sequence.',
    '[System] Press the START ALGORITHM button below to begin.'
  ]);
  const scrollRef = useRef<ScrollView>(null);

  const startRanking = async () => {
    try {
      setIsRanking(true);
      setRankingLogs(['[System] Initializing Smart Ranking Algorithm...']);
      setRankingProgress('Initializing...');
      setScannedGroups([]);
      
      const ranked = await calculateSmartRankings((msg) => {
        setRankingProgress(msg);
        setRankingLogs(prev => [...prev, `[Processing] ${msg}`]);
      });

      setRankingLogs(prev => [...prev, `[Success] Found ${ranked.length} valid contacts.`]);
      
      const topRanked = ranked.slice(0, 20); // Take top 20 contacts for multiple layers
      const existingContacts = await loadContacts();
      const newContactsList = [...existingContacts];
      const newlyAdded: {name: string; phone: string; layer: number}[] = [];

      // Add avoiding duplicates. Distribute into layers 1, 2, and 3.
      topRanked.forEach((r, index) => {
        // Top 7: Layer 1 | Next 7: Layer 2 | Remainder (6): Layer 3
        const assignedLayer = index < 7 ? 1 : index < 14 ? 2 : 3;

        if (!newContactsList.find((c) => c.phone === r.phone)) {
          newContactsList.push({ name: r.name, phone: r.phone, layer: assignedLayer });
          newlyAdded.push({ name: r.name, phone: r.phone, layer: assignedLayer });
          setRankingLogs(prev => [...prev, `+ Layer ${assignedLayer} Mapping: ${r.name} (${r.phone})`]);
        } else {
          setRankingLogs(prev => [...prev, `- Skipped (Exists): ${r.name} (${r.phone})`]);
        }
      });
      
      await saveContacts(newContactsList);
      setScannedGroups(newlyAdded);
      
      setRankingLogs(prev => [...prev, `[Done] Auto-detected and structured ${topRanked.length} closest contacts into layers.`]);
      setTimeout(() => {
        Alert.alert('Scan Complete', `Auto-detected and imported ${topRanked.length} closest contacts into your SOS layers!`);
        setIsRanking(false);
      }, 1000);
      
    } catch (e: any) {
      setRankingLogs(prev => [...prev, `[Error] ${e.message}`]);
      Alert.alert('Ranking Error', e.message || 'Failed to rank contacts.');
      setIsRanking(false);
    } finally {
      setRankingProgress('');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f0f0f" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Smart Scanner</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.infoCard}>
          <Ionicons name="hardware-chip" size={32} color="#1E90FF" style={styles.infoIcon} />
          <Text style={styles.infoTitle}>AI Emergency Routing</Text>
          <Text style={styles.infoText}>
            Our native engine will scan your on-device call logs and SMS history right now to determine who you interact with the most. 
          </Text>
          <Text style={styles.infoTextSub}>
            Your data never leaves this device. This process runs entirely offline.
          </Text>
        </View>

        <TouchableOpacity 
          style={[styles.autoRankBtn, isRanking && styles.autoRankDisabled]} 
          onPress={startRanking}
          disabled={isRanking}
        >
          <Text style={styles.autoRankBtnText}>
             {isRanking ? 'SCAN IN PROGRESS...' : 'START ALGORITHM'}
          </Text>
        </TouchableOpacity>

        {/* Scanned Layer Bubbles output */}
        {scannedGroups.length > 0 && (
          <View style={styles.bubblesContainer}>
            <Text style={styles.bubblesHeader}>Auto-Assigned Escalation</Text>
            <View style={styles.bubblesRow}>
              {[1, 2, 3].map((layer) => {
                const inLayer = scannedGroups.filter(c => c.layer === layer);
                if (inLayer.length === 0) return null;
                return (
                  <View key={layer} style={[styles.bubbleWrapper, layer === 1 ? styles.b1 : layer === 2 ? styles.b2 : styles.b3]}>
                    <Text style={styles.bubbleLayerTitle}>Layer {layer}</Text>
                    {inLayer.map((ct, idx) => (
                      <Text key={idx} style={styles.bubbleContactName} numberOfLines={1}>{ct.name}</Text>
                    ))}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Live Visualization Terminal */}
        <View style={styles.terminalContainer}>
          <View style={styles.terminalHeader}>
            <Text style={styles.terminalTitle}>LIVE PROCESSING LOGS</Text>
            {rankingProgress ? <ActivityIndicator size="small" color="#2ecc71" /> : null}
          </View>
          <ScrollView 
            style={styles.terminalBody} 
            showsVerticalScrollIndicator={false}
            ref={scrollRef}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({animated: true})}
          >
            {rankingLogs.map((log, index) => (
              <Text key={index} style={styles.terminalLogLine}>
                <Text style={styles.terminalLogPrefix}>{'>'}</Text> {log}
              </Text>
            ))}
            {rankingProgress && (
              <Text style={styles.terminalLogLine}>
                <Text style={styles.terminalLogPrefix}>_</Text> {rankingProgress}...
              </Text>
            )}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: {
    paddingHorizontal: 20, paddingTop: 54, paddingBottom: 16,
    backgroundColor: '#1a1a1a', borderBottomWidth: 1, borderBottomColor: '#2a2a2a',
    alignItems: 'center'
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  scroll: { padding: 20, paddingBottom: 120 },
  infoCard: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 20,
    marginBottom: 20, borderWidth: 1, borderColor: '#2a2a2a',
    alignItems: 'center'
  },
  infoIcon: { marginBottom: 12 },
  infoTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  infoText: { color: '#aaa', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  infoTextSub: { color: '#666', fontSize: 11, textAlign: 'center', marginTop: 12, fontStyle: 'italic' },
  
  autoRankBtn: {
    backgroundColor: '#1E90FF', borderRadius: 12, padding: 18, alignItems: 'center',
    shadowColor: '#1E90FF', shadowOpacity: 0.3, shadowRadius: 5, elevation: 4,
    marginBottom: 20
  },
  autoRankDisabled: { backgroundColor: '#2a2a2a', shadowOpacity: 0, elevation: 0 },
  autoRankBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 1 },
  
  terminalContainer: {
    backgroundColor: '#0a0a0a', borderRadius: 12,
    borderWidth: 1, borderColor: '#333', overflow: 'hidden', height: 280,
  },
  terminalHeader: {
    backgroundColor: '#1a1a1a', flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#333',
  },
  terminalTitle: { color: '#aaa', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  terminalBody: { padding: 16, flex: 1 },
  terminalLogLine: { color: '#00ff00', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12, marginBottom: 6, lineHeight: 18 },
  terminalLogPrefix: { color: '#555', fontWeight: 'bold' },
  
  bubblesContainer: {
    marginBottom: 20,
    backgroundColor: '#111', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#333'
  },
  bubblesHeader: { color: '#aaa', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 12, textAlign: 'center' },
  bubblesRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  bubbleWrapper: { 
    flex: 1, borderRadius: 100, paddingVertical: 18, paddingHorizontal: 10,
    alignItems: 'center', justifyContent: 'center', minHeight: 100,
    borderWidth: 1.5 
  },
  b1: { backgroundColor: 'rgba(231, 76, 60, 0.1)', borderColor: '#e74c3c' }, // Red (Critical)
  b2: { backgroundColor: 'rgba(243, 156, 18, 0.1)', borderColor: '#f39c12' }, // Orange (Secondary)
  b3: { backgroundColor: 'rgba(52, 152, 219, 0.1)', borderColor: '#3498db' }, // Blue (Fallback)
  bubbleLayerTitle: { color: '#fff', fontSize: 14, fontWeight: '800', marginBottom: 4 },
  bubbleContactName: { color: '#ccc', fontSize: 11, textAlign: 'center', marginVertical: 2, fontWeight: '600' }
});