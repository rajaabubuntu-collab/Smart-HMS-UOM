# Public website photography

The public homepage now uses the following downloaded stock photographs. All three source pages explicitly identify the images as free under the [Unsplash License](https://unsplash.com/license), checked on 15 October 2026. This licence allows free commercial and non-commercial use; the images are licensed, not public domain. Photographer/source records are kept in this file and [the complete source register](../../../docs/photo-sources.md). The public interface retains concise illustrative-image captions without photographer links or an expandable credits section.

| Local asset          | Photographer     | Source                                                                                                      | Download source                                                                                        |
| -------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `care-stock.webp`    | Sasun Bughdaryan | [Clinician with stethoscope](https://unsplash.com/photos/doctor-in-white-coat-with-stethoscope-RlIppR1I3E8) | `https://images.unsplash.com/photo-1625134673337-519d4d10b313?auto=format&fit=max&fm=webp&q=82&w=1600` |
| `waiting-stock.webp` | Tasha Kostyuk    | [Hospital corridor](https://unsplash.com/photos/empty-hospital-corridor-with-benches-and-doors-Pk-KuizxQv8) | `https://images.unsplash.com/photo-1777269749032-d8d458ae594d?auto=format&fit=max&fm=webp&q=82&w=1600` |
| `colombo-stock.webp` | Zoshua Colah     | [Colombo cityscape](https://unsplash.com/photos/cityscape-view-with-buildings-and-overcast-sky-TRQ04e-B-yI) | `https://images.unsplash.com/photo-1742277712561-2cfe3422bdf7?auto=format&fit=max&fm=webp&q=82&w=1600` |

Downloaded as optimised WebP files, hosted locally, with no runtime image-service requests. Healthcare images illustrate the website and do not depict Smart HMS staff or facilities. The Colombo photograph represents the city, not the hospital address. No photographer or depicted person/business is presented as endorsing Smart HMS. No identifiable patient portraits are used.

## Regional content sources and publication boundaries

- [1990 Suwa Seriya official FAQ](https://www.1990.lk/faq/), checked on 15 October 2026: toll-free 1990, free pre-hospital emergency ambulance service. Presented separately from the hospital, without promising response times or transport to Smart HMS.
- Name, address, reception telephone, email and hours come from `/api/public/hospital`; reception hours appear once as a 24/7 summary when all seven published days are explicitly all-day and not closed. Other schedules retain their day-by-day hours.
- Doctor/department previews use the existing public APIs and show only approved entries. There are explicit loading, error and unpublished states. No private drafts are published by this change.
- Maps links search the published address, with a visible request to confirm the entrance. No exact building coordinates, parking, transport route, clinical capability, insurer acceptance or staff language proficiency is asserted.
- Poya/public-holiday copy asks visitors to confirm clinic sessions; no holiday calendar or assumed closure is used.

## Earlier concept illustrations (retained, no longer used on the homepage)

These fictional architectural concepts were generated using the built-in imagegen tool on 15 October 2026. They do not depict Smart HMS premises or establish the availability of any facilities. The public page labels both images as illustrations. Replace them with approved hospital photographs when available, updating alternative text and captions at the same time.

Assets: `hospital-exterior.webp` and `hospital-reception.webp`. Original generated PNGs were converted to WebP at their original 1536 × 1024 dimensions for delivery. Both assets are stored in this project; no external image service is needed.

## Exterior prompt

Use case: stylized-concept. Create a premium architectural illustration for a Sri Lankan hospital website hero: a fictional modern medium-sized hospital in tropical Colombo, welcoming covered entrance, white stone and aqua glass facade, lush palms and planting, warm morning light, elegant architectural visualization with subtly painterly finish, believable modest scale, landscape 3:2 composition, entire building and garden visible. No text, no signage, no logos, no ambulance, no identifiable people. This is an illustrative concept, not a depiction of a real hospital.

## Reception prompt

Use case: stylized-concept. Create an elegant architectural interior illustration for a hospital website: fictional bright welcoming hospital reception and waiting lounge, curved light timber reception desk, comfortable teal seating, lush indoor plants, cream stone, tall windows facing tropical greenery, warm daylight, refined architectural visualization with subtly painterly finish. Wide landscape 3:2 composition. Empty interior, no people, no text, no signage, no logos, no medical equipment. Illustrative concept, not an actual hospital photograph.

## Additional hospital photography — 16 October 2026

Three additional real stock photographs are used in the homepage and About page care-information cards. Each source page explicitly identifies its photo as free under the Unsplash License. These are illustrative photographs, not photographs of Smart HMS premises, and do not establish availability of inpatient beds or equipment.

| Local asset               | Photographer                 | Source                                                                                                                 | Download source                                                                                        |
| ------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `consultation-stock.webp` | Hush Naidoo Jade Photography | [Stethoscope](https://unsplash.com/photos/black-and-gray-stethoscope-yo01Z-9HQAw)                                      | `https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=max&fm=webp&q=80&w=1200` |
| `lounge-stock.webp`       | Sixteen Miles Out            | [Medical waiting area](https://unsplash.com/photos/a-room-with-a-lot-of-windows-and-chairs-7BxQRsH3f0c)                | `https://images.unsplash.com/photo-1732376800645-c066f9e283e8?auto=format&fit=max&fm=webp&q=80&w=1200` |
| `room-stock.webp`         | Annie Spratt                 | [Hospital bedside equipment](https://unsplash.com/photos/a-hospital-room-with-a-bed-and-medical-equipment-RfanFy_lHp8) | `https://images.unsplash.com/photo-1648224394432-8830fec15349?auto=format&fit=max&fm=webp&q=80&w=1200` |

These images are served locally as WebP with explicit dimensions and lazy loading. No identifiable patients appear. The additional About information uses published hospital name/address/phone/email and existing appointment, billing and enquiry workflows. Access assistance and language support are questions for reception, not promises of available facilities. No accreditation, staff count, hospital history, clinical outcomes or medical service is invented.
