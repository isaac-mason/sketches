export type Vec2 = [x: number, y: number];
export type Vec3 = [x: number, y: number, z: number];
export type Vec4 = [x: number, y: number, z: number, w: number];
export type Quat = [x: number, y: number, z: number, w: number];
export type Quat2 = [x: number, y: number, z: number, w: number, x2: number, y2: number, z2: number, w2: number];
export type Mat2 = [e1: number, e2: number, e3: number, e4: number];
export type Mat3 = [e1: number, e2: number, e3: number, e4: number, e5: number, e6: number, e7: number, e8: number, e9: number];
export type Mat4 = [e1: number, e2: number, e3: number, e4: number, e5: number, e6: number, e7: number, e8: number, e9: number, e10: number, e11: number, e12: number, e13: number, e14: number, e15: number, e16: number];
export type Mat2d = [e1: number, e2: number, e3: number, e4: number, e5: number, e6: number];
export type Box3 = [min: Vec3, max: Vec3];
export type EulerOrder = 'xyz' | 'xzy' | 'yxz' | 'yzx' | 'zxy' | 'zyx';
export type Euler = [x: number, y: number, z: number, order?: EulerOrder];

/**
 * Represents a triangle in 3D space
 */
export type Triangle3 = [a: Vec3, b: Vec3, c: Vec3];

/**
 * Represents a triangle in 2D space
 */
export type Triangle2 = [a: Vec2, b: Vec2, c: Vec2];

/**
 * Represents a plane in 3D space
 * @param {Vector3} [normal=(1,0,0)] - A unit length vector defining the normal of the plane.
 * @param {number} [constant=0] - The signed distance from the origin to the plane.
 */
export type Plane3 = [normal: Vec3, constant: number];

/**
 * Represents a sphere in 3D space
 * center: Vec3, radius: number
 */
export type Sphere3 = [center: Vec3, radius: number];
