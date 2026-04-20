const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    :root {
      --mint:       #4ECBA0;
      --mint-light: #E6F9F2;
      --mint-dark:  #2FA57E;
      --sky:        #5BA3F5;
      --sky-light:  #EAF2FF;
      --sky-dark:   #3681D6;
      --ink:        #111827;
      --ink-2:      #374151;
      --muted:      #6B7280;
      --border:     #E5E7EB;
      --surface:    #F9FAFB;
      --white:      #FFFFFF;
      --danger:     #EF4444;
      --warn:       #F59E0B;
      --radius-sm:  6px;
      --radius:     12px;
      --radius-lg:  20px;
      --shadow-sm:  0 1px 3px rgba(0,0,0,.07), 0 1px 2px rgba(0,0,0,.04);
      --shadow:     0 4px 16px rgba(0,0,0,.08);
      --shadow-lg:  0 12px 40px rgba(0,0,0,.12);
      --font:       'Sora', sans-serif;
      --mono:       'DM Mono', monospace;
      --sidebar-w:  240px;
      --header-h:   64px;

      /* ── Tailwind bg/txt/border (light) ── */
      --bg-primary:    #f8f9fa;
      --bg-secondary:  #f0f2f5;
      --bg-surface:    #ffffff;
      --bg-elevated:   #ffffff;
      --border-subtle: rgba(0,0,0,0.08);
      --border-accent: rgba(0,0,0,0.14);
      --txt-primary:   #24292f;
      --txt-secondary: #57606a;
      --txt-tertiary:  #8c959f;

      /* ── Button variants (light) ── */
      --txt-accent-blue:    #1a5fa8;
      --btn-success-bg:     rgba(22,163,74,0.10);
      --btn-success-border: rgba(22,163,74,0.35);
      --btn-success-text:   #15803d;
      --btn-success-hover:  rgba(22,163,74,0.17);
      --btn-warning-bg:     rgba(217,119,6,0.10);
      --btn-warning-border: rgba(217,119,6,0.35);
      --btn-warning-text:   #b45309;
      --btn-warning-hover:  rgba(217,119,6,0.17);
      --btn-danger-bg:      rgba(220,38,38,0.10);
      --btn-danger-border:  rgba(220,38,38,0.35);
      --btn-danger-text:    #dc2626;
      --btn-danger-hover:   rgba(220,38,38,0.17);

      /* ── Step bar & trace badges (light) ── */
      --step-bar-bg:     rgba(59,139,212,0.07);
      --step-var-bg:     rgba(22,163,74,0.08);
      --step-var-text:   #15803d;
      --step-var-border: rgba(22,163,74,0.28);

      /* ── Error/fix cards (light) ── */
      --card-err-bg:        rgba(220,38,38,0.06);
      --card-err-border:    rgba(220,38,38,0.28);
      --card-err-inner-bg:  rgba(220,38,38,0.08);
      --card-err-inner-bdr: rgba(220,38,38,0.20);
      --card-err-text:      #dc2626;
      --card-err-code:      #7f1d1d;
      --card-fix-bg:        rgba(161,98,7,0.08);
      --card-fix-border:    rgba(161,98,7,0.30);
      --card-fix-text:      #92400e;
      --card-fixed-bg:      rgba(22,163,74,0.08);
      --card-fixed-text:    #15803d;

      /* ── Code editor (light) ── */
      --editor-bg:               #f8f9fa;
      --editor-gutter-bg:        #f0f2f5;
      --editor-gutter-border:    rgba(0,0,0,0.10);
      --editor-gutter-color:     #6a737d;
      --editor-text:             #24292f;
      --editor-comment:          #6a737d;
      --editor-neck:             #8250df;
      --editor-builtin:          #0550ae;
      --editor-var:              #cf222e;
      --editor-functor:          #1a7f37;
      --editor-number:           #953800;
      --editor-punct:            #8c959f;
      --editor-hl-active-bg:     rgba(59,139,212,0.12);
      --editor-hl-active-border: #3b8bd4;
      --editor-hl-sec-bg:        rgba(59,139,212,0.06);
      --editor-hl-sec-border:    rgba(59,139,212,0.30);
      --editor-hl-cho-bg:        rgba(239,159,39,0.10);
      --editor-hl-cho-border:    #EF9F27;
      --editor-caret:            #3B8BD4;
      --editor-badge-color:      #f59e0b;
      --editor-badge-bg:         rgba(245,158,11,0.12);
      --editor-arrow-sec:        rgba(59,139,212,0.5);
      --editor-arrow-cho:        rgba(239,159,39,0.7);
      --editor-linenum-act:      #1a7f37;
    }

    body {
      font-family: var(--font);
      color: var(--ink);
      background: var(--surface);
    }

    [data-theme="dark"] {
      --ink:        #F9FAFB;
      --ink-2:      #E5E7EB;
      --muted:      #9CA3AF;
      --border:     #2D3748;
      --surface:    #1A202C;
      --white:      #2D3748;
      --mint-light: rgba(78,203,160,0.14);
      --sky-light:  rgba(91,163,245,0.14);
      --shadow-sm:  0 1px 3px rgba(0,0,0,.3), 0 1px 2px rgba(0,0,0,.2);
      --shadow:     0 4px 16px rgba(0,0,0,.35);

      /* ── Tailwind bg/txt/border (dark) ── */
      --bg-primary:    #0d0f14;
      --bg-secondary:  #131620;
      --bg-surface:    #181c26;
      --bg-elevated:   #1e2332;
      --border-subtle: rgba(255,255,255,0.07);
      --border-accent: rgba(255,255,255,0.12);
      --txt-primary:   #e2e4ec;
      --txt-secondary: #8892a4;
      --txt-tertiary:  #505968;

      /* ── Button variants (dark) ── */
      --txt-accent-blue:    #85B7EB;
      --btn-success-bg:     rgba(34,197,94,0.08);
      --btn-success-border: rgba(34,139,34,0.40);
      --btn-success-text:   #86efac;
      --btn-success-hover:  rgba(34,197,94,0.14);
      --btn-warning-bg:     rgba(217,119,6,0.08);
      --btn-warning-border: rgba(217,119,6,0.40);
      --btn-warning-text:   #fcd34d;
      --btn-warning-hover:  rgba(217,119,6,0.14);
      --btn-danger-bg:      rgba(239,68,68,0.08);
      --btn-danger-border:  rgba(185,28,28,0.40);
      --btn-danger-text:    #fca5a5;
      --btn-danger-hover:   rgba(239,68,68,0.14);

      /* ── Step bar & trace badges (dark) ── */
      --step-bar-bg:     #0f2030;
      --step-var-bg:     #0f2a1a;
      --step-var-text:   #86efac;
      --step-var-border: rgba(34,197,94,0.31);

      /* ── Error/fix cards (dark) ── */
      --card-err-bg:        rgba(239,68,68,0.06);
      --card-err-border:    rgba(185,28,28,0.40);
      --card-err-inner-bg:  rgba(127,29,29,0.18);
      --card-err-inner-bdr: rgba(185,28,28,0.30);
      --card-err-text:      #fca5a5;
      --card-err-code:      rgba(253,230,138,0.90);
      --card-fix-bg:        rgba(120,53,15,0.12);
      --card-fix-border:    rgba(161,98,7,0.40);
      --card-fix-text:      #fcd34d;
      --card-fixed-bg:      rgba(20,83,45,0.18);
      --card-fixed-text:    #86efac;

      /* ── Code editor (dark) ── */
      --editor-bg:               #0d0f14;
      --editor-gutter-bg:        #0d0f14;
      --editor-gutter-border:    rgba(255,255,255,0.07);
      --editor-gutter-color:     #505968;
      --editor-text:             #e2e4ec;
      --editor-comment:          #505968;
      --editor-neck:             #c792ea;
      --editor-builtin:          #82aaff;
      --editor-var:              #ED93B1;
      --editor-functor:          #85B7EB;
      --editor-number:           #EF9F27;
      --editor-punct:            #6b7a99;
      --editor-hl-active-bg:     rgba(59,139,212,0.20);
      --editor-hl-active-border: #3b8bd4;
      --editor-hl-sec-bg:        rgba(133,183,235,0.09);
      --editor-hl-sec-border:    rgba(133,183,235,0.45);
      --editor-hl-cho-bg:        rgba(239,159,39,0.14);
      --editor-hl-cho-border:    #EF9F27;
      --editor-caret:            #3B8BD4;
      --editor-badge-color:      #f59e0b;
      --editor-badge-bg:         rgba(245,158,11,0.12);
      --editor-arrow-sec:        rgba(133,183,235,0.5);
      --editor-arrow-cho:        rgba(239,159,39,0.7);
      --editor-linenum-act:      #85B7EB;
    }

    html[data-theme="dark"],
    html[data-theme="dark"] body {
      background: #1A202C;
      color: #F9FAFB;
    }

    button {
      font-family: var(--font);
      cursor: pointer;
      border: none;
      outline: none;
    }

    input, textarea {
      font-family: var(--font);
      outline: none;
      border: none;
    }

    a {
      text-decoration: none;
      color: inherit;
    }

    ::-webkit-scrollbar {
      width: 5px;
    }

    ::-webkit-scrollbar-track {
      background: transparent;
    }

    ::-webkit-scrollbar-thumb {
      background: var(--border);
      border-radius: 10px;
    }

    .fade-in {
      animation: fadeIn .3s ease forwards;
    }

    @keyframes fadeIn {
      from { opacity:0; transform:translateY(6px); }
      to { opacity:1; transform:translateY(0); }
    }

    .slide-up {
      animation: slideUp .4s cubic-bezier(.16,1,.3,1) forwards;
    }

    @keyframes slideUp {
      from { opacity:0; transform:translateY(20px); }
      to { opacity:1; transform:translateY(0); }
    }

    @keyframes pulse {
      0%,100% { opacity:1; }
      50% { opacity:.5; }
    }

    @keyframes spin {
      to { transform:rotate(360deg); }
    }
  `}</style>
);

export default GlobalStyle;
