/** Texture formats the renderer uses as render targets. */
export type TargetFormat = 'rgba8' | 'rgba16f' | 'r16f' | 'rg32f';

/** One texture that a pass can render into. */
export interface Target {
  readonly width: number;
  readonly height: number;
  readonly texture: WebGLTexture;
  readonly framebuffer: WebGLFramebuffer;
}

/** Several textures written together by one pass (multiple render targets). */
export interface MultiTarget {
  readonly width: number;
  readonly height: number;
  readonly textures: readonly WebGLTexture[];
  readonly framebuffer: WebGLFramebuffer;
}

function formatInfo(gl: WebGL2RenderingContext, format: TargetFormat) {
  switch (format) {
    case 'rgba8':
      return { internalFormat: gl.RGBA8, filter: gl.LINEAR };
    case 'rgba16f':
      return { internalFormat: gl.RGBA16F, filter: gl.LINEAR };
    case 'r16f':
      return { internalFormat: gl.R16F, filter: gl.LINEAR };
    case 'rg32f':
      // 32-bit float textures can't be linearly filtered everywhere; read them with texelFetch.
      return { internalFormat: gl.RG32F, filter: gl.NEAREST };
  }
}

function setSampling(gl: WebGL2RenderingContext, filter: number): void {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

function createStorage(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  format: TargetFormat,
): WebGLTexture {
  const { internalFormat, filter } = formatInfo(gl, format);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, internalFormat, width, height);
  setSampling(gl, filter);
  return texture;
}

function checkComplete(gl: WebGL2RenderingContext, formats: readonly TargetFormat[]): void {
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(
      `This GPU can't render to ${formats.join(' + ')} textures (framebuffer status 0x${status.toString(16)}).`,
    );
  }
}

export function createTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  format: TargetFormat,
): Target {
  const texture = createStorage(gl, width, height, format);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  checkComplete(gl, [format]);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { width, height, texture, framebuffer };
}

export function createMultiTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  formats: readonly TargetFormat[],
): MultiTarget {
  const textures = formats.map((format) => createStorage(gl, width, height, format));
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  const attachments = textures.map((texture, i) => {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, texture, 0);
    return gl.COLOR_ATTACHMENT0 + i;
  });
  gl.drawBuffers(attachments);
  checkComplete(gl, formats);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { width, height, textures, framebuffer };
}

export function deleteTarget(gl: WebGL2RenderingContext, target: Target | MultiTarget): void {
  gl.deleteFramebuffer(target.framebuffer);
  for (const texture of 'texture' in target ? [target.texture] : target.textures) {
    gl.deleteTexture(texture);
  }
}

/** Uploads a canvas as an RGBA8 texture, creating the texture on first use. */
export function uploadCanvas(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture | null,
  canvas: TexImageSource,
): WebGLTexture {
  const result = texture ?? gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, result);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  setSampling(gl, gl.LINEAR);
  return result;
}

/** Uploads rows of RGBA float data (read with texelFetch), creating the texture on first use. */
export function uploadFloatData(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture | null,
  data: Float32Array,
  width: number,
  height: number,
): WebGLTexture {
  const result = texture ?? gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, result);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, data);
  setSampling(gl, gl.NEAREST);
  return result;
}
