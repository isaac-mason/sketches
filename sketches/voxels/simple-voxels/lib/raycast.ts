import * as THREE from 'three'
import type { World } from './world'

const traceRay = (
    world: World,
    origin: THREE.Vector3Like,
    direction: THREE.Vector3Like,
    maxDistance: number,
    hitPosition: THREE.Vector3,
    hitNormal: THREE.Vector3,
    epsilon: number,
) => {
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
        b = world.getSolid(ix, iy, iz)

        if (b) {
            if (hitPosition) {
                // Clamp to face on hit
                hitPosition.x = fx < epsilon ? +ix : fx > 1.0 - epsilon ? ix + 1.0 - epsilon : ox
                hitPosition.y = fy < epsilon ? +iy : fy > 1.0 - epsilon ? iy + 1.0 - epsilon : oy
                hitPosition.z = fz < epsilon ? +iz : fz > 1.0 - epsilon ? iz + 1.0 - epsilon : oz
            }
            if (hitNormal) {
                hitNormal.x = nx
                hitNormal.y = ny
                hitNormal.z = nz
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
                    world.getSolid(ix + nx, iy + ny, iz) ||
                    world.getSolid(ix, iy + ny, iz + nz) ||
                    world.getSolid(ix + nx, iy, iz + nz)
                if (b) {
                    if (hitPosition) {
                        hitPosition.x = nx < 0 ? ix - epsilon : ix + 1.0 - epsilon
                        hitPosition.y = ny < 0 ? iy - epsilon : iy + 1.0 - epsilon
                        hitPosition.z = nz < 0 ? iz - epsilon : iz + 1.0 - epsilon
                    }
                    if (hitNormal) {
                        hitNormal.x = nx
                        hitNormal.y = ny
                        hitNormal.z = nz
                    }
                    return b
                }
            }
            if (ex && (ey || ez)) {
                b = world.getSolid(ix + nx, iy, iz)
                if (b) {
                    if (hitPosition) {
                        hitPosition.x = nx < 0 ? ix - epsilon : ix + 1.0 - epsilon
                        hitPosition.y = fy < epsilon ? +iy : oy
                        hitPosition.z = fz < epsilon ? +iz : oz
                    }
                    if (hitNormal) {
                        hitNormal.x = nx
                        hitNormal.y = ny
                        hitNormal.z = nz
                    }
                    return b
                }
            }
            if (ey && (ex || ez)) {
                b = world.getSolid(ix, iy + ny, iz)
                if (b) {
                    if (hitPosition) {
                        hitPosition.x = fx < epsilon ? +ix : ox
                        hitPosition.y = ny < 0 ? iy - epsilon : iy + 1.0 - epsilon
                        hitPosition.z = fz < epsilon ? +iz : oz
                    }
                    if (hitNormal) {
                        hitNormal.x = nx
                        hitNormal.y = ny
                        hitNormal.z = nz
                    }
                    return b
                }
            }
            if (ez && (ex || ey)) {
                b = world.getSolid(ix, iy, iz + nz)
                if (b) {
                    if (hitPosition) {
                        hitPosition.x = fx < epsilon ? +ix : ox
                        hitPosition.y = fy < epsilon ? +iy : oy
                        hitPosition.z = nz < 0 ? iz - epsilon : iz + 1.0 - epsilon
                    }
                    if (hitNormal) {
                        hitNormal.x = nx
                        hitNormal.y = ny
                        hitNormal.z = nz
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

    if (hitPosition) {
        hitPosition.x = ox
        hitPosition.y = oy
        hitPosition.z = oz
    }

    if (hitNormal) {
        hitNormal.x = hitNormal.y = hitNormal.z = 0
    }

    return false
}

export type RaycastResult =
    | { hit: false; hitPosition: undefined; hitNormal: undefined }
    | { hit: true; hitPosition: THREE.Vector3; hitNormal: THREE.Vector3 }

const _origin = new THREE.Vector3()
const _direction = new THREE.Vector3()

export const raycast = (
    world: World,
    origin: THREE.Vector3Like,
    direction: THREE.Vector3Like,
    maxDistance = 500,
    hitPosition: THREE.Vector3,
    hitNormal: THREE.Vector3,
    EPSILON = 1e-8,
): RaycastResult => {
    const px = origin.x
    const py = origin.y
    const pz = origin.z

    let dx = direction.x
    let dy = direction.y
    let dz = direction.z

    const ds = Math.sqrt(dx * dx + dy * dy + dz * dz)

    if (typeof EPSILON === 'undefined') {
        EPSILON = 1e-8
    }

    if (ds < EPSILON) {
        return { hit: false, hitPosition: undefined, hitNormal: undefined }
    }

    dx /= ds
    dy /= ds
    dz /= ds

    const hit = traceRay(world, _origin.set(px, py, pz), _direction.set(dx, dy, dz), maxDistance, hitPosition, hitNormal, EPSILON)

    if (hit) {
        return { hit: true, hitPosition, hitNormal }
    }

    return { hit, hitPosition: undefined, hitNormal: undefined }
}
