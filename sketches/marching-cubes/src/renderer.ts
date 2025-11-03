import * as THREE from 'three/webgpu';

export const initRenderer = async () => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 10000);

    const ambientLight = new THREE.AmbientLight(0xffffff, 5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    const renderer = new THREE.WebGPURenderer({ antialias: true });
    document.body.appendChild(renderer.domElement);
    await renderer.init();

    const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize, false);
    onResize();

    return {
        scene,
        camera,
        renderer,
    };
};

export type RendererState = ReturnType<typeof initRenderer> extends Promise<infer T> ? T : never;

export const updateRenderer = (state: RendererState) => {
    state.renderer.render(state.scene, state.camera);
};
