// sharp ships ESM-first typings, which the CommonJS build cannot call directly;
// load the CommonJS entry at runtime and borrow its matching types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp') as typeof import('sharp/dist/index.cjs');

export default sharp;
