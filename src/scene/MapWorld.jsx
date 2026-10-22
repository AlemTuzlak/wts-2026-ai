import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { colors, islands, MAP_Y } from './layout.js'
import { Surface } from './Surface.jsx'
import { Label } from './Label.jsx'
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

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    wood.dispose()
    woodNormal.dispose()
    grain.dispose()
  })
}

function Timber({ position, scale, rotation, color = '#92704b' }) {
  return (
    <mesh
      position={position}
      scale={scale}
      rotation={rotation}
      castShadow
      receiveShadow
    >
      <boxGeometry />
      <meshStandardMaterial
        color={color}
        map={wood}
        normalMap={woodNormal}
        normalScale={[0.3, 0.3]}
        roughness={0.88}
      />
    </mesh>
  )
}

function Shore({ radius, height, seed, color }) {
  const geometry = useMemo(() => {
    const vertices = [],
      indices = [],
      uv = [],
      segments = 72
    const rings = [
      [0.02, height],
      [0.52, height * 0.94],
      [0.83, height * 0.65],
      [1, -0.08],
    ]
    rings.forEach(([r, y]) => {
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2
        const edge =
          1 +
          0.095 * Math.sin(a * 3 + seed) +
          0.07 * Math.cos(a * 7 - seed) +
          0.035 * Math.sin(a * 13)
        const x = Math.cos(a) * radius * r * edge,
          z = Math.sin(a) * radius * r * edge * 0.82
        vertices.push(x, y + Math.sin(a * 8 + seed) * 0.055 * r, z)
        uv.push(x / 4, z / 4)
      }
    })
    for (let r = 0; r < 3; r++)
      for (let i = 0; i < segments; i++) {
        const a = r * (segments + 1) + i,
          b = a + segments + 1
        indices.push(a, a + 1, b, a + 1, b + 1, b)
      }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(indices)
    g.computeVertexNormals()
    return g
  }, [radius, height, seed])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} receiveShadow castShadow>
      <meshStandardMaterial
        color={color}
        map={grain}
        roughness={0.94}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function Palm({ position, rotation = 0, scale = 1 }) {
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
          {Array.from({ length: 7 }, (_, j) => (
            <mesh
              key={j}
              position={curve.getPoint((j + 1) / 8)}
              rotation={[0.7, (i * Math.PI) / 4, 0.35]}
              scale={[0.13, 0.045, 0.38 - j * 0.029]}
              castShadow
            >
              <sphereGeometry args={[1, 6, 4]} />
              <meshStandardMaterial color={i % 2 ? '#777653' : '#5c6042'} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

function Dock({ position }) {
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
            0.55 + i * 0.55,
            1.65 + i * 0.55,
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
                >
                  <boxGeometry args={[1.85, 0.065, 2.6]} />
                  <meshStandardMaterial
                    color={s < 0 ? '#d8c796' : '#bba875'}
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

function Landmark({ kind }) {
  if (kind === 'server')
    return (
      <group position={[0.1, 0.8, -0.25]}>
        <mesh position={[0, 1.6, 0]} castShadow>
          <cylinderGeometry args={[0.48, 0.75, 3.2, 24]} />
          <meshStandardMaterial color="#e7ddbc" map={grain} />
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
            color="#e9cd92"
            metalness={0.4}
            roughness={0.25}
          />
        </mesh>
        <mesh position={[0, 3.82, 0]} castShadow>
          <coneGeometry args={[0.82, 0.55, 24]} />
          <meshStandardMaterial color={colors.terracotta} />
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
            color="#995632"
            map={grain}
            metalness={0.1}
            roughness={0.86}
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
        <Timber
          key={s}
          position={[s * 0.58, 1.54, 0]}
          scale={[1.28, 0.12, 1.65]}
          rotation={[0, 0, -s * 0.55]}
          color={kind === 'mcp' ? '#786344' : colors.terracotta}
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
      {kind === 'mcp' &&
        [-1, 0, 1].map((x) => (
          <Timber
            key={x}
            position={[x * 0.5, 0.2, 1]}
            scale={[0.36, 0.4, 0.4]}
            color="#a08053"
          />
        ))}
    </group>
  )
}

function Island({ position, label, visible, kind, labelPosition }) {
  const seed = { browser: 1, server: 3, provider: 6, mcp: 9 }[kind]
  return (
    <group position={position}>
      <Shore radius={3.3} height={0.24} seed={seed} color="#decda4" />
      <Shore radius={2.72} height={0.78} seed={seed} color="#827858" />
      <Shore radius={2.3} height={0.89} seed={seed} color="#a49b70" />
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
            position={[Math.cos(a) * 2.6, 0.22, Math.sin(a) * 2.1]}
            scale={[0.45 + (i % 3) * 0.1, 0.28, 0.32]}
            rotation={[i, i * 0.3, i * 0.7]}
            castShadow
          >
            <icosahedronGeometry args={[1, 1]} />
            <meshStandardMaterial
              color={i % 2 ? '#82765c' : '#b1a184'}
              roughness={1}
            />
          </mesh>
        )
      })}
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

function Ocean({ mcp, mcpReveal }) {
  const material = useRef()
  const uniforms = useMemo(
    () => ({
      time: { value: 0 },
      mcp: { value: 0 },
      mcpExtra: { value: new THREE.Vector2() },
    }),
    [],
  )
  useFrame(({ clock }, dt) => {
    if (material.current) {
      material.current.uniforms.time.value = clock.elapsedTime
      material.current.uniforms.mcp.value = mcpReveal
        ? mcpReveal.current[0]
        : THREE.MathUtils.damp(
            material.current.uniforms.mcp.value,
            mcp ? 1 : 0,
            1.2,
            dt,
          )
      material.current.uniforms.mcpExtra.value.set(
        mcpReveal?.current[1] || 0,
        mcpReveal?.current[2] || 0,
      )
    }
  })
  return (
    <mesh position={[0, MAP_Y - 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[1000, 1000, 220, 220]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={`
      uniform float time; varying vec3 vWorld;
      void main() { vec3 p=position; p.z=sin(p.x*.8+time*.7)*.075+sin(p.y*1.3-time*.55)*.045;
        vec4 world=modelMatrix*vec4(p,1.); vWorld=world.xyz; gl_Position=projectionMatrix*viewMatrix*world; }
    `}
        fragmentShader={`
      uniform float time; uniform float mcp; uniform vec2 mcpExtra; varying vec3 vWorld;
      float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p) { vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y); }
      float wave(vec2 p) {
        float swell=noise(p*.22+vec2(time*.025,0.))*4.;
        return sin(p.x*1.6+p.y*.7+time*.8+swell)*.38
          +sin(p.y*2.7-p.x*.6-time*.65+noise(p*.35)*3.)*.2
          +sin(p.x*6.+p.y*3.+time+noise(p*.8)*5.)*.07
          +(noise(p*7.+time*.1)-.5)*.04;
      }
      void main() { vec2 p=vWorld.xz; float w=wave(p); float dx=(wave(p+vec2(.04,0.))-w)/.04; float dz=(wave(p+vec2(0.,.04))-w)/.04;
        vec3 n=normalize(vec3(-dx*.35,1.,-dz*.35)); vec3 viewDir=normalize(cameraPosition-vWorld); vec3 sun=normalize(vec3(-.3,.88,.38));
        float reflection=max(dot(reflect(-sun,n),viewDir),0.); float fres=pow(1.-max(dot(viewDir,n),0.),3.);
        vec3 col=mix(vec3(.018,.105,.205),vec3(.055,.32,.48),.42+w*.4+fres*.3);
        col+=pow(reflection,120.)*.7+pow(reflection,20.)*.12; float foam=0.; float shallow=0.;
        vec2 c[3]; c[0]=vec2(-10.,7.); c[1]=vec2(0.,-7.); c[2]=vec2(10.,7.);
        for(int i=0;i<3;i++){ vec2 q=p-c[i]; float d=length(q*vec2(1.,1.2)); float edge=3.35+sin(atan(q.y,q.x)*7.)*.16; foam+=exp(-pow((d-edge-w*.15)*5.,2.))*.65; shallow+=exp(-max(d-3.,0.)*.7)*.08; }
        col+=vec3(shallow*.22,shallow*.82,shallow);
        float mcpDistance=length((p-vec2(0.,-20.))*vec2(1.,1.2));
        foam+=exp(-pow((mcpDistance-3.4-w*.15)*5.,2.))*.65*mcp;
        float referenceDistance=length((p-vec2(-10.,-18.))*vec2(1.,1.2));
        float catalogDistance=length((p-vec2(10.,-18.))*vec2(1.,1.2));
        foam+=exp(-pow((referenceDistance-3.4-w*.15)*5.,2.))*.65*mcpExtra.x;
        foam+=exp(-pow((catalogDistance-3.4-w*.15)*5.,2.))*.65*mcpExtra.y;
        col=mix(col,vec3(.88,.95,.97),clamp(foam+smoothstep(.58,.67,w)*noise(p*.8)*.1,0.,.65));
        float fog=1.-exp(-max(length(cameraPosition-vWorld)-30.,0.)*.007); col=mix(col,vec3(.35,.56,.7),fog);
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `}
      />
    </mesh>
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

function Boat({ cargo }) {
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
    <group scale={0.82}>
      {cargo && <Cargo text={cargo} />}
      <mesh geometry={hull} castShadow>
        <meshStandardMaterial color={colors.terracotta} roughness={0.43} />
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
      <mesh position={[0, 0.02, -1.55]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.1, 1.2]} />
        <meshBasicMaterial
          color="#f5f0d6"
          transparent
          opacity={0.17}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

function PirateShip() {
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
        y,
        0.23 * Math.cos(x * 1.4) * Math.cos(y * 1.5),
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
    }
    vertices.push(0, 3.7, -0.8, 0, 0.65, -1.8, 0, 3.7, 0.65, 0, 0.65, 2.45)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    return geo
  }, [])
  useEffect(
    () => () => {
      hull.dispose()
      sail.dispose()
      ropes.dispose()
    },
    [hull, sail, ropes],
  )
  return (
    <group>
      <mesh geometry={hull} castShadow>
        <meshStandardMaterial color="#64513d" map={wood} roughness={0.85} />
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
            <group key={y}>
              <Timber
                position={[0, y + 0.63, z]}
                scale={[j === 0 ? 2 : 1.65, 0.06, 0.06]}
                color="#5f4b36"
              />
              <mesh
                geometry={sail}
                position={[0, y, z + 0.07]}
                scale={j === 0 ? [1, 1, 1] : [0.8, 0.75, 1]}
                castShadow
              >
                <meshStandardMaterial
                  color={i ? '#e1dfc9' : '#d5d1b7'}
                  roughness={1}
                  side={THREE.DoubleSide}
                />
              </mesh>
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
        </group>
      ))}
      <lineSegments geometry={ropes}>
        <lineBasicMaterial color="#5e655f" transparent opacity={0.72} />
      </lineSegments>
      <Timber
        position={[0, 0.7, 1.99]}
        rotation={[0.12, 0, 0]}
        scale={[0.07, 0.07, 1.3]}
        color="#826c4e"
      />
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
    const t = Math.max(0, elapsed.current - 0.5)
    const x =
      t < 2.8
        ? THREE.MathUtils.lerp(25, 65, 1 - Math.pow(1 - t / 2.8, 3))
        : 65 + Math.min((t - 2.8) / 22, 1) * 40
    ship.current.position.set(reduced ? 65 : x, MAP_Y + 0.15, 8)
    ship.current.rotation.set(
      0,
      Math.PI / 2,
      reduced ? 0 : Math.sin(t * 0.7) * 0.012,
    )
  })
  return (
    <group ref={ship} position={[25, MAP_Y + 0.15, 8]} scale={4.2}>
      <PirateShip />
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
        (approval ? approval.current.waiting : raised) ? -Math.PI / 2 : 0,
        3,
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
          : THREE.MathUtils.smoothstep(elapsed.current, delay, delay + 1.8)
      ref.current.visible = t > 0
      ref.current.position.y = MAP_Y - (1 - t) * 5
      reveal.current[slot] = THREE.MathUtils.smoothstep(t, 0.85, 1)
      if (routeRef.current) routeRef.current.visible = t >= 1
    } else
      ref.current.position.y = THREE.MathUtils.damp(
        ref.current.position.y,
        MAP_Y,
        1.25,
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
  legs,
  work,
  approval,
}) {
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
  const [leg, setLeg] = useState(() => (legs && reduced ? legs.length - 1 : 0))
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
    if (!legs || !motion || motion.done) elapsed.current += Math.min(dt, 0.05)
    const progress = loop
      ? (elapsed.current * 0.12 + start) % 1
      : THREE.MathUtils.clamp((elapsed.current - delay) / 4.8, 0, 1)
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
      const time = reduced ? Infinity : Math.max(0, elapsed.current - 0.5)
      let nextLeg = 0,
        legStart = 0
      while (
        nextLeg < legs.length - 1 &&
        time >= legStart + 4.8 + (legs[nextLeg].holdAfter ?? 0.6)
      ) {
        legStart += 4.8 + (legs[nextLeg].holdAfter ?? 0.6)
        nextLeg++
      }
      if (nextLeg !== leg) setLeg(nextLeg)
      phaseIndex = nextLeg
      path = legs[nextLeg].curve
      backwards = legs[nextLeg].reverse
      t = THREE.MathUtils.smoothstep(time - legStart, 0, 4.8)
      if (approval) {
        const atBrowser = legs[nextLeg].approvalWait && time - legStart >= 4.8
        const waiting = Boolean(atBrowser && time - legStart < 7.8)
        approval.current = { waiting, approved: Boolean(atBrowser && !waiting) }
      }
      if (work) {
        let cursor = 0
        for (const stage of legs) {
          if (stage.work)
            work.current = {
              site: stage.work,
              progress: THREE.MathUtils.clamp(
                (time - cursor - 4.8) / (stage.holdAfter ?? 0.6),
                0,
                1,
              ),
            }
          cursor += 4.8 + (stage.holdAfter ?? 0.6)
        }
      }
    }
    if (pauseAt !== undefined) {
      const time = elapsed.current
      t =
        time < 2
          ? pauseAt * THREE.MathUtils.smoothstep(time, 0, 2)
          : time < 4
            ? pauseAt
            : THREE.MathUtils.lerp(
                pauseAt,
                1,
                THREE.MathUtils.smoothstep(time, 4, 8),
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
          <line geometry={leader}>
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
      ].includes(slide.id)
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
        state.duration = 0.45
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
      const t = 1 - Math.pow(1 - Math.min(1, state.elapsed / 0.4), 3)
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
          0.3,
          (motion?.total || 2.6) - (motion?.elapsed || 0),
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
    offset.multiplyScalar(-20 / offset.z)
    const viewHeight =
      2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 20
    ref.current.scale.setScalar(
      (viewHeight * camera.aspect * 0.5 * 0.92) / 1.78,
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
    const phase = Math.min(4, Math.floor(lifecycleElapsed.current / 2.4))
    lifecycleLights.current.forEach((light, index) => {
      if (!light) return
      light.material.emissiveIntensity =
        reducedLifecycle || index === phase ? 1.6 : 0
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
  const approval = useRef({ waiting: false, approved: false }),
    approvalWaiting = useRef(),
    approvalConfirmed = useRef()
  useEffect(() => {
    approval.current = { waiting: false, approved: false }
  }, [id])
  useFrame(() => {
    if (approvalWaiting.current)
      approvalWaiting.current.visible = approval.current.waiting
    if (approvalConfirmed.current)
      approvalConfirmed.current.visible = approval.current.approved
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
        holdAfter: 3.2,
      },
      {
        curve: routes.sp,
        reverse: false,
        cargo: 'TOOL RESULT',
        holdAfter: 1.2,
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
        holdAfter: 3.2,
      },
      { curve: routes.bs, reverse: false, cargo: 'TOOL RESULT' },
      {
        curve: routes.sp,
        reverse: false,
        cargo: 'TOOL RESULT',
        holdAfter: 1.2,
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
        holdAfter: 4.5,
      },
      {
        curve: routes.bs,
        reverse: false,
        cargo: 'APPROVED',
        tow: ['PAYLOAD', 'APPROVAL'],
        unloadAtEnd: true,
        work: 'server',
        holdAfter: 3.2,
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
      delay: step === 2 ? 1.2 : 0,
    }
  const traffic =
    slide.leg !== undefined ||
    ['server-tool-punch', 'client-tool-punch', 'interrupt-punch'].includes(id)
  return (
    <group visible={inMap}>
      <Ocean mcp={later} mcpReveal={mcpOverview ? mcpReveal : undefined} />
      <AmbientShips />
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
            delay={3.2}
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
                delay={3.2}
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
                delay={4.6}
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
            curve={routes.bs}
            legs={fullLoop}
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
            <Dock position={[0, 0.35, 0]} />
          </group>
          {[-4.8, 4.8].map((x) => (
            <Timber key={x} position={[x, 3, -0.2]} scale={[0.18, 6.4, 0.18]} />
          ))}
          <Timber
            position={[0, 3.1, -0.3]}
            scale={[10.4, 6.8, 0.2]}
            color="#745635"
          />
          <Timber
            position={[0, 3.1, -0.16]}
            scale={[10, 6.4, 0.08]}
            color="#d8c5a0"
          />
          <Timber
            position={[0, 0.8, 1.05]}
            scale={[3.1, 0.18, 1.25]}
            color="#84643f"
          />
          {[-0.65, 0.65].map((x) => (
            <Timber
              key={x}
              position={[x, 0.96, 1.1]}
              scale={[1.25, 0.09, 1]}
              rotation={[0, 0, x < 0 ? 0.06 : -0.06]}
              color="#e4d6b5"
            />
          ))}
          <Label
            text="Harbor master"
            position={[0, 7.2, 0]}
            scale={[4.4, 1.1, 1]}
          />
          {[
            'RUN START',
            'MODEL CALL',
            'TOOL CALL',
            'STREAM CHUNK',
            'RUN END',
          ].map((text, index) => (
            <group key={text} position={[0, 5 - index * 1.05, 0.1]}>
              <mesh
                ref={(node) => {
                  lifecycleLights.current[index] = node
                }}
                position={[-4.45, 0, 0.15]}
              >
                <sphereGeometry args={[0.14, 12, 8]} />
                <meshStandardMaterial
                  color="#66553d"
                  emissive="#edac52"
                  emissiveIntensity={0}
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
          key={id}
          curve={routes.sp}
          legs={id === 'server-tool-flow' ? serverFlow : clientFlow}
          work={toolWork}
          overviewBounds={overviewBounds}
        />
      )}
      {id === 'tool-approvals-overview' && (
        <>
          <FerryTrip
            key={id}
            curve={routes.bs}
            legs={approvalFlow}
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
          <group ref={approvalConfirmed} visible={false}>
            <Label
              text="APPROVED"
              position={[-9, MAP_Y + 10, 8]}
              scale={[4, 1, 1]}
            />
          </group>
        </>
      )}
      {!slide.codeWall &&
        ![
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
