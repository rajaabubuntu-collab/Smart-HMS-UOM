# Shared visual theme

`client/src/theme.css` defines the Smart HMS identity using the login page's violet actions, indigo/purple/teal story gradient, pale backgrounds and glass surfaces. It is imported last in `main.jsx` so shared controls remain consistent across public pages and all role dashboards.

Use `--hms-brand`, `--hms-brand-dark`, `--hms-ink`, `--hms-muted`, `--hms-border`, `--hms-soft` and the surface/radius tokens for new UI. Existing `--green` and homepage `--color-*` variables are compatibility aliases. The patient overview keeps its layout but uses the same identity. Charts and scrollbars also use the shared tokens.

Keep error, warning, success and clinical status colours meaningful rather than converting them to brand purple. Clinical records remain opaque. Solid-surface mode, reduced transparency, high contrast, reduced motion and print styling must remain usable. Public entrance animations use movement without fading text, maintaining contrast throughout the animation.
