#!/bin/bash

# git clone https://github.com/emscripten-core/emsdk.git
# (cd ./emsdk && emsdk install 4.0.5)
# (cd ./emsdk && emsdk activate 4.0.5)
# (cd emsdk/upstream/emscripten && npm install)

set -e

emcc -s EXPORT_NAME="'Engine'" \
  -O3 \
  -ffast-math \
  -s ALLOW_MEMORY_GROWTH \
  -s ASSERTIONS=0 \
  -s MALLOC=emmalloc \
  -lembind \
  -o src/engine.mjs \
  src/engine.cpp

emcc -s EXPORT_NAME="'Engine'" -lembind --emit-tsd src/engine.d.ts src/engine.cpp
rm a.out.js
rm a.out.wasm

cat >> ./src/engine.d.ts << EOF

declare const Module: () => Promise<MainModule>;
export default Module;
export type Engine = MainModule;
export * from "./types";
EOF
