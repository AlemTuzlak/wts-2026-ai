import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { MAP_Y } from './layout.js'
import { useTalk } from '../store.js'

// Slides with a code or caption cloud get a calmer sea, so the eye stays on
// the cloud instead of the glints next to it.
function hasCloud(slide) {
  return Boolean(
    slide.form === 'code' || slide.splitSide || slide.splitSides,
  )
}

// Islands register their anchor here. The ocean reads the list each frame
// to paint shallows, caustics and a foam line around every visible island.
export const seaIslands = new Set()

const MAX_ISLANDS = 8

function presenceOf(node, world) {
  for (let parent = node; parent; parent = parent.parent)
    if (!parent.visible) return 0
  node.getWorldPosition(world)
  return THREE.MathUtils.clamp(1 - (MAP_Y - world.y) / 2, 0, 1)
}

export const oceanNoise = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  vec2 grad2(vec2 i) {
    float a = hash12(i) * 6.2831853;
    return vec2(cos(a), sin(a));
  }
  // Gradient noise with analytic derivatives (value, d/dx, d/dy).
  vec3 gnoised(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
    vec2 ga = grad2(i), gb = grad2(i + vec2(1.0, 0.0));
    vec2 gc = grad2(i + vec2(0.0, 1.0)), gd = grad2(i + vec2(1.0, 1.0));
    float va = dot(ga, f), vb = dot(gb, f - vec2(1.0, 0.0));
    float vc = dot(gc, f - vec2(0.0, 1.0)), vd = dot(gd, f - vec2(1.0, 1.0));
    float k = va - vb - vc + vd;
    return vec3(
      va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * k,
      ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd)
        + du * (u.yx * k + vec2(vb, vc) - va)
    );
  }
  float fbm2(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      v += a * gnoised(p).x;
      p = r * p * 2.03 + 17.1;
      a *= 0.5;
    }
    return v;
  }
  // Shared by the sea and the island ground, so shadows cross both.
  float cloudShadow(vec2 p, float t) {
    float clouds = fbm2(p * 0.018 + vec2(t * 0.006, t * 0.0035));
    return smoothstep(0.02, 0.32, clouds) * 0.55;
  }
`

export function Ocean() {
  const material = useRef()
  const world = useMemo(() => new THREE.Vector3(), [])
  const uniforms = useMemo(
    () => ({
      time: { value: 0 },
      islands: {
        value: Array.from({ length: MAX_ISLANDS }, () => new THREE.Vector4()),
      },
      sunDir: { value: new THREE.Vector3(-0.42, 0.5, -0.76).normalize() },
      focus: { value: 0 },
    }),
    [],
  )
  useFrame(({ clock }, delta) => {
    uniforms.time.value = clock.elapsedTime
    const talk = useTalk.getState()
    const target = hasCloud(talk.slides[talk.sceneIndex ?? talk.index]) ? 1 : 0
    uniforms.focus.value +=
      (target - uniforms.focus.value) * (1 - Math.exp(-Math.min(delta, 0.1) * 2.5))
    let slot = 0
    for (const entry of seaIslands) {
      if (slot >= MAX_ISLANDS || !entry.current) continue
      const presence = presenceOf(entry.current, world)
      if (presence <= 0) continue
      uniforms.islands.value[slot++].set(world.x, world.z, presence, 0)
    }
    for (; slot < MAX_ISLANDS; slot++) uniforms.islands.value[slot].set(0, 0, 0, 0)
  })
  return (
    <mesh position={[0, MAP_Y - 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[1000, 1000, 240, 240]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={
          /* glsl */ `
      uniform float time;
      uniform vec4 islands[${MAX_ISLANDS}];
      varying vec3 vWorld;
      varying float vCalm;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        float calm = 1.0;
        for (int i = 0; i < ${MAX_ISLANDS}; i++) {
          vec4 island = islands[i];
          float d = length((world.xz - island.xy) / vec2(3.3, 2.7));
          calm = min(calm, mix(1.0, smoothstep(1.0, 2.2, d), island.z));
        }
        vec2 p = world.xz;
        float swell = sin(dot(p, vec2(0.55, 0.21)) + time * 0.9) * 0.055
          + sin(dot(p, vec2(-0.19, 0.62)) + time * 0.72) * 0.04
          + sin(dot(p, vec2(0.93, -0.48)) + time * 1.3) * 0.018;
        world.y += swell * (0.35 + 0.65 * calm);
        vWorld = world.xyz;
        vCalm = calm;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `
        }
        fragmentShader={
          /* glsl */ `
      uniform float time;
      uniform float focus;
      uniform vec3 sunDir;
      uniform vec4 islands[${MAX_ISLANDS}];
      varying vec3 vWorld;
      varying float vCalm;
      ${oceanNoise}

      // Directional swells with analytic slope: x = height, yz = gradient.
      vec3 swell(vec2 p, float t) {
        vec3 h = vec3(0.0);
        vec4 waves[5];
        waves[0] = vec4(normalize(vec2(1.0, 0.38)), 11.0, 0.19);
        waves[1] = vec4(normalize(vec2(-0.3, 1.0)), 7.3, 0.12);
        waves[2] = vec4(normalize(vec2(0.86, -0.51)), 4.6, 0.07);
        waves[3] = vec4(normalize(vec2(-0.72, -0.69)), 3.1, 0.045);
        waves[4] = vec4(normalize(vec2(0.12, 0.99)), 2.2, 0.03);
        for (int i = 0; i < 5; i++) {
          vec2 d = waves[i].xy;
          float k = 6.2831853 / waves[i].z;
          float speed = sqrt(9.8 / k) * 0.55;
          float phase = dot(d, p) * k + t * speed * k * 0.35 + float(i) * 1.7;
          // Peaked crests: shift a sine toward sharp tops.
          float s = sin(phase) * 0.5 + 0.5;
          float c = cos(phase);
          float shaped = s * s;
          h.x += waves[i].w * (shaped - 0.35);
          h.yz += waves[i].w * 2.0 * s * 0.5 * c * k * d;
        }
        return h;
      }

      // Bright moving caustic web for the shallows.
      float caustic(vec2 p, float t) {
        vec2 i = p;
        float c = 1.0;
        for (int n = 0; n < 4; n++) {
          float tn = t * (1.0 - 3.5 / float(n + 1));
          i = p + vec2(cos(tn - i.x) + sin(tn + i.y), sin(tn - i.y) + cos(tn + i.x));
          c += 1.0 / length(vec2(p.x / (sin(i.x + tn) / 0.007), p.y / (cos(i.y + tn) / 0.007)));
        }
        c /= 4.0;
        c = clamp(1.17 - pow(c, 1.4), 0.0, 1.0);
        return pow(c, 7.0);
      }

      void main() {
        vec2 p = vWorld.xz;
        vec3 toCamera = cameraPosition - vWorld;
        float dist = length(toCamera);
        vec3 V = toCamera / dist;
        float footprint = max(length(dFdx(p)), length(dFdy(p)));

        // Shallows around islands.
        float shallow = 0.0, shore = 0.0, nearest = 9.0;
        float edgeNoise = gnoised(p * 0.55).x;
        float reefNoise = gnoised(p * 0.21 + 3.7).x;
        for (int i = 0; i < ${MAX_ISLANDS}; i++) {
          vec4 island = islands[i];
          if (island.z <= 0.0) continue;
          float d = length((p - island.xy) / vec2(3.3, 2.7));
          float outer = d + edgeNoise * 0.16 + reefNoise * 0.5;
          d += edgeNoise * 0.18;
          nearest = min(nearest, mix(9.0, d, island.z));
          shallow = max(shallow, (1.0 - smoothstep(1.0, 2.2, outer)) * island.z);
          shore = max(shore, (1.0 - smoothstep(0.98, 1.3, d)) * island.z);
        }

        // Surface slope: swells plus four rotated noise octaves.
        vec3 wave = swell(p, time);
        vec2 slope = wave.yz;
        float amp = 0.11, freq = 0.62;
        mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
        mat2 m = mat2(1.0);
        float crest = wave.x;
        for (int i = 0; i < 4; i++) {
          vec2 drift = vec2(0.31, 0.17) * time * (1.0 + float(i) * 0.37);
          vec3 n = gnoised(m * p * freq + drift + float(i) * 7.3);
          float wavelength = 1.0 / freq;
          float keep = clamp((wavelength / footprint - 3.0) / 6.0, 0.0, 1.0);
          slope += (n.yz * freq * m) * amp * keep;
          crest += n.x * amp * 0.5;
          m = r * m;
          freq *= 1.93;
          amp *= 0.56;
        }
        slope *= mix(0.45, 1.0, vCalm) * (1.0 - focus * 0.45);
        vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));

        // Drifting cloud shadows give the sea scale and life.
        float shadow = cloudShadow(p, time);

        float NdotV = max(dot(N, V), 0.0);
        float fresnel = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);
        vec3 R = reflect(-V, N);
        R.y = abs(R.y);
        vec3 skyHorizon = vec3(0.56, 0.74, 0.86);
        vec3 skyZenith = vec3(0.13, 0.36, 0.68);
        vec3 sky = mix(skyHorizon, skyZenith, pow(R.y, 0.55));

        // Water body: a mid blue (dark text on it must stay readable), with
        // turquoise light where crests face the sun.
        vec3 deep = vec3(0.03, 0.185, 0.335);
        vec3 scatter = vec3(0.02, 0.38, 0.44);
        float facing = max(dot(N, normalize(sunDir * vec3(1.0, 0.25, 1.0))), 0.0);
        float sss = clamp(crest * 1.8 + 0.25, 0.0, 1.0) * (0.35 + 0.65 * facing);
        vec3 body = mix(deep, scatter, sss * 0.85);
        body *= 0.75 + 0.35 * max(dot(N, sunDir), 0.0);

        // Lagoon: sandy floor, turquoise water and moving caustics.
        float sandy = 1.0 - smoothstep(1.0, 1.55, nearest);
        vec3 lagoon = mix(vec3(0.03, 0.46, 0.44), vec3(0.4, 0.62, 0.42), sandy);
        float light = 0.0;
        if (shallow > 0.001) {
          light = caustic(p * 0.62 + edgeNoise * 0.4, time * 0.55);
          // Coral and weed patches darken parts of the lagoon floor.
          float reef = smoothstep(0.12, 0.42, fbm2(p * 0.62 + 11.0))
            * smoothstep(1.02, 1.3, nearest);
          lagoon = mix(lagoon, vec3(0.02, 0.17, 0.15), reef * 0.55);
          light *= 1.0 - reef * 0.6;
        }
        lagoon += vec3(0.55, 0.8, 0.7) * light * (0.35 + 0.4 * sandy);
        body = mix(body, lagoon, shallow * 0.92);

        body *= 1.0 - shadow * 0.5;
        vec3 color = mix(body, sky * (1.0 - shadow * 0.35), fresnel * (1.0 - shallow * 0.45));

        // Sun glitter: soft facets from the fine normals plus a sheen. The peak
        // is clamped and fades with distance, so far glints never alias into
        // hard white specks.
        vec3 H = normalize(sunDir + V);
        float NdotH = max(dot(N, H), 0.0);
        float shine = 2600.0 / (1.0 + footprint * 60.0);
        float far = 1.0 / (1.0 + footprint * 18.0);
        float glitter = min(pow(NdotH, shine) * 1.4, 0.75) * far;
        float sheen = pow(NdotH, 60.0) * 0.03;
        color += vec3(1.0, 0.9, 0.72) * (glitter + sheen)
          * (1.0 - shadow * 0.9) * (1.0 - focus * 0.7);

        // Sparse whitecaps on the biggest crests.
        float caps = smoothstep(0.19, 0.27, crest)
          * smoothstep(0.62, 0.82, gnoised(p * 3.1 + time * 0.3).x + 0.5)
          * smoothstep(0.3, 0.6, gnoised(p * 0.4 - time * 0.05).x + 0.5);
        color = mix(color, vec3(0.86, 0.93, 0.95), caps * 0.4 * vCalm * (1.0 - focus * 0.7));

        // Foam line where the lagoon meets the beach.
        float wash = shore * (0.55 + 0.45 * sin(nearest * 34.0 - time * 1.6 + edgeNoise * 6.0));
        wash *= smoothstep(0.25, 0.75, gnoised(p * 2.4 + vec2(time * 0.2, 0.0)).x + 0.6);
        color = mix(color, vec3(0.9, 0.96, 0.95), clamp(wash, 0.0, 1.0) * 0.55);

        // Atmospheric haze toward the horizon.
        float haze = 1.0 - exp(-max(dist - 38.0, 0.0) * 0.0062);
        color = mix(color, vec3(0.37, 0.6, 0.74), haze);

        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
        }
      />
    </mesh>
  )
}
