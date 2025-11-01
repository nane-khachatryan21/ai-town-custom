# Troubleshooting Verbatim Highlighting

## Issue: Highlighting Not Showing in UI

### Quick Fixes Applied

I've improved the highlighting system with these changes:

#### 1. **Made Detection Case-Insensitive**
- Now matches regardless of capitalization
- "Climate Change" will match "climate change"

#### 2. **Lowered Minimum Word Count**
- Changed from 4 words minimum to 3 words
- Detects shorter phrases now

#### 3. **Added Debug Logging**
- Open browser console (F12)
- Look for `[Highlight Debug]` logs
- Shows: text, context count, segments found, whether verbatim detected

#### 4. **Improved Algorithm**
- Filters empty strings
- Limits max phrase length (20 words) for performance
- Better handling of whitespace

### How to Test

#### Option 1: Check Browser Console

1. **Open your app**: `npm run dev`
2. **Open browser console** (F12 or Cmd+Option+I)
3. **Start a conversation** between agents
4. **Watch console** for logs like:
```javascript
[Highlight Debug] {
  author: "Agent Name",
  text: "I agree that...",
  contextCount: 2,
  segmentsFound: 5,
  hasVerbatim: true,
  segments: [...]
}
```

#### Option 2: Use Test Component

Add this to your `App.tsx` temporarily:

```typescript
import { HighlightTest } from './components/HighlightTest';

// In your render:
<HighlightTest />
```

This shows a standalone test with known context/messages.

### Debugging Checklist

#### ✅ Check 1: Are Messages from AI Agents?
- Highlighting only works on AI agent messages
- Human messages are NOT highlighted (by design)
- **Fix**: Look at agent-to-agent conversations

#### ✅ Check 2: Is There Previous Context?
- Highlighting requires previous messages
- First message in conversation won't be highlighted
- **Fix**: Wait for 2+ messages in conversation

#### ✅ Check 3: Are Phrases Long Enough?
- Minimum 3 consecutive words required
- Short 1-2 word matches are ignored
- **Fix**: Look for longer matching phrases

#### ✅ Check 4: Do Phrases Actually Match?
- Must be exact word-for-word match (case-insensitive)
- "climate change is urgent" matches "Climate Change Is Urgent"
- Does NOT match paraphrases
- **Fix**: Check console logs to see what's being compared

#### ✅ Check 5: CSS Loading?
- Yellow highlight might not show if CSS isn't loaded
- **Fix**: Check if `.verbatim-highlight` class exists:
```javascript
// In browser console:
document.querySelector('.verbatim-highlight')
```

### Common Scenarios

#### Scenario 1: "No highlighting appears at all"

**Possible causes:**
1. All messages are from humans (highlighting disabled for humans)
2. No phrases match (agents generating original content)
3. Phrases too short (under 3 words)

**Debug:**
- Check console for `[Highlight Debug]` logs
- Look at `hasVerbatim: false` → no matches found
- Look at `contextCount: 0` → no context available

#### Scenario 2: "Highlighting appears but looks wrong"

**Possible causes:**
1. CSS not applied correctly
2. Background color not visible on white

**Fix:**
- Check inline styles are applied
- Each highlighted span should have:
  ```css
  background-color: rgba(255, 255, 0, 0.3)
  border-bottom: 2px solid rgba(255, 200, 0, 0.6)
  ```

#### Scenario 3: "Only some matches are highlighted"

**Expected behavior:**
- Algorithm finds longest matches first
- Shorter overlapping matches are skipped
- This is normal and intentional

### Manual Test Case

Try this specific test:

1. **Human says**: "The weather is nice today"
2. **Agent A responds**: "Yes, the weather is nice today and I agree"
3. **Expected**: "the weather is nice today" highlighted in Agent A's message

If this doesn't work:
- Check console logs for that message
- Verify `contextCount > 0`
- Verify `hasVerbatim: true`

### Inspection Tools

#### Check if Component is Rendering

```javascript
// In browser console:
// Check if HighlightedMessage is being used
document.querySelectorAll('.bg-white.-mx-3.-my-1')
```

#### Check Segments Being Generated

The debug logs show the segments array:
```javascript
segments: [
  { text: "I agree that", isVerbatim: false },
  { text: "climate change is urgent", isVerbatim: true, sourceIndex: 0 },
  { text: "and we must act", isVerbatim: false }
]
```

### Still Not Working?

#### Force-Enable Test Mode

Edit `src/components/HighlightedMessage.tsx`:

```typescript
// Temporarily force highlighting on ALL messages
const segments = findVerbatimMatches(text, contextMessages, 2); // Lower to 2 words

// Always show debug
console.log('[Highlight Debug]', {
  author: authorName,
  text,
  contextMessages,
  segments,
  hasVerbatim: segments.some(s => s.isVerbatim)
});
```

#### Create Synthetic Test

In `Messages.tsx`, temporarily add fake context:

```typescript
// TEMP: Add fake context for testing
const contextMessages = [
  ...messages.slice(0, index).filter(/* ... */).map(/* ... */),
  "This is a test phrase for highlighting purposes" // Add this
];
```

Then have an agent say "This is a test phrase" and it should highlight.

### Quick Verification Script

Run this in browser console when viewing a conversation:

```javascript
// Find all message bubbles
const messages = document.querySelectorAll('.bubble p');
console.log('Total messages:', messages.length);

// Check for highlights
const highlights = document.querySelectorAll('.verbatim-highlight');
console.log('Highlighted segments:', highlights.length);

// Show what's highlighted
highlights.forEach((h, i) => {
  console.log(`Highlight ${i+1}:`, h.textContent);
});
```

### Expected Output

When working correctly, you should see:
1. ✅ Console logs: `[Highlight Debug]` for each agent message
2. ✅ Yellow highlights visible in message bubbles
3. ✅ Hover shows tooltip: "Quoted from previous message #N"
4. ✅ Underline in amber color

### Performance Note

If conversations are very long (50+ messages):
- Detection might slow down
- Solution: Limit context to last 20 messages
- Edit `Messages.tsx`:

```typescript
const contextMessages = messages
  .slice(Math.max(0, index - 20), index) // Last 20 only
  .filter((prevMsg) => prevMsg.author !== m.author)
  .map((prevMsg) => prevMsg.text);
```

### Contact/Help

If still not working after all these checks:
1. Share console logs (screenshot)
2. Share example conversation text
3. Check if build succeeded: `npm run build`
4. Try clearing browser cache (Cmd+Shift+R)

---

**Most Common Fix**: The feature works, but agents are generating original content without copying. This is actually good - it means agents aren't parroting! Try creating a scenario where agents SHOULD repeat something specific.

