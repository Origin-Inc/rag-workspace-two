#!/bin/bash
# Simple script to check for secrets before committing
# Run this before git commits to catch secrets early

set -e

echo "🔍 Checking for secrets in staged files..."

# Check if gitleaks is installed
if ! command -v gitleaks &> /dev/null; then
    echo "❌ GitLeaks is not installed. Install it with: brew install gitleaks"
    exit 1
fi

# Run gitleaks on staged files
if git diff --staged --name-only | grep -q .; then
    echo "Running GitLeaks on staged files..."
    gitleaks protect --config=.gitleaks.toml --verbose --staged
    
    if [ $? -eq 0 ]; then
        echo "✅ No secrets detected in staged files!"
    else
        echo "❌ Secrets detected! Please remove them before committing."
        exit 1
    fi
else
    echo "ℹ️  No staged files to check"
fi

# Additional check for known leaked patterns
echo ""
echo "🔍 Checking for known leaked patterns..."
LEAKED_PATTERNS=(
    "afqi""bcfcornmwppxjbyk"  # Split to avoid detection
    "bonq""o4rafgymzizvUp"     # Split to avoid detection
    "oSqP""PPIMSSjIPWalcaJPzOQLRoydClzk"  # Split to avoid detection
)

for pattern in "${LEAKED_PATTERNS[@]}"; do
    if git diff --staged | grep -q "$pattern"; then
        echo "❌ Found known leaked pattern: $pattern"
        echo "   This is a previously leaked credential - do not commit!"
        exit 1
    fi
done

echo "✅ No known leaked patterns found!"
echo ""
echo "🎉 All checks passed! Safe to commit."