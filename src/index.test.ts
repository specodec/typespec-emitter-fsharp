import { describe, it, expect } from 'vitest';
import { mkScalar } from '@specodec/typespec-emitter-core/test-utils';
import { typeToFsharp, readExpr, defaultValue } from './index.js';

describe('typeToFsharp', () => {
  it('string → string', () => expect(typeToFsharp(mkScalar('string') as any)).toBe('string'));
  it('boolean → bool', () => expect(typeToFsharp(mkScalar('boolean') as any)).toBe('bool'));
  it('int32 → int', () => expect(typeToFsharp(mkScalar('int32') as any)).toBe('int'));
  it('int64 → int64', () => expect(typeToFsharp(mkScalar('int64') as any)).toBe('int64'));
  it('float32 → float32', () => expect(typeToFsharp(mkScalar('float32') as any)).toBe('float32'));
  it('float64 → float', () => expect(typeToFsharp(mkScalar('float64') as any)).toBe('float'));
  it('bytes → byte[]', () => expect(typeToFsharp(mkScalar('bytes') as any)).toBe('byte[]'));
  it('model → model name', () => expect(typeToFsharp({ kind: 'Model', name: 'User' } as any)).toBe('User'));
});

describe('readExpr', () => {
  it('int32', () => expect(readExpr(mkScalar('int32') as any)).toContain('ReadInt32'));
  it('string', () => expect(readExpr(mkScalar('string') as any)).toContain('ReadString'));
  it('bool', () => expect(readExpr(mkScalar('boolean') as any)).toContain('ReadBool'));
  it('float32', () => expect(readExpr(mkScalar('float32') as any)).toContain('ReadFloat32'));
  it('bytes', () => expect(readExpr(mkScalar('bytes') as any)).toContain('ReadBytes'));
});
