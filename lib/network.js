
export class ForceDirectedGraph {
  constructor(canvas, adjacencyMatrix, options = {}) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new TypeError("A valid canvas element is required.");
    }

    if (!Array.isArray(adjacencyMatrix)) {
      throw new TypeError("Adjacency matrix must be a 2D array.");
    }

    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.matrix = adjacencyMatrix;
    this.n = adjacencyMatrix.length;

    if (adjacencyMatrix.some(
      row => !Array.isArray(row) || row.length !== this.n
    )) {
      throw new TypeError("Adjacency matrix must be square.");
    }

    this.options = {
      nodeRadius: 18,
      minNodeRadius: 5,
      maxNodeRadius: 24,

      nodeColor: "#5f9fa1",
      nodeStroke: "#497a7c",
      nodeTextColor: "#ffffff",
      edgeColor: "#294d4d",
      background: "#d8dddf00",

      repulsion: 1800,
      springLength: 75,
      springStrength: 0.015,
      gravity: 0.00,
      damping: 0.64,
      maxSpeed: 12,
      settleThreshold: 0.12,
      settleFrames: 15,
      initialIterations: 500,

      edgeWidth: 2.5,
      arrowSize: 10,
      arrowAngle: Math.PI / 6,
      hitPadding: 8,

      minZoom: 0.04,
      maxZoom: 8,
      wheelZoomSpeed: 0.0015,
      fitPadding: 45,

      ...options
    };

    this.width = 1;
    this.height = 1;
    this.dpr = 1;

    this.camera = { x: 0, y: 0, zoom: 1 };

    this.nodes = [];
    this.edges = [];
    this.springs = [];

    this.visibleNodes = new Set(
      Array.from({ length: this.n }, (_, i) => i)
    );

    this.draggedNode = null;
    this.pointerMode = null;
    this.lastPointer = null;
    this.pointers = new Map();
    this.pinchState = null;
    this.dragOffset = { x: 0, y: 0 };

    this.animationFrame = null;
    this.stableFrames = 0;
    this.destroyed = false;
    this._initialFitPending = true;

    this._createGraph();

    this._resizeObserver = null;
    this._onWindowResize = null;

    this._resize();
    this._initialLayout();
    this.fitToView();
    this._installEvents();

    this._render();
    this._startSimulation(this.options.initialIterations);
  }

  _createGraph() {
    this.nodes = Array.from({ length: this.n }, (_, id) => ({
      id,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      fx: 0,
      fy: 0
    }));

    this.edges = [];
    const pairMap = new Map();

    for (let i = 0; i < this.n; i++) {
      for (let j = 0; j < this.n; j++) {
        // Ignore self-loops and zero entries.
        if (i === j || this.matrix[i][j] === 0) {
          continue;
        }

        this.edges.push({ source: i, target: j });

        // One physical spring for each unordered pair.
        const a = Math.min(i, j);
        const b = Math.max(i, j);
        const key = `${a},${b}`;

        if (!pairMap.has(key)) {
          pairMap.set(key, { a, b });
        }
      }
    }

    this.springs = Array.from(pairMap.values());
  }

  _initialLayout() {
    if (this.n === 0) return;

    const cx = 0;
    const cy = 0;

    // Start with a compact, centered circular arrangement.
    // fitToView() subsequently scales it to the canvas.
    const radius = Math.max(
      this.options.springLength,
      this.options.springLength *
      Math.sqrt(this.n) / (2 * Math.PI)
    );

    for (let i = 0; i < this.n; i++) {
      const angle = (2 * Math.PI * i) / this.n;

      this.nodes[i].x =
        cx + radius * Math.cos(angle);

      this.nodes[i].y =
        cy + radius * Math.sin(angle);
    }
  }

  _resize() {
    if (this.destroyed) return;

    const rect = this.canvas.getBoundingClientRect();

    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.dpr = Math.max(1, window.devicePixelRatio || 1);

    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);

    this._render();
  }


  _simulateStep() {
    const n = this.n;

    if (n <= 1) return 0;

    const {
      repulsion,
      springLength,
      springStrength,
      gravity,
      damping,
      maxSpeed
    } = this.options;

    for (const node of this.nodes) {
      node.fx = 0;
      node.fy = 0;
    }

    // Pairwise repulsion: O(n^2).
    for (let i = 0; i < n; i++) {
      const a = this.nodes[i];

      for (let j = i + 1; j < n; j++) {
        const b = this.nodes[j];

        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;

        if (d2 < 0.01) {
          dx = 0.1;
          dy = 0.1;
          d2 = dx * dx + dy * dy;
        }

        const distance = Math.sqrt(d2);
        const force = Math.min(
          repulsion / Math.max(d2, 100),
          12
        );

        const fx = force * dx / distance;
        const fy = force * dy / distance;

        a.fx += fx;
        a.fy += fy;
        b.fx -= fx;
        b.fy -= fy;
      }
    }

    // One spring per unordered pair, even if reciprocal.
    for (const spring of this.springs) {
      const a = this.nodes[spring.a];
      const b = this.nodes[spring.b];

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 0.001;

      const force =
        springStrength * (distance - springLength);

      const fx = force * dx / distance;
      const fy = force * dy / distance;

      a.fx += fx;
      a.fy += fy;
      b.fx -= fx;
      b.fy -= fy;
    }

    // Gravity towards the graph's centroid.
    let meanX = 0;
    let meanY = 0;

    for (const node of this.nodes) {
      meanX += node.x;
      meanY += node.y;
    }

    meanX /= n;
    meanY /= n;

    let maxSpeedFound = 0;

    for (const node of this.nodes) {
      if (node === this.draggedNode) {
        node.vx = 0;
        node.vy = 0;
        continue;
      }

      node.fx -= (node.x - meanX) * gravity;
      node.fy -= (node.y - meanY) * gravity;

      node.vx = (node.vx + node.fx) * damping;
      node.vy = (node.vy + node.fy) * damping;

      const speed = Math.hypot(node.vx, node.vy);

      if (speed > maxSpeed) {
        node.vx *= maxSpeed / speed;
        node.vy *= maxSpeed / speed;
      }

      node.x += node.vx;
      node.y += node.vy;

      maxSpeedFound = Math.max(
        maxSpeedFound,
        Math.min(speed, maxSpeed)
      );
    }

    return maxSpeedFound;
  }

  _startSimulation(iterations = Infinity) {
    if (this.destroyed || this.n <= 1) {
      this._initialFitPending = false;
      return;
    }

    this.stableFrames = 0;

    if (this.animationFrame !== null) return;

    let remaining = iterations;

    const tick = () => {
      this.animationFrame = null;

      if (this.destroyed) return;

      let maxSpeed = 0;
      const steps = Math.min(3, remaining);

      for (let i = 0; i < steps; i++) {
        maxSpeed = Math.max(
          maxSpeed,
          this._simulateStep()
        );

        if (remaining !== Infinity) {
          remaining--;
        }

        if (remaining <= 0) break;
      }

      if (maxSpeed < this.options.settleThreshold) {
        this.stableFrames++;
      } else {
        this.stableFrames = 0;
      }

      const finished =
        remaining <= 0 ||
        this.stableFrames >= this.options.settleFrames;

      if (
        finished &&
        this._initialFitPending
      ) {
        // Fit once after the initial layout has settled.
        // Do not refit automatically after user interactions.
        this._initialFitPending = false;
        this.fitToView();
      }

      this._render();

      if (!finished || this.draggedNode) {
        this.animationFrame = requestAnimationFrame(tick);
      } else {
        this.animationFrame = null;
      }
    };

    this.animationFrame = requestAnimationFrame(tick);
  }

  _stopSimulation() {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  _render() {
    if (this.destroyed) return;

    const ctx = this.ctx;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.fillStyle = this.options.background;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();

    ctx.translate(this.camera.x, this.camera.y);
    ctx.scale(this.camera.zoom, this.camera.zoom);

    this._drawEdges(ctx);
    this._drawNodes(ctx);

    ctx.restore();
  }


  _drawEdges(ctx) {
    const radius = this.options.nodeRadius;
    const arrowSize = this.options.arrowSize;
    const arrowAngle = this.options.arrowAngle;

    ctx.strokeStyle = this.options.edgeColor;
    ctx.fillStyle = this.options.edgeColor;
    ctx.lineWidth = this.options.edgeWidth / this.camera.zoom;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Draw each unordered pair only once. Reciprocal edges
    // share the same straight shaft and have arrowheads at
    // opposite ends, avoiding parallel offset lines.
    for (const pair of this.springs) {
      const { a: i, b: j } = pair;

      if (
        !this.visibleNodes.has(i) ||
        !this.visibleNodes.has(j)
      ) {
        continue;
      }

      const a = this.nodes[i];
      const b = this.nodes[j];

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);

      if (distance < 0.001) continue;

      const ux = dx / distance;
      const uy = dy / distance;

      const forward = this.matrix[i][j] !== 0;
      const backward = this.matrix[j][i] !== 0;

      // Trim the line to the boundaries of the two nodes.
      const startX = a.x + ux * radius;
      const startY = a.y + uy * radius;
      const endX = b.x - ux * radius;
      const endY = b.y - uy * radius;

      // Leave a little room for arrowheads at the target.
      const arrowLength = arrowSize;

      // Draw a single shared shaft.
      ctx.beginPath();

      if (forward && backward) {
        // Reciprocal pair: line remains continuous
        // between the two node boundaries.
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
      } else if (forward) {
        ctx.moveTo(startX, startY);
        ctx.lineTo(
          endX - ux * arrowLength,
          endY - uy * arrowLength
        );
      } else if (backward) {
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          startX + ux * arrowLength,
          startY + uy * arrowLength
        );
      }

      ctx.stroke();

      // Arrowhead tip is placed on the node boundary.
      const drawArrowhead = (tipX, tipY, angle) => {
        const leftX =
          tipX - arrowSize * Math.cos(angle - arrowAngle);
        const leftY =
          tipY - arrowSize * Math.sin(angle - arrowAngle);

        const rightX =
          tipX - arrowSize * Math.cos(angle + arrowAngle);
        const rightY =
          tipY - arrowSize * Math.sin(angle + arrowAngle);

        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(leftX, leftY);
        ctx.lineTo(rightX, rightY);
        ctx.closePath();
        ctx.fill();
      };

      if (forward) {
        drawArrowhead(
          endX,
          endY,
          Math.atan2(uy, ux)
        );
      }

      if (backward) {
        drawArrowhead(
          startX,
          startY,
          Math.atan2(-uy, -ux)
        );
      }
    }
  }

  _drawNodes(ctx) {
    const radius = Math.max(
      this.options.minNodeRadius,
      Math.min(
        this.options.maxNodeRadius,
        this.options.nodeRadius
      )
    );

    // Scale text with zoom, with reasonable readability limits.
    const fontSize = Math.max(
      7,
      Math.min(15, 12 / this.camera.zoom)
    );

    for (const node of this.nodes) {
      if (!this.visibleNodes.has(node.id)) continue;

      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);

      ctx.fillStyle = this.options.nodeColor;
      ctx.fill();

      ctx.lineWidth = 1.5 / this.camera.zoom;
      ctx.strokeStyle = this.options.nodeStroke;
      ctx.stroke();

      ctx.fillStyle = this.options.nodeTextColor;
      ctx.font = `600 ${fontSize}px Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.fillText(String(node.id), node.x, node.y);
    }
  }

  fitToView() {
    const visible = this.nodes.filter(
      node => this.visibleNodes.has(node.id)
    );

    if (visible.length === 0) {
      this.camera.x = this.width / 2;
      this.camera.y = this.height / 2;
      this._render();
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of visible) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x);
      maxY = Math.max(maxY, node.y);
    }

    const padding = this.options.fitPadding;
    const availableWidth = Math.max(1, this.width - 2 * padding);
    const availableHeight = Math.max(1, this.height - 2 * padding);

    const graphWidth = Math.max(
      2 * this.options.nodeRadius,
      maxX - minX + 2 * this.options.nodeRadius
    );

    const graphHeight = Math.max(
      2 * this.options.nodeRadius,
      maxY - minY + 2 * this.options.nodeRadius
    );

    // Fit the entire graph, not just its center.
    this.camera.zoom = Math.max(
      this.options.minZoom,
      Math.min(
        this.options.maxZoom,
        availableWidth / graphWidth,
        availableHeight / graphHeight
      )
    );

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    this.camera.x = this.width / 2 - centerX * this.camera.zoom;
    this.camera.y = this.height / 2 - centerY * this.camera.zoom;

    this._render();
  }

  _screenToWorld(x, y) {
    return {
      x: (x - this.camera.x) / this.camera.zoom,
      y: (y - this.camera.y) / this.camera.zoom
    };
  }

  _eventPosition(event) {
    const rect = this.canvas.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  _zoomAt(x, y, factor) {
    const oldZoom = this.camera.zoom;
    const newZoom = Math.max(
      this.options.minZoom,
      Math.min(this.options.maxZoom, oldZoom * factor)
    );

    if (newZoom === oldZoom) return;

    const worldX = (x - this.camera.x) / oldZoom;
    const worldY = (y - this.camera.y) / oldZoom;

    this.camera.zoom = newZoom;
    this.camera.x = x - worldX * newZoom;
    this.camera.y = y - worldY * newZoom;

    this._render();
  }

  _findNodeAt(screenX, screenY) {
    const p = this._screenToWorld(screenX, screenY);
    const hitRadius =
      this.options.nodeRadius +
      this.options.hitPadding / this.camera.zoom;

    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];

      if (!this.visibleNodes.has(node.id)) continue;

      if (
        Math.hypot(p.x - node.x, p.y - node.y) <= hitRadius
      ) {
        return node;
      }
    }

    return null;
  }


  _installEvents() {
    this.canvas.style.touchAction = "none";

    this._onPointerDown = event => {
      event.preventDefault();

      const p = this._eventPosition(event);

      this.canvas.setPointerCapture?.(event.pointerId);
      this.pointers.set(event.pointerId, p);

      if (this.pointers.size === 2) {
        this.draggedNode = null;
        this.pointerMode = "pinch";
        this._startPinch();
        return;
      }

      const node = this._findNodeAt(p.x, p.y);

      if (node) {
        this.pointerMode = "node";
        this.draggedNode = node;

        const world = this._screenToWorld(p.x, p.y);

        this.dragOffset = {
          x: node.x - world.x,
          y: node.y - world.y
        };

        node.vx = 0;
        node.vy = 0;
      } else {
        this.pointerMode = "pan";
        this.draggedNode = null;
      }

      this.lastPointer = p;
    };

    this._onPointerMove = event => {
      const p = this._eventPosition(event);

      if (this.pointers.has(event.pointerId)) {
        this.pointers.set(event.pointerId, p);
      }

      if (
        this.pointerMode === "pinch" &&
        this.pointers.size >= 2
      ) {
        this._updatePinch();
        return;
      }

      if (!this.lastPointer) return;

      if (this.pointerMode === "node" && this.draggedNode) {
        const world = this._screenToWorld(p.x, p.y);

        this.draggedNode.x = world.x + this.dragOffset.x;
        this.draggedNode.y = world.y + this.dragOffset.y;
        this.draggedNode.vx = 0;
        this.draggedNode.vy = 0;

        this._startSimulation();
        this._render();
      } else if (this.pointerMode === "pan") {
        this.camera.x += p.x - this.lastPointer.x;
        this.camera.y += p.y - this.lastPointer.y;
        this._render();
      }

      this.lastPointer = p;
    };

    this._onPointerUp = event => {
      this.pointers.delete(event.pointerId);

      if (this.draggedNode) {
        this.draggedNode.vx = 0;
        this.draggedNode.vy = 0;
      }

      this.draggedNode = null;
      this.lastPointer = null;
      this.pinchState = null;
      this.pointerMode = null;

      if (this.pointers.size === 1) {
        const [id, p] = this.pointers.entries().next().value;
        this.pointerMode = "pan";
        this.lastPointer = p;
      }
    };

    this._onWheel = event => {
      event.preventDefault();

      const p = this._eventPosition(event);
      const factor = Math.exp(
        -event.deltaY * this.options.wheelZoomSpeed
      );

      this._zoomAt(p.x, p.y, factor);
    };

    this._onDoubleClick = event => {
      const p = this._eventPosition(event);

      if (this._findNodeAt(p.x, p.y)) {
        this.fitToView();
      } else {
        this._zoomAt(p.x, p.y, 1.5);
      }
    };

    this.canvas.addEventListener("pointerdown", this._onPointerDown);
    this.canvas.addEventListener("pointermove", this._onPointerMove);
    this.canvas.addEventListener("pointerup", this._onPointerUp);
    this.canvas.addEventListener("pointercancel", this._onPointerUp);
    this.canvas.addEventListener("wheel", this._onWheel, {
      passive: false
    });
    this.canvas.addEventListener("dblclick", this._onDoubleClick);

    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => {
        this._resize();

        // Keep the current camera on resize; do not unexpectedly
        // reset the user's zoom or pan.
      });

      this._resizeObserver.observe(this.canvas);
    } else {
      this._onWindowResize = () => this._resize();
      window.addEventListener("resize", this._onWindowResize);
    }
  }

  _startPinch() {
    const points = Array.from(this.pointers.values());

    if (points.length < 2) return;

    const a = points[0];
    const b = points[1];

    this.pinchState = {
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      centerX: (a.x + b.x) / 2,
      centerY: (a.y + b.y) / 2
    };
  }

  _updatePinch() {
    const points = Array.from(this.pointers.values());

    if (points.length < 2 || !this.pinchState) return;

    const a = points[0];
    const b = points[1];

    const distance = Math.max(
      1,
      Math.hypot(a.x - b.x, a.y - b.y)
    );

    const centerX = (a.x + b.x) / 2;
    const centerY = (a.y + b.y) / 2;

    const state = this.pinchState;
    const factor = distance / state.distance;

    this._zoomAt(state.centerX, state.centerY, factor);

    this.camera.x += centerX - state.centerX;
    this.camera.y += centerY - state.centerY;

    this.pinchState = {
      distance,
      centerX,
      centerY
    };

    this._render();
  }


  showOnlyNodes(nodeIndices) {
    if (!Array.isArray(nodeIndices)) {
      throw new TypeError("Expected an array of node indices.");
    }

    const next = new Set();

    for (const index of nodeIndices) {
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= this.n
      ) {
        throw new RangeError(`Invalid node index: ${index}`);
      }

      next.add(index);
    }

    this.visibleNodes = next;
    this._render();
  }

  showAllNodes() {
    this.visibleNodes = new Set(
      Array.from({ length: this.n }, (_, i) => i)
    );

    this._render();
  }

  showNodes(nodeIndices) {
    for (const index of nodeIndices) {
      if (!Number.isInteger(index) || index < 0 || index >= this.n) {
        throw new RangeError(`Invalid node index: ${index}`);
      }

      this.visibleNodes.add(index);
    }

    this._render();
  }

  hideNodes(nodeIndices) {
    for (const index of nodeIndices) {
      this.visibleNodes.delete(index);
    }

    this._render();
  }


  destroy() {
    this.destroyed = true;
    this._stopSimulation();

    this.canvas.removeEventListener("pointerdown", this._onPointerDown);
    this.canvas.removeEventListener("pointermove", this._onPointerMove);
    this.canvas.removeEventListener("pointerup", this._onPointerUp);
    this.canvas.removeEventListener("pointercancel", this._onPointerUp);
    this.canvas.removeEventListener("wheel", this._onWheel);
    this.canvas.removeEventListener("dblclick", this._onDoubleClick);

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }

    if (this._onWindowResize) {
      window.removeEventListener("resize", this._onWindowResize);
    }
  }
}
