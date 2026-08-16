/**
 * BabylonEngine - Interactive 3D Agility Course Visualizer
 * Built with Babylon.js and Course3DBuilder
 */

class BabylonEngine {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.engine = null;
    this.scene = null;
    this.camera = null;
    this.shadowGenerator = null;
    this.obstaclesGroup = null;
    this.trajectoryGroup = null;
    this.groundMesh = null;
    this.groundMat = null;
    this.borderTube = null;
    this.gridMesh = null;
    this.show3DPath = true;
    this.groundOpacity = 0.35; // Default ground opacity for 3D view
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

    // 1. Build Grass Ground Plane & Markings via Course3DBuilder
    if (this.groundMesh) this.groundMesh.dispose();
    if (this.borderTube) this.borderTube.dispose();
    if (this.gridMesh) this.gridMesh.dispose();

    const groundResult = Course3DBuilder.buildGround(this.scene, field, {
      opacity: this.groundOpacity,
      showGrid: true,
      shadowReceiver: true,
      isAr: false
    });
    this.groundMesh = groundResult.groundMesh;
    this.groundMat = groundResult.grassMat;
    this.borderTube = groundResult.borderTube;
    this.gridMesh = groundResult.gridMesh;

    // 2. Clear old obstacles
    if (this.obstaclesGroup) this.obstaclesGroup.dispose();
    this.obstaclesGroup = new BABYLON.TransformNode("obstaclesGroup", this.scene);

    // 3. Clear old trajectory
    if (this.trajectoryGroup) this.trajectoryGroup.dispose();
    this.trajectoryGroup = new BABYLON.TransformNode("trajectoryGroup", this.scene);

    // 4. Build 3D Obstacles with Sequence Badges
    this.currentObstacles.forEach(obs => {
      Course3DBuilder.buildObstacle(this.scene, obs, field, this.obstaclesGroup, this.shadowGenerator, {
        showNumbers: true
      });
    });

    // 5. Build 3D Dog Trajectory Spline
    if (pathModel) {
      Course3DBuilder.buildTrajectory(this.scene, field, this.currentObstacles, pathModel, this.trajectoryGroup, {
        buildStandaloneBadges: false
      });
    }

    this.resize();
  }

  // --- 2D -> 3D COORDINATE CONVERSION ---
  fieldToWorld3D(fieldX, fieldY, fieldHeight = 0) {
    return Course3DBuilder.fieldToWorld3D(fieldX, fieldY, fieldHeight, this.currentField);
  }
}

// Global instance
window.BabylonEngine = BabylonEngine;
