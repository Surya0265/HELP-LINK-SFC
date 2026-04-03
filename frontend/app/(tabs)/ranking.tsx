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
      
      const ranked = await calculateSmartRankings((msg) => {
        setRankingProgress(msg);
        setRankingLogs(prev => [...prev, `[Processing] ${msg}`]);
      });

      setRankingLogs(prev => [...prev, `[Success] Found ${ranked.length} valid contacts.`]);
      
      const topRanked = ranked.slice(0, 5); // Take top 5
      const existingContacts = await loadContacts();
      const newContactsList = [...existingContacts];

      // Add avoiding duplicates. Hardcode ranking scanner additions to Layer 1.
      topRanked.forEach((r) => {
        if (!newContactsList.find((c) => c.phone === r.phone)) {
          newContactsList.push({ name: r.name, phone: r.phone, layer: 1 });
          setRankingLogs(prev => [...prev, `+ Matched & Added: ${r.name} (${r.phone})`]);
        } else {
          setRankingLogs(prev => [...prev, `- Skipped (Exists): ${r.name} (${r.phone})`]);
        }
      });
      
      await saveContacts(newContactsList);
      
      setRankingLogs(prev => [...prev, `[Done] Auto-detected and added ${topRanked.length} closest contacts.`]);
      setTimeout(() => {
        Alert.alert('Scan Complete', `Auto-detected and imported ${topRanked.length} closest contacts to your SOS list!`);
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
});