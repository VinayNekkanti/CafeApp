import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { THEME } from '../constants/theme';

interface ReviewModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reviewText: string) => Promise<void>;
  cafeName: string;
}

export const ReviewModal: React.FC<ReviewModalProps> = ({
  visible,
  onClose,
  onSubmit,
  cafeName,
}) => {
  const colorScheme = (useColorScheme() ?? 'light') as 'light' | 'dark';
  const themeColors = THEME.colors[colorScheme];

  const [reviewText, setReviewText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = reviewText.trim();
    if (!trimmed) {
      setErrorMsg('Please write a review before submitting.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await onSubmit(trimmed);
      setSuccessMsg('Review submitted!');
      setTimeout(() => {
        setReviewText('');
        setSuccessMsg(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Error submitting review:', err);
      setErrorMsg(err.message || 'Failed to submit review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setReviewText('');
    setErrorMsg(null);
    setSuccessMsg(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleCol}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>How was your experience here?</Text>
              <Text style={[styles.modalSubtitle, { color: themeColors.textMuted }]} numberOfLines={1}>
                {cafeName}
              </Text>
            </View>
            <Pressable
              onPress={handleClose}
              disabled={submitting}
              style={[styles.closeBtn, { backgroundColor: themeColors.surfaceMuted }]}
            >
              <Ionicons name="close" size={20} color={themeColors.textMuted} />
            </Pressable>
          </View>

          {/* Success Banner */}
          {successMsg && (
            <View style={[styles.banner, { backgroundColor: themeColors.success + '1F', borderColor: themeColors.success }]}>
              <Ionicons name="checkmark-circle" size={18} color={themeColors.success} />
              <Text style={[styles.bannerText, { color: themeColors.success }]}>{successMsg}</Text>
            </View>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <View style={[styles.banner, { backgroundColor: themeColors.dangerLight || '#FEE2E2', borderColor: themeColors.danger }]}>
              <Ionicons name="alert-circle" size={18} color={themeColors.danger} />
              <Text style={[styles.bannerText, { color: themeColors.danger }]}>{errorMsg}</Text>
            </View>
          )}

          {/* Review Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={[
                styles.textInput,
                {
                  color: themeColors.text,
                  backgroundColor: themeColors.surfaceMuted,
                  borderColor: themeColors.border,
                },
              ]}
              multiline
              numberOfLines={5}
              maxLength={1000}
              placeholder="Tell other students what your experience was like..."
              placeholderTextColor={themeColors.textLight}
              value={reviewText}
              onChangeText={(text) => {
                setReviewText(text);
                if (errorMsg) setErrorMsg(null);
              }}
              editable={!submitting && !successMsg}
              textAlignVertical="top"
            />
            <Text style={[styles.charCounter, { color: themeColors.textLight }]}>
              {reviewText.length} / 1000
            </Text>
          </View>

          {/* Submit Button */}
          <Pressable
            onPress={handleSubmit}
            disabled={submitting || !reviewText.trim() || !!successMsg}
            style={({ pressed }) => [
              styles.submitBtn,
              {
                backgroundColor:
                  submitting || !reviewText.trim() || !!successMsg
                    ? themeColors.surfaceMuted
                    : themeColors.primary,
              },
              pressed && { opacity: 0.9 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text
                style={[
                  styles.submitBtnText,
                  {
                    color:
                      submitting || !reviewText.trim() || !!successMsg
                        ? themeColors.textLight
                        : '#FFF',
                  },
                ]}
              >
                Submit Review
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
    zIndex: 99999,
    elevation: 9999,
  },
  modalCard: {
    borderTopLeftRadius: THEME.roundness.lg,
    borderTopRightRadius: THEME.roundness.lg,
    borderWidth: 1,
    padding: THEME.spacing.lg,
    gap: THEME.spacing.md,
    zIndex: 100000,
    elevation: 10000,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleCol: {
    flex: 1,
    marginRight: THEME.spacing.sm,
  },
  modalTitle: {
    fontSize: THEME.typography.sizes.md,
    fontWeight: 'bold',
  },
  modalSubtitle: {
    fontSize: THEME.typography.sizes.xs,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: THEME.spacing.sm,
    borderRadius: THEME.roundness.md,
    borderWidth: 1,
    gap: THEME.spacing.xs,
  },
  bannerText: {
    fontSize: THEME.typography.sizes.xs,
    fontWeight: '600',
    flex: 1,
  },
  inputContainer: {
    gap: 4,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: THEME.roundness.md,
    padding: THEME.spacing.md,
    minHeight: 120,
    fontSize: THEME.typography.sizes.sm,
  },
  charCounter: {
    fontSize: 10,
    textAlign: 'right',
  },
  submitBtn: {
    height: 48,
    borderRadius: THEME.roundness.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: THEME.spacing.xs,
  },
  submitBtnText: {
    fontSize: THEME.typography.sizes.sm,
    fontWeight: 'bold',
  },
});

export default ReviewModal;
