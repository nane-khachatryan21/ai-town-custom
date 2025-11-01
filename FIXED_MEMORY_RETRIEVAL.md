# ✅ Memory Retrieval - Fixed and Working!

## What Was the Problem?

The original notebook had an error: `OperationalError: no such column: value`

### Root Cause
The Convex SQLite database uses:
- **Column**: `json_value` (not `value`)
- **Filter**: `deleted = 0` (to exclude deleted records)
- **No table_name column**: Convex uses binary `table_id` instead

## ✅ Solution

I've created **3 working solutions** for you:

### 1. 🚀 Simple Script (No Dependencies) - **START HERE**

```bash
python3 retrieve_memories_simple.py
```

**What it does:**
- ✅ Shows all 451 memories from your Armenian parliament deputies
- ✅ Displays memory statistics and importance scores
- ✅ Shows recent conversation messages
- ✅ Exports to JSON if you want
- ✅ **NO external dependencies needed!**

**Your Current Data:**
- 451 conversation memories
- 35 players (Armenian parliament deputies)
- Mean importance: 8.10/10
- All memories are of type "conversation"

### 2. 📊 Full Script with Pandas

```bash
pip install pandas
python3 retrieve_memories.py
```

More advanced analysis with DataFrames, CSV export, etc.

### 3. 📓 Jupyter Notebook

```bash
pip install pandas jupyter
jupyter notebook explore_memories.ipynb
```

Interactive exploration with visualizations.

## Quick Test

Run this right now to see your memories:

```bash
cd /Users/earakelyan/Documents/nvidia/hack_democracy/ai-town-custom
python3 retrieve_memories_simple.py
```

Sample output you'll see:
```
Found 451 memories

Memories by type:
  conversation: 451

Importance statistics:
  Mean: 8.10
  Min: 7.00
  Max: 9.00

Top memories by importance show conversations between:
- Ալեքսանյան Վահագն Հովիկի
- Ազարյան Ջուլիետա Հովսեփի  
- Ռուբինյան Ռուբեն Կարապետի
- Աղազարյան Հովիկ Հովսեփի
And others...
```

## Database Structure (Corrected)

### Actual Convex SQLite Schema:

```sql
CREATE TABLE documents (
    id BLOB NOT NULL,
    ts INTEGER NOT NULL,
    table_id BLOB NOT NULL,
    json_value TEXT NULL,     -- This is the column!
    deleted INTEGER NOT NULL,  -- 0 = active, 1 = deleted
    prev_ts INTEGER,
    PRIMARY KEY (ts, table_id, id)
);
```

### Memory Document Format:

```json
{
  "playerId": "p:10...",
  "description": "Conversation about...",
  "importance": 8.5,
  "lastAccess": 1730502737000,
  "embeddingId": "embedding_id",
  "data": {
    "type": "conversation",
    "conversationId": "conv_id",
    "playerIds": ["p:1...", "p:2..."]
  }
}
```

## What Can You Do Now?

1. **View all memories**: See what your agents remember
2. **Filter by player**: Get memories for specific deputies
3. **Sort by importance**: Find the most significant memories
4. **Export data**: Save to JSON for analysis
5. **Read conversations**: See what was actually said
6. **Analyze patterns**: Look at memory types and importance distributions

## Files Created/Fixed

- ✅ `retrieve_memories_simple.py` - **No dependencies, works now!**
- ✅ `retrieve_memories.py` - Fixed with correct SQL
- ✅ `explore_memories.ipynb` - Fixed with correct SQL  
- ✅ `MEMORY_RETRIEVAL_GUIDE.md` - Complete documentation
- ✅ `FIXED_MEMORY_RETRIEVAL.md` - This file

## Your Next Steps

1. **Right now**: Run `python3 retrieve_memories_simple.py` to see it work
2. Export your memories to JSON for backup/analysis
3. Explore specific player memories
4. Analyze conversation patterns

## Need More?

Check `MEMORY_RETRIEVAL_GUIDE.md` for:
- Complete SQL query examples
- Advanced filtering techniques
- Export options
- Troubleshooting

---

**Everything is fixed and working!** 🎉

