import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useTalk } from '../store.js'
import { colors, shackLight, shackSlides } from './layout.js'
import { Shack, TreasureIsland } from './Shack.jsx'
import { MapWorld } from './MapWorld.jsx'
import { allLayers } from './PostFX.jsx'

// Low golden-hour sun behind the cabin window, slightly to the left.
const shackSun = new THREE.Vector3(...shackLight).normalize()
const shackTarget = new THREE.Vector3(0, 0.8, -1)

export function World() {
  const id = useTalk((s) => s.slides[s.sceneIndex ?? s.index].id)
  const shack = shackSlides.has(id)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  // Compile the materials of both worlds once, in the background, for the
  // render-target variant that the composer draws with. Without this the
  // first cabin/map switch froze for about a second under the clouds.
  useEffect(() => {
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
    })
    const previous = gl.getRenderTarget()
    gl.setRenderTarget(target)
    const world = gl.compileAsync(scene, camera)
    // Labels and text clouds draw straight to the screen: that variant too.
    gl.setRenderTarget(null)
    const overlays = gl.compileAsync(scene, camera)
    gl.setRenderTarget(previous)
    Promise.all([world, overlays])
      .catch(() => {})
      .finally(() => target.dispose())
  }, [gl, scene, camera])
  const target = useMemo(() => new THREE.Object3D(), [])
  if (shack) target.position.copy(shackTarget)
  else target.position.set(0, -50, -4)
  const sunPosition = shack
    ? shackTarget.clone().addScaledVector(shackSun, 20).toArray()
    : [-18, -25, -15]

  return (
    <>
      <fog
        attach="fog"
        args={[
          shack ? colors.skyShack : colors.skyMap,
          shack ? 18 : 55,
          shack ? 140 : 160,
        ]}
      />
      <ambientLight
        ref={allLayers}
        intensity={shack ? 0.2 : 0.7}
        color={shack ? '#ffe2c2' : '#ffffff'}
      />
      <hemisphereLight
        ref={allLayers}
        args={
          shack ? ['#ffd2a3', '#4a3324', 0.62] : ['#fff2d4', '#77765d', 1.5]
        }
      />
      <primitive object={target} />
      <directionalLight
        key={shack ? 'shack-sun' : 'map-sun'}
        ref={allLayers}
        position={sunPosition}
        target={target}
        intensity={shack ? 3.6 : 2.5}
        color={shack ? '#ffbe78' : '#fff4d8'}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={shack ? 4 : 0.5}
        shadow-camera-far={shack ? 40 : 80}
        shadow-camera-left={shack ? -7 : -35}
        shadow-camera-right={shack ? 7 : 35}
        shadow-camera-top={shack ? 7 : 35}
        shadow-camera-bottom={shack ? -7 : -35}
        shadow-normalBias={shack ? 0.012 : 0.025}
        shadow-radius={shack ? 3 : 1}
      />
      {/* Both worlds keep the same light count (zero intensity on the map),
          so a world switch never forces a shader recompile. */}
      <pointLight
        ref={allLayers}
        position={[0, 2.1, 1.6]}
        intensity={shack ? 1.6 : 0}
        color="#ffd9b0"
      />
      {/* Sunlit floorboards bounce warm light onto the furniture. */}
      <pointLight
        ref={allLayers}
        position={[0, 0.35, 0.6]}
        intensity={shack ? 1.4 : 0}
        distance={5}
        color="#ff9f5a"
      />
      <Shack />
      <TreasureIsland />
      <MapWorld />
    </>
  )
}
