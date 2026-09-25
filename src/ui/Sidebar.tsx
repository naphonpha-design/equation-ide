import type { ModelFile } from "../storage/files";
import type { Locale } from "../i18n/messages";
import { UI } from "../i18n/ui";
import { SAMPLES } from "../samples";

interface SidebarProps {
  files: readonly ModelFile[];
  activeId: string | undefined;
  locale: Locale;
  onSelect: (id: string) => void;
  onNew: () => void;
  onOpen: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string) => void;
  onLoadSample: (name: string) => void;
}

export function Sidebar({
  files,
  activeId,
  locale,
  onSelect,
  onNew,
  onOpen,
  onDelete,
  onRename,
  onLoadSample,
}: SidebarProps) {
  const strings = UI[locale];

  return (
    <aside className="sidebar">
      <div className="sidebar__section">
        <h2 className="sidebar__heading">{strings.files}</h2>
        <div className="sidebar__actions">
          <button type="button" onClick={onNew}>
            + {strings.newFile}
          </button>
          <button type="button" onClick={onOpen}>
            {strings.openFile}
          </button>
        </div>
        <ul className="filelist">
          {files.map((file) => (
            <li
              key={file.id}
              className={`filelist__item${
                file.id === activeId ? " filelist__item--active" : ""
              }`}
            >
              <button
                type="button"
                className="filelist__name"
                onClick={() => onSelect(file.id)}
                title={file.name}
              >
                {file.name}
              </button>
              <span className="filelist__tools">
                <button
                  type="button"
                  title={strings.rename}
                  onClick={() => onRename(file.id)}
                >
                  ✎
                </button>
                <button
                  type="button"
                  title={strings.deleteFile}
                  onClick={() => onDelete(file.id)}
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="sidebar__section">
        <h2 className="sidebar__heading">{strings.samples}</h2>
        <ul className="filelist">
          {SAMPLES.map((sample) => (
            <li key={sample.name} className="filelist__item">
              <button
                type="button"
                className="filelist__name"
                onClick={() => onLoadSample(sample.name)}
                title={sample.title[locale]}
              >
                {sample.title[locale]}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
