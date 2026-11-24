function isAbortError(error) {
  return error?.name === 'AbortError';
}

export async function shareToInstagramStory(result, {
  navigatorObject = globalThis.navigator,
  windowObject = globalThis.window,
  URLClass = globalThis.URL,
  FileClass = globalThis.File,
  setTimeoutFn = globalThis.setTimeout,
  onError = () => {},
} = {}) {
  const filename = `BlobTrack_${new Date().toISOString().replace(/[:.]/g, '-')}.${result.extension || 'webm'}`;
  const mimeType = result.mimeType.split(';', 1)[0];
  let file = null;
  if (typeof FileClass === 'function') {
    try {
      file = new FileClass([result.blob], filename, { type: result.mimeType });
    } catch (error) {
      onError('preparação do arquivo', error);
    }
  }

  // 1) Tentar abrir o Instagram Stories diretamente (app instalado no celular)
  if (typeof windowObject?.location !== 'undefined') {
    try {
      const instagramUrl = `instagram-stories://share?source_application=BlobTrack%20Celular`;
      windowObject.location.href = instagramUrl;
      await new Promise(resolve => setTimeoutFn(resolve, 1500));
      return 'instagram';
    } catch (error) {
      onError('instagram stories direto', error);
    }
  }

  // 2) Fallback: share sheet nativa (Android/iOS) onde o usuário escolhe o Instagram
  if (file && typeof navigatorObject?.canShare === 'function' && typeof navigatorObject.share === 'function') {
    try {
      if (navigatorObject.canShare({ files: [file] })) {
        await navigatorObject.share({
          files: [file],
          title: 'BlobTrack Celular',
          text: 'Confira meu vídeo do BlobTrack!',
        });
        return 'shared';
      }
    } catch (error) {
      if (isAbortError(error)) return 'cancelled';
      onError('compartilhamento nativo', error);
    }
  }

  onError('instagram stories', new Error('Não foi possível compartilhar no Instagram.'));
  throw new Error('Não foi possível compartilhar no Instagram.');
}

export async function exportRecording(result, {
  filename,
  navigatorObject = globalThis.navigator,
  windowObject = globalThis.window,
  documentObject = globalThis.document,
  URLClass = globalThis.URL,
  FileClass = globalThis.File,
  setTimeoutFn = globalThis.setTimeout,
  onError = () => {},
} = {}) {
  const mimeType = result.mimeType.split(';', 1)[0];
  const ext = result.extension || 'webm';
  let file = null;
  if (typeof FileClass === 'function') {
    try {
      file = new FileClass([result.blob], filename, { type: result.mimeType });
    } catch (error) {
      onError('preparação do arquivo', error);
    }
  }

  // 1) Salvar em local escolhido pelo usuário (inclui cartão SD no Android via seletor do sistema)
  if (typeof windowObject?.showSaveFilePicker === 'function' && file) {
    try {
      const handle = await windowObject.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: 'Vídeo BlobTrack',
          accept: {
            'video/mp4': ['.mp4'],
            'video/webm': ['.webm'],
            'video/*': [`.${ext}`],
          },
        }],
      });
      const writable = await handle.createWritable();
      try {
        await writable.write(result.blob);
        await writable.close();
      } catch (error) {
        if (typeof writable.abort === 'function') {
          try { await writable.abort(); }
          catch (cleanupError) { onError('limpeza do arquivo incompleto', cleanupError); }
        }
        throw error;
      }
      return 'saved';
    } catch (error) {
      if (isAbortError(error)) return 'cancelled';
      onError('seletor de arquivo', error);
    }
  }

  // 2) Compartilhar arquivo (Android share sheet)
  if (file && typeof navigatorObject?.canShare === 'function' && typeof navigatorObject.share === 'function') {
    try {
      if (navigatorObject.canShare({ files: [file] })) {
        await navigatorObject.share({ files: [file], title: 'BlobTrack Celular' });
        return 'shared';
      }
    } catch (error) {
      if (isAbortError(error)) return 'cancelled';
      onError('compartilhamento', error);
    }
  }

  // 3) Download direto
  let url = result.url;
  const createdUrl = !url;
  if (createdUrl) url = URLClass.createObjectURL(result.blob);
  try {
    const link = documentObject.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  } catch (error) {
    if (createdUrl) URLClass.revokeObjectURL(url);
    throw error;
  }
  if (!result.url) setTimeoutFn(() => URLClass.revokeObjectURL(url), 4000);
  return 'downloaded';
}
