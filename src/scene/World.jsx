import { useMemo } from 'react'
import * as THREE from 'three'
import { useTalk } from '../store.js'
import { colors, shackSlides } from './layout.js'
import { Shack } from './Shack.jsx'
import { MapWorld } from './MapWorld.jsx'

export function World() {
  const id = useTalk((s) => s.slides[s.sceneIndex ?? s.index].id)
  const shack = shackSlides.has(id)
  const target = useMemo(() => new THREE.Object3D(), [])
  target.position.set(0, shack ? 0 : -50, shack ? -2 : -4)

  return (
    <>
      <fog attach="fog" args={[shack ? colors.skyShack : colors.skyMap, shack ? 18 : 55, shack ? 90 : 160]} />
      <ambientLight intensity={shack ? .5 : .7} />
      <hemisphereLight args={['#fff2d4', '#77765d', shack ? .7 : 1.5]} />
      <primitive object={target} />
      <directionalLight
        position={shack ? [-4, 8, -6] : [-18, -25, -15]}
        target={target}
        intensity={shack ? 1.8 : 2.5}
        color={shack ? colors.sunsetHi : '#fff4d8'}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={80}
        shadow-camera-left={-35}
        shadow-camera-right={35}
        shadow-camera-top={35}
        shadow-camera-bottom={-35}
        shadow-normalBias={.025}
      />
      {shack ? <pointLight position={[0, 2, 2]} intensity={4.5} color="#fff1d5" /> : null}
      <Shack />
      <MapWorld />
    </>
  )
}
