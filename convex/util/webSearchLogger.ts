/**
 * Web search logging utilities
 * Logs all web search activity to the database for analysis and debugging
 */

import { ActionCtx, internalMutation, query } from '../_generated/server';
import { api, internal } from '../_generated/api';
import { SearchResult } from './webSearch';
import { v } from 'convex/values';

export interface WebSearchLogEntry {
  timestamp: number;
  question: string;
  agentName: string;
  agentIdentity?: string;
  searchResults: SearchResult[];
  success: boolean;
  duration: number;
  resultCount: number;
  formattedContext?: string;
  error?: string;
  triggerType: 'proactive' | 'fallback';
}

/**
 * Logs a web search operation to the database
 * @param ctx Action context
 * @param entry Log entry data
 */
export async function logWebSearch(
  ctx: ActionCtx,
  entry: WebSearchLogEntry
): Promise<void> {
  try {
    await ctx.runMutation(internal.util.webSearchLogger.insertLog, {
      timestamp: entry.timestamp,
      question: entry.question,
      agentName: entry.agentName,
      agentIdentity: entry.agentIdentity,
      searchResults: entry.searchResults,
      success: entry.success,
      duration: entry.duration,
      resultCount: entry.resultCount,
      formattedContext: entry.formattedContext,
      error: entry.error,
      triggerType: entry.triggerType,
    });
    
    console.log(`[WebSearchLogger] ✅ Logged web search for agent "${entry.agentName}" at ${new Date(entry.timestamp).toISOString()}`);
  } catch (error) {
    console.error('[WebSearchLogger] ❌ Failed to log web search:', error);
    // Don't throw - logging failures shouldn't break the conversation
  }
}

/**
 * Internal mutation to insert a log entry
 */
export const insertLog = internalMutation({
  args: {
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
    triggerType: v.union(v.literal('proactive'), v.literal('fallback')),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('webSearchLogs', args);
  },
});

/**
 * Query to get all web search logs
 */
export const getAllLogs = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const logs = await ctx.db
      .query('webSearchLogs')
      .order('desc')
      .take(limit);
    
    return logs.map(log => ({
      ...log,
      timestampISO: new Date(log.timestamp).toISOString(),
    }));
  },
});

/**
 * Query to get logs by agent
 */
export const getLogsByAgent = query({
  args: {
    agentName: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const logs = await ctx.db
      .query('webSearchLogs')
      .withIndex('agentName', (q) => q.eq('agentName', args.agentName))
      .order('desc')
      .take(limit);
    
    return logs.map(log => ({
      ...log,
      timestampISO: new Date(log.timestamp).toISOString(),
    }));
  },
});

/**
 * Query to get logs by time range
 */
export const getLogsByTimeRange = query({
  args: {
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query('webSearchLogs')
      .withIndex('timestamp', (q) => 
        q.gte('timestamp', args.startTime).lte('timestamp', args.endTime)
      )
      .order('desc')
      .collect();
    
    return logs.map(log => ({
      ...log,
      timestampISO: new Date(log.timestamp).toISOString(),
    }));
  },
});

/**
 * Query to get statistics
 */
export const getStats = query({
  handler: async (ctx) => {
    const allLogs = await ctx.db.query('webSearchLogs').collect();
    
    const totalSearches = allLogs.length;
    const successfulSearches = allLogs.filter(log => log.success).length;
    const failedSearches = totalSearches - successfulSearches;
    const proactiveSearches = allLogs.filter(log => log.triggerType === 'proactive').length;
    const fallbackSearches = allLogs.filter(log => log.triggerType === 'fallback').length;
    
    const avgDuration = totalSearches > 0
      ? allLogs.reduce((sum, log) => sum + log.duration, 0) / totalSearches
      : 0;
    
    const avgResults = totalSearches > 0
      ? allLogs.reduce((sum, log) => sum + log.resultCount, 0) / totalSearches
      : 0;
    
    return {
      totalSearches,
      successfulSearches,
      failedSearches,
      successRate: totalSearches > 0 ? (successfulSearches / totalSearches) * 100 : 0,
      proactiveSearches,
      fallbackSearches,
      avgDuration: Math.round(avgDuration),
      avgResults: Math.round(avgResults * 10) / 10,
    };
  },
});
