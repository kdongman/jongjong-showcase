import { cp, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, 'public', 'mediapipe');
const wasmSource = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite';

await mkdir(output, { recursive: true });
await cp(wasmSource, join(output, 'wasm'), { recursive: true, force: true });

const response = await fetch(modelUrl);
if (!response.ok) throw new Error(`MEDIAPIPE_MODEL_DOWNLOAD_FAILED:${response.status}`);
await writeFile(join(output, 'selfie_segmenter_landscape.tflite'), new Uint8Array(await response.arrayBuffer()));
