"""
Simple script to retrieve agent memories from AI Town SQLite database.
No external dependencies required - uses only Python standard library.
"""

import sqlite3
import json
from datetime import datetime

DB_PATH = "convex_local_backend.sqlite3"


def connect_db():
    """Connect to the SQLite database."""
    return sqlite3.connect(DB_PATH)


def get_all_memories(conn):
    """Retrieve all memories from the database."""
    cursor = conn.cursor()
    
    query = """
    SELECT id, json_value, ts
    FROM documents 
    WHERE deleted = 0
      AND json_value LIKE '%"importance"%'
      AND json_value LIKE '%"description"%'
      AND json_value LIKE '%"playerId"%'
    ORDER BY ts DESC
    """
    
    cursor.execute(query)
    rows = cursor.fetchall()
    
    memories = []
    for doc_id, value_json, ts in rows:
        try:
            value = json.loads(value_json)
            memory = {
                '_id': doc_id.hex() if isinstance(doc_id, bytes) else str(doc_id),
                'playerId': value.get('playerId'),
                'description': value.get('description'),
                'importance': value.get('importance'),
                'lastAccess': value.get('lastAccess'),
                'data_type': value.get('data', {}).get('type'),
                'ts': ts,
            }
            
            # Add readable timestamp
            if memory['lastAccess']:
                memory['lastAccess_readable'] = datetime.fromtimestamp(
                    memory['lastAccess'] / 1000
                ).strftime('%Y-%m-%d %H:%M:%S')
            else:
                memory['lastAccess_readable'] = 'N/A'
            
            memories.append(memory)
        except (json.JSONDecodeError, Exception) as e:
            print(f"Error parsing memory: {e}")
            continue
    
    return memories


def get_player_descriptions(conn):
    """Get player names and descriptions."""
    cursor = conn.cursor()
    
    query = """
    SELECT id, json_value 
    FROM documents 
    WHERE deleted = 0
      AND json_value LIKE '%"name"%'
      AND json_value LIKE '%"playerId"%'
      AND json_value LIKE '%"character"%'
    LIMIT 50
    """
    
    cursor.execute(query)
    rows = cursor.fetchall()
    
    players = []
    for doc_id, value_json in rows:
        try:
            value = json.loads(value_json)
            if 'name' in value and 'playerId' in value and 'character' in value:
                players.append({
                    '_id': doc_id.hex() if isinstance(doc_id, bytes) else str(doc_id),
                    'playerId': value.get('playerId'),
                    'name': value.get('name'),
                    'description': value.get('description', ''),
                    'character': value.get('character'),
                })
        except (json.JSONDecodeError, Exception) as e:
            continue
    
    return players


def get_messages(conn):
    """Retrieve conversation messages."""
    cursor = conn.cursor()
    
    query = """
    SELECT id, json_value, ts
    FROM documents 
    WHERE deleted = 0
      AND json_value LIKE '%"text"%'
      AND json_value LIKE '%"author"%'
      AND json_value LIKE '%"conversationId"%'
    ORDER BY ts DESC
    LIMIT 100
    """
    
    cursor.execute(query)
    rows = cursor.fetchall()
    
    messages = []
    for doc_id, value_json, ts in rows:
        try:
            value = json.loads(value_json)
            messages.append({
                '_id': doc_id.hex() if isinstance(doc_id, bytes) else str(doc_id),
                'conversationId': value.get('conversationId'),
                'author': value.get('author'),
                'text': value.get('text'),
                'ts': ts,
            })
        except (json.JSONDecodeError, Exception) as e:
            continue
    
    return messages


def export_to_json(data, filename):
    """Export data to JSON file."""
    with open(filename, 'w') as f:
        json.dump(data, f, indent=2, default=str)
    print(f"\n✓ Exported to {filename}")


def main():
    """Main function."""
    print("=" * 60)
    print("AI TOWN MEMORY RETRIEVAL")
    print("=" * 60)
    print("\nConnecting to database...")
    
    try:
        conn = connect_db()
        print("✓ Connected to database\n")
        
        # Get players
        print("=" * 60)
        print("PLAYERS")
        print("=" * 60)
        players = get_player_descriptions(conn)
        print(f"\nFound {len(players)} players:")
        for player in players[:10]:
            print(f"  - {player['name']} ({player['character']})")
        
        # Get memories
        print("\n" + "=" * 60)
        print("MEMORIES")
        print("=" * 60)
        memories = get_all_memories(conn)
        print(f"\nFound {len(memories)} memories")
        
        if memories:
            # Show memory statistics
            memory_types = {}
            for mem in memories:
                mem_type = mem.get('data_type', 'unknown')
                memory_types[mem_type] = memory_types.get(mem_type, 0) + 1
            
            print("\nMemories by type:")
            for mem_type, count in memory_types.items():
                print(f"  {mem_type}: {count}")
            
            # Show importance statistics
            importances = [m['importance'] for m in memories if m.get('importance')]
            if importances:
                print(f"\nImportance statistics:")
                print(f"  Mean: {sum(importances)/len(importances):.2f}")
                print(f"  Min: {min(importances):.2f}")
                print(f"  Max: {max(importances):.2f}")
            
            # Show sample memories
            print("\n--- Sample Memories (top 5 by importance) ---")
            sorted_memories = sorted(memories, key=lambda x: x.get('importance', 0), reverse=True)
            for i, mem in enumerate(sorted_memories[:5], 1):
                print(f"\n{i}. Player: {mem['playerId'][:8]}...")
                print(f"   Description: {mem['description'][:100]}...")
                print(f"   Importance: {mem['importance']:.2f}")
                print(f"   Type: {mem['data_type']}")
                print(f"   Last Access: {mem['lastAccess_readable']}")
        
        # Get messages
        print("\n" + "=" * 60)
        print("MESSAGES (Last 10)")
        print("=" * 60)
        messages = get_messages(conn)
        print(f"\nFound {len(messages)} messages")
        
        for i, msg in enumerate(messages[:10], 1):
            print(f"\n{i}. {msg['author'][:8]}...: {msg['text'][:80]}")
        
        # Export option
        export = input("\n\nExport memories to JSON? (yes/no): ").lower()
        if export == 'yes' or export == 'y':
            export_to_json(memories, 'memories_export.json')
            export_to_json(messages, 'messages_export.json')
            export_to_json(players, 'players_export.json')
        
        conn.close()
        print("\n✓ Database connection closed")
        print("\nDone!")
        
    except sqlite3.Error as e:
        print(f"\n❌ Database error: {e}")
    except Exception as e:
        print(f"\n❌ Error: {e}")


if __name__ == "__main__":
    main()

