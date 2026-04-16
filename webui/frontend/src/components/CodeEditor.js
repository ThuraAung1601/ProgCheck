import React, { useRef, useCallback } from 'react';

// ── Constants — must match exactly between gutter, highlight, and textarea ──
const FONT_FAMILY = "'JetBrains Mono', 'Fira Code', monospace";
const FONT_SIZE = '13px';
const LINE_HEIGHT = '1.7';
const PAD_H = '12px';   // horizontal padding inside the code area
const GUTTER_W = 64;       // px — line-number gutter width (wider for annotations)

// ── Syntax token colours ──
const TOKEN_CSS = `
.tok-comment { color: #505968; font-style: italic; }
.tok-neck    { color: #c792ea; font-weight: 600; }
.tok-builtin { color: #82aaff; }
.tok-var     { color: #ED93B1; }
.tok-functor { color: #85B7EB; }
.tok-number  { color: #EF9F27; }
.tok-punct   { color: #6b7a99; }
.hl-line      { min-height: 1.7em; color: #e2e4ec; }
.hl-active    { background: rgba(59,139,212,0.20); border-left: 3px solid #3b8bd4; }
.hl-secondary { background: rgba(133,183,235,0.09); border-left: 3px solid rgba(133,183,235,0.45); }
.hl-choice    { background: rgba(239,159,39,0.14); border-left: 3px dashed #EF9F27; border-right: 1px dashed rgba(239,159,39,0.4); }
`;

export default function CodeEditor({
  value,
  onChange,
  highlightLines  = [],   // primary highlight (current node)
  secondaryLines  = [],   // secondary highlight (parent/caller rule)
  choiceLines     = [],   // dashed choice-point look-ahead
  gutterAnnotations = {}, // { lineIdx: string } — shown in gutter (scope counts, arrows)
  bindingColors   = {},   // { tokenText: cssColor } — variable/value coloring on highlighted lines
  tabSize = 2,
}) {
  const textareaRef = useRef(null);
  const highlightRef = useRef(null);
  const gutterRef = useRef(null);

  // Keep highlight + gutter scrolled in sync with textarea
  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    if (highlightRef.current) {
      highlightRef.current.scrollTop = ta.scrollTop;
      highlightRef.current.scrollLeft = ta.scrollLeft;
    }

    if (gutterRef.current) {
      gutterRef.current.scrollTop = ta.scrollTop;
    }
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = textareaRef.current;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const spaces = ' '.repeat(tabSize);
      const newVal = value.substring(0, start) + spaces + value.substring(end);
      onChange(newVal);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + tabSize;
      });
    }
  };

  const lines = (value || '').split('\n');

  // Build highlighted HTML — one div per line, no line numbers here
  const buildHighlight = () =>
    lines.map((line, li) => {
      const isHl  = highlightLines.includes(li);
      const isSec = secondaryLines.includes(li);
      const isCho = choiceLines.includes(li);
      let inner = line.trim().startsWith('%')
        ? `<span class="tok-comment">${esc(line)}</span>`
        : tokenizeLine(line);
      // Apply variable/value coloring on highlighted and secondary lines
      if ((isHl || isSec) && Object.keys(bindingColors).length > 0)
        inner = applyBindingColors(inner, bindingColors);
      let cls = 'hl-line';
      if (isHl)       cls += ' hl-active';
      else if (isSec) cls += ' hl-secondary';
      else if (isCho) cls += ' hl-choice';
      return `<div class="${cls}">${inner || '\u00a0'}</div>`;
    }).join('');

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0, background: '#0d0f14', height: '100%' }}>
      {/* Inject token colour rules once */}
      <style>{TOKEN_CSS}</style>

      {/* ── Gutter: line numbers ── */}
      <div
        ref={gutterRef}
        aria-hidden="true"
        style={{
          width: GUTTER_W,
          flexShrink: 0,
          overflowY: 'hidden',
          overflowX: 'hidden',
          background: '#0d0f14',
          borderRight: '1px solid rgba(255,255,255,0.07)',
          fontFamily: FONT_FAMILY,
          fontSize: FONT_SIZE,
          lineHeight: LINE_HEIGHT,
          color: '#505968',
          textAlign: 'right',
          userSelect: 'none',
          paddingTop: 0,
        }}
      >
        {lines.map((_, i) => {
          const ann    = gutterAnnotations[i];
          const isAct  = highlightLines.includes(i);
          const isSec  = secondaryLines.includes(i);
          const isCho  = choiceLines.includes(i);
          return (
            <div key={i} style={{
              paddingRight: 6, paddingLeft: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3,
            }}>
              {/* Scope-count badge */}
              {ann && (
                <span style={{
                  fontSize: 8, fontWeight: 700, color: '#f59e0b',
                  background: 'rgba(245,158,11,0.12)', borderRadius: 3,
                  padding: '0 2px', lineHeight: '12px', flexShrink: 0,
                }}>{ann}</span>
              )}
              {/* Arrow indicator */}
              {(isAct || isSec || isCho) && (
                <span style={{
                  fontSize: 9,
                  color: isAct ? '#3b8bd4' : isSec ? 'rgba(133,183,235,0.5)' : 'rgba(239,159,39,0.7)',
                  flexShrink: 0,
                }}>{isAct ? '►' : isCho ? '⇢' : '·'}</span>
              )}
              <span style={{ color: isAct ? '#85B7EB' : '#505968' }}>{i + 1}</span>
            </div>
          );
        })}
      </div>

      {/* ── Code area: highlight layer + textarea, perfectly stacked ── */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>

        {/* Highlight layer (decorative, pointer-events off) */}
        <div
          ref={highlightRef}
          className="highlight-layer"
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            fontFamily: FONT_FAMILY,
            fontSize: FONT_SIZE,
            lineHeight: LINE_HEIGHT,
            whiteSpace: 'pre',
            overflow: 'hidden',
            padding: `0 ${PAD_H}`,
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          <div
            style={{
              minWidth: 'max-content',   // 🔥 THIS IS THE KEY
            }}
            dangerouslySetInnerHTML={{ __html: buildHighlight() }}
          />
        </div>

        {/* Editable textarea — identical geometry to highlight layer */}
        <textarea
          id="code-editor"
          name="code-editor"
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          style={{
            position: 'absolute', inset: 0,
            fontFamily: FONT_FAMILY,
            fontSize: FONT_SIZE,
            lineHeight: LINE_HEIGHT,
            whiteSpace: 'pre',
            padding: `0 ${PAD_H}`,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            color: 'transparent',
            caretColor: '#3B8BD4',
            zIndex: 2,
            overflowY: 'auto',
            overflowX: 'auto',
            minWidth: 'max-content',
          }}
        />
      </div>
    </div>
  );
}

// ── Tokeniser ──────────────────────────────────────────────────────────────
function tokenizeLine(line) {
  const tokens = [];

  const regex = /(:-)|\b(is|not|true|fail|assert|retract|findall|bagof|setof)\b|\b([A-Z_][a-zA-Z0-9_]*)\b|\b([a-z][a-zA-Z0-9_]*)(?=\()|\b(\d+\.?\d*)\b|([(),\[\]|])/g;

  let lastIndex = 0;
  let match;

  while ((match = regex.exec(line)) !== null) {
    const [full] = match;
    const index = match.index;

    // add plain text before match
    if (index > lastIndex) {
      tokens.push(esc(line.slice(lastIndex, index)));
    }

    if (match[1]) {
      tokens.push(`<span class="tok-neck">${full}</span>`);
    } else if (match[2]) {
      tokens.push(`<span class="tok-builtin">${full}</span>`);
    } else if (match[3]) {
      tokens.push(`<span class="tok-var">${full}</span>`);
    } else if (match[4]) {
      tokens.push(`<span class="tok-functor">${full}</span>`);
    } else if (match[5]) {
      tokens.push(`<span class="tok-number">${full}</span>`);
    } else if (match[6]) {
      tokens.push(`<span class="tok-punct">${full}</span>`);
    }

    lastIndex = index + full.length;
  }

  // remaining text
  if (lastIndex < line.length) {
    tokens.push(esc(line.slice(lastIndex)));
  }

  return tokens.join('');
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Apply variable/value coloring to an already-tokenized HTML string.
// Targets: (a) tok-var spans for variable names, (b) plain text atoms between tags.
function applyBindingColors(html, bindingColors) {
  let result = html;
  Object.entries(bindingColors).forEach(([text, color]) => {
    if (!text || text.length < 2) return;
    const re = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const style = `color:${color};background:${color}28;border-radius:2px;padding:0 1px;font-weight:700`;
    // Variable spans: <span class="tok-var">Name</span>
    result = result.replace(
      new RegExp(`<span class="tok-var">(${re})</span>`, 'g'),
      `<span class="tok-var" style="${style}">$1</span>`
    );
    // Plain-text atoms sitting between HTML tag boundaries (e.g. "pizza" in homemade(pizza))
    result = result.replace(
      new RegExp(`(?<=>)(${re})(?=<)`, 'g'),
      `<span style="${style}">$1</span>`
    );
  });
  return result;
}
