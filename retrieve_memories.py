"""
Script to retrieve and analyze agent memories from the AI Town SQLite database.

The memories are stored in the convex_local_backend.sqlite3 database with the following structure:
- Table: memories - Contains memory descriptions, importance, player associations
- Table: memoryEmbeddings - Contains vector embeddings for semantic search
- Table: documents - Convex stores data in a documents table with JSON format
"""

import sqlite3
import json
import pandas as pd
from typing import List, Dict, Any
from datetime import datetime

DB_PATH = "convex_local_backend.sqlite3"


def connect_db():
    """Connect to the SQLite database."""
    return sqlite3.connect(DB_PATH)


def get_table_names(conn):
    """Get all table names in the database."""
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    return [table[0] for table in tables]


def inspect_table_schema(conn, table_name: str):
    """Show the schema of a table."""
    cursor = conn.cursor()
    cursor.execute(f"PRAGMA table_info({table_name});")
    columns = cursor.fetchall()
    
    print(f"\n=== Schema for table: {table_name} ===")
    for col in columns:
        print(f"  {col[1]} ({col[2]})")
    return columns


def get_all_memories(conn) -> pd.DataFrame:
    """
    Retrieve all memories from the database.
    Convex stores data in JSON format in the documents table.
    """
    cursor = conn.cursor()
    
    # Convex uses table_id (BLOB) to identify table, but we can check json_value content
    # We look for documents with memory-specific fields
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
    for row in rows:
        doc_id, value_json, ts = row
        try:
            value = json.loads(value_json)
            memory = {
                '_id': doc_id.hex() if isinstance(doc_id, bytes) else str(doc_id),
                'playerId': value.get('playerId'),
                'description': value.get('description'),
                'importance': value.get('importance'),
                'lastAccess': value.get('lastAccess'),
                'embeddingId': value.get('embeddingId'),
                'data': value.get('data', {}),
                'data_type': value.get('data', {}).get('type'),
                'ts': ts,
            }
            
            # Add human-readable timestamp
            if memory['lastAccess']:
                memory['lastAccess_readable'] = datetime.fromtimestamp(
                    memory['lastAccess'] / 1000
                ).strftime('%Y-%m-%d %H:%M:%S')
            
            memories.append(memory)
        except json.JSONDecodeError as e:
            print(f"Error parsing memory {doc_id}: {e}")
            continue
    
    return pd.DataFrame(memories) if memories else pd.DataFrame()


def get_memories_by_player(conn, player_id: str) -> pd.DataFrame:
    """Get all memories for a specific player."""
    df = get_all_memories(conn)
    if not df.empty:
        return df[df['playerId'] == player_id]
    return df


def get_memory_embeddings(conn) -> pd.DataFrame:
    """Retrieve memory embeddings."""
    cursor = conn.cursor()
    
    query = """
    SELECT id, json_value 
    FROM documents 
    WHERE deleted = 0
      AND json_value LIKE '%"embedding"%'
      AND json_value LIKE '%"playerId"%'
    """
    
    cursor.execute(query)
    rows = cursor.fetchall()
    
    embeddings = []
    for row in rows:
        doc_id, value_json = row
        try:
            value = json.loads(value_json)
            # Check if it's an embedding document (has embedding array)
            if 'embedding' in value and isinstance(value['embedding'], list):
                embedding_data = {
                    '_id': doc_id.hex() if isinstance(doc_id, bytes) else str(doc_id),
                    'playerId': value.get('playerId'),
                    'embedding': value.get('embedding'),
                    'embedding_length': len(value.get('embedding', [])),
                }
                embeddings.append(embedding_data)
        except json.JSONDecodeError as e:
            print(f"Error parsing embedding {doc_id}: {e}")
            continue
    
    return pd.DataFrame(embeddings) if embeddings else pd.DataFrame()


def get_messages(conn) -> pd.DataFrame:
    """Retrieve all conversation messages."""
    cursor = conn.cursor()
    
    query = """
    SELECT id, json_value, ts
    FROM documents 
    WHERE deleted = 0
      AND json_value LIKE '%"text"%'
      AND json_value LIKE '%"author"%'
      AND json_value LIKE '%"conversationId"%'
    ORDER BY ts DESC
    """
    
    cursor.execute(query)
    rows = cursor.fetchall()
    
    messages = []
    for row in rows:
        doc_id, value_json, ts = row
        try:
            value = json.loads(value_json)
            messages.append({
                '_id': doc_id.hex() if isinstance(doc_id, bytes) else str(doc_id),
                'conversationId': value.get('conversationId'),
                'author': value.get('author'),
                'text': value.get('text'),
                'messageUuid': value.get('messageUuid'),
                'ts': ts,
            })
        except json.JSONDecodeError as e:
            print(f"Error parsing message {doc_id}: {e}")
            continue
    
    return pd.DataFrame(messages) if messages else pd.DataFrame()


def get_player_descriptions(conn) -> pd.DataFrame:
    """Get player descriptions/names."""
    cursor = conn.cursor()
    
    query = """
    SELECT id, json_value 
    FROM documents 
    WHERE deleted = 0
      AND json_value LIKE '%"name"%'
      AND json_value LIKE '%"playerId"%'
      AND json_value LIKE '%"worldId"%'
    LIMIT 50
    """
    
    cursor.execute(query)
    rows = cursor.fetchall()
    
    players = []
    for row in rows:
        doc_id, value_json = row
        try:
            value = json.loads(value_json)
            # Check if this is a player description (has name and playerId)
            if 'name' in value and 'playerId' in value and 'character' in value:
                players.append({
                    '_id': doc_id.hex() if isinstance(doc_id, bytes) else str(doc_id),
                    'playerId': value.get('playerId'),
                    'name': value.get('name'),
                    'description': value.get('description'),
                    'character': value.get('character'),
                })
        except json.JSONDecodeError as e:
            print(f"Error parsing player {doc_id}: {e}")
            continue
    
    return pd.DataFrame(players) if players else pd.DataFrame()


def analyze_memories(memories_df: pd.DataFrame):
    """Perform basic analysis on memories."""
    if memories_df.empty:
        print("No memories found in database.")
        return
    
    print("\n" + "=" * 60)
    print("MEMORY ANALYSIS")
    print("=" * 60)
    
    print(f"\nTotal memories: {len(memories_df)}")
    
    if 'data_type' in memories_df.columns:
        print("\nMemories by type:")
        print(memories_df['data_type'].value_counts())
    
    if 'importance' in memories_df.columns:
        print(f"\nImportance statistics:")
        print(f"  Mean: {memories_df['importance'].mean():.2f}")
        print(f"  Min: {memories_df['importance'].min():.2f}")
        print(f"  Max: {memories_df['importance'].max():.2f}")
    
    if 'playerId' in memories_df.columns:
        print(f"\nMemories per player:")
        player_counts = memories_df['playerId'].value_counts()
        for player_id, count in player_counts.head(10).items():
            print(f"  {player_id}: {count} memories")


def export_to_json(df: pd.DataFrame, filename: str):
    """Export DataFrame to JSON file."""
    df.to_json(filename, orient='records', indent=2)
    print(f"\nExported to {filename}")


def export_to_csv(df: pd.DataFrame, filename: str):
    """Export DataFrame to CSV file."""
    df.to_csv(filename, index=False)
    print(f"\nExported to {filename}")


def main():
    """Main function to demonstrate usage."""
    print("Connecting to AI Town database...")
    conn = connect_db()
    
    try:
        # Show available tables
        print("\n=== Available Tables ===")
        tables = get_table_names(conn)
        for table in tables:
            print(f"  - {table}")
        
        # Inspect documents table structure
        if 'documents' in tables:
            inspect_table_schema(conn, 'documents')
        
        # Get player descriptions
        print("\n" + "=" * 60)
        print("PLAYER DESCRIPTIONS")
        print("=" * 60)
        players_df = get_player_descriptions(conn)
        if not players_df.empty:
            print(players_df[['playerId', 'name']].to_string(index=False))
        
        # Retrieve all memories
        print("\n" + "=" * 60)
        print("RETRIEVING MEMORIES")
        print("=" * 60)
        memories_df = get_all_memories(conn)
        
        if not memories_df.empty:
            print(f"\nFound {len(memories_df)} memories")
            
            # Show sample memories
            print("\n=== Sample Memories (first 5) ===")
            sample_cols = ['playerId', 'description', 'importance', 'data_type']
            available_cols = [col for col in sample_cols if col in memories_df.columns]
            print(memories_df[available_cols].head().to_string(index=False))
            
            # Analyze memories
            analyze_memories(memories_df)
            
            # Export options
            export_choice = input("\n\nExport memories? (json/csv/no): ").lower()
            if export_choice == 'json':
                export_to_json(memories_df, 'memories_export.json')
            elif export_choice == 'csv':
                export_to_csv(memories_df, 'memories_export.csv')
        else:
            print("No memories found in database.")
        
        # Get messages
        print("\n" + "=" * 60)
        print("MESSAGES")
        print("=" * 60)
        messages_df = get_messages(conn)
        if not messages_df.empty:
            print(f"\nFound {len(messages_df)} messages")
            print("\n=== Sample Messages (first 5) ===")
            print(messages_df[['author', 'text']].head().to_string(index=False))
        
        # Get embeddings info
        print("\n" + "=" * 60)
        print("EMBEDDINGS")
        print("=" * 60)
        embeddings_df = get_memory_embeddings(conn)
        if not embeddings_df.empty:
            print(f"\nFound {len(embeddings_df)} embeddings")
            print(f"Embedding dimensions: {embeddings_df['embedding_length'].iloc[0]}")
        
    finally:
        conn.close()
        print("\n\nDatabase connection closed.")


if __name__ == "__main__":
    main()

