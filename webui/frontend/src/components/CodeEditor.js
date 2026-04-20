import React, { useRef, useCallback } from 'react';

// ── Constants — must match exactly between gutter, highlight, and textarea ──
const FONT_FAMILY = "'JetBrains Mono', 'Fira Code', monospace";
const FONT_SIZE = '13px';
const LINE_HEIGHT = '1.7';
const PAD_H = '12px';
const GUTTER_W = 64;

// ── Syntax token colours — all driven by CSS custom properties ──
const TOKEN_CSS = `
.tok-comment { color: var(--editor-comment); font-style: italic; }
.tok-neck    { color: var(--editor-neck); font-weight: 600; }
.tok-builtin { color: var(--editor-builtin); }
.tok-var     { color: var(--editor-var); }
.tok-functor { color: var(--editor-functor); }
.tok-number  { color: var(--editor-number); }
.tok-punct   { color: var(--editor-punct); }
.hl-line      { min-height: 1.7em; color: var(--editor-text); }
.hl-active    { background: var(--editor-hl-active-bg); border-left: 3px solid var(--editor-hl-active-border); }
.hl-secondary { background: var(--editor-hl-sec-bg); border-left: 3px solid var(--editor-hl-sec-border); }
.hl-choice    { background: var(--editor-hl-cho-bg); border-left: 3px dashed var(--editor-hl-cho-border); border-right: 1px dashed var(--editor-hl-cho-border); }
`;

export default function CodeEditor({
  value,
  onChange,
  highlightLines  = [],
  secondaryLines  = [],
  choiceLines     = [],
  gutterAnnotations = {},
  bindingColors   = {},
  tabSize = 2,
}) {
  const textareaRef = useRef(null);
  const highlightRef = useRef(null);
  const gutterRef = useRef(null);

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

  const buildHighlight = () =>
    lines.map((line, li) => {
      const isHl  = highlightLines.includes(li);
      const isSec = secondaryLines.includes(li);
      const isCho = choiceLines.includes(li);
      let inner = line.trim().startsWith('%')
        ? `<span class="tok-comment">${esc(line)}</span>`
        : tokenizeLine(line);
      if ((isHl || isSec) && Object.keys(bindingColors).length > 0)
        inner = applyBindingColors(inner, bindingColors);
      let cls = 'hl-line';
      if (isHl)       cls += ' hl-active';
      else if (isSec) cls += ' hl-secondary';
      else if (isCho) cls += ' hl-choice';
      return `<div class="${cls}">${inner || '\u00a0'}</div>`;
    }).join('');

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0, background: 'var(--editor-bg)', height: '100%' }}>
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
          background: 'var(--editor-gutter-bg)',
          borderRight: '1px solid var(--editor-gutter-border)',
          fontFamily: FONT_FAMILY,
          fontSize: FONT_SIZE,
          lineHeight: LINE_HEIGHT,
          color: 'var(--editor-gutter-color)',
          textAlign: 'right',
          userSelect: 'none',
          paddingTop: 0,
        }}
      >
        {lines.map((_, i) => {
          const ann   = gutterAnnotations[i];
          const isAct = highlightLines.includes(i);
          const isSec = secondaryLines.includes(i);
          const isCho = choiceLines.includes(i);
          return (
            <div key={i} style={{
              paddingRight: 6, paddingLeft: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3,
            }}>
              {ann && (
                <span style={{
                  fontSize: 8, fontWeight: 700,
                  color: 'var(--editor-badge-color)',
                  background: 'var(--editor-badge-bg)',
                  borderRadius: 3, padding: '0 2px', lineHeight: '12px', flexShrink: 0,
                }}>{ann}</span>
              )}
              {(isAct || isSec || isCho) && (
                <span style={{
                  fontSize: 9,
                  color: isAct
                    ? 'var(--editor-hl-active-border)'
                    : isSec ? 'var(--editor-arrow-sec)' : 'var(--editor-arrow-cho)',
                  flexShrink: 0,
                }}>{isAct ? '►' : isCho ? '⇢' : '·'}</span>
              )}
              <span style={{ color: isAct ? 'var(--editor-linenum-act)' : 'var(--editor-gutter-color)' }}>{i + 1}</span>
            </div>
          );
        })}
      </div>

      {/* ── Code area: highlight layer + textarea, perfectly stacked ── */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>

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
            style={{ minWidth: 'max-content' }}
            dangerouslySetInnerHTML={{ __html: buildHighlight() }}
          />
        </div>

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
            caretColor: 'var(--editor-caret)',
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
    if (index > lastIndex) tokens.push(esc(line.slice(lastIndex, index)));
    if      (match[1]) tokens.push(`<span class="tok-neck">${full}</span>`);
    else if (match[2]) tokens.push(`<span class="tok-builtin">${full}</span>`);
    else if (match[3]) tokens.push(`<span class="tok-var">${full}</span>`);
    else if (match[4]) tokens.push(`<span class="tok-functor">${full}</span>`);
    else if (match[5]) tokens.push(`<span class="tok-number">${full}</span>`);
    else if (match[6]) tokens.push(`<span class="tok-punct">${full}</span>`);
    lastIndex = index + full.length;
  }

  if (lastIndex < line.length) tokens.push(esc(line.slice(lastIndex)));
  return tokens.join('');
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function applyBindingColors(html, bindingColors) {
  let result = html;
  Object.entries(bindingColors).forEach(([text, color]) => {
    if (!text || text.length < 2) return;
    const re = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const style = `color:${color};background:${color}28;border-radius:2px;padding:0 1px;font-weight:700`;
    result = result.replace(
      new RegExp(`<span class="tok-var">(${re})</span>`, 'g'),
      `<span class="tok-var" style="${style}">$1</span>`
    );
    result = result.replace(
      new RegExp(`(?<=>)(${re})(?=<)`, 'g'),
      `<span style="${style}">$1</span>`
    );
  });
  return result;
}
