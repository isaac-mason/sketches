import * as THREE from 'three'
import type { World } from './world'

const _origin = new THREE.Vector3()
const _direction = new THREE.Vector3()

export const raycast = (
    world: World,
    inOrigin: THREE.Vector3Like,
    inDirection: THREE.Vector3Like,
    maxDistance: number,
    outHitPosition: THREE.Vector3,
    outHitNormal: THREE.Vector3,
    epsilon: number = 1e-8,
): boolean => {
    const origin = _origin.copy(inOrigin)
    const direction = _direction.copy(inDirection).normalize()

    let t = 0.0
    let nx = 0
    let ny = 0
    let nz = 0
    let ix: number
    let iy: number
    let iz: number
    let fx: number
    let fy: number
    let fz: number
    let ox: number = 0
    let oy: number = 0
    let oz: number = 0
    let ex: boolean
    let ey: boolean
    let ez: boolean
    let b: boolean
    let step: number
    let minStep: number

    // Step block-by-block along ray
    while (t <= maxDistance) {
        ox = origin.x + t * direction.x
        oy = origin.y + t * direction.y
        oz = origin.z + t * direction.z
        ix = Math.floor(ox) | 0
        iy = Math.floor(oy) | 0
        iz = Math.floor(oz) | 0
        fx = ox - ix
        fy = oy - iy
        fz = oz - iz
        // b = world.getSolid({ x: ix, y: iy, z: iz })
        b = world.getBlock(ix, iy, iz) !== 0

        if (b) {
            if (outHitPosition) {
                // Clamp to face on hit
                outHitPosition.x = fx < epsilon ? +ix : fx > 1.0 - epsilon ? ix + 1.0 - epsilon : ox
                outHitPosition.y = fy < epsilon ? +iy : fy > 1.0 - epsilon ? iy + 1.0 - epsilon : oy
                outHitPosition.z = fz < epsilon ? +iz : fz > 1.0 - epsilon ? iz + 1.0 - epsilon : oz
            }
            if (outHitNormal) {
                outHitNormal.x = nx
                outHitNormal.y = ny
                outHitNormal.z = nz
            }
            return b
        }

        // Check edge cases
        minStep = +(epsilon * (1.0 + t))
        if (t > minStep) {
            ex = nx < 0 ? fx <= minStep : fx >= 1.0 - minStep
            ey = ny < 0 ? fy <= minStep : fy >= 1.0 - minStep
            ez = nz < 0 ? fz <= minStep : fz >= 1.0 - minStep
            if (ex && ey && ez) {
                b =
                    world.getBlock(ix + nx, iy + ny, iz) !== 0 ||
                    world.getBlock(ix, iy + ny, iz + nz) !== 0 ||
                    world.getBlock(ix + nx, iy, iz + nz) !== 0
                if (b) {
                    if (outHitPosition) {
                        outHitPosition.x = nx < 0 ? ix - epsilon : ix + 1.0 - epsilon
                        outHitPosition.y = ny < 0 ? iy - epsilon : iy + 1.0 - epsilon
                        outHitPosition.z = nz < 0 ? iz - epsilon : iz + 1.0 - epsilon
                    }
                    if (outHitNormal) {
                        outHitNormal.x = nx
                        outHitNormal.y = ny
                        outHitNormal.z = nz
                    }
                    return b
                }
            }
            if (ex && (ey || ez)) {
                b = world.getBlock(ix + nx, iy, iz) !== 0
                if (b) {
                    if (outHitPosition) {
                        outHitPosition.x = nx < 0 ? ix - epsilon : ix + 1.0 - epsilon
                        outHitPosition.y = fy < epsilon ? +iy : oy
                        outHitPosition.z = fz < epsilon ? +iz : oz
                    }
                    if (outHitNormal) {
                        outHitNormal.x = nx
                        outHitNormal.y = ny
                        outHitNormal.z = nz
                    }
                    return b
                }
            }
            if (ey && (ex || ez)) {
                b = world.getBlock(ix, iy + ny, iz) !== 0
                if (b) {
                    if (outHitPosition) {
                        outHitPosition.x = fx < epsilon ? +ix : ox
                        outHitPosition.y = ny < 0 ? iy - epsilon : iy + 1.0 - epsilon
                        outHitPosition.z = fz < epsilon ? +iz : oz
                    }
                    if (outHitNormal) {
                        outHitNormal.x = nx
                        outHitNormal.y = ny
                        outHitNormal.z = nz
                    }
                    return b
                }
            }
            if (ez && (ex || ey)) {
                b = world.getBlock(ix, iy, iz + nz) !== 0
                if (b) {
                    if (outHitPosition) {
                        outHitPosition.x = fx < epsilon ? +ix : ox
                        outHitPosition.y = fy < epsilon ? +iy : oy
                        outHitPosition.z = nz < 0 ? iz - epsilon : iz + 1.0 - epsilon
                    }
                    if (outHitNormal) {
                        outHitNormal.x = nx
                        outHitNormal.y = ny
                        outHitNormal.z = nz
                    }
                    return b
                }
            }
        }
        // walk to next face of cube along ray
        nx = ny = nz = 0
        step = 2.0
        if (direction.x < -epsilon) {
            const s = -fx / direction.x
            nx = 1
            step = s
        }
        if (direction.x > epsilon) {
            const s = (1.0 - fx) / direction.x
            nx = -1
            step = s
        }
        if (direction.y < -epsilon) {
            const s = -fy / direction.y
            if (s < step - minStep) {
                nx = 0
                ny = 1
                step = s
            } else if (s < step + minStep) {
                ny = 1
            }
        }
        if (direction.y > epsilon) {
            const s = (1.0 - fy) / direction.y
            if (s < step - minStep) {
                nx = 0
                ny = -1
                step = s
            } else if (s < step + minStep) {
                ny = -1
            }
        }
        if (direction.z < -epsilon) {
            const s = -fz / direction.z
            if (s < step - minStep) {
                nx = ny = 0
                nz = 1
                step = s
            } else if (s < step + minStep) {
                nz = 1
            }
        }
        if (direction.z > epsilon) {
            const s = (1.0 - fz) / direction.z
            if (s < step - minStep) {
                nx = ny = 0
                nz = -1
                step = s
            } else if (s < step + minStep) {
                nz = -1
            }
        }
        if (step > maxDistance - t) {
            step = maxDistance - t - minStep
        }
        if (step < minStep) {
            step = minStep
        }
        t += step
    }

    if (outHitPosition) {
        outHitPosition.x = ox
        outHitPosition.y = oy
        outHitPosition.z = oz
    }

    if (outHitNormal) {
        outHitNormal.x = outHitNormal.y = outHitNormal.z = 0
    }

    return false
}
