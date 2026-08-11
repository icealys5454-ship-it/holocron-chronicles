import type { Framebuffer } from "./core";

function shader(gl: WebGLRenderingContext, type: number, source: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
  return s;
}

export class WebGLPresenter {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private texture: WebGLTexture;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = (canvas.getContext("webgl2") ??
      canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) throw new Error("WebGL unavailable.");
    this.gl = gl;
    const is2 =
      typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
    const vs = is2
      ? "#version 300 es\nin vec2 a;out vec2 uv;void main(){uv=(a+1.0)*.5;gl_Position=vec4(a,0,1);}"
      : "attribute vec2 a;varying vec2 uv;void main(){uv=(a+1.0)*.5;gl_Position=vec4(a,0,1);}";
    const fs = is2
      ? "#version 300 es\nprecision mediump float;uniform sampler2D t;in vec2 uv;out vec4 o;void main(){o=texture(t,vec2(uv.x,1.0-uv.y));}"
      : "precision mediump float;uniform sampler2D t;varying vec2 uv;void main(){gl_FragColor=texture2D(t,vec2(uv.x,1.0-uv.y));}";
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, shader(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(this.program, shader(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(this.program) ?? "link error");
    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.program, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }

  present(frame: Framebuffer) {
    const gl = this.gl;
    if (this.canvas.width !== frame.width || this.canvas.height !== frame.height) {
      this.canvas.width = frame.width;
      this.canvas.height = frame.height;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      frame.width,
      frame.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      frame.pixels,
    );
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
