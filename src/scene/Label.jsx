import { useMemo, useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { colors } from './layout.js'
import { whenFontsReady } from '../catalog/paint.js'

export function Label({ text, position = [0, 0, 0], scale = [2.6, 0.65, 1] }) {
  const sprite = useRef()
  const worldPosition = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    if (!sprite.current) return
    sprite.current.getWorldPosition(worldPosition)
    const distance = camera.position.distanceTo(worldPosition)
    const pixels =
      (scale[1] * size.height * (128 / 192)) /
      (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance)
    const factor = THREE.MathUtils.clamp(1, 24 / pixels, 48 / pixels)
    sprite.current.scale.set(
      (scale[0] * factor * texture.image.width) / 768,
      scale[1] * factor,
      1,
    )
  })
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 768
    canvas.height = 192
    const ctx = canvas.getContext('2d')
    ctx.font =
      '700 128px "Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif'
    canvas.width = Math.max(768, Math.ceil(ctx.measureText(text).width + 32))
    ctx.fillStyle = colors.ink
    ctx.font =
      '700 128px "Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 10
    ctx.strokeStyle = colors.cream
    ctx.strokeText(text, canvas.width / 2, 96)
    ctx.fillText(text, canvas.width / 2, 96)
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    return map
  }, [text])

  useEffect(() => {
    let active = true
    whenFontsReady(() => {
      if (!active) return
      const ctx = texture.image.getContext('2d')
      ctx.font = '700 128px "Bricolage Grotesque", sans-serif'
      const width = Math.max(768, Math.ceil(ctx.measureText(text).width + 32))
      if (width !== texture.image.width) texture.dispose()
      texture.image.width = width
      ctx.font = '700 128px "Bricolage Grotesque", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 10
      ctx.strokeStyle = colors.cream
      ctx.fillStyle = colors.ink
      ctx.strokeText(text, texture.image.width / 2, 96)
      ctx.fillText(text, texture.image.width / 2, 96)
      texture.needsUpdate = true
    })
    return () => {
      active = false
      texture.dispose()
    }
  }, [text, texture])

  return (
    <sprite ref={sprite} position={position} scale={scale}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  )
}
