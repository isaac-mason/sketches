import { OrbitControls } from '@react-three/drei'
import { Canvas } from '../Canvas'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { TextureLoader, Vector2, Vector3 } from 'three'

const vertexShader = `
    varying vec3 vNormal;
    varying vec3 camPos;
    varying vec2 vUv;

    void main() {
    vNormal = normal;
    vUv = uv;
    camPos = cameraPosition;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
`

const fragmentShader = `
#define NUM_OCTAVES 5
#define M_PI 3.1415926535897932384626433832795
uniform vec4 resolution;
varying vec3 vNormal;
uniform sampler2D perlinnoise;
uniform sampler2D sparknoise;
uniform float time;
uniform vec3 color0;
uniform vec3 color1;
uniform vec3 color2;
uniform vec3 color3;
uniform vec3 color4;
uniform vec3 color5;
varying vec3 camPos;
varying vec2 vUv;

float setOpacity(float r, float g, float b, float tonethreshold) {
  float tone = (r + g + b) / 3.0;
  float alpha = 1.0;
  if(tone<tonethreshold) {
    alpha = 0.0;
  }
  return alpha;
}

vec3 rgbcol(vec3 col) {
  return vec3(col.r/255.0,col.g/255.0,col.b/255.0);
}

vec2 rotate(vec2 v, float a) {
  float s = sin(a);
  float c = cos(a);
  mat2 m = mat2(c, -s, s, c);
  return m * v;
}

vec2 UnityPolarCoordinates (vec2 UV, vec2 Center, float RadialScale, float LengthScale){
  // https://twitter.com/Cyanilux/status/1123950519133908995/photo/1
  vec2 delta = UV - Center;
  float radius = length(delta) * 2. * RadialScale;
  float angle = atan(delta.x, delta.y) * 1.0/6.28 * LengthScale;
  return vec2(radius, angle);
}

void main() {
  vec2 olduv = gl_FragCoord.xy/resolution.xy ;
  vec2 uv = vUv ; 
  vec2 imguv = uv;
  float scale = 1.;
  olduv *= 0.5 + time; 
  olduv.y = olduv.y ;
  vec2 p = olduv*scale;
  vec4 txt = texture2D(perlinnoise, olduv);
  float gradient = dot(normalize( -camPos ), normalize( vNormal ));
  float pct = distance(vUv,vec2(0.5));

  vec3 rgbcolor0 = rgbcol(color0);
  vec3 rgbcolor1 = rgbcol(color1);
  vec3 rgbcolor2 = rgbcol(color2);
  vec3 rgbcolor5 = rgbcol(color5);

  // set solid background
  float y = smoothstep(0.16,0.525,pct);
  vec3 backcolor = mix(rgbcolor0, rgbcolor5, y);

  gl_FragColor = vec4(backcolor,1.);

  // set polar coords
  vec2 center = vec2(0.5);
  vec2 cor = UnityPolarCoordinates(vec2(vUv.x,vUv.y), center, 1., 1.);

  // set textures
  vec2 newUv = vec2(cor.x + time,cor.x*0.2+cor.y);
  vec3 noisetex = texture2D(perlinnoise,mod(newUv,1.)).rgb;    
  vec3 noisetex2 = texture2D(sparknoise,mod(newUv,1.)).rgb;    


  // set textures tones
  float tone0 =  1. - smoothstep(0.3,0.6,noisetex.r);
  float tone1 =  smoothstep(0.3,0.6,noisetex2.r);


  // set opacity for each tone
  float opacity0 = setOpacity(tone0,tone0,tone0,.29);
  float opacity1 = setOpacity(tone1,tone1,tone1,.49);

  // set final render
  if (opacity1 > 0.0) {
    gl_FragColor = vec4(rgbcolor2,0.)*vec4(opacity1);
  } else if(opacity0>0.0){
    gl_FragColor = vec4(rgbcolor1,0.)*vec4(opacity0);
  }   
}
`

const App = () => {
    const time = useRef({ value: 0 })

    useFrame(({ clock: { elapsedTime } }) => {
        time.current.value = -elapsedTime / 2
    })
    
    return (
        <>
            <mesh>
                {/* <meshStandardMaterial color="#ff8888" /> */}
                <shaderMaterial
                    vertexShader={vertexShader}
                    fragmentShader={fragmentShader}
                    uniforms={{
                        time: time.current,
                        perlinnoise: {
                            value: new TextureLoader().load(
                                "https://raw.githubusercontent.com/pizza3/asset/master/noise9.jpg"
                            )
                        },
                        sparknoise: {
                            value: new TextureLoader().load(
                                "https://raw.githubusercontent.com/pizza3/asset/master/sparklenoise.jpg"
                            )
                        },
                        color5: {
                            value: new Vector3(64, 27, 0)
                        },
                        color4: {
                            value: new Vector3(79, 79, 79)
                        },
                        color3: {
                            value: new Vector3(166, 166, 166)
                        },
                        color2: {
                            value: new Vector3(181, 156, 24)
                        },
                        color1: {
                            value: new Vector3(81, 14, 5)
                        },
                        color0: {
                            value: new Vector3(255, 0, 0)
                        },
                        resolution: { value: new Vector2(1000, 1000) }
                    }}
                />
                <sphereGeometry args={[1]} />
            </mesh>

            <ambientLight intensity={1} />
            {/* <directionalLight position={[5, 0, 0]} intensity={0.5} /> */}
        </>
    )
}

export default () => (
    <>
        <h1>Fireball</h1>
        <Canvas camera={{ position: [3, 0, 3] }}>
            <App />
            <OrbitControls />
        </Canvas>
    </>
)
