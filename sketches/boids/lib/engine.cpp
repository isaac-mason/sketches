#include <emscripten/bind.h>
#include <cstdlib>
#include <cmath>
#include <algorithm>
#include <cstdio>
#include <vector>

using namespace emscripten;

float randFloat(float min, float max)
{
    return min + (float(rand()) / float(RAND_MAX)) * (max - min);
}

struct Vec3
{
    Vec3() : x(0), y(0), z(0) {}
    Vec3(float x, float y, float z) : x(x), y(y), z(z) {}
    float x, y, z;

    Vec3 operator-(const Vec3& v) const { return {x - v.x, y - v.y, z - v.z}; }
    Vec3 operator+(const Vec3& v) const { return {x + v.x, y + v.y, z + v.z}; }
    Vec3 operator*(float s) const { return {x * s, y * s, z * s}; }

    float length() const { return std::sqrt(x * x + y * y + z * z); }
};

void lerp (const Vec3 &a, const Vec3 &b, Vec3 &out, float t)
{
    out.x = (1 - t) * a.x + t * b.x;
    out.y = (1 - t) * a.y + t * b.y;
    out.z = (1 - t) * a.z + t * b.z;
}

struct SpatialHashGrid
{
    int *grid;                            // Array to store object IDs in the grid
    int *gridNext;                        // Linked list for collisions (next index in the grid)
    int gridSize;                         // Total number of cells in the grid
    int cellSize;                         // Size of each cell
    int gridWidth, gridHeight, gridDepth; // Dimensions of the grid
    int maxObjects;                       // Maximum number of objects that can be stored
    int *objectCell;                      // Array to track which cell each object is in

    SpatialHashGrid(int worldWidth, int worldHeight, int worldDepth, int cellSize, int maxObjects)
        : cellSize(cellSize), maxObjects(maxObjects)
    {
        gridWidth = (worldWidth + cellSize - 1) / cellSize;
        gridHeight = (worldHeight + cellSize - 1) / cellSize;
        gridDepth = (worldDepth + cellSize - 1) / cellSize;
        gridSize = gridWidth * gridHeight * gridDepth;

        grid = (int *)malloc(gridSize * sizeof(int));
        gridNext = (int *)malloc(maxObjects * sizeof(int));
        objectCell = (int *)malloc(maxObjects * sizeof(int));

        clear();
    }

    ~SpatialHashGrid()
    {
        free(grid);
        free(gridNext);
        free(objectCell);
    }

    void clear()
    {
        for (int i = 0; i < gridSize; ++i)
        {
            grid[i] = -1; // -1 indicates an empty cell
        }
        for (int i = 0; i < maxObjects; ++i)
        {
            gridNext[i] = -1;   // -1 indicates no next object
            objectCell[i] = -1; // -1 indicates the object is not in the grid
        }
    }

    int computeHashKey(int x, int y, int z) const
    {
        return x + y * gridWidth + z * gridWidth * gridHeight;
    }

    void addObject(int objectId, const Vec3 &position)
    {
        if (objectId < 0 || objectId >= maxObjects)
        {
            return; // Invalid objectId
        }

        int cellX = (int)(position.x / cellSize);
        int cellY = (int)(position.y / cellSize);
        int cellZ = (int)(position.z / cellSize);

        if (cellX < 0 || cellX >= gridWidth || cellY < 0 || cellY >= gridHeight || cellZ < 0 || cellZ >= gridDepth)
        {
            return; // Out of bounds
        }

        int key = computeHashKey(cellX, cellY, cellZ);
        if (key < 0 || key >= gridSize)
        {
            return; // Invalid key
        }

        gridNext[objectId] = grid[key];
        grid[key] = objectId;
        objectCell[objectId] = key;
    }

    void removeObject(int objectId)
    {
        if (objectId < 0 || objectId >= maxObjects)
        {
            return; // Invalid objectId
        }

        int key = objectCell[objectId];
        if (key == -1 || key >= gridSize)
        {
            return; // Object is not in the grid or invalid key
        }

        int *current = &grid[key];
        while (*current != -1)
        {
            if (*current == objectId)
            {
                *current = gridNext[objectId];
                break;
            }
            current = &gridNext[*current];
        }

        gridNext[objectId] = -1;
        objectCell[objectId] = -1;
    }

    void updateObject(int objectId, const Vec3 &position)
    {
        if (objectId < 0 || objectId >= maxObjects)
        {
            return; // Invalid objectId
        }

        int cellX = (int)(position.x / cellSize);
        int cellY = (int)(position.y / cellSize);
        int cellZ = (int)(position.z / cellSize);

        if (cellX < 0 || cellX >= gridWidth || cellY < 0 || cellY >= gridHeight || cellZ < 0 || cellZ >= gridDepth)
        {
            removeObject(objectId);
            return; // Out of bounds
        }

        int newKey = computeHashKey(cellX, cellY, cellZ);
        if (newKey < 0 || newKey >= gridSize)
        {
            removeObject(objectId);
            return; // Invalid key
        }

        if (newKey == objectCell[objectId])
        {
            return; // Object is already in the correct cell
        }

        removeObject(objectId);
        addObject(objectId, position);
    }

    void queryCube(const Vec3 &origin, float size, const std::function<void(int)> &callback) const
    {
        int startX = std::max(0, (int)((origin.x - size) / cellSize));
        int startY = std::max(0, (int)((origin.y - size) / cellSize));
        int startZ = std::max(0, (int)((origin.z - size) / cellSize));

        int endX = std::min(gridWidth - 1, (int)((origin.x + size) / cellSize));
        int endY = std::min(gridHeight - 1, (int)((origin.y + size) / cellSize));
        int endZ = std::min(gridDepth - 1, (int)((origin.z + size) / cellSize));

        for (int z = startZ; z <= endZ; ++z)
        {
            for (int y = startY; y <= endY; ++y)
            {
                for (int x = startX; x <= endX; ++x)
                {
                    int key = computeHashKey(x, y, z);
                    int current = grid[key];
                    while (current != -1)
                    {
                        callback(current);
                        current = gridNext[current];
                    }
                }
            }
        }
    }
};

struct Boid
{
    int id;
    Vec3 position;
    Vec3 prvPosition;
    Vec3 velocity;
    Vec3 interpolatedPosition;
    Vec3 interpolatedVelocity;
    int spatialIndex;
};

struct World
{
    Boid *boids;
    int numBoids;

    float time;
    float accumulator;
    float fixedTimeStep;

    Vec3 worldSize;
    float boundsRadius;
    Vec3 boundsCenter;

    float cellSize;
    SpatialHashGrid spatialHash;

    World(int numBoids, Vec3 worldSize, float cellSize, float fixedTimeStep, float boundsRadius, Vec3 boundsCenter)
        : numBoids(numBoids), time(0.0f), accumulator(0.0f), worldSize(worldSize), cellSize(cellSize),
          spatialHash(worldSize.x, worldSize.y, worldSize.z, cellSize, numBoids),
          fixedTimeStep(fixedTimeStep), boundsRadius(boundsRadius), boundsCenter(boundsCenter)
    {
        boids = (Boid *)malloc(numBoids * sizeof(Boid));

        for (int i = 0; i < numBoids; ++i)
        {
            boids[i].id = i;
            boids[i].position = {randFloat(-boundsRadius, boundsRadius), randFloat(-boundsRadius, boundsRadius), randFloat(-boundsRadius, boundsRadius)};
            boids[i].prvPosition = boids[i].position;
            boids[i].velocity = {randFloat(-1.0f, 1.0f), randFloat(-1.0f, 1.0f), randFloat(-1.0f, 1.0f)};
            boids[i].spatialIndex = i;
            spatialHash.addObject(boids[i].id, boids[i].position);
        }
    }

    ~World()
    {
        free(boids);
    }
};

struct Input
{
    float separationWeight;
    float alignmentWeight;
    float cohesionWeight;
    float maxSpeed;
    float minSpeed;
    float neighborRadius;
};

void boidVelocityUpdate(World *world, const Input &input)
{
    for (int i = 0; i < world->numBoids; ++i)
    {
        Boid *boid = &world->boids[i];

        Vec3 separation = {0.0f, 0.0f, 0.0f};
        Vec3 alignment = {0.0f, 0.0f, 0.0f};
        Vec3 cohesion = {0.0f, 0.0f, 0.0f};
        int neighborCount = 0;

        world->spatialHash.queryCube(boid->position, input.neighborRadius, [&](int neighborId)
                                     {
            if (neighborId != boid->id)
            {
                Boid *neighbor = &world->boids[neighborId];
                Vec3 diff = {
                    boid->position.x - neighbor->position.x,
                    boid->position.y - neighbor->position.y,
                    boid->position.z - neighbor->position.z};
    
                float distanceSquared = diff.x * diff.x + diff.y * diff.y + diff.z * diff.z;
                if (distanceSquared < input.neighborRadius * input.neighborRadius)
                {
                    // Separation: steer to avoid crowding local flockmates
                    separation.x += diff.x / distanceSquared;
                    separation.y += diff.y / distanceSquared;
                    separation.z += diff.z / distanceSquared;
    
                    // Alignment: steer towards the average heading of local flockmates
                    alignment.x += neighbor->velocity.x;
                    alignment.y += neighbor->velocity.y;
                    alignment.z += neighbor->velocity.z;
    
                    // Cohesion: steer to move towards the average position of local flockmates
                    cohesion.x += neighbor->position.x;
                    cohesion.y += neighbor->position.y;
                    cohesion.z += neighbor->position.z;
    
                    neighborCount++;
                }
            } });

        if (neighborCount > 0)
        {
            // Finalize alignment and cohesion
            alignment.x /= neighborCount;
            alignment.y /= neighborCount;
            alignment.z /= neighborCount;

            cohesion.x /= neighborCount;
            cohesion.y /= neighborCount;
            cohesion.z /= neighborCount;

            cohesion.x -= boid->position.x;
            cohesion.y -= boid->position.y;
            cohesion.z -= boid->position.z;
        }

        // Combine forces using dynamic weights from the input struct
        boid->velocity.x += input.separationWeight * separation.x +
                            input.alignmentWeight * alignment.x +
                            input.cohesionWeight * cohesion.x;

        boid->velocity.y += input.separationWeight * separation.y +
                            input.alignmentWeight * alignment.y +
                            input.cohesionWeight * cohesion.y;

        boid->velocity.z += input.separationWeight * separation.z +
                            input.alignmentWeight * alignment.z +
                            input.cohesionWeight * cohesion.z;

        // Limit velocity to a maximum speed
        float speed = std::sqrt(boid->velocity.x * boid->velocity.x +
                                boid->velocity.y * boid->velocity.y +
                                boid->velocity.z * boid->velocity.z);
        if (speed > input.maxSpeed)
        {
            boid->velocity.x = (boid->velocity.x / speed) * input.maxSpeed;
            boid->velocity.y = (boid->velocity.y / speed) * input.maxSpeed;
            boid->velocity.z = (boid->velocity.z / speed) * input.maxSpeed;
        }

        // Ensure a minimum speed
        if (speed < input.minSpeed && speed > 0.0f)
        {
            boid->velocity.x = (boid->velocity.x / speed) * input.minSpeed;
            boid->velocity.y = (boid->velocity.y / speed) * input.minSpeed;
            boid->velocity.z = (boid->velocity.z / speed) * input.minSpeed;
        }
    }
}

void physicsUpdate(World *world)
{
    for (int i = 0; i < world->numBoids; ++i)
    {
        Boid *boid = &world->boids[i];

        // Store previous position for interpolation
        boid->prvPosition = boid->position;

        // Apply velocity to position
        boid->position.x += boid->velocity.x * world->fixedTimeStep;
        boid->position.y += boid->velocity.y * world->fixedTimeStep;
        boid->position.z += boid->velocity.z * world->fixedTimeStep;

        // Constrain position to a spherical boundary
        Vec3 diff = boid->position - world->boundsCenter;
        float distance = diff.length();
        if (distance > world->boundsRadius)
        {
            // Push the boid back inside the sphere
            diff = diff * (1.0f / distance); // Normalize
            boid->position = world->boundsCenter + diff * world->boundsRadius;

            // Reflect velocity
            float dotProduct = boid->velocity.x * diff.x + boid->velocity.y * diff.y + boid->velocity.z * diff.z;
            boid->velocity.x -= 2.0f * dotProduct * diff.x;
            boid->velocity.y -= 2.0f * dotProduct * diff.y;
            boid->velocity.z -= 2.0f * dotProduct * diff.z;
        }
    }
}

void fixedUpdate(World *world, const Input &input)
{
    for (int i = 0; i < world->numBoids; ++i)
    {
        Boid *boid = &world->boids[i];
        world->spatialHash.updateObject(boid->id, boid->position);
    }

    boidVelocityUpdate(world, input);

    physicsUpdate(world);
}

void deltaUpdate(World *world, float deltaTime)
{
    float alpha = world->accumulator / world->fixedTimeStep;
    for (int i = 0; i < world->numBoids; ++i)
    {
        Boid *boid = &world->boids[i];
        lerp(boid->prvPosition, boid->position, boid->interpolatedPosition, alpha);
        lerp(boid->velocity, boid->velocity, boid->interpolatedVelocity, alpha);
    }
}

void update(World *world, float deltaTime, const Input &input)
{
    world->accumulator += deltaTime;

    if (world->accumulator > world->fixedTimeStep * 10)
    {
        world->accumulator = world->fixedTimeStep;
    }

    while (world->accumulator >= world->fixedTimeStep)
    {
        fixedUpdate(world, input);

        world->time += world->fixedTimeStep;
        world->accumulator -= world->fixedTimeStep;
    }

    deltaUpdate(world, deltaTime);
}

EMSCRIPTEN_BINDINGS(Engine)
{
    class_<Vec3>("Vec3")
        .constructor<float, float, float>()
        .property("x", &Vec3::x)
        .property("y", &Vec3::y)
        .property("z", &Vec3::z);

    class_<Boid>("Boid");

    class_<World>("World")
        .constructor<int, Vec3, float, float, float, Vec3>()
        .property("numBoids", &World::numBoids)
        .property("boids", &World::boids, allow_raw_pointers());

    class_<Input>("Input")
        .constructor<>()
        .property("separationWeight", &Input::separationWeight)
        .property("alignmentWeight", &Input::alignmentWeight)
        .property("cohesionWeight", &Input::cohesionWeight)
        .property("maxSpeed", &Input::maxSpeed)
        .property("minSpeed", &Input::minSpeed)
        .property("neighborRadius", &Input::neighborRadius);

    function("update", select_overload<void(World *, float, const Input &)>(&update), allow_raw_pointers());

    constant("BOID_SIZE", sizeof(Boid));
    constant("BOID_INTERPOLATED_POSITION_OFFSET", offsetof(Boid, interpolatedPosition));
    constant("BOID_INTERPOLATED_VELOCITY_OFFSET", offsetof(Boid, interpolatedVelocity));
}