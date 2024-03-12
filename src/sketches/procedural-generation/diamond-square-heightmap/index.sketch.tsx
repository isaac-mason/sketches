import { Bounds, OrbitControls } from '@react-three/drei'
import { useControls } from 'leva'
import { useMemo } from 'react'
import { PlaneGeometry, PointLightHelper } from 'three'
import { VertexNormalsHelper } from 'three/addons'
import { Canvas, Helper } from '@/common'

const randomInRange = (min: number, max: number): number => {
    return Math.random() * (max - min) + min
}

/**
 * Performs a diamond step
 * @param map the two dimensional terrain array
 * @param size the size of the map
 * @param sideLength the side length of the square
 * @param range
 */
const diamondStep = (map: number[][], size: number, sideLength: number, range: number) => {
    const halfSideLength = Math.floor(sideLength / 2)

    // For each row of squares
    for (let y = 0; y < Math.floor(size / (sideLength - 1)); y++) {
        // For each column of squares
        for (let x = 0; x < Math.floor(size / (sideLength - 1)); x++) {
            // Find the average corners value
            const average =
                (map[y * (sideLength - 1)][x * (sideLength - 1)] +
                    map[(y + 1) * (sideLength - 1)][x * (sideLength - 1)] +
                    map[y * (sideLength - 1)][(x + 1) * (sideLength - 1)] +
                    map[(y + 1) * (sideLength - 1)][(x + 1) * (sideLength - 1)]) /
                4.0

            // Find the center of the square
            const centerX = x * (sideLength - 1) + halfSideLength
            const centerY = y * (sideLength - 1) + halfSideLength

            // Set the center midpoint of the square to be the average of the four corner points plus a random value between -range to range
            map[centerY][centerX] = average + randomInRange(-range, range)
        }
    }
}

/**
 * Performs a square step
 * @param map the two dimensional terrain array
 * @param size the size of the map
 * @param sideLength the side length of the diamond
 * @param range the degree of randomness
 */
const squareStep = (map: number[][], size: number, sideLength: number, range: number) => {
    const halfSideLength = Math.floor(sideLength / 2)

    // For each row of squares
    for (let y = 0; y < Math.floor(size / (sideLength - 1)); y++) {
        // For each column of squares
        for (let x = 0; x < Math.floor(size / (sideLength - 1)); x++) {
            // Store the four diamond midpoints
            ;[
                [y * (sideLength - 1) + halfSideLength, x * (sideLength - 1)], // left
                [y * (sideLength - 1) + halfSideLength, (x + 1) * (sideLength - 1)], // right
                [y * (sideLength - 1), x * (sideLength - 1) + halfSideLength], // top
                [(y + 1) * (sideLength - 1), x * (sideLength - 1) + halfSideLength], // bottom
            ].map((diamondMidPoint) => {
                // Find the sum of the diamond corner values
                let counter = 0
                let sum = 0
                if (diamondMidPoint[1] !== 0) {
                    // left
                    sum += map[diamondMidPoint[0]][diamondMidPoint[1] - halfSideLength]
                    counter++
                }
                if (diamondMidPoint[0] !== 0) {
                    // top
                    sum += map[diamondMidPoint[0] - halfSideLength][diamondMidPoint[1]]
                    counter++
                }
                if (diamondMidPoint[1] !== size - 1) {
                    // right
                    sum += map[diamondMidPoint[0]][diamondMidPoint[1] + halfSideLength]
                    counter++
                }
                if (diamondMidPoint[0] !== size - 1) {
                    // bottom
                    sum += map[diamondMidPoint[0] + halfSideLength][diamondMidPoint[1]]
                    counter++
                }

                // Set the center point to be the average of the diamond corner values plus a random value
                map[diamondMidPoint[0]][diamondMidPoint[1]] = sum / counter + (Math.random() - 0.5) * range
            })
        }
    }
}

/**
 * Generates a terrain map using the diamond square algorithm
 * @param size the size of the terrain map
 * @param range the degree of randomness
 */
const generateHeightMap = (size: number, range: number): number[][] => {
    // Create a 2d array filled with zeros
    const map = new Array(size)
    for (let i = 0; i < size; i++) {
        map[i] = new Array<number>(size).fill(0)
    }

    // Initialise corners with random values (map[y][x])
    map[0][0] = randomInRange(0, range)
    map[0][size - 1] = randomInRange(0, range)
    map[size - 1][0] = randomInRange(0, range)
    map[size - 1][size - 1] = randomInRange(0, range)

    // Do an initial diamond and square step
    let randomFactor = range / 2
    diamondStep(map, size, size, randomFactor)
    squareStep(map, size, size, randomFactor)

    // Calculate the next side length
    let sideLength = Math.floor(size / 2)

    // Loop until the side length is less than 2
    while (sideLength >= 2) {
        // Perform a diamond and a square step
        diamondStep(map, size, sideLength + 1, randomFactor)
        squareStep(map, size, sideLength + 1, randomFactor)

        // Half the side length and range
        sideLength = Math.floor(sideLength / 2)
        randomFactor = Math.floor(randomFactor / 2)
    }

    return map
}

function generateNormalMap(heightmap: number[][]): number[][][] {
    const width = heightmap.length
    const height = heightmap[0].length
    const normalMap: number[][][] = []

    for (let x = 0; x < width; x++) {
        normalMap[x] = []
        for (let y = 0; y < height; y++) {
            const left = heightmap[(x - 1 + width) % width][y]
            const right = heightmap[(x + 1) % width][y]
            const up = heightmap[x][(y - 1 + height) % height]
            const down = heightmap[x][(y + 1) % height]

            const dx = (right - left) / 2
            const dy = (down - up) / 2

            // Increase or decrease this value to control the height of the normal map
            const dz = 1

            // Calculate the normalized normal vector
            const length = Math.sqrt(dx * dx + dy * dy + dz * dz)
            const nx = dx / length
            const ny = dy / length
            const nz = dz / length

            normalMap[x][y] = [nx, ny, nz]
        }
    }

    return normalMap
}

type TerrainProps = {
    size: number
    range: number
    wireframe: boolean
    vertexNormalsHelper: boolean
}

const Terrain = ({ size, range, wireframe, vertexNormalsHelper }: TerrainProps) => {
    const planeGeometry = useMemo(() => {
        const heightMap = generateHeightMap(size, range)
        const normalMap = generateNormalMap(heightMap)

        const geometry = new PlaneGeometry(100, 100, size - 1, size - 1)

        let z = 0
        for (let x = 0; x < size; x++) {
            for (let y = 0; y < size; y++) {
                geometry.attributes.position.setZ(z, heightMap[y][x])
                geometry.attributes.normal.setXYZ(z, normalMap[y][x][0], normalMap[y][x][1], normalMap[y][x][2])
                z++
            }
        }

        return geometry
    }, [size, range])

    return (
        <mesh rotation-x={-Math.PI / 2} position-y={-10} receiveShadow>
            <meshStandardMaterial color="#999" wireframe={wireframe} />
            <primitive object={planeGeometry} attach="geometry" />

            {vertexNormalsHelper && <Helper type={VertexNormalsHelper} />}
        </mesh>
    )
}

// Size of the heightmap should be a power of 2 plus 1 (e.g., 9, 17, 33, 65, ...)
const sizeOptions = Array.from({ length: 12 }, (_, idx) => Math.pow(2, idx) + 1)

export default () => {
    const { size, range, wireframe, vertexNormalsHelper, pointLightPosition } = useControls('procgen-diamond-square-heightmap', {
        size: {
            value: sizeOptions[8],
            options: sizeOptions,
        },
        range: 40,
        wireframe: false,
        vertexNormalsHelper: false,
        pointLightPosition: [0, 30, 100],
    })

    return (
        <>
            <Canvas shadows camera={{ position: [50, 50, -20] }}>
                <Bounds fit margin={1.2}>
                    <Terrain size={size} range={range} wireframe={wireframe} vertexNormalsHelper={vertexNormalsHelper} />
                </Bounds>

                <ambientLight intensity={0.7} />

                <directionalLight position={pointLightPosition} intensity={1.5}>
                    <Helper type={PointLightHelper} args={[10]} />
                </directionalLight>

                <OrbitControls makeDefault />
            </Canvas>
        </>
    )
}
