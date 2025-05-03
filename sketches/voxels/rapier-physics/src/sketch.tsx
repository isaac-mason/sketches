import { WebGPUCanvas } from '@/common/components/webgpu-canvas';
import Rapier from '@dimforge/rapier3d-compat';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import {
	Physics,
	type RapierRigidBody,
	RigidBody,
	useRapier,
} from '@react-three/rapier';
import { MIN_BLOCK_TEXTURE_SIZE, Voxels } from '@sketches/simple-voxels-lib';
import { useControls } from 'leva';
import { Generator, noise } from 'maath/random';
import {
	createRef,
	type ReactElement,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import * as THREE from 'three';

const ACTOR = new THREE.Vector3(0, 0, 0);

const GameWorld = () => {
	const scene = useThree((state) => state.scene);

	const [voxels, setVoxels] = useState<Voxels | null>(null);

	const { world } = useRapier();

	const chunkRigidBodies = useMemo(() => {
		return new Map<string, Rapier.RigidBody>();
	}, []);

	useEffect(() => {
		// init voxel world
		const voxels = new Voxels(scene, MIN_BLOCK_TEXTURE_SIZE);

		const grass = voxels.registerType({
			cube: {
				default: {
					color: 'green',
				},
			},
		});
		const dirt = voxels.registerType({
			cube: {
				default: {
					color: '#542c1c',
				},
			},
		});
		const wood = voxels.registerType({
			cube: {
				default: {
					color: '#a64d1e',
				},
			},
		});
		const leaves = voxels.registerType({
			cube: {
				default: {
					color: '#195913',
				},
			},
		});
		const stone = voxels.registerType({
			cube: {
				default: {
					color: '#666',
				},
			},
		});

		voxels.updateAtlas();

		const levelHalfSize = 100;
		const dirtLevel = -20;
		const levelBottom = -30;

		noise.seed(2);
		const generator = new Generator(42);

		for (let x = -levelHalfSize; x < levelHalfSize; x++) {
			for (let z = -levelHalfSize; z < levelHalfSize; z++) {
				let y = Math.floor(noise.simplex2(x / 200, z / 200) * 10);
				y += Math.floor(noise.simplex2(x / 150, z / 150) * 5);

				// ground
				for (let currentY = y; currentY >= levelBottom; currentY--) {
					if (currentY === y || currentY === y - 1) {
						voxels.setBlock(x, currentY, z, grass.index);
					} else if (currentY > dirtLevel) {
						voxels.setBlock(x, currentY, z, dirt.index);
					} else {
						voxels.setBlock(x, currentY, z, stone.index);
					}
				}

				// random trees
				if (generator.value() < 0.002) {
					const treeHeight = Math.floor(generator.value() * 5) + 5;
					for (let y2 = y; y2 < y + treeHeight; y2++) {
						voxels.setBlock(x, y2, z, wood.index);
					}
					for (let y2 = y + treeHeight; y2 < y + treeHeight + 3; y2++) {
						for (let x2 = -1; x2 <= 1; x2++) {
							for (let z2 = -1; z2 <= 1; z2++) {
								voxels.setBlock(x + x2, y2, z + z2, leaves.index);
							}
						}
					}
				}
			}
		}

		setVoxels(voxels);

		return () => {
			voxels.dispose();

			setVoxels(null);

            for (const chunkRigidBody of chunkRigidBodies.values()) {
                world.removeRigidBody(chunkRigidBody);
            }
		};
	}, [chunkRigidBodies, scene, world]);

	useFrame(() => {
		if (!voxels) return;

		// build chunks
		const updatedChunks = voxels.update(3, ACTOR);

		// update chunk rigid bodies
		for (const chunkId of updatedChunks) {
			const chunk = voxels.world.chunks.get(chunkId);
			if (!chunk) continue;

			if (chunkRigidBodies.has(chunkId)) {
				const chunkRigidBody = chunkRigidBodies.get(chunkId)!;
				world.removeRigidBody(chunkRigidBody);
				chunkRigidBodies.delete(chunkId);
			}

			const chunkMesh = voxels.chunkMeshes.get(chunkId);
			if (!chunkMesh) continue;

			const colliderDesc = Rapier.ColliderDesc.trimesh(
				chunkMesh.geometry.attributes.position.array as Float32Array,
				chunkMesh.geometry.index!.array as Uint32Array,
			);

			const chunkRigidBody = world.createRigidBody(
				Rapier.RigidBodyDesc.fixed(),
			);
			chunkRigidBody.setTranslation(chunk.worldPositionOffset, true);
			world.createCollider(colliderDesc, chunkRigidBody);

			chunkRigidBodies.set(chunkId, chunkRigidBody);
		}
	});

	return null;
};

const Snow = () => {
	const n = 500;
	const refs = useMemo(
		() => Array.from({ length: n }, () => createRef<RapierRigidBody>()),
		[],
	);

	const bodies: ReactElement[] = [];

	for (let i = 0; i < n; i++) {
		const ref = refs[i];
		bodies.push(
			<RigidBody key={i} ref={ref} type="dynamic" position={[0, -1000 - i, 0]}>
				<mesh>
					<meshStandardMaterial color="white" />
					<boxGeometry args={[1, 1, 1]} />
				</mesh>
			</RigidBody>,
		);
	}

	const roundRobin = useRef(0);

	useEffect(() => {
		const interval = setInterval(() => {
			const body = refs[roundRobin.current].current;
			if (!body) return;

			const translation = {
				x: (Math.random() - 0.5) * 150,
				y: 50,
				z: (Math.random() - 0.5) * 150,
			};

			const linvel = { x: 0, y: 0, z: 0 };

			body.setTranslation(translation, true);
			body.setLinvel(linvel, true);

			roundRobin.current = (roundRobin.current + 1) % n;
		}, 1000 / 10);

		return () => clearInterval(interval);
	}, [refs]);

	return bodies;
};

const _mouse = new THREE.Vector2();

const BoxCannonTool = () => {
	const [box, setBox] = useState<
		{
			position: THREE.Vector3Tuple;
			rotation: THREE.Vector3Tuple;
			linvel: THREE.Vector3Tuple;
		}[]
	>([]);

	const camera = useThree((s) => s.camera);
	const scene = useThree((s) => s.scene);
	const gl = useThree((s) => s.gl);
	const raycaster = useThree((s) => s.raycaster);

	useEffect(() => {
		const onPointerDown = (event: MouseEvent) => {
			event.stopPropagation();

			raycaster.ray.origin.copy(camera.position);

			_mouse.set(
				(event.clientX / gl.domElement.clientWidth) * 2 - 1,
				-(event.clientY / gl.domElement.clientHeight) * 2 + 1,
			);
			raycaster.setFromCamera(_mouse, camera);
			const intersects = raycaster.intersectObjects(scene.children, true);

			if (intersects.length > 0) {
				const intersection = intersects[0];

				const position = camera.position.toArray();
				const rotation = camera.rotation.toArray() as THREE.Vector3Tuple;
				const linvel = intersection.point
					.sub(camera.position)
					.normalize()
					.multiplyScalar(50)
					.toArray();

				setBox([...box, { position, rotation, linvel }]);
			}
		};

		window.addEventListener('pointerdown', onPointerDown);

		return () => {
			window.removeEventListener('pointerdown', onPointerDown);
		};
	});

	return (
		<group>
			{box.map((box, i) => (
				<RigidBody
					key={String(i)}
					type="dynamic"
					position={box.position}
					rotation={box.rotation}
					linearVelocity={box.linvel}
				>
					<mesh>
						<meshStandardMaterial color="orange" />
						<boxGeometry args={[1, 1, 1]} />
					</mesh>
				</RigidBody>
			))}
		</group>
	);
};

export function Sketch() {
	const { physicsDebug } = useControls({
		physicsDebug: false,
	});

	return (
		<WebGPUCanvas gl={{ antialias: true }}>
			<Physics debug={physicsDebug}>
				<GameWorld />

				<BoxCannonTool />
				<Snow />
			</Physics>

			<ambientLight intensity={1.5} />
			<directionalLight position={[10, 10, 10]} intensity={1} />

			<OrbitControls makeDefault />
			<PerspectiveCamera makeDefault position={[10, 10, 10]} />
		</WebGPUCanvas>
	);
}
