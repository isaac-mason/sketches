import { OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { type ThreeElements, useFrame, useThree } from '@react-three/fiber';
import { World } from 'arancini';
import { useControls as useLevaControls } from 'leva';
import {
	type CSSProperties,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import {
	type BufferGeometry,
	Color,
	CylinderGeometry,
	type Group,
	type Material,
	MathUtils,
	Mesh,
	MeshPhongMaterial,
	MeshStandardMaterial,
	type Object3D,
	type PointLight,
	Quaternion,
	Vector2,
	Vector3,
	type Vector3Tuple,
} from 'three';
import { create } from 'zustand';
import { Controls } from '../../../common/components/controls';
import { WebGPUCanvas } from '../../../common/components/webgpu-canvas';
import {
	type Chain,
	JointConstraintType,
	type Vec2,
	bone,
	fabrikForwardPassFixedIterations,
} from './fabrik';

const useScore = create<{
	score: number;
	scoreColorIndex: number;
	gameOver: boolean;
}>(() => ({
	score: 0,
	scoreColorIndex: 0,
	gameOver: false,
}));

type EntityType = {
	snake: Snake;
	isControlTarget?: boolean;
};

const world = new World<EntityType>();

const snakeQuery = world.query((e) => e.is('snake'));
const controlTargetSnakeQuery = world.query((e) =>
	e.is('isControlTarget').and.is('snake'),
);

const _offsetVector2 = new Vector2();
const _midpoint = new Vector3();
const _start = new Vector3();
const _end = new Vector3();
const _direction = new Vector3();
const _quaternion = new Quaternion();
const _movementVelocity = new Vector3();
const _addVelocity = new Vector3();
const _normal = new Vector3();

const _positionVec2: Vec2 = [0, 0];

const UP = new Vector3(0, 1, 0);

type SnakeDef = {
	color: string;
	segments: number;
	segmentLength: number;
	startRadius: number;
	endRadius: number;
	ballJointRotor: number;
};

type SnakeState = {
	position: Vector3;
	prevPosition: Vector3;
	tongueWobbleIntensity: number;
	chain: Chain;
	visuals: SnakeVisuals | undefined;
	visualsParent: Object3D;
	headVisualsGroup: Object3D;
	chainIds: number[];
	segmentCounter: number;
	pendingWaves: {
		startTime: number;
		segments: number;
		segmentsAdded: boolean;
	}[];
	targetRadii: number[];
	currentRadii: number[];
	finalRadii: number[];
};

type SnakeVisuals = {
	meshMap: Map<number, Mesh>;
	boneGeometry: BufferGeometry;
	boneMaterial: Material;
};

type SnakeInput = {
	pointer: Vector3;
};

type Snake = {
	def: SnakeDef;
	state: SnakeState;
	input: SnakeInput;
};

const initSnake = (
	def: SnakeDef,
	chainVisualsParent: Object3D,
	headVisualsGroup: Object3D,
): Snake => {
	const chain: Chain = { bones: [] };

	// initialize per‑segment radii
	const segCount = def.segments;
	const targetRadii = Array.from({ length: segCount }, (_, i) =>
		MathUtils.lerp(
			def.endRadius,
			def.startRadius,
			segCount > 1 ? i / (segCount - 1) : 1,
		),
	);
	const currentRadii = [...targetRadii];
	const finalRadii = [...targetRadii];

	// snake state
	const state: SnakeState = {
		position: new Vector3(),
		prevPosition: new Vector3(),
		tongueWobbleIntensity: 0,
		chain,
		visuals: undefined,
		visualsParent: chainVisualsParent,
		headVisualsGroup,
		chainIds: [],
		segmentCounter: 0,
		pendingWaves: [],
		targetRadii,
		currentRadii,
		finalRadii,
	};

	// initialize chain
	const segmentLength = def.segmentLength;
	const prevEnd = new Vector2();
	for (let i = 0; i < def.segments; i++) {
		const start = prevEnd.clone();
		const end = start
			.clone()
			.add(_offsetVector2.set(0, 1).multiplyScalar(segmentLength));
		const chainBone = bone(start.toArray(), end.toArray(), {
			type: JointConstraintType.BALL,
			rotor: def.ballJointRotor,
		});
		chain.bones.push(chainBone);
		state.chainIds.push(state.segmentCounter++);
		prevEnd.copy(end);
	}

	// input
	const input: SnakeInput = {
		pointer: new Vector3(),
	};

	return {
		def,
		input,
		state,
	};
};

// helper to grow at tail
const addSnakeSegment = (snake: Snake) => {
	const chain = snake.state.chain;
	const first = chain.bones[0];
	const dx = first.end[0] - first.start[0];
	const dy = first.end[1] - first.start[1];
	const inv = Math.hypot(dx, dy) || 1;
	const nx = dx / inv;
	const ny = dy / inv;
	const newStart: Vec2 = [
		first.start[0] - nx * snake.def.segmentLength,
		first.start[1] - ny * snake.def.segmentLength,
	];
	const newBone = bone(newStart, [first.start[0], first.start[1]], {
		type: JointConstraintType.BALL,
		rotor: snake.def.ballJointRotor,
	});
	chain.bones.unshift(newBone);
	snake.state.chainIds.unshift(snake.state.segmentCounter++);

	// prepend per‑segment radii for the new tail bone
	snake.state.targetRadii.unshift(snake.def.endRadius);
	snake.state.currentRadii.unshift(0);
	snake.state.finalRadii.unshift(0);
};

const updateSnakeMovement = (snake: Snake, dt: number) => {
	snake.state.prevPosition.copy(snake.state.position);
	snake.state.position.lerp(snake.input.pointer, dt * 10);
};

const updateSnakeChain = (snake: Snake) => {
	_positionVec2[0] = snake.state.position.x;
	_positionVec2[1] = snake.state.position.y;

	fabrikForwardPassFixedIterations(snake.state.chain, _positionVec2, 5);
};

const disposeSnakeVisuals = (visuals: SnakeVisuals) => {
	for (const mesh of visuals.meshMap.values()) {
		mesh.removeFromParent();
		mesh.geometry.dispose();
		(mesh.material as Material).dispose();
	}
};

const remapClamp = (
	value: number,
	inMin: number,
	inMax: number,
	outMin: number,
	outMax: number,
) => {
	const clampedValue = MathUtils.clamp(value, inMin, inMax);
	return (
		((clampedValue - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin
	);
};

const PULSE_DURATION = 500;

const updateSnakeVisuals = (snake: Snake, dt: number) => {
	const chain = snake.state.chain;

	const headMesh = snake.state.headVisualsGroup.getObjectByName('head') as Mesh;

	if (!snake.state.visuals) {
		const boneGeometry = new CylinderGeometry(0.8, 1, 1.4, 8);
		const boneMaterial = new MeshPhongMaterial({
			color: snake.def.color,
		});
		const meshMap = new Map<number, Mesh>();
		snake.state.visuals = { meshMap, boneGeometry, boneMaterial };

		(headMesh.material as MeshPhongMaterial).color.set(snake.def.color);
	}

	const { meshMap, boneGeometry, boneMaterial } = snake.state.visuals!;
	const ids = snake.state.chainIds;

	const now = performance.now();
	const amplitude = 0.5;

	// update or create per-segment mesh
	for (let i = 0; i < chain.bones.length; i++) {
		const id = ids[i];

		let mesh = meshMap.get(id);

		if (!mesh) {
			mesh = new Mesh(boneGeometry, boneMaterial);
			snake.state.visualsParent.add(mesh);
			meshMap.set(id, mesh);
		}

		const bone = chain.bones[i];

		_start.set(...bone.start, 0);
		_end.set(...bone.end, 0);

		_midpoint.addVectors(_start, _end).multiplyScalar(0.5);

		_direction.subVectors(_end, _start).normalize();
		_quaternion.setFromUnitVectors(UP, _direction);

		mesh.position.copy(_midpoint);
		mesh.position.z = (i - chain.bones.length) * snake.def.startRadius;
		mesh.quaternion.copy(_quaternion);

		const targetRadius =
			MathUtils.lerp(
				snake.def.endRadius,
				snake.def.startRadius,
				chain.bones.length > 1 ? i / (chain.bones.length - 1) : 1,
			) + remapClamp(chain.bones.length - snake.def.segments, 0, 200, 0, 0.5);

		const currentRadius = MathUtils.lerp(
			snake.state.currentRadii[i],
			targetRadius,
			0.1,
		);
		snake.state.currentRadii[i] = currentRadius;

		const delay =
			((chain.bones.length - 1 - i) / chain.bones.length) * PULSE_DURATION;

		let scaleUp = 1;
		for (const wave of snake.state.pendingWaves) {
			const t = now - wave.startTime - delay;
			if (t >= 0 && t <= PULSE_DURATION) {
				const u = t / PULSE_DURATION;
				const waveScale =
					u <= 0.5
						? 1 + amplitude * (u / 0.5)
						: 1 + amplitude * ((1 - u) / 0.5);
				scaleUp = Math.max(scaleUp, waveScale);
			}
		}
		const finalRadius = currentRadius * scaleUp;

		mesh.scale.set(finalRadius, bone.length, finalRadius);

		snake.state.finalRadii[i] = finalRadius;
	}

	// update head visuals
	snake.state.headVisualsGroup.position.copy(_end);
	snake.state.headVisualsGroup.quaternion.setFromUnitVectors(UP, _direction);
	snake.state.headVisualsGroup.scale.setScalar(
		snake.state.finalRadii[snake.state.finalRadii.length - 1],
	);

	// update tongue rotation
	const tongue = snake.state.headVisualsGroup.getObjectByName('tongue');
	if (tongue) {
		const distance = snake.state.position.distanceTo(snake.state.prevPosition);
		if (distance <= 0.01) {
			snake.state.tongueWobbleIntensity = MathUtils.lerp(
				snake.state.tongueWobbleIntensity,
				0,
				dt * 2,
			);
		} else {
			snake.state.tongueWobbleIntensity = MathUtils.lerp(
				snake.state.tongueWobbleIntensity,
				1,
				dt * 0.5,
			);
		}
		const tongueRotation =
			Math.sin(now * 0.025) * 0.2 * snake.state.tongueWobbleIntensity;
		tongue.rotation.set(tongueRotation, tongueRotation, tongueRotation);
	}
};

const updateSnakePelletCollision = (
	snake: Snake,
	viewport: { width: number; height: number },
	rewardSegments: number,
	pellet: Vector3,
	setPellet: (pellet: Vector3) => void,
	dt: number,
) => {
	// pellet collision
	const head = snake.state.position;
	if (head.distanceTo(pellet) < snake.def.startRadius + 0.5) {
		snake.state.pendingWaves.push({
			startTime: performance.now(),
			segments: rewardSegments,
			segmentsAdded: false,
		});

		const { score } = useScore.getState();
		useScore.setState({ score: score + rewardSegments });

		const x = (Math.random() * 2 - 1) * ((viewport.width - 1) / 2);
		const y = (Math.random() * 2 - 1) * ((viewport.height - 1) / 2);
		setPellet(new Vector3(x, y, 0));
	}
};

const updateSnakeGrowth = (snake: Snake) => {
	// add segments
	for (const wave of snake.state.pendingWaves) {
		const addTime = PULSE_DURATION;
		if (!wave.segmentsAdded && performance.now() - wave.startTime >= addTime) {
			for (let j = 0; j < wave.segments; j++) {
				addSnakeSegment(snake);
			}
			wave.segmentsAdded = true;
		}
	}

	// remove finished waves
	const s = snake.state;
	const waveCompleteTime = PULSE_DURATION * 2;
	s.pendingWaves = s.pendingWaves.filter((wave) => {
		if (performance.now() - wave.startTime >= waveCompleteTime) {
			return false;
		}
		return true;
	});
};

const updateSnakeSelfCollision = (snake: Snake) => {
	const chain = snake.state.chain;
	const head = chain.bones[chain.bones.length - 1];
	const headPos = new Vector2(head.end[0], head.end[1]);

	const startRadiusSq = snake.def.startRadius * snake.def.startRadius;

	for (let i = 0; i < chain.bones.length - 1; i++) {
		const bone = chain.bones[i];
		const start = new Vector2(bone.start[0], bone.start[1]);
		const end = new Vector2(bone.end[0], bone.end[1]);

		if (headPos.distanceToSquared(start) < startRadiusSq) {
			useScore.setState({ gameOver: true });
			break;
		}
	}
};

const disposeSnake = (snake: Snake) => {
	if (snake.state.visuals) {
		disposeSnakeVisuals(snake.state.visuals);
	}
};

const _localVelocity = new Vector3();
const _worldQuaternion = new Quaternion();

type GooglyEyeProps = {
	eyeRadius?: number;
	irisRadius?: number;
	gravity?: number;
	friction?: number;
	bounciness?: number;
} & ThreeElements['group'];

const GooglyEye = ({
	eyeRadius = 0.1,
	irisRadius = 0.05,
	gravity = 0.981,
	friction = 0.0001,
	bounciness = 0.65,
	...groupProps
}: GooglyEyeProps) => {
	const eyeRef = useRef<Mesh>(null);
	const irisRef = useRef<Mesh>(null);

	const currentWorldPosition = useRef<Vector3>(new Vector3());
	const prevWorldPosition = useRef<Vector3 | undefined>(undefined);
	const velocity = useRef(new Vector3());

	const localPosition = useRef<Vector3>(new Vector3());

	useEffect(() => {
		if (eyeRadius && !irisRadius) {
			irisRadius = eyeRadius * 0.5;
		}
	}, [eyeRadius, irisRadius]);

	useFrame((_, delta) => {
		if (!eyeRef.current || !irisRef.current) return;

		// get world position
		eyeRef.current.getWorldPosition(currentWorldPosition.current);
		if (prevWorldPosition.current === undefined) {
			prevWorldPosition.current = currentWorldPosition.current.clone();
		}

		_movementVelocity
			.copy(prevWorldPosition.current)
			.sub(currentWorldPosition.current)
			.multiplyScalar(200)
			.clampLength(0, 7)
			.multiplyScalar(delta);

		_addVelocity.copy(_movementVelocity);

		_addVelocity.y -= gravity * delta;

		velocity.current.add(_addVelocity);

		velocity.current.multiplyScalar(1 - friction * delta);

		// update local position
		_localVelocity
			.copy(velocity.current)
			.applyQuaternion(
				eyeRef.current.getWorldQuaternion(_worldQuaternion).invert(),
			);
		localPosition.current.add(_localVelocity);
		localPosition.current.z = 0;

		// bounce and clamp
		const maxDistance = eyeRadius - (irisRadius ?? eyeRadius * 0.5);
		const distance = localPosition.current.length();

		if (distance > maxDistance) {
			const direction = _direction.copy(localPosition.current).normalize();
			const angle = Math.atan2(direction.y, direction.x);

			const normal = _normal.copy(direction).normalize().multiplyScalar(-1);

			velocity.current.reflect(normal).multiplyScalar(bounciness);

			localPosition.current.set(
				Math.cos(angle) * maxDistance,
				Math.sin(angle) * maxDistance,
				0,
			);
		}

		// update iris position
		irisRef.current.position.copy(localPosition.current);
		irisRef.current.position.z = 0.01;

		// store previous position for next velocity calculation
		prevWorldPosition.current.copy(currentWorldPosition.current);
	});

	return (
		<group {...groupProps} ref={eyeRef}>
			<mesh scale={[1, 1, -0.05]}>
				<sphereGeometry args={[eyeRadius, 16, 16]} />
				<meshStandardMaterial color="white" roughness={0.3} />
			</mesh>

			<mesh ref={irisRef} scale={[1, 1, 0.1]}>
				<sphereGeometry args={[irisRadius, 12, 12]} />
				<meshStandardMaterial color="black" roughness={0.2} />
			</mesh>

			<mesh scale={[1, 1, 0.4]}>
				<sphereGeometry args={[eyeRadius, 16, 16, 0, Math.PI]} />
				<meshStandardMaterial
					transparent
					opacity={0.1}
					color="#fff"
					roughness={0.2}
					metalness={0.5}
				/>
			</mesh>
		</group>
	);
};

type SnakeProps = {
	def: SnakeDef;
	position: Vector3Tuple;
	isControlTarget?: boolean;
};

const Snake = ({ def, position, isControlTarget = false }: SnakeProps) => {
	const groupRef = useRef<Group>(null!);
	const headGroupRef = useRef<Group>(null!);

	useEffect(() => {
		const snake = initSnake(def, groupRef.current, headGroupRef.current);
		snake.state.position.set(...position);
		snake.state.prevPosition.set(...position);

		const entity = world.create({
			snake,
			three: groupRef.current,
			isControlTarget,
		});

		return () => {
			world.destroy(entity);
			disposeSnake(snake);
		};
	}, [def, position, isControlTarget]);

	return (
		<>
			<group ref={groupRef} />
			<group ref={headGroupRef}>
				<mesh rotation={[-Math.PI / 2, 0, 0]} name="head">
					<sphereGeometry args={[1, 32, 32, 0, Math.PI]} />
					<meshPhongMaterial color={def.color} />
				</mesh>

				<GooglyEye
					position={[0.5, 0.4, 1]}
					rotation={[0, 0, 0]}
					eyeRadius={0.4}
					irisRadius={0.2}
				/>
				<GooglyEye
					position={[-0.5, 0.4, 1]}
					rotation={[0, 0, 0]}
					eyeRadius={0.4}
					irisRadius={0.2}
				/>

				<group name="tongue" position={[0, 0, 0]}>
					<mesh position={[0, 1.5, 0]} rotation={[0, 0, 0]}>
						<capsuleGeometry args={[0.1, 1, 8, 16]} />
						<meshPhongMaterial color="#FF6666" />
					</mesh>
					<mesh position={[-0.1, 2.1, 0]} rotation={[0, 0, Math.PI / 4]}>
						<capsuleGeometry args={[0.1, 0.15, 8, 16]} />
						<meshPhongMaterial color="#FF6666" />
					</mesh>
					<mesh position={[0.1, 2.1, 0]} rotation={[0, 0, -Math.PI / 4]}>
						<capsuleGeometry args={[0.1, 0.15, 8, 16]} />
						<meshPhongMaterial color="#FF6666" />
					</mesh>
				</group>
			</group>
		</>
	);
};

const START_POS: Vector3Tuple = [0, 0, 0];

type GameProps = {
	debug: boolean;
	segments: number;
	segmentLength: number;
	startRadius: number;
	endRadius: number;
	ballJointRotor: number;
	rewardSegments: number;
};

const Game = ({
	debug,
	segments,
	segmentLength,
	startRadius,
	endRadius,
	ballJointRotor,
	rewardSegments,
}: GameProps) => {
	const viewport = useThree((state) => state.viewport);

	const [pellet, setPellet] = useState<Vector3>(
		() => new Vector3(0, -viewport.height / 3, 0),
	);
	const pelletRef = useRef<Mesh>(null!);

	const snakeDef: SnakeDef = useMemo(() => {
		return {
			color: 'orange',
			segments,
			segmentLength,
			startRadius,
			endRadius,
			ballJointRotor,
		};
	}, [segments, segmentLength, startRadius, endRadius, ballJointRotor]);

	useEffect(() => {
		useScore.setState({ gameOver: false, score: segments });
	}, [segments]);

	useFrame(({ pointer, viewport }, frameDt) => {
		const dt = Math.min(frameDt, 0.1);

		const controlTarget = controlTargetSnakeQuery.first;

		if (controlTarget) {
			const input = controlTarget.snake.input;

			input.pointer.set(
				(pointer.x * viewport.width) / 2,
				(pointer.y * viewport.height) / 2,
				0,
			);
		}

		const gameOver = useScore.getState().gameOver;

		for (const entity of snakeQuery) {
			if (!gameOver) {
				updateSnakeMovement(entity.snake, dt);
			}

			updateSnakeChain(entity.snake);
			updateSnakeVisuals(entity.snake, dt);
			updateSnakePelletCollision(
				entity.snake,
				viewport,
				rewardSegments,
				pellet,
				setPellet,
				dt,
			);
			updateSnakeGrowth(entity.snake);
			updateSnakeSelfCollision(entity.snake);
		}

		if (pelletRef.current) {
			// animate pellet rotation
			pelletRef.current.rotation.x += dt * 2;
			pelletRef.current.rotation.y += dt * 2;

			// bob up and down slightly, side to side slightly
			const bob = Math.sin(performance.now() * 0.001) * 0.1;
			const sway = Math.cos(performance.now() * 0.001) * 0.1;
			pelletRef.current.position.y = pellet.y + bob;
			pelletRef.current.position.x = pellet.x + sway;
		}
	});

	return (
		<>
			<Snake position={START_POS} def={snakeDef} isControlTarget />

			<mesh position={pellet} ref={pelletRef} renderOrder={1000}>
				<icosahedronGeometry args={[0.3]} />
				<meshPhongMaterial color="white" depthTest={false} />
			</mesh>

			<ambientLight intensity={1.5} />

			<pointLight
				castShadow
				position={[-10, 3, 5]}
				intensity={2}
				color="white"
				decay={0}
				distance={1000}
			/>

			<OrthographicCamera makeDefault position={[0, 0, 10]} zoom={100} />
		</>
	);
};

// large number in background
const SCORE_WRAPPER_STYLES: CSSProperties = {
	position: 'absolute',
	top: '0',
	left: '0',
	width: '100vw',
	height: '100vh',
	display: 'flex',
	justifyContent: 'center',
	alignItems: 'center',
	color: '#eee',
	fontWeight: '800',
	textAlign: 'center',
	pointerEvents: 'none',
	fontFamily: 'monospace',
};

const SCORE_STYLES: CSSProperties = {
	fontSize: '30vw',
	zIndex: 0,
};

const GAME_OVER_STYLES: CSSProperties = {
	fontSize: '3em',
	zIndex: 2,
	lineHeight: '1.5',
};

const CANVAS_STYLES: CSSProperties = {
	zIndex: 1,
};

const INSTRUCTIONS_STYLES: React.CSSProperties = {
	color: 'white',
	fontSize: '1.5em',
	left: '50px',
	position: 'absolute',
	bottom: '30px',
	lineHeight: '1.5',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'flex-end',
	fontFamily: 'monospace',
	whiteSpace: 'pre',
};

export function Sketch() {
	const {
		debug,
		segments,
		segmentLength,
		startRadius,
		endRadius,
		ballJointRotor,
		rewardSegments,
	} = useLevaControls({
		debug: false,
		segments: { label: 'Segments', value: 5, min: 1, max: 200, step: 1 },
		segmentLength: {
			label: 'Segment Length',
			value: 0.4,
			min: 0.1,
			max: 5,
			step: 0.1,
		},
		startRadius: {
			label: 'Start Radius',
			value: 0.3,
			min: 0.1,
			max: 1.2,
			step: 0.01,
		},
		endRadius: {
			label: 'End Radius',
			value: 0.1,
			min: 0.1,
			max: 1.2,
			step: 0.01,
		},
		ballJointRotor: {
			label: 'Ball Joint Rotor',
			value: Math.PI / 6,
			min: 0,
			max: Math.PI,
			step: 0.01,
		},
		rewardSegments: {
			label: 'Reward Segments',
			value: 5,
			min: 0,
			max: 10,
			step: 1,
		},
	});

	const [gameCounter, setGameCounter] = useState(0);

	const score = useScore((state) => state.score);

	const gameOver = useScore((state) => state.gameOver);

	const restart = () => {
		setGameCounter((prev) => prev + 1);
	};

	return (
		<>
			<WebGPUCanvas
				gl={{ antialias: true, alpha: true }}
				style={CANVAS_STYLES}
				onPointerDown={gameOver ? restart : undefined}
			>
				<Game
					key={gameCounter}
					debug={debug}
					segments={segments}
					segmentLength={segmentLength}
					startRadius={startRadius}
					endRadius={endRadius}
					ballJointRotor={ballJointRotor}
					rewardSegments={rewardSegments}
				/>
			</WebGPUCanvas>

			<div style={SCORE_WRAPPER_STYLES}>
				{gameOver && (
					<div style={GAME_OVER_STYLES}>
						<div>your final length is {score}</div>
						<div>click to restart</div>
					</div>
				)}
			</div>

			<div style={INSTRUCTIONS_STYLES}>
				* move your pointer to control the snake
			</div>

			<Controls />
		</>
	);
}
