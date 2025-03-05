import { Global } from "../generated/schema";

export function getGlobal(): Global {
  let global = Global.load('');
  if (global == null) {
    global = new Global('');
    global.totalMechs = 0;
  }
  return global as Global;
}
