#!/bin/bash

# git clone https://github.com/emscripten-core/emsdk.git
# (cd ./emsdk && emsdk install 4.0.5)
# (cd ./emsdk && emsdk activate 4.0.5)
# (cd emsdk/upstream/emscripten && npm install)

set -e

emcc -s EXPORT_NAME="'Voxels'" \
  -O3 \
  -ffast-math \
  -s ALLOW_MEMORY_GROWTH \
  -s ASSERTIONS=0 \
  -s MALLOC=emmalloc \
  -lembind \
  -o src/voxels.mjs \
  src/voxels.cpp

emcc -s EXPORT_NAME="'Voxels'" -lembind --emit-tsd src/voxels.d.ts src/voxels.cpp
rm a.out.js
rm a.out.wasm

cat >> ./src/voxels.d.ts << EOF

declare const Module: () => Promise<MainModule>;
export default Module;
export type Voxels = MainModule;
export * from "./types";
EOF
