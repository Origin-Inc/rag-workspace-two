import { json, redirect } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useSearchParams, Link } from "@remix-run/react";
import { z } from "zod";
import { signIn, getAuthenticatedUser } from "~/services/auth/unified-auth.server";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function loader({ request }: LoaderFunctionArgs) {
  // Check if already logged in
  const user = await getAuthenticatedUser(request);
  if (user) {
    return redirect('/app');
  }
  
  return json({});
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const data = Object.fromEntries(formData);
  
  // Get redirect URL
  const redirectTo = (formData.get("redirectTo") as string) || "/app";
  
  // Validate input
  const result = loginSchema.safeParse({
    email: data.email as string,
    password: data.password as string,
  });
  
  if (!result.success) {
    return json(
      { 
        errors: result.error.flatten(),
        values: { email: data.email }
      },
      { status: 400 }
    );
  }

  // Sign in with unified auth
  const authResult = await signIn(result.data.email, result.data.password);
  
  if (authResult.error) {
    return json(
      { 
        error: authResult.error,
        values: { email: result.data.email }
      },
      { status: 401 }
    );
  }

  return redirect(redirectTo, {
    headers: authResult.headers
  });
}

export default function UnifiedLogin() {
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/app";
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold text-gray-900 dark:text-white">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Or{" "}
            <Link
              to="/auth/register"
              className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
            >
              create a new account
            </Link>
          </p>
        </div>
        
        <Form method="post" className="mt-8 space-y-6">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                defaultValue={actionData?.values?.email}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                placeholder="Email address"
              />
              {actionData?.errors?.fieldErrors?.email && (
                <p className="mt-1 text-sm text-red-600">
                  {actionData.errors.fieldErrors.email[0]}
                </p>
              )}
            </div>
            
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                placeholder="Password"
              />
              {actionData?.errors?.fieldErrors?.password && (
                <p className="mt-1 text-sm text-red-600">
                  {actionData.errors.fieldErrors.password[0]}
                </p>
              )}
            </div>
          </div>

          {actionData?.error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
              <p className="text-sm text-red-800 dark:text-red-400">
                {actionData.error}
              </p>
            </div>
          )}

          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Sign in
            </button>
          </div>
        </Form>
        
        <div className="text-center">
          <Link
            to="/auth/dev-login"
            className="text-sm text-gray-600 hover:text-gray-500 dark:text-gray-400"
          >
            Dev Login (for testing)
          </Link>
        </div>
      </div>
    </div>
  );
}