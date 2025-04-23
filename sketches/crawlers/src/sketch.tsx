import Rapier, { type World } from '@dimforge/rapier3d-compat';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import {
	CuboidCollider,
	Physics,
	type RapierRigidBody,
	RigidBody,
	type RigidBodyProps,
	useRapier,
} from '@react-three/rapier';
import {
	type Ref,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from 'react';
import {
	type BufferGeometry,
	CylinderGeometry,
	type Group,
	type Material,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	type Object3D,
	Quaternion,
	type Scene,
	SphereGeometry,
	Spherical,
	Vector2,
	Vector3,
	type Vector3Tuple,
} from 'three';
import { WebGPUCanvas } from '../../../common/components/webgpu-canvas';
import {
	type Chain,
	JointConstraintType,
	type Vec3,
	bone,
	fabrikFixedIterations,
} from './fabrik';
import { useControls as useLevaControls } from 'leva';

import './styles.css';
import { useControls } from './use-controls';

const _footPlacementOffset = new Vector3();
const _legOrigin = new Vector3();
const _rayOrigin = new Vector3();
const _rayDirection = new Vector3();
const _rayDistance = new Vector3();
const _impulse = new Vector3();
const _legOffset = new Vector3();
const _currentEffectorPosition = new Vector3();
const _midpoint = new Vector3();
const _start = new Vector3();
const _end = new Vector3();
const _direction = new Vector3();
const _quaternion = new Quaternion();
const _velocity = new Vector3();
const _angularVelocity = new Vector3();
const _currentEffectorPositionLocal = new Vector3();
const _offset = new Vector3();

const _currentFootPositionVec3: Vec3 = [0, 0, 0];

const UP = new Vector3(0, 1, 0);

type LegDef = {
	/** unique (within for the crawler) id for the leg */
	id: string;
	/** leg attachment point */
	attachmentOffset: Vector3Tuple;
	/** outward stance offset for leg stance */
	footPlacementOffset: Vector3Tuple;
	/** number of segments */
	segments: number;
	/** total desired length of the leg */
	legLength: number;
	/** value between 0-1 indicating when in the cycle this leg steps */
	phaseOffset: number;
};

type LegState = {
	/** position of the ray origin for foot placement */
	footPlacementRayOrigin: Vector3;
	/** position from ideal foot placement */
	footPlacementPosition: Vector3;
	/** goal position */
	effectorGoalPosition: Vector3;
	/** current position of the end effector */
	effectorCurrentPosition: Vector3;
	/** the chain of bones for this leg */
	chain: Chain;
	/** whether the leg is currently in a stepping motion */
	stepping: boolean;
	/** 0-1 value for step animation progress */
	stepProgress: number;
	/** timestamp of last step */
	lastStepTime: number;
	/** legs visuals */
	legVisuals: LegVisuals | undefined;
	/** ik chain debug visual */
	chainHelper: ChainHelper | undefined;
	/** foot placement debug visual */
	footPlacementHelper: FootPlacementHelper | undefined;
};

// Add an easing function for smooth stepping motion
const ease = (x: number): number => {
	return -(Math.cos(Math.PI * x) - 1) / 2;
};

type CrawlerDef = {
	legs: LegDef[];
	height: number;
};

type CrawlerProps = Omit<RigidBodyProps, 'ref'> & {
	def: CrawlerDef;
	debug?: boolean;
	ref?: Ref<CrawlerState>;
};

const initCrawler = (def: CrawlerDef) => {
	const legs: Record<string, LegState> = {};

	for (const leg of def.legs) {
		const chain: Chain = {
			bones: [],
		};

		const segmentLength = leg.legLength / leg.segments;

		const prevEnd = new Vector3();

		for (let i = 0; i < leg.segments; i++) {
			const start = prevEnd.clone();
			const end = start.clone();
			end.add(_legOffset.set(0, -1, 0).multiplyScalar(segmentLength));

			chain.bones.push(
				bone(start.toArray(), end.toArray(), {
					type: JointConstraintType.BALL,
					rotor: Math.PI / 4,
				}),
			);
		}

		legs[leg.id] = {
			footPlacementRayOrigin: new Vector3(),
			footPlacementPosition: new Vector3(),
			effectorGoalPosition: new Vector3(),
			effectorCurrentPosition: new Vector3(),
			stepping: false,
			stepProgress: 1, // init as "completed" (0, 1)
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
			direction: new Vector2(),
		},
		cmd: [] as Array<'jump'>,
		state: {
			legs,
			position: new Vector3(),
			lastPosition: new Vector3(),
			stepCycleTime: 0,
			stepCycleSpeed: 2,
			grounded: false,
			jumping: false,
			landing: false,
			rigidBody: null as unknown as RapierRigidBody,
		},
	};
};

type CrawlerState = ReturnType<typeof initCrawler>;

const updateCrawlerMovement = (crawler: CrawlerState, dt: number) => {
	const rigidBody = crawler.state.rigidBody;

	// update position from last step
	crawler.state.position.copy(rigidBody.translation());

	// HACK: in a real version of this we'd do this before the physics step and update positions after :)
	// but this is just a quick r3f toy

	// determine velocity from input
	_velocity.set(crawler.input.direction.x, 0, crawler.input.direction.y);
	_velocity.normalize();
	_velocity.multiplyScalar(300);
	_velocity.multiplyScalar(dt);

	// preserve y velocity
	_velocity.y = rigidBody.linvel().y;

	// set velocity
	rigidBody.setLinvel(_velocity, true);
	rigidBody.setAngvel(_angularVelocity.set(0, 0, 0), true);

	for (const cmd of crawler.cmd) {
		if (cmd === 'jump') {
			if (crawler.state.jumping || !crawler.state.grounded) continue;
			crawler.state.jumping = true;
			crawler.state.grounded = false;

			const jumpImpulse = 100;
			_impulse.set(0, jumpImpulse * dt, 0);
			rigidBody.applyImpulse(_impulse, true);
		}
	}

	crawler.cmd.length = 0;

	// /* apply horizontal velocity to move in circle */
	// const angle = (performance.now() / 1000) * 2;
	// const x = Math.cos(angle) * 3;
	// const z = Math.sin(angle) * 3;
	// rigidBody.setLinvel(new Vector3(x, rigidBody.linvel().y, z), true);
	// rigidBody.setAngvel(new Vector3(0, 0, 0), true);
};

const updateCrawlerTimer = (crawler: CrawlerState, dt: number) => {
	// update step cycle time - this drives the phase-based stepping
	crawler.state.stepCycleTime =
		(crawler.state.stepCycleTime + dt * crawler.state.stepCycleSpeed) % 1;
};

const updateCrawlerSuspension = (crawler: CrawlerState, world: World) => {
	const rigidBody = crawler.state.rigidBody;

	_rayOrigin.copy(rigidBody.translation());

	_rayDirection.set(0, -1, 0);

	const rayLength = crawler.def.height;
	const ray = new Rapier.Ray(_rayOrigin, _rayDirection);

	const rayColliderIntersection = world.castRayAndGetNormal(
		ray,
		rayLength,
		false,
		undefined,
		undefined,
		undefined,
		rigidBody,
	);

	let grounded = false;

	if (rayColliderIntersection?.timeOfImpact !== undefined) {
		const rayHitDistance = rayColliderIntersection.timeOfImpact * rayLength;

		if (rayHitDistance < crawler.def.height + 0.1) {
			grounded = true;
		}

		if (grounded) {
			const heightDesired = crawler.def.height;
			const heightCurrent = rayHitDistance;
			const springConstant = 1;
			const springDamping = 0.2;
			const currentVerticalVelocity = rigidBody.linvel().y;

			const velocity =
				(heightDesired - heightCurrent) * springConstant -
				currentVerticalVelocity * springDamping;

			_impulse.set(0, velocity, 0);

			rigidBody.applyImpulse(_impulse, true);
		}
	}

	if (crawler.state.jumping && grounded) {
		crawler.state.jumping = false;
	}

	crawler.state.landing = !crawler.state.grounded && grounded;

	crawler.state.grounded = grounded;
};

const updateCrawlerFootPlacement = (
	crawler: CrawlerState,
	crawlerObject: Object3D,
	world: World,
) => {
	const rigidBody = crawler.state.rigidBody;

	if (crawler.state.grounded) {
		for (const leg of crawler.def.legs) {
			const legState = crawler.state.legs[leg.id];

			_legOrigin.copy(crawler.state.position);
			_legOrigin.add(_legOffset.set(...leg.attachmentOffset));

			_rayDirection.set(0, -1, 0);

			_footPlacementOffset.set(...leg.footPlacementOffset);

			legState.footPlacementRayOrigin
				.copy(crawler.state.position)
				.add(_footPlacementOffset);
			legState.footPlacementRayOrigin.y = _legOrigin.y;

			const ray = new Rapier.Ray(
				legState.footPlacementRayOrigin,
				_rayDirection,
			);
			const rayLength = 10;
			const rayColliderIntersection = world.castRayAndGetNormal(
				ray,
				rayLength,
				false,
				undefined,
				undefined,
				undefined,
				rigidBody,
			);

			const distance = _rayDistance
				.copy(_rayDirection)
				.multiplyScalar(rayColliderIntersection?.timeOfImpact ?? 1);
			legState.footPlacementPosition.copy(legState.footPlacementRayOrigin);
			legState.footPlacementPosition.add(distance);
		}
	} else {
		// extend legs outwards
		for (const leg of crawler.def.legs) {
			const legState = crawler.state.legs[leg.id];

			_start.set(...leg.attachmentOffset);
			_end.set(...leg.footPlacementOffset);

			_direction.subVectors(_end, _start).normalize();
			_direction.multiplyScalar(leg.legLength);

			legState.footPlacementPosition.copy(_direction);
			crawlerObject.localToWorld(legState.footPlacementPosition);
		}
	}
};

const updateCrawlerStepping = (crawler: CrawlerState, dt: number) => {
	for (const leg of crawler.def.legs) {
		const legState = crawler.state.legs[leg.id];

		// if not grounded, stop stepping
		if (!crawler.state.grounded) {
			legState.stepping = false;
			legState.effectorGoalPosition.copy(legState.footPlacementPosition);
			legState.effectorCurrentPosition.copy(legState.footPlacementPosition);

			continue;
		}

		const currentEffectorPosition = _currentEffectorPosition.set(
			...legState.chain.bones[legState.chain.bones.length - 1].end,
		);

		const footPlacementToGoalDistance =
			legState.effectorGoalPosition.distanceTo(legState.footPlacementPosition);

		if (legState.stepping) {
			// advance step progress
			const linvel = crawler.state.rigidBody.linvel();
			const speed = _velocity.copy(linvel).length();
			legState.stepProgress += dt * 5 + dt * speed * 0.5; // adjust for step speed

			if (legState.stepProgress >= 1) {
				// step complete
				legState.stepProgress = 1;
				legState.stepping = false;
				legState.lastStepTime = performance.now();
			}
		} else {
			// calculate where we are in the stepping cycle for this leg
			const legPhase = (crawler.state.stepCycleTime + leg.phaseOffset) % 1;

			// define the phase "window" where this leg is allowed to step
			const phaseWindowStart = 0;
			const phaseWindowEnd = 0.3; // Allow 30% of the cycle for stepping

			// is this leg is in its stepping phase window
			const inStepPhase =
				legPhase >= phaseWindowStart && legPhase <= phaseWindowEnd;

			const needsRegularStep = inStepPhase && footPlacementToGoalDistance > 0.2;
			const needsEmergencyStep =
				footPlacementToGoalDistance > 1.2 || crawler.state.landing;

			if (needsRegularStep || needsEmergencyStep) {
				legState.stepping = true;
				legState.stepProgress = 0;
				legState.effectorGoalPosition.copy(legState.footPlacementPosition);
			}
		}

		// determine current position for the step
		if (legState.stepping) {
			legState.effectorCurrentPosition.lerp(
				legState.effectorGoalPosition,
				legState.stepProgress,
			);

			// add a vertical component that peaks in the middle of the step
			const easedProgress = ease(legState.stepProgress);
			if (easedProgress > 0 && easedProgress < 1) {
				const arcHeight = 0.1;
				const arcFactor = Math.sin(easedProgress * Math.PI) * arcHeight;
				legState.effectorCurrentPosition.y += arcFactor;
			}
		}
	}
};


const updateCrawlerIK = (crawler: CrawlerState, crawlerObject: Object3D) => {
	for (const leg of crawler.def.legs) {
		const legState = crawler.state.legs[leg.id];

		_currentEffectorPositionLocal.copy(legState.effectorCurrentPosition);
		crawlerObject.worldToLocal(_currentEffectorPositionLocal);

		_currentFootPositionVec3[0] = _currentEffectorPositionLocal.x;
		_currentFootPositionVec3[1] = _currentEffectorPositionLocal.y;
		_currentFootPositionVec3[2] = _currentEffectorPositionLocal.z;

		// reset the leg to face outwards from the attachment point facing out by the attachment offset
		// this helps encourage more natural bone positions with an outward facing arc
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

		// calculate the IK for this leg
		fabrikFixedIterations(
			legState.chain,
			leg.attachmentOffset,
			_currentFootPositionVec3,
			10,
		);
	}
};

const initFootPlacementHelper = (scene: Scene) => {
	const rayOriginHelper = new Mesh(
		new SphereGeometry(0.05),
		new MeshBasicMaterial({ color: 'red', wireframe: true }),
	);

	const targetPositionHelper = new Mesh(
		new SphereGeometry(0.05),
		new MeshBasicMaterial({ color: 'green', wireframe: true }),
	);

	const currentPositionHelper = new Mesh(
		new SphereGeometry(0.06),
		new MeshBasicMaterial({ color: 'blue', wireframe: true }),
	);

	const geometries: BufferGeometry[] = [
		rayOriginHelper.geometry,
		targetPositionHelper.geometry,
		currentPositionHelper.geometry,
	];
	const materials: Material[] = [
		rayOriginHelper.material,
		targetPositionHelper.material,
		currentPositionHelper.material,
	];

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

type FootPlacementHelper = ReturnType<typeof initFootPlacementHelper>;

const updateFootPlacementHelper = (
	helper: FootPlacementHelper,
	rayOrigin: Vector3,
	footPlacementPosition: Vector3,
	goalPosition: Vector3,
) => {
	helper.rayOriginHelper.position.copy(rayOrigin);
	helper.footPlacementPositionHelper.position.copy(footPlacementPosition);
	helper.goalPositionHelper.position.copy(goalPosition);
};

const disposeFootPlacementHelper = (helper: FootPlacementHelper) => {
	const {
		rayOriginHelper,
		footPlacementPositionHelper: targetPositionHelper,
		goalPositionHelper: currentPositionHelper,
	} = helper;

	rayOriginHelper.removeFromParent();
	targetPositionHelper.removeFromParent();
	currentPositionHelper.removeFromParent();

	for (const geometry of helper.geometries) {
		geometry.dispose();
	}
	for (const material of helper.materials) {
		material.dispose();
	}
};

const initChainHelper = (chain: Chain, object: Object3D) => {
	// cylinders for each bone
	const boneMeshes: Mesh[] = [];
	const boneGeometry = new CylinderGeometry(0.03, 0.03, 1, 8);
	const boneMaterial = new MeshBasicMaterial({ color: 'orange' });

	const jointMeshes: Mesh[] = [];
	const jointGeometry = new SphereGeometry(0.1, 8, 8);
	const jointMaterial = new MeshBasicMaterial({ color: 'blue' });

	const baseMaterial = new MeshBasicMaterial({ color: 'green' });

	for (let i = 0; i < chain.bones.length; i++) {
		const bone = chain.bones[i];

		const mesh = new Mesh(boneGeometry, boneMaterial);
		mesh.position.set(...bone.start);
		mesh.lookAt(...bone.end);
		mesh.updateMatrixWorld();
		mesh.scale.set(1, bone.length, 1);
		object.add(mesh);
		boneMeshes.push(mesh);

		const jointMesh = new Mesh(
			jointGeometry,
			i === 0 ? baseMaterial : boneMaterial,
		);
		jointMesh.position.set(...bone.start);
		object.add(jointMesh);
		jointMeshes.push(jointMesh);
	}

	const attachmentGeometry = new SphereGeometry(0.12, 8, 8);
	const attachmentMaterial = new MeshBasicMaterial({ color: 'purple' });
	const attachmentMesh = new Mesh(attachmentGeometry, attachmentMaterial);
	object.add(attachmentMesh);

	const effectorMaterial = new MeshBasicMaterial({ color: 'red' });
	const effectorMesh = new Mesh(jointGeometry, effectorMaterial);
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

type ChainHelper = ReturnType<typeof initChainHelper>;

const updateChainHelper = (
	leg: LegDef,
	chain: Chain,
	chainHelper: ChainHelper,
) => {
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

	const attachmentMesh = chainHelper.attachmentMesh;
	attachmentMesh.position.set(...leg.attachmentOffset);

	const effectorMesh = chainHelper.effectorMesh;
	effectorMesh.position.set(...chain.bones[chain.bones.length - 1].end);
};

const disposeChainHelper = (chainHelper: ChainHelper) => {
	for (const mesh of chainHelper.boneMeshes) {
		mesh.removeFromParent();
		mesh.geometry.dispose();
		(mesh.material as Material).dispose();
	}

	for (const mesh of chainHelper.jointMeshes) {
		mesh.removeFromParent();
		mesh.geometry.dispose();
		(mesh.material as Material).dispose();
	}

	chainHelper.effectorMesh.removeFromParent();
	chainHelper.effectorMesh.geometry.dispose();
	(chainHelper.effectorMesh.material as Material).dispose();

	chainHelper.attachmentMesh.removeFromParent();
	chainHelper.attachmentMesh.geometry.dispose();
	(chainHelper.attachmentMesh.material as Material).dispose();
};

const updateCrawlerDebugVisuals = (
	crawler: CrawlerState,
	debug: boolean,
	object: Object3D,
	scene: Scene,
) => {
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

const initLegVisuals = (chain: Chain, object: Object3D) => {
	// cylinders for each bone
	const boneMeshes: Mesh[] = [];
	const boneGeometry = new CylinderGeometry(0.05, 0.025, 1, 8);
	const boneMaterial = new MeshBasicMaterial({ color: 'orange' });

	for (let i = 0; i < chain.bones.length; i++) {
		const bone = chain.bones[i];

		const mesh = new Mesh(boneGeometry, boneMaterial);
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

type LegVisuals = ReturnType<typeof initLegVisuals>;

const updateLegVisuals = (
	leg: LegDef,
	chain: Chain,
	legVisuals: LegVisuals,
) => {
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
		mesh.geometry.dispose();
		(mesh.material as Material).dispose();
	}
};

const updateCrawlerVisuals = (crawler: CrawlerState, object: Object3D) => {
	for (const leg of crawler.def.legs) {
		const legState = crawler.state.legs[leg.id];

		if (!legState.legVisuals) {
			legState.legVisuals = initLegVisuals(legState.chain, object);
		}

		updateLegVisuals(leg, legState.chain, legState.legVisuals);
	}
};

const updateCrawler = (
	crawler: CrawlerState,
	crawlerObject: Object3D,
	scene: Scene,
	world: World,
	debug: boolean,
	dt: number,
) => {
	updateCrawlerMovement(crawler, dt);
	updateCrawlerTimer(crawler, dt);
	updateCrawlerSuspension(crawler, world);
	updateCrawlerFootPlacement(crawler, crawlerObject, world);
	updateCrawlerStepping(crawler, dt);
	updateCrawlerIK(crawler, crawlerObject);
	updateCrawlerDebugVisuals(crawler, debug, crawlerObject, scene);
	updateCrawlerVisuals(crawler, crawlerObject);
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

const Crawler = ({
	ref,
	def,
	debug = false,
	...rigidBodyProps
}: CrawlerProps) => {
	const scene = useThree((state) => state.scene);

	const { world } = useRapier();
	const rigidBodyRef = useRef<Rapier.RigidBody>(null!);
	const groupRef = useRef<Group>(null!);

	const [crawlerState, setCrawlerState] = useState<CrawlerState>();

	const controls = useControls();

	useEffect(() => {
		const crawler = initCrawler(def);
		crawler.state.rigidBody = rigidBodyRef.current;
		setCrawlerState(crawler);

		return () => {
			disposeCrawler(crawler);
			setCrawlerState(undefined);
		};
	}, [def]);

	useFrame((_, dt) => {
		const crawlerObject = groupRef.current;
		if (!crawlerState || !crawlerObject) return;

		/* update crawler input */
		crawlerState.input.direction.set(0, 0);

		if (controls.current.forward) {
			crawlerState.input.direction.y = -1;
		}
		if (controls.current.backward) {
			crawlerState.input.direction.y = 1;
		}
		if (controls.current.left) {
			crawlerState.input.direction.x = -1;
		}
		if (controls.current.right) {
			crawlerState.input.direction.x = 1;
		}

		if (controls.current.jump) {
			crawlerState.cmd.push('jump');
		}

		/* update the crawler */
		updateCrawler(crawlerState, crawlerObject, scene, world, debug, dt);
	});

	useImperativeHandle(ref, () => crawlerState!, [crawlerState]);

	return (
		<RigidBody
			{...rigidBodyProps}
			type="dynamic"
			colliders="cuboid"
			lockRotations
			ref={rigidBodyRef}
		>
			<group ref={groupRef}>
				<mesh>
					<sphereGeometry args={[0.5, 32, 32]} />
					<meshStandardMaterial color="orange" />
				</mesh>
			</group>
		</RigidBody>
	);
};

const Environment = () => (
	<>
		{/* floor */}
		<RigidBody type="fixed" position={[0, -1, 0]}>
			<CuboidCollider args={[20, 1, 20]} />
		</RigidBody>
		<mesh rotation={[-Math.PI / 2, 0, 0]}>
			<circleGeometry args={[20, 64]} />
			<meshStandardMaterial color="#999" />
		</mesh>

		{/* stairs */}
		{[...Array(10)].map((_, i) => (
			<RigidBody key={String(i)} type="fixed" shape="cuboid">
				<mesh
					position={[-2 + i * 2, -1 + i * 0.2, 0]}
					rotation={[-Math.PI / 2, 0, 0]}
				>
					<boxGeometry args={[3, 3, 1]} />
					<meshStandardMaterial color="#999" />
				</mesh>
			</RigidBody>
		))}

		{/* embedded cylinders */}
		{[...Array(10)].map((_, i) => (
			<RigidBody key={String(i)} type="fixed" shape="cylinder">
				<mesh
					position={[Math.random() * 10 - 5, -1.2, Math.random() * 10 - 5]}
					rotation={[0, Math.random() * Math.PI * 2, 0]}
				>
					<cylinderGeometry args={[0.5, 0.5, 3, 32]} />
					<meshStandardMaterial color="#999" />
				</mesh>
			</RigidBody>
		))}
	</>
);

const LEGS: LegDef[] = [
	{
		id: 'front-left',
		attachmentOffset: [-0.3, -0.3, 0.3],
		footPlacementOffset: [-0.8, 0, 0.8],
		segments: 5,
		legLength: 1.5,
		phaseOffset: 0,
	},
	{
		id: 'back-right',
		attachmentOffset: [0.3, -0.3, -0.3],
		footPlacementOffset: [0.8, 0, -0.8],
		segments: 5,
		legLength: 1.5,
		phaseOffset: 0.25,
	},
	{
		id: 'front-right',
		attachmentOffset: [0.3, -0.3, 0.3],
		footPlacementOffset: [0.8, 0, 0.8],
		segments: 5,
		legLength: 1.5,
		phaseOffset: 0.5,
	},
	{
		id: 'back-left',
		attachmentOffset: [-0.3, -0.3, -0.3],
		footPlacementOffset: [-0.8, 0, -0.8],
		segments: 5,
		legLength: 1.5,
		phaseOffset: 0.75,
	},
];

const CRAWLER_DEF: CrawlerDef = {
	legs: LEGS,
	height: 3,
};

export function Sketch() {
	const { debug } = useLevaControls({ debug: true });

	return (
		<WebGPUCanvas gl={{ antialias: true }}>
			<Physics debug={debug} timeStep="vary">
				<Crawler position={[0, 4, 0]} def={CRAWLER_DEF} debug={debug} />

				<Environment />
			</Physics>

			<ambientLight intensity={1.5} />
			<directionalLight position={[0, 0, 5]} intensity={1.5} />

			<OrbitControls makeDefault />
			<PerspectiveCamera makeDefault position={[0, 5, 15]} />
		</WebGPUCanvas>
	);
}
