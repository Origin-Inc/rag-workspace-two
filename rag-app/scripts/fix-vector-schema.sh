#!/bin/bash

# Script to fix vector type references to use extensions schema
# This fixes the "ERROR: type vector does not exist" issue in production

echo "Fixing vector type references to use extensions schema..."

# Find all TypeScript files with vector type casts
FILES=$(grep -r "::vector\|::halfvec" app/services/ --include="*.ts" --include="*.tsx" | grep -v "extensions.vector" | cut -d: -f1 | sort | uniq)

for FILE in $FILES; do
    echo "Processing: $FILE"
    
    # Backup the file
    cp "$FILE" "$FILE.bak"
    
    # Replace ::vector with ::extensions.vector
    # Replace ::halfvec with ::extensions.halfvec
    sed -i '' 's/::vector(/)::extensions.vector(/g' "$FILE"
    sed -i '' 's/::vector)/)::extensions.vector)/g' "$FILE"
    sed -i '' 's/::vector\b/)::extensions.vector/g' "$FILE"
    sed -i '' 's/::halfvec(/)::extensions.halfvec(/g' "$FILE"
    sed -i '' 's/::halfvec)/)::extensions.halfvec)/g' "$FILE"
    sed -i '' 's/::halfvec\b/)::extensions.halfvec/g' "$FILE"
    
    # Show the changes
    if diff -q "$FILE.bak" "$FILE" > /dev/null; then
        echo "  No changes needed"
        rm "$FILE.bak"
    else
        echo "  Updated vector type references"
        # Keep backup for safety
    fi
done

echo "Done! Review the changes and remove .bak files when satisfied."