"use client";

/**
 * Read-only, syntax-highlighted code for the coding report: the student's
 * final code and the model solution. Same CodeMirror and language modes as
 * the coding room's editor (`TechnicalCodeEditor`), with editing switched off
 * — that editor's props assume a live room (run tests, onChange), so this is
 * the view-only sibling rather than a flag on it.
 *
 * Scrolls sideways inside its own box, so long lines never widen the page.
 */

import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { useMemo } from "react";

import type { TechnicalCodingLanguage } from "@/lib/technical-interview/types";

export default function ReadOnlyCode({
  code,
  language,
  label,
}: {
  code: string;
  language: TechnicalCodingLanguage;
  label: string;
}) {
  const extensions = useMemo(
    () => [language === "python" ? python() : javascript(), EditorView.contentAttributes.of({ "aria-label": label })],
    [language, label],
  );

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-line">
      <CodeMirror
        value={code}
        editable={false}
        readOnly
        theme="light"
        maxHeight="480px"
        extensions={extensions}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          foldGutter: false,
          autocompletion: false,
        }}
        className="text-[13.5px] leading-6 [&_.cm-editor]:outline-none [&_.cm-focused]:outline-none [&_.cm-gutters]:border-r [&_.cm-gutters]:border-line [&_.cm-gutters]:bg-canvas [&_.cm-gutters]:text-muted [&_.cm-content]:py-3 [&_.cm-scroller]:font-mono"
      />
    </div>
  );
}
