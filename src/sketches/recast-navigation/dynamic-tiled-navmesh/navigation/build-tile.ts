import {
    Arrays,
    NavMeshCreateParams,
    Raw,
    RecastBuildContext,
    RecastCompactHeightfield,
    RecastConfig,
    RecastContourSet,
    RecastHeightfield,
    Vector3Tuple,
    allocCompactHeightfield,
    allocContourSet,
    allocHeightfield,
    allocPolyMesh,
    allocPolyMeshDetail,
    buildCompactHeightfield,
    buildContours,
    buildDistanceField,
    buildPolyMesh,
    buildPolyMeshDetail,
    buildRegions,
    calcGridSize,
    cloneRcConfig,
    createHeightfield,
    createNavMeshData,
    createRcConfig,
    erodeWalkableArea,
    filterLedgeSpans,
    filterLowHangingWalkableObstacles,
    filterWalkableLowHeightSpans,
    freeCompactHeightfield,
    freeContourSet,
    freeHeightfield,
    markWalkableTriangles,
    rasterizeTriangles,
    vec3,
} from '@recast-navigation/core'
import { dtIlog2, dtNextPow2 } from '@recast-navigation/generators'
import * as THREE from 'three'

const getTrianglesInBox = (positions: ArrayLike<number>, indices: ArrayLike<number>, box: THREE.Box3): number[] => {
    const triangles: number[] = []

    const v0 = new THREE.Vector3()
    const v1 = new THREE.Vector3()
    const v2 = new THREE.Vector3()
    const triangle = new THREE.Triangle()

    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i]
        const b = indices[i + 1]
        const c = indices[i + 2]

        v0.fromArray(positions, a * 3)
        v1.fromArray(positions, b * 3)
        v2.fromArray(positions, c * 3)

        triangle.set(v0, v1, v2)

        if (triangle.intersectsBox(box)) {
            triangles.push(a, b, c)
        }
    }

    return triangles
}

type BuildConfigProps = {
    recastConfig: RecastConfig
    navMeshBounds: [min: Vector3Tuple, max: Vector3Tuple]
}

export const buildConfig = ({ recastConfig, navMeshBounds: [navMeshBoundsMin, navMeshBoundsMax] }: BuildConfigProps) => {
    //
    // Initialize build config.
    //
    const config = createRcConfig(recastConfig)

    /* grid size */
    const gridSize = calcGridSize(navMeshBoundsMin, navMeshBoundsMax, config.cs)
    config.width = gridSize.width
    config.height = gridSize.height

    config.minRegionArea = config.minRegionArea * config.minRegionArea // Note: area = size*size
    config.mergeRegionArea = config.mergeRegionArea * config.mergeRegionArea // Note: area = size*size
    config.tileSize = Math.floor(config.tileSize)
    config.borderSize = config.walkableRadius + 3 // Reserve enough padding.
    config.width = config.tileSize + config.borderSize * 2
    config.height = config.tileSize + config.borderSize * 2
    config.detailSampleDist = config.detailSampleDist < 0.9 ? 0 : config.cs * config.detailSampleDist
    config.detailSampleMaxError = config.ch * config.detailSampleMaxError

    // tile size
    const tileSize = Math.floor(config.tileSize)
    const tileWidth = Math.floor((gridSize.width + tileSize - 1) / tileSize)
    const tileHeight = Math.floor((gridSize.height + tileSize - 1) / tileSize)
    const tcs = config.tileSize * config.cs

    /* Create dtNavMeshParams, initialise nav mesh for tiled use */
    const orig = vec3.fromArray(navMeshBoundsMin)

    // Max tiles and max polys affect how the tile IDs are caculated.
    // There are 22 bits available for identifying a tile and a polygon.
    let tileBits = Math.min(Math.floor(dtIlog2(dtNextPow2(tileWidth * tileHeight))), 14)
    if (tileBits > 14) tileBits = 14
    const polyBits = 22 - tileBits

    const maxTiles = 1 << tileBits
    const maxPolysPerTile = 1 << polyBits

    return {
        config,
        orig,
        tileBits,
        polyBits,
        maxTiles,
        maxPolysPerTile,
        tcs,
        tileWidth,
        tileHeight,
    }
}

export type TileIntermediates = {
    tileX: number
    tileY: number
    heightfield?: RecastHeightfield
    compactHeightfield?: RecastCompactHeightfield
    contourSet?: RecastContourSet
}

export type BuildTileMeshProps = {
    positions: Float32Array
    indices: Uint32Array
    recastConfig: RecastConfig
    tileX: number
    tileY: number
    tileBoundsMin: Vector3Tuple
    tileBoundsMax: Vector3Tuple
    navMeshBounds: [Vector3Tuple, Vector3Tuple]
    keepIntermediates: boolean
}

export type BuildTileMeshResult = (
    | { success: true; data?: InstanceType<typeof Arrays.UnsignedCharArray> }
    | { success: false; error: string }
) & {
    tileIntermediates?: TileIntermediates
    buildContext: RecastBuildContext
}

export const buildTile = ({
    positions,
    indices,
    navMeshBounds,
    recastConfig,
    tileX,
    tileY,
    tileBoundsMin,
    tileBoundsMax,
    keepIntermediates,
}: BuildTileMeshProps): BuildTileMeshResult => {
    const buildContext = new RecastBuildContext()

    /* verts and tris */
    const verts = positions as ArrayLike<number> as number[]
    const nVerts = indices.length
    const vertsArray = new Arrays.VertsArray()
    vertsArray.copy(verts, verts.length)

    const tris = indices as ArrayLike<number> as number[]
    const nTris = indices.length / 3
    const trisArray = new Arrays.TrisArray()
    trisArray.copy(tris, tris.length)

    const tileIntermediates: TileIntermediates = { tileX, tileY }

    const cleanup = () => {
        if (keepIntermediates) return

        if (tileIntermediates.compactHeightfield) {
            freeCompactHeightfield(tileIntermediates.compactHeightfield)
        }

        if (tileIntermediates.heightfield) {
            freeHeightfield(tileIntermediates.heightfield)
        }

        if (tileIntermediates.contourSet) {
            freeContourSet(tileIntermediates.contourSet)
        }
    }

    const failTileMesh = (error: string) => {
        buildContext.log(Raw.Module.RC_LOG_ERROR, error)

        cleanup()

        return { success: false as const, error, tileIntermediates, buildContext }
    }

    const { config } = buildConfig({ recastConfig, navMeshBounds: navMeshBounds })
    const tileConfig = cloneRcConfig(config)

    // Expand the heightfield bounding box by border size to find the extents of geometry we need to build this tile.
    //
    // This is done in order to make sure that the navmesh tiles connect correctly at the borders,
    // and the obstacles close to the border work correctly with the dilation process.
    // No polygons (or contours) will be created on the border area.
    //
    // IMPORTANT!
    //
    //   :''''''''':
    //   : +-----+ :
    //   : |     | :
    //   : |     |<--- tile to build
    //   : |     | :
    //   : +-----+ :<-- geometry needed
    //   :.........:
    //
    // You should use this bounding box to query your input geometry.
    //
    // For example if you build a navmesh for terrain, and want the navmesh tiles to match the terrain tile size
    // you will need to pass in data from neighbour terrain tiles too! In a simple case, just pass in all the 8 neighbours,
    // or use the bounding box below to only pass in a sliver of each of the 8 neighbours.

    const expandedTileBoundsMin = [...tileBoundsMin] as Vector3Tuple
    const expandedTileBoundsMax = [...tileBoundsMax] as Vector3Tuple

    expandedTileBoundsMin[0] -= tileConfig.borderSize * tileConfig.cs
    expandedTileBoundsMin[2] -= tileConfig.borderSize * tileConfig.cs

    expandedTileBoundsMax[0] += tileConfig.borderSize * tileConfig.cs
    expandedTileBoundsMax[2] += tileConfig.borderSize * tileConfig.cs

    tileConfig.set_bmin(0, expandedTileBoundsMin[0])
    tileConfig.set_bmin(1, expandedTileBoundsMin[1])
    tileConfig.set_bmin(2, expandedTileBoundsMin[2])

    tileConfig.set_bmax(0, expandedTileBoundsMax[0])
    tileConfig.set_bmax(1, expandedTileBoundsMax[1])
    tileConfig.set_bmax(2, expandedTileBoundsMax[2])

    // Reset build timer
    buildContext.resetTimers()

    // Start the build process
    buildContext.startTimer(Raw.Module.RC_TIMER_TOTAL)

    buildContext.log(Raw.Module.RC_LOG_PROGRESS, `Building tile at x: ${tileX}, y: ${tileY}`)
    buildContext.log(Raw.Module.RC_LOG_PROGRESS, ` - ${config.width} x ${config.height} cells`)
    buildContext.log(Raw.Module.RC_LOG_PROGRESS, ` - ${nVerts / 1000}fK verts, ${nTris / 1000}K tris`)

    // Allocate voxel heightfield where we rasterize our input data to.
    const heightfield = allocHeightfield()
    tileIntermediates.heightfield = heightfield

    if (
        !createHeightfield(
            buildContext,
            heightfield,
            tileConfig.width,
            tileConfig.height,
            expandedTileBoundsMin,
            expandedTileBoundsMax,
            tileConfig.cs,
            tileConfig.ch,
        )
    ) {
        return failTileMesh('Could not create heightfield')
    }

    // get triangles overlapping rect
    const tileBounds = new THREE.Box3(
        new THREE.Vector3(expandedTileBoundsMin[0], expandedTileBoundsMin[1], expandedTileBoundsMin[2]),
        new THREE.Vector3(expandedTileBoundsMax[0], expandedTileBoundsMax[1], expandedTileBoundsMax[2]),
    )

    const trianglesInTileBounds = getTrianglesInBox(positions, indices, tileBounds)
    const nTrianglesInTileBounds = trianglesInTileBounds.length / 3

    const trisInBoundsArray = new Arrays.TrisArray()
    trisInBoundsArray.copy(trianglesInTileBounds, trianglesInTileBounds.length)

    const triAreasArray = new Arrays.TriAreasArray()
    triAreasArray.resize(nTrianglesInTileBounds)

    // Find triangles which are walkable based on their slope and rasterize them.
    // If your input data is multiple meshes, you can transform them here, calculate
    // the are type for each of the meshes and rasterize them.
    markWalkableTriangles(
        buildContext,
        tileConfig.walkableSlopeAngle,
        vertsArray,
        nVerts,
        trisInBoundsArray,
        nTrianglesInTileBounds,
        triAreasArray,
    )

    const success = rasterizeTriangles(
        buildContext,
        vertsArray,
        nVerts,
        trisInBoundsArray,
        triAreasArray,
        nTrianglesInTileBounds,
        heightfield,
        tileConfig.walkableClimb,
    )

    triAreasArray.free()

    if (!success) {
        return failTileMesh('Could not rasterize triangles')
    }

    // Once all geometry is rasterized, we do initial pass of filtering to
    // remove unwanted overhangs caused by the conservative rasterization
    // as well as filter spans where the character cannot possibly stand.
    filterLowHangingWalkableObstacles(buildContext, tileConfig.walkableClimb, heightfield)
    filterLedgeSpans(buildContext, tileConfig.walkableHeight, tileConfig.walkableClimb, heightfield)
    filterWalkableLowHeightSpans(buildContext, tileConfig.walkableHeight, heightfield)

    // Compact the heightfield so that it is faster to handle from now on.
    // This will result more cache coherent data as well as the neighbours
    // between walkable cells will be calculated.
    const compactHeightfield = allocCompactHeightfield()
    tileIntermediates.compactHeightfield = compactHeightfield

    if (
        !buildCompactHeightfield(
            buildContext,
            tileConfig.walkableHeight,
            tileConfig.walkableClimb,
            heightfield,
            compactHeightfield,
        )
    ) {
        return failTileMesh('Could not build compact heightfield')
    }

    if (!keepIntermediates) {
        freeHeightfield(tileIntermediates.heightfield)
        tileIntermediates.heightfield = undefined
    }

    // Erode the walkable area by agent radius
    if (!erodeWalkableArea(buildContext, tileConfig.walkableRadius, compactHeightfield)) {
        return failTileMesh('Could not erode walkable area')
    }

    // (Optional) Mark areas
    // markConvexPolyArea(...)

    // Prepare for region partitioning, by calculating Distance field along the walkable surface.
    if (!buildDistanceField(buildContext, compactHeightfield)) {
        return failTileMesh('Failed to build distance field')
    }

    // Partition the walkable surface into simple regions without holes.
    if (
        !buildRegions(
            buildContext,
            compactHeightfield,
            tileConfig.borderSize,
            tileConfig.minRegionArea,
            tileConfig.mergeRegionArea,
        )
    ) {
        return failTileMesh('Failed to build regions')
    }

    //
    // Trace and simplify region contours.
    //
    const contourSet = allocContourSet()
    tileIntermediates.contourSet = contourSet

    if (
        !buildContours(
            buildContext,
            compactHeightfield,
            tileConfig.maxSimplificationError,
            tileConfig.maxEdgeLen,
            contourSet,
            Raw.Module.RC_CONTOUR_TESS_WALL_EDGES,
        )
    ) {
        return failTileMesh('Failed to create contours')
    }

    //
    // Build polygons mesh from contours.
    //
    const polyMesh = allocPolyMesh()
    if (!buildPolyMesh(buildContext, contourSet, tileConfig.maxVertsPerPoly, polyMesh)) {
        return failTileMesh('Failed to triangulate contours')
    }

    //
    // Create detail mesh which allows to access approximate height on each polygon.
    //
    const polyMeshDetail = allocPolyMeshDetail()
    if (
        !buildPolyMeshDetail(
            buildContext,
            polyMesh,
            compactHeightfield,
            tileConfig.detailSampleDist,
            tileConfig.detailSampleMaxError,
            polyMeshDetail,
        )
    ) {
        return failTileMesh('Failed to build detail mesh')
    }

    if (!keepIntermediates) {
        freeCompactHeightfield(compactHeightfield)
        tileIntermediates.compactHeightfield = undefined

        freeContourSet(contourSet)
        tileIntermediates.contourSet = undefined
    }

    // Update poly flags from areas.
    for (let i = 0; i < polyMesh.npolys(); i++) {
        if (polyMesh.areas(i) == Raw.Recast.WALKABLE_AREA) {
            polyMesh.setAreas(i, 0)
        }
        if (polyMesh.areas(i) == 0) {
            polyMesh.setFlags(i, 1)
        }
    }

    const navMeshCreateParams = new NavMeshCreateParams()

    navMeshCreateParams.setPolyMeshCreateParams(polyMesh)
    navMeshCreateParams.setPolyMeshDetailCreateParams(polyMeshDetail)

    navMeshCreateParams.setWalkableHeight(tileConfig.walkableHeight)
    navMeshCreateParams.setWalkableRadius(tileConfig.walkableRadius)
    navMeshCreateParams.setWalkableClimb(tileConfig.walkableClimb)

    navMeshCreateParams.setCellSize(tileConfig.cs)
    navMeshCreateParams.setCellHeight(tileConfig.ch)

    navMeshCreateParams.setBuildBvTree(true)

    navMeshCreateParams.setTileX(tileX)
    navMeshCreateParams.setTileY(tileY)

    const createNavMeshDataResult = createNavMeshData(navMeshCreateParams)

    if (!createNavMeshDataResult.success) {
        return failTileMesh('Failed to create Detour navmesh data')
    }

    buildContext.log(Raw.Module.RC_LOG_PROGRESS, `>> Polymesh: ${polyMesh.nverts()} vertices  ${polyMesh.npolys()} polygons`)

    cleanup()

    return { success: true, data: createNavMeshDataResult.navMeshData, tileIntermediates, buildContext }
}
