# Self-Hosted automomo Experiment

Date: 2026-04-21

The automomo repository can later become the first real experiment codebase for
automomo itself.

## Experiment Shape

```text
automomo codebase
  -> automomo development room
      -> room-scoped work items
      -> agents assigned to the room
      -> local machine runtime pointing at this repo
      -> humans steer through messages or direct file edits
      -> sessions produce events and outcomes
```

## Success Questions

- Can room messages carry enough intent for agents to coordinate?
- Do room-scoped work items make progress clear from both room and global views?
- Does the local runtime preserve enough repository context?
- Can humans steer mostly through messages and file edits instead of complex
  controls?
- Do handoffs, events, and outcomes provide enough audit trail for codebase
  work?

## First Experiment Setup

- Codebase: this repository.
- Room: `automomo development`.
- Runtime: local Pi runtime with `workspaceRoot` set to this repo.
- Agents: one planning/review agent and one implementation agent.
- Work items: small product/API/UI/runtime changes from the automomo backlog.
