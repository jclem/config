import {expect, test} from '@jest/globals'
import {load} from 'js-yaml'
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

test('accepts a custom parser', () => {
  const config = newConfig(BasicConfig)
    .readFile(['fixtures/config1.yml', b => load(b.toString())])
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

  process.env['FOO__BAR'] = 'baz'
  const nestedConfig = newConfig(z.object({foo: z.object({bar: z.string()})}))
    .readEnv()
    .parse()
  expect(nestedConfig.foo.bar).toEqual('baz')
})

test('merges value, file, environment', () => {
  process.env['OBJECT__A'] = 'a from env'
  process.env['OBJECT__C'] = 'c from env'

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
  process.env['FOO_BAR'] = 'baz'
  process.env['FOOBAR'] = 'qux'

  const config = newConfig(z.object({fooBar: z.string(), foobar: z.string()}))
    .readEnv()
    .parse()

  expect(config.fooBar).toEqual('baz')
  expect(config.foobar).toEqual('qux')
})

test('handles conflicting property names and object paths', () => {
  process.env['FOO_BAR'] = 'baz'

  const config = newConfig(
    z.object({
      fooBar: z.string(),
      foo_bar: z.string()
    })
  )
    .readEnv()
    .parse()

  expect(config.foo_bar).toEqual('baz')
  expect(config.fooBar).toEqual('baz')
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
