---
name: do-issue
description: Read a ticket description and start to implement it. Use when user ask you to start implementing a specific ticket or work on the next ticket.
---

If the user asked you to implement a specific ticket by number, open that ticket's description file in `./tickets` (files start with the ticket number).
If the user asked you to implement the next ticket, list all files in `./tickets` (they are ordered) and start with the first one marked as `ready-for-agent` in its head label. Just use `head` on the ticket file to determine its status.

You are free to gather additional context from the repo. Avoid the `./spec` directory and any tickets other than your current one in `./tickets`.

Only implement this one ticket.

Each ticket has a set of acceptance criteria you need to fulfill in order for the ticket to be marked as `implemented`.

When you're done with the ticket mark it as `implemented` in `./tickets`.

