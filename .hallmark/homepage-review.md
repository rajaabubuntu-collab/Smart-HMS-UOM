# Smart HMS homepage redesign

Scope: `/` only. Existing dashboards and secondary public pages retain their styling. Existing uncommitted work was preserved; the pre-redesign diff is in `.local/hallmark-backup/pre-homepage.patch`.

Teal/white surfaces, Manrope headings (locally hosted under OFL), consistent controls, doctor directory promoted, asymmetric image gallery, portal services in rows, compact mobile navigation. Existing real data, links, gallery controls and language switching retained. Map defaults to a compact directions panel with an optional interactive map; Google Maps remains a third-party service and its external link is always available.

## Verification

- Hallmark: 0 Floor failures and 0 open Reflex findings. Two documented exceptions retain compact utility sections and the honest live-directory empty state.
- Recorded links 24/24, field 1/1, headings 35/35 preserved.
- Public and workspace browser suite: 12 passed. New mobile keyboard, accessibility, three-language and route-isolation test: passed. After the map revision, all 9 public/homepage tests passed again.
- Lint, translation key/placeholder checks and production build passed. Existing bundle-size advisory remains.
- Hero review: mobile header reduced and inherited glass button styling corrected. Finish review: blank map panel replaced with a disclosure and persistent directions link.
- Comparison: `.hallmark/compare.html`; screenshots in `.hallmark/shots/`.

## Copy and material

Hero lead changed from “Get to know the hospital, explore our departments and find practical information for your visit.” to “Find your doctor, plan your visit and manage your care.” Published hospital descriptions remain in the hospital-information section. Book appointment is now the hero primary action; About our hospital remains a link. Redundant kicker labels are visually suppressed on the homepage. No testimonials, clinical claims or statistics were added.

Existing illustrative photographs remain labelled; source credits stay in `docs/photo-sources.md` in accordance with the owner's earlier request. No new stock photos were selected. Replace the hero with an approved hospital exterior (landscape, ideally 1600px or wider), the reception image with actual reception, and the care pictures with consented hospital activity photos when available. The exterior photo is the most valuable next asset. Image selections remain in HospitalHeroGallery.jsx and HospitalCareSections.jsx.
