import type { ActionFunctionArgs } from '@remix-run/node';
import { AIStreamingService } from '~/services/streaming/ai-streaming.server';

// Warm up endpoint
export async function action({ request }: ActionFunctionArgs) {
  const url = new URL(request.url);
  
  // Handle warmup request
  if (url.pathname.endsWith('/warmup')) {
    const streamingService = new AIStreamingService();
    await streamingService.warmUp();
    return new Response('OK', { status: 200 });
  }
  
  // Handle streaming request
  const body = await request.json();
  const { prompt, context, options } = body;
  
  if (!prompt) {
    return new Response('Prompt is required', { status: 400 });
  }
  
  const streamingService = new AIStreamingService();
  const stream = await streamingService.streamChatResponse(prompt, context, options);
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
    },
  });
}