import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useRouteLoaderData,
  isRouteErrorResponse,
  useRouteError,
} from "@remix-run/react";
import { ThemeProvider } from "~/components/theme/ThemeProvider";
import { ErrorBoundary as MonitoringErrorBoundary } from "~/components/monitoring/ErrorBoundary";
import { useEffect } from "react";
import type { 
  LinksFunction, 
  LoaderFunctionArgs,
  MetaFunction 
} from "@remix-run/node";
import { json } from "@remix-run/node";
import stylesheet from "~/styles/tailwind.css?url";

export const meta: MetaFunction = () => {
  return [
    { title: "Workspace" },
    { name: "description", content: "Collaborative workspace for teams" },
    { name: "theme-color", content: "#ffffff" },
    { name: "apple-mobile-web-app-capable", content: "yes" },
    { name: "apple-mobile-web-app-status-bar-style", content: "default" },
  ];
};

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  { 
    rel: "stylesheet", 
    href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" 
  },
  { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
  { rel: "icon", type: "image/png", href: "/favicon.png" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  // Pass environment variables to the client
  return json({
    env: {
      SUPABASE_URL: process.env["SUPABASE_URL"] || "",
      SUPABASE_ANON_KEY: process.env["SUPABASE_ANON_KEY"] || "",
      SENTRY_DSN: process.env["SENTRY_DSN"] || "",
      NODE_ENV: process.env.NODE_ENV || "development",
      ENABLE_SENTRY_DEV: process.env["ENABLE_SENTRY_DEV"] || "false",
    },
  });
}

function Document({ 
  children, 
  env 
}: { 
  children: React.ReactNode;
  env?: any;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="mobile-web-app-capable" content="yes" />
        <Meta />
        <Links />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Apply theme before render to prevent flash
              const theme = localStorage.getItem('theme') || 'system';
              if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
              }
            `,
          }}
        />
      </head>
      <body className="h-full font-sans text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900">
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.ENV = ${JSON.stringify(env || {})};`,
          }}
        />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  // Use useRouteLoaderData to safely access loader data in Layout
  // This returns undefined if in an error boundary
  const data = useRouteLoaderData<typeof loader>("root");
  
  return (
    <Document env={data?.env}>
      {children}
    </Document>
  );
}

export default function App() {
  useEffect(() => {
    // Only run on client side
    if (typeof window !== 'undefined') {
      // Dynamically import monitoring to avoid SSR issues
      import('~/services/monitoring/init.client').then(({ initMonitoring }) => {
        initMonitoring();
      }).catch(error => {
        console.error('Failed to initialize monitoring:', error);
      });
    }
  }, []);

  return (
    <ThemeProvider>
      <MonitoringErrorBoundary level="app">
        <Outlet />
      </MonitoringErrorBoundary>
    </ThemeProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  
  // Handle different error types appropriately
  let errorMessage = "An unexpected error occurred";
  let errorStatus = 500;
  
  if (isRouteErrorResponse(error)) {
    errorMessage = error.data || error.statusText;
    errorStatus = error.status;
  } else if (error instanceof Error) {
    errorMessage = error.message;
    // Don't expose stack traces in production
    if (process.env.NODE_ENV === "development") {
      console.error(error.stack);
    }
  }
  
  return (
    <Document>
      <div className="min-h-full flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full space-y-6 text-center">
          <div className="space-y-2">
            <h1 className="text-6xl font-bold text-gray-900 dark:text-white">{errorStatus}</h1>
            <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-300">
              {errorStatus === 404 ? "Page not found" : "Something went wrong"}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              {errorMessage}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a 
              href="/"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Go to Homepage
            </a>
            <button
              onClick={() => window.history.back()}
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    </Document>
  );
}