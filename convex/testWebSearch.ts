/**
 * Test functions for web search functionality
 */

import { action } from './_generated/server';
import { v } from 'convex/values';
import { performWebSearch, filterAndFormatResults } from './util/webSearch';
import { internal } from './_generated/api';

/**
 * Simple fetch test to verify network access
 * Run this with: just convex run testWebSearch:testFetch
 */
export const testFetch = action({
  handler: async () => {
    console.log('\n🧪 Testing basic fetch functionality...\n');
    
    try {
      console.log('Attempting to fetch from httpbin.org...');
      const response = await fetch('https://httpbin.org/get');
      console.log(`✅ Fetch successful! Status: ${response.status}`);
      const data = await response.json();
      console.log('Response data:', JSON.stringify(data, null, 2));
      return { success: true, status: response.status };
    } catch (error) {
      console.error('❌ Fetch failed');
      console.error('Error:', error);
      console.error('Error message:', error instanceof Error ? error.message : String(error));
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
});

/**
 * Test web search with a sample question
 * Run this with: just convex run testWebSearch:testSearch '{"question": "What is the population of Armenia?"}'
 */
export const testSearch = action({
  args: {
    question: v.string(),
    agentIdentity: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    
    console.log('\n' + '='.repeat(100));
    console.log('🧪 WEB SEARCH TEST FUNCTION');
    console.log('='.repeat(100));
    console.log(`Question: "${args.question}"`);
    console.log(`Agent Identity: "${args.agentIdentity || 'Armenian Parliament Deputy'}"`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log('='.repeat(100) + '\n');
    
    try {
      // Step 1: Perform web search
      console.log('📍 STEP 1: Performing web search...\n');
      const searchResults = await performWebSearch(args.question);
      
      if (searchResults.length === 0) {
        console.log('❌ No search results found');
        return {
          success: false,
          error: 'No search results found',
          duration: Date.now() - startTime,
        };
      }
      
      console.log(`\n✅ Found ${searchResults.length} search results\n`);
      
      // Step 2: Filter and format with summaries
      console.log('📍 STEP 2: Filtering and summarizing content...\n');
      const agentIdentity = args.agentIdentity || 
        'You are a member of the Armenian Parliament. You represent the people of Armenia and work on legislation.';
      
      const formattedContext = await filterAndFormatResults(
        searchResults,
        agentIdentity,
        args.question
      );
      
      if (!formattedContext) {
        console.log('⚠️ No usable context after filtering and summarization');
        return {
          success: false,
          error: 'No usable context after filtering',
          searchResults: searchResults.map(r => ({
            title: r.title,
            url: r.url,
            snippet: r.snippet.slice(0, 100) + '...',
          })),
          duration: Date.now() - startTime,
        };
      }
      
      const totalDuration = Date.now() - startTime;
      
      console.log('\n' + '='.repeat(100));
      console.log('✅ TEST COMPLETED SUCCESSFULLY');
      console.log('='.repeat(100));
      console.log(`Total Duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);
      console.log(`Context Length: ${formattedContext.length} characters`);
      console.log('='.repeat(100));
      
      console.log('\n📄 FORMATTED CONTEXT (Preview):');
      console.log('-'.repeat(100));
      console.log(formattedContext.slice(0, 500) + (formattedContext.length > 500 ? '\n...(truncated)' : ''));
      console.log('-'.repeat(100) + '\n');
      
      return {
        success: true,
        question: args.question,
        searchResultsCount: searchResults.length,
        contextLength: formattedContext.length,
        duration: totalDuration,
        formattedContext: formattedContext,
        searchResults: searchResults.map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet.slice(0, 150) + (r.snippet.length > 150 ? '...' : ''),
        })),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('\n❌ TEST FAILED');
      console.error('Error:', error);
      console.error(`Duration before failure: ${duration}ms\n`);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration,
      };
    }
  },
});

/**
 * Quick test with predefined questions
 * Run this with: just convex run testWebSearch:quickTest
 */
export const quickTest = action({
  handler: async (ctx) => {
    console.log('\n' + '='.repeat(100));
    console.log('🚀 QUICK WEB SEARCH TEST - Running multiple test cases');
    console.log('='.repeat(100) + '\n');
    
    const testCases = [
      {
        question: 'What is the population of Armenia?',
        description: 'Factual question requiring current data',
      },
      {
        question: 'Who is the current prime minister of Armenia?',
        description: 'Current events question',
      },
    ];
    
    const agentIdentity = 'You are a member of the Armenian Parliament. You represent the people of Armenia and work on legislation.';
    const results = [];
    
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      const startTime = Date.now();
      
      console.log(`\n${'='.repeat(100)}`);
      console.log(`TEST CASE ${i + 1}/${testCases.length}: ${testCase.description}`);
      console.log(`Question: "${testCase.question}"`);
      console.log(`${'='.repeat(100)}\n`);
      
      try {
        const searchResults = await performWebSearch(testCase.question);
        
        if (searchResults.length === 0) {
          results.push({
            ...testCase,
            success: false,
            error: 'No search results',
            duration: Date.now() - startTime,
          });
          continue;
        }
        
        const formattedContext = await filterAndFormatResults(
          searchResults,
          agentIdentity,
          testCase.question
        );
        
        results.push({
          ...testCase,
          success: !!formattedContext,
          searchResultsCount: searchResults.length,
          contextLength: formattedContext?.length || 0,
          duration: Date.now() - startTime,
        });
        
      } catch (error) {
        results.push({
          ...testCase,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - startTime,
        });
      }
      
      console.log(`\n✅ Test case ${i + 1} completed\n`);
      
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n' + '='.repeat(100));
    console.log('📊 QUICK TEST SUMMARY');
    console.log('='.repeat(100));
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      console.log(`\n${i + 1}. ${result.question}`);
      console.log(`   Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
      console.log(`   Duration: ${result.duration}ms`);
      if (result.success && 'searchResultsCount' in result) {
        console.log(`   Results: ${result.searchResultsCount} search results`);
        console.log(`   Context: ${result.contextLength} characters`);
      } else if ('error' in result) {
        console.log(`   Error: ${result.error}`);
      }
    }
    
    console.log('\n' + '='.repeat(100) + '\n');
    
    return {
      totalTests: results.length,
      passed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
  },
});

/**
 * Test the fallback mechanism detection
 * Run this with: just convex run testWebSearch:testFallbackDetection
 */
export const testFallbackDetection = action({
  handler: async (ctx) => {
    console.log('\n' + '='.repeat(100));
    console.log('🔍 TESTING FALLBACK DETECTION PATTERNS');
    console.log('='.repeat(100) + '\n');
    
    // Import the detection function logic
    const detectCannotAnswerResponse = (response: string): boolean => {
      const cannotAnswerPatterns = [
        /outside\s+(my|of\s+my)\s+(competenc|expertise|knowledge|scope)/i,
        /beyond\s+(my|of\s+my)\s+(competenc|expertise|knowledge|scope)/i,
        /don'?t\s+have\s+(enough\s+)?(information|knowledge|data)/i,
        /can'?t\s+(answer|help|provide\s+information)/i,
        /unable\s+to\s+(answer|help|provide)/i,
        /not\s+(qualified|able|equipped)\s+to\s+(answer|help)/i,
        /lack\s+the\s+(information|knowledge|expertise)/i,
        /need\s+(more|additional|external)\s+(information|data|knowledge)/i,
        /would\s+need\s+to\s+(research|look\s+up|search)/i,
        /դուրս\s+է\s+(իմ\s+)?(լիազորությունների|գիտելիքների|իմացության)/i,
        /չեմ\s+կարող\s+պատասխանել/i,
        /բավարար\s+տեղեկություններ\s+չունեմ/i,
        /անհրաժեշտ\s+է\s+(հետազոտել|որոնել)/i,
        /вне\s+(моей|моих)\s+(компетенции|знаний)/i,
        /не\s+могу\s+ответить/i,
        /недостаточно\s+информации/i,
      ];
      
      for (const pattern of cannotAnswerPatterns) {
        if (pattern.test(response)) {
          return true;
        }
      }
      
      return false;
    };
    
    const testResponses = [
      {
        response: 'Այդ հարցը դուրս է իմ լիազորությունների և հրապարակային տեղեկատվության շրջանակից',
        shouldDetect: true,
        language: 'Armenian',
      },
      {
        response: "I'm sorry, but this question is outside my competencies and scope of knowledge.",
        shouldDetect: true,
        language: 'English',
      },
      {
        response: "I don't have enough information to answer that question accurately.",
        shouldDetect: true,
        language: 'English',
      },
      {
        response: "I can't answer that without more data.",
        shouldDetect: true,
        language: 'English',
      },
      {
        response: 'Այս հարցը վերաբերում է քաղաքականությանը, և ես կարծում եմ...',
        shouldDetect: false,
        language: 'Armenian (normal response)',
      },
      {
        response: 'That is an interesting question! Based on my knowledge...',
        shouldDetect: false,
        language: 'English (normal response)',
      },
      {
        response: 'չեմ կարող պատասխանել այս հարցին',
        shouldDetect: true,
        language: 'Armenian',
      },
      {
        response: 'Вне моей компетенции отвечать на этот вопрос',
        shouldDetect: true,
        language: 'Russian',
      },
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (let i = 0; i < testResponses.length; i++) {
      const test = testResponses[i];
      const detected = detectCannotAnswerResponse(test.response);
      const success = detected === test.shouldDetect;
      
      console.log(`\nTest ${i + 1}/${testResponses.length}:`);
      console.log(`Language: ${test.language}`);
      console.log(`Response: "${test.response.slice(0, 80)}..."`);
      console.log(`Expected: ${test.shouldDetect ? 'DETECT' : 'NOT DETECT'}`);
      console.log(`Actual: ${detected ? 'DETECTED' : 'NOT DETECTED'}`);
      console.log(`Result: ${success ? '✅ PASS' : '❌ FAIL'}`);
      
      if (success) {
        passed++;
      } else {
        failed++;
      }
    }
    
    console.log('\n' + '='.repeat(100));
    console.log('FALLBACK DETECTION TEST RESULTS');
    console.log('='.repeat(100));
    console.log(`Total tests: ${testResponses.length}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ${failed > 0 ? '❌' : ''}`);
    console.log(`Success rate: ${((passed / testResponses.length) * 100).toFixed(1)}%`);
    console.log('='.repeat(100) + '\n');
    
    return {
      totalTests: testResponses.length,
      passed,
      failed,
      successRate: (passed / testResponses.length) * 100,
    };
  },
});

/**
 * Test the relevance filtering for questions
 * Run this with: just convex run testWebSearch:testRelevanceFiltering
 */
export const testRelevanceFiltering = action({
  handler: async (ctx) => {
    console.log('\n' + '='.repeat(100));
    console.log('🎯 TESTING RELEVANCE FILTERING FOR WEB SEARCH');
    console.log('='.repeat(100) + '\n');
    
    // Import the needsWebSearch function from conversation.ts
    // Note: In actual use, this is called internally - this test simulates it
    const agentIdentity = `You are a member of the Armenian Parliament. 
You represent the people of Armenia and work on legislation, policies, and governance.
Your expertise includes: economics, law, education, healthcare, foreign relations, defense, and social issues.`;

    const testCases = [
      {
        question: 'What is your stance on education reform?',
        shouldBeRelevant: true,
        description: 'Policy-related question',
      },
      {
        question: 'What\'s the best pizza recipe?',
        shouldBeRelevant: false,
        description: 'Completely unrelated to parliamentary work',
      },
      {
        question: 'Can you explain the recent tax legislation?',
        shouldBeRelevant: true,
        description: 'Direct legislative question',
      },
      {
        question: 'How do I fix my car engine?',
        shouldBeRelevant: false,
        description: 'Mechanical question outside domain',
      },
      {
        question: 'What is the current economic situation in Armenia?',
        shouldBeRelevant: true,
        description: 'Economic policy question',
      },
      {
        question: 'What\'s the weather forecast for tomorrow?',
        shouldBeRelevant: false,
        description: 'Weather - not parliamentary domain',
      },
      {
        question: 'Tell me about the parliament\'s recent session',
        shouldBeRelevant: true,
        description: 'Directly about parliamentary work',
      },
      {
        question: 'What movies should I watch this weekend?',
        shouldBeRelevant: false,
        description: 'Entertainment - unrelated',
      },
    ];
    
    console.log(`Agent Identity: ${agentIdentity.slice(0, 100)}...\n`);
    console.log(`Testing ${testCases.length} questions for relevance\n`);
    
    const results = [];
    
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      console.log(`\n${'='.repeat(100)}`);
      console.log(`TEST ${i + 1}/${testCases.length}: ${testCase.description}`);
      console.log(`Question: "${testCase.question}"`);
      console.log(`Expected: ${testCase.shouldBeRelevant ? 'RELEVANT' : 'NOT RELEVANT'}`);
      console.log(`${'='.repeat(100)}\n`);
      
      try {
        // Call the internal mutation that uses needsWebSearch
        // This simulates what happens in conversation.ts
        const result = await ctx.runAction(internal.testWebSearch.checkRelevanceInternal, {
          question: testCase.question,
          agentIdentity: agentIdentity,
        });
        
        const success = result.isRelevant === testCase.shouldBeRelevant;
        
        console.log(`Actual: ${result.isRelevant ? 'RELEVANT ✅' : 'NOT RELEVANT ⛔'}`);
        console.log(`Result: ${success ? '✅ PASS' : '❌ FAIL'}`);
        
        results.push({
          ...testCase,
          actualRelevant: result.isRelevant,
          success: success,
        });
        
      } catch (error) {
        console.error(`❌ Error testing question: ${error}`);
        results.push({
          ...testCase,
          actualRelevant: false,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    const passed = results.filter(r => r.success).length;
    const failed = results.length - passed;
    
    console.log('\n' + '='.repeat(100));
    console.log('RELEVANCE FILTERING TEST RESULTS');
    console.log('='.repeat(100));
    console.log(`Total tests: ${testCases.length}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ${failed > 0 ? '❌' : ''}`);
    console.log(`Success rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);
    console.log('='.repeat(100) + '\n');
    
    return {
      totalTests: testCases.length,
      passed,
      failed,
      successRate: (passed / testCases.length) * 100,
      results: results,
    };
  },
});

/**
 * Internal helper action to check relevance
 * Used by testRelevanceFiltering
 */
export const checkRelevanceInternal = action({
  args: {
    question: v.string(),
    agentIdentity: v.string(),
  },
  handler: async (ctx, args) => {
    // Import the actual function from conversation.ts
    const { chatCompletion } = await import('./util/llm');
    
    const { content } = await chatCompletion({
      messages: [
        {
          role: 'user',
          content: `You are an assistant helping to determine if a question is relevant to an agent's role and expertise.

Agent's identity and expertise: ${args.agentIdentity}

User's question: "${args.question}"

Is this question relevant to the agent's role, expertise, domain, or responsibilities? 
Consider:
- Is the question related to topics the agent would professionally handle?
- Is it about their area of knowledge or work?
- Would the agent reasonably be expected to discuss this topic?

Respond with ONLY "RELEVANT" or "NOT_RELEVANT".

Answer (RELEVANT or NOT_RELEVANT):`,
        },
      ],
      max_tokens: 10,
    });
    
    const isRelevant = content.trim().toUpperCase().includes('RELEVANT') && 
                      !content.trim().toUpperCase().includes('NOT_RELEVANT');
    
    return { isRelevant };
  },
});

