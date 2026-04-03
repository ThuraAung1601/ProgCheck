import React from 'react';

/**
 * Renders a unified diff string in GitHub-style:
 *   red   background  → deleted lines  (-)
 *   green background  → added lines    (+)
 *   gray  text        → hunk headers   (@@)
 *   normal            → context lines
 */
export default function DiffViewer({ diff }) {
  if (!diff) return <p className="text-txt-secondary text-xs">No diff available.</p>;

  const lines = diff.split('\n');

  return (
    <div className="font-mono text-[11px] leading-5 overflow-auto rounded border border-border-subtle bg-[#0d1117]">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, i) => {
            // Skip the file header lines (--- / +++ / diff ---)
            if (line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('diff ')) {
              return (
                <tr key={i} className="bg-[#161b22]">
                  <td className="select-none w-8 px-2 text-right text-[#484f58] border-r border-[#30363d]" />
                  <td className="px-3 text-[#8b949e]">{line}</td>
                </tr>
              );
            }

            // Hunk header  @@ -x,y +a,b @@
            if (line.startsWith('@@')) {
              return (
                <tr key={i} className="bg-[#1c2128]">
                  <td className="select-none w-8 px-2 text-right text-[#484f58] border-r border-[#30363d]">…</td>
                  <td className="px-3 text-[#6e7681]">{line}</td>
                </tr>
              );
            }

            // Deleted line
            if (line.startsWith('-')) {
              return (
                <tr key={i} className="bg-[#3d1f1f]">
                  <td className="select-none w-8 px-2 text-right text-[#f85149] border-r border-[#30363d]">−</td>
                  <td className="px-3 text-[#ffa198] whitespace-pre">{line}</td>
                </tr>
              );
            }

            // Added line
            if (line.startsWith('+')) {
              return (
                <tr key={i} className="bg-[#1a3526]">
                  <td className="select-none w-8 px-2 text-right text-[#3fb950] border-r border-[#30363d]">+</td>
                  <td className="px-3 text-[#7ee787] whitespace-pre">{line}</td>
                </tr>
              );
            }

            // Context line (unchanged)
            return (
              <tr key={i} className="bg-[#0d1117]">
                <td className="select-none w-8 px-2 text-right text-[#484f58] border-r border-[#30363d]" />
                <td className="px-3 text-[#8b949e] whitespace-pre">{line}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
