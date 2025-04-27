import Rapier from '@dimforge/rapier3d-compat';
import { Cylinder, Helper, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { type ThreeElements, useFrame } from '@react-three/fiber';
import {
	BallCollider,
	CuboidCollider,
	CylinderCollider,
	Physics,
	type RapierContext,
	type RapierRigidBody,
	RigidBody,
	type RigidBodyProps,
	useRapier,
} from '@react-three/rapier';
import { World } from 'arancini';
import { Leva, useControls as useLevaControls } from 'leva';
import {
	type Ref,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
} from 'react';
import {
	type BufferGeometry,
	CylinderGeometry,
	DirectionalLightHelper,
	type Group,
	type Material,
	MathUtils,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	type Object3D,
	PCFSoftShadowMap,
	Quaternion,
	type Scene,
	SphereGeometry,
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
import { useControls } from './use-controls';
import { Instructions } from '../../../common';
import { Controls } from '../../../common/components/controls';

type EntityType = {
	crawler: CrawlerState;
	rigidBody: RapierRigidBody;
	three: Object3D;
	isControlTarget?: boolean;
};

const world = new World<EntityType>();
const crawlerQuery = world.query((e) =>
	e.is('crawler').and.has('rigidBody', 'three'),
);
const controlTargetCrawlerQuery = world.query((e) =>
	e.is('isControlTarget').and.has('crawler').and.has('rigidBody', 'three'),
);

const _footPlacementOffset = new Vector3();
const _legOrigin = new Vector3();
const _rayOrigin = new Vector3();
const _rayDirection = new Vector3();
const _rayDistance = new Vector3();
const _impulse = new Vector3();
const _legOffset = new Vector3();
const _midpoint = new Vector3();
const _start = new Vector3();
const _end = new Vector3();
const _direction = new Vector3();
const _quaternion = new Quaternion();
const _velocity = new Vector3();
const _angularVelocity = new Vector3();
const _currentEffectorPositionLocal = new Vector3();
const _offset = new Vector3();
const _cameraOffset = new Vector3();
const _axis = new Vector3();
const _addVelocity = new Vector3();
const _normal = new Vector3();

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
					rotor: Math.PI / 2,
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
			crouch: false,
			sprint: false,
		},
		cmd: [] as Array<'jump'>,
		state: {
			legs,
			position: new Vector3(),
			stepCycleTime: 0,
			grounded: false,
			jumping: false,
			lastJumpTime: 0,
			landing: false,
		},
	};
};

type CrawlerState = ReturnType<typeof initCrawler>;

const updateCrawlerMovement = (
	crawler: CrawlerState,
	rigidBody: RapierRigidBody,
	dt: number,
) => {
	// determine velocity from input
	_velocity.set(crawler.input.direction.x, 0, crawler.input.direction.y);
	_velocity.normalize();
	_velocity.multiplyScalar(crawler.def.speed);
	if (crawler.input.sprint) {
		_velocity.multiplyScalar(crawler.def.sprintMultiplier);
	}
	_velocity.multiplyScalar(dt);

	// preserve y velocity
	_velocity.y = rigidBody.linvel().y;

	// set velocity
	rigidBody.setLinvel(_velocity, true);
	rigidBody.setAngvel(_angularVelocity.set(0, 0, 0), true);

	for (const cmd of crawler.cmd) {
		if (cmd === 'jump') {
			if (crawler.state.jumping || !crawler.state.grounded) {
				continue;
			}

			crawler.state.jumping = true;
			crawler.state.lastJumpTime = performance.now();
			crawler.state.grounded = false;

			_impulse.set(0, crawler.def.jumpImpulse, 0);
			rigidBody.applyImpulse(_impulse, true);
		}
	}

	crawler.cmd.length = 0;
};

const updateCrawlerPosition = (
	crawler: CrawlerState,
	rigidBody: RapierRigidBody,
) => {
	// update the position of the crawler
	crawler.state.position.copy(rigidBody.translation());
};

const updateCrawlerTimer = (crawler: CrawlerState, dt: number) => {
	// update step cycle time - this drives the phase-based stepping
	crawler.state.stepCycleTime =
		(crawler.state.stepCycleTime + dt * crawler.def.stepCycleSpeed) % 1;
};

const updateCrawlerSuspension = (
	crawler: CrawlerState,
	rigidBody: RapierRigidBody,
	world: Rapier.World,
	dt: number,
) => {
	if (
		crawler.state.jumping &&
		(crawler.state.lastJumpTime + 300 > performance.now() ||
			rigidBody.linvel().y > 0)
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

		avgLegHeightRelative +=
			legState.effectorCurrentPosition.y - legHeightOrigin;
	}

	if (avgLegHeightRelative > 0) {
		avgLegHeightRelative /= crawler.def.legs.length
	}

	if (avgLegHeightRelative > 0) {
		desiredHeight += avgLegHeightRelative;
	}

	_rayOrigin.copy(rigidBody.translation());
	_rayDirection.set(0, -1, 0);
	const ray = new Rapier.Ray(_rayOrigin, _rayDirection);
	const rayLength = desiredHeight + 5;

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
		const distance = _rayDistance
			.copy(_rayDirection)
			.multiplyScalar(rayColliderIntersection?.timeOfImpact ?? 1);
		const rayHitDistance = distance.length();

		if (rayHitDistance < crawler.def.height + 0.1) {
			grounded = true;
		}

		if (grounded) {
			const heightDesired = desiredHeight;
			const heightCurrent = rayHitDistance;

			const springConstant = 10;
			const springDamping = 2;
			const currentVerticalVelocity = rigidBody.linvel().y;

			const velocity =
				(heightDesired - heightCurrent) * springConstant -
				currentVerticalVelocity * springDamping;

			_impulse.set(0, velocity * dt, 0);

			rigidBody.applyImpulse(_impulse, true);
		}
	}

	if (crawler.state.jumping && grounded) {
		crawler.state.jumping = false;
	}

	crawler.state.landing = !crawler.state.grounded && grounded;

	crawler.state.grounded = grounded;
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

const updateCrawlerFootPlacement = (
	crawler: CrawlerState,
	crawlerObject: Object3D,
	rigidBody: RapierRigidBody,
	world: Rapier.World,
) => {
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
			legState.footPlacementRayOrigin.y = _legOrigin.y + crawler.def.height / 2;

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

			_direction.subVectors(_end, _start);
			_direction.y = 0;
			_direction.normalize();
			_direction.multiplyScalar(leg.legLength * 1.2);

			legState.footPlacementPosition.copy(_direction);
			crawlerObject.localToWorld(legState.footPlacementPosition);

			legState.footPlacementPosition.y +=
				Math.sin(performance.now() / 100 + leg.phaseOffset) * 0.75;

			const verticalLinearVelocity = rigidBody.linvel().y;

			legState.footPlacementPosition.y += remapClamp(
				verticalLinearVelocity,
				-2,
				2,
				0.5,
				-0.5,
			);
		}
	}
};

const updateCrawlerStepping = (
	crawler: CrawlerState,
	rigidBody: RapierRigidBody,
	dt: number,
) => {
	for (const leg of crawler.def.legs) {
		const legState = crawler.state.legs[leg.id];

		// if not grounded, stop stepping
		if (!crawler.state.grounded) {
			legState.stepping = false;
			legState.effectorGoalPosition.copy(legState.footPlacementPosition);
			legState.effectorCurrentPosition.lerp(
				legState.effectorGoalPosition,
				dt * 10,
			);

			continue;
		}

		const footPlacementToGoalDistance =
			legState.effectorGoalPosition.distanceTo(legState.footPlacementPosition);

		if (legState.stepping) {
			// advance step progress
			const linvel = rigidBody.linvel();
			const speed = _velocity.copy(linvel).length();
			legState.stepProgress += dt * crawler.def.stepSpeed + dt * speed * 0.5; // adjust for step speed

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

			const needsRegularStep =
				inStepPhase &&
				footPlacementToGoalDistance >
					crawler.def.footPlacementStepDistanceThreshold;
			const needsEmergencyStep =
				footPlacementToGoalDistance >
					crawler.def.footPlacementEmergencyStepDistanceThreshold ||
				crawler.state.landing;

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
				const arcFactor = Math.sin(easedProgress * Math.PI) * crawler.def.stepArcHeight;
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
	const boneMaterial = new MeshBasicMaterial({
		color: '#fff',
		depthTest: false,
	});

	const jointMeshes: Mesh[] = [];
	const jointGeometry = new SphereGeometry(0.1, 8, 8);
	const jointMaterial = new MeshBasicMaterial({
		color: 'blue',
		depthTest: false,
	});

	const baseMaterial = new MeshBasicMaterial({
		color: 'green',
		depthTest: false,
	});

	for (let i = 0; i < chain.bones.length; i++) {
		const bone = chain.bones[i];

		const mesh = new Mesh(boneGeometry, boneMaterial);
		mesh.renderOrder = 1;
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
	const attachmentMaterial = new MeshBasicMaterial({
		color: 'purple',
		depthTest: false,
	});
	const attachmentMesh = new Mesh(attachmentGeometry, attachmentMaterial);
	attachmentMesh.position.set(...chain.bones[0].start);
	attachmentMesh.renderOrder = 1;
	object.add(attachmentMesh);

	const effectorMaterial = new MeshBasicMaterial({
		color: 'red',
		depthTest: false,
	});
	const effectorMesh = new Mesh(jointGeometry, effectorMaterial);
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

	// update effector position
	chainHelper.effectorMesh.position.set(
		...chain.bones[chain.bones.length - 1].end,
	);
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
	const boneGeometry = new CylinderGeometry(0.1, 0.05, 1, 8);
	const boneMaterial = new MeshStandardMaterial({ color: 'orange' });

	for (let i = 0; i < chain.bones.length; i++) {
		const bone = chain.bones[i];

		const mesh = new Mesh(boneGeometry, boneMaterial);
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

const disposeCrawler = (crawler: CrawlerState) => {
	for (const leg of crawler.def.legs) {
		const legState = crawler.state.legs[leg.id];

		if (legState.legVisuals) {
			console.log('disposing leg visuals');
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

type CrawlerGooglyEyeProps = {
	eyeRadius?: number;
	irisRadius?: number;
	gravity?: number;
	friction?: number;
	bounciness?: number;
} & ThreeElements['group'];

export const CrawlerGooglyEye = ({
	eyeRadius = 0.1,
	irisRadius = 0.05,
	gravity = 0.981,
	friction = 0.075,
	bounciness = 0.5,
	...groupProps
}: CrawlerGooglyEyeProps) => {
	const eyeRef = useRef<Mesh>(null);
	const irisRef = useRef<Mesh>(null);

	const currentWorldPosition = useRef<Vector3>(new Vector3());
	const prevWorldPosition = useRef<Vector3 | undefined>(undefined);
	const velocity = useRef(new Vector3());

	const localPosition = useRef<Vector3>(new Vector3());
	const localEyeVelocity = useRef(new Vector3());

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

		// get velocity using current and previous position, gravity, friction
		_addVelocity
			.copy(prevWorldPosition.current)
			.sub(currentWorldPosition.current)
			.multiplyScalar(500)
			.clampLength(0, 7)
			.multiplyScalar(delta);
		_addVelocity.y -= gravity * delta;
		_addVelocity.x *= -1;

		velocity.current.add(_addVelocity);

		// velocity.current.y -= gravity * delta;
		velocity.current.multiplyScalar(1 - friction);

		// get velocity local to the eye
		localEyeVelocity.current.copy(velocity.current);
		localEyeVelocity.current.applyQuaternion(eyeRef.current.quaternion);

		// update local position
		localPosition.current.add(localEyeVelocity.current);
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
				<meshPhysicalMaterial
					transparent
					opacity={0.3}
					color="#fff"
					roughness={0.3}
					transmission={1}
					thickness={0.1}
					ior={1.5}
					clearcoat={1}
				/>
			</mesh>
		</group>
	);
};

type CrawlerProps = Omit<RigidBodyProps, 'ref'> & {
	def: CrawlerDef;
	debug?: boolean;
	ref?: Ref<CrawlerState>;
	isControlTarget?: boolean;
};

const Crawler = ({
	ref,
	def,
	debug = false,
	isControlTarget = false,
	...rigidBodyProps
}: CrawlerProps) => {
	const rigidBodyRef = useRef<Rapier.RigidBody>(null!);
	const groupRef = useRef<Group>(null!);

	useEffect(() => {
		const crawler = initCrawler(def);

		const entity = world.create({
			crawler,
			rigidBody: rigidBodyRef.current,
			three: groupRef.current,
			isControlTarget,
		});

		return () => {
			world.destroy(entity);
			disposeCrawler(crawler);
		};
	}, [def, isControlTarget]);

	return (
		<RigidBody
			{...rigidBodyProps}
			type="dynamic"
			shape={undefined}
			colliders={false}
			lockRotations
			ref={rigidBodyRef}
		>
			<group ref={groupRef}>
				<mesh receiveShadow castShadow>
					<sphereGeometry args={[0.5, 32, 32]} />
					<meshStandardMaterial color="orange" />
				</mesh>
				<BallCollider args={[0.5]} />

				<CrawlerGooglyEye
					position={[-0.25, 0.4, 0.5]}
					rotation={[-0.6, 0, 0]}
					eyeRadius={0.2}
					irisRadius={0.075}
				/>
				<CrawlerGooglyEye
					position={[0.25, 0.4, 0.5]}
					rotation={[-0.6, 0, 0]}
					eyeRadius={0.2}
					irisRadius={0.075}
				/>
			</group>
		</RigidBody>
	);
};

const BALLS: Array<{
	position: [number, number, number];
	color: string;
	radius: number;
}> = [
	{
		position: [-5, 5, 12],
		color: 'skyblue',
		radius: 1.2,
	},
	{
		position: [0, 5, 15],
		color: 'purple',
		radius: 1,
	},
	{
		position: [5, 5, 5],
		color: 'pink',
		radius: 0.8,
	},
	{
		position: [-5, 5, 4],
		color: 'aqua',
		radius: 0.6,
	},
	{
		position: [2, 5, 10],
		color: 'peachpuff',
		radius: 1.5,
	},
];

const Environment = () => (
	<>
		{/* floor */}
		<RigidBody type="fixed" position={[0, -1, 0]}>
			<CuboidCollider args={[20, 1, 20]} />
		</RigidBody>
		<mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
			<circleGeometry args={[20, 64]} />
			<meshStandardMaterial color="#333" />
		</mesh>

		{/* stairs */}
		{[...Array(10)].map((_, i) => (
			<RigidBody
				key={String(i)}
				type="fixed"
				shape="cuboid"
				position={[i * 1.5 - 9, -1 + i * 0.2, 2]}
			>
				<mesh castShadow receiveShadow>
					<boxGeometry args={[3, 3, 5]} />
					<meshStandardMaterial color="#555" />
				</mesh>
			</RigidBody>
		))}

		{/* spinning box */}
		<RigidBody
			type="kinematicVelocity"
			position={[7, 1, 12]}
			rotation={[0, Math.PI / 2, 0]}
			angularVelocity={[0, 0, 1]}
			colliders="cuboid"
		>
			<mesh castShadow receiveShadow>
				<boxGeometry args={[6, 2, 2]} />
				<meshStandardMaterial color="pink" />
			</mesh>
		</RigidBody>

		{/* balls */}
		{BALLS.map((ball, i) => (
			<RigidBody
				key={String(i)}
				type="dynamic"
				colliders="ball"
				position={ball.position}
				rotation={[0, Math.random() * Math.PI * 2, 0]}
			>
				<mesh castShadow receiveShadow>
					<sphereGeometry args={[ball.radius, 32, 32]} />
					<meshStandardMaterial color={ball.color} />
				</mesh>
			</RigidBody>
		))}
	</>
);

type PhysicsRefCaptureProps = {
	ref: Ref<RapierContext>;
};

const PhysicsRefCapture = ({ ref }: PhysicsRefCaptureProps) => {
	const context = useRapier();

	useImperativeHandle(ref, () => context, [context]);

	return null;
};

const App = () => {
	const rapierRef = useRef<RapierContext>(null!);

	const controls = useControls();

	const {
		debug,
		speed,
		sprintMultiplier,
		height,
		jumpImpulse,
		stepArcHeight,
		footPlacementStepDistanceThreshold,
		footPlacementEmergencyStepDistanceThreshold,
		nLegs,
		legLength,
		legSegments,
		attachRadius,
		footRadius,
		stepSpeed,
		stepCycleSpeed,
	} = useLevaControls({
		debug: false,
		speed: {
			label: 'Crawler Speed',
			value: 300,
			step: 1,
		},
		sprintMultiplier: {
			label: 'Sprint Multiplier',
			value: 2,
			step: 0.01,
		},
		height: {
			label: 'Crawler Height',
			value: 2,
			step: 0.01,
		},
		jumpImpulse: {
			label: 'Jump Impulse',
			value: 5,
			step: 1,
		},
		stepArcHeight: {
			label: 'Step Arc Height',
			value: 0.1,
			step: 0.01,
		},
		footPlacementStepDistanceThreshold: {
			label: 'Step Distance Threshold',
			value: 0.1,
			step: 0.01,
		},
		footPlacementEmergencyStepDistanceThreshold: {
			label: 'Emergency Step Distance Threshold',
			value: 1,
			step: 0.01,
		},
		nLegs: {
			label: 'Number of Legs',
			value: 4,
			step: 1,
		},
		legLength: {
			label: 'Leg Length',
			value: 1.5,
			step: 0.01,
		},
		legSegments: {
			label: 'Leg Segments',
			value: 5,
			step: 1,
		},
		attachRadius: {
			label: 'Attach Radius',
			value: 0.5,
			step: 0.01,
		},
		footRadius: {
			label: 'Foot Placement Radius',
			value: 1,
			step: 0.01,
		},
		stepSpeed: {
			label: 'Step Speed',
			value: 5,
			step: 0.01,
		},
		stepCycleSpeed: {
			label: 'Step Cycle Speed',
			value: 2,
			step: 0.01,
			min: 0.001,
		}
	});

	const crawlerDef: CrawlerDef = useMemo(() => {
		const legs: LegDef[] = [];

		for (let i = 0; i < nLegs; i++) {
			const angle = (i / nLegs) * Math.PI * 2 + Math.PI / 4;
			const x = Math.cos(angle);
			const z = Math.sin(angle);

			legs.push({
				id: `leg-${i}`,
				attachmentOffset: [x * attachRadius, -0.2, z * attachRadius],
				footPlacementOffset: [x * footRadius, 0, z * footRadius],
				segments: legSegments,
				legLength,
				phaseOffset: i > nLegs / 2 ? i / nLegs - 1 : i / nLegs,
			});
		}

		return {
			legs,
			speed,
			sprintMultiplier,
			height,
			jumpImpulse,
			stepArcHeight,
			footPlacementStepDistanceThreshold,
			footPlacementEmergencyStepDistanceThreshold,
			stepSpeed,
			stepCycleSpeed,
		};
	}, [
		speed,
		sprintMultiplier,
		height,
		jumpImpulse,
		stepArcHeight,
		footPlacementStepDistanceThreshold,
		footPlacementEmergencyStepDistanceThreshold,
		nLegs,
		legLength,
		legSegments,
		attachRadius,
		footRadius,
		stepSpeed,
		stepCycleSpeed,
	]);

	const cameraTarget = useRef<Vector3>(new Vector3());

	useEffect(() => {
		cameraTarget.current.set(0, 4, 0);
	}, []);

	useFrame(({ camera, scene }, frameDt) => {
		// clamp delta
		const dt = Math.min(frameDt, 0.1);

		/* input */
		const controlTargetCrawler = controlTargetCrawlerQuery.first;

		if (controlTargetCrawler) {
			const input = controlTargetCrawler.crawler.input;
			const cmd = controlTargetCrawler.crawler.cmd;

			/* update crawler input */
			input.direction.set(0, 0);

			if (controls.current.forward) {
				input.direction.y = -1;
			}
			if (controls.current.backward) {
				input.direction.y = 1;
			}
			if (controls.current.left) {
				input.direction.x = -1;
			}
			if (controls.current.right) {
				input.direction.x = 1;
			}
			input.crouch = controls.current.crouch;
			input.sprint = controls.current.sprint;

			if (controls.current.jump) {
				cmd.push('jump');
			}
		}

		/* before physics step */
		for (const entity of crawlerQuery) {
			updateCrawlerMovement(entity.crawler, entity.rigidBody, dt);
			updateCrawlerTimer(entity.crawler, dt);
			updateCrawlerSuspension(
				entity.crawler,
				entity.rigidBody,
				rapierRef.current.world,
				dt,
			);
		}

		/* physics step */
		rapierRef.current.step(dt);

		/* after physics step */
		for (const entity of crawlerQuery) {
			updateCrawlerPosition(entity.crawler, entity.rigidBody);
			updateCrawlerFootPlacement(
				entity.crawler,
				entity.three,
				entity.rigidBody,
				rapierRef.current.world,
			);
			updateCrawlerStepping(entity.crawler, entity.rigidBody, dt);
			updateCrawlerIK(entity.crawler, entity.three);
			updateCrawlerDebugVisuals(entity.crawler, debug, entity.three, scene);
			updateCrawlerVisuals(entity.crawler, entity.three);
		}

		/* camera rig */
		if (!debug && controlTargetCrawler) {
			cameraTarget.current.lerp(
				controlTargetCrawler.crawler.state.position,
				dt * 5,
			);
			camera.position
				.copy(cameraTarget.current)
				.add(_cameraOffset.set(0, 5, 15));

			camera.quaternion.setFromUnitVectors(
				_axis.set(0, 0, -1),
				_direction.copy(cameraTarget.current).sub(camera.position).normalize(),
			);
		}
	});

	return (
		<>
			<Physics debug={debug} gravity={[0, -20, 0]} timeStep="vary" paused>
				<PhysicsRefCapture ref={rapierRef} />

				<Crawler
					position={[0, 10, 2]}
					def={crawlerDef}
					debug={debug}
					isControlTarget
				/>

				<Environment />
			</Physics>

			<ambientLight intensity={1.5} />

			<directionalLight
				position={[-15, 10, 15]}
				intensity={1.5}
				castShadow
				shadow-mapSize-height={2048}
				shadow-mapSize-width={2048}
				shadow-camera-near={0.1}
				shadow-camera-far={45}
				shadow-camera-left={-30}
				shadow-camera-right={30}
				shadow-camera-top={10}
				shadow-camera-bottom={-5}
				shadow-bias={-0.005}
			>
				{debug && <Helper type={DirectionalLightHelper} />}
			</directionalLight>

			{debug && <OrbitControls makeDefault />}
			<PerspectiveCamera makeDefault position={[0, 5, 15]} />
		</>
	);
};

export function Sketch() {
	return (
		<>
			<WebGPUCanvas
				gl={{ antialias: true }}
				shadows={{ type: PCFSoftShadowMap }}
			>
				<App />
			</WebGPUCanvas>
			<Instructions>
				* wasd to move, space to jump, shift to sprint, c to crouch
			</Instructions>
			
			<Controls />
		</>
	);
}
