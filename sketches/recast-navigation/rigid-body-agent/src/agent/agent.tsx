import { useInterval } from '@sketches/common/hooks/use-interval';
import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
    CapsuleCollider,
    type RapierRigidBody,
    RigidBody,
    useBeforePhysicsStep,
} from '@react-three/rapier';
import { useControls } from 'leva';
import { useRef, useState } from 'react';
import * as THREE from 'three';
import { navQuery, playerQuery } from '../ecs';
import { Duck } from './duck';

export type AgentProps = {
    position: [number, number, number];
};

const radius = 0.5;
const height = 1.5;

const _agentPosition = new THREE.Vector3();
const _agentLookAt = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();
const _slerpedQuat = new THREE.Quaternion();

const up = new THREE.Vector3(0, 1, 0);

const queryHalfExtents = new THREE.Vector3(10, 10, 10);

const horizontalDistance = (a: THREE.Vector3Like, b: THREE.Vector3Like) => {
    return Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
};

const distanceThreshold = 3;
const speed = 3.5;

export const Agent = ({ position }: AgentProps) => {
    const { pathDebugLine } = useControls('agent', {
        pathDebugLine: false,
    });

    const ref = useRef<RapierRigidBody>(null!);

    const [path, setPath] = useState<THREE.Vector3[]>([]);
    const pathIndex = useRef(1);

    /* compute path */
    useInterval(() => {
        const nav = navQuery.first?.nav;
        if (!nav) return;

        if (nav.navMeshVersion === 0) return;

        const navMeshQuery = nav.navMeshQuery;
        if (!navMeshQuery) return;

        const player = playerQuery.first;
        if (!player) return;

        const rigidBody = ref.current;

        const { nearestPoint: agentNearestPoint } = navMeshQuery.findNearestPoly(
            rigidBody.translation(),
            { halfExtents: queryHalfExtents },
        );
        const agentPosition = _agentPosition.copy(agentNearestPoint);

        const { nearestPoint: playerPosition } = navMeshQuery.findNearestPoly(
            player.rigidBody.translation(),
            {
                halfExtents: queryHalfExtents,
            },
        );

        const { path } = navMeshQuery.computePath(
            agentPosition,
            playerPosition,
        );
        pathIndex.current = 1;

        setPath(path.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
    }, 1000 / 10);

    /* movement */
    useBeforePhysicsStep(() => {
        const navMeshQuery = navQuery.first?.nav.navMeshQuery;
        if (!navMeshQuery) return;

        const player = playerQuery.first;
        if (!player) return;

        if (!navMeshQuery) return;

        if (!path || path.length < 2) return;

        const rigidBody = ref.current;

        // teleport if falling off map
        if (rigidBody.translation().y < -50) {
            rigidBody.setTranslation(new THREE.Vector3(0, 5, 0), true);
            return;
        }

        // advance through the path
        // very naive approach, won't work for complex paths
        while (
            pathIndex.current < path.length - 1 &&
            horizontalDistance(
                path[pathIndex.current],
                rigidBody.translation(),
            ) < 0.05 &&
            path[pathIndex.current + 1]
        ) {
            pathIndex.current++;
        }

        const next = path[pathIndex.current];
        if (!next) return;

        // early exit if close enough to the final point
        if (pathIndex.current === path.length - 1) {
            if (
                horizontalDistance(next, ref.current.translation()) <
                distanceThreshold
            ) {
                return;
            }
        }

        const direction = _direction.copy(next).sub(ref.current.translation());
        direction.y = 0;
        direction.normalize();

        const vel = direction.multiplyScalar(speed);
        vel.y = rigidBody.linvel().y;

        rigidBody.setLinvel(vel, true);
    });

    /* rotation */
    useFrame((_, delta) => {
        const t = 1 - 0.001 ** delta;

        const lookAt = _agentLookAt;

        if (path.length === 0) {
            const player = playerQuery.first;
            if (!player) return;

            lookAt.copy(player.rigidBody.translation());
        } else if (path[pathIndex.current]) {
            lookAt.copy(path[pathIndex.current]);
        }

        if (horizontalDistance(lookAt, ref.current.translation()) < 0.1) {
            return;
        }

        const direction = _direction
            .copy(ref.current.translation())
            .sub(lookAt);
        direction.y = 0;
        direction.normalize();

        const yRot = Math.atan2(direction.x, direction.z) - Math.PI;
        const targetQuat = _targetQuat.setFromAxisAngle(up, yRot).normalize();
        const slerpedQuat = _slerpedQuat
            .copy(ref.current.rotation())
            .clone()
            .slerp(targetQuat, t * 2);

        ref.current.setRotation(slerpedQuat, true);
    });

    return (
        <>
            <RigidBody
                ref={ref}
                position={position}
                type="dynamic"
                enabledRotations={[false, true, false]}
                colliders={false}
                angularDamping={0.9}
                linearDamping={0.5}
            >
                <Duck />

                <CapsuleCollider args={[height / 2, radius]} />
            </RigidBody>

            {pathDebugLine && path.length > 0 && (
                <Line
                    points={path}
                    color="blue"
                    lineWidth={2}
                    position={[0, 0.2, 0]}
                />
            )}
        </>
    );
};
