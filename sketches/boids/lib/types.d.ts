// TypeScript bindings for emscripten-generated code.  Automatically generated at compile time.
declare namespace RuntimeExports {
    let HEAPF32: any;
    let HEAPF64: any;
    let HEAP_DATA_VIEW: any;
    let HEAP8: any;
    let HEAPU8: any;
    let HEAP16: any;
    let HEAPU16: any;
    let HEAP32: any;
    let HEAPU32: any;
    let HEAP64: any;
    let HEAPU64: any;
}
interface WasmModule {
}

export interface ClassHandle {
  isAliasOf(other: ClassHandle): boolean;
  delete(): void;
  deleteLater(): this;
  isDeleted(): boolean;
  clone(): this;
}
export interface Vec3 extends ClassHandle {
  x: number;
  y: number;
  z: number;
}

export interface Boid extends ClassHandle {
}

export interface World extends ClassHandle {
  numBoids: number;
  boids: Boid | null;
}

export interface Input extends ClassHandle {
  separationWeight: number;
  alignmentWeight: number;
  cohesionWeight: number;
  maxSpeed: number;
  minSpeed: number;
  neighborRadius: number;
}

interface EmbindModule {
  Vec3: {
    new(_0: number, _1: number, _2: number): Vec3;
  };
  Boid: {};
  World: {
    new(_0: number, _1: Vec3, _2: number, _3: number, _4: number, _5: Vec3): World;
  };
  Input: {
    new(): Input;
  };
  update(_0: World | null, _1: number, _2: Input): void;
  BOID_SIZE: number;
  BOID_INTERPOLATED_POSITION_OFFSET: number;
  BOID_INTERPOLATED_VELOCITY_OFFSET: number;
}

export type MainModule = WasmModule & typeof RuntimeExports & EmbindModule;
