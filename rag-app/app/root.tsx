import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "@remix-run/react";
import type { LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import stylesheet from "~/styles/tailwind.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
];

export async function loader({ request }: LoaderFunctionArgs) {
  // Pass environment variables to the client
  return json({
    env: {
      SUPABASE_URL: process.env["SUPABASE_URL"],
      SUPABASE_ANON_KEY: process.env["SUPABASE_ANON_KEY"],
    },
  });
}

export function Layout({ children }: { children: React.ReactNode }) {
  // useLoaderData cannot be used in error boundary, so handle gracefully
  let data: any = {};
  try {
    data = useLoaderData<typeof loader>();
  } catch (e) {
    // In error boundary, loader data is not available
  }
  
  return (
    <html lang="en" className="h-full">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="h-full" suppressHydrationWarning>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.ENV = ${JSON.stringify(data?.env || {})};`,
          }}
        />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}