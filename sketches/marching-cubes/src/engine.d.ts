// TypeScript bindings for emscripten-generated code.  Automatically generated at compile time.
interface WasmModule {
}

export interface ClassHandle {
  isAliasOf(other: ClassHandle): boolean;
  delete(): void;
  deleteLater(): this;
  isDeleted(): boolean;
  // @ts-ignore - If targeting lower than ESNext, this symbol might not exist.
  [Symbol.dispose](): void;
  clone(): this;
}
export interface Voxels extends ClassHandle {
}

export interface VoxelChunk extends ClassHandle {
}

export interface ChunkGeometry extends ClassHandle {
  positionsCount: number;
  normalsCount: number;
  colorsCount: number;
}

export interface RaycastResult extends ClassHandle {
  hit: boolean;
  positionX: number;
  positionY: number;
  positionZ: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  value: number;
  r: number;
  g: number;
  b: number;
  distance: number;
  voxelX: number;
  voxelY: number;
  voxelZ: number;
}

interface EmbindModule {
  Voxels: {};
  VoxelChunk: {};
  getChunkAt(_0: Voxels | null, _1: number, _2: number, _3: number): VoxelChunk | null;
  getChunkAtPos(_0: Voxels | null, _1: number, _2: number, _3: number): VoxelChunk | null;
  chunkValuesView(_0: VoxelChunk | null): any;
  chunkColorsView(_0: VoxelChunk | null): any;
  recomputeChunkSum(_0: VoxelChunk | null): number;
  isChunkDirty(_0: VoxelChunk | null): boolean;
  setChunkDirty(_0: VoxelChunk | null, _1: boolean): void;
  clearChunkDirty(_0: VoxelChunk | null): void;
  CHUNK_BITS: number;
  CHUNK_SIZE: number;
  CHUNK_MASK: number;
  CHUNK_VOXELS: number;
  initVoxels(_0: number, _1: number, _2: number, _3: number, _4: number, _5: number): Voxels | null;
  ChunkGeometry: {};
  allocateChunkGeometry(): ChunkGeometry | null;
  freeChunkGeometry(_0: ChunkGeometry | null): void;
  chunkGeometryPositions(_0: ChunkGeometry | null): any;
  chunkGeometryNormals(_0: ChunkGeometry | null): any;
  chunkGeometryColors(_0: ChunkGeometry | null): any;
  mesh(_0: Voxels | null, _1: VoxelChunk | null, _2: ChunkGeometry | null): void;
  RaycastResult: {
    new(): RaycastResult;
  };
  raycastVoxels(_0: RaycastResult | null, _1: Voxels | null, _2: number, _3: number, _4: number, _5: number, _6: number, _7: number, _8: number): void;
  generateChunk(_0: VoxelChunk | null, _1: number, _2: number, _3: number, _4: number): void;
  setVoxel(_0: Voxels | null, _1: number, _2: number, _3: number, _4: number, _5: number, _6: number, _7: number): void;
}

export type MainModule = WasmModule & EmbindModule;

declare const Module: () => Promise<MainModule>;
export default Module;
export type Engine = MainModule;
export * from "./types";
