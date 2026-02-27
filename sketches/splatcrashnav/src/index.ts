import { SplatMesh } from '@sparkjsdev/spark';
import {
    CastRayStatus,
    MotionType,
    type RigidBody,
    addBroadphaseLayer,
    addObjectLayer,
    capsule,
    castRay,
    createClosestCastRayCollector,
    createDefaultCastRaySettings,
    createWorld,
    createWorldSettings,
    dof,
    enableCollision,
    filter,
    registerAll,
    rigidBody,
    sphere,
    transformed,
    triangleMesh,
    updateWorld,
} from 'crashcat';
import { debugRenderer } from 'crashcat/three';
import GUI from 'lil-gui';
import { type Quat, type Vec3, quat, vec3 } from 'mathcat';
import { DEFAULT_QUERY_FILTER, type NavMesh, type StraightPathPoint, findPath, findRandomPoint } from 'navcat';
import { type TiledNavMeshResult, generateTiledNavMesh } from 'navcat/blocks';
import { type DebugObject, createNavMeshHelper } from 'navcat/three';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/* crashcat world */

registerAll();

const worldSettings = createWorldSettings();
worldSettings.gravity = vec3.fromValues(0, -20, 0);

const BROADPHASE_LAYER_NON_MOVING = addBroadphaseLayer(worldSettings);
const BROADPHASE_LAYER_MOVING = addBroadphaseLayer(worldSettings);

const LAYER_NON_MOVING = addObjectLayer(worldSettings, BROADPHASE_LAYER_NON_MOVING);
const LAYER_MOVING = addObjectLayer(worldSettings, BROADPHASE_LAYER_MOVING);

enableCollision(worldSettings, LAYER_NON_MOVING, LAYER_MOVING);
enableCollision(worldSettings, LAYER_MOVING, LAYER_MOVING);

const world = createWorld(worldSettings);

const nonMovingFilter = filter.create(world.settings.layers);
filter.disableAllLayers(nonMovingFilter, world.settings.layers);
filter.enableObjectLayer(nonMovingFilter, world.settings.layers, LAYER_NON_MOVING);

const cameraCollisionCastRayCollector = createClosestCastRayCollector();
const cameraCollisionCastRaySettings = createDefaultCastRaySettings();

const playerGroundCastRayCollector = createClosestCastRayCollector();
const playerGroundCastRaySettings = createDefaultCastRaySettings();
const playerGroundFilter = filter.create(world.settings.layers);
filter.disableAllLayers(playerGroundFilter, world.settings.layers);
filter.enableObjectLayer(playerGroundFilter, world.settings.layers, LAYER_NON_MOVING);

const cameraDeltaPos = vec3.create();
const movementDirection = new THREE.Vector3();
const playerRotationQuat = new THREE.Quaternion();

/* scene scale */

const SCENE_SCALE = 3;

/* load assets */

const gltfLoader = new GLTFLoader();

const [colliderGltf, characterGltf] = await Promise.all([
    gltfLoader.loadAsync('./Sunlit Greenhouse Workshop Haven_collider.glb'),
    gltfLoader.loadAsync('./the_green_wizard_gnome_n64_style.glb'),
]);

const idleAnimation = characterGltf.animations.find((a) => a.name.toLowerCase().includes('idle')) ?? null;
const walkAnimation =
    characterGltf.animations.find((a) => a.name.toLowerCase().includes('walk') || a.name.toLowerCase().includes('run')) ?? null;
const fallAnimation = characterGltf.animations.find((a) => a.name.toLowerCase().includes('fall')) ?? null;
const hitAnimation =
    characterGltf.animations.find((a) => a.name.toLowerCase().includes('hit') || a.name.toLowerCase().includes('attack')) ?? null;

// extract world-space positions + indices from the collider gltf
const colliderMeshes: THREE.Mesh[] = [];
colliderGltf.scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) colliderMeshes.push(obj);
});
colliderGltf.scene.updateMatrixWorld(true);

const colliderPositions: number[] = [];
const colliderIndices: number[] = [];
const _point = new THREE.Vector3();
let _vOffset = 0;

for (const mesh of colliderMeshes) {
    const posAttr = mesh.geometry.getAttribute('position');
    const indexAttr = mesh.geometry.getIndex();
    for (let i = 0; i < posAttr.count; i++) {
        _point.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).applyMatrix4(mesh.matrixWorld).multiplyScalar(SCENE_SCALE);
        colliderPositions.push(_point.x, _point.y, _point.z);
    }
    if (indexAttr) {
        for (let i = 0; i < indexAttr.count; i++) colliderIndices.push(indexAttr.getX(i) + _vOffset);
    } else {
        for (let i = 0; i < posAttr.count; i++) colliderIndices.push(i + _vOffset);
    }
    _vOffset += posAttr.count;
}

/* navmesh constants */

const NAVMESH_CELL_SIZE = 0.2;
const NAVMESH_CELL_HEIGHT = 0.2;
const NAVMESH_TILE_VOXELS = 32;
const NAVMESH_TILE_WORLD = NAVMESH_TILE_VOXELS * NAVMESH_CELL_SIZE;
const NAVMESH_WALKABLE_RADIUS_WORLD = 0.3;
const NAVMESH_WALKABLE_CLIMB_WORLD = 0.5;
const NAVMESH_WALKABLE_HEIGHT_WORLD = 1.8;
const NAVMESH_WALKABLE_SLOPE_DEG = 45;
const NAVMESH_BORDER_SIZE = 4;
const NAVMESH_MIN_REGION_AREA = 8;
const NAVMESH_MERGE_REGION_AREA = 20;
const NAVMESH_MAX_SIMPLIFICATION_ERROR = 1.3;
const NAVMESH_MAX_EDGE_LENGTH = 12;
const NAVMESH_MAX_VERTS_PER_POLY = 6;
const NAVMESH_DETAIL_SAMPLE_DIST = NAVMESH_CELL_SIZE * 6;
const NAVMESH_DETAIL_SAMPLE_MAX_ERROR = NAVMESH_CELL_HEIGHT * 1;

/* player constants */

const PLAYER_SPEED = 6;
const PLAYER_JUMP_SPEED = 15;
const PLAYER_CAPSULE_HALF_H = 0.2;
const PLAYER_CAPSULE_R = 0.4;
const PLAYER_MESH_SCALE = 1.0;
const PLAYER_MESH_Y_OFFSET = 0;
const PLAYER_SPAWN: Vec3 = [0, 2, 0];
const PLAYER_THROW_RADIUS = 3.0;
const PLAYER_THROW_FORCE = 30;
const PLAYER_THROW_COOLDOWN_MS = 500;
const PLAYER_THROW_DURATION_MS = 400;

/* camera constants */

const CAMERA_IDEAL_DISTANCE_DEFAULT = 5;
const CAMERA_TARGET_Y_OFFSET = 0.5;

/* sphere constants */

const SPHERE_COUNT = 10;
const SPHERE_MAX = 1000;
const SPHERE_RADIUS = 0.4;
const SPHERE_SPEED = 20;

/* agent constants */

const AGENT_COUNT = 3;
const AGENT_SPEED = 3.5;
const AGENT_CAPSULE_HALF_H = 0.2;
const AGENT_CAPSULE_R = 0.4;
const AGENT_MESH_SCALE = 0.7;
const AGENT_MESH_Y_OFFSET = 0;
const AGENT_PATH_INTERVAL_MS = 100;
const AGENT_WAYPOINT_REACH_DIST = 0.5;
const AGENT_STOP_DIST = 3.0;
const AGENT_PATH_HALF_EXTENTS: Vec3 = [5, 5, 5];
const AGENT_ROTATION_SPEED = 10;

type PointerLockState = {
    yaw: number;
    pitch: number;
    distance: number;
    idealDistance: number;
    isLocked: boolean;
};

function initControls(domElement: HTMLElement): PointerLockState {
    const state: PointerLockState = {
        yaw: 0,
        pitch: 0.5,
        distance: CAMERA_IDEAL_DISTANCE_DEFAULT,
        idealDistance: CAMERA_IDEAL_DISTANCE_DEFAULT,
        isLocked: false,
    };

    domElement.addEventListener('click', () => {
        if (!state.isLocked) {
            domElement.requestPointerLock();
        }
    });

    document.addEventListener('pointerlockchange', () => {
        state.isLocked = document.pointerLockElement === domElement;
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
        if (!state.isLocked) return;
        state.yaw -= e.movementX * 0.002;
        state.pitch += e.movementY * 0.002;
        state.pitch = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, state.pitch));
    });

    domElement.addEventListener(
        'wheel',
        (e: WheelEvent) => {
            e.preventDefault();
            state.distance += e.deltaY * 0.01;
            state.distance = Math.max(1, Math.min(50, state.distance));
        },
        { passive: false },
    );

    return state;
}

function updateControls(camera: THREE.PerspectiveCamera, controls: PointerLockState, playerPos: Vec3): void {
    const x = controls.distance * Math.cos(controls.pitch) * Math.sin(controls.yaw);
    const y = controls.distance * Math.sin(controls.pitch);
    const z = controls.distance * Math.cos(controls.pitch) * Math.cos(controls.yaw);
    camera.position.set(playerPos[0] + x, playerPos[1] + CAMERA_TARGET_Y_OFFSET + y, playerPos[2] + z);
    camera.lookAt(playerPos[0], playerPos[1] + CAMERA_TARGET_Y_OFFSET, playerPos[2]);
}

type RenderState = {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: PointerLockState;
};

type SplatState = {
    splat: SplatMesh;
};

type PhysicsState = {
    world: ReturnType<typeof createWorld>;
};

type NavMeshState = {
    result: TiledNavMeshResult;
    helper: DebugObject;
};

type DebugRendererState = ReturnType<typeof debugRenderer.init>;

type InputState = {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    jump: boolean;
    throw: boolean;
    _jumpWasPressed: boolean;
    _throwWasPressed: boolean;
    _lastThrowMs: number;
};

type PlayerState = {
    body: RigidBody;
    group: THREE.Group;
    mixer: THREE.AnimationMixer;
    idleAction: THREE.AnimationAction | null;
    walkAction: THREE.AnimationAction | null;
    fallAction: THREE.AnimationAction | null;
    hitAction: THREE.AnimationAction | null;
    input: InputState;
    desiredVelocity: Vec3;
    throwTime: number;
};

type AgentState = {
    body: RigidBody;
    group: THREE.Group;
    mixer: THREE.AnimationMixer;
    idleAction: THREE.AnimationAction | null;
    walkAction: THREE.AnimationAction | null;
    path: StraightPathPoint[];
    pathIndex: number;
    lastPathMs: number;
};

type AgentsState = {
    agents: AgentState[];
};

type SphereState = {
    body: RigidBody;
    color: THREE.Color;
};

type SpheresState = {
    spheres: SphereState[];
    mesh: THREE.InstancedMesh;
};

type World = {
    render: RenderState;
    splat: SplatState;
    physics: PhysicsState;
    navmesh: NavMeshState;
    physicsDebug: DebugRendererState;
    player: PlayerState;
    agents: AgentsState;
    spheres: SpheresState;
};

function initRender(): RenderState {
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.appendChild(renderer.domElement);

    const controls = initControls(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    return { scene, camera, renderer, controls };
}

function initSplat(scene: THREE.Scene): SplatState {
    const splat = new SplatMesh({ url: './Sunlit Greenhouse Workshop Haven.spz' });
    splat.scale.setScalar(SCENE_SCALE);
    scene.add(splat);
    return { splat };
}

function initPhysics(): PhysicsState {
    const shape = triangleMesh.create({ positions: colliderPositions, indices: colliderIndices });
    rigidBody.create(world, {
        shape,
        motionType: MotionType.STATIC,
        objectLayer: LAYER_NON_MOVING,
        position: [0, 0, 0],
    });

    return { world };
}

function initNavMesh(scene: THREE.Scene): NavMeshState {
    const result = generateTiledNavMesh(
        { positions: colliderPositions, indices: colliderIndices },
        {
            cellSize: NAVMESH_CELL_SIZE,
            cellHeight: NAVMESH_CELL_HEIGHT,
            tileSizeVoxels: NAVMESH_TILE_VOXELS,
            tileSizeWorld: NAVMESH_TILE_WORLD,
            walkableRadiusWorld: NAVMESH_WALKABLE_RADIUS_WORLD,
            walkableRadiusVoxels: Math.ceil(NAVMESH_WALKABLE_RADIUS_WORLD / NAVMESH_CELL_SIZE),
            walkableClimbWorld: NAVMESH_WALKABLE_CLIMB_WORLD,
            walkableClimbVoxels: Math.ceil(NAVMESH_WALKABLE_CLIMB_WORLD / NAVMESH_CELL_HEIGHT),
            walkableHeightWorld: NAVMESH_WALKABLE_HEIGHT_WORLD,
            walkableHeightVoxels: Math.ceil(NAVMESH_WALKABLE_HEIGHT_WORLD / NAVMESH_CELL_HEIGHT),
            walkableSlopeAngleDegrees: NAVMESH_WALKABLE_SLOPE_DEG,
            borderSize: NAVMESH_BORDER_SIZE,
            minRegionArea: NAVMESH_MIN_REGION_AREA,
            mergeRegionArea: NAVMESH_MERGE_REGION_AREA,
            maxSimplificationError: NAVMESH_MAX_SIMPLIFICATION_ERROR,
            maxEdgeLength: NAVMESH_MAX_EDGE_LENGTH,
            maxVerticesPerPoly: NAVMESH_MAX_VERTS_PER_POLY,
            detailSampleDistance: NAVMESH_DETAIL_SAMPLE_DIST,
            detailSampleMaxError: NAVMESH_DETAIL_SAMPLE_MAX_ERROR,
        },
    );

    const helper = createNavMeshHelper(result.navMesh);
    helper.object.visible = false;

    helper.object.position.y += 0.05;

    helper.object.traverse((o) => {
        if (o instanceof THREE.Mesh) {
            const materials = Array.isArray(o.material) ? o.material : [o.material];

            for (const m of materials) {
                m.transparent = true;
                m.opacity = 0.5;
                m.depthTest = true;
                m.depthWrite = false;
                m.color.set(0x00ff00);
            }
        }
    });

    scene.add(helper.object);

    return { result, helper };
}

function initPlayer(render: RenderState, physics: PhysicsState): PlayerState {
    const { scene, controls, renderer } = render;
    const { world } = physics;

    const shape = transformed.create({
        shape: capsule.create({
            halfHeightOfCylinder: PLAYER_CAPSULE_HALF_H,
            radius: PLAYER_CAPSULE_R,
        }),
        position: [0, PLAYER_CAPSULE_HALF_H + PLAYER_CAPSULE_R, 0],
        quaternion: quat.create(),
    });

    const body = rigidBody.create(world, {
        shape,
        motionType: MotionType.DYNAMIC,
        objectLayer: LAYER_MOVING,
        position: PLAYER_SPAWN,
        quaternion: quat.create(),
        allowedDegreesOfFreedom: dof(true, true, true, false, false, false),
        linearDamping: 0.5,
        angularDamping: 0.9,
    });

    const group = SkeletonUtils.clone(characterGltf.scene) as THREE.Group;
    group.scale.setScalar(PLAYER_MESH_SCALE);
    scene.add(group);

    const input: InputState = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        jump: false,
        throw: false,
        _jumpWasPressed: false,
        _throwWasPressed: false,
        _lastThrowMs: 0,
    };

    window.addEventListener('keydown', (e) => {
        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                input.forward = true;
                break;
            case 'KeyS':
            case 'ArrowDown':
                input.backward = true;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                input.left = true;
                break;
            case 'KeyD':
            case 'ArrowRight':
                input.right = true;
                break;
            case 'Space':
                if (!input._jumpWasPressed) {
                    input.jump = true;
                    input._jumpWasPressed = true;
                }
                break;
        }
    });
    window.addEventListener('keyup', (e) => {
        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                input.forward = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                input.backward = false;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                input.left = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                input.right = false;
                break;
            case 'Space':
                input._jumpWasPressed = false;
                break;
        }
    });

    // throw on primary click when pointer is locked
    renderer.domElement.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button === 0 && controls.isLocked) {
            if (!input._throwWasPressed) {
                input.throw = true;
                input._throwWasPressed = true;
            }
        }
    });

    window.addEventListener('mouseup', (e: MouseEvent) => {
        if (e.button === 0) {
            input._throwWasPressed = false;
        }
    });

    const mixer = new THREE.AnimationMixer(group);
    const idleAction = idleAnimation ? mixer.clipAction(idleAnimation) : null;
    const walkAction = walkAnimation ? mixer.clipAction(walkAnimation) : null;
    const fallAction = fallAnimation ? mixer.clipAction(fallAnimation) : null;
    const hitAction = hitAnimation ? mixer.clipAction(hitAnimation) : null;
    if (idleAction) idleAction.play();
    if (walkAction) {
        walkAction.play();
        walkAction.weight = 0;
    }
    if (fallAction) {
        fallAction.play();
        fallAction.weight = 0;
    }
    if (hitAction) {
        hitAction.play();
        hitAction.weight = 0;
        hitAction.loop = THREE.LoopOnce;
    }

    return {
        body,
        group: group,
        mixer,
        idleAction,
        walkAction,
        fallAction,
        hitAction,
        input,
        desiredVelocity: vec3.create(),
        throwTime: 0,
    };
}

function initAgents(scene: THREE.Scene, navMesh: NavMesh, physics: PhysicsState, playerSpawn: Vec3): AgentsState {
    const { world } = physics;
    const agents: AgentState[] = [];

    for (let i = 0; i < AGENT_COUNT; i++) {
        const angle = (i / AGENT_COUNT) * Math.PI * 2;
        const radius = 3 + Math.random() * 2;
        const spawn: Vec3 = [
            playerSpawn[0] + Math.cos(angle) * radius,
            playerSpawn[1] + 5,
            playerSpawn[2] + Math.sin(angle) * radius,
        ];

        const shape = transformed.create({
            shape: capsule.create({
                halfHeightOfCylinder: AGENT_CAPSULE_HALF_H,
                radius: AGENT_CAPSULE_R,
            }),
            position: [0, AGENT_CAPSULE_HALF_H + AGENT_CAPSULE_R, 0],
            quaternion: quat.create(),
        });

        const body = rigidBody.create(world, {
            shape,
            motionType: MotionType.DYNAMIC,
            objectLayer: LAYER_MOVING,
            position: spawn,
            quaternion: quat.create(),
            allowedDegreesOfFreedom: dof(true, true, true, false, false, false),
            linearDamping: 0.5,
            angularDamping: 0.9,
        });

        const group = SkeletonUtils.clone(characterGltf.scene) as THREE.Group;
        group.scale.setScalar(AGENT_MESH_SCALE);
        scene.add(group);

        const mixer = new THREE.AnimationMixer(group);
        const idleAction = idleAnimation ? mixer.clipAction(idleAnimation) : null;
        const walkAction = walkAnimation ? mixer.clipAction(walkAnimation) : null;
        if (idleAction) idleAction.play();
        if (walkAction) {
            walkAction.play();
            walkAction.weight = 0;
        }

        agents.push({ body, group: group, mixer, idleAction, walkAction, path: [], pathIndex: 0, lastPathMs: 0 });
    }

    return { agents };
}

function initWorld(): World {
    const render = initRender();
    const splat = initSplat(render.scene);
    const physics = initPhysics();
    const navmesh = initNavMesh(render.scene);
    const player = initPlayer(render, physics);
    const agents = initAgents(render.scene, navmesh.result.navMesh, physics, PLAYER_SPAWN);
    const spheres = initSpheres(render.scene);

    // physics debug
    const physicsDebugOptions = debugRenderer.createDefaultOptions();
    physicsDebugOptions.bodies.wireframe = true;
    const physicsDebug = debugRenderer.init(physicsDebugOptions);
    physicsDebug.object3d.visible = false;
    render.scene.add(physicsDebug.object3d);

    // debug controls
    const gui = new GUI();
    const debugFolder = gui.addFolder('Debug');
    const debugParams = {
        navmesh: false,
        physicsDebug: false,
    };
    debugFolder
        .add(debugParams, 'navmesh')
        .name('Navmesh')
        .onChange((v: boolean) => {
            navmesh.helper.object.visible = v;
        });
    debugFolder
        .add(debugParams, 'physicsDebug')
        .name('Physics Debug')
        .onChange((v: boolean) => {
            physicsDebug.object3d.visible = v;
        });
    debugFolder.open();

    return { render, splat, physics, navmesh, physicsDebug, player, agents, spheres };
}

function initSpheres(scene: THREE.Scene): SpheresState {
    const sphereGeom = new THREE.SphereGeometry(SPHERE_RADIUS, 16, 16);
    const sphereMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(sphereGeom, sphereMat, SPHERE_MAX);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    scene.add(mesh);

    return { spheres: [], mesh };
}

const _updatePlayer_cameraQuat = new THREE.Quaternion();
const _updatePlayer_forwardVec3 = new THREE.Vector3();
const _updatePlayer_spreadQuat = new THREE.Quaternion();
const _updatePlayer_upAxis = new THREE.Vector3(0, 1, 0);
const _updatePlayer_forwardAxis = new THREE.Vector3(0, 0, 1);

function updatePlayer(
    player: PlayerState,
    render: RenderState,
    agents: AgentsState,
    spheres: SpheresState,
    physics: PhysicsState,
    dt: number,
): void {
    const { body, input, group } = player;
    const { camera } = render;
    const { world } = physics;
    const now = performance.now();

    player.mixer.update(dt);

    // movement direction from camera horizontal yaw
    camera.getWorldQuaternion(_updatePlayer_cameraQuat);
    const fwd = input.forward ? 1 : input.backward ? -1 : 0;
    const right = input.right ? 1 : input.left ? -1 : 0;
    movementDirection.set(right, 0, -fwd).applyQuaternion(_updatePlayer_cameraQuat);
    const movDir = movementDirection;
    movDir.y = 0;
    const movLen = movDir.length();
    if (movLen > 1e-6) movDir.divideScalar(movLen);
    const movementDirectionVec3: Vec3 = [movDir.x, 0, movDir.z];

    // get current velocity
    const currentVel = body.motionProperties?.linearVelocity ?? [0, 0, 0];

    // check if grounded via raycast
    const playerPos = body.position;
    const rayOrigin: Vec3 = [playerPos[0], playerPos[1] + 0.1, playerPos[2]];
    const rayDir: Vec3 = [0, -1, 0];
    const rayLength = PLAYER_CAPSULE_HALF_H + PLAYER_CAPSULE_R + 0.2;

    playerGroundCastRayCollector.reset();
    castRay(world, playerGroundCastRayCollector, playerGroundCastRaySettings, rayOrigin, rayDir, rayLength, playerGroundFilter);

    const isGrounded = playerGroundCastRayCollector.hit.status === CastRayStatus.COLLIDING;
    const isAirborne = !isGrounded;

    // apply movement
    if (movLen > 1e-6) {
        rigidBody.setLinearVelocity(world, body, [
            movementDirectionVec3[0] * PLAYER_SPEED,
            currentVel[1],
            movementDirectionVec3[2] * PLAYER_SPEED,
        ]);
    } else {
        // apply damping when not moving
        rigidBody.setLinearVelocity(world, body, [currentVel[0] * 0.9, currentVel[1], currentVel[2] * 0.9]);
    }

    // apply gravity
    rigidBody.setLinearVelocity(world, body, [
        (body.motionProperties?.linearVelocity ?? [0, 0, 0])[0],
        (body.motionProperties?.linearVelocity ?? [0, 0, 0])[1] + worldSettings.gravity[1] * dt,
        (body.motionProperties?.linearVelocity ?? [0, 0, 0])[2],
    ]);

    // jump impulse
    if (input.jump && isGrounded) {
        rigidBody.addImpulse(world, body, [0, PLAYER_JUMP_SPEED * body.massProperties.mass, 0]);
        input.jump = false;
    }

    const oldPos = vec3.clone(body.position);
    const newPos = body.position;

    // third-person camera follow
    vec3.sub(cameraDeltaPos, newPos, oldPos);
    camera.position.add(new THREE.Vector3(cameraDeltaPos[0], cameraDeltaPos[1], cameraDeltaPos[2]));

    // throw attack
    if (input.throw && now - input._lastThrowMs > PLAYER_THROW_COOLDOWN_MS) {
        input._lastThrowMs = now;
        input.throw = false;
        player.throwTime = PLAYER_THROW_DURATION_MS;

        if (player.hitAction) {
            player.hitAction.reset();
            player.hitAction.play();
        }

        const playerPos = body.position;
        const charQuat = body.quaternion;

        playerRotationQuat.set(charQuat[0], charQuat[1], charQuat[2], charQuat[3]);
        _updatePlayer_forwardVec3.copy(_updatePlayer_forwardAxis).applyQuaternion(playerRotationQuat);

        for (let i = 0; i < SPHERE_COUNT; i++) {
            const spreadAngle = (i - (SPHERE_COUNT - 1) / 2) * 0.15;
            _updatePlayer_spreadQuat.setFromAxisAngle(_updatePlayer_upAxis, spreadAngle);
            const dir = _updatePlayer_forwardVec3.clone().applyQuaternion(_updatePlayer_spreadQuat);

            const spawnPos: Vec3 = [playerPos[0] + dir.x * 0.8, playerPos[1] + 0.5, playerPos[2] + dir.z * 0.8];
            const vel: Vec3 = [dir.x * SPHERE_SPEED, dir.y * SPHERE_SPEED + 2, dir.z * SPHERE_SPEED];

            const shape = sphere.create({ radius: SPHERE_RADIUS });
            const sphereBody = rigidBody.create(world, {
                shape,
                motionType: MotionType.DYNAMIC,
                objectLayer: LAYER_MOVING,
                position: spawnPos,
                quaternion: quat.create(),
                linearDamping: 0.1,
                angularDamping: 0.1,
                mass: 1,
            });
            rigidBody.setLinearVelocity(world, sphereBody, vel);

            const color = new THREE.Color();
            color.setHSL(Math.random(), 0.6 + Math.random() * 0.2, 0.5 + Math.random() * 0.2);

            spheres.spheres.push({ body: sphereBody, color });
        }

        for (const agent of agents.agents) {
            const agentPos = agent.body.position;
            const dx = agentPos[0] - playerPos[0];
            const dz = agentPos[2] - playerPos[2];
            const distH = Math.sqrt(dx * dx + dz * dz);

            if (distH < PLAYER_THROW_RADIUS && distH > 1e-6) {
                const dirX = dx / distH;
                const dirZ = dz / distH;
                const force = PLAYER_THROW_FORCE;
                const currentVel = agent.body.motionProperties?.linearVelocity ?? [0, 0, 0];
                rigidBody.setLinearVelocity(world, agent.body, [
                    currentVel[0] + dirX * force,
                    currentVel[1] + 5,
                    currentVel[2] + dirZ * force,
                ]);
            }
        }
    } else {
        input.throw = false;
    }

    // throw animation
    if (player.throwTime > 0) {
        player.throwTime -= dt * 1000;
    }

    // animation blending - lerp weights for smooth transitions
    const t = 1.0 - 0.001 ** dt;
    const blendSpeed = 2;

    const isMoving = movLen > 1e-6;
    const isFalling = isAirborne;
    const isThrowing = player.throwTime > 0;

    // calculate target weights
    let idleWeight = 0;
    let walkWeight = 0;
    let fallWeight = 0;
    let hitWeight = 0;

    if (isThrowing) {
        hitWeight = 1;
    } else if (isFalling) {
        fallWeight = 1;
    } else if (isMoving) {
        walkWeight = 1;
    } else {
        idleWeight = 1;
    }

    // lerp weights for smooth transitions
    if (player.idleAction) {
        player.idleAction.setEffectiveWeight(
            THREE.MathUtils.lerp(player.idleAction.getEffectiveWeight(), idleWeight, t * blendSpeed),
        );
    }
    if (player.walkAction) {
        player.walkAction.setEffectiveWeight(
            THREE.MathUtils.lerp(player.walkAction.getEffectiveWeight(), walkWeight, t * blendSpeed),
        );
    }
    if (player.fallAction) {
        player.fallAction.setEffectiveWeight(
            THREE.MathUtils.lerp(player.fallAction.getEffectiveWeight(), fallWeight, t * blendSpeed),
        );
    }
    if (player.hitAction) {
        player.hitAction.setEffectiveWeight(
            THREE.MathUtils.lerp(player.hitAction.getEffectiveWeight(), hitWeight, t * blendSpeed),
        );
    }

    // sync visual
    group.position.set(newPos[0], newPos[1] + PLAYER_MESH_Y_OFFSET, newPos[2]);

    // face toward movement direction (only when not throwing)
    if (player.throwTime <= 0 && movLen > 1e-6) {
        const targetYaw = Math.atan2(movementDirectionVec3[0], movementDirectionVec3[2]);
        quat.setAxisAngle(_updateAgents_targetQ, [0, 1, 0], targetYaw);
        quat.slerp(body.quaternion, body.quaternion, _updateAgents_targetQ, 1 - 0.0001 ** dt);
        group.quaternion.set(body.quaternion[0], body.quaternion[1], body.quaternion[2], body.quaternion[3]);
    }
}

const _updateAgents_targetQ = quat.create();
const _updateAgents_slerpedQ = quat.create();

function updateAgents(agents: AgentsState, navmesh: NavMeshState, player: PlayerState, physics: PhysicsState, dt: number): void {
    const { world } = physics;
    const now = performance.now();
    const navMesh = navmesh.result.navMesh;
    const playerPos = player.body.position;

    for (const agent of agents.agents) {
        agent.mixer.update(dt);
        const pos = agent.body.position;

        // respawn if fallen
        if (pos[1] < -30) {
            rigidBody.setPosition(world, agent.body, [playerPos[0] + 3, playerPos[1] + 2, playerPos[2] + 3], true);
            rigidBody.setLinearVelocity(world, agent.body, [0, 0, 0]);
            agent.path = [];
            agent.pathIndex = 0;
            continue;
        }

        // throttled path recompute
        if (now - agent.lastPathMs > AGENT_PATH_INTERVAL_MS) {
            agent.lastPathMs = now;
            const result = findPath(navMesh, pos, playerPos, AGENT_PATH_HALF_EXTENTS, DEFAULT_QUERY_FILTER);
            if (result.success && result.path.length > 0) {
                agent.path = result.path;
                agent.pathIndex = 1;
            }
        }

        // movement along path
        if (agent.path.length > 1 && agent.pathIndex < agent.path.length) {
            const waypoint = agent.path[agent.pathIndex].position;
            const dx = waypoint[0] - pos[0];
            const dz = waypoint[2] - pos[2];
            const distH = Math.sqrt(dx * dx + dz * dz);

            if (distH < AGENT_WAYPOINT_REACH_DIST && agent.pathIndex < agent.path.length - 1) {
                agent.pathIndex++;
            }

            const distToPlayer = vec3.distance(playerPos, pos);
            const vy = agent.body.motionProperties.linearVelocity[1];

            const len = distH > 1e-6 ? distH : 1;
            const dirX = dx / len;
            const dirZ = dz / len;

            if (distToPlayer > AGENT_STOP_DIST) {
                const currentVel = agent.body.motionProperties.linearVelocity;
                const newVelX = currentVel[0] + dirX * AGENT_SPEED * 0.1;
                const newVelZ = currentVel[2] + dirZ * AGENT_SPEED * 0.1;
                const speed = Math.sqrt(newVelX * newVelX + newVelZ * newVelZ);
                const maxSpeed = AGENT_SPEED * 1.5;
                const scale = speed > maxSpeed ? maxSpeed / speed : 1;
                rigidBody.setLinearVelocity(world, agent.body, [newVelX * scale, vy, newVelZ * scale]);
            }

            // only rotate when actually moving
            const speed = vec3.length(agent.body.motionProperties.linearVelocity);

            if (speed > 1.0) {
                const targetYaw = Math.atan2(dirX, dirZ);
                quat.setAxisAngle(_updateAgents_targetQ, [0, 1, 0], targetYaw);
                const slerpT = 1 - 0.001 ** (dt * AGENT_ROTATION_SPEED);
                quat.slerp(_updateAgents_slerpedQ, agent.body.quaternion, _updateAgents_targetQ, slerpT);
                rigidBody.setQuaternion(world, agent.body, _updateAgents_slerpedQ, true);
            }
        }

        // sync visual to rigid body
        agent.group.position.set(agent.body.position[0], agent.body.position[1] + AGENT_MESH_Y_OFFSET, agent.body.position[2]);
        agent.group.quaternion.set(
            agent.body.quaternion[0],
            agent.body.quaternion[1],
            agent.body.quaternion[2],
            agent.body.quaternion[3],
        );

        // walk/idle blending
        const velocity = agent.body.motionProperties.linearVelocity;
        const speed = Math.sqrt(velocity[0] * velocity[0] + velocity[2] * velocity[2]);
        const isMoving = speed > 0.5;

        // lerp weights for smooth transitions
        const t = 1.0 - 0.001 ** dt;
        const blendSpeed = 5;
        const targetWalkWeight = isMoving ? 1 : 0;

        if (agent.walkAction) {
            agent.walkAction.setEffectiveWeight(
                THREE.MathUtils.lerp(agent.walkAction.getEffectiveWeight(), targetWalkWeight, t * blendSpeed),
            );
        }
        if (agent.idleAction) {
            agent.idleAction.setEffectiveWeight(
                THREE.MathUtils.lerp(agent.idleAction.getEffectiveWeight(), 1 - targetWalkWeight, t * blendSpeed),
            );
        }
    }
}

function updatePhysics(physics: PhysicsState, dt: number, physicsDebug: DebugRendererState): void {
    const { world } = physics;
    updateWorld(world, undefined, dt);
    debugRenderer.update(physicsDebug, world);
}

const _updateSpheres_sphereMatrix = new THREE.Object3D();

function updateSpheres(spheres: SpheresState): void {
    let aliveCount = 0;
    for (let i = spheres.spheres.length - 1; i >= 0; i--) {
        const s = spheres.spheres[i];

        const pos = s.body.position;
        const q = s.body.quaternion;
        _updateSpheres_sphereMatrix.position.set(pos[0], pos[1], pos[2]);
        _updateSpheres_sphereMatrix.quaternion.set(q[0], q[1], q[2], q[3]);
        _updateSpheres_sphereMatrix.updateMatrix();
        spheres.mesh.setMatrixAt(aliveCount, _updateSpheres_sphereMatrix.matrix);
        spheres.mesh.setColorAt(aliveCount, s.color);
        aliveCount++;
    }

    spheres.mesh.count = aliveCount;
    spheres.mesh.instanceMatrix.needsUpdate = true;
    if (spheres.mesh.instanceColor) spheres.mesh.instanceColor.needsUpdate = true;
}

function updateCameraCollision(render: RenderState, playerPos: Vec3): void {
    const { camera, controls } = render;
    const origin: Vec3 = [playerPos[0], playerPos[1] + CAMERA_TARGET_Y_OFFSET, playerPos[2]];
    const dx = camera.position.x - playerPos[0];
    const dy = camera.position.y - (playerPos[1] + CAMERA_TARGET_Y_OFFSET);
    const dz = camera.position.z - playerPos[2];
    const currentDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (currentDist < 1e-6) return;

    const dir: Vec3 = [dx / currentDist, dy / currentDist, dz / currentDist];

    cameraCollisionCastRayCollector.reset();

    castRay(world, cameraCollisionCastRayCollector, cameraCollisionCastRaySettings, origin, dir, currentDist, nonMovingFilter);

    if (cameraCollisionCastRayCollector.hit.status !== CastRayStatus.COLLIDING) {
        controls.idealDistance = currentDist;
    }

    const idealDist = controls.idealDistance;

    if (cameraCollisionCastRayCollector.hit.status === CastRayStatus.COLLIDING) {
        const hitDist = cameraCollisionCastRayCollector.hit.fraction * idealDist;
        camera.position.set(origin[0] + dir[0] * hitDist, origin[1] + dir[1] * hitDist, origin[2] + dir[2] * hitDist);
    } else {
        camera.position.set(origin[0] + dir[0] * idealDist, origin[1] + dir[1] * idealDist, origin[2] + dir[2] * idealDist);
    }
}

function updateWorldState(w: World, dt: number): void {
    updatePlayer(w.player, w.render, w.agents, w.spheres, w.physics, dt);
    updatePhysics(w.physics, dt, w.physicsDebug);
    updateAgents(w.agents, w.navmesh, w.player, w.physics, dt);
    updateSpheres(w.spheres);
    updateControls(w.render.camera, w.render.controls, w.player.body.position);
    updateCameraCollision(w.render, w.player.body.position);
    w.render.renderer.render(w.render.scene, w.render.camera);
}

/* init & loop */

const w = initWorld();

document.getElementById('loader')?.remove();

let last = performance.now();

function loop(): void {
    requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    updateWorldState(w, dt);
}

loop();
