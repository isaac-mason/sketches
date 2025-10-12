import { WebGPUCanvas } from '@sketches/common/components/webgpu-canvas';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import {
	MIN_BLOCK_TEXTURE_SIZE,
	raycast,
	Voxels,
} from '@sketches/simple-voxels-lib';
import { createMulberry32Generator, createSimplex2D } from 'maaths';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { Line2 } from 'three/examples/jsm/lines/webgpu/Line2.js';
import * as THREE from 'three/webgpu';
import { computePath } from './compute-path';

const ORIGIN = new THREE.Vector3(0, 0, 0);

const _raycastHitPosition = new THREE.Vector3();
const _raycastHitNormal = new THREE.Vector3();

const GameWorld = () => {
	const scene = useThree((state) => state.scene);

	const groupRef = useRef<THREE.Group>(null!);
	const [voxels, setVoxels] = useState<Voxels | null>(null);

	useEffect(() => {
		// init voxel world
		const voxels = new Voxels(groupRef.current, MIN_BLOCK_TEXTURE_SIZE);

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
		const stone = voxels.registerType({
			cube: {
				default: {
					color: '#777',
				},
			},
		});

		voxels.updateAtlas();

		const levelHalfSize = 100;

		const noise = createSimplex2D(2);
		const generator = createMulberry32Generator(42);

		for (let x = -levelHalfSize; x < levelHalfSize; x++) {
			for (let z = -levelHalfSize; z < levelHalfSize; z++) {
				let y = Math.floor(noise(x / 200, z / 200) * 30);
				y += Math.floor(noise(x / 50, z / 50) * 5);

				// ground
				for (let y2 = y; y2 < y + 2; y2++) {
					voxels.setBlock(x, y2, z, grass.index);
				}
				for (let y2 = y - 2; y2 < y; y2++) {
					voxels.setBlock(x, y2, z, dirt.index);
				}

				// random stone formations
				if (generator() < 0.01) {
					const size = Math.floor(generator() * 10) + 1;
					for (let x2 = x; x2 < x + size; x2++) {
						for (let y2 = y; y2 < y + size; y2++) {
							for (let z2 = z; z2 < z + size; z2++) {
								voxels.setBlock(x2, y2, z2, stone.index);
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
		};
	}, []);

	useFrame(() => {
		if (!voxels) return;

		// build chunks
		voxels.update(5, ORIGIN);
	});

	const onPointerDown = useCallback(
		(e: ThreeEvent<PointerEvent>) => {
			if (!voxels) return;

			const hit = raycast(
				voxels.world,
				e.ray.origin,
				e.ray.direction,
				100,
				_raycastHitPosition,
				_raycastHitNormal,
			);

			if (!hit) return;

			
			if (e.button === 0) {
				const block = _raycastHitPosition.floor();
				console.log('break', block.x, block.y, block.z);

				voxels.setBlock(block.x, block.y, block.z, 0);
			} else {
				const block = _raycastHitPosition.add(_raycastHitNormal).floor();
				console.log('place', block.x, block.y, block.z);

				voxels.setBlock(block.x, block.y, block.z, 1);
			}
		},
		[voxels],
	);

	const [version, setVersion] = useState(0);

	useEffect(() => {
		const interval = setInterval(() => {
			setVersion((v) => v + 1);
		}, 1000);

		return () => {
			clearInterval(interval);
		};
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: rerun on version change
	useEffect(() => {
		if (!voxels) return;

		const findGroundY = (x: number, z: number) => {
			let y = 200;
			const endY = -100;

			while (y > endY) {
				const block = voxels.world.getBlock(x, y, z);

				if (block !== 0) {
					return y;
				}

				y--;
			}

			return y;
		};

		const start = new THREE.Vector3(-14, 0, -20);
		start.y = findGroundY(start.x, start.z) + 1;
		const end = new THREE.Vector3(50, 0, 50);
		end.y = findGroundY(end.x, end.z) + 1;

		console.time('pathfinding');
		const result = computePath(
			voxels.world,
			start,
			end,
			true,
			'greedy',
			undefined,
			true,
		);
		console.timeEnd('pathfinding');

		console.log("result", result);

		if (!result.success) {
			return;
		}

		const path: THREE.Vector3[] = [];

		for (const node of result.path) {
			const next = new THREE.Vector3(
				node.position.x,
				node.position.y,
				node.position.z,
			);
			next.addScalar(0.5);
			path.push(next);
		}

		const explored: THREE.Vector3[] = [];

		for (const node of result.intermediates?.explored.values() ?? []) {
			const next = new THREE.Vector3(
				node.position.x,
				node.position.y,
				node.position.z,
			);
			next.addScalar(0.5);
			explored.push(next);
		}

		const lineGeometry = new LineGeometry();
		lineGeometry.setPositions(path.flatMap((p) => [p.x, p.y, p.z]));
		const lineMaterial = new THREE.Line2NodeMaterial({
			color: new THREE.Color('yellow'),
			linewidth: 5,
		});
		const line = new Line2(lineGeometry, lineMaterial);

		line.computeLineDistances();

		scene.add(line);

		const pathGeometry = new THREE.SphereGeometry(0.3);
		const pathMaterial = new THREE.MeshBasicMaterial({ color: 'yellow' });
		const pathMeshes: THREE.Mesh[] = [];
		for (const p of path) {
			const sphere = new THREE.Mesh(pathGeometry, pathMaterial);
			sphere.position.copy(p);
			scene.add(sphere);
			pathMeshes.push(sphere);
		}

		const exploredGeometry = new THREE.SphereGeometry(0.2);
		const exploredMaterial = new THREE.MeshBasicMaterial({ color: 'blue' });
		const exploredMeshes: THREE.Mesh[] = [];
		for (const p of explored) {
			const sphere = new THREE.Mesh(exploredGeometry, exploredMaterial);
			sphere.position.copy(p);
			scene.add(sphere);
			exploredMeshes.push(sphere);
		}

		return () => {
			scene.remove(line);

			lineGeometry.dispose();
			lineMaterial.dispose();

			for (const mesh of pathMeshes) {
				scene.remove(mesh);
			}

			pathGeometry.dispose();
			pathMaterial.dispose();

			for (const mesh of exploredMeshes) {
				scene.remove(mesh);
			}

			exploredGeometry.dispose();
			exploredMaterial.dispose();
		};
	}, [voxels, scene, version]);

	return <group ref={groupRef} onPointerDown={onPointerDown} />;
};

export function Sketch() {
	return (
		<WebGPUCanvas gl={{ antialias: true }}>
			<GameWorld />

			<ambientLight intensity={1.5} />
			<directionalLight position={[10, 10, 10]} intensity={1} />

			<OrbitControls makeDefault />
			<PerspectiveCamera makeDefault position={[-30, 30, 30]} />
		</WebGPUCanvas>
	);
}
