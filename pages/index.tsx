import React from 'react';
import ChatUI from '../components/ChatUI';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="relative">
      <div className="pointer-events-none fixed top-4 right-4 z-50">
        <Link
          href="/about"
          className="pointer-events-auto inline-flex items-center rounded-full border border-border bg-background/90 px-4 py-2 text-sm font-medium text-foreground shadow-sm backdrop-blur hover:opacity-90"
        >
          About
        </Link>
      </div>
      <ChatUI />
    </div>
  );
} 