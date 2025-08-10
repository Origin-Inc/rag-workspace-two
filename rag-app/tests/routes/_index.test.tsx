import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRemixStub } from "@remix-run/testing";
import Index, { meta } from './_index';

describe('Index Route', () => {
  it('should render welcome message', async () => {
    const RemixStub = createRemixStub([
      {
        path: "/",
        Component: Index,
      },
    ]);

    render(<RemixStub />);
    
    expect(screen.getByText('Welcome to RAG Application')).toBeInTheDocument();
    expect(screen.getByText('Built with Remix, PostgreSQL, and Redis')).toBeInTheDocument();
  });

  it('should have correct meta tags', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metaTags = meta({} as any);
    expect(metaTags).toEqual([
      { title: "RAG Application" },
      { name: "description", content: "Production-ready RAG application with Remix" },
    ]);
  });
});