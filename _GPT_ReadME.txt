GPT prompt to get up to speed

MEAL PLANNER PROJECT CONTEXT
Stack

Next.js App Router

React (client/server components)

Supabase (Postgres + auth)

Vercel (auto deploy from GitHub main branch)

TypeScript

Minimal styling (inline styles, not Tailwind-heavy)

Database Structure (Core Tables)

households

household_members

recipes

recipe_items

ingredients

plan_weeks

plan_entries

Important:

plan_entries.meal is a Postgres ENUM:
breakfast | lunch | dinner | snack

Per-person meals stored using:

meal = enum-safe value

notes = "charlie" | "lucy"

Key Architecture Decisions

Dinner = shared

Breakfast/lunch/snack = per person

No schema redesigns unless absolutely required

Prefer minimal diffs

Prefer full-file overwrites when editing

Avoid large refactors unless requested

Mobile-first UX improvements

Avoid unnecessary modals / heavy UI components

Current Behaviour

Weekly planner persists meals to DB

Shopping list aggregates persisted meals

Inline ingredient picker (custom dropdown, no datalist)

Recipe ingredient rows wrap properly on mobile

Soft refresh pattern to avoid scroll reset

Vercel auto deploy from main

Coding Preferences

Be concise

One step at a time

No overengineering

Avoid unnecessary abstraction

Production-minded changes only

Provide full file overwrites when editing

End of context.

🔹 Why This Works

A new GPT instance does NOT need:

Your entire file tree

Every past bug

Every commit

Every state transition

It needs:

The stack

The constraints

The conventions

The current mental model

That’s it.

🔹 Optional: Even More Powerful

If you want to go up a level:

Create a /PROJECT_CONTEXT.md in your repo with that exact block.

Then in new chats you can paste:

“Use the PROJECT_CONTEXT.md mental model for this app. We are modifying the recipe detail page.”

That gives continuity without re-explaining every time.

🔹 What NOT To Do

Do not:

Paste 1,000 lines of code blindly

Explain every past bug

Try to reconstruct the entire development history

That wastes tokens and reduces clarity.

🔹 Advanced Move (If You Want Elite Workflow)

If this project grows, create:

/docs/ARCHITECTURE.md
/docs/DATABASE.md
/docs/CONVENTIONS.md

Then any new GPT session becomes instantly competent.

You’re now thinking like someone building a real product, not just hacking a weekend project.

If you want, I can help you design a clean v1 architecture doc for the repo that future-you (or future hires) can understand in 5 minutes.