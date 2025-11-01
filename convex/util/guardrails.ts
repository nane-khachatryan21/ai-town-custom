import { chatCompletion } from './llm';

/**
 * Result of content moderation check
 */
export interface ModerationResult {
  isSafe: boolean;
  reason?: string;
  category?: 'toxic' | 'biased' | 'safe';
}

/**
 * Checks if content contains toxicity or social bias using LLM
 * @param content The text content to moderate
 * @returns ModerationResult indicating if content is safe and why
 */
export async function moderateContent(content: string): Promise<ModerationResult> {
  try {
    const moderationPrompt = `You are a content moderation assistant. Analyze the following message for:
1. Toxic content (hate speech, harassment, threats, profanity, discriminatory language)
2. Social bias (gender bias, racial bias, religious bias, age bias, or any form of stereotyping)

Message to analyze: "${content}"

Respond in the following JSON format ONLY (no additional text):
{
  "isSafe": true/false,
  "category": "toxic" or "biased" or "safe",
  "reason": "brief explanation if not safe"
}`;

    const { content: response } = await chatCompletion({
      messages: [
        {
          role: 'system',
          content: 'You are a content moderation system. Always respond with valid JSON only.',
        },
        {
          role: 'user',
          content: moderationPrompt,
        },
      ],
      max_tokens: 150,
      temperature: 0.3, // Lower temperature for more consistent moderation
    });

    // Parse the LLM response
    const cleanedResponse = response.trim().replace(/```json\n?|\n?```/g, '');
    const result = JSON.parse(cleanedResponse) as ModerationResult;

    return result;
  } catch (error) {
    console.error('Error in content moderation:', error);
    // In case of error, default to allowing the content but log the error
    return {
      isSafe: true,
      category: 'safe',
      reason: 'Moderation check failed, defaulting to safe',
    };
  }
}

/**
 * Get a safe response message when content is flagged
 * @param category The category of flagged content
 * @param reason The reason for flagging
 * @returns A safe response message
 */
export function getSafeResponse(category?: string, reason?: string): string {
  if (category === 'toxic') {
    return "I appreciate your interest in chatting, but I can't respond to that message as it contains inappropriate or toxic content. Could you please rephrase your question in a more respectful way?";
  } else if (category === 'biased') {
    return "I noticed your message may contain social bias or stereotyping. I'm here to have inclusive and respectful conversations. Could you rephrase your question without any biased assumptions?";
  }
  return "I can't respond to that message as it doesn't meet our conversation guidelines. Please try asking something else in a respectful manner.";
}

