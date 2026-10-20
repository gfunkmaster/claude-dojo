---
name: release-notes
description: Writes release notes for a version from a list of commits or changes. Use when asked for release notes, a changelog entry, or "what's new" for a version.
---

# Release notes

Write `RELEASE_NOTES.md` from the changes you are given, in exactly this format:

```markdown
# <version>

## Nyheter
- <what the user can now do, in Swedish> (#<pr>)

## Fixar
- <what was broken and now works, in Swedish> (#<pr>)
```

- `feat:` goes under Nyheter, `fix:` under Fixar.
- Skip `chore:`, `ci:`, `test:`, `refactor:` and version bumps entirely.
- One line per change, written for users, ending with the PR number in parentheses.
- Leave out a section that would be empty.
