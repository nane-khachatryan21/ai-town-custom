# Web Search Setup

The web search feature allows agents to search the web when questions are outside their competencies.

## Status

Web search is **DISABLED by default** for local development because the local Convex backend may have network restrictions that prevent fetch from working properly.

**Important**: The `ENABLE_WEB_SEARCH` environment variable is checked at runtime in Convex actions only (not during schema evaluation), so it won't cause any schema validation errors.

## How to Enable

### For Production (Vercel + Convex Cloud)

1. Deploy to Convex cloud:
   ```bash
   npx convex deploy
   ```

2. Set the environment variable in your Convex dashboard:
   - Go to your deployment settings
   - Add environment variable: `ENABLE_WEB_SEARCH=true`

3. The agents will now use web search when needed!

### For Local Development (if network access works)

If you want to test web search locally and your local backend supports fetch:

```bash
ENABLE_WEB_SEARCH=true just convex
```

Or export it in your shell:

```bash
export ENABLE_WEB_SEARCH=true
just convex
```

## How It Works

### Four-Step Intelligent System

1. **Relevance Check**: First, an LLM determines if the question is relevant to the agent's persona and domain
   - Questions about unrelated topics (e.g., "What's the best pizza recipe?" to a parliamentary deputy) are filtered out
   - Only relevant questions proceed to the next step
   
2. **Knowledge Gap Detection**: For relevant questions, the agent evaluates whether it needs external information
   - Personal/opinion questions: Can be answered from the agent's character
   - Current/factual questions: Need web search
   
3. **Question Rewriting** (NEW!): Before searching, the question is rewritten to be more specific to the agent's context
   - Example: "What's the latest economic policy?" → "latest economic policy Armenia parliament 2024"
   - Incorporates agent's role, country, and expertise
   - Produces more relevant search results
   
4. **Smart Web Search**: The rewritten query is searched and results are integrated into the agent's response

### Fallback Mechanism

If an agent initially says they cannot answer (using phrases like "outside my competencies" in English, Armenian, or Russian), the system will:

1. Detect the inability to answer
2. Automatically trigger a web search
3. Regenerate the response with the web context

## Debugging

You can test the web search with these commands (when enabled):

```bash
# Test a single question
just convex run testWebSearch:testSearch '{"question": "What is the current weather in Yerevan?"}'

# Test with agent identity
just convex run testWebSearch:testSearch '{"question": "What are your political views?", "agentIdentity": "I am a member of parliament"}'

# Run a suite of tests
just convex run testWebSearch:quickTest

# Test fallback detection
just convex run testWebSearch:testFallbackDetection

# Test relevance filtering
just convex run testWebSearch:testRelevanceFiltering

# Test question rewriting (NEW!)
just convex run testWebSearch:testQuestionRewriting
```

The relevance filtering test checks if questions like "What's the best pizza recipe?" are correctly filtered out as irrelevant to a parliamentary deputy's domain.

The question rewriting test shows how questions are reformulated to be more specific to the agent's context (e.g., "What's the latest policy?" becomes "latest policy Armenia parliament 2024").

## Logs

When web search is disabled, you'll see:
```
[WebSearch] ⚠️ Web search is DISABLED (set ENABLE_WEB_SEARCH=true to enable)
```

When enabled, you'll see detailed logs for:
- 🎯 Relevance check (is the question relevant to agent's domain?)
- ⛔ Questions filtered out as irrelevant
- ✅ Knowledge gap detection (needs web search or not)
- 📝 Question rewriting (original → contextual)
- 🔍 Search execution
- 📊 Result filtering and summarization
- 🔄 Fallback triggers

Example log flow for a relevant question that needs search:
```
[WebSearch] 🎯 Relevance check: "What's the latest economic policy?" | Relevant to agent: true
[WebSearch] ✅ Question needs web search: true
[WebSearch] 📝 Question rewritten:
[WebSearch]    Original: "What's the latest economic policy?"
[WebSearch]    Rewritten: "latest economic policy Armenia parliament 2024"
[WebSearch] 🔍 Performing DuckDuckGo search for: "latest economic policy Armenia parliament 2024"
[WebSearch] 📊 Found 5 search results, filtering for relevance...
```

Example log flow for an irrelevant question:
```
[WebSearch] 🎯 Relevance check: "What's the best pizza recipe?" | Relevant to agent: false
[WebSearch] ⛔ Question not relevant to agent's domain - skipping web search
```

