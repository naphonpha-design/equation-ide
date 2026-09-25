import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { validate } from "../lang";
import { solveModel, type SolveResult } from "../solver/solve";
import type { Locale } from "../i18n/messages";
import { UI } from "../i18n/ui";
import {
  decodeSource,
  encodeSource,
  hasCharactersTis620CannotStore,
  type FileEncoding,
} from "../encoding/tis620";
import {
  createFile,
  loadActiveFileId,
  loadFiles,
  saveActiveFileId,
  saveFiles,
  uniqueName,
  type ModelFile,
} from "../storage/files";
import { SAMPLES } from "../samples";
import { EditorPane } from "./EditorPane";
import { ResultsPanel } from "./ResultsPanel";
import { VariablesPanel } from "./VariablesPanel";
import { ProblemsPanel } from "./ProblemsPanel";
import { Sidebar } from "./Sidebar";
import { Toolbar } from "./Toolbar";

type Theme = "light" | "dark";

const LOCALE_KEY = "equatran-ide.locale";
const THEME_KEY = "equatran-ide.theme";

function readSetting<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

/** On a first visit the workspace starts with the two reference models, so
 *  there is always something to look at. */
function initialFiles(): ModelFile[] {
  const stored = loadFiles();
  if (stored.length > 0) return stored;
  return SAMPLES.map((sample) => createFile(sample.name, sample.source));
}

export function App() {
  const [files, setFiles] = useState<ModelFile[]>(initialFiles);
  const [activeId, setActiveId] = useState<string | undefined>(() => {
    const stored = loadActiveFileId();
    return stored ?? undefined;
  });
  const [locale, setLocale] = useState<Locale>(() =>
    readSetting<Locale>(LOCALE_KEY, "th"),
  );
  const [theme, setTheme] = useState<Theme>(() =>
    readSetting<Theme>(THEME_KEY, "dark"),
  );
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [panelTab, setPanelTab] = useState<
    "problems" | "variables" | "results"
  >("problems");
  const [solution, setSolution] = useState<SolveResult | undefined>();
  const [notice, setNotice] = useState<string | undefined>();

  const revealRef = useRef<((line: number, column: number) => void) | undefined>(
    undefined,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeFile =
    files.find((file) => file.id === activeId) ?? files[0] ?? undefined;
  const strings = UI[locale];

  useEffect(() => saveFiles(files), [files]);
  useEffect(() => {
    if (activeFile) saveActiveFileId(activeFile.id);
  }, [activeFile]);
  useEffect(() => {
    try {
      localStorage.setItem(LOCALE_KEY, locale);
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Settings simply will not persist.
    }
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = locale;
  }, [locale, theme]);

  useEffect(() => {
    if (notice === undefined) return;
    const timer = window.setTimeout(() => setNotice(undefined), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const source = activeFile?.source ?? "";
  const { program, diagnostics, symbols, structure } = useMemo(
    () => validate(source),
    [source],
  );
  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = diagnostics.length - errorCount;

  const updateActive = useCallback(
    (change: Partial<ModelFile>) => {
      setFiles((current) =>
        current.map((file) =>
          file.id === activeFile?.id
            ? { ...file, ...change, updatedAt: Date.now() }
            : file,
        ),
      );
    },
    [activeFile?.id],
  );

  const handleNew = useCallback(() => {
    setFiles((current) => {
      const file = createFile(uniqueName("model.eqs", current), "");
      setActiveId(file.id);
      return [...current, file];
    });
  }, []);

  const handleOpen = useCallback(() => fileInputRef.current?.click(), []);

  const handleFileChosen = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const chosen = event.target.files?.[0];
      event.target.value = "";
      if (!chosen) return;
      const bytes = new Uint8Array(await chosen.arrayBuffer());
      const { text, encoding } = decodeSource(bytes);
      setFiles((current) => {
        const file = createFile(
          uniqueName(chosen.name, current),
          text,
          encoding,
        );
        setActiveId(file.id);
        return [...current, file];
      });
      if (encoding === "tis-620") {
        setNotice(
          locale === "th"
            ? "อ่านไฟล์เป็น TIS-620 และแปลงคอมเมนต์ไทยให้แล้ว"
            : "Read as TIS-620; Thai comments have been decoded",
        );
      }
    },
    [locale],
  );

  const handleSave = useCallback(() => {
    if (!activeFile) return;
    if (
      activeFile.encoding === "tis-620" &&
      hasCharactersTis620CannotStore(activeFile.source)
    ) {
      setNotice(strings.lossyEncodingWarning);
    }
    const bytes = encodeSource(activeFile.source, activeFile.encoding);
    const blob = new Blob([bytes as BlobPart], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = activeFile.name;
    link.click();
    URL.revokeObjectURL(url);
  }, [activeFile, strings.lossyEncodingWarning]);

  const handleDelete = useCallback(
    (id: string) => {
      const target = files.find((file) => file.id === id);
      if (!target) return;
      if (!window.confirm(strings.confirmDelete(target.name))) return;
      setFiles((current) => current.filter((file) => file.id !== id));
      if (activeFile?.id === id) setActiveId(undefined);
    },
    [activeFile?.id, files, strings],
  );

  const handleRename = useCallback(
    (id: string) => {
      const target = files.find((file) => file.id === id);
      if (!target) return;
      const name = window.prompt(strings.rename, target.name);
      if (name === null || name.trim() === "") return;
      setFiles((current) =>
        current.map((file) =>
          file.id === id ? { ...file, name: name.trim() } : file,
        ),
      );
    },
    [files, strings],
  );

  const handleLoadSample = useCallback((name: string) => {
    const sample = SAMPLES.find((item) => item.name === name);
    if (!sample) return;
    setFiles((current) => {
      const file = createFile(
        uniqueName(sample.name, current),
        sample.source,
      );
      setActiveId(file.id);
      return [...current, file];
    });
  }, []);

  const handleRun = useCallback(() => {
    setPanelTab("results");
    if (!structure) {
      setSolution(undefined);
      setNotice(strings.cannotRunWithErrors);
      return;
    }
    setSolution(solveModel(program, symbols, structure));
  }, [program, structure, symbols, strings.cannotRunWithErrors]);

  // A solved model describes the source it came from, so editing invalidates it.
  useEffect(() => setSolution(undefined), [source]);

  const handleReveal = useCallback((line: number, column: number) => {
    revealRef.current?.(line, column);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  return (
    <div className="app">
      <Toolbar
        fileName={activeFile?.name ?? strings.untitled}
        encoding={activeFile?.encoding ?? "utf-8"}
        locale={locale}
        theme={theme}
        errorCount={errorCount}
        warningCount={warningCount}
        onEncodingChange={(encoding: FileEncoding) => updateActive({ encoding })}
        onLocaleChange={setLocale}
        onThemeToggle={() => setTheme(theme === "dark" ? "light" : "dark")}
        onSave={handleSave}
        onRun={handleRun}
      />

      <div className="workspace">
        <Sidebar
          files={files}
          activeId={activeFile?.id}
          locale={locale}
          onSelect={setActiveId}
          onNew={handleNew}
          onOpen={handleOpen}
          onDelete={handleDelete}
          onRename={handleRename}
          onLoadSample={handleLoadSample}
        />

        <main className="main">
          <div className="editor">
            <EditorPane
              source={source}
              diagnostics={diagnostics}
              locale={locale}
              theme={theme}
              onChange={(value) => updateActive({ source: value })}
              onCursorMove={(line, column) => setCursor({ line, column })}
              onRun={handleRun}
              revealRef={revealRef}
            />
          </div>

          <section className="panel">
            <div className="panel__tabs">
              <button
                type="button"
                className={`panel__tab${
                  panelTab === "problems" ? " panel__tab--active" : ""
                }`}
                onClick={() => setPanelTab("problems")}
              >
                {strings.problems}
                {diagnostics.length > 0 ? ` (${diagnostics.length})` : ""}
              </button>
              <button
                type="button"
                className={`panel__tab${
                  panelTab === "variables" ? " panel__tab--active" : ""
                }`}
                onClick={() => setPanelTab("variables")}
              >
                {strings.variables}
                {structure ? ` (${structure.unknowns.length})` : ""}
              </button>
              <button
                type="button"
                className={`panel__tab${
                  panelTab === "results" ? " panel__tab--active" : ""
                }`}
                onClick={() => setPanelTab("results")}
              >
                {strings.results}
                {solution?.converged ? " ✓" : ""}
              </button>
            </div>
            <div className="panel__body">
              {panelTab === "problems" ? (
                <ProblemsPanel
                  diagnostics={diagnostics}
                  locale={locale}
                  onSelect={handleReveal}
                />
              ) : panelTab === "variables" ? (
                <VariablesPanel
                  symbols={symbols}
                  structure={structure}
                  locale={locale}
                  onSelect={handleReveal}
                />
              ) : (
                <ResultsPanel result={solution} locale={locale} />
              )}
            </div>
          </section>
        </main>
      </div>

      <footer className="statusbar">
        <span>{strings.statusLine(cursor.line, cursor.column)}</span>
        <span>{activeFile?.encoding === "tis-620" ? "TIS-620" : "UTF-8"}</span>
        <span>EQUATRAN</span>
      </footer>

      {notice ? <div className="notice">{notice}</div> : null}

      <input
        ref={fileInputRef}
        type="file"
        accept=".eqs,.txt,text/plain"
        hidden
        onChange={handleFileChosen}
      />
    </div>
  );
}
