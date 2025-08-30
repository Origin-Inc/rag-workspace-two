import { json, type ActionFunction } from '@remix-run/node';
import { aiStreamingService } from '~/services/streaming/ai-streaming.server';

export const action: ActionFunction = async ({ params, request }) => {
  const { action } = params;
  
  if (action === 'warmup') {
    // Warm up the streaming service
    return json({ success: true, message: 'Service warmed up' });
  }
  
  if (action === 'stream') {
    const formData = await request.formData();
    const prompt = formData.get('prompt') as string;
    
    if (!prompt) {
      return json({ error: 'Prompt is required' }, { status: 400 });
    }
    
    // Return SSE stream
    return aiStreamingService.streamResponse(prompt);
  }
  
  return json({ error: 'Invalid action' }, { status: 400 });
};

export const loader = async ({ params }: { params: { action: string } }) => {
  const { action } = params;
  
  if (action === 'warmup') {
    return json({ success: true, message: 'Service ready' });
  }
  
  return json({ error: 'Invalid action' }, { status: 400 });
};