import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type * as MonacoApi from "monaco-editor";
import type { Diagnostic } from "../lang";
import type { Locale } from "../i18n/messages";
import {
  DARK_THEME,
  LANGUAGE_ID,
  LIGHT_THEME,
  registerEquatranLanguage,
  toMarkers,
} from "../lang/monacoLanguage";

interface EditorPaneProps {
  source: string;
  diagnostics: readonly Diagnostic[];
  locale: Locale;
  theme: "light" | "dark";
  onChange: (value: string) => void;
  onCursorMove: (line: number, column: number) => void;
  onRun: () => void;
  /** Set by the parent to focus a diagnostic from the Problems panel. */
  revealRef: React.MutableRefObject<
    ((line: number, column: number) => void) | undefined
  >;
}

export function EditorPane({
  source,
  diagnostics,
  locale,
  theme,
  onChange,
  onCursorMove,
  onRun,
  revealRef,
}: EditorPaneProps) {
  const [monacoReady, setMonacoReady] = useState(false);
  const editorRef = useRef<MonacoApi.editor.IStandaloneCodeEditor | undefined>(
    undefined,
  );
  const monacoRef = useRef<Monaco | undefined>(undefined);
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;

  // Monaco is large, so it is pulled in after first paint rather than blocking it.
  useEffect(() => {
    let cancelled = false;
    void import("../lang/monacoSetup").then(() => {
      if (!cancelled) setMonacoReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const beforeMount = useCallback((monaco: Monaco) => {
    registerEquatranLanguage(monaco);
  }, []);

  const handleMount = useCallback<OnMount>(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        onRunRef.current();
      });
      editor.onDidChangeCursorPosition((event) => {
        onCursorMove(event.position.lineNumber, event.position.column);
      });

      revealRef.current = (line, column) => {
        editor.revealLineInCenter(line);
        editor.setPosition({ lineNumber: line, column });
        editor.focus();
      };
    },
    [onCursorMove, revealRef],
  );

  // Redraw squiggles whenever the diagnostics or the message language change.
  useEffect(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    if (!monaco || !editor) return;
    const model = editor.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      LANGUAGE_ID,
      toMarkers(monaco, diagnostics, locale),
    );
  }, [diagnostics, locale]);

  if (!monacoReady) {
    return <div className="editor__loading">…</div>;
  }

  return (
    <Editor
      language={LANGUAGE_ID}
      theme={theme === "dark" ? DARK_THEME : LIGHT_THEME}
      value={source}
      beforeMount={beforeMount}
      onMount={handleMount}
      onChange={(value) => onChange(value ?? "")}
      options={{
        fontSize: 13,
        fontFamily:
          "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
        minimap: { enabled: true },
        renderWhitespace: "none",
        tabSize: 4,
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        automaticLayout: true,
        unicodeHighlight: { ambiguousCharacters: false },
      }}
    />
  );
}
