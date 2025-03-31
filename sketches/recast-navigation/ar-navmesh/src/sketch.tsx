import { OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Fullscreen } from '@react-three/uikit';
import {
	IfInSessionMode,
	PointerEvents,
	XR,
	createXRStore,
	noEvents,
} from '@react-three/xr';
import { World } from 'arancini';
import { useEffect, useState } from 'react';
import { Crowd, type CrowdAgent, init as initRecast } from 'recast-navigation';
import type { TiledNavMeshGeneratorConfig } from 'recast-navigation/generators';
import {
	type Camera,
	Mesh,
	MeshBasicMaterial,
	Object3D,
	Raycaster,
	type Scene,
	SphereGeometry,
	Vector3,
} from 'three';
import { XRNavigation, type XRNavigationRefType } from './navigation';
import { EnterXRButton } from './xr-button';

await initRecast();

const NAVIGATION_CONFIG = {
	cs: 0.03,
	ch: 0.03,
	tileSize: 32,
	walkableHeight: 10,
	walkableRadius: 5,
} satisfies Partial<TiledNavMeshGeneratorConfig>;

const _origin = new Vector3();
const _direction = new Vector3();
const _raycaster = new Raycaster();

type EntityType = {
	transform: Object3D;

	three: Object3D;

	crowdAgent?: CrowdAgent;
	crowdAgentState?: { lastPlanTime: number };
};

const MAX_AGENTS = 100;
const MAX_AGENT_RADIUS = 1;
const CROWD_AGENT_REPLAN_INTERVAL = 0.5;

const spawnFollowerEntity = (state: State, position: Vector3) => {
	/* initial transform */
	const transform = new Object3D();
	transform.position.copy(position);

	/* mesh */
	const three = new Object3D();

	const mesh = new Mesh(
		new SphereGeometry(0.5, 16, 16),
		new MeshBasicMaterial({ color: 0x00ff00 }),
	);
	mesh.position.y = 0.25;

	/* crowd agent */
	const crowdAgent = state.crowd.addAgent(position, {
		radius: MAX_AGENT_RADIUS,
	});

	const crowdAgentState = {
		lastPlanTime: 0,
	};

	/* create entity */
	const entity = {
		transform,
		three,
		crowdAgent,
		crowdAgentState,
	};

	state.world.create(entity);
};

const init = (
	scene: Scene,
	camera: Camera,
	navigation: NonNullable<XRNavigationRefType>,
) => {
	const world = new World<EntityType>();

	const queries = {
		agents: world.query((e) => e.has('transform', 'crowdAgent', 'three')),
		three: world.query((e) => e.has('transform', 'three')),
	};

	queries.three.onEntityAdded.add((e) => {
		e.three.add(e.three);
	});

	queries.three.onEntityRemoved.add((e) => {
		e.three.remove(e.three);
	});

	const crowd = new Crowd(navigation.navMesh, {
		maxAgents: MAX_AGENTS,
		maxAgentRadius: MAX_AGENT_RADIUS,
	});

	const player = {
		transform: new Object3D(),
	};

	return {
		time: 0,
		player,
		world,
		queries,
		navigation,
		crowd,
		scene,
		camera,
	};
};

type State = ReturnType<typeof init>;

const updateAgentMovement = (state: State, dt: number) => {
	/* find current player position on the navmesh */
	_origin.copy(state.camera.position);

	const hits = _raycaster.intersectObject(state.navigation.walkableMesh, true);
	const hit = hits[0];

	if (hit) {
		state.player.transform.position.copy(hit.point);
	}

	/* periodic agent replanning */
	for (const agent of state.queries.agents) {
		const crowdAgent = agent.crowdAgent!;

		if (
			state.time - agent.crowdAgentState!.lastPlanTime >
			CROWD_AGENT_REPLAN_INTERVAL
		) {
			agent.crowdAgentState!.lastPlanTime = state.time;
			crowdAgent.requestMoveTarget(state.player.transform.position);
		}
	}

	/* update the crowd */
	state.crowd.update(dt);

	/* stick to floor */
	for (const agent of state.queries.agents) {
		const crowdAgent = agent.crowdAgent!;

		_origin.copy(crowdAgent.position());
		_direction.set(0, -1, 0);

		_raycaster.set(_origin, _direction);

		const hits = _raycaster.intersectObject(
			state.navigation.walkableMesh,
			true,
		);
		const hit = hits[0];

		if (hit) {
			agent.transform.position.copy(hit.point);
		}
	}
};

const updateThreeTransforms = (state: State) => {
	for (const entity of state.queries.three) {
		entity.three.position.copy(entity.transform.position);
		entity.three.quaternion.copy(entity.transform.quaternion);
		entity.three.scale.copy(entity.transform.scale);
		entity.three.updateMatrix();
	}
};

const update = (state: State, dt: number) => {
	state.time += dt;

	updateAgentMovement(state, dt);
	updateThreeTransforms(state);
};

const dispose = (state: State) => {
	state.navigation.navMesh.destroy();
	state.crowd.destroy();
};

const store = createXRStore({
	offerSession: 'immersive-ar',
	emulate: false,
});

const App = () => {
	const scene = useThree((state) => state.scene);
	const camera = useThree((state) => state.camera);
	const [navigation, setNavigation] = useState<XRNavigationRefType>(null);

	const [state, setState] = useState<State | null>(null);

	useEffect(() => {
		if (!navigation) return;

		const state = init(scene, camera, navigation);

		setState(state);

		return () => {
			setState(null);
			dispose(state);
		};
	}, [scene, camera, navigation]);

	useFrame((_, dt) => {
		if (!state) return;

		update(state, dt);
	});

	const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
		if (!state) return;

		spawnFollowerEntity(state, e.point);
	};

	return (
		<XR store={store}>
			<group onPointerDown={onPointerDown}>
				<XRNavigation debug config={NAVIGATION_CONFIG} ref={setNavigation} />
			</group>
			<PointerEvents />
			<ambientLight intensity={0.5} />
			<directionalLight position={[5, 5, 5]} />
			<OrbitControls />
			<IfInSessionMode deny={['immersive-ar', 'immersive-vr']}>
				<Fullscreen
					flexDirection="row"
					padding={20}
					paddingRight={50}
					alignItems="flex-start"
					justifyContent="flex-end"
					pointerEvents="listener"
					pointerEventsOrder={3}
				>
					<EnterXRButton />
				</Fullscreen>
			</IfInSessionMode>
		</XR>
	);
};

export const Sketch = () => {
	return (
		<Canvas events={noEvents}>
			<App />
		</Canvas>
	);
};
