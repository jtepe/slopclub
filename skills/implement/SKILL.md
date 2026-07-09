---
name: implement
description: Implement a piece of work based on a spec or a set of tickets. Use when the user asks you to implement a spec, a specific ticket, or the next ready ticket.
---

Implement the work described by the user — either a spec under `./spec`, or one or more tickets under `./tickets`.

## Pick the work

- If the user named a spec, implement it directly.
- If the user asked you to implement a specific ticket by number, open that ticket's description file in `./tickets` (files start with the ticket number).
- If the user asked you to implement the next ticket, list all files in `./tickets` (they are ordered) and start with the first one marked as `ready-for-agent` in its head label. Just use `head` on the ticket file to determine its status.

When working from tickets, only implement one ticket at a time. You are free to gather additional context from the repo, but avoid the `./spec` directory and any tickets other than your current one in `./tickets`.

Each ticket has a set of acceptance criteria you need to fulfill in order for the ticket to be marked as `implemented`.

## Implement

Use `tdd` where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use `code-review` to review the work.

## Wrap up

When you're done with a ticket and it's reviewed, mark it as `implemented` in `./tickets`. Do NOT close or modify any parent ticket.

Commit your work to the current branch.
