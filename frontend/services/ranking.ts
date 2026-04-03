import { PermissionsAndroid, Platform } from 'react-native';
import SmsAndroid from 'react-native-get-sms-android';
import CallLogs from 'react-native-call-log';

export interface RankedContact {
  phone: string;
  name: string;
  score: number;
}

const SCORE_SMS_MULTIPLIER = 5;
const SCORE_CALL_MINUTE_MULTIPLIER = 1;

/**
 * Normalizes phone numbers (e.g. +919876543210 -> +919876543210
 * and 09876543210 -> +919876543210) for pure matching comparison.
 */
function cleanPhone(num: string): string {
  try {
      let clean = num.replace(/[\s-]/g, '');
      if (clean.length === 10) clean = '+91' + clean;
      if (clean.startsWith('0') && clean.length === 11) clean = '+91' + clean.slice(1);
      if (clean.startsWith('91') && clean.length === 12) clean = '+' + clean;
      return clean;
  } catch {
      return num;
  }
}

/**
 * Run full scan on call and SMS logs, process scoring algorithm, and return descending rank array.
 */
export async function calculateSmartRankings(
    onProgress: (statusText: string) => void
): Promise<RankedContact[]> {
    if (Platform.OS !== 'android') {
        throw new Error('Ranking is only available on Android native builds.');
    }

    onProgress('Requesting permissions...');
    const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
        PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
        PermissionsAndroid.PERMISSIONS.READ_SMS
    ]);

    if (
      granted['android.permission.READ_CALL_LOG'] !== 'granted' || 
      granted['android.permission.READ_SMS'] !== 'granted'
    ) {
        throw new Error('Call/SMS log permissions denied.');
    }

    const scores = new Map<string, { name: string; score: number }>();

    try {
        onProgress('Analyzing call history...');
        // get up to 500 recent calls
        const logs = await CallLogs.load(500);
        
        for (let call of logs) {
            if (!call.phoneNumber) continue;
            
            const number = cleanPhone(call.phoneNumber);
            let current = scores.get(number) || { name: call.name || 'Unknown', score: 0 };
            
            // Score = Duration in minutes * Call Weight
            const durationMins = Math.max(1, call.duration / 60);
            current.score += durationMins * SCORE_CALL_MINUTE_MULTIPLIER;
            
            scores.set(number, current);
        }

        onProgress('Analyzing SMS conversations...');
        
        // Wrap SMS scan in promise since it uses callbacks
        await new Promise<void>((resolve, reject) => {
            const filter = {
                box: 'inbox', 
                maxCount: 1000,
            };
            SmsAndroid.list(
                JSON.stringify(filter),
                (fail: any) => reject(new Error('Failed to read SMS: ' + fail)),
                (count: number, smsList: string) => {
                    const messages = JSON.parse(smsList);
                    for (let sms of messages) {
                        if (!sms.address) continue;

                        const number = cleanPhone(sms.address);
                        // Filter out OTPs and bulk corporate SMS which usually don't have country codes or are text-only addresses
                        if (number.length < 10) continue; 
                        
                        let current = scores.get(number) || { name: 'Unknown', score: 0 };
                        // Score = Flat rate for every message
                        current.score += SCORE_SMS_MULTIPLIER;
                        scores.set(number, current);
                    }
                    resolve();
                }
            );
        });

        onProgress('Sorting results...');

        // Convert Map to array, filter out zeroes/short numbers, and sort descending
        const ranked: RankedContact[] = Array.from(scores.entries())
            .map(([phone, data]) => ({
                phone,
                name: data.name,
                score: Math.round(data.score)
            }))
            .filter(c => c.score > 0 && c.phone.length > 5)
            .sort((a, b) => b.score - a.score);

        return ranked;
    } catch (err: any) {
        throw new Error('Ranking failed: ' + err.message);
    }
}