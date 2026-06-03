export const runInThisContext = (): never => {
  throw new Error("Node vm is unavailable in the browser.");
};

export default {
  runInThisContext
};
