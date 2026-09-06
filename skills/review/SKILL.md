---
name: review
description: Review code changes from a range of commits. The purpose of the change comes from an issue/ticket or a description provided by the user. Use when asked to review codes changes.
license: Apache-2.0
metadata:
  author: Jonas Tepe
  version: 0.2.0
---

# Code Review Guide

## Prerequisites

Ensure the following is provided by the user. If any is lacking, ask the user to provide the missing information. Refuse to review if the information is not provided.

* __Description Of The Change__: The user provided a ticket/issue number, or, lacking that, a description of the purpose of the change. In case of a ticket/issue number, use existing tooling to retrieve it.
                                 Tooling depends on the format of the issue/ticket.
* __Range Of Commits__: The user provides a range of commits that encompass the change.
* __User Understanding__: The User must know the objective of the change on a non-technical level. Ensure the user does know by asking a question prompting the user to describe the change in their own words.


## Review Process
The review must be performed in distinct *phases*.


### Phase 1: Knowledge Gathering.

The description of the change gives you the purpose, but to properly review the change you need to gather more information. Not only does this encompass the changed source code from the commits, but also auxilliary code not touched
by the change. Look how the data flows through the programm and ends up in code paths touched by the change. Built a callgraph that you can refer back to. See if you can spot invariants that must be upheld. Look at tests.
If you find an issue with code not touched by the change, mark it and report it later in phase 3.
While reviewing, don't run the code or test suites. Ask the user if this is necessary, but explain why. If you want to validate an assumption or possible issue, you are free to write a proof-of-concept test for it and execute it.


### Phase 2: Review

Review the code according to the following *criteria* independently. Criteria are listed from highest priority to lowest priority. 
* __Purpose__: Does the change completely solve the problem from the issue description.
* __Security__: No security problems must be introduced.
* __Stability__: The change does not negatively affect the stability of the software when running. I.e. during runtime the software remains available, reliable, and does not consume more resources.
* __Maintainability__: Clear design and architecture based on software architecture principles. Other developers can maintain the code without asking the author of the change.
* __Simplicity__: Low complexity code change. It is easy to see what the code does and why. I.e. clear naming, the cyclomatic complexity is minimal without *clever hacks* or premature abstraction.
* __Best practices__: Is the change using best practices according to the language and libraries used. If you know the best practices from your training. If you don't know them, do not go looking by using web search
                      but use software development common sense.
* __Test coverage__: Where possible, the changed code is tested for all possible cases.

For each criteria a finding must be *ranked* as
* __Low__: Minor finding or nitpick. A strict reviewer might call this out or when training a junior developer to give advice. On its own, the finding is worth a note, but can also be left uncommented.
* __Medium__: Introduces unnecessary complexity, missed test coverage, non-obvious behaviour, problems in edge-cases, violates best-practices. Can be left as is but needs clarification, possibly a source code comment. __Should__ be changed.
* __High__: Real problem. Fails purpose of the change. Breaks existing behaviour or causes a regression. Introduces a security problem. Can cause stability issues. Introduces too much complexity and can be done in a simpler way.


### Phase 3: Report

The final report must list each review category separately. For each category present your findings from low to high. A finding should be in the following format:
```
[rank]: <short description>
Full description
````
Where `rank` is the rank (low, medium, high). The rank must be colored with `low` in green, `medium` in yellow, and `high` in red. `<short description>` names the finding in a short sentence.
`Full description` describes the finding in multiple sentences, clearly describing where the problem is, why it is a problem, and, if possible, how it can be solved in you opinion.
Finally, give a short judgement how well the issue/ticket or user description from the review prerequisites matches what was implemented by the change.
