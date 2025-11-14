/**
 * Logging system for web search relevance checks
 * Logs all relevance decisions to track when results are filtered
 */

import { ActionCtx } from '../_generated/server';
import * as fs from 'fs';
import * as path from 'path';

export interface RelevanceLogEntry {
  timestamp: number;
  timestampISO: string;
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
 * Logs a relevance check decision to a JSON file
 * @param entry The relevance log entry
 */
export async function logRelevanceCheck(entry: RelevanceLogEntry): Promise<void> {
  try {
    const logFilePath = path.join(process.cwd(), 'relevance_logs.json');
    
    // Add ISO timestamp
    entry.timestampISO = new Date(entry.timestamp).toISOString();
    
    let logs: RelevanceLogEntry[] = [];
    
    // Read existing logs if file exists
    try {
      if (fs.existsSync(logFilePath)) {
        const existingData = fs.readFileSync(logFilePath, 'utf-8');
        logs = JSON.parse(existingData);
      }
    } catch (readError) {
      console.warn('[RelevanceLogger] Could not read existing logs, starting fresh:', readError);
      logs = [];
    }
    
    // Add new entry
    logs.push(entry);
    
    // Write back to file
    fs.writeFileSync(logFilePath, JSON.stringify(logs, null, 2), 'utf-8');
    
    console.log(`[RelevanceLogger] ✅ Logged relevance check for "${entry.agentName}" - Decision: ${entry.decision}`);
  } catch (error) {
    console.error('[RelevanceLogger] ❌ Failed to log relevance check:', error);
    // Don't throw - logging failure shouldn't break the main flow
  }
}

/**
 * Get all relevance logs
 * @returns Array of all relevance log entries
 */
export function getAllRelevanceLogs(): RelevanceLogEntry[] {
  try {
    const logFilePath = path.join(process.cwd(), 'relevance_logs.json');
    
    if (!fs.existsSync(logFilePath)) {
      return [];
    }
    
    const data = fs.readFileSync(logFilePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[RelevanceLogger] Error reading relevance logs:', error);
    return [];
  }
}

/**
 * Get relevance logs for a specific agent
 * @param agentName The agent's name
 * @returns Array of relevance log entries for the agent
 */
export function getRelevanceLogsByAgent(agentName: string): RelevanceLogEntry[] {
  const allLogs = getAllRelevanceLogs();
  return allLogs.filter(log => log.agentName === agentName);
}

/**
 * Get statistics about relevance checks
 * @returns Object with relevance statistics
 */
export function getRelevanceStats() {
  const logs = getAllRelevanceLogs();
  
  const totalChecks = logs.length;
  const relevantCount = logs.filter(l => l.decision === 'RELEVANT').length;
  const notRelevantCount = logs.filter(l => l.decision === 'NOT_RELEVANT').length;
  
  return {
    totalChecks,
    relevantCount,
    notRelevantCount,
    relevantPercentage: totalChecks > 0 ? (relevantCount / totalChecks) * 100 : 0,
    notRelevantPercentage: totalChecks > 0 ? (notRelevantCount / totalChecks) * 100 : 0,
  };
}

