/**
 * Test component to verify verbatim highlighting is working
 * Add this to your app temporarily to test the feature
 */

import React from 'react';
import { HighlightedMessage } from './HighlightedMessage';

export function HighlightTest() {
  // Simulated conversation context
  const contextMessages = [
    'Climate change is a serious issue that requires immediate action.',
    'We need to work together on environmental policy.',
    'The sky is blue today and the weather is nice.',
  ];

  // Test messages with varying amounts of verbatim content
  const testMessages = [
    {
      author: 'Agent 1',
      text: 'I agree that climate change is a serious issue that requires immediate action.',
    },
    {
      author: 'Agent 2',
      text: 'Yes, we need to work together on this important matter.',
    },
    {
      author: 'Agent 3',
      text: 'The sky is blue today and I think we should discuss this further.',
    },
    {
      author: 'Agent 4',
      text: 'This is completely original text with no matches at all.',
    },
  ];

  return (
    <div className="p-8 bg-gray-100 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Verbatim Highlighting Test</h1>
      
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded">
        <h2 className="font-bold mb-2">Context Messages:</h2>
        <ul className="list-disc pl-5 text-sm">
          {contextMessages.map((msg, i) => (
            <li key={i} className="mb-1">{msg}</li>
          ))}
        </ul>
      </div>

      <div className="space-y-4">
        <h2 className="font-bold">Test Messages (should have highlighting):</h2>
        {testMessages.map((msg, i) => (
          <div key={i} className="bg-white p-4 rounded shadow">
            <div className="text-sm font-bold text-gray-600 mb-2">{msg.author}</div>
            <HighlightedMessage
              text={msg.text}
              contextMessages={contextMessages}
              authorName={msg.author}
              showHighlights={true}
            />
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded text-sm">
        <p className="font-bold mb-2">Expected Results:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Agent 1: "climate change is a serious issue that requires immediate action" should be highlighted</li>
          <li>Agent 2: "we need to work together" should be highlighted</li>
          <li>Agent 3: "The sky is blue today" should be highlighted</li>
          <li>Agent 4: No highlighting (no matches)</li>
        </ul>
        <p className="mt-2 text-gray-600">
          Check browser console for debug logs: [Highlight Debug]
        </p>
      </div>
    </div>
  );
}

