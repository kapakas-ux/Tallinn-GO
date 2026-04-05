const fs = require('fs');
let css = fs.readFileSync('src/index.css', 'utf8');

// 1. X button styling
css = css.replace(
  /\.maplibregl-popup-close-button \{[\s\S]*?outline: none !important;\n\s*text-shadow: 0 1px 2px rgba\(0, 0, 0, 0\.1\) !important;\n\}/m,
  `.maplibregl-popup-close-button {
  font-size: 24px !important;
  color: var(--secondary) !important;
  font-weight: 500 !important;
  padding: 0 !important;
  right: 12px !important;
  top: 12px !important;
  transition: all 0.2s ease;
  border-radius: 9999px !important;
  line-height: 1 !important;
  width: 32px !important;
  height: 32px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: var(--surface-container-high) !important;
  border: none !important;
  cursor: pointer !important;
  outline: none !important;
}`
);

css = css.replace(
  /\.maplibregl-popup-close-button:hover \{[\s\S]*?\n\}/m,
  `.maplibregl-popup-close-button:hover {
  background-color: var(--surface-container-highest) !important;
  color: var(--primary) !important;
  transform: scale(1.1);
}`
);

// 2. Add nav orbs and change light theme background orbs
css = css.replace(/--theme-orb3: #4338ca;/, '--theme-orb3: #4338ca;\n    --nav-orb1: #b288e8;\n    --nav-orb2: #a872cc;\n    --nav-orb3: #d197e8;');
css = css.replace(/--theme-orb3: #1e3550;/, '--theme-orb3: #1e3550;\n    --nav-orb1: #6db1d1;\n    --nav-orb2: #65b8b8;\n    --nav-orb3: #6e8fa8;');

css = css.replace(/--theme-orb1: #b8d4e8;\n\s+--theme-orb2: #c9dce8;\n\s+--theme-orb3: #a8c8d8;/,
`--theme-orb1: #8eaec7;
    --theme-orb2: #9fb7cc;
    --theme-orb3: #84a2ba;
    --nav-orb1: #bae0f7;
    --nav-orb2: #d6e8f2;
    --nav-orb3: #c2def0;`);

css = css.replace(/--theme-orb1: #dbc4a0;\n\s+--theme-orb2: #d4b896;\n\s+--theme-orb3: #e0cba8;/,
`--theme-orb1: #bea382;
    --theme-orb2: #c4a989;
    --theme-orb3: #c2a78c;
    --nav-orb1: #fbe0bd;
    --nav-orb2: #faeedb;
    --nav-orb3: #f5e4cc;`);

css = css.replace(/\[data-theme="daylight"\] \.orb,\n\s+\[data-theme="latte"\] \.orb \{[\s\S]*?\}/m, 
`[data-theme="daylight"] .orb,
[data-theme="latte"] .orb {
  opacity: 1;
  filter: blur(50px);
}`);

css = css.replace(/@keyframes orb-drift-3 \{[\s\S]*?\n  \}/m,
`@keyframes orb-drift-3 {
    from { transform: translate(0, 0) scale(1); }
    to   { transform: translate(-28vw, 18vh) scale(1.15); }
  }

  .nav-orb-layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
    border-radius: inherit;
  }

  .nav-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(24px);
    opacity: 0.9;
  }

  .nav-orb-1 {
    width: 60%;
    height: 150%;
    background: radial-gradient(circle, var(--nav-orb1), transparent 70%);
    top: -25%;
    left: -10%;
    animation: nav-orb-drift-1 12s ease-in-out infinite alternate;
  }

  .nav-orb-2 {
    width: 50%;
    height: 150%;
    background: radial-gradient(circle, var(--nav-orb2), transparent 70%);
    bottom: -25%;
    right: -10%;
    animation: nav-orb-drift-2 15s ease-in-out infinite alternate;
  }

  .nav-orb-3 {
    width: 40%;
    height: 100%;
    background: radial-gradient(circle, var(--nav-orb3), transparent 70%);
    top: 0%;
    left: 40%;
    animation: nav-orb-drift-3 18s ease-in-out infinite alternate;
  }

  @keyframes nav-orb-drift-1 {
    from { transform: translateX(0) scale(1); }
    to   { transform: translateX(20%) scale(1.1); }
  }

  @keyframes nav-orb-drift-2 {
    from { transform: translateX(0) scale(1); }
    to   { transform: translateX(-15%) scale(0.9); }
  }

  @keyframes nav-orb-drift-3 {
    from { transform: translateX(0) scale(1); }
    to   { transform: translateX(-25%) scale(1.2); }
  }`);

fs.writeFileSync('src/index.css', css);
