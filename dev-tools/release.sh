#! /bin/bash

relative_directory = '/dev-tools'
# filename = 'last-tag.txt' 
repo = ${REPO}#set as GH Actions ENVVARS
owner = ${OWNER}

# TAG_NAME = $(< $relative_directory/$filename)
TAG_NAME = `date -d $1 +%s`#TAG_NAME + 1
curl \
  -X POST \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/$owner/$repo/releases \
  -d '{"tag_name":"v${TAG_NAME}"}'

# echo '$TAG_NAME' >  '$relative_directory/$filename'