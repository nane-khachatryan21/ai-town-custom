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
    
    const jsonOutput = JSON.stringify(logs, null, 2);
    
    console.log('\n' + '='.repeat(80));
    console.log('WEB SEARCH LOGS EXPORT');
    console.log('='.repeat(80));
    console.log(`Total logs: ${logs.length}`);
    console.log('='.repeat(80) + '\n');
    console.log(jsonOutput);
    console.log('\n' + '='.repeat(80));
    
    return {
      count: logs.length,
      logs,
      json: jsonOutput,
    };
  },
});

/**
 * Export logs for a specific agent
 */
export const exportByAgent = action({
  args: {
    agentName: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const logs = await ctx.runQuery(api.util.webSearchLogger.getLogsByAgent, {
      agentName: args.agentName,
      limit: args.limit,
    });
    
    const jsonOutput = JSON.stringify(logs, null, 2);
    
    console.log('\n' + '='.repeat(80));
    console.log(`WEB SEARCH LOGS FOR AGENT: ${args.agentName}`);
    console.log('='.repeat(80));
    console.log(`Total logs: ${logs.length}`);
    console.log('='.repeat(80) + '\n');
    console.log(jsonOutput);
    console.log('\n' + '='.repeat(80));
    
    return {
      agentName: args.agentName,
      count: logs.length,
      logs,
      json: jsonOutput,
    };
  },
});

/**
 * Export logs for a specific time range
 */
export const exportByTimeRange = action({
  args: {
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    const logs = await ctx.runQuery(api.util.webSearchLogger.getLogsByTimeRange, {
      startTime: args.startTime,
      endTime: args.endTime,
    });
    
    const jsonOutput = JSON.stringify(logs, null, 2);
    
    console.log('\n' + '='.repeat(80));
    console.log('WEB SEARCH LOGS BY TIME RANGE');
    console.log('='.repeat(80));
    console.log(`From: ${new Date(args.startTime).toISOString()}`);
    console.log(`To: ${new Date(args.endTime).toISOString()}`);
    console.log(`Total logs: ${logs.length}`);
    console.log('='.repeat(80) + '\n');
    console.log(jsonOutput);
    console.log('\n' + '='.repeat(80));
    
    return {
      startTime: args.startTime,
      endTime: args.endTime,
      count: logs.length,
      logs,
      json: jsonOutput,
    };
  },
});

/**
 * Get statistics about web searches
 */
export const getStatistics = action({
  handler: async (ctx) => {
    const stats = await ctx.runQuery(api.util.webSearchLogger.getStats);
    
    console.log('\n' + '='.repeat(80));
    console.log('WEB SEARCH STATISTICS');
    console.log('='.repeat(80));
    console.log(`Total Searches: ${stats.totalSearches}`);
    console.log(`Successful: ${stats.successfulSearches} (${stats.successRate.toFixed(1)}%)`);
    console.log(`Failed: ${stats.failedSearches}`);
    console.log(`Proactive: ${stats.proactiveSearches}`);
    console.log(`Fallback: ${stats.fallbackSearches}`);
    console.log(`Avg Duration: ${stats.avgDuration}ms`);
    console.log(`Avg Results: ${stats.avgResults}`);
    console.log('='.repeat(80) + '\n');
    
    return stats;
  },
});

