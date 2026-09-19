import React, { useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { THEME, COLORS } from '../constants/theme';
import { useAppTheme } from '../context/ThemeContext';
import { useLocation } from '../context/LocationContext';
import { Divider, Kicker, OutlineButton } from './classical';
import { submitStudentCrowdReport } from '../services/data';
import { calculateDistance } from '../utils/distance';

const { spacing: SPACING, radius: RADIUS, type: TYPE } = THEME;

// Must match the 200m server-side check in submit_student_crowd_report — this
// is only a fast client-side pre-check so the user gets an instant "you're
// too far" message instead of waiting on a round trip that will just reject.
const MAX_REPORT_DISTANCE_MILES = 200 / 1609.34;

/** Shows a native/web alert the same way the rest of the app already does
 * (Alert.alert on native, window.alert on web — see LocationContext). */
function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

interface CrowdReportSheetProps {
  visible: boolean;
  cafeId: string;
  cafeName: string;
  cafeLatitude: number;
  cafeLongitude: number;
  onClose: () => void;
  onSubmitted: () => void;
}

type Step = 'confirm' | 'checking' | 'picker' | 'submitting';

export default function CrowdReportSheet({
  visible,
  cafeId,
  cafeName,
  cafeLatitude,
  cafeLongitude,
  onClose,
  onSubmitted,
}: CrowdReportSheetProps) {
  const { colors: C } = useAppTheme();
  const { requestLocationPermission } = useLocation();
  const [step, setStep] = useState<Step>('confirm');
  const [level, setLevel] = useState<number | null>(null);
  const [verifiedCoords, setVerifiedCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const reset = () => {
    setStep('confirm');
    setLevel(null);
    setVerifiedCoords(null);
    setErrorMsg(null);
  };

  const handleClose = () => {
    if (step === 'checking' || step === 'submitting') return;
    reset();
    onClose();
  };

  const handleCancel = () => {
    reset();
    onClose();
  };

  const handleAllow = async () => {
    setStep('checking');
    const result = await requestLocationPermission();

    if (!result.granted || result.latitude == null || result.longitude == null) {
      reset();
      onClose();
      notify('Location Required', 'Sorry, you cannot report a crowd level.');
      return;
    }

    const distanceMiles = calculateDistance(result.latitude, result.longitude, cafeLatitude, cafeLongitude);
    if (distanceMiles > MAX_REPORT_DISTANCE_MILES) {
      reset();
      onClose();
      notify('Too Far Away', `You need to be at ${cafeName} to report its crowd level.`);
      return;
    }

    setVerifiedCoords({ latitude: result.latitude, longitude: result.longitude });
    setStep('picker');
  };

  const handleSubmit = async () => {
    if (level == null || !verifiedCoords) return;
    setStep('submitting');
    setErrorMsg(null);
    try {
      await submitStudentCrowdReport(cafeId, level, verifiedCoords.latitude, verifiedCoords.longitude);
      reset();
      onClose();
      onSubmitted();
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to submit crowd level. Please try again.');
      setStep('picker');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Kicker>{cafeName}</Kicker>
              <Text style={[TYPE.display, styles.sheetTitle]}>Report Crowd Level</Text>
            </View>
            <Pressable onPress={handleClose} hitSlop={8} style={styles.closeBtn} disabled={step === 'checking' || step === 'submitting'}>
              <X size={16} color={C.textMuted} strokeWidth={1.8} />
            </Pressable>
          </View>

          <Divider style={{ marginVertical: SPACING.lg }} />

          {step === 'confirm' && (
            <View>
              <Text style={[TYPE.body, { color: C.text }]}>
                To report a crowd level, you must turn on your location so we can confirm you're at {cafeName}.
              </Text>
              <View style={styles.confirmRow}>
                <OutlineButton label="Cancel" variant="secondary" onPress={handleCancel} style={{ flex: 1 }} />
                <OutlineButton label="Allow" onPress={handleAllow} style={{ flex: 1 }} />
              </View>
            </View>
          )}

          {step === 'checking' && (
            <Text style={[TYPE.body, { color: C.textMuted }]}>Checking your location…</Text>
          )}

          {(step === 'picker' || step === 'submitting') && (
            <View>
              {errorMsg && (
                <Text style={[TYPE.metaSmall, { color: C.danger, marginBottom: SPACING.sm }]}>{errorMsg}</Text>
              )}
              <Kicker>What is the crowd level?</Kicker>
              <View style={styles.levelGrid}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
                  const active = level === n;
                  return (
                    <Pressable
                      key={n}
                      onPress={() => setLevel(n)}
                      disabled={step === 'submitting'}
                      style={[
                        styles.levelPill,
                        {
                          borderColor: active ? C.accent : C.hairlineStrong,
                          backgroundColor: active ? C.accent100 : 'transparent',
                        },
                      ]}
                    >
                      <Text style={[TYPE.kicker, { color: active ? C.accent700 : C.textSecondary }]}>{n}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <OutlineButton
                label={step === 'submitting' ? 'Submitting…' : 'Submit'}
                onPress={handleSubmit}
                disabled={level == null || step === 'submitting'}
                style={{ marginTop: SPACING.xl }}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.scrim,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.hairlineStrong,
    borderBottomWidth: 0,
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING.screen,
    paddingBottom: SPACING.xxl,
  },
  sheetTitle: {
    fontSize: 26,
    lineHeight: 30,
    color: COLORS.text,
    marginTop: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    margin: -14,
  },
  confirmRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xl,
  },
  levelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: SPACING.sm,
  },
  levelPill: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
