import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { THEME } from '../constants/theme';
import Ionicons from '@expo/vector-icons/Ionicons';

interface RatingModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (quietness: number, aesthetics: number) => Promise<void>;
  initialQuietness?: number;
  initialAesthetics?: number;
  cafeName: string;
}

export const RatingModal: React.FC<RatingModalProps> = ({
  visible,
  onClose,
  onSubmit,
  initialQuietness = 2,
  initialAesthetics = 3,
  cafeName,
}) => {
  const colorScheme = (useColorScheme() ?? 'light') as 'light' | 'dark';
  const themeColors = THEME.colors[colorScheme];

  const [quietness, setQuietness] = useState<number>(initialQuietness);
  const [aesthetics, setAesthetics] = useState<number>(initialAesthetics);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(quietness, aesthetics);
      onClose();
    } catch (err) {
      console.error('Error submitting rating:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, { backgroundColor: themeColors.surface }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: themeColors.text }]}>Rate {cafeName}</Text>
            <Pressable onPress={onClose} disabled={submitting}>
              <Ionicons name="close" size={24} color={themeColors.textMuted} />
            </Pressable>
          </View>

          {/* Quietness selection (Scale 1-3) */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>
              1. Quietness Level
            </Text>
            <View style={styles.optionsRow}>
              {[
                { val: 1, label: 'Loud 🔊' },
                { val: 2, label: 'Moderate 🔉' },
                { val: 3, label: 'Quiet 🤫' },
              ].map((item) => (
                <Pressable
                  key={item.val}
                  onPress={() => setQuietness(item.val)}
                  style={[
                    styles.optionBtn,
                    {
                      backgroundColor:
                        quietness === item.val
                          ? themeColors.primary
                          : themeColors.surfaceMuted,
                      borderColor:
                        quietness === item.val
                          ? themeColors.primary
                          : themeColors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.optionText,
                      { color: quietness === item.val ? '#FFF' : themeColors.text },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Aesthetics selection (Scale 1-5) */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>
              2. Cafe Study Vibe & Aesthetic
            </Text>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable key={star} onPress={() => setAesthetics(star)} style={styles.starBtn}>
                  <Ionicons
                    name={star <= aesthetics ? 'star' : 'star-outline'}
                    size={36}
                    color={star <= aesthetics ? '#F59E0B' : themeColors.textLight}
                  />
                </Pressable>
              ))}
            </View>
            <Text style={[styles.starDesc, { color: themeColors.textLight }]}>
              {aesthetics === 1 && 'Dull / Distracting'}
              {aesthetics === 2 && 'Average Study Spot'}
              {aesthetics === 3 && 'Nice Vibe / Cozy'}
              {aesthetics === 4 && 'Inspiring / Modern Design'}
              {aesthetics === 5 && 'Perfect Study Paradise'}
            </Text>
          </View>

          {/* Submit Action */}
          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={[
              styles.submitBtn,
              { backgroundColor: themeColors.primary },
              submitting && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.submitBtnText}>
              {submitting ? 'Submitting Rating...' : 'Submit Rating'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: THEME.spacing.lg,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 360,
    borderRadius: THEME.roundness.md,
    padding: THEME.spacing.lg,
    alignItems: 'stretch',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.lg,
  },
  title: {
    fontSize: THEME.typography.sizes.md,
    fontWeight: 'bold',
  },
  section: {
    marginBottom: THEME.spacing.xl,
  },
  sectionTitle: {
    fontSize: THEME.typography.sizes.xs,
    fontWeight: 'bold',
    marginBottom: THEME.spacing.sm,
    letterSpacing: 0.5,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: THEME.spacing.sm,
  },
  optionBtn: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: THEME.roundness.sm,
    alignItems: 'center',
  },
  optionText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  starRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginVertical: THEME.spacing.xs,
  },
  starBtn: {
    padding: 2,
  },
  starDesc: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: THEME.spacing.xs,
  },
  submitBtn: {
    paddingVertical: 12,
    borderRadius: THEME.roundness.md,
    alignItems: 'center',
    marginTop: THEME.spacing.xs,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: THEME.typography.sizes.sm,
    fontWeight: 'bold',
  },
});
export default RatingModal;
