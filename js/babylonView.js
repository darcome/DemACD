/**
 * BabylonEngine - Interactive 3D Agility Course Visualizer
 * Built with Babylon.js
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

function rad3D(deg) {
  return (deg * Math.PI) / 180;
}

class BabylonEngine {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.engine = null;
    this.scene = null;
    this.camera = null;
    this.shadowGenerator = null;
    this.obstaclesGroup = null;
    this.trajectoryGroup = null;
    this.show3DPath = true;
    this.groundOpacity = 0.35; // Default ground opacity for 3D view
    this.groundMat = null;
    this.currentField = null;
    this.currentObstacles = [];
    this.currentPathModel = null;
    this.isInitialized = false;

    if (typeof BABYLON !== 'undefined') {
      this._initScene();
    }
  }

  setGroundOpacity(val) {
    this.groundOpacity = Math.max(0, Math.min(1, parseFloat(val)));
    if (this.groundMat) {
      this.groundMat.alpha = this.groundOpacity;
    }
  }

  _initScene() {
    try {
      this.engine = new BABYLON.Engine(this.canvas, true, { preserveDrawingBuffer: true, stencil: true });
      this.scene = new BABYLON.Scene(this.engine);
      this.scene.clearColor = new BABYLON.Color4(0.04, 0.07, 0.12, 1.0); // Rich dark navy background

      // Orbit ArcRotateCamera centered at origin
      this.camera = new BABYLON.ArcRotateCamera("camera3d", -Math.PI / 2, Math.PI / 3, 40, BABYLON.Vector3.Zero(), this.scene);
      this.camera.attachControl(this.canvas, true);
      this.camera.lowerRadiusLimit = 4;
      this.camera.upperRadiusLimit = 150;
      this.camera.wheelPrecision = 15;
      this.camera.panningSensibility = 50;

      // Hemispheric Ambient Light
      const hemiLight = new BABYLON.HemisphericLight("hemiLight", new BABYLON.Vector3(0, 1, 0), this.scene);
      hemiLight.intensity = 0.75;
      hemiLight.diffuse = new BABYLON.Color3(0.95, 0.98, 1.0);
      hemiLight.groundColor = new BABYLON.Color3(0.15, 0.25, 0.15);

      // Directional Sunlight with Shadows
      const dirLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(-1, -2.5, -1), this.scene);
      dirLight.position = new BABYLON.Vector3(30, 50, 30);
      dirLight.intensity = 0.85;

      this.shadowGenerator = new BABYLON.ShadowGenerator(1024, dirLight);
      this.shadowGenerator.useBlurExponentialShadowMap = true;
      this.shadowGenerator.blurKernel = 16;

      // Start Render Loop
      this.engine.runRenderLoop(() => {
        if (this.scene) this.scene.render();
      });

      window.addEventListener('resize', () => {
        if (this.engine) this.engine.resize();
      });

      this.isInitialized = true;
    } catch (e) {
      console.error("Babylon.js initialization error:", e);
    }
  }

  resize() {
    if (this.engine) this.engine.resize();
  }

  resetCamera() {
    if (!this.camera || !this.currentField) return;
    this.camera.target = new BABYLON.Vector3(0, 0, 0);
    this.camera.alpha = -Math.PI / 2;
    this.camera.beta = Math.PI / 3.2;
    const maxDim = Math.max(this.currentField.widthMeters, this.currentField.lengthMeters);
    this.camera.radius = maxDim * 1.15;
  }

  /**
   * Main sync method called when switching to 3D tab or updating field/obstacles
   */
  updateScene(field, obstacles, pathModel) {
    if (!this.isInitialized) {
      this._initScene();
      if (!this.isInitialized) return;
    }

    this.currentField = field;
    this.currentObstacles = obstacles || [];
    this.currentPathModel = pathModel;

    // 1. Build Grass Ground Plane
    if (this.groundMesh) this.groundMesh.dispose();
    this._buildGround(field);

    // 2. Clear old obstacles
    if (this.obstaclesGroup) this.obstaclesGroup.dispose();
    this.obstaclesGroup = new BABYLON.TransformNode("obstaclesGroup", this.scene);

    // 3. Clear old trajectory
    if (this.trajectoryGroup) this.trajectoryGroup.dispose();
    this.trajectoryGroup = new BABYLON.TransformNode("trajectoryGroup", this.scene);

    // 4. Build 3D Obstacles
    this.currentObstacles.forEach(obs => {
      this._build3DObstacle(obs, field);
    });

    // 5. Build 3D Dog Trajectory Spline & Sequence Badges
    if (pathModel) {
      this._build3DTrajectory(field, this.currentObstacles, pathModel);
    }

    this.resize();
  }

  // --- FIELD GROUND BUILDER ---
  _buildGround(field) {
    const w = field ? field.widthMeters : 40;
    const l = field ? field.lengthMeters : 20;

    // Green Grass Ground Box
    this.groundMesh = BABYLON.MeshBuilder.CreateBox("ground", { width: w, depth: l, height: 0.2 }, this.scene);
    this.groundMesh.position.y = -0.1;

    const grassMat = new BABYLON.StandardMaterial("grassMat", this.scene);
    grassMat.diffuseColor = new BABYLON.Color3(0.08, 0.38, 0.18); // Deep rich agility turf green
    grassMat.specularColor = new BABYLON.Color3(0.05, 0.1, 0.05);
    grassMat.alpha = this.groundOpacity !== undefined ? this.groundOpacity : 0.35;
    grassMat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
    grassMat.backFaceCulling = false;
    this.groundMat = grassMat;
    this.groundMesh.material = grassMat;
    this.groundMesh.receiveShadows = true;

    // White Perimeter Field Boundary Tube
    const perimeterPts = [
      new BABYLON.Vector3(-w / 2, 0.02, -l / 2),
      new BABYLON.Vector3(w / 2, 0.02, -l / 2),
      new BABYLON.Vector3(w / 2, 0.02, l / 2),
      new BABYLON.Vector3(-w / 2, 0.02, l / 2),
      new BABYLON.Vector3(-w / 2, 0.02, -l / 2)
    ];
    const borderTube = BABYLON.MeshBuilder.CreateTube("borderTube", { path: perimeterPts, radius: 0.08 }, this.scene);
    const borderMat = new BABYLON.StandardMaterial("borderMat", this.scene);
    borderMat.diffuseColor = new BABYLON.Color3(0.95, 0.75, 0.1); // Gold boundary line
    borderMat.emissiveColor = new BABYLON.Color3(0.3, 0.2, 0.0);
    borderTube.material = borderMat;

    // Grid Floor Markings (Subtle grid lines)
    const gridLines = [];
    const gridStep = 5; // Every 5 meters
    for (let x = -Math.floor(w / 2); x <= Math.floor(w / 2); x += gridStep) {
      gridLines.push([new BABYLON.Vector3(x, 0.01, -l / 2), new BABYLON.Vector3(x, 0.01, l / 2)]);
    }
    for (let z = -Math.floor(l / 2); z <= Math.floor(l / 2); z += gridStep) {
      gridLines.push([new BABYLON.Vector3(-w / 2, 0.01, z), new BABYLON.Vector3(w / 2, 0.01, z)]);
    }
    const gridMesh = BABYLON.MeshBuilder.CreateLineSystem("gridLines", { lines: gridLines }, this.scene);
    gridMesh.color = new BABYLON.Color3(0.15, 0.55, 0.28);
  }

  // --- 2D -> 3D COORDINATE CONVERSION ---
  fieldToWorld3D(fieldX, fieldY, fieldHeight = 0) {
    const w = this.currentField ? this.currentField.widthMeters : 40;
    const l = this.currentField ? this.currentField.lengthMeters : 20;
    return new BABYLON.Vector3(
      fieldX - w / 2,
      fieldHeight,
      -(fieldY - l / 2)
    );
  }

  // --- 3D OBSTACLE BUILDERS ---
  _build3DObstacle(obs, field) {
    try {
      const obsNode = new BABYLON.TransformNode(`obs_${obs.id}`, this.scene);
      obsNode.parent = this.obstaclesGroup;

      const pos3D = this.fieldToWorld3D(obs.x, obs.y, 0);
      obsNode.position = pos3D;
      obsNode.rotation.y = rad3D(obs.rotation || 0);

      const w = obs.widthMeters || 1.5;
      const d = obs.depthMeters || 0.6;

      // Reusable Materials
      const blueMat = this._getMaterial("blue", new BABYLON.Color3(0.23, 0.51, 0.96));
      const navyMat = this._getMaterial("navy", new BABYLON.Color3(0.06, 0.09, 0.16));
      const whiteMat = this._getMaterial("white", new BABYLON.Color3(0.95, 0.95, 0.95));
      const greenMat = this._getMaterial("green", new BABYLON.Color3(0.06, 0.72, 0.51));
      const yellowMat = this._getMaterial("yellow", new BABYLON.Color3(0.98, 0.8, 0.08));
      const purpleMat = this._getMaterial("purple", new BABYLON.Color3(0.48, 0.23, 0.93));
      const redMat = this._getMaterial("red", new BABYLON.Color3(0.93, 0.27, 0.27));

      switch (obs.type) {
        case OBSTACLE_TYPES_3D.JUMP_SINGLE:
        case OBSTACLE_TYPES_3D.JUMP_DOUBLE:
          this._buildJump3D(obsNode, w, d, obs.type === OBSTACLE_TYPES_3D.JUMP_DOUBLE ? 2 : 1, blueMat, navyMat, whiteMat);
          break;

        case OBSTACLE_TYPES_3D.JUMP_TIRE:
          this._buildTireJump3D(obsNode, w, d, blueMat, navyMat);
          break;

        case OBSTACLE_TYPES_3D.JUMP_WALL:
          this._buildWall3D(obsNode, w, d, blueMat, navyMat, whiteMat);
          break;

        case OBSTACLE_TYPES_3D.JUMP_LONG:
          this._buildLongJump3D(obsNode, w, d, blueMat, whiteMat);
          break;

        case OBSTACLE_TYPES_3D.A_FRAME:
          this._buildAFrame3D(obsNode, w, d, greenMat, yellowMat, navyMat);
          break;

        case OBSTACLE_TYPES_3D.DOG_WALK:
          this._buildDogWalk3D(obsNode, w, d, greenMat, yellowMat, navyMat);
          break;

        case OBSTACLE_TYPES_3D.SEESAW:
          this._buildSeesaw3D(obsNode, w, d, greenMat, yellowMat, navyMat);
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
          this._buildTunnel3D(obsNode, obs, field, blueMat, yellowMat);
          break;

        case OBSTACLE_TYPES_3D.WEAVE_6:
        case OBSTACLE_TYPES_3D.WEAVE_12:
          const polesCount = (obs.def && obs.def.poles) ? obs.def.poles : (obs.type === 'weave_12' ? 12 : 6);
          this._buildWeaves3D(obsNode, w, d, polesCount, blueMat, whiteMat, navyMat);
          break;

        case OBSTACLE_TYPES_3D.START_FINISH:
          this._buildStartFinish3D(obsNode, w, d, redMat, whiteMat);
          break;

        default:
          this._buildGenericBox3D(obsNode, w, d, blueMat);
          break;
      }
    } catch (err) {
      console.error("Error building 3D obstacle:", obs, err);
    }
  }

  _getMaterial(name, color, emissive = null) {
    const matName = `mat_${name}`;
    let mat = this.scene.getMaterialByName(matName);
    if (!mat) {
      mat = new BABYLON.StandardMaterial(matName, this.scene);
      //mat.diffuseColor = color;
      //mat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
      //if (emissive) mat.emissiveColor = emissive;
	  mat.disableLighting = true;
	  mat.emissiveColor = color;
    }
    return mat;
  }

  // --- INDIVIDUAL 3D OBSTACLE MODELS ---
  _buildJump3D(parent, w, d, barsCount, mainMat, postMat, barMat) {
    const postHeight = 1.25;
    const postRadius = 0.06;

    // Wing Posts Left & Right
    const leftPost = BABYLON.MeshBuilder.CreateCylinder("postL", { height: postHeight, diameter: postRadius * 2 }, this.scene);
    leftPost.position = new BABYLON.Vector3(-w / 2, postHeight / 2, 0);
    leftPost.material = barMat; leftPost.parent = parent;
    if (this.shadowGenerator) this.shadowGenerator.addShadowCaster(leftPost);

    const rightPost = BABYLON.MeshBuilder.CreateCylinder("postR", { height: postHeight, diameter: postRadius * 2 }, this.scene);
    rightPost.position = new BABYLON.Vector3(w / 2, postHeight / 2, 0);
    rightPost.material = barMat; rightPost.parent = parent;
    if (this.shadowGenerator) this.shadowGenerator.addShadowCaster(rightPost);

    // Horizontal Jump Bars
    const barRadius = 0.035;
    const barSpacing = d / (barsCount + 1);

    for (let i = 0; i < barsCount; i++) {
      const zOffset = -d / 2 + barSpacing * (i + 1);
      const barHeight = 0.1 + i * 0.15;

      const bar = BABYLON.MeshBuilder.CreateCylinder(`bar_${i}`, { height: w, diameter: barRadius * 2 }, this.scene);
      bar.rotation.z = Math.PI / 2;
      bar.position = new BABYLON.Vector3(0, barHeight, zOffset);
      bar.material = mainMat; bar.parent = parent;
      if (this.shadowGenerator) this.shadowGenerator.addShadowCaster(bar);
    }
  }

  _buildTireJump3D(parent, w, d, mainMat, postMat) {
    const postH = 1.4;
    const frameLeft = BABYLON.MeshBuilder.CreateCylinder("fL", { height: postH, diameter: 0.08 }, this.scene);
    frameLeft.position = new BABYLON.Vector3(-w / 2, postH / 2, 0); frameLeft.material = postMat; frameLeft.parent = parent;

    const frameRight = BABYLON.MeshBuilder.CreateCylinder("fR", { height: postH, diameter: 0.08 }, this.scene);
    frameRight.position = new BABYLON.Vector3(w / 2, postH / 2, 0); frameRight.material = postMat; frameRight.parent = parent;

    const topBeam = BABYLON.MeshBuilder.CreateCylinder("fTop", { height: w, diameter: 0.08 }, this.scene);
    topBeam.rotation.z = Math.PI / 2; topBeam.position = new BABYLON.Vector3(0, postH, 0); topBeam.material = postMat; topBeam.parent = parent;

    // Torus Tire
    const tire = BABYLON.MeshBuilder.CreateTorus("tire", { diameter: 0.7, thickness: 0.18 }, this.scene);
    tire.rotation.x = Math.PI / 2; tire.position = new BABYLON.Vector3(0, 0.65, 0);
    tire.material = this._getMaterial("cyan", new BABYLON.Color3(0.02, 0.71, 0.83));
    tire.parent = parent;
    if (this.shadowGenerator) this.shadowGenerator.addShadowCaster(tire);
  }

  _buildWall3D(parent, w, d, mainMat, postMat, whiteMat) {
    const wallHeight = 0.65;
    const wall = BABYLON.MeshBuilder.CreateBox("wallBody", { width: w, height: wallHeight, depth: d }, this.scene);
    wall.position = new BABYLON.Vector3(0, wallHeight / 2, 0); wall.material = mainMat; wall.parent = parent;
    if (this.shadowGenerator) this.shadowGenerator.addShadowCaster(wall);

    // Towers
    const towerH = 1.1;
    const tL = BABYLON.MeshBuilder.CreateBox("tL", { width: 0.35, height: towerH, depth: d + 0.1 }, this.scene);
    tL.position = new BABYLON.Vector3(-w / 2 - 0.1, towerH / 2, 0); tL.material = whiteMat; tL.parent = parent;

    const tR = BABYLON.MeshBuilder.CreateBox("tR", { width: 0.35, height: towerH, depth: d + 0.1 }, this.scene);
    tR.position = new BABYLON.Vector3(w / 2 + 0.1, towerH / 2, 0); tR.material = whiteMat; tR.parent = parent;
  }

  _buildLongJump3D(parent, w, d, mainMat, whiteMat) {
    const count = 4;
    const step = d / count;
    for (let i = 0; i < count; i++) {
      const z = -d / 2 + step * (i + 0.5);
      const h = 0.15 + i * 0.05;
      const plank = BABYLON.MeshBuilder.CreateBox(`plank_${i}`, { width: w, height: h, depth: 0.2 }, this.scene);
      plank.position = new BABYLON.Vector3(0, h / 2, z); plank.material = i % 2 === 0 ? mainMat : whiteMat; plank.parent = parent;
      if (this.shadowGenerator) this.shadowGenerator.addShadowCaster(plank);
    }
  }

  _buildAFrame3D(parent, w, d, greenMat, yellowMat, frameMat) {
    const peakH = 1.7;
    const halfD = d / 2;
    const contactLen = 1.06;

    // Up Ramp (from z = -halfD up to z = 0, y = peakH)
    const upRampLen = Math.hypot(halfD, peakH);
    const upRampAngle = Math.atan2(peakH, halfD);

    const upRampNode = new BABYLON.TransformNode("upRampNode", this.scene);
    upRampNode.parent = parent;
    upRampNode.position = new BABYLON.Vector3(0, peakH / 2, -halfD / 2);
    upRampNode.rotation.x = -upRampAngle;

    const upPlank = BABYLON.MeshBuilder.CreateBox("upPlank", { width: w, height: 0.1, depth: upRampLen }, this.scene);
    upPlank.material = greenMat; upPlank.parent = upRampNode;

    // Up Yellow Contact Zone
    const upYellow = BABYLON.MeshBuilder.CreateBox("upYellow", { width: w + 0.02, height: 0.12, depth: contactLen }, this.scene);
    upYellow.position.z = -upRampLen / 2 + contactLen / 2;
    upYellow.material = yellowMat; upYellow.parent = upRampNode;

    // Down Ramp (from z = 0, y = peakH down to z = halfD)
    const downRampNode = new BABYLON.TransformNode("downRampNode", this.scene);
    downRampNode.parent = parent;
    downRampNode.position = new BABYLON.Vector3(0, peakH / 2, halfD / 2);
    downRampNode.rotation.x = upRampAngle;

    const downPlank = BABYLON.MeshBuilder.CreateBox("downPlank", { width: w, height: 0.1, depth: upRampLen }, this.scene);
    downPlank.material = greenMat; downPlank.parent = downRampNode;

    // Down Yellow Contact Zone
    const downYellow = BABYLON.MeshBuilder.CreateBox("downYellow", { width: w + 0.02, height: 0.12, depth: contactLen }, this.scene);
    downYellow.position.z = upRampLen / 2 - contactLen / 2;
    downYellow.material = yellowMat; downYellow.parent = downRampNode;
  }

  _buildDogWalk3D(parent, w, d, greenMat, yellowMat, frameMat) {
    const elevatedH = 1.2;
    const rampLen = 3.6;
    const rampZDist = Math.sqrt(Math.max(rampLen * rampLen - elevatedH * elevatedH, 1));
    const centerLen = d - 2 * rampZDist;
    const halfD = d / 2;
    const contactLen = 0.9;
    const rampAngle = Math.asin(elevatedH / rampLen);

    // 1. Center Elevated Horizontal Plank
    const centerPlank = BABYLON.MeshBuilder.CreateBox("dwCenter", { width: w, height: 0.08, depth: Math.max(centerLen, 3.6) }, this.scene);
    centerPlank.position = new BABYLON.Vector3(0, elevatedH, 0);
    centerPlank.material = greenMat; centerPlank.parent = parent;

    // Trestle legs
    const legL = BABYLON.MeshBuilder.CreateCylinder("legL", { height: elevatedH, diameter: 0.06 }, this.scene);
    legL.position = new BABYLON.Vector3(0, elevatedH / 2, -centerLen / 2); legL.material = frameMat; legL.parent = parent;

    const legR = BABYLON.MeshBuilder.CreateCylinder("legR", { height: elevatedH, diameter: 0.06 }, this.scene);
    legR.position = new BABYLON.Vector3(0, elevatedH / 2, centerLen / 2); legR.material = frameMat; legR.parent = parent;

    // 2. Up Ramp
    const upRampNode = new BABYLON.TransformNode("dwUpRampNode", this.scene);
    upRampNode.parent = parent;
    upRampNode.position = new BABYLON.Vector3(0, elevatedH / 2, -halfD + rampZDist / 2);
    upRampNode.rotation.x = -rampAngle;

    const upPlank = BABYLON.MeshBuilder.CreateBox("dwUpPlank", { width: w, height: 0.08, depth: rampLen }, this.scene);
    upPlank.material = greenMat; upPlank.parent = upRampNode;

    const upYellow = BABYLON.MeshBuilder.CreateBox("dwUpYellow", { width: w + 0.02, height: 0.1, depth: contactLen }, this.scene);
    upYellow.position.z = -rampLen / 2 + contactLen / 2;
    upYellow.material = yellowMat; upYellow.parent = upRampNode;

    // 3. Down Ramp
    const downRampNode = new BABYLON.TransformNode("dwDownRampNode", this.scene);
    downRampNode.parent = parent;
    downRampNode.position = new BABYLON.Vector3(0, elevatedH / 2, halfD - rampZDist / 2);
    downRampNode.rotation.x = rampAngle;

    const downPlank = BABYLON.MeshBuilder.CreateBox("dwDownPlank", { width: w, height: 0.08, depth: rampLen }, this.scene);
    downPlank.material = greenMat; downPlank.parent = downRampNode;

    const downYellow = BABYLON.MeshBuilder.CreateBox("dwDownYellow", { width: w + 0.02, height: 0.1, depth: contactLen }, this.scene);
    downYellow.position.z = rampLen / 2 - contactLen / 2;
    downYellow.material = yellowMat; downYellow.parent = downRampNode;
  }

  _buildSeesaw3D(parent, w, d, greenMat, yellowMat, frameMat) {
    const pivotH = 0.6;
    const contactLen = 0.9;
    const halfD = d / 2;

    // Fulcrum Stand
    const stand = BABYLON.MeshBuilder.CreateBox("seesawStand", { width: w + 0.2, height: pivotH, depth: 0.2 }, this.scene);
    stand.position = new BABYLON.Vector3(0, pivotH / 2, 0); stand.material = frameMat; stand.parent = parent;

    // Plank slightly tilted (6 deg)
    const plankNode = new BABYLON.TransformNode("seesawPlankNode", this.scene);
    plankNode.parent = parent;
    plankNode.position = new BABYLON.Vector3(0, pivotH, 0);
    plankNode.rotation.x = rad3D(20); // Resting tilt angle

    const plank = BABYLON.MeshBuilder.CreateBox("seesawPlank", { width: w, height: 0.08, depth: d }, this.scene);
    plank.material = greenMat; plank.parent = plankNode;

    const yellowA = BABYLON.MeshBuilder.CreateBox("seesawY1", { width: w + 0.02, height: 0.1, depth: contactLen }, this.scene);
    yellowA.position.z = -halfD + contactLen / 2; yellowA.material = yellowMat; yellowA.parent = plankNode;

    const yellowB = BABYLON.MeshBuilder.CreateBox("seesawY2", { width: w + 0.02, height: 0.1, depth: contactLen }, this.scene);
    yellowB.position.z = halfD - contactLen / 2; yellowB.material = yellowMat; yellowB.parent = plankNode;
  }

  _buildTunnel3D(parent, obs, field, pipeMat, collarMat) {
    const tunnelRadius = 0.3; // 60cm diameter opening
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

    const tunnelMesh = BABYLON.MeshBuilder.CreateTube("tunnelTube", { path: path, radius: tunnelRadius, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, this.scene);
    tunnelMesh.material = pipeMat; tunnelMesh.parent = parent;
    if (this.shadowGenerator) this.shadowGenerator.addShadowCaster(tunnelMesh);

    // // Entrance and Exit Yellow Collar Rings
    // const collarA = BABYLON.MeshBuilder.CreateTorus("collarA", { diameter: tunnelRadius * 2 + 0.08, thickness: 0.08 }, this.scene);
    // collarA.position = path[0]; collarA.material = collarMat; collarA.parent = parent;

    // const collarB = BABYLON.MeshBuilder.CreateTorus("collarB", { diameter: tunnelRadius * 2 + 0.08, thickness: 0.08 }, this.scene);
    // collarB.position = path[path.length - 1]; collarB.material = collarMat; collarB.parent = parent;
  }

  _buildWeaves3D(parent, w, d, polesCount, purpleMat, whiteMat, baseMat) {
    const count = polesCount || 6;
    const step = d / Math.max(count - 1, 1);
    const halfD = d / 2;
    const poleH = 1.0;
    const poleR = 0.025;

    // Base bar along ground
    const baseBar = BABYLON.MeshBuilder.CreateBox("weaveBase", { width: 0.08, height: 0.02, depth: d }, this.scene);
    baseBar.position = new BABYLON.Vector3(0, 0.01, 0); baseBar.material = baseMat; baseBar.parent = parent;

    for (let i = 0; i < count; i++) {
      const z = -halfD + i * step;
      const pole = BABYLON.MeshBuilder.CreateCylinder(`pole_${i}`, { height: poleH, diameter: poleR * 2 }, this.scene);
      pole.position = new BABYLON.Vector3(0, poleH / 2, z);
      pole.material = i % 2 === 0 ? purpleMat : whiteMat;
      pole.parent = parent;
      if (this.shadowGenerator) this.shadowGenerator.addShadowCaster(pole);
    }
  }

  _buildStartFinish3D(parent, w, d, redMat, whiteMat) {
    const postH = 1.2;
    const pL = BABYLON.MeshBuilder.CreateCylinder("sfL", { height: postH, diameter: 0.1 }, this.scene);
    pL.position = new BABYLON.Vector3(-w / 2, postH / 2, 0); pL.material = redMat; pL.parent = parent;

    const pR = BABYLON.MeshBuilder.CreateCylinder("sfR", { height: postH, diameter: 0.1 }, this.scene);
    pR.position = new BABYLON.Vector3(w / 2, postH / 2, 0); pR.material = redMat; pR.parent = parent;

    const banner = BABYLON.MeshBuilder.CreateBox("sfBanner", { width: w, height: 0.15, depth: 0.02 }, this.scene);
    banner.position = new BABYLON.Vector3(0, postH - 0.1, 0); banner.material = whiteMat; banner.parent = parent;
  }

  _buildGenericBox3D(parent, w, d, mat) {
    const box = BABYLON.MeshBuilder.CreateBox("generic", { width: w, height: 0.5, depth: d }, this.scene);
    box.position = new BABYLON.Vector3(0, 0.25, 0); box.material = mat; box.parent = parent;
  }

  // --- 3D TRAJECTORY PATH & BADGES ---
  _build3DTrajectory(field, obstacles, pathModel) {
    if (!pathModel || !pathModel.showPath) return;

    const steps = typeof pathModel.getSequencedSteps === 'function' ? pathModel.getSequencedSteps(obstacles) : [];
    const sequenced = pathModel.getSequencedObstacles(obstacles);
    if (steps.length < 2 && sequenced.length < 2) return;

    const allWaypoints2D = pathModel.getAllWaypoints(obstacles);
    if (allWaypoints2D.length < 2) return;

    // Convert 2D waypoints into 3D points elevated at running height
    const pts3D = allWaypoints2D.map(p => {
      let h = 0.3; // Default 30cm running elevation
      if (p.isCenter) {
        h = 0.4;
      }
      return this.fieldToWorld3D(p.x, p.y, h);
    });

    try {
      const catmull = BABYLON.Curve3.CreateCatmullRomSpline(pts3D, 12, false);
      const curvePts = catmull.getPoints();

      // Create glowing cyan 3D trajectory tube
      const trajTube = BABYLON.MeshBuilder.CreateTube("traj3d", { path: curvePts, radius: 0.05 }, this.scene);
      const trajMat = new BABYLON.StandardMaterial("trajMat", this.scene);
      trajMat.diffuseColor = new BABYLON.Color3(0.22, 0.74, 0.97);
      trajMat.emissiveColor = new BABYLON.Color3(0.1, 0.4, 0.6);
      trajTube.material = trajMat;
      trajTube.parent = this.trajectoryGroup;
    } catch (e) {
      console.warn("3D trajectory spline creation exception:", e);
    }

    // 3D Sequence Number Badges floating above obstacles
    sequenced.forEach(obs => {
      const seqStr = typeof obs.getSeqString === 'function' ? obs.getSeqString() : (obs.seq ? String(obs.seq) : '');
      if (!seqStr) return;

      const pos3D = this.fieldToWorld3D(obs.x, obs.y, 0.5);

      const disc = BABYLON.MeshBuilder.CreateCylinder(`badge3d_${obs.id}`, { height: 0.08, diameter: 0.9 }, this.scene);
      disc.position = pos3D;
      disc.parent = this.trajectoryGroup;

      const badgeMat = new BABYLON.StandardMaterial("badgeMat", this.scene);
      badgeMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
      badgeMat.emissiveColor = new BABYLON.Color3(0.8, 0.8, 0.8);
      disc.material = badgeMat;

      // Dynamic Texture with Sequence Number Text
      const dynamicTexture = new BABYLON.DynamicTexture(`dynamicTex_${obs.id}`, { width: 256, height: 256 }, this.scene);
      const fontSize = seqStr.length > 3 ? "bold 90px sans-serif" : "bold 130px sans-serif";
      dynamicTexture.drawText(seqStr, null, 170, fontSize, "black", "#fff", true);
      badgeMat.diffuseTexture = dynamicTexture;
    });
  }
}
