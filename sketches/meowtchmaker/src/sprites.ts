import * as THREE from 'three'
import { attribute, float, instanceIndex, positionLocal, rotate, texture, time, uniformArray, uv, vec2 } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'

const loadImage = async (url: string) => {
    const image = new Image()
    image.src = url
    await image.decode()
    return image
}

export type SpritesAtlas = {
    texture: THREE.Texture
    clips: Record<
        string,
        {
            index: number
            frames: number
            u: number
            v: number
            w: number
            h: number
        }
    >
}

export type SpritesAtlasImages = Record<string, { frames: number; url: string }>

export const createAtlas = async (images: SpritesAtlasImages) => {
    const clips: SpritesAtlas['clips'] = {}

    const imagesMap: Record<string, HTMLImageElement> = {}

    let atlasWidth = 0
    let atlasHeight = 0
    for (const [key, value] of Object.entries(images)) {
        const image = await loadImage(value.url)
        imagesMap[key] = image
        atlasHeight += image.height
        atlasWidth = Math.max(atlasWidth, image.width)
    }

    let height = 0

    const canvas = document.createElement('canvas')
    canvas.width = atlasWidth
    canvas.height = atlasHeight

    const ctx = canvas.getContext('2d')!

    let idCounter = 0

    for (const [key, { frames }] of Object.entries(images)) {
        const image = imagesMap[key]

        const clip = {
            index: idCounter++,
            frames: frames,
            u: 0,
            v: (atlasHeight - height - image.height) / atlasHeight,
            w: image.width / frames / atlasWidth,
            h: image.height / atlasHeight,
        }

        clips[key] = clip

        const x = 0
        const y = height

        ctx.drawImage(image, x, y)

        height += image.height
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.NearestFilter
    texture.magFilter = THREE.NearestFilter
    texture.colorSpace = THREE.SRGBColorSpace

    return {
        canvas,
        texture,
        clips: clips,
    }
}

class SpriteMaterial extends MeshBasicNodeMaterial {
    constructor(atlas: SpritesAtlas) {
        super()

        this.side = THREE.DoubleSide
        this.map = atlas.texture
        this.alphaTest = 0.5

        const clip = attribute('clip')
        const offset = attribute('offset')
        const rotation = attribute('rotation')
        const scale = attribute('scale')

        const framesArray: number[] = []
        const vArray: number[] = []
        const wArray: number[] = []
        const hArray: number[] = []

        for (const clip of Object.values(atlas.clips)) {
            framesArray[clip.index] = clip.frames
            vArray[clip.index] = clip.v
            wArray[clip.index] = clip.w
            hArray[clip.index] = clip.h
        }

        const framesArrayUniform = uniformArray(framesArray)
        const vArrayUniform = uniformArray(vArray)
        const wArrayUniform = uniformArray(wArray)
        const hArrayUniform = uniformArray(hArray)

        const nFrames = framesArrayUniform.element(clip)
        const u = float(0)
        const v = vArrayUniform.element(clip)
        const w = wArrayUniform.element(clip)
        const h = hArrayUniform.element(clip)

        const timeOffset = float(instanceIndex).mod(3).mul(0.2)

        const currentFrame = time.add(timeOffset).mul(5).mod(nFrames).floor()

        const frameSize = vec2(w, h)
        const frameOffset = vec2(u.add(currentFrame.mul(w)), v)
        const spriteUv = uv().mul(frameSize).add(frameOffset)

        const colorNode = texture(atlas.texture, spriteUv)
        // const colorNode = vec3(1, 1, 1)
        // const colorNode = vec3(float(clip).mul(30))
        this.colorNode = colorNode

        const scaledPosition = positionLocal.mul(scale)
        const rotatedPosition = rotate(scaledPosition, rotation)
        const transformedPosition = rotatedPosition.add(offset)

        this.positionNode = transformedPosition
    }
}

const _position = new THREE.Vector3()
const _quaternion = new THREE.Quaternion()
const _scale = new THREE.Vector3()

const HIDDEN_MATRIX4 = new THREE.Matrix4()

HIDDEN_MATRIX4.compose(
    new THREE.Vector3(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE),
    new THREE.Quaternion(0, 0, 0, 1),
    new THREE.Vector3(1, 1, 1),
)

export const init = (atlas: SpritesAtlas, limit: number) => {
    const baseGeometry = new THREE.PlaneGeometry(1, 1)

    const instancedBufferGeometry = new THREE.InstancedBufferGeometry()
    instancedBufferGeometry.instanceCount = limit

    instancedBufferGeometry.index = baseGeometry.index
    instancedBufferGeometry.attributes = baseGeometry.attributes

    const clipAttribute = new THREE.InstancedBufferAttribute(new Float32Array(limit), 1)
    instancedBufferGeometry.setAttribute('clip', clipAttribute)

    const offset = new THREE.InstancedBufferAttribute(new Float32Array(limit * 3), 3)
    instancedBufferGeometry.setAttribute('offset', offset)

    const rotation = new THREE.InstancedBufferAttribute(new Float32Array(limit * 4), 4)
    instancedBufferGeometry.setAttribute('rotation', rotation)

    const scale = new THREE.InstancedBufferAttribute(new Float32Array(limit * 3), 3)
    instancedBufferGeometry.setAttribute('scale', scale)

    const material = new SpriteMaterial(atlas)

    const mesh = new THREE.Mesh(instancedBufferGeometry, material)
    mesh.frustumCulled = false

    const instanceIdToIndex: Record<number, number> = {}
    const instanceIndexToId: Record<number, number> = {}

    const setMatrixAt = (index: number, matrix: THREE.Matrix4) => {
        matrix.decompose(_position, _quaternion, _scale)

        offset.setXYZ(index, _position.x, _position.y, _position.z)
        rotation.setXYZW(index, _quaternion.x, _quaternion.y, _quaternion.z, _quaternion.w)
        scale.setXYZ(index, _scale.x, _scale.y, _scale.z)

        offset.needsUpdate = true
        rotation.needsUpdate = true
        scale.needsUpdate = true
    }

    return {
        atlas,
        mesh,
        instancedBufferGeometry,
        limit,
        cursor: 0,
        instanceIdToIndex,
        instanceIndexToId,
        instanceIdCounter: 0,
        setMatrixAt,
    }
}

export type State = Awaited<ReturnType<typeof init>>

export const dispose = (state: State) => {
    state.mesh.removeFromParent()
    state.mesh.geometry.dispose()
    state.mesh.material.dispose()
}

export const addInstance = (state: State, clip: string) => {
    if (state.cursor >= state.limit) return -1

    const instanceId = state.instanceIdCounter
    const instanceIndex = state.cursor

    state.instanceIdCounter++
    state.cursor = Math.min(state.cursor + 1, state.limit)

    state.instanceIdToIndex[instanceId] = instanceIndex
    state.instanceIndexToId[instanceIndex] = instanceId

    const clipIndex = state.atlas.clips[clip].index
    state.instancedBufferGeometry.attributes.clip.array[instanceIndex] = clipIndex
    state.instancedBufferGeometry.attributes.clip.needsUpdate = true

    state.setMatrixAt(instanceIndex, HIDDEN_MATRIX4)

    state.instancedBufferGeometry.instanceCount = state.cursor

    return instanceId
}

export const removeInstance = (state: State, instanceId: number) => {
    const instanceIndex = state.instanceIdToIndex[instanceId]

    state.cursor--

    const lastInstanceIndex = state.cursor
    const lastInstanceId = state.instanceIndexToId[lastInstanceIndex]

    if (instanceIndex !== lastInstanceIndex) {
        const { offset, rotation, scale } = state.instancedBufferGeometry.attributes

        offset.array.copyWithin(instanceIndex * 3, lastInstanceIndex * 3, lastInstanceIndex * 3 + 3)
        rotation.array.copyWithin(instanceIndex * 4, lastInstanceIndex * 4, lastInstanceIndex * 4 + 4)
        scale.array.copyWithin(instanceIndex * 3, lastInstanceIndex * 3, lastInstanceIndex * 3 + 3)

        offset.needsUpdate = true
        rotation.needsUpdate = true
        scale.needsUpdate = true

        state.instancedBufferGeometry.attributes.clip.array[instanceIndex] =
            state.instancedBufferGeometry.attributes.clip.array[lastInstanceIndex]
        state.instancedBufferGeometry.attributes.clip.needsUpdate = true

        state.instanceIdToIndex[lastInstanceId] = instanceIndex
        state.instanceIndexToId[instanceIndex] = lastInstanceId
    }

    delete state.instanceIdToIndex[instanceId]
    delete state.instanceIndexToId[lastInstanceIndex]

    state.instancedBufferGeometry.instanceCount = state.cursor
}
