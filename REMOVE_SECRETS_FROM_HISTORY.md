# Removing Leaked Secrets from Git History

## Option 1: BFG Repo-Cleaner (Recommended - Easier)

### Install BFG:
```bash
brew install bfg
```

### Create a file with secrets to remove:
```bash
# List the actual leaked secrets you need to remove
cat > passwords.txt << EOF
[LEAKED_PASSWORD_1]
[LEAKED_SECRET_KEY_1]
[LEAKED_SECRET_KEY_2]
[LEAKED_REDIS_PASSWORD]
[LEAKED_PROJECT_ID]
EOF
```

### Run BFG to clean history:
```bash
# Clone a fresh copy for safety
git clone --mirror https://github.com/Origin-Inc/rag-workspace-two.git rag-workspace-two-mirror
cd rag-workspace-two-mirror

# Remove secrets from all commits
bfg --replace-text ../passwords.txt

# Clean up
git reflog expire --expire=now --all && git gc --prune=now --aggressive

# Force push the cleaned history
git push --force
```

## Option 2: git filter-branch (Built-in but Complex)

```bash
# This rewrites history to remove ENV_ANALYSIS.md
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch ENV_ANALYSIS.md' \
  --prune-empty --tag-name-filter cat -- --all

# Force push
git push origin --force --all
git push origin --force --tags
```

## Option 3: GitHub's Secret Scanning (If Available)

1. Go to Settings → Security → Secret scanning
2. Review detected secrets
3. Mark as "Revoked" after rotating them

## Important Notes:

⚠️ **WARNING**: Rewriting history is destructive!
- All team members will need to re-clone the repo
- All open PRs will need to be recreated
- All forks will retain the old history

## After Cleaning:

1. **Rotate ALL exposed secrets immediately**
2. **Notify team members** to re-clone:
   ```bash
   git clone https://github.com/Origin-Inc/rag-workspace-two.git fresh-clone
   ```
3. **Monitor for unauthorized access** in:
   - Supabase dashboard
   - Vercel deployment logs
   - Redis connection logs

## Prevention Going Forward:

✅ GitLeaks pre-commit hook (already installed)
✅ Use environment variables only
✅ Never commit .env files
✅ Use placeholders in documentation
✅ Regular security audits with `gitleaks detect`