# SmartHMS dashboard design

## Direction

Use a minimal, grid-based operational workspace with clear hierarchy, restrained
color, readable figures and immediately available actions. The ui-ux-pro-max
`hospital operational dashboard` search returned **Minimalism & Swiss Style**,
which fits this product. Its marketing-page structure does not apply to this
authenticated workspace. Retain the existing SmartHMS brand palette and system
font instead of introducing unrelated colors or a remote font dependency.

## Tokens

Use the shared tokens in `client/src/theme.css`:

- Primary: `--hms-brand`; deep accent: `--hms-brand-dark`.
- Text: `--hms-ink`; secondary text: `--hms-muted`.
- Border: `--hms-border`; focus: `--hms-focus`.
- Soft accents: `--hms-soft`, `--hms-metric-mint`, `--hms-secondary`.
- Data surfaces: opaque white, 16px radius, restrained shadow.
- Spacing: 4px rhythm; 12–20px card gaps, 20–24px card padding, 28px sections.
- Typography: existing system sans; 30–34px tabular metrics, 17px section headings,
  13–14px body copy and 12px supporting labels.

## Staff overview

Order content as welcome/date, primary task, registered-record metrics (admin),
appointment counts and upcoming visits, role shortcuts, analytics, profile/account.
All counts come from existing APIs; never imply changes, growth or capacity from
unrelated totals. Chart period, scope and data tables remain visible and usable.

Admin shortcuts lead to care team, departments, reports and billing. Doctor
shortcuts lead to queue, schedules and appointments. Reception shortcuts lead to
patients, bookings, appointments and billing. Preserve role authorization.

## Responsive and accessible behavior

Four metric columns become two; the appointment/shortcut columns stack below
1050px. Below 600px appointment counts use full-width rows, appointments wrap
their status, and quick actions stack. Keep the existing mobile navigation.

Use semantic links, visible keyboard focus, descriptive text beside decorative
Lucide icons, 44px primary controls, textual statuses, and reduced-motion support.
Preserve English, Sinhala and Tamil support. The patient dashboard keeps its
existing personal totals and appointment calendar.
