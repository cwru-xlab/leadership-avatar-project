"use client";

import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { indentLess, indentMore } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import type { TechnicalCodingLanguage } from "@/lib/technical-interview/types";
import { keymap } from "@codemirror/view";
import { forwardRef, useCallback, useMemo, useRef } from "react";

interface TechnicalCodeEditorProps {
  value: string;
  language: TechnicalCodingLanguage;
  onChange: (value: string) => void;
  onRunVisibleTests: () => void;
  isRunning: boolean;
}

const TechnicalCodeEditor = forwardRef<ReactCodeMirrorRef, TechnicalCodeEditorProps>(function TechnicalCodeEditor(
  { value, language, onChange, onRunVisibleTests, isRunning },
  ref,
) {
  const runRef = useRef(onRunVisibleTests);
  runRef.current = onRunVisibleTests;

  const extensions = useMemo(() => [
    language === "python" ? python() : javascript(),
    keymap.of([
      {
        key: "Mod-Enter",
        run: () => {
          if (!isRunning) runRef.current();
          return true;
        },
      },
      { key: "Tab", run: indentMore },
      { key: "Shift-Tab", run: indentLess },
    ]),
  ], [isRunning, language]);

  const handleChange = useCallback((nextValue: string) => onChange(nextValue), [onChange]);

  return (
    <CodeMirror
      ref={ref}
      value={value}
      height="100%"
      theme="light"
      extensions={extensions}
      onChange={handleChange}
      indentWithTab
      basicSetup={{
        lineNumbers: true,
        highlightActiveLineGutter: true,
        highlightActiveLine: true,
        foldGutter: false,
        bracketMatching: true,
        autocompletion: true,
      }}
      className="min-h-0 flex-1 overflow-hidden text-[14px] leading-6 [&_.cm-editor]:h-full [&_.cm-editor]:outline-none [&_.cm-focused]:outline-none [&_.cm-gutters]:border-r [&_.cm-gutters]:border-slate-200 [&_.cm-gutters]:bg-slate-50 [&_.cm-gutters]:text-slate-400 [&_.cm-activeLine]:bg-blue-50/60 [&_.cm-activeLineGutter]:bg-blue-50 [&_.cm-content]:py-4 [&_.cm-content]:caret-cwru-blue [&_.cm-line]:px-4 [&_.cm-scroller]:font-mono [&_.cm-scroller]:overflow-auto [&_.cm-selectionBackground]:bg-blue-200 [&_.cm-tooltip]:border-slate-200 [&_.cm-tooltip]:bg-white"
      aria-label={`${language === "python" ? "Python" : "JavaScript"} solution editor`}
      aria-describedby="editor-help"
    />
  );
});

TechnicalCodeEditor.displayName = "TechnicalCodeEditor";

export default TechnicalCodeEditor;
