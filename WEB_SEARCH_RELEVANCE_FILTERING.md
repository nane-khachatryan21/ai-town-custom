# Web Search Relevance Filtering

## Overview

The web search system now includes **LLM-based relevance filtering** to ensure that web searches are only performed for questions that are actually relevant to the agent's persona and domain.

## Why This Matters

Without relevance filtering, agents would perform web searches for completely unrelated questions like:
- ❌ "What's the best pizza recipe?" (asked to a parliamentary deputy)
- ❌ "How do I fix my car?" (asked to an economics expert)
- ❌ "What's the weather like?" (asked to a policy advisor)

This wastes:
- 🕒 **Time**: Unnecessary API calls and processing
- 💰 **Money**: Extra LLM API costs
- 🎯 **Focus**: Dilutes the agent's expertise

## How It Works

### Three-Step Intelligent System

```
┌─────────────────────────────────────────────────────────────┐
│                    User asks a question                     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
         ┌───────────────────────────┐
         │  Step 1: Relevance Check  │ ← 🎯 NEW!
         │  (LLM evaluates)          │
         └───────┬───────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
   NOT RELEVANT      RELEVANT
   ⛔ Stop here      ✅ Continue
   (No search)           │
                         ▼
              ┌──────────────────────┐
              │ Step 2: Knowledge Gap│
              │ (Does agent need web?│
              └──────┬────────────────┘
                     │
            ┌────────┴────────┐
            │                 │
            ▼                 ▼
        CAN ANSWER    NEEDS WEB SEARCH
        (No search)   ✅ Perform search
                             │
                             ▼
                  ┌──────────────────┐
                  │ Step 3: Integrate│
                  │ web results      │
                  └──────────────────┘
```

### Example Flow

#### Irrelevant Question (Filtered Out)
```
User: "What's the best pizza recipe?"
Agent: Parliamentary Deputy

Step 1 - Relevance: 🎯 "NOT RELEVANT to parliamentary work"
         ⛔ STOP - No web search performed
         
Agent responds: "That's outside my area of expertise as a parliamentarian..."
```

#### Relevant Question (Proceeds)
```
User: "What's the current unemployment rate?"
Agent: Parliamentary Deputy

Step 1 - Relevance: 🎯 "RELEVANT to economic policy"
         ✅ CONTINUE
         
Step 2 - Knowledge: ✅ "NEEDS current data"
         🔍 Perform web search
         
Step 3 - Integrate: Agent responds with web-sourced data
```

## Implementation Details

### 1. Relevance Check Function

Located in `convex/agent/conversation.ts`:

```typescript
async function isQuestionRelevantToAgent(
  question: string, 
  agentIdentity: string
): Promise<boolean>
```

This function:
- Takes the user's question and agent's identity
- Uses an LLM to evaluate relevance
- Returns `true` if relevant, `false` otherwise

**Evaluation Criteria:**
- Is it related to topics the agent would professionally handle?
- Is it about their area of knowledge or work?
- Would the agent reasonably be expected to discuss this?

### 2. Updated needsWebSearch Function

```typescript
async function needsWebSearch(
  question: string, 
  agentIdentity: string
): Promise<boolean> {
  // Step 1: Check relevance
  const isRelevant = await isQuestionRelevantToAgent(question, agentIdentity);
  if (!isRelevant) {
    return false; // Skip web search
  }
  
  // Step 2: Check if web search needed
  // (only if question is relevant)
  ...
}
```

## Testing

### Run Relevance Filtering Tests

```bash
just convex run testWebSearch:testRelevanceFiltering
```

This tests 8 scenarios:

**Should Be RELEVANT:**
✅ "What is your stance on education reform?"
✅ "Can you explain the recent tax legislation?"
✅ "What is the current economic situation?"
✅ "Tell me about the parliament's recent session"

**Should Be NOT RELEVANT:**
⛔ "What's the best pizza recipe?"
⛔ "How do I fix my car engine?"
⛔ "What's the weather forecast?"
⛔ "What movies should I watch?"

### Example Test Output

```
🎯 TESTING RELEVANCE FILTERING FOR WEB SEARCH
================================================================================

TEST 1/8: Policy-related question
Question: "What is your stance on education reform?"
Expected: RELEVANT
Actual: RELEVANT ✅
Result: ✅ PASS

TEST 2/8: Completely unrelated to parliamentary work
Question: "What's the best pizza recipe?"
Expected: NOT RELEVANT
Actual: NOT RELEVANT ⛔
Result: ✅ PASS

...

RELEVANCE FILTERING TEST RESULTS
================================================================================
Total tests: 8
Passed: 8 ✅
Failed: 0
Success rate: 100.0%
```

## Logging

When enabled, you'll see detailed logs:

### Irrelevant Question
```
[WebSearch] 🎯 Relevance check: "What's the best pizza recipe?" | Relevant to agent: false
[WebSearch] ⛔ Question not relevant to agent's domain - skipping web search
```

### Relevant Question That Needs Search
```
[WebSearch] 🎯 Relevance check: "What's the latest unemployment rate?" | Relevant to agent: true
[WebSearch] ✅ Question needs web search: true
[WebSearch] 🔍 Performing DuckDuckGo search...
```

### Relevant Question Agent Can Answer
```
[WebSearch] 🎯 Relevance check: "What's your political philosophy?" | Relevant to agent: true
[WebSearch] ✅ Question needs web search: false
(Agent answers from their character/memories)
```

## Benefits

### 🎯 Improved Focus
- Agents stay in their lane
- No confusing responses about unrelated topics
- Better user experience

### 💰 Cost Reduction
- Fewer unnecessary web searches
- Reduced API calls
- Lower LLM usage for summarization

### ⚡ Faster Responses
- Irrelevant questions answered immediately
- No waiting for web search that won't help
- Better perceived performance

### 🛡️ Better Error Handling
- Graceful degradation if LLM decides "not relevant"
- Clear logging for debugging
- Easy to tune relevance criteria

## Configuration

The relevance check is **always enabled** when web search is enabled. No additional configuration needed.

To enable web search (which includes relevance filtering):

**Production:**
```bash
# Set in Convex dashboard
ENABLE_WEB_SEARCH=true
```

**Local:**
```bash
# Edit convex/constants.ts
export const WEB_SEARCH_ENABLED_LOCAL = true;
```

## Advanced: Tuning Relevance

If you find the relevance filtering too strict or too lenient, you can adjust the prompt in `isQuestionRelevantToAgent()` in `convex/agent/conversation.ts`.

**Make it stricter:** Add more examples of NOT_RELEVANT cases
**Make it looser:** Adjust the criteria to be more inclusive

## Summary

✅ **What Changed:**
- Added LLM-based relevance check before web search
- Questions must be relevant to agent's domain to trigger search
- New test suite to validate relevance filtering

✅ **What's Better:**
- Agents no longer search the web for off-topic questions
- Faster responses for irrelevant queries
- Lower costs and better resource utilization

✅ **How to Use:**
- Enable web search as normal
- Relevance filtering works automatically
- Test with: `just convex run testWebSearch:testRelevanceFiltering`

