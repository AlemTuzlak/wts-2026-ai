import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, PlaneGeometry, Quaternion, RepeatWrapping, Shape, SRGBColorSpace, TextureLoader, TubeGeometry, Vector2, Vector3 } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { Surface } from './Surface.jsx'
import { Label } from './Label.jsx'
import { useTalk } from '../store.js'

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
      const point = [positions.getX(index), positions.getY(index), positions.getZ(index)]
      const normal = [Math.abs(normals.getX(index)), Math.abs(normals.getY(index)), Math.abs(normals.getZ(index))]
      const faceAxis = normal.indexOf(Math.max(...normal))
      const grainAxis = longAxis === faceAxis ? (faceAxis + 1) % 3 : longAxis
      const crossAxis = [0, 1, 2].find(axis => axis !== grainAxis && axis !== faceAxis) ?? (grainAxis + 1) % 3
      uv.setXY(index, point[grainAxis] / 1.4 + offset, point[crossAxis] / 0.36 + offset)
    }
    return geometry
  }, [width, height, depth, position[0], position[2]])
  useEffect(() => () => geometry.dispose(), [geometry])
  const tint = useMemo(() => new Color(color).lerp(new Color('#ffffff'), .9), [color])
  return <mesh position={position} rotation={rotation} geometry={geometry} castShadow receiveShadow>
    <meshStandardMaterial {...material} color={tint} roughness={1} onBeforeCompile={shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = max(roughnessFactor, 0.84);')
    }} />
  </mesh>
}

function useTimber() {
  const textures = useLoader(TextureLoader, [
    './textures/wood/Wood049_1K-JPG_Color.jpg',
    './textures/wood/Wood049_1K-JPG_NormalGL.jpg',
    './textures/wood/Wood049_1K-JPG_Roughness.jpg',
  ])
  return useMemo(() => {
    textures.forEach(texture => {
      texture.wrapS = texture.wrapT = RepeatWrapping
      texture.anisotropy = 8
      texture.needsUpdate = true
    })
    textures[0].colorSpace = SRGBColorSpace
    return { map: textures[0], normalMap: textures[1], roughnessMap: textures[2], normalScale: new Vector2(.4, .4) }
  }, [textures])
}

function Nail({ position }) {
  return <mesh position={position} rotation={[Math.PI / 2, 0, 0]}>
    <cylinderGeometry args={[0.018, 0.021, 0.012, 8]} />
    <meshStandardMaterial color="#39342c" metalness={0.72} roughness={0.65} />
  </mesh>
}

function OutsidePalm({ position, rotation = 0, phase = 0 }) {
  const crown = useRef()
  const geometry = useMemo(() => {
    const trunkPath = new CatmullRomCurve3([
      new Vector3(0, 0, 0), new Vector3(.04, 1.4, .06),
      new Vector3(.28, 3.05, -.03), new Vector3(.12, 4.5, -.16),
    ])
    const trunk = new TubeGeometry(trunkPath, 36, .17, 9, false)
    const points = trunk.attributes.position
    for (let ring = 0; ring <= 36; ring++) {
      const t = ring / 36, center = trunkPath.getPointAt(t)
      for (let side = 0; side <= 9; side++) {
        const index = ring * 10 + side
        const point = new Vector3().fromBufferAttribute(points, index).sub(center).multiplyScalar(1 - t * .53).add(center)
        points.setXYZ(index, point.x, point.y, point.z)
      }
    }
    trunk.computeVertexNormals()
    const ribs = [], vertices = [], indices = [], colors = []
    for (let frond = 0; frond < 9; frond++) {
      const angle = frond * Math.PI * 2 / 9 + phase
      const reach = 2.05 + Math.sin(frond * 2.4) * .35
      const direction = new Vector3(Math.cos(angle), 0, Math.sin(angle))
      const sideways = new Vector3(-Math.sin(angle), 0, Math.cos(angle))
      const curve = new CatmullRomCurve3([
        new Vector3(), direction.clone().multiplyScalar(.5).setY(.27),
        direction.clone().multiplyScalar(reach * .65).setY(.02),
        direction.clone().multiplyScalar(reach).setY(-.82 - frond % 3 * .11),
      ])
      ribs.push(new TubeGeometry(curve, 20, .017, 5, false))
      for (let leaf = 0; leaf < 14; leaf++) {
        const t = .12 + leaf / 16
        const origin = curve.getPoint(t)
        const length = Math.sin(t * Math.PI) * .58 + .06
        for (const side of [-1, 1]) {
          const start = vertices.length / 3
          const color = new Color(frond % 3 === 0 ? '#657b39' : frond % 3 === 1 ? '#486433' : '#83924c')
          for (let segment = 0; segment <= 5; segment++) {
            const u = segment / 5
            const center = origin.clone().addScaledVector(sideways, side * length * u).addScaledVector(direction, .15 * u)
            center.y -= .22 * u * u
            const width = Math.sin(u * Math.PI) * .042 + (1 - u) * .01
            for (const edge of [-1, 1]) {
              const point = center.clone().addScaledVector(direction, width * edge)
              vertices.push(point.x, point.y + width * .35, point.z)
              colors.push(color.r, color.g, color.b)
            }
            if (segment < 5) {
              const index = start + segment * 2
              indices.push(index, index + 1, index + 2, index + 1, index + 3, index + 2)
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
        quaternion: new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), trunkPath.getTangentAt(t)),
        radius: .17 * (1 - t * .53),
      }
    })
    return { trunk, ribs, foliage, rings }
  }, [phase])
  useEffect(() => () => {
    geometry.trunk.dispose()
    geometry.foliage.dispose()
    geometry.ribs.forEach(rib => rib.dispose())
  }, [geometry])
  useFrame(({ clock }) => {
    if (crown.current) crown.current.rotation.z = Math.sin(clock.elapsedTime * .32 + phase) * .018
  })
  return <group position={position} rotation={[0, rotation, 0]}>
    <mesh geometry={geometry.trunk} castShadow><meshStandardMaterial color="#806a47" roughness={1} /></mesh>
    {geometry.rings.map((ring, index) => <mesh key={index} position={ring.position} quaternion={ring.quaternion}>
      <torusGeometry args={[ring.radius, .008, 4, 9]} /><meshStandardMaterial color="#5a4d35" roughness={1} />
    </mesh>)}
    <group ref={crown} position={[.12, 4.5, -.16]}>
      <mesh geometry={geometry.foliage} castShadow><meshStandardMaterial vertexColors side={DoubleSide} roughness={.9} /></mesh>
      {geometry.ribs.map((rib, index) => <mesh key={index} geometry={rib}><meshStandardMaterial color="#718346" roughness={1} /></mesh>)}
      {[0, 1, 2].map(index => <mesh key={index} position={[Math.sin(index * 2.1) * .15, -.08, Math.cos(index * 2.1) * .15]}>
        <sphereGeometry args={[.12, 10, 8]} /><meshStandardMaterial color="#6c6139" roughness={1} />
      </mesh>)}
    </group>
  </group>
}

function HorizonShip({ position, scale = 1, phase = 0 }) {
  const ship = useRef()
  const geometry = useMemo(() => {
    const outline = new Shape()
    outline.moveTo(-1.6, .28)
    outline.quadraticCurveTo(-1.1, -.28, -.65, -.3)
    outline.lineTo(.8, -.3)
    outline.quadraticCurveTo(1.22, -.2, 1.55, .4)
    outline.lineTo(.6, .28)
    outline.closePath()
    const hull = new ExtrudeGeometry(outline, { depth: .45, bevelEnabled: true, bevelThickness: .05, bevelSize: .05, bevelSegments: 2, steps: 1 })
    hull.translate(0, .16, -.225)
    const sail = new PlaneGeometry(1.12, .93, 12, 10)
    const points = sail.attributes.position
    for (let index = 0; index < points.count; index++) {
      const x = points.getX(index), y = points.getY(index)
      points.setXYZ(index, x * (.87 + (y + .465) * .15), y, Math.sin((x / 1.12 + .5) * Math.PI) * .18)
    }
    sail.computeVertexNormals()
    return { hull, sail }
  }, [])
  useEffect(() => () => { geometry.hull.dispose(); geometry.sail.dispose() }, [geometry])
  useFrame(({ clock }) => {
    if (!ship.current) return
    const time = clock.elapsedTime
    ship.current.position.x = position[0] + Math.sin(time * .027 + phase) * 4.5
    ship.current.position.z = position[2] + Math.sin(time * .019 + phase) * 1.8
    ship.current.position.y = position[1] + Math.sin(time * .72 + phase) * .035
    ship.current.rotation.set(0, .2 + Math.sin(time * .027 + phase) * .12, Math.sin(time * .6 + phase) * .012)
  })
  return <group ref={ship} position={position} scale={scale}>
    <mesh geometry={geometry.hull}><meshStandardMaterial color="#3d4038" roughness={.95} /></mesh>
    {[-.65, .55].map((x, index) => <group key={x} position={[x, 0, 0]}>
      <mesh position={[0, 1.42, 0]}><cylinderGeometry args={[.035, .045, 2.55, 8]} /><meshStandardMaterial color="#383b32" /></mesh>
      <mesh geometry={geometry.sail} position={[0, 1.35, .045]} scale={[index ? 1 : .9, 1, 1]}><meshStandardMaterial color="#c9c3a5" side={DoubleSide} roughness={1} /></mesh>
      <mesh geometry={geometry.sail} position={[0, 2.18, .04]} scale={[.72, .65, 1]}><meshStandardMaterial color="#c9c3a5" side={DoubleSide} roughness={1} /></mesh>
      <mesh position={[.12, 2.69, 0]}><planeGeometry args={[.24, .15]} /><meshStandardMaterial color="#303830" side={DoubleSide} /></mesh>
    </group>)}
  </group>
}

function SunsetOcean() {
  const water = useRef()
  const uniforms = useMemo(() => ({ time: { value: 0 } }), [])
  const sky = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 4; canvas.height = 512
    const ctx = canvas.getContext('2d')
    const gradient = ctx.createLinearGradient(0, 0, 0, 512)
    gradient.addColorStop(0, '#7a6b69')
    gradient.addColorStop(0.48, '#c87858')
    gradient.addColorStop(0.76, '#e9ad78')
    gradient.addColorStop(1, '#f9dcb1')
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 4, 512)
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace
    return texture
  }, [])
  const glow = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const ctx = canvas.getContext('2d')
    const gradient = ctx.createRadialGradient(128, 128, 42, 128, 128, 128)
    gradient.addColorStop(0, 'rgba(255,224,170,.48)')
    gradient.addColorStop(.35, 'rgba(255,209,145,.17)')
    gradient.addColorStop(1, 'rgba(255,200,130,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 256, 256)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    return texture
  }, [])
  useEffect(() => () => { sky.dispose(); glow.dispose() }, [sky, glow])
  useFrame((state) => { if (water.current) water.current.uniforms.time.value = state.clock.elapsedTime })
  return <group>
    <mesh position={[0, 27, -115]}><planeGeometry args={[280, 58]} /><meshBasicMaterial map={sky} fog={false} toneMapped={false} /></mesh>
    <mesh position={[-23, 7, -62.2]}><planeGeometry args={[11, 11]} /><meshBasicMaterial map={glow} transparent depthWrite={false} fog={false} toneMapped={false} /></mesh>
    <mesh position={[-23, 7, -62]}><sphereGeometry args={[2.1, 48, 32]} /><meshBasicMaterial color="#ffe4b0" fog={false} toneMapped={false} /></mesh>
    <mesh position={[0, -0.26, -64]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[240, 125, 120, 96]} />
      <shaderMaterial ref={water} uniforms={uniforms} side={DoubleSide} vertexShader={`
        uniform float time;
        varying vec3 world;
        void main() {
          vec3 p = position;
          p.z += sin(p.x * .7 + p.y * .36 + time * .75) * .065;
          p.z += sin(p.x * 1.7 - p.y * .91 + time * 1.1) * .025;
          vec4 w = modelMatrix * vec4(p, 1.0);
          world = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `} fragmentShader={`
        uniform float time;
        varying vec3 world;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        float height(vec2 p) {
          return sin(p.x * .8 + p.y * .72 + time * .65) * .12
            + sin(p.x * 1.7 - p.y * 1.2 + time * 1.1) * .047
            + sin(p.y * 3.8 + noise(p * .7) * 5.0 - time) * .023;
        }
        void main() {
          float distance = abs(world.z);
          vec2 p = world.xz;
          float h = height(p);
          vec3 normal = normalize(vec3(h - height(p + vec2(.06, 0)), .06, h - height(p + vec2(0, .06))));
          vec3 view = normalize(cameraPosition - world);
          vec3 halfLight = normalize(view + normalize(vec3(-.35,.12,-1.0)));
          float fresnel = pow(1.0 - max(0.0, dot(normal, view)), 4.0);
          vec3 color = mix(vec3(.018,.11,.19), vec3(.12,.31,.43), fresnel * .8);
          color += h * .07;
          float path = world.x + distance * .37;
          float reflection = exp(-path * path / (1.0 + distance * distance * .014));
          float glint = pow(max(0.0, dot(normal, halfLight)), 160.0);
          color += vec3(1.0,.62,.3) * (glint * 1.6 + reflection * .065);
          float haze = smoothstep(60.0, 135.0, distance);
          color = mix(color, vec3(.36,.49,.53), haze * .48);
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `} />
    </mesh>
    {[[-18, -60, 2.4], [20, -85, 3.6]].map(([x,z,s]) => <mesh key={x} position={[x,-0.4,z]} scale={[s,0.6,s * 0.6]}>
      <sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color="#5c6153" roughness={1} />
    </mesh>)}
    <HorizonShip position={[-16, -.22, -45]} scale={.8} phase={.8} />
    <HorizonShip position={[21, -.22, -58]} scale={1.05} phase={3.1} />
    <OutsidePalm position={[-5.2, -.3, -8]} rotation={.65} phase={.2} />
    <OutsidePalm position={[5.1, -.3, -8.5]} rotation={-1.1} phase={2} />
  </group>
}

function makeChart() {
  const canvas = document.createElement('canvas')
  canvas.width = 1536; canvas.height = 1024
  const ctx = canvas.getContext('2d')
  let seed = 417
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  ctx.fillStyle = '#eeebd4'; ctx.fillRect(0, 0, 1536, 1024)
  const vignette = ctx.createRadialGradient(768,512,160,768,512,870)
  vignette.addColorStop(0,'rgba(157,116,61,0)'); vignette.addColorStop(.7,'rgba(157,116,61,.07)'); vignette.addColorStop(1,'rgba(111,70,29,.48)')
  ctx.fillStyle = vignette; ctx.fillRect(0,0,1536,1024)
  for (let i=0;i<26000;i++) {
    ctx.fillStyle = `rgba(99,69,34,${random() * .1})`
    ctx.fillRect(random()*1536,random()*1024,random()*3+.5,random()*1.2+.3)
  }
  for (let i = 0; i < 2400; i++) {
    const x = random() * 1536, y = random() * 1024
    ctx.strokeStyle = `rgba(107,80,44,${.025 + random() * .075})`
    ctx.lineWidth = .5 + random()
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x + 2 + random() * 11,y + random() * 3); ctx.stroke()
  }
  for (const [x, y, radius] of [[70, 825, 155], [1420, 85, 190], [1180, 980, 140]]) {
    const stain = ctx.createRadialGradient(x, y, 10, x, y, radius)
    stain.addColorStop(0, 'rgba(128,88,39,.16)')
    stain.addColorStop(1, 'rgba(128,88,39,0)')
    ctx.fillStyle = stain; ctx.fillRect(x-radius,y-radius,radius*2,radius*2)
  }
  ctx.strokeStyle = 'rgba(107,85,53,.15)'; ctx.lineWidth = 1
  for(let x=90;x<1536;x+=120) {ctx.beginPath();ctx.moveTo(x,40);ctx.lineTo(x,984);ctx.stroke()}
  for(let y=80;y<1024;y+=120) {ctx.beginPath();ctx.moveTo(40,y);ctx.lineTo(1496,y);ctx.stroke()}
  ctx.strokeStyle = '#958363';ctx.lineWidth=2;ctx.strokeRect(35,35,1466,954);ctx.strokeRect(44,44,1448,936)
  const islands = [[405,615,112,75],[768,350,108,81],[1130,615,124,78]]
  islands.forEach(([x,y,rx,ry], index) => {
    for(let ring=3;ring>=0;ring--) {
      ctx.beginPath()
      for(let i=0;i<=100;i++) {
        const a=i/100*Math.PI*2
        const r=1+.13*Math.sin(a*5+index)+.09*Math.cos(a*9)
        const px=x+Math.cos(a)*(rx*r+ring*11), py=y+Math.sin(a)*(ry*r+ring*8)
        if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py)
      }
      ctx.closePath();ctx.strokeStyle=ring?'rgba(105,97,70,.25)':'#6c6346';ctx.lineWidth=ring?1.5:3
      if(!ring) {ctx.fillStyle='#c6c29b';ctx.fill()}
      ctx.stroke()
    }
    ctx.strokeStyle='#777052';ctx.lineWidth=2
    for(let n=0;n<5;n++) {const xx=x-55+n*25,yy=y+8-Math.sin(n)*17;ctx.beginPath();ctx.moveTo(xx-17,yy+15);ctx.lineTo(xx,yy-17);ctx.lineTo(xx+17,yy+15);ctx.moveTo(xx,yy-17);ctx.lineTo(xx+4,yy+9);ctx.stroke()}
    ctx.fillStyle='#3e3529';ctx.font='bold 31px Georgia';ctx.textAlign='center'
    ctx.fillText(['BROWSER','SERVER','PROVIDER'][index],x,y+ry+58)
  })
  ctx.strokeStyle='#b54a2a';ctx.lineWidth=5;ctx.setLineDash([12,14])
  ctx.beginPath();ctx.moveTo(427,518);ctx.bezierCurveTo(450,390,600,332,635,340);ctx.stroke()
  ctx.beginPath();ctx.moveTo(900,350);ctx.bezierCurveTo(1060,355,1090,425,1110,510);ctx.stroke();ctx.setLineDash([])
  ctx.save();ctx.translate(235,236)
  for(let i=0;i<16;i++) {const a=i*Math.PI/8;const r=i%2?49:82;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.sin(a-.1)*18,-Math.cos(a-.1)*18);ctx.lineTo(Math.sin(a)*r,-Math.cos(a)*r);ctx.closePath();ctx.fillStyle=i%2?'#968363':'#544c38';ctx.fill()}
  ctx.strokeStyle='#958363';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,57,0,Math.PI*2);ctx.stroke()
  ctx.font='24px Georgia';ctx.fillStyle='#544c38';ctx.fillText('N',0,-100);ctx.fillText('S',0,114);ctx.fillText('W',-101,9);ctx.fillText('E',101,9);ctx.restore()
  ctx.fillStyle='#62543e';ctx.textAlign='right';ctx.font='italic 34px Georgia';ctx.fillText('The Island Passage',1410,142)
  ctx.font='18px Georgia';ctx.fillText('A CHART OF THE AGENT LOOP',1410,180)
  ctx.textAlign='left';ctx.fillText('Soundings in calls',104,912)
  ctx.strokeStyle='#766548';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(1100,902);ctx.lineTo(1400,902);ctx.stroke()
  for(let i=0;i<7;i++){ctx.beginPath();ctx.moveTo(1100+i*50,894);ctx.lineTo(1100+i*50,910);ctx.stroke()}
  for(const x of [512,1024]) {const fold=ctx.createLinearGradient(x-14,0,x+14,0);fold.addColorStop(0,'rgba(90,65,30,0)');fold.addColorStop(.46,'rgba(90,65,30,.1)');fold.addColorStop(.54,'rgba(255,255,239,.35)');fold.addColorStop(1,'rgba(90,65,30,0)');ctx.fillStyle=fold;ctx.fillRect(x-14,0,28,1024)}
  const texture = new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.anisotropy=8
  return texture
}

function TreasureMap({ raised }) {
  const texture=useMemo(makeChart,[])
  const geometry=useMemo(() => {
    const geo=new PlaneGeometry(1.98,1.24,96,64)
    const points=geo.attributes.position
    for(let i=0;i<points.count;i++) {
      const x=points.getX(i),y=points.getY(i)
      const edge=Math.pow(Math.abs(x)/.99,14)*.033+Math.pow(Math.abs(y)/.62,18)*.021
      points.setXYZ(i,x+Math.sin(y*91)*.004*Math.pow(Math.abs(x)/.99,20),y+Math.sin(x*79)*.004*Math.pow(Math.abs(y)/.62,20),edge+Math.sin(x*15+y*4)*.003)
    }
    geo.computeVertexNormals();return geo
  },[])
  useEffect(()=>()=>{texture.dispose();geometry.dispose()},[texture,geometry])
  return <group position={[0,.853,-1.15]}>
    <mesh rotation={[-Math.PI/2,0,0]} geometry={geometry} receiveShadow castShadow>
      <meshStandardMaterial map={texture} roughness={.97} side={DoubleSide} />
    </mesh>
    {raised && [[-.47,.12],[0,-.195],[.47,.12]].map(([x,z],i)=><group key={x} position={[x,.014,z]}>
      <mesh scale={[.125,.031,.077]}><sphereGeometry args={[1,24,12]}/><meshStandardMaterial color="#b9b88d" roughness={1}/></mesh>
      {[0,1,2].map(n=><mesh key={n} position={[(n-1)*.044,.032+ n%2*.009,-.004]} scale={[.031,.04+n%2*.023,.025]}><coneGeometry args={[1,1,7]}/><meshStandardMaterial color={i===2?'#938a68':'#7c8161'} roughness={1}/></mesh>)}
    </group>)}
  </group>
}

function TableCompass() {
  return <group position={[1.12,.864,-.66]} rotation={[0,.35,0]}>
    <mesh><cylinderGeometry args={[.13,.13,.035,48]}/><meshStandardMaterial color="#a38b4c" metalness={.75} roughness={.3}/></mesh>
    <mesh position={[0,.02,0]}><cylinderGeometry args={[.112,.112,.008,48]}/><meshStandardMaterial color="#ece2bb" roughness={.6}/></mesh>
    <mesh position={[0,.03,0]} rotation={[0,0,-Math.PI/2]}><coneGeometry args={[.025,.16,4]}/><meshStandardMaterial color="#b2462b" metalness={.3} roughness={.4}/></mesh>
    <mesh position={[0,.033,0]}><sphereGeometry args={[.012,12,8]}/><meshStandardMaterial color="#bbaa6c" metalness={.7}/></mesh>
    <mesh position={[0,.002,-.145]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.028,.006,8,16]}/><meshStandardMaterial color="#a38b4c" metalness={.75}/></mesh>
  </group>
}

function Lantern() {
  return <group position={[-1.1,.84,-1.67]}>
    {[.015,.34].map(y=><mesh key={y} position={[0,y,0]}><cylinderGeometry args={[.105,.12,.04,16]}/><meshStandardMaterial color="#39362d" metalness={.75} roughness={.42}/></mesh>)}
    <mesh position={[0,.19,0]}><cylinderGeometry args={[.075,.08,.27,16]}/><meshPhysicalMaterial color="#f5d9a2" transparent opacity={.15} roughness={.12} side={DoubleSide}/></mesh>
    {[0,1,2,3].map(n=><mesh key={n} position={[Math.sin(n*Math.PI/2)*.085,.18,Math.cos(n*Math.PI/2)*.085]}><cylinderGeometry args={[.006,.006,.32,6]}/><meshStandardMaterial color="#39362d" metalness={.7}/></mesh>)}
    <mesh position={[0,.115,0]}><cylinderGeometry args={[.023,.027,.12,16]}/><meshStandardMaterial color="#d7c59f"/></mesh>
    <mesh position={[0,.2,0]} scale={[.018,.043,.018]}><sphereGeometry args={[1,12,12]}/><meshBasicMaterial color="#ffd295" toneMapped={false}/></mesh>
    <mesh position={[0,.42,0]}><torusGeometry args={[.06,.007,8,24]}/><meshStandardMaterial color="#39362d" metalness={.7}/></mesh>
    <pointLight position={[0,.22,0]} color="#f5bb75" intensity={.12} distance={1.4}/>
  </group>
}

function CloseLogo() {
  const [map,setMap]=useState(null)
  useEffect(()=>{let active=true;let image;new TextureLoader().load('./logos/tanstack-landscape-black-640.png',texture=>{image=texture;if(!active){texture.dispose();return}texture.colorSpace=SRGBColorSpace;setMap(texture)});return()=>{active=false;image?.dispose()}},[])
  return map ? <group position={[0,.955,-.41]} rotation={[-.17,0,0]} scale={.6}>
    <mesh><boxGeometry args={[1.42,.29,.024]}/><meshStandardMaterial color="#eeebd4" roughness={.9}/></mesh>
    <mesh position={[0,0,.014]}><planeGeometry args={[1.22,.190625]}/><meshBasicMaterial map={map} toneMapped={false} transparent/></mesh>
  </group> : null
}

function ChestSticker({ map, position, rotation, width }) {
  const height = width * map.image.height / map.image.width
  return <group position={position} rotation={rotation}>
    <mesh><planeGeometry args={[width * 1.24, height * 1.3]} /><meshStandardMaterial color="#eeebd4" roughness={.92} /></mesh>
    <mesh position={[0, 0, .0015]}><planeGeometry args={[width, height]} /><meshBasicMaterial map={map} transparent toneMapped={false} /></mesh>
  </group>
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
    const curve = new CatmullRomCurve3(Array.from({ length: 21 }, (_, index) => {
      const angle = index / 20 * Math.PI - Math.PI / 2
      return new Vector3(0, .505 + Math.cos(angle) * .257, Math.sin(angle) * .365)
    }))
    return new TubeGeometry(curve, 32, .026, 4, false)
  }, [])
  useEffect(() => () => straps.dispose(), [straps])
  const iron = { color: '#615444', metalness: .72, roughness: .48 }
  return <group position={[2.5, .0875, -2.1]} rotation={[0, -.28, 0]}>
    <Timber material={material} position={[0, .055, 0]} args={[1.07, .105, .73]} color="#786043" />
    {Array.from({ length: 4 }, (_, index) => <group key={index}>
      {[-1, 1].map(side => <Timber key={side} material={material} position={[0, .15 + index * .1, side * .325]} args={[1.02, .092, .055]} color="#92724c" />)}
      {[-1, 1].map(side => <Timber key={side} material={material} position={[side * .49, .15 + index * .1, 0]} args={[.055, .092, .66]} color="#92724c" />)}
    </group>)}
    {Array.from({ length: 12 }, (_, index) => {
      const angle = (index + .5) / 12 * Math.PI - Math.PI / 2
      const tilt = Math.atan2(Math.sin(angle) / .34, Math.cos(angle) / .24)
      return <Timber key={index} material={material} position={[0, .505 + Math.cos(angle) * .24, Math.sin(angle) * .34]} rotation={[tilt, 0, 0]} args={[1.04, .041, .077]} color="#a68a60" />
    })}
    {[-1, 1].map(side => <mesh key={side} position={[side * .49, .505, 0]} rotation={[0, Math.PI / 2, 0]} scale={[1, .706, 1]}>
      <circleGeometry args={[.34, 28, 0, Math.PI]} />
      <meshStandardMaterial {...material} color="#a99474" roughness={.9} side={DoubleSide} />
    </mesh>)}
    {[-.34, .34].map(x => <group key={x}>
      <mesh position={[x, 0, 0]} geometry={straps}><meshStandardMaterial {...iron} /></mesh>
      {[-1, 1].map(side => <mesh key={side} position={[x, .29, side * .36]}><boxGeometry args={[.053, .46, .019]} /><meshStandardMaterial {...iron} /></mesh>)}
      {[-1, 1].flatMap(side => [.11, .22, .4, .51].map(y => <mesh key={`${side}-${y}`} position={[x, y, side * .373]}>
        <sphereGeometry args={[.013, 8, 6]} /><meshStandardMaterial color="#a58e61" metalness={.7} roughness={.4} />
      </mesh>))}
      {[-.95, -.48, 0, .48, .95].map(angle => <mesh key={angle} position={[x, .511 + Math.cos(angle) * .276, Math.sin(angle) * .379]}>
        <sphereGeometry args={[.012, 8, 6]} /><meshStandardMaterial color="#a58e61" metalness={.7} roughness={.4} />
      </mesh>)}
    </group>)}
    {[-1, 1].flatMap(x => [-1, 1].map(z => <group key={`${x}-${z}`}>
      <mesh position={[x * .455, .13, z * .361]}><boxGeometry args={[.13, .13, .021]} /><meshStandardMaterial {...iron} /></mesh>
      <mesh position={[x * .525, .13, z * .298]}><boxGeometry args={[.019, .13, .13]} /><meshStandardMaterial {...iron} /></mesh>
    </group>))}
    <mesh position={[0, .465, .373]}><boxGeometry args={[.074, .21, .026]} /><meshStandardMaterial {...iron} /></mesh>
    <mesh position={[0, .355, .408]}><torusGeometry args={[.035, .009, 7, 18]} /><meshStandardMaterial color="#b6a16c" metalness={.8} roughness={.35} /></mesh>
    <mesh position={[0, .305, .409]}><boxGeometry args={[.083, .087, .042]} /><meshStandardMaterial color="#b6a16c" metalness={.8} roughness={.35} /></mesh>
    <mesh position={[0, .307, .432]}><circleGeometry args={[.008, 12]} /><meshBasicMaterial color="#292722" /></mesh>
    <mesh position={[0, .296, .432]}><planeGeometry args={[.007, .018]} /><meshBasicMaterial color="#292722" /></mesh>
    {[-1, 1].map(side => <group key={side} position={[side * .547, .32, 0]} rotation={[0, side * Math.PI / 2, 0]}>
      <mesh rotation={[0, 0, Math.PI / 2]} scale={[1, .67, 1]}><torusGeometry args={[.083, .012, 7, 22]} /><meshStandardMaterial {...iron} /></mesh>
      {[-.065, .065].map(x => <mesh key={x} position={[x, .055, -.006]}><boxGeometry args={[.04, .055, .018]} /><meshStandardMaterial {...iron} /></mesh>)}
    </group>)}
    <ChestSticker map={wordmark} position={[0, .16, .358]} width={.33} />
    <ChestSticker map={emblem} position={[-.17, .363, .36]} rotation={[0, 0, -.08]} width={.071} />
    <ChestSticker map={emblem} position={[.17, .346, .36]} rotation={[0, 0, .1]} width={.078} />
    <ChestSticker map={wordmark} position={[0, .712, .219]} rotation={[-1, 0, 0]} width={.37} />
    <ChestSticker map={emblem} position={[-.538, .195, .115]} rotation={[0, -Math.PI / 2, -.05]} width={.086} />
    <ChestSticker map={wordmark} position={[-.54, .447, 0]} rotation={[0, -Math.PI / 2, 0]} width={.31} />
  </group>
}

function BeachChair({ material }) {
  const canvasMap = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 512
    const ctx = canvas.getContext('2d')
    for (let stripe = 0; stripe < 9; stripe++) {
      ctx.fillStyle = stripe % 2 ? '#c8442e' : '#fff8e8'
      ctx.fillRect(stripe * 512 / 9, 0, 512 / 9 + 1, 512)
    }
    ctx.strokeStyle = 'rgba(91,62,38,.14)'
    ctx.lineWidth = .7
    for (let line = 0; line < 512; line += 3) {
      ctx.beginPath(); ctx.moveTo(0, line); ctx.lineTo(512, line); ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(255,255,243,.15)'
    for (let line = 0; line < 512; line += 4) {
      ctx.beginPath(); ctx.moveTo(line, 0); ctx.lineTo(line, 512); ctx.stroke()
    }
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 8
    return texture
  }, [])
  const sling = useMemo(() => {
    const curve = new CatmullRomCurve3([
      new Vector3(0, .43, .43), new Vector3(0, .32, .08),
      new Vector3(0, .46, -.18), new Vector3(0, .82, -.4), new Vector3(0, 1.19, -.6),
    ])
    const vertices = [], uv = [], indices = []
    for (let row = 0; row <= 40; row++) {
      const center = curve.getPoint(row / 40)
      for (let column = 0; column <= 20; column++) {
        const u = column / 20
        vertices.push((u - .5) * .8, center.y - Math.sin(u * Math.PI) * .035, center.z)
        uv.push(u, row / 40)
        if (row < 40 && column < 20) {
          const index = row * 21 + column
          indices.push(index, index + 1, index + 21, index + 1, index + 22, index + 21)
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
  useEffect(() => () => { canvasMap.dispose(); sling.dispose() }, [canvasMap, sling])
  return <group position={[-2.4, .12, -1.9]} rotation={[0, .2, 0]}>
    <mesh geometry={sling} castShadow receiveShadow><meshStandardMaterial map={canvasMap} roughness={.98} side={DoubleSide} /></mesh>
    {[-.47, .47].map(x => <group key={x}>
      <Timber material={material} position={[x, .615, .01]} rotation={[-.805, 0, 0]} args={[.065, 1.775, .065]} color="#bda378" />
      <Timber material={material} position={[x, .22, -.035]} rotation={[1.167, 0, 0]} args={[.065, 1.12, .065]} color="#bda378" />
      <Timber material={material} position={[x, .35, .41]} rotation={[-.565, 0, 0]} args={[.055, .71, .055]} color="#bda378" />
      <Timber material={material} position={[x, .67, .025]} args={[.105, .055, .72]} color="#c7b38d" />
      <mesh position={[x + Math.sign(x) * .041, .35, -.12]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.026, .026, .025, 12]} /><meshStandardMaterial color="#706449" metalness={.7} roughness={.5} /></mesh>
    </group>)}
    {[[.43, .43], [1.19, -.6], [.08, -.49]].map(([y, z]) => <mesh key={y} position={[0, y, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[.036, .036, 1.015, 12]} /><meshStandardMaterial {...material} color="#c3ad88" roughness={.9} />
    </mesh>)}
  </group>
}

export function Shack() {
  const id=useTalk(s=>s.slides[s.sceneIndex ?? s.index].id)
  const material=useTimber()
  const thanksText=useRef()
  useFrame(({camera})=>{
    if(!thanksText.current)return
    const t=Math.max(0,Math.min(1,(-camera.position.z-3.3)/2.7))
    thanksText.current.children.forEach(child=>{child.material.opacity=t*t*(3-2*t)})
  })
  const floatingTitle=id==='title'||id==='close'
  const planks=['#b59c7e','#c0aa89','#a48c71','#baa384','#ae9376']
  return <group visible={floatingTitle || id === 'the-map' || id === 'thank-you'}>
    <SunsetOcean />
    <Timber material={material} position={[0,-.03,0]} args={[7.2,.12,6.4]} color="#4f4739"/>
    {Array.from({length:21},(_,i)=><Timber key={i} material={material} position={[-3.4+i*.34,.05,0]} args={[.326,.08,6.4]} color={planks[i%5]}/>)}
    {[-1,1].map(side=><group key={side}>
      {Array.from({length:18},(_,i)=><Timber key={i} material={material} position={[side*3.47,1.59,-3.05+i*.35]} args={[.13,3.12,.336]} color={planks[(i+2)%5]}/>)}
      {[-2.8,-.1,2.6].map(z=><Timber key={z} material={material} position={[side*3.31,1.49,z]} args={[.2,3,.23]} color="#8d785c"/>)}
      <Timber material={material} position={[side*3.28,.26,0]} args={[.16,.18,6.3]} color="#7d684e"/>
    </group>)}
    {Array.from({length:22},(_,i)=>{const x=-3.45+i*.33;return <group key={i}>
      <Timber material={material} position={[x,.43,-3.15]} args={[.318,.85,.15]} color={planks[i%5]}/>
      <Timber material={material} position={[x,2.98,-3.15]} args={[.318,.64,.15]} color={planks[i%5]}/>
      {Math.abs(x)>2.7?<Timber material={material} position={[x,1.78,-3.15]} args={[.318,1.85,.15]} color={planks[i%5]}/>:null}
    </group>})}
    {[-2.77,2.77].map(x=><group key={x}>
      <Timber material={material} position={[x,1.77,-3.0]} args={[.22,2,.3]} color="#886d50"/>
      {[1,2.48].map(y=><group key={y}><mesh position={[x,y,-2.83]}><boxGeometry args={[.25,.12,.014]}/><meshStandardMaterial color="#534a3c" metalness={.65} roughness={.7}/></mesh><Nail position={[x-.065,y,-2.81]}/><Nail position={[x+.065,y,-2.81]}/></group>)}
    </group>)}
    <Timber material={material} position={[0,.89,-3]} args={[5.75,.16,.47]} color="#b29873"/>
    <Timber material={material} position={[0,2.72,-3]} args={[5.75,.2,.29]} color="#8f7557"/>
    <Timber material={material} position={[0,3.18,0]} args={[7.25,.14,6.5]} color="#78654d"/>
    {[-2.75,-1.35,.05,1.45,2.85].map(z=><Timber key={z} material={material} position={[0,2.98,z]} args={[7.2,.22,.2]} color="#9a8061"/>)}
    {[-3.2,3.2].map(x=><Timber key={x} material={material} position={[x,2.71,-2.3]} rotation={[Math.PI/4,0,0]} args={[.18,.95,.18]} color="#886d50"/>)}
    {Array.from({length:7},(_,i)=><Timber key={i} material={material} position={[0,.79,-1.83+i*.225]} args={[2.75,.09,.215]} color={planks[(i+1)%5]}/>)}
    {[-1.04,1.04].map(x=><group key={x}>
      {[-1.62,-.63].map(z=><Timber key={z} material={material} position={[x,.4,z]} rotation={[0,0,x>0?-.1:.1]} args={[.14,.76,.14]} color="#8b7152"/>)}
      <Timber material={material} position={[x,.18,-1.13]} args={[.17,.12,1.25]} color="#8b7152"/>
      <Timber material={material} position={[x,.68,-1.13]} args={[.16,.16,1.42]} color="#8b7152"/>
    </group>)}
    <Timber material={material} position={[0,.28,-1.15]} args={[2.25,.12,.14]} color="#8b7152"/>
    <TreasureMap raised={id==='the-map'}/>
    <TableCompass/><Lantern/>
    <TreasureChest material={material} />
    <BeachChair material={material} />
    <group position={[1.05,.89,-1.65]} rotation={[0,.15,Math.PI/2]}>
      <mesh><cylinderGeometry args={[.047,.05,.4,24]}/><meshStandardMaterial color="#d8cba6" roughness={1}/></mesh>
      <mesh><cylinderGeometry args={[.051,.051,.018,24]}/><meshStandardMaterial color="#8b6944" roughness={1}/></mesh>
    </group>
    {floatingTitle ? <Surface position={[0,1.75,-2.9]} scale={[2.4,2.4,1]} appearance="floating" /> : null}
    {id==='close'?<CloseLogo/>:null}
    {id==='thank-you'?<group ref={thanksText}>
      <Label text="Thank you" position={[0,5,-28]} scale={[7,1.75,1]}/>
      <Label text="Alem Tuzlak" position={[0,3.7,-28]} scale={[3.2,.8,1]}/>
    </group>:null}
  </group>
}
