import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js'
import { useTalk } from '../store.js'
import { paint, CANVAS_SIZE, whenFontsReady } from '../catalog/paint.js'

export function Surface({
  position = [0, 1.4, 0.02],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  visible = true,
  appearance = 'cloud',
  content,
  contentStep,
}) {
  const currentSlide = useTalk((s) => s.slides[s.sceneIndex ?? s.index])
  const slide = content || currentSlide
  const currentStep = useTalk((s) => s.sceneStep ?? s.step)
  const step = contentStep ?? currentStep
  const theme = useTalk((s) => s.talk.theme)
  const compact = slide.form === 'code'
  const halfPanel = slide.halfPanel
  const group = useRef()
  const cloudMesh = useRef()
  const localCamera = useMemo(() => new THREE.Vector3(), [])
  const morph = useMemo(() => ({ previousMap: { value: null }, textBlend: { value: 1 } }), [])
  const morphElapsed = useRef(.9)
  const lastPaint = useRef(null)
  useFrame(({ camera }, delta) => {
    if (morphElapsed.current < .9) {
      morphElapsed.current = Math.min(.9, morphElapsed.current + Math.min(delta, .1))
      const t = morphElapsed.current / .9
      morph.textBlend.value = t * t * (3 - 2 * t)
    }
    if (!group.current || !cloudMesh.current) return
    localCamera.copy(camera.position)
    group.current.worldToLocal(localCamera)
    if (localCamera.z > .01) cloudMesh.current.position.set(-.24 * localCamera.x / localCamera.z, -.24 * localCamera.y / localCamera.z, 0)
  })
  const cloudGeometry = useMemo(() => {
    if (appearance !== 'cloud') return null
    const field = new MarchingCubes(56, new THREE.MeshBasicMaterial(), false, false, 30000)
    field.isolation = 80
    for (let x = 0; x < 7; x++) {
      for (let y = 0; y < 3; y++) {
        const phase = x * 2.17 + y * 1.61
        field.addBall(.2 + x * .1, .36 + y * .14 + Math.sin(phase) * .025, .5 + Math.cos(phase) * .03, .85 + Math.sin(phase) * .16, 12)
      }
    }
    field.update()
    const geometry = new THREE.BufferGeometry()
    const count = field.geometry.drawRange.count * 3
    geometry.setAttribute('position', new THREE.BufferAttribute(field.geometry.attributes.position.array.slice(0, count), 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(field.geometry.attributes.normal.array.slice(0, count), 3))
    geometry.computeBoundingBox()
    const size = geometry.boundingBox.getSize(new THREE.Vector3())
    geometry.center()
    geometry.scale(1.78 / size.x, (halfPanel ? 2 : compact ? .66 : 1.02) / size.y, .4 / size.z)
    geometry.translate(0, 0, -.24)
    field.geometry.dispose(); field.material.dispose()
    return geometry
  }, [appearance, compact, halfPanel])
  useEffect(() => () => cloudGeometry?.dispose(), [cloudGeometry])

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = CANVAS_SIZE.w
    canvas.height = CANVAS_SIZE.h
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 8
    return map
  }, [])

  const history = useMemo(() => {
    if (!slide.codeWall) return null
    const canvas = document.createElement('canvas')
    canvas.width = CANVAS_SIZE.w
    canvas.height = CANVAS_SIZE.h
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 8
    const scratch = document.createElement('canvas')
    scratch.width = CANVAS_SIZE.w
    scratch.height = CANVAS_SIZE.h
    return { map, scratch }
  }, [Boolean(slide.codeWall)])
  useEffect(() => () => history?.map.dispose(), [history])
  const compileMorph = useMemo(() => shader => {
    Object.assign(shader.uniforms, morph)
    shader.fragmentShader = 'uniform sampler2D previousMap;\nuniform float textBlend;\n' + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec4 oldText = sRGBTransferOETF(texture2D(previousMap, vMapUv));
        vec4 newText = sRGBTransferOETF(texture2D(map, vMapUv));
        float alpha = mix(oldText.a, newText.a, textBlend);
        vec3 rgb = mix(oldText.rgb * oldText.a, newText.rgb * newText.a, textBlend) / max(alpha, 0.00001);
        diffuseColor *= sRGBTransferEOTF(vec4(rgb, alpha));
      #endif
    `)
  }, [morph])

  useLayoutEffect(() => {
    let active = true
    const draw = () => {
      if (!active) return
      if (history) {
        morph.previousMap.value = history.map
        if (lastPaint.current?.wall && lastPaint.current.id !== slide.id) {
          const snapshot = history.scratch.getContext('2d')
          snapshot.save()
          snapshot.globalCompositeOperation = 'copy'
          snapshot.globalAlpha = 1 - morph.textBlend.value
          snapshot.drawImage(history.map.image, 0, 0)
          snapshot.globalCompositeOperation = 'lighter'
          snapshot.globalAlpha = morph.textBlend.value
          snapshot.drawImage(texture.image, 0, 0)
          snapshot.restore()
          const previous = history.map.image.getContext('2d')
          previous.save()
          previous.globalCompositeOperation = 'copy'
          previous.drawImage(history.scratch, 0, 0)
          previous.restore()
          history.map.needsUpdate = true
          morphElapsed.current = 0
          morph.textBlend.value = 0
        }
      } else {
        morph.previousMap.value = null
        morphElapsed.current = .9
        morph.textBlend.value = 1
      }
      paint(texture.image, slide, step, theme, appearance === 'cloud' ? 'cloud-ink' : appearance)
      texture.repeat.set(halfPanel ? .5 : 1, halfPanel ? 1 : compact ? 660 / 1080 : 1)
      texture.offset.set(0, !halfPanel && compact ? 320 / 1080 : 0)
      texture.needsUpdate = true
      lastPaint.current = { id: slide.id, wall: Boolean(slide.codeWall) }
    }
    draw()
    whenFontsReady(draw)
    return () => { active = false }
  }, [slide, step, theme, texture, appearance, compact, halfPanel, history, morph])
  useEffect(() => () => texture.dispose(), [texture])

  return (
    <group ref={group} position={position} rotation={rotation} scale={appearance === 'cloud' ? [scale[0], scale[1], scale[0]] : scale} visible={visible}>
      {cloudGeometry && <mesh ref={cloudMesh} geometry={cloudGeometry}>
        <meshStandardMaterial color="#f2f5f6" roughness={1} metalness={0} />
      </mesh>}
      <mesh position={[0, 0, appearance === 'cloud' ? .03 : 0]}>
        <planeGeometry args={[1.6, halfPanel ? 1.8 : compact ? .55 : .9]} />
        <meshBasicMaterial key={slide.codeWall ? 'wall-text' : 'text'} map={texture} transparent depthWrite={false} toneMapped={false} onBeforeCompile={slide.codeWall ? compileMorph : undefined} />
      </mesh>
    </group>
  )
}
