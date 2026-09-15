import { Suspense, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { useTalk } from './store.js'
import { bindNav } from './nav.js'
import { World } from './scene/World.jsx'
import { CameraRig } from './scene/CameraRig.jsx'
import { Hud } from './hud/Hud.jsx'
import { FlatView } from './flat/FlatView.jsx'
import { colors, shackSlides } from './scene/layout.js'

function SkyColor() {
  const id = useTalk((s) => s.slides[s.sceneIndex ?? s.index].id)
  const shack = shackSlides.has(id)
  return <color attach="background" args={[shack ? colors.skyShack : colors.skyMap]} />
}

export function App() {
  const bootFromUrl = useTalk((s) => s.bootFromUrl)
  const flat = useTalk.getState().isFlat()

  useEffect(() => {
    bootFromUrl()
    return bindNav(useTalk)
  }, [bootFromUrl])

  if (flat) {
    return (
      <>
        <FlatView />
        <Hud />
      </>
    )
  }

  return (
    <>
      <Canvas camera={{ fov: 42, near: 0.1, far: 1000 }} dpr={[1, 2]} shadows>
        <SkyColor />
        <CameraRig />
        <Suspense fallback={null}>
          <World />
        </Suspense>
      </Canvas>
      <Hud />
    </>
  )
}
