# TODO

## Fix hacks in `calcRollingFriction`

The rapier javascript bindings don't currently expose rigid body mass properties. In particular, the world inverse inertia matrix is not exposed, which is required for rolling friction calculations.

The vehicle chassis inertia is being estimated with a hard-coded AABB, which is not ideal, but works for now.

The ground rigid body inertia is also being estimated with a hard-coded AABB. This is more of a problem. If the ground rigid body is not fixed/zero-mass, the rolling friction calculations will be incorrect.

## Add a cool racetrack

Self explanatory :)