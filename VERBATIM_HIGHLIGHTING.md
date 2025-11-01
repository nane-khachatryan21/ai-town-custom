# Verbatim Text Highlighting Feature

## Overview

The verbatim highlighting feature automatically detects and highlights text in agent responses that is copied directly from the conversation context. This provides **transparency** by showing which parts of an AI agent's response are direct quotes from previous messages versus newly generated content.

## How It Works

### Visual Indicators

When an agent responds, any text that appears **verbatim** (word-for-word) from previous messages in the conversation will be highlighted with:

1. **Yellow highlight** background (subtle gradient)
2. **Underline** in amber/orange color
3. **Hover effect** - brighter highlight when you hover over it
4. **Tooltip** - Shows which message the text was quoted from

### Example

**Previous messages in conversation:**
- Human: "What do you think about climate change policy?"
- Agent A: "Climate change is the most pressing issue of our time"

**Agent B's response:**
> "I agree that climate change is the most pressing issue of our time, and we need immediate action."

**Display:**
> "I agree that <mark style="background: rgba(255, 220, 0, 0.3);">climate change is the most pressing issue of our time</mark>, and we need immediate action."

The highlighted portion shows it was copied from Agent A's message.

## Technical Implementation

### Files Created

1. **`src/utils/highlightVerbatim.ts`**
   - Core algorithm for detecting verbatim matches
   - `findVerbatimMatches()` - Main detection function
   - `TextSegment` interface - Represents highlighted/non-highlighted text segments

2. **`src/components/HighlightedMessage.tsx`**
   - React component that displays messages with highlighting
   - Two variants: `HighlightedMessage` and `SimpleHighlightedMessage`

3. **CSS in `src/index.css`**
   - `.verbatim-highlight` class with gradient and hover effects

### Files Modified

1. **`src/components/Messages.tsx`**
   - Integrated `HighlightedMessage` component
   - Passes conversation context to each message
   - Only highlights AI agent messages (not human messages)

## Features

### Smart Detection

The algorithm:
- ✅ Finds phrases of 4+ consecutive words that match exactly
- ✅ Ignores case and minor formatting differences
- ✅ Merges consecutive matches for cleaner display
- ✅ Only compares with messages from OTHER participants
- ✅ Tracks which specific message was the source

### Configuration

You can adjust the sensitivity in `highlightVerbatim.ts`:

```typescript
// Minimum number of words for a match
const minLength = 4; // Default

// Change to 3 for more sensitive detection
// Change to 5 for less sensitive detection
```

### Performance

- **Efficient**: Only processes messages visible in the conversation
- **Real-time**: Updates as new messages arrive
- **Lightweight**: Minimal computational overhead

## Usage

### Enable/Disable Highlighting

In `Messages.tsx`, the `showHighlights` prop controls highlighting:

```typescript
<HighlightedMessage
  text={m.text}
  contextMessages={contextMessages}
  authorName={m.authorName}
  showHighlights={m.author !== humanPlayerId} // Only AI messages
/>
```

**To disable highlighting entirely:**
```typescript
showHighlights={false}
```

**To highlight all messages (including human):**
```typescript
showHighlights={true}
```

### Customizing Appearance

Edit `src/index.css` to change the highlighting style:

```css
.verbatim-highlight {
  /* Change background color */
  background: linear-gradient(...);
  
  /* Change underline color */
  border-bottom: 2px solid rgba(255, 200, 0, 0.6);
  
  /* Change hover effect */
}

.verbatim-highlight:hover {
  background: rgba(255, 240, 150, 0.5);
}
```

## Use Cases

### 1. **Transparency in AI Conversations**
Shows when agents are repeating information vs. generating new insights

### 2. **Fact-Checking**
Easily see which facts/quotes came from previous context

### 3. **Debugging**
Identify when agents are over-relying on verbatim copying

### 4. **Research**
Analyze how AI agents integrate and transform information

## Examples

### High Verbatim Usage
When an agent heavily quotes previous messages:

```
Agent: "As you mentioned, climate change is urgent. 
        As discussed earlier, we need policy reform.
        Like you said, action is critical."
```
→ Most text will be highlighted (high verbatim ratio)

### Low Verbatim Usage
When an agent generates mostly original content:

```
Agent: "I believe we should consider a multi-faceted approach 
        combining economic incentives with regulatory frameworks."
```
→ Little or no highlighting (original response)

### Mixed Usage
Typical case with quotes and new content:

```
Agent: "While it's true that action is critical, I would add that 
        international cooperation must be prioritized alongside 
        domestic policy changes."
```
→ "action is critical" highlighted, rest is original

## Testing

### Manual Testing

1. **Start a conversation** between two agents
2. **Have Agent A say something specific**: "The sky is blue today"
3. **Agent B responds**: "Yes, the sky is blue today, and I enjoy it"
4. **Expected result**: "the sky is blue today" should be highlighted in Agent B's message

### Test Cases

#### Test 1: Simple Verbatim
- Message 1: "Hello world"
- Message 2: "Hello world to you too"
- **Expected**: "Hello world" highlighted in Message 2

#### Test 2: Partial Verbatim
- Message 1: "Climate change is a serious issue"
- Message 2: "I agree that climate change is serious"
- **Expected**: "climate change is" highlighted (partial match)

#### Test 3: No Verbatim
- Message 1: "What's your opinion?"
- Message 2: "I think differently about this matter"
- **Expected**: No highlighting

#### Test 4: Multiple Sources
- Message 1: "We need action"
- Message 2: "Climate is changing"  
- Message 3: "Yes, we need action and climate is changing rapidly"
- **Expected**: Both "we need action" and "climate is changing" highlighted in Message 3

## Limitations

1. **Minimum Length**: Phrases must be 4+ words to be detected (prevents highlighting common short phrases)

2. **Exact Match Required**: Text must match exactly (case-insensitive)
   - ✅ Detects: "climate change is urgent" → "Climate Change Is Urgent"
   - ❌ Doesn't detect: "climate change" → "climate crisis"

3. **Same-Author Exclusion**: Doesn't highlight when agents quote their own previous messages

4. **Context Window**: Only checks messages earlier in the same conversation (not from other conversations or memories)

## Future Enhancements

Potential improvements:

1. **Fuzzy Matching**: Detect paraphrased content (not just exact matches)
2. **Memory Integration**: Highlight text from long-term memories, not just conversation
3. **Source Attribution**: Click highlighted text to jump to source message
4. **Statistics**: Show verbatim ratio for each agent
5. **Color Coding**: Different colors for different source messages
6. **Toggle Button**: UI control to show/hide highlighting

## Troubleshooting

### Highlighting Not Showing

1. **Check** `showHighlights` prop is `true`
2. **Verify** message is from an AI agent (not human)
3. **Ensure** there are previous messages in the conversation
4. **Check** verbatim phrases are 4+ words long

### Too Much Highlighting

- **Increase** `minLength` in `findVerbatimMatches()` to require longer phrases
- **Example**: Change from 4 to 6 words minimum

### Too Little Highlighting

- **Decrease** `minLength` to detect shorter phrases
- **Example**: Change from 4 to 3 words minimum

### Performance Issues

- The algorithm is optimized, but with 100+ messages might slow down
- **Solution**: Limit context to last N messages:

```typescript
const contextMessages = messages
  .slice(Math.max(0, index - 20), index) // Last 20 messages only
  .filter((prevMsg) => prevMsg.author !== m.author)
  .map((prevMsg) => prevMsg.text);
```

## API Reference

### `findVerbatimMatches()`

```typescript
function findVerbatimMatches(
  outputText: string,      // The message to analyze
  contextMessages: string[], // Previous messages to check against
  minLength: number = 4    // Minimum words for a match
): TextSegment[]
```

**Returns**: Array of text segments, each marked as verbatim or not

### `TextSegment` Interface

```typescript
interface TextSegment {
  text: string;           // The actual text
  isVerbatim: boolean;    // Whether it's copied verbatim
  sourceIndex?: number;   // Index of source message (if verbatim)
}
```

### `HighlightedMessage` Component

```typescript
<HighlightedMessage
  text={string}              // Message text to display
  contextMessages={string[]} // Previous messages for comparison
  authorName={string}        // Name of message author
  showHighlights={boolean}   // Whether to show highlighting
/>
```

## Summary

✅ **Implemented**: Verbatim text highlighting in agent conversations
✅ **Visual**: Yellow highlight with amber underline
✅ **Smart**: Only highlights meaningful phrases (4+ words)
✅ **Efficient**: Real-time detection with minimal overhead
✅ **Transparent**: Shows users what's quoted vs. generated

This feature enhances transparency in AI-to-AI conversations by making it clear when agents are quoting previous messages versus generating new content.

---

**Note**: This feature is automatically enabled for all AI agent messages. Human messages are not highlighted to reduce visual clutter.

