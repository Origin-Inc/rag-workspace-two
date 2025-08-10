import { json, redirect } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useSearchParams } from "@remix-run/react";
import { z } from "zod";
import { prisma } from "~/utils/db.server";
import { verifyPassword } from "~/services/auth/password.server";
import { createUserSession } from "~/services/auth/session.server";
import { getCSRFToken, requireCSRFToken } from "~/services/auth/csrf.server";
import { 
  rateLimit, 
  RATE_LIMITS,
  checkAccountLockout,
  incrementFailedAttempts,
  resetFailedAttempts
} from "~/services/auth/rate-limit.server";
import { logActivity, getUser } from "~/services/auth/auth.server";
import { getUserPermissions } from "~/services/auth/rbac.server";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.string().optional(),
});

export async function loader({ request }: LoaderFunctionArgs) {
  // Check if already logged in
  const user = await getUser(request);
  if (user) {
    return redirect("/dashboard");
  }
  
  const csrfToken = await getCSRFToken(request);
  return json({ csrfToken });
}

export async function action({ request }: ActionFunctionArgs) {
  // Rate limiting
  await rateLimit(request, RATE_LIMITS.LOGIN);
  
  // CSRF protection
  await requireCSRFToken(request);
  
  const formData = await request.formData();
  const data = Object.fromEntries(formData);
  
  // Get redirect URL
  const redirectTo = formData.get("redirectTo") || "/dashboard";
  
  // Validate input
  const result = loginSchema.safeParse({
    email: data["email"] as string,
    password: data["password"] as string,
    rememberMe: data["rememberMe"] as string | undefined,
  });
  
  if (!result.success) {
    return json(
      { 
        errors: result.error.flatten().fieldErrors,
        values: { email: data["email"] },
      },
      { status: 400 }
    );
  }
  
  const { email, password } = result.data;
  
  // Check account lockout
  const lockoutStatus = await checkAccountLockout(email);
  if (lockoutStatus.isLocked) {
    const minutesRemaining = Math.ceil(
      (lockoutStatus.lockoutUntil!.getTime() - Date.now()) / 60000
    );
    
    return json(
      { 
        errors: { 
          form: [`Account is locked. Please try again in ${minutesRemaining} minutes.`] 
        },
        values: { email },
      },
      { status: 429 }
    );
  }
  
  // Find user
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      userWorkspaces: {
        include: {
          workspace: true,
          role: true,
        },
      },
    },
  });
  
  if (!user) {
    // Don't reveal if email exists
    await incrementFailedAttempts(email);
    
    return json(
      { 
        errors: { form: ["Invalid email or password"] },
        values: { email },
      },
      { status: 401 }
    );
  }
  
  // Verify password
  const isValidPassword = await verifyPassword(password, user.passwordHash);
  
  if (!isValidPassword) {
    await incrementFailedAttempts(email);
    
    // Log failed attempt
    await logActivity(
      null,
      "user.login.failed",
      "user",
      user.id,
      { email },
      request
    );
    
    return json(
      { 
        errors: { form: ["Invalid email or password"] },
        values: { email },
      },
      { status: 401 }
    );
  }
  
  // Reset failed attempts on successful login
  await resetFailedAttempts(user.id);
  
  // Get default workspace (first one or most recently accessed)
  const defaultWorkspace = user.userWorkspaces[0];
  
  let workspaceId: string | undefined;
  let roleId: string | undefined;
  let permissions: string[] | undefined;
  
  if (defaultWorkspace) {
    workspaceId = defaultWorkspace.workspaceId;
    roleId = defaultWorkspace.roleId;
    permissions = await getUserPermissions(user.id, workspaceId);
  }
  
  // Create session
  const { headers } = await createUserSession({
    userId: user.id,
    email: user.email,
    ipAddress: request.headers.get("X-Forwarded-For") || undefined,
    userAgent: request.headers.get("User-Agent") || undefined,
    workspaceId,
    roleId,
    permissions,
  });
  
  // Log successful login
  await logActivity(
    user.id,
    "user.login",
    "user",
    user.id,
    { email, workspaceId },
    request
  );
  
  // Redirect to workspace or requested page
  const redirectUrl = defaultWorkspace 
    ? `/workspace/${defaultWorkspace.workspace.slug}`
    : redirectTo.toString();
    
  return redirect(redirectUrl, { headers });
}

export default function Login() {
  const { csrfToken } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  
  const hasFormError = actionData && 'form' in (actionData.errors || {});
  const formErrors = hasFormError ? (actionData.errors as any).form : undefined;
  const fieldErrors = actionData?.errors && !hasFormError ? actionData.errors : undefined;
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/dashboard";
  
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Welcome back to RAG Application
          </p>
        </div>
        
        <Form method="post" className="mt-8 space-y-6">
          <input type="hidden" name="_csrf" value={csrfToken} />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          
          {formErrors && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-800">
                {formErrors.join(", ")}
              </div>
            </div>
          )}
          
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
                defaultValue={actionData?.values?.['email'] as string | undefined}
                className="mt-1 block w-full rounded-md border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
              />
              {fieldErrors?.email && (
                <p className="mt-1 text-sm text-red-600">
                  {fieldErrors.email.join(", ")}
                </p>
              )}
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
                className="mt-1 block w-full rounded-md border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
              />
              {fieldErrors?.password && (
                <p className="mt-1 text-sm text-red-600">
                  {fieldErrors.password.join(", ")}
                </p>
              )}
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="rememberMe"
                  name="rememberMe"
                  type="checkbox"
                  value="true"
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="rememberMe" className="ml-2 block text-sm text-gray-900">
                  Remember me
                </label>
              </div>
              
              <div className="text-sm">
                <a href="/auth/forgot-password" className="font-medium text-indigo-600 hover:text-indigo-500">
                  Forgot password?
                </a>
              </div>
            </div>
          </div>
          
          <div>
            <button
              type="submit"
              className="group relative flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Sign in
            </button>
          </div>
          
          <div className="text-center text-sm">
            Don't have an account?{" "}
            <a href="/auth/register" className="font-medium text-indigo-600 hover:text-indigo-500">
              Sign up
            </a>
          </div>
        </Form>
      </div>
    </div>
  );
}