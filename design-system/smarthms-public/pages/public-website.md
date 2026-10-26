# Public website: applied design overrides

These decisions override the generated master recommendations for all public
routes. Staff and patient workspace styles are outside this scope.

- Direction: minimal hospital website with a split photographic hero, clear
  booking action, patient shortcuts, published directory, practical visit guide,
  FAQs, location/contact information, and a useful multi-column footer.
- Palette: deep teal #153e42 text, #087c70 primary actions, #075c54 hover/focus,
  #526767 supporting text, #f9fbf8 canvas, #edf5ef secondary surfaces, white cards.
  These replace the generated clinical-blue palette and meet text contrast needs.
- Typography: existing local/system sans with a fluid 42–70px hero, 28–42px
  section headings, 14–18px body copy and smaller supporting labels. Avoid a new
  remote font dependency. Sinhala and Tamil retain their existing font support.
- Layout: 1280px maximum content width, 40px desktop gutters, 20px phone gutters,
  20–24px card radii, 46px primary controls and 56–88px section spacing.
- Navigation: all public routes share a keyboard-operable menu below 760px,
  with an exposed expanded state and Escape returning focus to its toggle.
  Booking and portal buttons remain directly visible.
- Data: published hospital information and existing directory endpoints remain
  authoritative. Never invent staff, reviews, capacity, emergency services or
  opening hours. Reception hours do not imply clinician availability.
- Photography: use existing locally hosted assets with honest stock/location
  captions. Retain the gallery pause, next/previous and reduced-motion behavior.
- Responsive: three-column directories become two and then one; split content
  stacks on phones. All public routes must fit at 320, 375, 768, 1024 and 1440px
  in English, Sinhala and Tamil.
- Implementation: scoped `.public-redesign` tokens and rules in
  [PublicRedesign.css](../../../client/src/pages/PublicRedesign.css), with the
  shared navigation/footer in [PublicSite.jsx](../../../client/src/components/PublicSite.jsx).
