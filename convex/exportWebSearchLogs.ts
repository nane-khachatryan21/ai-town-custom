/**
 * Export web search logs to JSON
 * Run with: npx convex run exportWebSearchLogs:exportToJSON
 */

import { action } from './_generated/server';
import { api } from './_generated/api';
import { v } from 'convex/values';

/**
 * Export all web search logs to JSON format
 */
export const exportToJSON: any = action({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const logs: any = await ctx.runQuery(api.util.webSearchLogger.getAllLogs, {
      limit: args.limit,
    });
    
    // Just return the data - Convex will output it as JSON
    return logs;
  },
});

/**
 * Export logs for a specific agent
 */
export const exportByAgent: any = action({
  args: {
    agentName: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const logs: any = await ctx.runQuery(api.util.webSearchLogger.getLogsByAgent, {
      agentName: args.agentName,
      limit: args.limit,
    });
    
    return logs;
  },
});

/**
 * Export logs for a specific time range
 */
export const exportByTimeRange: any = action({
  args: {
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    const logs: any = await ctx.runQuery(api.util.webSearchLogger.getLogsByTimeRange, {
      startTime: args.startTime,
      endTime: args.endTime,
    });
    
    return logs;
  },
});

/**
 * Get statistics about web searches
 */
export const getStatistics: any = action({
  handler: async (ctx) => {
    const stats: any = await ctx.runQuery(api.util.webSearchLogger.getStats);
    
    return stats;
  },
});

