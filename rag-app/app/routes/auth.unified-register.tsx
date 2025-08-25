import { json, redirect } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, Link } from "@remix-run/react";
import { z } from "zod";
import { signUp, getAuthenticatedUser } from "~/services/auth/unified-auth.server";

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
  name: z.string().optional()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
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
  
  // Validate input
  const result = registerSchema.safeParse({
    email: data.email as string,
    password: data.password as string,
    confirmPassword: data.confirmPassword as string,
    name: data.name as string
  });
  
  if (!result.success) {
    return json(
      { 
        errors: result.error.flatten(),
        values: { 
          email: data.email,
          name: data.name
        }
      },
      { status: 400 }
    );
  }

  // Sign up with unified auth
  const authResult = await signUp(
    result.data.email, 
    result.data.password,
    result.data.name
  );
  
  if (authResult.error) {
    return json(
      { 
        error: authResult.error,
        values: { 
          email: result.data.email,
          name: result.data.name
        }
      },
      { status: 400 }
    );
  }

  // Redirect to app after successful registration
  return redirect('/app', {
    headers: authResult.headers
  });
}

export default function UnifiedRegister() {
  const actionData = useActionData<typeof action>();
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold text-gray-900 dark:text-white">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Or{" "}
            <Link
              to="/auth/login"
              className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
            >
              sign in to existing account
            </Link>
          </p>
        </div>
        
        <Form method="post" className="mt-8 space-y-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Name (optional)
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                defaultValue={actionData?.values?.name}
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                placeholder="Your name"
              />
            </div>
            
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                defaultValue={actionData?.values?.email}
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                placeholder="Email address"
              />
              {actionData?.errors?.fieldErrors?.email && (
                <p className="mt-1 text-sm text-red-600">
                  {actionData.errors.fieldErrors.email[0]}
                </p>
              )}
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                placeholder="Password (min 8 characters)"
              />
              {actionData?.errors?.fieldErrors?.password && (
                <p className="mt-1 text-sm text-red-600">
                  {actionData.errors.fieldErrors.password[0]}
                </p>
              )}
            </div>
            
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                placeholder="Confirm password"
              />
              {actionData?.errors?.fieldErrors?.confirmPassword && (
                <p className="mt-1 text-sm text-red-600">
                  {actionData.errors.fieldErrors.confirmPassword[0]}
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
              Create Account
            </button>
          </div>
        </Form>
        
        <div className="text-center text-sm text-gray-600 dark:text-gray-400">
          By creating an account, you agree to our{" "}
          <Link to="/terms" className="text-blue-600 hover:text-blue-500 dark:text-blue-400">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="text-blue-600 hover:text-blue-500 dark:text-blue-400">
            Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  );
}