# LOOT DEPARTMENT X Planner

A separate, static X content-planning page for the LOOT DEPARTMENT website.

## Open
After the repository's GitHub Pages site updates, visit:

`https://lootdepartment.github.io/LOOT-DEPARTMENT/x-planner/`

If the site uses a custom domain, use `/x-planner/` on that domain instead.

## Included
- Overview and content counts
- X content planner with drafts and scheduled planning records
- Content brief builder aligned to LOOT DEPARTMENT pillars and voice
- Scheduled, draft and published lists
- Editable brand strategy
- Browser-local persistence and JSON export

## Important limitations
- This is a planning workspace, not an X integration. It does not connect to X, schedule posts with X, or publish automatically.
- Data is stored in the current browser using localStorage. It is not shared across browsers or team members.
- The content brief builder is a structured prompt helper, not a connected AI generation endpoint.
- Do not store API keys or secrets in this static page.

For production multi-user sync and server-side AI generation, connect a backend (for example Supabase + a server-side AI API route) and add authentication/RLS before inviting staff.
