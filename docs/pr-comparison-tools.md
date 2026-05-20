# Pull Request Comparison Tools Guide

A comprehensive guide to tools and techniques for comparing pull requests, helping maintainers choose the best contribution when multiple PRs address the same issue.

## Table of Contents

1. [GitHub Built-in Tools](#github-built-in-tools)
2. [CLI Tools](#cli-tools)
3. [Web-Based Tools](#web-based-tools)
4. [Best Practices](#best-practices)
5. [Comparison Checklist](#comparison-checklist)

---

## GitHub Built-in Tools

### 1. GitHub Compare View

**URL Format:** `https://github.com/OWNER/REPO/compare/base-branch...head-branch`

**Usage:**
```bash
# Compare two PRs
https://github.com/atharvnaik1/ipaship-audit/compare/main...user1:pr-branch-1
https://github.com/atharvnaik1/ipaship-audit/compare/main...user2:pr-branch-2
```

**Features:**
- Side-by-side diff view
- Commit history comparison
- File change statistics
- Merge conflict detection

### 2. GitHub CLI (`gh`)

**Install:**
```bash
# macOS
brew install gh

# Linux
sudo apt install gh

# Windows
winget install gh
```

**Compare PRs:**
```bash
# List all PRs for an issue
gh pr list --state open --json number,title,author,url

# View PR details
gh pr view 123

# Compare two PRs
gh pr diff 123
gh pr diff 456

# Check out PR locally
gh pr checkout 123
```

### 3. GitHub API

**List PRs for an issue:**
```bash
curl -H "Authorization: token YOUR_TOKEN" \
  "https://api.github.com/repos/atharvnaik1/ipaship-audit/pulls?state=open"
```

**Compare two PRs:**
```bash
# Get diff for PR #123
curl -H "Authorization: token YOUR_TOKEN" \
  "https://api.github.com/repos/atharvnaik1/ipaship-audit/pulls/123" \
  -H "Accept: application/vnd.github.v3.diff"
```

---

## CLI Tools

### 1. `diff` Command

**Compare two PR branches locally:**
```bash
# Clone repo
git clone https://github.com/atharvnaik1/ipaship-audit.git
cd ipaship-audit

# Fetch PR branches
git fetch origin pull/123/head:pr-123
git fetch origin pull/456/head:pr-456

# Compare branches
git diff pr-123..pr-456

# Compare specific files
git diff pr-123..pr-456 -- src/components/Button.tsx
```

### 2. `git diff` with Statistics

```bash
# Get diff statistics
git diff --stat pr-123..pr-456

# Get summary
git diff --summary pr-123..pr-456
```

### 3. `git log` Comparison

```bash
# Compare commit history
git log pr-123..pr-456 --oneline

# Show commits in PR-456 not in PR-123
git log pr-123..pr-456 --oneline

# Show commits in PR-123 not in PR-456
git log pr-456..pr-123 --oneline
```

### 4. `meld` (GUI Tool)

**Install:**
```bash
# Ubuntu/Debian
sudo apt install meld

# macOS
brew install meld
```

**Usage:**
```bash
# Compare two PR branches
meld pr-123 pr-456

# Compare specific directories
meld pr-123/src pr-456/src
```

---

## Web-Based Tools

### 1. GitHub Compare View

**Direct URL:**
```
https://github.com/atharvnaik1/ipaship-audit/compare/main...user1:pr-branch-1
```

### 2. GitHub Pull Request Comparator

**Chrome Extension:** [GitHub PR Comparator](https://chrome.google.com/webstore/detail/github-pr-comparator)

**Features:**
- Compare two PRs side-by-side
- Highlight differences
- Export comparison report

### 3. GitDuck

**URL:** https://gitduck.com

**Features:**
- Visual diff comparison
- Code review tools
- Collaboration features

### 4. Reviewable

**URL:** https://reviewable.io

**Features:**
- Advanced code review
- Multi-PR comparison
- Review tracking

---

## Best Practices

### When Comparing PRs

1. **Check Code Quality**
   - [ ] Code style consistency
   - [ ] Error handling
   - [ ] Test coverage
   - [ ] Documentation

2. **Review Functionality**
   - [ ] Does it solve the issue?
   - [ ] Edge cases handled?
   - [ ] Performance impact?
   - [ ] Security considerations?

3. **Evaluate Maintainability**
   - [ ] Code readability
   - [ ] Modularity
   - [ ] Future extensibility
   - [ ] Dependencies

4. **Consider Community**
   - [ ] Author responsiveness
   - [ ] Commit history
   - [ ] Previous contributions
   - [ ] Communication quality

### Comparison Workflow

```bash
# 1. Fetch all PRs
gh pr list --state open --json number,title,author

# 2. Check out each PR locally
gh pr checkout 123
gh pr checkout 456

# 3. Run tests on each
npm test

# 4. Compare diffs
git diff pr-123..pr-456

# 5. Review code quality
# Use linters, formatters, and static analysis

# 6. Document decision
# Create a comparison report
```

---

## Comparison Checklist

### Code Quality
- [ ] Follows project style guide
- [ ] No linting errors
- [ ] Proper error handling
- [ ] Adequate comments
- [ ] No code duplication

### Functionality
- [ ] Solves the issue completely
- [ ] Handles edge cases
- [ ] No regressions
- [ ] Performance acceptable
- [ ] Security reviewed

### Testing
- [ ] Unit tests included
- [ ] Integration tests pass
- [ ] Edge cases tested
- [ ] No test failures

### Documentation
- [ ] README updated
- [ ] Code comments
- [ ] API documentation
- [ ] Usage examples

### Maintainability
- [ ] Clean code structure
- [ ] Modular design
- [ ] Easy to understand
- [ ] Future-proof

---

## Quick Comparison Script

```bash
#!/bin/bash
# compare-prs.sh - Compare two PRs

REPO="atharvnaik1/ipaship-audit"
PR1=$1
PR2=$2

echo "Comparing PR #$PR1 and PR #$PR2"

# Fetch PRs
gh pr checkout $PR1
git stash
gh pr checkout $PR2

# Compare
echo "=== Diff Statistics ==="
git diff pr-$PR1..pr-$PR2 --stat

echo "=== Code Changes ==="
git diff pr-$PR1..pr-$PR2

echo "=== Commit History ==="
git log pr-$PR1..pr-$PR2 --oneline
```

---

## Resources

- [GitHub CLI Documentation](https://cli.github.com/)
- [GitHub Compare View](https://docs.github.com/en/github/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-comparing-branches-in-pull-requests)
- [Git Diff Documentation](https://git-scm.com/docs/git-diff)
- [Code Review Best Practices](https://google.github.io/eng-practices/review/)

---

*Contributed by @iyop666 — Closes #150*
