# Web Search Question Rewriting

## Overview

The web search system now includes **LLM-based question rewriting** that automatically reformulates user questions to be more specific and contextual to the agent's persona before performing web searches.

## Why This Matters

### The Problem

Generic questions often produce generic search results:
- ❓ User asks: "What's the latest economic policy?"
- 🔍 Search: "What's the latest economic policy?"
- 📊 Results: Generic articles from various countries and contexts
- ❌ Not specific to Armenia, not specific to parliament

### The Solution

Rewritten questions produce targeted, relevant results:
- ❓ User asks: "What's the latest economic policy?"
- 📝 Rewritten: "latest economic policy Armenia parliament 2024"
- 🔍 Search: "latest economic policy Armenia parliament 2024"
- 📊 Results: Specific articles about Armenian parliamentary economic policies
- ✅ Highly relevant to the agent's domain

## How It Works

### Automatic Contextual Rewriting

Before any web search is performed, the system:

1. **Analyzes the original question**
2. **Considers the agent's context:**
   - Agent's name and role
   - Country/jurisdiction (e.g., Armenia)
   - Area of expertise (e.g., foreign relations, economics)
   - Current position (e.g., Parliamentary Deputy)
3. **Rewrites the question** to incorporate this context
4. **Performs the search** with the rewritten query

### Examples

#### Example 1: Generic Policy Question
```
Agent: Ruben Rubinyan (Deputy Speaker, National Assembly of Armenia)

Original:  "What's the latest economic policy?"
Rewritten: "latest economic policy Armenia parliament 2024"

Why better: Specifies country, institution, and timeframe
```

#### Example 2: Education Question
```
Agent: Armenian Parliamentary Deputy

Original:  "Tell me about education reform"
Rewritten: "Armenia education reform parliament current policies"

Why better: Adds geographic and institutional context
```

#### Example 3: Parliamentary Question
```
Agent: Ruben Rubinyan (Parliamentary Deputy, Foreign Relations Expert)

Original:  "What happened in the recent session?"
Rewritten: "Armenia National Assembly recent session decisions foreign relations"

Why better: Specifies the exact parliament and agent's specialty
```

#### Example 4: Statistical Question
```
Agent: Armenian Economic Policy Deputy

Original:  "What is the unemployment rate?"
Rewritten: "Armenia unemployment rate 2024 latest statistics"

Why better: Narrows down to specific country and current data
```

### 🚨 CRITICAL RULE: Entity Preservation

**The rewriter NEVER replaces or removes explicitly mentioned entities.**

#### ✅ CORRECT Examples

```
Original:  "Ինչ է կարծում Նիկոլը թուրքերի մասին" (What does Nikol think about Turks?)
Agent:     Ruben Rubinyan
Rewritten: "Nikol opinion about Turks Armenia"
✓ Keeps "Nikol" because it was explicitly mentioned in the question
```

```
Original:  "What did the prime minister say about education?"
Agent:     Parliamentary Deputy
Rewritten: "Armenia prime minister statement education 2024"
✓ Keeps "prime minister", adds country context
```

```
Original:  "What's your stance on economic policy?"
Agent:     Ruben Rubinyan
Rewritten: "Ruben Rubinyan stance economic policy Armenia parliament"
✓ Uses agent name because "your" is an indirect reference to the agent
```

#### ❌ WRONG Examples

```
Original:  "Ինչ է կարծում Նիկոլը թուրքերի մասին" (What does Nikol think about Turks?)
Rewritten: "Ռուբեն Ռուբինյան թուրքերի մասին կարծիք..."
✗ Replaced "Nikol" with agent's name - this is WRONG
```

```
Original:  "What does the president think?"
Rewritten: "What does Ruben Rubinyan think?"
✗ Replaced "president" with agent's name - this is WRONG
```

### When to Add Agent's Name

✅ **Add agent's name when:**
- Question uses "you", "your", or other indirect references
- No specific person is mentioned in the question
- Question is about general topics without naming anyone

❌ **DON'T add agent's name when:**
- Question explicitly mentions another person by name
- Question refers to a specific role/position (president, minister, etc.)
- Question is clearly about someone else

#### Example 5: International Relations
```
Agent: Ruben Rubinyan (Foreign Relations Expert)

Original:  "What are the foreign relations with EU?"
Rewritten: "Armenia European Union foreign relations parliament 2024"

Why better: Connects both parties and adds institutional context
```

## Implementation Details

### The Rewrite Function

Located in `convex/agent/conversation.ts`:

```typescript
async function rewriteQuestionForAgent(
  question: string, 
  agentIdentity: string,
  agentName: string
): Promise<string>
```

**Parameters:**
- `question`: The original user question
- `agentIdentity`: The agent's full identity/bio/expertise
- `agentName`: The agent's name

**Returns:**
- The rewritten, contextual question optimized for web search

**Process:**
1. Sends a carefully crafted prompt to the LLM
2. Includes agent's context and several examples
3. Asks for a searchable, specific reformulation
4. Falls back to original question if rewriting fails

### Integration Points

The rewrite function is called at three points:

1. **Proactive Search (startConversationMessage)**
   - When the agent determines a web search is needed upfront

2. **Proactive Search (continueConversationMessage)**
   - When the agent determines a web search is needed for continuing conversation

3. **Fallback Search (both functions)**
   - When the agent says they can't answer and web search is triggered

### Error Handling

```typescript
try {
  const rewritten = await rewriteQuestionForAgent(...);
  const results = await performWebSearch(rewritten);
} catch (error) {
  console.error('[WebSearch] Error rewriting question:', error);
  // Falls back to original question
  return question;
}
```

## Testing

### Run the Test Suite

```bash
just convex run testWebSearch:testQuestionRewriting
```

### Sample Test Output

```
📝 TESTING QUESTION REWRITING FOR AGENT CONTEXT
====================================================================================================

Agent: Ռուբինյան Ռուբեն Կարապետի
Expertise: International relations, European studies, Parliamentary procedures

Testing 6 question rewrites

====================================================================================================
TEST 1/6: General policy question
Original Question: "What is the latest economic policy?"
====================================================================================================

✅ Rewritten Question: "Armenia National Assembly latest economic policy 2024"
⏱️  Duration: 542ms

====================================================================================================
TEST 2/6: Education topic
Original Question: "Tell me about education reform"
====================================================================================================

✅ Rewritten Question: "Armenia education reform parliament current policies"
⏱️  Duration: 498ms

...

QUESTION REWRITING TEST RESULTS
====================================================================================================

1. General policy question
   Original:  "What is the latest economic policy?"
   Rewritten: "Armenia National Assembly latest economic policy 2024"
   ✅ Success (542ms)

2. Education topic
   Original:  "Tell me about education reform"
   Rewritten: "Armenia education reform parliament current policies"
   ✅ Success (498ms)

...

====================================================================================================
Total tests: 6
Successful: 6 ✅
Failed: 0
====================================================================================================
```

## Benefits

### 🎯 More Relevant Results
- Search results match the agent's specific domain
- Less noise from other countries or contexts
- Higher quality information

### ⚡ Better User Experience
- More accurate answers
- Faster to relevant information
- Agent appears more knowledgeable

### 💡 Smarter Search Strategy
- Leverages agent's full context
- Optimizes for search engine relevance
- Combines general knowledge with specific context

### 📊 Improved Answer Quality
- Answers are more specific to the agent's role
- Information is contextually appropriate
- Users get exactly what they need

## Logging

### Question Rewriting Logs

When a question is rewritten, you'll see:

```
[WebSearch] 📝 Question rewritten:
[WebSearch]    Original: "What's the latest economic policy?"
[WebSearch]    Rewritten: "latest economic policy Armenia parliament 2024"
```

### Error Fallback Logs

If rewriting fails:

```
[WebSearch] Error rewriting question: [error details]
[WebSearch] ⚠️ Using original question due to rewrite error
```

## Configuration

Question rewriting is **automatically enabled** whenever web search is enabled. No additional configuration needed.

### Customization

To adjust how questions are rewritten, modify the prompt in the `rewriteQuestionForAgent` function in `convex/agent/conversation.ts`:

```typescript
content: `You are helping to rewrite a user's question to make it more specific and contextual for a web search.

Agent's name: ${agentName}
Agent's identity and expertise: ${agentIdentity}

Original question: "${question}"

Rewrite this question to be more specific and searchable, incorporating:
1. The agent's specific role/domain (e.g., "Armenian parliament" if they're a deputy)
2. The agent's country or jurisdiction if relevant
3. The agent's area of expertise if applicable
4. Keep the core intent of the question

...
```

### Tuning Tips

**Make it more specific:**
- Add more examples in the prompt
- Emphasize technical terms in the agent's domain
- Include date ranges or timeframes

**Make it more general:**
- Remove some context requirements
- Allow broader geographic scope
- Focus on core topic only

## Performance Considerations

### Timing

- Question rewriting adds ~500ms latency (one LLM call)
- This is a small price for significantly better search results
- Overall response time is still fast due to parallel processing

### Cost

- One additional LLM API call per web search
- Typically 50-100 tokens (very cheap)
- ROI: Better results = fewer follow-up questions

### Caching Potential

Future optimization: Cache rewritten questions for common queries
- "What's the latest policy?" → cached rewrite for each agent
- Could reduce latency to near-zero
- Would save API costs

## Advanced Usage

### Manual Testing

You can test question rewriting without performing a full search:

```bash
just convex run testWebSearch:rewriteQuestionInternal '{
  "question": "What is the unemployment rate?",
  "agentIdentity": "Armenian Parliamentary Deputy specializing in economics",
  "agentName": "Example Deputy"
}'
```

### Integration with Other Systems

The rewrite function can be used independently:

```typescript
import { rewriteQuestionForAgent } from './agent/conversation';

const rewritten = await rewriteQuestionForAgent(
  "What's the latest policy?",
  agent.identity,
  agent.name
);

// Use rewritten question for any purpose
console.log(rewritten);
```

## Summary

✅ **What Changed:**
- Added LLM-based question rewriting before web searches
- Questions are automatically contextualized to the agent's role
- Works for both proactive and fallback web searches

✅ **What's Better:**
- Search results are significantly more relevant
- Agent responses are more accurate and specific
- Better user experience overall

✅ **How to Use:**
- Enable web search as normal (rewriting is automatic)
- Test with: `just convex run testWebSearch:testQuestionRewriting`
- View rewrite logs in the console during conversations

✅ **Example Impact:**
- Before: "economic policy" → generic global results
- After: "Armenia parliament economic policy 2024" → targeted, relevant results

