/**
 * Web search functionality for augmenting agent responses with real-time information
 */

import { chatCompletion } from './llm';

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  summary?: string; // Summarized content from the actual page
}

/**
 * Performs a web search for the given query
 * @param query The search query (typically the user's question)
 * @returns Array of search results
 */
export async function performWebSearch(query: string): Promise<SearchResult[]> {
  const startTime = Date.now();
  console.log(`\n${'='.repeat(80)}`);
  console.log(`[WebSearch] 🔍 Starting web search`);
  console.log(`[WebSearch] Query: "${query}"`);
  console.log(`[WebSearch] Timestamp: ${new Date().toISOString()}`);
  
  try {
    // Using DuckDuckGo Instant Answer API (free, no API key required)
    const encodedQuery = encodeURIComponent(query);
    const apiUrl = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`;
    console.log(`[WebSearch] API URL: ${apiUrl}`);
    console.log(`[WebSearch] Attempting fetch...`);
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    console.log(`[WebSearch] Fetch completed, status: ${response.status}`);
    
    if (!response.ok) {
      console.warn(`[WebSearch] ❌ Search failed: ${response.statusText} (${response.status})`);
      return [];
    }
    
    console.log(`[WebSearch] ✅ API response received (${response.status})`);
    
    const data = await response.json();
    const results: SearchResult[] = [];
    
    // Extract results from DuckDuckGo response
    if (data.AbstractText && data.AbstractText.trim()) {
      console.log(`[WebSearch] 📄 Found abstract: "${data.Heading || 'Summary'}"`);
      results.push({
        title: data.Heading || 'Summary',
        snippet: data.AbstractText,
        url: data.AbstractURL || '',
      });
    }
    
    // Add related topics
    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      console.log(`[WebSearch] 📚 Found ${data.RelatedTopics.length} related topics`);
      let addedTopics = 0;
      for (const topic of data.RelatedTopics.slice(0, 3)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || 'Related',
            snippet: topic.Text,
            url: topic.FirstURL,
          });
          addedTopics++;
          console.log(`[WebSearch]   └─ Topic ${addedTopics}: ${topic.Text.split(' - ')[0]}`);
        }
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`[WebSearch] ✅ Search completed in ${duration}ms`);
    console.log(`[WebSearch] 📊 Total results found: ${results.length}`);
    
    const finalResults = results.slice(0, 5);
    if (finalResults.length < results.length) {
      console.log(`[WebSearch] ✂️ Trimmed to top ${finalResults.length} results`);
    }
    
    return finalResults;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[WebSearch] ❌ Error after ${duration}ms`);
    console.error(`[WebSearch] Error type: ${error instanceof Error ? error.constructor.name : typeof error}`);
    console.error(`[WebSearch] Error message: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(`[WebSearch] Stack trace:`, error.stack);
    }
    console.error(`[WebSearch] Full error:`, error);
    return [];
  }
}

/**
 * Fetches and summarizes content from a URL
 * @param url The URL to fetch content from
 * @param userQuestion The user's question for context
 * @returns Summarized content or null if failed
 */
async function fetchAndSummarizeUrl(url: string, userQuestion: string): Promise<string | null> {
  const startTime = Date.now();
  console.log(`\n[WebSearch] 📥 Fetching webpage content`);
  console.log(`[WebSearch] URL: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AI-Town-Bot/1.0)',
      },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    
    const fetchDuration = Date.now() - startTime;
    
    if (!response.ok) {
      console.warn(`[WebSearch] ❌ Failed to fetch (${fetchDuration}ms): ${response.statusText} (${response.status})`);
      return null;
    }
    
    console.log(`[WebSearch] ✅ Page fetched successfully (${fetchDuration}ms)`);
    
    const html = await response.text();
    const htmlSize = (html.length / 1024).toFixed(2);
    console.log(`[WebSearch] 📄 HTML size: ${htmlSize} KB`);
    
    const textContent = extractTextFromHtml(html);
    const textSize = (textContent.length / 1024).toFixed(2);
    
    if (!textContent || textContent.length < 100) {
      console.warn(`[WebSearch] ⚠️ Extracted text too short (${textContent.length} chars), skipping`);
      return null;
    }
    
    console.log(`[WebSearch] ✂️ Extracted text: ${textSize} KB (${textContent.length} chars)`);
    console.log(`[WebSearch] 🤖 Sending to LLM for summarization...`);
    
    const summaryStartTime = Date.now();
    const summary = await summarizeContent(textContent, userQuestion);
    const summaryDuration = Date.now() - summaryStartTime;
    
    console.log(`[WebSearch] ✅ Summary generated in ${summaryDuration}ms`);
    console.log(`[WebSearch] 📝 Summary length: ${summary.length} chars`);
    
    const totalDuration = Date.now() - startTime;
    console.log(`[WebSearch] ⏱️ Total processing time: ${totalDuration}ms`);
    
    return summary;
  } catch (error) {
    const duration = Date.now() - startTime;
    if (error instanceof Error && error.name === 'TimeoutError') {
      console.error(`[WebSearch] ⏰ Timeout after ${duration}ms fetching ${url}`);
    } else {
      console.error(`[WebSearch] ❌ Error after ${duration}ms:`, error);
    }
    return null;
  }
}

/**
 * Extracts readable text from HTML
 */
function extractTextFromHtml(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  
  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  
  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  // Limit length for summarization
  return text.slice(0, 5000); // First 5000 chars
}

/**
 * Summarizes content using LLM
 */
async function summarizeContent(content: string, userQuestion: string): Promise<string> {
  try {
    const { content: summary } = await chatCompletion({
      messages: [
        {
          role: 'user',
          content: `Summarize the following content in 2-3 sentences, focusing on information relevant to this question: "${userQuestion}"\n\nContent:\n${content}`,
        },
      ],
      max_tokens: 200,
    });
    return summary;
  } catch (error) {
    console.error('[WebSearch] Error summarizing content:', error);
    return content.slice(0, 500) + '...'; // Fallback to truncated content
  }
}

/**
 * Filters search results based on relevance to the agent's identity and fetches summaries
 * @param results Search results to filter
 * @param agentIdentity The agent's identity/character description
 * @param userQuestion The user's original question
 * @returns Filtered and formatted search results as a string
 */
export async function filterAndFormatResults(
  results: SearchResult[],
  agentIdentity: string,
  userQuestion: string
): Promise<string> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`[WebSearch] 🔍 Filtering and formatting results`);
  console.log(`[WebSearch] Input results: ${results.length}`);
  
  if (results.length === 0) {
    console.log(`[WebSearch] ⚠️ No results to process`);
    return '';
  }
  
  // Simple relevance filtering based on keywords from agent identity
  console.log(`[WebSearch] 📊 Extracting keywords for relevance scoring...`);
  const identityKeywords = extractKeywords(agentIdentity);
  const questionKeywords = extractKeywords(userQuestion);
  const allKeywords = [...identityKeywords, ...questionKeywords];
  
  console.log(`[WebSearch] 🔑 Agent keywords: [${identityKeywords.slice(0, 5).join(', ')}${identityKeywords.length > 5 ? '...' : ''}]`);
  console.log(`[WebSearch] 🔑 Question keywords: [${questionKeywords.slice(0, 5).join(', ')}${questionKeywords.length > 5 ? '...' : ''}]`);
  console.log(`[WebSearch] 🔑 Total unique keywords: ${allKeywords.length}`);
  
  // Score each result based on keyword matches
  console.log(`[WebSearch] 📈 Scoring ${results.length} results...`);
  const scoredResults = results.map((result, idx) => {
    const resultText = `${result.title} ${result.snippet}`.toLowerCase();
    const score = allKeywords.filter(keyword => 
      resultText.includes(keyword.toLowerCase())
    ).length;
    
    console.log(`[WebSearch]   ${idx + 1}. "${result.title}" - Score: ${score}`);
    return { result, score };
  });
  
  // Filter out results with no relevance (score 0) and sort by score
  const relevantResults = scoredResults
    .filter(sr => sr.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(sr => sr.result);
  
  console.log(`[WebSearch] ✅ Relevant results after filtering: ${relevantResults.length}`);
  
  // If no relevant results, return top 2 general results anyway
  const finalResults = relevantResults.length > 0 
    ? relevantResults.slice(0, 3) 
    : results.slice(0, 2);
  
  if (relevantResults.length === 0) {
    console.log(`[WebSearch] ⚠️ No relevant results, using top ${finalResults.length} general results`);
  } else {
    console.log(`[WebSearch] 📋 Selected top ${finalResults.length} results for content fetching`);
  }
  
  if (finalResults.length === 0) {
    console.log(`[WebSearch] ❌ No results to process after filtering`);
    return '';
  }
  
  // Fetch and summarize content from URLs
  console.log(`\n[WebSearch] 🌐 Fetching and summarizing content from ${finalResults.length} URLs...`);
  const summarizedResults = await Promise.all(
    finalResults.map(async (result, idx) => {
      console.log(`[WebSearch] Processing URL ${idx + 1}/${finalResults.length}:`);
      const summary = await fetchAndSummarizeUrl(result.url, userQuestion);
      return {
        ...result,
        summary: summary || result.snippet, // Fallback to snippet if fetch fails
      };
    })
  );
  
  // Format results with summaries
  const validResults = summarizedResults.filter(result => result.summary);
  console.log(`\n[WebSearch] 📝 Formatting ${validResults.length} results with summaries...`);
  
  const formattedResults = validResults
    .map((result, idx) => {
      const preview = result.summary.slice(0, 100) + (result.summary.length > 100 ? '...' : '');
      console.log(`[WebSearch]   Source ${idx + 1}: "${result.title}"`);
      console.log(`[WebSearch]   └─ Preview: ${preview}`);
      return `[Source ${idx + 1}] ${result.title}\n${result.summary}\n(${result.url})`;
    })
    .join('\n\n');
  
  if (!formattedResults) {
    console.log(`[WebSearch] ❌ No formatted results available`);
    return '';
  }
  
  const contextLength = formattedResults.length;
  console.log(`[WebSearch] ✅ Final context prepared: ${contextLength} chars`);
  console.log(`[WebSearch] 🎯 Context will be appended to agent prompt`);
  console.log(`${'='.repeat(80)}\n`);
  
  return `\n\nRelevant web information about "${userQuestion}":\n${formattedResults}\n`;
}

/**
 * Extracts keywords from text for relevance matching
 */
function extractKeywords(text: string): string[] {
  // Remove common stop words and extract meaningful words
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'and', 'or', 'but', 'in', 'on', 'at',
    'to', 'for', 'of', 'with', 'by', 'from', 'about', 'as', 'into', 'through',
    'you', 'your', 'they', 'their', 'it', 'its', 'who', 'what', 'when', 'where',
    'why', 'how', 'that', 'this', 'these', 'those', 'i', 'me', 'my', 'we', 'us'
  ]);
  
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word));
  
  // Return unique keywords
  return [...new Set(words)];
}

