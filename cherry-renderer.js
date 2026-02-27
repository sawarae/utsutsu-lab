/**
 * cherry-renderer.js
 * WebGL-based cherry blossom (桜) particle renderer.
 *
 * Renders 300 petal sprites as gl.POINTS.
 * Each petal draws a 5-petal sakura flower shape via SDF in the fragment shader.
 * Petals float gently inside the cup circle and scatter when the cup moves.
 */

// ── GLSL shaders ─────────────────────────────────────────────────────────────

const VERT_SRC = `
attribute float a_seed;
attribute vec2  a_unit_pos;       /* initial position inside unit disk [-1,1] */
attribute float a_scatter_angle;  /* direction when scattering */

uniform float u_time;
uniform vec2  u_center;   /* cup center in canvas pixels */
uniform float u_radius;   /* cup radius in pixels */
uniform float u_scatter;  /* 0 = contained, 1 = fully scattered */
uniform float u_alpha;    /* master opacity */
uniform vec2  u_canvas;   /* canvas size in pixels */

varying float v_rot;
varying float v_alpha;

/* cheap pseudo-random from seed */
float rand(float n) {
  return fract(sin(n * 127.1 + 311.7) * 43758.5453);
}

void main() {
  float id     = a_seed;
  float speed  = 0.06 + rand(id)         * 0.11;   /* halved for gentler motion */
  float psize  = 9.0  + rand(id + 0.11)  * 13.0;
  float phase  = rand(id + 0.22)          * 6.2832;
  float dfreq  = 0.18 + rand(id + 0.33)  * 0.27;  /* halved drift frequency */

  /* gentle floating within unit disk */
  vec2 lp = a_unit_pos;
  lp.x += sin(u_time * dfreq         + phase)       * 0.18;
  lp.y += cos(u_time * dfreq * 0.73  + phase * 1.3) * 0.11;
  lp.y -= sin(u_time * speed          + phase)       * 0.10; /* slow rise */

  /* world position (canvas pixels, Y down) */
  vec2 wp = u_center + lp * u_radius;

  /* scatter: petals fly outward and fall */
  float s = u_scatter * u_scatter;
  wp += vec2(cos(a_scatter_angle), sin(a_scatter_angle)) * u_radius * 3.0 * u_scatter;
  wp.y += 180.0 * s;

  /* convert to NDC (flip Y because canvas Y is down, WebGL Y is up) */
  vec2 ndc = (wp / u_canvas) * 2.0 - 1.0;
  ndc.y = -ndc.y;

  gl_Position  = vec4(ndc, 0.0, 1.0);
  gl_PointSize = psize * (1.0 + u_scatter * 0.4);

  /* petal rotation angle, varying over time */
  v_rot   = u_time * speed * 0.9 + phase;

  /* alpha: shimmer + fade when scattered */
  float shimmer = 0.55 + 0.45 * sin(u_time * speed * 2.8 + phase);
  v_alpha = u_alpha * shimmer * (1.0 - u_scatter * 0.85);
}
`;

const FRAG_SRC = `
precision mediump float;

varying float v_rot;
varying float v_alpha;

/* rotate 2D point */
vec2 rot2(vec2 p, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

/* SDF of one elongated petal centered at 'pc', oriented at 'ang' */
float petalSDF(vec2 uv, float ang, vec2 pc) {
  vec2 p = rot2(uv - pc, ang);
  return length(p * vec2(1.55, 1.0)) - 0.30;
}

/* SDF of 5-petal cherry blossom */
float sakuraSDF(vec2 uv) {
  float d   = 1.0e4;
  float pr  = 0.37;          /* distance of petal center from origin */
  float dA  = 1.25664;       /* 2*PI/5 */
  /* unrolled loop for GLSL ES 1.0 compatibility */
  d = min(d, petalSDF(uv, 0.0 * dA + 1.5708, vec2(cos(0.0 * dA), sin(0.0 * dA)) * pr));
  d = min(d, petalSDF(uv, 1.0 * dA + 1.5708, vec2(cos(1.0 * dA), sin(1.0 * dA)) * pr));
  d = min(d, petalSDF(uv, 2.0 * dA + 1.5708, vec2(cos(2.0 * dA), sin(2.0 * dA)) * pr));
  d = min(d, petalSDF(uv, 3.0 * dA + 1.5708, vec2(cos(3.0 * dA), sin(3.0 * dA)) * pr));
  d = min(d, petalSDF(uv, 4.0 * dA + 1.5708, vec2(cos(4.0 * dA), sin(4.0 * dA)) * pr));
  /* small center circle */
  d = min(d, length(uv) - 0.10);
  return d;
}

void main() {
  /* point coord [0,1] → [-1,1] */
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  uv = rot2(uv, v_rot);

  float d = sakuraSDF(uv);
  if (d > 0.05) discard;

  /* sakura color gradient: deeper pink at centre */
  float ct = 1.0 - smoothstep(0.0, 0.35, length(uv));
  vec3 col  = mix(vec3(1.0, 0.76, 0.84), vec3(0.97, 0.45, 0.62), ct);

  /* soft anti-aliased edge */
  float alpha = v_alpha * smoothstep(0.05, -0.04, d);
  gl_FragColor = vec4(col, alpha);
}
`;

// ── CherryRenderer class ──────────────────────────────────────────────────────

class CherryRenderer {
  /**
   * @param {HTMLCanvasElement} canvas  The WebGL overlay canvas.
   */
  constructor(canvas) {
    this.canvas = canvas;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
    });
    if (!gl) throw new Error("WebGL is not supported in this browser.");
    this.gl = gl;

    this.COUNT = 300; // number of petal particles

    this._initGL();
  }

  /** Render one frame.
   * @param {number} cx       Cup center X (canvas pixels)
   * @param {number} cy       Cup center Y (canvas pixels)
   * @param {number} radius   Cup radius (canvas pixels)
   * @param {number} scatter  Scatter progress 0–1
   * @param {number} alpha    Master opacity 0–1
   * @param {number} time     Elapsed time in seconds
   */
  render(cx, cy, radius, scatter, alpha, time) {
    const gl = this.gl;
    const W = this.canvas.width;
    const H = this.canvas.height;

    gl.viewport(0, 0, W, H);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this._prog);

    gl.uniform1f(this._u.time, time);
    gl.uniform2f(this._u.center, cx, cy);
    gl.uniform1f(this._u.radius, radius);
    gl.uniform1f(this._u.scatter, scatter);
    gl.uniform1f(this._u.alpha, alpha);
    gl.uniform2f(this._u.canvas, W, H);

    this._bindAttr(this._a.seed, this._bufSeed, 1);
    this._bindAttr(this._a.unitPos, this._bufUnitPos, 2);
    this._bindAttr(this._a.scAng, this._bufScAng, 1);

    gl.drawArrays(gl.POINTS, 0, this.COUNT);
  }

  /** Clear the canvas. */
  clear() {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  // ── private ────────────────────────────────────────────────────────────────

  _initGL() {
    const gl = this.gl;

    this._prog = this._compileProgram(VERT_SRC, FRAG_SRC);

    // Attribute locations
    this._a = {
      seed: gl.getAttribLocation(this._prog, "a_seed"),
      unitPos: gl.getAttribLocation(this._prog, "a_unit_pos"),
      scAng: gl.getAttribLocation(this._prog, "a_scatter_angle"),
    };

    // Uniform locations
    this._u = {
      time: gl.getUniformLocation(this._prog, "u_time"),
      center: gl.getUniformLocation(this._prog, "u_center"),
      radius: gl.getUniformLocation(this._prog, "u_radius"),
      scatter: gl.getUniformLocation(this._prog, "u_scatter"),
      alpha: gl.getUniformLocation(this._prog, "u_alpha"),
      canvas: gl.getUniformLocation(this._prog, "u_canvas"),
    };

    // Per-particle static data
    const seeds = new Float32Array(this.COUNT);
    const unitPos = new Float32Array(this.COUNT * 2);
    const scAng = new Float32Array(this.COUNT);

    for (let i = 0; i < this.COUNT; i++) {
      seeds[i] = i / this.COUNT;

      // Uniform distribution within the unit disk
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()); // sqrt for uniform area distribution
      unitPos[i * 2] = Math.cos(angle) * radius;
      unitPos[i * 2 + 1] = Math.sin(angle) * radius;

      scAng[i] = Math.random() * Math.PI * 2;
    }

    this._bufSeed = this._makeBuffer(seeds);
    this._bufUnitPos = this._makeBuffer(unitPos);
    this._bufScAng = this._makeBuffer(scAng);

    // Blending for semi-transparent petals
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
  }

  _makeBuffer(data) {
    const gl = this.gl;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buf;
  }

  _compileProgram(vSrc, fSrc) {
    const gl = this.gl;

    const compileShader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        gl.deleteShader(s);
        throw new Error("Shader compile error:\n" + log);
      }
      return s;
    };

    const prog = gl.createProgram();
    gl.attachShader(prog, compileShader(gl.VERTEX_SHADER, vSrc));
    gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, fSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("Program link error:\n" + gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  _bindAttr(loc, buf, size) {
    if (loc === -1) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }
}
