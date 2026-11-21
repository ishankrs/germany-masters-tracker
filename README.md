# Germany Master's Tracker

A small site that lists English-taught computer science and data science master's programmes at public universities in Germany, with requirements, deadlines, fees and sources, plus a tracker for two people (Ishan and Riya): a list of applications, notes, tasks, and a rough check of each programme against the profile.

No build step. Plain HTML, CSS and JavaScript, and one Cloudflare Pages Function that stores the two profiles.

## What is in this repository

- `index.html`, `assets/` – the site.
- `data/programmes.js`, `data/universities.js` – the public database (213 programmes, 268 institutions). General facts only.
- `functions/api/profile/[id].js` – saves and loads the two profiles in Cloudflare KV, behind a passcode.

No personal data is in the repository. Profiles live in Cloudflare KV. Files ending in `.private.json` are ignored by git; keep exports out of the repository.

## Deploy on Cloudflare Pages

1. Push this folder to GitHub (for example `github.com/ishankrs/germany-masters-tracker`).
2. In the Cloudflare dashboard: Workers & Pages → Create → Pages → Connect to Git → choose the repository. Framework preset: None. Build command: leave empty. Build output directory: `/`.
3. Storage & Databases → KV → create a namespace (any name, for example `tracker`).
4. In the Pages project: Settings → Bindings → Add → KV namespace. Variable name `TRACKER_KV`, namespace the one from step 3.
5. Settings → Variables and Secrets → Add. Type Secret, name `PASSCODE`, value a passcode you choose.
6. Deployments → Retry deployment, so the new settings take effect.

Open the site, enter the passcode once per device, and pick a profile in the sidebar. To load an existing profile file, go to Profile and data → Import a profile file.

Without steps 3 to 5 the site still shows the database, but profile changes are not saved.

## Things to know

- Anyone with the link can read the programme database. Only people with the passcode can read or change the two profiles.
- If the same profile is edited on two devices at once, the last save wins.
- The data was collected on 21 November 2026. Many deadlines are the usual yearly dates and not confirmed for the cycle. Check the university page before relying on anything.
- The quick check matches keywords in the requirement text (GRE or GATE, German level, work experience, grade limit). It can be wrong in both directions.

## Run locally

`npx wrangler pages dev . --kv TRACKER_KV --binding PASSCODE=test` then open the printed address. Opening `index.html` directly also works, without saving.
