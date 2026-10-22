import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js'
import { useTalk } from '../store.js'
import { paint, CANVAS_SIZE, whenFontsReady } from '../catalog/paint.js'
import { overlay } from './PostFX.jsx'

// A soft drop shadow under each code cloud. It renders with the world (so
// it darkens the sea), while the cloud itself draws on the overlay layer.
const cloudShadow = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')
  // The blur must fade to zero inside the canvas, or the plane edge shows.
  ctx.filter = 'blur(12px)'
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.roundRect(48, 48, 160, 160, 60)
  ctx.fill()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
})()

if (import.meta.hot) import.meta.hot.dispose(() => cloudShadow.dispose())

// Soft cumulus shading: cool underside, sunlit top and a bright rim.
// The center faces the camera, so the area behind the text stays even.
function shadeCloud(shader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <opaque_fragment>',
    `
    float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
    float rim = pow(1.0 - facing, 3.0);
    float lift = smoothstep(-0.95, 0.75, normal.y);
    outgoingLight *= mix(vec3(0.84, 0.89, 0.96), vec3(1.03, 1.02, 1.0), lift);
    outgoingLight += vec3(1.0, 0.97, 0.92) * rim * 0.3 * lift;
    #include <opaque_fragment>`,
  )
}

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
  const morphText = Boolean(
    slide.codeWall || slide.worldId === 'middleware-cache',
  )
  const group = useRef()
  const cloudMesh = useRef()
  const localCamera = useMemo(() => new THREE.Vector3(), [])
  const morph = useMemo(
    () => ({ previousMap: { value: null }, textBlend: { value: 1 } }),
    [],
  )
  const morphElapsed = useRef(0.45)
  const lastPaint = useRef(null)
  useFrame(({ camera }, delta) => {
    if (morphElapsed.current < 0.45) {
      morphElapsed.current = Math.min(
        0.45,
        morphElapsed.current + Math.min(delta, 0.1),
      )
      const t = morphElapsed.current / 0.45
      morph.textBlend.value = t * t * (3 - 2 * t)
    }
    if (!group.current || !cloudMesh.current) return
    localCamera.copy(camera.position)
    group.current.worldToLocal(localCamera)
    if (localCamera.z > 0.01)
      cloudMesh.current.position.set(
        (-0.24 * localCamera.x) / localCamera.z,
        (-0.24 * localCamera.y) / localCamera.z,
        0,
      )
  })
  const cloudGeometry = useMemo(() => {
    if (appearance !== 'cloud') return null
    const field = new MarchingCubes(
      56,
      new THREE.MeshBasicMaterial(),
      false,
      false,
      30000,
    )
    field.isolation = 80
    for (let x = 0; x < 7; x++) {
      for (let y = 0; y < 3; y++) {
        const phase = x * 2.17 + y * 1.61
        field.addBall(
          0.2 + x * 0.1,
          0.36 + y * 0.14 + Math.sin(phase) * 0.025,
          0.5 + Math.cos(phase) * 0.03,
          0.85 + Math.sin(phase) * 0.16,
          12,
        )
      }
    }
    field.update()
    const geometry = new THREE.BufferGeometry()
    const count = field.geometry.drawRange.count * 3
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(
        field.geometry.attributes.position.array.slice(0, count),
        3,
      ),
    )
    geometry.setAttribute(
      'normal',
      new THREE.BufferAttribute(
        field.geometry.attributes.normal.array.slice(0, count),
        3,
      ),
    )
    geometry.computeBoundingBox()
    const size = geometry.boundingBox.getSize(new THREE.Vector3())
    geometry.center()
    geometry.scale(
      1.78 / size.x,
      (halfPanel ? 2 : compact ? 0.66 : 1.02) / size.y,
      0.4 / size.z,
    )
    geometry.translate(0, 0, -0.24)
    field.geometry.dispose()
    field.material.dispose()
    return geometry
  }, [appearance, compact, halfPanel])
  useEffect(() => () => cloudGeometry?.dispose(), [cloudGeometry])
  const shadow = useRef()
  useLayoutEffect(() => {
    overlay(group.current)
    shadow.current?.layers.set(0)
  }, [cloudGeometry])
  const cloudHeight = halfPanel ? 2 : compact ? 0.66 : 1.02

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
    if (!morphText) return null
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
  }, [morphText])
  useEffect(() => () => history?.map.dispose(), [history])
  const compileMorph = useMemo(
    () => (shader) => {
      Object.assign(shader.uniforms, morph)
      shader.fragmentShader =
        'uniform sampler2D previousMap;\nuniform float textBlend;\n' +
        shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
      #ifdef USE_MAP
        vec4 oldText = sRGBTransferOETF(texture2D(previousMap, vMapUv));
        vec4 newText = sRGBTransferOETF(texture2D(map, vMapUv));
        float alpha = mix(oldText.a, newText.a, textBlend);
        vec3 rgb = mix(oldText.rgb * oldText.a, newText.rgb * newText.a, textBlend) / max(alpha, 0.00001);
        diffuseColor *= sRGBTransferEOTF(vec4(rgb, alpha));
      #endif
    `,
      )
    },
    [morph],
  )

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
        morphElapsed.current = 0.45
        morph.textBlend.value = 1
      }
      paint(
        texture.image,
        slide,
        step,
        theme,
        appearance === 'cloud' ? 'cloud-ink' : appearance,
      )
      texture.repeat.set(
        halfPanel ? 0.5 : 1,
        halfPanel ? 1 : compact ? 660 / 1080 : 1,
      )
      texture.offset.set(0, !halfPanel && compact ? 320 / 1080 : 0)
      texture.needsUpdate = true
      lastPaint.current = { id: slide.id, wall: morphText }
    }
    draw()
    whenFontsReady(draw)
    return () => {
      active = false
    }
  }, [
    slide,
    step,
    theme,
    texture,
    appearance,
    compact,
    halfPanel,
    history,
    morph,
    morphText,
  ])
  useEffect(() => () => texture.dispose(), [texture])

  return (
    <group
      ref={group}
      position={position}
      rotation={rotation}
      scale={appearance === 'cloud' ? [scale[0], scale[1], scale[0]] : scale}
      visible={visible}
    >
      {cloudGeometry && (
        <mesh ref={cloudMesh} geometry={cloudGeometry}>
          <meshStandardMaterial
            color="#f7f9fa"
            emissive="#fdfbf6"
            emissiveIntensity={0.3}
            roughness={1}
            metalness={0}
            onBeforeCompile={shadeCloud}
          />
          <mesh
            ref={shadow}
            position={[0.03, -0.045, 0]}
            scale={[1.78 * 1.5, cloudHeight * 1.48, 1]}
          >
            <planeGeometry />
            <meshBasicMaterial
              map={cloudShadow}
              color="#04202f"
              transparent
              opacity={0.55}
              depthWrite={false}
              fog={false}
            />
          </mesh>
        </mesh>
      )}
      <mesh position={[0, 0, appearance === 'cloud' ? 0.03 : 0]}>
        <planeGeometry args={[1.6, halfPanel ? 1.8 : compact ? 0.55 : 0.9]} />
        <meshBasicMaterial
          key={morphText ? 'wall-text' : 'text'}
          map={texture}
          transparent
          depthWrite={false}
          toneMapped={false}
          onBeforeCompile={morphText ? compileMorph : undefined}
        />
      </mesh>
    </group>
  )
}
