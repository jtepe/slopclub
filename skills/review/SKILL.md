---
name: review
description: Review code changes from a range of commits. The user provides the scope and purpose of the change. Use when asked to review codes changes.
license: Apache-2.0
metadata:
  author: Jonas Tepe
  version: 0.2.0
---

# Code Review Guide

## Prerequisites

Ensure the following is provided by the user. If any is lacking, ask the user to provide the missing information. Refuse to review if the information is not provided.

* __Description Of The Change__: A ticket/issue number, or, lacking that, a description of the purpose of the change. In case of a ticket/issue number, use existing tooling to retrieve it.
                                 Tooling depends on the format of the issue/ticket.
* __Range Of Commits__: The user provides a range of commits that encompass the change.
* __User Understanding__: The User must know the objective of the change on a non-technical level and must describe it in their own words.


## Review Process

The review must be performed in distinct *phases*.


### Phase 1: Knowledge Gathering.

The description of the change gives you the purpose, but to properly review the change you need to gather more information. This goes further than just the files touched by the change and the diff. Changes in a system also influence logic in
other parts of it. Look how the data flows through the programm and ends up in code paths touched by the change. Build a callgraph that you can refer back to. See if you can spot invariants that must be upheld. Look at tests.
If you find an issue with code not touched by the change, mark it and report it later in phase 3.
While reviewing, don't run the code or test suites. Ask the user if this is necessary, but explain why. If you want to validate an assumption or possible issue, you are free to write a proof-of-concept test for it and execute it.


### Phase 2: Review

Once you think you gathered enough information, review the code according to the following *criteria*. Treat each criteria independently. The criteria are listed from highest priority to lowest priority. 
* __Purpose__: Does the change completely solve the problem from the issue description.
* __Security__: The change must not introduce security issues or weaken the security of the overall system.
* __Stability__: The change does not negatively affect the stability of the software when running. I.e. during runtime the software remains available, reliable, and does not consume more resources.
* __Maintainability__: Clear design and architecture based on software architecture principles. Other developers can maintain the code without asking the author of the change.
* __Simplicity__: Low complexity code change. It is easy to see what the code does and why. I.e. clear naming, the cyclomatic complexity is minimal without *clever hacks* or premature abstractions.
* __Best practices__: Is the change using best practices according to the language and libraries used. Rely solely of your trained knowledge or best practices established in the project's documentation.
                      Don't lookup best practices somewhere else.
* __Test coverage__: Where possible, the changed code is tested with full coverage.

For each criteria if you have a finding, *rank* it in one of three categories:
* __Low__: Minor finding or nitpick. A strict reviewer might call this out or when training a junior developer to give advice. On its own, the finding is worth a note, but can also be left uncommented.
* __Medium__: Introduces unnecessary complexity, missed test coverage, non-obvious behaviour, problems in edge-cases, or violates best-practices. Can be left as is but needs a discussion. In general, it __should__ be changed.
* __High__: Real problem. Fails purpose of the change. Breaks existing behaviour or causes a regression. Introduces a security problem. Can cause stability issues. Introduces too much complexity and can be done in a simpler way.


### Phase 3: Report

The final report must list each review category separately. For each category present your findings from low to high. A finding should be in the following format:
```
[rank]: SHORT DESCRIPTION
FULL DESCRIPTION
````
Where `rank` is the rank (low, medium, high). `SHORT DESCRIPTION` names the finding in a short sentence.
`FULL DESCRIPTION` describes the finding in multiple sentences, clearly describing where the problem is, why it is a problem, and, if possible, how it can be solved in your opinion. The full description should be understandable and give proper
context.

Finally, give a short judgement how well the issue/ticket or user description from the review prerequisites matches what was implemented by the change.
