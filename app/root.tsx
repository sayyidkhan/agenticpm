import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  // Favicons
  { rel: "icon", type: "image/x-icon", href: "/favicons/icons/favicon.ico" },
  { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicons/icons/favicon-16x16.png" },
  { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicons/icons/favicon-32x32.png" },
  { rel: "icon", type: "image/png", sizes: "96x96", href: "/favicons/icons/favicon-96x96.png" },
  { rel: "icon", type: "image/png", sizes: "192x192", href: "/favicons/icons/favicon-192x192.png" },
  { rel: "apple-touch-icon", sizes: "57x57", href: "/favicons/icons/favicon-57x57.png" },
  { rel: "apple-touch-icon", sizes: "60x60", href: "/favicons/icons/favicon-60x60.png" },
  { rel: "apple-touch-icon", sizes: "72x72", href: "/favicons/icons/favicon-72x72.png" },
  { rel: "apple-touch-icon", sizes: "76x76", href: "/favicons/icons/favicon-76x76.png" },
  { rel: "apple-touch-icon", sizes: "114x114", href: "/favicons/icons/favicon-114x114.png" },
  { rel: "apple-touch-icon", sizes: "120x120", href: "/favicons/icons/favicon-120x120.png" },
  { rel: "apple-touch-icon", sizes: "144x144", href: "/favicons/icons/favicon-144x144.png" },
  { rel: "apple-touch-icon", sizes: "150x150", href: "/favicons/icons/favicon-150x150.png" },
  { rel: "apple-touch-icon", sizes: "152x152", href: "/favicons/icons/favicon-152x152.png" },
  { rel: "apple-touch-icon", sizes: "180x180", href: "/favicons/icons/favicon-180x180.png" },
  { rel: "icon", type: "image/png", sizes: "310x310", href: "/favicons/icons/favicon-310x310.png" },
  
  // Fonts
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:wght@300..700&family=JetBrains+Mono:wght@400;500&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Agentic PM - AI-Powered Project Management</title>
        <meta name="description" content="AI-powered project management tool with intelligent task planning, timeline tracking, and team collaboration." />
        <meta name="theme-color" content="#000000" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
