# Web Search Setup

The web search feature allows agents to search the web when questions are outside their competencies.

## Status

Web search is **DISABLED by default** for local development because the local Convex backend may have network restrictions that prevent fetch from working properly.

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

### Two-Step System

1. **First Check**: When a user asks a question, the agent evaluates whether it needs external information
2. **Conditional Search**: Only if the question is outside the agent's competencies, a web search is triggered
3. **Smart Response**: The agent uses the web results to provide an accurate answer

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
```

## Logs

When web search is disabled, you'll see:
```
[WebSearch] ⚠️ Web search is DISABLED (set ENABLE_WEB_SEARCH=true to enable)
```

When enabled, you'll see detailed logs for:
- Decision making (needs web search or not)
- Search execution
- Result filtering and summarization
- Fallback triggers

