/** Use actual returned IFC triangles; this view never derives or changes quantities. */
export function bimPreviewScene(elements) {
  const objects = (elements || []).filter(row => row.mesh?.vertices?.length && row.mesh?.triangles?.length).map(row => {
    const points = []
    for (let i = 0; i < row.mesh.vertices.length; i += 3) points.push(row.mesh.originMeters.map((origin, axis) => origin + row.mesh.vertices[i + axis]))
    return { id: row.globalId, name: row.name || row.globalId, points, triangles: row.mesh.triangles }
  })
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (const object of objects) for (const point of object.points) for (let axis = 0; axis < 3; axis++) { min[axis] = Math.min(min[axis], point[axis]); max[axis] = Math.max(max[axis], point[axis]) }
  return { objects, center: min.map((value, axis) => (value + max[axis]) / 2), span: Math.max(...min.map((value, axis) => max[axis] - value), 0.001) }
}

export function createBimPreview({ React }) {
  const h = React.createElement
  return function BimPreview({ elements, zh = true, selectedId = '', onSelect }) {
    const canvas = React.useRef(null), drag = React.useRef(null)
    const scene = React.useMemo(() => bimPreviewScene(elements), [elements])
    const [view, setView] = React.useState({ yaw: -0.65, pitch: 0.65, zoom: 1 }), selected = selectedId
    const t = (cn, en) => zh ? cn : en
    React.useEffect(() => {
      const node = canvas.current
      if (!node || !scene.objects.length) return
      const draw = () => {
        const width = node.clientWidth, height = 320, ratio = Math.min(window.devicePixelRatio || 1, 2)
        node.width = width * ratio; node.height = height * ratio
        const ctx = node.getContext('2d'); ctx.scale(ratio, ratio)
        ctx.fillStyle = '#edf2f5'; ctx.fillRect(0, 0, width, height)
        const scale = Math.min(width, height) * 0.64 / scene.span * view.zoom
        const project = point => {
          const [x, y, z] = point.map((n, axis) => n - scene.center[axis])
          const rx = x * Math.cos(view.yaw) - y * Math.sin(view.yaw), ry = x * Math.sin(view.yaw) + y * Math.cos(view.yaw)
          return [width / 2 + rx * scale, height / 2 + (ry * Math.sin(view.pitch) - z * Math.cos(view.pitch)) * scale, ry * Math.cos(view.pitch) + z * Math.sin(view.pitch)]
        }
        const faces = []
        for (const object of scene.objects) {
          const points = object.points.map(project)
          for (let i = 0; i < object.triangles.length; i += 3) {
            const face = object.triangles.slice(i, i + 3).map(index => points[index])
            faces.push({ id: object.id, points: face, depth: face.reduce((sum, point) => sum + point[2], 0) / 3 })
          }
        }
        faces.sort((a, b) => a.depth - b.depth)
        for (const face of faces) {
          ctx.beginPath(); ctx.moveTo(face.points[0][0], face.points[0][1]); ctx.lineTo(face.points[1][0], face.points[1][1]); ctx.lineTo(face.points[2][0], face.points[2][1]); ctx.closePath()
          ctx.fillStyle = selected && face.id !== selected ? '#d4dce2' : face.id === selected ? '#35a4bc' : '#6691aa'
          ctx.fill(); ctx.lineWidth = 0.5; ctx.strokeStyle = '#42677d'; ctx.stroke()
        }
        ctx.fillStyle = '#394e5c'; ctx.font = '12px sans-serif'
        ctx.fillText(`${scene.objects.length} ${t('个实际构件 · 单位 m · 范围', 'IFC elements · m · span')} ${scene.span.toFixed(3)} m`, 12, height - 12)
      }
      draw()
      const observer = new ResizeObserver(draw); observer.observe(node)
      return () => observer.disconnect()
    }, [scene, view, selected, zh])
    if (!scene.objects.length) return null
    return h('section', { 'aria-label': t('IFC 几何预览', 'IFC geometry preview'), style: { margin: '12px 0' } },
      h('p', null, t('拖动旋转；下方可选择构件。仅显示本次返回的真实网格，隐藏或未处理构件仍需检查。', 'Drag to rotate and select an element below. Only returned meshes are shown; other elements still need inspection.')),
      h('canvas', { ref: canvas, style: { width: '100%', height: 320, touchAction: 'none', borderRadius: 8 }, 'aria-label': t('可旋转的 IFC 构件预览', 'Rotatable IFC element preview'), onPointerDown: event => { drag.current = [event.clientX, event.clientY]; event.currentTarget.setPointerCapture(event.pointerId) }, onPointerMove: event => { if (!drag.current) return; const [x, y] = drag.current; drag.current = [event.clientX, event.clientY]; setView(old => ({ ...old, yaw: old.yaw + (event.clientX - x) / 150, pitch: Math.max(-1.5, Math.min(1.5, old.pitch + (event.clientY - y) / 150)) })) }, onPointerUp: () => { drag.current = null }, onPointerCancel: () => { drag.current = null } }),
      h('div', { className: 'ap-engineering-tools' },
        h('button', { onClick: () => setView(old => ({ ...old, yaw: old.yaw + 0.3 })) }, t('旋转', 'Rotate')),
        h('button', { onClick: () => setView(old => ({ ...old, zoom: Math.min(4, old.zoom * 1.25) })) }, t('放大', 'Zoom in')),
        h('button', { onClick: () => setView(old => ({ ...old, zoom: Math.max(0.2, old.zoom / 1.25) })) }, t('缩小', 'Zoom out')),
        h('button', { onClick: () => { setView({ yaw: -0.65, pitch: 0.65, zoom: 1 }); onSelect?.('') } }, t('复位视图', 'Reset view')),
        h('select', { 'aria-label': t('选择 IFC 构件', 'Select IFC element'), value: selected, onChange: event => onSelect?.(event.target.value), style: { maxWidth: '100%' } }, h('option', { value: '' }, t('全部构件', 'All elements')), ...scene.objects.map(row => h('option', { key: row.id, value: row.id }, row.name)))),
      selected && h('small', null, 'GlobalId: ' + selected))
  }
}
