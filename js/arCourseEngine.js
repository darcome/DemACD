/**
 * Agility Course Designer - Augmented Reality (AR) Course Walkthrough Engine
 * Powered by OpenCV.js 6-DoF Pose Estimation (solvePnP) and Babylon.js WebGL rendering.
 * Anchors the full 3D course model to physical ArUco field markers in real-time.
 */

/**
 * Agility Course Designer - AR Pose Estimator (Fixed & Optimized)
 */
class ARPoseEstimator {
  constructor(options = {}) {
    this.markerSizeMeters = options.markerSizeMeters || 0.20;
    this.fieldWidth = options.fieldWidth || 40;
    this.fieldLength = options.fieldLength || 20;

    this.markerFieldPositions = this._computeFieldPositions();

    this.filterAlpha = 0.38;
    this.smoothedPos = null;
    this.smoothedQuat = null;
    this.isTracking = false;
    this.trackedMarkerCount = 0;
    this.lastTrackingTime = 0;
    this.poseHoldTimeoutMs = 1200;

    this._cvReady = false;
    this._cameraMatrix = null;
    this._distCoeffs = null;
    this._rvec = null;
    this._tvec = null;
    this._rotMat = null;
    this._lastCanvasW = 0;
    this._lastCanvasH = 0;
  }

  _computeFieldPositions() {
    return {
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

  setFieldDimensions(width, length) {
    this.fieldWidth = width;
    this.fieldLength = length;
    this.markerFieldPositions = this._computeFieldPositions();
  }

  setMarkerSize(sizeMeters) {
    this.markerSizeMeters = Math.max(0.05, Math.min(2.0, parseFloat(sizeMeters) || 0.20));
  }

  _initCvMats(canvasW, canvasH) {
    if (typeof cv === 'undefined' || !cv.Mat) return false;

    if (!this._distCoeffs) {
      this._distCoeffs = cv.Mat.zeros(5, 1, cv.CV_64FC1); // Fixed constructor syntax
      this._rvec = new cv.Mat(3, 1, cv.CV_64FC1);
      this._tvec = new cv.Mat(3, 1, cv.CV_64FC1);
      this._rotMat = new cv.Mat(3, 3, cv.CV_64FC1);
    }

    if (!this._cameraMatrix || this._lastCanvasW !== canvasW || this._lastCanvasH !== canvasH) {
      if (this._cameraMatrix) this._cameraMatrix.delete();

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

  estimatePose(detectedMarkers, idMapping, canvasW, canvasH) {
    if (!detectedMarkers || detectedMarkers.length === 0 || !idMapping) {
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

    if (!this._initCvMats(canvasW, canvasH)) return null;

    const objPointsArr = [];
    const imgPointsArr = [];
    const S = this.markerSizeMeters;
    const halfS = S / 2;
    let matchedMarkers = 0;

    detectedMarkers.forEach(m => {
      let matchedKey = null;
      for (const [key, id] of Object.entries(idMapping)) {
        if (id === m.id) {
          matchedKey = key;
          break;
        }
      }

      if (!matchedKey || !this.markerFieldPositions[matchedKey]) return;

      const fieldPos = this.markerFieldPositions[matchedKey];
      const Xw = fieldPos.fx - this.fieldWidth / 2;
      const Zw = -(fieldPos.fy - this.fieldLength / 2);

      // CW Corner Layout: TL, TR, BR, BL
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

      // Prefer the iterative solver for multi-marker planar layouts.
      // IPPE is optimized for a single square marker and can flip between
      // ambiguous planar solutions when more points are involved.
      const solveFlag = (typeof cv.SOLVEPNP_ITERATIVE !== 'undefined')
        ? cv.SOLVEPNP_ITERATIVE
        : (typeof cv.SOLVEPNP_EPNP !== 'undefined' ? cv.SOLVEPNP_EPNP : 0);

      const solved = cv.solvePnP(
        objMat,
        imgMat,
        this._cameraMatrix,
        this._distCoeffs,
        this._rvec,
        this._tvec,
        false,
        solveFlag
      );

      if (!solved) return null;

      cv.Rodrigues(this._rvec, this._rotMat);

      const R = this._rotMat.data64F;
      const t = this._tvec.data64F;

      const r00 = R[0], r01 = R[1], r02 = R[2];
      const r10 = R[3], r11 = R[4], r12 = R[5];
      const r20 = R[6], r21 = R[7], r22 = R[8];

      const tx = t[0], ty = t[1], tz = t[2];

      // Camera World Position: C = -R^T * t
      const cx = -(r00 * tx + r10 * ty + r20 * tz);
      const cy = -(r01 * tx + r11 * ty + r21 * tz);
      const cz = -(r02 * tx + r12 * ty + r22 * tz);

      const camPos = new BABYLON.Vector3(cx, cy, cz);

      // Camera Orientation Basis Vectors in World Space
      const rightBabylon   = new BABYLON.Vector3(r00, r01, r02).normalize();
      const upBabylon      = new BABYLON.Vector3(-r10, -r11, -r12).normalize();
      const forwardBabylon = new BABYLON.Vector3(r20, r21, r22).normalize();

      const rotMatrix = BABYLON.Matrix.Identity();
      BABYLON.Matrix.FromXYZAxesToRef(rightBabylon, upBabylon, forwardBabylon, rotMatrix);

      const rawQuat = BABYLON.Quaternion.FromRotationMatrix(rotMatrix);

      if (!this.smoothedPos) {
        this.smoothedPos = camPos.clone();
        this.smoothedQuat = rawQuat.clone();
      } else {
        const dist = BABYLON.Vector3.Distance(this.smoothedPos, camPos);
        const alpha = dist > 6.0 ? 0.85 : this.filterAlpha;

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
    if (this._distCoeffs)   { this._distCoeffs.delete();   this._distCoeffs = null; }
    if (this._rvec)         { this._rvec.delete();         this._rvec = null; }
    if (this._tvec)         { this._tvec.delete();         this._tvec = null; }
    if (this._rotMat)       { this._rotMat.delete();       this._rotMat = null; }
  }
}

/**
 * ARCourseEngine - Transparent Babylon.js AR Walkthrough Visualizer
 * Overlays full 3D dog agility course onto camera feed locked to ArUco markers using Course3DBuilder.
 */
/**
 * ARCourseEngine - Transparent Babylon.js AR Walkthrough Visualizer (Optimized)
 * Overlays full 3D dog agility course onto camera feed locked to ArUco markers.
 */
class ARCourseEngine {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.videoCanvas = options.videoCanvas || null;
    this.statusCallback = options.onStatusChange || null;

    this.engine = null;
    this.scene = null;
    this.camera = null;
    this.obstaclesGroup = null;
    this.trajectoryGroup = null;
    this.groundMesh = null;
    this.groundMat = null;
    this.borderTube = null;

    this.isArActive = false;
    this.groundOpacity = 0.0;
    this.showTrajectory = true;
    this.showObstacleNumbers = true;

    this.poseEstimator = new ARPoseEstimator(options);
    this.currentField = null;
    this.currentObstacles = [];
    this.currentPathModel = null;
    this.isInitialized = false;

    // Cache tracking state to prevent unnecessary DOM updates
    this._lastTrackingState = { isTracking: false, isHolding: false, count: -1 };

    if (typeof BABYLON !== 'undefined') {
      this._initScene();
    }
  }

  _initScene() {
    if (this.isInitialized || !this.canvas) return;

    try {
      this.engine = new BABYLON.Engine(this.canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
        alpha: true,
        premultipliedAlpha: false
      });

      this.scene = new BABYLON.Scene(this.engine);
      this.scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);

      // AR FreeCamera with vertical FOV locking
      this.camera = new BABYLON.FreeCamera("arCamera", new BABYLON.Vector3(0, 2, -15), this.scene);
      this.camera.rotationQuaternion = new BABYLON.Quaternion();
      this.camera.minZ = 0.1;
      this.camera.maxZ = 300;
      this.camera.fovMode = BABYLON.Camera.FOVMODE_VERTICAL_FIXED;
      this.camera.fov = (60 * Math.PI) / 180;

      // Outdoor AR Ambient & Directional Lighting
      const hemiLight = new BABYLON.HemisphericLight("arHemiLight", new BABYLON.Vector3(0, 1, 0), this.scene);
      hemiLight.intensity = 0.9;
      hemiLight.diffuse = new BABYLON.Color3(1.0, 0.98, 0.95);
      hemiLight.groundColor = new BABYLON.Color3(0.2, 0.35, 0.2);

      const dirLight = new BABYLON.DirectionalLight("arDirLight", new BABYLON.Vector3(-0.5, -2, -1), this.scene);
      dirLight.position = new BABYLON.Vector3(20, 40, 20);
      dirLight.intensity = 0.85;

      this.obstaclesGroup = new BABYLON.TransformNode("arObstaclesGroup", this.scene);
      this.trajectoryGroup = new BABYLON.TransformNode("arTrajectoryGroup", this.scene);

      this.engine.runRenderLoop(() => {
        if (this.isArActive && this.scene) {
          this.scene.render();
        }
      });

      this.isInitialized = true;
    } catch (e) {
      console.error("[AR] Babylon.js initialization error:", e);
    }
  }

  resize() {
    if (this.engine) this.engine.resize();
  }

  setArActive(active) {
    this.isArActive = !!active;
    if (this.canvas) {
      this.canvas.style.display = this.isArActive ? 'block' : 'none';
      if (this.isArActive) this.resize();
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

  updateCourse(field, obstacles, pathModel) {
    if (!this.isInitialized) {
      this._initScene();
      if (!this.isInitialized) return;
    }

    this.currentField = field;
    this.currentObstacles = obstacles || [];
    this.currentPathModel = pathModel;

    if (field) {
      const width = field.widthMeters || field.width || 40;
      const length = field.lengthMeters || field.length || 20;
      this.poseEstimator.setFieldDimensions(width, length);
    }

    // 1. Dispose old ground assets
    if (this.groundMesh) { this.groundMesh.dispose(false, true); this.groundMesh = null; }
    if (this.borderTube) { this.borderTube.dispose(false, true); this.borderTube = null; }

    const groundResult = Course3DBuilder.buildGround(this.scene, field, {
      opacity: this.groundOpacity,
      showGrid: false,
      isAr: true
    });
    this.groundMesh = groundResult.groundMesh;
    this.groundMat = groundResult.grassMat;
    this.borderTube = groundResult.borderTube;

    // 2. Clear old obstacle meshes
    if (this.obstaclesGroup) {
      this.obstaclesGroup.dispose(false, true);
    }
    this.obstaclesGroup = new BABYLON.TransformNode("arObstaclesGroup", this.scene);

    // 3. Clear old trajectory meshes
    if (this.trajectoryGroup) {
      this.trajectoryGroup.dispose(false, true);
    }
    this.trajectoryGroup = new BABYLON.TransformNode("arTrajectoryGroup", this.scene);

    // 4. Rebuild obstacles
    this.currentObstacles.forEach(obs => {
      Course3DBuilder.buildObstacle(this.scene, obs, field, this.obstaclesGroup, null, {
        showNumbers: this.showObstacleNumbers
      });
    });

    // 5. Rebuild trajectory
    if (pathModel && this.showTrajectory) {
      Course3DBuilder.buildTrajectory(this.scene, field, this.currentObstacles, pathModel, this.trajectoryGroup, {
        buildStandaloneBadges: false
      });
    }

    this.resize();
  }

  updatePose(detectedMarkers, idMapping) {
    if (!this.isArActive || !this.camera) return;

    // Match WebGL canvas resolution to input video canvas
    const sourceCanvas = this.videoCanvas || document.getElementById('outputCanvas');
    if (sourceCanvas && sourceCanvas.width > 0 && sourceCanvas.height > 0) {
      if (this.canvas.width !== sourceCanvas.width || this.canvas.height !== sourceCanvas.height) {
        this.canvas.width = sourceCanvas.width;
        this.canvas.height = sourceCanvas.height;
        this.resize();
      }
    }

    const canvasW = this.canvas.width || 640;
    const canvasH = this.canvas.height || 480;

    const pose = this.poseEstimator.estimatePose(detectedMarkers, idMapping, canvasW, canvasH);

    if (pose && pose.isTracking) {
      this.camera.position.copyFrom(pose.position);
      this.camera.rotationQuaternion.copyFrom(pose.rotation);
      this.camera.fov = this.poseEstimator.fovY || (60 * Math.PI) / 180;
    }

    this._updateStatusUI(pose);
  }

  _updateStatusUI(pose) {
    const isTracking = !!(pose && pose.isTracking);
    const isHolding = !!(pose && pose.isHolding);
    const count = pose ? pose.trackedCount : 0;

    // State diff check: only trigger updates when state actually changes
    const stateChanged = (
      this._lastTrackingState.isTracking !== isTracking ||
      this._lastTrackingState.isHolding !== isHolding ||
      this._lastTrackingState.count !== count
    );

    if (!stateChanged) return;

    this._lastTrackingState = { isTracking, isHolding, count };

    if (this.statusCallback) {
      this.statusCallback({ isTracking, isHolding, count });
      return;
    }

    const arBadge = document.getElementById('ar-tracking-badge');
    if (!arBadge) return;

    if (isTracking) {
      arBadge.className = 'aruco-status-badge ready';
      arBadge.innerHTML = isHolding
        ? `<span class="aruco-status-dot"></span> AR Locked (Holding)`
        : `<span class="aruco-status-dot"></span> AR Locked (${count} Marker${count > 1 ? 's' : ''})`;
    } else {
      arBadge.className = 'aruco-status-badge loading';
      arBadge.innerHTML = `<span class="aruco-status-dot"></span> Searching Markers...`;
    }
  }

  destroy() {
    this.isArActive = false;
    if (this.engine) {
      this.engine.stopRenderLoop();
    }
    if (this.scene) {
      this.scene.dispose();
      this.scene = null;
    }
    if (this.engine) {
      this.engine.dispose();
      this.engine = null;
    }
    if (this.poseEstimator) {
      this.poseEstimator.destroy();
    }
    this.isInitialized = false;
  }
}

// Global instance
window.ARPoseEstimator = ARPoseEstimator;
window.ARCourseEngine = ARCourseEngine;
