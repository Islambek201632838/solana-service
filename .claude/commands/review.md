Perform a comprehensive code review of the current changes in this project.

## Step 1: Gather Changes

Run `git diff` and `git diff --cached` to see all unstaged and staged changes. Also run `git status` to see new untracked files. If there are no changes, review the files most recently modified (use `git log --oneline -5 --name-only`).

## Step 2: Review by Category

For EACH changed file, analyze and report findings organized by severity:

### CRITICAL (must fix before merge)
- **Security vulnerabilities**: command injection, XSS, SQL injection, exposed secrets/keys
- **Solana/Anchor**: missing signer checks, missing `has_one`/`seeds` constraints, unchecked account ownership, missing `#[account(mut)]` where needed, PDA seed collisions
- **Math overflow**: missing `checked_add`/`checked_sub`/`checked_mul` in Rust, integer overflow in any language
- **Fund safety**: any path where tokens/SOL can be drained, locked, or sent to wrong address
- **Python async**: blocking calls inside async functions (requests instead of aiohttp, time.sleep instead of asyncio.sleep)

### WARNING (should fix, affects quality)
- **Solana/Anchor**: missing events (emit!), redundant account reads, inefficient CPI calls, large account sizes
- **Python**: bare except clauses, mutable default arguments, missing await on coroutines, unhandled exceptions in async tasks
- **TypeScript/React**: missing error boundaries, unhandled promise rejections, memory leaks (missing cleanup in useEffect)
- **Performance**: N+1 queries, unnecessary allocations, missing caching where obvious, O(n^2) where O(n) is possible
- **Error handling**: swallowed errors, generic error messages, missing input validation at boundaries

### INFO (suggestions, best practices)
- Code style inconsistencies
- Missing type annotations where they'd help readability
- Opportunities for simplification
- Dead code or unused imports
- Missing tests for new logic

## Step 3: Solana-Specific Checklist

For any Rust/Anchor code, explicitly check:
- [ ] Every instruction has proper `#[derive(Accounts)]` with constraints
- [ ] All PDAs use correct seeds and bumps
- [ ] `has_one` used where account relationships must be enforced
- [ ] All math uses checked operations (no raw +, -, *, /)
- [ ] Signer checks present for privileged operations
- [ ] Events emitted for state changes
- [ ] Account close attacks prevented (if closing accounts)
- [ ] Reinitialization attacks prevented (init vs init_if_needed)

## Step 4: Python Async Checklist

For any Python async code, check:
- [ ] No blocking I/O in async functions
- [ ] `asyncio.gather` used for independent parallel operations
- [ ] CPU-bound work offloaded to `ThreadPoolExecutor`
- [ ] Proper exception handling in `asyncio.gather` (return_exceptions)
- [ ] aiohttp sessions properly closed
- [ ] No shared mutable state between coroutines without locks

## Step 5: Summary

End with a summary table:

```
Severity  | Count | Files Affected
----------|-------|---------------
CRITICAL  |   X   | file1.rs, file2.py
WARNING   |   X   | file3.ts
INFO      |   X   | file4.py
```

And an overall verdict: PASS (no criticals), WARN (has warnings), or BLOCK (has criticals).
