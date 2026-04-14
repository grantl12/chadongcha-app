/**
 * Identify — Reddit ID mini-game.
 * Shows a photo from r/whatisthiscar with 4 multiple-choice options.
 * Correct guess → XP (orbital boost applies).
 */

import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Image,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { usePlayerStore } from '@/stores/playerStore';

type IdCard = {
  id: string;
  imageUrl: string;
  redditAuthor: string | null;
  options: string[];
};

type GuessResult = {
  correct: boolean;
  correct_label: string;
  xp_earned: number;
  new_total_xp: number;
  new_level: number;
};

export default function IdentifyScreen() {
  const queryClient = useQueryClient();
  const applyXp     = usePlayerStore(s => s.applyXp);
  const setProfile  = usePlayerStore(s => s.setProfile);

  const [cardIndex, setCardIndex]   = useState(0);
  const [result, setResult]         = useState<GuessResult & { guessed: string } | null>(null);

  const { data: cards = [], isLoading, isError } = useQuery<IdCard[]>({
    queryKey: ['reddit-queue'],
    queryFn:  () => apiClient.get('/community/reddit-queue?limit=10') as Promise<IdCard[]>,
    staleTime: 5 * 60 * 1000,
  });

  const guessMutation = useMutation({
    mutationFn: ({ queueItemId, guessedLabel }: { queueItemId: string; guessedLabel: string }) =>
      apiClient.post('/community/reddit-guess', {
        queue_item_id: queueItemId,
        guessed_label: guessedLabel,
      }) as Promise<GuessResult>,
    onSuccess(data, variables) {
      setResult({ ...data, guessed: variables.guessedLabel });
      setProfile(data.new_total_xp, data.new_level);
    },
  });

  function handleGuess(card: IdCard, option: string) {
    if (result || guessMutation.isPending) return;
    guessMutation.mutate({ queueItemId: card.id, guessedLabel: option });
  }

  function handleNext() {
    setResult(null);
    guessMutation.reset();
    if (cardIndex + 1 >= cards.length) {
      // Refetch for more cards
      queryClient.invalidateQueries({ queryKey: ['reddit-queue'] });
      setCardIndex(0);
    } else {
      setCardIndex(i => i + 1);
    }
  }

  const card = cards[cardIndex];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>IDENTIFY</Text>
        <View style={styles.headerRight}>
          {cards.length > 0 && (
            <Text style={styles.counter}>{cardIndex + 1}/{cards.length}</Text>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#e63946" />
          <Text style={styles.hint}>Loading cars…</Text>
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.hint}>Could not load cars. Try again later.</Text>
        </View>
      ) : cards.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>ALL CAUGHT UP</Text>
          <Text style={styles.hint}>No cars to identify right now. Check back later.</Text>
        </View>
      ) : !card ? null : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Photo */}
          <View style={styles.photoWrap}>
            <Image
              source={{ uri: card.imageUrl }}
              style={styles.photo}
              resizeMode="cover"
            />
            {/* Result overlay */}
            {result && (
              <View style={[styles.resultOverlay, result.correct ? styles.resultCorrect : styles.resultWrong]}>
                <Text style={styles.resultEmoji}>{result.correct ? '✓' : '✗'}</Text>
                <Text style={styles.resultLabel}>
                  {result.correct ? 'CORRECT' : 'WRONG'}
                </Text>
                {result.correct && result.xp_earned > 0 && (
                  <Text style={styles.resultXp}>+{result.xp_earned} XP</Text>
                )}
              </View>
            )}
            {/* Attribution */}
            {card.redditAuthor && (
              <View style={styles.attribution}>
                <Text style={styles.attributionText}>📷 u/{card.redditAuthor} · r/whatisthiscar</Text>
              </View>
            )}
          </View>

          {/* Prompt */}
          <Text style={styles.prompt}>WHAT IS THIS CAR?</Text>

          {/* Options */}
          <View style={styles.options}>
            {card.options.map(option => {
              const isGuessed  = result?.guessed === option;
              const isCorrect  = result?.correct_label === option;
              const showRight  = !!result && isCorrect;
              const showWrong  = !!result && isGuessed && !result.correct;

              return (
                <Pressable
                  key={option}
                  style={[
                    styles.option,
                    showRight && styles.optionCorrect,
                    showWrong && styles.optionWrong,
                    !!result && !showRight && !showWrong && styles.optionDim,
                  ]}
                  onPress={() => handleGuess(card, option)}
                  disabled={!!result || guessMutation.isPending}
                >
                  <Text style={[
                    styles.optionText,
                    showRight && styles.optionTextCorrect,
                    showWrong && styles.optionTextWrong,
                  ]}>
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Reveal answer if wrong */}
          {result && !result.correct && (
            <View style={styles.answerReveal}>
              <Text style={styles.answerRevealLabel}>CORRECT ANSWER</Text>
              <Text style={styles.answerRevealValue}>{result.correct_label}</Text>
            </View>
          )}

          {/* Next button */}
          {result && (
            <Pressable style={styles.nextBtn} onPress={handleNext}>
              <Text style={styles.nextBtnText}>NEXT CAR →</Text>
            </Pressable>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:           { flex: 1, backgroundColor: '#0a0a0a' },
  header:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#141414' },
  backBtn:             { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText:            { color: '#555', fontSize: 22 },
  title:               { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 4 },
  headerRight:         { width: 36, alignItems: 'flex-end' },
  counter:             { color: '#333', fontSize: 12 },

  center:              { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  hint:                { color: '#444', fontSize: 14, textAlign: 'center' },
  emptyTitle:          { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 3 },

  scroll:              { padding: 20 },

  photoWrap:           { borderRadius: 12, overflow: 'hidden', backgroundColor: '#111', marginBottom: 24, position: 'relative' },
  photo:               { width: '100%', aspectRatio: 4 / 3 },
  resultOverlay:       { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 4 },
  resultCorrect:       { backgroundColor: 'rgba(34,197,94,0.7)' },
  resultWrong:         { backgroundColor: 'rgba(230,57,70,0.7)' },
  resultEmoji:         { fontSize: 40, color: '#fff' },
  resultLabel:         { fontSize: 18, fontWeight: '900', letterSpacing: 4, color: '#fff' },
  resultXp:            { fontSize: 14, fontWeight: '800', color: '#fff', marginTop: 2 },
  attribution:         { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 6 },
  attributionText:     { color: 'rgba(255,255,255,0.45)', fontSize: 10 },

  prompt:              { color: '#333', fontSize: 11, fontWeight: '800', letterSpacing: 3, marginBottom: 14 },

  options:             { gap: 10 },
  option:              { backgroundColor: '#141414', borderWidth: 1, borderColor: '#222', borderRadius: 10, paddingVertical: 16, paddingHorizontal: 20 },
  optionCorrect:       { backgroundColor: '#0a2a0a', borderColor: '#22c55e' },
  optionWrong:         { backgroundColor: '#2a0a0a', borderColor: '#e63946' },
  optionDim:           { opacity: 0.4 },
  optionText:          { color: '#fff', fontSize: 15, fontWeight: '700' },
  optionTextCorrect:   { color: '#22c55e' },
  optionTextWrong:     { color: '#e63946' },

  answerReveal:        { marginTop: 20, backgroundColor: '#111', borderRadius: 10, padding: 16, borderWidth: 1, borderColor: '#22c55e33' },
  answerRevealLabel:   { color: '#333', fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  answerRevealValue:   { color: '#22c55e', fontSize: 16, fontWeight: '800' },

  nextBtn:             { marginTop: 20, backgroundColor: '#e63946', borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  nextBtnText:         { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 2 },
});
