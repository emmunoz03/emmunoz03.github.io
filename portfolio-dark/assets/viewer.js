/* ============================================================
   3D viewer engine (three.js)
   - mountSTL(container, url, opts)  → loads an .stl mesh
   - mountSVG(container, url, opts)  → extrudes an .svg into 3D
   Both give orbit controls + gentle auto-rotate.
   No editing needed here; change models via the HTML data-* attrs.
   ============================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';

function makeStage(container, opts={}){
  const w = container.clientWidth || 400, h = container.clientHeight || 300;
  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(38, w/h, 0.1, 5000);
  camera.position.set(0, 0, 100);

  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(60,80,90); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fe8c0, 0.7); rim.position.set(-70,20,-60); scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.enablePan = false; controls.autoRotate = true; controls.autoRotateSpeed = 1.1;
  controls.minDistance = 10; controls.maxDistance = 1200;
  if(opts.card){
    // landing-card mode: don't hijack page scroll; let vertical touch-scroll pass through
    controls.enableZoom = false;
    renderer.domElement.style.touchAction = 'pan-y';
  }

  function onResize(){
    const W = container.clientWidth, H = container.clientHeight;
    if(!W||!H) return;
    camera.aspect = W/H; camera.updateProjectionMatrix(); renderer.setSize(W,H);
  }
  new ResizeObserver(onResize).observe(container);

  // pause auto-rotate while the user is dragging, resume shortly after
  let idle; controls.addEventListener('start', ()=>{ controls.autoRotate=false; clearTimeout(idle); });
  controls.addEventListener('end', ()=>{ clearTimeout(idle); idle=setTimeout(()=>controls.autoRotate=true, 2500); });

  (function loop(){ requestAnimationFrame(loop); controls.update(); renderer.render(scene,camera); })();
  return { scene, camera, controls };
}

function frame(obj, camera, controls, pad=1.35){
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  obj.position.sub(center); // center at origin
  const maxDim = Math.max(size.x, size.y, size.z);
  const dist = (maxDim/2) / Math.tan((camera.fov*Math.PI/180)/2) * pad;
  camera.position.set(0, size.y*0.12, dist);
  camera.near = dist/100; camera.far = dist*100; camera.updateProjectionMatrix();
  controls.target.set(0,0,0); controls.update();
}

function loader(container){
  const el = container.parentElement.querySelector('.ld');
  return { done(){ if(el) el.style.display='none'; },
           fail(msg){ if(el) el.innerHTML = msg || 'Could not load 3D model'; } };
}

export function mountSTL(container, url, opts={}){
  const { scene, camera, controls } = makeStage(container, opts);
  const ld = loader(container);
  new STLLoader().load(url, geo=>{
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(opts.color || '#8a8f98'),
      metalness: opts.metalness ?? 0.35, roughness: opts.roughness ?? 0.55 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI/2; // STLs are usually Z-up; stand it up
    scene.add(mesh);
    frame(mesh, camera, controls, 1.4);
    ld.done();
  }, undefined, ()=> ld.fail('3D model not found (add the .stl file)'));
}

export function mountSVG(container, url, opts={}){
  const { scene, camera, controls } = makeStage(container, opts);
  const ld = loader(container);
  new SVGLoader().load(url, data=>{
    const group = new THREE.Group();
    const depth = opts.depth ?? 40;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(opts.color || '#e9edf2'),
      metalness: opts.metalness ?? 0.45, roughness: opts.roughness ?? 0.35 });
    const shapes = [];
    data.paths.forEach(p => SVGLoader.createShapes(p).forEach(s => shapes.push(s)));
    shapes.forEach(shape=>{
      const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled:true, bevelThickness:2, bevelSize:1.5, bevelSegments:2 });
      group.add(new THREE.Mesh(geo, mat));
    });
    group.scale.y = -1;           // SVG Y points down → flip so text is upright
    scene.add(group);
    frame(group, camera, controls, 1.25);
    ld.done();
  }, undefined, ()=> ld.fail('Vector not found (add the .svg file)'));
}

export function mount3MF(container, url, opts={}){
  const { scene, camera, controls } = makeStage(container, opts);
  const ld = loader(container);
  new ThreeMFLoader().load(url, obj=>{
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(opts.color || '#e9edf2'),
      metalness: opts.metalness ?? 0.45, roughness: opts.roughness ?? 0.4 });
    obj.traverse(o=>{ if(o.isMesh){ o.material = mat; if(o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals(); }});
    obj.rotation.x = -Math.PI/2;   // Bambu exports Z-up; stand it up
    scene.add(obj);
    frame(obj, camera, controls, 1.3);
    ld.done();
  }, undefined, ()=> ld.fail('3D model not found'));
}

// Auto-mount any element with data attributes:
//   <div class="viewer" data-model="models/helmet.stl" data-type="stl" data-color="#8a8f98"></div>
export function autoMount(){
  document.querySelectorAll('.viewer[data-model]').forEach(el=>{
    const type = (el.dataset.type||'').toLowerCase();
    const opts = { color: el.dataset.color, depth: el.dataset.depth?parseFloat(el.dataset.depth):undefined, card: el.dataset.card==='true' };
    if(type==='3mf') mount3MF(el, el.dataset.model, opts);
    else if(type==='svg') mountSVG(el, el.dataset.model, opts);
    else mountSTL(el, el.dataset.model, opts);
  });
}
