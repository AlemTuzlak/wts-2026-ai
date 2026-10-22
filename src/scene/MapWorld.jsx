import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { colors, islands, MAP_Y } from './layout.js'
import { Surface } from './Surface.jsx'
import { Label } from './Label.jsx'
import { allLayers, overlay } from './PostFX.jsx'
import { Ocean, seaIslands, oceanNoise } from './Ocean.jsx'
import { useTalk } from '../store.js'

const wood = new THREE.TextureLoader().load(
  './textures/wood/Wood066_1K-JPG_Color.jpg',
)
wood.colorSpace = THREE.SRGBColorSpace
wood.wrapS = wood.wrapT = THREE.RepeatWrapping
wood.anisotropy = 8
const woodNormal = new THREE.TextureLoader().load(
  './textures/wood/Wood066_1K-JPG_NormalGL.jpg',
)
woodNormal.wrapS = woodNormal.wrapT = THREE.RepeatWrapping
const woodRoughness = new THREE.TextureLoader().load(
  './textures/wood/Wood066_1K-JPG_Roughness.jpg',
)
woodRoughness.wrapS = woodRoughness.wrapT = THREE.RepeatWrapping

const grain = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#c4b393'
  ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 2600; i++) {
    const n = Math.sin(i * 78.233) * 43758.5453
    ctx.fillStyle = `rgba(50,35,20,${0.035 + (i % 7) * 0.012})`
    ctx.fillRect((n - Math.floor(n)) * 256, (i * 31.73) % 256, 2 + (i % 22), 1)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
})()

// Canvas stripes for the client workshop awning, in the brand palette.
const awning = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')
  for (let stripe = 0; stripe < 8; stripe++) {
    ctx.fillStyle = stripe % 2 ? '#c8553a' : '#f1e6cc'
    ctx.fillRect(0, stripe * 32, 256, 32)
  }
  for (let i = 0; i < 1600; i++) {
    const n = Math.sin(i * 12.9898) * 43758.5453
    ctx.fillStyle = `rgba(70,40,20,${0.03 + (i % 5) * 0.012})`
    ctx.fillRect((n - Math.floor(n)) * 256, (i * 17.31) % 256, 1, 3 + (i % 9))
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
})()

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    wood.dispose()
    woodNormal.dispose()
    woodRoughness.dispose()
    grain.dispose()
    awning.dispose()
  })
}

// Boards and blocks get small rounded edges that catch the light. One shared
// geometry per size keeps the bevel the same width on every board.
const timberShapes = new Map()
function timberShape([width, height, depth] = [1, 1, 1]) {
  const key = `${width}|${height}|${depth}`
  if (!timberShapes.has(key))
    timberShapes.set(
      key,
      new RoundedBoxGeometry(
        width,
        height,
        depth,
        2,
        Math.min(0.03, Math.min(width, height, depth) * 0.22),
      ),
    )
  return timberShapes.get(key)
}

if (import.meta.hot)
  import.meta.hot.dispose(() => {
    timberShapes.forEach((shape) => shape.dispose())
    timberShapes.clear()
  })

function Timber({ position, scale, rotation, color = '#92704b' }) {
  const tint = useMemo(
    () => new THREE.Color(color).lerp(new THREE.Color('#fff3d8'), 0.38),
    [color],
  )
  return (
    <mesh
      position={position}
      rotation={rotation}
      geometry={timberShape(scale)}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        color={tint}
        map={wood}
        normalMap={woodNormal}
        normalScale={[0.22, 0.22]}
        roughnessMap={woodRoughness}
        roughness={0.96}
        onBeforeCompile={(shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <roughnessmap_fragment>',
            '#include <roughnessmap_fragment>\nroughnessFactor=max(roughnessFactor,0.84);',
          )
        }}
      />
    </mesh>
  )
}

// Seeded random numbers keep every island's details stable between loads.
function seeded(seed) {
  let state = Math.floor(seed * 2654435761) >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const coastEdge = (a, seed) =>
  1 +
  0.095 * Math.sin(a * 3 + seed) +
  0.07 * Math.cos(a * 7 - seed) +
  0.035 * Math.sin(a * 13)

// Ground height of the island rings (inner grass plateau to the beach).
const groundHeight = (r) => {
  const rings = [
    [0, 0.89],
    [0.32, 0.88],
    [0.62, 0.78],
    [0.76, 0.58],
    [0.85, 0.3],
  ]
  for (let i = 1; i < rings.length; i++)
    if (r <= rings[i][0]) {
      const [r0, y0] = rings[i - 1],
        [r1, y1] = rings[i]
      return THREE.MathUtils.lerp(y0, y1, (r - r0) / (r1 - r0))
    }
  return 0.3
}

// Grass patches, dunes, ripples, wet sand and passing cloud shadows.
function shadeLand(uniforms) {
  return (shader) => {
    shader.uniforms.time = uniforms.time
    shader.uniforms.landSeed = uniforms.seed
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vLandPos;\nvarying vec3 vLandWorld;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvLandPos = position;\nvLandWorld = (modelMatrix * vec4(position, 1.0)).xyz;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float time;
        uniform float landSeed;
        varying vec3 vLandPos;
        varying vec3 vLandWorld;
        ${oceanNoise}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 q = vLandPos.xz + landSeed * 7.0;
        float grass = smoothstep(0.52, 0.74, vLandPos.y);
        float wet = 1.0 - smoothstep(0.02, 0.17, vLandPos.y);
        float patches = fbm2(q * 1.25);
        float fine = gnoised(q * 7.5).x;
        vec3 lush = mix(vec3(0.76, 0.9, 0.7), vec3(1.14, 1.07, 0.78), smoothstep(-0.25, 0.3, patches));
        diffuseColor.rgb *= mix(vec3(1.0), lush, grass);
        diffuseColor.rgb *= 1.0 + fine * 0.09 * grass;
        float ripple = sin(dot(q, vec2(8.5, 3.1)) + fine * 2.4) * (1.0 - grass) * (1.0 - wet);
        diffuseColor.rgb *= 1.0 + ripple * 0.035 + patches * 0.07 * (1.0 - grass);
        diffuseColor.rgb *= mix(1.0, 0.68, wet);
        diffuseColor.rgb *= 1.0 - cloudShadow(vLandWorld.xz, time) * 0.42;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.3, wet);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          float bump = fbm2(q * 2.1) * 0.05 + fine * 0.012;
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
          float dbx = dFdx(bump), dby = dFdy(bump);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          normal = normalize(abs(det) * normal - sign(det) * (dbx * r1 + dby * r2));
        }`,
      )
  }
}

const tuft = (() => {
  const vertices = [],
    tints = []
  for (let blade = 0; blade < 6; blade++) {
    const a = (blade / 6) * Math.PI * 2 + blade * 0.4
    const lean = 0.05 + (blade % 3) * 0.025
    const height = 0.15 + (blade % 2) * 0.07
    const side = [Math.cos(a + Math.PI / 2) * 0.016, Math.sin(a + Math.PI / 2) * 0.016]
    vertices.push(
      -side[0], 0, -side[1],
      side[0], 0, side[1],
      Math.cos(a) * lean, height, Math.sin(a) * lean,
    )
    tints.push(0.16, 0.3, 0.1, 0.16, 0.3, 0.1, 0.62, 0.74, 0.32)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(tints, 3))
  geometry.computeVertexNormals()
  return geometry
})()
const blossom = new THREE.IcosahedronGeometry(0.034, 0)

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    tuft.dispose()
    blossom.dispose()
  })
}

// Grass tufts and small flowers on the grass plateau, kept off the landmark.
function Meadow({ seed }) {
  const grass = useRef(),
    flowers = useRef()
  useLayoutEffect(() => {
    const random = seeded(seed + 0.37)
    const object = new THREE.Object3D(),
      color = new THREE.Color()
    const spot = () => {
      for (;;) {
        const a = random() * Math.PI * 2
        const r = 0.22 + Math.sqrt(random()) * 0.52
        const edge = 3.3 * coastEdge(a, seed) * r
        const x = Math.cos(a) * edge,
          z = Math.sin(a) * edge * 0.82
        if (Math.hypot(x, (z + 0.2) * 1.3) < 1.35) continue
        return [x, groundHeight(r) + Math.sin(a * 8 + seed) * 0.035 * r, z]
      }
    }
    for (let i = 0; i < 90; i++) {
      object.position.set(...spot())
      object.rotation.set(0, random() * Math.PI * 2, 0)
      object.scale.setScalar(0.7 + random() * 0.8)
      object.updateMatrix()
      grass.current.setMatrixAt(i, object.matrix)
      color.setHSL(0.24 + random() * 0.06, 0.45, 0.42 + random() * 0.18)
      grass.current.setColorAt(i, color)
    }
    const palette = ['#d3481b', '#f2e8c9', '#e8b84a', '#e06e49']
    for (let i = 0; i < 36; i++) {
      object.position.set(...spot())
      object.position.y += 0.06
      object.rotation.set(random(), random(), random())
      object.scale.setScalar(0.6 + random() * 0.7)
      object.updateMatrix()
      flowers.current.setMatrixAt(i, object.matrix)
      flowers.current.setColorAt(i, color.set(palette[i % palette.length]))
    }
    for (const mesh of [grass.current, flowers.current]) {
      mesh.instanceMatrix.needsUpdate = true
      mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  }, [seed])
  return (
    <>
      <instancedMesh ref={grass} args={[tuft, undefined, 90]} castShadow>
        <meshStandardMaterial
          vertexColors
          roughness={0.85}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
      <instancedMesh ref={flowers} args={[blossom, undefined, 36]}>
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
    </>
  )
}

function Shore({ seed }) {
  const surf = useRef()
  const uniforms = useMemo(
    () => ({ time: { value: 0 }, seed: { value: seed } }),
    [seed],
  )
  const landShader = useMemo(() => shadeLand(uniforms), [uniforms])
  const reduced = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const geometry = useMemo(() => {
    const segments = 72
    const coast = Array.from({ length: segments + 1 }, (_, i) => {
      const a = (i / segments) * Math.PI * 2
      const edge = coastEdge(a, seed)
      return new THREE.Vector2(
        Math.cos(a) * 3.3 * edge,
        Math.sin(a) * 3.3 * edge * 0.82,
      )
    })
    const vertices = [],
      indices = [],
      uv = [],
      tint = []
    const rings = [
      [0, 0.89, '#6c9e71'],
      [0.32, 0.88, '#8caf79'],
      [0.62, 0.78, '#9db480'],
      [0.76, 0.58, '#c4ba85'],
      [0.85, 0.3, '#ffe6b6'],
      [0.92, 0.13, '#f4ddb0'],
      [0.97, 0.01, '#899980'],
      [1, -0.08, '#748879'],
    ]
    rings.forEach(([r, y, color]) => {
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2
        const x = coast[i].x * r,
          z = coast[i].y * r
        vertices.push(x, y + Math.sin(a * 8 + seed) * 0.035 * r, z)
        uv.push(x / 2, z / 2)
        const c = new THREE.Color(color).multiplyScalar(
          0.94 + 0.06 * Math.sin(a * 5 + seed),
        )
        tint.push(c.r, c.g, c.b)
      }
    })
    for (let r = 0; r < rings.length - 1; r++)
      for (let i = 0; i < segments; i++) {
        const a = r * (segments + 1) + i,
          b = a + segments + 1
        indices.push(a, a + 1, b, a + 1, b + 1, b)
      }
    const land = new THREE.BufferGeometry()
    land.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    land.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    land.setAttribute('color', new THREE.Float32BufferAttribute(tint, 3))
    land.setIndex(indices)
    land.computeVertexNormals()
    const waterVertices = [],
      waterUv = [],
      waterIndices = []
    for (let ring = 0; ring <= 12; ring++)
      for (let i = 0; i <= segments; i++) {
        const p = coast[i],
          distance = ring / 12
        const outward = p.clone().normalize()
        waterVertices.push(
          p.x + outward.x * (distance * 0.7 - 0.1),
          0.025,
          p.y + outward.y * (distance * 0.7 - 0.1),
        )
        waterUv.push(i / segments, distance)
        if (ring < 12 && i < segments) {
          const a = ring * (segments + 1) + i,
            b = a + segments + 1
          waterIndices.push(a, a + 1, b, a + 1, b + 1, b)
        }
      }
    const water = new THREE.BufferGeometry()
    water.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(waterVertices, 3),
    )
    water.setAttribute('uv', new THREE.Float32BufferAttribute(waterUv, 2))
    water.setIndex(waterIndices)
    water.computeVertexNormals()
    return { land, water }
  }, [seed])
  useEffect(
    () => () => {
      geometry.land.dispose()
      geometry.water.dispose()
    },
    [geometry],
  )
  useFrame(({ clock }) => {
    if (surf.current) uniforms.time.value = reduced ? 0 : clock.elapsedTime
  })
  return (
    <>
      <mesh geometry={geometry.land} receiveShadow castShadow>
        <meshStandardMaterial
          vertexColors
          map={grain}
          roughness={0.94}
          onBeforeCompile={landShader}
        />
      </mesh>
      <mesh ref={surf} geometry={geometry.water}>
        <shaderMaterial
          uniforms={uniforms}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          vertexShader={`
        uniform float time; uniform float seed; varying vec2 shore;
        void main(){shore=uv;vec3 p=position;
          float crest=pow(max(0.,sin(uv.y*11.+time*1.2+sin(uv.x*31.4159265+seed)*.45)),6.);
          p.y+=crest*.035*sin(uv.y*3.14159);
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
        }
      `}
          fragmentShader={`
        uniform float time;uniform float seed;varying vec2 shore;
        void main(){
          float phase=shore.y*11.+time*1.2+sin(shore.x*31.4159265+seed)*.45;
          float swell=max(0.,sin(phase));
          float crest=pow(swell,5.);
          float breaks=smoothstep(-.35,.7,sin(shore.x*119.380521+sin(shore.x*50.2654825)*2.+seed));
          float edge=smoothstep(0.,.10,shore.y)*(1.-smoothstep(.62,1.,shore.y));
          float grain=.68+.32*sin(shore.x*458.672527+sin(shore.y*81.)*2.+time*.6);
          float foam=crest*breaks*edge*grain;
          float wash=pow(swell,2.)*breaks*edge;
          vec3 color=mix(vec3(.28,.64,.61),vec3(.89,.94,.85),smoothstep(.02,.3,foam));
          gl_FragColor=vec4(color,wash*.16+foam*.64);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `}
        />
      </mesh>
    </>
  )
}

function Palm({ position, rotation = 0, scale = 1 }) {
  const foliage = useRef()
  const leaves = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4
        return new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 2.1, 0),
          new THREE.Vector3(Math.cos(a) * 0.7, 2.4, Math.sin(a) * 0.7),
          new THREE.Vector3(Math.cos(a) * 1.5, 1.65, Math.sin(a) * 1.5),
        ])
      }),
    [],
  )
  const leaf = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.26, 0.78, 2, 8),
      p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / 0.78 + 0.5
      p.setXYZ(
        i,
        p.getX(i) * Math.sin(t * Math.PI),
        Math.sin(t * Math.PI) * 0.07 - t * t * 0.16,
        t * 0.78,
      )
    }
    g.computeVertexNormals()
    return g
  }, [])
  useEffect(() => () => leaf.dispose(), [leaf])
  useLayoutEffect(() => {
    const object = new THREE.Object3D(),
      color = new THREE.Color()
    leaves.forEach((curve, i) => {
      for (let j = 0; j < 7; j++)
        for (let side = 0; side < 2; side++) {
          object.position.copy(curve.getPoint((j + 1) / 8))
          object.rotation.set(
            0.12,
            (side ? Math.PI : 0) - (i * Math.PI) / 4 + (side ? -0.25 : 0.25),
            0,
          )
          object.scale.setScalar(0.95 - j * 0.055)
          object.updateMatrix()
          const index = (i * 7 + j) * 2 + side
          foliage.current.setMatrixAt(index, object.matrix)
          color
            .set(['#37653c', '#527c3e', '#709749'][i % 3])
            .multiplyScalar(0.9 + j * 0.02)
          foliage.current.setColorAt(index, color)
        }
    })
    foliage.current.instanceMatrix.needsUpdate = true
    foliage.current.instanceColor.needsUpdate = true
    foliage.current.computeBoundingSphere()
  }, [leaves])
  return (
    <group position={position} rotation={[0, rotation, 0.13]} scale={scale}>
      <mesh position={[0, 1, 0]} castShadow>
        <cylinderGeometry args={[0.085, 0.15, 2.1, 9]} />
        <meshStandardMaterial color="#82644a" map={grain} />
      </mesh>
      {leaves.map((curve, i) => (
        <group key={i}>
          <mesh castShadow>
            <tubeGeometry args={[curve, 10, 0.035, 4, false]} />
            <meshStandardMaterial color="#626348" />
          </mesh>
        </group>
      ))}
      <instancedMesh ref={foliage} args={[leaf, undefined, 112]} castShadow>
        <meshStandardMaterial roughness={0.9} side={THREE.DoubleSide} />
      </instancedMesh>
      {[-1, 0, 1].map((i) => (
        <mesh
          key={i}
          position={[i * 0.12, 2.05, Math.abs(i) * 0.08]}
          castShadow
        >
          <sphereGeometry args={[0.1, 8, 6]} />
          <meshStandardMaterial color="#826043" roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

// A broken ring of foam where a post or pontoon meets the water. Its shader
// uses the ring's local position, so there is no seam around the circle.
export function FoamRing({
  position,
  radius,
  width = 0.22,
  seed = 0,
  color,
}) {
  const uniforms = useMemo(
    () => ({
      time: { value: 0 },
      radius: { value: radius },
      width: { value: width },
      seed: { value: seed },
      color: {
        value: color
          ? new THREE.Color(color)
          : new THREE.Color().setRGB(0.93, 0.97, 0.96),
      },
    }),
    [radius, width, seed, color],
  )
  const reduced = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  useFrame(({ clock }) => {
    uniforms.time.value = reduced ? 0 : clock.elapsedTime
  })
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius * 0.85, radius + width, 40, 1]} />
      <shaderMaterial
        uniforms={uniforms}
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
        vertexShader={`
          varying vec2 vRing;
          void main() {
            vRing = position.xy;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform float time, radius, width, seed;
          uniform vec3 color;
          varying vec2 vRing;
          ${oceanNoise}
          void main() {
            float r = length(vRing);
            float t = (r - radius) / width;
            float band = smoothstep(-0.15, 0.08, t) * (1.0 - smoothstep(0.15, 1.0, t));
            vec2 q = vRing / (radius + width) * 3.0 + seed;
            float broken = smoothstep(-0.25, 0.45,
              gnoised(q + vec2(time * 0.35, -time * 0.2)).x * 0.7
              + gnoised(q * 2.6 - time * 0.5).x * 0.3);
            float lap = 0.75 + 0.25 * sin(time * 1.9 + seed * 3.0 - t * 4.0);
            gl_FragColor = vec4(color, band * broken * lap * 0.8);
          }
        `}
      />
    </mesh>
  )
}

function Dock({ position, foam = true }) {
  return (
    <group position={position}>
      {Array.from({ length: 13 }, (_, i) => (
        <Timber
          key={i}
          position={[0, 0, (i / 12 - 0.5) * 2.3]}
          scale={[1.35, 0.13, 0.16]}
          color={i % 2 ? '#9f835b' : '#866943'}
        />
      ))}
      {[-0.55, 0.55].flatMap((x) =>
        [-1.15, 1.15].map((z) => (
          <group key={`${x}-${z}`} position={[x, -0.18, z]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.075, 0.1, 1.1, 10]} />
              <meshStandardMaterial color="#6f5338" map={grain} />
            </mesh>
            <mesh position={[0, 0.37, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.085, 0.027, 5, 12]} />
              <meshStandardMaterial color="#bba77b" />
            </mesh>
            {/* The dock sits 0.35 above the water line. */}
            {foam && (
              <FoamRing
                position={[0, -0.135, 0]}
                radius={0.095}
                width={0.2}
                seed={x * 3 + z}
              />
            )}
          </group>
        )),
      )}
    </group>
  )
}

function ToolWorkshops({ focus, work }) {
  const client = useRef(),
    server = useRef(),
    craneLoad = useRef(),
    craneRope = useRef(),
    craneHook = useRef(),
    chart = useRef(),
    clientResult = useRef(),
    serverResult = useRef(),
    clientWorking = useRef(),
    serverWorking = useRef(),
    elapsed = useRef(0)
  const reduced = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  useFrame((_, dt) => {
    elapsed.current += Math.min(dt, 0.05)
    ;[client, server].forEach((ref, i) => {
      if (!ref.current) return
      const t = reduced
        ? 1
        : THREE.MathUtils.smoothstep(
            elapsed.current,
            0.275 + i * 0.275,
            0.825 + i * 0.275,
          )
      ref.current.visible =
        t > 0 &&
        (!focus || (i === 0 ? focus === 'browser' : focus === 'provider'))
      ref.current.position.y = MAP_Y - (1 - t) * 3
      ref.current.scale.setScalar(0.86 + 0.14 * t)
    })
    const phase = work?.current
    const serverProgress = phase?.site === 'server' ? phase.progress : 0
    const clientProgress = phase?.site === 'client' ? phase.progress : 0
    const loadY = 0.75 + Math.sin(serverProgress * Math.PI) * 1.35
    if (craneLoad.current) craneLoad.current.position.y = loadY
    if (craneHook.current) craneHook.current.position.y = loadY + 0.4
    if (craneRope.current) {
      craneRope.current.position.y = (2.64 + loadY + 0.4) / 2
      craneRope.current.scale.y = (2.64 - loadY - 0.4) / 1.25
    }
    if (chart.current)
      chart.current.rotation.y = Math.sin(clientProgress * Math.PI * 4) * 0.35
    if (clientResult.current)
      clientResult.current.visible = clientProgress >= 0.85
    if (serverResult.current)
      serverResult.current.visible = serverProgress >= 0.85
    if (clientWorking.current)
      clientWorking.current.visible = clientProgress > 0 && clientProgress < 1
    if (serverWorking.current)
      serverWorking.current.visible = serverProgress > 0 && serverProgress < 1
  })
  return (
    <>
      {[false, true].map((warehouse, i) => (
        <group
          key={i}
          ref={warehouse ? server : client}
          position={[warehouse ? -5.6 : -15.1, MAP_Y, warehouse ? -8.5 : 6]}
        >
          {Array.from({ length: 15 }, (_, j) => (
            <Timber
              key={j}
              position={[0, 0.4, (j - 7) * 0.25]}
              scale={[4.2, 0.18, 0.235]}
              color={['#92704b', '#ac875b', '#80603e'][j % 3]}
            />
          ))}
          {[-1.8, 1.8].flatMap((x) =>
            [-1.6, 1.6].map((z) => (
              <group key={`${x}-${z}`} position={[x, 0, z]}>
                <Timber
                  position={[0, -0.05, 0]}
                  scale={[0.22, 1.8, 0.22]}
                  color="#57432d"
                />
                <mesh position={[0, 0.75, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[0.16, 0.045, 6, 16]} />
                  <meshStandardMaterial color="#bfa57a" />
                </mesh>
                <FoamRing
                  position={[0, 0.035, 0]}
                  radius={0.16}
                  width={0.24}
                  seed={x + z * 2}
                />
              </group>
            )),
          )}
          {[-1.2, 1.2].map((z) => (
            <Timber
              key={z}
              position={[0, 0.19, z]}
              scale={[4.5, 0.22, 0.22]}
              color="#57432d"
            />
          ))}
          {Array.from({ length: 8 }, (_, j) => (
            <Timber
              key={`walk${j}`}
              position={[2.2 + j * 0.24, 0.42, 0]}
              scale={[0.22, 0.13, 1.1]}
              color={j % 2 ? '#a6865a' : '#80613e'}
            />
          ))}
          {[-0.45, 0.45].map((z) => (
            <Timber
              key={`beam${z}`}
              position={[3.05, 0.24, z]}
              scale={[2, 0.18, 0.14]}
            />
          ))}
          {warehouse ? (
            <>
              <Timber
                position={[-0.55, 1.25, -0.45]}
                scale={[2.25, 1.6, 1.8]}
                color="#9b784c"
              />
              {[-1.62, 0.52].map((x) => (
                <Timber
                  key={x}
                  position={[x, 1.3, 0.49]}
                  scale={[0.16, 1.8, 0.15]}
                  color="#493b2c"
                />
              ))}
              {Array.from({ length: 8 }, (_, j) => (
                <Timber
                  key={j}
                  position={[-0.55, 0.6 + j * 0.2, 0.48]}
                  scale={[2.25, 0.035, 0.07]}
                  color="#5f482f"
                />
              ))}
              {[-1, 1].map((s) => (
                <Timber
                  key={s}
                  position={[-0.55 + s * 0.64, 2.3, -0.45]}
                  rotation={[0, 0, -s * 0.5]}
                  scale={[1.5, 0.16, 2.2]}
                  color="#874832"
                />
              ))}
              <Timber
                position={[-0.55, 2.67, -0.45]}
                scale={[0.14, 0.14, 2.25]}
                color="#d0ad78"
              />
              <Timber
                position={[-0.55, 1.05, 0.52]}
                scale={[0.85, 1.18, 0.12]}
                color="#493b2c"
              />
              <Timber
                position={[-0.55, 1.05, 0.61]}
                rotation={[0, 0, 0.6]}
                scale={[0.1, 1.3, 0.08]}
                color="#c5a16a"
              />
              <Timber
                position={[1.15, 1.65, -0.7]}
                scale={[0.23, 2.5, 0.23]}
                color="#57432d"
              />
              <Timber
                position={[1.45, 2.85, -0.7]}
                scale={[1.6, 0.21, 0.23]}
                color="#a38353"
              />
              <Timber
                position={[1.55, 2.35, -0.7]}
                rotation={[0, 0, -0.65]}
                scale={[0.14, 1.25, 0.14]}
                color="#6d5335"
              />
              <mesh
                position={[2.04, 2.64, -0.7]}
                rotation={[0, Math.PI / 2, 0]}
              >
                <torusGeometry args={[0.17, 0.06, 8, 18]} />
                <meshStandardMaterial color="#37372f" metalness={0.6} />
              </mesh>
              <mesh ref={craneRope} position={[2.04, 1.96, -0.7]}>
                <cylinderGeometry args={[0.025, 0.025, 1.25, 8]} />
                <meshStandardMaterial color="#c5aa78" />
              </mesh>
              <mesh
                ref={craneHook}
                position={[2.12, 1.27, -0.7]}
                rotation={[0, 0, 0.4]}
              >
                <torusGeometry args={[0.14, 0.045, 8, 16, Math.PI * 1.5]} />
                <meshStandardMaterial color="#3d3b32" metalness={0.6} />
              </mesh>
              <group ref={craneLoad} position={[2.04, 0.75, -0.7]}>
                <Timber scale={[0.62, 0.55, 0.62]} color="#b99758" />
                <Timber scale={[0.08, 0.6, 0.65]} color="#51402a" />
              </group>
            </>
          ) : (
            <>
              {[-1.65, 1.65].flatMap((x) =>
                [-1.3, 0.8].map((z) => (
                  <Timber
                    key={`${x}${z}`}
                    position={[x, 1.4, z]}
                    scale={[0.14, 2, 0.14]}
                    color="#634b31"
                  />
                )),
              )}
              {[-1, 1].map((s) => (
                <mesh
                  key={s}
                  position={[s * 0.85, 2.45, -0.25]}
                  rotation={[0, 0, -s * 0.24]}
                  castShadow
                >
                  <boxGeometry args={[1.85, 0.065, 2.6]} />
                  <meshStandardMaterial
                    map={awning}
                    color={s < 0 ? '#ffffff' : '#ece4d4'}
                    roughness={1}
                  />
                </mesh>
              ))}
              <Timber
                position={[0, 2.67, -0.25]}
                scale={[0.13, 0.13, 2.8]}
                color="#715737"
              />
              <Timber
                position={[0, 1.06, 0]}
                scale={[2.45, 0.18, 1.15]}
                color="#805d38"
              />
              {[-0.95, 0.95].map((x) => (
                <Timber
                  key={x}
                  position={[x, 0.73, 0]}
                  scale={[0.15, 0.65, 0.8]}
                />
              ))}
              <mesh
                position={[-0.25, 1.16, 0]}
                rotation={[-Math.PI / 2, 0, 0.12]}
              >
                <planeGeometry args={[1.45, 0.88]} />
                <meshStandardMaterial color="#eee1b2" side={THREE.DoubleSide} />
              </mesh>
              {[-0.35, 0, 0.35].map((x) => (
                <Timber
                  key={x}
                  position={[x, 1.172, 0]}
                  rotation={[0, 0.35, 0]}
                  scale={[0.025, 0.012, 0.65]}
                  color="#6c8678"
                />
              ))}
              <mesh
                position={[0.83, 1.2, 0.14]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <cylinderGeometry args={[0.2, 0.2, 0.07, 24]} />
                <meshStandardMaterial color="#c59b43" metalness={0.65} />
              </mesh>
              <group ref={chart} position={[0.83, 1.25, 0.14]}>
                <Timber
                  rotation={[0, 0.55, 0]}
                  scale={[0.035, 0.03, 0.29]}
                  color="#353d3b"
                />
                <mesh
                  position={[-0.7, -0.06, 0]}
                  rotation={[-Math.PI / 2, 0, 0]}
                >
                  <planeGeometry args={[0.8, 0.55]} />
                  <meshStandardMaterial
                    color="#e9dba1"
                    side={THREE.DoubleSide}
                  />
                </mesh>
              </group>
              <mesh position={[1.35, 1.55, 0.8]}>
                <boxGeometry args={[0.25, 0.4, 0.25]} />
                <meshStandardMaterial
                  color="#efc56d"
                  emissive="#ad6a21"
                  emissiveIntensity={0.35}
                />
              </mesh>
            </>
          )}
          {[
            [-1.45, 0.72, 1.15],
            [-0.7, 0.68, 1.25],
            [-1.45, 1.2, 1.15],
          ].map((p, j) => (
            <group key={j} position={p}>
              <Timber
                scale={[0.65, 0.55, 0.6]}
                color={j % 2 ? '#b28d59' : '#86633e'}
              />
              {[-0.24, 0.24].map((x) => (
                <Timber
                  key={x}
                  position={[x, 0, 0.31]}
                  scale={[0.06, 0.57, 0.045]}
                  color="#503e2a"
                />
              ))}
              <Timber
                position={[0, 0, 0.34]}
                rotation={[0, 0, 0.65]}
                scale={[0.07, 0.73, 0.05]}
                color="#c4a371"
              />
            </group>
          ))}
          {[0, 1, 2].map((j) => (
            <mesh
              key={j}
              position={[1.25, 0.54 + j * 0.05, 1.1]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <torusGeometry args={[0.27 - j * 0.035, 0.035, 6, 20]} />
              <meshStandardMaterial color="#b69a68" />
            </mesh>
          ))}
          <group
            ref={warehouse ? serverResult : clientResult}
            position={[0.35, 0.8, 1.25]}
            visible={false}
          >
            <Timber scale={[0.75, 0.65, 0.65]} color="#c6a666" />
            <Timber
              position={[0, 0.34, 0]}
              scale={[0.8, 0.05, 0.7]}
              color="#e5d5a6"
            />
          </group>
          <group
            ref={warehouse ? serverWorking : clientWorking}
            visible={false}
          >
            <Label
              text="RUN TOOL"
              position={[0, 0.4, 2.7]}
              scale={[4.2, 1.05, 1]}
            />
          </group>
          <Label
            text={warehouse ? 'Server tools' : 'Client tools'}
            position={[
              warehouse && focus ? -3.5 : 0,
              warehouse ? 3.65 : 4.2,
              0,
            ]}
            scale={[5.3, 1.33, 1]}
          />
        </group>
      ))}
    </>
  )
}

const puff = new THREE.SphereGeometry(1, 12, 9)

if (import.meta.hot) import.meta.hot.dispose(() => puff.dispose())

const chimneyTop = [0, 0.38, 0]
const chimneyPuff = [0.06, 0.34]

function Chimney({ position }) {
  const stack = useRef()
  return (
    <group ref={stack} position={position}>
      <mesh castShadow>
        <boxGeometry args={[0.24, 0.62, 0.24]} />
        <meshStandardMaterial color="#8b7f6c" map={grain} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.32, 0]}>
        <boxGeometry args={[0.31, 0.06, 0.31]} />
        <meshStandardMaterial color="#5e5446" roughness={0.9} />
      </mesh>
      <Smoke
        source={stack}
        offset={chimneyTop}
        every={0.1}
        life={2.8}
        rise={0.55}
        size={chimneyPuff}
        opacity={0.36}
      />
    </group>
  )
}

const gullWing = (() => {
  // An M-shaped gull wing: raised inner half, drooping dark tip.
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        0, 0, -0.06, 0, 0, 0.08, 0.22, 0.05, -0.05,
        0, 0, 0.08, 0.22, 0.05, 0.05, 0.22, 0.05, -0.05,
        0.22, 0.05, -0.05, 0.22, 0.05, 0.05, 0.44, -0.02, -0.07,
      ],
      3,
    ),
  )
  const light = [0.96, 0.96, 0.94],
    dark = [0.3, 0.31, 0.33]
  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(
      [...light, ...light, ...light, ...light, ...light, ...light, ...light, ...light, ...dark],
      3,
    ),
  )
  geometry.computeVertexNormals()
  return geometry
})()
const gullBody = new THREE.SphereGeometry(1, 8, 6)

if (import.meta.hot)
  import.meta.hot.dispose(() => {
    gullWing.dispose()
    gullBody.dispose()
  })

// A few gulls circle the islands. Three instanced meshes draw all of them.
function Gulls() {
  const bodies = useRef(),
    left = useRef(),
    right = useRef()
  const flock = useMemo(() => {
    const random = seeded(4.2)
    return [
      [-10, 7, 3],
      [0, -7, 3],
      [10, 7, 2],
    ].flatMap(([x, z, count]) =>
      Array.from({ length: count }, () => ({
        x: x + (random() - 0.5) * 2,
        z: z + (random() - 0.5) * 2,
        radius: 2.6 + random() * 2.2,
        height: 4.4 + random() * 2.4,
        speed: (random() > 0.5 ? 1 : -1) * (0.28 + random() * 0.14),
        phase: random() * Math.PI * 2,
      })),
    )
  }, [])
  const rig = useMemo(() => {
    const gull = new THREE.Object3D(),
      body = new THREE.Object3D(),
      wingL = new THREE.Object3D(),
      wingR = new THREE.Object3D()
    body.scale.set(0.045, 0.04, 0.15)
    wingL.position.set(0.03, 0.01, 0.01)
    wingR.position.set(-0.03, 0.01, 0.01)
    gull.add(body, wingL, wingR)
    return { gull, body, wingL, wingR }
  }, [])
  const reduced = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  useFrame(({ clock }) => {
    if (!bodies.current) return
    const time = reduced ? 0 : clock.elapsedTime
    const { gull, body, wingL, wingR } = rig
    flock.forEach((bird, i) => {
      const angle = bird.phase + time * bird.speed
      gull.position.set(
        bird.x + Math.cos(angle) * bird.radius,
        MAP_Y + bird.height + Math.sin(time * 0.8 + bird.phase) * 0.25,
        bird.z + Math.sin(angle) * bird.radius,
      )
      gull.rotation.set(
        0,
        bird.speed > 0 ? -angle : Math.PI - angle,
        Math.sign(bird.speed) * 0.32,
        'YXZ',
      )
      gull.scale.setScalar(0.75)
      const glide = Math.sin(time * 0.55 + bird.phase * 3)
      const flap =
        (glide > 0.2 ? Math.sin(time * 9 + bird.phase) * 0.55 : 0.12) + 0.08
      wingL.rotation.set(0, 0, flap)
      wingR.rotation.set(0, Math.PI, flap)
      gull.updateMatrixWorld(true)
      bodies.current.setMatrixAt(i, body.matrixWorld)
      left.current.setMatrixAt(i, wingL.matrixWorld)
      right.current.setMatrixAt(i, wingR.matrixWorld)
    })
    for (const mesh of [bodies.current, left.current, right.current]) {
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  })
  return (
    <>
      <instancedMesh ref={bodies} args={[gullBody, undefined, flock.length]}>
        <meshStandardMaterial color="#f4f3ee" roughness={0.8} />
      </instancedMesh>
      {[left, right].map((ref, i) => (
        <instancedMesh
          key={i}
          ref={ref}
          args={[gullWing, undefined, flock.length]}
        >
          <meshStandardMaterial
            vertexColors
            roughness={0.85}
            side={THREE.DoubleSide}
          />
        </instancedMesh>
      ))}
    </>
  )
}

function Landmark({ kind }) {
  if (kind === 'server')
    return (
      <group position={[0.1, 0.8, -0.25]}>
        <mesh position={[0, 1.6, 0]} castShadow>
          <cylinderGeometry args={[0.48, 0.75, 3.2, 24]} />
          <meshStandardMaterial
            color="#f0e7c9"
            map={grain}
            roughness={0.95}
            onBeforeCompile={(shader) => {
              shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                `#include <color_fragment>
        vec2 course=vec2(vMapUv.x*12.0+mod(floor(vMapUv.y*10.0),2.0)*0.5,vMapUv.y*10.0);
        vec2 edge=min(fract(course),1.0-fract(course));
        float mortar=1.0-smoothstep(0.02,0.055,min(edge.x,edge.y));
        float stone=0.92+0.08*sin(floor(course.x)*7.0+floor(course.y)*13.0);
        diffuseColor.rgb=mix(diffuseColor.rgb*stone,vec3(0.31,0.29,0.23),mortar*0.52);`,
              )
            }}
          />
        </mesh>
        {[0.3, 1.8, 2.9].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <cylinderGeometry
              args={[0.57 + (3 - y) * 0.07, 0.58 + (3 - y) * 0.07, 0.14, 24]}
            />
            <meshStandardMaterial color={colors.charcoal} />
          </mesh>
        ))}
        <mesh position={[0, 3.3, 0]}>
          <cylinderGeometry args={[0.5, 0.5, 0.65, 12]} />
          <meshStandardMaterial
            color="#fff1cc"
            emissive="#ffbf62"
            emissiveIntensity={3.2}
            roughness={0.2}
          />
        </mesh>
        <mesh position={[0, 3.82, 0]} castShadow>
          <coneGeometry args={[0.82, 0.55, 24]} />
          <meshStandardMaterial
            color="#b96d40"
            map={grain}
            metalness={0.28}
            roughness={0.72}
          />
        </mesh>
        <mesh position={[0, 3.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.76, 0.025, 6, 32]} />
          <meshStandardMaterial
            color="#c1a66e"
            metalness={0.55}
            roughness={0.58}
          />
        </mesh>
        {Array.from({ length: 8 }, (_, i) => (
          <Timber
            key={i}
            position={[
              Math.cos((i * Math.PI) / 4) * 0.52,
              3.35,
              Math.sin((i * Math.PI) / 4) * 0.52,
            ]}
            scale={[0.055, 0.75, 0.055]}
            color={colors.charcoal}
          />
        ))}
        <Timber
          position={[0, 0.45, 0.69]}
          scale={[0.4, 0.85, 0.08]}
          color={colors.woodDark}
        />
        {[
          [1.23, 0.65],
          [2.37, 0.554],
        ].map(([y, z]) => (
          <group key={y} position={[0, y, z]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.105, 0.105, 0.02, 20]} />
              <meshStandardMaterial
                color="#243a3d"
                roughness={0.24}
                metalness={0.12}
              />
            </mesh>
            <mesh>
              <torusGeometry args={[0.115, 0.026, 8, 24]} />
              <meshStandardMaterial
                color="#bda56e"
                metalness={0.6}
                roughness={0.54}
              />
            </mesh>
            <Timber
              position={[0, 0, 0.025]}
              scale={[0.018, 0.2, 0.02]}
              color="#cab985"
            />
          </group>
        ))}
      </group>
    )
  if (kind === 'provider')
    return (
      <group position={[0, 0.7, -0.1]}>
        <mesh position={[0, 0.85, 0]} castShadow>
          <cylinderGeometry args={[1.05, 1.12, 1.7, 32]} />
          <meshStandardMaterial color="#e2d2ab" map={grain} />
        </mesh>
        <mesh position={[0, 1.67, 0]} castShadow>
          <sphereGeometry
            args={[1.1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]}
          />
          <meshStandardMaterial
            color="#b3754b"
            map={grain}
            metalness={0.3}
            roughness={0.72}
            onBeforeCompile={(shader) => {
              shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                `#include <color_fragment>
        float seam = 1.0 - smoothstep(0.015, 0.035, abs(fract(vMapUv.x * 12.0) - 0.5));
        vec2 weather=vMapUv*vec2(31.0,17.0),cell=floor(weather),f=fract(weather);f=f*f*(3.0-2.0*f);
        vec4 patches=fract(sin(vec4(dot(cell,vec2(127.1,311.7)),dot(cell+vec2(1,0),vec2(127.1,311.7)),dot(cell+vec2(0,1),vec2(127.1,311.7)),dot(cell+vec2(1,1),vec2(127.1,311.7))))*43758.5453);
        float patina=smoothstep(0.5,0.85,mix(mix(patches.x,patches.y,f.x),mix(patches.z,patches.w,f.x),f.y))*(1.0-vMapUv.y)*0.38;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.3, 0.24), patina) * (1.0 - seam * 0.24);`,
              )
            }}
          />
        </mesh>
        <mesh
          position={[0.28, 2.2, 0.5]}
          rotation={[Math.PI / 3, 0, -0.3]}
          castShadow
        >
          <cylinderGeometry args={[0.14, 0.2, 1.45, 16]} />
          <meshStandardMaterial
            color="#403b31"
            metalness={0.6}
            roughness={0.3}
          />
        </mesh>
        {[-1, 0, 1].map((x) => (
          <Timber
            key={x}
            position={[x * 0.65, 0.9, Math.sqrt(1.1 - x * x * 0.42)]}
            scale={[0.23, 0.65, 0.08]}
            color="#514e42"
          />
        ))}
      </group>
    )
  return (
    <group position={[0, 0.85, -0.15]}>
      <Timber position={[0, 0.65, 0]} scale={[2, 1.3, 1.25]} color="#ccb98b" />
      {Array.from({ length: 9 }, (_, i) => (
        <Timber
          key={i}
          position={[0, 0.09 + i * 0.15, 0.65]}
          scale={[2.04, 0.018, 0.04]}
          color="#8c7854"
        />
      ))}
      {[-1, 1].map((s) => (
        <group
          key={s}
          position={[s * 0.58, 1.54, 0]}
          rotation={[0, 0, -s * 0.55]}
        >
          <Timber
            scale={[1.28, 0.12, 1.65]}
            color={kind === 'mcp' ? '#786344' : colors.terracotta}
          />
          {[-0.4, 0, 0.4].map((x) => (
            <Timber
              key={x}
              position={[x, 0.065, 0]}
              scale={[0.025, 0.025, 1.62]}
              color={kind === 'mcp' ? '#b4a27c' : '#c58053'}
            />
          ))}
        </group>
      ))}
      {[-0.94, 0.94].map((x) => (
        <Timber
          key={x}
          position={[x, 0.65, 0.685]}
          scale={[0.095, 1.3, 0.06]}
          color="#ba9c70"
        />
      ))}
      <Timber
        position={[0, 0.48, 0.68]}
        scale={[0.42, 0.9, 0.08]}
        color="#645039"
      />
      {[-0.64, 0.64].map((x) => (
        <group key={x} position={[x, 0.78, 0.69]}>
          <Timber scale={[0.42, 0.43, 0.06]} color="#454b43" />
          <Timber scale={[0.035, 0.45, 0.08]} color="#e4d4b2" />
          <Timber scale={[0.45, 0.035, 0.08]} color="#e4d4b2" />
        </group>
      ))}
      {[-0.64, 0.64].flatMap((x) =>
        [-1, 1].map((side) => (
          <group
            key={`${x}${side}`}
            position={[x + side * 0.29, 0.78, 0.7]}
            rotation={[0, side * 0.18, 0]}
          >
            <Timber
              scale={[0.14, 0.48, 0.05]}
              color={kind === 'mcp' ? '#658075' : '#54766a'}
            />
            {[-0.14, 0, 0.14].map((y) => (
              <Timber
                key={y}
                position={[0, y, 0.035]}
                scale={[0.13, 0.025, 0.035]}
                color="#b2ac82"
              />
            ))}
          </group>
        )),
      )}
      {kind === 'mcp' &&
        [-1, 0, 1].map((x) => (
          <Timber
            key={x}
            position={[x * 0.5, 0.2, 1]}
            scale={[0.36, 0.4, 0.4]}
            color="#a08053"
          />
        ))}
      <Chimney position={[0.55, 1.72, -0.3]} />
    </group>
  )
}

function Island({ position, label, visible, kind, labelPosition }) {
  const seed = { browser: 1, server: 3, provider: 6, mcp: 9 }[kind]
  const anchor = useRef()
  useEffect(() => {
    seaIslands.add(anchor)
    return () => seaIslands.delete(anchor)
  }, [])
  const rock = useMemo(() => {
    const geometry = new THREE.IcosahedronGeometry(1, 2),
      points = geometry.attributes.position,
      tints = []
    for (let i = 0; i < points.count; i++) {
      const x = points.getX(i),
        y = points.getY(i),
        z = points.getZ(i)
      const grain = 0.5 + 0.5 * Math.sin(x * 13 + y * 17 + z * 11 + seed),
        radius = 0.89 + 0.11 * grain
      points.setXYZ(i, x * radius, y * radius, z * radius)
      const color = new THREE.Color('#8e9181').lerp(
        new THREE.Color('#d2c6a7'),
        THREE.MathUtils.clamp((y + 1) * 0.4 + grain * 0.2, 0, 1),
      )
      tints.push(color.r, color.g, color.b)
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(tints, 3))
    geometry.computeVertexNormals()
    return geometry
  }, [seed])
  useEffect(() => () => rock.dispose(), [rock])
  const foliage = useMemo(() => {
    const vertices = [],
      indices = [],
      tints = []
    for (const [cx, cy, cz] of [
      [-1.8, 0.75, -0.45],
      [1.55, 0.72, -0.7],
      [-1.2, 0.74, 1.05],
    ])
      for (let blade = 0; blade < 9; blade++) {
        const a = (blade * Math.PI * 2) / 9 + seed,
          start = vertices.length / 3
        for (let segment = 0; segment <= 6; segment++)
          for (const side of [-1, 1]) {
            const t = segment / 6,
              r = t * (0.5 + (blade % 3) * 0.06),
              width = Math.sin(t * Math.PI) * 0.12 * side
            vertices.push(
              cx + Math.cos(a) * r - Math.sin(a) * width,
              cy + Math.sin(t * Math.PI) * 0.32 + t * 0.08,
              cz + Math.sin(a) * r + Math.cos(a) * width,
            )
            const color = new THREE.Color(
              blade % 2 ? '#3f6d40' : '#74984e',
            ).multiplyScalar(0.8 + t * 0.2)
            tints.push(color.r, color.g, color.b)
            if (segment < 6 && side === -1) {
              const i = start + segment * 2
              indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2)
            }
          }
      }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3),
    )
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(tints, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
  }, [seed])
  useEffect(() => () => foliage.dispose(), [foliage])
  return (
    <group ref={anchor} position={position}>
      <Shore seed={seed} />
      <Meadow seed={seed} />
      <mesh geometry={foliage} castShadow receiveShadow>
        <meshStandardMaterial
          vertexColors
          side={THREE.DoubleSide}
          roughness={0.93}
        />
      </mesh>
      <Landmark kind={kind} />
      {[
        [-1.8, 0.7, -0.6],
        [1.65, 0.65, -0.85],
        [-1.4, 0.7, 1.2],
      ].map((p, i) => (
        <Palm key={i} position={p} rotation={seed + i} scale={0.57 + i * 0.1} />
      ))}
      {Array.from({ length: 9 }, (_, i) => {
        const a = i * 2.4 + seed
        return (
          <mesh
            key={i}
            geometry={rock}
            position={[Math.cos(a) * 2.6, 0.22, Math.sin(a) * 2.1]}
            scale={[0.45 + (i % 3) * 0.1, 0.28, 0.32]}
            rotation={[i, i * 0.3, i * 0.7]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial
              vertexColors
              color={i % 2 ? '#bfc4b4' : '#ffffff'}
              map={grain}
              roughness={0.94}
            />
          </mesh>
        )
      })}
      <group position={[1.5, 0.65, 0.8]} rotation={[0, seed, 0]}>
        <mesh position={[0, 0.22, 0]} castShadow>
          <cylinderGeometry args={[0.18, 0.16, 0.43, 12]} />
          <meshStandardMaterial
            color="#b99b70"
            map={wood}
            normalMap={woodNormal}
            roughness={0.94}
          />
        </mesh>
        {[-0.13, 0.13].map((y) => (
          <mesh
            key={y}
            position={[0, 0.22 + y, 0]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <torusGeometry args={[0.18, 0.022, 5, 16]} />
            <meshStandardMaterial
              color="#54594f"
              metalness={0.55}
              roughness={0.72}
            />
          </mesh>
        ))}
        <mesh position={[0.36, 0.035, 0.04]} rotation={[-Math.PI / 2, 0, 0.3]}>
          <torusGeometry args={[0.16, 0.027, 5, 20, Math.PI * 1.85]} />
          <meshStandardMaterial color="#c9b78e" roughness={1} />
        </mesh>
        <mesh position={[0.36, 0.075, 0.04]} rotation={[-Math.PI / 2, 0, 0.1]}>
          <torusGeometry args={[0.11, 0.026, 5, 20, Math.PI * 1.8]} />
          <meshStandardMaterial color="#b7a079" roughness={1} />
        </mesh>
      </group>
      {[
        [-1, 0.33, 1.95],
        [-0.78, 0.32, 2.02],
        [-0.88, 0.35, 1.77],
      ].map((p, i) => (
        <mesh
          key={`shell${i}`}
          position={p}
          rotation={[0, i * 0.9, 0.15]}
          scale={[0.1, 0.035, 0.075]}
        >
          <sphereGeometry args={[1, 8, 5]} />
          <meshStandardMaterial
            color={i % 2 ? '#e4c7a7' : '#f5e6c7'}
            roughness={0.7}
          />
        </mesh>
      ))}
      <Dock
        position={[
          0,
          0.35,
          kind === 'browser' || kind === 'provider' ? -2.7 : 2.7,
        ]}
      />
      {visible && (
        <Label
          text={label}
          position={labelPosition || [0, kind === 'server' ? 5.7 : 4.3, 0]}
          scale={[7, 1.75, 1]}
        />
      )}
    </group>
  )
}

function Cargo({ text }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 192
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#e8cf94'
    ctx.fillRect(0, 0, 512, 192)
    ctx.strokeStyle = '#765933'
    ctx.lineWidth = 12
    ctx.strokeRect(6, 6, 500, 180)
    ctx.fillStyle = '#222b30'
    ctx.font = 'bold 76px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 256, 96)
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    return map
  }, [text])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <group position={[0, 0.65, 0.65]}>
      <Timber scale={[0.82, 0.38, 0.7]} color="#d2ae70" />
      <mesh position={[0, 0.195, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.8, 0.68]} />
        <meshBasicMaterial map={texture} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[0, 0, side * 0.355]}
          rotation={[0, side < 0 ? Math.PI : 0, 0]}
        >
          <planeGeometry args={[0.8, 0.36]} />
          <meshBasicMaterial map={texture} />
        </mesh>
      ))}
    </group>
  )
}

const funnelTop = [0, 1.52, -0.49]

// Soft rising smoke. The puffs live in world space, so they trail behind a
// moving source (the ferry) and rise straight up from a still one (a chimney).
// Each puff fades toward its outline, and puffs overlap into a soft plume.
function Smoke({
  source,
  offset,
  every = 0.065,
  life = 1.6,
  rise = 0.4,
  size = [0.045, 0.2],
  opacity = 0.5,
}) {
  const count = Math.ceil(life / every) + 1
  const mesh = useRef()
  const emitter = useMemo(() => new THREE.Vector3(...offset), [offset])
  const geometry = useMemo(() => {
    const shape = puff.clone()
    shape.setAttribute(
      'life',
      new THREE.InstancedBufferAttribute(new Float32Array(count).fill(1), 1),
    )
    return shape
  }, [count])
  useEffect(() => () => geometry.dispose(), [geometry])
  const uniforms = useMemo(() => ({ opacity: { value: opacity } }), [opacity])
  const state = useMemo(
    () => ({
      puffs: Array.from({ length: count }, () => ({
        age: 99,
        position: new THREE.Vector3(),
        drift: new THREE.Vector3(),
      })),
      clock: 0,
      next: 0,
      slot: 0,
      object: new THREE.Object3D(),
    }),
    [count],
  )
  const reduced = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  useLayoutEffect(() => {
    mesh.current.matrixWorldAutoUpdate = false
    mesh.current.matrixWorld.identity()
  }, [])
  useFrame((_, delta) => {
    if (!mesh.current || !source.current) return
    const dt = Math.min(delta, 0.05)
    const ages = geometry.attributes.life
    state.clock += dt
    if (!reduced && state.clock >= state.next) {
      state.next = state.clock + every
      const smoke = state.puffs[state.slot]
      state.slot = (state.slot + 1) % count
      source.current.updateWorldMatrix(true, false)
      smoke.position.copy(emitter)
      source.current.localToWorld(smoke.position)
      smoke.drift.set(
        (Math.random() - 0.5) * 0.12,
        rise * (0.9 + Math.random() * 0.25),
        (Math.random() - 0.5) * 0.12,
      )
      smoke.age = 0
    }
    state.puffs.forEach((smoke, i) => {
      smoke.age += dt
      const t = Math.min(smoke.age / life, 1)
      smoke.position.addScaledVector(smoke.drift, dt)
      smoke.position.x += 0.12 * dt
      state.object.position.copy(smoke.position)
      state.object.scale.setScalar(t >= 1 ? 0 : size[0] + t * size[1])
      state.object.updateMatrix()
      mesh.current.setMatrixAt(i, state.object.matrix)
      ages.setX(i, t)
    })
    mesh.current.instanceMatrix.needsUpdate = true
    ages.needsUpdate = true
  })
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, undefined, count]}
      frustumCulled={false}
    >
      <shaderMaterial
        transparent
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={`
          attribute float life;
          varying float vLife;
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vLife = life;
            vNormal = normalize(mat3(instanceMatrix) * normal);
            vec4 world = instanceMatrix * vec4(position, 1.0);
            vView = cameraPosition - world.xyz;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `}
        fragmentShader={`
          uniform float opacity;
          varying float vLife;
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vec3 n = normalize(vNormal);
            float facing = clamp(dot(n, normalize(vView)), 0.0, 1.0);
            float alpha = pow(1.0 - vLife, 2.2) * min(1.0, vLife * 12.0) * opacity * facing * facing * facing;
            float light = 0.62 + 0.38 * max(dot(n, normalize(vec3(-0.4, 0.8, -0.3))), 0.0);
            gl_FragColor = vec4(vec3(0.95, 0.94, 0.92) * light, alpha);
          }
        `}
      />
    </instancedMesh>
  )
}

const pennant = (() => {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.055, 0),
    new THREE.Vector3(0, -0.055, 0),
    new THREE.Vector3(0, 0, -0.24),
  ])
  geometry.computeVertexNormals()
  return geometry
})()

if (import.meta.hot) import.meta.hot.dispose(() => pennant.dispose())

function Pennant() {
  const flag = useRef()
  const reduced = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  useFrame(({ clock }) => {
    if (flag.current && !reduced)
      flag.current.rotation.y = Math.sin(clock.elapsedTime * 4.2) * 0.22
  })
  return (
    <group position={[0.3, 1.16, 0.1]}>
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.012, 0.014, 0.56, 6]} />
        <meshStandardMaterial color="#3e3529" roughness={0.8} />
      </mesh>
      <mesh ref={flag} geometry={pennant} position={[0, 0.5, 0]}>
        <meshStandardMaterial
          color="#f2e7c9"
          roughness={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

function Boat({ cargo }) {
  const boat = useRef()
  const motion = useMemo(
    () => ({
      previous: new THREE.Vector3(),
      current: new THREE.Vector3(),
      ready: false,
      time: -1,
    }),
    [],
  )
  const wakeUniforms = useMemo(
    () => ({ time: { value: 0 }, speed: { value: 0 } }),
    [],
  )
  const reduced = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  useFrame(({ clock }) => {
    wakeUniforms.time.value = clock.elapsedTime
  })
  const updateWake = () => {
    if (!boat.current || motion.time === wakeUniforms.time.value) return
    const dt = wakeUniforms.time.value - motion.time
    motion.time = wakeUniforms.time.value
    boat.current.getWorldPosition(motion.current)
    const distance = Math.hypot(
      motion.current.x - motion.previous.x,
      motion.current.z - motion.previous.z,
    )
    const speed =
      motion.ready && dt > 0 && distance < 1 && !reduced
        ? THREE.MathUtils.clamp(distance / dt / 5, 0, 1)
        : 0
    wakeUniforms.speed.value =
      !motion.ready || distance >= 1 || reduced
        ? 0
        : THREE.MathUtils.damp(wakeUniforms.speed.value, speed, 12, dt)
    motion.previous.copy(motion.current)
    motion.ready = true
  }
  const hull = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(-0.53, -0.9)
    shape.quadraticCurveTo(-0.65, 0.35, 0, 1.25)
    shape.quadraticCurveTo(0.65, 0.35, 0.53, -0.9)
    shape.quadraticCurveTo(0, -1.06, -0.53, -0.9)
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.32,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.12,
      bevelThickness: 0.13,
      curveSegments: 14,
    })
    geometry.rotateX(-Math.PI / 2)
    geometry.rotateY(Math.PI)
    return geometry
  }, [])
  useEffect(() => () => hull.dispose(), [hull])
  return (
    <group ref={boat} scale={0.82}>
      {cargo && <Cargo text={cargo} />}
      <mesh geometry={hull} castShadow>
        <meshStandardMaterial
          color={colors.terracotta}
          map={grain}
          roughness={0.72}
        />
      </mesh>
      <Timber
        position={[0, 0.4, -0.15]}
        scale={[0.95, 0.12, 1.5]}
        color="#cfb584"
      />
      <Timber
        position={[0, 0.75, -0.28]}
        scale={[0.73, 0.65, 0.85]}
        color="#ece3c7"
      />
      <Timber
        position={[0, 0.85, 0.16]}
        scale={[0.58, 0.27, 0.035]}
        color="#4d5b52"
      />
      {[-1, 1].map((s) => (
        <Timber
          key={s}
          position={[s * 0.375, 0.85, -0.28]}
          scale={[0.03, 0.26, 0.55]}
          color="#4d5b52"
        />
      ))}
      <Timber
        position={[0, 1.11, -0.28]}
        scale={[0.95, 0.09, 1.02]}
        color="#4b4636"
      />
      <mesh position={[0, 1.29, -0.49]} castShadow>
        <cylinderGeometry args={[0.1, 0.13, 0.4, 12]} />
        <meshStandardMaterial color={colors.charcoal} />
      </mesh>
      <mesh position={[0, 1.4, -0.49]}>
        <cylinderGeometry args={[0.105, 0.105, 0.06, 12]} />
        <meshStandardMaterial color={colors.terracotta} roughness={0.6} />
      </mesh>
      <Smoke source={boat} offset={funnelTop} />
      <Pennant />
      {[-1, 1].flatMap((s) =>
        [-0.75, -0.3, 0.25, 0.7].map((z) => (
          <Timber
            key={`${s}-${z}`}
            position={[s * 0.49, 0.61, z]}
            scale={[0.025, 0.35, 0.025]}
            color="#e5d6b4"
          />
        )),
      )}
      {[-1, 1].map((s) => (
        <Timber
          key={s}
          position={[s * 0.49, 0.79, -0.05]}
          scale={[0.035, 0.035, 1.5]}
          color="#e5d6b4"
        />
      ))}
      {[-0.55, 0.3].map((z) => (
        <mesh key={z} position={[0.61, 0.34, z]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.13, 0.045, 8, 16]} />
          <meshStandardMaterial color="#38382e" />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <group key={`trim${side}`}>
          <Timber
            position={[side * 0.49, 0.3, -0.24]}
            scale={[0.025, 0.04, 1.35]}
            color="#d6bc89"
          />
          {[-0.55, -0.1, 0.35].map((z) => (
            <mesh
              key={z}
              position={[side * 0.508, 0.3, z]}
              rotation={[0, 0, Math.PI / 2]}
            >
              <cylinderGeometry args={[0.025, 0.025, 0.02, 6]} />
              <meshStandardMaterial
                color="#585d53"
                metalness={0.6}
                roughness={0.65}
              />
            </mesh>
          ))}
        </group>
      ))}
      <mesh
        onBeforeRender={updateWake}
        position={[0, 0.02, -1.55]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[1.1, 1.2]} />
        <shaderMaterial
          uniforms={wakeUniforms}
          transparent
          depthWrite={false}
          vertexShader={`varying vec2 water;void main(){water=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`}
          fragmentShader={`
        varying vec2 water;uniform float time;uniform float speed;
        void main(){
          float trail=water.y;
          float side=abs(water.x-.5);
          float arm=(side-(.08+trail*.3))*19.;
          float arms=exp(-arm*arm);
          float churn=exp(-side*side*32.)*(.5+.5*sin(trail*42.-time*8.));
          float fade=smoothstep(0.,.15,trail)*(1.-smoothstep(.82,1.,trail));
          gl_FragColor=vec4(.88,.94,.87,(arms*.7+churn*.25)*fade*speed);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `}
        />
      </mesh>
    </group>
  )
}

// Foam around the hull, a bow wave and a widening wake behind the stern.
// Coordinates are ship units; the bow points to +z.
function ShipWake({ strength = 1 }) {
  const uniforms = useMemo(
    () => ({
      time: { value: 0 },
      strength: { value: strength },
      // Just above the highest swell, so waves never cut the foam.
      waterY: { value: MAP_Y + 0.06 },
    }),
    [strength],
  )
  const reduced = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  useFrame(({ clock }) => {
    uniforms.time.value = reduced ? 0 : clock.elapsedTime
  })
  return (
    <mesh
      position={[0, -0.04, -3.6]}
      rotation={[-Math.PI / 2, 0, 0]}
      frustumCulled={false}
    >
      <planeGeometry args={[6.4, 12.8]} />
      <shaderMaterial
        uniforms={uniforms}
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
        vertexShader={`
          uniform float waterY;
          varying vec2 vShip;
          void main() {
            vShip = vec2(position.x, -position.y - 3.6);
            // Lay the wake flat on the water, whatever the ship's roll.
            vec4 world = modelMatrix * vec4(position, 1.0);
            world.y = waterY;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `}
        fragmentShader={`
          uniform float time, strength;
          varying vec2 vShip;
          ${oceanNoise}
          float halfWidth(float z) {
            if (z > 0.2) { float t = clamp((z - 0.2) / 2.0, 0.0, 1.0); return 0.86 * (1.0 - t * t); }
            float t = clamp((0.2 - z) / 2.15, 0.0, 1.0);
            return 0.86 * sqrt(max(0.0, 1.0 - t * t * t * t));
          }
          void main() {
            float x = vShip.x, z = vShip.y, ax = abs(x);
            // Water flows past the ship toward the stern: advect the noise.
            vec2 flow = vec2(x, z + time * 1.1);

            // Thin, broken foam hugging the hull, strongest at the bow.
            float w = halfWidth(z);
            float alongHull = step(-1.95, z) * step(z, 2.2);
            float inside = step(ax, w) * alongHull;
            float hull = exp(-abs(ax - w) * 16.0) * alongHull
              * (0.3 + 0.7 * smoothstep(-1.4, 2.0, z));

            float behind = -1.9 - z, arms = 0.0, churn = 0.0, ridges = 0.0;
            if (behind > 0.0) {
              // Kelvin arms (about 19 degrees): they widen, feather and fade.
              float spread = 0.5 + behind * 0.34;
              float width = 0.05 + behind * 0.045;
              float across = (ax - spread) / width;
              float feather = smoothstep(-0.2, 0.45,
                gnoised(vec2(behind * 2.6 - time * 0.4, across * 0.9 + x)).x);
              arms = exp(-across * across) * exp(-behind * 0.16)
                * smoothstep(0.0, 0.9, behind) * (0.35 + 0.65 * feather);

              // Churning trail right behind the stern.
              float trailWidth = 0.42 + behind * 0.07;
              float core = exp(-(x * x) / (trailWidth * trailWidth)) * exp(-behind * 0.3);
              float boil = gnoised(flow * vec2(2.2, 1.4)).x * 0.65
                + gnoised(flow * vec2(5.1, 3.3) + 7.0).x * 0.35;
              churn = core * smoothstep(-0.35, 0.4, boil);

              // Faint curved transverse waves between the arms, broken up
              // so they do not read as a regular net.
              float between = 1.0 - smoothstep(spread - width * 2.0, spread, ax);
              float patchy = smoothstep(0.0, 0.5, gnoised(vec2(x * 1.3, behind * 0.9) + 4.0).x);
              ridges = pow(max(0.0, sin(behind * 6.0 - x * x * 1.4 - time * 2.4)), 6.0)
                * between * exp(-behind * 0.38) * 0.16 * patchy;
            }
            float grain = 0.55 + 0.45 * gnoised(flow * 9.0).x;
            float foam = (hull * grain + arms + churn * 0.95 + ridges) * (1.0 - inside);
            // Fade to zero well inside the plane, so its edges never show.
            float window = (1.0 - smoothstep(2.4, 3.1, ax))
              * smoothstep(-9.6, -7.0, z) * (1.0 - smoothstep(2.3, 2.75, z));
            gl_FragColor = vec4(vec3(0.92, 0.97, 0.96), clamp(foam, 0.0, 1.0) * 0.8 * strength * window);
          }
        `}
      />
    </mesh>
  )
}

const barrel = new THREE.CylinderGeometry(0.085, 0.075, 0.2, 14)
const hoop = new THREE.TorusGeometry(0.087, 0.008, 5, 18)

if (import.meta.hot)
  import.meta.hot.dispose(() => {
    barrel.dispose()
    hoop.dispose()
  })

// Deck dressing for the large section-divider ship.
function ShipDeck() {
  return (
    <group>
      {[
        [0.34, 0.3],
        [0.18, 0.42],
        [-0.33, -0.42],
      ].map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0.71, z]}>
          <mesh geometry={barrel} castShadow>
            <meshStandardMaterial color="#8a6a45" map={wood} roughness={0.9} />
          </mesh>
          {[-0.06, 0.06].map((y) => (
            <mesh
              key={y}
              geometry={hoop}
              position={[0, y, 0]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <meshStandardMaterial
                color="#3f3b33"
                metalness={0.6}
                roughness={0.5}
              />
            </mesh>
          ))}
        </group>
      ))}
      <Timber
        position={[-0.34, 0.69, 0.32]}
        scale={[0.2, 0.18, 0.2]}
        color="#b08d5a"
      />
      <Timber
        position={[-0.3, 0.84, 0.3]}
        rotation={[0, 0.5, 0]}
        scale={[0.14, 0.12, 0.14]}
        color="#c4a36c"
      />
      <mesh position={[0.3, 0.625, 1.25]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.08, 0.024, 6, 18]} />
        <meshStandardMaterial color="#c9b080" roughness={1} />
      </mesh>
      <group position={[0, 1.43, -0.98]}>
        <Timber
          position={[0, -0.13, -0.04]}
          scale={[0.06, 0.26, 0.06]}
          color="#5b4630"
        />
        <mesh>
          <torusGeometry args={[0.15, 0.014, 6, 24]} />
          <meshStandardMaterial color="#7a5a3a" roughness={0.8} />
        </mesh>
        {Array.from({ length: 8 }, (_, i) => (
          <Timber
            key={i}
            rotation={[0, 0, (i * Math.PI) / 4]}
            scale={[0.012, 0.4, 0.012]}
            color="#a07c50"
          />
        ))}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.04, 10]} />
          <meshStandardMaterial color="#c2a46c" metalness={0.6} roughness={0.4} />
        </mesh>
      </group>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.47, 1.33, -1.72]}>
          <mesh>
            <boxGeometry args={[0.07, 0.1, 0.07]} />
            <meshStandardMaterial
              color="#ffe2a6"
              emissive="#ffb24f"
              emissiveIntensity={4}
            />
          </mesh>
          <mesh position={[0, 0.065, 0]}>
            <coneGeometry args={[0.055, 0.05, 4]} />
            <meshStandardMaterial color="#2f2d28" metalness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// Sails breathe in the wind. The logo on a sail uses the same motion, so the
// mark stays on the cloth.
const sailClock = { value: 0 }
function flutter(shader) {
  shader.uniforms.sailClock = sailClock
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float sailClock;')
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      transformed.z += sin(sailClock * 2.3 + position.y * 2.6 + position.x * 1.2)
        * 0.022 * (1.0 - min(abs(position.y) / 0.7, 1.0));`,
    )
}
function shadeSail(shader) {
  flutter(shader)
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <color_fragment>',
    '#include <color_fragment>\ndiffuseColor.rgb *= 0.94 + 0.06 * sin(vMapUv.x * 410.0) * sin(vMapUv.y * 390.0);',
  )
}
// Hulls get a dark tarred band at the waterline.
function shadeHull(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float vHullY;')
    .replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvHullY = position.y;',
    )
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vHullY;')
    .replace(
      '#include <color_fragment>',
      '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.3, 1.0, smoothstep(0.1, 0.17, vHullY));',
    )
    .replace(
      '#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor=max(roughnessFactor,0.84);',
    )
}

function PirateShip({ mark, wake = 0.55 }) {
  const reduced = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  useFrame(({ clock }) => {
    if (!reduced) sailClock.value = clock.elapsedTime
  })
  const hull = useMemo(() => {
    const outline = new THREE.Shape()
    outline.moveTo(-0.64, -1.7)
    outline.quadraticCurveTo(-0.94, 0.4, 0, 2.15)
    outline.quadraticCurveTo(0.94, 0.4, 0.64, -1.7)
    outline.quadraticCurveTo(0, -1.95, -0.64, -1.7)
    const geo = new THREE.ExtrudeGeometry(outline, {
      depth: 0.43,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: 0.13,
      bevelThickness: 0.13,
      curveSegments: 16,
    })
    geo.rotateX(-Math.PI / 2)
    geo.rotateY(Math.PI)
    return geo
  }, [])
  const sail = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1.75, 1.25, 10, 8)
    const p = geo.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i)
      p.setXYZ(
        i,
        x * (0.91 - y * 0.12),
        y - 0.045 * Math.cos(x * 2.7) * Math.max(0, -y),
        0.32 * Math.cos(x * 1.4) * Math.cos(y * 1.5),
      )
    }
    geo.computeVertexNormals()
    return geo
  }, [])
  const ropes = useMemo(() => {
    const vertices = []
    for (const z of [-0.8, 0.65]) {
      for (const x of [-0.65, 0.65])
        vertices.push(0, 3.6, z, x, 0.6, z + 0.55, 0, 3.6, z, x, 0.6, z - 0.55)
      for (let rung = 0; rung < 7; rung++) {
        const t = rung / 9,
          y = 0.7 + t * 2.8,
          width = 0.6 * (1 - t)
        vertices.push(-width, y, z + 0.5 * (1 - t), width, y, z + 0.5 * (1 - t))
      }
      // The old seam lines across the sails are gone: the sails now move in
      // the wind, and fixed lines on them read as tears.
    }
    vertices.push(0, 3.7, -0.8, 0, 0.65, -1.8, 0, 3.7, 0.65, 0, 0.65, 2.45)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    return geo
  }, [mark])
  // The close-up divider ship gets real rope tubes instead of 1px lines.
  const ropeTubes = useMemo(() => {
    if (!mark) return null
    const points = ropes.attributes.position,
      a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      up = new THREE.Vector3(0, 1, 0),
      turn = new THREE.Quaternion(),
      place = new THREE.Matrix4(),
      one = new THREE.Vector3(1, 1, 1),
      parts = []
    for (let i = 0; i < points.count; i += 2) {
      a.fromBufferAttribute(points, i)
      b.fromBufferAttribute(points, i + 1)
      const length = a.distanceTo(b)
      if (length < 1e-4) continue
      const tube = new THREE.CylinderGeometry(0.01, 0.01, length, 5, 1, true)
      turn.setFromUnitVectors(up, b.clone().sub(a).normalize())
      place.compose(a.clone().add(b).multiplyScalar(0.5), turn, one)
      parts.push(tube.applyMatrix4(place))
    }
    const merged = mergeGeometries(parts)
    parts.forEach((part) => part.dispose())
    return merged
  }, [mark, ropes])
  useEffect(() => () => ropeTubes?.dispose(), [ropeTubes])
  const sailMarks = useMemo(
    () =>
      mark
        ? [0, 1].map((j) => {
            const geo = sail.clone(),
              uv = geo.attributes.uv,
              p = geo.attributes.position
            const width =
                (0.61 * mark.image.width) /
                mark.image.height /
                (j ? 0.672 : 0.84),
              height = 0.61 / (j ? 0.75 : 1)
            for (let i = 0; i < uv.count; i++) {
              uv.setXY(
                i,
                ((uv.getX(i) - 0.5) * 1.75) / width + 0.5,
                ((uv.getY(i) - 0.5) * 1.25) / height + 0.5,
              )
              p.setZ(i, p.getZ(i) + 0.001)
            }
            return geo
          })
        : [],
    [sail, mark],
  )
  useEffect(
    () => () => {
      hull.dispose()
      sail.dispose()
      ropes.dispose()
      sailMarks.forEach((geo) => geo.dispose())
    },
    [hull, sail, ropes, sailMarks],
  )
  return (
    <group>
      <mesh geometry={hull} castShadow>
        <meshStandardMaterial
          color="#ac9170"
          map={wood}
          normalMap={woodNormal}
          normalScale={[0.16, 0.16]}
          roughnessMap={woodRoughness}
          roughness={0.94}
          onBeforeCompile={shadeHull}
        />
      </mesh>
      <Timber
        position={[0, 0.53, -0.1]}
        scale={[1.2, 0.14, 3.2]}
        color="#bea477"
      />
      <Timber
        position={[0, 0.83, -1.35]}
        scale={[1.02, 0.5, 0.68]}
        color="#827052"
      />
      <Timber
        position={[0, 1.12, -1.35]}
        scale={[1.2, 0.1, 0.86]}
        color="#9f8764"
      />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Timber
            position={[side * 0.65, 0.87, -0.17]}
            scale={[0.07, 0.09, 2.7]}
            color="#ad956e"
          />
          <Timber
            position={[side * 0.61, 0.3, -0.4]}
            scale={[0.025, 0.05, 2.5]}
            color="#d0b480"
          />
          {[-1.1, -0.55, 0, 0.55].map((z) => (
            <mesh
              key={`port${z}`}
              position={[side * 0.645, 0.39, z]}
              rotation={[0, Math.PI / 2, 0]}
            >
              <circleGeometry args={[0.065, 12]} />
              <meshStandardMaterial
                color="#242c2b"
                roughness={0.84}
                side={THREE.DoubleSide}
              />
            </mesh>
          ))}
          {[-1.4, -0.75, -0.1, 0.55, 1.1].map((z) => (
            <Timber
              key={z}
              position={[side * 0.62, 0.69, z]}
              scale={[0.045, 0.37, 0.045]}
              color="#ad956e"
            />
          ))}
        </group>
      ))}
      {[-0.8, 0.65].map((z, i) => (
        <group key={z}>
          <mesh position={[0, 2.08, z]} castShadow>
            <cylinderGeometry args={[0.045, 0.075, 3.15, 10]} />
            <meshStandardMaterial color="#6b563d" map={wood} />
          </mesh>
          {[1.65, 2.95].map((y, j) => (
            <group key={y} position={[0, y, z]}>
              <Timber
                position={[0, 0.63, 0]}
                scale={[(j === 0 ? 2 : 1.65) * (mark ? 0.84 : 1), 0.06, 0.06]}
                color="#5f4b36"
              />
              <mesh
                geometry={sail}
                position={[0, 0, 0.07]}
                scale={
                  j === 0
                    ? [mark ? 0.84 : 1, 1, 1]
                    : [mark ? 0.672 : 0.8, 0.75, 1]
                }
                castShadow
              >
                <meshStandardMaterial
                  color={i ? '#e1dfc9' : '#d5d1b7'}
                  roughness={1}
                  side={THREE.DoubleSide}
                  onBeforeCompile={shadeSail}
                  map={grain}
                />
              </mesh>
              {mark && (
                <mesh
                  geometry={sailMarks[j]}
                  position={[0, 0, 0.07]}
                  scale={j === 0 ? [0.84, 1, 1] : [0.672, 0.75, 1]}
                >
                  <meshBasicMaterial
                    map={mark}
                    transparent
                    toneMapped={false}
                    depthWrite={false}
                    side={THREE.DoubleSide}
                    onBeforeCompile={flutter}
                  />
                </mesh>
              )}
            </group>
          ))}
          <mesh position={[0.24, 3.75, z]} rotation={[0, -0.15, -0.08]}>
            <planeGeometry args={[0.5, 0.29]} />
            <meshStandardMaterial
              color="#303638"
              roughness={1}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh position={[0.25, 3.75, z + 0.006]}>
            <circleGeometry args={[0.048, 12]} />
            <meshBasicMaterial color="#dcdcca" side={THREE.DoubleSide} />
          </mesh>
          {[-1, 1].map((s) => (
            <Timber
              key={s}
              position={[0.25, 3.69, z + 0.01]}
              rotation={[0, 0, s * 0.55]}
              scale={[0.14, 0.018, 0.012]}
              color="#dcdcca"
            />
          ))}
        </group>
      ))}
      {ropeTubes ? (
        <mesh geometry={ropeTubes}>
          <meshStandardMaterial color="#6e604a" roughness={0.9} />
        </mesh>
      ) : (
        <lineSegments geometry={ropes}>
          <lineBasicMaterial color="#5e655f" transparent opacity={0.72} />
        </lineSegments>
      )}
      <ShipWake strength={wake} />
      {mark && <ShipDeck />}
      <Timber
        position={[0, 0.7, 1.99]}
        rotation={[0.12, 0, 0]}
        scale={[0.07, 0.07, 1.3]}
        color="#826c4e"
      />
      {mark &&
        [-1, 1].flatMap((side) =>
          [-0.8, 0, 0.8].map((z) => (
            <group key={`${side}${z}`} position={[side * 0.65, 0.63, z]}>
              <Timber
                position={[0, 0.025, 0]}
                scale={[0.22, 0.065, 0.23]}
                color="#6c5940"
              />
              <mesh
                position={[side * 0.03, 0.12, 0]}
                rotation={[0, 0, Math.PI / 2]}
              >
                <cylinderGeometry args={[0.055, 0.07, 0.32, 16]} />
                <meshStandardMaterial
                  color="#41443e"
                  metalness={0.65}
                  roughness={0.58}
                />
              </mesh>
              <mesh
                position={[side * 0.191, 0.12, 0]}
                rotation={[0, (side * Math.PI) / 2, 0]}
              >
                <circleGeometry args={[0.039, 16]} />
                <meshBasicMaterial color="#171e1d" side={THREE.DoubleSide} />
              </mesh>
              {[-0.09, 0.09].map((w) => (
                <mesh
                  key={w}
                  position={[0, 0.015, w]}
                  rotation={[Math.PI / 2, 0, 0]}
                >
                  <cylinderGeometry args={[0.06, 0.06, 0.035, 12]} />
                  <meshStandardMaterial color="#514937" roughness={0.9} />
                </mesh>
              ))}
            </group>
          )),
        )}
    </group>
  )
}

function AmbientShips() {
  const ships = useRef([])
  const routes = useMemo(
    () =>
      Array.from({ length: 4 }, (_, i) => ({
        phase: i * 2.39996 + 0.7,
        rx: 25 + i * 3,
        rz: 25 + i * 2,
        speed: (i % 2 ? -1 : 1) * (0.009 + i * 0.002),
        scale: 0.54 + i * 0.055,
      })),
    [],
  )
  useFrame(({ clock }) => {
    const time = clock.elapsedTime
    routes.forEach((route, i) => {
      const ship = ships.current[i]
      if (!ship) return
      const angle = route.phase + time * route.speed
      ship.position.set(
        Math.cos(angle) * route.rx,
        MAP_Y + 0.12 + Math.sin(time * 0.7 + i) * 0.035,
        Math.sin(angle) * route.rz - 4,
      )
      ship.rotation.set(
        Math.sin(time * 0.6 + i) * 0.012,
        Math.atan2(
          -route.rx * Math.sin(angle) * route.speed,
          route.rz * Math.cos(angle) * route.speed,
        ),
        Math.cos(time * 0.8 + i) * 0.025,
      )
    })
  })
  return (
    <group>
      {routes.map((route, i) => (
        <group
          key={i}
          ref={(el) => {
            ships.current[i] = el
          }}
          scale={route.scale}
        >
          <PirateShip />
        </group>
      ))}
    </group>
  )
}

function ProviderShip({ text }) {
  const mark = useLoader(
    THREE.TextureLoader,
    './logos/tanstack-emblem-charcoal-256.png',
  )
  useMemo(() => {
    mark.colorSpace = THREE.SRGBColorSpace
  }, [mark])
  const ship = useRef()
  const elapsed = useRef(0)
  const reduced = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const lettering = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 180
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#514333'
    ctx.fillRect(0, 0, 1024, 180)
    ctx.font = 'bold 108px Georgia, serif'
    ctx.fillStyle = '#f6edce'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 512, 94)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }, [text])
  useEffect(() => () => lettering.dispose(), [lettering])
  useFrame((_, delta) => {
    elapsed.current += Math.min(delta, 0.1)
    const t = Math.max(0, elapsed.current - 0.25)
    const x =
      t < 1.4
        ? THREE.MathUtils.lerp(25, 65, 1 - Math.pow(1 - t / 1.4, 3))
        : 65 + Math.min((t - 1.4) / 11, 1) * 40
    ship.current.position.set(reduced ? 65 : x, MAP_Y + 0.15, 8)
    ship.current.rotation.set(
      0,
      Math.PI / 2,
      reduced ? 0 : Math.sin(t * 0.7) * 0.012,
    )
  })
  return (
    <group ref={ship} position={[25, MAP_Y + 0.15, 8]} scale={4.2}>
      <PirateShip mark={mark} wake={0.9} />
      <mesh position={[-0.87, 0.46, -0.08]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[3.3, 0.58]} />
        <meshBasicMaterial map={lettering} />
      </mesh>
    </group>
  )
}

function Route({ curve, color = colors.terracotta }) {
  return (
    <group>
      {Array.from({ length: 30 }, (_, i) => {
        const p = curve.getPoint(i / 29),
          t = curve.getTangent(i / 29)
        return (
          <mesh
            key={i}
            position={[p.x, MAP_Y + 0.11, p.z]}
            rotation={[0, Math.atan2(t.x, t.z), 0]}
          >
            <boxGeometry args={[0.09, 0.025, 0.29]} />
            <meshBasicMaterial color={color} transparent opacity={0.68} />
          </mesh>
        )
      })}
    </group>
  )
}

function HarborGate({ raised, approval }) {
  const leaf = useRef()
  const initialAngle = useRef(raised ? -Math.PI / 2 : 0)
  useFrame((_, dt) => {
    if (leaf.current)
      leaf.current.rotation.x = THREE.MathUtils.damp(
        leaf.current.rotation.x,
        (approval ? approval.current.gateRaised : raised) ? -Math.PI / 2 : 0,
        6,
        dt,
      )
  })
  return (
    <group position={[5, MAP_Y, 0]} rotation={[0, 0.65, 0]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 2.55, 0, 0]}>
          <mesh position={[0, 0.3, 0]} castShadow>
            <cylinderGeometry args={[0.8, 1.05, 0.8, 12]} />
            <meshStandardMaterial color="#9c9279" map={grain} />
          </mesh>
          <FoamRing position={[0, 0.065, 0]} radius={1.0} width={0.38} seed={s * 5} />
          <Timber position={[0, 0.75, 0]} scale={[2, 0.2, 1.3]} />
          {[-0.48, 0.48].map((z) => (
            <Timber
              key={z}
              position={[-s * 0.72, 1.2, z]}
              scale={[0.13, 1.5, 0.13]}
              color="#65533b"
            />
          ))}
        </group>
      ))}
      <group
        ref={leaf}
        position={[0, -0.45, -1.05]}
        rotation={[initialAngle.current, 0, 0]}
      >
        {Array.from({ length: 15 }, (_, i) => (
          <Timber
            key={i}
            position={[-1.5 + i * 0.215, 0, 1.05]}
            scale={[0.2, 0.16, 2.1]}
            color={i % 2 ? '#aa8b58' : '#957649'}
          />
        ))}
        {[0.18, 1.05, 1.93].map((z) => (
          <Timber
            key={z}
            position={[0, -0.1, z]}
            scale={[3.3, 0.08, 0.1]}
            color={z === 1.93 ? colors.terracotta : '#514631'}
          />
        ))}
      </group>
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[s * 1.82, 0.86, -0.8]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <torusGeometry args={[0.24, 0.045, 8, 24]} />
          <meshStandardMaterial
            color="#5b5140"
            metalness={0.65}
            roughness={0.5}
          />
        </mesh>
      ))}
    </group>
  )
}

function Buoy({ position, lit }) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.32, 16, 12]} />
        <meshStandardMaterial color={colors.terracotta} roughness={0.5} />
      </mesh>
      <Timber
        position={[0, 0.45, 0]}
        scale={[0.05, 0.75, 0.05]}
        color={colors.charcoal}
      />
      <mesh position={[0, 0.85, 0]}>
        <sphereGeometry args={[0.16, 12, 8]} />
        <meshStandardMaterial
          color={lit ? '#ffe8ab' : '#66553d'}
          emissive={lit ? '#edac52' : '#000000'}
          emissiveIntensity={lit ? 1.2 : 0}
        />
      </mesh>
    </group>
  )
}

function McpIsland({
  animate,
  labeled,
  position = [0, -20],
  label = 'MCP',
  delay = 0,
  reveal,
  slot = 0,
  route,
}) {
  const ref = useRef(),
    routeRef = useRef(),
    elapsed = useRef(0)
  const reduced = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  useFrame((_, dt) => {
    elapsed.current += Math.min(dt, 0.05)
    if (!ref.current) return
    if (reveal) {
      const t =
        !animate || reduced
          ? 1
          : THREE.MathUtils.smoothstep(elapsed.current, delay, delay + 0.9)
      ref.current.visible = t > 0
      ref.current.position.y = MAP_Y - (1 - t) * 5
      reveal.current[slot] = THREE.MathUtils.smoothstep(t, 0.85, 1)
      if (routeRef.current) routeRef.current.visible = t >= 1
    } else
      ref.current.position.y = THREE.MathUtils.damp(
        ref.current.position.y,
        MAP_Y,
        2.5,
        dt,
      )
  })
  return (
    <>
      <group
        ref={ref}
        visible={!reveal || !animate || reduced}
        position={[
          position[0],
          animate && !reduced ? MAP_Y - 5 : MAP_Y,
          position[1],
        ]}
      >
        <Island
          position={[0, 0, 0]}
          label={label}
          visible={labeled}
          kind="mcp"
          labelPosition={reveal ? [0, 1, -4] : undefined}
        />
      </group>
      {route && (
        <group ref={routeRef} visible={!animate || reduced}>
          <Route curve={route} />
        </group>
      )}
    </>
  )
}

function FerryTrip({
  curve,
  reverse = false,
  start = 0,
  end = 1,
  delay = 0,
  loop = false,
  waiting = false,
  pauseAt,
  cargo,
  overviewBounds,
  legs: flow,
  legIndex = 0,
  work,
  approval,
}) {
  // One slide sails one leg of the flow. The earlier legs count as done.
  const legs = useMemo(() => flow?.slice(0, legIndex + 1), [flow, legIndex])
  const legOffset = useMemo(
    () =>
      (legs || [])
        .slice(0, -1)
        .reduce((sum, stage) => sum + 2.4 + (stage.holdAfter ?? 0.3), 0),
    [legs],
  )
  const ref = useRef(),
    cargoLabel = useRef(),
    tow = useRef([]),
    towLine = useRef([]),
    elapsed = useRef(0)
  const towPoint = useMemo(() => new THREE.Vector3(), [])
  const towRopes = useMemo(
    () =>
      Array.from({ length: approval ? 2 : 1 }, () =>
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0.15, -0.9),
          new THREE.Vector3(),
        ]),
      ),
    [Boolean(approval)],
  )
  useEffect(() => () => towRopes.forEach((rope) => rope.dispose()), [towRopes])
  const reduced = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const [leg, setLeg] = useState(() => (legs ? legs.length - 1 : 0))
  const activeCurve = legs?.[leg].curve || curve
  const activeReverse = legs?.[leg].reverse ?? reverse
  const activeCargo = legs?.[leg].cargo || cargo
  const activeTow = legs?.[leg].tow || []
  const inverseRotation = useMemo(() => new THREE.Quaternion(), [])
  const labelProjection = useMemo(() => new THREE.Vector3(), [])
  const labelWorld = useMemo(() => new THREE.Vector3(), [])
  const ownBounds = useMemo(() => ({ x: 0, y: 0, w: 0, h: 0 }), [])
  const islandBounds = useMemo(
    () => [
      ...Object.entries(islands).map(([name, position]) => ({
        name,
        world: new THREE.Vector3(...position).add(
          new THREE.Vector3(
            ...(legs && ['browser', 'provider'].includes(name)
              ? [0, 0.8, 4]
              : [0, name === 'server' ? 5.7 : 4.3, 0]),
          ),
        ),
        height: 1.75,
        x: 0,
        y: 0,
        w: 0,
        h: 0,
      })),
      ...(work
        ? [
            {
              name: 'Client tools',
              world: new THREE.Vector3(-15.1, MAP_Y + 4.2, 6),
              height: 1.33,
              x: 0,
              y: 0,
              w: 0,
              h: 0,
            },
            {
              name: 'Server tools',
              world: new THREE.Vector3(-5.6, MAP_Y + 3.65, -8.5),
              height: 1.33,
              x: 0,
              y: 0,
              w: 0,
              h: 0,
            },
            {
              name: 'RUN TOOL',
              world: new THREE.Vector3(-15.1, MAP_Y + 0.4, 8.7),
              height: 1.05,
              x: 0,
              y: 0,
              w: 0,
              h: 0,
            },
            {
              name: 'RUN TOOL',
              world: new THREE.Vector3(-5.6, MAP_Y + 0.4, -5.8),
              height: 1.05,
              x: 0,
              y: 0,
              w: 0,
              h: 0,
            },
          ]
        : []),
      ...(approval
        ? [
            {
              name: 'WAITING FOR APPROVAL',
              world: new THREE.Vector3(-9, MAP_Y + 10, 8),
              height: 1,
              x: 0,
              y: 0,
              w: 0,
              h: 0,
            },
          ]
        : []),
    ],
    [legs, work, approval],
  )
  const obstacles = useMemo(() => [...islandBounds], [islandBounds])
  useEffect(
    () => () => overviewBounds?.delete(ownBounds),
    [overviewBounds, ownBounds],
  )
  const labelSide = useMemo(
    () => (activeCurve.getPoint(0.5).x < 0 ? -1 : 1),
    [activeCurve],
  )
  const leader = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 1.1, 0.5, 0, 1.1, 0.5], 3),
    )
    return geometry
  }, [])
  useEffect(() => () => leader.dispose(), [leader])
  useFrame(({ clock, camera, size }, dt) => {
    const motion = useTalk.getState().cameraMotion
    // The next leg keeps the camera still, so the boat leaves at once.
    const still =
      motion?.to &&
      motion.from.distanceToSquared(motion.to) < 1e-6 &&
      motion.fromLook.distanceToSquared(motion.toLook) < 1e-6
    if (!legs || !motion || motion.done || still)
      elapsed.current += Math.min(dt, 0.05)
    const progress = loop
      ? (elapsed.current * 0.24 + start) % 1
      : THREE.MathUtils.clamp((elapsed.current - delay) / 2.4, 0, 1)
    let t = loop
      ? progress
      : THREE.MathUtils.lerp(
          start,
          end,
          progress * progress * (3 - 2 * progress),
        )
    let path = curve,
      backwards = reverse,
      phaseIndex = leg
    if (legs) {
      const time = reduced
        ? Infinity
        : legOffset + Math.max(0, elapsed.current - 0.25)
      let nextLeg = 0,
        legStart = 0
      while (
        nextLeg < legs.length - 1 &&
        time >= legStart + 2.4 + (legs[nextLeg].holdAfter ?? 0.3)
      ) {
        legStart += 2.4 + (legs[nextLeg].holdAfter ?? 0.3)
        nextLeg++
      }
      if (nextLeg !== leg) setLeg(nextLeg)
      phaseIndex = nextLeg
      path = legs[nextLeg].curve
      backwards = legs[nextLeg].reverse
      t = THREE.MathUtils.smoothstep(time - legStart, 0, 2.4)
      if (approval) {
        // The boat waits at Browser until the next slide approves the call.
        // Then its APPROVED cargo label says the rest.
        const waiting = Boolean(
          legs[nextLeg].approvalWait && time - legStart >= 2.4,
        )
        const returnPoint = path.getPoint(1 - t)
        const gateLocalZ =
          (returnPoint.x - 5) * Math.sin(0.65) + returnPoint.z * Math.cos(0.65)
        // Clear the full bridge sweep by .10 with the whole boat inside radius 1.35.
        const clearedGate = gateLocalZ + 1.35 < -1.23
        const gateRaised =
          (nextLeg === 2 && clearedGate) || Boolean(legs[nextLeg].approvalWait)
        approval.current = { waiting, gateRaised }
      }
      if (work) {
        let cursor = 0
        for (const stage of legs) {
          if (stage.work)
            work.current = {
              site: stage.work,
              progress: THREE.MathUtils.clamp(
                (time - cursor - 2.4) / (stage.holdAfter ?? 0.3),
                0,
                1,
              ),
            }
          cursor += 2.4 + (stage.holdAfter ?? 0.3)
        }
      }
    }
    if (pauseAt !== undefined) {
      const time = elapsed.current
      t =
        time < 1
          ? pauseAt * THREE.MathUtils.smoothstep(time, 0, 1)
          : time < 2
            ? pauseAt
            : THREE.MathUtils.lerp(
                pauseAt,
                1,
                THREE.MathUtils.smoothstep(time, 2, 4),
              )
    }
    const p = path.getPoint(backwards ? 1 - t : t),
      tangent = path.getTangent(backwards ? 1 - t : t)
    if (ref.current) {
      ref.current.position.copy(p)
      ref.current.position.y +=
        legs && reduced ? 0 : Math.sin(clock.elapsedTime * 2.1) * 0.035
      ref.current.rotation.set(
        legs && reduced ? 0 : Math.sin(clock.elapsedTime * 1.7) * 0.025,
        Math.atan2(tangent.x, tangent.z) + (backwards ? Math.PI : 0),
        legs && reduced ? 0 : Math.cos(clock.elapsedTime * 1.5) * 0.025,
      )
    }
    for (let slot = 0; slot < towRopes.length; slot++) {
      if (!tow.current[slot] || !towLine.current[slot] || !ref.current) continue
      const stage = legs?.[phaseIndex]
      const load =
        stage?.tow || (stage?.cargo === 'TOOL RESULT' ? ['TOOL RESULT'] : [])
      const towing = Boolean(load[slot]) && !(stage.unloadAtEnd && t >= 1)
      tow.current[slot].visible = towLine.current[slot].visible = towing
      if (towing) {
        const lengths = path.getLengths(),
          index = (backwards ? 1 - t : t) * (lengths.length - 1)
        const low = Math.floor(index),
          arc = THREE.MathUtils.lerp(
            lengths[low],
            lengths[Math.min(low + 1, lengths.length - 1)],
            index - low,
          )
        let trailPath = path,
          trailReverse = backwards
        let distance =
          (backwards ? path.getLength() - arc : arc) - 2.5 - slot * 1.5
        let previous = phaseIndex - 1
        while (
          distance < 0 &&
          previous >= 0 &&
          (legs[previous].tow?.[slot] ||
            (slot === 0 && legs[previous].cargo === 'TOOL RESULT'
              ? 'TOOL RESULT'
              : undefined)) === load[slot]
        ) {
          trailPath = legs[previous].curve
          trailReverse = legs[previous].reverse
          distance += trailPath.getLength()
          previous--
        }
        const total = trailPath.getLength(),
          at = trailReverse ? total - distance : distance
        if (at < 0 || at > total) {
          const end = at < 0 ? 0 : 1
          towPoint
            .copy(trailPath.getPoint(end))
            .addScaledVector(
              trailPath.getTangent(end),
              at < 0 ? at : at - total,
            )
        } else towPoint.copy(trailPath.getPointAt(at / total))
        towPoint.y = MAP_Y + 0.18
        inverseRotation.copy(ref.current.quaternion).invert()
        towPoint.sub(ref.current.position).applyQuaternion(inverseRotation)
        tow.current[slot].position.copy(towPoint)
        const rope = towRopes[slot],
          from = slot ? tow.current[slot - 1].position : null
        rope.attributes.position.setXYZ(
          0,
          from ? from.x : 0,
          from ? from.y + 0.15 : 0.15,
          from ? from.z : -0.9,
        )
        rope.attributes.position.setXYZ(
          1,
          towPoint.x,
          towPoint.y + 0.15,
          towPoint.z,
        )
        rope.attributes.position.needsUpdate = true
        rope.computeBoundingSphere()
      }
    }
    if (cargoLabel.current && ref.current) {
      inverseRotation.copy(ref.current.quaternion).invert()
      cargoLabel.current.position
        .set(labelSide * 10, 0.7, 0)
        .applyQuaternion(camera.quaternion)
        .applyQuaternion(inverseRotation)
      cargoLabel.current.position.y += 1.1
      cargoLabel.current.position.z += 0.5
      if (camera.view?.offsetX || overviewBounds) {
        labelProjection
          .copy(cargoLabel.current.position)
          .applyQuaternion(ref.current.quaternion)
          .add(ref.current.position)
          .project(camera)
        const split = Boolean(camera.view?.offsetX)
        const right = camera.view?.offsetX < 0
        if (split)
          labelProjection.x = THREE.MathUtils.clamp(
            labelProjection.x,
            right ? 0.24 : -0.76,
            right ? 0.76 : -0.24,
          )
        if (overviewBounds) {
          const ctx =
            cargoLabel.current.children[0]?.material?.map?.image?.getContext(
              '2d',
            )
          const focal =
            size.height /
            (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
          labelWorld.copy(labelProjection).unproject(camera)
          const distance = camera.position.distanceTo(labelWorld)
          const base = (1.5 * (128 / 192) * focal) / distance
          const depth = -labelWorld.applyMatrix4(camera.matrixWorldInverse).z
          const font =
            ((1.5 * (128 / 192) * focal) / depth) *
            THREE.MathUtils.clamp(1, 24 / base, 48 / base)
          ownBounds.w =
            (((ctx?.measureText(activeCargo).width || 650) / 128 + 0.08) *
              font) /
            size.width
          ownBounds.h = (font + 8) / size.height
          labelProjection.x = THREE.MathUtils.clamp(
            labelProjection.x,
            (split && right ? 0 : -1) + ownBounds.w + 60 / size.width,
            (!split || right ? 1 : 0) - ownBounds.w - 60 / size.width,
          )
          for (const bounds of islandBounds) {
            labelWorld.copy(bounds.world).project(camera)
            bounds.x = labelWorld.x
            bounds.y = labelWorld.y
            const distance = camera.position.distanceTo(bounds.world)
            const base = (bounds.height * (128 / 192) * focal) / distance
            const depth = -labelWorld
              .copy(bounds.world)
              .applyMatrix4(camera.matrixWorldInverse).z
            const font =
              ((bounds.height * (128 / 192) * focal) / depth) *
              THREE.MathUtils.clamp(1, 24 / base, 48 / base)
            const name =
              bounds.name === 'mcp'
                ? 'MCP'
                : bounds.name[0].toUpperCase() + bounds.name.slice(1)
            bounds.w =
              (((ctx?.measureText(name).width || 650) / 128 + 0.08) * font) /
              size.width
            bounds.h = (font + 8) / size.height
          }
          obstacles.length = islandBounds.length
          for (const bounds of overviewBounds.values()) obstacles.push(bounds)
          for (let pass = 0; pass < 3; pass++) {
            for (const bounds of obstacles) {
              if (bounds === ownBounds) continue
              const gapX = ownBounds.w + bounds.w + 60 / size.width
              const gapY = ownBounds.h + bounds.h + 48 / size.height
              if (
                Math.abs(labelProjection.x - bounds.x) < gapX &&
                Math.abs(labelProjection.y - bounds.y) < gapY
              ) {
                const above = bounds.y + gapY,
                  below = bounds.y - gapY
                labelProjection.y =
                  labelSide < 0
                    ? above < 0.9 - ownBounds.h
                      ? above
                      : below
                    : below > -0.9 + ownBounds.h
                      ? below
                      : above
              }
            }
          }
          const sprite = cargoLabel.current.children[0]
          if (sprite) {
            const depth = -labelWorld
              .copy(labelProjection)
              .unproject(camera)
              .applyMatrix4(camera.matrixWorldInverse).z
            ownBounds.w = (sprite.scale.x * focal) / depth / size.width
            labelProjection.x = THREE.MathUtils.clamp(
              labelProjection.x,
              (split && right ? 0 : -1) + ownBounds.w + 60 / size.width,
              (!split || right ? 1 : 0) - ownBounds.w - 60 / size.width,
            )
          }
          ownBounds.x = labelProjection.x
          ownBounds.y = labelProjection.y
          overviewBounds.set(ownBounds, ownBounds)
        }
        labelProjection
          .unproject(camera)
          .sub(ref.current.position)
          .applyQuaternion(inverseRotation)
        cargoLabel.current.position.copy(labelProjection)
      }
      const end = cargoLabel.current.position
      leader.attributes.position.setXYZ(1, end.x, end.y, end.z)
      leader.attributes.position.needsUpdate = true
      leader.computeBoundingSphere()
    }
  })
  return (
    <group
      ref={ref}
      position={activeCurve.getPoint(activeReverse ? 1 - start : start)}
    >
      <Boat cargo={activeCargo} />
      {legs &&
        towRopes.map((rope, slot) => (
          <group key={slot}>
            <line
              ref={(node) => {
                towLine.current[slot] = node
              }}
              geometry={rope}
              visible={false}
            >
              <lineBasicMaterial color="#c5ae7c" />
            </line>
            <group
              ref={(node) => {
                tow.current[slot] = node
              }}
              visible={false}
            >
              <Timber scale={[0.9, 0.65, 0.9]} color="#b99151" />
              <Timber
                position={[0, 0.34, 0]}
                scale={[0.98, 0.08, 0.98]}
                color="#d5b77c"
              />
              {[-0.31, 0.31].map((x) => (
                <Timber
                  key={x}
                  position={[x, 0, 0]}
                  scale={[0.065, 0.7, 0.95]}
                  color="#4a3e2b"
                />
              ))}
              {activeTow[slot] && (
                <Label
                  text={activeTow[slot]}
                  position={[0, slot === 0 ? (approval ? 1.7 : 1.3) : 0.7, 0]}
                  scale={[2.4, 0.6, 1]}
                />
              )}
            </group>
          </group>
        ))}
      {activeCargo && (
        <>
          <line geometry={leader} ref={overlay}>
            <lineBasicMaterial
              color="#f5edcc"
              transparent
              opacity={0.8}
              depthTest={false}
            />
          </line>
          <group ref={cargoLabel}>
            <Label text={activeCargo} scale={[6, 1.5, 1]} />
          </group>
        </>
      )}
      {waiting && (
        <Label text="Waiting" position={[0, 2, 0]} scale={[5, 1.25, 1]} />
      )}
    </group>
  )
}

function SceneCaption({ secondary = false }) {
  const index = useTalk((s) => s.index),
    step = useTalk((s) => s.step),
    slides = useTalk((s) => s.slides)
  const desired = useMemo(() => {
    const slide = slides[index]
    if (
      [
        'title',
        'the-map',
        'three-islands',
        'close',
        'thank-you',
        'protocols',
        'llm-providers',
        'custom-servers',
        'stream-events',
        'tools-overview',
        'server-tool-flow',
        'client-tool-flow',
        'tool-approvals-overview',
        'mcp-punch',
        'mcp-multiple-punch',
        'middleware-lifecycle-overview',
      ].includes(slide.worldId || slide.id)
    )
      return null
    if (slide.codeWall) {
      if (secondary && slide.wallColumns.length === 1) return null
      const side =
        slide.wallColumns.length === 1 ? 'center' : secondary ? 'right' : 'left'
      return {
        key: `${slide.worldId || slide.id}:${side}`,
        side,
        content: {
          ...slide,
          ...slide.wallColumns[secondary ? 1 : 0],
          wallColumns: undefined,
          halfPanel: true,
        },
        step: 0,
      }
    }
    if (secondary) return null
    const side =
      slide.id === 'tanstack-approval-definitions'
        ? 'center'
        : slide.splitSides?.[step] || slide.splitSide || 'right'
    const base = slide.hopCode || slide
    const content =
      base.form === 'punch'
        ? {
            ...base,
            form: 'statement',
            title: slide.captionSteps?.[step] || slide.caption || slide.title,
            halfPanel: true,
          }
        : { ...base, halfPanel: true }
    return { key: `${slide.worldId || slide.id}:${side}`, side, content, step }
  }, [index, step, slides, secondary])
  const [panel, setPanel] = useState(desired)
  const pending = useRef(desired),
    ref = useRef()
  const offset = useMemo(() => new THREE.Vector3(), [])
  const animation = useRef({
    key: desired?.key,
    side: desired?.side || 'right',
    x: desired?.side === 'center' ? 0 : desired?.side === 'left' ? -0.5 : 0.5,
    y: 0,
    phase: 'idle',
    elapsed: 0,
  })
  useEffect(() => {
    pending.current = desired
    const state = animation.current
    if (state.key === desired?.key) {
      setPanel(desired)
      if (state.phase === 'exit') {
        state.phase = 'enter'
        state.fromX = state.x
        state.fromY = state.y
        state.elapsed = 0
        state.duration = 0.225
      }
      return
    }
    if (!panel) {
      setPanel(desired)
      state.key = desired?.key
      state.side = desired?.side || 'right'
      state.x = state.side === 'left' ? -1.8 : 1.8
      state.y = 0.7
      state.phase = desired ? 'wait' : 'idle'
    } else {
      state.phase = 'exit'
      state.fromX = state.x
      state.fromY = state.y
      state.elapsed = 0
    }
  }, [desired])
  useFrame(({ camera }, delta) => {
    const state = animation.current
    const motion = useTalk.getState().cameraMotion
    const dt = Math.min(delta, 0.1)
    if (state.phase === 'exit') {
      state.elapsed += dt
      const t = 1 - Math.pow(1 - Math.min(1, state.elapsed / 0.2), 3)
      state.x = THREE.MathUtils.lerp(
        state.fromX,
        state.side === 'left' ? -1.8 : 1.8,
        t,
      )
      state.y = THREE.MathUtils.lerp(state.fromY, 0.7, t)
      if (t === 1) {
        const next = pending.current
        setPanel(next)
        state.key = next?.key
        state.side = next?.side || 'right'
        state.x = state.side === 'left' ? -1.8 : 1.8
        state.y = 0.7
        state.phase = next ? 'wait' : 'idle'
      }
    } else if (state.phase === 'wait') {
      if (!motion || motion.done || motion.elapsed >= motion.total * 0.7) {
        state.phase = 'enter'
        state.fromX = state.x
        state.fromY = state.y
        state.elapsed = 0
        state.duration = Math.max(
          0.15,
          (motion?.total || 1.3) - (motion?.elapsed || 0),
        )
      }
    } else if (state.phase === 'enter') {
      state.elapsed += dt
      const t = 1 - Math.pow(1 - Math.min(1, state.elapsed / state.duration), 3)
      state.x = THREE.MathUtils.lerp(
        state.fromX,
        state.side === 'center' ? 0 : state.side === 'left' ? -0.5 : 0.5,
        t,
      )
      state.y = THREE.MathUtils.lerp(state.fromY, 0, t)
      if (t === 1) state.phase = 'idle'
    }
    offset.set(state.x, state.y, 0).applyMatrix4(camera.projectionMatrixInverse)
    offset.multiplyScalar(-16 / offset.z)
    const viewHeight =
      2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 16
    const widthScale = (viewHeight * camera.aspect * 0.5 * 0.92) / 1.78
    ref.current.scale.setScalar(
      panel?.content.halfPanel
        ? Math.min(widthScale, (viewHeight * 0.92) / 2)
        : widthScale,
    )
    ref.current.position
      .copy(offset)
      .applyQuaternion(camera.quaternion)
      .add(camera.position)
    ref.current.quaternion.copy(camera.quaternion)
  })
  return (
    <group ref={ref} visible={Boolean(panel)}>
      {panel && (
        <Surface
          content={panel.content}
          contentStep={panel.step}
          appearance="cloud"
          position={[0, 0, 0]}
        />
      )}
    </group>
  )
}

// Real ChatMiddleware hooks in run order (not the complete list).
const lifecycleHooks = [
  'onConfig',
  'onStart',
  'onChunk',
  'onBeforeToolCall',
  'onAfterToolCall',
  'onFinish',
]

// A parchment notice on the harbor master's board, pinned with brass tacks.
function NoticePaper() {
  const map = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 766
    const ctx = canvas.getContext('2d')
    const random = seeded(2.7)
    ctx.fillStyle = '#efe3c3'
    ctx.fillRect(0, 0, 1024, 766)
    const vignette = ctx.createRadialGradient(512, 383, 140, 512, 383, 680)
    vignette.addColorStop(0, 'rgba(150,110,60,0)')
    vignette.addColorStop(1, 'rgba(118,78,34,.38)')
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, 1024, 766)
    for (let i = 0; i < 16000; i++) {
      ctx.fillStyle = `rgba(99,69,34,${random() * 0.07})`
      ctx.fillRect(
        random() * 1024,
        random() * 766,
        random() * 3 + 0.5,
        random() * 1.2 + 0.3,
      )
    }
    for (const [x, y, radius] of [
      [130, 610, 150],
      [900, 130, 170],
      [760, 660, 120],
    ]) {
      const stain = ctx.createRadialGradient(x, y, 8, x, y, radius)
      stain.addColorStop(0, 'rgba(128,88,39,.14)')
      stain.addColorStop(1, 'rgba(128,88,39,0)')
      ctx.fillStyle = stain
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
    }
    ctx.strokeStyle = 'rgba(110,84,50,.55)'
    ctx.lineWidth = 3
    ctx.strokeRect(28, 28, 968, 710)
    ctx.lineWidth = 1.5
    ctx.strokeRect(40, 40, 944, 686)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    return texture
  }, [])
  useEffect(() => () => map.dispose(), [map])
  return (
    <group position={[0, 3.65, 0.24]}>
      <mesh receiveShadow>
        <boxGeometry args={[9.9, 7.4, 0.05]} />
        <meshStandardMaterial map={map} roughness={0.95} />
      </mesh>
      {[
        [-4.72, 3.53],
        [4.72, 3.53],
        [-4.72, -3.53],
        [4.72, -3.53],
      ].map(([x, y]) => (
        <mesh
          key={`${x}${y}`}
          position={[x, y, 0.035]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.08, 0.08, 0.03, 12]} />
          <meshStandardMaterial
            color="#b8954f"
            metalness={0.75}
            roughness={0.35}
          />
        </mesh>
      ))}
    </group>
  )
}

export function MapWorld() {
  const slide = useTalk((s) => s.slides[s.sceneIndex ?? s.index])
  const visibleStep = useTalk((s) => s.sceneStep ?? s.step)
  const step = slide.worldStep ?? visibleStep,
    id = slide.worldId || slide.id
  const overviewBounds = useMemo(() => new Map(), [])
  const routes = useMemo(() => {
    const v = (x, z) => new THREE.Vector3(x, MAP_Y + 0.15, z)
    return {
      bs: new THREE.CatmullRomCurve3([
        v(-10, 1.95),
        v(-6, 1),
        v(-3, -2),
        v(0, -1.95),
      ]),
      sp: new THREE.CatmullRomCurve3([
        v(0, -1.95),
        v(3, -2.5),
        v(5, 0),
        v(7, 2),
        v(10, 1.95),
      ]),
      sm: new THREE.CatmullRomCurve3([
        v(0, -1.95),
        v(3.8, -4.5),
        v(4.4, -8),
        v(3.4, -12),
        v(1.8, -15),
        v(0, -14.95),
      ]),
      smDocs: new THREE.CatmullRomCurve3([
        v(2.3, -9.2),
        v(4, -11.8),
        v(2.8, -15),
        v(0, -16.95),
      ]),
      smReference: new THREE.CatmullRomCurve3([
        v(-2.3, -9.2),
        v(-3.4, -12.8),
        v(-7.5, -14.3),
        v(-10, -14.95),
      ]),
      smCatalog: new THREE.CatmullRomCurve3([
        v(2.8, -8.7),
        v(6, -10.2),
        v(9.6, -12.2),
        v(10, -14.95),
      ]),
      tool: new THREE.CatmullRomCurve3([
        v(0, -1.95),
        v(4.5, -4.05),
        v(3.8, -2.2),
        v(5, 0),
        v(7, 2),
        v(10, 1.95),
      ]),
      bsp: new THREE.CatmullRomCurve3([
        v(-10, 1.95),
        v(-6, 1),
        v(-3, -2),
        v(0, -1.95),
        v(3, -2.5),
        v(5, 0),
        v(7, 2),
        v(10, 1.95),
      ]),
    }
  }, [])
  const fullLoop = useMemo(
    () => [
      { curve: routes.bs, reverse: false, cargo: 'REQUEST' },
      { curve: routes.sp, reverse: false, cargo: 'REQUEST' },
      { curve: routes.sp, reverse: true, cargo: 'RESPONSE' },
      { curve: routes.bs, reverse: true, cargo: 'RESPONSE' },
    ],
    [routes],
  )
  const toolWork = useRef({ site: null, progress: 0 })
  const mcpOverview = ['mcp-punch', 'mcp-multiple-punch'].includes(id)
  const lifecycleOverview = id === 'middleware-lifecycle-overview'
  const lifecycleLights = useRef([]),
    lifecycleElapsed = useRef(0)
  const reducedLifecycle = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  useEffect(() => {
    lifecycleElapsed.current = 0
  }, [id])
  useFrame((_, dt) => {
    if (!lifecycleOverview) return
    const motion = useTalk.getState().cameraMotion
    if (!motion || motion.done) lifecycleElapsed.current += Math.min(dt, 0.05)
    const phase = Math.min(
      lifecycleHooks.length - 1,
      Math.floor(lifecycleElapsed.current / 1.2),
    )
    lifecycleLights.current.forEach((light, index) => {
      if (!light) return
      light.material.emissiveIntensity =
        reducedLifecycle || index === phase ? 4.5 : 0
      light.material.color.set(
        reducedLifecycle || index === phase ? '#ffe8ab' : '#66553d',
      )
    })
  })
  const mcpReveal = useRef([0, 0, 0])
  useEffect(() => {
    mcpReveal.current = [0, 0, 0]
  }, [id])
  const toolFamily =
    mcpOverview ||
    lifecycleOverview ||
    [
      'tools-overview',
      'client-tool-request',
      'server-tool-request',
      'server-tool-flow',
      'client-tool-flow',
      'tool-approvals-overview',
    ].includes(id)
  const toolOverview =
    mcpOverview ||
    lifecycleOverview ||
    [
      'tools-overview',
      'server-tool-flow',
      'client-tool-flow',
      'tool-approvals-overview',
    ].includes(id)
  const approval = useRef({ waiting: false, gateRaised: false }),
    approvalWaiting = useRef()
  useEffect(() => {
    approval.current = { waiting: false, gateRaised: false }
  }, [id])
  useFrame(() => {
    if (approvalWaiting.current)
      approvalWaiting.current.visible = approval.current.waiting
  })
  useEffect(() => {
    toolWork.current = { site: null, progress: 0 }
  }, [id])
  const serverFlow = useMemo(
    () => [
      {
        curve: routes.sp,
        reverse: true,
        cargo: 'TOOL CALL',
        work: 'server',
        holdAfter: 1.6,
      },
      {
        curve: routes.sp,
        reverse: false,
        cargo: 'TOOL RESULT',
        holdAfter: 0.6,
      },
      { curve: routes.sp, reverse: true, cargo: 'FINAL RESPONSE' },
      { curve: routes.bs, reverse: true, cargo: 'FINAL RESPONSE' },
    ],
    [routes],
  )
  const clientFlow = useMemo(
    () => [
      { curve: routes.sp, reverse: true, cargo: 'TOOL CALL' },
      {
        curve: routes.bs,
        reverse: true,
        cargo: 'TOOL CALL',
        work: 'client',
        holdAfter: 1.6,
      },
      { curve: routes.bs, reverse: false, cargo: 'TOOL RESULT' },
      {
        curve: routes.sp,
        reverse: false,
        cargo: 'TOOL RESULT',
        holdAfter: 0.6,
      },
      { curve: routes.sp, reverse: true, cargo: 'FINAL RESPONSE' },
      { curve: routes.bs, reverse: true, cargo: 'FINAL RESPONSE' },
    ],
    [routes],
  )
  const approvalFlow = useMemo(
    () => [
      { curve: routes.bs, reverse: false, cargo: 'REQUEST' },
      { curve: routes.sp, reverse: false, cargo: 'REQUEST' },
      { curve: routes.sp, reverse: true, cargo: 'TOOL CALL' },
      {
        curve: routes.bs,
        reverse: true,
        cargo: 'APPROVAL REQUEST',
        approvalWait: true,
        holdAfter: 2.25,
      },
      {
        curve: routes.bs,
        reverse: false,
        cargo: 'APPROVED',
        tow: ['PAYLOAD', 'APPROVAL'],
        unloadAtEnd: true,
        work: 'server',
        holdAfter: 1.6,
      },
      { curve: routes.sp, reverse: false, cargo: 'TOOL RESULT' },
    ],
    [routes],
  )
  const inMap = !['title', 'the-map', 'close', 'thank-you'].includes(id),
    takeaway = id === 'hops-stay'
  const labels = inMap
  const focus = slide.focusSteps?.[step] || slide.focus
  const browserPair = focus === 'browser' || [0, 3].includes(slide.leg)
  const providerPair = focus === 'provider' || [1, 2].includes(slide.leg)
  const mcpPair = focus === 'mcp'
  const later =
    !browserPair &&
    !providerPair &&
    [
      'mcp-punch',
      'middleware-punch',
      'interrupt-code',
      'mcp-code',
      'middleware-code',
      'hops-stay',
    ].includes(id)
  const browserLabel = labels && !providerPair && !mcpPair
  const providerLabel = labels && !browserPair && !mcpPair
  let trip = { curve: routes.bs }
  if (slide.leg !== undefined)
    trip = {
      curve: slide.leg === 0 || slide.leg === 3 ? routes.bs : routes.sp,
      reverse: slide.leg >= 2,
      cargo: slide.leg < 2 ? 'REQUEST' : 'RESPONSE',
      loop: slide.leg >= 2,
    }
  if (id === 'server-tool-punch')
    trip = {
      curve: step === 0 ? routes.bs : routes.tool,
      start: step === 0 ? 0.75 : 0,
      end: 1,
      pauseAt: step === 1 ? 0.2 : undefined,
    }
  if (id === 'client-tool-punch')
    trip = { curve: step === 0 ? routes.bs : routes.bsp, reverse: step === 0 }
  if (id === 'interrupt-punch')
    trip = {
      curve: routes.sp,
      start: step >= 1 ? 0.32 : 0.08,
      end: step < 2 ? 0.32 : 1,
      waiting: step === 1,
      delay: step === 2 ? 0.6 : 0,
    }
  const traffic =
    slide.leg !== undefined ||
    ['server-tool-punch', 'client-tool-punch', 'interrupt-punch'].includes(id)
  return (
    <group visible={inMap}>
      {/* Stand-ins for the two cabin lamps: equal light counts in both
          worlds let the precompiled shaders work everywhere. */}
      <pointLight ref={allLayers} intensity={0} />
      <pointLight ref={allLayers} intensity={0} />
      <Ocean />
      <AmbientShips />
      <Gulls />
      {['protocols', 'llm-providers', 'custom-servers'].includes(slide.id) && (
        <ProviderShip key={slide.id} text={slide.title} />
      )}
      {!providerPair && !mcpPair && (
        <Island
          position={islands.browser}
          kind="browser"
          label="Browser"
          visible={browserLabel}
          labelPosition={
            id === 'stream-events' || toolOverview ? [0, 0.8, 4] : undefined
          }
        />
      )}
      <Island
        position={islands.server}
        kind="server"
        label="Server"
        visible={labels}
        labelPosition={
          mcpOverview || lifecycleOverview
            ? [0, 0.8, 4]
            : id === 'client-tool-request'
              ? [3, 3.8, 0]
              : undefined
        }
      />
      {!browserPair && !mcpPair && (
        <Island
          position={islands.provider}
          kind="provider"
          label="Provider"
          visible={providerLabel}
          labelPosition={
            id === 'stream-events' || toolOverview ? [0, 0.8, 4] : undefined
          }
        />
      )}
      {later && !mcpOverview && <McpIsland labeled={labels} />}
      {mcpOverview && (
        <>
          <McpIsland
            key={id + 'docs'}
            animate={id === 'mcp-punch'}
            delay={1.6}
            label="MCP: docs"
            labeled={labels}
            reveal={mcpReveal}
            route={routes.smDocs}
          />
          {id === 'mcp-multiple-punch' && (
            <>
              <McpIsland
                key={id + 'reference'}
                animate
                delay={1.6}
                position={[-10, -18]}
                label="MCP: reference"
                labeled={labels}
                reveal={mcpReveal}
                slot={1}
                route={routes.smReference}
              />
              <McpIsland
                key={id + 'catalog'}
                animate
                delay={2.3}
                position={[10, -18]}
                label="MCP: catalog"
                labeled={labels}
                reveal={mcpReveal}
                slot={2}
                route={routes.smCatalog}
              />
            </>
          )}
        </>
      )}
      {!providerPair && !mcpPair && (
        <Route
          curve={routes.bs}
          color={
            id === 'transport-swap'
              ? ['#d3481b', '#285db0', '#167f65'][step]
              : undefined
          }
        />
      )}
      {!browserPair && !mcpPair && <Route curve={routes.sp} />}
      {later && !mcpOverview && <Route curve={routes.sm} />}
      {[
        'server-tool-punch',
        'client-tool-punch',
        'parallel-punch',
        'tools-code',
        'interrupt-punch',
        'middleware-punch',
        'interrupt-code',
        'mcp-code',
        'middleware-code',
        'hops-stay',
      ].includes(id) && (
        <group position={[2.7, MAP_Y, -5.8]} rotation={[0, 0.8, 0]}>
          <Dock position={[0, 0.35, 0]} />
          <Timber
            position={[-0.5, 1.35, -0.6]}
            scale={[0.17, 2.1, 0.17]}
            color="#67573d"
          />
          <Timber
            position={[0.08, 2.35, -0.6]}
            scale={[1.3, 0.15, 0.15]}
            color="#67573d"
          />
          <Timber
            position={[0.65, 1.95, -0.6]}
            scale={[0.025, 0.8, 0.025]}
            color="#403c31"
          />
          <Timber
            position={[0.4, 0.65, 0.3]}
            scale={[0.6, 0.6, 0.6]}
            color="#a98a54"
          />
        </group>
      )}
      {traffic && (
        <FerryTrip
          key={slide.leg !== undefined ? id : `${id}-${step}`}
          {...trip}
        />
      )}
      {id === 'stream-events' && (
        <>
          <Label
            text="The full loop"
            position={[0, MAP_Y + 10, -11]}
            scale={[10, 2.5, 1]}
          />
          <FerryTrip
            key={step}
            curve={routes.bs}
            legs={fullLoop}
            legIndex={step}
            overviewBounds={overviewBounds}
          />
        </>
      )}
      {toolFamily && (
        <ToolWorkshops
          focus={
            browserPair ? 'browser' : providerPair ? 'provider' : undefined
          }
          work={toolWork}
        />
      )}
      {toolOverview && (
        <Label
          text={slide.title}
          position={[0, MAP_Y + 10, -11]}
          scale={[12, 3, 1]}
        />
      )}
      {lifecycleOverview && (
        <group position={[9, MAP_Y, -8.5]}>
          <group scale={[7.5, 1, 1.4]}>
            <Dock position={[0, 0.35, 0]} foam={false} />
          </group>
          {/* The board stands right behind the labels, so even the last
              hook projects onto the parchment and not onto the deck below. */}
          {[-4.8, 4.8].map((x) => (
            <Timber key={x} position={[x, 3.55, 0.1]} scale={[0.18, 7.5, 0.18]} />
          ))}
          <Timber
            position={[0, 3.65, 0.1]}
            scale={[10.4, 7.9, 0.2]}
            color="#745635"
          />
          <NoticePaper />
          <Label
            text="Harbor master"
            position={[0, 8.25, 0]}
            scale={[4.4, 1.1, 1]}
          />
          {lifecycleHooks.map((text, index) => (
            <group key={text} position={[0, 6.6 - index * 1.1, 0.1]}>
              <mesh position={[-4.45, 0, 0.2]}>
                <torusGeometry args={[0.2, 0.045, 8, 24]} />
                <meshStandardMaterial
                  color="#b8954f"
                  metalness={0.75}
                  roughness={0.35}
                />
              </mesh>
              <mesh
                ref={(node) => {
                  lifecycleLights.current[index] = node
                }}
                position={[-4.45, 0, 0.24]}
              >
                <sphereGeometry args={[0.17, 16, 12]} />
                <meshStandardMaterial
                  color="#66553d"
                  emissive="#edac52"
                  emissiveIntensity={0}
                  roughness={0.25}
                />
              </mesh>
              <Label
                text={text}
                position={[0.15, 0, 0.2]}
                scale={[3, 0.75, 1]}
              />
            </group>
          ))}
        </group>
      )}
      {id === 'tools-overview' && (
        <FerryTrip curve={routes.bs} reverse start={1} end={1} />
      )}
      {(id === 'server-tool-flow' || id === 'client-tool-flow') && (
        <FerryTrip
          key={`${id}-${step}`}
          curve={routes.sp}
          legs={id === 'server-tool-flow' ? serverFlow : clientFlow}
          legIndex={step}
          work={toolWork}
          overviewBounds={overviewBounds}
        />
      )}
      {id === 'tool-approvals-overview' && (
        <>
          <FerryTrip
            key={`${id}-${step}`}
            curve={routes.bs}
            legs={approvalFlow}
            legIndex={step}
            work={toolWork}
            approval={approval}
            overviewBounds={overviewBounds}
          />
          <HarborGate raised={false} approval={approval} />
          <group ref={approvalWaiting} visible={false}>
            <Label
              text="WAITING FOR APPROVAL"
              position={[-9, MAP_Y + 10, 8]}
              scale={[4, 1, 1]}
            />
          </group>
        </>
      )}
      {!slide.codeWall &&
        ![
          'tanstack-tool-definitions',
          'tanstack-approval-definitions',
          'middleware-cache',
          'middleware-telemetry',
          'middleware-persistence',
          'middleware-memory',
          'middleware-compaction',
        ].includes(id) &&
        slide.leg === undefined &&
        (id === 'transport-swap' || slide.form === 'code') && (
          <>
            {!browserPair && !mcpPair && (
              <FerryTrip
                curve={routes.sp}
                reverse
                loop
                cargo="RESPONSE"
                overviewBounds={!providerPair ? overviewBounds : undefined}
              />
            )}
            {!providerPair && !mcpPair && (
              <FerryTrip
                curve={routes.bs}
                reverse
                loop
                start={0.4}
                cargo="RESPONSE"
                overviewBounds={!browserPair ? overviewBounds : undefined}
              />
            )}
            {mcpPair && (
              <FerryTrip curve={routes.sm} reverse loop cargo="RESPONSE" />
            )}
          </>
        )}
      {(id === 'parallel-punch' || takeaway || id === 'middleware-punch') &&
        [0, 1, 2, 3, 4].map((i) => (
          <FerryTrip
            key={i}
            curve={i % 2 ? routes.bs : routes.sp}
            reverse={i === 3}
            start={i * 0.17}
            loop
          />
        ))}
      {[
        'interrupt-punch',
        'middleware-punch',
        'interrupt-code',
        'mcp-code',
        'middleware-code',
        'hops-stay',
      ].includes(id) && (
        <HarborGate raised={id === 'interrupt-punch' && step < 2} />
      )}
      {['middleware-punch', 'middleware-code', 'hops-stay'].includes(id) && (
        <>
          <Buoy position={[-5.4, MAP_Y + 0.28, 0.2]} lit />
          <Buoy
            position={[6.8, MAP_Y + 0.28, 0.5]}
            lit={id !== 'middleware-punch' || step >= 1}
          />
        </>
      )}
      <SceneCaption />
      <SceneCaption secondary />
    </group>
  )
}
