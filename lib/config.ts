import {readFile, readFileSync} from 'node:fs'
import * as z from 'zod'

/** A {@link z.ZodObject} definition used to define config */
export type ConfigType = z.ZodObject<z.ZodRawShape>

/**
 * Create a new {@link Config} instance for a given {@link ConfigType}.
 *
 * @example
 * ```ts
 * const config = newConfig(z.object({
 *   foo: z.string()
 * }))
 *  .readEnv()
 *  .parseSync()
 *
 * console.log(config.foo) // process.env['FOO']
 * ```
 */
export function newConfig<T extends ConfigType>(schema: T): Config<T> {
  return new Config(schema)
}

/**
 * A tuple comprising a file path and a function to parse the contents of that file
 */
export type FileEntry = [path: string, parse: (contents: Buffer) => unknown]

class Config<T extends ConfigType> {
  private readonly schema: T
  private readonly files: FileEntry[] = []
  private readonly values: Record<string, unknown>[] = []
  private readFromEnv: boolean = false

  constructor(schema: T) {
    this.schema = schema
  }

  /**
   * Read config values directly from the given record(s).
   *
   * @remarks
   * Can be called with a variadic list of values or can be called multiple
   * times to build up a list of values.
   *
   * @example
   * newConfig(schema).readValue({foo: 'bar'}, {baz: 'qux'}).parseSync()
   */
  readValue(...values: Record<string, unknown>[]): this {
    this.values.push(...values)
    return this
  }

  /**
   * Read config values from the given JSON config file(s).
   *
   * @remarks
   * Can be called with a variadic list of config file paths or can be called
   * multiple times to build up a list of config files to read from.
   *
   * A {@link FileEntry}—a type comprising file path and a parse function—can be
   * passed to parse non-JSON files.
   *
   * @example
   * ```typescript
   * newConfig(Config)
   *  .readFile('config.json', ['config2.yaml', yaml.parse])
   *  .readFile(['config.toml', toml.parse])
   *  .parse()
   * ```
   *
   * Reading is not done until {@link parseAsync} or {@link parse} is called.
   *
   * @param filePaths The paths to the config file(s) to read
   */
  readFile(...filePaths: (string | FileEntry)[]): this {
    this.files.push(
      ...filePaths.map<FileEntry>(p =>
        isFileEntry(p) ? p : [p, this.parseFile]
      )
    )
    return this
  }

  /**
   * Read config values from environment variables.
   */
  readEnv(): this {
    this.readFromEnv = true
    return this
  }

  /**
   * Asynchronously parse the values, config files, and environment (if enabled)
   * into a configuration object matching the schema given to {@link newConfig}.
   *
   * @returns A promise that resolves to the parsed configuration object.
   */
  async parseAsync(): Promise<z.infer<T>> {
    const input = await this.getInputAsync()
    const output = await this.schema.parseAsync(input)
    return output
  }

  /**
   * Asynchronously safely parse the values, config files, and environment (if
   * enabled) into a configuration object matching the schema given to {@link
   * newConfig}.
   *
   * @remarks
   * This calls `safeParseAsync` on the Zod schema.
   *
   * @returns A promise that resolves to the parsed configuration object.
   */
  async safeParseAsync(): Promise<z.SafeParseReturnType<unknown, z.infer<T>>> {
    const input = await this.getInputAsync()
    const result = await this.schema.safeParseAsync(input)
    return result
  }

  /**
   * Synchronously parse the values, config files, and environment (if enabled)
   * into a configuration object matching the schema given to {@link newConfig}.
   *
   * @returns The parsed configuration object.
   */
  parse(): z.infer<T> {
    const input = this.getInput()
    const output = this.schema.parse(input)
    return output
  }

  /**
   * Synchronously parse the values, config files, and environment (if enabled)
   * into a configuration object matching the schema given to {@link newConfig}.

   * @remarks
   * This calls `safeParse` on the Zod schema.
   *
   * @returns The parsed configuration object.
   */
  safeParse(): z.SafeParseReturnType<unknown, z.infer<T>> {
    const input = this.getInput()
    const output = this.schema.safeParse(input)
    return output
  }

  private async getInputAsync() {
    return deepMerge(
      this.readInValues(),
      await this.readInFiles(),
      this.readInEnv()
    )
  }

  private getInput() {
    return deepMerge(
      this.readInValues(),
      this.readInFilesSync(),
      this.readInEnv()
    )
  }

  private readInValues() {
    return deepMerge(...this.values)
  }

  private async readInFiles() {
    const files = await Promise.all(
      this.files.map(entry => {
        return new Promise<Record<string, unknown>>((resolve, reject) => {
          readFile(entry[0], (err, data) =>
            err
              ? reject(err)
              : resolve(z.object({}).passthrough().parse(entry[1](data)))
          )
        })
      })
    )

    return deepMerge(...files)
  }

  private readInFilesSync() {
    const files = this.files.map(entry =>
      z
        .object({})
        .passthrough()
        .parse(entry[1](readFileSync(entry[0])))
    )
    return deepMerge(...files)
  }

  private parseFile(data: Buffer): Record<string, unknown> {
    return z.object({}).passthrough().parse(JSON.parse(data.toString()))
  }

  // Iterate over the schema shape recursively, and read values out of
  // environment variables. A value at the path `foo.bar.baz` should be read
  // from `FOO_BAR_BAZ`, and a value at the path `fooBar.baz` should be read
  // from `FOOBAR_BAZ`.
  private readInEnv() {
    if (!this.readFromEnv) return {}

    const input: Record<string, any> = {}

    const readEnvValue = (path: string[]) => {
      const envVarName = path.map(p => p.toUpperCase()).join('_')
      return process.env[envVarName]
    }

    const readEnv = (path: string[], schema: z.ZodTypeAny) => {
      if (isZodObject(schema)) {
        for (const key in schema.shape) {
          readEnv([...path, key], schema.shape[key])
        }
      } else {
        const value = readEnvValue(path)

        if (value != null) {
          path.reduce((input, key, index) => {
            if (index === path.length - 1) {
              input[key] = value
            } else {
              input[key] = input[key] ?? {}
            }

            return input[key]
          }, input)
        }
      }
    }

    readEnv([], this.schema)

    return input
  }
}

function isZodObject(value: object): value is z.ZodObject<any> {
  return Reflect.has(value, 'shape')
}

function deepMerge(...objects: Record<string, unknown>[]) {
  return objects.reduce((output, object) => {
    for (const key in object) {
      const outputValue = output[key]
      const objectValue = object[key]
      if (isRecord(outputValue) && isRecord(objectValue)) {
        output[key] = deepMerge(outputValue, objectValue)
      } else {
        output[key] = object[key]
      }
    }

    return output
  }, {})
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value)
}

function isFileEntry(v: string | FileEntry): v is FileEntry {
  return Array.isArray(v)
}
