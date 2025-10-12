import { WebGPUCanvas } from '@sketches/common/components/webgpu-canvas';
import sunsetEnvironment from './sunset.hdr?url';
import { Environment, PerspectiveCamera } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { type With, World } from 'arancini';
import * as p2 from 'p2-es';
import { useEffect, useMemo, useRef, useState } from 'react';
import { suspend } from 'suspend-react';
import * as THREE from 'three';
import { color, mix, smoothstep, uv } from 'three/tsl';
import { MeshBasicNodeMaterial, type WebGPURenderer } from 'three/webgpu';
import { create } from 'zustand';
import * as Particles from './particles';
import * as InstancedSprites from './sprites';

type P2BodyWithUserData = p2.Body & {
    userData?: {
        environment?: boolean;
    };
};

const setEnvironmentUserData = (body: p2.Body) => {
    (body as P2BodyWithUserData).userData = { environment: true };
};

const _direction = new THREE.Vector3();
const _velocity = new THREE.Vector3();
const _position = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _matrix4 = new THREE.Matrix4();
const _cameraPositionTarget = new THREE.Vector3();
const _cameraLookAtTarget = new THREE.Vector3();

const VECTOR_UP = new THREE.Vector3(0, 1, 0);

const MINGLING_CAT_TYPES = ['blackCat', 'christmasCat', 'classicCat', 'grayCat', 'triCat'];

const CAT_TYPES = {
    cupidCat: {
        id: 0,
        atlas: './sprites/cupid-cat-sled.png',
        frames: 7,
    },
    blackCat: {
        id: 1,
        atlas: './sprites/black-cat-skates.png',
        frames: 7,
    },
    christmasCat: {
        id: 2,
        atlas: './sprites/christmas-cat-sled.png',
        frames: 14,
    },
    classicCat: {
        id: 3,
        atlas: './sprites/classic-cat-skates.png',
        frames: 7,
    },
    grayCat: {
        id: 4,
        atlas: './sprites/gray-cat-skates.png',
        frames: 7,
    },
    triCat: {
        id: 5,
        atlas: './sprites/tri-cat-skates.png',
        frames: 7,
    },
};

const AUDIO_ASSETS = {
    terrible_cat_theme: {
        url: './audio/terrible_cat_theme.ogg',
    },
    catLove1: {
        url: './audio/cat_love1.ogg',
    },
    catLove2: {
        url: './audio/cat_love2.ogg',
    },
    catLove3: {
        url: './audio/cat_love3.ogg',
    },
    catSad1: {
        url: './audio/cat_sad1.ogg',
    },
    catSad2: {
        url: './audio/cat_sad2.ogg',
    },
    catSad3: {
        url: './audio/cat_sad3.ogg',
    },
    catShove1: {
        url: './audio/cat_shove1.ogg',
    },
    catShove2: {
        url: './audio/cat_shove2.ogg',
    },
    catShoveHard1: {
        url: './audio/cat_shovehard1.ogg',
    },
    catShoveHard2: {
        url: './audio/cat_shovehard2.ogg',
    },
    partyHorn: {
        url: './audio/party_horn.ogg',
    },
    fireworks1: {
        url: './audio/fireworks_1.ogg',
    },
    fireworks2: {
        url: './audio/fireworks_2.ogg',
    },
    fireworks3: {
        url: './audio/fireworks_3.ogg',
    },
    fireworks4: {
        url: './audio/fireworks_4.ogg',
    },
};

const AUDIO_CAT_LOVE: AudioAssetId[] = ['catLove1', 'catLove2', 'catLove3'];
const AUDIO_CAT_SAD: AudioAssetId[] = ['catSad1', 'catSad2', 'catSad3'];
const AUDIO_CAT_SHOVE: AudioAssetId[] = ['catShove1', 'catShove2'];
const AUDIO_CAT_SHOVE_HARD: AudioAssetId[] = ['catShoveHard1', 'catShoveHard2'];
const AUDIO_FIREWORKS: AudioAssetId[] = ['fireworks1', 'fireworks2', 'fireworks3', 'fireworks4'];

type GameState = Awaited<ReturnType<typeof init>>;

type Assets = Awaited<ReturnType<typeof loadAssets>>;

type AudioAssetId = keyof typeof AUDIO_ASSETS;

type CharacterInput = {
    wishDirection: [number, number];
    boostDown?: boolean;
};

type CharacterMovement = {
    speed: number;
    stopSpeed: number;
    surfaceFriction: number;
    acceleration: number;

    boostChargeTime?: number;
    lastBoostTime?: number;
};

type EntityType = {
    body?: p2.Body;
    transform?: THREE.Object3D;
    three?: THREE.Object3D;
    threeInstance?: { setMatrix: (matrix: THREE.Matrix4) => void; remove: () => void };

    input?: CharacterInput;
    movement?: CharacterMovement;

    isPlayer?: boolean;
    isCharacter?: boolean;
    isCat?: boolean;
    isMinglingCat?: boolean;
    catType?: keyof typeof CAT_TYPES;

    isSingle?: boolean;
    partner?: CatEntity;

    match?: [CatEntity, CatEntity];

    trail?: {
        lastSpawnTime: number;
    };

    movementStatusEffect?: {
        type: 'dizzy';
        countdown: number;
    };

    lifetime?: number;
};

type CatEntity = With<EntityType, 'isCat' | 'catType' | 'transform' | 'body' | 'input'>;

const createPlayer = (world: World, position: [number, number]) => {
    const playerShape = new p2.Circle({ radius: 0.75 });

    const playerBody = new p2.Body({
        mass: 1,
        type: p2.Body.DYNAMIC,
        fixedRotation: true,
        position,
    });

    playerBody.addShape(playerShape);

    world.create({
        isPlayer: true,
        isCharacter: true,
        body: playerBody,
        transform: new THREE.Object3D(),
        isCat: true,
        catType: 'cupidCat',
        input: { wishDirection: [0, 0] },
        trail: {
            lastSpawnTime: 0,
        },
        movement: {
            speed: 10,
            stopSpeed: 3,
            surfaceFriction: 3,
            acceleration: 2,
        },
    });
};

const createMinglingCats = (world: World, physics: p2.World) => {
    const localPoint = [0, 0];
    const catBodyPadding = 1.5;

    for (let i = 0; i < N_CATS; i++) {
        let attempt = 0;

        while (attempt < 10) {
            attempt++;

            const angle = Math.random() * Math.PI * 2;
            const distance = THREE.MathUtils.mapLinear(Math.random(), 0, 1, 5, 22);
            const position = [Math.cos(angle) * distance, Math.sin(angle) * distance] as [number, number];

            let tooClose = false;

            for (const body of physics.bodies) {
                if ((body as P2BodyWithUserData).userData?.environment) continue;

                if (tooClose) break;

                p2.vec2.subtract(localPoint, position, body.position);

                // is point inside circle?
                if (p2.vec2.squaredLength(localPoint) < (body.boundingRadius + catBodyPadding) ** 2) {
                    tooClose = true;
                    break;
                }
            }

            if (!tooClose) {
                createCat(world, position);
                break;
            }
        }
    }
};

const createCat = (world: World, position: [number, number]) => {
    const body = new p2.Body({
        mass: 1,
        type: p2.Body.DYNAMIC,
        position,
        fixedRotation: true,
    });

    const shape = new p2.Circle({ radius: 0.5 });

    body.addShape(shape);

    world.create({
        isCharacter: true,
        isCat: true,
        isMinglingCat: true,
        catType: MINGLING_CAT_TYPES[Math.floor(Math.random() * MINGLING_CAT_TYPES.length)],
        isSingle: true,
        body,
        transform: new THREE.Object3D(),
        input: { wishDirection: [0, 0] },
        trail: {
            lastSpawnTime: 0,
        },
        movement: {
            speed: 3,
            stopSpeed: 3,
            surfaceFriction: 1,
            acceleration: 3,
        },
    });
};

const loadAssets = async () => {
    // load audio buffers
    const audioLoader = new THREE.AudioLoader();

    const audio: Record<keyof typeof AUDIO_ASSETS, { id: AudioAssetId; buffer: AudioBuffer }> = Object.fromEntries(
        await Promise.all(
            Object.entries(AUDIO_ASSETS).map(async ([key, asset]) => {
                const buffer = await audioLoader.loadAsync(asset.url);

                return [key, { id: key, buffer }];
            }),
        ),
    );

    // create sprite texture atlas
    const sprites: Record<string, { frames: number; url: string }> = {};

    for (const [key, type] of Object.entries(CAT_TYPES)) {
        sprites[key] = { frames: type.frames, url: type.atlas };
    }

    sprites.christmasTree = { frames: 2, url: './sprites/christmas-tree.png' };

    sprites.heart = { frames: 2, url: './sprites/heart.png' };

    const instancedSpritesAtlas = await InstancedSprites.createAtlas(sprites);

    // debug
    // const spriteAtlasCanvas = instancedSpritesAtlas.canvas
    // document.body.appendChild(spriteAtlasCanvas)
    // spriteAtlasCanvas.style.position = 'absolute'
    // spriteAtlasCanvas.style.top = '0'
    // spriteAtlasCanvas.style.left = '0'
    // spriteAtlasCanvas.style.width = '100vw'
    // spriteAtlasCanvas.style.height = '100vh'
    // spriteAtlasCanvas.style.objectFit = 'contain'
    // spriteAtlasCanvas.style.imageRendering = 'pixelated'

    return {
        audio,
        instancedSpritesAtlas,
    };
};

const GAME_STATE_MENU = 0;
const GAME_STATE_PLAYING = 1;
const GAME_STATE_GAME_OVER = 2;

const N_CATS = 200;
const N_MEOWTCHES = N_CATS / 2;

const createChristmasTree = (instancedSprites: InstancedSprites.State, group: THREE.Group, world: World) => {
    const christmasTreeId = InstancedSprites.addInstance(instancedSprites, 'christmasTree');
    const christmasTreeIndex = instancedSprites.instanceIdToIndex[christmasTreeId];
    const christmasTreeTransform = new THREE.Object3D();
    christmasTreeTransform.position.set(0.2, 3.5, 0);
    christmasTreeTransform.scale.set(7, 7, 7);
    christmasTreeTransform.updateMatrix();
    instancedSprites.setMatrixAt(christmasTreeIndex, christmasTreeTransform.matrix);

    // ring
    const ringShape = new THREE.Shape();
    ringShape.moveTo(0, 0);
    ringShape.absarc(0, 0, 3, 0, Math.PI * 2, false);
    ringShape.absarc(0, 0, 2, 0, Math.PI * 2, true);

    const ringGeometry = new THREE.ExtrudeGeometry(ringShape, { depth: 0.5, bevelEnabled: false });
    const ringMaterial = new THREE.MeshStandardMaterial({ color: '#999' });

    const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
    ringMesh.rotation.x = -Math.PI / 2;

    group.add(ringMesh);

    // ring ground
    const ringGroundShape = new THREE.CircleGeometry(3, 32);
    const ringGroundMaterial = new THREE.MeshStandardMaterial({ color: '#00482E' });

    const ringGroundMesh = new THREE.Mesh(ringGroundShape, ringGroundMaterial);
    ringGroundMesh.rotation.x = -Math.PI / 2;
    ringGroundMesh.position.y = 0.02;

    group.add(ringGroundMesh);

    // physics body
    const ringPhysicsShape = new p2.Circle({ radius: 3 });
    const ringPhysicsBody = new p2.Body({ mass: 0, position: [0, 0] });
    ringPhysicsBody.addShape(ringPhysicsShape);

    world.create({
        body: ringPhysicsBody,
    });
};

const createIceRink = (group: THREE.Group, world: World) => {
    // create rink mesh
    const rinkShape = new THREE.Shape();
    rinkShape.moveTo(0, 0);
    rinkShape.absarc(0, 0, 25.5, 0, Math.PI * 2, false);
    rinkShape.absarc(0, 0, 24, 0, Math.PI * 2, true);

    const rinkGeometry = new THREE.ExtrudeGeometry(rinkShape, { depth: 0.5, bevelEnabled: false });
    const rinkMaterial = new THREE.MeshStandardMaterial({ color: '#fff' });

    const rinkMesh = new THREE.Mesh(rinkGeometry, rinkMaterial);
    rinkMesh.rotation.x = -Math.PI / 2;
    rinkMesh.position.y = 0.1;

    group.add(rinkMesh);

    // create physics body
    const points = rinkShape.extractPoints(30);

    const rinkPhysicsBody = new p2.Body({ mass: 0, position: [0, 0] });
    rinkPhysicsBody.fromPolygon(points.shape.map((point) => [point.x, point.y]));

    setEnvironmentUserData(rinkPhysicsBody);

    world.create({
        body: rinkPhysicsBody,
    });
};

const createBackground = (group: THREE.Group) => {
    // ground under rink
    const groundShape = new THREE.PlaneGeometry(1000, 1000);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: '#00482E' });
    const groundMesh = new THREE.Mesh(groundShape, groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.1;
    group.add(groundMesh);
};

const initMatchHearts = (instancedSprites: InstancedSprites.State, world: World<EntityType>, queries: GameState['queries']) => {
    queries.matches.onEntityAdded.add((entity) => {
        const transform = new THREE.Object3D();
        transform.scale.setScalar(0.5);

        const instanceId = InstancedSprites.addInstance(instancedSprites, 'heart');

        world.update(entity, {
            threeInstance: {
                setMatrix: (matrix) => {
                    const instanceIndex = instancedSprites.instanceIdToIndex[instanceId];
                    instancedSprites.setMatrixAt(instanceIndex, matrix);
                },
                remove: () => {
                    InstancedSprites.removeInstance(instancedSprites, instanceId);
                },
            },
            transform,
        });
    });

    queries.matches.onEntityRemoved.add((entity) => {
        if (!entity.threeInstance) return;

        entity.threeInstance.remove();

        world.remove(entity, 'threeInstance');
    });
};

const updateMatchTransforms = (state: GameState) => {
    for (const entity of state.queries.matches) {
        if (!entity.transform) continue;

        const [a, b] = entity.match;
        _position.lerpVectors(a.transform.position, b.transform.position, 0.5);
        entity.transform.position.copy(_position);
    }
};

const init = (assets: Assets) => {
    /* create world and queries */
    const world = new World<EntityType>();

    const queries = {
        player: world.query((e) => e.has('isPlayer', 'body', 'transform', 'input')),
        characters: world.query((e) => e.has('isCharacter', 'body', 'transform', 'input', 'movement')),
        cats: world.query((e) => e.has('isCat', 'catType', 'transform', 'body', 'input')),
        minglingCats: world.query((e) => e.has('isMinglingCat')),
        singles: world.query((e) => e.has('isSingle', 'transform', 'body')),
        matches: world.query((e) => e.has('match')),
        physicsBodies: world.query((e) => e.has('body')),
        lifetime: world.query((e) => e.has('lifetime')),
        trail: world.query((e) => e.has('trail', 'body')),
    };

    /* create physics world */
    const physics = new p2.World();
    physics.gravity = [0, 0];

    const physicsImpacts: [a: With<EntityType, 'body'>, b: With<EntityType, 'body'>, e: p2.ImpactEvent][] = [];

    physics.on('impact', (event) => {
        const entityA = physicsBodyToEntity.get(event.bodyA) as With<EntityType, 'body'>;
        const entityB = physicsBodyToEntity.get(event.bodyB) as With<EntityType, 'body'>;

        if (entityA && entityB) {
            physicsImpacts.push([entityA, entityB, event]);
        }
    });

    const physicsBodyToEntity = new Map<p2.Body, EntityType>();

    queries.physicsBodies.onEntityAdded.add((entity) => {
        physics.addBody(entity.body);
        physicsBodyToEntity.set(entity.body, entity);
    });

    queries.physicsBodies.onEntityRemoved.add((entity) => {
        physics.removeBody(entity.body);
        physicsBodyToEntity.delete(entity.body);
    });

    /* game state */
    const game = {
        gameState: GAME_STATE_MENU,
        timeRemaining: 30,
        score: 0,
    };

    /* player input */
    const input = {
        direction: [0, 0],
        boostDown: false,
    };

    /* audio listener */
    const audioListener = new THREE.AudioListener();

    /* objects to add to the scene */
    const group = new THREE.Group();

    /* instanced sprites */
    const instancedSprites = InstancedSprites.init(assets.instancedSpritesAtlas, 500);
    group.add(instancedSprites.mesh);

    /* particle system */
    const particles = Particles.init(0.05, 10000);
    group.add(particles.mesh);

    /* cat sprite rendering */
    queries.cats.onEntityAdded.add((entity) => {
        const instanceId = InstancedSprites.addInstance(instancedSprites, entity.catType!);

        world.add(entity, 'threeInstance', {
            setMatrix: (matrix) => {
                const instanceIndex = instancedSprites.instanceIdToIndex[instanceId];
                instancedSprites.setMatrixAt(instanceIndex, matrix);
            },
            remove: () => {
                InstancedSprites.removeInstance(instancedSprites, instanceId);
            },
        });
    });

    /* game environment */
    createChristmasTree(instancedSprites, group, world);
    createIceRink(group, world);

    /* background visual only environment */
    createBackground(group);

    /* match hearts */
    initMatchHearts(instancedSprites, world, queries);

    /* create player */
    createPlayer(world, [0, 5]);

    /* create cats */
    createMinglingCats(world, physics);

    return {
        time: 0,
        group,
        world,
        audioListener,
        physics,
        physicsImpacts,
        physicsBodyToEntity,
        queries,
        input,
        game,
        instancedSprites,
        particles,
        gameOver: {
            nextFireworkVfxTime: 0,
            nextFireworkSfxTime: 0,
        },
    };
};

const dispose = (state: GameState) => {
    InstancedSprites.dispose(state.instancedSprites);

    Particles.dispose(state.particles);

    state.physics.clear();
    state.world.clear();
};

const startGame = (state: GameState) => {
    state.game.timeRemaining = 30;
    state.game.gameState = GAME_STATE_PLAYING;
};

const updatePlayerInput = (state: GameState) => {
    const player = state.queries.player.first;
    if (!player) return;

    const input = state.input;

    const wishDirection = player.input.wishDirection;

    wishDirection[0] = input.direction[0];
    wishDirection[1] = input.direction[1];

    const length = p2.vec2.length(wishDirection);

    p2.vec2.normalize(wishDirection, wishDirection);

    p2.vec2.scale(wishDirection, wishDirection, length);

    player.input.boostDown = input.boostDown;
};

const updateStatusEffects = (state: GameState, delta: number) => {
    for (const entity of state.queries.characters) {
        if (entity.movementStatusEffect) {
            entity.movementStatusEffect.countdown -= delta;

            if (entity.movementStatusEffect.countdown <= 0) {
                state.world.remove(entity, 'movementStatusEffect');
            }
        }
    }
};

const updateMinglingCatsInput = (state: GameState) => {
    for (const entity of state.queries.minglingCats) {
        if (!entity.body || !entity.input) continue;

        const wishDirection = entity.input.wishDirection;
        wishDirection[0] = 0;
        wishDirection[1] = 0;

        if (entity.movementStatusEffect?.type === 'dizzy') {
            continue;
        }

        // if has a partner and more than 1 unit away, move towards partner
        if (entity.partner && p2.vec2.distance(entity.body.position, entity.partner.body.position) > 1) {
            p2.vec2.subtract(wishDirection, entity.partner.body.position, entity.body.position);
            p2.vec2.normalize(wishDirection, wishDirection);
        }
    }
};

const updateCharacterMovement = (state: GameState, delta: number) => {
    for (const entity of state.queries.characters) {
        const body = entity.body;

        const wishDirection = entity.input.wishDirection;
        const requestingMovement = wishDirection[0] !== 0 || wishDirection[1] !== 0;

        const wishSpeed = requestingMovement ? entity.movement.speed : 0;
        const stopSpeed = entity.movement.stopSpeed;
        const surfaceFriction = entity.movement.surfaceFriction;
        const acceleration = entity.movement.acceleration;

        const currentSpeedInWishDirection = p2.vec2.dot(body.velocity, entity.input.wishDirection);
        const currentSpeed = p2.vec2.length(body.velocity);

        // friction
        if (currentSpeed !== 0) {
            const control = currentSpeed < stopSpeed ? stopSpeed : currentSpeed;
            const drop = delta * control * surfaceFriction;

            let newSpeed = currentSpeed - drop;
            if (newSpeed < 0) newSpeed = 0;
            newSpeed /= currentSpeed;

            p2.vec2.scale(body.velocity, body.velocity, newSpeed);
        }

        // acceleration
        const maxAcceleration = acceleration * surfaceFriction * wishSpeed * delta;

        const addSpeed = THREE.MathUtils.clamp(wishSpeed - currentSpeedInWishDirection, 0, maxAcceleration);
        const velocityChange = p2.vec2.clone(wishDirection);
        p2.vec2.scale(velocityChange, velocityChange, addSpeed);

        p2.vec2.add(body.velocity, body.velocity, velocityChange);

        if (requestingMovement) {
            body.angle = Math.atan2(body.velocity[1], body.velocity[0]);
        }

        if (
            entity.input.boostDown &&
            (entity.movement.boostChargeTime !== undefined || state.time > (entity.movement.lastBoostTime ?? 0) + 0.2)
        ) {
            entity.movement.boostChargeTime = (entity.movement.boostChargeTime ?? 0) + delta;
        } else {
            if (entity.movement.boostChargeTime) {
                const addBoostVelocity =
                    10 +
                    THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(entity.movement.boostChargeTime, 0, 3, 10, 150), 10, 150);

                const boostVelocity = [Math.cos(body.angle) * addBoostVelocity, Math.sin(body.angle) * addBoostVelocity];

                p2.vec2.add(body.velocity, body.velocity, boostVelocity);

                spawnBoostParticles(state, entity.transform.position, entity.movement.boostChargeTime);

                entity.movement.boostChargeTime = undefined;
                entity.movement.lastBoostTime = state.time;
            }
        }
    }
};

const updatePhysics = (state: GameState, delta: number) => {
    state.physicsImpacts.length = 0;
    state.physics.step(delta, delta, 10);
};

const updateTransformsFromPhysics = (state: GameState) => {
    for (const entity of state.queries.physicsBodies.entities) {
        if (!entity.body || !entity.transform) continue;

        const body = entity.body;
        const transform = entity.transform;
        transform.position.set(body.position[0], 0, body.position[1]);
    }
};

const updateCatTransforms = (state: GameState) => {
    for (const entity of state.queries.cats) {
        if (!entity.body || !entity.transform) continue;

        const body = entity.body;
        const transform = entity.transform;
        transform.position.set(body.position[0], 0, body.position[1]);

        transform.position.y = 0.5;

        const velocity = body.velocity;

        const facingLeft = body.angle > Math.PI / 2 || body.angle < -Math.PI / 2;

        if (Math.abs(velocity[0]) > 0.1 || Math.abs(velocity[1]) > 0.1) {
            transform.rotation.y = velocity[0] > 0 ? 0.2 : -0.2;

            transform.scale.x = facingLeft ? -1 : 1;
        }

        transform.rotation.z = 0;

        if (entity.movement?.boostChargeTime) {
            const lowAngle = 0;
            const highAngle = Math.PI / 4;
            const angle = THREE.MathUtils.clamp(
                THREE.MathUtils.mapLinear(entity.movement.boostChargeTime, 0, 3, lowAngle, highAngle),
                lowAngle,
                highAngle,
            );

            transform.rotation.z = angle * (facingLeft ? -1 : 1);
        }
    }
};

const updateMeshTransforms = (state: GameState) => {
    for (const entity of state.world.entities) {
        if (!entity.transform) continue;

        if (entity.three) {
            entity.three.position.copy(entity.transform.position);
            entity.three.rotation.copy(entity.transform.rotation);
            entity.three.scale.copy(entity.transform.scale);
        } else if (entity.threeInstance) {
            const { setMatrix } = entity.threeInstance;

            const transform = entity.transform;

            _matrix4.compose(transform.position, transform.quaternion, transform.scale);

            setMatrix(_matrix4);
        }
    }
};

const onGameOver = (state: GameState, assets: Assets) => {
    // couples stop moving
    for (const { match } of state.queries.matches) {
        const [a, b] = match;

        a.body.type = p2.Body.STATIC;
        b.body.type = p2.Body.STATIC;
    }

    // confetti
    for (const match of state.queries.matches) {
        for (const e of match.match) {
            spawnConfetti(state, e.transform.position);
        }
    }

    // sfx
    playAudio(state, assets, 'partyHorn');
};

const FIREWORKS_COLORS = [0xff0000, 0x00ff00, 0x9999ff, 0xffff00, 0xff00ff, 0x00ffff];

const updateGameOverFx = (state: GameState, assets: Assets) => {
    if (state.game.gameState !== GAME_STATE_GAME_OVER) return;

    if (state.time - state.gameOver.nextFireworkVfxTime > 0) {
        state.gameOver.nextFireworkVfxTime = state.time + Math.random() * 0.05 + 0.05;

        for (let i = 0; i < 3; i++) {
            spawnFireworkSpark(
                state,
                _position.set(THREE.MathUtils.randFloatSpread(10), Math.random() * 5 + 5, THREE.MathUtils.randFloatSpread(10)),
                FIREWORKS_COLORS[Math.floor(Math.random() * FIREWORKS_COLORS.length)],
            );
        }
    }

    if (state.time - state.gameOver.nextFireworkSfxTime > 0) {
        state.gameOver.nextFireworkSfxTime = state.time + Math.random() * 0.15 + 0.15;

        const fireworksSound = AUDIO_FIREWORKS[Math.floor(Math.random() * AUDIO_FIREWORKS.length)] as AudioAssetId;
        playAudio(state, assets, fireworksSound);
    }
};

const updateGameTimer = (state: GameState, assets: Assets, delta: number) => {
    if (state.game.gameState === GAME_STATE_MENU) {
        return;
    }

    state.game.timeRemaining -= delta;
    if (state.game.timeRemaining <= 0) {
        const prevGameOver = state.game.gameState === GAME_STATE_GAME_OVER;
        state.game.gameState = GAME_STATE_GAME_OVER;

        if (!prevGameOver) {
            onGameOver(state, assets);
        }
    }
};

const UNMATCH_DISTANCE = 4;

const updateMatchmaking = (state: GameState, assets: Assets) => {
    if (state.game.gameState === GAME_STATE_GAME_OVER) return;

    // make matches between cats that collide with each other while one of them is dizzy
    for (const [a, b] of state.physicsImpacts) {
        const shouldMatch = a.isMinglingCat && a.isSingle && b.isMinglingCat && b.isSingle;
        // && (a.movementStatusEffect?.type === 'dizzy' || b.movementStatusEffect?.type === 'dizzy')

        if (!shouldMatch) continue;

        state.world.remove(a, 'isSingle');
        state.world.remove(b, 'isSingle');

        state.world.add(a, 'partner', b as CatEntity);
        state.world.add(b, 'partner', a as CatEntity);

        const match = state.world.create({
            match: [a as CatEntity, b as CatEntity],
        });

        state.game.score++;

        for (const e of match.match) {
            // match sfx
            const sound = AUDIO_CAT_LOVE[Math.floor(Math.random() * AUDIO_CAT_LOVE.length)] as AudioAssetId;
            const volume = THREE.MathUtils.mapLinear(Math.random(), 0, 1, 0.2, 0.4);
            const detune = THREE.MathUtils.mapLinear(Math.random(), 0, 1, -200, 200);
            playPositionalAudio(state, assets, sound, e.transform, volume, detune);

            // match vfx
            spawnConfetti(state, e.transform.position);
        }
    }

    // start the game on the first collision
    if (state.game.gameState === GAME_STATE_MENU && state.queries.matches.entities.length > 0) {
        startGame(state);
    }

    // check if couples have drifted too far apart
    // if they have, remove their partner property and add the isSingle property
    for (const match of state.queries.matches) {
        const [entity1, entity2] = match.match!;

        const transform1 = entity1.transform;
        const transform2 = entity2.transform;

        const distance = transform1.position.distanceTo(transform2.position);

        if (distance > UNMATCH_DISTANCE) {
            state.world.add(entity1, 'isSingle', true);
            state.world.add(entity2, 'isSingle', true);

            state.world.remove(entity1, 'partner');
            state.world.remove(entity2, 'partner');

            state.world.destroy(match);

            state.game.score--;

            for (const entity of [entity1, entity2]) {
                // sfx
                const sound = AUDIO_CAT_SAD[Math.floor(Math.random() * AUDIO_CAT_SAD.length)] as AudioAssetId;
                const volume = THREE.MathUtils.mapLinear(Math.random(), 0, 1, 0.2, 0.4);
                const detune = THREE.MathUtils.mapLinear(Math.random(), 0, 1, -200, 200);
                playPositionalAudio(state, assets, sound, entity.transform, volume, detune);

                // vfx
                spawnTears(state, entity.transform.position);
            }
        }
    }
};

const updateCamera = (state: GameState, camera: THREE.Camera, delta: number) => {
    const player = state.queries.player.first;
    if (!player) return;

    const playerTransform = player.transform;

    const t = 1 - Math.exp(-delta * 10);

    const cameraDistance = state.game.gameState === GAME_STATE_PLAYING ? 8 : 10;
    const cameraHeight = state.game.gameState === GAME_STATE_PLAYING ? 3 : 5;

    _cameraPositionTarget.set(playerTransform.position.x, cameraHeight, playerTransform.position.z + cameraDistance);

    camera.position.lerp(_cameraPositionTarget, t);
    _cameraLookAtTarget.lerp(playerTransform.position, t);

    camera.lookAt(_cameraLookAtTarget);
};

const playAudio = (state: GameState, assets: Assets, sound: AudioAssetId) => {
    const audio = new THREE.Audio(state.audioListener);
    const buffer = assets.audio[sound].buffer;

    audio.setBuffer(buffer);
    audio.setVolume(1);
    audio.play();

    return audio;
};

const playPositionalAudio = (
    state: GameState,
    assets: Assets,
    sound: AudioAssetId,
    object: THREE.Object3D,
    volume: number,
    detune = 0,
) => {
    const audio = new THREE.PositionalAudio(state.audioListener);
    const buffer = assets.audio[sound].buffer;

    audio.setBuffer(buffer);
    audio.setRefDistance(1);
    audio.setVolume(volume);
    audio.setDetune(detune);
    audio.play();

    audio.onEnded = () => {
        audio.removeFromParent();
    };

    object.add(audio);
};

const playLoopingAudio = (state: GameState, assets: Assets, sound: AudioAssetId) => {
    const audio = new THREE.Audio(state.audioListener);
    const buffer = assets.audio[sound].buffer;

    audio.setBuffer(buffer);
    audio.setLoop(true);
    audio.setVolume(0.5);
    audio.play();

    state.audioListener.add(audio);

    return audio;
};

const updatePlayerCatCollisions = (state: GameState, assets: Assets) => {
    for (const [a, b] of state.physicsImpacts) {
        if ((a.isCat || b.isCat) && (a.isPlayer || b.isPlayer)) {
            let player: With<EntityType, 'body'> | null = null;
            let cat: With<EntityType, 'body'> | null = null;

            if (a.isPlayer && b.isCat) {
                player = a;
                cat = b;
            } else if (b.isPlayer && a.isCat) {
                player = b;
                cat = a;
            }

            if (player && cat) {
                // make the cat dizzy
                state.world.add(cat, 'movementStatusEffect', { type: 'dizzy', countdown: 1 });

                const speed = p2.vec2.length(player.body.velocity);

                let shoveSounds: AudioAssetId[];

                const hardImpact = speed > 8;

                if (hardImpact) {
                    shoveSounds = AUDIO_CAT_SHOVE_HARD;
                } else {
                    shoveSounds = AUDIO_CAT_SHOVE;
                }

                const sound = shoveSounds[Math.floor(Math.random() * shoveSounds.length)] as AudioAssetId;

                const minVolume = hardImpact ? 0.2 : 0.3;
                const maxVolume = hardImpact ? 0.3 : 0.4;
                const volume = THREE.MathUtils.mapLinear(speed, 0, 10, minVolume, maxVolume);
                const detune = THREE.MathUtils.mapLinear(Math.random(), 0, 1, -200, 200);

                playPositionalAudio(state, assets, sound, cat.transform!, volume, detune);
            }
        }
    }
};

const updateLifetime = (state: GameState, delta: number) => {
    for (const entity of state.queries.lifetime) {
        if (entity.lifetime !== undefined) {
            entity.lifetime -= delta;

            if (entity.lifetime <= 0) {
                state.world.destroy(entity);
            }
        }
    }
};

const N_CONFETTI = 15;
const CONFETTI_COLORS = [0xff0000, 0x00ff00, 0x9999ff, 0xffff00, 0xff00ff, 0x00ffff];

const spawnConfetti = (state: GameState, position: THREE.Vector3) => {
    for (let i = 0; i < N_CONFETTI; i++) {
        const confettiDirection = _direction.set(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize();

        const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];

        Particles.add(
            state.particles,
            Particles.PARTICLE_TYPE_PHYSICAL,
            position.x,
            position.y,
            position.z,
            confettiDirection.x,
            confettiDirection.y,
            confettiDirection.z,
            color,
        );
    }
};

const BOOST_COLORS = [0xff0000, 0x00ff00, 0x9999ff, 0xffff00, 0xff00ff, 0x00ffff];

const spawnBoostParticles = (state: GameState, position: THREE.Vector3, boostChargeTime: number) => {
    const boostColor = BOOST_COLORS[Math.floor(Math.random() * BOOST_COLORS.length)];

    const particles = Math.floor(THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(boostChargeTime, 0, 1, 5, 25), 5, 25));

    for (let i = 0; i < particles; i++) {
        const angle = Math.random() * Math.PI * 2;
        const boostDirection = _direction.set(Math.cos(angle), 0, Math.sin(angle));

        Particles.add(
            state.particles,
            Particles.PARTICLE_TYPE_PHYSICAL,
            position.x,
            position.y,
            position.z,
            boostDirection.x,
            boostDirection.y,
            boostDirection.z,
            boostColor,
        );
    }
};

const spawnTears = (state: GameState, position: THREE.Vector3) => {
    for (let i = 0; i < 10; i++) {
        _direction.set(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize();
        _direction.normalize();
        _direction.multiplyScalar(0.2);

        const color = 0x0000ff;

        Particles.add(
            state.particles,
            Particles.PARTICLE_TYPE_PHYSICAL,
            position.x,
            position.y,
            position.z,
            _direction.x,
            _direction.y,
            _direction.z,
            color,
        );
    }
};

const spawnFireworkSpark = (state: GameState, position: THREE.Vector3, color: THREE.ColorRepresentation) => {
    for (let i = 0; i < 10; i++) {
        const direction = _direction.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();

        Particles.add(
            state.particles,
            Particles.PARTICLE_TYPE_DECAY,
            position.x,
            position.y,
            position.z,
            direction.x,
            direction.y,
            direction.z,
            color,
            0.5,
        );
    }
};

const updateTrails = (state: GameState) => {
    for (const entity of state.queries.trail) {
        const body = entity.body;

        if (body.type === p2.Body.STATIC) {
            continue;
        }

        const speed = p2.vec2.length(body.velocity);

        if (speed < 0.1) {
            continue;
        }

        const particles = THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(speed, 0, 10, 1, 5), 1, 5);
        const cooldown = THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(speed, 0, 10, 0.5, 0.1), 0.05, 0.5);

        const excitingSpeedThreshold = 12;
        const excitingParticles = speed > excitingSpeedThreshold;

        if (state.time > entity.trail.lastSpawnTime + cooldown) {
            entity.trail.lastSpawnTime = state.time;

            for (let i = 0; i < particles; i++) {
                let vx = -body.velocity[0] * 0.02 + (0.5 - Math.random()) * 0.1;
                let vz = -body.velocity[1] * 0.02 + (0.5 - Math.random()) * 0.1;
                let vy = 0.1;

                if (excitingParticles) {
                    vx *= 2;
                    vz *= 2;
                    vy += Math.random() * 1;
                }

                Particles.add(
                    state.particles,
                    Particles.PARTICLE_TYPE_PHYSICAL,
                    body.position[0],
                    0.3,
                    body.position[1],
                    vx,
                    vy,
                    vz,
                    0xffffff,
                );
            }

            if (excitingParticles) {
                for (let i = 0; i < 15; i++) {
                    const angle = (i / 15) * Math.PI * 2;
                    const radius = 0.5;

                    const offset = _offset.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);

                    _velocity.set(body.velocity[0], 0, body.velocity[1]).multiplyScalar(-1).multiplyScalar(0.1);

                    const angleToVelocity = Math.atan2(body.velocity[0], body.velocity[1]);
                    offset.applyAxisAngle(VECTOR_UP, angleToVelocity);

                    const position = _position.set(body.position[0], 0.3, body.position[1]).add(offset);

                    Particles.add(
                        state.particles,
                        Particles.PARTICLE_TYPE_DECAY,
                        position.x,
                        position.y,
                        position.z,
                        _velocity.x,
                        _velocity.y,
                        _velocity.z,
                        0xffffff,
                        0.3,
                    );
                }
            }
        }
    }
};

const updateParticles = (state: GameState, delta: number) => {
    Particles.update(state.particles, delta);
};

const update = (
    state: GameState,
    assets: Assets,
    gl: WebGPURenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    delta: number,
) => {
    state.time += delta;

    // game state system - timer
    updateGameTimer(state, assets, delta);

    // input systems
    updatePlayerInput(state);
    updateStatusEffects(state, delta);
    updateMinglingCatsInput(state);
    updateCharacterMovement(state, delta);

    // core systems
    updatePhysics(state, delta);
    updateTransformsFromPhysics(state);
    updateCatTransforms(state);
    updatePlayerCatCollisions(state, assets);
    updateMatchmaking(state, assets);
    updateLifetime(state, delta);

    // presentation systems
    updateCamera(state, camera, delta);
    updateTrails(state);
    updateParticles(state, delta);
    updateMatchTransforms(state);
    updateMeshTransforms(state);
    updateGameOverFx(state, assets);

    gl.render(scene, camera);
};

const GameUI = () => {
    const countdownRef = useRef<HTMLDivElement>(null);
    const scoreRef = useRef<HTMLDivElement>(null);

    const state = useGame();

    useEffect(() => {
        if (!state) return;

        const update = () => {
            if (!countdownRef.current || !scoreRef.current) return;

            if (state.game.gameState === GAME_STATE_PLAYING) {
                scoreRef.current.innerText = `${state.game.score.toString()}/${N_MEOWTCHES} Meoewtches!`;
                countdownRef.current.innerText = `${Math.ceil(state.game.timeRemaining)}s until the new year!`;
            } else if (state.game.gameState === GAME_STATE_MENU) {
                scoreRef.current.innerText = `Meowtchmake for new years kisses!`;
                countdownRef.current.innerText = `Make a match to start the game`;
            } else {
                scoreRef.current.innerText = `Happy new year! You made ${state.game.score} Meoewtches!`;
                countdownRef.current.innerText = `Press [R] to restart!`;
            }
        };

        const interval = setInterval(update, 1000 / 30);

        return () => clearInterval(interval);
    }, [state]);

    return (
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                fontFamily: 'monospace',
                lineHeight: '1.5',
                fontWeight: 600,
                color: '#fff',
                textShadow: '1px 1px 0px #333',
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    padding: '16px',
                    textAlign: 'left',
                    fontSize: '1.5rem',
                }}
            >
                <div ref={scoreRef}></div>

                <div ref={countdownRef}></div>

                <div
                    style={{
                        fontSize: '1rem',
                        paddingTop: '8px',
                    }}
                >
                    <div>move - WASD</div>
                    <div>boost - SPACE</div>
                </div>
            </div>
        </div>
    );
};

const Sky = () => {
    const material = useMemo(() => {
        const mat = new MeshBasicNodeMaterial();

        const uvCoordinates = uv();

        const gradient = mix(color('#EE6C45'), color('#1F214D'), smoothstep(0.3, 0.6, uvCoordinates.y));

        mat.colorNode = gradient;

        mat.side = THREE.BackSide;

        return mat;
    }, []);

    return (
        <mesh>
            <sphereGeometry args={[50, 32, 32]} />
            <primitive object={material} />
        </mesh>
    );
};

const Ground = () => {
    const groundMaterial = useMemo(() => {
        const colorNode = color('#86d6d8'); //color('#cceeff')

        const material = new MeshBasicNodeMaterial();
        material.colorNode = colorNode;

        return material;
    }, []);

    return (
        <>
            <mesh rotation-x={-Math.PI / 2} position-y={0}>
                <circleGeometry args={[25, 64]} />
                <primitive object={groundMaterial} />
            </mesh>
        </>
    );
};

const useGame = create<GameState>(() => null!);

const useKeyboardInput = (state: GameState) => {
    useEffect(() => {
        if (!state) return;

        const input = state.input;

        const keyboardState = {
            up: false,
            down: false,
            left: false,
            right: false,
            boost: false,
        };

        const updateInput = () => {
            input.direction[0] = 0;
            input.direction[1] = 0;

            if (keyboardState.up) input.direction[1] -= 1;
            if (keyboardState.down) input.direction[1] += 1;
            if (keyboardState.left) input.direction[0] -= 1;
            if (keyboardState.right) input.direction[0] += 1;
            input.boostDown = keyboardState.boost;
        };

        const keydown = (e: KeyboardEvent) => {
            if (e.key === 'a') keyboardState.left = true;
            if (e.key === 'd') keyboardState.right = true;
            if (e.key === 'w') keyboardState.up = true;
            if (e.key === 's') keyboardState.down = true;
            if (e.key === ' ') keyboardState.boost = true;

            updateInput();
        };

        const keyup = (e: KeyboardEvent) => {
            if (e.key === 'a') keyboardState.left = false;
            if (e.key === 'd') keyboardState.right = false;
            if (e.key === 'w') keyboardState.up = false;
            if (e.key === 's') keyboardState.down = false;
            if (e.key === ' ') keyboardState.boost = false;

            updateInput();
        };

        window.addEventListener('keydown', keydown);
        window.addEventListener('keyup', keyup);

        return () => {
            window.removeEventListener('keydown', keydown);
            window.removeEventListener('keyup', keyup);
        };
    }, [state]);
};

const useBackgroundMusic = (state: GameState, assets: Assets) => {
    useEffect(() => {
        if (!state) return;

        const audio = playLoopingAudio(state, assets, 'terrible_cat_theme');

        return () => {
            audio.stop();
        };
    }, [state, assets]);
};

const Game = () => {
    const assets = suspend(loadAssets, ['_assets']);

    const state = useGame();

    useEffect(() => {
        const state = init(assets);

        useGame.setState(state);

        return () => {
            dispose(state);
            useGame.setState(null!);
        };
    }, []);

    useFrame(({ gl, scene, camera }, delta) => {
        if (!state) return;

        const clampedDelta = Math.min(delta, 0.1);

        update(state, assets, gl as unknown as WebGPURenderer, scene, camera, clampedDelta);
    }, 1);

    useKeyboardInput(state);

    useBackgroundMusic(state, assets);

    if (!state) return null;

    return (
        <>
            <Ground />
            <Sky />

            {Object.values(state.group.children).map((child) => (
                <primitive object={child} key={child.uuid} />
            ))}

            <Environment files={sunsetEnvironment} />
            <ambientLight intensity={0.5} />
            <pointLight position={[5, 5, 5]} intensity={1} />
        </>
    );
};

export function Sketch() {
    const [gameId, setGameId] = useState(0);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'r') {
                setGameId((prev) => prev + 1);
            }
        };

        window.addEventListener('keydown', onKeyDown);

        return () => {
            window.removeEventListener('keydown', onKeyDown);
        };
    });

    return (
        <>
            <WebGPUCanvas camera={{ position: [2, 1, 2] }}>
                <Game key={gameId} />

                <PerspectiveCamera makeDefault position={[0, 10, 30]} fov={70} />
            </WebGPUCanvas>

            <GameUI />
        </>
    );
}
