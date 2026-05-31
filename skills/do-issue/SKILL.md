---
name: do-issue
description: Read an issue description and start to implement it. Use when user ask you to start implementing a specific issue or work on the next issue.
---

If the user asked you to implement a specific issue by number, open that issue's description file in `./issues` (files start with the issue number).
If the user asked you to implement the next issue, list all files in `./issues` (they are ordered) and start with the first one marked as `ready-for-agent` in its head label. Just use `head` on the issue file to determine its status.

You are free to gather additional context from the repo. Avoid the `./prd` directory and any issues other than your current one in `./issues`.

Only implement this one issue.

Each issue has a set of acceptance criteria you need to fulfill in order for the issue to be marked as `implemented`.

When you're done with the issue mark it as `implemented` in `./issues`.

