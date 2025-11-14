/**
 * Logging system for web search relevance checks
 * Logs all relevance decisions to the Convex database
 */

import { ActionCtx } from '../_generated/server';
import { internal } from '../_generated/api';
import { internalMutation, query } from '../_generated/server';
import { v } from 'convex/values';

export interface RelevanceLogEntry {
  timestamp: number;
  question: string;
  agentName: string;
  agentIdentity?: string;
  searchResults: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  decision: 'RELEVANT' | 'NOT_RELEVANT';
  reasoning: string;
  rewrittenQuestion?: string;
}

/**
 * Internal mutation to insert a relevance log entry
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
    decision: v.union(
      v.literal('RELEVANT'),
      v.literal('NOT_RELEVANT')
    ),
    reasoning: v.string(),
    rewrittenQuestion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('relevanceLogs', args);
  },
});

/**
 * Logs a relevance check decision to the database
 * @param ctx The action context
 * @param entry The relevance log entry
 */
export async function logRelevanceCheck(
  ctx: ActionCtx,
  entry: RelevanceLogEntry
): Promise<void> {
  try {
    await ctx.runMutation(internal.util.relevanceLogger.insertLog, {
      timestamp: entry.timestamp,
      question: entry.question,
      agentName: entry.agentName,
      agentIdentity: entry.agentIdentity,
      searchResults: entry.searchResults,
      decision: entry.decision,
      reasoning: entry.reasoning,
      rewrittenQuestion: entry.rewrittenQuestion,
    });
    
    console.log(`[RelevanceLogger] ✅ Logged relevance check for "${entry.agentName}" - Decision: ${entry.decision}`);
  } catch (error) {
    console.error('[RelevanceLogger] ❌ Failed to log relevance check:', error);
    // Don't throw - logging failure shouldn't break the main flow
  }
}

/**
 * Get all relevance logs
 */
export const getAllLogs = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;
    
    const logs = await ctx.db
      .query('relevanceLogs')
      .order('desc')
      .take(limit);
    
    return logs.map(log => ({
      ...log,
      timestampISO: new Date(log.timestamp).toISOString(),
    }));
  },
});

/**
 * Get relevance logs for a specific agent
 */
export const getLogsByAgent = query({
  args: {
    agentName: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;
    
    const logs = await ctx.db
      .query('relevanceLogs')
      .withIndex('agentName', q => q.eq('agentName', args.agentName))
      .order('desc')
      .take(limit);
    
    return logs.map(log => ({
      ...log,
      timestampISO: new Date(log.timestamp).toISOString(),
    }));
  },
});

/**
 * Get relevance logs by decision type
 */
export const getLogsByDecision = query({
  args: {
    decision: v.union(v.literal('RELEVANT'), v.literal('NOT_RELEVANT')),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;
    
    const logs = await ctx.db
      .query('relevanceLogs')
      .withIndex('decision', q => q.eq('decision', args.decision))
      .order('desc')
      .take(limit);
    
    return logs.map(log => ({
      ...log,
      timestampISO: new Date(log.timestamp).toISOString(),
    }));
  },
});

/**
 * Get statistics about relevance checks
 */
export const getStats = query({
  handler: async (ctx) => {
    const allLogs = await ctx.db.query('relevanceLogs').collect();
    
    const totalChecks = allLogs.length;
    const relevantCount = allLogs.filter(l => l.decision === 'RELEVANT').length;
    const notRelevantCount = allLogs.filter(l => l.decision === 'NOT_RELEVANT').length;
    
    // Get per-agent stats
    const agentStats = new Map<string, { relevant: number; notRelevant: number }>();
    for (const log of allLogs) {
      const stats = agentStats.get(log.agentName) || { relevant: 0, notRelevant: 0 };
      if (log.decision === 'RELEVANT') {
        stats.relevant++;
      } else {
        stats.notRelevant++;
      }
      agentStats.set(log.agentName, stats);
    }
    
    return {
      totalChecks,
      relevantCount,
      notRelevantCount,
      relevantPercentage: totalChecks > 0 ? (relevantCount / totalChecks) * 100 : 0,
      notRelevantPercentage: totalChecks > 0 ? (notRelevantCount / totalChecks) * 100 : 0,
      agentStats: Array.from(agentStats.entries()).map(([agentName, stats]) => ({
        agentName,
        relevant: stats.relevant,
        notRelevant: stats.notRelevant,
        total: stats.relevant + stats.notRelevant,
        relevantPercentage: ((stats.relevant / (stats.relevant + stats.notRelevant)) * 100).toFixed(1),
      })),
    };
  },
});
