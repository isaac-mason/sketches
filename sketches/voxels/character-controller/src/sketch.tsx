import { Crosshair } from '@/common/components/crosshair';
import { WebGPUCanvas } from '@/common/components/webgpu-canvas';
import {
	KeyboardControls,
	PerspectiveCamera,
	PointerLockControls,
	useKeyboardControls,
} from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import {
	MIN_BLOCK_TEXTURE_SIZE,
	raycast,
	Voxels,
} from '@sketches/simple-voxels-lib';
import { Generator, noise } from 'maath/random';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three/webgpu';

type CharacterInput = {
	forward: boolean;
	backward: boolean;
	left: boolean;
	right: boolean;
	jump: boolean;
	sprint: boolean;
};

const controls = [
	{ name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
	{ name: 'backward', keys: ['ArrowDown', 's', 'S'] },
	{ name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
	{ name: 'right', keys: ['ArrowRight', 'd', 'D'] },
	{ name: 'jump', keys: ['Space'] },
	{ name: 'sprint', keys: ['ShiftLeft'] },
];

const initCharacter = (height: number, width: number) => {
	const position = new THREE.Vector3(0, 0, 0);
	const velocity = new THREE.Vector3(0, 0, 0);

	const horizontalSensorOffset = width / 2 - 0.05;

	return {
		position,
		velocity,
		jumping: false,
		jumpTime: 0,
		height,
		width,
		horizontalSensorOffset,
	};
};

type Character = ReturnType<typeof initCharacter>;

const _verticalRayOrigin = new THREE.Vector3();
const _verticalRayOffset = new THREE.Vector3();

const _direction = new THREE.Vector3();
const _cameraWorldDirection = new THREE.Vector3();

const _rayHitPosition = new THREE.Vector3();
const _rayHitNormal = new THREE.Vector3();

const VECTOR_DOWN = new THREE.Vector3(0, -1, 0);
const VECTOR_UP = new THREE.Vector3(0, 1, 0);

const BOX_CORNERS = [
	[1, 1],
	[-1, 1],
	[1, -1],
	[-1, -1],
];

const characterIsGrounded = (character: Character, voxels: Voxels) => {
	for (const corner of BOX_CORNERS) {
		const offsetX = corner[0] * character.horizontalSensorOffset;
		const offsetZ = corner[1] * character.horizontalSensorOffset;

		const origin = _verticalRayOrigin
			.copy(character.position)
			.add(_verticalRayOffset.set(offsetX, 0, offsetZ));
		const hit = raycast(
			voxels.world,
			origin,
			VECTOR_DOWN,
			character.height,
			_rayHitPosition,
			_rayHitNormal,
		);

		if (hit) {
			const distance = character.position.y - _rayHitPosition.y;

			if (distance < 0.001) {
				return true;
			}
		}
	}

	return false;
};

const characterHitCeiling = (character: Character, voxels: Voxels) => {
	for (const corner of BOX_CORNERS) {
		const offsetX = corner[0] * character.horizontalSensorOffset;
		const offsetZ = corner[1] * character.horizontalSensorOffset;
		const origin = _verticalRayOrigin
			.copy(character.position)
			.add(_verticalRayOffset.set(offsetX, character.height, offsetZ));
		const hit = raycast(
			voxels.world,
			origin,
			VECTOR_UP,
			character.height,
			_rayHitPosition,
			_rayHitNormal,
		);

		if (hit) {
			const distance = _rayHitPosition.y - character.position.y;

			if (distance < 0.001) {
				return true;
			}
		}
	}

	return false;
};

const _intersectsVoxelPosition = new THREE.Vector3();
const intersectsVoxel = (voxels: Voxels, position: THREE.Vector3Like) => {
	const blockPosition = _intersectsVoxelPosition.copy(position).floor();
	return (
		voxels.world.getBlock(blockPosition.x, blockPosition.y, blockPosition.z) !==
		0
	);
};

const HORIZONTAL_DIMENSIONS = ['x', 'z'] as const;

const _horizontalCheckOne = new THREE.Vector3();
const _horizontalCheckTwo = new THREE.Vector3();

const checkCollision = (
	voxels: Voxels,
	x: number,
	y: number,
	z: number,
	offset: number,
	dim: 'x' | 'z',
) => {
	return (
		intersectsVoxel(
			voxels,
			_horizontalCheckOne.set(
				dim === 'x' ? x + offset : x - 0.3,
				y,
				dim === 'x' ? z - 0.3 : z + offset,
			),
		) ||
		intersectsVoxel(
			voxels,
			_horizontalCheckTwo.set(
				dim === 'x' ? x + offset : x + 0.3,
				y,
				dim === 'x' ? z + 0.3 : z + offset,
			),
		)
	);
};

const updateCharacter = (
	character: Character,
	input: CharacterInput,
	cameraDirection: THREE.Vector3,
	voxels: Voxels,
	dt: number,
	time: number,
) => {
	const grounded = characterIsGrounded(character, voxels);

	if (input.jump && time > character.jumpTime + 0.1 && grounded) {
		character.velocity.y = 10;
		character.jumping = true;
		character.jumpTime = time;
	} else if (!input.jump) {
		character.jumping = false;
	}

	character.velocity.y -= dt * 20;

	const direction = _direction
		.set(
			Number(input.left) - Number(input.right),
			0,
			Number(input.forward) - Number(input.backward),
		)
		.normalize();

	const yaw = Math.atan2(cameraDirection.x, cameraDirection.z);
	direction.applyAxisAngle(VECTOR_UP, yaw);

	character.velocity.set(direction.x, character.velocity.y, direction.z);

	const speed = 10 + (input.sprint ? 10 : 0);
	const nextX = character.position.x + character.velocity.x * speed * dt;
	const nextZ = character.position.z + character.velocity.z * speed * dt;

	for (const dim of HORIZONTAL_DIMENSIONS) {
		const desired = dim === 'x' ? nextX : nextZ;
		const offset = (character.width / 2) * Math.sign(character.velocity[dim]);
		let collision = false;

		for (let y = 0; y < character.height; y += 0.1) {
			const yOffset =
				y === 0 && grounded ? 0.1 : y === character.height - 0.1 ? -0.1 : 0;
			if (
				checkCollision(
					voxels,
					nextX,
					character.position.y + y + yOffset,
					nextZ,
					offset,
					dim,
				)
			) {
				collision = true;
				break;
			}
		}

		if (!collision) {
			character.position[dim] = desired;
		} else {
			character.velocity[dim] = 0;
		}
	}

	const nextY = character.velocity.y * dt + character.position.y;
	if (character.velocity.y > 0 && characterHitCeiling(character, voxels)) {
		character.velocity.y = 0;
	} else if (character.velocity.y < 0 && grounded) {
		character.velocity.y = 0;
		character.position.y = Math.ceil(character.position.y);
	} else {
		character.position.y = nextY;
	}
};

const GameWorld = () => {
	const scene = useThree((state) => state.scene);
	const camera = useThree((s) => s.camera);

	const [, getControls] = useKeyboardControls();

	const [voxels, setVoxels] = useState<Voxels | null>(null);
	const [character, setCharacter] = useState<Character | null>(null);
	const time = useRef(0);

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

		// init character
		const characterHeight = 3;
		const characterWidth = 0.8;
		const character = initCharacter(characterHeight, characterWidth);
		character.position.set(0, 20, 0);

		setCharacter(character);

		return () => {
			voxels.dispose();

			setCharacter(null);
			setVoxels(null);
		};
	}, [scene]);

	useEffect(() => {
		if (!voxels) return;

		const onPointerDown = (event: MouseEvent) => {
			const origin = camera.position;
			const direction = camera.getWorldDirection(_cameraWorldDirection);

			const hit = raycast(
				voxels.world,
				origin,
				direction,
				10,
				_rayHitPosition,
				_rayHitNormal,
			);

			if (!hit) return;

			if (event.button === 0) {
				const block = _rayHitPosition.floor();

				voxels.setBlock(block.x, block.y, block.z, 0);
			} else {
				const block = _rayHitPosition.add(_rayHitNormal).floor();

				voxels.setBlock(block.x, block.y, block.z, 1);
			}
		};

		window.addEventListener('pointerdown', onPointerDown);

		return () => {
			window.removeEventListener('pointerdown', onPointerDown);
		};
	}, [camera, voxels]);

	useFrame(({ camera }, dt) => {
		if (!character || !voxels) return;

		time.current += dt;

		// build chunks
		voxels.update(3, character.position);

		// update character
		const cameraDirection = camera.getWorldDirection(_cameraWorldDirection);
		const controls = getControls() as CharacterInput;
		updateCharacter(
			character,
			controls,
			cameraDirection,
			voxels,
			dt,
			time.current,
		);

		// update camera
		camera.position.copy(character.position);
		camera.position.y += character.height - character.height / 4;
	});

	return null;
};

export function Sketch() {
	return (
		<>
			<WebGPUCanvas gl={{ antialias: true }}>
				<PointerLockControls makeDefault />
				<KeyboardControls map={controls}>
					<GameWorld />
				</KeyboardControls>

				<ambientLight intensity={1.5} />
				<directionalLight position={[50, 50, 100]} intensity={1} />

				<PerspectiveCamera makeDefault position={[0, 0, 10]} />
			</WebGPUCanvas>
			<Crosshair />
		</>
	);
}
