/** Clear the previous camera composition before a stream is stopped or replaced. */
export function clearVideoComposition({ gl, fallbackContext, overlayContext, width, height }) {
  if (gl) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  } else {
    fallbackContext?.clearRect(0, 0, width, height);
  }
  overlayContext?.clearRect(0, 0, width, height);
}
