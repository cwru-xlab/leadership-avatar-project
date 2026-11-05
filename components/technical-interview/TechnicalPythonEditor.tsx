"use client";

import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { indentLess, indentMore } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { keymap } from "@codemirror/view";
import { forwardRef, useCallback, useMemo, useRef } from "react";

interface TechnicalPythonEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRunVisibleTests: () => void;
  isRunning: boolean;
}

const TechnicalPythonEditor = forwardRef<ReactCodeMirrorRef, TechnicalPythonEditorProps>(function TechnicalPythonEditor(
  { value, onChange, onRunVisibleTests, isRunning },
  ref,
) {
  const runRef = useRef(onRunVisibleTests);
  runRef.current = onRunVisibleTests;

  const extensions = useMemo(() => [
    python(),
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
  ], [isRunning]);

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
      className="min-h-0 flex-1 text-[14px] leading-6 [&_.cm-editor]:h-full [&_.cm-editor]:outline-none [&_.cm-focused]:outline-none [&_.cm-gutters]:border-r [&_.cm-gutters]:border-slate-200 [&_.cm-gutters]:bg-slate-50 [&_.cm-gutters]:text-slate-400 [&_.cm-activeLine]:bg-blue-50/60 [&_.cm-activeLineGutter]:bg-blue-50 [&_.cm-content]:py-4 [&_.cm-content]:caret-cwru-blue [&_.cm-line]:px-4 [&_.cm-scroller]:font-mono [&_.cm-scroller]:overflow-auto [&_.cm-selectionBackground]:bg-blue-200 [&_.cm-tooltip]:border-slate-200 [&_.cm-tooltip]:bg-white"
      aria-label="Python solution editor"
      aria-describedby="editor-help"
    />
  );
});

TechnicalPythonEditor.displayName = "TechnicalPythonEditor";

export default TechnicalPythonEditor;
