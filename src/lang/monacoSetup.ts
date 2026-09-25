import { loader } from "@monaco-editor/react";
// `edcore.main` is the editor plus its standalone contributions — find and
// replace, folding, multi-cursor — without the bundled language services for
// TypeScript, JSON, CSS and HTML, none of which this IDE uses.
import * as monaco from "monaco-editor/esm/vs/editor/edcore.main";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

/**
 * Serves Monaco from this bundle instead of a CDN, so the IDE keeps working
 * offline and does not depend on a third party staying up.
 *
 * EQUATRAN is a custom language with no TypeScript-style language service, so
 * the plain editor worker is the only one needed.
 */
(globalThis as unknown as { MonacoEnvironment: { getWorker: () => Worker } })
  .MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

loader.config({ monaco });

export default monaco;
