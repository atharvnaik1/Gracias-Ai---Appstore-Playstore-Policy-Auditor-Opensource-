#!/bin/bash
# Linux Bash wrapper for ipaship.com
FILE_PATH=$1
API_KEY=$2

if [ -z "$FILE_PATH" ]; then
    echo "Usage: $0 <file-path> [api-key]"
    exit 1
fi

echo "Auditing $FILE_PATH via ipaship.com..."
# curl -X POST https://ipaship.com/api/audit -F "file=@$FILE_PATH" -H "Authorization: Bearer $API_KEY"
