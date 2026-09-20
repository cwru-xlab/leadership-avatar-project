"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ReportMarkdownProps {
  markdown: string;
}

/**
 * Renders the evaluator's `report_markdown` body.
 *
 * Raw HTML stays disabled — this body is model-generated. There is no plugin
 * enabling raw HTML pass-through here, and markdown is never injected via an
 * unsafe innerHTML escape hatch. `remark-gfm` is required so the Category
 * Breakdown table (a GFM table) actually renders as a table instead of
 * falling back to plain text.
 */
export default function ReportMarkdown({ markdown }: ReportMarkdownProps) {
  return (
    <div className="report-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="font-serif text-3xl tracking-[-0.03em] text-[#102331] mt-8 first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="font-serif text-2xl text-[#102331] mt-8 pb-2 border-b border-[#d4e2e9]">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#0a7391] mt-6">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="mt-3 text-[15px] leading-7 text-[#3a5462]">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="mt-3 list-disc pl-5 space-y-1.5 text-[15px] leading-7 text-[#3a5462]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mt-3 list-decimal pl-5 space-y-1.5 text-[15px] leading-7 text-[#3a5462]">
              {children}
            </ol>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-[#102331]">{children}</strong>
          ),
          table: ({ children }) => (
            <div className="mt-4 overflow-x-auto rounded-xl border border-[#d4e2e9]">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="bg-[#f5f8fa] px-4 py-2.5 text-left font-semibold text-[#102331] border-b border-[#d4e2e9]">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-2.5 align-top text-[#3a5462] border-b border-[#eef3f5]">
              {children}
            </td>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              className="text-[#0a7391] underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mt-4 border-l-3 border-[#53a9ca] bg-[#f5f8fa] px-4 py-3 text-[#3a5462] italic">
              {children}
            </blockquote>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
