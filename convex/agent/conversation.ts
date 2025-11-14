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
 * Determines if the agent needs web search to answer the question
 * @param question The user's question
 * @param agentIdentity The agent's identity/expertise
 * @returns true if web search is needed
 */
async function needsWebSearch(question: string, agentIdentity: string): Promise<boolean> {
  try {
    const { content } = await chatCompletion({
      messages: [
        {
          role: 'user',
          content: `You are an assistant helping to determine if an agent needs external web information to answer a question.

Agent's identity and expertise: ${agentIdentity}

User's question: "${question}"

Can this agent answer this question based solely on their character, background, and general knowledge? 
Or do they need current web information, specific facts, or external data?

Respond with ONLY "YES" if web search is needed, or "NO" if the agent can answer without it.

Examples:
- "What's your favorite food?" -> NO (personal question about the agent)
- "What's the weather like?" -> YES (needs real-time data)
- "Tell me about yourself" -> NO (about the agent)
- "What's the population of France?" -> YES (needs factual data)
- "How do you feel about politics?" -> NO (opinion based on character)
- "What happened in the news today?" -> YES (needs current information)

Answer (YES or NO):`,
        },
      ],
      max_tokens: 10,
    });
    
    const needsSearch = content.trim().toUpperCase().includes('YES');
    console.log(`[WebSearch] Question: "${question}" | Needs web search: ${needsSearch}`);
    return needsSearch;
  } catch (error) {
    console.error('[WebSearch] Error determining if web search needed:', error);
    // Default to not searching to avoid errors
    return false;
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
        const searchResults = await performWebSearch(lastOtherPlayerMessage.text);
        const searchDuration = Date.now() - searchStartTime;
        
        webSearchContext = await filterAndFormatResults(
          searchResults,
          agent?.identity || '',
          lastOtherPlayerMessage.text
        );
        
        // Log the web search
        await logWebSearch(ctx, {
          timestamp: searchStartTime,
          question: lastOtherPlayerMessage.text,
          agentName: player.name,
          agentIdentity: agent?.identity,
          searchResults,
          success: searchResults.length > 0,
          duration: searchDuration,
          resultCount: searchResults.length,
          formattedContext: webSearchContext || undefined,
          triggerType: 'proactive',
        });
        
        if (webSearchContext) {
          console.log(`[WebSearch] ✅ Web context successfully added to agent's knowledge`);
        } else {
          console.log(`[WebSearch] ⚠️ No usable web context found`);
        }
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
        const searchResults = await performWebSearch(lastOtherPlayerMessage.text);
        const fallbackDuration = Date.now() - fallbackStartTime;
        
        webSearchContext = await filterAndFormatResults(
          searchResults,
          agent?.identity || '',
          lastOtherPlayerMessage.text
        );
        
        // Log the fallback web search
        await logWebSearch(ctx, {
          timestamp: fallbackStartTime,
          question: lastOtherPlayerMessage.text,
          agentName: player.name,
          agentIdentity: agent?.identity,
          searchResults,
          success: searchResults.length > 0 && !!webSearchContext,
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
        const searchResults = await performWebSearch(lastOtherPlayerMessage.text);
        const searchDuration = Date.now() - searchStartTime;
        
        webSearchContext = await filterAndFormatResults(
          searchResults,
          agent?.identity || '',
          lastOtherPlayerMessage.text
        );
        
        // Log the web search
        await logWebSearch(ctx, {
          timestamp: searchStartTime,
          question: lastOtherPlayerMessage.text,
          agentName: player.name,
          agentIdentity: agent?.identity,
          searchResults,
          success: searchResults.length > 0,
          duration: searchDuration,
          resultCount: searchResults.length,
          formattedContext: webSearchContext || undefined,
          triggerType: 'proactive',
        });
        
        if (webSearchContext) {
          console.log(`[WebSearch] ✅ Web context successfully added to agent's knowledge`);
        } else {
          console.log(`[WebSearch] ⚠️ No usable web context found`);
        }
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
        const searchResults = await performWebSearch(lastOtherPlayerMessage.text);
        const fallbackDuration = Date.now() - fallbackStartTime;
        
        webSearchContext = await filterAndFormatResults(
          searchResults,
          agent?.identity || '',
          lastOtherPlayerMessage.text
        );
        
        // Log the fallback web search
        await logWebSearch(ctx, {
          timestamp: fallbackStartTime,
          question: lastOtherPlayerMessage.text,
          agentName: player.name,
          agentIdentity: agent?.identity,
          searchResults,
          success: searchResults.length > 0 && !!webSearchContext,
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
