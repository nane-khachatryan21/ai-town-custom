import React from 'react';
import { findVerbatimMatches, TextSegment } from '../utils/highlightVerbatim';

interface HighlightedMessageProps {
  text: string;
  contextMessages: string[];
  authorName: string;
  showHighlights?: boolean;
}

/**
 * Component that displays a message with verbatim text from context highlighted
 */
export function HighlightedMessage({
  text,
  contextMessages,
  authorName,
  showHighlights = true,
}: HighlightedMessageProps) {
  // Don't highlight if disabled or no context
  if (!showHighlights || contextMessages.length === 0) {
    return <p className="bg-white -mx-3 -my-1">{text}</p>;
  }

  // Use fuzzy matching with 60% similarity threshold
  // minWords=3, similarityThreshold=0.6 (60% similar)
  const segments = findVerbatimMatches(text, contextMessages, 3, 0.6);

  // Check if there are any verbatim segments
  const hasVerbatim = segments.some((s) => s.isVerbatim);

  // Debug logging (can be removed after testing)
  if (process.env.NODE_ENV === 'development') {
    console.log('[Highlight Debug - Fuzzy]', {
      author: authorName,
      text: text.substring(0, 50) + '...',
      contextCount: contextMessages.length,
      segmentsFound: segments.length,
      hasVerbatim,
      verbatimSegments: segments
        .filter(s => s.isVerbatim)
        .map(s => ({ text: s.text.substring(0, 30), similarity: s.similarity })),
    });
  }

  if (!hasVerbatim) {
    // No matches, render normally
    return <p className="bg-white -mx-3 -my-1">{text}</p>;
  }

  return (
    <p className="bg-white -mx-3 -my-1">
      {segments.map((segment, index) => {
        if (segment.isVerbatim) {
          // Color intensity based on similarity score
          const similarity = segment.similarity ?? 1;
          const opacity = Math.max(0.2, similarity * 0.4); // 20% to 40% opacity
          const borderOpacity = Math.max(0.4, similarity * 0.8); // 40% to 80% opacity
          
          return (
            <span
              key={index}
              className="verbatim-highlight"
              title={`Similar to previous message #${(segment.sourceIndex ?? 0) + 1} (${Math.round(similarity * 100)}% match)`}
              style={{
                backgroundColor: `rgba(255, 255, 0, ${opacity})`,
                borderBottom: `2px solid rgba(255, 200, 0, ${borderOpacity})`,
                padding: '0 2px',
                borderRadius: '2px',
                cursor: 'help',
              }}
            >
              {segment.text}
            </span>
          );
        }
        return <span key={index}>{segment.text}</span>;
      })}
    </p>
  );
}

/**
 * Simpler version with just underline highlighting
 */
export function SimpleHighlightedMessage({
  text,
  contextMessages,
  showHighlights = true,
}: {
  text: string;
  contextMessages: string[];
  showHighlights?: boolean;
}) {
  if (!showHighlights || contextMessages.length === 0) {
    return <p className="bg-white -mx-3 -my-1">{text}</p>;
  }

  const segments = findVerbatimMatches(text, contextMessages, 4);
  const hasVerbatim = segments.some((s) => s.isVerbatim);

  if (!hasVerbatim) {
    return <p className="bg-white -mx-3 -my-1">{text}</p>;
  }

  return (
    <p className="bg-white -mx-3 -my-1">
      {segments.map((segment, index) =>
        segment.isVerbatim ? (
          <mark
            key={index}
            style={{
              backgroundColor: 'transparent',
              textDecoration: 'underline',
              textDecorationColor: '#f59e0b',
              textDecorationThickness: '2px',
              textDecorationStyle: 'solid',
            }}
            title="Quoted from context"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </p>
  );
}

