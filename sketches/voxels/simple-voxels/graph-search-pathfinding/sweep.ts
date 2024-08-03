// adapted from: https://github.com/skishore/wave

import { Vector3Tuple } from 'three'

type Check = (x: number, y: number, z: number) => boolean

const kSweepShift = 12
const kSweepResolution = 1 << kSweepShift
const kSweepMask = kSweepResolution - 1

const kSpeeds = [0, 0, 0, 0]
const kDistances = [0, 0, 0, kSweepResolution]
const kVoxel = [0, 0, 0]

const sweep = (
    min: Vector3Tuple,
    max: Vector3Tuple,
    delta: Vector3Tuple,
    impacts: Vector3Tuple,
    check: Check,
    stopOnImpact: boolean = false,
) => {
    for (let i = 0; i < 3; i++) {
        min[i] = (min[i] * kSweepResolution) | 0
        max[i] = (max[i] * kSweepResolution) | 0
        delta[i] = (delta[i] * kSweepResolution) | 0
        impacts[i] = 0
    }

    while (delta[0] || delta[1] || delta[2]) {
        let best = 3
        let bounded = true

        for (let i = 0; i < 3; i++) {
            const step = delta[i]
            const speed = Math.abs(step)
            const place = step > 0 ? max[i] : -min[i]
            const distance = kSweepResolution - ((place - 1) & kSweepMask)
            kSpeeds[i] = speed
            kDistances[i] = distance

            bounded = bounded && speed < distance
            const better = speed * kDistances[best] > kSpeeds[best] * distance
            if (better) best = i
        }

        if (bounded) {
            for (let i = 0; i < 3; i++) {
                min[i] += delta[i]
                max[i] += delta[i]
                delta[i] = 0
            }
            break
        }

        const direction = delta[best] > 0 ? 1 : -1
        const factor = kDistances[best] / kSpeeds[best]
        for (let i = 0; i < 3; i++) {
            const speed = kSpeeds[i]
            const distance = kDistances[i]
            const move = i !== best ? Math.min(distance - 1, (speed * factor) | 0) : distance
            const step = move * Math.sign(delta[i])
            min[i] += step
            max[i] += step
            delta[i] -= step
        }

        const i = best
        kVoxel[i] = (direction > 0 ? max[i] - 1 : min[i]) >> kSweepShift

        const j = i < 2 ? i + 1 : i - 2
        const k = i < 1 ? i + 2 : i - 1
        const jlo = min[j] >> kSweepShift
        const jhi = (max[j] - 1) >> kSweepShift
        const klo = min[k] >> kSweepShift
        const khi = (max[k] - 1) >> kSweepShift

        let done = false
        for (kVoxel[j] = jlo; !done && kVoxel[j] <= jhi; kVoxel[j]++) {
            for (kVoxel[k] = klo; !done && kVoxel[k] <= khi; kVoxel[k]++) {
                const x = kVoxel[0],
                    y = kVoxel[1],
                    z = kVoxel[2]
                if (check(x, y, z)) continue
                impacts[i] = direction
                min[i] -= direction
                max[i] -= direction
                delta[i] = 0
                done = true
            }
        }

        if (done && stopOnImpact) break
    }

    for (let i = 0; i < 3; i++) {
        min[i] = min[i] / kSweepResolution
        max[i] = max[i] / kSweepResolution
    }
}

export { kSweepResolution, sweep }
