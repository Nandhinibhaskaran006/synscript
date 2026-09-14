import React, { useState, useEffect, useRef } from "react";

export type QuickOpenFileItem = {
  path: string;
  name: string;
  type: "file" | "folder";
};

interface QuickOpenModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: QuickOpenFileItem[];
  onSelectFile: (path: string) => void;
  getFileIcon: (filename: string) => { icon: string; color: string };
}

export const QuickOpenModal: React.FC<QuickOpenModalProps> = ({
  isOpen,
  onClose,
  files,
  onSelectFile,
  getFileIcon,
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const fileList = files.filter((f) => f.type === "file");

  const filteredFiles = fileList.filter((f) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 30);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current && filteredFiles.length > 0) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex, filteredFiles.length]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredFiles.length === 0 ? 0 : (prev + 1) % filteredFiles.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filteredFiles.length === 0 ? 0 : (prev - 1 + filteredFiles.length) % filteredFiles.length
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredFiles[selectedIndex]) {
        onSelectFile(filteredFiles[selectedIndex].path);
        onClose();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const highlightMatch = (text: string, q: string) => {
    if (!q.trim()) return text;
    const lowerText = text.toLowerCase();
    const lowerQuery = q.toLowerCase();
    const idx = lowerText.indexOf(lowerQuery);
    if (idx === -1) return text;

    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + q.length);
    const after = text.slice(idx + q.length);

    return (
      <>
        {before}
        <span className="bg-[#3B82F6]/30 text-[#60a5fa] font-semibold underline decoration-[#3B82F6]">
          {match}
        </span>
        {after}
      </>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[150] flex items-start justify-center pt-16 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[560px] max-w-[90vw] rounded-2xl bg-[#0F1219] border border-white/10 shadow-2xl shadow-black/80 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input header */}
        <div className="flex items-center px-4 py-3.5 border-b border-white/10 bg-[#0e1117] gap-3">
          <span className="material-symbols-outlined text-[#3B82F6] text-[20px]">search</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a file name to open (e.g. index.js, README)..."
            className="flex-1 bg-transparent text-sm text-white placeholder-[#8c909f] focus:outline-none font-mono"
          />
          <kbd className="px-2 py-0.5 rounded bg-white/10 text-[10px] text-[#8c909f] font-mono border border-white/10">
            ESC to close
          </kbd>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          className="max-h-[360px] overflow-y-auto custom-scrollbar p-2 space-y-1"
        >
          {filteredFiles.length > 0 ? (
            filteredFiles.map((file, idx) => {
              const icon = getFileIcon(file.name);
              const isSelected = idx === selectedIndex;
              const pathParts = file.path.split("/");
              const dirPath = pathParts.length > 1 ? pathParts.slice(0, -1).join("/") : "";

              return (
                <div
                  key={file.path}
                  onClick={() => {
                    onSelectFile(file.path);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? "bg-[#3B82F6]/20 border border-[#3B82F6]/40 text-white"
                      : "text-[#c2c6d6] hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className={`material-symbols-outlined text-[18px] ${icon.color}`}>
                      {icon.icon}
                    </span>
                    <span className="text-xs font-semibold text-white truncate">
                      {highlightMatch(file.name, query)}
                    </span>
                    {dirPath && (
                      <span className="text-[11px] text-[#8c909f] font-mono truncate">
                        {dirPath}
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <span className="text-[10px] font-mono text-[#adc6ff] bg-[#3B82F6]/30 px-2 py-0.5 rounded ml-2 shrink-0">
                      Press Enter ↵
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <div className="px-4 py-8 text-center text-xs text-[#8c909f] italic">
              No matching files found for &quot;{query}&quot;
            </div>
          )}
        </div>

        {/* Footer tip */}
        <div className="px-4 py-2 border-t border-white/5 bg-[#0e1117]/60 flex items-center justify-between text-[11px] text-[#8c909f]">
          <span>
            Navigate with <kbd className="px-1 py-0.5 bg-white/5 rounded text-white">↑</kbd> <kbd className="px-1 py-0.5 bg-white/5 rounded text-white">↓</kbd>
          </span>
          <span>{filteredFiles.length} file{filteredFiles.length === 1 ? "" : "s"} found</span>
        </div>
      </div>
    </div>
  );
};
