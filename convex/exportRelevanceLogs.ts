/**
 * Export actions for relevance logs
 * Use these to export relevance check data from the database
 */

import { action } from './_generated/server';
import { api } from './_generated/api';
import { v } from 'convex/values';

/**
 * Export all relevance logs to JSON format
 * Run with: just convex run exportRelevanceLogs:exportToJSON
 */
export const exportToJSON: any = action({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const logs: any = await ctx.runQuery(api.util.relevanceLogger.getAllLogs, {
      limit: args.limit,
    });
    
    // Output clean JSON only
    console.log(JSON.stringify(logs, null, 2));
    
    return logs;
  },
});

/**
 * Export logs for a specific agent
 * Run with: just convex run exportRelevanceLogs:exportByAgent '{"agentName": "Agent Name"}'
 */
export const exportByAgent: any = action({
  args: {
    agentName: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const logs: any = await ctx.runQuery(api.util.relevanceLogger.getLogsByAgent, {
      agentName: args.agentName,
      limit: args.limit,
    });
    
    // Output clean JSON only
    console.log(JSON.stringify(logs, null, 2));
    
    return logs;
  },
});

/**
 * Export logs by decision type (RELEVANT or NOT_RELEVANT)
 * Run with: just convex run exportRelevanceLogs:exportByDecision '{"decision": "NOT_RELEVANT"}'
 */
export const exportByDecision: any = action({
  args: {
    decision: v.union(v.literal('RELEVANT'), v.literal('NOT_RELEVANT')),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const logs: any = await ctx.runQuery(api.util.relevanceLogger.getLogsByDecision, {
      decision: args.decision,
      limit: args.limit,
    });
    
    // Output clean JSON only
    console.log(JSON.stringify(logs, null, 2));
    
    return logs;
  },
});

/**
 * Get statistics about relevance checks
 * Run with: just convex run exportRelevanceLogs:getStatistics
 */
export const getStatistics: any = action({
  handler: async (ctx) => {
    const stats: any = await ctx.runQuery(api.util.relevanceLogger.getStats);
    
    return stats;
  },
});

