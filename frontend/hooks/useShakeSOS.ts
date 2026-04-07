import { useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';
import { Vibration, Platform } from 'react-native';

const SHAKE_THRESHOLD = 3.0; // Needs a deliberate hard shake
const SHAKE_COOLDOWN_MS = 600; // Minimum time between counted "shakes"
const CONFIRMATION_WINDOW_MS = 5000; // 5 seconds to shake again

export default function useShakeSOS(
  isActive: boolean,
  onAwaitingConfirmation: () => void,
  onTriggerSOS: () => void,
  onCancel: () => void
) {
  const shakeCount = useRef(0);
  const lastShakeTime = useRef(0);
  const awaitingConfirmation = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // If not active (e.g. SOS is already running or we want to disable it entirely), 
    // clear everything.
    if (!isActive) {
      Vibration.cancel();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      shakeCount.current = 0;
      awaitingConfirmation.current = false;
      return;
    }

    // Set polling rate to 10 times a second for snappy detection
    Accelerometer.setUpdateInterval(100);

    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      // Calculate total physical force vector
      const gForce = Math.sqrt(x * x + y * y + z * z);

      if (gForce > SHAKE_THRESHOLD) {
        const now = Date.now();
        // Prevent bouncing/chatter during a single shake
        if (now - lastShakeTime.current > SHAKE_COOLDOWN_MS) {
          lastShakeTime.current = now;
          shakeCount.current += 1;

          if (shakeCount.current === 2 && !awaitingConfirmation.current) {
            // First 2 shakes recorded. Fire warning sequence.
            awaitingConfirmation.current = true;
            onAwaitingConfirmation();
            
            // Continuous heavy pulsing
            Vibration.vibrate([0, 500, 200, 500], true); // true = loop indefinitely

            // If user doesn't confirm within 5 seconds, cancel it out
            timeoutRef.current = setTimeout(() => {
              Vibration.cancel();
              shakeCount.current = 0;
              awaitingConfirmation.current = false;
              onCancel(); // Tell UI to hide the warning
            }, CONFIRMATION_WINDOW_MS);

          } else if (shakeCount.current >= 4 && awaitingConfirmation.current) {
            // Shake confirmed! Fire it.
            Vibration.cancel();
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            shakeCount.current = 0;
            awaitingConfirmation.current = false;
            
            onTriggerSOS();
          }
        }
      }
    });

    return () => {
      subscription.remove();
      Vibration.cancel();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isActive, onAwaitingConfirmation, onTriggerSOS, onCancel]);
}
