import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const script = resolve(process.cwd(), 'test', 'e2e', 'runsInDeno', 'runner.mjs')
const importMap = resolve(
  process.cwd(),
  'test',
  'e2e',
  'runsInDeno',
  'import-map.json'
)

const result =
  process.platform === 'win32'
    ? spawnSync(
        'pwsh',
        [
          '-NoProfile',
          '-Command',
          `deno run --quiet --allow-read --import-map "${importMap}" "${script}"`,
        ],
        {
          stdio: 'inherit',
        }
      )
    : spawnSync(
        'deno',
        ['run', '--quiet', '--allow-read', '--import-map', importMap, script],
        {
          stdio: 'inherit',
        }
      )

if (result.status !== 0) process.exit(result.status ?? 1)
