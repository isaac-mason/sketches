import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLoaderData } from 'react-router';
import { create } from 'zustand';
import { Spinner, useDebounce } from '../../common';
import type { SketchMeta } from '../../dev/utils';
import sketchesMetadata from '../generated/sketches.json';
import { GitHubIcon } from './svgs/GitHubIcon';
import { WindowMaximizeIcon } from './svgs/WindowMaximizeIcon';

const sketches = (sketchesMetadata satisfies SketchMeta[]).filter(
	(s: SketchMeta) => !s.hidden,
);

type SketchLoaderData = {
	sketchPath: string;
	sketchUrl: string;
	sketchMetadata: SketchMeta;
};

const LazySketch = () => {
	const { sketchMetadata, sketchPath, sketchUrl } =
		useLoaderData() as SketchLoaderData;

	const wrapperRef = useRef<HTMLDivElement>(null!);
	const [iframe, setIframe] = useState<HTMLIFrameElement | null>();
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (!sketchMetadata) return;

		document.title =
			sketchMetadata.path === 'intro'
				? 'Sketches | Isaac Mason'
				: `${sketchMetadata.title} | Sketches`;
	}, [sketchMetadata]);

	useEffect(() => {
		if (!iframe) return;

		setLoading(true);

		const onResize = () => {
			iframe.style.width = `${wrapperRef.current.clientWidth}px`;
			iframe.style.height = `${wrapperRef.current.clientHeight}px`;
		};

		const resizeObserver = new ResizeObserver(onResize);

		resizeObserver.observe(wrapperRef.current);

		return () => {
			resizeObserver.disconnect();
		};
	}, [iframe]);

	return (
		<div
			className="relative flex h-full w-full items-center justify-center md:w-[calc(100%-350px)]"
			ref={wrapperRef}
		>
			{(sketchMetadata.options?.displayTitle ?? true) && (
				<h1 className="absolute top-5 left-5 z-2 m-0 text-[2em] font-bold text-white">
					{sketchMetadata?.title}
				</h1>
			)}

			{loading && (
				<div className="absolute top-0 left-0 z-2 flex h-full w-full items-center justify-center">
					<Spinner />
				</div>
			)}

			<iframe
				title="sketch"
				key={sketchPath}
				ref={setIframe}
				src={sketchUrl}
				loading="eager"
				allow="cross-origin-isolated"
				onLoad={() => setLoading(false)}
			/>
		</div>
	);
};

type NavItemProps = {
	sketch: SketchMeta;
	currentSketchPath: string;
	closeNav: () => void;
};

const AudioSvg = (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="32"
		height="32"
		viewBox="0 0 256 256"
	>
		<title>audio</title>
		<path d="M155.51,24.81a8,8,0,0,0-8.42.88L77.25,80H32A16,16,0,0,0,16,96v64a16,16,0,0,0,16,16H77.25l69.84,54.31A8,8,0,0,0,160,224V32A8,8,0,0,0,155.51,24.81ZM32,96H72v64H32ZM144,207.64,88,164.09V91.91l56-43.55Zm54-106.08a40,40,0,0,1,0,52.88,8,8,0,0,1-12-10.58,24,24,0,0,0,0-31.72,8,8,0,0,1,12-10.58ZM248,128a79.9,79.9,0,0,1-20.37,53.34,8,8,0,0,1-11.92-10.67,64,64,0,0,0,0-85.33,8,8,0,1,1,11.92-10.67A79.83,79.83,0,0,1,248,128Z" />
	</svg>
);

const DesktopOnlySvg = (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="32"
		height="32"
		viewBox="0 0 256 256"
	>
		<title>desktop only</title>
		<path d="M213.92,210.62l-160-176A8,8,0,1,0,42.08,45.38L56,60.69V216a24,24,0,0,0,24,24h96a24,24,0,0,0,23.82-21.11l2.26,2.49a8,8,0,1,0,11.84-10.76ZM184,216a8,8,0,0,1-8,8H80a8,8,0,0,1-8-8V78.29l112,123.2ZM68.7,24a8,8,0,0,1,8-8H176a24,24,0,0,1,24,24V150.83a8,8,0,1,1-16,0V40a8,8,0,0,0-8-8H76.7A8,8,0,0,1,68.7,24Z" />
	</svg>
);

const NavItem = ({ sketch, closeNav }: NavItemProps) => {
	const notices = useMemo(() => {
		const notices: { svg: ReactNode; title: string }[] = [];

		if (sketch.options?.showAudioNotice ?? false) {
			notices.push({ svg: AudioSvg, title: 'This sketch has audio' });
		}

		if (sketch.options?.showDesktopOnlyNotice ?? false) {
			notices.push({
				svg: DesktopOnlySvg,
				title: 'This sketch is desktop only',
			});
		}

		return notices;
	}, [sketch]);

	return (
		<Link
			className="group text-decoration-none relative flex w-full flex-col items-start justify-start rounded-[0.2em] border border-[#444] bg-[#333] transition-all duration-300 ease-in-out hover:scale-[1.02] hover:border-[#999] hover:bg-[#444]"
			to={`/sketch/${sketch.path}`}
			onClick={() => closeNav()}
			title={sketch.title}
		>
			{sketch.cover ? (
				<img
					className="user-select-none w-full rounded-t-[0.2em] object-cover aspect-[3/2]"
					src={sketch.cover}
					alt={sketch.title}
					loading="lazy"
				/>
			) : undefined}

			{notices.length > 0 && (
				<div className="absolute top-0 right-0 z-2 flex flex-row gap-2 p-4">
					{notices.map((notice) => (
						<div
							className="flex h-[2em] w-[2em] items-center justify-center rounded-full border border-[#999] bg-[#333] fill-[#fff] p-2 text-[1em]"
							title={notice.title}
							key={notice.title}
						>
							{notice.svg}
						</div>
					))}
				</div>
			)}

			<div className="p-2 text-[1em] text-white">{sketch.title}</div>

			{sketch.tags && (
				<div className="mb-2 flex flex-wrap gap-1 px-2 text-xs text-white italic">
					{sketch.tags.map((tag) => (
						<span key={tag} className="bg-[#444] p-1 group-hover:bg-[#555]">
							{tag}
						</span>
					))}
				</div>
			)}
		</Link>
	);
};

type NavState = {
	open: boolean;
	toggleNav: () => void;
	closeNav: () => void;
};

const useNav = create<NavState>((set, get) => ({
	open: false,
	toggleNav: () => set({ open: !get().open }),
	closeNav: () => set({ open: false }),
}));

const SideNav = () => {
	const { sketchPath } = useLoaderData() as SketchLoaderData;
	const { open: navOpen, closeNav } = useNav();

	const [searchTerm, setSearchTerm] = useState('');
	const debouncedSearchTerm = useDebounce(searchTerm);

	const filteredSketches = useMemo(() => {
		if (debouncedSearchTerm.trim() === '') return sketches;

		return sketches.filter((s) => {
			const match = `${s?.title.toLowerCase() ?? ''} ${s?.tags?.join(' ').toLowerCase() ?? ''}`;

			return match.includes(debouncedSearchTerm.toLowerCase());
		});
	}, [debouncedSearchTerm]);

	return (
		<>
			<div
				className={`absolute transition duration-500 ${navOpen ? 'translate-x-0' : '-translate-x-full'} top-0 left-0 z-4 h-full w-[300px] min-w-[300px] overflow-x-hidden overflow-y-scroll bg-[#111] md:relative md:w-[350px] md:min-w-[350px] md:translate-x-0`}
			>
				<div className="sticky top-0 z-5 w-full border-b border-[#333] bg-[#111] p-4">
					<input
						className="w-full rounded-[0.2em] border-none bg-[#333] p-2 text-[1em] font-normal text-white"
						placeholder="Search for a sketch..."
						onInput={(e: React.ChangeEvent<HTMLInputElement>) =>
							setSearchTerm(e.target.value)
						}
					/>
				</div>

				<div className="flex flex-col items-center justify-start gap-6 p-4">
					{filteredSketches.map((s) => (
						<NavItem
							key={s.path}
							sketch={s}
							currentSketchPath={sketchPath}
							closeNav={closeNav}
						/>
					))}
				</div>
			</div>
		</>
	);
};

export const App = () => {
	const { sketchPath, sketchUrl } = useLoaderData() as SketchLoaderData;

	const { open: navOpen, toggleNav, closeNav } = useNav();

	return (
		<>
			<div className="relative flex h-full w-full flex-col items-center justify-center md:flex-row">
				<SideNav />
				<LazySketch />
			</div>
			{/* side nav background */}
			<div
				className={`absolute top-0 left-0 h-full w-full transition-all duration-500 md:hidden ${navOpen ? 'bg-[#00000066]' : 'pointer-events-none bg-transparent'}`}
				onPointerDown={() => closeNav()}
			/>
			{/* side nav toggle */}
			<button
				type="button"
				className="absolute bottom-5 left-5 z-2 m-0 flex items-center gap-1.5 rounded-[0.2em] bg-black fill-white stroke-white p-2 no-underline transition-all duration-300 ease-in-out hover:scale-[1.02] hover:border-[#999] hover:bg-[#444] md:bottom-7 md:left-7 md:hidden"
				onClick={toggleNav}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="32"
					height="32"
					viewBox="0 0 256 256"
				>
					<title>nav</title>
					<path d="M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128ZM40,72H216a8,8,0,0,0,0-16H40a8,8,0,0,0,0,16ZM216,184H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Z" />
				</svg>
			</button>
            {/* sketch url and github link */}
			<div className="absolute right-5 bottom-5 z-2 m-0 flex items-center gap-4 text-2xl text-white no-underline md:right-7 md:bottom-7">
				<a
					className="block h-[40px] w-[40px] rounded-[0.2em] bg-[#cccccc33] fill-white stroke-white p-2"
					target="_blank"
					href={`https://github.com/isaac-mason/sketches/tree/main/sketches/${sketchPath}`}
					rel="noreferrer"
				>
					<GitHubIcon />
				</a>

				<a
					className="block h-[40px] w-[40px] rounded-[0.2em] bg-[#cccccc33] fill-white stroke-white p-2"
					target="_blank"
					href={sketchUrl}
					rel="noreferrer"
				>
					<WindowMaximizeIcon />
				</a>
			</div>
			)
		</>
	);
};
