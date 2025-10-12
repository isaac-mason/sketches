import { FixedTimeStep, useMutableCallback, usePageVisible, WebGPUCanvas } from '@sketches/common';
import bunny from './bunny.glb?url';
import { Instance, Instances, PerspectiveCamera, useGLTF } from '@react-three/drei';
import { type ThreeElements, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import {
    blendColor,
    bool,
    color,
    floor,
    mrt,
    output,
    pass,
    reflector,
    select,
    texture,
    uniform,
    uv,
    vec2,
    vec4,
} from 'three/tsl';
import * as THREE from 'three/webgpu';
import { PostProcessing, type WebGPURenderer } from 'three/webgpu';

const gameOfLifeStep = (current: Uint8Array, next: Uint8Array, width: number, height: number) => {
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let neighbors = 0;

            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    if (current[(y + dy) * width + (x + dx)]) neighbors++;
                }
            }

            const i = y * width + x;

            if (current[i]) {
                if (neighbors === 2 || neighbors === 3) next[i] = 1;
            } else {
                if (neighbors === 3) next[i] = 1;
            }
        }
    }
};

type GameOfLifeProps = {
    gameSize: [number, number];
    planeSize: [number, number];
} & ThreeElements['mesh'];

const GameOfLife = ({
    gameSize: [gameWidth, gameHeight],
    planeSize: [planeWidth, planeHeight],
    ...meshProps
}: GameOfLifeProps) => {
    const meshRef = useRef<THREE.Mesh>(null!);
    const drawing = useRef(false);
    const dirty = useRef(false);

    const state = useMemo(() => new Uint8Array(gameWidth * gameHeight), [gameWidth, gameHeight]);
    const nextState = useMemo(() => new Uint8Array(gameWidth * gameHeight), [gameWidth, gameHeight]);
    const dataTexture = useMemo(() => {
        const data = new Uint8Array(gameWidth * gameHeight * 4);
        const texture = new THREE.DataTexture(data, gameWidth, gameHeight, THREE.RGBAFormat);
        return { data, texture };
    }, [gameWidth, gameHeight]);

    const pageVisibile = usePageVisible();

    const updateTexture = () => {
        for (let i = 0; i < gameWidth * gameHeight; i++) {
            dataTexture.data[i * 4] = state[i] * 255;
            dataTexture.data[i * 4 + 1] = 0;
            dataTexture.data[i * 4 + 2] = 0;
            dataTexture.data[i * 4 + 3] = 255;

            dataTexture.texture.needsUpdate = true;
        }
    };

    const step = useMutableCallback(() => {
        gameOfLifeStep(state, nextState, gameWidth, gameHeight);
        state.set(nextState);
        nextState.fill(0);

        dirty.current = true;
    });

    useEffect(() => {
        state.fill(0);
        nextState.fill(0);

        for (let i = 0; i < gameWidth * gameHeight; i++) {
            state[i] = Math.random() > 0.4 ? 1 : 0;
        }

        step.current();
    }, [step, gameWidth, gameHeight, state, nextState]);

    const fixedTimeStep = useMemo(() => {
        return new FixedTimeStep({ timeStep: 1 / 5, maxSubSteps: 5, step: () => step.current() });
    }, [step]);

    useFrame((_, delta) => {
        if (!pageVisibile) return;

        fixedTimeStep.update(delta);

        if (dirty.current) {
            dirty.current = false;
            updateTexture();
        }
    });

    const draw = (world: THREE.Vector3) => {
        const meshPosition = meshRef.current.position;
        const meshRotation = meshRef.current.rotation;

        const local = world.clone().sub(meshPosition).applyEuler(meshRotation);

        const cellX = Math.floor(((local.x + planeWidth / 2) / planeWidth) * gameWidth);
        const cellY = Math.floor(((local.y + planeHeight / 2) / planeHeight) * gameHeight);

        if (cellX < 0 || cellX >= gameWidth || cellY < 0 || cellY >= gameHeight) return;

        const radius = 1;
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const x = cellX + dx;
                const y = cellY + dy;

                if (x < 0 || x >= gameWidth || y < 0 || y >= gameHeight) continue;

                const index = y * gameWidth + x;

                state[index] = 1;
            }
        }

        dirty.current = true;
    };

    const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
        drawing.current = true;

        draw(event.point);
    };

    const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
        if (!drawing.current) return;

        draw(event.point);
    };

    const onPointerUp = () => {
        drawing.current = false;
    };

    const { uGameWidth, uGameHeight } = useMemo(() => {
        return {
            uGameWidth: uniform(0, 'float'),
            uGameHeight: uniform(0, 'float'),
        };
    }, []);

    useEffect(() => {
        uGameWidth.value = gameWidth;
        uGameHeight.value = gameHeight;
    }, [gameWidth, gameHeight, uGameWidth, uGameHeight]);

    const material = useMemo(() => {
        const meshPhongMaterial = new THREE.MeshBasicNodeMaterial();

        const cellPosition = vec2(floor(uv().x.mul(uGameWidth).add(0.5)), floor(uv().y.mul(uGameHeight).add(0.5)));
        const samplePosition = vec2(cellPosition.div(vec2(uGameWidth, uGameHeight)));
        const textureSample = vec4(texture(dataTexture.texture, samplePosition));

        const isAlive = bool(textureSample.r.greaterThan(0.5)).toVar();

        meshPhongMaterial.colorNode = vec4(select(isAlive, vec4(1.0, 1.0, 1.0, 1.0), vec4(color('#333'), 0.5)));

        return meshPhongMaterial;
    }, [dataTexture.texture, uGameWidth, uGameHeight]);

    return (
        <mesh {...meshProps} ref={meshRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
            <planeGeometry args={[planeWidth, planeHeight]} />
            <primitive object={material} />
        </mesh>
    );
};

const Bunnies = (props: React.PropsWithChildren) => {
    const gltf = useGLTF(bunny);

    const material = useMemo(() => {
        return new THREE.MeshBasicMaterial();
    }, []);

    return (
        <Instances geometry={(gltf.nodes.mesh as THREE.Mesh).geometry} material={material}>
            {props.children}
        </Instances>
    );
};

type BunnyProps = ThreeElements['group'] & { color: THREE.ColorRepresentation };

const Bunny = ({ color, ...props }: BunnyProps) => {
    return (
        <group {...props}>
            <Instance color={color} />
        </group>
    );
};

const nBunnies = 80;
const bunnyMinDistance = 5;
const bunnyPositionRange = { min: new THREE.Vector2(-60, -20), max: new THREE.Vector2(60, 70) };
const bunnyColor = new THREE.Color(1.5, 1.5, 1.5);
const bunnies: { position: THREE.Vector3; color: THREE.ColorRepresentation; rotation: number }[] = [];

const rand = (low: number, high: number) => Math.random() * (high - low) + low;

for (let i = 0; i < nBunnies; i++) {
    let position: THREE.Vector3;

    do {
        position = new THREE.Vector3(
            rand(bunnyPositionRange.min.x, bunnyPositionRange.max.x),
            0.9,
            rand(bunnyPositionRange.min.y, bunnyPositionRange.max.y),
        );
    } while (bunnies.some((bunny) => bunny.position.distanceTo(position) < bunnyMinDistance));

    const rotation = Math.random() * Math.PI * 2;

    bunnies.push({ position, color: bunnyColor, rotation });
}

const CameraRig = () => {
    useFrame((state, delta) => {
        state.camera.position.lerp(
            new THREE.Vector3(10 + (state.pointer.x * state.viewport.width) / 8, (10 + state.pointer.y) / 3, 80),
            1 - 0.1 ** delta,
        );
        state.camera.lookAt(10, 12, 0);
    });

    return null;
};

const ReflectingFloor = () => {
    const { floorMaterial, reflection } = useMemo(() => {
        const reflection = reflector({ resolutionScale: 0.5 });
        reflection.target.rotateX(-Math.PI / 2);

        const floorMaterial = new THREE.MeshStandardNodeMaterial();
        floorMaterial.colorNode = color('#999').add(reflection);
        floorMaterial.roughness = 1;
        floorMaterial.metalness = 0.8;

        return { reflection, floorMaterial };
    }, []);

    return (
        <>
            <primitive object={reflection.target} />

            <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 25]}>
                <planeGeometry args={[200, 100]} />
                <primitive object={floorMaterial} />
            </mesh>
        </>
    );
};

const RenderPipeline = () => {
    const { gl, scene, camera } = useThree();

    const [postProcessing, setPostProcessing] = useState<PostProcessing | null>(null);

    useEffect(() => {
        const scenePass = pass(scene, camera, {
            magFilter: THREE.NearestFilter,
            minFilter: THREE.NearestFilter,
        });

        scenePass.setMRT(mrt({ output }));

        const scenePassColor = scenePass.getTextureNode('output');

        const strength = 0.2;
        const radius = 0.02;
        const threshold = 0;
        const bloomPass = bloom(scenePassColor, strength, radius, threshold);

        const outputNode = blendColor(scenePassColor, bloomPass);

        const postProcessing = new PostProcessing(gl as unknown as WebGPURenderer);
        postProcessing.outputNode = outputNode;

        setPostProcessing(postProcessing);

        return () => {
            setPostProcessing(null);
        };
    }, [gl, scene, camera]);

    useFrame(() => {
        if (!postProcessing) return;

        gl.clear();
        postProcessing.render();
    }, 1);

    return null;
};

export function Sketch() {
    return (
        <WebGPUCanvas shadows dpr={[1, 1.5]}>
            <Bunnies>
                {bunnies.map((bunny, i) => (
                    <Bunny key={String(i)} position={bunny.position} color={bunny.color} rotation-y={bunny.rotation} />
                ))}
            </Bunnies>

            <ReflectingFloor />

            <GameOfLife gameSize={[200, 150]} planeSize={[225, 150]} position={[0, 74.5, -25]} />

            <hemisphereLight intensity={1} groundColor="black" />

            <color attach="background" args={['black']} />

            <RenderPipeline />

            {/* camera */}
            <PerspectiveCamera makeDefault position={[20, 10, 80]} />
            <CameraRig />
        </WebGPUCanvas>
    );
}
