import {expect, test} from '@jest/globals'
import z from 'zod'
import {newConfig} from './config'

const BasicConfig = z.object({
  string: z.string(),
  number: z.number(),
  object: z.object({
    a: z.string().optional(),
    b: z.string().optional(),
    c: z.string().optional()
  })
})

test('parses a basic config file', () => {
  const config = newConfig(BasicConfig)
    .readFile('fixtures/config1.json')
    .parse()

  expect(config.string).toEqual('string')
  expect(config.number).toEqual(1)
  expect(config.object).toEqual({a: 'a', b: 'b'})
})

test('deep-merges multiple configs', () => {
  const config = newConfig(BasicConfig)
    .readValue({string: 'string', number: 0})
    .readFile('fixtures/config1.json')
    .readFile('fixtures/config2.json')
    .parse()

  expect(config.string).toEqual('string')
  expect(config.number).toEqual(1)
  expect(config.object).toEqual({a: 'a', b: 'b', c: 'c'})
})

test('reads from the environment', () => {
  process.env['FOO'] = 'bar'

  const config = newConfig(z.object({foo: z.string()}))
    .readEnv()
    .parse()
  expect(config.foo).toEqual('bar')
})

test('merges value, file, environment', () => {
  process.env['OBJECT_A'] = 'a from env'
  process.env['OBJECT_C'] = 'c from env'

  const config = newConfig(BasicConfig)
    .readValue({string: 'string from value', number: -1})
    .readFile('fixtures/config1.json')
    .readEnv()
    .parse()

  expect(config.string).toEqual('string')
  expect(config.number).toEqual(1)
  expect(config.object).toEqual({a: 'a from env', b: 'b', c: 'c from env'})
})

test('handles camel-cased names in env vars', () => {
  process.env['FOOBAR'] = 'baz'

  const config = newConfig(z.object({fooBar: z.string(), foobar: z.string()}))
    .readEnv()
    .parse()

  expect(config.fooBar).toEqual('baz')
  expect(config.foobar).toEqual('baz')
})

test('handles conflicting property names and object paths', () => {
  process.env['FOO_BAR'] = 'baz'

  const config = newConfig(
    z.object({
      foo_bar: z.string(),
      foo: z.object({
        bar: z.string()
      })
    })
  )
    .readEnv()
    .parse()

  expect(config.foo_bar).toEqual('baz')
  expect(config.foo.bar).toEqual('baz')
})

test('handles preprocessing', () => {
  process.env['COUNT'] = '1'

  const config = newConfig(
    z.object({
      count: z.preprocess(
        v => (typeof v === 'string' ? parseInt(v, 10) : v),
        z.number()
      )
    })
  )
    .readEnv()
    .parse()

  expect(config.count).toEqual(1)
})

test('parses asynchronously', async () => {
  const config = await newConfig(BasicConfig)
    .readFile('fixtures/config1.json')
    .readFile('fixtures/config2.json')
    .parseAsync()

  expect(config.string).toEqual('string')
  expect(config.number).toEqual(1)
  expect(config.object).toEqual({a: 'a', b: 'b', c: 'c'})
})

test('parses safely', () => {
  const config = newConfig(z.object({foo: z.string()}))
    .readValue({foo: 'foo'})
    .safeParse()

  expect.assertions(1)

  if (config.success) {
    expect(config.data.foo).toEqual('foo')
  }
})

test('parses safely with an error', () => {
  const config = newConfig(z.object({foo: z.string()}))
    .readValue({foo: 1})
    .safeParse()

  expect.assertions(1)

  if (!config.success) {
    expect(config.error).toEqual(
      z.ZodError.create([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['foo'],
          message: 'Expected string, received number'
        }
      ])
    )
  }
})
