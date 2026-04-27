import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("core package directory:", __dirname);

// Import core (local)
import * as core from "./dist/index.js";
console.log("core types/functions imported successfully!");

// Import negotiator (local)
const negotiatorPath = join(__dirname, "..", "negotiator", "dist", "index.js");
console.log("negotiator dist path:", negotiatorPath);
import * as negotiator from negotiatorPath;
console.log("negotiator imported successfully!");

// Import vault (local)
import * as vault from join(__dirname, "..", "vault", "dist", "index.js");
console.log("vault imported successfully!");

// Import sdk (local)
import * as sdk from join(__dirname, "..", "sdk", "dist", "index.js");
console.log("sdk imported successfully!");
