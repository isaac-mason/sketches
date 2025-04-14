export type Vec3 = [number, number, number];

export const vec3 = {
    add: (a: Vec3, b: Vec3, out: Vec3): Vec3 => {
        out[0] = a[0] + b[0];
        out[1] = a[1] + b[1];
        out[2] = a[2] + b[2];
        return out
    },
    sub: (a: Vec3, b: Vec3, out: Vec3): Vec3 => {
        out[0] = a[0] - b[0];
        out[1] = a[1] - b[1];
        out[2] = a[2] - b[2];
        return out
    },
    multiplyScalar: (a: Vec3, scalar: number, out: Vec3): Vec3 => {
        out[0] = a[0] * scalar;
        out[1] = a[1] * scalar;
        out[2] = a[2] * scalar;
        return out
    },
    directionBetween(a: Vec3, b: Vec3, out: Vec3): Vec3 {
        this.sub(a, b, out);
        this.normalize(out, out);

        return out
    },
    length: (a: Vec3): number => {
        return Math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2);
    },
    setLength(a: Vec3, newLength: number, out: Vec3): Vec3 {
        const length = this.length(a);
        
        if (length === 0) {
            out[0] = 0;
            out[1] = 0;
            out[2] = 0;
        } else {
            const scale = newLength / length;
            out[0] = a[0] * scale;
            out[1] = a[1] * scale;
            out[2] = a[2] * scale;
        }

        return out
    },
    normalize: (a: Vec3, out: Vec3): Vec3 => {
        const length = Math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2);
        if (length === 0) {
            out[0] = 0;
            out[1] = 0;
            out[2] = 0;
        } else {
            out[0] = a[0] / length;
            out[1] = a[1] / length;
            out[2] = a[2] / length;
        }
        return out
    },
    copy: (a: Vec3, out: Vec3): Vec3 => {
        out[0] = a[0];
        out[1] = a[1];
        out[2] = a[2];
        return out
    },
}
