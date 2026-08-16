/**
 * Agility Course Designer - Augmented Reality (AR) Course Walkthrough Engine
 * Powered by OpenCV.js 6-DoF Pose Estimation (solvePnP) and Babylon.js WebGL rendering.
 * Anchors the full 3D course model to physical ArUco field markers in real-time.
 */

class ARPoseEstimator {
  constructor(options = {}) {
    this.markerSizeMeters = options.markerSizeMeters || 0.20; // 20cm default marker size
    this.fieldWidth = options.fieldWidth || 40;
    this.fieldLength = options.fieldLength || 20;

    // Mapping of marker key to field position
    this.markerFieldPositions = {
      top_left:     { fx: 0,                   fy: 0 },
      top_mid:      { fx: this.fieldWidth / 2, fy: 0 },
      top_right:    { fx: this.fieldWidth,     fy: 0 },
      right_mid:    { fx: this.fieldWidth,     fy: this.fieldLength / 2 },
      bottom_right: { fx: this.fieldWidth,     fy: this.fieldLength },
      bottom_mid:   { fx: this.fieldWidth / 2, fy: this.fieldLength },
      bottom_left:  { fx: 0,                   fy: this.fieldLength },
      left_mid:     { fx: 0,                   fy: this.fieldLength / 2 }
    };

    // Filter states for temporal smoothing (EMA + Slerp)
    this.filterAlpha = 0.38; // Smoothing factor (0 = full lag, 1 = no filter)
    this.smoothedPos = null;
    this.smoothedQuat = null;
    this.isTracking = false;
    this.trackedMarkerCount = 0;
    this.lastTrackingTime = 0;
    this.poseHoldTimeoutMs = 1200; // Hold last known pose for 1.2s during fast panning

    // Reusable OpenCV structures
    this._cvReady = false;
    this._cameraMatrix = null;
    this._distCoeffs = null;
    this._rvec = null;
    this._tvec = null;
    this._rotMat = null;
    this._lastCanvasW = 0;
    this._lastCanvasH = 0;
  }

  setFieldDimensions(width, length) {
    this.fieldWidth = width;
    this.fieldLength = length;
    this.markerFieldPositions = {
      top_left:     { fx: 0,                   fy: 0 },
      top_mid:      { fx: this.fieldWidth / 2, fy: 0 },
      top_right:    { fx: this.fieldWidth,     fy: 0 },
      right_mid:    { fx: this.fieldWidth,     fy: this.fieldLength / 2 },
      bottom_right: { fx: this.fieldWidth,     fy: this.fieldLength },
      bottom_mid:   { fx: this.fieldWidth / 2, fy: this.fieldLength },
      bottom_left:  { fx: 0,                   fy: this.fieldLength },
      left_mid:     { fx: 0,                   fy: this.fieldLength / 2 }
    };
  }

  setMarkerSize(sizeMeters) {
    this.markerSizeMeters = Math.max(0.05, Math.min(2.0, parseFloat(sizeMeters) || 0.20));
  }

  _initCvMats(canvasW, canvasH) {
    if (typeof cv === 'undefined' || !cv.Mat) return false;

    if (!this._distCoeffs) {
      this._distCoeffs = new cv.Mat.zeros(5, 1, cv.CV_64FC1);
      this._rvec = new cv.Mat(3, 1, cv.CV_64FC1);
      this._tvec = new cv.Mat(3, 1, cv.CV_64FC1);
      this._rotMat = new cv.Mat(3, 3, cv.CV_64FC1);
    }

    if (!this._cameraMatrix || this._lastCanvasW !== canvasW || this._lastCanvasH !== canvasH) {
      if (this._cameraMatrix) this._cameraMatrix.delete();

      // Estimate camera focal length (standard 60 deg vertical FOV)
      const fovY = (60 * Math.PI) / 180;
      const fy = (canvasH / 2) / Math.tan(fovY / 2);
      const fx = fy;
      const cx = canvasW / 2;
      const cy = canvasH / 2;

      this._cameraMatrix = cv.matFromArray(3, 3, cv.CV_64FC1, [
        fx, 0,  cx,
        0,  fy, cy,
        0,  0,  1
      ]);

      this._lastCanvasW = canvasW;
      this._lastCanvasH = canvasH;
      this.fovY = fovY;
    }

    this._cvReady = true;
    return true;
  }

  /**
   * Estimates 6-DoF camera pose from detected markers in current frame.
   * Returns { position: BABYLON.Vector3, rotation: BABYLON.Quaternion, trackedCount, isTracking } or null.
   */
  estimatePose(detectedMarkers, idMapping, canvasW, canvasH) {
    if (!detectedMarkers || detectedMarkers.length === 0) {
      // Check if within pose hold timeout
      if (this.isTracking && (Date.now() - this.lastTrackingTime < this.poseHoldTimeoutMs)) {
        return {
          position: this.smoothedPos,
          rotation: this.smoothedQuat,
          trackedCount: 0,
          isTracking: true,
          isHolding: true
        };
      }
      this.isTracking = false;
      this.trackedMarkerCount = 0;
      return null;
    }

    if (!this._initCvMats(canvasW, canvasH)) {
      return null;
    }

    const objPointsArr = [];
    const imgPointsArr = [];
    const S = this.markerSizeMeters;
    const halfS = S / 2;
    let matchedMarkers = 0;

    // For each detected marker, find its 3D world coordinates
    detectedMarkers.forEach(m => {
      // Find matching definition
      let matchedKey = null;
      for (const [key, id] of Object.entries(idMapping)) {
        if (id === m.id) {
          matchedKey = key;
          break;
        }
      }

      if (!matchedKey || !this.markerFieldPositions[matchedKey]) return;

      const fieldPos = this.markerFieldPositions[matchedKey];
      // Convert Field 2D (x, y) to Babylon 3D World (Xw, 0, Zw)
      const Xw = fieldPos.fx - this.fieldWidth / 2;
      const Zw = -(fieldPos.fy - this.fieldLength / 2);

      // In OpenCV coordinates (X right, Y down, Z forward):
      // Field is on ground plane. Let world coordinates in OpenCV system be:
      // X_cv = Xw, Y_cv = -height = 0, Z_cv = Zw
      // 4 corners of marker on ground:
      // Corner 0: top-left (Xw - halfS, 0, Zw + halfS)
      // Corner 1: top-right (Xw + halfS, 0, Zw + halfS)
      // Corner 2: bottom-right (Xw + halfS, 0, Zw - halfS)
      // Corner 3: bottom-left (Xw - halfS, 0, Zw - halfS)

      const c0 = [Xw - halfS, 0, Zw + halfS];
      const c1 = [Xw + halfS, 0, Zw + halfS];
      const c2 = [Xw + halfS, 0, Zw - halfS];
      const c3 = [Xw - halfS, 0, Zw - halfS];

      objPointsArr.push(...c0, ...c1, ...c2, ...c3);

      m.corners.forEach(p => {
        imgPointsArr.push(p.x, p.y);
      });

      matchedMarkers++;
    });

    if (matchedMarkers === 0 || objPointsArr.length < 12) {
      // Need at least 4 coplanar points (1 marker = 4 corners = 12 floats)
      if (this.isTracking && (Date.now() - this.lastTrackingTime < this.poseHoldTimeoutMs)) {
        return {
          position: this.smoothedPos,
          rotation: this.smoothedQuat,
          trackedCount: 0,
          isTracking: true,
          isHolding: true
        };
      }
      this.isTracking = false;
      this.trackedMarkerCount = 0;
      return null;
    }

    let objMat = null;
    let imgMat = null;

    try {
      const numPoints = objPointsArr.length / 3;
      objMat = cv.matFromArray(numPoints, 3, cv.CV_64FC1, objPointsArr);
      imgMat = cv.matFromArray(numPoints, 2, cv.CV_64FC1, imgPointsArr);

      // Solve PnP for 6-DoF camera pose
      const solved = cv.solvePnP(
        objMat,
        imgMat,
        this._cameraMatrix,
        this._distCoeffs,
        this._rvec,
        this._tvec,
        false,
        cv.SOLVEPNP_ITERATIVE
      );

      if (!solved) {
        return null;
      }

      // Convert rotation vector to 3x3 rotation matrix
      cv.Rodrigues(this._rvec, this._rotMat);

      const R = this._rotMat.data64F; // Row-major 3x3
      const t = this._tvec.data64F;   // 3x1 translation

      // In OpenCV: P_cam = R * P_world + t
      // Camera position in World: C = -R^T * t
      const r00 = R[0], r01 = R[1], r02 = R[2];
      const r10 = R[3], r11 = R[4], r12 = R[5];
      const r20 = R[6], r21 = R[7], r22 = R[8];

      const tx = t[0], ty = t[1], tz = t[2];

      // World Camera Position in OpenCV world:
      const cx = -(r00 * tx + r10 * ty + r20 * tz);
      const cy = -(r01 * tx + r11 * ty + r21 * tz);
      const cz = -(r02 * tx + r12 * ty + r22 * tz);

      // Convert to Babylon.js World Space (Left-Handed, Y up):
      // In our setup:
      // Babylon World X = cx
      // Babylon World Y = -cy  (since OpenCV Y is down, height above ground is -cy)
      // Babylon World Z = cz
      const camPos = new BABYLON.Vector3(cx, -cy, cz);

      // Convert Camera Orientation to Babylon.js World space:
      // OpenCV camera forward is (0, 0, 1), up is (0, -1, 0), right is (1, 0, 0).
      // In World space:
      // Forward_world = R^T * [0, 0, 1]^T = [r20, r21, r22]
      // Up_world      = R^T * [0, -1, 0]^T = [-r10, -r11, -r12]
      // Right_world   = R^T * [1, 0, 0]^T = [r00, r01, r02]

      // Convert vectors to Babylon (flip Y):
      const forwardBabylon = new BABYLON.Vector3(r20, -r21, r22).normalize();
      const upBabylon = new BABYLON.Vector3(-r10, r11, -r12).normalize();
      const rightBabylon = new BABYLON.Vector3(r00, -r01, r02).normalize();

      // Construct Babylon 4x4 rotation matrix from orthogonal vectors
      const rotMatrix = BABYLON.Matrix.FromValues(
        rightBabylon.x,   rightBabylon.y,   rightBabylon.z,   0,
        upBabylon.x,      upBabylon.y,      upBabylon.z,      0,
        forwardBabylon.x, forwardBabylon.y, forwardBabylon.z, 0,
        0,                0,                0,                1
      );

      const rawQuat = BABYLON.Quaternion.FromRotationMatrix(rotMatrix);

      // Apply Temporal Smoothing (EMA for position, Slerp for orientation)
      if (!this.smoothedPos) {
        this.smoothedPos = camPos.clone();
        this.smoothedQuat = rawQuat.clone();
      } else {
        // Dynamic smoothing: if position jump is huge (> 10m), snap directly
        const dist = BABYLON.Vector3.Distance(this.smoothedPos, camPos);
        const alpha = dist > 8 ? 0.9 : this.filterAlpha;

        this.smoothedPos = BABYLON.Vector3.Lerp(this.smoothedPos, camPos, alpha);
        this.smoothedQuat = BABYLON.Quaternion.Slerp(this.smoothedQuat, rawQuat, alpha);
      }

      this.isTracking = true;
      this.trackedMarkerCount = matchedMarkers;
      this.lastTrackingTime = Date.now();

      return {
        position: this.smoothedPos,
        rotation: this.smoothedQuat,
        trackedCount: matchedMarkers,
        isTracking: true,
        isHolding: false
      };
    } catch (err) {
      console.warn('[AR] solvePnP estimation error:', err);
      return null;
    } finally {
      if (objMat) objMat.delete();
      if (imgMat) imgMat.delete();
    }
  }

  destroy() {
    if (this._cameraMatrix) { this._cameraMatrix.delete(); this._cameraMatrix = null; }
    if (this._distCoeffs) { this._distCoeffs.delete(); this._distCoeffs = null; }
    if (this._rvec) { this._rvec.delete(); this._rvec = null; }
    if (this._tvec) { this._tvec.delete(); this._tvec = null; }
    if (this._rotMat) { this._rotMat.delete(); this._rotMat = null; }
  }
}

/**
 * ARCourseEngine - Transparent Babylon.js AR Walkthrough Visualizer
 * Overlays full 3D dog agility course onto camera feed locked to ArUco markers.
 */
class ARCourseEngine {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.engine = null;
    this.scene = null;
    this.camera = null;
    this.obstaclesGroup = null;
    this.trajectoryGroup = null;
    this.groundMesh = null;
    this.groundMat = null;
    this.borderTube = null;

    this.isArActive = false;
    this.groundOpacity = 0.0; // Default 0% (invisible ground to see real grass)
    this.showTrajectory = true;
    this.showObstacleNumbers = true;

    this.poseEstimator = new ARPoseEstimator();
    this.currentField = null;
    this.currentObstacles = [];
    this.currentPathModel = null;
    this.isInitialized = false;

    if (typeof BABYLON !== 'undefined') {
      this._initScene();
    }
  }

  _initScene() {
    try {
      if (!this.canvas) return;
      this.engine = new BABYLON.Engine(this.canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
        alpha: true,
        premultipliedAlpha: false
      });

      this.scene = new BABYLON.Scene(this.engine);
      // Completely transparent background for AR overlay
      this.scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);

      // AR FreeCamera with rotation quaternion support
      this.camera = new BABYLON.FreeCamera("arCamera", new BABYLON.Vector3(0, 2, -15), this.scene);
      this.camera.rotationQuaternion = new BABYLON.Quaternion();
      this.camera.minZ = 0.1;
      this.camera.maxZ = 300;
      this.camera.fov = (60 * Math.PI) / 180;

      // Realistic Ambient Lighting for outdoor AR
      const hemiLight = new BABYLON.HemisphericLight("arHemiLight", new BABYLON.Vector3(0, 1, 0), this.scene);
      hemiLight.intensity = 0.9;
      hemiLight.diffuse = new BABYLON.Color3(1.0, 0.98, 0.95);
      hemiLight.groundColor = new BABYLON.Color3(0.2, 0.35, 0.2);

      // Directional Sunlight
      const dirLight = new BABYLON.DirectionalLight("arDirLight", new BABYLON.Vector3(-0.5, -2, -1), this.scene);
      dirLight.position = new BABYLON.Vector3(20, 40, 20);
      dirLight.intensity = 0.85;

      this.obstaclesGroup = new BABYLON.TransformNode("arObstaclesGroup", this.scene);
      this.trajectoryGroup = new BABYLON.TransformNode("arTrajectoryGroup", this.scene);

      // Start Render Loop
      this.engine.runRenderLoop(() => {
        if (this.isArActive && this.scene) {
          this.scene.render();
        }
      });

      this.isInitialized = true;
    } catch (e) {
      console.error("[AR] Babylon.js AR scene initialization error:", e);
    }
  }

  resize() {
    if (this.engine) this.engine.resize();
  }

  setArActive(active) {
    this.isArActive = !!active;
    if (this.canvas) {
      this.canvas.style.display = this.isArActive ? 'block' : 'none';
      if (this.isArActive) {
        this.resize();
      }
    }
  }

  setGroundOpacity(val) {
    this.groundOpacity = Math.max(0, Math.min(1, parseFloat(val)));
    if (this.groundMat) {
      this.groundMat.alpha = this.groundOpacity;
    }
    if (this.borderTube) {
      this.borderTube.visibility = this.groundOpacity > 0 ? 1 : 0.6;
    }
  }

  setMarkerSize(sizeMeters) {
    this.poseEstimator.setMarkerSize(sizeMeters);
  }

  /**
   * Syncs the course data (obstacles, field dimensions, trajectory) from AgilityApp
   */
  updateCourse(field, obstacles, pathModel) {
    if (!this.isInitialized) {
      this._initScene();
      if (!this.isInitialized) return;
    }

    this.currentField = field;
    this.currentObstacles = obstacles || [];
    this.currentPathModel = pathModel;

    if (field) {
      this.poseEstimator.setFieldDimensions(field.widthMeters, field.lengthMeters);
    }

    // 1. Build Ground & Boundary Tube
    if (this.groundMesh) this.groundMesh.dispose();
    if (this.borderTube) this.borderTube.dispose();
    this._buildGround(field);

    // 2. Clear old obstacles
    if (this.obstaclesGroup) this.obstaclesGroup.dispose();
    this.obstaclesGroup = new BABYLON.TransformNode("arObstaclesGroup", this.scene);

    // 3. Clear old trajectory
    if (this.trajectoryGroup) this.trajectoryGroup.dispose();
    this.trajectoryGroup = new BABYLON.TransformNode("arTrajectoryGroup", this.scene);

    // 4. Build 3D Obstacles
    this.currentObstacles.forEach(obs => {
      this._build3DObstacle(obs, field);
    });

    // 5. Build 3D Trajectory & Badges
    if (pathModel && this.showTrajectory) {
      this._build3DTrajectory(field, this.currentObstacles, pathModel);
    }

    this.resize();
  }

  // --- FIELD GROUND BUILDER ---
  _buildGround(field) {
    const w = field ? field.widthMeters : 40;
    const l = field ? field.lengthMeters : 20;

    // Grass ground box
    this.groundMesh = BABYLON.MeshBuilder.CreateBox("arGround", { width: w, depth: l, height: 0.1 }, this.scene);
    this.groundMesh.position.y = -0.05;

    const grassMat = new BABYLON.StandardMaterial("arGrassMat", this.scene);
    grassMat.diffuseColor = new BABYLON.Color3(0.12, 0.45, 0.22);
    grassMat.alpha = this.groundOpacity;
    grassMat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
    grassMat.backFaceCulling = false;
    this.groundMat = grassMat;
    this.groundMesh.material = grassMat;

    // Glowing Gold Perimeter Field Boundary Line
    const perimeterPts = [
      new BABYLON.Vector3(-w / 2, 0.04, -l / 2),
      new BABYLON.Vector3(w / 2, 0.04, -l / 2),
      new BABYLON.Vector3(w / 2, 0.04, l / 2),
      new BABYLON.Vector3(-w / 2, 0.04, l / 2),
      new BABYLON.Vector3(-w / 2, 0.04, -l / 2)
    ];
    this.borderTube = BABYLON.MeshBuilder.CreateTube("arBorderTube", { path: perimeterPts, radius: 0.06 }, this.scene);
    const borderMat = new BABYLON.StandardMaterial("arBorderMat", this.scene);
    borderMat.diffuseColor = new BABYLON.Color3(0.98, 0.82, 0.15);
    borderMat.emissiveColor = new BABYLON.Color3(0.4, 0.3, 0.05);
    this.borderTube.material = borderMat;
  }

  fieldToWorld3D(fieldX, fieldY, fieldHeight = 0) {
    const w = this.currentField ? this.currentField.widthMeters : 40;
    const l = this.currentField ? this.currentField.lengthMeters : 20;
    return new BABYLON.Vector3(
      fieldX - w / 2,
      fieldHeight,
      -(fieldY - l / 2)
    );
  }

  _build3DObstacle(obs, field) {
    try {
      const obsNode = new BABYLON.TransformNode(`ar_obs_${obs.id}`, this.scene);
      obsNode.parent = this.obstaclesGroup;

      const pos3D = this.fieldToWorld3D(obs.x, obs.y, 0);
      obsNode.position = pos3D;
      obsNode.rotation.y = ((obs.rotation || 0) * Math.PI) / 180;

      const w = obs.widthMeters || 1.5;
      const d = obs.depthMeters || 0.5;

      const color = BABYLON.Color3.FromHexString(obs.color || '#3b82f6');
      const mat = new BABYLON.StandardMaterial(`ar_mat_${obs.id}`, this.scene);
      mat.diffuseColor = color;
      mat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);

      const type = obs.type || 'jump_single';

      if (type.includes('jump')) {
        // Wing Jump Bars & Uprights
        const bar = BABYLON.MeshBuilder.CreateCylinder("bar", { height: w, diameter: 0.08 }, this.scene);
        bar.rotation.z = Math.PI / 2;
        bar.position.y = 0.6;
        bar.material = mat;
        bar.parent = obsNode;

        const uprightL = BABYLON.MeshBuilder.CreateBox("upL", { width: 0.1, height: 1.0, depth: 0.1 }, this.scene);
        uprightL.position = new BABYLON.Vector3(-w / 2, 0.5, 0);
        uprightL.material = mat;
        uprightL.parent = obsNode;

        const uprightR = BABYLON.MeshBuilder.CreateBox("upR", { width: 0.1, height: 1.0, depth: 0.1 }, this.scene);
        uprightR.position = new BABYLON.Vector3(w / 2, 0.5, 0);
        uprightR.material = mat;
        uprightR.parent = obsNode;
      } else if (type.includes('tunnel')) {
        // Cylindrical Tunnel Tube
        const tunnelLen = obs.lengthMeters || 4;
        const tunnel = BABYLON.MeshBuilder.CreateCylinder("tunnel", { height: tunnelLen, diameter: 0.85, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, this.scene);
        tunnel.rotation.x = Math.PI / 2;
        tunnel.position.y = 0.42;
        tunnel.material = mat;
        tunnel.parent = obsNode;
      } else if (type.includes('weave')) {
        // Slalom Weave Poles
        const numPoles = type.includes('12') ? 12 : 6;
        const spacing = 0.6;
        const startZ = -((numPoles - 1) * spacing) / 2;
        for (let i = 0; i < numPoles; i++) {
          const pole = BABYLON.MeshBuilder.CreateCylinder(`pole_${i}`, { height: 1.0, diameter: 0.05 }, this.scene);
          pole.position = new BABYLON.Vector3(0, 0.5, startZ + i * spacing);
          const poleMat = new BABYLON.StandardMaterial(`poleMat_${i}`, this.scene);
          poleMat.diffuseColor = (i % 2 === 0) ? new BABYLON.Color3(0.9, 0.2, 0.2) : new BABYLON.Color3(1, 1, 1);
          pole.material = poleMat;
          pole.parent = obsNode;
        }
      } else if (type === 'dog_walk') {
        // Dog Walk Contact Ramp
        const walk = BABYLON.MeshBuilder.CreateBox("walkPlank", { width: 0.4, height: 0.08, depth: 12 }, this.scene);
        walk.position.y = 1.25;
        walk.material = mat;
        walk.parent = obsNode;
      } else if (type === 'a_frame') {
        // A-Frame Ramps
        const ramp1 = BABYLON.MeshBuilder.CreateBox("aRamp1", { width: 0.9, height: 0.08, depth: 2.8 }, this.scene);
        ramp1.rotation.x = 0.65;
        ramp1.position = new BABYLON.Vector3(0, 0.85, -1.0);
        ramp1.material = mat;
        ramp1.parent = obsNode;

        const ramp2 = BABYLON.MeshBuilder.CreateBox("aRamp2", { width: 0.9, height: 0.08, depth: 2.8 }, this.scene);
        ramp2.rotation.x = -0.65;
        ramp2.position = new BABYLON.Vector3(0, 0.85, 1.0);
        ramp2.material = mat;
        ramp2.parent = obsNode;
      } else {
        // Generic Obstacle Box
        const box = BABYLON.MeshBuilder.CreateBox("genBox", { width: w, height: 0.6, depth: d }, this.scene);
        box.position.y = 0.3;
        box.material = mat;
        box.parent = obsNode;
      }

      // 3D Sequence Number Badge
      if (this.showObstacleNumbers && obs.sequenceNumber !== undefined && obs.sequenceNumber !== null) {
        this._build3DNumberBadge(obsNode, obs.sequenceNumber);
      }
    } catch (err) {
      console.warn('[AR] Error building 3D obstacle:', err);
    }
  }

  _build3DNumberBadge(parentMesh, num) {
    const plane = BABYLON.MeshBuilder.CreatePlane("numBadge", { size: 0.65 }, this.scene);
    plane.position = new BABYLON.Vector3(0, 1.4, 0);
    plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    plane.parent = parentMesh;

    const dynTex = new BABYLON.DynamicTexture("numTex", { width: 256, height: 256 }, this.scene);
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
    ctx.fillText(String(num), 128, 134);
    dynTex.update();

    const badgeMat = new BABYLON.StandardMaterial("badgeMat", this.scene);
    badgeMat.diffuseTexture = dynTex;
    badgeMat.emissiveColor = new BABYLON.Color3(0.9, 0.9, 0.9);
    badgeMat.specularColor = new BABYLON.Color3(0, 0, 0);
    badgeMat.useAlphaFromDiffuseTexture = true;
    plane.material = badgeMat;
  }

  _build3DTrajectory(field, obstacles, pathModel) {
    if (!pathModel || !obstacles || obstacles.length < 2) return;
    try {
      const sorted = [...obstacles].filter(o => o.sequenceNumber !== undefined && o.sequenceNumber !== null)
                                   .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      if (sorted.length < 2) return;

      const pathPoints = [];
      sorted.forEach(obs => {
        pathPoints.push(this.fieldToWorld3D(obs.x, obs.y, 0.5));
      });

      const catmullSpline = BABYLON.Curve3.CreateCatmullRomSpline(pathPoints, 12, false);
      const splinePoints = catmullSpline.getPoints();

      const trajectoryTube = BABYLON.MeshBuilder.CreateTube("arTrajectoryTube", {
        path: splinePoints,
        radius: 0.05,
        sideOrientation: BABYLON.Mesh.DOUBLESIDE
      }, this.scene);

      const trajMat = new BABYLON.StandardMaterial("arTrajMat", this.scene);
      trajMat.diffuseColor = new BABYLON.Color3(0.22, 0.74, 0.97); // Cyan
      trajMat.emissiveColor = new BABYLON.Color3(0.1, 0.4, 0.6);
      trajectoryTube.material = trajMat;
      trajectoryTube.parent = this.trajectoryGroup;
    } catch (e) {
      console.warn('[AR] Trajectory build error:', e);
    }
  }

  /**
   * Called on every camera frame with detected markers
   */
  updatePose(detectedMarkers, idMapping) {
    if (!this.isArActive || !this.camera) return;

    const outputCanvas = document.getElementById('outputCanvas');
    if (outputCanvas && outputCanvas.width > 0 && outputCanvas.height > 0) {
      if (this.canvas.width !== outputCanvas.width || this.canvas.height !== outputCanvas.height) {
        this.canvas.width = outputCanvas.width;
        this.canvas.height = outputCanvas.height;
        this.resize();
      }
    }

    const canvasW = this.canvas.width || 640;
    const canvasH = this.canvas.height || 480;

    const pose = this.poseEstimator.estimatePose(detectedMarkers, idMapping, canvasW, canvasH);

    const arBadge = document.getElementById('ar-tracking-badge');

    if (pose && pose.isTracking) {
      this.camera.position.copyFrom(pose.position);
      this.camera.rotationQuaternion.copyFrom(pose.rotation);
      this.camera.fov = this.poseEstimator.fovY || (60 * Math.PI) / 180;

      if (arBadge) {
        arBadge.className = 'aruco-status-badge ready';
        if (pose.isHolding) {
          arBadge.innerHTML = `<span class="aruco-status-dot"></span> AR Locked (Holding)`;
        } else {
          arBadge.innerHTML = `<span class="aruco-status-dot"></span> AR Locked (${pose.trackedCount} Marker${pose.trackedCount > 1 ? 's' : ''})`;
        }
      }
    } else {
      if (arBadge) {
        arBadge.className = 'aruco-status-badge loading';
        arBadge.innerHTML = `<span class="aruco-status-dot"></span> Searching Markers...`;
      }
    }
  }
}

// Global instance
window.ARPoseEstimator = ARPoseEstimator;
window.ARCourseEngine = ARCourseEngine;
