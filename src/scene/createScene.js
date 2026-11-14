import * as THREE from "three";

/**
 * Scene pemantau: rel, jalan bertingkat, JPO, kereta, kamera.
 * Semua material bangunan memakai tiga material bersama supaya warna bisa diganti langsung.
 */
export function createScene(canvas, stage, labelBox) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: import.meta.env.DEV });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 2.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060906);
  scene.fog = new THREE.Fog(0x070b07, 300, 720);

  /* ---- rel ---- */
  const railCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-160, 0, -104),
    new THREE.Vector3(-96, 0, -46),
    new THREE.Vector3(-44, 0, -18),
    new THREE.Vector3(0, 0, 4),
    new THREE.Vector3(48, 0, 26),
    new THREE.Vector3(100, 0, 62),
    new THREE.Vector3(158, 0, 116),
  ]);

  const camera = new THREE.PerspectiveCamera(44, 1, 1, 1600);
  const focus = railCurve.getPointAt(0.42);
  const camBase = new THREE.Vector3(focus.x + 10, 138, focus.z + 196);
  camera.position.copy(camBase);
  camera.lookAt(focus);

  scene.add(new THREE.HemisphereLight(0xdfe6da, 0x333a2c, 2.2));
  const key = new THREE.DirectionalLight(0xf2f8ea, 2.6);
  key.position.set(-70, 130, 60);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8a9c80, 0.85);
  rim.position.set(90, 60, -80);
  scene.add(rim);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1100, 1100),
    new THREE.MeshLambertMaterial({ color: 0x2b3427 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const railMat = new THREE.MeshLambertMaterial({ color: 0xd6dfcd, emissive: 0x3a4436, emissiveIntensity: 1 });
  const railGeo = new THREE.TubeGeometry(railCurve, 320, 0.22, 5, false);
  for (const side of [-0.95, 0.95]) {
    const m = new THREE.Mesh(railGeo.clone(), railMat);
    m.position.y = 0.28;
    const n = railCurve.getTangentAt(0.5);
    m.position.x += -n.z * side;
    m.position.z += n.x * side;
    scene.add(m);
  }
  const coreTube = new THREE.Mesh(
    new THREE.TubeGeometry(railCurve, 320, 0.34, 6, false),
    new THREE.MeshBasicMaterial({ color: 0xf4f9ec })
  );
  coreTube.position.y = 0.32;
  scene.add(coreTube);

  const glowTube = new THREE.Mesh(
    new THREE.TubeGeometry(railCurve, 320, 1.15, 6, false),
    new THREE.MeshBasicMaterial({ color: 0xe9f0df, transparent: true, opacity: 0.09 })
  );
  glowTube.position.y = 0.34;
  scene.add(glowTube);

  const ties = new THREE.InstancedMesh(
    new THREE.BoxGeometry(3.2, 0.1, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x4b5443 }),
    260
  );
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 260; i++) {
    const t = i / 260;
    const p = railCurve.getPointAt(t);
    const tan = railCurve.getTangentAt(t);
    dummy.position.set(p.x, 0.14, p.z);
    dummy.rotation.set(0, Math.atan2(tan.x, tan.z), 0);
    dummy.updateMatrix();
    ties.setMatrixAt(i, dummy.matrix);
  }
  scene.add(ties);

  /* ---- jalan ---- */
  function ribbonGeo(curve, halfW, y, segs = 220) {
    const yOf = typeof y === "function" ? y : () => y;
    const pos = [];
    const idx = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const nx = -tan.z;
      const nz = tan.x;
      const yy = yOf(t);
      pos.push(p.x + nx * halfW, yy, p.z + nz * halfW, p.x - nx * halfW, yy, p.z - nz * halfW);
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function offsetPts(base, dist, n = 10, t0 = 0.02, t1 = 0.98) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = t0 + ((t1 - t0) * i) / n;
      const p = base.getPointAt(t);
      const tan = base.getTangentAt(t);
      pts.push(new THREE.Vector3(p.x - tan.z * dist, 0, p.z + tan.x * dist));
    }
    return pts;
  }

  const tolCurve = new THREE.CatmullRomCurve3(offsetPts(railCurve, 48, 12, 0.01, 0.99));
  const artCurve = new THREE.CatmullRomCurve3(offsetPts(railCurve, 33, 12, 0.01, 0.99));
  const locCurve = new THREE.CatmullRomCurve3(offsetPts(railCurve, -27, 7, 0.14, 0.64));
  const gangCurve = new THREE.CatmullRomCurve3(offsetPts(railCurve, -40, 6, 0.28, 0.56));

  const roadDefs = [
    { curve: tolCurve, half: 9.5, y: 13.2, color: 0x3a4236, elev: true, dashes: true },
    { curve: artCurve, half: 6, y: 0.3, color: 0x30382c, elev: false, dashes: true },
    { curve: locCurve, half: 3.1, y: 0.22, color: 0x2a3126, elev: false, dashes: false },
    { curve: gangCurve, half: 1.15, y: 0.16, color: 0x514f40, elev: false, dashes: false },
  ];

  const dashMat = new THREE.MeshBasicMaterial({ color: 0xc9d0bd, transparent: true, opacity: 0.38 });
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x424a36 });
  const capMat = new THREE.MeshLambertMaterial({ color: 0x4c5540 });

  for (const rd of roadDefs) {
    const yOf = rd.yFn || (() => rd.y);
    scene.add(new THREE.Mesh(ribbonGeo(rd.curve, rd.half, yOf), new THREE.MeshLambertMaterial({ color: rd.color })));

    for (const side of [-1, 1]) {
      const pts = [];
      for (let t = 0; t <= 1; t += 0.01) {
        const p = rd.curve.getPointAt(t);
        const tan = rd.curve.getTangentAt(t);
        pts.push(
          new THREE.Vector3(
            p.x - tan.z * (rd.half - 0.12) * side,
            yOf(t) + 0.03,
            p.z + tan.x * (rd.half - 0.12) * side
          )
        );
      }
      scene.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: 0xd3dabc, transparent: true, opacity: rd.elev ? 0.5 : 0.3 })
        )
      );
    }

    if (rd.dashes) {
      const n = 90;
      const dash = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.04, 2.2), dashMat, n);
      const d = new THREE.Object3D();
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const p = rd.curve.getPointAt(t);
        const tan = rd.curve.getTangentAt(t);
        d.position.set(p.x, yOf(t) + 0.05, p.z);
        d.rotation.set(0, Math.atan2(tan.x, tan.z), 0);
        d.updateMatrix();
        dash.setMatrixAt(i, d.matrix);
      }
      scene.add(dash);
    }

    if (rd.elev) {
      for (let t = 0.04; t < 0.99; t += 0.055) {
        const p = rd.curve.getPointAt(t);
        const pier = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.85, rd.y - 1.1, 10), pierMat);
        pier.position.set(p.x, (rd.y - 1.1) / 2, p.z);
        scene.add(pier);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1, 5.6), capMat);
        cap.position.set(p.x, rd.y - 0.55, p.z);
        scene.add(cap);
        const mast = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.16, 3.2, 6),
          new THREE.MeshLambertMaterial({ color: 0x59634c })
        );
        mast.position.set(p.x, rd.y + 1.6, p.z);
        scene.add(mast);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), new THREE.MeshBasicMaterial({ color: 0xf6d3a0 }));
        lamp.position.set(p.x, rd.y + 3.3, p.z);
        scene.add(lamp);
        const halo = new THREE.Mesh(
          new THREE.CircleGeometry(5.5, 20),
          new THREE.MeshBasicMaterial({ color: 0xe8c08a, transparent: true, opacity: 0.07 })
        );
        halo.rotation.x = -Math.PI / 2;
        halo.position.set(p.x, rd.y + 0.04, p.z);
        scene.add(halo);
      }
      for (const side of [-1, 1]) {
        const railPts = [];
        for (let t = 0; t <= 1; t += 0.02) {
          const p = rd.curve.getPointAt(t);
          const tan = rd.curve.getTangentAt(t);
          railPts.push(new THREE.Vector3(p.x - tan.z * rd.half * side, rd.y + 0.55, p.z + tan.x * rd.half * side));
        }
        scene.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(railPts),
            new THREE.LineBasicMaterial({ color: 0x8f9a82, transparent: true, opacity: 0.55 })
          )
        );
      }
    }
  }

  /* rampa simpang susun */
  function makeRamp(tTol, tArt, naik, side) {
    const A = tolCurve.getPointAt(tTol);
    const B = artCurve.getPointAt(tArt);
    const mid = new THREE.Vector3((A.x + B.x) / 2, 0, (A.z + B.z) / 2);
    const dir = new THREE.Vector3(B.x - A.x, 0, B.z - A.z).normalize();
    mid.x += -dir.z * side * 26;
    mid.z += dir.x * side * 26;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(A.x, 0, A.z),
      new THREE.Vector3((A.x + mid.x) / 2, 0, (A.z + mid.z) / 2),
      mid,
      new THREE.Vector3((B.x + mid.x) / 2, 0, (B.z + mid.z) / 2),
      new THREE.Vector3(B.x, 0, B.z),
    ]);
    const yFn = naik
      ? (t) => 0.34 + 12.6 * Math.pow(t, 1.55)
      : (t) => 13.2 - 12.86 * Math.pow(t, 1.55);
    scene.add(new THREE.Mesh(ribbonGeo(curve, 4.2, yFn), new THREE.MeshLambertMaterial({ color: 0x39412f })));
    for (const s of [-1, 1]) {
      const pts = [];
      for (let t = 0; t <= 1; t += 0.02) {
        const p = curve.getPointAt(t);
        const tan = curve.getTangentAt(t);
        pts.push(new THREE.Vector3(p.x - tan.z * 4.05 * s, yFn(t) + 0.55, p.z + tan.x * 4.05 * s));
      }
      scene.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: 0xbfcaa8, transparent: true, opacity: 0.45 })
        )
      );
    }
    for (let t = 0.12; t < 0.9; t += 0.14) {
      const y = yFn(t);
      if (y < 1.2) continue;
      const p = curve.getPointAt(t);
      const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, y, 8), new THREE.MeshLambertMaterial({ color: 0x3d4533 }));
      pier.position.set(p.x, y / 2, p.z);
      scene.add(pier);
    }
    return curve;
  }
  makeRamp(0.72, 0.86, false, 1);
  makeRamp(0.34, 0.46, true, -1);

  /* JPO */
  {
    const t = 0.485;
    const p = railCurve.getPointAt(t);
    const tan = railCurve.getTangentAt(t);
    const yaw = Math.atan2(tan.x, tan.z);
    const g = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.45, 34), new THREE.MeshLambertMaterial({ color: 0x6b7a5e }));
    deck.position.y = 6.4;
    g.add(deck);
    for (const side of [-1, 1]) {
      const rail1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.3, 34), new THREE.MeshLambertMaterial({ color: 0x93a184 }));
      rail1.position.set(side * 1.72, 7.05, 0);
      g.add(rail1);
      const stair = new THREE.Mesh(new THREE.BoxGeometry(2.6, 5.2, 5.2), new THREE.MeshLambertMaterial({ color: 0x454f3d }));
      stair.position.set(0, 3.2, side * 17.2);
      stair.rotation.x = side * 0.22;
      g.add(stair);
      const sl = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.6), new THREE.MeshBasicMaterial({ color: 0xf0d3a0 }));
      sl.position.set(0, 6.9, side * 14.6);
      g.add(sl);
    }
    g.position.set(p.x, 0, p.z);
    g.rotation.y = yaw;
    scene.add(g);
  }

  /* ---- bangunan (warna bisa diubah) ---- */
  const buildingMats = {
    low: new THREE.MeshLambertMaterial({ color: 0x252d20 }),
    mid: new THREE.MeshLambertMaterial({ color: 0x2f3728 }),
    high: new THREE.MeshLambertMaterial({ color: 0x3a4432 }),
  };
  const winMat = new THREE.MeshBasicMaterial({ color: 0xe8c98a, transparent: true, opacity: 0.55 });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xd9a24b });

  for (let gx = -118; gx <= 118; gx += 11) {
    for (let gz = -116; gz <= 112; gz += 11) {
      let near = 999;
      for (let s = 0; s <= 1; s += 0.05) {
        const p = railCurve.getPointAt(s);
        near = Math.min(near, Math.hypot(p.x - gx, p.z - gz));
      }
      if (near < 12) continue;
      let onRoad = false;
      for (const rd of roadDefs) {
        for (let s = 0; s <= 1; s += 0.08) {
          const q = rd.curve.getPointAt(s);
          if (Math.hypot(q.x - gx, q.z - gz) < rd.half + 5) {
            onRoad = true;
            break;
          }
        }
        if (onRoad) break;
      }
      if (onRoad) continue;
      if (Math.random() < 0.14) continue;
      const w = 6 + Math.random() * 7;
      const d = 6 + Math.random() * 7;
      const h = 2 + Math.pow(Math.random(), 2.2) * 26;
      const tone = h > 18 ? buildingMats.high : h > 9 ? buildingMats.mid : buildingMats.low;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), tone);
      b.position.set(gx + (Math.random() - 0.5) * 3, h / 2, gz + (Math.random() - 0.5) * 3);
      scene.add(b);
      if (h > 8 && Math.random() < 0.55) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 0.28, d * 0.86), winMat);
        win.position.set(b.position.x, 1.6 + Math.random() * (h - 3), b.position.z);
        scene.add(win);
        if (Math.random() < 0.4) {
          const win2 = win.clone();
          win2.position.y = Math.min(h - 1.2, win.position.y + 2.4 + Math.random() * 4);
          scene.add(win2);
        }
      }
      if (h > 14 && Math.random() < 0.5) {
        const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.5), lightMat);
        beacon.position.set(b.position.x, h + 0.2, b.position.z);
        scene.add(beacon);
      }
    }
  }

  /* ---- stasiun ---- */
  const stations = [
    { p: 0.16, name: "Bekasi" },
    { p: 0.42, name: "Jatinegara" },
    { p: 0.58, name: "Manggarai" },
    { p: 0.71, name: "Gambir" },
  ];
  const anchors = [];
  const platMat = new THREE.MeshLambertMaterial({ color: 0x3b463a });
  for (const s of stations) {
    const p = railCurve.getPointAt(s.p);
    const tan = railCurve.getTangentAt(s.p);
    const plt = new THREE.Mesh(new THREE.BoxGeometry(26, 0.9, 7), platMat);
    plt.position.set(p.x, 0.85, p.z);
    plt.rotation.y = Math.atan2(tan.x, tan.z);
    scene.add(plt);
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(9, 28),
      new THREE.MeshBasicMaterial({ color: 0xd9a24b, transparent: true, opacity: 0.055 })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(p.x, 0.05, p.z);
    scene.add(pool);
    anchors.push({ kind: "station", label: s.name, pos: new THREE.Vector3(p.x, 6, p.z) });
  }

  /* ---- kamera ---- */
  const camPoleMat = new THREE.MeshLambertMaterial({ color: 0x39423a });
  const camHeadGeo = new THREE.BoxGeometry(1.5, 1.1, 1.5);
  const camOn = new THREE.MeshBasicMaterial({ color: 0x53a870 });
  const camOff = new THREE.MeshBasicMaterial({ color: 0x5d685c });
  let selRing = null;
  for (let i = 0; i < 22; i++) {
    const t = 0.06 + i * 0.041;
    if (t > 0.98) break;
    const p = railCurve.getPointAt(t);
    const tan = railCurve.getTangentAt(t);
    const side = i % 2 ? 1 : -1;
    const off = 13 + (i % 3) * 5;
    const x = p.x - tan.z * off * side;
    const z = p.z + tan.x * off * side;
    const h = 6 + (i % 4);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, h, 6), camPoleMat);
    pole.position.set(x, h / 2, z);
    scene.add(pole);
    const live = i % 6 !== 5;
    const head = new THREE.Mesh(camHeadGeo, live ? camOn : camOff);
    head.position.set(x, h + 0.35, z);
    scene.add(head);
    if (i === 3) {
      selRing = new THREE.Mesh(
        new THREE.TorusGeometry(2.2, 0.08, 6, 40),
        new THREE.MeshBasicMaterial({ color: 0xd9a24b, transparent: true, opacity: 0.9 })
      );
      selRing.rotation.x = Math.PI / 2;
      selRing.position.set(x, 0.6, z);
      scene.add(selRing);
      anchors.push({ kind: "cam", label: "Jl Chairil Anwar", pos: new THREE.Vector3(x, h + 1.6, z) });
    }
  }

  anchors.push({ kind: "road", label: "TOL JAGORAWI", pos: tolCurve.getPointAt(0.62).clone().setY(15) });
  anchors.push({ kind: "road", label: "JL. CHAIRIL ANWAR", pos: artCurve.getPointAt(0.3).clone().setY(2.6) });
  anchors.push({ kind: "road", label: "GANG 1 MOBIL", pos: gangCurve.getPointAt(0.62).clone().setY(2.2) });
  anchors.push({ kind: "road", label: "JPO", pos: railCurve.getPointAt(0.485).clone().setY(8.4) });

  /* ---- kereta ---- */
  function makeTrain(color) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(15, 2.6, 3.1), new THREE.MeshLambertMaterial({ color }));
    body.position.y = 1.6;
    g.add(body);
    const halo = new THREE.Mesh(
      new THREE.BoxGeometry(16.8, 3.9, 4.6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.13 })
    );
    halo.position.y = 1.7;
    g.add(halo);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.9), new THREE.MeshBasicMaterial({ color: 0xfff4d4 }));
    glow.position.set(7.6, 1.8, 0);
    g.add(glow);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: 0xd05a4c }));
    tail.position.set(-7.6, 1.6, 0);
    g.add(tail);
    for (const side of [-1.58, 1.58]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.55, 0.06), new THREE.MeshBasicMaterial({ color: 0xf2dcae }));
      win.position.set(0, 2.1, side);
      g.add(win);
    }
    return g;
  }

  const trains = [
    { mesh: makeTrain(0xd7dfd2), t: 0.12, speed: 0.03 },
    { mesh: makeTrain(0xd9a24b), t: 0.38, speed: 0.021 },
    { mesh: makeTrain(0xd7dfd2), t: 0.63, speed: 0.026 },
    { mesh: makeTrain(0x9fb8d6), t: 0.86, speed: 0.018 },
  ];
  trains.forEach((tr) => scene.add(tr.mesh));

  /* ---- mobil ---- */
  function makeCar(color) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(3.4, 1, 1.7), new THREE.MeshLambertMaterial({ color })));
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 1.5), new THREE.MeshBasicMaterial({ color: 0xfff2d0 }));
    hl.position.set(1.75, 0.1, 0);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 1.3), new THREE.MeshBasicMaterial({ color: 0xc9524a }));
    tl.position.set(-1.75, 0.05, 0);
    g.add(tl);
    return g;
  }
  const carColors = [0xdfe4d6, 0x8fa0a8, 0xa8794f, 0x5d6b5b, 0xc6cfc0];
  const cars = [];
  for (let i = 0; i < 9; i++) {
    const onTol = i < 5;
    const rd = onTol ? roadDefs[0] : roadDefs[1];
    const mesh = makeCar(carColors[i % carColors.length]);
    scene.add(mesh);
    cars.push({
      mesh,
      curve: rd.curve,
      yFn: rd.yFn || (() => rd.y),
      t: Math.random(),
      speed: 0.02 + Math.random() * 0.03,
      dir: i % 3 === 0 ? -1 : 1,
      off: (i % 2 ? 1 : -1) * (onTol ? 4.2 : 2.6),
    });
  }

  /* ---- label proyeksi ---- */
  const trainAnchor = { kind: "train", label: "KRL 1732 · 68 km/j", pos: new THREE.Vector3() };
  const trainAnchor2 = { kind: "train", label: "KA 118 · 74 km/j", pos: new THREE.Vector3() };
  anchors.push(trainAnchor, trainAnchor2);

  const tmp = new THREE.Vector3();
  function projectLabels() {
    if (!labelBox) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    labelBox.innerHTML = "";
    for (const a of anchors) {
      tmp.copy(a.pos).project(camera);
      if (tmp.z > 1) continue;
      const x = (tmp.x * 0.5 + 0.5) * w;
      const y = (-tmp.y * 0.5 + 0.5) * h;
      if (x < 268 || x > w - 404 || y < 40 || y > h - 150) continue;
      const el = document.createElement("div");
      el.className = "tag " + (a.kind === "cam" ? "cam" : a.kind === "train" ? "train" : a.kind === "road" ? "road" : "s");
      el.textContent = a.label;
      el.style.left = x + "px";
      el.style.top = y + "px";
      labelBox.appendChild(el);
    }
  }

  /* ---- ukuran ---- */
  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  /* ---- parallax ---- */
  let mx = 0;
  let my = 0;
  let tx = 0;
  let ty = 0;
  function onMove(e) {
    const r = stage.getBoundingClientRect();
    mx = (e.clientX - r.left) / r.width - 0.5;
    my = (e.clientY - r.top) / r.height - 0.5;
  }
  stage.addEventListener("pointermove", onMove);

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clock = new THREE.Clock();
  let running = true;
  let trainRing = null;

  function frame() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    for (const tr of trains) {
      tr.t = (tr.t + dt * tr.speed * 0.1) % 1;
      const p = railCurve.getPointAt(tr.t);
      const tan = railCurve.getTangentAt(tr.t);
      tr.mesh.position.set(p.x, 0, p.z);
      tr.mesh.rotation.y = Math.atan2(tan.x, tan.z) - Math.PI / 2;
    }
    for (const c of cars) {
      c.t = (c.t + dt * c.speed * c.dir + 1) % 1;
      const p = c.curve.getPointAt(c.t);
      const tan = c.curve.getTangentAt(c.t);
      c.mesh.position.set(p.x + -tan.z * c.off, c.yFn(c.t) + 0.6, p.z + tan.x * c.off);
      c.mesh.rotation.y = Math.atan2(tan.x * c.dir, tan.z * c.dir) - Math.PI / 2;
    }
    trainAnchor.pos.copy(trains[0].mesh.position).add(new THREE.Vector3(0, 7, 0));
    trainAnchor2.pos.copy(trains[2].mesh.position).add(new THREE.Vector3(0, 7, 0));
    tx += (mx * 14 - tx) * 0.05;
    ty += (my * 9 - ty) * 0.05;
    camera.position.set(camBase.x + tx, camBase.y + ty, camBase.z);
    camera.lookAt(focus);
    if (selRing && !reduce) selRing.rotation.z += dt * 0.5;
    if (trainRing && trainRing.visible) {
      trainRing.position.set(trains[0].mesh.position.x, 0.35, trains[0].mesh.position.z);
      if (!reduce) trainRing.rotation.z += dt * 0.4;
    }
    renderer.render(scene, camera);
    projectLabels();
    requestAnimationFrame(frame);
  }
  frame();

  /* hanya saat dev: ubah canvas jadi gambar supaya bisa di-screenshot (WebGL headless sering hitam) */
  if (import.meta.env.DEV && new URLSearchParams(location.search).has("snap")) {
    setTimeout(() => {
      const url = canvas.toDataURL("image/png");
      const img = new Image();
      img.src = url;
      img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover";
      canvas.replaceWith(img);
    }, 1800);
  }

  return {
    setBuildingColors({ low, mid, high }) {
      if (low) buildingMats.low.color.set(low);
      if (mid) buildingMats.mid.color.set(mid);
      if (high) buildingMats.high.color.set(high);
    },
    setTrainSelected(on) {
      if (on && !trainRing) {
        trainRing = new THREE.Mesh(
          new THREE.TorusGeometry(11, 0.22, 6, 48),
          new THREE.MeshBasicMaterial({ color: 0xd9a24b, transparent: true, opacity: 0.85 })
        );
        trainRing.rotation.x = Math.PI / 2;
        scene.add(trainRing);
      }
      if (trainRing) trainRing.visible = on;
      trains.forEach((tr, i) => {
        const halo = tr.mesh.children[1];
        if (halo && halo.material) halo.material.opacity = on ? (i === 0 ? 0.3 : 0.05) : 0.13;
      });
    },
    dispose() {
      running = false;
      window.removeEventListener("resize", resize);
      stage.removeEventListener("pointermove", onMove);
      renderer.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m.dispose());
        }
      });
    },
  };
}
