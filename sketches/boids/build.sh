#!/bin/bash

# git clone https://github.com/emscripten-core/emsdk.git
# (cd ./emsdk && emsdk install 4.0.5)
# (cd ./emsdk && emsdk activate 4.0.5)
# (cd emsdk/upstream/emscripten && npm install)

set -e

mkdir -p lib

emcc -s EXPORT_NAME="'Engine'" -lembind -o lib/engine.mjs lib/engine.cpp 

emcc -s EXPORT_NAME="'Engine'" -lembind --emit-tsd lib/types.d.ts lib/engine.cpp
rm a.out.js
rm a.out.wasm

cat > ./lib/engine.d.ts << EOF
import { MainModule } from "./types";

declare const Module: () => Promise<MainModule>;
export default Module;
export type Engine = MainModule;
export * from "./types";

EOF
