import { OrbitControls } from "three/examples/jsm/Addons.js";
import * as THREE from "three/webgpu";
import { loadVoxelData } from "./loader";
import VoxelsModule from "./voxels";

const Voxels = await VoxelsModule();

const CHUNK_SIZE = Voxels.CHUNK_SIZE;
const CHUNK_VOXELS = Voxels.CHUNK_VOXELS;

console.log("Loading voxel data...");

const data = await loadVoxelData("/Jonotla_Puebla_MX_PC.bin");

console.log("Loaded metadata:", data.metadata);
console.log("Loaded", data.chunks.length, "chunks");

const chunkGroups = data.chunks;

// compute voxel bounds
let xmin = Number.POSITIVE_INFINITY;
let ymin = Number.POSITIVE_INFINITY;
let zmin = Number.POSITIVE_INFINITY;
let xmax = Number.NEGATIVE_INFINITY;
let ymax = Number.NEGATIVE_INFINITY;
let zmax = Number.NEGATIVE_INFINITY;

for (const chunkData of chunkGroups) {
  const { cx, cy, cz, samples } = chunkData;
  for (const s of samples) {
    const wx = cx * CHUNK_SIZE + s.x;
    const wy = cy * CHUNK_SIZE + s.y;
    const wz = cz * CHUNK_SIZE + s.z;
    xmin = Math.min(xmin, wx);
    ymin = Math.min(ymin, wy);
    zmin = Math.min(zmin, wz);
    xmax = Math.max(xmax, wx);
    ymax = Math.max(ymax, wy);
    zmax = Math.max(zmax, wz);
  }
}

console.log("voxel bounds", { xmin, xmax, ymin, ymax, zmin, zmax });

const chunkXMin = Math.floor(xmin / CHUNK_SIZE);
const chunkYMin = Math.floor(ymin / CHUNK_SIZE);
const chunkZMin = Math.floor(zmin / CHUNK_SIZE);
const chunkXMax = Math.floor(xmax / CHUNK_SIZE);
const chunkYMax = Math.floor(ymax / CHUNK_SIZE);
const chunkZMax = Math.floor(zmax / CHUNK_SIZE);

console.log("chunk bounds", {
  chunkXMin,
  chunkXMax,
  chunkYMin,
  chunkYMax,
  chunkZMin,
  chunkZMax,
});

const world = Voxels.initVoxels(
  chunkXMin,
  chunkXMax,
  chunkYMin,
  chunkYMax,
  chunkZMin,
  chunkZMax
);

const chunkGeom = Voxels.allocateChunkGeometry()!;

// setup three.js scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  10000
);
camera.position.set(600, 50, 60);

const ambientLight = new THREE.AmbientLight(0xffffff, 5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
directionalLight.position.set(1, 1, 1);
scene.add(directionalLight);

const renderer = new THREE.WebGPURenderer({ antialias: true });
await renderer.init();
document.body.appendChild(renderer.domElement);

const onResize = () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
};
window.addEventListener("resize", onResize, false);
onResize();

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;

// upload chunk data to WASM and recompute sums
const chunks: Array<{ cx: number; cy: number; cz: number; chunk: any }> = [];
for (const chunkData of chunkGroups) {
  const { cx, cy, cz, samples } = chunkData;
  const chunk = Voxels.getChunkAt(world, cx, cy, cz);
  if (!chunk) {
    console.warn(`missing chunk for ${cx}:${cy}:${cz} — skipping`);
    continue;
  }

  const valuesBuf = new Uint8Array(CHUNK_VOXELS);
  const colorsBuf = new Uint8Array(CHUNK_VOXELS * 3);
  for (const u of samples) {
    const idx = u.x + u.z * CHUNK_SIZE + u.y * CHUNK_SIZE * CHUNK_SIZE;
    valuesBuf[idx] = u.value;
    colorsBuf[idx * 3 + 0] = u.r;
    colorsBuf[idx * 3 + 1] = u.g;
    colorsBuf[idx * 3 + 2] = u.b;
  }

  const valuesView = Voxels.chunkValuesView(chunk);
  const colorsView = Voxels.chunkColorsView(chunk);
  valuesView.set(valuesBuf);
  colorsView.set(colorsBuf);
  Voxels.recomputeChunkSum(chunk);

  chunks.push({ cx, cy, cz, chunk });
}

// generate meshes and collect geometry data
const meshTimes: number[] = [];
const geometries: Array<{
  geometry: THREE.BufferGeometry;
  position: THREE.Vector3;
}> = [];

for (const entry of chunks) {
  const { cx, cy, cz, chunk } = entry;
  const startTime = performance.now();

  Voxels.mesh(world, chunk, chunkGeom);

  const endTime = performance.now();
  meshTimes.push(endTime - startTime);

  const posView: Float32Array = Voxels.chunkGeometryPositions(chunkGeom);
  const norView: Float32Array = Voxels.chunkGeometryNormals(chunkGeom);
  const colView: Float32Array = Voxels.chunkGeometryColors(chunkGeom);

  if (posView.length === 0) {
    continue;
  }

  const position = new Float32Array(posView.slice(0, chunkGeom.positionsCount));
  const normal = new Float32Array(norView.slice(0, chunkGeom.normalsCount));
  const color = new Float32Array(colView.slice(0, chunkGeom.colorsCount));

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));

  geometries.push({
    geometry,
    position: new THREE.Vector3(cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE),
  });
}

// create BatchedMesh
let totalVertices = 0;
let totalIndices = 0;
for (const { geometry } of geometries) {
  const posAttr = geometry.getAttribute("position");
  totalVertices += posAttr.count;
  totalIndices += posAttr.count; // non-indexed geometry
}

console.log(`Creating BatchedMesh with ${totalVertices} vertices, ${totalIndices} indices`);

const batchedMesh = new THREE.BatchedMesh(
  geometries.length,
  totalVertices,
  totalIndices,
  new THREE.MeshPhongNodeMaterial({
    vertexColors: true,
    side: THREE.FrontSide,
  })
);

const _matrix = new THREE.Matrix4();

for (const { geometry, position } of geometries) {
  const geometryId = batchedMesh.addGeometry(geometry);
  const instanceId = batchedMesh.addInstance(geometryId);

  _matrix.setPosition(position);
  batchedMesh.setMatrixAt(instanceId, _matrix);
}

batchedMesh.frustumCulled = false;
scene.add(batchedMesh);

const avgMeshTime = meshTimes.reduce((a, b) => a + b, 0) / meshTimes.length;
console.log(
  `Average mesh time per chunk: ${avgMeshTime.toFixed(2)} ms over ${meshTimes.length} chunks`
);

const totalMeshTime = meshTimes.reduce((a, b) => a + b, 0);
console.log(`Total mesh time for all chunks: ${totalMeshTime.toFixed(2)} ms`);

const update = () => {
  requestAnimationFrame(update);
  orbitControls.update();
  renderer.render(scene, camera);
};

update();
