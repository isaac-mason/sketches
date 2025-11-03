import type { Camera, WebGPURenderer } from 'three/webgpu';
import * as THREE from 'three/webgpu';

export const initFlyControls = (renderer: WebGPURenderer, camera: Camera) => {
    const state = {
        isPointerLocked: false,
        // rotation around y
        yaw: 0,
        // rotation around x (clamped)
        pitch: 0,
        // movement
        moveForward: false,
        moveBackward: false,
        moveLeft: false,
        moveRight: false,
        moveUp: false,
        moveDown: false,
    };

    renderer.domElement.tabIndex = 0;
    renderer.domElement.style.outline = 'none';

    const updateCursorForPointerLock = () => {
        // hide cursor while pointer locked
        if (state.isPointerLocked) {
            renderer.domElement.style.cursor = 'none';
        } else {
            renderer.domElement.style.cursor = 'auto';
        }
    };

    const onClick = () => {
        renderer.domElement.focus();
        renderer.domElement.requestPointerLock();
    };

    const onPointerLockChange = () => {
        state.isPointerLocked = document.pointerLockElement === renderer.domElement;
        updateCursorForPointerLock();
    };

    const onMouseMove = (event: MouseEvent) => {
        if (!state.isPointerLocked) return;

        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;

        const sensitivity = 0.0025;
        state.yaw -= movementX * sensitivity;
        state.pitch -= movementY * sensitivity;

        // clamp pitch to avoid flipping
        const maxPitch = Math.PI / 2 - 0.01;
        if (state.pitch > maxPitch) state.pitch = maxPitch;
        if (state.pitch < -maxPitch) state.pitch = -maxPitch;

        // apply rotation to camera
        camera.rotation.set(state.pitch, state.yaw, 0, 'ZYX');
    };

    const onKeyDown = (event: KeyboardEvent) => {
        switch (event.code) {
            case 'KeyW':
                state.moveForward = true;
                break;
            case 'KeyS':
                state.moveBackward = true;
                break;
            case 'KeyA':
                state.moveLeft = true;
                break;
            case 'KeyD':
                state.moveRight = true;
                break;
            case 'Space':
                state.moveUp = true;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                state.moveDown = true;
                break;
        }
    };

    const onKeyUp = (event: KeyboardEvent) => {
        switch (event.code) {
            case 'KeyW':
                state.moveForward = false;
                break;
            case 'KeyS':
                state.moveBackward = false;
                break;
            case 'KeyA':
                state.moveLeft = false;
                break;
            case 'KeyD':
                state.moveRight = false;
                break;
            case 'Space':
                state.moveUp = false;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                state.moveDown = false;
                break;
        }
    };

    const onPointerLockError = (ev: Event) => {
        console.warn('Pointer lock error', ev);
    };

    // setup listeners
    renderer.domElement.addEventListener('click', onClick);
    document.addEventListener('pointerlockerror', onPointerLockError);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // movement vectors
    const direction = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    const update = (delta: number) => {
        if (!state.isPointerLocked) return;

        const speed = 50 * delta; // units per second

        // get camera direction vectors
        camera.getWorldDirection(direction);
        right.crossVectors(direction, up).normalize();

        const velocity = new THREE.Vector3();

        if (state.moveForward) velocity.add(direction);
        if (state.moveBackward) velocity.sub(direction);
        if (state.moveRight) velocity.add(right);
        if (state.moveLeft) velocity.sub(right);
        if (state.moveUp) velocity.add(up);
        if (state.moveDown) velocity.sub(up);

        velocity.normalize().multiplyScalar(speed);
        camera.position.add(velocity);
    };

    // dispose logic
    const dispose = () => {
        renderer.domElement.removeEventListener('click', onClick);
        document.removeEventListener('pointerlockerror', onPointerLockError);
        document.removeEventListener('pointerlockchange', onPointerLockChange);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
    };

    return {
        state,
        update,
        dispose,
    };
};

export type FlyControlsState = ReturnType<typeof initFlyControls>;
