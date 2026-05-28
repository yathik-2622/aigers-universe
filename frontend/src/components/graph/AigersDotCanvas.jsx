/* eslint-disable react-hooks/exhaustive-deps */

import React, { useRef, useEffect } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import styles from "./AigersKGComponents.module.css";

/**
 * HCKBDotCanvas - galaxy canvas
 *
 * Props:
 *  - nodes: array of { id, type, x,y,z, label, color, ... }
 *  - focusDocId
 *  - onNodeClick, onNodeHover
 *  - warpToNodeId, resetSignal
 *  - showAllChunks
 *  - starGlow (0..1.2) -> controls bloom strength (0 = no bloom) [affects stars only]
 *  - labelConfigs: { main: {visible, colorMode, size}, sub: {...}, chunk: {...} }
 *
 * Key adjustments:
 *  - Improved label texture DPR & scaling so labels remain crisp at close zoom (especially chunk labels).
 *  - Label background is a compact white rounded box and placed slightly above the star.
 *  - Stars render as solid colored disks (core) with optional bloom overlay — preserves crisp spherical shape.
 */
export default function HCKBDotCanvas({
  nodes = [],
  links = [],
  selectedNodeId = null,
  relatedNodeIds = [],
  relatedLinkIds = [],
  focusDocId = null,
  focusNodeId = null,
  onNodeClick = () => {},
  onNodeHover = () => {},
  warpToNodeId = null,
  resetSignal = 0,
  showAllChunks = false,
  starGlow = 0.0,
  labelConfigs = { main: { visible: true, colorMode: "star", size: 18 }, sub: { visible: false, colorMode: "star", size: 14 }, chunk: { visible: false, colorMode: "star", size: 12 } },
}) {
  const mountRef = useRef(null);
  const stateRef = useRef(null);
  const eruptionIntervalRef = useRef(null);
  const timeRef = useRef(0);

  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const stableHash = (value = "") => {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    return hash >>> 0;
  };
  const neonColorForLink = (link, highlighted = false) => {
    const semantic = (link.edge_type || "") === "semantic";
    if (highlighted) return semantic ? 0x67e8f9 : 0xfacc15;
    if (link.color) return new THREE.Color(link.color).getHex();
    if (semantic) {
      const score = Math.max(0, Math.min(1, Number(link.similarity ?? 0)));
      const hue = 185 + Math.round(score * 110);
      const color = new THREE.Color();
      color.setHSL(hue / 360, 0.96, 0.62);
      return color.getHex();
    }
    const color = new THREE.Color();
    color.setHSL((stableHash(String(link.id || "")) % 360) / 360, 0.72, 0.58);
    return color.getHex();
  };

  // star texture: solid core + optional soft gradient overlay (keeps core crisp)
  function makeStarTexture(color = "#ffffff", size = 128, glow = 0) {
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const c = document.createElement("canvas");
    c.width = Math.round(size * DPR);
    c.height = Math.round(size * DPR);
    const ctx = c.getContext("2d");
    ctx.scale(DPR, DPR);

    const cx = size / 2, cy = size / 2, r = size / 2;

    // solid circular core
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    // optional glow overlay (keeps core strong)
    if (glow && glow > 0) {
      const grad = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r);
      grad.addColorStop(0.0, color);
      grad.addColorStop(0.45, color);
      grad.addColorStop(0.65 + glow * 0.12, "rgba(255,255,255,0.06)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.globalCompositeOperation = "lighter";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  }

  // label texture: white rounded background + crisp text. Use higher DPR for crispness.
  function makeLabelTexture(text = "", textColor = "#000000", font = `14px Inter`, padX = 8, padY = 6) {
    const DPR = Math.min(window.devicePixelRatio || 1, 3); // increase DPR up to 3 for label crispness
    const measureCan = document.createElement("canvas");
    const measureCtx = measureCan.getContext("2d");
    measureCtx.font = font;
    const measure = Math.ceil(measureCtx.measureText(text).width);
    const cssW = Math.max(36, measure + padX * 2);
    const cssH = Math.max(18, Math.round(parseInt(font, 10) * 1.4) + padY * 2);

    const c = document.createElement("canvas");
    c.width = Math.round(cssW * DPR);
    c.height = Math.round(cssH * DPR);
    const ctx = c.getContext("2d");
    ctx.scale(DPR, DPR);
    ctx.font = font;
    ctx.textBaseline = "middle";

    // white rounded background (slightly translucent so star color can peek)
    const radius = Math.min(10, Math.round(cssH / 2));
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(cssW - radius, 0);
    ctx.quadraticCurveTo(cssW, 0, cssW, radius);
    ctx.lineTo(cssW, cssH - radius);
    ctx.quadraticCurveTo(cssW, cssH, cssW - radius, cssH);
    ctx.lineTo(radius, cssH);
    ctx.quadraticCurveTo(0, cssH, 0, cssH - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();

    // text (no shadow)
    ctx.fillStyle = textColor;
    ctx.fillText(text, padX, cssH / 2);

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    // attach helper info for correct scaling later
    tex._cssWidth = cssW;
    tex._cssHeight = cssH;
    tex._dpr = DPR;
    return tex;
  }

  function framingDistance(camera, radius = 180) {
    const fov = THREE.MathUtils.degToRad(camera.fov || 50);
    return Math.max(520, (radius * 1.9) / Math.tan(fov / 2));
  }

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth, H = mount.clientHeight;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(50, W / H, 1, 30000);
    camera.position.set(0, 0, 2600);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    mount.appendChild(renderer.domElement);

    const composer = new EffectComposer(renderer);
    composer.setSize(W, H);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), Math.max(0, starGlow * 1.2), 0.35, 0.5);
    bloom.threshold = 0.02;
    bloom.strength = Math.max(0, starGlow * 1.2);
    bloom.radius = 0.35;
    composer.addPass(bloom);

    scene.add(new THREE.AmbientLight(0xffffff, 0.18));

    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 12 };

    const state = {
      renderer, scene, camera, composer, raycaster,
      spritesMap: {}, instancedInfo: null, linkObjects: [],
      eruptionParticles: [], rotation: { x: 0, y: 0 },
      dragging: false, lastMouse: { x: 0, y: 0 }, anim: null,
      showAllChunks: !!showAllChunks, _fitTarget: null,
      defaultCamPos: camera.position.clone(), defaultCamLook: new THREE.Vector3(0,0,0),
    };
    stateRef.current = state;

    // distant galaxies & blackhole (kept hidden)
    (function createDistantGalaxies() {
      const group = new THREE.Group();
      const galaxyCount = 4;
      for (let g = 0; g < galaxyCount; g++) {
        const gg = new THREE.Group();
        const centerAng = (g / galaxyCount) * Math.PI * 2;
        const cx = Math.cos(centerAng) * 6000;
        const cz = Math.sin(centerAng) * 6000;
        gg.position.set(cx, (g - 1.5) * 1200, cz);
        const pts = [];
        const pcount = 400 + Math.floor(Math.random() * 300);
        for (let i = 0; i < pcount; i++) {
          const a = i / pcount * Math.PI * 6;
          const r = 120 + (i / pcount) * 900 + Math.random() * 40;
          const x = Math.cos(a) * r;
          const y = (Math.random() - 0.5) * 40;
          const z = Math.sin(a) * r;
          pts.push(new THREE.Vector3(x, y, z));
        }
        const geom = new THREE.BufferGeometry().setFromPoints(pts);
        const colArr = new Float32Array(pcount * 3);
        for (let i = 0; i < pcount; i++) {
          const t = 0.7 + Math.random() * 0.3;
          colArr[3 * i] = t; colArr[3 * i + 1] = t; colArr[3 * i + 2] = t;
        }
        geom.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
        const mat = new THREE.PointsMaterial({ size: 1.6, vertexColors: true, opacity: 0.85, transparent: true });
        const points = new THREE.Points(geom, mat);
        gg.add(points);
        gg.userData = { rotSpeed: 0.0006 + Math.random() * 0.0014 };
        group.add(gg);
      }
      group.visible = false;
      scene.add(group);
      state.distantGalaxies = group;
    })();

    (function createBlackhole() {
      const g = new THREE.Group();
      const sphereGeom = new THREE.SphereGeometry(260, 32, 32);
      const sphereMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const sphere = new THREE.Mesh(sphereGeom, sphereMat);
      g.add(sphere);
      const diskGeom = new THREE.RingGeometry(280, 720, 256, 1);
      const accMat = new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 }, colorA: { value: new THREE.Color(0xff8fb4) }, colorB: { value: new THREE.Color(0xffc27a) } },
        vertexShader: `
          varying vec2 vUv;
          void main(){
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          }
        `,
        fragmentShader: `
          uniform float time;
          uniform vec3 colorA;
          uniform vec3 colorB;
          varying vec2 vUv;
          void main(){
            vec2 uv = vUv - 0.5;
            float r = length(uv) * 2.0;
            float a = atan(uv.y, uv.x);
            float swirl = sin(a*6.0 + time*2.0) * 0.12;
            float glow = smoothstep(0.95 + swirl, 0.1, r) * (1.0 - smoothstep(0.2, 0.4, r));
            vec3 col = mix(colorA, colorB, smoothstep(0.0, 1.2, r));
            col *= 0.6 + 0.8 * pow(1.0 - r, 2.0) * glow;
            float alpha = clamp(glow * 1.4, 0.0, 1.0);
            gl_FragColor = vec4(col, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const disk = new THREE.Mesh(diskGeom, accMat);
      disk.rotation.x = -Math.PI / 2;
      g.add(disk);
      g.position.set(-1200, -800, -2400);
      g.visible = false;
      scene.add(g);
      state.blackhole = { group: g, disk, accMat };
    })();

    (function createAmbientStarfield() {
      const count = 1400;
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      for (let index = 0; index < count; index += 1) {
        const radius = 5200 + Math.random() * 5200;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[index * 3 + 2] = radius * Math.cos(phi);
        const color = new THREE.Color().setHSL(0.55 + Math.random() * 0.12, 0.4, 0.72 + Math.random() * 0.16);
        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const material = new THREE.PointsMaterial({ size: 8, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false });
      const points = new THREE.Points(geometry, material);
      scene.add(points);
      state.ambientStars = points;
    })();

    // resize
    function onResize() {
      const w2 = mount.clientWidth, h2 = mount.clientHeight;
      renderer.setSize(w2, h2);
      composer.setSize(w2, h2);
      camera.aspect = w2 / h2;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", onResize);

    // interactions
    const dom = renderer.domElement;
    function onPointerDown(e) {
      // If we start dragging, prevent click/hover from targeting objects under the cursor.
      state.dragging = true
      state.lastMouse.x = e.clientX
      state.lastMouse.y = e.clientY
      state.didDrag = false
    }
    function onPointerMove(e) {
      const rect = dom.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (state.dragging) {
        const dx = e.clientX - state.lastMouse.x;
        const dy = e.clientY - state.lastMouse.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) state.didDrag = true
        state.rotation.y += dx * 0.0022;
        state.rotation.x += dy * 0.0022;
        state.lastMouse.x = e.clientX; state.lastMouse.y = e.clientY;
        hideTransientLabels();
        onNodeHover(null);
        return;
      }


      if (state.showAllChunks) {
        hideTransientLabels();
        onNodeHover(null);
        return;
      }

      // hover logic
      const objects = [];
      Object.values(state.spritesMap || {}).forEach((entry) => objects.push(entry.star));
      if (state.instancedInfo && state.instancedInfo.mesh) objects.push(state.instancedInfo.mesh);
      state.raycaster.setFromCamera({ x: mx, y: my }, camera);
      const intersects = state.raycaster.intersectObjects(objects, true);
      if (intersects.length > 0) {
        const hit = intersects[0];
        if (hit.object && hit.object.isMesh && hit.instanceId !== undefined && state.instancedInfo) {
          const idx = hit.instanceId;
          const nodeId = state.instancedInfo.mapping[idx];
          const node = (nodes || []).find((n) => String(n.id) === String(nodeId));
          if (node) { showTransientLabelForNode(node); onNodeHover(node); } else { hideTransientLabels(); onNodeHover(null); }
        } else {
          const sprite = hit.object;
          const meta = sprite.userData.__meta;
          if (meta && meta.node) { showTransientLabelForNode(meta.node); onNodeHover(meta.node); } else { hideTransientLabels(); onNodeHover(null); }
        }
      } else {
        hideTransientLabels();
        onNodeHover(null);
      }
    }
    function onPointerUp() { state.dragging = false; }
    function onWheel(e) {
      e.preventDefault();
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const step = e.deltaY * 0.8;
      camera.position.addScaledVector(dir, step);
    }
    dom.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    dom.addEventListener("wheel", onWheel, { passive: false });

    // animate loop
    let last = performance.now();
    function animate() {
      const now = performance.now();
      const dt = (now - last) * 0.001;
      last = now;
      timeRef.current += dt;
      if (state.blackhole && state.blackhole.accMat) state.blackhole.accMat.uniforms.time.value = timeRef.current;

      scene.rotation.x += (state.rotation.x - scene.rotation.x) * 0.08 + dt * 0.006;
      scene.rotation.y += (state.rotation.y - scene.rotation.y) * 0.08 + dt * 0.005;

      if (state.distantGalaxies) {
        state.distantGalaxies.children.forEach((gg) => gg.rotation.z += (gg.userData.rotSpeed || 0.001) * (1 + 0.5 * Math.sin(now * 0.0002)));
      }

      if (state.blackhole) {
        const bh = state.blackhole;
        if (bh.group.visible) { bh.disk.rotation.z += dt * 0.08; }
      }
      if (state.ambientStars) {
        state.ambientStars.rotation.y += dt * 0.0035;
        state.ambientStars.rotation.x += dt * 0.0012;
      }
      if (state.instancedInfo && state.instancedInfo.mesh) {
        const mesh = state.instancedInfo.mesh;
        const tmp = new THREE.Object3D();
        for (let i = 0; i < state.instancedInfo.mapping.length; i++) {
          const node = state.instancedInfo.nodes[i];
          if (!node) continue;
          tmp.position.set(node.x, node.y, node.z);
          tmp.lookAt(camera.position);
          const base = node.baseSize || 6;
          const scale = node.highlight ? base * 2.0 : base * (node.active ? 1.0 : 0.75);
          tmp.scale.set(scale, scale, 1);
          tmp.updateMatrix();
          mesh.setMatrixAt(i, tmp.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }

      for (let i = state.eruptionParticles.length - 1; i >= 0; i--) {
        const p = state.eruptionParticles[i];
        p.age += dt;
        p.sprite.position.addScaledVector(p.dir, dt * p.speed);
        p.sprite.material.opacity = Math.max(0, 1 - p.age / p.life);
        if (p.age > p.life) {
          try {
            if (p.sprite.material.map) p.sprite.material.map.dispose();
            p.sprite.material.dispose();
            state.scene.remove(p.sprite);
          } catch {}
          state.eruptionParticles.splice(i, 1);
        }
      }

      state.composer.render();
      state.anim = requestAnimationFrame(animate);

      const camDist = camera.position.length();
      if (state.distantGalaxies) state.distantGalaxies.visible = camDist > 4200;
      if (state.blackhole) state.blackhole.group.visible = camDist > 3600;
    }
    state.anim = requestAnimationFrame(animate);

    // show a centered transient label for a node (on hover)
    function showTransientLabelForNode(node) {
      if (!node) return;
      hideTransientLabels();
      const map = state.spritesMap || {};
      const id = String(node.id);
      if (map[id]) {
        map[id].label.visible = true;
        map[id].label.renderOrder = 9999;
        return;
      }
      const cfg = (node.type === "main") ? labelConfigs.main : (node.type === "sub") ? labelConfigs.sub : labelConfigs.chunk;
      const color = (cfg && cfg.colorMode === "star") ? (node.color || "#000000") : "#000000";
      const size = (cfg && cfg.size) ? cfg.size : 14;
      const lblTex = makeLabelTexture(node.label || node.id, color, `${Math.round(size)}px Inter`);
      // ensure anisotropy for crispness if renderer available
      try {
        if (state && state.renderer && lblTex && typeof state.renderer.capabilities.getMaxAnisotropy === "function") {
          lblTex.anisotropy = state.renderer.capabilities.getMaxAnisotropy();
        }
      } catch (e) {}
      const lblMat = new THREE.SpriteMaterial({ map: lblTex, transparent: true, depthTest: false });
      const DPR = lblTex._dpr || 1;
      // scale in world units using CSS pixels (so DPR doesn't blur on zoom)
      const scaleX = (lblTex._cssWidth || (lblTex.image.width / DPR)) * 0.55;
      const scaleY = (lblTex._cssHeight || (lblTex.image.height / DPR)) * 0.55;
      const lblSprite = new THREE.Sprite(lblMat);
      lblSprite.scale.set(scaleX, scaleY, 1);
      // slightly above star
      const yOffset = Math.max(14, 0.9 * (node.baseScale || 28) );
      lblSprite.position.set(node.x || 0, (node.y || 0) + yOffset, node.z || 0.01);
      lblSprite.userData.__transient = true;
      lblSprite.renderOrder = 9999;
      state.scene.add(lblSprite);
      state._transientLabel = lblSprite;
    }

    function hideTransientLabels() {
      const map = state.spritesMap || {};
      Object.values(map).forEach((entry) => {
        if (!entry.meta || !entry.meta.highlight) {
          entry.label.visible = (entry.meta.node.type === "main") || (entry.meta.node.type === "chunk" && state.showAllChunks);
        }
      });
      if (state._transientLabel) {
        try {
          state.scene.remove(state._transientLabel);
          if (state._transientLabel.material && state._transientLabel.material.map) state._transientLabel.material.map.dispose();
        } catch {}
        state._transientLabel = null;
      }
    }

    // camera animate helper (closer stops)
    function animateCameraTo(node, fast = false, warp = false) {
      const start = camera.position.clone();
      const target = new THREE.Vector3(node.x || 0, node.y || 0, node.z || 0);
      const radius = node.type === "main" ? 260 : node.type === "sub" ? 170 : 108;
      const end = new THREE.Vector3(target.x, target.y, target.z + framingDistance(camera, radius));
      const dur = fast ? 420 : 820;
      const t0 = performance.now();

      if (warp && state.distantGalaxies) state.distantGalaxies.visible = true;

      (function tick() {
        const t = (performance.now() - t0) / dur;
        const a = Math.min(1, t);
        camera.position.lerpVectors(start, end, easeInOutCubic(a));
        camera.lookAt(target);
        if (a < 1) requestAnimationFrame(tick);
      })();
    }

    function highlightDocId(docId) {
      Object.values(state.spritesMap || {}).forEach((entry) => {
        const node = entry.meta.node;
        if (node && String(node.docId) === String(docId)) {
          entry.meta.highlight = true;
          entry.star.material.opacity = 1.0;
          entry.star.scale.set(entry.baseScale * 1.8, entry.baseScale * 1.8, 1);
          entry.label.visible = true;
        } else {
          entry.meta.highlight = false;
          entry.star.material.opacity = 0.12;
          entry.label.visible = (entry.meta.node.type === "main");
        }
      });
      if (state.instancedInfo) {
        state.instancedInfo.nodes.forEach((n) => { n.highlight = String(n.docId) === String(docId); });
      }
    }

    function highlightNodeNeighbors(nodeId) {
      const id = String(nodeId || "");
      const relatedNodes = new Set([id, ...((relatedNodeIds || []).map((item) => String(item)))]);
      const activeLinks = new Set((relatedLinkIds || []).map((item) => String(item)));
      Object.values(state.spritesMap || {}).forEach((entry) => {
        const entryId = String(entry.meta?.node?.id || "");
        const isHighlighted = relatedNodes.has(entryId);
        entry.meta.highlight = isHighlighted;
        entry.star.material.opacity = isHighlighted ? 1.0 : (id ? 0.16 : 1.0);
        const scale = isHighlighted ? entry.baseScale * (entryId === id ? 1.9 : 1.4) : entry.baseScale;
        entry.star.scale.set(scale, scale, 1);
        if (id) {
          entry.label.visible = isHighlighted || entry.meta.node.type === "main";
        }
      });
      (state.linkObjects || []).forEach((record) => {
        const isActive = !id || activeLinks.has(String(record.id));
        record.line.material.opacity = isActive ? (record.edgeType === "semantic" ? 0.98 : 0.8) : 0.06;
        record.line.material.color.set(isActive ? record.baseColor : 0x334155);
      });
    }

    function onClick(e) {
      const rect = dom.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      state.raycaster.setFromCamera({ x: mx, y: my }, camera);

      if (state.instancedInfo && state.instancedInfo.mesh) {
        const ints = state.raycaster.intersectObject(state.instancedInfo.mesh, true);
        if (ints.length > 0) {
          const inst = ints[0];
          const iid = inst.instanceId;
          const node = state.instancedInfo.nodes[iid];
          if (node) { animateCameraTo(node, false, false); onNodeClick(node); highlightNodeNeighbors(node.id); if (node.docId) highlightDocId(node.docId); return; }
        }
      }

      const spriteObjs = Object.values(state.spritesMap || {}).map((x) => x.star);
      const ints2 = state.raycaster.intersectObjects(spriteObjs, true);
      if (ints2.length > 0) {
        const sprite = ints2[0].object;
        const meta = sprite.userData.__meta;
        if (meta && meta.node) { animateCameraTo(meta.node, false, false); onNodeClick(meta.node); highlightNodeNeighbors(meta.node.id); if (meta.node.docId) highlightDocId(meta.node.docId); }
      }
    }
    const handleCanvasClick = (e) => {
      // If the interaction was a drag/rotate gesture, ignore click so we don't accidentally select/warp.
      if (stateRef.current?.didDrag) return;
      onClick(e);
    };
    dom.addEventListener("click", handleCanvasClick);

    // periodic eruptions (kept)
    function spawnEruptionFrom(nodeEntry) {
      const color = nodeEntry.meta.color || "#ffd9b3";
      const tex = makeStarTexture(color, 64, 0.0);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const spr = new THREE.Sprite(mat);
      spr.scale.set(8, 8, 1);
      spr.position.set(nodeEntry.container.position.x, nodeEntry.container.position.y, nodeEntry.container.position.z);
      state.scene.add(spr);
      const dir = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).normalize();
      state.eruptionParticles.push({ sprite: spr, dir, speed: 220 + Math.random() * 200, age: 0, life: 0.8 + Math.random() * 0.9 });
    }
    eruptionIntervalRef.current = setInterval(() => {
      const mains = Object.values(state.spritesMap).filter(e => e.meta.node.type === "main");
      if (!mains.length) return;
      const pick = Math.min(3, 1 + Math.floor(Math.random() * 3));
      for (let i = 0; i < pick; i++) {
        const idx = Math.floor(Math.random() * mains.length);
        spawnEruptionFrom(mains[idx]);
      }
    }, 1400);

    // keyboard controls (WASD / + - / F)
    function onKeyDown(e) {
      const s = stateRef.current;
      if (!s) return;
      const cam = s.camera;
      const moveStep = 120;
      const zoomStep = 180;
      const key = e.key.toLowerCase();
      if (key === "w") {
        const dir = new THREE.Vector3();
        cam.getWorldDirection(dir);
        cam.position.addScaledVector(dir, -moveStep);
      } else if (key === "s") {
        const dir = new THREE.Vector3();
        cam.getWorldDirection(dir);
        cam.position.addScaledVector(dir, moveStep);
      } else if (key === "a") {
        const left = new THREE.Vector3();
        cam.getWorldDirection(left);
        left.cross(cam.up).normalize();
        cam.position.addScaledVector(left, -moveStep);
      } else if (key === "d") {
        const right = new THREE.Vector3();
        cam.getWorldDirection(right);
        right.cross(cam.up).normalize();
        cam.position.addScaledVector(right, moveStep);
      } else if (key === "+" || key === "=") {
        const dir = new THREE.Vector3();
        cam.getWorldDirection(dir);
        cam.position.addScaledVector(dir, -zoomStep);
      } else if (key === "-") {
        const dir = new THREE.Vector3();
        cam.getWorldDirection(dir);
        cam.position.addScaledVector(dir, zoomStep);
      } else if (key === "f") {
        resetView();
      }
    }
    window.addEventListener("keydown", onKeyDown);

    function resetView() {
      const s = stateRef.current;
      if (!s) return;
      const cam = s.camera;
      const start = cam.position.clone();
      const end = s.defaultCamPos.clone();
      const lookTarget = s.defaultCamLook || new THREE.Vector3(0, 0, 0);
      const dur = 600;
      const t0 = performance.now();
      (function tick() {
        const t = (performance.now() - t0) / dur;
        const a = Math.min(1, t);
        cam.position.lerpVectors(start, end, easeInOutCubic(a));
        cam.lookAt(lookTarget);
        if (a < 1) requestAnimationFrame(tick);
      })();
      try {
        Object.values(s.spritesMap || {}).forEach((entry) => {
          entry.meta.highlight = false;
          if (entry.star) {
            entry.star.material.opacity = 1.0;
            entry.star.scale.set(entry.baseScale, entry.baseScale, 1);
          }
          if (entry.label) entry.label.visible = entry.meta.node && entry.meta.node.type === "main";
        });
        if (s.instancedInfo) s.instancedInfo.nodes.forEach((n) => { n.highlight = false; });
      } catch (e) {}
    }

    // cleanup on unmount
    return () => {
      cancelAnimationFrame(state.anim);
      window.removeEventListener("resize", onResize);
      dom.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      dom.removeEventListener("click", handleCanvasClick);
      dom.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      clearInterval(eruptionIntervalRef.current);
      try {
        Object.values(state.spritesMap || {}).forEach((entry) => {
          if (entry.star.material.map) entry.star.material.map.dispose();
          if (entry.label.material.map) entry.label.material.map.dispose();
          state.scene.remove(entry.container);
        });
        if (state.instancedInfo && state.instancedInfo.mesh) {
          state.scene.remove(state.instancedInfo.mesh);
          state.instancedInfo.mesh.geometry.dispose();
          state.instancedInfo.mesh.material.dispose();
        }
        (state.linkObjects || []).forEach((record) => {
          state.scene.remove(record.line);
          if (record.line.geometry) record.line.geometry.dispose();
          if (record.line.material) record.line.material.dispose();
        });
        if (state.distantGalaxies) {
          state.distantGalaxies.children.forEach((g) => { g.children.forEach((p) => { if (p.geometry) p.geometry.dispose(); if (p.material) p.material.dispose(); }); state.scene.remove(g); });
        }
        if (state.ambientStars) {
          state.scene.remove(state.ambientStars);
          state.ambientStars.geometry.dispose();
          state.ambientStars.material.dispose();
        }
        if (state.ambientPlanets) {
          state.ambientPlanets.children.forEach((planet) => {
            planet.children.forEach((child) => {
              if (child.geometry) child.geometry.dispose();
              if (child.material) child.material.dispose();
            });
          });
          state.scene.remove(state.ambientPlanets);
        }
        if (state.blackhole && state.blackhole.group) {
          state.scene.remove(state.blackhole.group);
        }
      } catch (e) {}
      try { mount.removeChild(renderer.domElement); } catch {}
      renderer.dispose();
    };
  }, []); // mount once

  // Update scene when nodes or visual props change
  useEffect(() => {
    const s = stateRef.current;
    if (!s || !s.scene) return;
    const scene = s.scene;
    s.showAllChunks = !!showAllChunks;

    const mainNodes = (nodes || []).filter((n) => n.type === "main");
    const subNodes = (nodes || []).filter((n) => n.type === "sub");
    const chunkNodes = (nodes || []).filter((n) => n.type === "chunk");

    function ensureSpriteFor(node, size, isMain = false) {
      const key = String(node.id);
      const cfg = isMain ? labelConfigs.main : (node.type === "sub" ? labelConfigs.sub : labelConfigs.chunk);
      const labelTextSize = cfg && cfg.size ? cfg.size : 14;
      const labelColorMode = cfg && cfg.colorMode ? cfg.colorMode : "star";

      if (s.spritesMap[key]) {
        const entry = s.spritesMap[key];
        entry.container.position.set(node.x || 0, node.y || 0, node.z || 0);
        // update star texture/color if changed
        if (entry.meta.color !== node.color || entry.meta.glow !== starGlow || entry.baseScale !== size) {
          try { if (entry.star.material.map) entry.star.material.map.dispose(); } catch {}
          const tex = makeStarTexture(node.color || "#fff", 128, Math.max(0, starGlow));
          entry.star.material.map = tex;
          entry.star.material.blending = (starGlow > 0) ? THREE.AdditiveBlending : THREE.NormalBlending;
          entry.star.material.needsUpdate = true;
          entry.meta.color = node.color;
          entry.meta.glow = starGlow;
          entry.baseScale = size;
          entry.star.scale.set(size, size, 1);
        }
        // update label texture
        try { if (entry.label && entry.label.material && entry.label.material.map) entry.label.material.map.dispose(); } catch {}
        const labelTextColor = labelColorMode === "star" ? (node.color || "#000000") : "#000000";
        const lblTex = makeLabelTexture(node.label || node.id, labelTextColor, `${Math.round(labelTextSize)}px Inter`);
        try {
          if (s && s.renderer && typeof s.renderer.capabilities.getMaxAnisotropy === "function") lblTex.anisotropy = s.renderer.capabilities.getMaxAnisotropy();
        } catch {}
        if (entry.label && entry.label.material) {
          entry.label.material.map = lblTex;
          entry.label.material.needsUpdate = true;
          const DPR = lblTex._dpr || 1;
          const scaleX = (lblTex._cssWidth || (lblTex.image.width / DPR)) * 0.55;
          const scaleY = (lblTex._cssHeight || (lblTex.image.height / DPR)) * 0.55;
          entry.label.scale.set(scaleX, scaleY, 1);
          const yOffset = Math.max(10, entry.baseScale * 0.9);
          entry.label.position.set(0, yOffset, 0.01);
        }
        // label visibility logic
        if (entry.meta.highlight) entry.label.visible = true;
        else if (entry.meta.node.type === "main") entry.label.visible = labelConfigs.main.visible;
        else if (entry.meta.node.type === "sub") entry.label.visible = (labelConfigs.sub.visible);
        else if (entry.meta.node.type === "chunk") entry.label.visible = (s.showAllChunks || labelConfigs.chunk.visible);
      } else {
        // create star sprite
        const tex = makeStarTexture(node.color || "#fff", 128, Math.max(0, starGlow));
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: (starGlow > 0) ? THREE.AdditiveBlending : THREE.NormalBlending });
        const star = new THREE.Sprite(mat);
        const baseScale = size;
        star.scale.set(baseScale, baseScale, 1);
        star.renderOrder = 1;

        // label sprite
        const cfg = isMain ? labelConfigs.main : (node.type === "sub" ? labelConfigs.sub : labelConfigs.chunk);
        const labelTextSize = cfg && cfg.size ? cfg.size : 14;
        const labelColorMode = cfg && cfg.colorMode ? cfg.colorMode : "star";
        const labelTextColor = labelColorMode === "star" ? (node.color || "#000000") : "#000000";
        const lblTex = makeLabelTexture(node.label || node.id, labelTextColor, `${Math.round(labelTextSize)}px Inter`);
        try {
          if (s && s.renderer && typeof s.renderer.capabilities.getMaxAnisotropy === "function") lblTex.anisotropy = s.renderer.capabilities.getMaxAnisotropy();
        } catch {}
        const lblMat = new THREE.SpriteMaterial({ map: lblTex, transparent: true, depthTest: false });
        const label = new THREE.Sprite(lblMat);

        // use CSS pixel-based scaling (account for DPR baked into texture)
        const DPR = lblTex._dpr || 1;
        const scaleX = (lblTex._cssWidth || (lblTex.image.width / DPR)) * 0.55;
        const scaleY = (lblTex._cssHeight || (lblTex.image.height / DPR)) * 0.55;
        label.scale.set(scaleX, scaleY, 1);

        // position label slightly above star
        const yOffset = Math.max(12, baseScale * 0.9);
        label.position.set(0, yOffset, 0.01);
        label.renderOrder = 9999;

        // default label visibility
        let initialVisible = false;
        if (isMain) initialVisible = !!labelConfigs.main.visible;
        else if (node.type === "sub") initialVisible = !!labelConfigs.sub.visible;
        else if (node.type === "chunk") initialVisible = !!(s.showAllChunks || labelConfigs.chunk.visible);

        label.visible = initialVisible;

        const container = new THREE.Object3D();
        container.add(star);
        container.add(label);
        container.position.set(node.x || 0, node.y || 0, node.z || 0);

        star.userData.__meta = { node, id: String(node.id) };
        scene.add(container);
        s.spritesMap[String(node.id)] = { container, star, label, meta: { node, highlight: false, color: node.color, glow: starGlow }, baseScale };
      }
    }

    // sizes: main:120, sub:60, chunk:32 (slightly reduced per your "little bit" ask)
    mainNodes.forEach((m) => ensureSpriteFor(m, 120, true));
    subNodes.forEach((sn) => ensureSpriteFor(sn, 60, false));
    const CHUNK_SIZE = 32;
    chunkNodes.forEach((cnode) => ensureSpriteFor(cnode, CHUNK_SIZE, false));

    // cleanup orphans
    const keep = new Set([...mainNodes.map((m) => String(m.id)), ...subNodes.map((m) => String(m.id)), ...chunkNodes.map((c) => String(c.id))]);
    Object.keys(s.spritesMap).forEach((id) => {
      if (!keep.has(id)) {
        const rec = s.spritesMap[id];
        try {
          if (rec.star.material.map) rec.star.material.map.dispose();
          if (rec.label.material.map) rec.label.material.map.dispose();
        } catch {}
        try { scene.remove(rec.container); } catch {}
        delete s.spritesMap[id];
      }
    });

    (s.linkObjects || []).forEach((record) => {
      try {
        scene.remove(record.line);
        record.line.geometry.dispose();
        record.line.material.dispose();
      } catch (e) {}
    });
    s.linkObjects = [];

    const positionsById = new Map();
    [...mainNodes, ...subNodes, ...chunkNodes].forEach((node) => {
      positionsById.set(String(node.id), new THREE.Vector3(node.x || 0, node.y || 0, node.z || 0));
    });
    (links || []).forEach((link) => {
      const sourceId = String((typeof link.source === "string" ? link.source : link.source?.id) || "");
      const targetId = String((typeof link.target === "string" ? link.target : link.target?.id) || "");
      const source = positionsById.get(sourceId);
      const target = positionsById.get(targetId);
      if (!source || !target) return;
      const geometry = new THREE.BufferGeometry().setFromPoints([source, target]);
      const semantic = (link.edge_type || "") === "semantic";
      const highlighted = selectedNodeId && (relatedLinkIds || []).map((item) => String(item)).includes(String(link.id || `${sourceId}->${targetId}`));
      const baseColor = neonColorForLink(link, !!highlighted);
      const material = new THREE.LineBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: selectedNodeId ? (highlighted ? (semantic ? 0.98 : 0.8) : 0.06) : (semantic ? 0.48 : 0.24),
        blending: THREE.AdditiveBlending,
        linewidth: Math.max(1, Number(link.stroke_width || (semantic ? 3 : 2))),
      });
      material.toneMapped = false;
      const line = new THREE.Line(geometry, material);
      line.renderOrder = semantic ? 2 : 0;
      scene.add(line);
      s.linkObjects.push({ id: String(link.id || `${sourceId}->${targetId}`), edgeType: semantic ? "semantic" : "structural", baseColor, line });
    });

    // showAllChunks behavior & fit
    if (s.showAllChunks) {
      const chunkEntries = Object.values(s.spritesMap).filter(e => e.meta && e.meta.node && e.meta.node.type === "chunk");
      chunkEntries.forEach((entry) => {
        entry.label.visible = true;
        entry.star.material.opacity = 1.0;
        entry.star.scale.set(entry.baseScale, entry.baseScale, 1);
      });
      if (chunkEntries.length) {
        let cx = 0, cy = 0, cz = 0;
        chunkEntries.forEach((entry) => {
          cx += entry.container.position.x; cy += entry.container.position.y; cz += entry.container.position.z;
        });
        const center = new THREE.Vector3(cx / chunkEntries.length, cy / chunkEntries.length, cz / chunkEntries.length);
        let maxDist = 0;
        chunkEntries.forEach((entry) => {
          const d = center.distanceTo(entry.container.position);
          if (d > maxDist) maxDist = d;
        });
        setTimeout(() => { s._fitTarget = { center, radius: Math.max(200, maxDist) }; }, 50);
      }
    } else {
      Object.values(s.spritesMap).forEach((entry) => {
        if (entry.meta && entry.meta.node && entry.meta.node.type === "chunk") {
          if (!entry.meta.highlight) {
            entry.label.visible = !!labelConfigs.chunk.visible;
            entry.star.material.opacity = 0.95;
            entry.star.scale.set(entry.baseScale, entry.baseScale, 1);
          }
        }
      });
      s._fitTarget = null;
    }

    stateRef.current = s;
  }, [nodes, links, selectedNodeId, relatedNodeIds, relatedLinkIds, showAllChunks, starGlow, labelConfigs]);

  // fit camera when _fitTarget is set (showAllChunks or fitSelection)
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    if (s._fitTarget) {
      const { center, radius } = s._fitTarget;
      const cam = s.camera;
      const start = cam.position.clone();
      const end = new THREE.Vector3(center.x, center.y, center.z + Math.max(400, radius * 2.0));
      const dur = 900;
      const t0 = performance.now();
      (function tick() {
        const t = (performance.now() - t0) / dur;
        const a = Math.min(1, t);
        cam.position.lerpVectors(start, end, easeInOutCubic(a));
        cam.lookAt(center);
        if (a < 1) requestAnimationFrame(tick);
      })();
      s._fitTarget = null;
    }
  }, [showAllChunks, nodes]);

  // focusDocId effect -> camera + highlight (uses closer distance)
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    if (!focusDocId) return;

    const matchEntry = Object.values(s.spritesMap || {}).find((e) => e.meta && String(e.meta.node.docId) === String(focusDocId));
    if (matchEntry) {
      const node = matchEntry.meta.node;
      const cam = s.camera;
      const start = cam.position.clone();
      const target = new THREE.Vector3(node.x || 0, node.y || 0, node.z || 0);
      const end = new THREE.Vector3(target.x, target.y, target.z + framingDistance(cam, 108));
      const dur = 900;
      const t0 = performance.now();
      (function tick() {
        const t = (performance.now() - t0) / dur;
        const a = Math.min(1, t);
        cam.position.lerpVectors(start, end, easeInOutCubic(a));
        cam.lookAt(target);
        if (a < 1) requestAnimationFrame(tick);
      })();
      Object.values(s.spritesMap).forEach((entry) => {
        const n = entry.meta.node;
        if (n && String(n.docId) === String(focusDocId)) {
          entry.meta.highlight = true;
          entry.star.material.opacity = 1.0;
          entry.star.scale.set(entry.baseScale * 1.8, entry.baseScale * 1.8, 1);
          entry.label.visible = true;
        } else {
          entry.meta.highlight = false;
          entry.star.material.opacity = 0.12;
          entry.label.visible = entry.meta.node.type === "main";
        }
      });
      if (s.instancedInfo) s.instancedInfo.nodes.forEach((n) => n.highlight = String(n.docId) === String(focusDocId));
      return;
    }

    if (s.instancedInfo && s.instancedInfo.nodes) {
      const idx = s.instancedInfo.nodes.findIndex((n) => String(n.docId) === String(focusDocId));
      if (idx >= 0) {
        const node = s.instancedInfo.nodes[idx];
        const cam = s.camera;
        const start = cam.position.clone();
        const target = new THREE.Vector3(node.x || 0, node.y || 0, node.z || 0);
        const end = new THREE.Vector3(target.x, target.y, target.z + framingDistance(cam, 108));
        const dur = 850;
        const t0 = performance.now();
        (function tick() {
          const t = (performance.now() - t0) / dur;
          const a = Math.min(1, t);
          cam.position.lerpVectors(start, end, easeInOutCubic(a));
          cam.lookAt(target);
          if (a < 1) requestAnimationFrame(tick);
        })();
        s.instancedInfo.nodes.forEach((n) => n.highlight = String(n.docId) === String(focusDocId));
      }
    }
  }, [focusDocId]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s || !focusNodeId) return;
    const matchEntry = Object.values(s.spritesMap || {}).find((entry) => String(entry.meta?.node?.id || "") === String(focusNodeId));
    if (matchEntry?.meta?.node) {
      const node = matchEntry.meta.node;
      const target = new THREE.Vector3(node.x || 0, node.y || 0, node.z || 0);
      const cam = s.camera;
      const start = cam.position.clone();
      const radius = node.type === "main" ? 260 : node.type === "sub" ? 170 : 108;
      const end = new THREE.Vector3(target.x, target.y, target.z + framingDistance(cam, radius));
      const t0 = performance.now();
      const dur = 720;
      (function tick() {
        const t = (performance.now() - t0) / dur;
        const a = Math.min(1, t);
        cam.position.lerpVectors(start, end, easeInOutCubic(a));
        cam.lookAt(target);
        if (a < 1) requestAnimationFrame(tick);
      })();
    }
  }, [focusNodeId]);

  // warpToNodeId dramatic warp (keeps existing behavior; distances reduced)
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    if (!warpToNodeId) return;

    const matchEntry = Object.values(s.spritesMap).find((e) => e.meta && String(e.meta.node.docId) === String(warpToNodeId));
    if (matchEntry) {
      const node = matchEntry.meta.node;
      const cam = s.camera;
      const originalFOV = cam.fov;
      const t0 = performance.now();
      const dur = 520;
      if (s.distantGalaxies) { s.distantGalaxies.visible = true; s.distantGalaxies.scale.set(1.6,1.6,1.6); }
      (function tick() {
        const t = (performance.now() - t0) / dur;
        const a = Math.min(1, t);
        cam.fov = originalFOV + 30 * Math.sin(Math.PI * easeInOutCubic(a));
        cam.updateProjectionMatrix();
        if (a < 1) requestAnimationFrame(tick);
        else {
          const start = cam.position.clone();
          const target = new THREE.Vector3(node.x || 0, node.y || 0, node.z || 0);
          const dir = new THREE.Vector3().subVectors(start, target).normalize();
          const dist = 180;
          const end = new THREE.Vector3().addVectors(target, dir.multiplyScalar(dist));
          const t0b = performance.now();
          const durb = 520;
          (function tick2() {
            const t2 = (performance.now() - t0b) / durb;
            const a2 = Math.min(1, t2);
            cam.position.lerpVectors(start, end, easeInOutCubic(a2));
            cam.lookAt(target);
            if (a2 < 1) requestAnimationFrame(tick2);
            else {
              const t0c = performance.now();
              const durc = 500;
              (function restore() {
                const t3 = (performance.now() - t0c) / durc;
                const a3 = Math.min(1, t3);
                cam.fov = originalFOV + 30 * (1 - easeInOutCubic(a3));
                cam.updateProjectionMatrix();
                if (a3 < 1) requestAnimationFrame(restore);
                else {
                  if (s.distantGalaxies) { s.distantGalaxies.visible = false; s.distantGalaxies.scale.set(1,1,1); }
                }
              })();
            }
          })();
        }
      })();
      // highlight
      Object.values(s.spritesMap).forEach((entry) => {
        const n = entry.meta.node;
        if (n && String(n.docId) === String(warpToNodeId)) {
          entry.meta.highlight = true;
          entry.star.material.opacity = 1.0;
          entry.star.scale.set(entry.baseScale * 1.8, entry.baseScale * 1.8, 1);
          entry.label.visible = true;
        } else {
          entry.meta.highlight = false;
          entry.star.material.opacity = 0.12;
          entry.label.visible = entry.meta.node.type === "main";
        }
      });
      if (s.instancedInfo) s.instancedInfo.nodes.forEach((n) => n.highlight = String(n.docId) === String(warpToNodeId));
      return;
    }
    if (s.instancedInfo && s.instancedInfo.nodes) {
      const idx = s.instancedInfo.nodes.findIndex((n) => String(n.docId) === String(warpToNodeId));
      if (idx >= 0) {
        const node = s.instancedInfo.nodes[idx];
        const cam = s.camera;
        const originalFOV = cam.fov;
        const t0 = performance.now();
        const dur = 520;
        if (s.distantGalaxies) { s.distantGalaxies.visible = true; s.distantGalaxies.scale.set(1.6,1.6,1.6); }
        (function tick() {
          const t = (performance.now() - t0) / dur;
          const a = Math.min(1, t);
          cam.fov = originalFOV + 30 * Math.sin(Math.PI * easeInOutCubic(a));
          cam.updateProjectionMatrix();
          if (a < 1) requestAnimationFrame(tick);
          else {
            const start = cam.position.clone();
            const target = new THREE.Vector3(node.x || 0, node.y || 0, node.z || 0);
            const dir = new THREE.Vector3().subVectors(start, target).normalize();
            const dist = 220;
            const end = new THREE.Vector3().addVectors(target, dir.multiplyScalar(dist));
            const t0b = performance.now();
            const durb = 520;
            (function tick2() {
              const t2 = (performance.now() - t0b) / durb;
              const a2 = Math.min(1, t2);
              cam.position.lerpVectors(start, end, easeInOutCubic(a2));
              cam.lookAt(target);
              if (a2 < 1) requestAnimationFrame(tick2);
              else {
                const t0c = performance.now();
                const durc = 500;
                (function restore() {
                  const t3 = (performance.now() - t0c) / durc;
                  const a3 = Math.min(1, t3);
                  cam.fov = originalFOV + 30 * (1 - easeInOutCubic(a3));
                  cam.updateProjectionMatrix();
                  if (a3 < 1) requestAnimationFrame(restore);
                  else {
                    if (s.distantGalaxies) { s.distantGalaxies.visible = false; s.distantGalaxies.scale.set(1,1,1); }
                  }
                })();
              }
            })();
          }
        })();
        s.instancedInfo.nodes.forEach((n) => n.highlight = String(n.docId) === String(warpToNodeId));
      }
    }
  }, [warpToNodeId, starGlow, labelConfigs]);

  // reset effect (listens to resetSignal)
  useEffect(() => {
    const s = stateRef.current;
    if (!s || !s.camera || !s.defaultCamPos) return;
    const cam = s.camera;
    const start = cam.position.clone();
    const end = s.defaultCamPos.clone();
    const lookTarget = s.defaultCamLook || new THREE.Vector3(0, 0, 0);
    const dur = 900;
    const t0 = performance.now();
    (function tick() {
      const t = (performance.now() - t0) / dur;
      const a = Math.min(1, t);
      cam.position.lerpVectors(start, end, easeInOutCubic(a));
      cam.lookAt(lookTarget);
      if (a < 1) requestAnimationFrame(tick);
    })();

    // un-highlight nodes
    try {
      Object.values(s.spritesMap || {}).forEach((entry) => {
        entry.meta.highlight = false;
        if (entry.star) {
          entry.star.material.opacity = 1.0;
          entry.star.scale.set(entry.baseScale, entry.baseScale, 1);
        }
        if (entry.label) entry.label.visible = entry.meta.node && entry.meta.node.type === "main";
      });
      if (s.instancedInfo) s.instancedInfo.nodes.forEach((n) => { n.highlight = false; });
    } catch (e) {}
  }, [resetSignal]);

  return <div ref={mountRef} style={{ width: "100%", height: "100vh", position: "relative" }} className={styles.HCKB_canvasMount} />;
}
