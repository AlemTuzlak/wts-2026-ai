import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useTalk } from '../store.js'
import { shackSlides } from './layout.js'
import { overlay } from './PostFX.jsx'

const ease = (value) => value * value * (3 - 2 * value)
const progress = (value, start, end) =>
  THREE.MathUtils.clamp((value - start) / (end - start), 0, 1)

export function CameraRig() {
  const index = useTalk((s) => s.index)
  const step = useTalk((s) => s.step)
  const slides = useTalk((s) => s.slides)
  const camera = useThree((s) => s.camera)
  const currentLook = useRef(new THREE.Vector3())
  const state = useRef(null)
  const cloud = useRef()
  const projectionShift = useRef(0)
  const uniforms = useMemo(
    () => ({
      coverage: { value: 0 },
      time: { value: 0 },
      aspect: { value: 1 },
      fadeOnly: { value: 0 },
    }),
    [],
  )
  const key = `${index}:${step}`
  const slide = slides[index]
  const waypoint = slide.cameras?.[step] || slide.camera
  const splitSide = slide.splitSides?.[step] || slide.splitSide
  const targetShift =
    splitSide === 'left' ? -0.25 : splitSide === 'right' ? 0.25 : 0

  useFrame(({ clock, size }, delta) => {
    const time = clock.elapsedTime
    uniforms.time.value = time
    uniforms.aspect.value = size.width / size.height
    if (state.current?.done && state.current.key === key)
      projectionShift.current = targetShift
    camera.setViewOffset(
      size.width,
      size.height,
      projectionShift.current * size.width,
      0,
      size.width,
      size.height,
    )
    if (!state.current) {
      projectionShift.current = targetShift
      camera.setViewOffset(
        size.width,
        size.height,
        targetShift * size.width,
        0,
        size.width,
        size.height,
      )
      camera.position.set(...waypoint.position)
      currentLook.current.set(...waypoint.lookAt)
      camera.lookAt(currentLook.current)
      state.current = {
        key,
        done: true,
        elapsed: 0,
        total: 0,
        targetIndex: index,
        targetStep: step,
      }
      useTalk.setState({
        sceneIndex: index,
        sceneStep: step,
        cameraMotion: state.current,
      })
      return
    }
    if (state.current.key !== key) {
      const source = useTalk.getState()
      const sourceId = slides[source.sceneIndex ?? source.index].id
      const fromShack = shackSlides.has(sourceId)
      const toShack = shackSlides.has(slide.id)
      const crossing = fromShack !== toShack
      const cloudCut =
        (sourceId === 'computer-use' && slide.id === 'close') ||
        (sourceId === 'close' && slide.id === 'computer-use')
      const windowFlyout =
        (sourceId === 'close' && slide.id === 'thank-you') ||
        (sourceId === 'thank-you' && slide.id === 'close')
      const reducedCut =
        (cloudCut || windowFlyout) &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const coveredCut = cloudCut || reducedCut
      state.current = {
        key,
        elapsed: 0,
        crossing,
        cloudCut: coveredCut,
        reducedCut,
        switched: false,
        done: false,
        total: reducedCut
          ? 0.2
          : windowFlyout
            ? 2.4
            : cloudCut
              ? 1.3
              : crossing
                ? 3.05
                : 1.3,
        targetIndex: index,
        targetStep: step,
        from: camera.position.clone(),
        fromLook: currentLook.current.clone(),
        to: new THREE.Vector3(...waypoint.position),
        toLook: new THREE.Vector3(...waypoint.lookAt),
        initialCloud: uniforms.coverage.value,
        initialFade: uniforms.fadeOnly.value,
        fromShift: projectionShift.current,
        approach: new THREE.Vector3(
          ...(fromShack ? [0, 1.2, -0.86] : [0, -37, 9]),
        ),
        approachLook: new THREE.Vector3(
          ...(fromShack ? [0, 0.853, -1.15] : [0, -49, -2]),
        ),
        emerge: new THREE.Vector3(
          ...(toShack ? [0, 1.2, -0.86] : [0, -32, 15]),
        ),
        emergeLook: new THREE.Vector3(
          ...(toShack ? [0, 0.853, -1.15] : [0, -49, -2]),
        ),
      }
      useTalk.setState({ cameraMotion: state.current })
      if (!crossing && !coveredCut)
        useTalk.setState({ sceneIndex: index, sceneStep: step })
    }
    const transition = state.current
    if (transition.done) return
    transition.elapsed += Math.min(delta, 0.1)
    const elapsed = transition.elapsed
    if (transition.cloudCut) {
      const phase = elapsed / transition.total
      let switchedThisFrame = false
      uniforms.fadeOnly.value = transition.reducedCut ? 1 : 0
      if (phase < 0.5) {
        uniforms.coverage.value = THREE.MathUtils.lerp(
          transition.initialCloud,
          1,
          ease(progress(phase, 0, 0.42)),
        )
      } else {
        if (!transition.switched) {
          camera.position.copy(transition.to)
          currentLook.current.copy(transition.toLook)
          projectionShift.current = targetShift
          useTalk.setState({ sceneIndex: index, sceneStep: step })
          transition.switched = true
          switchedThisFrame = true
          uniforms.coverage.value = 1
        } else {
          uniforms.coverage.value = 1 - ease(progress(phase, 0.58, 1))
        }
      }
      transition.done = phase >= 1 && !switchedThisFrame
    } else if (transition.crossing) {
      if (elapsed < 1.4) {
        const t = ease(progress(elapsed, 0, 1.35))
        uniforms.fadeOnly.value = transition.initialFade * (1 - t)
        camera.position.lerpVectors(transition.from, transition.approach, t)
        currentLook.current.lerpVectors(
          transition.fromLook,
          transition.approachLook,
          t,
        )
        uniforms.coverage.value = THREE.MathUtils.lerp(
          transition.initialCloud,
          1,
          ease(progress(elapsed, 0.45, 1.25)),
        )
      } else {
        uniforms.fadeOnly.value = 0
        if (!transition.switched) {
          projectionShift.current = targetShift
          useTalk.setState({ sceneIndex: index, sceneStep: step })
          transition.switched = true
        }
        const t = ease(progress(elapsed, 1.4, 3.05))
        camera.position.lerpVectors(transition.emerge, transition.to, t)
        currentLook.current.lerpVectors(
          transition.emergeLook,
          transition.toLook,
          t,
        )
        uniforms.coverage.value = 1 - ease(progress(elapsed, 1.625, 3.05))
      }
      transition.done = elapsed >= 3.05
    } else {
      const t = ease(
        progress(
          elapsed,
          transition.fromShift || targetShift ? 0.225 : 0,
          transition.total,
        ),
      )
      const samePose =
        transition.from.equals(transition.to) &&
        transition.fromLook.equals(transition.toLook)
      uniforms.fadeOnly.value = transition.initialFade * (samePose ? 1 : 1 - t)
      projectionShift.current = THREE.MathUtils.lerp(
        transition.fromShift,
        targetShift,
        t,
      )
      camera.position.lerpVectors(transition.from, transition.to, t)
      currentLook.current.lerpVectors(transition.fromLook, transition.toLook, t)
      uniforms.coverage.value = transition.initialCloud * (1 - t)
      transition.done = elapsed >= transition.total
    }
    if (transition.done) {
      camera.position.copy(transition.to)
      currentLook.current.copy(transition.toLook)
      uniforms.coverage.value = 0
      uniforms.fadeOnly.value = 0
    }
    camera.lookAt(currentLook.current)
    if (cloud.current) cloud.current.visible = uniforms.coverage.value > 0.001
  })

  return (
    <mesh
      ref={(node) => {
        cloud.current = node
        overlay(node)
      }}
      visible={false}
      renderOrder={10000}
      frustumCulled={false}
    >
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        uniforms={uniforms}
        transparent
        depthTest={false}
        depthWrite={false}
        vertexShader={`
      varying vec2 uvCloud;
      void main() { uvCloud=uv; gl_Position=vec4(position.xy,0.,1.); }
    `}
        fragmentShader={`
      uniform float coverage; uniform float time; uniform float aspect; uniform float fadeOnly; varying vec2 uvCloud;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
      float billow(vec2 p){return noise(p)*.58+noise(p*2.13)*.28+noise(p*4.37)*.14;}
      void main(){
        vec2 p=(uvCloud-.5)*vec2(aspect,1.);
        vec2 drift=vec2(time*.065,-time*.025)*(1.-fadeOnly);
        float n=billow(p*4.+drift);
        float left=length((p-vec2(-aspect*.78+coverage*aspect*.86,.12))*vec2(.9,1.3));
        float right=length((p-vec2(aspect*.82-coverage*aspect*.83,-.16))*vec2(.9,1.4));
        float top=length((p-vec2(.12,.9-coverage*.95))*vec2(1.2,.9));
        float distance=min(min(left,right),top);
        float edge=.34+n*.25+coverage*.27;
        float alpha=(1.-smoothstep(edge-.09,edge+.1,distance))*smoothstep(0.,.12,coverage);
        alpha=max(alpha,smoothstep(.78,.98,coverage));
        alpha=mix(alpha,coverage,fadeOnly);
        // Puffy shading: a normal from the billow slope, lit from the upper left.
        vec2 q=p*4.+drift;
        float fine=billow(mat2(.8,-.6,.6,.8)*p*8.3-drift*1.6);
        float gx=billow(q+vec2(.08,0.))-n, gy=billow(q+vec2(0.,.08))-n;
        vec3 normal=normalize(vec3(-gx*5.,-gy*5.,1.));
        float light=clamp(dot(normal,normalize(vec3(-.45,.55,.7))),0.,1.);
        float puff=n*.75+fine*.25;
        vec3 shade=vec3(.52,.62,.74), lit=vec3(1.,.985,.96);
        vec3 color=mix(shade,lit,smoothstep(.15,.95,light*.6+puff*.6));
        float rim=pow(1.-clamp(abs(distance-edge)*2.,0.,1.),10.);
        color+=vec3(1.,.94,.84)*rim*.18*(1.-smoothstep(.55,.85,coverage));
        gl_FragColor=vec4(color,alpha);
        #include <colorspace_fragment>
      }
    `}
      />
    </mesh>
  )
}
