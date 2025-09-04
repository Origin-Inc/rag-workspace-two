import { redirect } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData } from "@remix-run/react";
import { signIn, getUser } from "~/services/auth/production-auth.server";
import { sessionStorage } from "~/services/auth/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // If already logged in, redirect to app
  const user = await getUser(request);
  if (user) {
    return redirect('/app');
  }
  
  return {};
}

export async function action({ request }: ActionFunctionArgs) {
  console.log('[SIGNIN_ROUTE] Action started');
  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  console.log('[SIGNIN_ROUTE] Form data received');
  console.log('[SIGNIN_ROUTE] Email:', email);
  console.log('[SIGNIN_ROUTE] Password length:', password?.length);

  if (!email || !password) {
    console.log('[SIGNIN_ROUTE] Missing email or password');
    return { error: "Email and password are required" };
  }

  console.log('[SIGNIN_ROUTE] Calling signIn function');
  const result = await signIn(email, password);
  console.log('[SIGNIN_ROUTE] SignIn result:', 'error' in result ? 'ERROR' : 'SUCCESS');

  if ('error' in result) {
    console.log('[SIGNIN_ROUTE] SignIn error:', result.error);
    return { error: result.error };
  }

  console.log('[SIGNIN_ROUTE] SignIn successful, creating session');
  // Create session cookie
  const session = await sessionStorage.getSession();
  session.set("sessionToken", result.sessionToken);
  session.set("userId", result.user.id);
  session.set("email", result.user.email);
  console.log('[SIGNIN_ROUTE] Session data set');

  // Get redirect URL from query params or default to editor
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirectTo") || "/app";
  console.log('[SIGNIN_ROUTE] Redirecting to:', redirectTo);

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  });
}

export default function SignIn() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full space-y-8 p-10 bg-white rounded-xl shadow-lg">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">
            Welcome back
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Sign in to your account to continue
          </p>
        </div>

        <Form method="post" className="mt-8 space-y-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                placeholder="••••••••"
              />
            </div>
          </div>

          {actionData?.error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
              {actionData.error}
            </div>
          )}

          <button
            type="submit"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
          >
            Sign in
          </button>

          <div className="text-center text-sm">
            <span className="text-gray-600">Don't have an account? </span>
            <Link to="/auth/signup" className="font-medium text-indigo-600 hover:text-indigo-500">
              Sign up
            </Link>
          </div>
        </Form>
      </div>
    </div>
  );
}