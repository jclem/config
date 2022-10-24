# @jclem/config

This is a configuration library for Node.js. Inspired by the excellent
[Viper](https://github.com/spf13/viper) library for Go, Config allows one to
stop relying on reading from unstructured, untyped, and unsafe environment
variables for runtime configuration and instead use a structured, typed, and
safe configuration schema populated by raw values, configuration files, and the
environment, instead.

Config uses [Zod](https://zod.dev) for schema validation.

## Use

```shell
$ npm install @jclem/config
```

```typescript
import {newConfig} from '@jclem/config'
import z from 'zod'

process.env['DATABASE__URL'] = 'mysql://localhost:3306/mydb'
process.env['DATABASE__POOL_SIZE'] = '10'

// Define a configuration schema using Zod.
const Config = z.object({
  database: z.object({
    url: z.string(),
    poolSize: z.preprocess(
      v => (typeof v === 'string' ? parseInt(v, 10) : v),
      z.number()
    )
  })
})

export const config = newSchema(Config).readEnv().parse()

console.log(config.database.url) // mysql://localhost:3306/mydb
console.log(config.database.poolSize) // 10
```

### Reading Configuration Input

#### Reading a Raw Value

Config can read configuration input from a raw value by calling `readValue`:

```typescript
import {newConfig} from '@jclem/config'

const config = newConfig(z.object({foo: z.string()}))
  .readValue({foo: 'bar'})
  .parse()

console.log(config.foo) // bar
```

#### Reading a Configuration File

Config can read configuration input from a JSON file by calling `readFile`:

```typescript
import {newConfig} from '@jclem/config'

// config.json
// {"foo": "bar"}

const config = newConfig(z.object({foo: z.string()}))
  .readFile('config.json')
  .parse()

console.log(config.foo) // bar
```

A non-JSON file can also be read by supplying a tuple containing a file path and
a parser function with the signature `(data: Buffer) => unknown`:

```typescript
import {newConfig} from '@jclem/config'
import {load} from 'js-yaml'

// config.yaml
// foo: bar

const config = newConfig(z.object({foo: z.string()}))
  .readFile(['config.yaml', b => load(b.toString())])
  .parse()

console.log(config.foo) // bar
```

#### Reading the Environment

Config can read configuration input from environment variables by calling
`readEnv`:

```typescript
import {newConfig} from '@jclem/config'

process.env.FOO = 'bar'

const config = newConfig(z.object({foo: z.string()}))
  .readEnv()
  .parse()

console.log(config.foo) // bar
```

Note that currently, Config converts schema paths to double-underscore-separated
uppercased environment variable names. So, for example, the schema path
`database.url` would be converted to the environment variable `DATABASE__URL`
and the schema path `database.poolSize` would be converted to the environment
variable `DATABASE__POOL_SIZE` (capital letters imply a single-underscore
separation).

Note that this means that a schema with both `database.url` and `database__url`
will have both values populated from the same environment variable,
`DATABASE__URL`.

### Configuration Source Precedence

Config will read configuration input from the following sources in the following
order:

1. **Raw values**, overwritten by...
2. **Configuration files**, overwritten by...
3. **Environment variables**

For example:

```typescript
import {newConfig} from '@jclem/config'

const Schema = z.object({
  a: z.string(),
  b: z.string(),
  c: z.string()
})

const value = {a: 'a', b: 'b', c: 'c'}

// config.json
// {"b": "b from file", "c": "c from file"}

process.env.C = 'c from env'

const config = newConfig(Schema)
  .readValue(value)
  .readFile('config.json')
  .readEnv()
  .parse()

console.log(config.a) // a
console.log(config.b) // b from file
console.log(config.c) // c from env
```

Note that the order in which `readValue`, `readFile`, and `readEnv` are called
does not matter.
