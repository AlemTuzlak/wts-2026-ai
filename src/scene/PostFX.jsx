import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { useTalk } from '../store.js'
import { shackSlides, sunsetSun } from './layout.js'

// Text, labels and the transition cloud live on this layer. They are drawn
// after the effects, so bloom and grading never change their colors.
export const OVERLAY_LAYER = 1
// The sunset sky is also on this layer. The light ray mask draws only it.
export const SKY_LAYER = 2
// The sky shader reads this uniform: 1 draws the sun mask for the rays.
export const skyMask = { value: 0 }

export function overlay(object) {
  object?.traverse((child) => child.layers.set(OVERLAY_LAYER))
}

export function allLayers(object) {
  object?.layers.enableAll()
}

const looks = {
  shack: {
    vignette: 0.42,
    saturation: 1.06,
    contrast: 1.04,
    lift: new THREE.Vector3(0.018, 0.008, 0),
    gain: new THREE.Vector3(1.02, 0.99, 0.95),
    bloom: 0.24,
    bloomRadius: 0.2,
    rays: 1,
  },
  map: {
    vignette: 0.14,
    saturation: 1.04,
    contrast: 1.03,
    lift: new THREE.Vector3(0, 0.008, 0.016),
    gain: new THREE.Vector3(1.01, 1, 0.985),
    bloom: 0.38,
    bloomRadius: 0.55,
    rays: 0,
  },
  // Outside the window the sun is in open sky: no rays and a tight bloom
  // keep the silhouettes near it dark.
  vista: {
    vignette: 0.34,
    saturation: 1.08,
    contrast: 1.05,
    lift: new THREE.Vector3(0.012, 0.004, 0.012),
    gain: new THREE.Vector3(1.02, 0.99, 0.96),
    bloom: 0.24,
    bloomRadius: 0.15,
    rays: 0,
  },
}

const fullscreenVertex = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
    vignette: { value: looks.map.vignette },
    saturation: { value: looks.map.saturation },
    contrast: { value: looks.map.contrast },
    lift: { value: looks.map.lift.clone() },
    gain: { value: looks.map.gain.clone() },
  },
  vertexShader: fullscreenVertex,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time, vignette, saturation, contrast;
    uniform vec2 resolution;
    uniform vec3 lift, gain;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      color = (color - 0.5) * contrast + 0.5;
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, saturation);
      color = color * gain + lift * (1.0 - luma);
      vec2 centered = (vUv - 0.5) * vec2(resolution.x / resolution.y, 1.0);
      // No darkening under the page number in the bottom-right corner.
      vec2 counter = (vUv - vec2(0.95, 0.04)) * vec2(resolution.x / resolution.y, 1.0);
      float keep = smoothstep(0.08, 0.42, length(counter));
      color *= 1.0 - smoothstep(0.38, 1.12, length(centered)) * vignette * keep;
      // Dither breaks 8-bit banding in the sky and water gradients.
      color += (hash(vUv * resolution + fract(time) * 61.0) - 0.5) * (1.5 / 255.0);
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `,
}

// Adds the blurred sun mask as warm light shafts in the room's air. Open sky
// (mask green) gets none, so the haze stays off the title and silhouettes.
const RaysShader = {
  uniforms: {
    tDiffuse: { value: null },
    tRays: { value: null },
    tMask: { value: null },
    texel: { value: new THREE.Vector2(1, 1) },
    intensity: { value: 0 },
    color: { value: new THREE.Color(1.0, 0.62, 0.32) },
  },
  vertexShader: fullscreenVertex,
  fragmentShader: `
    uniform sampler2D tDiffuse, tRays, tMask;
    uniform vec2 texel;
    uniform float intensity;
    uniform vec3 color;
    varying vec2 vUv;
    void main() {
      vec3 scene = texture2D(tDiffuse, vUv).rgb;
      float rays = texture2D(tRays, vUv).r;
      vec2 o = texel * 6.0;
      float sky = (texture2D(tMask, vUv).g * 2.0
        + texture2D(tMask, vUv + vec2(o.x, 0.0)).g
        + texture2D(tMask, vUv - vec2(o.x, 0.0)).g
        + texture2D(tMask, vUv + vec2(0.0, o.y)).g
        + texture2D(tMask, vUv - vec2(0.0, o.y)).g) / 6.0;
      gl_FragColor = vec4(scene + color * rays * intensity * (1.0 - sky * 0.9), 1.0);
    }
  `,
}

const RadialBlurShader = {
  uniforms: {
    tInput: { value: null },
    sun: { value: new THREE.Vector2(0.5, 0.5) },
    density: { value: 1 },
    decay: { value: 0.958 },
    weight: { value: 0.05 },
  },
  vertexShader: fullscreenVertex,
  fragmentShader: `
    uniform sampler2D tInput;
    uniform vec2 sun;
    uniform float density, decay, weight;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 delta = (vUv - sun) * density / 40.0;
      vec2 uv = vUv - delta * hash(vUv * 731.0);
      float light = 1.0, sum = 0.0;
      for (int i = 0; i < 40; i++) {
        uv -= delta;
        vec2 inside = step(vec2(0.0), uv) * step(uv, vec2(1.0));
        sum += texture2D(tInput, uv).r * light * inside.x * inside.y;
        light *= decay;
      }
      gl_FragColor = vec4(vec3(sum * weight), 1.0);
    }
  `,
}

const sunDirection = new THREE.Vector3(...sunsetSun).normalize()

export function PostFX() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)
  const id = useTalk((s) => s.slides[s.sceneIndex ?? s.index].id)
  const look =
    id === 'thank-you'
      ? looks.vista
      : shackSlides.has(id)
        ? looks.shack
        : looks.map

  const { composer, bloom, grade, rays } = useMemo(() => {
    // ponytail: fixed MSAA count; drop to 2 samples if high-DPR memory hurts.
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: 4,
    })
    const composer = new EffectComposer(gl, target)
    composer.addPass(new RenderPass(scene, camera))
    const raysPass = new ShaderPass(RaysShader)
    composer.addPass(raysPass)
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.55, 2.4)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())
    const grade = new ShaderPass(GradeShader)
    composer.addPass(grade)
    const options = { type: THREE.HalfFloatType }
    const rays = {
      pass: raysPass,
      mask: new THREE.WebGLRenderTarget(1, 1, options),
      blurA: new THREE.WebGLRenderTarget(1, 1, options),
      blurB: new THREE.WebGLRenderTarget(1, 1, options),
      black: new THREE.MeshBasicMaterial({ color: 0x000000 }),
      blur: new FullScreenQuad(new THREE.ShaderMaterial(RadialBlurShader)),
      sun: new THREE.Vector3(),
      clear: new THREE.Color(),
    }
    return { composer, bloom, grade, rays }
  }, [gl, scene, camera])

  useEffect(() => {
    composer.setPixelRatio(viewport.dpr)
    composer.setSize(size.width, size.height)
    const width = Math.ceil((size.width * viewport.dpr) / 2)
    const height = Math.ceil((size.height * viewport.dpr) / 2)
    for (const target of [rays.mask, rays.blurA, rays.blurB])
      target.setSize(width, height)
    rays.pass.uniforms.texel.value.set(1 / width, 1 / height)
    grade.uniforms.resolution.value.set(
      size.width * viewport.dpr,
      size.height * viewport.dpr,
    )
  }, [composer, grade, rays, size, viewport.dpr])

  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    return () => {
      gl.shadowMap.autoUpdate = true
      composer.dispose()
      for (const target of [rays.mask, rays.blurA, rays.blurB]) target.dispose()
      rays.black.dispose()
      rays.blur.material.dispose()
      rays.blur.dispose()
    }
  }, [gl, composer, rays])

  useFrame(({ clock }, delta) => {
    const u = grade.uniforms
    const k = 1 - Math.exp(-Math.min(delta, 0.1) * 3)
    u.time.value = clock.elapsedTime
    u.vignette.value += (look.vignette - u.vignette.value) * k
    u.saturation.value += (look.saturation - u.saturation.value) * k
    u.contrast.value += (look.contrast - u.contrast.value) * k
    u.lift.value.lerp(look.lift, k)
    u.gain.value.lerp(look.gain, k)
    bloom.strength += (look.bloom - bloom.strength) * k
    bloom.radius += (look.bloomRadius - bloom.radius) * k

    gl.shadowMap.needsUpdate = true
    const background = scene.background
    // Update every world matrix once. The extra passes below (ray mask,
    // overlay) reuse them instead of walking ~4,000 objects again each.
    scene.updateMatrixWorld()
    scene.matrixWorldAutoUpdate = false
    rays.sun.copy(camera.position).addScaledVector(sunDirection, 400)
    rays.sun.project(camera)
    const rayStrength = look.rays && rays.sun.z < 1 ? look.rays : 0
    rays.pass.enabled = rayStrength > 0
    if (rays.pass.enabled) {
      gl.getClearColor(rays.clear)
      const clearAlpha = gl.getClearAlpha()
      scene.background = null
      gl.setRenderTarget(rays.mask)
      gl.setClearColor(0x000000, 1)
      gl.clear()
      scene.overrideMaterial = rays.black
      camera.layers.set(0)
      gl.render(scene, camera)
      scene.overrideMaterial = null
      skyMask.value = 1
      camera.layers.set(SKY_LAYER)
      gl.render(scene, camera)
      skyMask.value = 0
      scene.background = background
      gl.setClearColor(rays.clear, clearAlpha)

      const blur = rays.blur.material.uniforms
      blur.sun.value.set((rays.sun.x + 1) / 2, (rays.sun.y + 1) / 2)
      blur.tInput.value = rays.mask.texture
      blur.density.value = 0.95
      gl.setRenderTarget(rays.blurA)
      rays.blur.render(gl)
      blur.tInput.value = rays.blurA.texture
      blur.density.value = 0.4
      gl.setRenderTarget(rays.blurB)
      rays.blur.render(gl)
      rays.pass.uniforms.tRays.value = rays.blurB.texture
      rays.pass.uniforms.tMask.value = rays.mask.texture
      rays.pass.uniforms.intensity.value = 0.38 * rayStrength
    }

    camera.layers.set(0)
    composer.render(delta)

    scene.background = null
    gl.autoClear = false
    gl.setRenderTarget(null)
    gl.clearDepth()
    camera.layers.set(OVERLAY_LAYER)
    gl.render(scene, camera)
    camera.layers.set(0)
    gl.autoClear = true
    scene.background = background
    scene.matrixWorldAutoUpdate = true
  }, 1)

  return null
}
