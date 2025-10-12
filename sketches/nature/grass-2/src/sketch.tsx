import { WebGPUCanvas } from '@sketches/common'
import { OrbitControls } from '@react-three/drei'
import { useControls } from 'leva'
import { useMemo } from 'react'
import * as THREE from 'three'
import {
    Fn,
    ShaderNodeObject,
    cos,
    dot,
    float,
    floor,
    fract,
    hash,
    instanceIndex,
    int,
    mat3,
    mix,
    mod,
    modelWorldMatrix,
    mul,
    positionWorld,
    pow,
    remap,
    select,
    sin,
    sub,
    time,
    uniform,
    varying,
    vec2,
    vec3,
    vec4,
    vertexIndex,
} from 'three/tsl'
import { MeshBasicNodeMaterial, Node } from 'three/webgpu'

const NUM_GRASS = 500
const GRASS_SEGMENTS = 6
const GRASS_VERTICES = (GRASS_SEGMENTS + 1) * 2
const GRASS_PATCH_SIZE = 10
const GRASS_WIDTH = 0.25
const GRASS_HEIGHT = 2

const createGrassGeometry = (numGrass: number, segments: number) => {
    const nVertices = (segments + 1) * 2
    const indices: number[] = []

    for (let i = 0; i < segments; i++) {
        const vi = i * 2
        indices[i * 12 + 0] = vi + 0
        indices[i * 12 + 1] = vi + 1
        indices[i * 12 + 2] = vi + 2

        indices[i * 12 + 3] = vi + 2
        indices[i * 12 + 4] = vi + 1
        indices[i * 12 + 5] = vi + 3

        const fi = nVertices + vi
        indices[i * 12 + 6] = fi + 2
        indices[i * 12 + 7] = fi + 1
        indices[i * 12 + 8] = fi + 0

        indices[i * 12 + 9] = fi + 3
        indices[i * 12 + 10] = fi + 1
        indices[i * 12 + 11] = fi + 2
    }

    const geom = new THREE.InstancedBufferGeometry()
    geom.instanceCount = numGrass
    geom.setIndex(indices)

    // todo: here to address warning for missing attributes
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3))
    geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(0), 3))

    geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1 + GRASS_PATCH_SIZE * 2)

    return geom
}

const quickHashVec2 = Fn(({ p }: { p: ShaderNodeObject<Node> }) => {
    const r = vec2(dot(vec2(p), vec2(17.43267, 23.8934543)), dot(vec2(p), vec2(13.98342, 37.2435232)))

    return fract(sin(r).mul(1743.54892229))
})

const hashVec3 = Fn(({ p }: { p: ShaderNodeObject<Node> }) => {
    const r = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)))

    return float(float(-1).add(2)).mul(fract(sin(r).mul(43758.5453123)))
})

const easeOut = Fn(({ x, t }: { x: ShaderNodeObject<Node>; t: ShaderNodeObject<Node> }) => {
    return float(1).sub(pow(float(1).sub(x), t))
})

const rotateY = Fn(({ theta }: { theta: ShaderNodeObject<Node> }) => {
    const c = cos(theta)
    const s = sin(theta)

    return mat3(c, 0, s, 0, 1, 0, s.negate(), 0, c)
})

const rotateAxis = Fn(([axis, angle]: [axis: ShaderNodeObject<Node>, angle: ShaderNodeObject<Node>]) => {
    const s = sin(angle)
    const c = cos(angle)
    const oc = float(1).sub(c)

    return mat3(
        oc.mul(axis.x).mul(axis.x).add(c),
        oc.mul(axis.x).mul(axis.y).sub(axis.z.mul(s)),
        oc.mul(axis.x).mul(axis.z).add(axis.y.mul(s)),
        oc.mul(axis.x).mul(axis.y).add(axis.z.mul(s)),
        oc.mul(axis.y).mul(axis.y).add(c),
        oc.mul(axis.y).mul(axis.z).sub(axis.x.mul(s)),
        oc.mul(axis.x).mul(axis.z).sub(axis.y.mul(s)),
        oc.mul(axis.y).mul(axis.z).add(axis.x.mul(s)),
        oc.mul(axis.z).mul(axis.z).add(c),
    )
})

const bezier = Fn(
    ({
        p0,
        p1,
        p2,
        p3,
        t,
    }: {
        p0: ShaderNodeObject<Node>
        p1: ShaderNodeObject<Node>
        p2: ShaderNodeObject<Node>
        p3: ShaderNodeObject<Node>
        t: ShaderNodeObject<Node>
    }) => {
        const t2 = t.mul(t)
        const t3 = t2.mul(t)

        return p0
            .mul(
                float(1)
                    .sub(t)
                    .mul(float(1).sub(t).mul(float(1).sub(t))),
            )
            .add(
                p1.mul(
                    float(3)
                        .mul(t)
                        .mul(float(1).sub(t).mul(float(1).sub(t))),
                ),
            )
            .add(p2.mul(float(3).mul(t2).mul(float(1).sub(t))))
            .add(p3.mul(t3))
    },
)

const noise = Fn(([p_immutable]: [p_immutable: ShaderNodeObject<Node>]) => {
    const p = vec3(p_immutable).toVar()
    const i = vec3(floor(p)).toVar()
    const f = vec3(fract(p)).toVar()
    const u = vec3(f.mul(f.mul(sub(3.0, mul(2.0, f))))).toVar()

    return mix(
        mix(
            mix(
                dot(hash(i.add(vec3(0.0, 0.0, 0.0))), f.sub(vec3(0.0, 0.0, 0.0))),
                dot(hash(i.add(vec3(1.0, 0.0, 0.0))), f.sub(vec3(1.0, 0.0, 0.0))),
                u.x,
            ),
            mix(
                dot(hash(i.add(vec3(0.0, 1.0, 0.0))), f.sub(vec3(0.0, 1.0, 0.0))),
                dot(hash(i.add(vec3(1.0, 1.0, 0.0))), f.sub(vec3(1.0, 1.0, 0.0))),
                u.x,
            ),
            u.y,
        ),
        mix(
            mix(
                dot(hash(i.add(vec3(0.0, 0.0, 1.0))), f.sub(vec3(0.0, 0.0, 1.0))),
                dot(hash(i.add(vec3(1.0, 0.0, 1.0))), f.sub(vec3(1.0, 0.0, 1.0))),
                u.x,
            ),
            mix(
                dot(hash(i.add(vec3(0.0, 1.0, 1.0))), f.sub(vec3(0.0, 1.0, 1.0))),
                dot(hash(i.add(vec3(1.0, 1.0, 1.0))), f.sub(vec3(1.0, 1.0, 1.0))),
                u.x,
            ),
            u.y,
        ),
        u.z,
    )
})

const Grass = () => {
    const { wireframe, debugPositionsAndAngles, wind, color } = useControls({
        wireframe: false,
        debugPositionsAndAngles: false,
        wind: true,
        color: {
            value: 'grassColor',
            options: ['grassColor', 'vertID', 'zSide', 'hashedInstanceID', 'constant'],
        },
    })

    const mesh = useMemo(() => {
        const grassSegments = int(uniform(GRASS_SEGMENTS))
        const grassVertices = int(uniform(GRASS_VERTICES))
        const grassWidth = float(uniform(GRASS_WIDTH))
        const grassHeight = float(uniform(GRASS_HEIGHT))
        const grassPatchSize = float(uniform(GRASS_PATCH_SIZE))

        // vertex id, > grass vertices is other side
        const vertFB_ID = mod(float(vertexIndex), float(grassVertices.mul(2)))
        const vertID = mod(float(vertFB_ID), float(grassVertices))

        // 0 = left, 1 = right
        const xTest = vertID.bitAnd(0x1)
        const zTest = select(vertFB_ID.greaterThanEqual(grassVertices), 1, -1)
        const xSide = float(xTest)
        const zSide = float(zTest)
        const heightPercent = float(vertID.sub(xTest)).div(float(grassSegments).mul(float(2)))

        // grass blade width and height
        const grassBladeWidth = grassWidth.mul(easeOut({ x: float(1).sub(heightPercent), t: 2 }))
        const grassBladeHeight = grassHeight

        // grass blade offset
        const hashedInstanceIndex = quickHashVec2({ p: float(instanceIndex) })
            .mul(2)
            .sub(1)

        let grassLocalOffset: ShaderNodeObject<Node> = vec3(hashedInstanceIndex.x, 0.0, hashedInstanceIndex.y).mul(grassPatchSize)

        if (debugPositionsAndAngles) {
            grassLocalOffset = vec3(float(instanceIndex).mul(0.5).sub(8), 0, 0)
        }

        // const grassWorldPosition = grassLocalOffset.add(positionWorld)
        const grassWorldPosition = modelWorldMatrix.mul(vec4(grassLocalOffset, 1)).xyz

        // grass blade angle
        const grassWorldPositionHashVal = hashVec3({ p: grassWorldPosition })

        let grassBladeAngle: ShaderNodeObject<Node> = remap(grassWorldPositionHashVal.x, 0, 1, -Math.PI, Math.PI)

        if (debugPositionsAndAngles) {
            grassBladeAngle = float(instanceIndex).mul(0.2)
        }

        const stiffness = 1.0

        const windStrength = float(noise(vec3(grassWorldPosition.xz.mul(0.05), 0.0).add(time)))
        const windAngle = float(0.0)
        const windAxis = vec3(cos(windAngle), 0.0, sin(windAngle))
        let windLeanAngle = float(windStrength.mul(mul(1.5, heightPercent.mul(stiffness))))
        let randomLeanAnimation = float(noise(vec3(grassWorldPosition.xz, time.mul(4.0))).mul(windStrength.mul(0.5).add(0.125)))

        if (!wind) {
            windLeanAngle = float(0)
            randomLeanAnimation = float(0)
        }

        // grass lean - add bend using bezier curve
        let leanFactor: ShaderNodeObject<Node> = remap(hash(instanceIndex), -1, 1, -0.25, 0.25).add(randomLeanAnimation)

        if (debugPositionsAndAngles) {
            leanFactor = float(0.5)
        }

        const p0 = vec3(0)
        const p1 = vec3(0, 0.33, 0)
        const p2 = vec3(0, 0.66, 0)
        const p3 = vec3(0, cos(leanFactor), sin(leanFactor))
        const curve = bezier({
            p0,
            p1,
            p2,
            p3,
            t: heightPercent,
        })

        // calculate grass blade local vertex position
        const bladeX = float(xSide.sub(0.5)).mul(grassBladeWidth)
        // const bladeY = heightPercent.mul(grassBladeHeight)
        // const bladeZ = float(0)
        const leanedBladeY = curve.y.mul(grassBladeHeight)
        const leanedBladeZ = curve.z.mul(grassBladeHeight)

        // grass position
        const grassRotationMatrix = rotateAxis(windAxis, windLeanAngle).mul(rotateY({ theta: grassBladeAngle }))

        const grassPositionNode = grassRotationMatrix
            .mul(vec3(bladeX, leanedBladeY, leanedBladeZ))
            .add(grassLocalOffset)
            .add(positionWorld)

        // grass color
        const baseColor = vec3(0.2, 0.8, 0.2)
        const tipColor = vec3(0.8, 0.8, 0.2)
        const grassMixColor = mix(baseColor, tipColor, heightPercent)

        let grassColorNode: ShaderNodeObject<Node> = varying(vec4(vec3(0.1), 1))

        if (color === 'grassColor') {
            grassColorNode = varying(vec4(grassMixColor, 1))
        } else if (color === 'vertID') {
            grassColorNode = vec4(vec3(0, vertID, 0), 1)
        } else if (color === 'zSide') {
            grassColorNode = varying(vec4(vec3(zSide), 1))
        } else if (color === 'hashedInstanceID') {
            grassColorNode = varying(vec4(vec3(hashedInstanceIndex), 1))
        }

        const grassMaterial = new MeshBasicNodeMaterial({
            positionNode: grassPositionNode,
            colorNode: grassColorNode,
            side: THREE.FrontSide,
            wireframe,
        })

        const grassGeometry = createGrassGeometry(NUM_GRASS, GRASS_SEGMENTS)

        const mesh = new THREE.Mesh(grassGeometry, grassMaterial)

        return mesh
    }, [debugPositionsAndAngles, wireframe, wind, color])

    return <primitive object={mesh} />
}

export function Sketch() {
    return (
        <WebGPUCanvas camera={{ position: [10, 10, 10] }}>
            <Grass />

            <color attach="background" args={['#99f']} />

            <OrbitControls />
        </WebGPUCanvas>
    )
}
