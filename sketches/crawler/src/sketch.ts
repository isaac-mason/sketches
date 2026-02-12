import {
    CastRayStatus,
    DOF_TRANSLATION_ONLY,
    MotionType,
    type RigidBody,
    type World,
    addBroadphaseLayer,
    addObjectLayer,
    box,
    castRay,
    createClosestCastRayCollector,
    createDefaultCastRaySettings,
    createWorld,
    createWorldSettings,
    enableCollision,
    filter,
    registerAll,
    rigidBody,
    sphere,
    triangleMesh,
    updateWorld,
} from 'crashcat';
import { debugRenderer } from 'crashcat/three';
import { GUI } from 'lil-gui';
import { type Vec3, euler, quat, remapClamp, vec3 } from 'mathcat';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type Chain, JointConstraintType, bone, fabrikFixedIterations } from './fabrik';

type LegDef = {
    id: string;
    attachmentOffset: THREE.Vector3Tuple;
    footPlacementOffset: THREE.Vector3Tuple;
    segments: number;
    legLength: number;
    phaseOffset: number;
};

type LegState = {
    footPlacementRayOrigin: THREE.Vector3;
    footPlacementPosition: THREE.Vector3;
    effectorGoalPosition: THREE.Vector3;
    effectorCurrentPosition: THREE.Vector3;
    chain: Chain;
    stepping: boolean;
    stepProgress: number;
    lastStepTime: number;
    legVisuals: LegVisuals | undefined;
    chainHelper: ChainHelper | undefined;
    footPlacementHelper: FootPlacementHelper | undefined;
};

type CrawlerDef = {
    color: string;
    legs: LegDef[];
    speed: number;
    sprintMultiplier: number;
    height: number;
    jumpImpulse: number;
    stepArcHeight: number;
    footPlacementStepDistanceThreshold: number;
    footPlacementEmergencyStepDistanceThreshold: number;
    stepSpeed: number;
    stepCycleSpeed: number;
};

type CrawlerState = {
    def: CrawlerDef;
    input: {
        direction: THREE.Vector2;
        crouch: boolean;
        sprint: boolean;
    };
    cmd: Array<'jump'>;
    state: {
        legs: Record<string, LegState>;
        position: THREE.Vector3;
        stepCycleTime: number;
        grounded: boolean;
        jumping: boolean;
        lastJumpTime: number;
        landing: boolean;
    };
};

type GooglyEye = {
    object: THREE.Group;
    eyeMesh: THREE.Mesh;
    irisMesh: THREE.Mesh;
    currentWorldPosition: THREE.Vector3;
    prevWorldPosition: THREE.Vector3 | undefined;
    velocity: THREE.Vector3;
    localPosition: THREE.Vector3;
    config: {
        eyeRadius: number;
        irisRadius: number;
        gravity: number;
        friction: number;
        bounciness: number;
    };
};

type CrawlerEntity = {
    crawler: CrawlerState;
    rigidBody: RigidBody;
    three: THREE.Object3D;
    eyes: GooglyEye[];
};

type PhysicsObject = {
    body: RigidBody;
    object3d: THREE.Object3D;
};

type LegVisuals = {
    boneMeshes: THREE.Mesh[];
    boneGeometry: THREE.CylinderGeometry;
    boneMaterial: THREE.MeshStandardMaterial;
};

type ChainHelper = {
    boneMeshes: THREE.Mesh[];
    boneGeometry: THREE.CylinderGeometry;
    boneMaterial: THREE.MeshBasicMaterial;
    jointMeshes: THREE.Mesh[];
    jointGeometry: THREE.SphereGeometry;
    jointMaterial: THREE.MeshBasicMaterial;
    baseMaterial: THREE.MeshBasicMaterial;
    effectorMaterial: THREE.MeshBasicMaterial;
    effectorMesh: THREE.Mesh;
    attachmentGeometry: THREE.SphereGeometry;
    attachmentMaterial: THREE.MeshBasicMaterial;
    attachmentMesh: THREE.Mesh;
};

type FootPlacementHelper = {
    rayOriginHelper: THREE.Mesh;
    footPlacementPositionHelper: THREE.Mesh;
    goalPositionHelper: THREE.Mesh;
    geometries: THREE.BufferGeometry[];
    materials: THREE.Material[];
};

/* state */

// rendering
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let orbitControls: OrbitControls;
let debugRendererState: ReturnType<typeof debugRenderer.init>;

// physics
registerAll();

const worldSettings = createWorldSettings();
const BROADPHASE_LAYER_MOVING = addBroadphaseLayer(worldSettings);
const BROADPHASE_LAYER_NOT_MOVING = addBroadphaseLayer(worldSettings);
const OBJECT_LAYER_MOVING = addObjectLayer(worldSettings, BROADPHASE_LAYER_MOVING);
const OBJECT_LAYER_NOT_MOVING = addObjectLayer(worldSettings, BROADPHASE_LAYER_NOT_MOVING);

enableCollision(worldSettings, OBJECT_LAYER_MOVING, OBJECT_LAYER_MOVING);
enableCollision(worldSettings, OBJECT_LAYER_MOVING, OBJECT_LAYER_NOT_MOVING);

const physicsWorld: World = createWorld(worldSettings);

// raycast collectors
const suspensionRayCollector = createClosestCastRayCollector();
const suspensionRaySettings = createDefaultCastRaySettings();
const suspensionQueryFilter = filter.forWorld(physicsWorld);

const footPlacementRayCollector = createClosestCastRayCollector();
const footPlacementRaySettings = createDefaultCastRaySettings();
const footPlacementQueryFilter = filter.forWorld(physicsWorld);

// crawlers
const crawlers: CrawlerEntity[] = [];
let controlTargetCrawler: CrawlerEntity | null = null;

// physics objects (for dynamic objects that need physics sync)
const physicsObjects: PhysicsObject[] = [];

// controls
const controls = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    crouch: false,
    sprint: false,
};

// tmps
const _footPlacementOffset = new THREE.Vector3();
const _legOrigin = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _rayDirection = new THREE.Vector3();
const _rayDistance = new THREE.Vector3();
const _impulse = new THREE.Vector3();
const _legOffset = new THREE.Vector3();
const _midpoint = new THREE.Vector3();
const _start = new THREE.Vector3();
const _end = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _velocity = new THREE.Vector3();
const _currentEffectorPositionLocal = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _cameraOffset = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _movementVelocity = new THREE.Vector3();
const _addVelocity = new THREE.Vector3();
const _normal = new THREE.Vector3();

const _currentFootPositionVec3: Vec3 = [0, 0, 0];

const UP = new THREE.Vector3(0, 1, 0);

// camera target
const cameraTarget = new THREE.Vector3(0, 4, 0);

const ease = (x: number): number => {
    return -(Math.cos(Math.PI * x) - 1) / 2;
};

/* crawlers */

const initCrawler = (def: CrawlerDef): CrawlerState => {
    const legs: Record<string, LegState> = {};

    for (const leg of def.legs) {
        const chain: Chain = {
            bones: [],
        };

        const segmentLength = leg.legLength / leg.segments;
        const prevEnd = new THREE.Vector3();

        for (let i = 0; i < leg.segments; i++) {
            const start = prevEnd.clone();
            const end = start.clone();
            end.add(_legOffset.set(0, -1, 0).multiplyScalar(segmentLength));

            chain.bones.push(
                bone(start.toArray(), end.toArray(), {
                    type: JointConstraintType.BALL,
                    rotor: Math.PI / 2,
                }),
            );

            prevEnd.copy(end);
        }

        legs[leg.id] = {
            footPlacementRayOrigin: new THREE.Vector3(),
            footPlacementPosition: new THREE.Vector3(),
            effectorGoalPosition: new THREE.Vector3(),
            effectorCurrentPosition: new THREE.Vector3(),
            stepping: false,
            stepProgress: 1,
            lastStepTime: 0,
            chain,
            legVisuals: undefined,
            footPlacementHelper: undefined,
            chainHelper: undefined,
        };
    }

    return {
        def,
        input: {
            direction: new THREE.Vector2(),
            crouch: false,
            sprint: false,
        },
        cmd: [],
        state: {
            legs,
            position: new THREE.Vector3(),
            stepCycleTime: 0,
            grounded: false,
            jumping: false,
            lastJumpTime: 0,
            landing: false,
        },
    };
};

const updateCrawlerMovement = (crawler: CrawlerState, body: RigidBody, _dt: number) => {
    // determine velocity from input
    _velocity.set(crawler.input.direction.x, 0, crawler.input.direction.y);
    _velocity.normalize();
    _velocity.multiplyScalar(crawler.def.speed);
    if (crawler.input.sprint) {
        _velocity.multiplyScalar(crawler.def.sprintMultiplier);
    }

    // preserve y velocity
    _velocity.y = body.motionProperties.linearVelocity[1];

    // set velocity
    vec3.set(body.motionProperties.linearVelocity, _velocity.x, _velocity.y, _velocity.z);
    vec3.set(body.motionProperties.angularVelocity, 0, 0, 0);

    // handle commands
    for (const cmd of crawler.cmd) {
        if (cmd === 'jump') {
            if (crawler.state.jumping || !crawler.state.grounded) {
                continue;
            }

            crawler.state.jumping = true;
            crawler.state.lastJumpTime = performance.now();
            crawler.state.grounded = false;

            const mass = 1.0 / body.motionProperties.invMass;
            _impulse.set(0, crawler.def.jumpImpulse * mass, 0);
            const impulseVec3: Vec3 = [_impulse.x, _impulse.y, _impulse.z];
            rigidBody.addImpulse(physicsWorld, body, impulseVec3);
        }
    }

    crawler.cmd.length = 0;
};

const updateCrawlerPosition = (crawler: CrawlerState, body: RigidBody) => {
    crawler.state.position.set(body.position[0], body.position[1], body.position[2]);
};

const updateCrawlerTimer = (crawler: CrawlerState, dt: number) => {
    crawler.state.stepCycleTime = (crawler.state.stepCycleTime + dt * crawler.def.stepCycleSpeed) % 1;
};

const updateCrawlerSuspension = (crawler: CrawlerState, body: RigidBody, world: World, dt: number) => {
    if (
        crawler.state.jumping &&
        (crawler.state.lastJumpTime + 300 > performance.now() || body.motionProperties.linearVelocity[1] > 0)
    ) {
        return;
    }

    let desiredHeight = crawler.def.height;
    if (crawler.input.crouch) {
        desiredHeight /= 2;
    }

    const legHeightOrigin = crawler.state.position.y - crawler.def.height / 2;

    let avgLegHeightRelative = 0;
    for (const leg of crawler.def.legs) {
        const legState = crawler.state.legs[leg.id];
        avgLegHeightRelative += legState.effectorCurrentPosition.y - legHeightOrigin;
    }

    if (avgLegHeightRelative > 0) {
        avgLegHeightRelative /= crawler.def.legs.length;
    }

    if (avgLegHeightRelative > 0) {
        desiredHeight += avgLegHeightRelative;
    }

    _rayOrigin.set(body.position[0], body.position[1], body.position[2]);
    _rayDirection.set(0, -1, 0);
    const rayLength = desiredHeight + 5;

    const origin: Vec3 = [_rayOrigin.x, _rayOrigin.y, _rayOrigin.z];
    const direction: Vec3 = [_rayDirection.x, _rayDirection.y, _rayDirection.z];

    // exclude the crawler's own body from the raycast
    suspensionQueryFilter.bodyFilter = (b) => b !== body;
    suspensionRayCollector.reset();
    castRay(world, suspensionRayCollector, suspensionRaySettings, origin, direction, rayLength, suspensionQueryFilter);

    let grounded = false;

    if (suspensionRayCollector.hit.status === CastRayStatus.COLLIDING) {
        const rayHitDistance = suspensionRayCollector.hit.fraction * rayLength;

        if (rayHitDistance < crawler.def.height + 0.1) {
            grounded = true;
        }

        if (grounded) {
            const heightDesired = desiredHeight;
            const heightCurrent = rayHitDistance;

            const springConstant = 10;
            const springDamping = 2;
            const currentVerticalVelocity = body.motionProperties.linearVelocity[1];

            const velocity = (heightDesired - heightCurrent) * springConstant - currentVerticalVelocity * springDamping;

            const mass = 1.0 / body.motionProperties.invMass;
            _impulse.set(0, velocity * dt * mass, 0);
            const impulseVec3: Vec3 = [_impulse.x, _impulse.y, _impulse.z];
            rigidBody.addImpulse(physicsWorld, body, impulseVec3);
        }
    }

    if (crawler.state.jumping && grounded) {
        crawler.state.jumping = false;
    }

    crawler.state.landing = !crawler.state.grounded && grounded;
    crawler.state.grounded = grounded;
};

const updateCrawlerFootPlacement = (crawler: CrawlerState, crawlerObject: THREE.Object3D, body: RigidBody, world: World) => {
    if (crawler.state.grounded) {
        for (const leg of crawler.def.legs) {
            const legState = crawler.state.legs[leg.id];

            _legOrigin.copy(crawler.state.position);
            _legOrigin.add(_legOffset.set(...leg.attachmentOffset));

            _rayDirection.set(0, -1, 0);
            _footPlacementOffset.set(...leg.footPlacementOffset);

            legState.footPlacementRayOrigin.copy(crawler.state.position).add(_footPlacementOffset);
            legState.footPlacementRayOrigin.y = _legOrigin.y + crawler.def.height / 2;

            const rayLength = 10;

            const origin: Vec3 = [
                legState.footPlacementRayOrigin.x,
                legState.footPlacementRayOrigin.y,
                legState.footPlacementRayOrigin.z,
            ];
            const direction: Vec3 = [_rayDirection.x, _rayDirection.y, _rayDirection.z];

            footPlacementRayCollector.reset();
            castRay(
                world,
                footPlacementRayCollector,
                footPlacementRaySettings,
                origin,
                direction,
                rayLength,
                footPlacementQueryFilter,
            );

            const hitDistance =
                footPlacementRayCollector.hit.status === CastRayStatus.COLLIDING
                    ? footPlacementRayCollector.hit.fraction * rayLength
                    : rayLength;

            _rayDistance.copy(_rayDirection).multiplyScalar(hitDistance);

            legState.footPlacementPosition.copy(legState.footPlacementRayOrigin);
            legState.footPlacementPosition.add(_rayDistance);
        }
    } else {
        // extend legs outwards
        for (const leg of crawler.def.legs) {
            const legState = crawler.state.legs[leg.id];

            _start.set(...leg.attachmentOffset);
            _end.set(...leg.footPlacementOffset);

            _direction.subVectors(_end, _start);
            _direction.y = 0;
            _direction.normalize();
            _direction.multiplyScalar(leg.legLength * 1.2);

            legState.footPlacementPosition.copy(_direction);
            crawlerObject.localToWorld(legState.footPlacementPosition);

            legState.footPlacementPosition.y += Math.sin(performance.now() / 100 + leg.phaseOffset) * 0.75;

            const verticalLinearVelocity = body.motionProperties.linearVelocity[1];

            legState.footPlacementPosition.y += remapClamp(verticalLinearVelocity, -2, 2, 0.5, -0.5);
        }
    }
};

const updateCrawlerStepping = (crawler: CrawlerState, body: RigidBody, dt: number) => {
    for (const leg of crawler.def.legs) {
        const legState = crawler.state.legs[leg.id];

        if (!crawler.state.grounded) {
            legState.stepping = false;
            legState.effectorGoalPosition.copy(legState.footPlacementPosition);
            legState.effectorCurrentPosition.lerp(legState.effectorGoalPosition, dt * 10);
            continue;
        }

        const footPlacementToGoalDistance = legState.effectorGoalPosition.distanceTo(legState.footPlacementPosition);

        if (legState.stepping) {
            const lv = body.motionProperties.linearVelocity;
            const speed = Math.sqrt(lv[0] ** 2 + lv[1] ** 2 + lv[2] ** 2);
            legState.stepProgress += dt * crawler.def.stepSpeed + dt * speed * 0.5;

            if (legState.stepProgress >= 1) {
                legState.stepProgress = 1;
                legState.stepping = false;
                legState.lastStepTime = performance.now();
            }
        } else {
            const legPhase = (crawler.state.stepCycleTime + leg.phaseOffset) % 1;
            const phaseWindowStart = 0;
            const phaseWindowEnd = 0.3;
            const inStepPhase = legPhase >= phaseWindowStart && legPhase <= phaseWindowEnd;

            const needsRegularStep = inStepPhase && footPlacementToGoalDistance > crawler.def.footPlacementStepDistanceThreshold;
            const needsEmergencyStep =
                footPlacementToGoalDistance > crawler.def.footPlacementEmergencyStepDistanceThreshold || crawler.state.landing;

            if (needsRegularStep || needsEmergencyStep) {
                legState.stepping = true;
                legState.stepProgress = 0;
                legState.effectorGoalPosition.copy(legState.footPlacementPosition);
            }
        }

        if (legState.stepping) {
            legState.effectorCurrentPosition.lerp(legState.effectorGoalPosition, legState.stepProgress);

            const easedProgress = ease(legState.stepProgress);
            if (easedProgress > 0 && easedProgress < 1) {
                const arcFactor = Math.sin(easedProgress * Math.PI) * crawler.def.stepArcHeight;
                legState.effectorCurrentPosition.y += arcFactor;
            }
        }
    }
};

const updateCrawlerIK = (crawler: CrawlerState, crawlerObject: THREE.Object3D) => {
    for (const leg of crawler.def.legs) {
        const legState = crawler.state.legs[leg.id];

        _currentEffectorPositionLocal.copy(legState.effectorCurrentPosition);
        crawlerObject.worldToLocal(_currentEffectorPositionLocal);

        _currentFootPositionVec3[0] = _currentEffectorPositionLocal.x;
        _currentFootPositionVec3[1] = _currentEffectorPositionLocal.y;
        _currentFootPositionVec3[2] = _currentEffectorPositionLocal.z;

        // reset the leg to face outwards
        for (let i = 0; i < legState.chain.bones.length; i++) {
            const bone = legState.chain.bones[i];
            const segmentLength = leg.legLength / leg.segments;

            _start.set(...leg.attachmentOffset);
            _end.set(...leg.footPlacementOffset);
            _direction.subVectors(_end, _start).normalize();
            _offset.copy(_direction).multiplyScalar(segmentLength);

            if (i === 0) {
                bone.start[0] = leg.attachmentOffset[0];
                bone.start[1] = leg.attachmentOffset[1];
                bone.start[2] = leg.attachmentOffset[2];

                bone.end[0] = _offset.x;
                bone.end[1] = _offset.y;
                bone.end[2] = _offset.z;
            } else {
                const prevBone = legState.chain.bones[i - 1];

                bone.start[0] = prevBone.end[0];
                bone.start[1] = prevBone.end[1];
                bone.start[2] = prevBone.end[2];

                bone.end[0] = bone.start[0] + _offset.x;
                bone.end[1] = bone.start[1] + _offset.y;
                bone.end[2] = bone.start[2] + _offset.z;
            }
        }

        fabrikFixedIterations(legState.chain, leg.attachmentOffset, _currentFootPositionVec3, 10);
    }
};

/* debug helpers */

const initFootPlacementHelper = (scene: THREE.Scene): FootPlacementHelper => {
    const rayOriginHelper = new THREE.Mesh(
        new THREE.SphereGeometry(0.05),
        new THREE.MeshBasicMaterial({ color: 'red', wireframe: true }),
    );

    const targetPositionHelper = new THREE.Mesh(
        new THREE.SphereGeometry(0.05),
        new THREE.MeshBasicMaterial({ color: 'green', wireframe: true }),
    );

    const currentPositionHelper = new THREE.Mesh(
        new THREE.SphereGeometry(0.06),
        new THREE.MeshBasicMaterial({ color: 'blue', wireframe: true }),
    );

    const geometries: THREE.BufferGeometry[] = [
        rayOriginHelper.geometry,
        targetPositionHelper.geometry,
        currentPositionHelper.geometry,
    ];
    const materials: THREE.Material[] = [rayOriginHelper.material, targetPositionHelper.material, currentPositionHelper.material];

    scene.add(rayOriginHelper);
    scene.add(targetPositionHelper);
    scene.add(currentPositionHelper);

    return {
        rayOriginHelper,
        footPlacementPositionHelper: targetPositionHelper,
        goalPositionHelper: currentPositionHelper,
        geometries,
        materials,
    };
};

const updateFootPlacementHelper = (
    helper: FootPlacementHelper,
    rayOrigin: THREE.Vector3,
    footPlacementPosition: THREE.Vector3,
    goalPosition: THREE.Vector3,
) => {
    helper.rayOriginHelper.position.copy(rayOrigin);
    helper.footPlacementPositionHelper.position.copy(footPlacementPosition);
    helper.goalPositionHelper.position.copy(goalPosition);
};

const disposeFootPlacementHelper = (helper: FootPlacementHelper) => {
    helper.rayOriginHelper.removeFromParent();
    helper.footPlacementPositionHelper.removeFromParent();
    helper.goalPositionHelper.removeFromParent();

    for (const geometry of helper.geometries) {
        geometry.dispose();
    }
    for (const material of helper.materials) {
        material.dispose();
    }
};

const initChainHelper = (chain: Chain, object: THREE.Object3D): ChainHelper => {
    const boneMeshes: THREE.Mesh[] = [];
    const boneGeometry = new THREE.CylinderGeometry(0.03, 0.03, 1, 8);
    const boneMaterial = new THREE.MeshBasicMaterial({
        color: '#fff',
        depthTest: false,
    });

    const jointMeshes: THREE.Mesh[] = [];
    const jointGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const jointMaterial = new THREE.MeshBasicMaterial({
        color: 'blue',
        depthTest: false,
    });

    const baseMaterial = new THREE.MeshBasicMaterial({
        color: 'green',
        depthTest: false,
    });

    for (let i = 0; i < chain.bones.length; i++) {
        const bone = chain.bones[i];

        const mesh = new THREE.Mesh(boneGeometry, boneMaterial);
        mesh.renderOrder = 1;
        mesh.position.set(...bone.start);
        mesh.lookAt(...bone.end);
        mesh.updateMatrixWorld();
        mesh.scale.set(1, bone.length, 1);
        object.add(mesh);
        boneMeshes.push(mesh);

        const jointMesh = new THREE.Mesh(jointGeometry, i === 0 ? baseMaterial : boneMaterial);
        jointMesh.position.set(...bone.start);
        object.add(jointMesh);
        jointMeshes.push(jointMesh);
    }

    const attachmentGeometry = new THREE.SphereGeometry(0.12, 8, 8);
    const attachmentMaterial = new THREE.MeshBasicMaterial({
        color: 'purple',
        depthTest: false,
    });
    const attachmentMesh = new THREE.Mesh(attachmentGeometry, attachmentMaterial);
    attachmentMesh.position.set(...chain.bones[0].start);
    attachmentMesh.renderOrder = 1;
    object.add(attachmentMesh);

    const effectorMaterial = new THREE.MeshBasicMaterial({
        color: 'red',
        depthTest: false,
    });
    const effectorMesh = new THREE.Mesh(jointGeometry, effectorMaterial);
    effectorMesh.renderOrder = 1;
    effectorMesh.position.set(...chain.bones[chain.bones.length - 1].end);
    object.add(effectorMesh);

    return {
        boneMeshes,
        boneGeometry,
        boneMaterial,
        jointMeshes,
        jointGeometry,
        jointMaterial,
        baseMaterial,
        effectorMaterial,
        effectorMesh,
        attachmentGeometry,
        attachmentMaterial,
        attachmentMesh,
    };
};

const updateChainHelper = (_leg: LegDef, chain: Chain, chainHelper: ChainHelper) => {
    for (let i = 0; i < chain.bones.length; i++) {
        const bone = chain.bones[i];
        const jointMesh = chainHelper.jointMeshes[i];
        const boneMesh = chainHelper.boneMeshes[i];

        _start.set(...bone.start);
        _end.set(...bone.end);

        _midpoint.addVectors(_start, _end).multiplyScalar(0.5);
        _direction.subVectors(_end, _start).normalize();
        _quaternion.setFromUnitVectors(UP, _direction);

        jointMesh.position.copy(_start);
        boneMesh.position.copy(_midpoint);
        boneMesh.quaternion.copy(_quaternion);
    }

    chainHelper.effectorMesh.position.set(...chain.bones[chain.bones.length - 1].end);
};

const disposeChainHelper = (chainHelper: ChainHelper) => {
    for (const mesh of chainHelper.boneMeshes) {
        mesh.removeFromParent();
    }

    for (const mesh of chainHelper.jointMeshes) {
        mesh.removeFromParent();
    }

    chainHelper.effectorMesh.removeFromParent();
    chainHelper.attachmentMesh.removeFromParent();

    chainHelper.boneGeometry.dispose();
    chainHelper.boneMaterial.dispose();
    chainHelper.jointGeometry.dispose();
    chainHelper.jointMaterial.dispose();
    chainHelper.baseMaterial.dispose();
    chainHelper.effectorMaterial.dispose();
    chainHelper.attachmentGeometry.dispose();
    chainHelper.attachmentMaterial.dispose();
};

const updateCrawlerDebugVisuals = (crawler: CrawlerState, debug: boolean, object: THREE.Object3D, scene: THREE.Scene) => {
    for (const leg of crawler.def.legs) {
        const legState = crawler.state.legs[leg.id];

        if (debug) {
            if (!legState.footPlacementHelper) {
                legState.footPlacementHelper = initFootPlacementHelper(scene);
            }

            updateFootPlacementHelper(
                legState.footPlacementHelper,
                legState.footPlacementRayOrigin,
                legState.footPlacementPosition,
                legState.effectorGoalPosition,
            );

            if (!legState.chainHelper) {
                legState.chainHelper = initChainHelper(legState.chain, object);
            }

            updateChainHelper(leg, legState.chain, legState.chainHelper);
        } else {
            if (legState.footPlacementHelper) {
                disposeFootPlacementHelper(legState.footPlacementHelper);
                legState.footPlacementHelper = undefined;
            }

            if (legState.chainHelper) {
                disposeChainHelper(legState.chainHelper);
                legState.chainHelper = undefined;
            }
        }
    }
};

/* crawler visuals */

const initLegVisuals = (crawlerDef: CrawlerDef, chain: Chain, object: THREE.Object3D): LegVisuals => {
    const boneMeshes: THREE.Mesh[] = [];
    const boneGeometry = new THREE.CylinderGeometry(0.1, 0.05, 1, 8);
    const boneMaterial = new THREE.MeshStandardMaterial({ color: crawlerDef.color });

    for (let i = 0; i < chain.bones.length; i++) {
        const bone = chain.bones[i];

        const mesh = new THREE.Mesh(boneGeometry, boneMaterial);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.set(...bone.start);
        mesh.lookAt(...bone.end);
        mesh.updateMatrixWorld();
        mesh.scale.set(1, bone.length, 1);
        object.add(mesh);
        boneMeshes.push(mesh);
    }

    return {
        boneMeshes,
        boneGeometry,
        boneMaterial,
    };
};

const updateLegVisuals = (_leg: LegDef, chain: Chain, legVisuals: LegVisuals) => {
    for (let i = 0; i < chain.bones.length; i++) {
        const bone = chain.bones[i];
        const boneMesh = legVisuals.boneMeshes[i];

        _start.set(...bone.start);
        _end.set(...bone.end);

        _midpoint.addVectors(_start, _end).multiplyScalar(0.5);
        _direction.subVectors(_end, _start).normalize();
        _quaternion.setFromUnitVectors(UP, _direction);

        boneMesh.position.copy(_midpoint);
        boneMesh.quaternion.copy(_quaternion);
    }
};

const disposeLegVisuals = (legVisuals: LegVisuals) => {
    for (const mesh of legVisuals.boneMeshes) {
        mesh.removeFromParent();
    }
    legVisuals.boneGeometry.dispose();
    legVisuals.boneMaterial.dispose();
};

const updateCrawlerVisuals = (crawler: CrawlerState, object: THREE.Object3D) => {
    for (const leg of crawler.def.legs) {
        const legState = crawler.state.legs[leg.id];

        if (!legState.legVisuals) {
            legState.legVisuals = initLegVisuals(crawler.def, legState.chain, object);
        }

        updateLegVisuals(leg, legState.chain, legState.legVisuals);
    }
};

const disposeCrawler = (crawler: CrawlerState) => {
    for (const leg of crawler.def.legs) {
        const legState = crawler.state.legs[leg.id];

        if (legState.legVisuals) {
            disposeLegVisuals(legState.legVisuals);
        }

        if (legState.footPlacementHelper) {
            disposeFootPlacementHelper(legState.footPlacementHelper);
        }

        if (legState.chainHelper) {
            disposeChainHelper(legState.chainHelper);
        }
    }
};

const createGooglyEye = (params: {
    position: [number, number, number];
    rotation: [number, number, number];
    eyeRadius: number;
    irisRadius: number;
}): GooglyEye => {
    const group = new THREE.Group();
    group.position.set(...params.position);
    group.rotation.set(...params.rotation);

    const eyeMesh = new THREE.Mesh(
        new THREE.SphereGeometry(params.eyeRadius, 16, 16),
        new THREE.MeshStandardMaterial({ color: 'white', roughness: 0.3 }),
    );
    eyeMesh.scale.set(1, 1, -0.05);
    group.add(eyeMesh);

    const irisMesh = new THREE.Mesh(
        new THREE.SphereGeometry(params.irisRadius, 12, 12),
        new THREE.MeshStandardMaterial({ color: 'black', roughness: 0.2 }),
    );
    irisMesh.scale.set(1, 1, 0.1);
    irisMesh.position.z = 0.01;
    group.add(irisMesh);

    const lensMesh = new THREE.Mesh(
        new THREE.SphereGeometry(params.eyeRadius, 16, 16, 0, Math.PI),
        new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.1, color: '#fff', roughness: 0.2, metalness: 0.5 }),
    );
    lensMesh.scale.set(1, 1, 0.4);
    group.add(lensMesh);

    return {
        object: group,
        eyeMesh,
        irisMesh,
        currentWorldPosition: new THREE.Vector3(),
        prevWorldPosition: undefined,
        velocity: new THREE.Vector3(),
        localPosition: new THREE.Vector3(),
        config: {
            eyeRadius: params.eyeRadius,
            irisRadius: params.irisRadius,
            gravity: 0.981,
            friction: 0.0001,
            bounciness: 0.65,
        },
    };
};

const updateGooglyEye = (eye: GooglyEye, delta: number) => {
    eye.eyeMesh.getWorldPosition(eye.currentWorldPosition);
    if (eye.prevWorldPosition === undefined) {
        eye.prevWorldPosition = eye.currentWorldPosition.clone();
    }

    _movementVelocity
        .copy(eye.currentWorldPosition)
        .sub(eye.prevWorldPosition)
        .multiplyScalar(200)
        .clampLength(0, 7)
        .multiplyScalar(delta);

    _addVelocity.x = _movementVelocity.x;
    _addVelocity.y = Math.abs(_movementVelocity.y) > Math.abs(_movementVelocity.z) ? _movementVelocity.y : -_movementVelocity.z;
    _addVelocity.z = _addVelocity.y;

    _addVelocity.y -= eye.config.gravity * delta;

    eye.velocity.add(_addVelocity);
    eye.velocity.multiplyScalar(1 - eye.config.friction * delta);

    eye.localPosition.add(eye.velocity);
    eye.localPosition.z = 0;

    const maxDistance = eye.config.eyeRadius - eye.config.irisRadius;
    const distance = eye.localPosition.length();

    if (distance > maxDistance) {
        const direction = _direction.copy(eye.localPosition).normalize();
        const angle = Math.atan2(direction.y, direction.x);

        const normal = _normal.copy(direction).normalize().multiplyScalar(-1);

        eye.velocity.reflect(normal).multiplyScalar(eye.config.bounciness);

        eye.localPosition.set(Math.cos(angle) * maxDistance, Math.sin(angle) * maxDistance, 0);
    }

    eye.irisMesh.position.copy(eye.localPosition);
    eye.irisMesh.position.z = 0.01;

    eye.prevWorldPosition.copy(eye.currentWorldPosition);
};

const createCrawler = (
    scene: THREE.Scene,
    physicsWorld: World,
    def: CrawlerDef,
    position: Vec3,
    isControlTarget: boolean,
): CrawlerEntity => {
    const group = new THREE.Group();
    scene.add(group);

    // body mesh
    const bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 32), new THREE.MeshStandardMaterial({ color: def.color }));
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    group.add(bodyMesh);

    // googly eyes
    const eye1 = createGooglyEye({ position: [-0.25, 0.4, 0.5], rotation: [-0.6, 0, 0], eyeRadius: 0.2, irisRadius: 0.075 });
    const eye2 = createGooglyEye({ position: [0.25, 0.4, 0.5], rotation: [-0.6, 0, 0], eyeRadius: 0.2, irisRadius: 0.075 });
    group.add(eye1.object);
    group.add(eye2.object);

    // physics body (lock rotations like original)
    const shape = sphere.create({ radius: 0.5, density: 100 });
    const body = rigidBody.create(physicsWorld, {
        shape,
        position,
        motionType: MotionType.DYNAMIC,
        objectLayer: OBJECT_LAYER_MOVING,
        allowedDegreesOfFreedom: DOF_TRANSLATION_ONLY, // lock rotations (only allow translation)
    });

    // crawler state
    const crawler = initCrawler(def);

    const entity: CrawlerEntity = {
        crawler,
        rigidBody: body,
        three: group,
        eyes: [eye1, eye2],
    };

    crawlers.push(entity);
    if (isControlTarget) {
        controlTargetCrawler = entity;
    }

    return entity;
};

/* environment */

const BALLS: Array<{
    position: [number, number, number];
    color: string;
    radius: number;
}> = [
    { position: [-5, 5, 12], color: 'skyblue', radius: 1.2 },
    { position: [0, 5, 15], color: 'purple', radius: 1 },
    { position: [5, 5, 5], color: 'pink', radius: 0.8 },
    { position: [-5, 5, 4], color: 'aqua', radius: 0.6 },
    { position: [2, 5, 10], color: 'peachpuff', radius: 1.5 },
];

const createEnvironment = (scene: THREE.Scene, physicsWorld: World) => {
    // heightfield (converted to triangle mesh)
    const heightFieldDepth = 50;
    const heightFieldWidth = 50;
    const heightFieldArray = Array.from({
        length: heightFieldDepth * heightFieldWidth,
    }).map(() => Math.random());
    const heightFieldData = new Float32Array(heightFieldArray);

    const heightFieldGeometry = new THREE.PlaneGeometry(
        heightFieldWidth,
        heightFieldDepth,
        heightFieldWidth - 1,
        heightFieldDepth - 1,
    );

    // apply height variation to Z coordinate (before rotation)
    heightFieldData.forEach((v, index) => {
        heightFieldGeometry.attributes.position.array[index * 3 + 2] = v;
    });

    // apply transformations to geometry
    heightFieldGeometry.scale(1, -1, 1);
    heightFieldGeometry.rotateX(-Math.PI / 2);
    heightFieldGeometry.rotateY(-Math.PI / 2);
    heightFieldGeometry.computeVertexNormals();

    // now extract the transformed positions for physics
    const posAttr = heightFieldGeometry.attributes.position;
    const positions: number[] = [];

    for (let i = 0; i < posAttr.count; i++) {
        positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    }

    // get indices and reverse winding order (swap second and third vertex of each triangle)
    const originalIndices = heightFieldGeometry.index ? Array.from(heightFieldGeometry.index.array) : [];
    const indices: number[] = [];
    for (let i = 0; i < originalIndices.length; i += 3) {
        indices.push(
            originalIndices[i], // first vertex stays
            originalIndices[i + 2], // third vertex becomes second
            originalIndices[i + 1], // second vertex becomes third
        );
    }

    // create visual mesh
    const heightFieldMesh = new THREE.Mesh(
        heightFieldGeometry,
        new THREE.MeshStandardMaterial({ color: '#444', side: THREE.DoubleSide }),
    );
    heightFieldMesh.receiveShadow = true;
    scene.add(heightFieldMesh);

    // create physics triangle mesh with the transformed geometry
    const heightFieldShape = triangleMesh.create({
        positions,
        indices,
    });

    rigidBody.create(physicsWorld, {
        shape: heightFieldShape,
        position: [0, 0, 0],
        motionType: MotionType.STATIC,
        objectLayer: OBJECT_LAYER_NOT_MOVING,
    });

    // flat platform
    const platformMesh = new THREE.Mesh(new THREE.BoxGeometry(20, 1, 20), new THREE.MeshStandardMaterial({ color: '#777' }));
    platformMesh.position.set(-15, 1, 0);
    platformMesh.castShadow = true;
    platformMesh.receiveShadow = true;
    scene.add(platformMesh);

    const platformShape = box.create({ halfExtents: [10, 0.5, 10] });
    rigidBody.create(physicsWorld, {
        shape: platformShape,
        position: [-15, 1, 0],
        motionType: MotionType.STATIC,
        objectLayer: OBJECT_LAYER_NOT_MOVING,
    });

    // stairs
    for (let i = 0; i < 10; i++) {
        const stairMesh = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 5), new THREE.MeshStandardMaterial({ color: '#777' }));
        stairMesh.position.set(i * 1.5 - 9, -0.5 + i * 0.2, 2);
        stairMesh.castShadow = true;
        stairMesh.receiveShadow = true;
        scene.add(stairMesh);

        const stairShape = box.create({ halfExtents: [1.5, 1.5, 2.5] });
        rigidBody.create(physicsWorld, {
            shape: stairShape,
            position: [i * 1.5 - 9, -0.5 + i * 0.2, 2],
            motionType: MotionType.STATIC,
            objectLayer: OBJECT_LAYER_NOT_MOVING,
        });
    }

    // obstacle boxes (left side)
    for (let i = 0; i < 4; i++) {
        const obstacleMesh = new THREE.Mesh(
            new THREE.BoxGeometry(3, 2 + i * 0.5, 5),
            new THREE.MeshStandardMaterial({ color: '#ccc' }),
        );
        obstacleMesh.position.set(i * -2 - 15, 1 + i * 0.5, -5);
        obstacleMesh.castShadow = true;
        obstacleMesh.receiveShadow = true;
        scene.add(obstacleMesh);

        const obstacleShape = box.create({ halfExtents: [1.5, 1 + i * 0.25, 2.5] });
        rigidBody.create(physicsWorld, {
            shape: obstacleShape,
            position: [i * -2 - 15, 1 + i * 0.5, -5],
            motionType: MotionType.STATIC,
            objectLayer: OBJECT_LAYER_NOT_MOVING,
        });
    }

    // platform above
    const platformAboveMesh = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 5), new THREE.MeshStandardMaterial({ color: '#ccc' }));
    platformAboveMesh.position.set(-21, 3.5, 0);
    platformAboveMesh.castShadow = true;
    platformAboveMesh.receiveShadow = true;
    scene.add(platformAboveMesh);

    const platformAboveShape = box.create({ halfExtents: [1.5, 0.5, 2.5] });
    rigidBody.create(physicsWorld, {
        shape: platformAboveShape,
        position: [-21, 3.5, 0],
        motionType: MotionType.STATIC,
        objectLayer: OBJECT_LAYER_NOT_MOVING,
    });

    // obstacle boxes (right side)
    for (let i = 0; i < 4; i++) {
        const obstacleMesh = new THREE.Mesh(
            new THREE.BoxGeometry(3, 2 + i * 0.5, 5),
            new THREE.MeshStandardMaterial({ color: '#ccc' }),
        );
        obstacleMesh.position.set(i * -2 - 15, 1 + i * 0.5, 5);
        obstacleMesh.castShadow = true;
        obstacleMesh.receiveShadow = true;
        scene.add(obstacleMesh);

        const obstacleShape = box.create({ halfExtents: [1.5, 1 + i * 0.25, 2.5] });
        rigidBody.create(physicsWorld, {
            shape: obstacleShape,
            position: [i * -2 - 15, 1 + i * 0.5, 5],
            motionType: MotionType.STATIC,
            objectLayer: OBJECT_LAYER_NOT_MOVING,
        });
    }

    // pillars
    const pillarConfigs: Array<{ position: [number, number, number]; rotation: [number, number, number]; color: string }> = [
        { position: [9, -2, 0], rotation: [0.2, 0, 0.1], color: 'purple' },
        { position: [14, 0, -3], rotation: [0.2, 0, -0.1], color: 'skyblue' },
        { position: [15, -1, 5], rotation: [-0.2, 0, 0.2], color: '#f5dd90' },
        { position: [21, -1, 0], rotation: [0.4, 0, 0.2], color: 'hotpink' },
    ];

    for (const config of pillarConfigs) {
        const pillarMesh = new THREE.Mesh(
            new THREE.BoxGeometry(5, 10, 5),
            new THREE.MeshStandardMaterial({ color: config.color }),
        );
        pillarMesh.position.set(...config.position);
        pillarMesh.rotation.set(...config.rotation);
        pillarMesh.castShadow = true;
        pillarMesh.receiveShadow = true;
        scene.add(pillarMesh);

        const pillarShape = box.create({ halfExtents: [2.5, 5, 2.5] });
        const pillarQuat = quat.create();
        const pillarEuler = euler.fromValues(config.rotation[0], config.rotation[1], config.rotation[2], 'xyz');
        quat.fromEuler(pillarQuat, pillarEuler);

        rigidBody.create(physicsWorld, {
            shape: pillarShape,
            position: config.position,
            quaternion: pillarQuat,
            motionType: MotionType.STATIC,
            objectLayer: OBJECT_LAYER_NOT_MOVING,
        });
    }

    // spinning boxes
    const spinningBoxConfigs: Array<{ position: [number, number, number] }> = [
        { position: [15, 3, 12] },
        { position: [15, 3, 20] },
    ];

    for (let i = 0; i < spinningBoxConfigs.length; i++) {
        const config = spinningBoxConfigs[i];
        const size = i === 0 ? [6, 3, 3] : [6, 5, 5];

        const spinningBoxMesh = new THREE.Mesh(
            new THREE.BoxGeometry(size[0], size[1], size[2]),
            new THREE.MeshStandardMaterial({ color: i === 0 ? 'pink' : 'skyblue' }),
        );
        spinningBoxMesh.position.set(...config.position);
        spinningBoxMesh.rotation.y = Math.PI / 2;
        spinningBoxMesh.castShadow = true;
        spinningBoxMesh.receiveShadow = true;
        scene.add(spinningBoxMesh);

        const spinningBoxShape = box.create({ halfExtents: [size[0] / 2, size[1] / 2, size[2] / 2] });
        const spinningQuat = quat.create();
        const spinningEuler = euler.fromValues(0, Math.PI / 2, 0, 'xyz');
        quat.fromEuler(spinningQuat, spinningEuler);

        const spinningBody = rigidBody.create(physicsWorld, {
            shape: spinningBoxShape,
            position: config.position,
            quaternion: spinningQuat,
            motionType: MotionType.KINEMATIC,
            objectLayer: OBJECT_LAYER_MOVING,
        });

        // set angular velocity for spinning (like original angularVelocity={[0, 0, 1]})
        vec3.set(spinningBody.motionProperties.angularVelocity, 0, 0, 1);

        // store for physics sync
        physicsObjects.push({ body: spinningBody, object3d: spinningBoxMesh });
    }

    // balls
    for (const ball of BALLS) {
        const ballMesh = new THREE.Mesh(
            new THREE.SphereGeometry(ball.radius, 32, 32),
            new THREE.MeshStandardMaterial({ color: ball.color }),
        );
        ballMesh.position.set(...ball.position);
        ballMesh.castShadow = true;
        ballMesh.receiveShadow = true;
        scene.add(ballMesh);

        const ballShape = sphere.create({ radius: ball.radius });
        const ballBody = rigidBody.create(physicsWorld, {
            shape: ballShape,
            position: ball.position,
            motionType: MotionType.DYNAMIC,
            objectLayer: OBJECT_LAYER_MOVING,
        });

        // store for physics sync
        physicsObjects.push({ body: ballBody, object3d: ballMesh });
    }
};

/* ===== Setup ===== */

const init = () => {
    // scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    // camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 15);

    // renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // orbit controls
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.target.set(0, 0, 0);

    // lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(-30, 20, 30);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 100;
    directionalLight.shadow.camera.left = -30;
    directionalLight.shadow.camera.right = 30;
    directionalLight.shadow.camera.top = 15;
    directionalLight.shadow.camera.bottom = -20;
    directionalLight.shadow.bias = -0.001;
    directionalLight.shadow.normalBias = 0.02;
    scene.add(directionalLight);

    // environment
    createEnvironment(scene, physicsWorld);

    // debug renderer
    const debugOptions = debugRenderer.createDefaultOptions();
    debugRendererState = debugRenderer.init(debugOptions);
    debugRendererState.options.bodies.enabled = false;
    debugRendererState.options.bodies.wireframe = true;
    scene.add(debugRendererState.object3d);

    // controls setup
    window.addEventListener('keydown', (e) => {
        switch (e.key.toLowerCase()) {
            case 'w':
                controls.forward = true;
                break;
            case 's':
                controls.backward = true;
                break;
            case 'a':
                controls.left = true;
                break;
            case 'd':
                controls.right = true;
                break;
            case ' ':
                controls.jump = true;
                break;
            case 'c':
                controls.crouch = true;
                break;
            case 'shift':
                controls.sprint = true;
                break;
        }
    });

    window.addEventListener('keyup', (e) => {
        switch (e.key.toLowerCase()) {
            case 'w':
                controls.forward = false;
                break;
            case 's':
                controls.backward = false;
                break;
            case 'a':
                controls.left = false;
                break;
            case 'd':
                controls.right = false;
                break;
            case ' ':
                controls.jump = false;
                break;
            case 'c':
                controls.crouch = false;
                break;
            case 'shift':
                controls.sprint = false;
                break;
        }
    });

    // ui
    setupUI();

    // create initial crawler
    const initialDef = createCrawlerDef(settings);
    createCrawler(scene, physicsWorld, initialDef, [0, 10, 2], true);
};

/* ui */

const settings = {
    debug: false,
    color: '#ffa500',
    speed: 2,
    sprintMultiplier: 1.8,
    height: 2,
    jumpImpulse: 7,
    stepArcHeight: 0.1,
    footPlacementStepDistanceThreshold: 0.1,
    footPlacementEmergencyStepDistanceThreshold: 1,
    nLegs: 4,
    legLength: 1.5,
    legSegments: 5,
    attachRadius: 0.5,
    footRadius: 1,
    stepSpeed: 3,
    stepCycleSpeed: 2,
};

const createCrawlerDef = (s: typeof settings): CrawlerDef => {
    const legs: LegDef[] = [];

    for (let i = 0; i < s.nLegs; i++) {
        const angle = (i / s.nLegs) * Math.PI * 2 + Math.PI / 4;
        const x = Math.cos(angle);
        const z = Math.sin(angle);

        legs.push({
            id: `leg-${i}`,
            attachmentOffset: [x * s.attachRadius, -0.2, z * s.attachRadius],
            footPlacementOffset: [x * s.footRadius, 0, z * s.footRadius],
            segments: s.legSegments,
            legLength: s.legLength,
            phaseOffset: i > s.nLegs / 2 ? i / s.nLegs - 1 : i / s.nLegs,
        });
    }

    return {
        color: s.color,
        legs,
        speed: s.speed,
        sprintMultiplier: s.sprintMultiplier,
        height: s.height,
        jumpImpulse: s.jumpImpulse,
        stepArcHeight: s.stepArcHeight,
        footPlacementStepDistanceThreshold: s.footPlacementStepDistanceThreshold,
        footPlacementEmergencyStepDistanceThreshold: s.footPlacementEmergencyStepDistanceThreshold,
        stepSpeed: s.stepSpeed,
        stepCycleSpeed: s.stepCycleSpeed,
    };
};

const updateCrawlerColor = (entity: CrawlerEntity, color: string) => {
    entity.three.traverse((child) => {
        if (child instanceof THREE.Mesh && child.geometry instanceof THREE.SphereGeometry) {
            (child.material as THREE.MeshStandardMaterial).color.set(color);
        }
    });
    entity.crawler.def.color = color;
    for (const legId in entity.crawler.state.legs) {
        const legState = entity.crawler.state.legs[legId];
        if (legState.legVisuals) {
            legState.legVisuals.boneMaterial.color.set(color);
        }
    }
};

const recreateCrawlers = () => {
    const isControlTarget = controlTargetCrawler !== null;
    const position: Vec3 = controlTargetCrawler ? vec3.clone(controlTargetCrawler.rigidBody.position) : [0, 10, 2];

    for (const crawler of crawlers) {
        disposeCrawler(crawler.crawler);
        crawler.three.removeFromParent();
        rigidBody.remove(physicsWorld, crawler.rigidBody);
    }
    crawlers.length = 0;
    controlTargetCrawler = null;

    const newDef = createCrawlerDef(settings);
    createCrawler(scene, physicsWorld, newDef, position, isControlTarget);
};

const setupUI = () => {
    const gui = new GUI();

    gui.add(settings, 'debug')
        .name('Debug Mode')
        .onChange((value: boolean) => {
            debugRendererState.options.bodies.enabled = value;
        });

    gui.addColor(settings, 'color')
        .name('Crawler Color')
        .onChange((value: string) => {
            for (const crawler of crawlers) {
                updateCrawlerColor(crawler, value);
            }
        });

    gui.add(settings, 'nLegs', 2, 8, 1).name('Number of Legs').onChange(recreateCrawlers);
    gui.add(settings, 'legLength', 0.5, 3, 0.01).name('Leg Length').onChange(recreateCrawlers);
    gui.add(settings, 'legSegments', 2, 10, 1).name('Leg Segments').onChange(recreateCrawlers);
    gui.add(settings, 'attachRadius', 0.1, 1, 0.01).name('Attach Radius').onChange(recreateCrawlers);
    gui.add(settings, 'footRadius', 0.5, 2, 0.01).name('Foot Placement Radius').onChange(recreateCrawlers);

    gui.add(settings, 'speed', 0, 10, 0.1)
        .name('Crawler Speed')
        .onChange((value: number) => {
            for (const crawler of crawlers) crawler.crawler.def.speed = value;
        });
    gui.add(settings, 'sprintMultiplier', 1, 3, 0.01)
        .name('Sprint Multiplier')
        .onChange((value: number) => {
            for (const crawler of crawlers) crawler.crawler.def.sprintMultiplier = value;
        });
    gui.add(settings, 'height', 1, 4, 0.01)
        .name('Crawler Height')
        .onChange((value: number) => {
            for (const crawler of crawlers) crawler.crawler.def.height = value;
        });
    gui.add(settings, 'jumpImpulse', 0, 20, 1)
        .name('Jump Impulse')
        .onChange((value: number) => {
            for (const crawler of crawlers) crawler.crawler.def.jumpImpulse = value;
        });
    gui.add(settings, 'stepArcHeight', 0, 1, 0.01)
        .name('Step Arc Height')
        .onChange((value: number) => {
            for (const crawler of crawlers) crawler.crawler.def.stepArcHeight = value;
        });
    gui.add(settings, 'footPlacementStepDistanceThreshold', 0.01, 1, 0.01)
        .name('Step Distance Threshold')
        .onChange((value: number) => {
            for (const crawler of crawlers) crawler.crawler.def.footPlacementStepDistanceThreshold = value;
        });
    gui.add(settings, 'footPlacementEmergencyStepDistanceThreshold', 0.1, 2, 0.01)
        .name('Emergency Step Distance')
        .onChange((value: number) => {
            for (const crawler of crawlers) crawler.crawler.def.footPlacementEmergencyStepDistanceThreshold = value;
        });
    gui.add(settings, 'stepSpeed', 1, 10, 0.01)
        .name('Step Speed')
        .onChange((value: number) => {
            for (const crawler of crawlers) crawler.crawler.def.stepSpeed = value;
        });
    gui.add(settings, 'stepCycleSpeed', 0.001, 5, 0.01)
        .name('Step Cycle Speed')
        .onChange((value: number) => {
            for (const crawler of crawlers) crawler.crawler.def.stepCycleSpeed = value;
        });
};

/* loop */

let lastTime = performance.now();

const loop = () => {
    requestAnimationFrame(loop);

    const currentTime = performance.now();
    const frameDt = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    const dt = Math.min(frameDt, 0.1);

    // input handling
    if (controlTargetCrawler) {
        const input = controlTargetCrawler.crawler.input;
        const cmd = controlTargetCrawler.crawler.cmd;

        input.direction.set(0, 0);
        if (controls.forward) input.direction.y = -1;
        if (controls.backward) input.direction.y = 1;
        if (controls.left) input.direction.x = -1;
        if (controls.right) input.direction.x = 1;
        input.crouch = controls.crouch;
        input.sprint = controls.sprint;
        if (controls.jump) cmd.push('jump');
    }

    // before physics step
    for (const entity of crawlers) {
        updateCrawlerMovement(entity.crawler, entity.rigidBody, dt);
        updateCrawlerTimer(entity.crawler, dt);
        updateCrawlerSuspension(entity.crawler, entity.rigidBody, physicsWorld, dt);
    }

    // physics step
    updateWorld(physicsWorld, undefined, dt);

    // sync physics to visuals
    for (const entity of crawlers) {
        entity.three.position.set(entity.rigidBody.position[0], entity.rigidBody.position[1], entity.rigidBody.position[2]);
        entity.three.quaternion.set(
            entity.rigidBody.quaternion[0],
            entity.rigidBody.quaternion[1],
            entity.rigidBody.quaternion[2],
            entity.rigidBody.quaternion[3],
        );
    }

    // sync dynamic physics objects
    for (const physicsObj of physicsObjects) {
        physicsObj.object3d.position.set(physicsObj.body.position[0], physicsObj.body.position[1], physicsObj.body.position[2]);
        physicsObj.object3d.quaternion.set(
            physicsObj.body.quaternion[0],
            physicsObj.body.quaternion[1],
            physicsObj.body.quaternion[2],
            physicsObj.body.quaternion[3],
        );
    }

    // after physics step
    for (const entity of crawlers) {
        updateCrawlerPosition(entity.crawler, entity.rigidBody);
        updateCrawlerFootPlacement(entity.crawler, entity.three, entity.rigidBody, physicsWorld);
        updateCrawlerStepping(entity.crawler, entity.rigidBody, dt);
        updateCrawlerIK(entity.crawler, entity.three);
        updateCrawlerDebugVisuals(entity.crawler, settings.debug, entity.three, scene);
        updateCrawlerVisuals(entity.crawler, entity.three);

        // update googly eyes
        for (const eye of entity.eyes) {
            updateGooglyEye(eye, dt);
        }
    }

    // camera rig
    if (!settings.debug && controlTargetCrawler) {
        cameraTarget.lerp(controlTargetCrawler.crawler.state.position, dt * 5);
        camera.position.copy(cameraTarget).add(_cameraOffset.set(0, 5, 15));
        camera.quaternion.setFromUnitVectors(_axis.set(0, 0, -1), _direction.copy(cameraTarget).sub(camera.position).normalize());
        orbitControls.enabled = false;
    } else {
        orbitControls.enabled = true;
        orbitControls.update();
    }

    // update debug renderer
    debugRenderer.update(debugRendererState, physicsWorld);

    // render
    renderer.render(scene, camera);
};

/* start */

init();
loop();
