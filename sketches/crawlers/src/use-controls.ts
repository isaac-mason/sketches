import { type RefObject, useEffect, useRef } from 'react';

const keyControlMap = {
	ArrowDown: 'backward',
	ArrowLeft: 'left',
	ArrowRight: 'right',
	ArrowUp: 'forward',
	a: 'left',
	d: 'right',
	s: 'backward',
	w: 'forward',
	A: 'left',
	D: 'right',
	S: 'backward',
	W: 'forward',
	' ': 'jump',
} as const;

type KeyCode = keyof typeof keyControlMap;
type GameControl = (typeof keyControlMap)[KeyCode];

const keyCodes = Object.keys(keyControlMap) as KeyCode[];
const isKeyCode = (v: unknown): v is KeyCode => keyCodes.includes(v as KeyCode);

export type Controls = Record<GameControl, boolean>;

const useKeyControls = (
	{ current }: RefObject<Controls>,
	map: Record<KeyCode, GameControl>,
) => {
	useEffect(() => {
		const handleKeydown = ({ key }: KeyboardEvent) => {
			if (!isKeyCode(key)) return;
			current[map[key]] = true;
		};
		window.addEventListener('keydown', handleKeydown);

		const handleKeyup = ({ key }: KeyboardEvent) => {
			if (!isKeyCode(key)) return;
			current[map[key]] = false;
		};
		window.addEventListener('keyup', handleKeyup);

		return () => {
			window.removeEventListener('keydown', handleKeydown);
			window.removeEventListener('keyup', handleKeyup);
		};
	}, [current, map]);
};

const initialControls: Controls = Object.values(keyControlMap).reduce(
	(acc, control) => {
		acc[control] = false;
		return acc;
	},
	{} as Controls,
);

export const useControls = () => {
	const controls = useRef<Controls>({ ...initialControls });

	useKeyControls(controls, keyControlMap);

	return controls;
};
