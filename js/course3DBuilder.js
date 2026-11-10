/**
 * Course3DBuilder - Shared 3D Agility Mesh & Geometry Builder
 * Reusable 3D model generator for BabylonEngine (3D View tab) and ARCourseEngine (AR Walkthrough).
 */

const OBSTACLE_TYPES_3D = {
  JUMP_SINGLE: 'jump_single',
  JUMP_DOUBLE: 'jump_double',
  JUMP_LONG: 'jump_long',
  JUMP_TIRE: 'jump_tire',
  JUMP_WALL: 'jump_wall',
  TUNNEL: 'tunnel',
  TUNNEL_3M: 'tunnel_3m',
  TUNNEL_4M: 'tunnel_4m',
  TUNNEL_5M: 'tunnel_5m',
  TUNNEL_6M: 'tunnel_6m',
  A_FRAME: 'a_frame',
  DOG_WALK: 'dog_walk',
  SEESAW: 'seesaw',
  WEAVE_6: 'weave_6',
  WEAVE_12: 'weave_12',
  START_FINISH: 'start_finish'
};

class Course3DBuilder {
  static rad3D(deg) {
    return (deg * Math.PI) / 180;
  }

  static fieldToWorld3D(fieldX, fieldY, fieldHeight = 0, field = null) {
    const w = field ? field.widthMeters : 40;
    const l = field ? field.lengthMeters : 20;
    return new BABYLON.Vector3(
      fieldX - w / 2,
      fieldHeight,
      -(fieldY - l / 2)
    );
  }

  static getMaterial(scene, name, color, isEmissive = false) {
    const matName = `mat_${name}`;
    let mat = scene.getMaterialByName(matName);
    if (!mat) {
      mat = new BABYLON.StandardMaterial(matName, scene);
      mat.diffuseColor = color;
      mat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
      if (isEmissive) {
        mat.emissiveColor = color;
      }
    }
    return mat;
  }

  /**
   * Builds the green turf ground plane, gold perimeter boundary tube, and optional grid lines.
   */
  static buildGround(scene, field, options = {}) {
    const w = field ? field.widthMeters : 40;
    const l = field ? field.lengthMeters : 20;
    const opacity = options.opacity !== undefined ? options.opacity : 0.35;
    const showGrid = options.showGrid !== undefined ? options.showGrid : true;
    const isAr = !!options.isAr;

    // Grass ground box
    const groundMesh = BABYLON.MeshBuilder.CreateBox("ground", { width: w, depth: l, height: isAr ? 0.08 : 0.2 }, scene);
    groundMesh.position.y = isAr ? -0.04 : -0.1;

    const grassMat = new BABYLON.StandardMaterial("grassMat", scene);
    grassMat.diffuseColor = new BABYLON.Color3(0.08, 0.38, 0.18);
    grassMat.specularColor = new BABYLON.Color3(0.05, 0.1, 0.05);
    grassMat.alpha = opacity;
    grassMat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
    grassMat.backFaceCulling = false;
    groundMesh.material = grassMat;
    if (options.shadowReceiver) {
      groundMesh.receiveShadows = true;
    }

    // Perimeter boundary tube
    const perimeterPts = [
      new BABYLON.Vector3(-w / 2, 0.02, -l / 2),
      new BABYLON.Vector3(w / 2, 0.02, -l / 2),
      new BABYLON.Vector3(w / 2, 0.02, l / 2),
      new BABYLON.Vector3(-w / 2, 0.02, l / 2),
      new BABYLON.Vector3(-w / 2, 0.02, -l / 2)
    ];
    const borderTube = BABYLON.MeshBuilder.CreateTube("borderTube", { path: perimeterPts, radius: isAr ? 0.06 : 0.08 }, scene);
    const borderMat = new BABYLON.StandardMaterial("borderMat", scene);
    borderMat.diffuseColor = new BABYLON.Color3(0.95, 0.75, 0.1);
    borderMat.emissiveColor = new BABYLON.Color3(0.3, 0.2, 0.0);
    borderTube.material = borderMat;

    let gridMesh = null;
    if (showGrid && !isAr) {
      const gridLines = [];
      const gridStep = 5;
      for (let x = -Math.floor(w / 2); x <= Math.floor(w / 2); x += gridStep) {
        gridLines.push([new BABYLON.Vector3(x, 0.01, -l / 2), new BABYLON.Vector3(x, 0.01, l / 2)]);
      }
      for (let z = -Math.floor(l / 2); z <= Math.floor(l / 2); z += gridStep) {
        gridLines.push([new BABYLON.Vector3(-w / 2, 0.01, z), new BABYLON.Vector3(w / 2, 0.01, z)]);
      }
      gridMesh = BABYLON.MeshBuilder.CreateLineSystem("gridLines", { lines: gridLines }, scene);
      gridMesh.color = new BABYLON.Color3(0.15, 0.55, 0.28);
    }

    return { groundMesh, grassMat, borderTube, gridMesh };
  }

  /**
   * Builds an individual 3D obstacle mesh hierarchy and attaches it to parentGroup.
   */
  static buildObstacle(scene, obs, field, parentGroup, shadowGenerator = null, options = {}) {
    try {
      const obsNode = new BABYLON.TransformNode(`obs_${obs.id}`, scene);
      obsNode.parent = parentGroup;

      const pos3D = Course3DBuilder.fieldToWorld3D(obs.x, obs.y, 0, field);
      obsNode.position = pos3D;
      obsNode.rotation.y = Course3DBuilder.rad3D(obs.rotation || 0);

      const w = obs.widthMeters || 1.5;
      const d = obs.depthMeters || 0.6;

      // Palette Materials
      const blueMat = Course3DBuilder.getMaterial(scene, "blue", new BABYLON.Color3(0.23, 0.51, 0.96));
      const navyMat = Course3DBuilder.getMaterial(scene, "navy", new BABYLON.Color3(0.06, 0.09, 0.16));
      const whiteMat = Course3DBuilder.getMaterial(scene, "white", new BABYLON.Color3(0.95, 0.95, 0.95));
      const greenMat = Course3DBuilder.getMaterial(scene, "green", new BABYLON.Color3(0.06, 0.72, 0.51));
      const yellowMat = Course3DBuilder.getMaterial(scene, "yellow", new BABYLON.Color3(0.98, 0.8, 0.08));
      const redMat = Course3DBuilder.getMaterial(scene, "red", new BABYLON.Color3(0.93, 0.27, 0.27));

      switch (obs.type) {
        case OBSTACLE_TYPES_3D.JUMP_SINGLE:
        case OBSTACLE_TYPES_3D.JUMP_DOUBLE:
          Course3DBuilder._buildJump3D(scene, obsNode, w, d, obs.type === OBSTACLE_TYPES_3D.JUMP_DOUBLE ? 2 : 1, blueMat, navyMat, whiteMat, shadowGenerator);
          break;

        case OBSTACLE_TYPES_3D.JUMP_TIRE:
          Course3DBuilder._buildTireJump3D(scene, obsNode, w, d, blueMat, navyMat, shadowGenerator);
          break;

        case OBSTACLE_TYPES_3D.JUMP_WALL:
          Course3DBuilder._buildWall3D(scene, obsNode, w, d, blueMat, navyMat, whiteMat, shadowGenerator);
          break;

        case OBSTACLE_TYPES_3D.JUMP_LONG:
          Course3DBuilder._buildLongJump3D(scene, obsNode, w, d, blueMat, whiteMat, shadowGenerator);
          break;

        case OBSTACLE_TYPES_3D.A_FRAME:
          Course3DBuilder._buildAFrame3D(scene, obsNode, w, d, greenMat, yellowMat, navyMat);
          break;

        case OBSTACLE_TYPES_3D.DOG_WALK:
          Course3DBuilder._buildDogWalk3D(scene, obsNode, w, d, greenMat, yellowMat, navyMat);
          break;

        case OBSTACLE_TYPES_3D.SEESAW:
          Course3DBuilder._buildSeesaw3D(scene, obsNode, w, d, greenMat, yellowMat, navyMat);
          break;

        case OBSTACLE_TYPES_3D.TUNNEL:
        case OBSTACLE_TYPES_3D.TUNNEL_3M:
        case OBSTACLE_TYPES_3D.TUNNEL_4M:
        case OBSTACLE_TYPES_3D.TUNNEL_5M:
        case OBSTACLE_TYPES_3D.TUNNEL_6M:
        case 'tunnel_3m':
        case 'tunnel_4m':
        case 'tunnel_5m':
        case 'tunnel_6m':
          Course3DBuilder._buildTunnel3D(scene, obsNode, obs, field, blueMat, yellowMat, shadowGenerator);
          break;

        case OBSTACLE_TYPES_3D.WEAVE_6:
        case OBSTACLE_TYPES_3D.WEAVE_12:
          const polesCount = (obs.def && obs.def.poles) ? obs.def.poles : (obs.type === 'weave_12' ? 12 : 6);
          Course3DBuilder._buildWeaves3D(scene, obsNode, w, d, polesCount, blueMat, whiteMat, navyMat, shadowGenerator);
          break;

        case OBSTACLE_TYPES_3D.START_FINISH:
          Course3DBuilder._buildStartFinish3D(scene, obsNode, w, d, redMat, whiteMat);
          break;

        default:
          Course3DBuilder._buildGenericBox3D(scene, obsNode, w, d, blueMat);
          break;
      }

      // 3D Sequence Number Badge if requested
      if (options.showNumbers !== false && (obs.sequenceNumber !== undefined || obs.seq !== undefined)) {
        const seqStr = typeof obs.getSeqString === 'function' ? obs.getSeqString() : String(obs.sequenceNumber ?? obs.seq ?? '');
        if (seqStr) {
          Course3DBuilder._build3DNumberBadge(scene, obsNode, seqStr);
        }
      }
    } catch (err) {
      console.error("[Course3DBuilder] Error building obstacle:", obs, err);
    }
  }

  // --- INDIVIDUAL 3D OBSTACLE MODELS ---
  static _buildJump3D(scene, parent, w, d, barsCount, mainMat, postMat, barMat, shadowGenerator) {
    const postHeight = 1.25;
    const postRadius = 0.06;

    // Wing Posts Left & Right
    const leftPost = BABYLON.MeshBuilder.CreateCylinder("postL", { height: postHeight, diameter: postRadius * 2 }, scene);
    leftPost.position = new BABYLON.Vector3(-w / 2, postHeight / 2, 0);
    leftPost.material = barMat; leftPost.parent = parent;
    if (shadowGenerator) shadowGenerator.addShadowCaster(leftPost);

    const rightPost = BABYLON.MeshBuilder.CreateCylinder("postR", { height: postHeight, diameter: postRadius * 2 }, scene);
    rightPost.position = new BABYLON.Vector3(w / 2, postHeight / 2, 0);
    rightPost.material = barMat; rightPost.parent = parent;
    if (shadowGenerator) shadowGenerator.addShadowCaster(rightPost);

    // Horizontal Jump Bars
    const barRadius = 0.035;
    const barSpacing = d / (barsCount + 1);

    for (let i = 0; i < barsCount; i++) {
      const zOffset = -d / 2 + barSpacing * (i + 1);
      const barHeight = 0.1 + i * 0.15;

      const bar = BABYLON.MeshBuilder.CreateCylinder(`bar_${i}`, { height: w, diameter: barRadius * 2 }, scene);
      bar.rotation.z = Math.PI / 2;
      bar.position = new BABYLON.Vector3(0, barHeight, zOffset);
      bar.material = mainMat; bar.parent = parent;
      if (shadowGenerator) shadowGenerator.addShadowCaster(bar);
    }
  }

  static _buildTireJump3D(scene, parent, w, d, mainMat, postMat, shadowGenerator) {
    const postH = 1.4;
    const frameLeft = BABYLON.MeshBuilder.CreateCylinder("fL", { height: postH, diameter: 0.08 }, scene);
    frameLeft.position = new BABYLON.Vector3(-w / 2, postH / 2, 0); frameLeft.material = postMat; frameLeft.parent = parent;

    const frameRight = BABYLON.MeshBuilder.CreateCylinder("fR", { height: postH, diameter: 0.08 }, scene);
    frameRight.position = new BABYLON.Vector3(w / 2, postH / 2, 0); frameRight.material = postMat; frameRight.parent = parent;

    const topBeam = BABYLON.MeshBuilder.CreateCylinder("fTop", { height: w, diameter: 0.08 }, scene);
    topBeam.rotation.z = Math.PI / 2; topBeam.position = new BABYLON.Vector3(0, postH, 0); topBeam.material = postMat; topBeam.parent = parent;

    const tire = BABYLON.MeshBuilder.CreateTorus("tire", { diameter: 0.7, thickness: 0.18 }, scene);
    tire.rotation.x = Math.PI / 2; tire.position = new BABYLON.Vector3(0, 0.65, 0);
    tire.material = Course3DBuilder.getMaterial(scene, "cyan", new BABYLON.Color3(0.02, 0.71, 0.83));
    tire.parent = parent;
    if (shadowGenerator) shadowGenerator.addShadowCaster(tire);
  }

  static _buildWall3D(scene, parent, w, d, mainMat, postMat, whiteMat, shadowGenerator) {
    const wallHeight = 0.65;
    const wall = BABYLON.MeshBuilder.CreateBox("wallBody", { width: w, height: wallHeight, depth: d }, scene);
    wall.position = new BABYLON.Vector3(0, wallHeight / 2, 0); wall.material = mainMat; wall.parent = parent;
    if (shadowGenerator) shadowGenerator.addShadowCaster(wall);

    const towerH = 1.1;
    const tL = BABYLON.MeshBuilder.CreateBox("tL", { width: 0.35, height: towerH, depth: d + 0.1 }, scene);
    tL.position = new BABYLON.Vector3(-w / 2 - 0.1, towerH / 2, 0); tL.material = whiteMat; tL.parent = parent;

    const tR = BABYLON.MeshBuilder.CreateBox("tR", { width: 0.35, height: towerH, depth: d + 0.1 }, scene);
    tR.position = new BABYLON.Vector3(w / 2 + 0.1, towerH / 2, 0); tR.material = whiteMat; tR.parent = parent;
  }

  static _buildLongJump3D(scene, parent, w, d, mainMat, whiteMat, shadowGenerator) {
    const count = 4;
    const step = d / count;
    for (let i = 0; i < count; i++) {
      const z = -d / 2 + step * (i + 0.5);
      const h = 0.15 + i * 0.05;
      const plank = BABYLON.MeshBuilder.CreateBox(`plank_${i}`, { width: w, height: h, depth: 0.2 }, scene);
      plank.position = new BABYLON.Vector3(0, h / 2, z); plank.material = i % 2 === 0 ? mainMat : whiteMat; plank.parent = parent;
      if (shadowGenerator) shadowGenerator.addShadowCaster(plank);
    }
  }

  static _buildAFrame3D(scene, parent, w, d, greenMat, yellowMat, frameMat) {
    const peakH = 1.7;
    const halfD = d / 2;
    const contactLen = 1.06;

    const upRampLen = Math.hypot(halfD, peakH);
    const upRampAngle = Math.atan2(peakH, halfD);

    const upRampNode = new BABYLON.TransformNode("upRampNode", scene);
    upRampNode.parent = parent;
    upRampNode.position = new BABYLON.Vector3(0, peakH / 2, -halfD / 2);
    upRampNode.rotation.x = -upRampAngle;

    const upPlank = BABYLON.MeshBuilder.CreateBox("upPlank", { width: w, height: 0.1, depth: upRampLen }, scene);
    upPlank.material = greenMat; upPlank.parent = upRampNode;

    const upYellow = BABYLON.MeshBuilder.CreateBox("upYellow", { width: w + 0.02, height: 0.12, depth: contactLen }, scene);
    upYellow.position.z = -upRampLen / 2 + contactLen / 2;
    upYellow.material = yellowMat; upYellow.parent = upRampNode;

    const downRampNode = new BABYLON.TransformNode("downRampNode", scene);
    downRampNode.parent = parent;
    downRampNode.position = new BABYLON.Vector3(0, peakH / 2, halfD / 2);
    downRampNode.rotation.x = upRampAngle;

    const downPlank = BABYLON.MeshBuilder.CreateBox("downPlank", { width: w, height: 0.1, depth: upRampLen }, scene);
    downPlank.material = greenMat; downPlank.parent = downRampNode;

    const downYellow = BABYLON.MeshBuilder.CreateBox("downYellow", { width: w + 0.02, height: 0.12, depth: contactLen }, scene);
    downYellow.position.z = upRampLen / 2 - contactLen / 2;
    downYellow.material = yellowMat; downYellow.parent = downRampNode;
  }

  static _buildDogWalk3D(scene, parent, w, d, greenMat, yellowMat, frameMat) {
    const elevatedH = 1.2;
    const rampLen = 3.6;
    const rampZDist = Math.sqrt(Math.max(rampLen * rampLen - elevatedH * elevatedH, 1));
    const centerLen = d - 2 * rampZDist;
    const halfD = d / 2;
    const contactLen = 0.9;
    const rampAngle = Math.asin(elevatedH / rampLen);

    const centerPlank = BABYLON.MeshBuilder.CreateBox("dwCenter", { width: w, height: 0.08, depth: Math.max(centerLen, 3.6) }, scene);
    centerPlank.position = new BABYLON.Vector3(0, elevatedH, 0);
    centerPlank.material = greenMat; centerPlank.parent = parent;

    const legL = BABYLON.MeshBuilder.CreateCylinder("legL", { height: elevatedH, diameter: 0.06 }, scene);
    legL.position = new BABYLON.Vector3(0, elevatedH / 2, -centerLen / 2); legL.material = frameMat; legL.parent = parent;

    const legR = BABYLON.MeshBuilder.CreateCylinder("legR", { height: elevatedH, diameter: 0.06 }, scene);
    legR.position = new BABYLON.Vector3(0, elevatedH / 2, centerLen / 2); legR.material = frameMat; legR.parent = parent;

    const upRampNode = new BABYLON.TransformNode("dwUpRampNode", scene);
    upRampNode.parent = parent;
    upRampNode.position = new BABYLON.Vector3(0, elevatedH / 2, -halfD + rampZDist / 2);
    upRampNode.rotation.x = -rampAngle;

    const upPlank = BABYLON.MeshBuilder.CreateBox("dwUpPlank", { width: w, height: 0.08, depth: rampLen }, scene);
    upPlank.material = greenMat; upPlank.parent = upRampNode;

    const upYellow = BABYLON.MeshBuilder.CreateBox("dwUpYellow", { width: w + 0.02, height: 0.1, depth: contactLen }, scene);
    upYellow.position.z = -rampLen / 2 + contactLen / 2;
    upYellow.material = yellowMat; upYellow.parent = upRampNode;

    const downRampNode = new BABYLON.TransformNode("dwDownRampNode", scene);
    downRampNode.parent = parent;
    downRampNode.position = new BABYLON.Vector3(0, elevatedH / 2, halfD - rampZDist / 2);
    downRampNode.rotation.x = rampAngle;

    const downPlank = BABYLON.MeshBuilder.CreateBox("dwDownPlank", { width: w, height: 0.08, depth: rampLen }, scene);
    downPlank.material = greenMat; downPlank.parent = downRampNode;

    const downYellow = BABYLON.MeshBuilder.CreateBox("dwDownYellow", { width: w + 0.02, height: 0.1, depth: contactLen }, scene);
    downYellow.position.z = rampLen / 2 - contactLen / 2;
    downYellow.material = yellowMat; downYellow.parent = downRampNode;
  }

  static _buildSeesaw3D(scene, parent, w, d, greenMat, yellowMat, frameMat) {
    const pivotH = 0.6;
    const contactLen = 0.9;
    const halfD = d / 2;

    const stand = BABYLON.MeshBuilder.CreateBox("seesawStand", { width: w + 0.2, height: pivotH, depth: 0.2 }, scene);
    stand.position = new BABYLON.Vector3(0, pivotH / 2, 0); stand.material = frameMat; stand.parent = parent;

    const plankNode = new BABYLON.TransformNode("seesawPlankNode", scene);
    plankNode.parent = parent;
    plankNode.position = new BABYLON.Vector3(0, pivotH, 0);
    plankNode.rotation.x = Course3DBuilder.rad3D(20);

    const plank = BABYLON.MeshBuilder.CreateBox("seesawPlank", { width: w, height: 0.08, depth: d }, scene);
    plank.material = greenMat; plank.parent = plankNode;

    const yellowA = BABYLON.MeshBuilder.CreateBox("seesawY1", { width: w + 0.02, height: 0.1, depth: contactLen }, scene);
    yellowA.position.z = -halfD + contactLen / 2; yellowA.material = yellowMat; yellowA.parent = plankNode;

    const yellowB = BABYLON.MeshBuilder.CreateBox("seesawY2", { width: w + 0.02, height: 0.1, depth: contactLen }, scene);
    yellowB.position.z = halfD - contactLen / 2; yellowB.material = yellowMat; yellowB.parent = plankNode;
  }

  static _buildTunnel3D(scene, parent, obs, field, pipeMat, collarMat, shadowGenerator) {
    const tunnelRadius = 0.3;
    const path = [];

    const localPts = (typeof obs.getTunnelLocalSplinePoints === 'function')
      ? obs.getTunnelLocalSplinePoints(30)
      : null;

    if (localPts && localPts.length > 0) {
      localPts.forEach(pt => {
        path.push(new BABYLON.Vector3(pt.x, tunnelRadius + 0.02, -pt.y));
      });
    } else {
      const d = obs.depthMeters || 3.0;
      const ptsCount = 20;
      for (let i = 0; i <= ptsCount; i++) {
        const t = i / ptsCount;
        const z = -d / 2 + t * d;
        path.push(new BABYLON.Vector3(0, tunnelRadius + 0.02, -z));
      }
    }

    const tunnelMesh = BABYLON.MeshBuilder.CreateTube("tunnelTube", { path: path, radius: tunnelRadius, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
    tunnelMesh.material = pipeMat; tunnelMesh.parent = parent;
    if (shadowGenerator) shadowGenerator.addShadowCaster(tunnelMesh);
  }

  static _buildWeaves3D(scene, parent, w, d, polesCount, purpleMat, whiteMat, baseMat, shadowGenerator) {
    const count = polesCount || 6;
    const step = d / Math.max(count - 1, 1);
    const halfD = d / 2;
    const poleH = 1.0;
    const poleR = 0.025;

    const baseBar = BABYLON.MeshBuilder.CreateBox("weaveBase", { width: 0.08, height: 0.02, depth: d }, scene);
    baseBar.position = new BABYLON.Vector3(0, 0.01, 0); baseBar.material = baseMat; baseBar.parent = parent;

    for (let i = 0; i < count; i++) {
      const z = -halfD + i * step;
      const pole = BABYLON.MeshBuilder.CreateCylinder(`pole_${i}`, { height: poleH, diameter: poleR * 2 }, scene);
      pole.position = new BABYLON.Vector3(0, poleH / 2, z);
      pole.material = i % 2 === 0 ? purpleMat : whiteMat;
      pole.parent = parent;
      if (shadowGenerator) shadowGenerator.addShadowCaster(pole);
    }
  }

  static _buildStartFinish3D(scene, parent, w, d, redMat, whiteMat) {
    const postH = 1.2;
    const pL = BABYLON.MeshBuilder.CreateCylinder("sfL", { height: postH, diameter: 0.1 }, scene);
    pL.position = new BABYLON.Vector3(-w / 2, postH / 2, 0); pL.material = redMat; pL.parent = parent;

    const pR = BABYLON.MeshBuilder.CreateCylinder("sfR", { height: postH, diameter: 0.1 }, scene);
    pR.position = new BABYLON.Vector3(w / 2, postH / 2, 0); pR.material = redMat; pR.parent = parent;

    const banner = BABYLON.MeshBuilder.CreateBox("sfBanner", { width: w, height: 0.15, depth: 0.02 }, scene);
    banner.position = new BABYLON.Vector3(0, postH - 0.1, 0); banner.material = whiteMat; banner.parent = parent;
  }

  static _buildGenericBox3D(scene, parent, w, d, mat) {
    const box = BABYLON.MeshBuilder.CreateBox("generic", { width: w, height: 0.5, depth: d }, scene);
    box.position = new BABYLON.Vector3(0, 0.25, 0); box.material = mat; box.parent = parent;
  }

  static _build3DNumberBadge(scene, parentMesh, seqText) {
    const plane = BABYLON.MeshBuilder.CreatePlane("numBadge", { size: 0.65 }, scene);
    plane.position = new BABYLON.Vector3(0, 1.4, 0);
    plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    plane.parent = parentMesh;

    const dynTex = new BABYLON.DynamicTexture(`numTex_${seqText}`, { width: 256, height: 256 }, scene);
    const ctx = dynTex.getContext();
    ctx.beginPath();
    ctx.arc(128, 128, 110, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    ctx.font = 'bold 110px Outfit, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(seqText), 128, 134);
    dynTex.update();

    const badgeMat = new BABYLON.StandardMaterial(`badgeMat_${seqText}`, scene);
    badgeMat.diffuseTexture = dynTex;
    badgeMat.emissiveColor = new BABYLON.Color3(0.9, 0.9, 0.9);
    badgeMat.specularColor = new BABYLON.Color3(0, 0, 0);
    badgeMat.useAlphaFromDiffuseTexture = true;
    plane.material = badgeMat;
  }

  /**
   * Builds the 3D trajectory spline ribbon and floating sequence badges.
   */
  static buildTrajectory(scene, field, obstacles, pathModel, parentGroup, options = {}) {
    if (!pathModel || !pathModel.showPath || !obstacles || obstacles.length < 2) return;

    const sequenced = typeof pathModel.getSequencedObstacles === 'function' ? pathModel.getSequencedObstacles(obstacles) : [];
    const allWaypoints2D = typeof pathModel.getAllWaypoints === 'function' ? pathModel.getAllWaypoints(obstacles) : [];

    if (allWaypoints2D.length < 2 && sequenced.length < 2) return;

    // Build Catmull-Rom Trajectory Tube
    if (allWaypoints2D.length >= 2) {
      const pts3D = allWaypoints2D.map(p => {
        const h = p.isCenter ? 0.4 : 0.3;
        return Course3DBuilder.fieldToWorld3D(p.x, p.y, h, field);
      });

      try {
        const catmull = BABYLON.Curve3.CreateCatmullRomSpline(pts3D, 12, false);
        const curvePts = catmull.getPoints();

        const trajTube = BABYLON.MeshBuilder.CreateTube("traj3d", {
          path: curvePts,
          radius: 0.05,
          sideOrientation: BABYLON.Mesh.DOUBLESIDE
        }, scene);

        const trajMat = new BABYLON.StandardMaterial("trajMat", scene);
        trajMat.diffuseColor = new BABYLON.Color3(0.22, 0.74, 0.97);
        trajMat.emissiveColor = new BABYLON.Color3(0.1, 0.4, 0.6);
        trajTube.material = trajMat;
        trajTube.parent = parentGroup;
      } catch (e) {
        console.warn("[Course3DBuilder] Trajectory spline creation exception:", e);
      }
    }

    // Add 3D Badges if not attached directly to obstacles
    if (options.buildStandaloneBadges) {
      sequenced.forEach(obs => {
        const seqStr = typeof obs.getSeqString === 'function' ? obs.getSeqString() : (obs.seq ? String(obs.seq) : '');
        if (!seqStr) return;

        const pos3D = Course3DBuilder.fieldToWorld3D(obs.x, obs.y, 0.5, field);

        const disc = BABYLON.MeshBuilder.CreateCylinder(`badge3d_${obs.id}`, { height: 0.08, diameter: 0.9 }, scene);
        disc.position = pos3D;
        disc.parent = parentGroup;

        const badgeMat = new BABYLON.StandardMaterial("badgeMat", scene);
        badgeMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        badgeMat.emissiveColor = new BABYLON.Color3(0.8, 0.8, 0.8);
        disc.material = badgeMat;

        const dynamicTexture = new BABYLON.DynamicTexture(`dynamicTex_${obs.id}`, { width: 256, height: 256 }, scene);
        const fontSize = seqStr.length > 3 ? "bold 90px sans-serif" : "bold 130px sans-serif";
        dynamicTexture.drawText(seqStr, null, 170, fontSize, "black", "#fff", true);
        badgeMat.diffuseTexture = dynamicTexture;
      });
    }
  }
}

// Expose globally
window.Course3DBuilder = Course3DBuilder;
window.OBSTACLE_TYPES_3D = OBSTACLE_TYPES_3D;
