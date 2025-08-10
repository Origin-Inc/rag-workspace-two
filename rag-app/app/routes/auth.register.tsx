import { json, redirect } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { z } from "zod";
import { prisma } from "~/utils/db.server";
import { 
  hashPassword, 
  validatePasswordStrength,
  generateSecureToken 
} from "~/services/auth/password.server";
import { createUserSession } from "~/services/auth/session.server";
import { getCSRFToken, requireCSRFToken } from "~/services/auth/csrf.server";
import { rateLimit, RATE_LIMITS } from "~/services/auth/rate-limit.server";
import { logActivity } from "~/services/auth/auth.server";
import { SYSTEM_ROLES } from "~/services/auth/rbac.server";

// Registration schema
const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
  workspaceName: z.string().min(2, "Workspace name is required"),
});

export async function loader({ request }: LoaderFunctionArgs) {
  const csrfToken = await getCSRFToken(request);
  return json({ csrfToken });
}

export async function action({ request }: ActionFunctionArgs) {
  // Rate limiting
  await rateLimit(request, RATE_LIMITS.REGISTER);
  
  // CSRF protection
  await requireCSRFToken(request);
  
  const formData = await request.formData();
  const data = Object.fromEntries(formData);
  
  // Validate input
  const result = registerSchema.safeParse({
    email: data["email"] as string,
    password: data["password"] as string,
    name: data["name"] as string | undefined,
    workspaceName: data["workspaceName"] as string,
  });
  
  if (!result.success) {
    return json(
      { 
        errors: result.error.flatten().fieldErrors,
        values: data,
      },
      { status: 400 }
    );
  }
  
  const { email, password, name, workspaceName } = result.data;
  
  // Validate password strength
  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.isValid) {
    return json(
      { 
        errors: { password: passwordValidation.errors },
        values: data,
      },
      { status: 400 }
    );
  }
  
  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });
  
  if (existingUser) {
    return json(
      { 
        errors: { email: ["Email already registered"] },
        values: data,
      },
      { status: 400 }
    );
  }
  
  try {
    // Hash password
    const passwordHash = await hashPassword(password);
    
    // Generate email verification token
    const emailVerificationToken = generateSecureToken(32);
    
    // Create user and workspace in transaction
    const { user, workspace } = await prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          name,
          emailVerificationToken,
        },
      });
      
      // Create workspace
      const workspaceSlug = workspaceName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
        
      const workspace = await tx.workspace.create({
        data: {
          name: workspaceName,
          slug: `${workspaceSlug}-${generateSecureToken(6).toLowerCase()}`,
        },
      });
      
      // Get owner role
      const ownerRole = await tx.role.findUnique({
        where: { name: SYSTEM_ROLES.WORKSPACE_OWNER },
      });
      
      if (!ownerRole) {
        throw new Error("Owner role not found");
      }
      
      // Add user to workspace as owner
      await tx.userWorkspace.create({
        data: {
          userId: user.id,
          workspaceId: workspace.id,
          roleId: ownerRole.id,
        },
      });
      
      return { user, workspace };
    });
    
    // Log registration
    await logActivity(
      user.id,
      "user.register",
      "user",
      user.id,
      { email, workspaceId: workspace.id },
      request
    );
    
    // TODO: Send verification email
    console.log("Verification token:", emailVerificationToken);
    
    // Create session
    const { headers } = await createUserSession({
      userId: user.id,
      email: user.email,
      ipAddress: request.headers.get("X-Forwarded-For") || undefined,
      userAgent: request.headers.get("User-Agent") || undefined,
      workspaceId: workspace.id,
      roleId: (await prisma.userWorkspace.findFirst({
        where: { userId: user.id, workspaceId: workspace.id },
        select: { roleId: true },
      }))?.roleId,
    });
    
    return redirect(`/workspace/${workspace.slug}`, { headers });
  } catch (error) {
    console.error("Registration error:", error);
    
    return json(
      { 
        errors: { form: ["Registration failed. Please try again."] },
        values: data,
      },
      { status: 500 }
    );
  }
}

export default function Register() {
  const { csrfToken } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  
  const hasFormError = actionData && 'form' in (actionData.errors || {});
  const formErrors = hasFormError ? (actionData.errors as any).form : undefined;
  const fieldErrors = actionData?.errors && !hasFormError ? actionData.errors : undefined;
  
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Start your RAG journey today
          </p>
        </div>
        
        <Form method="post" className="mt-8 space-y-6">
          <input type="hidden" name="_csrf" value={csrfToken} />
          
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
                autoComplete="new-password"
                required
                className="mt-1 block w-full rounded-md border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
              />
              {fieldErrors?.password && (
                <div className="mt-1 text-sm text-red-600">
                  {fieldErrors.password.map((error: string, i: number) => (
                    <p key={i}>{error}</p>
                  ))}
                </div>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Must be at least 8 characters with uppercase, lowercase, number, and special character
              </p>
            </div>
            
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Full name (optional)
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                defaultValue={actionData?.values?.['name'] as string | undefined}
                className="mt-1 block w-full rounded-md border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
              />
              {fieldErrors?.name && (
                <p className="mt-1 text-sm text-red-600">
                  {fieldErrors.name.join(", ")}
                </p>
              )}
            </div>
            
            <div>
              <label htmlFor="workspaceName" className="block text-sm font-medium text-gray-700">
                Workspace name
              </label>
              <input
                id="workspaceName"
                name="workspaceName"
                type="text"
                required
                defaultValue={actionData?.values?.['workspaceName'] as string | undefined}
                placeholder="My Company"
                className="mt-1 block w-full rounded-md border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
              />
              {fieldErrors?.workspaceName && (
                <p className="mt-1 text-sm text-red-600">
                  {fieldErrors.workspaceName.join(", ")}
                </p>
              )}
            </div>
          </div>
          
          <div>
            <button
              type="submit"
              className="group relative flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Create account
            </button>
          </div>
          
          <div className="text-center text-sm">
            Already have an account?{" "}
            <a href="/auth/login" className="font-medium text-indigo-600 hover:text-indigo-500">
              Sign in
            </a>
          </div>
        </Form>
      </div>
    </div>
  );
}