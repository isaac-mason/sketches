#include <emscripten/bind.h>
#include <stdexcept>
#include <cmath>
#include <cstdint>
#include <algorithm>
#include <cstring>

using namespace emscripten;

const int CHUNK_BITS = 4;
const int CHUNK_SIZE = 1 << CHUNK_BITS; // 16
const int CHUNK_MASK = CHUNK_SIZE - 1;  // 15
const int CHUNK_VOXELS = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;

struct ChunkBounds
{
    int xmin;
    int xmax;
    int ymin;
    int ymax;
    int zmin;
    int zmax;
};

inline bool chunkCoordinateToIndex(int x, int y, int z, const ChunkBounds &bounds, size_t &outIndex)
{
    if (x < bounds.xmin || x > bounds.xmax || y < bounds.ymin || y > bounds.ymax || z < bounds.zmin || z > bounds.zmax)
    {
        return false;
    }
    const size_t xs = static_cast<size_t>(bounds.xmax - bounds.xmin + 1);
    const size_t ys = static_cast<size_t>(bounds.ymax - bounds.ymin + 1);
    const size_t zs = static_cast<size_t>(bounds.zmax - bounds.zmin + 1);
    const size_t ox = static_cast<size_t>(x - bounds.xmin);
    const size_t oy = static_cast<size_t>(y - bounds.ymin);
    const size_t oz = static_cast<size_t>(z - bounds.zmin);
    outIndex = (ox * ys + oy) * zs + oz;
    return true;
}

inline void chunkIndexToCoordinate(size_t index, ChunkBounds bounds, int &x, int &y, int &z)
{
    const size_t xs = static_cast<size_t>(bounds.xmax - bounds.xmin + 1);
    const size_t ys = static_cast<size_t>(bounds.ymax - bounds.ymin + 1);
    const size_t zs = static_cast<size_t>(bounds.zmax - bounds.zmin + 1);
    const size_t plane = ys * zs;
    const size_t ox = index / plane;
    const size_t rem = index % plane;
    const size_t oy = rem / zs;
    const size_t oz = rem % zs;
    x = static_cast<int>(ox) + bounds.xmin;
    y = static_cast<int>(oy) + bounds.ymin;
    z = static_cast<int>(oz) + bounds.zmin;
}

inline void worldPositionToChunkCoordinates(int wx, int wy, int wz, int &cx, int &cy, int &cz)
{
    cx = wx >> CHUNK_BITS;
    cy = wy >> CHUNK_BITS;
    cz = wz >> CHUNK_BITS;
}

inline void worldPositionToChunkPosition(int wx, int wy, int wz, int &localX, int &localY, int &localZ)
{
    localX = wx & CHUNK_MASK;
    localY = wy & CHUNK_MASK;
    localZ = wz & CHUNK_MASK;
}

inline size_t getVoxelIndex(int lx, int ly, int lz)
{
    return static_cast<size_t>(lx) + 
           static_cast<size_t>(lz) * CHUNK_SIZE + 
           static_cast<size_t>(ly) * CHUNK_SIZE * CHUNK_SIZE;
}

struct VoxelChunk
{
    int id;
    int x;
    int y;
    int z;
    uint8_t value[CHUNK_VOXELS];
    uint8_t color[CHUNK_VOXELS * 3]; // r1,g1,b1,r2,g2,b2,...
    int sum;
    bool dirtyMesh;
};

struct Voxels
{
    ChunkBounds bounds;
    VoxelChunk **chunks;
};

Voxels *initVoxels(int chunkXMin, int chunkXMax, int chunkYMin, int chunkYMax, int chunkZMin, int chunkZMax)
{
    // alloc world
    Voxels *world = new Voxels();

    world->bounds = {chunkXMin, chunkXMax, chunkYMin, chunkYMax, chunkZMin, chunkZMax};

    // allocate chunks
    size_t chunkCountX = static_cast<size_t>(chunkXMax - chunkXMin + 1);
    size_t chunkCountY = static_cast<size_t>(chunkYMax - chunkYMin + 1);
    size_t chunkCountZ = static_cast<size_t>(chunkZMax - chunkZMin + 1);
    size_t totalChunks = chunkCountX * chunkCountY * chunkCountZ;

    world->chunks = new VoxelChunk *[totalChunks];
    for (size_t i = 0; i < totalChunks; ++i)
    {
        VoxelChunk *c = new VoxelChunk();
        // zero initialize arrays and metadata
        std::memset(c->value, 0, CHUNK_VOXELS);
        std::memset(c->color, 0, CHUNK_VOXELS * 3);
        c->sum = 0;
        c->dirtyMesh = false;
        c->id = static_cast<int>(i);

        // compute coordinates for this chunk
        int cx, cy, cz;
        chunkIndexToCoordinate(i, world->bounds, cx, cy, cz);
        c->x = cx;
        c->y = cy;
        c->z = cz;

        world->chunks[i] = c;
    }

    return world;
}

void disposeWorld(Voxels *world)
{
    size_t chunkCountX = static_cast<size_t>(world->bounds.xmax - world->bounds.xmin + 1);
    size_t chunkCountY = static_cast<size_t>(world->bounds.ymax - world->bounds.ymin + 1);
    size_t chunkCountZ = static_cast<size_t>(world->bounds.zmax - world->bounds.zmin + 1);
    size_t totalChunks = chunkCountX * chunkCountY * chunkCountZ;

    for (size_t i = 0; i < totalChunks; ++i)
    {
        delete world->chunks[i];
    }
    delete[] world->chunks;

    delete world;
}

inline void markChunkDirty(Voxels *world, int cx, int cy, int cz)
{
    size_t chunkIndex;
    if (chunkCoordinateToIndex(cx, cy, cz, world->bounds, chunkIndex))
    {
        world->chunks[chunkIndex]->dirtyMesh = true;
    }
}

inline void setVoxel(Voxels *world, int wx, int wy, int wz, uint8_t value, uint8_t r, uint8_t g, uint8_t b)
{
    int cx, cy, cz;
    worldPositionToChunkCoordinates(wx, wy, wz, cx, cy, cz);

    int lx, ly, lz;
    worldPositionToChunkPosition(wx, wy, wz, lx, ly, lz);

    size_t chunkIndex;
    if (!chunkCoordinateToIndex(cx, cy, cz, world->bounds, chunkIndex))
    {
        // writing outside allocated world bounds — ignore
        return;
    }

    VoxelChunk *chunk = world->chunks[chunkIndex];

    size_t voxelIndex = getVoxelIndex(lx, ly, lz);
    uint8_t prevValue = chunk->value[voxelIndex];
    chunk->value[voxelIndex] = value;
    chunk->color[voxelIndex * 3 + 0] = r;
    chunk->color[voxelIndex * 3 + 1] = g;
    chunk->color[voxelIndex * 3 + 2] = b;

    chunk->sum += static_cast<int>(value) - static_cast<int>(prevValue);
    
    // Mark this chunk as dirty
    chunk->dirtyMesh = true;
    
    // Check if voxel is on chunk boundaries and mark neighboring chunks as dirty
    // Marching cubes needs to check neighbors, so voxels on boundaries affect adjacent chunks
    
    // X boundaries
    if (lx == 0)
    {
        markChunkDirty(world, cx - 1, cy, cz);
    }
    else if (lx == CHUNK_SIZE - 1)
    {
        markChunkDirty(world, cx + 1, cy, cz);
    }
    
    // Y boundaries
    if (ly == 0)
    {
        markChunkDirty(world, cx, cy - 1, cz);
    }
    else if (ly == CHUNK_SIZE - 1)
    {
        markChunkDirty(world, cx, cy + 1, cz);
    }
    
    // Z boundaries
    if (lz == 0)
    {
        markChunkDirty(world, cx, cy, cz - 1);
    }
    else if (lz == CHUNK_SIZE - 1)
    {
        markChunkDirty(world, cx, cy, cz + 1);
    }
    
    // Corner cases: if on multiple boundaries, mark edge and corner neighbors
    // XY edges
    if (lx == 0 && ly == 0)
    {
        markChunkDirty(world, cx - 1, cy - 1, cz);
    }
    if (lx == 0 && ly == CHUNK_SIZE - 1)
    {
        markChunkDirty(world, cx - 1, cy + 1, cz);
    }
    if (lx == CHUNK_SIZE - 1 && ly == 0)
    {
        markChunkDirty(world, cx + 1, cy - 1, cz);
    }
    if (lx == CHUNK_SIZE - 1 && ly == CHUNK_SIZE - 1)
    {
        markChunkDirty(world, cx + 1, cy + 1, cz);
    }
    
    // XZ edges
    if (lx == 0 && lz == 0)
    {
        markChunkDirty(world, cx - 1, cy, cz - 1);
    }
    if (lx == 0 && lz == CHUNK_SIZE - 1)
    {
        markChunkDirty(world, cx - 1, cy, cz + 1);
    }
    if (lx == CHUNK_SIZE - 1 && lz == 0)
    {
        markChunkDirty(world, cx + 1, cy, cz - 1);
    }
    if (lx == CHUNK_SIZE - 1 && lz == CHUNK_SIZE - 1)
    {
        markChunkDirty(world, cx + 1, cy, cz + 1);
    }
    
    // YZ edges
    if (ly == 0 && lz == 0)
    {
        markChunkDirty(world, cx, cy - 1, cz - 1);
    }
    if (ly == 0 && lz == CHUNK_SIZE - 1)
    {
        markChunkDirty(world, cx, cy - 1, cz + 1);
    }
    if (ly == CHUNK_SIZE - 1 && lz == 0)
    {
        markChunkDirty(world, cx, cy + 1, cz - 1);
    }
    if (ly == CHUNK_SIZE - 1 && lz == CHUNK_SIZE - 1)
    {
        markChunkDirty(world, cx, cy + 1, cz + 1);
    }
    
    // Corner cases: all 8 corners
    if (lx == 0 && ly == 0 && lz == 0)
    {
        markChunkDirty(world, cx - 1, cy - 1, cz - 1);
    }
    if (lx == 0 && ly == 0 && lz == CHUNK_SIZE - 1)
    {
        markChunkDirty(world, cx - 1, cy - 1, cz + 1);
    }
    if (lx == 0 && ly == CHUNK_SIZE - 1 && lz == 0)
    {
        markChunkDirty(world, cx - 1, cy + 1, cz - 1);
    }
    if (lx == 0 && ly == CHUNK_SIZE - 1 && lz == CHUNK_SIZE - 1)
    {
        markChunkDirty(world, cx - 1, cy + 1, cz + 1);
    }
    if (lx == CHUNK_SIZE - 1 && ly == 0 && lz == 0)
    {
        markChunkDirty(world, cx + 1, cy - 1, cz - 1);
    }
    if (lx == CHUNK_SIZE - 1 && ly == 0 && lz == CHUNK_SIZE - 1)
    {
        markChunkDirty(world, cx + 1, cy - 1, cz + 1);
    }
    if (lx == CHUNK_SIZE - 1 && ly == CHUNK_SIZE - 1 && lz == 0)
    {
        markChunkDirty(world, cx + 1, cy + 1, cz - 1);
    }
    if (lx == CHUNK_SIZE - 1 && ly == CHUNK_SIZE - 1 && lz == CHUNK_SIZE - 1)
    {
        markChunkDirty(world, cx + 1, cy + 1, cz + 1);
    }
}

inline void getVoxel(const Voxels *voxels, int x, int y, int z, uint8_t *value, uint8_t *r, uint8_t *g, uint8_t *b)
{
    int cx, cy, cz;
    worldPositionToChunkCoordinates(x, y, z, cx, cy, cz);

    int lx, ly, lz;
    worldPositionToChunkPosition(x, y, z, lx, ly, lz);

    size_t chunkIndex;
    if (!chunkCoordinateToIndex(cx, cy, cz, voxels->bounds, chunkIndex))
    {
        // requested voxel is outside allocated world bounds — return empty/default sample
        *value = 0;
        *r = *g = *b = 0;
        return;
    }

    VoxelChunk *chunk = voxels->chunks[chunkIndex];

    size_t voxelIndex = getVoxelIndex(lx, ly, lz);
    *value = chunk->value[voxelIndex];
    *r = chunk->color[voxelIndex * 3 + 0];
    *g = chunk->color[voxelIndex * 3 + 1];
    *b = chunk->color[voxelIndex * 3 + 2];
}

inline void getVoxelRelative(const Voxels *voxels, const VoxelChunk *chunk, int lx, int ly, int lz, uint8_t *value, uint8_t *r, uint8_t *g, uint8_t *b)
{
    // if within chunk bounds, get directly
    if (lx >= 0 && lx < CHUNK_SIZE &&
        ly >= 0 && ly < CHUNK_SIZE &&
        lz >= 0 && lz < CHUNK_SIZE)
    {
        size_t voxelIndex = getVoxelIndex(lx, ly, lz);
        *value = chunk->value[voxelIndex];
        *r = chunk->color[voxelIndex * 3 + 0];
        *g = chunk->color[voxelIndex * 3 + 1];
        *b = chunk->color[voxelIndex * 3 + 2];
        return;
    }

    // otherwise, compute world position and get voxel
    int wx = (chunk->x << CHUNK_BITS) + lx;
    int wy = (chunk->y << CHUNK_BITS) + ly;
    int wz = (chunk->z << CHUNK_BITS) + lz;

    // use safe getVoxel — it returns a default sample if out of world bounds
    getVoxel(voxels, wx, wy, wz, value, r, g, b);
}

VoxelChunk *getChunkAt(Voxels *world, int cx, int cy, int cz)
{
    size_t idx;
    if (!chunkCoordinateToIndex(cx, cy, cz, world->bounds, idx))
    {
        return nullptr;
    }
    return world->chunks[idx];
}

VoxelChunk *getChunkAtPos(Voxels *world, int wx, int wy, int wz)
{
    int cx, cy, cz;
    worldPositionToChunkCoordinates(wx, wy, wz, cx, cy, cz);
    return getChunkAt(world, cx, cy, cz);
}

val chunkValuesView(VoxelChunk *chunk)
{
    return val(typed_memory_view(CHUNK_VOXELS, chunk->value));
}

val chunkColorsView(VoxelChunk *chunk)
{
    return val(typed_memory_view(CHUNK_VOXELS * 3, chunk->color));
}

// recompute sum for a chunk (useful after bulk updates)
int recomputeChunkSum(VoxelChunk *chunk)
{
    int s = 0;
    for (size_t i = 0; i < CHUNK_VOXELS; ++i)
    {
        s += static_cast<int>(chunk->value[i]);
    }
    chunk->sum = s;
    return s;
}

struct Vec3
{
    float x;
    float y;
    float z;
};

constexpr int VERTICES_PER_VOXEL_WORST = 15; // worst-case non-indexed marching cubes: up to 5 triangles => 15 vertices
constexpr int POS_COMPONENTS = 3;            // x,y,z floats per vertex
constexpr int NORMAL_COMPONENTS = 3;         // nx,ny,nz floats per vertex
constexpr int COLOR_COMPONENTS = 3;          // RGB bytes per vertex (use uint8_t to be JS/WebGL friendly)

constexpr size_t CHUNK_GEOMETRY_WORST_CASE_VERTICES = static_cast<size_t>(CHUNK_VOXELS) * static_cast<size_t>(VERTICES_PER_VOXEL_WORST);
constexpr size_t CHUNK_GEOMETRY_WORST_CASE_POSITIONS_COMPONENTS = CHUNK_GEOMETRY_WORST_CASE_VERTICES * POS_COMPONENTS;  // floats
constexpr size_t CHUNK_GEOMETRY_WORST_CASE_NORMALS_COMPONENTS = CHUNK_GEOMETRY_WORST_CASE_VERTICES * NORMAL_COMPONENTS; // floats
constexpr size_t CHUNK_GEOMETRY_WORST_CASE_COLORS_COMPONENTS = CHUNK_GEOMETRY_WORST_CASE_VERTICES * COLOR_COMPONENTS;   // bytes

struct ChunkGeometry
{
    float *positions;
    size_t positionsCapacity;
    size_t positionsCount;

    float *normals;
    size_t normalsCapacity;
    size_t normalsCount;

    float *colors;
    size_t colorsCapacity;
    size_t colorsCount;
};

ChunkGeometry *allocateChunkGeometry()
{
    ChunkGeometry *geom = new ChunkGeometry();

    geom->positions = new float[CHUNK_GEOMETRY_WORST_CASE_POSITIONS_COMPONENTS];
    geom->positionsCount = 0;
    geom->positionsCapacity = CHUNK_GEOMETRY_WORST_CASE_POSITIONS_COMPONENTS;

    geom->normals = new float[CHUNK_GEOMETRY_WORST_CASE_NORMALS_COMPONENTS];
    geom->normalsCount = 0;
    geom->normalsCapacity = CHUNK_GEOMETRY_WORST_CASE_NORMALS_COMPONENTS;

    geom->colors = new float[CHUNK_GEOMETRY_WORST_CASE_COLORS_COMPONENTS];
    geom->colorsCount = 0;
    geom->colorsCapacity = CHUNK_GEOMETRY_WORST_CASE_COLORS_COMPONENTS;

    return geom;
}

void freeChunkGeometry(ChunkGeometry *geom)
{
    delete[] geom->positions;
    delete[] geom->normals;
    delete[] geom->colors;
    delete geom;
}

val chunkGeometryPositions(ChunkGeometry *geom)
{
    return val(typed_memory_view(geom->positionsCount, geom->positions));
}

val chunkGeometryNormals(ChunkGeometry *geom)
{
    return val(typed_memory_view(geom->normalsCount, geom->normals));
}

val chunkGeometryColors(ChunkGeometry *geom)
{
    return val(typed_memory_view(geom->colorsCount, geom->colors));
}

const int ISOLEVEL = 128;

struct Sample
{
    Vec3 position;
    uint8_t value;
    uint8_t r, g, b;
};

void sample(Sample *out, const Voxels *voxels, const VoxelChunk *chunk, int x, int y, int z)
{
    uint8_t value;
    uint8_t r, g, b;
    getVoxelRelative(voxels, chunk, x, y, z, &value, &r, &g, &b);
    out->position = Vec3{static_cast<float>(x), static_cast<float>(y), static_cast<float>(z)};
    out->value = value;
    out->r = r;
    out->g = g;
    out->b = b;
}

struct EdgePoint
{
    Vec3 position;
    float r, g, b;
};

// SRGB to Linear lookup table - precomputed to avoid expensive pow() calls
static float srgbToLinearLUT[256] = {0};

// Static initializer to populate the lookup table
struct SRGBLUTInitializer {
    SRGBLUTInitializer() {
        for (int i = 0; i < 256; i++) {
            const float n = static_cast<float>(i) / 255.0f;
            srgbToLinearLUT[i] = (n < 0.04045f) ? n * 0.0773993808f : pow(n * 0.9478672986f + 0.0521327014f, 2.4f);
        }
    }
};

static SRGBLUTInitializer srgbLUTInit;

void interpolate(EdgePoint *out, const Sample &a, const Sample &b)
{
    // const float step = (static_cast<float>(ISOLEVEL) - static_cast<float>(a.value)) / (static_cast<float>(b.value) - static_cast<float>(a.value));
    // safe version to avoid division by zero
    float step;
    if (b.value == a.value) {
        step = 0.5f;
    } else {
        step = (static_cast<float>(ISOLEVEL) - static_cast<float>(a.value)) / (static_cast<float>(b.value) - static_cast<float>(a.value));
        if (step < 0.0f) step = 0.0f;
        if (step > 1.0f) step = 1.0f;
    }
    

    // interpolate position
    out->position.x = a.position.x + step * (b.position.x - a.position.x);
    out->position.y = a.position.y + step * (b.position.y - a.position.y);
    out->position.z = a.position.z + step * (b.position.z - a.position.z);

    // interpolate color using lookup table
    const float r1 = srgbToLinearLUT[a.r];
    const float g1 = srgbToLinearLUT[a.g];
    const float b1 = srgbToLinearLUT[a.b];

    const float r2 = srgbToLinearLUT[b.r];
    const float g2 = srgbToLinearLUT[b.g];
    const float b2 = srgbToLinearLUT[b.b];

    const float rLinear = r1 + step * (r2 - r1);
    const float gLinear = g1 + step * (g2 - g1);
    const float bLinear = b1 + step * (b2 - b1);

    out->r = rLinear;
    out->g = gLinear;
    out->b = bLinear;
}

Vec3 computeNormal(Vec3 a, Vec3 b, Vec3 c)
{
    float cbx = c.x - b.x;
    float cby = c.y - b.y;
    float cbz = c.z - b.z;
    float abx = a.x - b.x;
    float aby = a.y - b.y;
    float abz = a.z - b.z;
    float nx = cby * abz - cbz * aby;
    float ny = cbz * abx - cbx * abz;
    float nz = cbx * aby - cby * abx;

    // Use inverse sqrt for faster normalization (1 div + 3 mults instead of 1 sqrt + 3 divs)
    float lengthSq = nx * nx + ny * ny + nz * nz;
    if (lengthSq < 1e-8f) {
        // Degenerate triangle - return default up vector
        return Vec3{0.0f, 1.0f, 0.0f};
    }

    float invLength = 1.0f / sqrtf(lengthSq);
    return Vec3{nx * invLength, ny * invLength, nz * invLength};
}

Sample samples[8];
EdgePoint edgePoints[12];

extern int edgeTable[256];
extern int triTable[256][16];

// pre-sampled grid: 17x17x17 corners for a 16x16x16 chunk
constexpr int SAMPLE_GRID_SIZE = CHUNK_SIZE + 1;

struct SampleGrid {
    uint8_t values[SAMPLE_GRID_SIZE][SAMPLE_GRID_SIZE][SAMPLE_GRID_SIZE];
    uint8_t colors[SAMPLE_GRID_SIZE][SAMPLE_GRID_SIZE][SAMPLE_GRID_SIZE][3];
};

// Static grid buffer - zero allocation overhead, no stack risk
static SampleGrid gridBuffer;

void mesh(const Voxels *voxels, const VoxelChunk *chunk, ChunkGeometry *out)
{
    out->positionsCount = 0;
    out->normalsCount = 0;
    out->colorsCount = 0;

    // pre-sample all corner positions to eliminate redundant sampling
    for (int ly = 0; ly < SAMPLE_GRID_SIZE; ly++)
    {
        for (int lz = 0; lz < SAMPLE_GRID_SIZE; lz++)
        {
            for (int lx = 0; lx < SAMPLE_GRID_SIZE; lx++)
            {
                uint8_t value, r, g, b;
                getVoxelRelative(voxels, chunk, lx, ly, lz, &value, &r, &g, &b);
                gridBuffer.values[ly][lz][lx] = value;
                gridBuffer.colors[ly][lz][lx][0] = r;
                gridBuffer.colors[ly][lz][lx][1] = g;
                gridBuffer.colors[ly][lz][lx][2] = b;
            }
        }
    }

    // march through voxels using pre-sampled data
    for (int ly = 0; ly < CHUNK_SIZE; ly++)
    {
        for (int lz = 0; lz < CHUNK_SIZE; lz++)
        {
            for (int lx = 0; lx < CHUNK_SIZE; lx++)
            {
                // build samples from pre-sampled grid
                samples[0].position = Vec3{static_cast<float>(lx), static_cast<float>(ly), static_cast<float>(lz)};
                samples[0].value = gridBuffer.values[ly][lz][lx];
                samples[0].r = gridBuffer.colors[ly][lz][lx][0];
                samples[0].g = gridBuffer.colors[ly][lz][lx][1];
                samples[0].b = gridBuffer.colors[ly][lz][lx][2];

                samples[1].position = Vec3{static_cast<float>(lx), static_cast<float>(ly + 1), static_cast<float>(lz)};
                samples[1].value = gridBuffer.values[ly + 1][lz][lx];
                samples[1].r = gridBuffer.colors[ly + 1][lz][lx][0];
                samples[1].g = gridBuffer.colors[ly + 1][lz][lx][1];
                samples[1].b = gridBuffer.colors[ly + 1][lz][lx][2];

                samples[2].position = Vec3{static_cast<float>(lx + 1), static_cast<float>(ly + 1), static_cast<float>(lz)};
                samples[2].value = gridBuffer.values[ly + 1][lz][lx + 1];
                samples[2].r = gridBuffer.colors[ly + 1][lz][lx + 1][0];
                samples[2].g = gridBuffer.colors[ly + 1][lz][lx + 1][1];
                samples[2].b = gridBuffer.colors[ly + 1][lz][lx + 1][2];

                samples[3].position = Vec3{static_cast<float>(lx + 1), static_cast<float>(ly), static_cast<float>(lz)};
                samples[3].value = gridBuffer.values[ly][lz][lx + 1];
                samples[3].r = gridBuffer.colors[ly][lz][lx + 1][0];
                samples[3].g = gridBuffer.colors[ly][lz][lx + 1][1];
                samples[3].b = gridBuffer.colors[ly][lz][lx + 1][2];

                samples[4].position = Vec3{static_cast<float>(lx), static_cast<float>(ly), static_cast<float>(lz + 1)};
                samples[4].value = gridBuffer.values[ly][lz + 1][lx];
                samples[4].r = gridBuffer.colors[ly][lz + 1][lx][0];
                samples[4].g = gridBuffer.colors[ly][lz + 1][lx][1];
                samples[4].b = gridBuffer.colors[ly][lz + 1][lx][2];

                samples[5].position = Vec3{static_cast<float>(lx), static_cast<float>(ly + 1), static_cast<float>(lz + 1)};
                samples[5].value = gridBuffer.values[ly + 1][lz + 1][lx];
                samples[5].r = gridBuffer.colors[ly + 1][lz + 1][lx][0];
                samples[5].g = gridBuffer.colors[ly + 1][lz + 1][lx][1];
                samples[5].b = gridBuffer.colors[ly + 1][lz + 1][lx][2];

                samples[6].position = Vec3{static_cast<float>(lx + 1), static_cast<float>(ly + 1), static_cast<float>(lz + 1)};
                samples[6].value = gridBuffer.values[ly + 1][lz + 1][lx + 1];
                samples[6].r = gridBuffer.colors[ly + 1][lz + 1][lx + 1][0];
                samples[6].g = gridBuffer.colors[ly + 1][lz + 1][lx + 1][1];
                samples[6].b = gridBuffer.colors[ly + 1][lz + 1][lx + 1][2];

                samples[7].position = Vec3{static_cast<float>(lx + 1), static_cast<float>(ly), static_cast<float>(lz + 1)};
                samples[7].value = gridBuffer.values[ly][lz + 1][lx + 1];
                samples[7].r = gridBuffer.colors[ly][lz + 1][lx + 1][0];
                samples[7].g = gridBuffer.colors[ly][lz + 1][lx + 1][1];
                samples[7].b = gridBuffer.colors[ly][lz + 1][lx + 1][2];

                int cubeIndex =
                    ((samples[0].value >= ISOLEVEL) << 0) |
                    ((samples[1].value >= ISOLEVEL) << 1) |
                    ((samples[2].value >= ISOLEVEL) << 2) |
                    ((samples[3].value >= ISOLEVEL) << 3) |
                    ((samples[4].value >= ISOLEVEL) << 4) |
                    ((samples[5].value >= ISOLEVEL) << 5) |
                    ((samples[6].value >= ISOLEVEL) << 6) |
                    ((samples[7].value >= ISOLEVEL) << 7);

                int edges = edgeTable[cubeIndex];
                if (edges == 0)
                {
                    continue; // no geometry for this voxel
                }

                // build edge points
                if (edges & 1) interpolate(&edgePoints[0], samples[0], samples[1]);
                if (edges & 2) interpolate(&edgePoints[1], samples[1], samples[2]);
                if (edges & 4) interpolate(&edgePoints[2], samples[2], samples[3]);
                if (edges & 8) interpolate(&edgePoints[3], samples[3], samples[0]);
                if (edges & 16) interpolate(&edgePoints[4], samples[4], samples[5]);
                if (edges & 32) interpolate(&edgePoints[5], samples[5], samples[6]);
                if (edges & 64) interpolate(&edgePoints[6], samples[6], samples[7]);
                if (edges & 128) interpolate(&edgePoints[7], samples[7], samples[4]);
                if (edges & 256) interpolate(&edgePoints[8], samples[0], samples[4]);
                if (edges & 512) interpolate(&edgePoints[9], samples[1], samples[5]);
                if (edges & 1024) interpolate(&edgePoints[10], samples[2], samples[6]);
                if (edges & 2048) interpolate(&edgePoints[11], samples[3], samples[7]);

                // create triangles
                for (int i = 0; i < 16; i += 3)
                {
                    int edgeIndex = triTable[cubeIndex][i];
                    if (edgeIndex == -1)
                    {
                        break; // end of triangle list
                    }

                    // get edge points for triangle
                    EdgePoint *p0 = &edgePoints[triTable[cubeIndex][i]];
                    EdgePoint *p1 = &edgePoints[triTable[cubeIndex][i + 1]];
                    EdgePoint *p2 = &edgePoints[triTable[cubeIndex][i + 2]];

                    // compute normal
                    Vec3 normal = computeNormal(p0->position, p1->position, p2->position);

                    // push positions
                    out->positions[out->positionsCount++] = p0->position.x;
                    out->positions[out->positionsCount++] = p0->position.y;
                    out->positions[out->positionsCount++] = p0->position.z;

                    out->positions[out->positionsCount++] = p1->position.x;
                    out->positions[out->positionsCount++] = p1->position.y;
                    out->positions[out->positionsCount++] = p1->position.z;

                    out->positions[out->positionsCount++] = p2->position.x;
                    out->positions[out->positionsCount++] = p2->position.y;
                    out->positions[out->positionsCount++] = p2->position.z;

                    // push normals
                    out->normals[out->normalsCount++] = normal.x;
                    out->normals[out->normalsCount++] = normal.y;
                    out->normals[out->normalsCount++] = normal.z;

                    out->normals[out->normalsCount++] = normal.x;
                    out->normals[out->normalsCount++] = normal.y;
                    out->normals[out->normalsCount++] = normal.z;

                    out->normals[out->normalsCount++] = normal.x;
                    out->normals[out->normalsCount++] = normal.y;
                    out->normals[out->normalsCount++] = normal.z;

                    // push colors
                    out->colors[out->colorsCount++] = p0->r;
                    out->colors[out->colorsCount++] = p0->g;
                    out->colors[out->colorsCount++] = p0->b;

                    out->colors[out->colorsCount++] = p1->r;
                    out->colors[out->colorsCount++] = p1->g;
                    out->colors[out->colorsCount++] = p1->b;

                    out->colors[out->colorsCount++] = p2->r;
                    out->colors[out->colorsCount++] = p2->g;
                    out->colors[out->colorsCount++] = p2->b;
                }
            }
        }
    }
}

// raycast result structure
struct RaycastResult
{
    bool hit;
    float positionX;
    float positionY;
    float positionZ;
    float normalX;
    float normalY;
    float normalZ;
    uint8_t value;
    uint8_t r;
    uint8_t g;
    uint8_t b;
    float distance;
    int voxelX;
    int voxelY;
    int voxelZ;
};

/**
 * Cast a ray through the voxel world using DDA algorithm.
 * Optimized to skip nonexistent or empty chunks (chunk.sum === 0).
 */
void raycastVoxels(
    RaycastResult *out,
    const Voxels *voxels,
    float originX, float originY, float originZ,
    float dirX, float dirY, float dirZ,
    float maxDistance)
{
    // space transformation: move to voxel coordinates by adding 0.5 to origin
    float tOriginX = originX + 0.5f;
    float tOriginY = originY + 0.5f;
    float tOriginZ = originZ + 0.5f;

    // current voxel position (integer coordinates)
    int x = static_cast<int>(std::floor(tOriginX));
    int y = static_cast<int>(std::floor(tOriginY));
    int z = static_cast<int>(std::floor(tOriginZ));

    // step direction for each axis (-1 or 1)
    int stepX = dirX >= 0 ? 1 : -1;
    int stepY = dirY >= 0 ? 1 : -1;
    int stepZ = dirZ >= 0 ? 1 : -1;

    // tMax: distance along ray to next voxel boundary on each axis
    // tDelta: distance along ray between voxel boundaries on each axis
    float tDeltaX = dirX != 0.0f ? std::abs(1.0f / dirX) : std::numeric_limits<float>::max();
    float tDeltaY = dirY != 0.0f ? std::abs(1.0f / dirY) : std::numeric_limits<float>::max();
    float tDeltaZ = dirZ != 0.0f ? std::abs(1.0f / dirZ) : std::numeric_limits<float>::max();

    // calculate initial tMax values
    float tMaxX, tMaxY, tMaxZ;

    if (dirX >= 0)
    {
        tMaxX = (std::floor(tOriginX) + 1.0f - tOriginX) / dirX;
    }
    else
    {
        tMaxX = (tOriginX - std::floor(tOriginX)) / -dirX;
    }

    if (dirY >= 0)
    {
        tMaxY = (std::floor(tOriginY) + 1.0f - tOriginY) / dirY;
    }
    else
    {
        tMaxY = (tOriginY - std::floor(tOriginY)) / -dirY;
    }

    if (dirZ >= 0)
    {
        tMaxZ = (std::floor(tOriginZ) + 1.0f - tOriginZ) / dirZ;
    }
    else
    {
        tMaxZ = (tOriginZ - std::floor(tOriginZ)) / -dirZ;
    }

    // track which face we hit for normal calculation
    float hitNormalX = 0, hitNormalY = 0, hitNormalZ = 0;
    float distance = 0;

    // DDA traversal
    while (distance < maxDistance)
    {
        // check current chunk
        int cx, cy, cz;
        worldPositionToChunkCoordinates(x, y, z, cx, cy, cz);

        size_t chunkIndex;
        bool inBounds = chunkCoordinateToIndex(cx, cy, cz, voxels->bounds, chunkIndex);

        // if chunk doesn't exist or is empty, skip to chunk exit boundary
        if (!inBounds || voxels->chunks[chunkIndex]->sum == 0)
        {
            // calculate chunk boundaries
            int chunkMinX = cx * CHUNK_SIZE;
            int chunkMinY = cy * CHUNK_SIZE;
            int chunkMinZ = cz * CHUNK_SIZE;
            int chunkMaxX = chunkMinX + CHUNK_SIZE;
            int chunkMaxY = chunkMinY + CHUNK_SIZE;
            int chunkMaxZ = chunkMinZ + CHUNK_SIZE;

            // find distance to exit this chunk
            float tExitX = std::numeric_limits<float>::max();
            float tExitY = std::numeric_limits<float>::max();
            float tExitZ = std::numeric_limits<float>::max();

            if (dirX > 0)
            {
                float t = (chunkMaxX - tOriginX) / dirX;
                if (t > distance)
                    tExitX = t;
            }
            else if (dirX < 0)
            {
                float t = (chunkMinX - tOriginX) / dirX;
                if (t > distance)
                    tExitX = t;
            }

            if (dirY > 0)
            {
                float t = (chunkMaxY - tOriginY) / dirY;
                if (t > distance)
                    tExitY = t;
            }
            else if (dirY < 0)
            {
                float t = (chunkMinY - tOriginY) / dirY;
                if (t > distance)
                    tExitY = t;
            }

            if (dirZ > 0)
            {
                float t = (chunkMaxZ - tOriginZ) / dirZ;
                if (t > distance)
                    tExitZ = t;
            }
            else if (dirZ < 0)
            {
                float t = (chunkMinZ - tOriginZ) / dirZ;
                if (t > distance)
                    tExitZ = t;
            }

            // find the minimum valid exit distance
            float tExit = std::min({tExitX, tExitY, tExitZ});

            if (tExit >= maxDistance || tExit == std::numeric_limits<float>::max())
            {
                out->hit = false;
                return;
            }

            // jump to the chunk boundary voxel
            const float epsilon = 0.0001f;
            float exitX = tOriginX + dirX * (tExit + epsilon);
            float exitY = tOriginY + dirY * (tExit + epsilon);
            float exitZ = tOriginZ + dirZ * (tExit + epsilon);

            x = static_cast<int>(std::floor(exitX));
            y = static_cast<int>(std::floor(exitY));
            z = static_cast<int>(std::floor(exitZ));

            // recalculate tMax values for the new position
            if (dirX != 0.0f)
            {
                tMaxX = dirX >= 0 ? (x + 1 - tOriginX) / dirX : (tOriginX - x) / -dirX;
            }
            if (dirY != 0.0f)
            {
                tMaxY = dirY >= 0 ? (y + 1 - tOriginY) / dirY : (tOriginY - y) / -dirY;
            }
            if (dirZ != 0.0f)
            {
                tMaxZ = dirZ >= 0 ? (z + 1 - tOriginZ) / dirZ : (tOriginZ - z) / -dirZ;
            }

            distance = tExit;

            // update hit normal based on which face we exited through
            if (tExit == tExitX)
            {
                hitNormalX = -stepX;
                hitNormalY = 0;
                hitNormalZ = 0;
            }
            else if (tExit == tExitY)
            {
                hitNormalX = 0;
                hitNormalY = -stepY;
                hitNormalZ = 0;
            }
            else
            {
                hitNormalX = 0;
                hitNormalY = 0;
                hitNormalZ = -stepZ;
            }

            continue;
        }

        // check current voxel
        uint8_t value, r, g, b;
        getVoxel(voxels, x, y, z, &value, &r, &g, &b);

        if (value >= ISOLEVEL)
        {
            // hit!
            out->hit = true;

            // calculate hit position
            float hitPosX = tOriginX + dirX * distance;
            float hitPosY = tOriginY + dirY * distance;
            float hitPosZ = tOriginZ + dirZ * distance;

            // convert back to original world space by subtracting the 0.5 offset
            out->positionX = hitPosX - 0.5f;
            out->positionY = hitPosY - 0.5f;
            out->positionZ = hitPosZ - 0.5f;
            out->normalX = hitNormalX;
            out->normalY = hitNormalY;
            out->normalZ = hitNormalZ;
            out->value = value;
            out->r = r;
            out->g = g;
            out->b = b;
            out->distance = distance;
            out->voxelX = x;
            out->voxelY = y;
            out->voxelZ = z;
            return;
        }

        // step to next voxel boundary
        if (tMaxX < tMaxY && tMaxX < tMaxZ)
        {
            x += stepX;
            distance = tMaxX;
            tMaxX += tDeltaX;
            hitNormalX = -stepX;
            hitNormalY = 0;
            hitNormalZ = 0;
        }
        else if (tMaxY < tMaxZ)
        {
            y += stepY;
            distance = tMaxY;
            tMaxY += tDeltaY;
            hitNormalX = 0;
            hitNormalY = -stepY;
            hitNormalZ = 0;
        }
        else
        {
            z += stepZ;
            distance = tMaxZ;
            tMaxZ += tDeltaZ;
            hitNormalX = 0;
            hitNormalY = 0;
            hitNormalZ = -stepZ;
        }
    }

    out->hit = false;
}

// dirty mesh helpers
bool isChunkDirty(const VoxelChunk *chunk)
{
    return chunk->dirtyMesh;
}

void setChunkDirty(VoxelChunk *chunk, bool dirty)
{
    chunk->dirtyMesh = dirty;
}

void clearChunkDirty(VoxelChunk *chunk)
{
    chunk->dirtyMesh = false;
}

// ===== SIMPLEX NOISE =====
// Based on Stefan Gustavson's implementation
static const uint8_t perm[512] = {
    151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,
    8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,
    35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,
    134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,
    55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,
    18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,
    250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,
    189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,
    172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,
    228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,
    107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,
    138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180,
    151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,
    8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,
    35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,
    134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,
    55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,
    18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,
    250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,
    189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,
    172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,
    228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,
    107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,
    138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180
};

static const float grad3[12][3] = {
    {1,1,0},{-1,1,0},{1,-1,0},{-1,-1,0},
    {1,0,1},{-1,0,1},{1,0,-1},{-1,0,-1},
    {0,1,1},{0,-1,1},{0,1,-1},{0,-1,-1}
};

inline float dot3(const float g[3], float x, float y, float z) {
    return g[0]*x + g[1]*y + g[2]*z;
}

float simplexNoise3D(float x, float y, float z, int seed) {
    // Add seed offset
    x += seed * 0.123f;
    y += seed * 0.456f;
    z += seed * 0.789f;
    
    const float F3 = 1.0f/3.0f;
    const float G3 = 1.0f/6.0f;
    
    float s = (x+y+z)*F3;
    int i = (int)std::floor(x+s);
    int j = (int)std::floor(y+s);
    int k = (int)std::floor(z+s);
    
    float t = (i+j+k)*G3;
    float X0 = i-t;
    float Y0 = j-t;
    float Z0 = k-t;
    float x0 = x-X0;
    float y0 = y-Y0;
    float z0 = z-Z0;
    
    int i1, j1, k1, i2, j2, k2;
    if(x0>=y0) {
        if(y0>=z0) { i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; }
        else if(x0>=z0) { i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; }
        else { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }
    } else {
        if(y0<z0) { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; }
        else if(x0<z0) { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; }
        else { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; }
    }
    
    float x1 = x0 - i1 + G3;
    float y1 = y0 - j1 + G3;
    float z1 = z0 - k1 + G3;
    float x2 = x0 - i2 + 2.0f*G3;
    float y2 = y0 - j2 + 2.0f*G3;
    float z2 = z0 - k2 + 2.0f*G3;
    float x3 = x0 - 1.0f + 3.0f*G3;
    float y3 = y0 - 1.0f + 3.0f*G3;
    float z3 = z0 - 1.0f + 3.0f*G3;
    
    int ii = i & 255;
    int jj = j & 255;
    int kk = k & 255;
    
    int gi0 = perm[ii+perm[jj+perm[kk]]] % 12;
    int gi1 = perm[ii+i1+perm[jj+j1+perm[kk+k1]]] % 12;
    int gi2 = perm[ii+i2+perm[jj+j2+perm[kk+k2]]] % 12;
    int gi3 = perm[ii+1+perm[jj+1+perm[kk+1]]] % 12;
    
    float n0, n1, n2, n3;
    float t0 = 0.6f - x0*x0 - y0*y0 - z0*z0;
    if(t0<0) n0 = 0.0f;
    else {
        t0 *= t0;
        n0 = t0 * t0 * dot3(grad3[gi0], x0, y0, z0);
    }
    
    float t1 = 0.6f - x1*x1 - y1*y1 - z1*z1;
    if(t1<0) n1 = 0.0f;
    else {
        t1 *= t1;
        n1 = t1 * t1 * dot3(grad3[gi1], x1, y1, z1);
    }
    
    float t2 = 0.6f - x2*x2 - y2*y2 - z2*z2;
    if(t2<0) n2 = 0.0f;
    else {
        t2 *= t2;
        n2 = t2 * t2 * dot3(grad3[gi2], x2, y2, z2);
    }
    
    float t3 = 0.6f - x3*x3 - y3*y3 - z3*z3;
    if(t3<0) n3 = 0.0f;
    else {
        t3 *= t3;
        n3 = t3 * t3 * dot3(grad3[gi3], x3, y3, z3);
    }
    
    return 32.0f*(n0 + n1 + n2 + n3);
}

float fbm3(float x, float y, float z, int seed, int octaves, float lacunarity, float gain) {
    float amplitude = 1.0f;
    float frequency = 1.0f;
    float sum = 0.0f;
    float maxValue = 0.0f;
    
    for (int i = 0; i < octaves; i++) {
        sum += amplitude * simplexNoise3D(x * frequency, y * frequency, z * frequency, seed + i);
        maxValue += amplitude;
        amplitude *= gain;
        frequency *= lacunarity;
    }
    
    return sum / maxValue;
}

void generateChunk(VoxelChunk* chunk, int cx, int cy, int cz, int seed) {
    if (!chunk) return;
    
    const float isoScale = 0.0125f;
    const float threshold = 0.05f;
    
    for (int lz = 0; lz < CHUNK_SIZE; lz++) {
        for (int ly = 0; ly < CHUNK_SIZE; ly++) {
            for (int lx = 0; lx < CHUNK_SIZE; lx++) {
                int wx = cx * CHUNK_SIZE + lx;
                int wy = cy * CHUNK_SIZE + ly;
                int wz = cz * CHUNK_SIZE + lz;
                
                // noise
                float n = fbm3(wx * isoScale, wy * isoScale, wz * isoScale, seed, 5, 2.0f, 0.5f);
                
                // smoothstep
                float t = (n - (threshold - 0.2f)) / 0.4f;
                t = std::max(0.0f, std::min(1.0f, t));
                float solidity = t * t * (3.0f - 2.0f * t);
                
                if (solidity > 0.01f) {
                    // color generation (HSV-based)
                    float h = (fbm3(wz * 0.004f, wx * 0.004f, wy * 0.004f, seed + 1000, 3, 2.0f, 0.6f) + 1.0f) * 0.5f;
                    float sCol = 0.8f;
                    float vCol = 1.0f;
                    int ih = (int)std::floor(h * 6.0f);
                    float fh = h * 6.0f - ih;
                    float p = vCol * (1.0f - sCol);
                    float q = vCol * (1.0f - fh * sCol);
                    float t = vCol * (1.0f - (1.0f - fh) * sCol);
                    
                    float r = 1.0f, g = 1.0f, b = 1.0f;
                    switch (ih % 6) {
                        case 0: r = vCol; g = t; b = p; break;
                        case 1: r = q; g = vCol; b = p; break;
                        case 2: r = p; g = vCol; b = t; break;
                        case 3: r = p; g = q; b = vCol; break;
                        case 4: r = t; g = p; b = vCol; break;
                        case 5: r = vCol; g = p; b = q; break;
                    }
                    
                    uint8_t finalR = (uint8_t)(r * solidity * 255.0f);
                    uint8_t finalG = (uint8_t)(g * solidity * 255.0f);
                    uint8_t finalB = (uint8_t)(b * solidity * 255.0f);
                    uint8_t density = (uint8_t)(solidity * 255.0f);
                    
                    // set voxel
                    size_t idx = lx + lz * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE;
                    chunk->value[idx] = density;
                    chunk->color[idx * 3 + 0] = finalR;
                    chunk->color[idx * 3 + 1] = finalG;
                    chunk->color[idx * 3 + 2] = finalB;
                }
            }
        }
    }
    
    // recompute sum
    recomputeChunkSum(chunk);
}

// bindings
EMSCRIPTEN_BINDINGS(VoxelsModule)
{
    // voxels
    class_<Voxels>("Voxels");
    
    // chunk
    class_<VoxelChunk>("VoxelChunk");

    function("getChunkAt", &getChunkAt, allow_raw_pointers());
    function("getChunkAtPos", &getChunkAtPos, allow_raw_pointers());

    function("chunkValuesView", &chunkValuesView, allow_raw_pointers());
    function("chunkColorsView", &chunkColorsView, allow_raw_pointers());
    function("recomputeChunkSum", &recomputeChunkSum, allow_raw_pointers());
    
    // dirty mesh tracking
    function("isChunkDirty", &isChunkDirty, allow_raw_pointers());
    function("setChunkDirty", &setChunkDirty, allow_raw_pointers());
    function("clearChunkDirty", &clearChunkDirty, allow_raw_pointers());

    constant("CHUNK_BITS", CHUNK_BITS);
    constant("CHUNK_SIZE", CHUNK_SIZE);
    constant("CHUNK_MASK", CHUNK_MASK);
    constant("CHUNK_VOXELS", CHUNK_VOXELS);

    function("initVoxels", &initVoxels, allow_raw_pointers());

    // chunk geometry
    class_<ChunkGeometry>("ChunkGeometry")
        .property("positionsCount", &ChunkGeometry::positionsCount)
        .property("normalsCount", &ChunkGeometry::normalsCount)
        .property("colorsCount", &ChunkGeometry::colorsCount);

    function("allocateChunkGeometry", &allocateChunkGeometry, allow_raw_pointers());
    function("freeChunkGeometry", &freeChunkGeometry, allow_raw_pointers());

    function("chunkGeometryPositions", &chunkGeometryPositions, allow_raw_pointers());
    function("chunkGeometryNormals", &chunkGeometryNormals, allow_raw_pointers());
    function("chunkGeometryColors", &chunkGeometryColors, allow_raw_pointers());

    // mesh
    function("mesh", &mesh, allow_raw_pointers());

    // raycast
    class_<RaycastResult>("RaycastResult")
        .constructor<>()
        .property("hit", &RaycastResult::hit)
        .property("positionX", &RaycastResult::positionX)
        .property("positionY", &RaycastResult::positionY)
        .property("positionZ", &RaycastResult::positionZ)
        .property("normalX", &RaycastResult::normalX)
        .property("normalY", &RaycastResult::normalY)
        .property("normalZ", &RaycastResult::normalZ)
        .property("value", &RaycastResult::value)
        .property("r", &RaycastResult::r)
        .property("g", &RaycastResult::g)
        .property("b", &RaycastResult::b)
        .property("distance", &RaycastResult::distance)
        .property("voxelX", &RaycastResult::voxelX)
        .property("voxelY", &RaycastResult::voxelY)
        .property("voxelZ", &RaycastResult::voxelZ);

    function("raycastVoxels", &raycastVoxels, allow_raw_pointers());
    
    // generation
    function("generateChunk", &generateChunk, allow_raw_pointers());
    
    // voxel manipulation
    function("setVoxel", &setVoxel, allow_raw_pointers());
}

// large constants!
int edgeTable[256] = {
    0x0, 0x109, 0x203, 0x30a, 0x406, 0x50f, 0x605, 0x70c,
    0x80c, 0x905, 0xa0f, 0xb06, 0xc0a, 0xd03, 0xe09, 0xf00,
    0x190, 0x99, 0x393, 0x29a, 0x596, 0x49f, 0x795, 0x69c,
    0x99c, 0x895, 0xb9f, 0xa96, 0xd9a, 0xc93, 0xf99, 0xe90,
    0x230, 0x339, 0x33, 0x13a, 0x636, 0x73f, 0x435, 0x53c,
    0xa3c, 0xb35, 0x83f, 0x936, 0xe3a, 0xf33, 0xc39, 0xd30,
    0x3a0, 0x2a9, 0x1a3, 0xaa, 0x7a6, 0x6af, 0x5a5, 0x4ac,
    0xbac, 0xaa5, 0x9af, 0x8a6, 0xfaa, 0xea3, 0xda9, 0xca0,
    0x460, 0x569, 0x663, 0x76a, 0x66, 0x16f, 0x265, 0x36c,
    0xc6c, 0xd65, 0xe6f, 0xf66, 0x86a, 0x963, 0xa69, 0xb60,
    0x5f0, 0x4f9, 0x7f3, 0x6fa, 0x1f6, 0xff, 0x3f5, 0x2fc,
    0xdfc, 0xcf5, 0xfff, 0xef6, 0x9fa, 0x8f3, 0xbf9, 0xaf0,
    0x650, 0x759, 0x453, 0x55a, 0x256, 0x35f, 0x55, 0x15c,
    0xe5c, 0xf55, 0xc5f, 0xd56, 0xa5a, 0xb53, 0x859, 0x950,
    0x7c0, 0x6c9, 0x5c3, 0x4ca, 0x3c6, 0x2cf, 0x1c5, 0xcc,
    0xfcc, 0xec5, 0xdcf, 0xcc6, 0xbca, 0xac3, 0x9c9, 0x8c0,
    0x8c0, 0x9c9, 0xac3, 0xbca, 0xcc6, 0xdcf, 0xec5, 0xfcc,
    0xcc, 0x1c5, 0x2cf, 0x3c6, 0x4ca, 0x5c3, 0x6c9, 0x7c0,
    0x950, 0x859, 0xb53, 0xa5a, 0xd56, 0xc5f, 0xf55, 0xe5c,
    0x15c, 0x55, 0x35f, 0x256, 0x55a, 0x453, 0x759, 0x650,
    0xaf0, 0xbf9, 0x8f3, 0x9fa, 0xef6, 0xfff, 0xcf5, 0xdfc,
    0x2fc, 0x3f5, 0xff, 0x1f6, 0x6fa, 0x7f3, 0x4f9, 0x5f0,
    0xb60, 0xa69, 0x963, 0x86a, 0xf66, 0xe6f, 0xd65, 0xc6c,
    0x36c, 0x265, 0x16f, 0x66, 0x76a, 0x663, 0x569, 0x460,
    0xca0, 0xda9, 0xea3, 0xfaa, 0x8a6, 0x9af, 0xaa5, 0xbac,
    0x4ac, 0x5a5, 0x6af, 0x7a6, 0xaa, 0x1a3, 0x2a9, 0x3a0,
    0xd30, 0xc39, 0xf33, 0xe3a, 0x936, 0x83f, 0xb35, 0xa3c,
    0x53c, 0x435, 0x73f, 0x636, 0x13a, 0x33, 0x339, 0x230,
    0xe90, 0xf99, 0xc93, 0xd9a, 0xa96, 0xb9f, 0x895, 0x99c,
    0x69c, 0x795, 0x49f, 0x596, 0x29a, 0x393, 0x99, 0x190,
    0xf00, 0xe09, 0xd03, 0xc0a, 0xb06, 0xa0f, 0x905, 0x80c,
    0x70c, 0x605, 0x50f, 0x406, 0x30a, 0x203, 0x109, 0x0};

int triTable[256][16] = {
    {-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {0, 8, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {0, 1, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {1, 8, 3, 9, 8, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {1, 2, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {0, 8, 3, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {9, 2, 10, 0, 2, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {2, 8, 3, 2, 10, 8, 10, 9, 8, -1, -1, -1, -1, -1, -1, -1},
    {3, 11, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {0, 11, 2, 8, 11, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {1, 9, 0, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {1, 11, 2, 1, 9, 11, 9, 8, 11, -1, -1, -1, -1, -1, -1, -1},
    {3, 10, 1, 11, 10, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {0, 10, 1, 0, 8, 10, 8, 11, 10, -1, -1, -1, -1, -1, -1, -1},
    {3, 9, 0, 3, 11, 9, 11, 10, 9, -1, -1, -1, -1, -1, -1, -1},
    {9, 8, 10, 10, 8, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {4, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {4, 3, 0, 7, 3, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {0, 1, 9, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {4, 1, 9, 4, 7, 1, 7, 3, 1, -1, -1, -1, -1, -1, -1, -1},
    {1, 2, 10, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {3, 4, 7, 3, 0, 4, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1},
    {9, 2, 10, 9, 0, 2, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1},
    {2, 10, 9, 2, 9, 7, 2, 7, 3, 7, 9, 4, -1, -1, -1, -1},
    {8, 4, 7, 3, 11, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {11, 4, 7, 11, 2, 4, 2, 0, 4, -1, -1, -1, -1, -1, -1, -1},
    {9, 0, 1, 8, 4, 7, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1},
    {4, 7, 11, 9, 4, 11, 9, 11, 2, 9, 2, 1, -1, -1, -1, -1},
    {3, 10, 1, 3, 11, 10, 7, 8, 4, -1, -1, -1, -1, -1, -1, -1},
    {1, 11, 10, 1, 4, 11, 1, 0, 4, 7, 11, 4, -1, -1, -1, -1},
    {4, 7, 8, 9, 0, 11, 9, 11, 10, 11, 0, 3, -1, -1, -1, -1},
    {4, 7, 11, 4, 11, 9, 9, 11, 10, -1, -1, -1, -1, -1, -1, -1},
    {9, 5, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {9, 5, 4, 0, 8, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {0, 5, 4, 1, 5, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {8, 5, 4, 8, 3, 5, 3, 1, 5, -1, -1, -1, -1, -1, -1, -1},
    {1, 2, 10, 9, 5, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {3, 0, 8, 1, 2, 10, 4, 9, 5, -1, -1, -1, -1, -1, -1, -1},
    {5, 2, 10, 5, 4, 2, 4, 0, 2, -1, -1, -1, -1, -1, -1, -1},
    {2, 10, 5, 3, 2, 5, 3, 5, 4, 3, 4, 8, -1, -1, -1, -1},
    {9, 5, 4, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {0, 11, 2, 0, 8, 11, 4, 9, 5, -1, -1, -1, -1, -1, -1, -1},
    {0, 5, 4, 0, 1, 5, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1},
    {2, 1, 5, 2, 5, 8, 2, 8, 11, 4, 8, 5, -1, -1, -1, -1},
    {10, 3, 11, 10, 1, 3, 9, 5, 4, -1, -1, -1, -1, -1, -1, -1},
    {4, 9, 5, 0, 8, 1, 8, 10, 1, 8, 11, 10, -1, -1, -1, -1},
    {5, 4, 0, 5, 0, 11, 5, 11, 10, 11, 0, 3, -1, -1, -1, -1},
    {5, 4, 8, 5, 8, 10, 10, 8, 11, -1, -1, -1, -1, -1, -1, -1},
    {9, 7, 8, 5, 7, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {9, 3, 0, 9, 5, 3, 5, 7, 3, -1, -1, -1, -1, -1, -1, -1},
    {0, 7, 8, 0, 1, 7, 1, 5, 7, -1, -1, -1, -1, -1, -1, -1},
    {1, 5, 3, 3, 5, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {9, 7, 8, 9, 5, 7, 10, 1, 2, -1, -1, -1, -1, -1, -1, -1},
    {10, 1, 2, 9, 5, 0, 5, 3, 0, 5, 7, 3, -1, -1, -1, -1},
    {8, 0, 2, 8, 2, 5, 8, 5, 7, 10, 5, 2, -1, -1, -1, -1},
    {2, 10, 5, 2, 5, 3, 3, 5, 7, -1, -1, -1, -1, -1, -1, -1},
    {7, 9, 5, 7, 8, 9, 3, 11, 2, -1, -1, -1, -1, -1, -1, -1},
    {9, 5, 7, 9, 7, 2, 9, 2, 0, 2, 7, 11, -1, -1, -1, -1},
    {2, 3, 11, 0, 1, 8, 1, 7, 8, 1, 5, 7, -1, -1, -1, -1},
    {11, 2, 1, 11, 1, 7, 7, 1, 5, -1, -1, -1, -1, -1, -1, -1},
    {9, 5, 8, 8, 5, 7, 10, 1, 3, 10, 3, 11, -1, -1, -1, -1},
    {5, 7, 0, 5, 0, 9, 7, 11, 0, 1, 0, 10, 11, 10, 0, -1},
    {11, 10, 0, 11, 0, 3, 10, 5, 0, 8, 0, 7, 5, 7, 0, -1},
    {11, 10, 5, 7, 11, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {10, 6, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {0, 8, 3, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {9, 0, 1, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {1, 8, 3, 1, 9, 8, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1},
    {1, 6, 5, 2, 6, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {1, 6, 5, 1, 2, 6, 3, 0, 8, -1, -1, -1, -1, -1, -1, -1},
    {9, 6, 5, 9, 0, 6, 0, 2, 6, -1, -1, -1, -1, -1, -1, -1},
    {5, 9, 8, 5, 8, 2, 5, 2, 6, 3, 2, 8, -1, -1, -1, -1},
    {2, 3, 11, 10, 6, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {11, 0, 8, 11, 2, 0, 10, 6, 5, -1, -1, -1, -1, -1, -1, -1},
    {0, 1, 9, 2, 3, 11, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1},
    {5, 10, 6, 1, 9, 2, 9, 11, 2, 9, 8, 11, -1, -1, -1, -1},
    {6, 3, 11, 6, 5, 3, 5, 1, 3, -1, -1, -1, -1, -1, -1, -1},
    {0, 8, 11, 0, 11, 5, 0, 5, 1, 5, 11, 6, -1, -1, -1, -1},
    {3, 11, 6, 0, 3, 6, 0, 6, 5, 0, 5, 9, -1, -1, -1, -1},
    {6, 5, 9, 6, 9, 11, 11, 9, 8, -1, -1, -1, -1, -1, -1, -1},
    {5, 10, 6, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {4, 3, 0, 4, 7, 3, 6, 5, 10, -1, -1, -1, -1, -1, -1, -1},
    {1, 9, 0, 5, 10, 6, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1},
    {10, 6, 5, 1, 9, 7, 1, 7, 3, 7, 9, 4, -1, -1, -1, -1},
    {6, 1, 2, 6, 5, 1, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1},
    {1, 2, 5, 5, 2, 6, 3, 0, 4, 3, 4, 7, -1, -1, -1, -1},
    {8, 4, 7, 9, 0, 5, 0, 6, 5, 0, 2, 6, -1, -1, -1, -1},
    {7, 3, 9, 7, 9, 4, 3, 2, 9, 5, 9, 6, 2, 6, 9, -1},
    {3, 11, 2, 7, 8, 4, 10, 6, 5, -1, -1, -1, -1, -1, -1, -1},
    {5, 10, 6, 4, 7, 2, 4, 2, 0, 2, 7, 11, -1, -1, -1, -1},
    {0, 1, 9, 4, 7, 8, 2, 3, 11, 5, 10, 6, -1, -1, -1, -1},
    {9, 2, 1, 9, 11, 2, 9, 4, 11, 7, 11, 4, 5, 10, 6, -1},
    {8, 4, 7, 3, 11, 5, 3, 5, 1, 5, 11, 6, -1, -1, -1, -1},
    {5, 1, 11, 5, 11, 6, 1, 0, 11, 7, 11, 4, 0, 4, 11, -1},
    {0, 5, 9, 0, 6, 5, 0, 3, 6, 11, 6, 3, 8, 4, 7, -1},
    {6, 5, 9, 6, 9, 11, 4, 7, 9, 7, 11, 9, -1, -1, -1, -1},
    {10, 4, 9, 6, 4, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {4, 10, 6, 4, 9, 10, 0, 8, 3, -1, -1, -1, -1, -1, -1, -1},
    {10, 0, 1, 10, 6, 0, 6, 4, 0, -1, -1, -1, -1, -1, -1, -1},
    {8, 3, 1, 8, 1, 6, 8, 6, 4, 6, 1, 10, -1, -1, -1, -1},
    {1, 4, 9, 1, 2, 4, 2, 6, 4, -1, -1, -1, -1, -1, -1, -1},
    {3, 0, 8, 1, 2, 9, 2, 4, 9, 2, 6, 4, -1, -1, -1, -1},
    {0, 2, 4, 4, 2, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {8, 3, 2, 8, 2, 4, 4, 2, 6, -1, -1, -1, -1, -1, -1, -1},
    {10, 4, 9, 10, 6, 4, 11, 2, 3, -1, -1, -1, -1, -1, -1, -1},
    {0, 8, 2, 2, 8, 11, 4, 9, 10, 4, 10, 6, -1, -1, -1, -1},
    {3, 11, 2, 0, 1, 6, 0, 6, 4, 6, 1, 10, -1, -1, -1, -1},
    {6, 4, 1, 6, 1, 10, 4, 8, 1, 2, 1, 11, 8, 11, 1, -1},
    {9, 6, 4, 9, 3, 6, 9, 1, 3, 11, 6, 3, -1, -1, -1, -1},
    {8, 11, 1, 8, 1, 0, 11, 6, 1, 9, 1, 4, 6, 4, 1, -1},
    {3, 11, 6, 3, 6, 0, 0, 6, 4, -1, -1, -1, -1, -1, -1, -1},
    {6, 4, 8, 11, 6, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {7, 10, 6, 7, 8, 10, 8, 9, 10, -1, -1, -1, -1, -1, -1, -1},
    {0, 7, 3, 0, 10, 7, 0, 9, 10, 6, 7, 10, -1, -1, -1, -1},
    {10, 6, 7, 1, 10, 7, 1, 7, 8, 1, 8, 0, -1, -1, -1, -1},
    {10, 6, 7, 10, 7, 1, 1, 7, 3, -1, -1, -1, -1, -1, -1, -1},
    {1, 2, 6, 1, 6, 8, 1, 8, 9, 8, 6, 7, -1, -1, -1, -1},
    {2, 6, 9, 2, 9, 1, 6, 7, 9, 0, 9, 3, 7, 3, 9, -1},
    {7, 8, 0, 7, 0, 6, 6, 0, 2, -1, -1, -1, -1, -1, -1, -1},
    {7, 3, 2, 6, 7, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {2, 3, 11, 10, 6, 8, 10, 8, 9, 8, 6, 7, -1, -1, -1, -1},
    {2, 0, 7, 2, 7, 11, 0, 9, 7, 6, 7, 10, 9, 10, 7, -1},
    {1, 8, 0, 1, 7, 8, 1, 10, 7, 6, 7, 10, 2, 3, 11, -1},
    {11, 2, 1, 11, 1, 7, 10, 6, 1, 6, 7, 1, -1, -1, -1, -1},
    {8, 9, 6, 8, 6, 7, 9, 1, 6, 11, 6, 3, 1, 3, 6, -1},
    {0, 9, 1, 11, 6, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {7, 8, 0, 7, 0, 6, 3, 11, 0, 11, 6, 0, -1, -1, -1, -1},
    {7, 11, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {7, 6, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {3, 0, 8, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {0, 1, 9, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {8, 1, 9, 8, 3, 1, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1},
    {10, 1, 2, 6, 11, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {1, 2, 10, 3, 0, 8, 6, 11, 7, -1, -1, -1, -1, -1, -1, -1},
    {2, 9, 0, 2, 10, 9, 6, 11, 7, -1, -1, -1, -1, -1, -1, -1},
    {6, 11, 7, 2, 10, 3, 10, 8, 3, 10, 9, 8, -1, -1, -1, -1},
    {7, 2, 3, 6, 2, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {7, 0, 8, 7, 6, 0, 6, 2, 0, -1, -1, -1, -1, -1, -1, -1},
    {2, 7, 6, 2, 3, 7, 0, 1, 9, -1, -1, -1, -1, -1, -1, -1},
    {1, 6, 2, 1, 8, 6, 1, 9, 8, 8, 7, 6, -1, -1, -1, -1},
    {10, 7, 6, 10, 1, 7, 1, 3, 7, -1, -1, -1, -1, -1, -1, -1},
    {10, 7, 6, 1, 7, 10, 1, 8, 7, 1, 0, 8, -1, -1, -1, -1},
    {0, 3, 7, 0, 7, 10, 0, 10, 9, 6, 10, 7, -1, -1, -1, -1},
    {7, 6, 10, 7, 10, 8, 8, 10, 9, -1, -1, -1, -1, -1, -1, -1},
    {6, 8, 4, 11, 8, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {3, 6, 11, 3, 0, 6, 0, 4, 6, -1, -1, -1, -1, -1, -1, -1},
    {8, 6, 11, 8, 4, 6, 9, 0, 1, -1, -1, -1, -1, -1, -1, -1},
    {9, 4, 6, 9, 6, 3, 9, 3, 1, 11, 3, 6, -1, -1, -1, -1},
    {6, 8, 4, 6, 11, 8, 2, 10, 1, -1, -1, -1, -1, -1, -1, -1},
    {1, 2, 10, 3, 0, 11, 0, 6, 11, 0, 4, 6, -1, -1, -1, -1},
    {4, 11, 8, 4, 6, 11, 0, 2, 9, 2, 10, 9, -1, -1, -1, -1},
    {10, 9, 3, 10, 3, 2, 9, 4, 3, 11, 3, 6, 4, 6, 3, -1},
    {8, 2, 3, 8, 4, 2, 4, 6, 2, -1, -1, -1, -1, -1, -1, -1},
    {0, 4, 2, 4, 6, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {1, 9, 0, 2, 3, 4, 2, 4, 6, 4, 3, 8, -1, -1, -1, -1},
    {1, 9, 4, 1, 4, 2, 2, 4, 6, -1, -1, -1, -1, -1, -1, -1},
    {8, 1, 3, 8, 6, 1, 8, 4, 6, 6, 10, 1, -1, -1, -1, -1},
    {10, 1, 0, 10, 0, 6, 6, 0, 4, -1, -1, -1, -1, -1, -1, -1},
    {4, 6, 3, 4, 3, 8, 6, 10, 3, 0, 3, 9, 10, 9, 3, -1},
    {10, 9, 4, 6, 10, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {4, 9, 5, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {0, 8, 3, 4, 9, 5, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1},
    {5, 0, 1, 5, 4, 0, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1},
    {11, 7, 6, 8, 3, 4, 3, 5, 4, 3, 1, 5, -1, -1, -1, -1},
    {9, 5, 4, 10, 1, 2, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1},
    {6, 11, 7, 1, 2, 10, 0, 8, 3, 4, 9, 5, -1, -1, -1, -1},
    {7, 6, 11, 5, 4, 10, 4, 2, 10, 4, 0, 2, -1, -1, -1, -1},
    {3, 4, 8, 3, 5, 4, 3, 2, 5, 10, 5, 2, 11, 7, 6, -1},
    {7, 2, 3, 7, 6, 2, 5, 4, 9, -1, -1, -1, -1, -1, -1, -1},
    {9, 5, 4, 0, 8, 6, 0, 6, 2, 6, 8, 7, -1, -1, -1, -1},
    {3, 6, 2, 3, 7, 6, 1, 5, 0, 5, 4, 0, -1, -1, -1, -1},
    {6, 2, 8, 6, 8, 7, 2, 1, 8, 4, 8, 5, 1, 5, 8, -1},
    {9, 5, 4, 10, 1, 6, 1, 7, 6, 1, 3, 7, -1, -1, -1, -1},
    {1, 6, 10, 1, 7, 6, 1, 0, 7, 8, 7, 0, 9, 5, 4, -1},
    {4, 0, 10, 4, 10, 5, 0, 3, 10, 6, 10, 7, 3, 7, 10, -1},
    {7, 6, 10, 7, 10, 8, 5, 4, 10, 4, 8, 10, -1, -1, -1, -1},
    {6, 9, 5, 6, 11, 9, 11, 8, 9, -1, -1, -1, -1, -1, -1, -1},
    {3, 6, 11, 0, 6, 3, 0, 5, 6, 0, 9, 5, -1, -1, -1, -1},
    {0, 11, 8, 0, 5, 11, 0, 1, 5, 5, 6, 11, -1, -1, -1, -1},
    {6, 11, 3, 6, 3, 5, 5, 3, 1, -1, -1, -1, -1, -1, -1, -1},
    {1, 2, 10, 9, 5, 11, 9, 11, 8, 11, 5, 6, -1, -1, -1, -1},
    {0, 11, 3, 0, 6, 11, 0, 9, 6, 5, 6, 9, 1, 2, 10, -1},
    {11, 8, 5, 11, 5, 6, 8, 0, 5, 10, 5, 2, 0, 2, 5, -1},
    {6, 11, 3, 6, 3, 5, 2, 10, 3, 10, 5, 3, -1, -1, -1, -1},
    {5, 8, 9, 5, 2, 8, 5, 6, 2, 3, 8, 2, -1, -1, -1, -1},
    {9, 5, 6, 9, 6, 0, 0, 6, 2, -1, -1, -1, -1, -1, -1, -1},
    {1, 5, 8, 1, 8, 0, 5, 6, 8, 3, 8, 2, 6, 2, 8, -1},
    {1, 5, 6, 2, 1, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {1, 3, 6, 1, 6, 10, 3, 8, 6, 5, 6, 9, 8, 9, 6, -1},
    {10, 1, 0, 10, 0, 6, 9, 5, 0, 5, 6, 0, -1, -1, -1, -1},
    {0, 3, 8, 5, 6, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {10, 5, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {11, 5, 10, 7, 5, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {11, 5, 10, 11, 7, 5, 8, 3, 0, -1, -1, -1, -1, -1, -1, -1},
    {5, 11, 7, 5, 10, 11, 1, 9, 0, -1, -1, -1, -1, -1, -1, -1},
    {10, 7, 5, 10, 11, 7, 9, 8, 1, 8, 3, 1, -1, -1, -1, -1},
    {11, 1, 2, 11, 7, 1, 7, 5, 1, -1, -1, -1, -1, -1, -1, -1},
    {0, 8, 3, 1, 2, 7, 1, 7, 5, 7, 2, 11, -1, -1, -1, -1},
    {9, 7, 5, 9, 2, 7, 9, 0, 2, 2, 11, 7, -1, -1, -1, -1},
    {7, 5, 2, 7, 2, 11, 5, 9, 2, 3, 2, 8, 9, 8, 2, -1},
    {2, 5, 10, 2, 3, 5, 3, 7, 5, -1, -1, -1, -1, -1, -1, -1},
    {8, 2, 0, 8, 5, 2, 8, 7, 5, 10, 2, 5, -1, -1, -1, -1},
    {9, 0, 1, 5, 10, 3, 5, 3, 7, 3, 10, 2, -1, -1, -1, -1},
    {9, 8, 2, 9, 2, 1, 8, 7, 2, 10, 2, 5, 7, 5, 2, -1},
    {1, 3, 5, 3, 7, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {0, 8, 7, 0, 7, 1, 1, 7, 5, -1, -1, -1, -1, -1, -1, -1},
    {9, 0, 3, 9, 3, 5, 5, 3, 7, -1, -1, -1, -1, -1, -1, -1},
    {9, 8, 7, 5, 9, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {5, 8, 4, 5, 10, 8, 10, 11, 8, -1, -1, -1, -1, -1, -1, -1},
    {5, 0, 4, 5, 11, 0, 5, 10, 11, 11, 3, 0, -1, -1, -1, -1},
    {0, 1, 9, 8, 4, 10, 8, 10, 11, 10, 4, 5, -1, -1, -1, -1},
    {10, 11, 4, 10, 4, 5, 11, 3, 4, 9, 4, 1, 3, 1, 4, -1},
    {2, 5, 1, 2, 8, 5, 2, 11, 8, 4, 5, 8, -1, -1, -1, -1},
    {0, 4, 11, 0, 11, 3, 4, 5, 11, 2, 11, 1, 5, 1, 11, -1},
    {0, 2, 5, 0, 5, 9, 2, 11, 5, 4, 5, 8, 11, 8, 5, -1},
    {9, 4, 5, 2, 11, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {2, 5, 10, 3, 5, 2, 3, 4, 5, 3, 8, 4, -1, -1, -1, -1},
    {5, 10, 2, 5, 2, 4, 4, 2, 0, -1, -1, -1, -1, -1, -1, -1},
    {3, 10, 2, 3, 5, 10, 3, 8, 5, 4, 5, 8, 0, 1, 9, -1},
    {5, 10, 2, 5, 2, 4, 1, 9, 2, 9, 4, 2, -1, -1, -1, -1},
    {8, 4, 5, 8, 5, 3, 3, 5, 1, -1, -1, -1, -1, -1, -1, -1},
    {0, 4, 5, 1, 0, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {8, 4, 5, 8, 5, 3, 9, 0, 5, 0, 3, 5, -1, -1, -1, -1},
    {9, 4, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {4, 11, 7, 4, 9, 11, 9, 10, 11, -1, -1, -1, -1, -1, -1, -1},
    {0, 8, 3, 4, 9, 7, 9, 11, 7, 9, 10, 11, -1, -1, -1, -1},
    {1, 10, 11, 1, 11, 4, 1, 4, 0, 7, 4, 11, -1, -1, -1, -1},
    {3, 1, 4, 3, 4, 8, 1, 10, 4, 7, 4, 11, 10, 11, 4, -1},
    {4, 11, 7, 9, 11, 4, 9, 2, 11, 9, 1, 2, -1, -1, -1, -1},
    {9, 7, 4, 9, 11, 7, 9, 1, 11, 2, 11, 1, 0, 8, 3, -1},
    {11, 7, 4, 11, 4, 2, 2, 4, 0, -1, -1, -1, -1, -1, -1, -1},
    {11, 7, 4, 11, 4, 2, 8, 3, 4, 3, 2, 4, -1, -1, -1, -1},
    {2, 9, 10, 2, 7, 9, 2, 3, 7, 7, 4, 9, -1, -1, -1, -1},
    {9, 10, 7, 9, 7, 4, 10, 2, 7, 8, 7, 0, 2, 0, 7, -1},
    {3, 7, 10, 3, 10, 2, 7, 4, 10, 1, 10, 0, 4, 0, 10, -1},
    {1, 10, 2, 8, 7, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {4, 9, 1, 4, 1, 7, 7, 1, 3, -1, -1, -1, -1, -1, -1, -1},
    {4, 9, 1, 4, 1, 7, 0, 8, 1, 8, 7, 1, -1, -1, -1, -1},
    {4, 0, 3, 7, 4, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {4, 8, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {9, 10, 8, 10, 11, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {3, 0, 9, 3, 9, 11, 11, 9, 10, -1, -1, -1, -1, -1, -1, -1},
    {0, 1, 10, 0, 10, 8, 8, 10, 11, -1, -1, -1, -1, -1, -1, -1},
    {3, 1, 10, 11, 3, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {1, 2, 11, 1, 11, 9, 9, 11, 8, -1, -1, -1, -1, -1, -1, -1},
    {3, 0, 9, 3, 9, 11, 1, 2, 9, 2, 11, 9, -1, -1, -1, -1},
    {0, 2, 11, 8, 0, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {3, 2, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {2, 3, 8, 2, 8, 10, 10, 8, 9, -1, -1, -1, -1, -1, -1, -1},
    {9, 10, 2, 0, 9, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {2, 3, 8, 2, 8, 10, 0, 1, 8, 1, 10, 8, -1, -1, -1, -1},
    {1, 10, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {1, 3, 8, 9, 1, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {0, 9, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {0, 3, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    {-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1}};
