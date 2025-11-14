import { v } from 'convex/values';
import { Id } from '../_generated/dataModel';
import { ActionCtx, internalQuery } from '../_generated/server';
import { LLMMessage, chatCompletion } from '../util/llm';
import * as memory from './memory';
import { api, internal } from '../_generated/api';
import * as embeddingsCache from './embeddingsCache';
import { GameId, conversationId, playerId } from '../aiTown/ids';
import { NUM_MEMORIES_TO_SEARCH, WEB_SEARCH_ENABLED_LOCAL } from '../constants';
import { moderateContent, getSafeResponse } from '../util/guardrails';
import { performWebSearch, filterAndFormatResults } from '../util/webSearch';
import { logWebSearch } from '../util/webSearchLogger';
import { logRelevanceCheck } from '../util/relevanceLogger';

const selfInternal = internal.agent.conversation;

/**
 * Check if web search is enabled
 * - For local backend: Uses WEB_SEARCH_ENABLED_LOCAL constant (env vars don't work)
 * - For cloud deployment: Uses ENABLE_WEB_SEARCH environment variable
 */
function isWebSearchEnabled(): boolean {
  const envValue = process.env['ENABLE_WEB_SEARCH'];
  // If env var is explicitly set (cloud deployment), use it
  if (envValue !== undefined) {
    return envValue === 'true';
  }
  // Otherwise use local constant (local backend doesn't support env vars)
  return WEB_SEARCH_ENABLED_LOCAL;
}

/**
 * Detects if the agent's response indicates they cannot answer the question
 * @param response The agent's response
 * @returns true if the response indicates inability to answer
 */
function detectCannotAnswerResponse(response: string): boolean {
  const cannotAnswerPatterns = [
    // English patterns
    /outside\s+(my|of\s+my)\s+(competenc|expertise|knowledge|scope)/i,
    /beyond\s+(my|of\s+my)\s+(competenc|expertise|knowledge|scope)/i,
    /don'?t\s+have\s+(enough\s+)?(information|knowledge|data)/i,
    /can'?t\s+(answer|help|provide\s+information)/i,
    /unable\s+to\s+(answer|help|provide)/i,
    /not\s+(qualified|able|equipped)\s+to\s+(answer|help)/i,
    /lack\s+the\s+(information|knowledge|expertise)/i,
    /need\s+(more|additional|external)\s+(information|data|knowledge)/i,
    /would\s+need\s+to\s+(research|look\s+up|search)/i,
    
    // Armenian patterns (Այդ հարցը դուրս է իմ լիազորությունների...)
    /դուրս\s+է\s+(իմ\s+)?(լիազորությունների|գիտելիքների|իմացության)/i,
    /չեմ\s+կարող\s+պատասխանել/i,
    /բավարար\s+տեղեկություններ\s+չունեմ/i,
    /անհրաժեշտ\s+է\s+(հետազոտել|որոնել)/i,
    
    // Russian patterns
    /вне\s+(моей|моих)\s+(компетенции|знаний)/i,
    /не\s+могу\s+ответить/i,
    /недостаточно\s+информации/i,
  ];
  
  for (const pattern of cannotAnswerPatterns) {
    if (pattern.test(response)) {
      console.log(`[WebSearch] 🚨 Detected "cannot answer" pattern: ${pattern.source}`);
      return true;
    }
  }
  
  return false;
}

/**
 * Determines if search results are relevant to the specific agent
 * This runs AFTER getting search results to filter based on actual content
 * @param searchResults The search results from web search
 * @param agentName The agent's full name
 * @param agentIdentity The agent's identity/expertise
 * @param question The original user question
 * @returns Object with relevance decision and reasoning
 */
async function areSearchResultsRelevantToAgent(
  searchResults: Array<{ title: string; snippet: string; url: string }>,
  agentName: string,
  agentIdentity: string,
  question: string
): Promise<{ isRelevant: boolean; reasoning: string }> {
  try {
    // Format search results for LLM evaluation
    const resultsText = searchResults.map((r, i) => 
      `Result ${i + 1}:\nTitle: ${r.title}\nSnippet: ${r.snippet}\nURL: ${r.url}`
    ).join('\n\n');
    
    const { content } = await chatCompletion({
      messages: [
        {
          role: 'user',
          content: `You are evaluating if web search results are directly relevant to a specific agent.

Agent Name: ${agentName}
Agent Identity: ${agentIdentity}
User Question: "${question}"

Search Results:
${resultsText}

Are these search results specifically about or directly relevant to ${agentName}?
Consider:
- Do the results mention ${agentName} by name?
- Are the results about topics/events directly involving this specific person?
- Are the results about the same organization/role but NOT about this specific person?

Respond in this format:
DECISION: RELEVANT or NOT_RELEVANT
REASONING: Brief explanation (1-2 sentences)

Example 1:
Question: "Tell me about Ruben Rubinyan"
Results mention "Ruben Rubinyan" and his work
→ DECISION: RELEVANT
REASONING: Results directly mention and discuss Ruben Rubinyan's activities.

Example 2:
Question: "What is the economic policy?"
Results about "Armenia's economic policy" but don't mention the agent by name
→ DECISION: NOT_RELEVANT
REASONING: Results are about economic policy in general, not specifically about this agent.

Now evaluate:`,
        },
      ],
      max_tokens: 150,
    });
    
    const lines = content.trim().split('\n');
    const decisionLine = lines.find(l => l.startsWith('DECISION:'));
    const reasoningLine = lines.find(l => l.startsWith('REASONING:'));
    
    const isRelevant = decisionLine?.toUpperCase().includes('RELEVANT') && 
                      !decisionLine?.toUpperCase().includes('NOT_RELEVANT') || false;
    const reasoning = reasoningLine?.replace('REASONING:', '').trim() || 'No reasoning provided';
    
    console.log(`[WebSearch] 🎯 Results Relevance Check for ${agentName}:`);
    console.log(`[WebSearch]    Decision: ${isRelevant ? 'RELEVANT ✅' : 'NOT_RELEVANT ⛔'}`);
    console.log(`[WebSearch]    Reasoning: ${reasoning}`);
    
    return { isRelevant, reasoning };
  } catch (error) {
    console.error('[WebSearch] Error checking results relevance:', error);
    // Default to relevant to avoid losing valid information
    return { 
      isRelevant: true, 
      reasoning: 'Error during relevance check, defaulting to relevant' 
    };
  }
}

/**
 * Determines if the agent needs web search to answer the question
 * @param question The user's question
 * @param agentIdentity The agent's identity/expertise
 * @returns true if web search is needed
 */
async function needsWebSearch(question: string, agentIdentity: string): Promise<boolean> {
  try {
    // Check if web search is needed (relevance will be checked after getting results)
    const { content } = await chatCompletion({
      messages: [
        {
          role: 'user',
          content: `You are an assistant helping to determine if an agent needs external web information to answer a question.

Agent's identity and expertise: ${agentIdentity}

User's question: "${question}"

The question is relevant to the agent's domain. Now determine:
Can this agent answer based solely on their character, background, and general knowledge? 
Or do they need current web information, specific facts, or external data?

Respond with ONLY "YES" if web search is needed, or "NO" if the agent can answer without it.

Examples:
- "What's your stance on this issue?" -> NO (personal opinion)
- "What's the latest unemployment rate?" -> YES (needs current data)
- "Tell me about your background" -> NO (about the agent)
- "What was decided in parliament yesterday?" -> YES (needs recent information)
- "How do you approach policy?" -> NO (opinion based on character)
- "What happened in the recent election?" -> YES (needs current information)

Answer (YES or NO):`,
        },
      ],
      max_tokens: 10,
    });
    
    const needsSearch = content.trim().toUpperCase().includes('YES');
    console.log(`[WebSearch] ✅ Question needs web search: ${needsSearch}`);
    return needsSearch;
  } catch (error) {
    console.error('[WebSearch] Error determining if web search needed:', error);
    // Default to not searching to avoid errors
    return false;
  }
}

/**
 * Rewrites a question to be more specific to the agent's persona and context
 * @param question The original user question
 * @param agentIdentity The agent's identity/expertise
 * @param agentName The agent's name
 * @returns The rewritten question optimized for web search
 */
async function rewriteQuestionForAgent(
  question: string, 
  agentIdentity: string,
  agentName: string
): Promise<string> {
  try {
    const { content } = await chatCompletion({
      messages: [
        {
          role: 'user',
          content: `You are helping to rewrite a user's question to make it more specific and contextual for a web search.

Agent's name: ${agentName}
Agent's identity and expertise: ${agentIdentity}

Original question: "${question}"

Rewrite this question to be more specific and searchable, incorporating:
1. The agent's specific role/domain (e.g., "Armenian parliament" if they're a deputy)
2. The agent's country or jurisdiction if relevant
3. The agent's area of expertise if applicable
4. Keep the core intent of the question

The rewritten question should help find information that's specifically relevant to this agent's context.

Examples:
- Original: "What's the latest economic policy?"
  Agent: Armenian Parliamentary Deputy specializing in economics
  Rewritten: "latest economic policy Armenia parliament 2024"

- Original: "Tell me about education reform"
  Agent: Education Minister of Armenia
  Rewritten: "Armenia education reform ministry current policies"

- Original: "What happened in the recent session?"
  Agent: Parliamentary Deputy
  Rewritten: "Armenia parliament recent session decisions"

- Original: "What's the unemployment rate?"
  Agent: Economics Parliamentary Deputy
  Rewritten: "Armenia unemployment rate 2024 latest statistics"

Respond with ONLY the rewritten question, no explanation or quotes.

Rewritten question:`,
        },
      ],
      max_tokens: 100,
    });
    
    const rewritten = content.trim().replace(/^["']|["']$/g, ''); // Remove quotes if present
    console.log(`[WebSearch] 📝 Question rewritten:`);
    console.log(`[WebSearch]    Original: "${question}"`);
    console.log(`[WebSearch]    Rewritten: "${rewritten}"`);
    return rewritten;
  } catch (error) {
    console.error('[WebSearch] Error rewriting question:', error);
    // Fall back to original question
    console.log(`[WebSearch] ⚠️ Using original question due to rewrite error`);
    return question;
  }
}

export async function startConversationMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  conversationId: GameId<'conversations'>,
  playerId: GameId<'players'>,
  otherPlayerId: GameId<'players'>,
) {
  const { player, otherPlayer, agent, otherAgent, lastConversation } = await ctx.runQuery(
    selfInternal.queryPromptData,
    {
      worldId,
      playerId,
      otherPlayerId,
      conversationId,
    },
  );

  // Check if there are any messages in this conversation yet (in case human started it)
  const prevMessages = await ctx.runQuery(api.messages.listMessages, { worldId, conversationId });
  const lastOtherPlayerMessage = [...prevMessages]
    .reverse()
    .find((msg) => msg.author === otherPlayerId);

  // Apply content guardrails if human initiated the conversation with a message
  if (lastOtherPlayerMessage) {
    console.log(`[Guardrails] Checking initial message from ${otherPlayer.name}: "${lastOtherPlayerMessage.text}"`);
    const moderationResult = await moderateContent(lastOtherPlayerMessage.text);
    
    if (!moderationResult.isSafe) {
      console.log(`[Guardrails] Content flagged as ${moderationResult.category}: ${moderationResult.reason}`);
      return getSafeResponse(moderationResult.category, moderationResult.reason);
    }
    console.log('[Guardrails] Content passed moderation check');
  }

  const embedding = await embeddingsCache.fetch(
    ctx,
    `${player.name} is talking to ${otherPlayer.name}`,
    'query',
  );

  const memories = await memory.searchMemories(
    ctx,
    player.id as GameId<'players'>,
    embedding,
    Number(process.env.NUM_MEMORIES_TO_SEARCH) || NUM_MEMORIES_TO_SEARCH,
  );

  const memoryWithOtherPlayer = memories.find(
    (m: any) => m.data.type === 'conversation' && m.data.playerIds.includes(otherPlayerId),
  );
  
  // Two-step system: First check if web search is needed
  let webSearchContext = '';
  if (isWebSearchEnabled() && lastOtherPlayerMessage && lastOtherPlayerMessage.text) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[WebSearch] 🤔 TWO-STEP SYSTEM: Evaluating if web search is needed`);
    console.log(`[WebSearch] Context: Starting conversation`);
    console.log(`[WebSearch] Agent: ${player.name}`);
    console.log(`[WebSearch] User question: "${lastOtherPlayerMessage.text}"`);
    
    const searchStartTime = Date.now();
    try {
      const shouldSearch = await needsWebSearch(
        lastOtherPlayerMessage.text,
        agent?.identity || ''
      );
      
      if (shouldSearch) {
        console.log(`[WebSearch] ✅ DECISION: Web search REQUIRED (outside agent's competencies)`);
        console.log(`[WebSearch] 🌐 Initiating web search...`);
        
        // Rewrite the question to be more specific to the agent's context
        const rewrittenQuestion = await rewriteQuestionForAgent(
          lastOtherPlayerMessage.text,
          agent?.identity || '',
          player.name
        );
        
        const searchResults = await performWebSearch(rewrittenQuestion);
        const searchDuration = Date.now() - searchStartTime;
        
        // Check if search results are relevant to this specific agent
        const relevanceCheck = await areSearchResultsRelevantToAgent(
          searchResults,
          player.name,
          agent?.identity || '',
          lastOtherPlayerMessage.text
        );
        
        // Log the relevance decision
        await logRelevanceCheck({
          timestamp: searchStartTime,
          timestampISO: new Date(searchStartTime).toISOString(),
          question: lastOtherPlayerMessage.text,
          agentName: player.name,
          agentIdentity: agent?.identity,
          searchResults: searchResults.map(r => ({
            title: r.title,
            url: r.url,
            snippet: r.snippet
          })),
          decision: relevanceCheck.isRelevant ? 'RELEVANT' : 'NOT_RELEVANT',
          reasoning: relevanceCheck.reasoning,
          rewrittenQuestion: rewrittenQuestion,
        });
        
        // Only summarize if results are relevant
        if (relevanceCheck.isRelevant) {
          webSearchContext = await filterAndFormatResults(
            searchResults,
            agent?.identity || '',
            lastOtherPlayerMessage.text
          );
          
          if (webSearchContext) {
            console.log(`[WebSearch] ✅ Web context successfully added to agent's knowledge`);
          } else {
            console.log(`[WebSearch] ⚠️ No usable web context found`);
          }
        } else {
          console.log(`[WebSearch] ⛔ Results not relevant to ${player.name}, skipping summarization`);
          webSearchContext = '';
        }
        
        // Log the web search
        await logWebSearch(ctx, {
          timestamp: searchStartTime,
          question: lastOtherPlayerMessage.text,
          agentName: player.name,
          agentIdentity: agent?.identity,
          searchResults,
          success: searchResults.length > 0 && relevanceCheck.isRelevant,
          duration: searchDuration,
          resultCount: searchResults.length,
          formattedContext: webSearchContext || undefined,
          triggerType: 'proactive',
        });
      } else {
        console.log(`[WebSearch] ❌ DECISION: Web search NOT needed (within agent's competencies)`);
        console.log(`[WebSearch] 💭 Agent will answer based on character knowledge`);
      }
    } catch (error) {
      const searchDuration = Date.now() - searchStartTime;
      console.error(`[WebSearch] ❌ Web search failed:`, error);
      console.error(`[WebSearch] Continuing without web context`);
      
      // Log the failed search
      await logWebSearch(ctx, {
        timestamp: searchStartTime,
        question: lastOtherPlayerMessage.text,
        agentName: player.name,
        agentIdentity: agent?.identity,
        searchResults: [],
        success: false,
        duration: searchDuration,
        resultCount: 0,
        error: error instanceof Error ? error.message : String(error),
        triggerType: 'proactive',
      });
    }
    console.log(`${'='.repeat(80)}\n`);
  } else if (!isWebSearchEnabled() && lastOtherPlayerMessage) {
    console.log(`\n[WebSearch] ⚠️ Web search is DISABLED (set isWebSearchEnabled()=true to enable)\n`);
  }
  
  const prompt = [
    `You are ${player.name}, and you just started a conversation with ${otherPlayer.name}.`,
  ];
  prompt.push(...agentPrompts(otherPlayer, agent, otherAgent ?? null));
  prompt.push(...previousConversationPrompt(otherPlayer, lastConversation));
  prompt.push(...relatedMemoriesPrompt(memories));
  if (webSearchContext) {
    prompt.push(webSearchContext);
    prompt.push('IMPORTANT: The above web information was retrieved because this question is outside your usual expertise. Use this information to provide an accurate, helpful response.');
  }
  if (memoryWithOtherPlayer) {
    prompt.push(
      `Be sure to include some detail or question about a previous conversation in your greeting.`,
    );
  }
  prompt.push(`${player.name}:`);

  const { content } = await chatCompletion({
    messages: [
      {
        role: 'user',
        content: prompt.join('\n'),
      },
    ],
    max_tokens: 300,
    stop: stopWords(otherPlayer.name, player.name),
  });
  
  // Fallback: If agent says they can't answer, try with web search
  if (isWebSearchEnabled() && !webSearchContext && detectCannotAnswerResponse(content)) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[WebSearch] 🔄 FALLBACK MECHANISM TRIGGERED`);
    console.log(`[WebSearch] Agent response indicated inability to answer`);
    console.log(`[WebSearch] Response preview: "${content.slice(0, 100)}..."`);
    console.log(`[WebSearch] 🌐 Retrying with web search...`);
    
    const fallbackStartTime = Date.now();
    try {
      if (lastOtherPlayerMessage && lastOtherPlayerMessage.text) {
        // Rewrite the question for better search results
        const rewrittenQuestion = await rewriteQuestionForAgent(
          lastOtherPlayerMessage.text,
          agent?.identity || '',
          player.name
        );
        
        const searchResults = await performWebSearch(rewrittenQuestion);
        const fallbackDuration = Date.now() - fallbackStartTime;
        
        // Check if search results are relevant to this specific agent
        const relevanceCheck = await areSearchResultsRelevantToAgent(
          searchResults,
          player.name,
          agent?.identity || '',
          lastOtherPlayerMessage.text
        );
        
        // Log the relevance decision
        await logRelevanceCheck({
          timestamp: fallbackStartTime,
          timestampISO: new Date(fallbackStartTime).toISOString(),
          question: lastOtherPlayerMessage.text,
          agentName: player.name,
          agentIdentity: agent?.identity,
          searchResults: searchResults.map(r => ({
            title: r.title,
            url: r.url,
            snippet: r.snippet
          })),
          decision: relevanceCheck.isRelevant ? 'RELEVANT' : 'NOT_RELEVANT',
          reasoning: relevanceCheck.reasoning,
          rewrittenQuestion: rewrittenQuestion,
        });
        
        // Only summarize if results are relevant
        if (relevanceCheck.isRelevant) {
          webSearchContext = await filterAndFormatResults(
            searchResults,
            agent?.identity || '',
            lastOtherPlayerMessage.text
          );
        } else {
          console.log(`[WebSearch] ⛔ Fallback results not relevant to ${player.name}, skipping summarization`);
          webSearchContext = '';
        }
        
        // Log the fallback web search
        await logWebSearch(ctx, {
          timestamp: fallbackStartTime,
          question: lastOtherPlayerMessage.text,
          agentName: player.name,
          agentIdentity: agent?.identity,
          searchResults,
          success: searchResults.length > 0 && relevanceCheck.isRelevant && !!webSearchContext,
          duration: fallbackDuration,
          resultCount: searchResults.length,
          formattedContext: webSearchContext || undefined,
          triggerType: 'fallback',
        });
        
        if (webSearchContext) {
          console.log(`[WebSearch] ✅ Web context obtained, regenerating response...`);
          
          // Regenerate prompt with web context
          const retryPrompt = [
            `You are ${player.name}, and you just started a conversation with ${otherPlayer.name}.`,
          ];
          retryPrompt.push(...agentPrompts(otherPlayer, agent, otherAgent ?? null));
          retryPrompt.push(...previousConversationPrompt(otherPlayer, lastConversation));
          retryPrompt.push(...relatedMemoriesPrompt(memories));
          retryPrompt.push(webSearchContext);
          retryPrompt.push('IMPORTANT: You previously said you could not answer this question. The above web information has been retrieved to help you provide an accurate answer. Use this information to answer the question properly.');
          if (memoryWithOtherPlayer) {
            retryPrompt.push(
              `Be sure to include some detail or question about a previous conversation in your greeting.`,
            );
          }
          retryPrompt.push(`${player.name}:`);
          
          const { content: retryContent } = await chatCompletion({
            messages: [
              {
                role: 'user',
                content: retryPrompt.join('\n'),
              },
            ],
            max_tokens: 300,
            stop: stopWords(otherPlayer.name, player.name),
          });
          
          console.log(`[WebSearch] ✅ New response generated with web context`);
          console.log(`[WebSearch] 🔄 Adding [web_search] prefix to response`);
          console.log(`${'='.repeat(80)}\n`);
          return `[web_search] ${retryContent}`;
        } else {
          console.log(`[WebSearch] ⚠️ Could not obtain web context, using original response`);
          console.log(`${'='.repeat(80)}\n`);
        }
      }
    } catch (error) {
      console.error(`[WebSearch] ❌ Fallback search failed:`, error);
      console.error(`[WebSearch] Using original response`);
    }
  }
  
  // Add [web_search] prefix if web context was used in initial response
  if (webSearchContext) {
    console.log(`[WebSearch] 🔄 Adding [web_search] prefix to response`);
    return `[web_search] ${content}`;
  }
  
  return content;
}

export async function continueConversationMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  conversationId: GameId<'conversations'>,
  playerId: GameId<'players'>,
  otherPlayerId: GameId<'players'>,
) {
  const { player, otherPlayer, conversation, agent, otherAgent } = await ctx.runQuery(
    selfInternal.queryPromptData,
    {
      worldId,
      playerId,
      otherPlayerId,
      conversationId,
    },
  );

  // Get the conversation messages to check the last message from the other player
  const prevMessages = await ctx.runQuery(api.messages.listMessages, { worldId, conversationId });
  
  // Find the most recent message from the other player (human)
  const lastOtherPlayerMessage = [...prevMessages]
    .reverse()
    .find((msg) => msg.author === otherPlayerId);

  // Apply content guardrails if there's a message from the other player
  if (lastOtherPlayerMessage) {
    console.log(`[Guardrails] Checking message from ${otherPlayer.name}: "${lastOtherPlayerMessage.text}"`);
    const moderationResult = await moderateContent(lastOtherPlayerMessage.text);
    
    if (!moderationResult.isSafe) {
      console.log(`[Guardrails] Content flagged as ${moderationResult.category}: ${moderationResult.reason}`);
      return getSafeResponse(moderationResult.category, moderationResult.reason);
    }
    console.log('[Guardrails] Content passed moderation check');
  }

  const now = Date.now();
  const started = new Date(conversation.created);
  const embedding = await embeddingsCache.fetch(
    ctx,
    `What do you think about ${otherPlayer.name}?`,
    'query',
  );
  const memories = await memory.searchMemories(ctx, player.id as GameId<'players'>, embedding, 3);
  
  // Two-step system: First check if web search is needed
  let webSearchContext = '';
  if (isWebSearchEnabled() && lastOtherPlayerMessage && lastOtherPlayerMessage.text) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[WebSearch] 🤔 TWO-STEP SYSTEM: Evaluating if web search is needed`);
    console.log(`[WebSearch] Context: Continuing conversation`);
    console.log(`[WebSearch] Agent: ${player.name}`);
    console.log(`[WebSearch] User question: "${lastOtherPlayerMessage.text}"`);
    
    const searchStartTime = Date.now();
    try {
      const shouldSearch = await needsWebSearch(
        lastOtherPlayerMessage.text,
        agent?.identity || ''
      );
      
      if (shouldSearch) {
        console.log(`[WebSearch] ✅ DECISION: Web search REQUIRED (outside agent's competencies)`);
        console.log(`[WebSearch] 🌐 Initiating web search...`);
        
        // Rewrite the question to be more specific to the agent's context
        const rewrittenQuestion = await rewriteQuestionForAgent(
          lastOtherPlayerMessage.text,
          agent?.identity || '',
          player.name
        );
        
        const searchResults = await performWebSearch(rewrittenQuestion);
        const searchDuration = Date.now() - searchStartTime;
        
        // Check if search results are relevant to this specific agent
        const relevanceCheck = await areSearchResultsRelevantToAgent(
          searchResults,
          player.name,
          agent?.identity || '',
          lastOtherPlayerMessage.text
        );
        
        // Log the relevance decision
        await logRelevanceCheck({
          timestamp: searchStartTime,
          timestampISO: new Date(searchStartTime).toISOString(),
          question: lastOtherPlayerMessage.text,
          agentName: player.name,
          agentIdentity: agent?.identity,
          searchResults: searchResults.map(r => ({
            title: r.title,
            url: r.url,
            snippet: r.snippet
          })),
          decision: relevanceCheck.isRelevant ? 'RELEVANT' : 'NOT_RELEVANT',
          reasoning: relevanceCheck.reasoning,
          rewrittenQuestion: rewrittenQuestion,
        });
        
        // Only summarize if results are relevant
        if (relevanceCheck.isRelevant) {
          webSearchContext = await filterAndFormatResults(
            searchResults,
            agent?.identity || '',
            lastOtherPlayerMessage.text
          );
          
          if (webSearchContext) {
            console.log(`[WebSearch] ✅ Web context successfully added to agent's knowledge`);
          } else {
            console.log(`[WebSearch] ⚠️ No usable web context found`);
          }
        } else {
          console.log(`[WebSearch] ⛔ Results not relevant to ${player.name}, skipping summarization`);
          webSearchContext = '';
        }
        
        // Log the web search
        await logWebSearch(ctx, {
          timestamp: searchStartTime,
          question: lastOtherPlayerMessage.text,
          agentName: player.name,
          agentIdentity: agent?.identity,
          searchResults,
          success: searchResults.length > 0 && relevanceCheck.isRelevant,
          duration: searchDuration,
          resultCount: searchResults.length,
          formattedContext: webSearchContext || undefined,
          triggerType: 'proactive',
        });
      } else {
        console.log(`[WebSearch] ❌ DECISION: Web search NOT needed (within agent's competencies)`);
        console.log(`[WebSearch] 💭 Agent will answer based on character knowledge`);
      }
    } catch (error) {
      const searchDuration = Date.now() - searchStartTime;
      console.error(`[WebSearch] ❌ Web search failed:`, error);
      console.error(`[WebSearch] Continuing without web context`);
      
      // Log the failed search
      await logWebSearch(ctx, {
        timestamp: searchStartTime,
        question: lastOtherPlayerMessage.text,
        agentName: player.name,
        agentIdentity: agent?.identity,
        searchResults: [],
        success: false,
        duration: searchDuration,
        resultCount: 0,
        error: error instanceof Error ? error.message : String(error),
        triggerType: 'proactive',
      });
    }
    console.log(`${'='.repeat(80)}\n`);
  } else if (!isWebSearchEnabled() && lastOtherPlayerMessage) {
    console.log(`\n[WebSearch] ⚠️ Web search is DISABLED (set isWebSearchEnabled()=true to enable)\n`);
  }
  
  const prompt = [
    `You are ${player.name}, and you're currently in a conversation with ${otherPlayer.name}.`,
    `The conversation started at ${started.toLocaleString()}. It's now ${new Date().toLocaleString()}.`,
  ];
  prompt.push(...agentPrompts(otherPlayer, agent, otherAgent ?? null));
  prompt.push(...relatedMemoriesPrompt(memories));
  if (webSearchContext) {
    prompt.push(webSearchContext);
    prompt.push('IMPORTANT: The above web information was retrieved because this question requires external knowledge. Use this information to provide an accurate response.');
  }
  prompt.push(
    `Below is the current chat history between you and ${otherPlayer.name}.`,
    `DO NOT greet them again. Do NOT use the word "Hey" too often. Your response should be brief and within 200 characters.`,
  );

  const llmMessages: LLMMessage[] = [
    {
      role: 'user',
      content: prompt.join('\n'),
    },
    ...(await previousMessages(
      ctx,
      worldId,
      player,
      otherPlayer,
      conversation.id as GameId<'conversations'>,
    )),
  ];
  llmMessages.push({ role: 'user', content: `${player.name}:` });

  const { content } = await chatCompletion({
    messages: llmMessages,
    max_tokens: 300,
    stop: stopWords(otherPlayer.name, player.name),
  });
  
  // Fallback: If agent says they can't answer, try with web search
  if (isWebSearchEnabled() && !webSearchContext && detectCannotAnswerResponse(content)) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[WebSearch] 🔄 FALLBACK MECHANISM TRIGGERED`);
    console.log(`[WebSearch] Agent response indicated inability to answer`);
    console.log(`[WebSearch] Response preview: "${content.slice(0, 100)}..."`);
    console.log(`[WebSearch] 🌐 Retrying with web search...`);
    
    const fallbackStartTime = Date.now();
    try {
      if (lastOtherPlayerMessage && lastOtherPlayerMessage.text) {
        // Rewrite the question for better search results
        const rewrittenQuestion = await rewriteQuestionForAgent(
          lastOtherPlayerMessage.text,
          agent?.identity || '',
          player.name
        );
        
        const searchResults = await performWebSearch(rewrittenQuestion);
        const fallbackDuration = Date.now() - fallbackStartTime;
        
        // Check if search results are relevant to this specific agent
        const relevanceCheck = await areSearchResultsRelevantToAgent(
          searchResults,
          player.name,
          agent?.identity || '',
          lastOtherPlayerMessage.text
        );
        
        // Log the relevance decision
        await logRelevanceCheck({
          timestamp: fallbackStartTime,
          timestampISO: new Date(fallbackStartTime).toISOString(),
          question: lastOtherPlayerMessage.text,
          agentName: player.name,
          agentIdentity: agent?.identity,
          searchResults: searchResults.map(r => ({
            title: r.title,
            url: r.url,
            snippet: r.snippet
          })),
          decision: relevanceCheck.isRelevant ? 'RELEVANT' : 'NOT_RELEVANT',
          reasoning: relevanceCheck.reasoning,
          rewrittenQuestion: rewrittenQuestion,
        });
        
        // Only summarize if results are relevant
        if (relevanceCheck.isRelevant) {
          webSearchContext = await filterAndFormatResults(
            searchResults,
            agent?.identity || '',
            lastOtherPlayerMessage.text
          );
        } else {
          console.log(`[WebSearch] ⛔ Fallback results not relevant to ${player.name}, skipping summarization`);
          webSearchContext = '';
        }
        
        // Log the fallback web search
        await logWebSearch(ctx, {
          timestamp: fallbackStartTime,
          question: lastOtherPlayerMessage.text,
          agentName: player.name,
          agentIdentity: agent?.identity,
          searchResults,
          success: searchResults.length > 0 && relevanceCheck.isRelevant && !!webSearchContext,
          duration: fallbackDuration,
          resultCount: searchResults.length,
          formattedContext: webSearchContext || undefined,
          triggerType: 'fallback',
        });
        
        if (webSearchContext) {
          console.log(`[WebSearch] ✅ Web context obtained, regenerating response...`);
          
          // Regenerate prompt with web context
          const retryPrompt = [
            `You are ${player.name}, and you're currently in a conversation with ${otherPlayer.name}.`,
            `The conversation started at ${started.toLocaleString()}. It's now ${new Date().toLocaleString()}.`,
          ];
          retryPrompt.push(...agentPrompts(otherPlayer, agent, otherAgent ?? null));
          retryPrompt.push(...relatedMemoriesPrompt(memories));
          retryPrompt.push(webSearchContext);
          retryPrompt.push('IMPORTANT: You previously said you could not answer this question. The above web information has been retrieved to help you provide an accurate answer. Use this information to answer the question properly.');
          retryPrompt.push(
            `Below is the current chat history between you and ${otherPlayer.name}.`,
            `DO NOT greet them again. Do NOT use the word "Hey" too often. Your response should be brief and within 200 characters.`,
          );
          
          const retryLlmMessages: LLMMessage[] = [
            {
              role: 'user',
              content: retryPrompt.join('\n'),
            },
            ...(await previousMessages(
              ctx,
              worldId,
              player,
              otherPlayer,
              conversation.id as GameId<'conversations'>,
            )),
          ];
          retryLlmMessages.push({ role: 'user', content: `${player.name}:` });
          
          const { content: retryContent } = await chatCompletion({
            messages: retryLlmMessages,
            max_tokens: 300,
            stop: stopWords(otherPlayer.name, player.name),
          });
          
          console.log(`[WebSearch] ✅ New response generated with web context`);
          console.log(`[WebSearch] 🔄 Adding [web_search] prefix to response`);
          console.log(`${'='.repeat(80)}\n`);
          return `[web_search] ${retryContent}`;
        } else {
          console.log(`[WebSearch] ⚠️ Could not obtain web context, using original response`);
          console.log(`${'='.repeat(80)}\n`);
        }
      }
    } catch (error) {
      console.error(`[WebSearch] ❌ Fallback search failed:`, error);
      console.error(`[WebSearch] Using original response`);
    }
  }
  
  // Add [web_search] prefix if web context was used in initial response
  if (webSearchContext) {
    console.log(`[WebSearch] 🔄 Adding [web_search] prefix to response`);
    return `[web_search] ${content}`;
  }
  
  return content;
}

export async function leaveConversationMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  conversationId: GameId<'conversations'>,
  playerId: GameId<'players'>,
  otherPlayerId: GameId<'players'>,
) {
  const { player, otherPlayer, conversation, agent, otherAgent } = await ctx.runQuery(
    selfInternal.queryPromptData,
    {
      worldId,
      playerId,
      otherPlayerId,
      conversationId,
    },
  );
  const prompt = [
    `You are ${player.name}, and you're currently in a conversation with ${otherPlayer.name}.`,
    `You've decided to leave the question and would like to politely tell them you're leaving the conversation.`,
  ];
  prompt.push(...agentPrompts(otherPlayer, agent, otherAgent ?? null));
  prompt.push(
    `Below is the current chat history between you and ${otherPlayer.name}.`,
    `How would you like to tell them that you're leaving? Your answer should be brief and under 200 characters.`,
  );
  const llmMessages: LLMMessage[] = [
    {
      role: 'user',
      content: prompt.join('\n'),
    },
    ...(await previousMessages(
      ctx,
      worldId,
      player,
      otherPlayer,
      conversation.id as GameId<'conversations'>,
    )),
  ];
  llmMessages.push({ role: 'user', content: `${player.name}:` });

  const { content } = await chatCompletion({
    messages: llmMessages,
    max_tokens: 300,
    stop: stopWords(otherPlayer.name, player.name),
  });
  return content;
}

function agentPrompts(
  otherPlayer: { name: string },
  agent: { identity: string; plan: string } | null,
  otherAgent: { identity: string; plan: string } | null,
): string[] {
  const prompt = [];
  if (agent) {
    prompt.push(`About you: ${agent.identity}`);
    prompt.push(`Your goals for the conversation: ${agent.plan}`);
  }
  if (otherAgent) {
    prompt.push(`About ${otherPlayer.name}: ${otherAgent.identity}`);
  }
  return prompt;
}

function previousConversationPrompt(
  otherPlayer: { name: string },
  conversation: { created: number } | null,
): string[] {
  const prompt = [];
  if (conversation) {
    const prev = new Date(conversation.created);
    const now = new Date();
    prompt.push(
      `Last time you chatted with ${
        otherPlayer.name
      } it was ${prev.toLocaleString()}. It's now ${now.toLocaleString()}.`,
    );
  }
  return prompt;
}

function relatedMemoriesPrompt(memories: memory.Memory[]): string[] {
  const prompt = [];
  if (memories.length > 0) {
    prompt.push(`Here are some related memories in decreasing relevance order:`);
    for (const memory of memories) {
      prompt.push(' - ' + memory.description);
    }
  }
  return prompt;
}

async function previousMessages(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  player: { id: string; name: string },
  otherPlayer: { id: string; name: string },
  conversationId: GameId<'conversations'>,
) {
  const llmMessages: LLMMessage[] = [];
  const prevMessages = await ctx.runQuery(api.messages.listMessages, { worldId, conversationId });
  for (const message of prevMessages) {
    const author = message.author === player.id ? player : otherPlayer;
    const recipient = message.author === player.id ? otherPlayer : player;
    llmMessages.push({
      role: 'user',
      content: `${author.name} to ${recipient.name}: ${message.text}`,
    });
  }
  return llmMessages;
}

export const queryPromptData = internalQuery({
  args: {
    worldId: v.id('worlds'),
    playerId,
    otherPlayerId: playerId,
    conversationId,
  },
  handler: async (ctx, args) => {
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new Error(`World ${args.worldId} not found`);
    }
    const player = world.players.find((p) => p.id === args.playerId);
    if (!player) {
      throw new Error(`Player ${args.playerId} not found`);
    }
    const playerDescription = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .first();
    if (!playerDescription) {
      throw new Error(`Player description for ${args.playerId} not found`);
    }
    const otherPlayer = world.players.find((p) => p.id === args.otherPlayerId);
    if (!otherPlayer) {
      throw new Error(`Player ${args.otherPlayerId} not found`);
    }
    const otherPlayerDescription = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.otherPlayerId))
      .first();
    if (!otherPlayerDescription) {
      throw new Error(`Player description for ${args.otherPlayerId} not found`);
    }
    const conversation = world.conversations.find((c) => c.id === args.conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${args.conversationId} not found`);
    }
    const agent = world.agents.find((a) => a.playerId === args.playerId);
    if (!agent) {
      throw new Error(`Player ${args.playerId} not found`);
    }
    const agentDescription = await ctx.db
      .query('agentDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('agentId', agent.id))
      .first();
    if (!agentDescription) {
      throw new Error(`Agent description for ${agent.id} not found`);
    }
    const otherAgent = world.agents.find((a) => a.playerId === args.otherPlayerId);
    let otherAgentDescription;
    if (otherAgent) {
      otherAgentDescription = await ctx.db
        .query('agentDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('agentId', otherAgent.id))
        .first();
      if (!otherAgentDescription) {
        throw new Error(`Agent description for ${otherAgent.id} not found`);
      }
    }
    const lastTogether = await ctx.db
      .query('participatedTogether')
      .withIndex('edge', (q) =>
        q
          .eq('worldId', args.worldId)
          .eq('player1', args.playerId)
          .eq('player2', args.otherPlayerId),
      )
      // Order by conversation end time descending.
      .order('desc')
      .first();

    let lastConversation = null;
    if (lastTogether) {
      lastConversation = await ctx.db
        .query('archivedConversations')
        .withIndex('worldId', (q) =>
          q.eq('worldId', args.worldId).eq('id', lastTogether.conversationId),
        )
        .first();
      if (!lastConversation) {
        throw new Error(`Conversation ${lastTogether.conversationId} not found`);
      }
    }
    return {
      player: { name: playerDescription.name, ...player },
      otherPlayer: { name: otherPlayerDescription.name, ...otherPlayer },
      conversation,
      agent: { identity: agentDescription.identity, plan: agentDescription.plan, ...agent },
      otherAgent: otherAgent && {
        identity: otherAgentDescription!.identity,
        plan: otherAgentDescription!.plan,
        ...otherAgent,
      },
      lastConversation,
    };
  },
});

function stopWords(otherPlayer: string, player: string) {
  // These are the words we ask the LLM to stop on. OpenAI only supports 4.
  const variants = [`${otherPlayer} to ${player}`];
  return variants.flatMap((stop) => [stop + ':', stop.toLowerCase() + ':']);
}
