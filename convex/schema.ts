import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { agentTables } from './agent/schema';
import { aiTownTables } from './aiTown/schema';
import { conversationId, playerId } from './aiTown/ids';
import { engineTables } from './engine/schema';

export default defineSchema({
  music: defineTable({
    storageId: v.string(),
    type: v.union(v.literal('background'), v.literal('player')),
  }),

  messages: defineTable({
    conversationId,
    messageUuid: v.string(),
    author: playerId,
    text: v.string(),
    worldId: v.optional(v.id('worlds')),
  })
    .index('conversationId', ['worldId', 'conversationId'])
    .index('messageUuid', ['conversationId', 'messageUuid']),

  webSearchLogs: defineTable({
    timestamp: v.number(),
    question: v.string(),
    agentName: v.string(),
    agentIdentity: v.optional(v.string()),
    searchResults: v.array(v.object({
      title: v.string(),
      url: v.string(),
      snippet: v.string(),
    })),
    success: v.boolean(),
    duration: v.number(),
    resultCount: v.number(),
    formattedContext: v.optional(v.string()),
    error: v.optional(v.string()),
    triggerType: v.union(
      v.literal('proactive'),
      v.literal('fallback')
    ),
  })
    .index('timestamp', ['timestamp'])
    .index('agentName', ['agentName'])
    .index('success', ['success']),

  ...agentTables,
  ...aiTownTables,
  ...engineTables,
});
