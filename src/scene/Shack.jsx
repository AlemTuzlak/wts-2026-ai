import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  MathUtils,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Surface } from './Surface.jsx'
import { Label } from './Label.jsx'
import { useTalk } from '../store.js'
import { oceanNoise } from './Ocean.jsx'
import { FoamRing } from './MapWorld.jsx'
import { SKY_LAYER, allLayers, skyMask } from './PostFX.jsx'
import { shackLight, sunsetSun } from './layout.js'

const sunDir = new Vector3(...sunsetSun).normalize()
const reducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Sunset sky colors, shared by the sky dome and the water reflections.
const sunsetSkyGLSL = /* glsl */ `
  // The band behind the floating title stays a deep orange, close to the
  // original sky, so the light title text keeps its contrast.
  vec3 sunsetSky(vec3 d, vec3 sun) {
    float h = max(d.y, 0.0);
    vec3 col = mix(vec3(0.82, 0.27, 0.11), vec3(0.44, 0.135, 0.085), smoothstep(0.0, 0.06, h));
    col = mix(col, vec3(0.24, 0.085, 0.095), smoothstep(0.03, 0.21, h));
    col = mix(col, vec3(0.06, 0.06, 0.13), smoothstep(0.24, 0.8, h));
    float sd = max(dot(d, sun), 0.0);
    col += vec3(0.42, 0.16, 0.045) * pow(sd, 34.0) * (1.0 - smoothstep(0.0, 0.12, h));
    col += vec3(1.0, 0.6, 0.28) * pow(sd, 220.0) * 1.1;
    float below = 1.0 - smoothstep(-0.04, 0.0, d.y);
    return mix(col, vec3(0.78, 0.27, 0.11), below);
  }
`

// A sky dome with a glowing sun and long sunset cloud streaks. In the light
// ray mask pass it draws only the sun, so rays stream from it.
function SunsetSky() {
  const uniforms = useMemo(
    () => ({ time: { value: 0 }, sun: { value: sunDir }, mask: skyMask }),
    [],
  )
  useFrame(({ clock }) => {
    uniforms.time.value = clock.elapsedTime
  })
  return (
    <mesh
      ref={(node) => node?.layers.enable(SKY_LAYER)}
      position={[0, 0, -10]}
      renderOrder={-1}
    >
      <sphereGeometry args={[175, 48, 24]} />
      <shaderMaterial
        side={BackSide}
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={`
          varying vec3 vDir;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vDir = world.xyz - cameraPosition;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `}
        fragmentShader={`
          uniform float time, mask;
          uniform vec3 sun;
          varying vec3 vDir;
          ${oceanNoise}
          ${sunsetSkyGLSL}
          void main() {
            vec3 d = normalize(vDir);
            float sd = dot(d, sun);
            float disc = smoothstep(0.99925, 0.99962, sd);
            float h = max(d.y, 0.0);
            float az = atan(d.x, -d.z);
            vec2 q = vec2(az * 3.4 + time * 0.0035, h * 24.0);
            float streak = fbm2(q * vec2(1.0, 0.55) + vec2(0.0, fbm2(q * 0.5) * 0.8));
            float band = smoothstep(0.015, 0.06, h) * (1.0 - smoothstep(0.2, 0.36, h));
            float cloud = smoothstep(-0.02, 0.24, streak) * band;
            if (mask > 0.5) {
              // R: the sun for the rays. G: open sky, where rays stay off.
              float glow = pow(max(sd, 0.0), 220.0) * 0.7 + disc;
              gl_FragColor = vec4(glow * (1.0 - cloud * 0.55), 1.0, 0.0, 1.0);
              return;
            }
            vec3 col = sunsetSky(d, sun);
            col += vec3(3.4, 2.3, 1.15) * disc;
            float near = pow(max(sd, 0.0), 10.0);
            // High pink cirrus above the main cloud band.
            float cirrus = fbm2(vec2(az * 2.1 + time * 0.002, h * 8.0) * vec2(1.0, 0.4) + 31.0);
            float wisps = smoothstep(0.08, 0.38, cirrus) * smoothstep(0.12, 0.24, h)
              * (1.0 - smoothstep(0.42, 0.7, h));
            col = mix(col, vec3(0.92, 0.38, 0.32) * (0.55 + near * 0.9), wisps * 0.22);
            // Backlit sunset streaks: dark thick cores, glowing thin edges.
            float thick = smoothstep(0.05, 0.42, streak);
            vec3 body = mix(vec3(0.34, 0.125, 0.115), vec3(0.17, 0.07, 0.11), thick);
            vec3 rim = vec3(1.05, 0.44, 0.2) * (0.1 + near * 1.2) * (1.0 - thick);
            rim += vec3(2.2, 1.1, 0.5) * pow(max(sd, 0.0), 60.0) * (1.0 - thick) * 1.2;
            col = mix(col, body + rim, cloud * 0.9);
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `}
      />
    </mesh>
  )
}

// Room corners collect less light. Approximate that from the distance to the
// floor, the ceiling and the three walls (a cheap stand-in for baked AO).
function shadeCabinWood(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vRoom;')
    .replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvRoom = (modelMatrix * vec4(position, 1.0)).xyz;',
    )
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vRoom;')
    .replace(
      '#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor = max(roughnessFactor, 0.84);',
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        vec3 r = vRoom;
        float open = (1.0 - 0.5 * exp(-max(r.y - 0.09, 0.0) / 0.3))
          * (1.0 - 0.5 * exp(-max(2.92 - r.y, 0.0) / 0.45))
          * (1.0 - 0.5 * exp(-max(r.x + 3.4, 0.0) / 0.4))
          * (1.0 - 0.5 * exp(-max(3.4 - r.x, 0.0) / 0.4))
          * (1.0 - 0.5 * exp(-max(r.z + 3.07, 0.0) / 0.4));
        diffuseColor.rgb *= mix(0.42, 1.0, clamp(open * 2.0, 0.0, 1.0));
      }`,
    )
}

function Timber({ position, rotation, args, material, color = '#b49b77' }) {
  const [width, height, depth] = args
  const geometry = useMemo(() => {
    const geometry = new RoundedBoxGeometry(width, height, depth, 1, 0.008)
    const dimensions = [width, height, depth]
    const longAxis = dimensions.indexOf(Math.max(...dimensions))
    const positions = geometry.attributes.position
    const normals = geometry.attributes.normal
    const uv = geometry.attributes.uv
    const offset = (position[0] * 1.73 + position[2] * 0.91) % 1
    for (let index = 0; index < positions.count; index++) {
      const point = [
        positions.getX(index),
        positions.getY(index),
        positions.getZ(index),
      ]
      const normal = [
        Math.abs(normals.getX(index)),
        Math.abs(normals.getY(index)),
        Math.abs(normals.getZ(index)),
      ]
      const faceAxis = normal.indexOf(Math.max(...normal))
      const grainAxis = longAxis === faceAxis ? (faceAxis + 1) % 3 : longAxis
      const crossAxis =
        [0, 1, 2].find((axis) => axis !== grainAxis && axis !== faceAxis) ??
        (grainAxis + 1) % 3
      uv.setXY(
        index,
        point[grainAxis] / 1.4 + offset,
        point[crossAxis] / 0.36 + offset,
      )
    }
    return geometry
  }, [width, height, depth, position[0], position[2]])
  useEffect(() => () => geometry.dispose(), [geometry])
  const tint = useMemo(
    () => new Color(color).lerp(new Color('#ffffff'), 0.9),
    [color],
  )
  return (
    <mesh
      position={position}
      rotation={rotation}
      geometry={geometry}
      userData={{ timber: true }}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        {...material}
        color={tint}
        roughness={1}
        onBeforeCompile={shadeCabinWood}
      />
    </mesh>
  )
}

function useTimber() {
  const textures = useLoader(TextureLoader, [
    './textures/wood/Wood049_1K-JPG_Color.jpg',
    './textures/wood/Wood049_1K-JPG_NormalGL.jpg',
    './textures/wood/Wood049_1K-JPG_Roughness.jpg',
  ])
  return useMemo(() => {
    textures.forEach((texture) => {
      texture.wrapS = texture.wrapT = RepeatWrapping
      texture.anisotropy = 8
      texture.needsUpdate = true
    })
    textures[0].colorSpace = SRGBColorSpace
    return {
      map: textures[0],
      normalMap: textures[1],
      roughnessMap: textures[2],
      normalScale: new Vector2(0.4, 0.4),
    }
  }, [textures])
}

function Nail({ position }) {
  return (
    <mesh position={position} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.018, 0.021, 0.012, 8]} />
      <meshStandardMaterial color="#39342c" metalness={0.72} roughness={0.65} />
    </mesh>
  )
}

function OutsidePalm({ position, rotation = 0, phase = 0, scale = 1 }) {
  const crown = useRef()
  const geometry = useMemo(() => {
    const trunkPath = new CatmullRomCurve3([
      new Vector3(0, 0, 0),
      new Vector3(0.04, 1.4, 0.06),
      new Vector3(0.28, 3.05, -0.03),
      new Vector3(0.12, 4.5, -0.16),
    ])
    const trunk = new TubeGeometry(trunkPath, 36, 0.17, 9, false)
    const points = trunk.attributes.position
    for (let ring = 0; ring <= 36; ring++) {
      const t = ring / 36,
        center = trunkPath.getPointAt(t)
      for (let side = 0; side <= 9; side++) {
        const index = ring * 10 + side
        const point = new Vector3()
          .fromBufferAttribute(points, index)
          .sub(center)
          .multiplyScalar(1 - t * 0.53)
          .add(center)
        points.setXYZ(index, point.x, point.y, point.z)
      }
    }
    trunk.computeVertexNormals()
    const ribs = [],
      vertices = [],
      indices = [],
      colors = []
    for (let frond = 0; frond < 9; frond++) {
      const angle = (frond * Math.PI * 2) / 9 + phase
      const reach = 2.05 + Math.sin(frond * 2.4) * 0.35
      const direction = new Vector3(Math.cos(angle), 0, Math.sin(angle))
      const sideways = new Vector3(-Math.sin(angle), 0, Math.cos(angle))
      const curve = new CatmullRomCurve3([
        new Vector3(),
        direction.clone().multiplyScalar(0.5).setY(0.27),
        direction
          .clone()
          .multiplyScalar(reach * 0.65)
          .setY(0.02),
        direction
          .clone()
          .multiplyScalar(reach)
          .setY(-0.82 - (frond % 3) * 0.11),
      ])
      ribs.push(new TubeGeometry(curve, 20, 0.017, 5, false))
      for (let leaf = 0; leaf < 14; leaf++) {
        const t = 0.12 + leaf / 16
        const origin = curve.getPoint(t)
        const length = Math.sin(t * Math.PI) * 0.58 + 0.06
        for (const side of [-1, 1]) {
          const start = vertices.length / 3
          const color = new Color(
            frond % 3 === 0
              ? '#657b39'
              : frond % 3 === 1
                ? '#486433'
                : '#83924c',
          )
          for (let segment = 0; segment <= 5; segment++) {
            const u = segment / 5
            const center = origin
              .clone()
              .addScaledVector(sideways, side * length * u)
              .addScaledVector(direction, 0.15 * u)
            center.y -= 0.22 * u * u
            const width = Math.sin(u * Math.PI) * 0.042 + (1 - u) * 0.01
            for (const edge of [-1, 1]) {
              const point = center
                .clone()
                .addScaledVector(direction, width * edge)
              vertices.push(point.x, point.y + width * 0.35, point.z)
              colors.push(color.r, color.g, color.b)
            }
            if (segment < 5) {
              const index = start + segment * 2
              indices.push(
                index,
                index + 1,
                index + 2,
                index + 1,
                index + 3,
                index + 2,
              )
            }
          }
        }
      }
    }
    const foliage = new BufferGeometry()
    foliage.setAttribute('position', new Float32BufferAttribute(vertices, 3))
    foliage.setAttribute('color', new Float32BufferAttribute(colors, 3))
    foliage.setIndex(indices)
    foliage.computeVertexNormals()
    const rings = Array.from({ length: 25 }, (_, index) => {
      const t = (index + 1) / 27
      return {
        position: trunkPath.getPointAt(t),
        quaternion: new Quaternion().setFromUnitVectors(
          new Vector3(0, 0, 1),
          trunkPath.getTangentAt(t),
        ),
        radius: 0.17 * (1 - t * 0.53),
      }
    })
    return { trunk, ribs, foliage, rings }
  }, [phase])
  useEffect(
    () => () => {
      geometry.trunk.dispose()
      geometry.foliage.dispose()
      geometry.ribs.forEach((rib) => rib.dispose())
    },
    [geometry],
  )
  useFrame(({ clock }) => {
    if (crown.current)
      crown.current.rotation.z =
        Math.sin(clock.elapsedTime * 0.32 + phase) * 0.018
  })
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      <mesh geometry={geometry.trunk} castShadow>
        <meshStandardMaterial color="#806a47" roughness={1} />
      </mesh>
      {geometry.rings.map((ring, index) => (
        <mesh key={index} position={ring.position} quaternion={ring.quaternion}>
          <torusGeometry args={[ring.radius, 0.008, 4, 9]} />
          <meshStandardMaterial color="#5a4d35" roughness={1} />
        </mesh>
      ))}
      <group ref={crown} position={[0.12, 4.5, -0.16]}>
        <mesh geometry={geometry.foliage} castShadow>
          <meshStandardMaterial
            vertexColors
            side={DoubleSide}
            roughness={0.9}
          />
        </mesh>
        {geometry.ribs.map((rib, index) => (
          <mesh key={index} geometry={rib}>
            <meshStandardMaterial color="#718346" roughness={1} />
          </mesh>
        ))}
        {[0, 1, 2].map((index) => (
          <mesh
            key={index}
            position={[
              Math.sin(index * 2.1) * 0.15,
              -0.08,
              Math.cos(index * 2.1) * 0.15,
            ]}
          >
            <sphereGeometry args={[0.12, 10, 8]} />
            <meshStandardMaterial color="#6c6139" roughness={1} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function HorizonShip({ position, scale = 1, phase = 0 }) {
  const timber = useTimber()
  const mark = useLoader(
    TextureLoader,
    './logos/tanstack-emblem-charcoal-256.png',
  )
  useMemo(() => {
    mark.colorSpace = SRGBColorSpace
  }, [mark])
  const ship = useRef()
  const geometry = useMemo(() => {
    const outline = new Shape()
    outline.moveTo(-1.6, 0.28)
    outline.quadraticCurveTo(-1.1, -0.28, -0.65, -0.3)
    outline.lineTo(0.8, -0.3)
    outline.quadraticCurveTo(1.22, -0.2, 1.55, 0.4)
    outline.lineTo(0.6, 0.28)
    outline.closePath()
    const hull = new ExtrudeGeometry(outline, {
      depth: 0.45,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.05,
      bevelSegments: 2,
      steps: 1,
    })
    hull.translate(0, 0.16, -0.225)
    const sail = new PlaneGeometry(1.12, 0.93, 12, 10)
    const points = sail.attributes.position
    for (let index = 0; index < points.count; index++) {
      const x = points.getX(index),
        y = points.getY(index)
      points.setXYZ(
        index,
        x * (0.87 + (y + 0.465) * 0.15),
        y,
        Math.sin((x / 1.12 + 0.5) * Math.PI) * 0.18,
      )
    }
    sail.computeVertexNormals()
    const rigging = new BufferGeometry(),
      lines = []
    for (const x of [-0.65, 0.55]) {
      lines.push(
        x,
        2.68,
        0.01,
        -1.35,
        0.42,
        0.01,
        x,
        2.68,
        0.01,
        1.3,
        0.42,
        0.01,
      )
      for (const y of [1.82, 2.48])
        lines.push(x + 0.03, y, -0.55, x + 0.03, y, 0.55)
      for (let rung = 0; rung < 7; rung++) {
        const t = rung / 8,
          spread = 0.35 * (1 - t),
          y = 0.5 + t * 2
        lines.push(x - spread, y, 0.025, x + spread, y, 0.025)
      }
    }
    rigging.setAttribute('position', new Float32BufferAttribute(lines, 3))
    return { hull, sail, rigging }
  }, [])
  const sailMarks = useMemo(
    () =>
      [0.9, 1].map((sx) => {
        const geo = geometry.sail.clone(),
          uv = geo.attributes.uv,
          p = geo.attributes.position
        const width = (0.48 * mark.image.width) / mark.image.height / sx
        for (let i = 0; i < uv.count; i++) {
          uv.setXY(
            i,
            ((uv.getX(i) - 0.5) * 1.12) / width + 0.5,
            ((uv.getY(i) - 0.5) * 0.93) / 0.48 + 0.5,
          )
          p.setZ(i, p.getZ(i) + 0.001)
        }
        return geo
      }),
    [geometry, mark],
  )
  useEffect(
    () => () => {
      geometry.hull.dispose()
      geometry.sail.dispose()
      geometry.rigging.dispose()
      sailMarks.forEach((geo) => geo.dispose())
    },
    [geometry, sailMarks],
  )
  useFrame(({ clock }) => {
    if (!ship.current) return
    const time = clock.elapsedTime
    ship.current.position.x = position[0] + Math.sin(time * 0.027 + phase) * 4.5
    ship.current.position.z = position[2] + Math.sin(time * 0.019 + phase) * 1.8
    ship.current.position.y =
      position[1] + Math.sin(time * 0.72 + phase) * 0.035
    ship.current.rotation.set(
      0,
      0.2 + Math.sin(time * 0.027 + phase) * 0.12,
      Math.sin(time * 0.6 + phase) * 0.012,
    )
  })
  return (
    <group ref={ship} position={position} scale={scale}>
      <mesh geometry={geometry.hull}>
        <meshStandardMaterial
          {...timber}
          color="#b4a68b"
          roughness={0.95}
          onBeforeCompile={(shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <roughnessmap_fragment>',
              '#include <roughnessmap_fragment>\nroughnessFactor=max(roughnessFactor,0.84);',
            )
          }}
        />
      </mesh>
      <lineSegments geometry={geometry.rigging}>
        <lineBasicMaterial color="#494239" transparent opacity={0.82} />
      </lineSegments>
      <mesh position={[0, 0.34, 0.233]}>
        <boxGeometry args={[2.35, 0.035, 0.012]} />
        <meshStandardMaterial color="#b8a67c" roughness={0.9} />
      </mesh>
      {[-0.8, -0.4, 0, 0.4, 0.8].map((x) => (
        <mesh key={x} position={[x, 0.22, 0.235]}>
          <circleGeometry args={[0.045, 12]} />
          <meshStandardMaterial color="#273b39" roughness={0.8} />
        </mesh>
      ))}
      {[-0.65, 0.55].map((x, index) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 1.42, 0]}>
            <cylinderGeometry args={[0.035, 0.045, 2.55, 8]} />
            <meshStandardMaterial color="#383b32" />
          </mesh>
          <group rotation={[0, Math.PI / 2, 0]}>
            <mesh
              geometry={geometry.sail}
              position={[0, 1.35, 0.045]}
              scale={[index ? 1 : 0.9, 1, 1]}
            >
              <meshStandardMaterial
                color="#c9c3a5"
                side={DoubleSide}
                roughness={1}
              />
            </mesh>
            <mesh
              geometry={sailMarks[index]}
              position={[0, 1.35, 0.045]}
              scale={[index ? 1 : 0.9, 1, 1]}
            >
              <meshBasicMaterial
                map={mark}
                transparent
                toneMapped={false}
                depthWrite={false}
                side={DoubleSide}
              />
            </mesh>
            <mesh
              geometry={geometry.sail}
              position={[0, 2.18, 0.04]}
              scale={[0.72, 0.65, 1]}
            >
              <meshStandardMaterial
                color="#c9c3a5"
                side={DoubleSide}
                roughness={1}
              />
            </mesh>
          </group>
          <mesh position={[0.12, 2.69, 0]}>
            <planeGeometry args={[0.24, 0.15]} />
            <meshStandardMaterial color="#303830" side={DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function SunsetOcean() {
  const water = useRef()
  const uniforms = useMemo(
    () => ({ time: { value: 0 }, sun: { value: sunDir } }),
    [],
  )
  const beach = useMemo(() => {
    const vertices = [],
      indices = [],
      tints = [],
      rings = [
        [0, -0.035, '#dac598'],
        [0.5, -0.035, '#e5d2a5'],
        [0.8, -0.035, '#e8d6ac'],
        [0.94, -0.055, '#cbb98f'],
        [1, -0.31, '#9d9f89'],
      ]
    rings.forEach(([r, y, tint], ring) => {
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2,
          edge = 1 + 0.03 * Math.cos(a * 4)
        vertices.push(
          Math.cos(a) * 9 * r * (1 + 0.045 * Math.sin(a * 3)),
          y,
          -0.9 + Math.sin(a) * 7.5 * r * edge,
        )
        const color = new Color(tint).multiplyScalar(
          0.96 + 0.04 * Math.sin(a * 17 + r * 37),
        )
        tints.push(color.r, color.g, color.b)
        if (ring < 4 && i < 96) {
          const p = ring * 97 + i,
            q = p + 97
          indices.push(p, p + 1, q, p + 1, q + 1, q)
        }
      }
    })
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
    geometry.setAttribute('color', new Float32BufferAttribute(tints, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
  }, [])
  useEffect(() => () => beach.dispose(), [beach])
  useFrame((state) => {
    if (water.current)
      water.current.uniforms.time.value = state.clock.elapsedTime
  })
  return (
    <group>
      <mesh geometry={beach} receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} />
      </mesh>
      <SunsetSky />
      <mesh position={[0, -0.26, -130]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[520, 260, 160, 120]} />
        <shaderMaterial
          ref={water}
          uniforms={uniforms}
          side={DoubleSide}
          vertexShader={`
        uniform float time;
        varying vec3 world;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          w.y += sin(w.x * .7 - w.z * .36 + time * .75) * .065
            + sin(w.x * 1.7 + w.z * .91 + time * 1.1) * .025;
          world = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `}
          fragmentShader={`
        uniform float time;
        uniform vec3 sun;
        varying vec3 world;
        ${oceanNoise}
        ${sunsetSkyGLSL}
        void main() {
          vec2 p = world.xz;
          vec3 toCamera = cameraPosition - world;
          float dist = length(toCamera);
          vec3 V = toCamera / dist;
          float footprint = max(length(dFdx(p)), length(dFdy(p)));
          // Long swells rolling toward the beach, then fine chop.
          vec2 slope = vec2(0.0);
          for (int i = 0; i < 3; i++) {
            float k = 0.85 + float(i) * 0.8;
            vec2 d = normalize(vec2(0.18 * float(i) - 0.12, 1.0));
            float phase = dot(d, p) * k + time * (0.95 - float(i) * 0.18);
            float keep = clamp(((6.2831853 / k) / footprint - 4.0) / 8.0, 0.0, 1.0);
            slope += cos(phase) * k * d * (0.075 / (1.0 + float(i))) * keep;
          }
          float amp = 0.1, freq = 0.55;
          mat2 r = mat2(0.8, -0.6, 0.6, 0.8), m = mat2(1.0);
          for (int i = 0; i < 4; i++) {
            vec3 n = gnoised(m * p * freq + vec2(0.13, 0.29) * time * (1.0 + float(i) * 0.4));
            float keep = clamp(((1.0 / freq) / footprint - 3.0) / 6.0, 0.0, 1.0);
            slope += (n.yz * freq * m) * amp * keep;
            m = r * m;
            freq *= 1.95;
            amp *= 0.55;
          }
          vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
          vec3 R = reflect(-V, N);
          R.y = abs(R.y);
          float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
          vec3 body = mix(vec3(0.004, 0.022, 0.045), vec3(0.025, 0.07, 0.1), smoothstep(-0.2, 0.4, N.z));
          vec3 color = mix(body, sunsetSky(R, sun) * 0.44, fresnel);
          // The sun path: tight sparkles plus a warm column of light.
          float sd = max(dot(R, sun), 0.0);
          // Sparkles fade with distance, so the horizon has no dotted rows.
          float shine = 1400.0 / (1.0 + footprint * 25.0);
          float near = 1.0 - smoothstep(22.0, 75.0, dist);
          color += vec3(1.8, 1.05, 0.55) * min(pow(sd, shine) * 3.2, 1.6) * near;
          color += vec3(1.0, 0.46, 0.2) * pow(sd, 55.0) * 0.3;
          vec3 horizon = normalize(vec3(-V.x, 0.0, -V.z));
          color = mix(color, sunsetSky(horizon, sun), smoothstep(45.0, 150.0, dist));
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `}
        />
      </mesh>
      {[
        [-18, -60, 2.4],
        [20, -85, 3.6],
        [54, -122, 5.6],
        [-52, -106, 4.4],
      ].map(([x, z, s]) => (
        <group key={x} position={[x, -0.28, z]} scale={s}>
          <mesh scale={[1, 0.12, 0.6]}>
            <sphereGeometry args={[1, 24, 12]} />
            <meshStandardMaterial color="#b4ac84" roughness={1} />
          </mesh>
          <mesh position={[0.03, 0.1, 0]} scale={[0.78, 0.18, 0.43]}>
            <sphereGeometry args={[1, 20, 12]} />
            <meshStandardMaterial color="#5e7353" roughness={1} />
          </mesh>
          {[-0.45, 0, 0.4].map((p, i) => (
            <mesh
              key={p}
              position={[p, 0.16, -0.04 + i * 0.045]}
              scale={[0.2, 0.2 + i * 0.06, 0.17]}
              rotation={[0, i, 0]}
            >
              <icosahedronGeometry args={[1, 1]} />
              <meshStandardMaterial color="#747d70" roughness={1} />
            </mesh>
          ))}
          <OutsidePalm
            position={[0.28, 0.16, 0]}
            scale={0.17}
            rotation={0.4}
            phase={0.7}
          />
        </group>
      ))}
      <HorizonShip position={[-16, -0.22, -45]} scale={0.8} phase={0.8} />
      <HorizonShip position={[21, -0.22, -58]} scale={1.05} phase={3.1} />
      <OutsidePalm
        position={[-4.1, -0.15, -7]}
        scale={0.78}
        rotation={0.65}
        phase={0.2}
      />
      <OutsidePalm
        position={[4.1, -0.15, -7]}
        scale={0.78}
        rotation={-1.1}
        phase={2}
      />
    </group>
  )
}

function makeChart() {
  const canvas = document.createElement('canvas')
  canvas.width = 1536
  canvas.height = 1024
  const ctx = canvas.getContext('2d')
  let seed = 417
  const random = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  ctx.fillStyle = '#eeebd4'
  ctx.fillRect(0, 0, 1536, 1024)
  const vignette = ctx.createRadialGradient(768, 512, 160, 768, 512, 870)
  vignette.addColorStop(0, 'rgba(157,116,61,0)')
  vignette.addColorStop(0.7, 'rgba(157,116,61,.07)')
  vignette.addColorStop(1, 'rgba(111,70,29,.48)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, 1536, 1024)
  for (let i = 0; i < 26000; i++) {
    ctx.fillStyle = `rgba(99,69,34,${random() * 0.1})`
    ctx.fillRect(
      random() * 1536,
      random() * 1024,
      random() * 3 + 0.5,
      random() * 1.2 + 0.3,
    )
  }
  for (let i = 0; i < 2400; i++) {
    const x = random() * 1536,
      y = random() * 1024
    ctx.strokeStyle = `rgba(107,80,44,${0.025 + random() * 0.075})`
    ctx.lineWidth = 0.5 + random()
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 2 + random() * 11, y + random() * 3)
    ctx.stroke()
  }
  for (const [x, y, radius] of [
    [70, 825, 155],
    [1420, 85, 190],
    [1180, 980, 140],
  ]) {
    const stain = ctx.createRadialGradient(x, y, 10, x, y, radius)
    stain.addColorStop(0, 'rgba(128,88,39,.16)')
    stain.addColorStop(1, 'rgba(128,88,39,0)')
    ctx.fillStyle = stain
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }
  ctx.strokeStyle = 'rgba(107,85,53,.15)'
  ctx.lineWidth = 1
  for (let x = 90; x < 1536; x += 120) {
    ctx.beginPath()
    ctx.moveTo(x, 40)
    ctx.lineTo(x, 984)
    ctx.stroke()
  }
  for (let y = 80; y < 1024; y += 120) {
    ctx.beginPath()
    ctx.moveTo(40, y)
    ctx.lineTo(1496, y)
    ctx.stroke()
  }
  ctx.strokeStyle = '#958363'
  ctx.lineWidth = 2
  ctx.strokeRect(35, 35, 1466, 954)
  ctx.strokeRect(44, 44, 1448, 936)
  const islands = [
    [405, 615, 112, 75],
    [768, 350, 108, 81],
    [1130, 615, 124, 78],
  ]
  islands.forEach(([x, y, rx, ry], index) => {
    for (let ring = 3; ring >= 0; ring--) {
      ctx.beginPath()
      for (let i = 0; i <= 100; i++) {
        const a = (i / 100) * Math.PI * 2
        const r = 1 + 0.13 * Math.sin(a * 5 + index) + 0.09 * Math.cos(a * 9)
        const px = x + Math.cos(a) * (rx * r + ring * 11),
          py = y + Math.sin(a) * (ry * r + ring * 8)
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.strokeStyle = ring ? 'rgba(105,97,70,.25)' : '#6c6346'
      ctx.lineWidth = ring ? 1.5 : 3
      if (!ring) {
        ctx.fillStyle = '#c6c29b'
        ctx.fill()
      }
      ctx.stroke()
    }
    ctx.strokeStyle = '#777052'
    ctx.lineWidth = 2
    for (let n = 0; n < 5; n++) {
      const xx = x - 55 + n * 25,
        yy = y + 8 - Math.sin(n) * 17
      ctx.beginPath()
      ctx.moveTo(xx - 17, yy + 15)
      ctx.lineTo(xx, yy - 17)
      ctx.lineTo(xx + 17, yy + 15)
      ctx.moveTo(xx, yy - 17)
      ctx.lineTo(xx + 4, yy + 9)
      ctx.stroke()
    }
    ctx.fillStyle = '#3e3529'
    ctx.font = 'bold 31px Georgia'
    ctx.textAlign = 'center'
    ctx.fillText(['BROWSER', 'SERVER', 'PROVIDER'][index], x, y + ry + 58)
  })
  ctx.strokeStyle = '#b54a2a'
  ctx.lineWidth = 5
  ctx.setLineDash([12, 14])
  ctx.beginPath()
  ctx.moveTo(427, 518)
  ctx.bezierCurveTo(450, 390, 600, 332, 635, 340)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(900, 350)
  ctx.bezierCurveTo(1060, 355, 1090, 425, 1110, 510)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.save()
  ctx.translate(235, 236)
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8
    const r = i % 2 ? 49 : 82
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(Math.sin(a - 0.1) * 18, -Math.cos(a - 0.1) * 18)
    ctx.lineTo(Math.sin(a) * r, -Math.cos(a) * r)
    ctx.closePath()
    ctx.fillStyle = i % 2 ? '#968363' : '#544c38'
    ctx.fill()
  }
  ctx.strokeStyle = '#958363'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, 0, 57, 0, Math.PI * 2)
  ctx.stroke()
  ctx.font = '24px Georgia'
  ctx.fillStyle = '#544c38'
  ctx.fillText('N', 0, -100)
  ctx.fillText('S', 0, 114)
  ctx.fillText('W', -101, 9)
  ctx.fillText('E', 101, 9)
  ctx.restore()
  ctx.fillStyle = '#62543e'
  ctx.textAlign = 'right'
  ctx.font = 'italic 34px Georgia'
  ctx.fillText('The Island Passage', 1410, 142)
  ctx.font = '18px Georgia'
  ctx.fillText('A CHART OF THE AGENT LOOP', 1410, 180)
  ctx.textAlign = 'left'
  ctx.fillText('Soundings in calls', 104, 912)
  ctx.strokeStyle = '#766548'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(1100, 902)
  ctx.lineTo(1400, 902)
  ctx.stroke()
  for (let i = 0; i < 7; i++) {
    ctx.beginPath()
    ctx.moveTo(1100 + i * 50, 894)
    ctx.lineTo(1100 + i * 50, 910)
    ctx.stroke()
  }
  for (const x of [512, 1024]) {
    const fold = ctx.createLinearGradient(x - 14, 0, x + 14, 0)
    fold.addColorStop(0, 'rgba(90,65,30,0)')
    fold.addColorStop(0.46, 'rgba(90,65,30,.1)')
    fold.addColorStop(0.54, 'rgba(255,255,239,.35)')
    fold.addColorStop(1, 'rgba(90,65,30,0)')
    ctx.fillStyle = fold
    ctx.fillRect(x - 14, 0, 28, 1024)
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

function TreasureMap({ raised }) {
  const texture = useMemo(makeChart, [])
  const geometry = useMemo(() => {
    const heightAt = (x, z) =>
      Math.pow(Math.abs(x) / 0.99, 14) * 0.033 +
      Math.pow(Math.abs(z) / 0.62, 18) * 0.021 +
      Math.sin(x * 15 - z * 4) * 0.003
    const geo = new PlaneGeometry(1.98, 1.24, 96, 64)
    const points = geo.attributes.position
    for (let i = 0; i < points.count; i++) {
      const x = points.getX(i),
        y = points.getY(i)
      points.setXYZ(
        i,
        x + Math.sin(y * 91) * 0.004 * Math.pow(Math.abs(x) / 0.99, 20),
        y + Math.sin(x * 79) * 0.004 * Math.pow(Math.abs(y) / 0.62, 20),
        heightAt(x, -y),
      )
    }
    geo.computeVertexNormals()
    const miniatures = [
      [-0.47, 0.12],
      [0, -0.195],
      [0.47, 0.12],
    ].map(([x, z], seed) => {
      const vertices = [],
        indices = [],
        colors = []
      const rings = [
        [0, 0.031, '#78945b'],
        [0.65, 0.024, '#96ad72'],
        [0.85, 0.01, '#d4c397'],
        [1, 0.002, '#e0d1a8'],
      ]
      rings.forEach(([radius, height, tint], ring) => {
        for (let i = 0; i <= 48; i++) {
          const angle = (i / 48) * Math.PI * 2,
            edge =
              1 + 0.08 * Math.sin(angle * 5 + seed) + 0.04 * Math.cos(angle * 9)
          const px = Math.cos(angle) * 0.125 * edge * radius,
            pz = Math.sin(angle) * 0.077 * edge * radius
          vertices.push(px, heightAt(x + px, z + pz) + height, pz)
          const color = new Color(tint)
          colors.push(color.r, color.g, color.b)
          if (ring < 3 && i < 48) {
            const a = ring * 49 + i,
              b = a + 49
            indices.push(a, a + 1, b, a + 1, b + 1, b)
          }
        }
      })
      const land = new BufferGeometry()
      land.setAttribute('position', new Float32BufferAttribute(vertices, 3))
      land.setAttribute('color', new Float32BufferAttribute(colors, 3))
      land.setIndex(indices)
      land.computeVertexNormals()
      return { x, z, land, top: heightAt(x, z) + 0.032 }
    })
    return { paper: geo, miniatures }
  }, [])
  useEffect(
    () => () => {
      texture.dispose()
      geometry.paper.dispose()
      geometry.miniatures.forEach((island) => island.land.dispose())
    },
    [texture, geometry],
  )
  return (
    <group position={[0, 0.853, -1.15]}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={geometry.paper}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial
          map={texture}
          roughness={0.97}
          side={DoubleSide}
        />
      </mesh>
      {raised &&
        geometry.miniatures.map(({ x, z, land, top }, i) => (
          <group key={x} position={[x, 0, z]}>
            <mesh geometry={land} castShadow receiveShadow>
              <meshStandardMaterial vertexColors roughness={1} />
            </mesh>
            <group position={[0.015, top, 0]}>
              {i === 1 ? (
                <>
                  <mesh position={[0, 0.034, 0]} castShadow>
                    <cylinderGeometry args={[0.012, 0.019, 0.068, 12]} />
                    <meshStandardMaterial color="#e8dcad" roughness={0.9} />
                  </mesh>
                  {[0.014, 0.051].map((y) => (
                    <mesh key={y} position={[0, y, 0]}>
                      <cylinderGeometry args={[0.017, 0.018, 0.006, 12]} />
                      <meshStandardMaterial color="#59584c" />
                    </mesh>
                  ))}
                  <mesh position={[0, 0.079, 0]}>
                    <coneGeometry args={[0.026, 0.025, 12]} />
                    <meshStandardMaterial color="#ab633e" />
                  </mesh>
                </>
              ) : i === 2 ? (
                <>
                  <mesh position={[0, 0.022, 0]} castShadow>
                    <cylinderGeometry args={[0.032, 0.034, 0.044, 16]} />
                    <meshStandardMaterial color="#dfd2ad" />
                  </mesh>
                  <mesh position={[0, 0.042, 0]}>
                    <sphereGeometry
                      args={[0.034, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]}
                    />
                    <meshStandardMaterial color="#a26d48" roughness={0.7} />
                  </mesh>
                </>
              ) : (
                <>
                  <mesh position={[0, 0.021, 0]} castShadow>
                    <boxGeometry args={[0.065, 0.042, 0.047]} />
                    <meshStandardMaterial color="#a98b5e" roughness={0.95} />
                  </mesh>
                  {[-1, 1].map((s) => (
                    <mesh
                      key={s}
                      position={[s * 0.02, 0.05, 0]}
                      rotation={[0, 0, -s * 0.5]}
                    >
                      <boxGeometry args={[0.047, 0.006, 0.058]} />
                      <meshStandardMaterial color="#985d3d" />
                    </mesh>
                  ))}
                  <mesh position={[0, 0.018, 0.024]}>
                    <boxGeometry args={[0.014, 0.028, 0.003]} />
                    <meshStandardMaterial color="#4b493a" />
                  </mesh>
                </>
              )}
            </group>
            <group position={[-0.065, top - 0.011, 0.004]}>
              <mesh position={[0, 0.028, 0]}>
                <cylinderGeometry args={[0.004, 0.006, 0.056, 7]} />
                <meshStandardMaterial color="#816545" />
              </mesh>
              {Array.from({ length: 7 }, (_, j) => (
                <group key={j} rotation={[0, (j * Math.PI * 2) / 7, 0]}>
                  <mesh
                    position={[0, 0.059, 0.027]}
                    rotation={[0.2, 0, 0]}
                    scale={[0.009, 0.002, 0.035]}
                  >
                    <sphereGeometry args={[1, 8, 4]} />
                    <meshStandardMaterial
                      color={j % 2 ? '#527747' : '#7d9955'}
                      roughness={1}
                    />
                  </mesh>
                </group>
              ))}
            </group>
            {[-1, 0, 1].map((n) => (
              <mesh
                key={n}
                position={[n * 0.026, top - 0.012, 0.053]}
                scale={[0.012, 0.006, 0.008]}
              >
                <icosahedronGeometry args={[1, 1]} />
                <meshStandardMaterial color="#a5a18b" roughness={1} />
              </mesh>
            ))}
            <group
              position={[0.085, top - 0.014, -0.02]}
              rotation={[0, 0.3, 0]}
            >
              {[0, 1, 2, 3].map((n) => (
                <mesh key={n} position={[n * 0.009, 0, 0]}>
                  <boxGeometry args={[0.007, 0.005, 0.029]} />
                  <meshStandardMaterial color="#94734b" roughness={1} />
                </mesh>
              ))}
              {[0, 0.027].flatMap((x) =>
                [-0.012, 0.012].map((z) => (
                  <mesh key={`${x}${z}`} position={[x, -0.005, z]}>
                    <cylinderGeometry args={[0.002, 0.003, 0.022, 6]} />
                    <meshStandardMaterial color="#65533b" />
                  </mesh>
                )),
              )}
            </group>
          </group>
        ))}
    </group>
  )
}

function TableCompass() {
  const dial = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ece2bb'
    ctx.fillRect(0, 0, 256, 256)
    ctx.translate(128, 128)
    for (let i = 0; i < 60; i++) {
      const a = (i * Math.PI) / 30,
        major = i % 5 === 0
      ctx.strokeStyle = '#6b5e42'
      ctx.lineWidth = major ? 2.5 : 1
      ctx.beginPath()
      ctx.moveTo(
        Math.sin(a) * (major ? 88 : 96),
        -Math.cos(a) * (major ? 88 : 96),
      )
      ctx.lineTo(Math.sin(a) * 106, -Math.cos(a) * 106)
      ctx.stroke()
    }
    ctx.fillStyle = '#4c4939'
    ctx.font = 'bold 23px Georgia'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const [label, x, y] of [
      ['N', 0, -66],
      ['E', 66, 0],
      ['S', 0, 66],
      ['W', -66, 0],
    ])
      ctx.fillText(label, x, y)
    for (let i = 0; i < 8; i++) {
      ctx.save()
      ctx.rotate((i * Math.PI) / 4)
      ctx.beginPath()
      ctx.moveTo(0, -45)
      ctx.lineTo(8, 0)
      ctx.lineTo(0, 15)
      ctx.lineTo(-8, 0)
      ctx.closePath()
      ctx.fillStyle = i % 2 ? '#b9aa7e' : '#7b7657'
      ctx.fill()
      ctx.restore()
    }
    const map = new CanvasTexture(canvas)
    map.colorSpace = SRGBColorSpace
    return map
  }, [])
  useEffect(() => () => dial.dispose(), [dial])
  return (
    <group position={[1.12, 0.864, -0.66]} rotation={[0, 0.35, 0]}>
      <mesh>
        <cylinderGeometry args={[0.13, 0.13, 0.035, 48]} />
        <meshStandardMaterial
          color="#a38b4c"
          metalness={0.75}
          roughness={0.3}
        />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.112, 0.112, 0.008, 48]} />
        <meshStandardMaterial color="#ece2bb" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.108, 48]} />
        <meshBasicMaterial map={dial} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.026, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.119, 0.006, 8, 48]} />
        <meshStandardMaterial
          color="#c7b37a"
          metalness={0.72}
          roughness={0.38}
        />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.025, 0.16, 4]} />
        <meshStandardMaterial color="#b2462b" metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.033, 0]}>
        <sphereGeometry args={[0.012, 12, 8]} />
        <meshStandardMaterial color="#bbaa6c" metalness={0.7} />
      </mesh>
      <mesh position={[0, 0.002, -0.145]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.028, 0.006, 8, 16]} />
        <meshStandardMaterial color="#a38b4c" metalness={0.75} />
      </mesh>
    </group>
  )
}

// A candle flame that flickers: the light and the flame breathe together.
function useFlicker(light, flame, base) {
  useFrame(({ clock }) => {
    if (reducedMotion) return
    const t = clock.elapsedTime
    const wave =
      Math.sin(t * 11.3) * 0.5 + Math.sin(t * 23.7 + 1.3) * 0.3 + Math.sin(t * 5.1) * 0.2
    if (light.current) light.current.intensity = base * (1 + wave * 0.16)
    if (flame.current) flame.current.scale.y = flame.current.userData.height * (1 + wave * 0.12)
  })
}

const flameColor = new Color(7, 3.6, 1.2)

function Lantern() {
  const light = useRef(),
    flame = useRef()
  useFlicker(light, flame, 0.85)
  return (
    <group position={[-1.1, 0.84, -1.67]}>
      {[0.015, 0.34].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[0.105, 0.12, 0.04, 16]} />
          <meshStandardMaterial
            color="#39362d"
            metalness={0.75}
            roughness={0.42}
          />
        </mesh>
      ))}
      <mesh position={[0, 0.19, 0]}>
        <cylinderGeometry args={[0.075, 0.08, 0.27, 16]} />
        <meshPhysicalMaterial
          color="#f5d9a2"
          emissive="#ff9a3c"
          emissiveIntensity={0.25}
          transparent
          opacity={0.22}
          roughness={0.12}
          side={DoubleSide}
        />
      </mesh>
      {[0, 1, 2, 3].map((n) => (
        <mesh
          key={n}
          position={[
            Math.sin((n * Math.PI) / 2) * 0.085,
            0.18,
            Math.cos((n * Math.PI) / 2) * 0.085,
          ]}
        >
          <cylinderGeometry args={[0.006, 0.006, 0.32, 6]} />
          <meshStandardMaterial color="#39362d" metalness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, 0.115, 0]}>
        <cylinderGeometry args={[0.023, 0.027, 0.12, 16]} />
        <meshStandardMaterial color="#efe2c2" roughness={0.6} />
      </mesh>
      <mesh
        ref={flame}
        position={[0, 0.2, 0]}
        scale={[0.016, 0.04, 0.016]}
        userData={{ height: 0.04 }}
      >
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial color={flameColor} />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <torusGeometry args={[0.06, 0.007, 8, 24]} />
        <meshStandardMaterial color="#39362d" metalness={0.7} />
      </mesh>
      <pointLight
        ref={(node) => {
          light.current = node
          allLayers(node)
        }}
        position={[0, 0.24, 0]}
        color="#ffae5e"
        intensity={0.85}
        distance={2.6}
        decay={1.6}
      />
    </group>
  )
}

function CloseLogo() {
  const [map, setMap] = useState(null)
  useEffect(() => {
    let active = true
    let image
    new TextureLoader().load(
      './logos/tanstack-landscape-black-640.png',
      (texture) => {
        image = texture
        if (!active) {
          texture.dispose()
          return
        }
        texture.colorSpace = SRGBColorSpace
        setMap(texture)
      },
    )
    return () => {
      active = false
      image?.dispose()
    }
  }, [])
  return map ? (
    <group position={[0, 0.955, -0.41]} rotation={[-0.17, 0, 0]} scale={0.6}>
      <mesh>
        <boxGeometry args={[1.42, 0.29, 0.024]} />
        <meshStandardMaterial color="#eeebd4" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, 0.014]}>
        <planeGeometry args={[1.22, 0.190625]} />
        <meshBasicMaterial map={map} toneMapped={false} transparent />
      </mesh>
    </group>
  ) : null
}

function ChestSticker({ map, position, rotation, width }) {
  const height = (width * map.image.height) / map.image.width
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <planeGeometry args={[width * 1.24, height * 1.3]} />
        <meshStandardMaterial color="#eeebd4" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0, 0.0015]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={map} transparent toneMapped={false} />
      </mesh>
    </group>
  )
}

function TreasureChest({ material }) {
  const [wordmark, emblem] = useLoader(TextureLoader, [
    './logos/tanstack-landscape-black-640.png',
    './logos/tanstack-emblem-charcoal-256.png',
  ])
  useMemo(() => {
    for (const texture of [wordmark, emblem]) {
      texture.colorSpace = SRGBColorSpace
      texture.anisotropy = 8
      texture.needsUpdate = true
    }
  }, [wordmark, emblem])
  const straps = useMemo(() => {
    const curve = new CatmullRomCurve3(
      Array.from({ length: 21 }, (_, index) => {
        const angle = (index / 20) * Math.PI - Math.PI / 2
        return new Vector3(
          0,
          0.505 + Math.cos(angle) * 0.257,
          Math.sin(angle) * 0.365,
        )
      }),
    )
    return new TubeGeometry(curve, 32, 0.026, 4, false)
  }, [])
  useEffect(() => () => straps.dispose(), [straps])
  const iron = { color: '#615444', metalness: 0.72, roughness: 0.48 }
  return (
    <group position={[2.5, 0.0875, -2.1]} rotation={[0, -0.28, 0]}>
      <Timber
        material={material}
        position={[0, 0.055, 0]}
        args={[1.07, 0.105, 0.73]}
        color="#786043"
      />
      {Array.from({ length: 4 }, (_, index) => (
        <group key={index}>
          {[-1, 1].map((side) => (
            <Timber
              key={side}
              material={material}
              position={[0, 0.15 + index * 0.1, side * 0.325]}
              args={[1.02, 0.092, 0.055]}
              color="#92724c"
            />
          ))}
          {[-1, 1].map((side) => (
            <Timber
              key={side}
              material={material}
              position={[side * 0.49, 0.15 + index * 0.1, 0]}
              args={[0.055, 0.092, 0.66]}
              color="#92724c"
            />
          ))}
        </group>
      ))}
      {Array.from({ length: 12 }, (_, index) => {
        const angle = ((index + 0.5) / 12) * Math.PI - Math.PI / 2
        const tilt = Math.atan2(Math.sin(angle) / 0.34, Math.cos(angle) / 0.24)
        return (
          <Timber
            key={index}
            material={material}
            position={[
              0,
              0.505 + Math.cos(angle) * 0.24,
              Math.sin(angle) * 0.34,
            ]}
            rotation={[tilt, 0, 0]}
            args={[1.04, 0.041, 0.077]}
            color="#a68a60"
          />
        )
      })}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * 0.49, 0.505, 0]}
          rotation={[0, Math.PI / 2, 0]}
          scale={[1, 0.706, 1]}
        >
          <circleGeometry args={[0.34, 28, 0, Math.PI]} />
          <meshStandardMaterial
            {...material}
            color="#a99474"
            roughness={0.9}
            side={DoubleSide}
          />
        </mesh>
      ))}
      {[-0.34, 0.34].map((x) => (
        <group key={x}>
          <mesh position={[x, 0, 0]} geometry={straps}>
            <meshStandardMaterial {...iron} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[x, 0.29, side * 0.36]}>
              <boxGeometry args={[0.053, 0.46, 0.019]} />
              <meshStandardMaterial {...iron} />
            </mesh>
          ))}
          {[-1, 1].flatMap((side) =>
            [0.11, 0.22, 0.4, 0.51].map((y) => (
              <mesh key={`${side}-${y}`} position={[x, y, side * 0.373]}>
                <sphereGeometry args={[0.013, 8, 6]} />
                <meshStandardMaterial
                  color="#a58e61"
                  metalness={0.7}
                  roughness={0.4}
                />
              </mesh>
            )),
          )}
          {[-0.95, -0.48, 0, 0.48, 0.95].map((angle) => (
            <mesh
              key={angle}
              position={[
                x,
                0.511 + Math.cos(angle) * 0.276,
                Math.sin(angle) * 0.379,
              ]}
            >
              <sphereGeometry args={[0.012, 8, 6]} />
              <meshStandardMaterial
                color="#a58e61"
                metalness={0.7}
                roughness={0.4}
              />
            </mesh>
          ))}
        </group>
      ))}
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <group key={`${x}-${z}`}>
            <mesh position={[x * 0.455, 0.13, z * 0.361]}>
              <boxGeometry args={[0.13, 0.13, 0.021]} />
              <meshStandardMaterial {...iron} />
            </mesh>
            <mesh position={[x * 0.525, 0.13, z * 0.298]}>
              <boxGeometry args={[0.019, 0.13, 0.13]} />
              <meshStandardMaterial {...iron} />
            </mesh>
          </group>
        )),
      )}
      <mesh position={[0, 0.465, 0.373]}>
        <boxGeometry args={[0.074, 0.21, 0.026]} />
        <meshStandardMaterial {...iron} />
      </mesh>
      <mesh position={[0, 0.355, 0.408]}>
        <torusGeometry args={[0.035, 0.009, 7, 18]} />
        <meshStandardMaterial
          color="#b6a16c"
          metalness={0.8}
          roughness={0.35}
        />
      </mesh>
      <mesh position={[0, 0.305, 0.409]}>
        <boxGeometry args={[0.083, 0.087, 0.042]} />
        <meshStandardMaterial
          color="#b6a16c"
          metalness={0.8}
          roughness={0.35}
        />
      </mesh>
      <mesh position={[0, 0.307, 0.432]}>
        <circleGeometry args={[0.008, 12]} />
        <meshBasicMaterial color="#292722" />
      </mesh>
      <mesh position={[0, 0.296, 0.432]}>
        <planeGeometry args={[0.007, 0.018]} />
        <meshBasicMaterial color="#292722" />
      </mesh>
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[side * 0.547, 0.32, 0]}
          rotation={[0, (side * Math.PI) / 2, 0]}
        >
          <mesh rotation={[0, 0, Math.PI / 2]} scale={[1, 0.67, 1]}>
            <torusGeometry args={[0.083, 0.012, 7, 22]} />
            <meshStandardMaterial {...iron} />
          </mesh>
          {[-0.065, 0.065].map((x) => (
            <mesh key={x} position={[x, 0.055, -0.006]}>
              <boxGeometry args={[0.04, 0.055, 0.018]} />
              <meshStandardMaterial {...iron} />
            </mesh>
          ))}
        </group>
      ))}
      <ChestSticker map={wordmark} position={[0, 0.16, 0.358]} width={0.33} />
      <ChestSticker
        map={emblem}
        position={[-0.17, 0.363, 0.36]}
        rotation={[0, 0, -0.08]}
        width={0.071}
      />
      <ChestSticker
        map={emblem}
        position={[0.17, 0.346, 0.36]}
        rotation={[0, 0, 0.1]}
        width={0.078}
      />
      <ChestSticker
        map={wordmark}
        position={[0, 0.712, 0.219]}
        rotation={[-1, 0, 0]}
        width={0.37}
      />
      <ChestSticker
        map={emblem}
        position={[-0.538, 0.195, 0.115]}
        rotation={[0, -Math.PI / 2, -0.05]}
        width={0.086}
      />
      <ChestSticker
        map={wordmark}
        position={[-0.54, 0.447, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        width={0.31}
      />
    </group>
  )
}

function BeachChair({ material }) {
  const canvasMap = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 512
    const ctx = canvas.getContext('2d')
    for (let stripe = 0; stripe < 9; stripe++) {
      ctx.fillStyle = stripe % 2 ? '#c8442e' : '#fff8e8'
      ctx.fillRect((stripe * 512) / 9, 0, 512 / 9 + 1, 512)
    }
    ctx.strokeStyle = 'rgba(91,62,38,.14)'
    ctx.lineWidth = 0.7
    for (let line = 0; line < 512; line += 3) {
      ctx.beginPath()
      ctx.moveTo(0, line)
      ctx.lineTo(512, line)
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(255,255,243,.15)'
    for (let line = 0; line < 512; line += 4) {
      ctx.beginPath()
      ctx.moveTo(line, 0)
      ctx.lineTo(line, 512)
      ctx.stroke()
    }
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 8
    return texture
  }, [])
  const sling = useMemo(() => {
    const curve = new CatmullRomCurve3([
      new Vector3(0, 0.43, 0.43),
      new Vector3(0, 0.32, 0.08),
      new Vector3(0, 0.46, -0.18),
      new Vector3(0, 0.82, -0.4),
      new Vector3(0, 1.19, -0.6),
    ])
    const vertices = [],
      uv = [],
      indices = []
    for (let row = 0; row <= 40; row++) {
      const center = curve.getPoint(row / 40)
      for (let column = 0; column <= 20; column++) {
        const u = column / 20
        vertices.push(
          (u - 0.5) * 0.8,
          center.y - Math.sin(u * Math.PI) * 0.035,
          center.z,
        )
        uv.push(u, row / 40)
        if (row < 40 && column < 20) {
          const index = row * 21 + column
          indices.push(
            index,
            index + 1,
            index + 21,
            index + 1,
            index + 22,
            index + 21,
          )
        }
      }
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
    geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
  }, [])
  useEffect(
    () => () => {
      canvasMap.dispose()
      sling.dispose()
    },
    [canvasMap, sling],
  )
  return (
    <group position={[-2.4, 0.12, -1.9]} rotation={[0, 0.2, 0]}>
      <mesh geometry={sling} castShadow receiveShadow>
        <meshStandardMaterial
          map={canvasMap}
          roughness={0.98}
          side={DoubleSide}
        />
      </mesh>
      {[-0.47, 0.47].map((x) => (
        <group key={x}>
          <Timber
            material={material}
            position={[x, 0.615, 0.01]}
            rotation={[-0.805, 0, 0]}
            args={[0.065, 1.775, 0.065]}
            color="#bda378"
          />
          <Timber
            material={material}
            position={[x, 0.22, -0.035]}
            rotation={[1.167, 0, 0]}
            args={[0.065, 1.12, 0.065]}
            color="#bda378"
          />
          <Timber
            material={material}
            position={[x, 0.35, 0.41]}
            rotation={[-0.565, 0, 0]}
            args={[0.055, 0.71, 0.055]}
            color="#bda378"
          />
          <Timber
            material={material}
            position={[x, 0.67, 0.025]}
            args={[0.105, 0.055, 0.72]}
            color="#c7b38d"
          />
          <mesh
            position={[x + Math.sign(x) * 0.041, 0.35, -0.12]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.026, 0.026, 0.025, 12]} />
            <meshStandardMaterial
              color="#706449"
              metalness={0.7}
              roughness={0.5}
            />
          </mesh>
        </group>
      ))}
      {[
        [0.43, 0.43],
        [1.19, -0.6],
        [0.08, -0.49],
      ].map(([y, z]) => (
        <mesh
          key={y}
          position={[0, y, z]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
        >
          <cylinderGeometry args={[0.036, 0.036, 1.015, 12]} />
          <meshStandardMaterial {...material} color="#c3ad88" roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

// Dust drifting through the room. Motes inside the sunbeam glow; a mote is in
// the beam when its path toward the sun passes through the window opening.
function DustMotes() {
  const geometry = useMemo(() => {
    const count = 160,
      positions = new Float32Array(count * 3),
      seeds = new Float32Array(count)
    let seed = 11
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (random() - 0.5) * 6.4
      positions[i * 3 + 1] = 0.15 + random() * 2.7
      positions[i * 3 + 2] = -2.95 + random() * 5.9
      seeds[i] = random()
    }
    const dust = new BufferGeometry()
    dust.setAttribute('position', new Float32BufferAttribute(positions, 3))
    dust.setAttribute('seed', new Float32BufferAttribute(seeds, 1))
    return dust
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  const uniforms = useMemo(
    () => ({
      time: { value: 0 },
      scale: { value: 900 },
      light: { value: new Vector3(...shackLight).normalize() },
    }),
    [],
  )
  useFrame(({ clock, size, viewport }) => {
    uniforms.time.value = reducedMotion ? 0 : clock.elapsedTime
    uniforms.scale.value = size.height * viewport.dpr
  })
  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        vertexShader={`
          attribute float seed;
          uniform float time, scale;
          uniform vec3 light;
          varying float vLit;
          varying float vSeed;
          void main() {
            vec3 p = position;
            p.x += sin(time * 0.11 + seed * 41.0) * 0.16;
            p.y += sin(time * 0.07 + seed * 23.0) * 0.22;
            p.z += cos(time * 0.09 + seed * 31.0) * 0.16;
            vec3 q = p + light * ((-3.0 - p.z) / light.z);
            vLit = step(-2.6, q.x) * step(q.x, 2.6) * step(1.0, q.y) * step(q.y, 2.58);
            vSeed = seed;
            vec4 view = modelViewMatrix * vec4(p, 1.0);
            // Soft, warm specks; very close ones fade instead of growing huge.
            vLit *= smoothstep(0.7, 1.8, -view.z);
            // Out-of-focus dust: soft discs, a few pixels wide.
            gl_PointSize = min(scale * (0.016 + seed * 0.02) / -view.z, 18.0);
            gl_Position = projectionMatrix * view;
          }
        `}
        fragmentShader={`
          uniform float time;
          varying float vLit;
          varying float vSeed;
          void main() {
            vec2 c = gl_PointCoord - 0.5;
            float a = exp(-dot(c, c) * 9.0) * (1.0 - smoothstep(0.35, 0.5, length(c)));
            float twinkle = 0.6 + 0.4 * sin(time * (1.0 + vSeed * 2.0) + vSeed * 40.0);
            vec3 col = vec3(1.0, 0.76, 0.48) * vLit * 0.28 * twinkle;
            gl_FragColor = vec4(col, a);
          }
        `}
      />
    </points>
  )
}

// A flat-woven kilim in the brand colors under the table.
function Rug() {
  const map = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 740
    const ctx = canvas.getContext('2d')
    let seed = 5
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    ctx.fillStyle = '#d8c7a5'
    ctx.fillRect(0, 0, 1024, 740)
    const band = (inset, width, color) => {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.strokeRect(inset, inset, 1024 - inset * 2, 740 - inset * 2)
    }
    band(34, 68, '#8a4733')
    band(76, 10, '#3e3529')
    band(96, 14, '#a8875a')
    band(116, 6, '#3e3529')
    const diamond = (x, y, w, h, color) => {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(x, y - h)
      ctx.lineTo(x + w, y)
      ctx.lineTo(x, y + h)
      ctx.lineTo(x - w, y)
      ctx.closePath()
      ctx.fill()
    }
    for (let k = 0; k < 5; k++) {
      const x = 232 + k * 140
      diamond(x, 370, 62, 150, '#4a3e30')
      diamond(x, 370, 50, 122, '#97523a')
      diamond(x, 370, 34, 84, '#d8c7a5')
      diamond(x, 370, 21, 52, '#a8875a')
      diamond(x, 370, 8, 20, '#4a3e30')
    }
    for (let x = 150; x < 880; x += 30) {
      diamond(x, 166, 9, 12, '#8a4733')
      diamond(x, 574, 9, 12, '#8a4733')
    }
    for (let y = 0; y < 740; y += 3) {
      ctx.fillStyle = `rgba(52,34,18,${0.025 + random() * 0.05})`
      ctx.fillRect(0, y, 1024, 1.2)
    }
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = `rgba(255,248,230,${random() * 0.05})`
      ctx.fillRect(random() * 1024, random() * 740, 2 + random() * 5, 1)
    }
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 8
    return texture
  }, [])
  useEffect(() => () => map.dispose(), [map])
  const fringe = useRef()
  useLayoutEffect(() => {
    const tassel = new Object3D()
    let index = 0
    for (const side of [-1, 1])
      for (let i = 0; i < 30; i++) {
        tassel.position.set(side * 1.295, 0, -0.83 + (i / 29) * 1.66)
        tassel.rotation.set(0, ((i % 3) - 1) * 0.12, 0)
        tassel.updateMatrix()
        fringe.current.setMatrixAt(index++, tassel.matrix)
      }
    fringe.current.instanceMatrix.needsUpdate = true
    fringe.current.computeBoundingSphere()
  }, [])
  return (
    <group position={[0, 0.097, -1.05]}>
      <mesh receiveShadow>
        <boxGeometry args={[2.5, 0.012, 1.75]} />
        <meshStandardMaterial map={map} roughness={1} />
      </mesh>
      <instancedMesh
        ref={fringe}
        args={[undefined, undefined, 60]}
        receiveShadow
      >
        <boxGeometry args={[0.09, 0.006, 0.016]} />
        <meshStandardMaterial color="#e3d5b5" roughness={1} />
      </instancedMesh>
    </group>
  )
}

const brass = { color: '#b8954f', metalness: 0.78, roughness: 0.34 }

// A ship's wheel on the back wall, between the window post and the corner
// post. It is small enough to fit the gap and to stay inside the close view.
function ShipWheel({ material }) {
  return (
    <group position={[3.045, 1.86, -2.95]} scale={0.6}>
      <mesh position={[0, 0, -0.12]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 0.24, 10]} />
        <meshStandardMaterial {...brass} />
      </mesh>
      <mesh castShadow>
        <torusGeometry args={[0.2, 0.02, 10, 40]} />
        <meshStandardMaterial {...material} color="#a77d52" roughness={0.85} />
      </mesh>
      <mesh>
        <torusGeometry args={[0.085, 0.014, 8, 28]} />
        <meshStandardMaterial {...material} color="#a77d52" roughness={0.85} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} rotation={[0, 0, (i * Math.PI) / 4]} castShadow>
          <cylinderGeometry args={[0.011, 0.011, 0.5, 8]} />
          <meshStandardMaterial
            {...material}
            color="#b58b5c"
            roughness={0.85}
          />
        </mesh>
      ))}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4
        return (
          <mesh
            key={i}
            position={[Math.sin(a) * 0.245, Math.cos(a) * 0.245, 0]}
            rotation={[0, 0, -a]}
          >
            <cylinderGeometry args={[0.012, 0.017, 0.06, 8]} />
            <meshStandardMaterial
              {...material}
              color="#8f6a44"
              roughness={0.8}
            />
          </mesh>
        )
      })}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.05, 16]} />
        <meshStandardMaterial {...brass} />
      </mesh>
    </group>
  )
}

// An oil lamp hanging from the ceiling beam, swaying a little.
function HangingLamp() {
  const lamp = useRef(),
    light = useRef(),
    flame = useRef()
  useFlicker(light, flame, 0.75)
  useFrame(({ clock }) => {
    if (lamp.current && !reducedMotion)
      lamp.current.rotation.z = Math.sin(clock.elapsedTime * 0.55) * 0.035
  })
  return (
    <group position={[2.02, 2.87, 0.05]}>
      <group ref={lamp}>
        <mesh position={[0, -0.21, 0]}>
          <cylinderGeometry args={[0.005, 0.005, 0.42, 6]} />
          <meshStandardMaterial
            color="#2f2c27"
            metalness={0.6}
            roughness={0.5}
          />
        </mesh>
        <group position={[0, -0.56, 0]}>
          <mesh position={[0, 0.15, 0]}>
            <coneGeometry args={[0.1, 0.08, 16]} />
            <meshStandardMaterial {...brass} />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <torusGeometry args={[0.025, 0.006, 6, 16]} />
            <meshStandardMaterial {...brass} />
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.065, 0.065, 0.2, 16, 1, true]} />
            <meshPhysicalMaterial
              color="#ffe7bf"
              emissive="#ff9a3c"
              emissiveIntensity={0.35}
              transparent
              opacity={0.3}
              roughness={0.1}
              side={DoubleSide}
            />
          </mesh>
          {[0, 1, 2, 3].map((n) => (
            <mesh
              key={n}
              position={[
                Math.sin((n * Math.PI) / 2 + 0.4) * 0.068,
                0,
                Math.cos((n * Math.PI) / 2 + 0.4) * 0.068,
              ]}
            >
              <cylinderGeometry args={[0.005, 0.005, 0.22, 6]} />
              <meshStandardMaterial {...brass} />
            </mesh>
          ))}
          <mesh position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.08, 0.05, 0.05, 16]} />
            <meshStandardMaterial {...brass} />
          </mesh>
          <mesh
            ref={flame}
            position={[0, -0.02, 0]}
            scale={[0.014, 0.036, 0.014]}
            userData={{ height: 0.036 }}
          >
            <sphereGeometry args={[1, 12, 12]} />
            <meshBasicMaterial color={flameColor} />
          </mesh>
          <pointLight
            ref={(node) => {
              light.current = node
              allLayers(node)
            }}
            position={[0, -0.01, 0]}
            color="#ffae5e"
            intensity={0.75}
            distance={3.6}
            decay={1.5}
          />
        </group>
      </group>
    </group>
  )
}

// A ship in a bottle on the windowsill, a silhouette against the sunset.
function BottleShip() {
  return (
    <group position={[2.22, 0.975, -2.98]} rotation={[0, -0.28, 0]}>
      {[-0.075, 0.075].map((x) => (
        <mesh key={x} position={[x, 0.02, 0]}>
          <boxGeometry args={[0.025, 0.04, 0.09]} />
          <meshStandardMaterial color="#6e5236" roughness={0.9} />
        </mesh>
      ))}
      <group position={[0, 0.072, 0]}>
        <mesh position={[-0.01, -0.02, 0]}>
          <boxGeometry args={[0.13, 0.022, 0.03]} />
          <meshStandardMaterial color="#7a4a2e" roughness={0.8} />
        </mesh>
        {[-0.035, 0.02].map((x, i) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh position={[0, 0.02, 0]}>
              <cylinderGeometry args={[0.0025, 0.0025, 0.07, 5]} />
              <meshStandardMaterial color="#3b2b1d" />
            </mesh>
            <mesh position={[0, 0.026, 0.002]} rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[0.042, i ? 0.05 : 0.044]} />
              <meshStandardMaterial
                color="#fff6e2"
                emissive="#ffe9c4"
                emissiveIntensity={0.35}
                side={DoubleSide}
              />
            </mesh>
          </group>
        ))}
        <mesh position={[-0.01, -0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.2, 0.08]} />
          <meshStandardMaterial color="#2c5d63" roughness={0.6} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.052, 0.052, 0.25, 24, 1, true]} />
          <meshPhysicalMaterial
            color="#6fae86"
            transparent
            opacity={0.3}
            roughness={0.04}
            clearcoat={1}
            side={DoubleSide}
          />
        </mesh>
        {/* Bright streaks along the curved glass read as a bottle. */}
        {[
          [0.045, 0.014, 0.006, 0.95],
          [0.034, 0.036, 0.003, 0.55],
        ].map(([y, z, thickness, opacity]) => (
          <mesh key={y} position={[-0.012, y, z]}>
            <boxGeometry args={[0.21, thickness, 0.001]} />
            <meshBasicMaterial
              color="#fff7e6"
              transparent
              opacity={opacity}
              depthWrite={false}
            />
          </mesh>
        ))}
        <mesh position={[0.155, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.02, 0.05, 0.06, 20, 1, true]} />
          <meshPhysicalMaterial
            color="#d6efe8"
            transparent
            opacity={0.22}
            roughness={0.04}
            side={DoubleSide}
          />
        </mesh>
        <mesh position={[0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.017, 0.019, 0.04, 12]} />
          <meshStandardMaterial color="#b98d5e" roughness={0.95} />
        </mesh>
      </group>
    </group>
  )
}

// An inkwell with a quill beside the chart.
function Inkwell() {
  const vane = useMemo(() => {
    const shape = new Shape()
    shape.moveTo(0, 0.07)
    shape.quadraticCurveTo(0.03, 0.17, 0.018, 0.3)
    shape.quadraticCurveTo(0.008, 0.34, 0, 0.35)
    shape.quadraticCurveTo(-0.014, 0.27, -0.018, 0.16)
    shape.quadraticCurveTo(-0.012, 0.1, 0, 0.07)
    return new ShapeGeometry(shape, 12)
  }, [])
  useEffect(() => () => vane.dispose(), [vane])
  return (
    <group position={[1.2, 0.84, -1.38]}>
      <mesh position={[0, 0.025, 0]} castShadow>
        <cylinderGeometry args={[0.048, 0.052, 0.05, 20]} />
        <meshPhysicalMaterial
          color="#1d2b2b"
          roughness={0.12}
          clearcoat={1}
          clearcoatRoughness={0.1}
        />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.022, 0.046, 0.022, 20]} />
        <meshPhysicalMaterial color="#1d2b2b" roughness={0.12} clearcoat={1} />
      </mesh>
      <mesh position={[0, 0.076, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.021, 0.004, 6, 18]} />
        <meshStandardMaterial {...brass} />
      </mesh>
      {/* The quill leans back with its vane turned up, so it reads as a
          feather from the table camera too. */}
      <group position={[0, 0.07, 0]} rotation={[0, 0.55, -0.85]}>
        <mesh position={[0, 0.17, 0]}>
          <cylinderGeometry args={[0.0018, 0.0024, 0.36, 5]} />
          <meshStandardMaterial color="#d9cfb8" roughness={0.7} />
        </mesh>
        <mesh geometry={vane} rotation={[0, Math.PI / 2, 0]} castShadow>
          <meshStandardMaterial
            color="#f2ece0"
            roughness={0.9}
            side={DoubleSide}
          />
        </mesh>
      </group>
    </group>
  )
}

const birdWing = (() => {
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(
      [
        0, 0, -0.06, 0, 0, 0.06, 0.24, 0.04, -0.04, 0, 0, 0.06, 0.48, -0.02, 0,
        0.24, 0.04, -0.04,
      ],
      3,
    ),
  )
  geometry.computeVertexNormals()
  return geometry
})()

// Distant birds gliding across the sunset.
function SunsetBirds() {
  const birds = useRef([])
  const reduced = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  useFrame(({ clock }) => {
    const t = reduced ? 20 : clock.elapsedTime
    birds.current.forEach((bird, i) => {
      if (!bird) return
      const u = (t * 0.011 + i * 0.07 + (i > 2 ? 0.45 : 0)) % 1
      bird.position.set(
        -42 + u * 84 + i * 1.4,
        5.4 + (i % 3) * 0.8 + Math.sin(t * 0.4 + i) * 0.3,
        -52 - i * 2.5,
      )
      const flap = Math.sin(t * 6.5 + i * 1.7) * 0.45
      bird.children[0].rotation.z = 0.2 + flap
      bird.children[1].rotation.z = -(0.2 + flap)
    })
  })
  return Array.from({ length: 5 }, (_, i) => (
    <group
      key={i}
      ref={(node) => {
        birds.current[i] = node
      }}
      scale={1.4}
    >
      {[1, -1].map((side) => (
        <mesh key={side} geometry={birdWing} scale={[side, 1, 1]}>
          <meshBasicMaterial color="#3a2622" side={DoubleSide} />
        </mesh>
      ))}
    </group>
  ))
}

// The cabin has about two hundred static boards. After they mount, merge them
// into one mesh with per-vertex tints: same look, one draw call per pass.
// The X profile on the last slide: https://x.com/AlemTuzlak as a QR code,
// version 2, level M, mask 4. An independent decoder reads it back.
// ponytail: fixed rows, so no QR package. If the URL changes, make new rows
// with any QR encoder.
const xProfileQr = [
  '1111111011110011101111111',
  '1000001000001100101000001',
  '1011101000111011001011101',
  '1011101010001011101011101',
  '1011101010001101101011101',
  '1000001011010100001000001',
  '1111111010101010101111111',
  '0000000011001001000000000',
  '1000101110110001011111001',
  '0111110000001101100111010',
  '0100011001011011001001100',
  '0100110111011011111010110',
  '0000101011000000011001111',
  '1011000101101000100010010',
  '0000011100111101010111100',
  '0001110111110000001110110',
  '1111101110101001111111100',
  '0000000010000010100010000',
  '1111111010100010101010000',
  '1000001001101001100011110',
  '1011101011011000111111100',
  '1011101000001111011100111',
  '1011101000111000011001010',
  '1000001001000011001111110',
  '1111111010111001010000111',
]

// Parchment with the code, a clean quiet zone of 4 modules, and the link.
function makeQrParchment() {
  const cell = 30,
    quiet = 4,
    size = xProfileQr.length + quiet * 2
  const canvas = document.createElement('canvas')
  canvas.width = size * cell
  canvas.height = (size + 5) * cell
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#f2e6c8'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const age = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    canvas.width * 0.35,
    canvas.width / 2,
    canvas.height / 2,
    canvas.height * 0.75,
  )
  age.addColorStop(0, 'rgba(150,110,60,0)')
  age.addColorStop(1, 'rgba(120,80,36,.22)')
  ctx.fillStyle = age
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  let seed = 7
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(99,69,34,${random() * 0.045})`
    ctx.fillRect(
      random() * canvas.width,
      random() * canvas.height,
      random() * 3 + 0.5,
      random() * 1.2 + 0.3,
    )
  }
  ctx.strokeStyle = 'rgba(110,84,50,.5)'
  ctx.lineWidth = 3
  ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24)
  ctx.fillStyle = '#20160c'
  xProfileQr.forEach((row, y) => {
    for (let x = 0; x < row.length; x++)
      if (row[x] === '1')
        ctx.fillRect((x + quiet) * cell, (y + quiet) * cell, cell, cell)
  })
  ctx.fillStyle = '#3a2815'
  ctx.font = 'bold 88px Georgia, serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('x.com/AlemTuzlak', canvas.width / 2, (size + 2.1) * cell)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

const island = { x: 4.9, z: -22.6, depth: 4.9 }
const riseEase = (p) => 1 + 2 * (p - 1) ** 3 + (p - 1) ** 2
// Height of the rising island: under the sea, a burst up, a small bob.
const riseY = (time) =>
  -island.depth * (1 - riseEase(MathUtils.clamp((time - 0.5) / 3, 0, 1)))

// Water runs off the board, the palm crown and the shore as each part leaves
// the sea. Each point drips twice.
function makeDrops() {
  let seed = 11
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const drops = []
  const add = (x, y, z) => {
    let emerge = 0
    while (emerge < 3.5 && y + riseY(emerge) < -0.2) emerge += 0.02
    for (let k = 0; k < 2; k++)
      drops.push({
        local: new Vector3(x, y, z),
        start: emerge + 0.05 + random() * 0.6 + k * (0.6 + random() * 0.7),
        velocity: new Vector3(
          (random() - 0.5) * 0.9,
          0.2 + random() * 0.7,
          (random() - 0.5) * 0.9,
        ),
        size: 0.016 + random() * 0.016,
      })
  }
  for (let i = 0; i < 14; i++) add(-1.9 + random() * 3.2, 0.72, 1.32)
  for (let i = 0; i < 8; i++) add(-1.95 + random() * 3.3, 4.5, 1.22)
  for (let i = 0; i < 8; i++) {
    const angle = random() * Math.PI * 2
    add(
      2 + Math.cos(angle) * 1.4,
      3.5 + random() * 0.6,
      -0.9 + Math.sin(angle) * 1.4,
    )
  }
  for (let i = 0; i < 14; i++) {
    const angle = random() * Math.PI * 2
    add(Math.cos(angle) * 3.2, 0.05, Math.sin(angle) * 2.5)
  }
  return drops
}

// On the last slide a treasure island rises out of the sea. Its notice board
// carries the QR code and faces the camera square on, so the code has no
// keystone. The parchment is unlit, as if the two lanterns light it.
// World renders it beside Shack, so the timber merge of the cabin never
// freezes its moving parts.
export function TreasureIsland() {
  const active = useTalk(
    (s) => s.slides[s.sceneIndex ?? s.index].id === 'thank-you',
  )
  const timber = useTimber()
  const outer = useRef(),
    rise = useRef(),
    drops = useRef(),
    ripple = useRef(),
    foam = useRef(),
    glass = useRef([])
  const qr = useMemo(makeQrParchment, [])
  const dropData = useMemo(makeDrops, [])
  const dome = useMemo(() => {
    const geometry = new SphereGeometry(
      1,
      72,
      18,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2,
    )
    const points = geometry.attributes.position
    const tints = []
    const damp = new Color('#8b7553'),
      dry = new Color('#d2bd90')
    for (let i = 0; i < points.count; i++) {
      const x = points.getX(i),
        y = points.getY(i),
        z = points.getZ(i)
      const angle = Math.atan2(z, x)
      const edge =
        1 + 0.05 * Math.sin(angle * 3 + 0.7) + 0.03 * Math.sin(angle * 7 + 2.1)
      const relief = 1 + 0.12 * Math.sin(angle * 2 + 0.4) * y
      points.setXYZ(i, x * edge * 3.4, y * 0.74 * relief, z * edge * 2.7)
      const tint = damp
        .clone()
        .lerp(dry, MathUtils.smoothstep(y, 0.12, 0.45))
        .multiplyScalar(
          0.93 +
            0.07 * Math.sin(x * 9.1 + z * 6.3) * Math.sin(z * 7.7 - x * 4.9),
        )
      tints.push(tint.r, tint.g, tint.b)
    }
    geometry.setAttribute('color', new Float32BufferAttribute(tints, 3))
    geometry.computeVertexNormals()
    return geometry
  }, [])
  const sand = useMemo(
    () => new MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    [],
  )
  useEffect(
    () => () => {
      qr.dispose()
      dome.dispose()
      sand.dispose()
    },
    [qr, dome, sand],
  )
  const rippleFade = useMemo(() => ({ fade: { value: 0 } }), [])
  const dummy = useMemo(() => new Object3D(), [])
  const dryTint = useMemo(() => new Color('#ffffff'), []),
    wetTint = useMemo(() => new Color('#a08b72'), [])
  const state = useRef({ phase: 'hidden', time: 0, sink: 0, from: 0 })
  useFrame((_, delta) => {
    const s = state.current
    const dt = Math.min(delta, 0.05)
    if (active) {
      if (s.phase === 'hidden' || s.phase === 'sinking') s.phase = 'waiting'
      if (s.phase === 'waiting') {
        // Rise while the camera finishes its flight out of the window.
        const motion = useTalk.getState().cameraMotion
        if (!motion || motion.done || motion.elapsed > motion.total * 0.6) {
          s.phase = 'rising'
          s.time = 0
        }
      } else s.time += dt
    } else if (s.phase === 'rising') {
      s.phase = reducedMotion ? 'hidden' : 'sinking'
      s.sink = 0
      s.from = rise.current.position.y
    } else if (s.phase === 'waiting') s.phase = 'hidden'
    if (s.phase === 'sinking') {
      s.sink += dt
      if (s.sink >= 1) s.phase = 'hidden'
    }
    const shown = s.phase === 'rising' || s.phase === 'sinking'
    outer.current.visible = shown
    if (!shown) return
    const t = reducedMotion ? 30 : s.time
    const sinking = s.phase === 'sinking'
    rise.current.position.y = sinking
      ? s.from - island.depth * MathUtils.smoothstep(s.sink, 0, 1)
      : riseY(t)
    const settle = 1 - MathUtils.smoothstep(t, 0.5, 3.5)
    rise.current.rotation.z = 0.05 * settle * Math.sin(t * 3.1)
    rise.current.rotation.x = 0.03 * settle * Math.sin(t * 2.3 + 1)
    const wetness = sinking ? 1 : 1 - MathUtils.smoothstep(t, 3.5, 10)
    sand.color.copy(dryTint).lerp(wetTint, wetness)
    sand.roughness = 1 - 0.5 * wetness
    const flicker = reducedMotion
      ? 1
      : 0.93 + 0.07 * Math.sin(t * 11.3) * Math.sin(t * 6.7)
    const glow = MathUtils.smoothstep(t, 3, 3.6) * flicker
    glass.current.forEach((mesh) => {
      if (mesh) mesh.material.emissiveIntensity = 3.4 * glow
    })
    const foamSize =
      MathUtils.lerp(0.35, 1, MathUtils.smoothstep(t, 0, 1.8)) *
      (sinking ? 1 - MathUtils.smoothstep(s.sink, 0.3, 1) : 1)
    foam.current.scale.set(foamSize, 1, foamSize * 0.8)
    const wave = MathUtils.clamp((t - 1.3) / 2.6, 0, 1)
    ripple.current.visible = !reducedMotion && !sinking && wave > 0 && wave < 1
    ripple.current.scale.set(3.4 + wave * 9, (3.4 + wave * 9) * 0.85, 1)
    rippleFade.fade.value = 0.3 * (1 - wave) ** 2
    dropData.forEach((drop, index) => {
      const age = t - drop.start
      let visible = !reducedMotion && !sinking && age > 0
      if (visible) {
        dummy.position.set(
          island.x + drop.local.x + drop.velocity.x * age,
          drop.local.y +
            riseY(drop.start) +
            drop.velocity.y * age -
            4.9 * age * age,
          island.z + drop.local.z + drop.velocity.z * age,
        )
        visible = dummy.position.y > -0.26
      }
      dummy.scale.setScalar(visible ? drop.size : 0)
      dummy.updateMatrix()
      drops.current.setMatrixAt(index, dummy.matrix)
    })
    drops.current.instanceMatrix.needsUpdate = true
  })
  return (
    <group ref={outer} visible={false}>
      <group ref={rise} position={[island.x, -island.depth, island.z]}>
        <mesh
          geometry={dome}
          material={sand}
          position={[0, -0.38, 0]}
          receiveShadow
        />
        <mesh position={[1.5, -0.12, -0.8]} scale={[1.6, 0.5, 1.15]}>
          <sphereGeometry args={[1, 24, 12]} />
          <meshStandardMaterial color="#5e7353" roughness={1} />
        </mesh>
        {[
          [-3.05, -0.18, 0.75, 0.36],
          [2.95, -0.2, 1.15, 0.28],
          [-1.15, -0.22, 2.5, 0.22],
          [3.25, -0.14, -0.95, 0.42],
          [0.9, -0.2, 2.6, 0.18],
        ].map(([x, y, z, size], index) => (
          <mesh
            key={index}
            position={[x, y, z]}
            scale={[size, size * 0.75, size]}
            rotation={[index, index * 1.7, 0]}
          >
            <icosahedronGeometry args={[1, 1]} />
            <meshStandardMaterial color="#6d675a" roughness={1} flatShading />
          </mesh>
        ))}
        <OutsidePalm
          position={[1.9, 0.18, -0.75]}
          scale={0.92}
          rotation={0}
          phase={1.3}
        />
        <OutsidePalm
          position={[-1.6, 0.12, -1.3]}
          scale={0.62}
          rotation={Math.PI}
          phase={2.6}
        />
        <group
          position={[-1.6, 0.2, 0.95]}
          rotation={[0, 0.55, 0]}
          scale={0.72}
        >
          <group position={[-2.5, -0.0875, 2.1]}>
            <TreasureChest material={timber} />
          </group>
        </group>
        {Array.from({ length: 7 }, (_, index) => (
          <mesh
            key={index}
            position={[
              -0.95 + (index % 4) * 0.17,
              0.225 + (index % 3) * 0.004,
              1.45 + Math.floor(index / 4) * 0.16 + (index % 2) * 0.05,
            ]}
            rotation={[
              0.18 * (index % 3),
              index * 0.9,
              0.22 * ((index + 1) % 2),
            ]}
          >
            <cylinderGeometry args={[0.065, 0.065, 0.014, 20]} />
            <meshStandardMaterial
              color={index % 2 ? '#c9a253' : '#b48d45'}
              metalness={0.8}
              roughness={0.38}
            />
          </mesh>
        ))}
        {/* X marks the spot. */}
        <group position={[-0.3, 0.2, 1.98]} rotation={[-0.62, 0, 0]}>
          {[-1, 1].map((side) => (
            <mesh key={side} rotation={[0, (side * Math.PI) / 4, 0]}>
              <boxGeometry args={[1.25, 0.03, 0.17]} />
              <meshStandardMaterial color="#a8321c" roughness={0.9} />
            </mesh>
          ))}
        </group>
        <group position={[-0.3, 0.7, 1.2]}>
          {[-1.15, 1.15].map((x) => (
            <Timber
              key={x}
              material={timber}
              position={[x, 1.45, -0.13]}
              args={[0.17, 4.6, 0.17]}
              color="#6b5236"
            />
          ))}
          <Timber
            material={timber}
            position={[0, 1.815, 0]}
            args={[3.19, 3.63, 0.08]}
            color="#5d4630"
          />
          {[
            [0, 3.565, 3.19, 0.13],
            [0, 0.065, 3.19, 0.13],
            [-1.53, 1.815, 0.13, 3.37],
            [1.53, 1.815, 0.13, 3.37],
          ].map(([x, y, width, height]) => (
            <Timber
              key={`${x}${y}`}
              material={timber}
              position={[x, y, 0.07]}
              args={[width, height, 0.1]}
              color="#7a5d3d"
            />
          ))}
          <Timber
            material={timber}
            position={[0, 3.8, -0.02]}
            args={[3.75, 0.17, 0.26]}
            color="#6b5236"
          />
          <mesh position={[0, 1.815, 0.046]}>
            <planeGeometry args={[2.927, 3.371]} />
            <meshBasicMaterial map={qr} color="#f6dfbd" toneMapped={false} />
          </mesh>
          {[
            [-1.53, 0.065],
            [1.53, 0.065],
            [-1.53, 3.565],
            [1.53, 3.565],
          ].map(([x, y]) => (
            <mesh
              key={`${x}${y}`}
              position={[x, y, 0.125]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.05, 0.05, 0.02, 12]} />
              <meshStandardMaterial {...brass} />
            </mesh>
          ))}
          {[-1.72, 1.72].map((x, index) => (
            <group key={x} position={[x, 3.72, 0.02]}>
              <mesh position={[0, -0.12, 0]}>
                <cylinderGeometry args={[0.012, 0.012, 0.24, 6]} />
                <meshStandardMaterial color="#3a3128" roughness={0.8} />
              </mesh>
              <mesh position={[0, -0.27, 0]}>
                <cylinderGeometry args={[0.07, 0.1, 0.06, 12]} />
                <meshStandardMaterial {...brass} />
              </mesh>
              <mesh
                ref={(node) => {
                  glass.current[index] = node
                }}
                position={[0, -0.41, 0]}
              >
                <cylinderGeometry args={[0.075, 0.075, 0.22, 12]} />
                <meshStandardMaterial
                  color="#ffdca0"
                  emissive="#ffae55"
                  emissiveIntensity={0}
                  roughness={0.3}
                />
              </mesh>
              <mesh position={[0, -0.54, 0]}>
                <cylinderGeometry args={[0.095, 0.08, 0.05, 12]} />
                <meshStandardMaterial {...brass} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
      <group position={[island.x, -0.24, island.z]}>
        <group ref={foam}>
          <FoamRing
            position={[0, 0, 0]}
            radius={3.35}
            width={0.55}
            seed={4}
            color="#ffe4cc"
          />
        </group>
        <mesh ref={ripple} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <ringGeometry args={[0.8, 1, 96, 1]} />
          <shaderMaterial
            transparent
            depthWrite={false}
            uniforms={rippleFade}
            vertexShader={`
              varying vec2 vRing;
              void main() {
                vRing = position.xy;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `}
            fragmentShader={`
              uniform float fade;
              varying vec2 vRing;
              void main() {
                float r = length(vRing);
                float band = smoothstep(0.8, 0.94, r);
                band *= 1.0 - smoothstep(0.95, 1.0, r);
                gl_FragColor = vec4(1.0, 0.86, 0.7, band * fade);
              }
            `}
          />
        </mesh>
      </group>
      <instancedMesh
        ref={drops}
        args={[undefined, undefined, dropData.length]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 6, 4]} />
        <meshBasicMaterial color="#ffe2c0" transparent opacity={0.75} />
      </instancedMesh>
    </group>
  )
}

function useMergedTimber(root, material) {
  const [merged, setMerged] = useState(null)
  const shared = useMemo(() => {
    const wood = new MeshStandardMaterial({
      ...material,
      vertexColors: true,
      roughness: 1,
    })
    wood.onBeforeCompile = shadeCabinWood
    return wood
  }, [material])
  useEffect(() => () => shared.dispose(), [shared])
  useLayoutEffect(() => {
    const group = root.current
    group.updateMatrixWorld(true)
    const toRoot = new Matrix4().copy(group.matrixWorld).invert()
    const parts = [],
      sources = []
    group.traverse((object) => {
      if (!object.userData.timber) return
      const part = object.geometry.clone()
      part.applyMatrix4(
        new Matrix4().multiplyMatrices(toRoot, object.matrixWorld),
      )
      const { r, g, b } = object.material.color
      const tints = new Float32Array(part.attributes.position.count * 3)
      for (let i = 0; i < tints.length; i += 3) tints.set([r, g, b], i)
      part.setAttribute('color', new Float32BufferAttribute(tints, 3))
      parts.push(part)
      sources.push(object)
    })
    if (!parts.length) return undefined
    const geometry = mergeGeometries(parts)
    parts.forEach((part) => part.dispose())
    sources.forEach((object) => (object.visible = false))
    setMerged(geometry)
    return () => {
      sources.forEach((object) => (object.visible = true))
      geometry.dispose()
    }
  }, [root])
  return merged ? (
    <mesh geometry={merged} material={shared} castShadow receiveShadow />
  ) : null
}

export function Shack() {
  const id = useTalk((s) => s.slides[s.sceneIndex ?? s.index].id)
  const material = useTimber()
  const root = useRef()
  const mergedTimber = useMergedTimber(root, material)
  const coinMark = useLoader(
    TextureLoader,
    './logos/tanstack-emblem-charcoal-256.png',
  )
  useMemo(() => {
    coinMark.colorSpace = SRGBColorSpace
  }, [coinMark])
  const thanksText = useRef()
  const net = useMemo(() => {
    const vertices = []
    const point = (u, v) => [
      -3.34 + u * 0.47,
      1.25 + v * 1.19 - Math.sin(u * Math.PI) * 0.08,
      -3.045 + Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.09,
    ]
    for (let row = 0; row <= 10; row++)
      for (let column = 0; column <= 5; column++) {
        const u = column / 5,
          v = row / 10
        if (row < 10 && column < 5) {
          vertices.push(...point(u, v), ...point(u + 0.2, v + 0.1))
          vertices.push(...point(u + 0.2, v), ...point(u, v + 0.1))
        }
      }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
    return geometry
  }, [])
  useEffect(() => () => net.dispose(), [net])
  useFrame(({ camera }) => {
    if (!thanksText.current) return
    const t = Math.max(0, Math.min(1, (-camera.position.z - 3.3) / 2.7))
    thanksText.current.children.forEach((child) => {
      child.material.opacity = t * t * (3 - 2 * t)
    })
  })
  const floatingTitle = id === 'title' || id === 'close'
  const planks = ['#b59c7e', '#c0aa89', '#a48c71', '#baa384', '#ae9376']
  return (
    <group
      ref={root}
      visible={floatingTitle || id === 'the-map' || id === 'thank-you'}
    >
      {mergedTimber}
      <SunsetOcean />
      <lineSegments geometry={net}>
        <lineBasicMaterial color="#d0bc8b" transparent opacity={0.85} />
      </lineSegments>
      {[-3.31, -2.9].map((x) => (
        <mesh key={`float${x}`} position={[x, 2.43, -3.025]}>
          <sphereGeometry args={[0.038, 10, 8]} />
          <meshStandardMaterial color="#c49e68" roughness={0.9} />
        </mesh>
      ))}
      <Timber
        material={material}
        position={[0, -0.03, 0]}
        args={[7.2, 0.12, 6.4]}
        color="#4f4739"
      />
      {Array.from({ length: 21 }, (_, i) => (
        <Timber
          key={i}
          material={material}
          position={[-3.4 + i * 0.34, 0.05, 0]}
          args={[0.326, 0.08, 6.4]}
          color={planks[i % 5]}
        />
      ))}
      {[-1, 1].map((side) => (
        <group key={side}>
          {Array.from({ length: 18 }, (_, i) => (
            <Timber
              key={i}
              material={material}
              position={[side * 3.47, 1.59, -3.05 + i * 0.35]}
              args={[0.13, 3.12, 0.336]}
              color={planks[(i + 2) % 5]}
            />
          ))}
          {[-2.8, -0.1, 2.6].map((z) => (
            <Timber
              key={z}
              material={material}
              position={[side * 3.31, 1.49, z]}
              args={[0.2, 3, 0.23]}
              color="#8d785c"
            />
          ))}
          <Timber
            material={material}
            position={[side * 3.28, 0.26, 0]}
            args={[0.16, 0.18, 6.3]}
            color="#7d684e"
          />
        </group>
      ))}
      {Array.from({ length: 22 }, (_, i) => {
        const x = -3.45 + i * 0.33
        return (
          <group key={i}>
            <Timber
              material={material}
              position={[x, 0.43, -3.15]}
              args={[0.318, 0.85, 0.15]}
              color={planks[i % 5]}
            />
            <Timber
              material={material}
              position={[x, 2.98, -3.15]}
              args={[0.318, 0.64, 0.15]}
              color={planks[i % 5]}
            />
            {Math.abs(x) > 2.7 ? (
              <Timber
                material={material}
                position={[x, 1.78, -3.15]}
                args={[0.318, 1.85, 0.15]}
                color={planks[i % 5]}
              />
            ) : null}
          </group>
        )
      })}
      {[-2.77, 2.77].map((x) => (
        <group key={x}>
          <Timber
            material={material}
            position={[x, 1.77, -3.0]}
            args={[0.22, 2, 0.3]}
            color="#886d50"
          />
          {[1, 2.48].map((y) => (
            <group key={y}>
              <mesh position={[x, y, -2.83]}>
                <boxGeometry args={[0.25, 0.12, 0.014]} />
                <meshStandardMaterial
                  color="#534a3c"
                  metalness={0.65}
                  roughness={0.7}
                />
              </mesh>
              <Nail position={[x - 0.065, y, -2.81]} />
              <Nail position={[x + 0.065, y, -2.81]} />
            </group>
          ))}
        </group>
      ))}
      <Timber
        material={material}
        position={[0, 0.89, -3]}
        args={[5.75, 0.16, 0.47]}
        color="#b29873"
      />
      <Timber
        material={material}
        position={[0, 2.72, -3]}
        args={[5.75, 0.2, 0.29]}
        color="#8f7557"
      />
      {[-2.35, 2.35].map((x) => (
        <group key={`strap${x}`}>
          <mesh position={[x, 2.72, -2.848]}>
            <boxGeometry args={[0.12, 0.19, 0.008]} />
            <meshStandardMaterial
              color="#615846"
              metalness={0.68}
              roughness={0.72}
            />
          </mesh>
          {[2.66, 2.78].map((y) => (
            <Nail key={y} position={[x, y, -2.833]} />
          ))}
        </group>
      ))}
      <Timber
        material={material}
        position={[0, 3.18, 0]}
        args={[7.25, 0.14, 6.5]}
        color="#78654d"
      />
      {[-2.75, -1.35, 0.05, 1.45, 2.85].map((z) => (
        <Timber
          key={z}
          material={material}
          position={[0, 2.98, z]}
          args={[7.2, 0.22, 0.2]}
          color="#9a8061"
        />
      ))}
      {[-3.2, 3.2].map((x) => (
        <Timber
          key={x}
          material={material}
          position={[x, 2.71, -2.3]}
          rotation={[Math.PI / 4, 0, 0]}
          args={[0.18, 0.95, 0.18]}
          color="#886d50"
        />
      ))}
      {Array.from({ length: 7 }, (_, i) => (
        <Timber
          key={i}
          material={material}
          position={[0, 0.79, -1.83 + i * 0.225]}
          args={[2.75, 0.09, 0.215]}
          color={planks[(i + 1) % 5]}
        />
      ))}
      {[-1.04, 1.04].map((x) => (
        <group key={x}>
          {[-1.62, -0.63].map((z) => (
            <Timber
              key={z}
              material={material}
              position={[x, 0.4, z]}
              rotation={[0, 0, x > 0 ? -0.1 : 0.1]}
              args={[0.14, 0.76, 0.14]}
              color="#8b7152"
            />
          ))}
          <Timber
            material={material}
            position={[x, 0.18, -1.13]}
            args={[0.17, 0.12, 1.25]}
            color="#8b7152"
          />
          <Timber
            material={material}
            position={[x, 0.68, -1.13]}
            args={[0.16, 0.16, 1.42]}
            color="#8b7152"
          />
        </group>
      ))}
      <Timber
        material={material}
        position={[0, 0.28, -1.15]}
        args={[2.25, 0.12, 0.14]}
        color="#8b7152"
      />
      <TreasureMap raised={id === 'the-map'} />
      <TableCompass />
      <Lantern />
      <Inkwell />
      <Rug />
      <ShipWheel material={material} />
      <HangingLamp />
      <BottleShip />
      <DustMotes />
      <SunsetBirds />
      <group position={[-0.86, 0.964, -0.53]} rotation={[0, 0.2, Math.PI / 2]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.062, 0.075, 0.43, 24]} />
          <meshStandardMaterial
            color="#ad8950"
            metalness={0.68}
            roughness={0.46}
          />
        </mesh>
        <mesh position={[0, 0.21, 0]}>
          <cylinderGeometry args={[0.048, 0.06, 0.12, 24]} />
          <meshStandardMaterial color="#6b5540" roughness={0.87} />
        </mesh>
        {[-0.2, 0.14, 0.26].map((y) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[y === 0.26 ? 0.048 : 0.071, 0.009, 8, 24]} />
            <meshStandardMaterial
              color="#cbb782"
              metalness={0.75}
              roughness={0.35}
            />
          </mesh>
        ))}
        <mesh position={[0, 0.274, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.008, 24]} />
          <meshStandardMaterial
            color="#284b4f"
            metalness={0.25}
            roughness={0.2}
          />
        </mesh>
      </group>
      {Array.from({ length: 6 }, (_, i) => (
        <group
          key={`coin${i}`}
          position={[
            0.74 + (i % 3) * 0.072,
            0.85 + Math.floor(i / 3) * 0.012,
            -0.48 + (i % 2) * 0.06,
          ]}
          rotation={[0, i * 0.8, 0.035]}
        >
          <mesh castShadow>
            <cylinderGeometry args={[0.044, 0.044, 0.008, 32]} />
            <meshStandardMaterial
              color={i % 2 ? '#c4a45e' : '#ac8848'}
              metalness={0.78}
              roughness={0.43}
            />
          </mesh>
          <mesh position={[0, 0.0046, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry
              args={[
                (0.055 * coinMark.image.width) / coinMark.image.height,
                0.055,
              ]}
            />
            <meshBasicMaterial
              map={coinMark}
              transparent
              toneMapped={false}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}
      <TreasureChest material={material} />
      <BeachChair material={material} />
      <group position={[1.05, 0.89, -1.65]} rotation={[0, 0.15, Math.PI / 2]}>
        <mesh>
          <cylinderGeometry args={[0.047, 0.05, 0.4, 24]} />
          <meshStandardMaterial color="#d8cba6" roughness={1} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.051, 0.051, 0.018, 24]} />
          <meshStandardMaterial color="#8b6944" roughness={1} />
        </mesh>
      </group>
      {floatingTitle ? (
        <Surface
          position={[0, 1.75, -2.9]}
          scale={[2.4, 2.4, 1]}
          appearance="floating"
        />
      ) : null}
      {id === 'close' ? <CloseLogo /> : null}
      {id === 'thank-you' ? (
        <group ref={thanksText}>
          <Label text="Thank you" position={[0, 5, -28]} scale={[7, 1.75, 1]} />
          <Label
            text="Alem Tuzlak"
            position={[0, 3.7, -28]}
            scale={[3.2, 0.8, 1]}
          />
        </group>
      ) : null}
    </group>
  )
}
