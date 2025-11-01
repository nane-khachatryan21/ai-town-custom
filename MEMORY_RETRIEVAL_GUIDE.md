# Memory Retrieval Guide

## Overview

Agent memories in AI Town are stored in the **SQLite database** file: `convex_local_backend.sqlite3` (currently 781MB).

The memories are stored with:
- **Description**: Text description of the memory
- **Importance**: Numerical score indicating memory significance
- **Embeddings**: Vector embeddings for semantic search
- **Player associations**: Which agent owns the memory
- **Type**: relationship, conversation, or reflection

## Quick Start

### Option 1: Simple Python Script (No Dependencies - **Recommended**)

Run the simple script that requires only Python standard library:

```bash
python3 retrieve_memories_simple.py
```

This will:
- ✅ Show players and their details
- ✅ Display all memory statistics
- ✅ Show top memories by importance
- ✅ Show recent messages
- ✅ Optionally export to JSON

### Option 2: Full Python Script (Requires pandas)

First install pandas: `pip install pandas`

Then run:

```bash
python3 retrieve_memories.py
```

This provides more advanced analysis with pandas DataFrames.

### Option 3: Jupyter Notebook (Interactive)

First install dependencies: `pip install pandas jupyter matplotlib`

Then open and run the notebook:

```bash
jupyter notebook explore_memories.ipynb
```

This provides:
- ✅ Step-by-step exploration
- ✅ Interactive data analysis
- ✅ Visualizations
- ✅ Easy filtering and searching

### Option 4: Direct SQLite Access

```python
import sqlite3
import json

# Connect
conn = sqlite3.connect("convex_local_backend.sqlite3")
cursor = conn.cursor()

# Get memories
cursor.execute("""
    SELECT id, value 
    FROM documents 
    WHERE table_name = 'memories'
""")

# Parse results
for doc_id, value_json in cursor.fetchall():
    memory = json.loads(value_json)
    print(f"Memory: {memory['description']}")
    print(f"Importance: {memory['importance']}")
    print()
```

## Database Structure

### Convex Storage Format

Convex stores all data in a `documents` table with this structure:
- `id`: Document ID
- `table_name`: Which logical table (e.g., 'memories', 'messages')
- `value`: JSON-encoded document data
- `creation_time`: Timestamp

### Memory Schema

Each memory document contains:
```json
{
  "playerId": "player_id_string",
  "description": "Text description of the memory",
  "importance": 5.8,
  "lastAccess": 1699123456789,
  "embeddingId": "embedding_doc_id",
  "data": {
    "type": "conversation" | "relationship" | "reflection",
    "conversationId": "...",
    "playerIds": ["id1", "id2"],
    ...
  }
}
```

### Available Tables

- **memories**: Agent memories
- **memoryEmbeddings**: Vector embeddings for memories
- **messages**: Conversation messages between agents/players
- **playerDescriptions**: Player names and descriptions
- **agentDescriptions**: Agent identities and personalities
- **worlds**: World/game state data
- **participatedTogether**: Conversation participation records

## Common Queries

### Get all memories for a specific player

```python
import sqlite3
import json
import pandas as pd

conn = sqlite3.connect("convex_local_backend.sqlite3")
cursor = conn.cursor()

# Get player ID first
cursor.execute("""
    SELECT value 
    FROM documents 
    WHERE table_name = 'playerDescriptions'
""")

# Then filter memories
cursor.execute("""
    SELECT value 
    FROM documents 
    WHERE table_name = 'memories'
""")

player_id = "your_player_id_here"
memories = []
for (value_json,) in cursor.fetchall():
    memory = json.loads(value_json)
    if memory.get('playerId') == player_id:
        memories.append(memory)

df = pd.DataFrame(memories)
print(df[['description', 'importance']])
```

### Get conversation history

```python
cursor.execute("""
    SELECT value 
    FROM documents 
    WHERE table_name = 'messages'
    ORDER BY creation_time DESC
""")

messages = [json.loads(value_json) for (value_json,) in cursor.fetchall()]
df = pd.DataFrame(messages)
print(df[['author', 'text']])
```

### Get embeddings

```python
import numpy as np

cursor.execute("""
    SELECT value 
    FROM documents 
    WHERE table_name = 'memoryEmbeddings'
""")

embeddings = []
for (value_json,) in cursor.fetchall():
    data = json.loads(value_json)
    embeddings.append({
        'playerId': data['playerId'],
        'embedding': np.array(data['embedding'])
    })

# Embeddings are typically 1536-dimensional vectors (OpenAI ada-002)
print(f"Embedding dimensions: {len(embeddings[0]['embedding'])}")
```

## Export Options

### JSON Export
```python
memories_df.to_json('memories_export.json', orient='records', indent=2)
```

### CSV Export
```python
memories_df.to_csv('memories_export.csv', index=False)
```

### Pickle (preserves data types)
```python
memories_df.to_pickle('memories_export.pkl')
```

## Memory Types

### 1. Relationship Memories
Memories about relationships between players.
```json
{
  "type": "relationship",
  "playerId": "other_player_id"
}
```

### 2. Conversation Memories
Memories about specific conversations.
```json
{
  "type": "conversation",
  "conversationId": "conv_id",
  "playerIds": ["player1_id", "player2_id"]
}
```

### 3. Reflection Memories
High-level reflections synthesized from other memories.
```json
{
  "type": "reflection",
  "relatedMemoryIds": ["mem_id_1", "mem_id_2", ...]
}
```

## Dependencies

Install required packages:
```bash
pip install pandas sqlite3
# For Jupyter notebook:
pip install jupyter matplotlib seaborn
```

## Tips

1. **Database is large (781MB)**: Queries might take a few seconds
2. **Timestamps**: Convex uses milliseconds since epoch
3. **IDs**: All IDs are strings, not integers
4. **JSON parsing**: All data is stored as JSON strings in the `value` column
5. **Embeddings**: Vector embeddings are 1536-dimensional arrays (if using OpenAI)

## Troubleshooting

### Database locked error
```python
# Use timeout parameter
conn = sqlite3.connect(DB_PATH, timeout=10)
```

### Out of memory
```python
# Process in chunks
cursor.execute("SELECT value FROM documents WHERE table_name = 'memories'")
while True:
    batch = cursor.fetchmany(1000)
    if not batch:
        break
    # Process batch...
```

### Date/time issues
```python
from datetime import datetime

# Convert Convex timestamp (milliseconds) to Python datetime
timestamp_ms = 1699123456789
dt = datetime.fromtimestamp(timestamp_ms / 1000)
print(dt.strftime('%Y-%m-%d %H:%M:%S'))
```

## Files Provided

- **`retrieve_memories_simple.py`**: Simple Python script (no dependencies) - **Start here!**
- **`retrieve_memories.py`**: Full-featured Python script (requires pandas)
- **`explore_memories.ipynb`**: Jupyter notebook for interactive exploration
- **`MEMORY_RETRIEVAL_GUIDE.md`**: This file

## Example Output

```
=============================================================
MEMORY STATISTICS
=============================================================

Total memories: 1,234

Memories by type:
conversation    678
relationship    412
reflection      144

Importance statistics:
  Mean: 5.42
  Min: 1.00
  Max: 9.80
```

## Support

For issues or questions:
1. Check the database file exists: `convex_local_backend.sqlite3`
2. Verify Python dependencies are installed
3. Try the provided scripts first before custom queries
4. Check the Convex schema in `convex/schema.ts` for data structure

---

**Note**: The database is actively used by the running application. Always work with a copy if making modifications, or ensure the app is stopped.

