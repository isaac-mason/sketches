import { Vec3 } from './vec3'

const traceRayImpl = (
    isSolid: (position: Vec3) => boolean,
    origin: Vec3,
    direction: Vec3,
    maxDistance: number,
    hitPosition: Vec3,
    hitNormal: Vec3,
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
        ox = origin[0] + t * direction[0]
        oy = origin[1] + t * direction[1]
        oz = origin[2] + t * direction[2]
        ix = Math.floor(ox) | 0
        iy = Math.floor(oy) | 0
        iz = Math.floor(oz) | 0
        fx = ox - ix
        fy = oy - iy
        fz = oz - iz
        b = isSolid([ix, iy, iz])

        if (b) {
            if (hitPosition) {
                // Clamp to face on hit
                hitPosition[0] = fx < epsilon ? +ix : fx > 1.0 - epsilon ? ix + 1.0 - epsilon : ox
                hitPosition[1] = fy < epsilon ? +iy : fy > 1.0 - epsilon ? iy + 1.0 - epsilon : oy
                hitPosition[2] = fz < epsilon ? +iz : fz > 1.0 - epsilon ? iz + 1.0 - epsilon : oz
            }
            if (hitNormal) {
                hitNormal[0] = nx
                hitNormal[1] = ny
                hitNormal[2] = nz
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
                b = isSolid([ix + nx, iy + ny, iz]) || isSolid([ix, iy + ny, iz + nz]) || isSolid([ix + nx, iy, iz + nz])
                if (b) {
                    if (hitPosition) {
                        hitPosition[0] = nx < 0 ? ix - epsilon : ix + 1.0 - epsilon
                        hitPosition[1] = ny < 0 ? iy - epsilon : iy + 1.0 - epsilon
                        hitPosition[2] = nz < 0 ? iz - epsilon : iz + 1.0 - epsilon
                    }
                    if (hitNormal) {
                        hitNormal[0] = nx
                        hitNormal[1] = ny
                        hitNormal[2] = nz
                    }
                    return b
                }
            }
            if (ex && (ey || ez)) {
                b = isSolid([ix + nx, iy, iz])
                if (b) {
                    if (hitPosition) {
                        hitPosition[0] = nx < 0 ? ix - epsilon : ix + 1.0 - epsilon
                        hitPosition[1] = fy < epsilon ? +iy : oy
                        hitPosition[2] = fz < epsilon ? +iz : oz
                    }
                    if (hitNormal) {
                        hitNormal[0] = nx
                        hitNormal[1] = ny
                        hitNormal[2] = nz
                    }
                    return b
                }
            }
            if (ey && (ex || ez)) {
                b = isSolid([ix, iy + ny, iz])
                if (b) {
                    if (hitPosition) {
                        hitPosition[0] = fx < epsilon ? +ix : ox
                        hitPosition[1] = ny < 0 ? iy - epsilon : iy + 1.0 - epsilon
                        hitPosition[2] = fz < epsilon ? +iz : oz
                    }
                    if (hitNormal) {
                        hitNormal[0] = nx
                        hitNormal[1] = ny
                        hitNormal[2] = nz
                    }
                    return b
                }
            }
            if (ez && (ex || ey)) {
                b = isSolid([ix, iy, iz + nz])
                if (b) {
                    if (hitPosition) {
                        hitPosition[0] = fx < epsilon ? +ix : ox
                        hitPosition[1] = fy < epsilon ? +iy : oy
                        hitPosition[2] = nz < 0 ? iz - epsilon : iz + 1.0 - epsilon
                    }
                    if (hitNormal) {
                        hitNormal[0] = nx
                        hitNormal[1] = ny
                        hitNormal[2] = nz
                    }
                    return b
                }
            }
        }
        // walk to next face of cube along ray
        nx = ny = nz = 0
        step = 2.0
        if (direction[0] < -epsilon) {
            const s = -fx / direction[0]
            nx = 1
            step = s
        }
        if (direction[0] > epsilon) {
            const s = (1.0 - fx) / direction[0]
            nx = -1
            step = s
        }
        if (direction[1] < -epsilon) {
            const s = -fy / direction[1]
            if (s < step - minStep) {
                nx = 0
                ny = 1
                step = s
            } else if (s < step + minStep) {
                ny = 1
            }
        }
        if (direction[1] > epsilon) {
            const s = (1.0 - fy) / direction[1]
            if (s < step - minStep) {
                nx = 0
                ny = -1
                step = s
            } else if (s < step + minStep) {
                ny = -1
            }
        }
        if (direction[2] < -epsilon) {
            const s = -fz / direction[2]
            if (s < step - minStep) {
                nx = ny = 0
                nz = 1
                step = s
            } else if (s < step + minStep) {
                nz = 1
            }
        }
        if (direction[2] > epsilon) {
            const s = (1.0 - fz) / direction[2]
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
        hitPosition[0] = ox
        hitPosition[1] = oy
        hitPosition[2] = oz
    }

    if (hitNormal) {
        hitNormal[0] = hitNormal[1] = hitNormal[2] = 0
    }
    return false
}

export type TraceRayResult =
    | { hit: false; hitPosition: undefined; hitNormal: undefined }
    | { hit: true; hitPosition: Vec3; hitNormal: Vec3 }

export const traceRay = (
    isSolid: (pos: Vec3) => boolean,
    origin: Vec3,
    direction: Vec3,
    maxDistance = 500,
    hitPosition: Vec3 = [0, 0, 0],
    hitNormal: Vec3 = [0, 0, 0],
    EPSILON = 1e-8,
): TraceRayResult => {
    const px = +origin[0]
    const py = +origin[1]
    const pz = +origin[2]

    let dx = +direction[0]
    let dy = +direction[1]
    let dz = +direction[2]

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

    const hit = traceRayImpl(isSolid, [px, py, pz], [dx, dy, dz], maxDistance, hitPosition, hitNormal, EPSILON)

    if (hit) {
        return { hit: true, hitPosition: hitPosition, hitNormal: hitNormal }
    }

    return { hit, hitPosition: undefined, hitNormal: undefined }
}
