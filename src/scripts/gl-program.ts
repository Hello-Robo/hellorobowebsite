/**
 * The plain-WebGL effects (the CRT screen, the bottom bend) draw one full-screen quad with
 * one program: compiles its two shaders, links them and puts the program in use.
 * Null if it doesn't link (the effect then stays off and the plain page shows).
 */
export function glProgram(gl: WebGLRenderingContext | WebGL2RenderingContext, vertex: string, fragment: string) {
  const program = gl.createProgram()!;
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  return program;
}
