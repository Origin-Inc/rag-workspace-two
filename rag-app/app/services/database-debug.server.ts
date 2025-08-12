import { createSupabaseAdmin } from '~/utils/supabase.server';

/**
 * Comprehensive debugging service for database connection issues
 */
export class DatabaseDebugService {
  private logPrefix = '[DB-DEBUG]';

  /**
   * Test Supabase connection and log detailed diagnostics
   */
  async testConnection(): Promise<{
    success: boolean;
    details: any;
    error?: any;
  }> {
    const startTime = Date.now();
    const result: any = {
      timestamp: new Date().toISOString(),
      environment: {
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET',
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? 'SET' : 'NOT SET',
        NODE_ENV: process.env.NODE_ENV,
      },
      tests: {},
    };

    console.log(`${this.logPrefix} Starting connection test...`);
    console.log(`${this.logPrefix} Environment:`, JSON.stringify(result.environment, null, 2));

    try {
      // Test 1: Create Supabase client
      console.log(`${this.logPrefix} Test 1: Creating Supabase client...`);
      const supabase = createSupabaseAdmin();
      result.tests.clientCreation = { success: true, duration: Date.now() - startTime };
      console.log(`${this.logPrefix} ✓ Supabase client created`);

      // Test 2: Simple query to check connection
      console.log(`${this.logPrefix} Test 2: Testing basic query...`);
      const queryStart = Date.now();
      const { data: testData, error: testError } = await supabase
        .from('db_blocks')
        .select('count')
        .limit(1);
      
      if (testError) {
        console.error(`${this.logPrefix} ✗ Basic query failed:`, testError);
        result.tests.basicQuery = { 
          success: false, 
          error: testError,
          duration: Date.now() - queryStart 
        };
      } else {
        console.log(`${this.logPrefix} ✓ Basic query succeeded`);
        result.tests.basicQuery = { 
          success: true, 
          data: testData,
          duration: Date.now() - queryStart 
        };
      }

      // Test 3: Check if tables exist
      console.log(`${this.logPrefix} Test 3: Checking table existence...`);
      const tablesStart = Date.now();
      const { data: tables, error: tablesError } = await supabase
        .rpc('get_tables_info', {});
      
      if (tablesError) {
        // Try alternative method
        console.log(`${this.logPrefix} RPC failed, trying direct query...`);
        const { data: directTables, error: directError } = await supabase
          .from('information_schema.tables')
          .select('table_name')
          .eq('table_schema', 'public')
          .in('table_name', ['db_blocks', 'db_block_rows']);
        
        if (directError) {
          console.error(`${this.logPrefix} ✗ Table check failed:`, directError);
          result.tests.tablesExist = { 
            success: false, 
            error: directError,
            duration: Date.now() - tablesStart 
          };
        } else {
          console.log(`${this.logPrefix} Tables found:`, directTables);
          result.tests.tablesExist = { 
            success: true, 
            tables: directTables,
            duration: Date.now() - tablesStart 
          };
        }
      } else {
        console.log(`${this.logPrefix} ✓ Tables check succeeded`);
        result.tests.tablesExist = { 
          success: true, 
          tables,
          duration: Date.now() - tablesStart 
        };
      }

      // Test 4: Test insert operation
      console.log(`${this.logPrefix} Test 4: Testing insert operation...`);
      const insertStart = Date.now();
      const testBlockId = `debug-test-${Date.now()}`;
      
      const { data: insertData, error: insertError } = await supabase
        .from('db_blocks')
        .insert({
          block_id: testBlockId,
          name: 'Debug Test Block',
          description: 'Created by debug service',
          schema: []
        })
        .select()
        .single();
      
      if (insertError) {
        console.error(`${this.logPrefix} ✗ Insert test failed:`, insertError);
        console.error(`${this.logPrefix} Insert error details:`, {
          message: insertError.message,
          hint: insertError.hint,
          details: insertError.details,
          code: insertError.code
        });
        result.tests.insertOperation = { 
          success: false, 
          error: insertError,
          duration: Date.now() - insertStart 
        };
      } else {
        console.log(`${this.logPrefix} ✓ Insert succeeded, cleaning up...`);
        
        // Clean up test data
        const { error: deleteError } = await supabase
          .from('db_blocks')
          .delete()
          .eq('block_id', testBlockId);
        
        result.tests.insertOperation = { 
          success: true, 
          insertedId: insertData.id,
          cleaned: !deleteError,
          duration: Date.now() - insertStart 
        };
      }

      // Test 5: Check RLS policies
      console.log(`${this.logPrefix} Test 5: Checking RLS policies...`);
      const rlsStart = Date.now();
      const { data: policies, error: policiesError } = await supabase
        .rpc('get_policies_info', {});
      
      if (policiesError) {
        console.log(`${this.logPrefix} RLS check skipped (function may not exist)`);
        result.tests.rlsPolicies = { 
          success: null, 
          message: 'RLS check not available',
          duration: Date.now() - rlsStart 
        };
      } else {
        console.log(`${this.logPrefix} ✓ RLS policies retrieved`);
        result.tests.rlsPolicies = { 
          success: true, 
          policies,
          duration: Date.now() - rlsStart 
        };
      }

      // Overall result
      result.success = Object.values(result.tests).every(
        test => test.success === true || test.success === null
      );
      result.totalDuration = Date.now() - startTime;
      
      console.log(`${this.logPrefix} Connection test completed in ${result.totalDuration}ms`);
      console.log(`${this.logPrefix} Overall success: ${result.success}`);
      
      return result;

    } catch (error) {
      console.error(`${this.logPrefix} Fatal error during connection test:`, error);
      result.success = false;
      result.error = error instanceof Error ? {
        message: error.message,
        stack: error.stack
      } : error;
      result.totalDuration = Date.now() - startTime;
      
      return result;
    }
  }

  /**
   * Test direct PostgreSQL connection
   */
  async testDirectPostgresConnection(): Promise<any> {
    console.log(`${this.logPrefix} Testing direct PostgreSQL connection...`);
    
    try {
      // Test using fetch to Supabase API
      const supabaseUrl = process.env.SUPABASE_URL;
      const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !apiKey) {
        return {
          success: false,
          error: 'Missing environment variables'
        };
      }

      console.log(`${this.logPrefix} Attempting fetch to: ${supabaseUrl}/rest/v1/`);
      
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: {
          'apikey': apiKey,
          'Authorization': `Bearer ${apiKey}`
        }
      });

      const responseText = await response.text();
      
      console.log(`${this.logPrefix} Response status: ${response.status}`);
      console.log(`${this.logPrefix} Response headers:`, Object.fromEntries(response.headers.entries()));
      console.log(`${this.logPrefix} Response body (first 500 chars):`, responseText.substring(0, 500));

      return {
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseText
      };

    } catch (error) {
      console.error(`${this.logPrefix} Direct connection test failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          cause: error.cause
        } : error
      };
    }
  }

  /**
   * Analyze and diagnose common issues
   */
  async diagnoseIssues(): Promise<{
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    console.log(`${this.logPrefix} Running diagnostics...`);

    // Check environment variables
    if (!process.env.SUPABASE_URL) {
      issues.push('SUPABASE_URL is not set');
      recommendations.push('Set SUPABASE_URL in your .env file');
    } else if (!process.env.SUPABASE_URL.startsWith('http')) {
      issues.push(`SUPABASE_URL appears invalid: ${process.env.SUPABASE_URL}`);
      recommendations.push('Ensure SUPABASE_URL starts with http:// or https://');
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_ANON_KEY) {
      issues.push('No Supabase API keys are set');
      recommendations.push('Set either SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY in your .env file');
    }

    // Test connection
    const connectionTest = await this.testConnection();
    
    if (!connectionTest.success) {
      if (connectionTest.error?.message?.includes('fetch failed')) {
        issues.push('Cannot connect to Supabase - fetch failed');
        recommendations.push('Check if Supabase is running: npx supabase status');
        recommendations.push('Try restarting Supabase: npx supabase stop && npx supabase start');
      }
      
      if (connectionTest.error?.message?.includes('PGRST002')) {
        issues.push('Supabase PostgREST cannot query the database');
        recommendations.push('Database may be starting up - wait a moment and try again');
        recommendations.push('Check database logs: npx supabase db logs');
      }
      
      if (connectionTest.tests?.insertOperation?.error?.message?.includes('does not exist')) {
        issues.push('Database tables do not exist');
        recommendations.push('Run migrations: npx supabase db push');
        recommendations.push('Or reset database: npx supabase db reset');
      }
    }

    // Test direct connection
    const directTest = await this.testDirectPostgresConnection();
    
    if (!directTest.success) {
      if (directTest.error?.message?.includes('ECONNREFUSED')) {
        issues.push('Connection refused - Supabase is not accessible');
        recommendations.push('Ensure Supabase is running on the correct port');
        recommendations.push(`Current URL: ${process.env.SUPABASE_URL}`);
      }
    }

    console.log(`${this.logPrefix} Diagnostics complete`);
    console.log(`${this.logPrefix} Issues found: ${issues.length}`);
    console.log(`${this.logPrefix} Recommendations: ${recommendations.length}`);

    return { issues, recommendations };
  }
}

export const databaseDebugService = new DatabaseDebugService();