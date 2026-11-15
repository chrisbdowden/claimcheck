<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.

<!-- LOVABLE:END -->

## Project rules

- The Python engine (via the ClaimCheck API at https://claimcheck-api.vercel.app) is the source of truth for detection, findings, AI review and accuracy. Why: the owner approved connecting this front end to the API.
- The browser engine (`src/lib/demo-engine.ts`) stays as an offline fallback only, used when the API is unreachable, and the UI must say so when it's in use. Why: the demo must still work without the API, but never silently.
- No API keys, secrets or tokens in this front end, ever. The API holds the AI key server-side. Why: security.
- Synthetic data only. `planted_issue` is an evaluation label; never use it for detection. Why: it's the answer key for accuracy scoring.
- No hard-coded KPI numbers: show what the API (or the fallback engine) returns. Why: displayed values must reconcile with the data source.
- Review statuses, notes and audit events stay in the browser (localStorage); the API is stateless. Why: the API has no persistence.
- Colors use semantic tokens in `src/styles.css`, including `--sev-high/medium/low`; severity always pairs color with an icon and label. Why: theming and accessibility.

- The shared store loads the API through TanStack Query after browser hydration and commits sample/analysis as one snapshot; policy refreshes retain that snapshot until successful. Why: never mix engines or show partial results.
- Persist the selected engine separately from a session-only API failure; active employee and evaluation data must follow the selected data source. Why: an outage must not permanently disable Python or mix datasets.
- Normalize fallback accuracy to the API evaluation shape in a browser-safe scoring adapter; return Python evaluation unchanged. Why: preserve server scores and row order without running browser scoring for Python.
- Explicit Python runs commit source lines and analysis together through the shared store; policy refreshes reuse that source and request versions prevent stale refreshes overwriting runs. Why: uploads, findings, employees, and evaluation must stay aligned across screens.
- Keep CSV validation browser-safe and preserve typed API validation errors without switching engines on 422. Why: users can correct rejected synthetic uploads without losing the previous Python snapshot.
- AI Review hands off the active source to Analysis via a typed one-shot AI search flag; API explanations use returned reasons and model metadata, not simulated templates. Why: reviewing an upload must not silently rerun the bundled dataset.
- Settings connection tests query public health independently of detection; selecting Python retries a failed initial request. Why: offline users can inspect connectivity and recover without persisting an outage or mixing datasets.
