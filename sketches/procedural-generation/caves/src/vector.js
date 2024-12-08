export class Vector2 extends Array {
    constructor(x, y) {
        super(2)
        this[0] = x ?? 0
        this[1] = y ?? 0
    }

    get x() {
        return this[0]
    }

    get y() {
        return this[1]
    }

    set(x, y) {
        this[0] = x
        this[1] = y
        return this
    }

    copy(v) {
        this[0] = v[0]
        this[1] = v[1]
        return this
    }

    clone() {
        return new Vector2(this[0], this[1])
    }

    add(v) {
        this[0] += v[0]
        this[1] += v[1]
        return this
    }

    multiply(v) {
        this[0] *= v[0]
        this[1] *= v[1]
        return this
    }

    multiplyScalar(s) {
        this[0] *= s
        this[1] *= s
        return this
    }
}