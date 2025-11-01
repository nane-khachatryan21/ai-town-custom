/**
 * Utility to detect and highlight verbatim text from context in LLM outputs
 * Now uses fuzzy matching to detect similar phrases, not just exact matches
 */

export interface TextSegment {
  text: string;
  isVerbatim: boolean;
  sourceIndex?: number; // Index of the source message it came from
  similarity?: number; // Similarity score (0-1) for fuzzy matches
}

/**
 * Calculate similarity between two strings based on word overlap
 * Returns a value between 0 (no similarity) and 1 (identical)
 */
function calculateSimilarity(phrase1: string, phrase2: string): number {
  const words1 = phrase1.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const words2 = phrase2.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  // Count matching words
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  const intersection = new Set([...set1].filter(w => set2.has(w)));
  
  // Jaccard similarity: intersection / union
  const union = new Set([...set1, ...set2]);
  const jaccardSimilarity = intersection.size / union.size;
  
  // Also consider sequential overlap (words in order)
  let sequentialMatches = 0;
  for (let i = 0; i < Math.min(words1.length, words2.length); i++) {
    if (words1[i] === words2[i]) sequentialMatches++;
  }
  const sequentialScore = sequentialMatches / Math.max(words1.length, words2.length);
  
  // Combined score (70% Jaccard, 30% sequential)
  return jaccardSimilarity * 0.7 + sequentialScore * 0.3;
}

/**
 * Find all fuzzy matches between output text and context messages
 * Uses similarity scoring to detect paraphrased or similar content
 */
export function findVerbatimMatches(
  outputText: string,
  contextMessages: string[],
  minLength: number = 3, // Minimum number of words to consider
  similarityThreshold: number = 0.6, // Minimum similarity (0-1) to highlight
): TextSegment[] {
  const segments: TextSegment[] = [];
  const words = outputText.split(/\s+/).filter(w => w.length > 0);
  let currentIndex = 0;

  while (currentIndex < words.length) {
    let bestMatch: { 
      length: number; 
      sourceIndex: number; 
      similarity: number;
      contextPhrase: string;
    } | null = null;

    // Try to find the best fuzzy match starting from current position
    for (let sourceIndex = 0; sourceIndex < contextMessages.length; sourceIndex++) {
      const contextWords = contextMessages[sourceIndex].split(/\s+/).filter(w => w.length > 0);

      // Try different phrase lengths
      for (let phraseLength = Math.min(15, words.length - currentIndex); phraseLength >= minLength; phraseLength--) {
        const outputPhrase = words.slice(currentIndex, currentIndex + phraseLength).join(' ');

        // Compare with sliding window in context
        for (let contextStart = 0; contextStart <= contextWords.length - phraseLength; contextStart++) {
          const contextPhrase = contextWords.slice(contextStart, contextStart + phraseLength).join(' ');
          const similarity = calculateSimilarity(outputPhrase, contextPhrase);

          // Check if this is a good match
          if (similarity >= similarityThreshold) {
            if (!bestMatch || 
                similarity > bestMatch.similarity || 
                (similarity === bestMatch.similarity && phraseLength > bestMatch.length)) {
              bestMatch = { 
                length: phraseLength, 
                sourceIndex, 
                similarity,
                contextPhrase 
              };
            }
          }
        }
      }
    }

    if (bestMatch) {
      // Add the matched segment
      const matchedText = words.slice(currentIndex, currentIndex + bestMatch.length).join(' ');
      segments.push({
        text: matchedText,
        isVerbatim: true,
        sourceIndex: bestMatch.sourceIndex,
        similarity: bestMatch.similarity,
      });
      currentIndex += bestMatch.length;
    } else {
      // No match found, add as non-verbatim (just the current word)
      segments.push({
        text: words[currentIndex],
        isVerbatim: false,
      });
      currentIndex++;
    }
  }

  // Merge consecutive non-verbatim segments
  return mergeConsecutiveSegments(segments);
}

/**
 * Merge consecutive segments of the same type for cleaner output
 */
function mergeConsecutiveSegments(segments: TextSegment[]): TextSegment[] {
  if (segments.length === 0) return segments;

  const merged: TextSegment[] = [];
  let current = segments[0];

  for (let i = 1; i < segments.length; i++) {
    const next = segments[i];

    // Merge if same type and (if verbatim) from same source
    if (
      current.isVerbatim === next.isVerbatim &&
      (!current.isVerbatim || current.sourceIndex === next.sourceIndex)
    ) {
      current = {
        ...current,
        text: current.text + ' ' + next.text,
      };
    } else {
      merged.push(current);
      current = next;
    }
  }

  merged.push(current);
  return merged;
}

/**
 * Simple verbatim detection - just checks if phrases exist in context
 * More lenient than exact word-by-word matching
 */
export function highlightSimpleVerbatim(
  outputText: string,
  contextMessages: string[],
  minLength: number = 4, // Minimum characters for a match
): TextSegment[] {
  // For very short outputs, just return as non-verbatim
  if (outputText.length < minLength) {
    return [{ text: outputText, isVerbatim: false }];
  }

  // Try increasingly smaller substrings to find matches
  const segments: TextSegment[] = [];
  let remaining = outputText;
  let position = 0;

  while (position < outputText.length) {
    let foundMatch = false;

    // Try to find longest substring match
    for (let length = Math.min(200, outputText.length - position); length >= minLength; length--) {
      const substring = outputText.substring(position, position + length);

      // Check if this substring appears in any context message
      let sourceIndex = -1;
      for (let i = 0; i < contextMessages.length; i++) {
        if (contextMessages[i].includes(substring)) {
          sourceIndex = i;
          break;
        }
      }

      if (sourceIndex >= 0) {
        // Found a match
        if (segments.length > 0 && !segments[segments.length - 1].isVerbatim) {
          // Finalize the previous non-verbatim segment
          const prev = segments[segments.length - 1];
          prev.text = outputText.substring(
            position - prev.text.length,
            position,
          );
        }

        segments.push({
          text: substring,
          isVerbatim: true,
          sourceIndex,
        });

        position += length;
        foundMatch = true;
        break;
      }
    }

    if (!foundMatch) {
      // No match found, add to non-verbatim segment
      if (segments.length === 0 || segments[segments.length - 1].isVerbatim) {
        segments.push({
          text: outputText[position],
          isVerbatim: false,
        });
      } else {
        // Extend the last non-verbatim segment
        segments[segments.length - 1].text += outputText[position];
      }
      position++;
    }
  }

  return segments;
}

