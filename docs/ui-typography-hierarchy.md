# UI typography and copy hierarchy

Use the existing type scale by semantic role. Do not use visual style alone to imply meaning.

| Role | Preferred treatment | Typical use |
| --- | --- | --- |
| Page title | Body font, 32–48px, weight 700–800 | One `h1` per page |
| Section heading | Body font, 18–24px, weight 600–700 | Card and workflow headings |
| Body | Body font, 16px, weight 400 | Essential explanation |
| Field label | Body font, 14px, weight 500 | Form labels and definition terms |
| Metadata | Body font, 14px, weight 400, muted color | Game titles and secondary identifiers |
| Helper/caption | Body font, 12px, weight 400, muted color | Short contextual help and explanations |
| Data value | `data-mono`, weight 500 | Amounts, addresses, IDs, timestamps |
| Status/badge | `label-caps` | Compact state indicators only |
| Action | `label-caps` for compact primary/secondary controls | Buttons and short action links |
| Warning/error | Sentence case body text; `label-caps` only for a short warning eyebrow | Recovery and irreversible actions |

## Copy rules

- Lead with the current state and next action.
- Keep persistent helper text to one short sentence.
- Put optional education in the accessible Guidelines dialog.
- Show recovery instructions only when the matching error or pending state occurs.
- Keep fees, wallet signing, irreversible actions, and security limitations visible when relevant.
- Prefer user-facing outcomes over protocol implementation details.

## Journey audit

- Tournament list: bento summaries separate labels, values, and statuses.
- Tournament creation: sentence-case field labels and shortened draft, deadline, payout, and review help.
- Tournament detail/join: bento sections, concise wallet copy, and Guidelines for optional education.
- Settlement/referee: sentence-case workflow headings, concise assignment help, visible irreversible-action warning.
- Refund: status, progress, amount, and claim action remain distinct; wallet warning stays visible.
- Authentication: sentence-case field labels; branded eyebrow and primary action remain compact caps.
- Admin: data tables retain compact column labels; page and section headings use the body hierarchy.
