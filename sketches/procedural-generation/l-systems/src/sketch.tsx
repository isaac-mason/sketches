import { Canvas } from '@/common/components/canvas'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useControls } from 'leva'
import { Generator } from 'maath/random'
import { useMemo } from 'react'
import * as THREE from 'three'
import { Line2, LineGeometry, LineMaterial } from 'three/examples/jsm/Addons.js'

const DEG2RAD = Math.PI / 180

type InterpreterContext = {
    currentPosition: THREE.Vector3
    currentDirection: THREE.Vector3
    angle: number
    branches: { from: THREE.Vector3; to: THREE.Vector3 }[]
    stack: { position: THREE.Vector3; direction: THREE.Vector3 }[]
}

const _vector3 = new THREE.Vector3()

const turnLeft = ({ angle, currentDirection }: InterpreterContext) => {
    currentDirection.applyAxisAngle(_vector3.set(0, 0, 1), angle)
}

const turnRight = ({ angle, currentDirection }: InterpreterContext) => {
    currentDirection.applyAxisAngle(_vector3.set(0, 0, 1), -angle)
}

const pitchDown = ({ angle, currentDirection }: InterpreterContext) => {
    currentDirection.applyAxisAngle(_vector3.set(1, 0, 0), angle)
}

const pitchUp = ({ angle, currentDirection }: InterpreterContext) => {
    currentDirection.applyAxisAngle(_vector3.set(1, 0, 0), -angle)
}

const rollLeft = ({ angle, currentDirection }: InterpreterContext) => {
    currentDirection.applyAxisAngle(_vector3.set(0, 1, 0), angle)
}

const rollRight = ({ angle, currentDirection }: InterpreterContext) => {
    currentDirection.applyAxisAngle(_vector3.set(0, 1, 0), -angle)
}

const turn180 = ({ currentDirection }: InterpreterContext) => {
    currentDirection.negate()
}

const drawBranch = (context: InterpreterContext) => {
    const { currentPosition, currentDirection, branches } = context

    const newPosition = currentPosition.clone().add(currentDirection.clone().multiplyScalar(0.1))

    branches.push({ from: currentPosition.clone(), to: newPosition })

    context.currentPosition = newPosition
}

const moveForwardWithoutDrawing = ({ currentPosition, currentDirection }: InterpreterContext) => {
    currentPosition.add(_vector3.copy(currentDirection).multiplyScalar(0.1))
}

const saveState = ({ currentPosition, currentDirection, stack }: InterpreterContext) => {
    stack.push({ position: currentPosition.clone(), direction: currentDirection.clone() })
}

const restoreState = (context: InterpreterContext) => {
    const popped = context.stack.pop()

    if (popped) {
        context.currentPosition = popped.position
        context.currentDirection = popped.direction
    }
}

// default L-system grammar:
//
// '+'      - Turn right
// '-'      - Turn left
// '&'      - Pitch down
// '^'      - Pitch up
// '<'      - Roll left
// '>'      - Roll right
// '|'      - Turn 180 degrees
// 'F'      - Draw branch and move forward
// 'g'      - Move forward without drawing
// '['      - Save state
// ']'      - Restore state

const defaultSyntax = {
    '+': turnRight,
    '-': turnLeft,
    '&': pitchDown,
    '^': pitchUp,
    '<': rollLeft,
    '>': rollRight,
    '|': turn180,
    F: drawBranch,
    g: moveForwardWithoutDrawing,
    '[': saveState,
    ']': restoreState,
}

const generateSequence = (rules: Config['rules'], axiom: string, iterations: number) => {
    const generator = new Generator(42)

    const rulesMap: Record<string, Config['rules'][0]> = {}
    for (const rule of rules) {
        rulesMap[rule.symbol] = rule
    }

    let result = axiom

    for (let i = 0; i < iterations; i++) {
        let newResult = ''
        for (const char of result) {
            const rule = rulesMap[char as never]

            if (!rule) {
                newResult += char
                continue
            }

            if (rule.chance && generator.value() > rule.chance) {
                newResult += char
                continue
            }

            newResult += rule.newSymbols
        }
        result = newResult
    }

    return result
}

const interpret = (sequence: string, angle: number, syntax: Config['syntax']) => {
    const context: InterpreterContext = {
        angle,
        currentPosition: new THREE.Vector3(0, 0, 0),
        // Assuming initial direction is 'up' along the Y-axis
        currentDirection: new THREE.Vector3(0, 1, 0),
        stack: [],
        // output
        branches: [],
    }

    const characters = sequence.split('')

    for (const char of characters) {
        const fn = syntax[char as never] as (context: InterpreterContext) => void | undefined

        if (!fn) continue

        fn(context)
    }

    return { branches: context.branches }
}

type Config = {
    /**
     * Axiom for the L-system
     */
    start: string

    /**
     * Production rules for the L-system
     */
    rules: { symbol: string; newSymbols: string; chance?: number }[]

    /**
     * Turn angle in radians
     */
    angle: number

    /**
     * Syntax mapping for interpreting the L-system sequence
     */
    syntax: Record<string, (context: InterpreterContext) => void>

    /**
     * Number of iterations to apply the production rules to the axiom
     */
    iterations: number
}

// https://en.wikipedia.org/wiki/L-system#Example_7:_fractal_plant
// minor modifications to the original rules for added 3d depth (roll right and left)
const fractalPlantConfig: Config = {
    start: 'X',
    rules: [
        {
            symbol: 'X',
            newSymbols: '>F+[[X]-X]-F[-FX]+X',
        },
        {
            symbol: 'F',
            newSymbols: 'FF',
        },
    ],
    angle: Math.PI / 6,
    syntax: {
        ...defaultSyntax,
        X: drawBranch,
    },
    iterations: 4,
}

// https://en.wikipedia.org/wiki/L-system#Example_6:_dragon_curve
const dragonCurveConfig: Config = {
    start: 'F',
    rules: [
        {
            symbol: 'F',
            newSymbols: 'F+G',
        },
        {
            symbol: 'G',
            newSymbols: 'F-G',
        },
    ],
    angle: 90 * DEG2RAD,
    syntax: {
        ...defaultSyntax,
        G: drawBranch,
    },
    iterations: 10,
}

const treeConfig: Config = {
    start: 'F',
    rules: [
        {
            symbol: 'F',
            newSymbols: 'FF+[+F-F-F]-[-F+F+F]>',
        },
    ],
    angle: 15 * DEG2RAD,
    syntax: {
        ...defaultSyntax,
        F: drawBranch,
    },
    iterations: 4,
}

const tree_2 = {
    start: 'X',
    rules: [
        {
            symbol: 'X',
            newSymbols: 'F[+X][-X]FX',
        },
        {
            symbol: 'F',
            newSymbols: 'FF',
        },
    ],
    angle: 25 * DEG2RAD,
    syntax: {
        ...defaultSyntax,
        X: drawBranch,
    },
    iterations: 5,
}

const configs = {
    'fractal plant': fractalPlantConfig,
    tree: treeConfig,
    'tree 2': tree_2,
    'dragon curve': dragonCurveConfig,
}

const configKeys = Object.keys(configs)

type LSystemProps = {
    config: Config
}

const LSystem = ({ config }: LSystemProps) => {
    const { branches } = useMemo(() => {
        const sequence = generateSequence(config.rules, config.start, config.iterations)

        const { branches } = interpret(sequence, config.angle, config.syntax)

        return { branches }
    }, [config])

    const line = useMemo(() => {
        const positions = branches.flatMap(({ from, to }) => [from.x, from.y, from.z, to.x, to.y, to.z])

        const geometry = new LineGeometry()
        geometry.setPositions(positions)
        geometry.instanceCount = positions.length / 3 - 1

        const material = new LineMaterial({
            color: 0xffffff,
            linewidth: 1,
            alphaToCoverage: false,
        })

        const line = new Line2(geometry, material)

        return line
    }, [branches])

    return (
        <group>
            <primitive object={line} />
        </group>
    )
}

export function Sketch() {
    const { configKey } = useControls('l-systems', {
        configKey: {
            value: configKeys[0],
            options: configKeys,
        },
    })

    const config = configs[configKey as keyof typeof configs]

    return (
        <Canvas>
            <LSystem config={config} />

            <PerspectiveCamera makeDefault position={[0, 3, -10]} />

            <OrbitControls makeDefault target={[0, 2, 0]} />
        </Canvas>
    )
}
