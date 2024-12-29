import * as THREE from 'three'
import { attribute, positionLocal, select, uniform, vec4 } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'

export const PARTICLE_TYPE_DECAY = 1
export const PARTICLE_TYPE_PHYSICAL = 2

const PARTICLE_ELEMENTS = 8

export const init = (groundY: number, limit: number) => {
    const baseGeometry = new THREE.PlaneGeometry(0.1, 0.1)

    const instancedGeometry = new THREE.InstancedBufferGeometry()
    instancedGeometry.instanceCount = 0

    instancedGeometry.index = baseGeometry.index
    instancedGeometry.attributes.position = baseGeometry.attributes.position

    const timeUniform = uniform(0)

    const particlePositions = new Float32Array(limit * 3) // XYZ per instance
    const particleColors = new Float32Array(limit * 3) // RGB per instance
    const particleTypes = new Float32Array(limit) // type per instance
    const particleEndTimes = new Float32Array(limit) // end time per instance

    instancedGeometry.setAttribute('particlePosition', new THREE.InstancedBufferAttribute(particlePositions, 3))
    instancedGeometry.setAttribute('particleColor', new THREE.InstancedBufferAttribute(particleColors, 3))
    instancedGeometry.setAttribute('particleType', new THREE.InstancedBufferAttribute(particleTypes, 1))
    instancedGeometry.setAttribute('particleEndTime', new THREE.InstancedBufferAttribute(particleEndTimes, 1))

    const material = new MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: true })

    const particleColor = attribute('particleColor')
    const particleEndTime = attribute('particleEndTime')

    const timeRemaining = particleEndTime.sub(timeUniform)

    const particleAlpha = select(timeRemaining.lessThan(0.5), timeRemaining.mul(2), 1)
    const particleColorWithFadeOut = vec4(particleColor, particleAlpha)

    material.colorNode = particleColorWithFadeOut

    material.positionNode = positionLocal.add(attribute('particlePosition'))

    material.needsUpdate = true

    const mesh = new THREE.Mesh(instancedGeometry, material)
    mesh.frustumCulled = false

    const particleData = new Float32Array(limit * PARTICLE_ELEMENTS) // [type, spawnTime, x, y, z, vx, vy, vz, ...]

    return {
        mesh,
        timeUniform,
        instancedGeometry,
        particles: 0,
        groundY,
        material,
        particleData,
        limit,
    }
}

export type State = ReturnType<typeof init>

export const dispose = (state: State) => {
    state.mesh.removeFromParent()

    state.instancedGeometry.dispose()
    state.material.dispose()
}

const _color = new THREE.Color()

export const update = (state: State, delta: number) => {
    state.timeUniform.value += delta
    state.timeUniform.needsUpdate = true

    const t = 1 - Math.pow(0.001, delta)
    const now = state.timeUniform.value

    const particlePositions = state.instancedGeometry.attributes.particlePosition.array as Float32Array

    for (let i = state.particles - 1; i >= 0; i--) {
        const idx = i * PARTICLE_ELEMENTS

        // eslint-disable-next-line prefer-const
        let [type, endTime, x, y, z, vx, vy, vz] = state.particleData.slice(idx, idx + PARTICLE_ELEMENTS)

        if (now > endTime) {
            remove(state, i)
            continue
        }

        if (type === PARTICLE_TYPE_DECAY) {
            vx *= 1 - t * 0.9
            vy *= 1 - t * 0.9
            vz *= 1 - t * 0.9

            x += vx * t
            y += vy * t
            z += vz * t
        } else if (type === PARTICLE_TYPE_PHYSICAL) {
            vy -= 0.3 * t
            vx *= vy >= state.groundY ? 1 : 1 - t * 0.9
            vz *= vy >= state.groundY ? 1 : 1 - t * 0.9

            x += vx * t
            y += vy * t
            z += vz * t

            y = Math.max(y, state.groundY)
        }

        state.particleData[idx + 2] = x
        state.particleData[idx + 3] = y
        state.particleData[idx + 4] = z
        state.particleData[idx + 5] = vx
        state.particleData[idx + 6] = vy
        state.particleData[idx + 7] = vz

        particlePositions[i * 3] = x
        particlePositions[i * 3 + 1] = y
        particlePositions[i * 3 + 2] = z
    }

    state.instancedGeometry.attributes.particlePosition.needsUpdate = true
}

export const add = (
    state: State,
    type: number,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    color: THREE.ColorRepresentation,
    lifetime = 4,
) => {
    if (state.particles >= state.limit) {
        remove(state, 0)
    }

    const particleEndTime = state.timeUniform.value + lifetime

    const idx = state.particles * PARTICLE_ELEMENTS
    state.particleData[idx] = type
    state.particleData[idx + 1] = particleEndTime
    state.particleData[idx + 2] = x
    state.particleData[idx + 3] = y
    state.particleData[idx + 4] = z
    state.particleData[idx + 5] = vx
    state.particleData[idx + 6] = vy
    state.particleData[idx + 7] = vz

    const particlePositionArray = state.instancedGeometry.attributes.particlePosition.array as Float32Array
    const particleColorArray = state.instancedGeometry.attributes.particleColor.array as Float32Array
    const particleTypeArray = state.instancedGeometry.attributes.particleType.array as Float32Array
    const particleEndTimeArray = state.instancedGeometry.attributes.particleEndTime.array as Float32Array

    particlePositionArray[state.particles * 3] = x
    particlePositionArray[state.particles * 3 + 1] = y
    particlePositionArray[state.particles * 3 + 2] = z

    _color.set(color)

    particleColorArray[state.particles * 3] = _color.r
    particleColorArray[state.particles * 3 + 1] = _color.g
    particleColorArray[state.particles * 3 + 2] = _color.b

    particleTypeArray[state.particles] = type

    particleEndTimeArray[state.particles] = particleEndTime

    state.particles++

    state.instancedGeometry.instanceCount = state.particles

    state.instancedGeometry.attributes.particlePosition.needsUpdate = true
    state.instancedGeometry.attributes.particleColor.needsUpdate = true
    state.instancedGeometry.attributes.particleType.needsUpdate = true
    state.instancedGeometry.attributes.particleEndTime.needsUpdate = true
}

const remove = (state: State, index: number) => {
    const particlePositionArray = state.instancedGeometry.attributes.particlePosition.array as Float32Array
    const particleColorArray = state.instancedGeometry.attributes.particleColor.array as Float32Array
    const particleTypeArray = state.instancedGeometry.attributes.particleType.array as Float32Array
    const particleEndTimeArray = state.instancedGeometry.attributes.particleEndTime.array as Float32Array

    const lastIndex = state.particles - 1

    if (index !== lastIndex) {
        particlePositionArray.set(particlePositionArray.slice(lastIndex * 3, lastIndex * 3 + 3), index * 3)
        particleColorArray.set(particleColorArray.slice(lastIndex * 3, lastIndex * 3 + 3), index * 3)
        particleTypeArray.set(particleTypeArray.slice(lastIndex, lastIndex + 1), index)
        particleEndTimeArray.set(particleEndTimeArray.slice(lastIndex, lastIndex + 1), index)

        state.particleData.set(
            state.particleData.slice(lastIndex * PARTICLE_ELEMENTS, lastIndex * PARTICLE_ELEMENTS + PARTICLE_ELEMENTS),
            index * PARTICLE_ELEMENTS,
        )
    }

    state.particles--

    state.instancedGeometry.instanceCount = state.particles
    state.instancedGeometry.attributes.particleColor.needsUpdate = true
    state.instancedGeometry.attributes.particlePosition.needsUpdate = true
    state.instancedGeometry.attributes.particleType.needsUpdate = true
    state.instancedGeometry.attributes.particleEndTime.needsUpdate = true
}
