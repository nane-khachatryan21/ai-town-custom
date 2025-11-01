# Quick Start: Content Guardrails

## What It Does

✅ Automatically checks user messages for toxic content and social bias  
✅ Blocks inappropriate content before agents respond  
✅ Provides educational responses when content is flagged  
✅ Works transparently in the background  

## How to Test It

### Method 1: Quick Test (Easiest)

1. Start your development server:
```bash
npm run dev
```

2. Open browser console and run:
```javascript
await convex.action(api.testGuardrails.quickTest, {});
```

### Method 2: Manual Testing

1. Start the app: `npm run dev`
2. Click on an AI agent to start conversation
3. Try these test messages:

**Should be BLOCKED (Toxic):**
- "You're an idiot"
- "Get lost, nobody wants you here"

**Should be BLOCKED (Biased):**
- "Women are bad at math"
- "Old people can't use technology"

**Should be ALLOWED:**
- "How are you today?"
- "What's your favorite book?"

### Method 3: Test Specific Messages

```javascript
// Test any message
await convex.action(api.testGuardrails.testSingleMessage, { 
  message: "your message here" 
});
```

## What Happens

### ❌ Toxic Content Detected
**User**: "You're so stupid"  
**Agent Response**: "I appreciate your interest in chatting, but I can't respond to that message as it contains inappropriate or toxic content. Could you please rephrase your question in a more respectful way?"

### ❌ Bias Detected
**User**: "Women can't do science"  
**Agent Response**: "I noticed your message may contain social bias or stereotyping. I'm here to have inclusive and respectful conversations. Could you rephrase your question without any biased assumptions?"

### ✅ Safe Content
**User**: "What do you think about the weather?"  
**Agent Response**: [Normal conversation continues]

## Check Logs

Look for these in your console:
```
[Guardrails] Checking message from PlayerName: "..."
[Guardrails] Content flagged as toxic: ...
[Guardrails] Content passed moderation check
```

## Files You Can Customize

1. **`convex/util/guardrails.ts`** - Adjust moderation prompt or responses
2. **`convex/agent/conversation.ts`** - See integration points

## Full Documentation

- **GUARDRAILS.md** - Complete documentation
- **IMPLEMENTATION_SUMMARY.md** - Technical details

## That's It!

The system is working automatically. Every user message is checked before agents respond.

No additional configuration needed - it uses your existing LLM setup.

