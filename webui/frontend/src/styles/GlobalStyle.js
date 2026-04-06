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
