// ----- WaterShader -----
const WaterShader = {

    uniforms: {
        iGlobalTime: { value: 0.1 },
        iResolution: { value: new THREE.Vector2() },
        cameraPos: { value: new THREE.Vector3() },
        lightDir: { value: new THREE.Vector3(0.3, 0.5, 1.0) }
    },

    vertexShader: `
    varying vec3 vWorldPosition;
    varying vec2 vTexCoord;

    void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vTexCoord = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
    `,

    fragmentShader: `
    uniform float iGlobalTime;
    uniform vec2 iResolution;
    uniform vec3 cameraPos;
    uniform vec3 lightDir;

    varying vec3 vWorldPosition;
    varying vec2 vTexCoord;

    const int NUM_STEPS = 8;
    const float SEA_HEIGHT = 0.8;
    const float SEA_CHOPPY = 2.4;
    const float SEA_SPEED = 1.0;
    const float SEA_FREQ = 0.2;
    const vec3 SEA_BASE = vec3(0.11,0.2,0.27);
    const vec3 SEA_WATER_COLOR = vec3(0.8,1,0.6);
    mat2 octave_m = mat2(1.6,1.2,-1.2,1.6);

    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
    float noise(in vec2 p){
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f*f*(3.0-2.0*f);
        return -1.0+2.0*mix(
            mix(hash(i+vec2(0.0,0.0)), hash(i+vec2(1.0,0.0)), u.x),
            mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), u.x),
            u.y
        );
    }

    float diffuse(vec3 n, vec3 l, float p){ return pow(dot(n,l)*0.4+0.6,p); }
    float specular(vec3 n, vec3 l, vec3 e, float s){
        float nrm = (s+8.0)/(3.1415*8.0);
        return pow(max(dot(reflect(e,n),l),0.0),s)*nrm;
    }

    vec3 getSkyColor(vec3 e){
        e.y = max(e.y,0.0);
        return vec3(pow(1.0-e.y,2.0),1.0-e.y,0.6+(1.0-e.y)*0.4);
    }

    float sea_octave(vec2 uv, float choppy){
        uv += noise(uv);
        vec2 wv = 1.0-abs(sin(uv));
        vec2 swv = abs(cos(uv));
        wv = mix(wv,swv,wv);
        return pow(1.0-pow(wv.x*wv.y,0.65),choppy);
    }

    float map(vec3 p){
        float freq = SEA_FREQ;
        float amp = SEA_HEIGHT;
        float choppy = SEA_CHOPPY;
        vec2 uv = p.xz; uv.x *= 0.75;
        float SEA_TIME = iGlobalTime*SEA_SPEED;
        float d,h=0.0;
        for(int i=0;i<3;i++){
            d = sea_octave((uv+SEA_TIME)*freq,choppy);
            d += sea_octave((uv-SEA_TIME)*freq,choppy);
            h += d*amp;
            uv *= octave_m;
            freq *= 1.9; amp *= 0.22;
            choppy = mix(choppy,1.0,0.2);
        }
        return p.y-h;
    }

    vec3 getNormal(vec3 p, float eps){
        vec3 n;
        n.y = map(p);
        n.x = map(vec3(p.x+eps,p.y,p.z))-n.y;
        n.z = map(vec3(p.x,p.y,p.z+eps))-n.y;
        n.y = eps;
        return normalize(n);
    }

    vec3 getSeaColor(vec3 p, vec3 n, vec3 l, vec3 eye, vec3 dist){
        float fresnel = 1.0 - max(dot(n,-eye),0.0);
        fresnel = pow(fresnel,3.0)*0.65;
        vec3 reflected = getSkyColor(reflect(eye,n));
        vec3 refracted = SEA_BASE + diffuse(n,l,80.0)*SEA_WATER_COLOR*0.12;
        vec3 color = mix(refracted,reflected,fresnel);
        float atten = max(1.0-dot(dist,dist)*0.001,0.0);
        color += SEA_WATER_COLOR*(p.y-SEA_HEIGHT)*0.18*atten;
        color += vec3(specular(n,l,eye,60.0));
        return color;
    }

    float heightMapTracing(vec3 ori, vec3 dir, out vec3 p){
        vec3 oriComp = ori; oriComp.y -= vWorldPosition.y-SEA_HEIGHT;
        float tm=0.0, tx=1000.0;
        float hx = map(oriComp + dir*tx);
        if(hx>0.0) return tx;
        float hm = map(oriComp + dir*tm);
        float tmid = 0.0;
        for(int i=0;i<NUM_STEPS;i++){
            tmid = mix(tm,tx,hm/(hm-hx));
            p = oriComp + dir*tmid;
            float hmid = map(p);
            if(hmid<0.0){ tx=tmid; hx=hmid; } else { tm=tmid; hm=hmid; }
        }
        return tmid;
    }

    void main(){
        vec3 dir = normalize(vWorldPosition - cameraPos);
        vec3 p; heightMapTracing(cameraPos,dir,p);
        vec3 dist = vWorldPosition - cameraPos;
        vec3 n = getNormal(p,dot(dist,dist)*0.1/iResolution.x);
        vec3 color = getSeaColor(p,n,lightDir,dir,dist);
        gl_FragColor = vec4(pow(color,vec3(0.8)),1.0);
    }
    `
};

// ----- Three.js setup -----
let scene, camera, renderer, uniforms;

init();
animate();

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(55, window.innerWidth/window.innerHeight, 0.1, 4000);
    camera.position.set(5,10,20);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const geometry = new THREE.PlaneGeometry(100,100,256,256);

    uniforms = {
        iGlobalTime: { value: 0 },
        iResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        cameraPos: { value: camera.position },
        lightDir: { value: new THREE.Vector3(0.3,0.5,1.0).normalize() }
    };

    const material = new THREE.ShaderMaterial({
        vertexShader: WaterShader.vertexShader,
        fragmentShader: WaterShader.fragmentShader,
        uniforms: uniforms,
        side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI/2;
    scene.add(mesh);

    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    uniforms.iResolution.value.set(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    uniforms.iGlobalTime.value += 0.02;
    renderer.render(scene, camera);
}
