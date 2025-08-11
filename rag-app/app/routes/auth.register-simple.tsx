import { json, redirect } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { Form, useActionData } from "@remix-run/react";
import { z } from "zod";
import { createSupabaseAdmin } from "~/utils/supabase.server";

// Registration schema
const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const data = Object.fromEntries(formData);
  
  console.log('[Register] Received registration request for:', data["email"]);
  
  // Validate input
  const result = registerSchema.safeParse({
    email: data["email"] as string,
    password: data["password"] as string,
  });
  
  if (!result.success) {
    console.error('[Register] Validation failed:', result.error.flatten());
    return json(
      { 
        errors: result.error.flatten(),
        values: { email: data["email"] }
      },
      { status: 400 }
    );
  }

  let supabase;
  try {
    supabase = createSupabaseAdmin();
  } catch (error) {
    console.error('[Register] Failed to create Supabase client:', error);
    return json(
      { 
        error: 'Server configuration error. Please check environment variables.',
        values: { email: result.data.email }
      },
      { status: 500 }
    );
  }
  
  // Create user in Supabase
  console.log('[Register] Creating user in Supabase...');
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: result.data.email,
    password: result.data.password,
    email_confirm: true, // Auto-confirm for testing
  });

  if (authError) {
    console.error('[Register] Supabase auth error:', authError);
    return json(
      { 
        error: authError.message,
        values: { email: result.data.email }
      },
      { status: 400 }
    );
  }
  
  console.log('[Register] User created successfully:', authData.user?.id);

  // Create a test workspace
  console.log('[Register] Creating workspace for user...');
  const { data: workspaceData, error: workspaceError } = await supabase
    .from('workspaces')
    .insert({
      name: 'Test Workspace',
      slug: `workspace-${Date.now()}`,
      owner_id: authData.user!.id,
      settings: {},
      tier: 'free'
    })
    .select()
    .single();

  if (workspaceError) {
    console.error('[Register] Failed to create workspace:', workspaceError);
    // Still allow registration to succeed even if workspace creation fails
  } else {
    console.log('[Register] Workspace created successfully:', workspaceData?.id);
  }

  console.log('[Register] Registration complete, redirecting to login');
  return redirect("/auth/login-simple");
}

export default function RegisterSimple() {
  const actionData = useActionData<typeof action>();
  
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Create your account (Simple)
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Quick registration for testing
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <Form method="post" className="space-y-6">
            {actionData?.error && (
              <div className="rounded-md bg-red-50 p-4">
                <p className="text-sm text-red-800">{actionData.error}</p>
              </div>
            )}
            
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  defaultValue={actionData?.values?.email}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
                {actionData?.errors?.fieldErrors?.email && (
                  <p className="mt-1 text-sm text-red-600">
                    {actionData.errors.fieldErrors.email[0]}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
                {actionData?.errors?.fieldErrors?.password && (
                  <p className="mt-1 text-sm text-red-600">
                    {actionData.errors.fieldErrors.password[0]}
                  </p>
                )}
              </div>
            </div>

            <div>
              <button
                type="submit"
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Register
              </button>
            </div>
          </Form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or</span>
              </div>
            </div>

            <div className="mt-6">
              <a
                href="/auth/login"
                className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Sign in to existing account
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}