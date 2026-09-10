import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { X } from 'lucide-react-native';
import { THEME } from '../constants/theme';
import { Divider, Kicker, OutlineButton, Chip } from './classical';

const { colors: C, spacing: SPACING, radius: RADIUS, type: TYPE } = THEME;

/**
 * One bottom sheet, two modes — replaces the old RatingModal + ReviewModal.
 * See design handoff README, "3. Rate / Note sheet".
 */

const NOISE_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Loud' },
  { value: 2, label: 'Moderate' },
  { value: 3, label: 'Quiet' },
];

const STAR_WORDS = [
  '',
  'Dull or distracting',
  'An average spot',
  'Nice room, cozy',
  'Inspiring, well designed',
  'A study paradise',
];

interface RateNoteSheetProps {
  visible: boolean;
  mode: 'rate' | 'note';
  cafeName: string;
  initialQuietness?: number;
  initialAesthetics?: number;
  onClose: () => void;
  onSubmitRating: (quietness: number, aesthetics: number) => Promise<void>;
  onSubmitNote: (text: string) => Promise<void>;
}

export default function RateNoteSheet({
  visible,
  mode,
  cafeName,
  initialQuietness = 3,
  initialAesthetics = 4,
  onClose,
  onSubmitRating,
  onSubmitNote,
}: RateNoteSheetProps) {
  const [quietness, setQuietness] = useState(initialQuietness);
  const [stars, setStars] = useState(initialAesthetics);
  const [noteText, setNoteText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleClose = () => {
    if (submitting) return;
    setNoteText('');
    setErrorMsg(null);
    onClose();
  };

  const handleSubmitRating = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onSubmitRating(quietness, stars);
      handleClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save your rating. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitNote = async () => {
    const trimmed = noteText.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onSubmitNote(trimmed);
      handleClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to post your note. Please try again.');
    } finally {
      setSubmitting(false);
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
              <Text style={[TYPE.display, styles.sheetTitle]}>
                {mode === 'rate' ? 'Rate this room' : 'Leave a note'}
              </Text>
            </View>
            <Pressable onPress={handleClose} hitSlop={8} style={styles.closeBtn} disabled={submitting}>
              <X size={16} color={C.textMuted} strokeWidth={1.8} />
            </Pressable>
          </View>

          <Divider style={{ marginVertical: SPACING.lg }} />

          {errorMsg && (
            <Text style={[TYPE.metaSmall, { color: C.danger, marginBottom: SPACING.sm }]}>{errorMsg}</Text>
          )}

          {mode === 'rate' ? (
            <View>
              <Kicker>Noise while you were there</Kicker>
              <View style={styles.noiseRow}>
                {NOISE_OPTIONS.map((o) => (
                  <Chip
                    key={o.value}
                    label={o.label}
                    active={quietness === o.value}
                    onPress={() => setQuietness(o.value)}
                    style={{ flex: 1, minHeight: 46 }}
                  />
                ))}
              </View>

              <Kicker style={{ marginTop: SPACING.xl }}>Study vibe</Kicker>
              <View style={styles.starRow}>
                {[1, 2, 3, 4, 5].map((v) => (
                  <Pressable key={v} onPress={() => setStars(v)} style={styles.starBtn}>
                    <Text style={{ fontSize: 26, lineHeight: 26, color: v <= stars ? C.accent : C.hairlineStrong }}>★</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[TYPE.bodyTight, styles.starWord]}>{STAR_WORDS[stars]}</Text>

              <OutlineButton
                label={submitting ? 'Submitting…' : 'Submit Rating'}
                onPress={handleSubmitRating}
                disabled={submitting}
                style={{ marginTop: SPACING.xl }}
              />
            </View>
          ) : (
            <View>
              <TextInput
                style={styles.textInput}
                multiline
                maxLength={1000}
                placeholder="Tell other students what the room was like…"
                placeholderTextColor={C.textLight}
                value={noteText}
                onChangeText={(t) => {
                  setNoteText(t);
                  if (errorMsg) setErrorMsg(null);
                }}
                editable={!submitting}
                textAlignVertical="top"
              />
              <View style={styles.noteFooter}>
                <Text style={[TYPE.metaSmall, { color: C.textMuted }]}>Up to 2 notes a day.</Text>
                <Text style={[TYPE.metaSmall, { color: C.textMuted }]}>{noteText.length} / 1000</Text>
              </View>
              <OutlineButton
                label={submitting ? 'Posting…' : 'Post Note'}
                onPress={handleSubmitNote}
                disabled={submitting || !noteText.trim()}
                style={{ marginTop: SPACING.lg }}
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
    backgroundColor: C.scrim,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.hairlineStrong,
    borderBottomWidth: 0,
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING.screen,
    paddingBottom: SPACING.xxl,
  },
  sheetTitle: {
    fontSize: 26,
    lineHeight: 30,
    color: C.text,
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
  noiseRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: SPACING.sm,
  },
  starRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    alignItems: 'center',
  },
  starBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starWord: {
    fontStyle: 'italic',
    color: C.textSecondary,
    marginTop: SPACING.sm,
  },
  textInput: {
    minHeight: 124,
    borderWidth: 1,
    borderColor: C.hairlineStrong,
    borderRadius: RADIUS.md,
    backgroundColor: C.surfaceAlt,
    padding: SPACING.md,
    ...TYPE.body,
    color: C.text,
  },
  noteFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
});
