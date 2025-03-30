import { MainModule } from "./types";

declare const Module: () => Promise<MainModule>;
export default Module;
export type Engine = MainModule;
export * from "./types";

