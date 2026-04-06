import React, { useRef, useCallback } from 'react';

// ── Constants — must match exactly between gutter, highlight, and textarea ──
const FONT_FAMILY = "'JetBrains Mono', 'Fira Code', monospace";
const FONT_SIZE = '13px';
const LINE_HEIGHT = '1.7';
const PAD_H = '12px';   // horizontal padding inside the code area
const GUTTER_W = 52;       // px — line-number gutter width

// ── Syntax token colours ──
const TOKEN_CSS = `
.tok-comment { color: #505968; font-style: italic; }
.tok-neck    { color: #c792ea; font-weight: 600; }
.tok-builtin { color: #82aaff; }
.tok-var     { color: #ED93B1; }
.tok-functor { color: #85B7EB; }
.tok-number  { color: #EF9F27; }
.tok-punct   { color: #6b7a99; }
.hl-line     { min-height: 1.7em; color: #e2e4ec; }
.hl-active   { background: rgba(59,139,212,0.10); }
`;

export default function CodeEditor({ value, onChange, highlightLines = [], tabSize = 2 }) {
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
      const isHL = highlightLines.includes(li);
      const inner = line.trim().startsWith('%')
        ? `<span class="tok-comment">${esc(line)}</span>`
        : tokenizeLine(line);
      return `<div class="hl-line${isHL ? ' hl-active' : ''}">${inner || '\u00a0'}</div>`;
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
        {lines.map((_, i) => (
          <div key={i} style={{ paddingRight: 10, paddingLeft: 8 }}>{i + 1}</div>
        ))}
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
