#!/usr/bin/env bash

for SOURCE in "$@"
do
  TARGET="${SOURCE%.*}.json"
  yarn pbjs -t json ${SOURCE} -o ${TARGET}
done
