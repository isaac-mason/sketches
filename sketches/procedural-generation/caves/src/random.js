/**
 * @param {number} seed
 * @returns {() => number}
 */
export const createRandomGenerator = (seed) => {
    let state = seed

    const mulberry32 = (a) => {
        return function () {
            a |= 0
            a = (a + 0x6d2b79f5) | 0
            let t = Math.imul(a ^ (a >>> 15), 1 | a)
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }
    }

    return mulberry32(state)
}
