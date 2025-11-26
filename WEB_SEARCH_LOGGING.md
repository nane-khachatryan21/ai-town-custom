# Web Search Logging System

All web search activity is automatically logged to the Convex database with detailed metadata for analysis and debugging.

## What Gets Logged

Every web search captures:
- **Timestamp**: Exact time the search was initiated
- **Question**: The user's question that triggered the search
- **Agent Name**: Which agent performed the search
- **Agent Identity**: The agent's role/identity description
- **Search Results**: Array of titles, URLs, and snippets found
- **Success Status**: Whether the search returned usable results
- **Duration**: How long the search took (milliseconds)
- **Result Count**: Number of results returned
- **Formatted Context**: The processed context added to the prompt
- **Error**: Any error messages if the search failed
- **Trigger Type**: `proactive` (predicted need) or `fallback` (after failed response)

## Viewing Logs

### 1. Export All Logs to JSON

```bash
just convex run exportWebSearchLogs:exportToJSON
```

Optional limit:
```bash
just convex run exportWebSearchLogs:exportToJSON '{"limit": 50}'
```

### 2. Export Logs for Specific Agent

```bash
just convex run exportWebSearchLogs:exportByAgent '{"agentName": "Ռուբինյան Ռուբեն Կարապետի"}'
```

### 3. Export Logs by Time Range

```bash
# Get logs from last hour
START=$(node -e "console.log(Date.now() - 3600000)")
END=$(node -e "console.log(Date.now())")
just convex run exportWebSearchLogs:exportByTimeRange "{\"startTime\": $START, \"endTime\": $END}"
```

### 4. Get Statistics

```bash
just convex run exportWebSearchLogs:getStatistics
```

Shows:
- Total searches performed
- Success/failure rates
- Proactive vs fallback breakdown
- Average search duration
- Average results per search

## Log Format

Each log entry looks like:

```json
{
  "_id": "...",
  "_creationTime": 1699907234567,
  "timestamp": 1699907234567,
  "timestampISO": "2024-11-13T15:30:34.567Z",
  "question": "Who is the president of Armenia?",
  "agentName": "Ռուբինյան Ռուբեն Կարապետի",
  "agentIdentity": "Armenian Parliament Deputy representing...",
  "searchResults": [
    {
      "title": "President of Armenia - Wikipedia",
      "url": "https://en.wikipedia.org/wiki/President_of_Armenia",
      "snippet": "The president of Armenia is Vahagn Khachaturyan..."
    }
  ],
  "success": true,
  "duration": 5620,
  "resultCount": 5,
  "formattedContext": "Relevant web information about...",
  "triggerType": "fallback"
}
```

## Querying from Code

You can also query logs programmatically:

```typescript
// Get all logs
const logs = await ctx.runQuery(api.util.webSearchLogger.getAllLogs, {
  limit: 100,
});

// Get logs by agent
const agentLogs = await ctx.runQuery(api.util.webSearchLogger.getLogsByAgent, {
  agentName: "Agent Name",
  limit: 50,
});

// Get logs by time range
const timeLogs = await ctx.runQuery(api.util.webSearchLogger.getLogsByTimeRange, {
  startTime: Date.now() - 86400000, // 24 hours ago
  endTime: Date.now(),
});

// Get statistics
const stats = await ctx.runQuery(api.util.webSearchLogger.getStats);
```

## Database Table

Logs are stored in the `webSearchLogs` table with indices on:
- `timestamp` (for time-based queries)
- `agentName` (for agent-specific queries)
- `success` (for filtering successful/failed searches)

## Export to File

To save logs to a file:

```bash
just convex run exportWebSearchLogs:exportToJSON > logs.json
```

The export functions return pure data objects - Convex automatically formats them as JSON. This makes it easy to:

```bash
# Export all logs
just convex run exportWebSearchLogs:exportToJSON > logs.json

# Filter with jq
just convex run exportWebSearchLogs:exportToJSON | jq '.[] | select(.success == true)'

# Export by agent
just convex run exportWebSearchLogs:exportByAgent '{"agentName": "Agent Name"}' > agent_logs.json

# Get statistics
just convex run exportWebSearchLogs:getStatistics
```

## Analyzing Logs

The logs can be used to:
- **Debug search issues**: See why searches fail or return no results
- **Optimize performance**: Identify slow searches
- **Track agent behavior**: See which agents use web search most
- **Improve prompts**: Analyze which types of questions trigger searches
- **Monitor accuracy**: Check if fallback mechanism works correctly

## Privacy Note

All search queries and results are logged. If users ask sensitive questions, they will be in the logs. Ensure proper data handling and retention policies are in place.

## Log Retention

Logs are stored indefinitely in Convex. To implement retention policies, you can:

1. Manually delete old logs via Convex dashboard
2. Create a cron job to auto-delete logs older than X days
3. Export and archive logs periodically

## Disabling Logging

If you need to disable logging (not recommended):

Comment out the `logWebSearch()` calls in:
- `convex/agent/conversation.ts` (4 locations)

Or modify the `logWebSearch` function to return early.

