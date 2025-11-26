# Post-Search Relevance Filtering

## Overview

The web search system now performs relevance filtering **AFTER** getting search results, not before. This ensures that we're making decisions based on actual content rather than assumptions about what the question might yield.

## Major Change: When Relevance is Checked

### Old Flow (Pre-Search Filtering)
```
User asks question
    ↓
Question relevant to agent domain? → NO → Stop
    ↓ YES
Perform web search
    ↓
Summarize and use results
```

### New Flow (Post-Search Filtering)
```
User asks question
    ↓
Needs web search? → NO → Stop
    ↓ YES
Rewrite question for agent context
    ↓
Perform web search
    ↓
Got search results
    ↓
Are results about THIS SPECIFIC AGENT? → NO → Stop, log decision
    ↓ YES
Summarize and use results
```

## Why This Is Better

### Problem with Pre-Search Filtering

**Before:**
- Question: "What's the latest economic policy?"
- Pre-check: "Is economics relevant to parliamentary deputy?" → YES
- Search performed: Generic Armenia economic policy results
- Problem: Results aren't about the specific deputy, just generic economic news
- Result: Agent uses information not specifically related to them

**After:**
- Question: "What's the latest economic policy?"
- Search performed: "Armenia parliament economic policy Ruben Rubinyan 2024"
- **Post-check:** "Do these results mention Ruben Rubinyan?" → NO
- Result: **Don't use generic results**, agent answers from their own knowledge
- ✅ More precise, agent-specific responses

### The Key Difference

**Agent-Name Based Filtering:**
- Does NOT check if topic is relevant to agent's role
- DOES check if results specifically mention or involve the agent BY NAME
- Example: Results about "Armenia's economy" → NOT RELEVANT (too general)
- Example: Results about "Deputy Rubinyan's economic proposals" → RELEVANT (specific to agent)

## How It Works

### The Relevance Check Function

```typescript
async function areSearchResultsRelevantToAgent(
  searchResults: Array<{title, snippet, url}>,
  agentName: string,
  agentIdentity: string,
  question: string
): Promise<{isRelevant: boolean, reasoning: string}>
```

**Evaluation Criteria:**
1. **Do results mention the agent by name?**
   - Direct mentions: "Ruben Rubinyan announced..."
   - Indirect but specific: "The deputy from Civil Contract party..."
   
2. **Are results about events/topics directly involving this person?**
   - Their speeches, proposals, actions
   - Their role in specific legislation
   - Their positions on issues

3. **Are results just about the organization but NOT this person?**
   - Generic "Armenian parliament" news → NOT RELEVANT
   - "Parliament session" without agent mention → NOT RELEVANT
   - "Economy minister's statement" (different person) → NOT RELEVANT

### Example Evaluations

#### Example 1: Relevant Results
```
Question: "Tell me about Ruben Rubinyan's work"
Search Results:
- "Ruben Rubinyan discusses foreign relations at summit"
- "Deputy Speaker Rubinyan's statement on EU membership"
- "Interview with Ruben Rubinyan on Armenia TV"

Decision: RELEVANT ✅
Reasoning: Results directly mention and discuss Ruben Rubinyan's activities.
```

#### Example 2: Not Relevant Results
```
Question: "What is Armenia's economic policy?"
Search Results:
- "Armenia's GDP growth reaches 7% in 2024"
- "Economic reforms in Armenia: A comprehensive review"
- "Armenian Central Bank announces new interest rates"

Decision: NOT RELEVANT ⛔
Reasoning: Results are about economic policy in general, 
not specifically about this agent or their role in it.
```

#### Example 3: Borderline Case - Organization vs Person
```
Question: "What happened in the recent parliament session?"
Search Results:
- "Armenian Parliament passes education reform bill"
- "National Assembly discusses foreign policy"
- "Parliamentary session concludes with vote on budget"

Decision: NOT RELEVANT ⛔
Reasoning: Results mention parliament/assembly but don't 
specifically mention this deputy or their involvement.
```

## Logging System

### Database-Based Logging

All relevance decisions are logged to the Convex `relevanceLogs` database table:

```json
{
  "_id": "...",
  "_creationTime": 1700000000000,
  "timestamp": 1700000000000,
  "timestampISO": "2024-11-14T12:00:00.000Z",
  "question": "What is the economic policy?",
  "agentName": "Ռուբինյան Ռուբեն Կարապետի",
  "agentIdentity": "Deputy Speaker of National Assembly...",
  "searchResults": [
    {
      "title": "Armenia's economic reforms",
      "url": "https://example.com/article",
      "snippet": "The government announced..."
    }
  ],
  "decision": "NOT_RELEVANT",
  "reasoning": "Results about Armenia's economy in general, not specifically about Ruben Rubinyan",
  "rewrittenQuestion": "Armenia parliament economic policy Ruben Rubinyan 2024"
}
```

### Log Entry Fields

- `timestamp`: Unix timestamp of the check
- `timestampISO`: Human-readable ISO timestamp
- `question`: Original user question
- `agentName`: Name of the agent being checked
- `agentIdentity`: Full agent identity/bio
- `searchResults`: Array of search results that were evaluated
- `decision`: "RELEVANT" or "NOT_RELEVANT"
- `reasoning`: LLM's explanation for the decision
- `rewrittenQuestion`: The contextualized search query used

## Console Logging

### Relevant Results
```
[WebSearch] 🎯 Results Relevance Check for Ռուբինյան Ռուբեն Կարապետի:
[WebSearch]    Decision: RELEVANT ✅
[WebSearch]    Reasoning: Results directly mention and discuss Ruben Rubinyan's foreign relations work.
[WebSearch] ✅ Web context successfully added to agent's knowledge
```

### Not Relevant Results
```
[WebSearch] 🎯 Results Relevance Check for Ռուբինյան Ռուբեն Կարապետի:
[WebSearch]    Decision: NOT RELEVANT ⛔
[WebSearch]    Reasoning: Results are about Armenia's economic policy generally, without specific mention of this deputy.
[WebSearch] ⛔ Results not relevant to Ռուբինյան Ռուբեն Կարապետի, skipping summarization
```

## Integration Points

### Proactive Search (Both Conversation Functions)

After performing the web search:
1. Get search results
2. **Check relevance** with `areSearchResultsRelevantToAgent()`
3. **Log decision** with `logRelevanceCheck()`
4. **Conditional summarization:** Only if relevant
5. Log web search outcome

### Fallback Search (Cannot Answer Scenario)

Same flow as proactive, but triggered when agent initially says they can't answer:
1. Detect "cannot answer" response
2. Perform fallback web search
3. **Check relevance** of results
4. **Log decision**
5. **Conditional regeneration:** Only if relevant

## Benefits

### 🎯 More Precise Information
- Only use information specifically about the agent
- No generic context that's not directly relevant
- Agent stays focused on their own sphere

### 📊 Better Tracking
- See when results are filtered out
- Understand what questions yield agent-specific vs general results
- Analyze patterns in relevance decisions

### ⚡ Cleaner Responses
- Agents don't use generic information inappropriately
- Responses are more accurate to the agent's actual involvement
- Better alignment between agent persona and information used

### 🔍 Improved Search Strategy
- Helps identify when questions need better reformulation
- Shows which topics tend to be too general
- Guides future prompt engineering

## Statistics & Analysis

### View Relevance Stats

Get statistics from the database:

```bash
just convex run exportRelevanceLogs:getStatistics
```

Returns:
```json
{
  "totalChecks": 50,
  "relevantCount": 15,
  "notRelevantCount": 35,
  "relevantPercentage": 30.0,
  "notRelevantPercentage": 70.0,
  "agentStats": [
    {
      "agentName": "Ռուբինյան Ռուբեն Կարապետի",
      "relevant": 5,
      "notRelevant": 10,
      "total": 15,
      "relevantPercentage": "33.3"
    }
  ]
}
```

This helps understand:
- How often searches yield agent-specific results
- Which agents get more specific vs general results
- If search strategies need adjustment

### Export Logs

```bash
# Export all logs
just convex run exportRelevanceLogs:exportToJSON > relevance_logs.json

# Export by agent
just convex run exportRelevanceLogs:exportByAgent '{"agentName": "Ռուբինյան Ռուբեն Կարապետի"}' > agent_relevance.json

# Export only not relevant decisions
just convex run exportRelevanceLogs:exportByDecision '{"decision": "NOT_RELEVANT"}' > filtered_logs.json
```

## Configuration

### Database Storage

Relevance logs are stored in the Convex `relevanceLogs` table with indices on:
- `timestamp` (for time-based queries)
- `agentName` (for agent-specific queries)
- `decision` (for filtering by RELEVANT/NOT_RELEVANT)

### Relevance Criteria

To adjust what counts as "relevant," modify the prompt in `areSearchResultsRelevantToAgent()` in `convex/agent/conversation.ts`:

```typescript
Are these search results specifically about or directly relevant to ${agentName}?
Consider:
- Do the results mention ${agentName} by name?
- Are the results about topics/events directly involving this specific person?
- Are the results about the same organization/role but NOT about this specific person?
```

**Make it stricter:**
- Require explicit name mentions
- Require direct quotes or statements
- Exclude indirect references

**Make it looser:**
- Allow organizational context without name mention
- Accept role-based relevance
- Include related policy areas

## Troubleshooting

### Too Many Results Filtered Out

If legitimate results are being marked as NOT_RELEVANT:

1. **Check the search query rewriting**
   - Is the agent's name included in the rewritten query?
   - Are search terms specific enough?

2. **Adjust relevance criteria**
   - Modify the prompt to be more lenient
   - Add examples of borderline-relevant cases that should pass

3. **Review logs**
   - Check `reasoning` field to understand LLM's logic
   - Look for patterns in false negatives

### Too Few Results Filtered Out

If generic results are passing through:

1. **Strengthen criteria**
   - Emphasize name-specific matching
   - Add examples of general results that should fail

2. **Check agent names**
   - Ensure names are properly formatted
   - Handle name variations (first name, last name, nicknames)

## Summary

✅ **What Changed:**
- Relevance check moved from BEFORE search to AFTER search
- Now evaluates actual search results, not theoretical relevance
- Focuses on whether results specifically mention/involve the agent

✅ **How It Works:**
- Perform search → Get results → Check if about agent BY NAME → Use only if relevant

✅ **Why It's Better:**
- More precise agent-specific information
- Filters out generic results that aren't truly about the agent
- Better logging and tracking of relevance decisions

✅ **Where It's Logged:**
- All decisions logged to Convex `relevanceLogs` database table
- Includes full context: question, results, decision, reasoning
- Separate table from web search logs for clarity
- Export to JSON with: `just convex run exportRelevanceLogs:exportToJSON`

