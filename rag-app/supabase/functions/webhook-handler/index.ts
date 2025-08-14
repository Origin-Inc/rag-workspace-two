import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { createHmac } from 'https://deno.land/std@0.168.0/node/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface WebhookPayload {
  webhookId: string;
  provider: string;
  event: string;
  data: any;
  signature?: string;
}

/**
 * Verify webhook signature for security
 */
function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  provider: string
): boolean {
  let expectedSignature: string;

  switch (provider) {
    case 'github':
      // GitHub uses HMAC-SHA256 with 'sha256=' prefix
      const hmac = createHmac('sha256', secret);
      hmac.update(payload);
      expectedSignature = `sha256=${hmac.digest('hex')}`;
      break;
    
    case 'slack':
      // Slack uses HMAC-SHA256 with version prefix
      const timestamp = Math.floor(Date.now() / 1000);
      const baseString = `v0:${timestamp}:${payload}`;
      const slackHmac = createHmac('sha256', secret);
      slackHmac.update(baseString);
      expectedSignature = `v0=${slackHmac.digest('hex')}`;
      break;
    
    case 'linear':
      // Linear uses HMAC-SHA256
      const linearHmac = createHmac('sha256', secret);
      linearHmac.update(payload);
      expectedSignature = linearHmac.digest('hex');
      break;
    
    default:
      // Generic HMAC-SHA256
      const genericHmac = createHmac('sha256', secret);
      genericHmac.update(payload);
      expectedSignature = genericHmac.digest('hex');
  }

  return signature === expectedSignature;
}

/**
 * Process webhook based on provider and event type
 */
async function processWebhook(
  webhookId: string,
  provider: string,
  event: string,
  data: any
): Promise<void> {
  // Update webhook last triggered timestamp
  await supabase
    .from('webhooks')
    .update({ 
      last_triggered: new Date().toISOString(),
      failure_count: 0 
    })
    .eq('id', webhookId);

  // Get the integration details
  const { data: webhook, error: webhookError } = await supabase
    .from('webhooks')
    .select('*, integration:integration_credentials(*)')
    .eq('id', webhookId)
    .single();

  if (webhookError || !webhook) {
    throw new Error('Webhook not found');
  }

  const workspaceId = webhook.integration.workspace_id;

  // Process based on provider and event type
  switch (provider) {
    case 'github':
      await processGitHubWebhook(workspaceId, event, data);
      break;
    
    case 'slack':
      await processSlackWebhook(workspaceId, event, data);
      break;
    
    case 'google_drive':
      await processGoogleDriveWebhook(workspaceId, event, data);
      break;
    
    case 'figma':
      await processFigmaWebhook(workspaceId, event, data);
      break;
    
    case 'notion':
      await processNotionWebhook(workspaceId, event, data);
      break;
    
    case 'linear':
      await processLinearWebhook(workspaceId, event, data);
      break;
    
    default:
      console.log(`Unhandled provider: ${provider}`);
  }

  // Store webhook event in audit log
  await supabase
    .from('audit_logs')
    .insert({
      action: 'webhook_received',
      resource: 'integration',
      resource_id: webhookId,
      details: {
        provider,
        event,
        data_summary: JSON.stringify(data).substring(0, 500),
      },
    });
}

async function processGitHubWebhook(workspaceId: string, event: string, data: any) {
  switch (event) {
    case 'push':
      // Handle code push - could trigger document updates
      console.log(`GitHub push to ${data.repository?.full_name}`);
      break;
    
    case 'pull_request':
      // Handle PR events - could create tasks or notifications
      console.log(`GitHub PR ${data.action} in ${data.repository?.full_name}`);
      break;
    
    case 'issues':
      // Handle issue events
      console.log(`GitHub issue ${data.action}: ${data.issue?.title}`);
      break;
  }
}

async function processSlackWebhook(workspaceId: string, event: string, data: any) {
  switch (event) {
    case 'message.channels':
      // Handle channel messages
      console.log(`Slack message in channel: ${data.channel}`);
      break;
    
    case 'file_shared':
      // Handle file sharing
      console.log(`Slack file shared: ${data.file?.name}`);
      break;
  }
}

async function processGoogleDriveWebhook(workspaceId: string, event: string, data: any) {
  switch (event) {
    case 'file.create':
    case 'file.update':
      // Handle file changes - could trigger sync
      console.log(`Google Drive file ${event}: ${data.file?.name}`);
      break;
  }
}

async function processFigmaWebhook(workspaceId: string, event: string, data: any) {
  switch (event) {
    case 'file_update':
      // Handle design file updates
      console.log(`Figma file updated: ${data.file_name}`);
      break;
    
    case 'file_comment':
      // Handle comments
      console.log(`Figma comment added: ${data.comment?.message}`);
      break;
  }
}

async function processNotionWebhook(workspaceId: string, event: string, data: any) {
  switch (event) {
    case 'page.created':
    case 'page.updated':
      // Handle page changes
      console.log(`Notion page ${event}: ${data.page?.id}`);
      break;
    
    case 'database.updated':
      // Handle database changes
      console.log(`Notion database updated: ${data.database?.id}`);
      break;
  }
}

async function processLinearWebhook(workspaceId: string, event: string, data: any) {
  switch (event) {
    case 'Issue.create':
    case 'Issue.update':
      // Handle issue changes
      console.log(`Linear issue ${event}: ${data.data?.title}`);
      break;
    
    case 'Comment.create':
      // Handle comments
      console.log(`Linear comment added: ${data.data?.body}`);
      break;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const webhookId = url.searchParams.get('webhook_id');
    
    if (!webhookId) {
      return new Response(
        JSON.stringify({ error: 'Missing webhook_id parameter' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get webhook configuration
    const { data: webhook, error } = await supabase
      .from('webhooks')
      .select('*, integration:integration_credentials(*)')
      .eq('id', webhookId)
      .single();

    if (error || !webhook) {
      return new Response(
        JSON.stringify({ error: 'Webhook not found' }),
        { 
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!webhook.is_active) {
      return new Response(
        JSON.stringify({ error: 'Webhook is not active' }),
        { 
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const body = await req.text();
    const data = JSON.parse(body);

    // Verify webhook signature if secret is configured
    if (webhook.secret) {
      const signature = req.headers.get('X-Webhook-Signature') || 
                       req.headers.get('X-Hub-Signature-256') || // GitHub
                       req.headers.get('X-Slack-Signature') || // Slack
                       req.headers.get('X-Linear-Signature') || // Linear
                       '';

      if (!signature) {
        return new Response(
          JSON.stringify({ error: 'Missing signature' }),
          { 
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Decrypt the secret (in production, use proper key management)
      const isValid = verifyWebhookSignature(
        body,
        signature,
        webhook.secret,
        webhook.integration.provider
      );

      if (!isValid) {
        await supabase
          .from('webhooks')
          .update({ failure_count: webhook.failure_count + 1 })
          .eq('id', webhookId);

        return new Response(
          JSON.stringify({ error: 'Invalid signature' }),
          { 
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Determine event type based on provider
    let eventType: string;
    switch (webhook.integration.provider) {
      case 'github':
        eventType = req.headers.get('X-GitHub-Event') || 'unknown';
        break;
      case 'slack':
        eventType = data.type || 'unknown';
        break;
      case 'linear':
        eventType = data.action || 'unknown';
        break;
      default:
        eventType = data.event || data.type || 'unknown';
    }

    // Check if this event type is subscribed
    if (!webhook.events.includes(eventType) && !webhook.events.includes('*')) {
      return new Response(
        JSON.stringify({ message: 'Event not subscribed' }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Process webhook asynchronously
    processWebhook(webhookId, webhook.integration.provider, eventType, data)
      .catch(error => {
        console.error('Error processing webhook:', error);
        supabase
          .from('webhooks')
          .update({ failure_count: webhook.failure_count + 1 })
          .eq('id', webhookId);
      });

    return new Response(
      JSON.stringify({ message: 'Webhook received' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Webhook handler error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});