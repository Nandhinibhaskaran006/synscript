// Inline Tailwind CDN config — must be injected before the CDN script loads.
export const tailwindConfigScript = `
tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "surface-light": "#F9FAFB",
        "surface-container": "#1d2026",
        "secondary-fixed-dim": "#d0bcff",
        "primary-fixed": "#d8e2ff",
        "on-secondary-fixed-variant": "#5516be",
        "tertiary": "#ffb786",
        "outline": "#8c909f",
        "tertiary-container": "#df7412",
        "on-primary-fixed": "#001a42",
        "editor-bg": "#0B0E14",
        "secondary-fixed": "#e9ddff",
        "background": "#10131a",
        "primary-fixed-dim": "#adc6ff",
        "sidebar-bg": "#0F1219",
        "surface-container-highest": "#32353c",
        "on-error-container": "#ffdad6",
        "inverse-on-surface": "#2e3037",
        "surface-bright": "#363940",
        "secondary": "#d0bcff",
        "inverse-primary": "#005ac2",
        "error": "#ffb4ab",
        "surface-container-low": "#191c22",
        "primary-container": "#4d8eff",
        "on-primary-container": "#00285d",
        "on-primary-fixed-variant": "#004395",
        "on-tertiary-fixed": "#311400",
        "on-error": "#690005",
        "on-secondary": "#3c0091",
        "surface-container-lowest": "#0b0e14",
        "status-warning": "#F59E0B",
        "surface-tint": "#adc6ff",
        "outline-variant": "#424754",
        "on-secondary-fixed": "#23005c",
        "syntax-pink": "#F472B6",
        "syntax-cyan": "#22D3EE",
        "surface-variant": "#32353c",
        "surface": "#10131a",
        "surface-dim": "#10131a",
        "error-container": "#93000a",
        "surface-container-high": "#272a31",
        "secondary-container": "#571bc1",
        "on-secondary-container": "#c4abff",
        "on-primary": "#002e6a",
        "on-surface": "#e1e2eb",
        "on-tertiary": "#502400",
        "inverse-surface": "#e1e2eb",
        "on-tertiary-container": "#461f00",
        "tertiary-fixed": "#ffdcc6",
        "primary": "#adc6ff",
        "on-background": "#e1e2eb",
        "tertiary-fixed-dim": "#ffb786",
        "on-tertiary-fixed-variant": "#723600",
        "status-active": "#25C2A0",
        "on-surface-variant": "#c2c6d6"
      },
      borderRadius: { DEFAULT: "0.25rem", lg: "0.5rem", xl: "0.75rem", full: "9999px" },
      spacing: {
        unit: "4px",
        "toolbar-height": "48px",
        gutter: "16px",
        "margin-mobile": "16px",
        "sidebar-width": "260px",
        "margin-desktop": "24px"
      },
      fontFamily: {
        "body-base": ["Geist"], "display-lg": ["Geist"], "headline-md": ["Geist"],
        "code-base": ["JetBrains Mono"], "code-sm": ["JetBrains Mono"],
        "label-caps": ["JetBrains Mono"], "body-sm": ["Geist"]
      },
      fontSize: {
        "body-base": ["14px", { lineHeight: "20px", fontWeight: "400" }],
        "display-lg": ["48px", { lineHeight: "56px", letterSpacing: "-0.02em", fontWeight: "700" }],
        "headline-md": ["24px", { lineHeight: "32px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "code-base": ["13px", { lineHeight: "22px", fontWeight: "400" }],
        "code-sm": ["11px", { lineHeight: "16px", fontWeight: "400" }],
        "label-caps": ["10px", { lineHeight: "12px", letterSpacing: "0.05em", fontWeight: "600" }],
        "body-sm": ["12px", { lineHeight: "18px", fontWeight: "400" }]
      }
    }
  }
};
`;
