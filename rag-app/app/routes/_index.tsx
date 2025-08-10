import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
  return [
    { title: "RAG Application" },
    { name: "description", content: "Production-ready RAG application with Remix" },
  ];
};

export default function Index() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-16">
        <header className="flex flex-col items-center gap-9">
          <h1 className="leading text-2xl font-bold text-gray-800">
            Welcome to RAG Application
          </h1>
          <p className="text-gray-600">Built with Remix, PostgreSQL, and Redis</p>
        </header>
      </div>
    </div>
  );
}