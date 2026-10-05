import type { CadMatrix, CadPoint } from './types.ts'

export const identity = (): CadMatrix => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
export function multiply(a: CadMatrix, b: CadMatrix): CadMatrix {
  return Array.from({ length: 16 }, (_, i) => {
    const row = i % 4, column = Math.floor(i / 4)
    return [0, 1, 2, 3].reduce((sum, k) => sum + a[k * 4 + row] * b[column * 4 + k], 0)
  })
}
export function transformPoint(m: CadMatrix, p: CadPoint): CadPoint {
  return { x: m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12], y: m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13], z: m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14] }
}
function cross(a: CadPoint, b: CadPoint): CadPoint { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x } }
function unit(v: CadPoint): CadPoint {
  const l = Math.hypot(v.x, v.y, v.z)
  if (!l) throw new Error('CAD extrusion normal cannot be zero.')
  return { x: v.x / l, y: v.y / l, z: v.z / l }
}
/** Autodesk DXF arbitrary-axis algorithm, including negative/tilted extrusion. */
export function ocsMatrix(normal: CadPoint): CadMatrix {
  const z = unit(normal), x = unit(cross(Math.abs(z.x) < 1 / 64 && Math.abs(z.y) < 1 / 64 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 }, z)), y = cross(z, x)
  return [x.x, x.y, x.z, 0, y.x, y.y, y.z, 0, z.x, z.y, z.z, 0, 0, 0, 0, 1]
}
export function insertMatrix(position: CadPoint, scale: CadPoint, angleDegrees: number, base: CadPoint, normal: CadPoint, offset: CadPoint): CadMatrix {
  const a = angleDegrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
  // MINSERT spacing rotates with the array, but is not multiplied by block scale.
  const matrix = [c * scale.x, s * scale.x, 0, 0, -s * scale.y, c * scale.y, 0, 0, 0, 0, scale.z, 0,
    position.x + c * offset.x - s * offset.y - c * scale.x * base.x + s * scale.y * base.y,
    position.y + s * offset.x + c * offset.y - s * scale.x * base.x - c * scale.y * base.y,
    position.z - scale.z * base.z, 1]
  return multiply(ocsMatrix(normal), matrix)
}
