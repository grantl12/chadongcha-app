/**
 * Identify — vehicle ID mini-game.
 * Shows a mystery car photo with 4 multiple-choice options OR a text entry field.
 * Correct guess → XP (orbital boost applies).
 */

import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, Image,
  ActivityIndicator, ScrollView, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { usePlayerStore } from '@/stores/playerStore';

type IdCard = {
  id: string;
  imageUrl: string;
  author: string | null;
  options: string[];
  isTextEntry: boolean;
  source: 'scraped' | 'community';
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
  const setProfile  = usePlayerStore(s => s.setProfile);

  const [cardIndex, setCardIndex]   = useState(0);
  const [guessText, setGuessText]   = useState('');
  const [result, setResult]         = useState<GuessResult & { guessed: string } | null>(null);
  const inputRef = useRef<TextInput>(null);

  const { data: cards = [], isLoading, isError } = useQuery<IdCard[]>({
    queryKey: ['identify-queue'],
    queryFn:  () => apiClient.get('/community/identify-queue?limit=10') as Promise<IdCard[]>,
    staleTime: 5 * 60 * 1000,
  });

  const guessMutation = useMutation({
    mutationFn: ({ cardId, guess }: { cardId: string; guess: string }) =>
      apiClient.post('/community/identify-guess', {
        card_id: cardId,
        guess: guess,
      }) as Promise<GuessResult>,
    onSuccess(data, variables) {
      setResult({ ...data, guessed: variables.guess });
      setProfile(data.new_total_xp, data.new_level);
      if (data.correct) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
  });

  function handleGuess(card: IdCard, option?: string) {
    const finalGuess = option || guessText;
    if (!finalGuess.trim() || result || guessMutation.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    guessMutation.mutate({ cardId: card.id, guess: finalGuess });
  }

  function handleNext() {
    setResult(null);
    setGuessText('');
    guessMutation.reset();
    if (cardIndex + 1 >= cards.length) {
      queryClient.invalidateQueries({ queryKey: ['identify-queue'] });
      setCardIndex(0);
    } else {
      setCardIndex(i => i + 1);
    }
  }

  const card = cards[cardIndex];

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
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
            {card.author && (
              <View style={styles.attribution}>
                <Text style={styles.attributionText}>📷 {card.source === 'community' ? 'Community' : 'Archive'} · {card.author}</Text>
              </View>
            )}
          </View>

          {/* Prompt */}
          <Text style={styles.prompt}>WHAT IS THIS CAR?</Text>

          {/* Options / Text Entry */}
          {card.isTextEntry ? (
            <View style={styles.textEntryWrap}>
              <TextInput
                ref={inputRef}
                style={[
                  styles.input,
                  !!result && !result.correct && styles.inputWrong,
                  !!result && result.correct && styles.inputCorrect,
                ]}
                placeholder="Type your guess..."
                placeholderTextColor="#444"
                value={guessText}
                onChangeText={setGuessText}
                autoCorrect={false}
                autoCapitalize="words"
                editable={!result && !guessMutation.isPending}
                onSubmitEditing={() => handleGuess(card)}
              />
              {!result && (
                <Pressable 
                  style={[styles.submitBtn, !guessText.trim() && styles.submitBtnDisabled]} 
                  onPress={() => handleGuess(card)}
                  disabled={!guessText.trim() || guessMutation.isPending}
                >
                  <Text style={styles.submitBtnText}>GUESS</Text>
                </Pressable>
              )}
            </View>
          ) : (
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
          )}

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
    </KeyboardAvoidingView>
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

  textEntryWrap:       { gap: 12 },
  input:               { backgroundColor: '#141414', borderWidth: 1, borderColor: '#222', borderRadius: 10, paddingVertical: 16, paddingHorizontal: 20, color: '#fff', fontSize: 16, fontWeight: '600' },
  inputCorrect:        { borderColor: '#22c55e', color: '#22c55e' },
  inputWrong:          { borderColor: '#e63946', color: '#e63946' },
  submitBtn:           { backgroundColor: '#fff', borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  submitBtnDisabled:   { opacity: 0.2 },
  submitBtnText:       { color: '#000', fontWeight: '900', fontSize: 14, letterSpacing: 2 },

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
